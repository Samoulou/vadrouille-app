import { describe, expect, it } from "vitest";

import { CONFIGURATION_MOTEUR } from "@/server/config/moteur";
import { squeletteAvecEngagements } from "@/domain/squelette";
import { versHeure, versMinutes } from "@/domain/temps";

import { composerCases, creneauxAttendus } from "./cases";

/**
 * Ordre des cases `noOption` (décision 0105 § 4.1) : d'abord les créneaux manquants de `creneauxAttendus`, puis les créneaux
 * de repli tirés du squelette (demi-heures de la fenêtre de chaque jour planifié), jamais de doublon `(jour, heure)` ni de
 * chevauchement d'une étape (0106 § 6.1).
 */
const squelette = squeletteAvecEngagements({
  voyage: { start: "2026-11-23", end: "2026-11-28" },
  pace: "balanced",
  nombreDeNuits: 5,
  engagements: [],
  configuration: CONFIGURATION_MOTEUR,
  budgetTrajetReduit: false,
}).filter((jour) => jour.index <= 2);

const instantaneVide = { days: [] } as never;

describe("cases : créneaux noOption", () => {
  const cases = composerCases({ instantane: instantaneVide, jours: [1, 2], lieux: new Map(), squelette, configuration: CONFIGURATION_MOTEUR });

  it("huit cases noOption quand aucun lieu n'est retenu, positions 1 à 8", () => {
    expect(cases).toHaveLength(8);
    expect(cases.every((c) => c.type === "noOption")).toBe(true);
    expect(cases.map((c) => c.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("les créneaux attendus du squelette viennent d'abord, dans leur ordre, avec leur genre", () => {
    const attendus = creneauxAttendus(squelette, CONFIGURATION_MOTEUR);
    const dedoublonnes = [...new Map(attendus.map((a) => [`${a.day}|${a.time}`, a])).values()];
    const premiers = cases.slice(0, Math.min(8, dedoublonnes.length));
    expect(premiers.map((c) => ({ day: c.day, time: c.time, kind: c.kind }))).toEqual(dedoublonnes.slice(0, premiers.length));
  });

  it("aucun doublon (jour, heure), uniquement les jours planifiés, genre activity ou meal", () => {
    expect(new Set(cases.map((c) => `${c.day}|${c.time}`)).size).toBe(8);
    expect(cases.every((c) => (c.day === 1 || c.day === 2) && (c.kind === "activity" || c.kind === "meal"))).toBe(true);
  });

  it("le repli complète quand il y a moins de huit créneaux attendus, après eux seulement", () => {
    const attendus = creneauxAttendus(squelette.slice(0, 1), CONFIGURATION_MOTEUR);
    const un = composerCases({ instantane: instantaneVide, jours: [1], lieux: new Map(), squelette: squelette.slice(0, 1), configuration: CONFIGURATION_MOTEUR });
    expect(un.length).toBeLessThanOrEqual(8);
    expect(un.slice(0, attendus.length).map((c) => c.time)).toEqual(attendus.slice(0, un.length).map((a) => a.time));
    expect(new Set(un.map((c) => c.time)).size).toBe(un.length);
  });
});

describe("cases : aucun créneau de repli ne chevauche une étape (0106 § 6.1, 0105 § 4.1)", () => {
  /** Jour dont une étape longue (sans raison, donc sans case) couvre la fenêtre sauf sa dernière heure ; un événement à la fin. */
  const jourOccupe = (index: number) => {
    const jour = squelette.find((j) => j.index === index)!;
    return {
      index,
      items: [{ type: "stop", stop: { id: `s${index}`, kind: "activity", placeId: `p${index}`, name: "Longue", start: versHeure(jour.debut), end: versHeure(jour.fin - 60), facts: [], locked: false } }],
      events: [{ id: `e${index}`, kind: "event", name: "Concert", start: versHeure(jour.fin - 30), end: versHeure(jour.fin), facts: [], locked: false }],
    };
  };
  const instantane = { days: [jourOccupe(1), jourOccupe(2)] } as never;
  const cases = composerCases({ instantane, jours: [1, 2], lieux: new Map(), squelette, configuration: CONFIGURATION_MOTEUR });

  it("aperçu: aucun créneau de repli ne chevauche une étape : aucune case noOption dans un intervalle occupé, moins de huit cases", () => {
    for (const c of cases) {
      const jour = squelette.find((j) => j.index === c.day)!;
      const instant = versMinutes(c.time);
      expect(instant >= jour.debut && instant < jour.fin - 60, `${c.day} ${c.time} dans l'étape`).toBe(false);
      expect(instant >= jour.fin - 30, `${c.day} ${c.time} dans l'événement`).toBe(false);
    }
    expect(cases.length).toBeGreaterThan(0);
    expect(cases.length).toBeLessThan(8);
    expect(cases.every((c) => c.type === "noOption")).toBe(true);
    expect(new Set(cases.map((c) => `${c.day}|${c.time}`)).size).toBe(cases.length);
  });
});
