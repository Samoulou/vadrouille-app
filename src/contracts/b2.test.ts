// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  ApiErrorSchema,
  ChecklistItemSchema,
  ChecklistMomentSchema,
  PatchResultSchema,
  PreviewSlotSchema,
  PreviewSlotsSchema,
  ProposalNeighbourSchema,
  SourceSchema,
  StopFactsSchema,
  TripPatchSchema,
  TripSchema,
  type ChecklistItem,
  type Proposal,
  type Stop,
  type Trip,
} from "./index";

/*
 * Contrats de B2 (spécification B2, « Critères d'acceptation ») : StopFacts, ChecklistMoment, ChecklistItem.stopId,
 * raffinement https, PreviewSlot, TripPatch, PatchResult, ApiError.currentVersion.
 */

const UUID = "3f6c1d2e-8a4b-4c5d-9e6f-0a1b2c3d4e5f";
const UUID_2 = "7d1e2f3a-4b5c-4d6e-8f9a-0b1c2d3e4f5a";

/** Copie sans les clés données. */
function omit<T extends object, K extends keyof T>(value: T, ...keys: K[]): Omit<T, K> {
  const copy = { ...value };
  for (const key of keys) delete copy[key];
  return copy;
}

const stop = (id: string, kind: Stop["kind"] = "activity"): Stop => ({
  id,
  kind,
  name: `[${id}]`,
  start: "10:00",
  facts: {},
  exceptions: [],
  locked: false,
});

const item = (overrides: Partial<ChecklistItem> = {}): ChecklistItem => ({
  id: "c1",
  label: "[Billet]",
  when: { type: "beforeDeparture" },
  done: false,
  sponsored: false,
  ...overrides,
});

function trip(checklist: ChecklistItem[]): Trip {
  return {
    id: "t1",
    organizationId: "org1",
    destination: "[Ville]",
    destinationColor: "granit",
    start: "2026-08-29",
    end: "2026-08-30",
    timeZone: "Europe/London",
    travellers: { adults: 2, children: 0 },
    days: [1, 2].map((index) => ({
      index,
      date: `2026-08-${28 + index}`,
      items: [{ type: "stop" as const, stop: stop(`j${index}-a`) }],
      events: index === 2 ? [stop("j2-evenement", "event")] : [],
      generating: false,
      travelMinutes: 0,
      travelBudgetMinutes: 90,
    })),
    checklist,
    unlocked: false,
  };
}

const proposal = (day: number, time: string): Proposal => ({
  id: `p-${day}-${time}`,
  kind: "activity",
  day,
  time,
  neighbours: {},
  stop: { ...stop(`s-${day}-${time}`), start: time },
  category: "museum",
});

describe("StopFacts (E3)", () => {
  it("contrats: StopFacts", () => {
    expect(StopFactsSchema.safeParse({}).success).toBe(true);
    expect(StopFactsSchema.safeParse({ durationMinutes: 90, costPerPerson: 0, area: "[Old Town]" }).success).toBe(true);
    expect(StopFactsSchema.safeParse({ costPerPerson: 12.5 }).success).toBe(true);
    for (const refuse of [
      { durationMinutes: 0 },
      { durationMinutes: 12.5 },
      { costPerPerson: -1 },
      { area: "" },
      { area: "x".repeat(61) },
      { rating: 4.5 },
      { priceLevel: 2 },
    ]) {
      expect(StopFactsSchema.safeParse(refuse).success, JSON.stringify(refuse)).toBe(false);
    }
  });
});

describe("Adresses issues du web (handover § 12)", () => {
  it("contrats: aucune adresse autre que https", async () => {
    for (const url of ["http://example.org/a", "javascript:alert(1)", "data:text/html,x", "ftp://example.org/a"]) {
      expect(SourceSchema.safeParse({ label: "[Source]", url }).success, url).toBe(false);
      expect(ChecklistItemSchema.safeParse(item({ bookingUrl: url })).success, url).toBe(false);
    }
    expect(SourceSchema.safeParse({ label: "[Source]", url: "https://example.org/a" }).success).toBe(true);
    expect(ChecklistItemSchema.safeParse(item({ bookingUrl: "https://example.org/a" })).success).toBe(true);

    // Données simulées : toute adresse de source ou de réservation est en https.
    const { edimbourg, edimbourgDebloque, propositions, propositionsDebloque, apercu } = await import("@/mocks/edimbourg");
    const { lisbonne, porto } = await import("@/mocks/autres-voyages");
    const urls: string[] = [];
    const parcourir = (valeur: unknown, cle = ""): void => {
      if (Array.isArray(valeur)) valeur.forEach((element) => parcourir(element));
      else if (valeur !== null && typeof valeur === "object") for (const [k, v] of Object.entries(valeur)) parcourir(v, k);
      else if ((cle === "url" || cle === "bookingUrl") && typeof valeur === "string") urls.push(valeur);
    };
    parcourir({ edimbourg, edimbourgDebloque, propositions, propositionsDebloque, apercu, lisbonne, porto });
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(new URL(url).protocol, url).toBe("https:");
  });
});

describe("ChecklistMoment (E4) et PreviewSlot (E5)", () => {
  it("contrats: ChecklistMoment et PreviewSlot sans texte d'interface", () => {
    expect(ChecklistItemSchema.safeParse(item({ when: "[Avant le départ]" as never })).success).toBe(false);
    for (const when of [{ type: "deadline", date: "2026-08-22" }, { type: "beforeDeparture" }, { type: "tripDay", day: 2 }] as const) {
      expect(ChecklistItemSchema.safeParse(item({ when })).success, when.type).toBe(true);
    }
    expect(ChecklistMomentSchema.safeParse({ type: "beforeDeparture", label: "[Avant]" }).success).toBe(false);
    expect(ChecklistMomentSchema.safeParse({ type: "tripDay", day: 0 }).success).toBe(false);

    const noOption = { type: "noOption", day: 1, time: "16:00", kind: "activity" };
    expect(PreviewSlotSchema.safeParse(noOption).success).toBe(true);
    for (const key of ["name", "label", "text", "placeId", "message"]) {
      expect(PreviewSlotSchema.safeParse({ ...noOption, [key]: "[x]" }).success, key).toBe(false);
    }
    for (const key of ["name", "label"]) {
      expect(ProposalNeighbourSchema.safeParse({ type: "free", [key]: "[x]" }).success, key).toBe(false);
      expect(ProposalNeighbourSchema.safeParse({ type: "stop", stopId: "s1", [key]: "[x]" }).success, key).toBe(false);
    }
  });

  it("PreviewSlotsSchema : 8 cases au plus, un créneau (jour, heure) par case", () => {
    const huit = Array.from({ length: 8 }, (_, i) => ({ type: "proposal" as const, proposal: proposal(1 + Math.floor(i / 4), `1${i}:00`) }));
    expect(PreviewSlotsSchema.safeParse(huit).success).toBe(true);
    expect(PreviewSlotsSchema.safeParse([...huit, { type: "noOption", day: 3, time: "10:00", kind: "meal" }]).success).toBe(false);
    expect(
      PreviewSlotsSchema.safeParse([
        { type: "proposal", proposal: proposal(1, "10:00") },
        { type: "noOption", day: 1, time: "10:00", kind: "activity" },
      ]).success,
    ).toBe(false);
  });
});

describe("ChecklistItem.stopId (E9) et moment tripDay (E4)", () => {
  it("contrats: ChecklistItem.stopId désigne une étape du voyage", () => {
    expect(TripSchema.safeParse(trip([item({ stopId: "j1-a" }), item({ id: "c2", stopId: "j2-evenement" })])).success).toBe(true);
    const absent = TripSchema.safeParse(trip([item({ stopId: "inconnu" })]));
    expect(absent.success).toBe(false);
    expect(absent.error?.issues.map((issue) => issue.path.join("."))).toContain("checklist.0.stopId");
    expect(TripSchema.safeParse(trip([item({ when: { type: "tripDay", day: 2 } })])).success).toBe(true);
    const tropLoin = TripSchema.safeParse(trip([item({ when: { type: "tripDay", day: 3 } })]));
    expect(tropLoin.success).toBe(false);
    expect(tropLoin.error?.issues.map((issue) => issue.path.join("."))).toContain("checklist.0.when.day");
  });
});

describe("TripPatch (décision 0037, B2-TL-3)", () => {
  const patch = (operations: unknown[], baseVersion = 3) => ({ requestId: UUID, baseVersion, operations });
  const ok = (value: unknown) => TripPatchSchema.safeParse(value).success;
  const add = { op: "add", stopId: "n1", kind: "activity", day: 2, time: "10:00", name: "  Musée de la ville  " };

  it("contrats: TripPatch désigne les étapes par identifiant", () => {
    // Chaque opération sous sa forme.
    expect(ok(patch([{ op: "replace", stopId: "s1", candidateId: UUID_2, newStopId: "s1b" }]))).toBe(true);
    expect(ok(patch([add]))).toBe(true);
    expect(ok(patch([{ ...add, placeId: "mock_place" }]))).toBe(true);
    expect(TripPatchSchema.parse(patch([add])).operations[0]).toMatchObject({ name: "Musée de la ville" });
    expect(ok(patch([{ op: "move", stopId: "s1", day: 3, time: "15:30" }]))).toBe(true);
    expect(ok(patch([{ op: "lock", stopId: "s1" }, { op: "unlock", stopId: "s2" }]))).toBe(true);
    expect(ok(patch([{ op: "revert", toVersion: 2 }]))).toBe(true);
    expect(ok(patch([{ op: "revert", toVersion: 1 }], 2))).toBe(true);

    // add : name et kind obligatoires, 1 à 80 caractères, jamais un événement.
    const sansNom = omit(add, "name");
    const sansKind = omit(add, "kind");
    expect(ok(patch([sansNom]))).toBe(false);
    expect(ok(patch([sansKind]))).toBe(false);
    expect(ok(patch([{ ...add, name: "   " }]))).toBe(false);
    expect(ok(patch([{ ...add, name: "x".repeat(81) }]))).toBe(false);
    expect(ok(patch([{ ...add, name: "x".repeat(80) }]))).toBe(true);
    expect(ok(patch([{ ...add, kind: "event" }]))).toBe(false);

    // replace : newStopId obligatoire et différent ; identifiants attribués uniques.
    expect(ok(patch([{ op: "replace", stopId: "s1", candidateId: UUID_2 }]))).toBe(false);
    expect(ok(patch([{ op: "replace", stopId: "s1", candidateId: UUID_2, newStopId: "s1" }]))).toBe(false);
    expect(ok(patch([add, { op: "replace", stopId: "s1", candidateId: UUID_2, newStopId: "n1" }]))).toBe(false);
    expect(ok(patch([add, { ...add, time: "16:00" }]))).toBe(false);

    // candidateId UUID ; toVersion ≥ 1 et < baseVersion ; revert seul.
    expect(ok(patch([{ op: "replace", stopId: "s1", candidateId: "c-1", newStopId: "s1b" }]))).toBe(false);
    expect(ok(patch([{ op: "revert", toVersion: 0 }]))).toBe(false);
    expect(ok(patch([{ op: "revert", toVersion: 3 }], 3))).toBe(false);
    expect(ok(patch([{ op: "revert", toVersion: 4 }], 3))).toBe(false);
    expect(ok(patch([{ op: "revert", toVersion: 1 }, { op: "lock", stopId: "s1" }]))).toBe(false);

    // Aucune clé Google dans une opération.
    for (const key of ["displayName", "formattedAddress", "location"]) {
      expect(ok(patch([{ ...add, [key]: key === "location" ? { lat: 1, lng: 2 } : "[x]" }])), key).toBe(false);
      expect(ok(patch([{ op: "move", stopId: "s1", day: 1, time: "10:00", [key]: "[x]" }])), key).toBe(false);
    }

    // requestId UUID ; baseVersion ≥ 1 ; au moins une opération.
    expect(ok({ ...patch([add]), requestId: "demande-1" })).toBe(false);
    expect(ok(patch([add], 0))).toBe(false);
    expect(ok(patch([]))).toBe(false);
  });
});

describe("PatchResult (décision 0037, B2-TL-4)", () => {
  it("contrats: PatchResult", () => {
    const valid = { version: 2, touchedDays: [1, 3], changes: [{ type: "budget", deltaPerPerson: -12 }] };
    expect(PatchResultSchema.safeParse(valid).success).toBe(true);
    expect(PatchResultSchema.safeParse({ ...valid, touchedDays: [], changes: [] }).success).toBe(true);
    expect(PatchResultSchema.safeParse({ ...valid, version: 1 }).success).toBe(false);
    expect(PatchResultSchema.safeParse({ ...valid, touchedDays: [1, 1] }).success).toBe(false);
    expect(PatchResultSchema.safeParse({ ...valid, touchedDays: [0] }).success).toBe(false);
    expect(PatchResultSchema.safeParse({ ...valid, trip: {} }).success).toBe(false);
  });
});

describe("ApiError.currentVersion (E10, B2-PO-8)", () => {
  it("contrats: currentVersion seulement pour version_conflict", () => {
    expect(ApiErrorSchema.safeParse({ code: "version_conflict", currentVersion: 4, retryable: true }).success).toBe(true);
    expect(ApiErrorSchema.safeParse({ code: "not_found" }).success).toBe(true);
    expect(ApiErrorSchema.safeParse({ code: "not_found", currentVersion: 4 }).success).toBe(false);
    expect(ApiErrorSchema.safeParse({ code: "version_conflict", retryable: true }).success).toBe(false);
    expect(ApiErrorSchema.safeParse({ code: "version_conflict", currentVersion: 4 }).success).toBe(false);
    expect(ApiErrorSchema.safeParse({ code: "version_conflict", currentVersion: 4, retryable: false }).success).toBe(false);
    expect(ApiErrorSchema.safeParse({ code: "version_conflict", currentVersion: 0, retryable: true }).success).toBe(false);
  });
});
