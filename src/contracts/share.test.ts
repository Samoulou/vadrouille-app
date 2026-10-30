// @vitest-environment node
import { describe, expect, it } from "vitest";

import { projectSharedMaps, projectSharedPoints, projectSharedTrip } from "@/adapters/share-projection";
import { deriveEdimbourgCarte } from "@/mocks/edimbourg-carte";
import { edimbourgDebloque } from "@/mocks/edimbourg";

import {
  CreatedShareLinkSchema,
  SharedDaySchema,
  SharedDayViewSchema,
  SharedEventSchema,
  SharedMapPointSchema,
  SharedStopSchema,
  SharedTripSchema,
  SharedTripViewSchema,
  ShareRequestSchema,
  ShareStatusSchema,
} from "./share";
import { ExceptionSchema } from "./trip";
import { SHARED_EXCEPTIONS, SHARE_TOKEN_PATTERN } from "./values";

/** Contrats dérivés de la vue partagée (spécification F10, F10-TL-1 ; décision 0039). */

const trip = projectSharedTrip(edimbourgDebloque);
const maps = deriveEdimbourgCarte(edimbourgDebloque);
const day2 = trip.days[1]!;
const stop = day2.items.find((item) => item.type === "stop")!;
if (stop.type !== "stop") throw new Error("jour 2 sans étape");
const event = day2.events[0]!;
const point = projectSharedPoints(edimbourgDebloque.days[1]!, maps[1])[0]!;

describe("SHARED_EXCEPTIONS et SHARE_TOKEN_PATTERN", () => {
  it("SHARED_EXCEPTIONS est un sous-ensemble de l'énumération des exceptions, sans « À réserver »", () => {
    for (const value of SHARED_EXCEPTIONS) expect(ExceptionSchema.options).toContain(value);
    expect(SHARED_EXCEPTIONS).not.toContain("toReserve");
  });

  it("SHARE_TOKEN_PATTERN : 43 caractères base64url exactement", () => {
    expect(SHARE_TOKEN_PATTERN.test("A".repeat(43))).toBe(true);
    expect(SHARE_TOKEN_PATTERN.test("a-_9".repeat(10) + "abc")).toBe(true);
    for (const value of ["abc", "A".repeat(42), "A".repeat(44), `${"A".repeat(42)}=`, `${"A".repeat(42)}/`, "A".repeat(300)]) {
      expect(SHARE_TOKEN_PATTERN.test(value), value).toBe(false);
    }
  });
});

describe("chaque schéma dérivé valide la projection du voyage simulé", () => {
  it("voyage, jours, étapes, événements et points de carte", () => {
    expect(SharedTripSchema.parse(trip)).toEqual(trip);
    for (const day of trip.days) expect(SharedDaySchema.parse(day)).toEqual(day);
    expect(SharedStopSchema.parse(stop.stop)).toEqual(stop.stop);
    expect(SharedEventSchema.parse(event)).toEqual(event);
    expect(SharedMapPointSchema.parse(point)).toEqual(point);
    expect(SharedTripViewSchema.parse({ trip, maps: projectSharedMaps(edimbourgDebloque, maps) }).trip).toEqual(trip);
    expect(SharedDayViewSchema.parse({ trip, dayIndex: 2, points: [point] }).dayIndex).toBe(2);
  });
});

describe("trajet sans durée dans la vue partagée (décisions 0092 § 4 et 0095)", () => {
  it("SharedDaySchema admet minutes: null (rendu « durée à confirmer »), jamais une durée inventée ; refuse undefined et un négatif", () => {
    const segment = day2.items.find((item) => item.type === "segment");
    if (segment?.type !== "segment") throw new Error("jour 2 sans trajet");
    const avec = (minutes: unknown) => ({ ...day2, items: day2.items.map((item) => (item === segment ? { ...segment, segment: { ...segment.segment, minutes } } : item)) });
    expect(SharedDaySchema.parse(avec(null)).items.find((item) => item.type === "segment")).toMatchObject({ segment: { minutes: null } });
    expect(SharedDaySchema.safeParse(avec(undefined)).success).toBe(false);
    expect(SharedDaySchema.safeParse(avec(-1)).success).toBe(false);
    expect(SharedDaySchema.safeParse(avec("20")).success).toBe(false);
  });

  it("la projection recopie la valeur, sans la remplacer : null reste null", () => {
    const jour = edimbourgDebloque.days[1]!;
    const index = jour.items.findIndex((item) => item.type === "segment");
    const sansDuree = {
      ...jour,
      items: jour.items.map((item, i) => (i === index && item.type === "segment" ? { ...item, segment: { ...item.segment, minutes: null } } : item)),
    };
    const projete = projectSharedTrip({ ...edimbourgDebloque, days: [sansDuree] }).days[0]!;
    expect(projete.items[index]).toMatchObject({ type: "segment", segment: { minutes: null } });
  });
});

describe("chaque champ exclu est refusé (un cas par champ)", () => {
  it.each([
    ["id", "mock_trip_edimbourg_debloque"],
    ["organizationId", "mock_org_personnelle"],
    ["timeZone", "Europe/London"],
    ["checklist", []],
    ["unlocked", true],
  ])("voyage : %s", (key, value) => {
    expect(SharedTripSchema.safeParse({ ...trip, [key]: value }).success).toBe(false);
  });

  it("voyageurs : un nom de voyageur ajouté est refusé", () => {
    expect(SharedTripSchema.safeParse({ ...trip, travellers: { ...trip.travellers, names: ["Alex"] } }).success).toBe(false);
  });

  it.each([
    ["weekday", "dim."],
    ["title", "Dimanche 30 août"],
    ["budgetPerPerson", 95],
    ["travelMinutes", 85],
    ["travelBudgetMinutes", 120],
    ["surprise", { name: "x" }],
    ["theme", "Old Town et Dean Village"],
  ])("jour : %s", (key, value) => {
    expect(SharedDaySchema.safeParse({ ...day2, [key]: value }).success).toBe(false);
  });

  it.each([
    ["id", "j2-dean-village"],
    ["placeId", "mock_place_dean"],
    ["reason", "Tu as choisi la musique"],
    ["source", { label: "x", url: "https://example.com" }],
    ["verifiedAt", "2026-08-01"],
    ["locked", true],
    ["commitment", "booked"],
  ])("étape : %s", (key, value) => {
    expect(SharedStopSchema.safeParse({ ...stop.stop, [key]: value }).success).toBe(false);
  });

  it.each([
    ["id", "j2-evt"],
    ["key", "1"],
    ["placeId", "mock_place_x"],
    ["reason", "Tu as choisi la musique"],
    ["locked", false],
  ])("événement : %s", (key, value) => {
    expect(SharedEventSchema.safeParse({ ...event, [key]: value }).success).toBe(false);
  });

  it.each([
    ["tip", "Arrive tôt"],
    ["priceNote", "Environ 20 GBP"],
    ["hoursNote", "Fermé le lundi"],
  ])("faits d'une étape ou d'un événement : %s refusé (décision 0103, condition 1)", (key, value) => {
    expect(SharedStopSchema.safeParse({ ...stop.stop, facts: { ...stop.stop.facts, [key]: value } }).success).toBe(false);
    expect(SharedEventSchema.safeParse({ ...event, facts: { ...event.facts, [key]: value } }).success).toBe(false);
  });

  it("exception « À réserver » refusée, dans une étape comme dans un événement", () => {
    expect(SharedStopSchema.safeParse({ ...stop.stop, exceptions: ["toReserve"] }).success).toBe(false);
    expect(SharedEventSchema.safeParse({ ...event, exceptions: ["toReserve"] }).success).toBe(false);
  });

  it("terminus : libellé refusé", () => {
    expect(SharedDaySchema.safeParse({ ...day2, items: [{ type: "terminus", role: "start", time: "09:00", label: "Hôtel" }] }).success).toBe(false);
  });

  it.each([
    ["ref", { type: "terminus", role: "start" }],
    ["stopId", "j2-dean-village"],
    ["dayIndex", 2],
  ])("point de carte : %s", (key, value) => {
    expect(SharedMapPointSchema.safeParse({ ...point, [key]: value }).success).toBe(false);
  });

  it("vues : champ en trop refusé", () => {
    expect(SharedTripViewSchema.safeParse({ trip, maps: [], tripId: "x" }).success).toBe(false);
    expect(SharedDayViewSchema.safeParse({ trip, dayIndex: 2, points: [], organizationId: "x" }).success).toBe(false);
  });
});

describe("actions : entrée et réponses", () => {
  it("ShareRequest : le voyage seulement", () => {
    expect(ShareRequestSchema.safeParse({ tripId: "mock_trip_edimbourg" }).success).toBe(true);
    expect(ShareRequestSchema.safeParse({ tripId: "mock_trip_edimbourg", organizationId: "x" }).success).toBe(false);
    expect(ShareRequestSchema.safeParse({}).success).toBe(false);
  });

  it("ShareStatus : jamais de jeton ; expiresOn est une date", () => {
    expect(ShareStatusSchema.safeParse({ active: false }).success).toBe(true);
    const active = { active: true, createdAt: "2026-08-01T11:00:00.000Z", expiresOn: "2026-10-03" };
    expect(ShareStatusSchema.safeParse(active).success).toBe(true);
    expect(ShareStatusSchema.safeParse({ ...active, token: "A".repeat(43) }).success).toBe(false);
    expect(ShareStatusSchema.safeParse({ ...active, expiresOn: "2026-10-03T23:59:00Z" }).success).toBe(false);
    expect(ShareStatusSchema.safeParse({ active: false, createdAt: active.createdAt }).success).toBe(false);
  });

  it("CreatedShareLink : jeton de la forme SHARE_TOKEN_PATTERN", () => {
    const created = { token: "A".repeat(43), createdAt: "2026-08-30T09:40:00.000Z", expiresOn: "2026-10-03" };
    expect(CreatedShareLinkSchema.safeParse(created).success).toBe(true);
    expect(CreatedShareLinkSchema.safeParse({ ...created, token: "abc" }).success).toBe(false);
  });
});

describe("plusieurs-villes: transfer absent de la vue partagée (décision 0148 § 1 point 4, S-M4-4)", () => {
  const transfer = { type: "transfer", from: "Rome", to: "Florence", source: "estimated", start: "11:30", estimatedMinutes: 180, mode: "transit" };

  it("SharedDaySchema refuse un transfer (liste blanche, aucune nouvelle variante)", () => {
    expect(SharedDaySchema.safeParse({ ...day2, items: [...day2.items, transfer] }).success).toBe(false);
  });

  it("SharedTripSchema refuse Trip.cities (0148 § 6 point 2)", () => {
    expect(SharedTripSchema.safeParse({ ...trip, cities: [{ name: "Rome", start: "2027-04-10", end: "2027-04-12" }] }).success).toBe(false);
  });
});
