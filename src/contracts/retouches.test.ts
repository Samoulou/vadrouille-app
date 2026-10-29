// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";

import {
  AddPlaceApplySchema,
  AddPlaceRequestSchema,
  ApiErrorSchema,
  ChangeSchema,
  ChecklistItemSchema,
  PlaceSearchRequestSchema,
  PlaceSearchResultSchema,
  PlaceSearchResultsSchema,
  RevertPreviewSchema,
  RevisionPreviewSchema,
  StopReportSchema,
  StopSchema,
  TripPatchOperationSchema,
  TripVersionPageSchema,
  TripVersionSummarySchema,
  type AddPlaceRequest,
  type Change,
  type StopReport,
  type TripVersionSummary,
} from "@/contracts";
import { API_ERROR_CODES, CHECKLIST_KINDS, STOP_REPORT_REASONS, TRIP_VERSION_KINDS } from "@/contracts/values";

/**
 * PR de contrat M5-C (décision 0147 § 14) : formes des retouches, sans cas d'usage ni action.
 */

const TRIP = "0b9f4c7e-3c1d-4a4e-9f43-5a2b7f0c1d2e";
const REQUETE = "6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f";
const PLACE = "SENTINELLE_PLACE_M5C";

describe("not_unlocked (décision 0147 § 8)", () => {
  it("ajouté en dernier, sans renommer ni réordonner ; retryable faux exigé", () => {
    expect(API_ERROR_CODES.at(-1)).toBe("not_unlocked");
    expect(API_ERROR_CODES.indexOf("already_unlocked")).toBe(2);
    expect(ApiErrorSchema.safeParse({ code: "not_unlocked", retryable: false }).success).toBe(true);
    expect(ApiErrorSchema.safeParse({ code: "not_unlocked", retryable: true }).success).toBe(false);
    expect(ApiErrorSchema.safeParse({ code: "not_unlocked" }).success).toBe(false);
  });
});

describe("StopReport (décision 0147 § 1)", () => {
  const valide: StopReport = { tripId: TRIP, stopId: "j2-3", reason: "closed", requestId: REQUETE };

  it("motifs fermés, dans l'ordre de la feuille", () => {
    expect([...STOP_REPORT_REASONS]).toEqual(["closed", "hours", "wrongPlace", "price", "other"]);
    expect(StopReportSchema.shape.reason.options).toEqual([...STOP_REPORT_REASONS]);
    for (const reason of STOP_REPORT_REASONS) expect(StopReportSchema.safeParse({ ...valide, reason }).success).toBe(true);
    expect(StopReportSchema.safeParse({ ...valide, reason: "dirty" }).success).toBe(false);
  });

  it("aucun champ de texte (M5-PO-9) : objet strict, texte, placeId et organisation refusés", () => {
    expect(StopReportSchema.safeParse(valide).success).toBe(true);
    for (const extra of [{ text: "Fermé depuis mars" }, { placeId: PLACE }, { organizationId: "org" }]) {
      expect(StopReportSchema.safeParse({ ...valide, ...extra }).success).toBe(false);
    }
    expect(StopReportSchema.safeParse({ ...valide, requestId: "pas-un-uuid" }).success).toBe(false);
    expect(StopReportSchema.safeParse({ ...valide, tripId: "voyage/../autre" }).success).toBe(false);
    expect(StopReportSchema.safeParse({ ...valide, stopId: "" }).success).toBe(false);
  });
});

describe("ChecklistItem.kind (décision 0147 § 6.2)", () => {
  it("CHECKLIST_KINDS est la source du schéma et égale le CHECK de checklist_items.kind", () => {
    expect(ChecklistItemSchema.shape.kind.options).toEqual([...CHECKLIST_KINDS]);
    const schema = readFileSync(path.join(process.cwd(), "db/schema/business.ts"), "utf8");
    const check = schema.match(/check\("checklist_items_kind_check", oneOf\(t\.kind, \[([^\]]*)\]\)\)/);
    expect(check).not.toBeNull();
    expect([...(check?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1])).toEqual([...CHECKLIST_KINDS]);
  });

  it("obligatoire, valeur fermée", () => {
    const ligne = { id: "c1", kind: "reservation", label: "[Château]", when: { type: "beforeDeparture" }, done: false, sponsored: false };
    expect(ChecklistItemSchema.safeParse(ligne).success).toBe(true);
    expect(ChecklistItemSchema.safeParse({ ...ligne, kind: undefined }).success).toBe(false);
    expect(ChecklistItemSchema.safeParse({ ...ligne, kind: "booking" }).success).toBe(false);
  });
});

describe("Stop.addedBy (décision 0147 § 6.1)", () => {
  const stop = { id: "ajout-x", kind: "activity", name: "Mon lieu", start: "10:00", facts: {}, exceptions: [], locked: true };
  it("facultatif, seule valeur \"person\"", () => {
    expect(StopSchema.safeParse(stop).success).toBe(true);
    expect(StopSchema.safeParse({ ...stop, addedBy: "person" }).success).toBe(true);
    expect(StopSchema.safeParse({ ...stop, addedBy: "discovered" }).success).toBe(false);
  });
});

describe("Change étendu (décision 0147 § 5.1)", () => {
  it("variantes ajoutées à la fin de l'union, sans renommer ni réordonner", () => {
    expect(ChangeSchema.options.map((option) => option.shape.type.value)).toEqual([
      "replaced",
      "added",
      "moved",
      "segment",
      "budget",
      "unchanged",
      "removed",
      "locked",
      "unlocked",
      "checklist",
    ]);
  });

  it("formes strictes, noms maison seulement", () => {
    const valides: Change[] = [
      { type: "removed", label: "[Musée]", before: { day: 2, time: "13:25" } },
      { type: "locked", label: "[Château]", time: "09:30" },
      { type: "unlocked", label: "[Château]", time: "09:30" },
      { type: "checklist", action: "added", label: "[Château]" },
      { type: "checklist", action: "removed", label: "[Château]" },
    ];
    for (const change of valides) expect(ChangeSchema.safeParse(change).success, change.type).toBe(true);
    expect(ChangeSchema.safeParse({ type: "removed", label: "[Musée]", before: { day: 0, time: "13:25" } }).success).toBe(false);
    expect(ChangeSchema.safeParse({ type: "locked", label: "[Château]", time: "9:30" }).success).toBe(false);
    expect(ChangeSchema.safeParse({ type: "checklist", action: "done", label: "[Château]" }).success).toBe(false);
    expect(ChangeSchema.safeParse({ type: "removed", label: "[Musée]", before: { day: 2, time: "13:25" }, displayName: "x" }).success).toBe(false);
  });
});

describe("TripPatch add : nom saisi en texte maison (décision 0147 § 12 S4)", () => {
  const add = { op: "add", stopId: "ajout-1", kind: "activity", day: 1, time: "10:00", name: "Mon lieu" } as const;
  it("refuse balise, URL et caractère de contrôle ; coupe les espaces", () => {
    expect(TripPatchOperationSchema.parse({ ...add, name: "  Mon lieu  " })).toMatchObject({ name: "Mon lieu" });
    for (const name of ["<b>Lieu</b>", "lieu.example.com", "https://x.test", "Lieu\u0007", "Ligne\ndeux", "   ", "x".repeat(81)]) {
      expect(TripPatchOperationSchema.safeParse({ ...add, name }).success, name).toBe(false);
    }
  });
});

describe("TripVersionSummary et page (décision 0147 § 5.3)", () => {
  const base = { version: 3, createdAt: "2026-10-29T08:15:00.000Z", revertible: true, current: false };
  const parSorte: Record<(typeof TRIP_VERSION_KINDS)[number], TripVersionSummary> = {
    prepared: { ...base, kind: "prepared" },
    adjusted: { ...base, kind: "adjusted" },
    complete: { ...base, kind: "complete" },
    replaced: { ...base, kind: "replaced", subject: "[Nouveau]", previous: "[Ancien]" },
    added: { ...base, kind: "added", subject: "[Ajout]" },
    moved: { ...base, kind: "moved", subject: "[Musée]", day: 4 },
    locked: { ...base, kind: "locked", subject: "[Château]" },
    unlocked: { ...base, kind: "unlocked", subject: "[Château]" },
    reverted: { ...base, kind: "reverted", revertedTo: { version: 2, createdAt: "2026-10-28T19:00:00+02:00" } },
  };

  it("une forme valide par sorte ; champs exigés et interdits selon la sorte", () => {
    for (const [kind, ligne] of Object.entries(parSorte)) expect(TripVersionSummarySchema.safeParse(ligne).success, kind).toBe(true);
    expect(TripVersionSummarySchema.safeParse({ ...parSorte.replaced, previous: undefined }).success).toBe(false);
    expect(TripVersionSummarySchema.safeParse({ ...parSorte.added, subject: undefined }).success).toBe(false);
    expect(TripVersionSummarySchema.safeParse({ ...parSorte.moved, day: undefined }).success).toBe(false);
    expect(TripVersionSummarySchema.safeParse({ ...parSorte.prepared, subject: "[x]" }).success).toBe(false);
    expect(TripVersionSummarySchema.safeParse({ ...parSorte.added, previous: "[x]" }).success).toBe(false);
    expect(TripVersionSummarySchema.safeParse({ ...parSorte.reverted, revertedTo: { version: 3, createdAt: base.createdAt } }).success).toBe(false);
    expect(TripVersionSummarySchema.safeParse({ ...parSorte.prepared, kind: "deleted" }).success).toBe(false);
  });

  it("la version courante n'est jamais proposée au retour ; aucun champ de plus (instantané, nom Google)", () => {
    expect(TripVersionSummarySchema.safeParse({ ...parSorte.locked, current: true, revertible: true }).success).toBe(false);
    expect(TripVersionSummarySchema.safeParse({ ...parSorte.locked, current: true, revertible: false }).success).toBe(true);
    expect(TripVersionSummarySchema.safeParse({ ...parSorte.locked, snapshot: {} }).success).toBe(false);
    expect(TripVersionSummarySchema.safeParse({ ...parSorte.locked, createdAt: "29.10.2026" }).success).toBe(false);
  });

  it("page : nextBefore nul en fin de liste", () => {
    expect(TripVersionPageSchema.safeParse({ items: [parSorte.locked], nextBefore: null }).success).toBe(true);
    expect(TripVersionPageSchema.safeParse({ items: [], nextBefore: 3 }).success).toBe(true);
    expect(TripVersionPageSchema.safeParse({ items: [] }).success).toBe(false);
  });
});

describe("RevertPreview (décision 0147 § 5.3 point 5)", () => {
  const valide = { baseVersion: 6, toVersion: 4, changes: [{ type: "removed", label: "[Musée]", before: { day: 2, time: "13:25" } }], currentHasLockedStop: true };
  it("toVersion antérieure ; jamais replaced ni segment", () => {
    expect(RevertPreviewSchema.safeParse(valide).success).toBe(true);
    expect(RevertPreviewSchema.safeParse({ ...valide, toVersion: 6 }).success).toBe(false);
    expect(RevertPreviewSchema.safeParse({ ...valide, changes: [{ type: "replaced", time: "10:00", before: "[A]", after: "[B]" }] }).success).toBe(false);
    expect(
      RevertPreviewSchema.safeParse({ ...valide, changes: [{ type: "segment", label: "[A]", before: 10, after: 20, estimated: false }] }).success,
    ).toBe(false);
    expect(RevertPreviewSchema.safeParse({ ...valide, currentHasLockedStop: undefined }).success).toBe(false);
  });
});

describe("Recherche d'un lieu à soi et demande d'ajout (décision 0147 § 3)", () => {
  it("PlaceSearchRequest : 2 à 80 caractères après retrait des espaces", () => {
    expect(PlaceSearchRequestSchema.parse({ tripId: TRIP, day: 2, query: "  Café  " }).query).toBe("Café");
    expect(PlaceSearchRequestSchema.safeParse({ tripId: TRIP, day: 2, query: " a " }).success).toBe(false);
    expect(PlaceSearchRequestSchema.safeParse({ tripId: TRIP, day: 2, query: "x".repeat(81) }).success).toBe(false);
    expect(PlaceSearchRequestSchema.safeParse({ tripId: TRIP, day: 0, query: "Café" }).success).toBe(false);
    expect(PlaceSearchRequestSchema.safeParse({ tripId: TRIP, day: 2, query: "Café", city: "Rome" }).success).toBe(false);
  });

  it("PlaceSearchResult : resultId de forme placeId, nom et adresse bornés, 5 résultats distincts au plus", () => {
    const resultat = { resultId: PLACE, name: "SENTINELLE-NOM-LIEU-M5D", address: "SENTINELLE-ADRESSE-LIEU-M5D" };
    expect(PlaceSearchResultSchema.safeParse(resultat).success).toBe(true);
    expect(PlaceSearchResultSchema.safeParse({ resultId: PLACE, name: "Nom" }).success).toBe(true);
    expect(PlaceSearchResultSchema.safeParse({ ...resultat, resultId: "place id/../x" }).success).toBe(false);
    expect(PlaceSearchResultSchema.safeParse({ ...resultat, name: "x".repeat(201) }).success).toBe(false);
    expect(PlaceSearchResultSchema.safeParse({ ...resultat, rating: 4.5 }).success).toBe(false);
    const cinq = [1, 2, 3, 4, 5].map((n) => ({ resultId: `${PLACE}${n}`, name: `Nom ${n}` }));
    expect(PlaceSearchResultsSchema.safeParse(cinq).success).toBe(true);
    expect(PlaceSearchResultsSchema.safeParse([...cinq, { resultId: `${PLACE}6`, name: "Nom 6" }]).success).toBe(false);
    expect(PlaceSearchResultsSchema.safeParse([cinq[0], cinq[0]]).success).toBe(false);
  });

  it("AddPlaceRequest : aucun champ pour un nom Google, une adresse ou la requête (critère 21) ; nom saisi en texte maison", () => {
    const demande: AddPlaceRequest = { tripId: TRIP, baseVersion: 4, day: 2, time: "14:30", kind: "activity", name: "Mon café", resultId: PLACE };
    expect(AddPlaceRequestSchema.safeParse(demande).success).toBe(true);
    for (const extra of [{ displayName: "Nom Google" }, { address: "Adresse" }, { query: "café" }, { placeId: PLACE }, { requestId: REQUETE }]) {
      expect(AddPlaceRequestSchema.safeParse({ ...demande, ...extra }).success, Object.keys(extra)[0]).toBe(false);
    }
    expect(AddPlaceRequestSchema.safeParse({ ...demande, name: "<script>" }).success).toBe(false);
    expect(AddPlaceRequestSchema.safeParse({ ...demande, name: "" }).success).toBe(false);
    expect(AddPlaceRequestSchema.safeParse({ ...demande, kind: "event" }).success).toBe(false);
    expect(AddPlaceApplySchema.safeParse({ ...demande, requestId: REQUETE }).success).toBe(true);
    expect(AddPlaceApplySchema.safeParse(demande).success).toBe(false);
  });
});

describe("RevisionPreview, variante add (décision 0147 § 14)", () => {
  const ajoutee = { id: "ajout-x", kind: "activity", name: "Mon lieu", start: "21:00", end: "22:30", facts: {}, exceptions: [], locked: true, addedBy: "person" };
  const jour = {
    index: 2,
    date: "2026-11-24",
    items: [{ type: "stop", stop: ajoutee }],
    events: [],
    generating: false,
    travelMinutes: 0,
    travelBudgetMinutes: 60,
  };
  const apercu = {
    kind: "add",
    id: "apercu-1",
    baseVersion: 4,
    days: [jour],
    changes: [{ type: "added", time: "21:00", label: "Mon lieu" }],
    changedStopIds: ["ajout-x"],
    targetStopId: "ajout-x",
  };

  it("acceptée ; l'étape visée est dans les jours ; aucune proposition", () => {
    expect(RevisionPreviewSchema.safeParse(apercu).success).toBe(true);
    expect(RevisionPreviewSchema.safeParse({ ...apercu, targetStopId: "absente" }).success).toBe(false);
    expect(RevisionPreviewSchema.safeParse({ ...apercu, proposal: ajoutee }).success).toBe(false);
  });
});

describe("types exportés de M5-C", () => {
  it("égaux aux types inférés", () => {
    expectTypeOf<StopReport>().toEqualTypeOf<z.infer<typeof StopReportSchema>>();
    expectTypeOf<TripVersionSummary>().toEqualTypeOf<z.infer<typeof TripVersionSummarySchema>>();
    expectTypeOf<AddPlaceRequest>().toEqualTypeOf<z.infer<typeof AddPlaceRequestSchema>>();
  });
});
