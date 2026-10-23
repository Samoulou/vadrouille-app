// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { Brief, TripDraft } from "@/contracts";
import { PROTOTYPE_STAY_DAYS_MAX } from "@/contracts/values";
import { briefDepuisFormulaire, niveauBudgetRepas, texteDuLogement } from "@/server/p0/depuis-formulaire";
import { validerBriefSaisi } from "@/workflows";

/**
 * Conversion du formulaire de l'app vers le brief de la chaîne inversée (spécification E2E-essai, lot 3, critère 1 ;
 * D1 ; décision 0125 § 3). Fonction pure : aucun double, aucune base, aucun réseau.
 */

const ROME = JSON.parse(readFileSync(path.join(process.cwd(), "prototype/briefs/rome-1.json"), "utf8")) as Record<string, unknown> & { recit: string };

/** Brouillon de Rome : 04 au 08.05.2027, quartier « Rione Monti (près du Colisée) », sans vol. */
const DRAFT: TripDraft = {
  destination: "Rome",
  start: "2027-05-04",
  end: "2027-05-08",
  lodging: { kind: "area", label: "Rione Monti (près du Colisée)" },
  otherCities: [],
  commitments: [],
};
const BRIEF: Brief = {
  travellers: { adults: 2, children: 0 },
  pace: "balanced",
  wishes: ["heritage", "museum", "walk", "restaurant", "tasting"],
  limits: ["nightlife"],
  mobility: ["walk", "transit"],
  mealBudgetPerPerson: 40,
  inferredFields: [],
};

describe("p0: conversion du formulaire vers le brief de l'essai (E2E-essai, lot 3)", () => {
  it("critère 1 : le brouillon de Rome donne rome-1.json, sauf les heures par défaut (09:00, 22:30) ; pays de la table", () => {
    const converti = briefDepuisFormulaire(DRAFT, BRIEF, ROME.recit);
    expect(converti).toEqual({ ok: true, brief: { ...ROME, heureArrivee: "09:00", heureDepart: "22:30" } });
    // Le pont valide la forme rendue par `BriefSchema`, sans changement.
    if (!converti.ok) throw new Error("conversion refusée");
    expect(validerBriefSaisi(converti.brief)).toEqual({ ok: true, brief: converti.brief });
  });

  it("récit absent ou blanc : pas de champ recit ; limites jamais transmises", () => {
    for (const recit of [undefined, "   "]) {
      const converti = briefDepuisFormulaire(DRAFT, BRIEF, recit);
      expect(converti.ok && "recit" in converti.brief).toBe(false);
    }
    expect(JSON.stringify(briefDepuisFormulaire(DRAFT, BRIEF, undefined))).not.toContain("nightlife");
  });

  it.each([
    ["ville absente de la table", { ...DRAFT, destination: "Atlantide" }, "draft.destination"],
    ["une autre ville", { ...DRAFT, otherCities: [{ name: "Florence", arrival: "2027-05-06" }] }, "draft.otherCities"],
    ["plus de 15 jours", { ...DRAFT, end: `2027-05-${String(4 + PROTOTYPE_STAY_DAYS_MAX).padStart(2, "0")}` }, "draft.end"],
  ] as const)("refus (%s) : son champ", (_cas, draft, champ) => {
    expect(briefDepuisFormulaire(draft as TripDraft, BRIEF, undefined)).toEqual({ ok: false, champ });
  });

  it(`${PROTOTYPE_STAY_DAYS_MAX} jours tout juste : admis`, () => {
    const end = `2027-05-${String(3 + PROTOTYPE_STAY_DAYS_MAX).padStart(2, "0")}`;
    expect(briefDepuisFormulaire({ ...DRAFT, end }, BRIEF, undefined).ok).toBe(true);
  });

  it("budget par repas : seuils de D1, absent sans budget", () => {
    expect([1, 25, 26, 60, 61, 200].map(niveauBudgetRepas)).toEqual([1, 1, 2, 2, 3, 3]);
    const sansBudget: Brief = { ...BRIEF };
    delete sansBudget.mealBudgetPerPerson;
    const converti = briefDepuisFormulaire(DRAFT, sansBudget, undefined);
    expect(converti.ok && "budgetRepas" in converti.brief).toBe(false);
  });

  it("déplacements vides : marche et transports ; rythme et voyageurs traduits", () => {
    const converti = briefDepuisFormulaire(DRAFT, { ...BRIEF, mobility: [], pace: "intense", travellers: { adults: 1, children: 2 } }, undefined);
    expect(converti.ok && converti.brief).toMatchObject({ deplacements: ["walk", "transit"], rythme: "intense", voyageurs: { adultes: 1, enfants: 2 } });
  });

  it("logement : nom saisi, quartier suivi de la destination, ou la destination", () => {
    expect(texteDuLogement({ kind: "known", label: " Hôtel Artemide " }, "Rome")).toBe("Hôtel Artemide");
    expect(texteDuLogement({ kind: "area", label: "Trastevere" }, "Rome")).toBe("Trastevere, Rome");
    expect(texteDuLogement({ kind: "none" }, "Rome")).toBe("Rome");
  });

  it("vol : heures du séjour ; réservation et billet : engagements ; le vol n'en est pas un", () => {
    const draft: TripDraft = {
      ...DRAFT,
      commitments: [
        { kind: "flight", label: "Vol aller", date: "2027-05-04", start: "11:15", end: "13:05" },
        { kind: "booking", label: "Dîner", date: "2027-05-05", start: "20:00", end: "22:00" },
        { kind: "ticket", label: "Colisée", date: "2027-05-06", start: "09:30", end: "11:30" },
      ],
    } as TripDraft;
    const converti = briefDepuisFormulaire(draft, BRIEF, undefined);
    if (!converti.ok) throw new Error("conversion refusée");
    expect(converti.brief.heureArrivee).not.toBe("09:00");
    expect(converti.brief.engagements).toEqual([
      { libelle: "Dîner", date: "2027-05-05", heure: "20:00", type: "reservation" },
      { libelle: "Colisée", date: "2027-05-06", heure: "09:30", type: "ticket" },
    ]);
  });

  it("récit avec un e-mail : refus du pont sur le champ story, sans la valeur", () => {
    const converti = briefDepuisFormulaire(DRAFT, BRIEF, "Écrivez-moi à personne@example.com pour le programme de Rome.");
    if (!converti.ok) throw new Error("conversion refusée");
    const valide = validerBriefSaisi(converti.brief);
    expect(valide).toEqual({ ok: false, champ: "story" });
    expect(JSON.stringify(valide)).not.toContain("example");
  });
});
