// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Trip } from "@/contracts";
import { SharedTripSchema } from "@/contracts/share";
import { deriveEdimbourgCarte } from "@/mocks/edimbourg-carte";
import { edimbourgDebloque } from "@/mocks/edimbourg";

import { projectSharedMaps, projectSharedPoints, projectSharedTrip, stopKeys } from "./share-projection";

/**
 * Projection de la vue partagée (spécification F10, F10-PO-14, F10-TL-1, F10-TL-14) : comparaison exacte des clés,
 * en profondeur, sur les six jours du voyage simulé, pour les étapes, les événements et les points de carte.
 */

const trip = edimbourgDebloque;
const maps = deriveEdimbourgCarte(trip);
const shared = projectSharedTrip(trip);

/** Toutes les clés rencontrées, par chemin générique (`days[].items[].stop.facts.area`). */
function keyPaths(value: unknown, path = ""): Set<string> {
  const paths = new Set<string>();
  const visit = (node: unknown, at: string) => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item, `${at}[]`);
    } else if (node && typeof node === "object") {
      for (const [key, child] of Object.entries(node)) {
        const next = at ? `${at}.${key}` : key;
        paths.add(next);
        visit(child, next);
      }
    }
  };
  visit(value, path);
  return paths;
}

const ALLOWED = new Set([
  "destination",
  "destinationColor",
  "start",
  "end",
  "travellers",
  "travellers.adults",
  "travellers.children",
  "days",
  "days[].index",
  "days[].date",
  "days[].generating",
  "days[].items",
  "days[].items[].type",
  "days[].items[].role",
  "days[].items[].time",
  "days[].items[].meal",
  "days[].items[].from",
  "days[].items[].to",
  "days[].items[].segment",
  "days[].items[].segment.mode",
  "days[].items[].segment.minutes",
  "days[].items[].segment.estimated",
  "days[].items[].stop",
  "days[].items[].stop.kind",
  "days[].items[].stop.name",
  "days[].items[].stop.start",
  "days[].items[].stop.end",
  "days[].items[].stop.facts",
  "days[].items[].stop.facts.durationMinutes",
  "days[].items[].stop.facts.costPerPerson",
  "days[].items[].stop.facts.area",
  "days[].items[].stop.key",
  "days[].items[].stop.exceptions",
  "days[].events",
  "days[].events[].kind",
  "days[].events[].name",
  "days[].events[].start",
  "days[].events[].end",
  "days[].events[].facts",
  "days[].events[].facts.durationMinutes",
  "days[].events[].facts.costPerPerson",
  "days[].events[].facts.area",
  "days[].events[].exceptions",
]);

describe("projectSharedTrip", () => {
  it("le jeu simulé a six jours, dont un en préparation", () => {
    expect(trip.days).toHaveLength(6);
    expect(trip.days.some((day) => day.generating)).toBe(true);
  });

  it("aucune clé hors de la liste blanche, en profondeur, sur les six jours (étapes et événements)", () => {
    const paths = keyPaths(shared);
    expect([...paths].filter((path) => !ALLOWED.has(path))).toEqual([]);
    // Le voyage simulé exerce bien les étapes, les événements, les faits et les terminus.
    for (const path of ["days[].items[].stop.key", "days[].events[].name", "days[].items[].role", "days[].items[].stop.facts.area"]) {
      expect(paths.has(path), path).toBe(true);
    }
  });

  it("aucune valeur privée : libellés de terminus, identifiants, raisons, sources, lieux Google, budget, liste", () => {
    const text = JSON.stringify(shared);
    for (const day of trip.days) {
      for (const item of day.items) {
        if (item.type === "terminus" && item.label) expect(text).not.toContain(item.label);
        if (item.type === "stop") {
          expect(text).not.toContain(`"${item.stop.id}"`);
          if (item.stop.reason) expect(text).not.toContain(item.stop.reason);
          if (item.stop.placeId) expect(text).not.toContain(item.stop.placeId);
          if (item.stop.source) expect(text).not.toContain(item.stop.source.label);
        }
      }
      for (const event of day.events) {
        expect(text).not.toContain(`"${event.id}"`);
        if (event.reason) expect(text).not.toContain(event.reason);
      }
    }
    // La liste « À faire avant de partir » n'a aucune clé dans la projection (liste blanche ci-dessus) ; ses libellés
    // reprennent souvent le nom d'une étape, d'où l'absence de contrôle par le texte.
    for (const item of trip.checklist) expect(text).not.toContain(`"${item.id}"`);
    for (const value of [trip.id, trip.organizationId, "mock_place_", "toReserve", "budgetPerPerson", "surprise", "travelMinutes"]) {
      expect(text).not.toContain(value);
    }
  });

  it("voyageurs réduits à { adults, children } ; un champ ajouté au voyage simulé ne passe jamais", () => {
    expect(shared.travellers).toEqual({ adults: trip.travellers.adults, children: trip.travellers.children });
    const withName = { ...trip, travellers: { ...trip.travellers, names: ["Alex"] } } as unknown as Trip;
    expect(projectSharedTrip(withName).travellers).toEqual(shared.travellers);
    // Une recopie par décomposition ferait échouer la validation stricte : la page répondrait 500, sans le champ.
    expect(SharedTripSchema.safeParse({ ...shared, travellers: withName.travellers }).success).toBe(false);
  });

  it("exceptions limitées à « À confirmer » et « Non confirmé »", () => {
    const exceptions = shared.days.flatMap((day) => [
      ...day.items.flatMap((item) => (item.type === "stop" ? item.stop.exceptions : [])),
      ...day.events.flatMap((event) => event.exceptions),
    ]);
    expect(exceptions.length).toBeGreaterThan(0);
    for (const value of exceptions) expect(["toConfirm", "unconfirmed"]).toContain(value);
  });

  it("valide par le schéma strict", () => {
    expect(SharedTripSchema.parse(shared)).toEqual(shared);
  });
});

describe("partage: infos pratiques et titre du jour (décisions 0103 et 0116 § 6)", () => {
  it("partage: un voyage dont l'étape porte priceNote, hoursNote et tip ne les expose ni par la projection ni par la base (projection)", () => {
    const INFOS = { tip: "[Conseil sentinelle]", priceNote: "[Prix sentinelle]", hoursNote: "[Horaires sentinelle]" };
    const avecInfos: Trip = {
      ...trip,
      days: trip.days.map((day) => ({
        ...day,
        theme: "[Titre sentinelle]",
        items: day.items.map((item) => (item.type === "stop" ? { ...item, stop: { ...item.stop, facts: { ...item.stop.facts, ...INFOS } } } : item)),
        events: day.events.map((event) => ({ ...event, facts: { ...event.facts, ...INFOS } })),
      })),
    };
    const projete = projectSharedTrip(avecInfos);
    const texte = JSON.stringify(projete);
    for (const sentinelle of [...Object.values(INFOS), "[Titre sentinelle]"]) expect(texte).not.toContain(sentinelle);
    expect([...keyPaths(projete)].filter((path) => !ALLOWED.has(path))).toEqual([]);
    expect(SharedTripSchema.safeParse(projete).success).toBe(true);
  });
});

describe("points de carte (F10-TL-14)", () => {
  it("étapes seulement, chacune désignée par sa clé locale au jour ; aucun terminus", () => {
    for (const day of trip.days) {
      const points = projectSharedPoints(
        day,
        maps.find((map) => map.dayIndex === day.index),
      );
      const keys = [...stopKeys(day).values()];
      for (const point of points) {
        expect(Object.keys(point).sort()).toEqual(["key", "lat", "lng"]);
        expect(keys).toContain(point.key);
      }
    }
    const terminusPositions = maps.flatMap((map) => map.points.filter((point) => point.ref.type === "terminus"));
    expect(terminusPositions.length).toBeGreaterThan(0);
    const text = JSON.stringify(projectSharedMaps(trip, maps));
    for (const position of terminusPositions) {
      const usedByStop = maps.some((map) =>
        map.points.some((point) => point.ref.type === "stop" && point.lat === position.lat && point.lng === position.lng),
      );
      if (!usedByStop) expect(text).not.toContain(`"lat":${position.lat},"lng":${position.lng}`);
    }
  });

  it("clé locale : le rang parmi les étapes du jour, « 1 » pour la première", () => {
    const day = trip.days[1]!;
    const stops = day.items.flatMap((item) => (item.type === "stop" ? [item.stop.id] : []));
    expect([...stopKeys(day).entries()]).toEqual(stops.map((id, index) => [id, String(index + 1)]));
  });

  it("un point qui ne désigne aucune étape du jour est ignoré", () => {
    const day = trip.days[1]!;
    const map = { tripId: trip.id, dayIndex: 2, points: [{ ref: { type: "stop" as const, stopId: "inconnue" }, lat: 1, lng: 2 }] };
    expect(projectSharedPoints(day, map)).toEqual([]);
  });

  it("un jeu de points par jour, sans jour inventé", () => {
    expect(projectSharedMaps(trip, maps).map((map) => map.index)).toEqual(trip.days.map((day) => day.index));
  });
});

describe("plusieurs-villes: la projection retire le transfer (décisions 0148 § 1 point 4 et 0149, S-M4-4)", () => {
  it("un transfer n'apparaît pas dans la vue partagée, sous aucune forme ; les autres éléments restent dans l'ordre", () => {
    const jour = trip.days[1]!;
    const transfer = {
      type: "transfer",
      from: "Édimbourg",
      to: "Glasgow",
      source: "entered",
      start: "12:00",
      end: "13:15",
      label: "[Train Édimbourg–Glasgow]",
    } as const;
    const avec = { ...jour, items: [...jour.items.slice(0, 2), transfer, ...jour.items.slice(2)] };
    const avecCities: Trip = { ...trip, days: [avec], cities: [{ name: "Édimbourg", start: "2026-08-29", end: "2026-08-31" }, { name: "Glasgow", start: "2026-08-31", end: "2026-09-03" }] };
    const projete = projectSharedTrip(avecCities);
    const sansTransfer = projectSharedTrip({ ...trip, days: [jour] });
    // Retiré, jamais converti : la projection est exactement celle du jour sans le transfer.
    expect(projete.days[0]!.items).toEqual(sansTransfer.days[0]!.items);
    expect(projete.days[0]!.items).toHaveLength(jour.items.length);
    expect(JSON.stringify(projete)).not.toMatch(/transfer|Glasgow|Train/);
    expect(projete).not.toHaveProperty("cities");
    expect(SharedTripSchema.parse(projete)).toEqual(projete);
  });
});
