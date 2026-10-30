// @vitest-environment node
import { describe, expect, it } from "vitest";

import { debutDuJourUtc, etapeSignalable, situerEtapeSignalee, type JourSignalable } from "./signalement";

/** Règles pures du signalement (tâche M5c ; décision 0147 § 1 point 4 ; spécification M5 § 5, « Où »). */

const JOURS: readonly JourSignalable[] = [
  {
    items: [
      { type: "terminus" },
      { type: "stop", stop: { id: "j1-chateau", placeId: "p-chateau" } },
      { type: "segment" },
      { type: "stop", stop: { id: "j1-tattoo", placeId: "p-esplanade", commitment: "ticket" } },
    ],
    events: [],
  },
  {
    items: [
      { type: "stop", stop: { id: "j2-dean-village", placeId: "p-dean" } },
      { type: "stop", stop: { id: "ajout-1", placeId: "p-ajout", addedBy: "person" } },
      { type: "stop", stop: { id: "j2-sans-lieu" } },
    ],
    events: [{ id: "j2-concert-orgue" }],
  },
];

describe("signalement: étapes signalables", () => {
  it("une étape du programme se signale ; ni un engagement, ni un lieu à soi", () => {
    expect(etapeSignalable({ id: "a", placeId: "p" })).toBe(true);
    expect(etapeSignalable({ id: "a", commitment: "ticket" })).toBe(false);
    expect(etapeSignalable({ id: "a", addedBy: "person" })).toBe(false);
  });

  it("situe l'étape : signalable avec son placeId (ou null), non signalable (événement, engagement, lieu à soi), absente", () => {
    expect(situerEtapeSignalee(JOURS, "j2-dean-village")).toEqual({ type: "signalable", placeId: "p-dean" });
    expect(situerEtapeSignalee(JOURS, "j2-sans-lieu")).toEqual({ type: "signalable", placeId: null });
    expect(situerEtapeSignalee(JOURS, "j1-tattoo")).toEqual({ type: "non_signalable" });
    expect(situerEtapeSignalee(JOURS, "ajout-1")).toEqual({ type: "non_signalable" });
    expect(situerEtapeSignalee(JOURS, "j2-concert-orgue")).toEqual({ type: "non_signalable" });
    expect(situerEtapeSignalee(JOURS, "j9-inconnue")).toEqual({ type: "absente" });
  });

  it("jour caché (absent des jours lisibles) : absente, même pour un engagement", () => {
    expect(situerEtapeSignalee(JOURS.slice(1), "j1-tattoo")).toEqual({ type: "absente" });
  });

  it("début du jour UTC : minuit UTC, quel que soit le fuseau de l'instant écrit", () => {
    expect(debutDuJourUtc(Date.parse("2026-10-29T23:30:00Z"))).toBe(Date.parse("2026-10-29T00:00:00Z"));
    expect(debutDuJourUtc(Date.parse("2026-10-30T00:30:00+02:00"))).toBe(Date.parse("2026-10-29T00:00:00Z"));
  });
});
