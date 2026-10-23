// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { Brief, TripDraft } from "@/contracts";
import { PROTOTYPE_STAY_DAYS_MAX } from "@/contracts/values";
import { BriefSchema } from "@/prototype/brief";
import { briefDepuisFormulaire, niveauBudgetRepas, texteDuLogement } from "@/server/p0/depuis-formulaire";
import { validerBriefSaisi } from "@/workflows";

/**
 * Conversion du formulaire de l'app vers le brief de la chaîne inversée (spécification E2E-essai, lot 3, critère 1 ;
 * D1 ; décision 0125 § 3). Fonction pure : aucun double, aucune base, aucun réseau.
 */

const ROME = JSON.parse(readFileSync(path.join(process.cwd(), "prototype/briefs/rome-1.json"), "utf8")) as Record<string, unknown> & { recit: string };

/** Identifiant de lieu Google de forme valide (double : aucun appel). */
const P = "lieu_fictif_ville_essai_1";

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
    // Lot 5 : les catégories « à éviter » cochées (`limits`) sont recopiées dans `aEviter`.
    expect(converti).toEqual({ ok: true, brief: { ...ROME, aEviter: ["nightlife"], heureArrivee: "09:00", heureDepart: "22:30" } });
    // Le pont valide la forme rendue par `BriefSchema`, sans changement.
    if (!converti.ok) throw new Error("conversion refusée");
    expect(validerBriefSaisi(converti.brief)).toEqual({ ok: true, brief: converti.brief });
  });

  it("récit absent ou blanc : pas de champ recit", () => {
    for (const recit of [undefined, "   "]) {
      const converti = briefDepuisFormulaire(DRAFT, BRIEF, recit);
      expect(converti.ok && "recit" in converti.brief).toBe(false);
    }
  });

  it("lot 5 : « à éviter » transmis quand la personne en coche, absent sinon ; validé par BriefSchema", () => {
    const avec = briefDepuisFormulaire(DRAFT, { ...BRIEF, limits: ["nightlife", "market"] }, undefined);
    if (!avec.ok) throw new Error("conversion refusée");
    expect(avec.brief.aEviter).toEqual(["nightlife", "market"]);
    expect(validerBriefSaisi(avec.brief)).toEqual({ ok: true, brief: avec.brief });
    const sans = briefDepuisFormulaire(DRAFT, { ...BRIEF, limits: [] }, undefined);
    if (!sans.ok) throw new Error("conversion refusée");
    expect("aEviter" in sans.brief).toBe(false);
    expect(validerBriefSaisi(sans.brief)).toEqual({ ok: true, brief: sans.brief });
    // Une catégorie à la fois envie et « à éviter » (refusée en amont par `checkLimits`) est refusée par BriefSchema.
    expect(validerBriefSaisi({ ...sans.brief, aEviter: ["museum"] }).ok).toBe(false);
  });

  it.each([
    ["ville absente de la table, sans pays", { ...DRAFT, destination: "Atlantide" }, "draft.destination"],
    ["ville choisie, pays inconnu", { ...DRAFT, destination: "Atlantide", destinationRegion: { placeId: P, country: "XX", timeZone: "Europe/Paris" } }, "draft.destination"],
    ["ville choisie, fuseau hors du pays", { ...DRAFT, destination: "Hoi An", destinationRegion: { placeId: P, country: "VN", timeZone: "Europe/Paris" } }, "draft.destination"],
    ["ville choisie, fuseau inventé", { ...DRAFT, destination: "Hoi An", destinationRegion: { placeId: P, country: "US", timeZone: "America/Atlantis" } }, "draft.destination"],
    ["une autre ville", { ...DRAFT, otherCities: [{ name: "Florence", arrival: "2027-05-06" }] }, "draft.otherCities"],
    ["plus de 15 jours", { ...DRAFT, end: `2027-05-${String(4 + PROTOTYPE_STAY_DAYS_MAX).padStart(2, "0")}` }, "draft.end"],
  ] as const)("refus (%s) : son champ", (_cas, draft, champ) => {
    expect(briefDepuisFormulaire(draft as TripDraft, BRIEF, undefined)).toEqual({ ok: false, champ });
  });

  it("ville choisie hors de la table : admise, nom et fuseau de la table des pays, destination tapée, sans placeId ; validée par BriefSchema", () => {
    const hoiAn = briefDepuisFormulaire({ ...DRAFT, destination: " Hoi An ", destinationRegion: { placeId: P, country: "VN", timeZone: "Asia/Ho_Chi_Minh" } }, BRIEF, undefined);
    if (!hoiAn.ok) throw new Error("conversion refusée");
    expect(hoiAn.brief).toMatchObject({ destination: "Hoi An", pays: "Viêt Nam", fuseau: "Asia/Ho_Chi_Minh" });
    expect(validerBriefSaisi(hoiAn.brief)).toEqual({ ok: true, brief: hoiAn.brief });
    expect(JSON.stringify(hoiAn.brief)).not.toContain(P);
    // Pays à plusieurs fuseaux : le fuseau maison rendu par le serveur.
    const asheville = briefDepuisFormulaire({ ...DRAFT, destination: "Asheville", destinationRegion: { placeId: P, country: "US", timeZone: "America/New_York" } }, BRIEF, undefined);
    expect(asheville.ok && asheville.brief).toMatchObject({ pays: "États-Unis", fuseau: "America/New_York" });
  });

  it("ville choisie : le choix fait foi sur la table des villes (Valencia du Venezuela) ; sans choix, la table des villes (repli)", () => {
    const venezuela = briefDepuisFormulaire({ ...DRAFT, destination: "Valencia", destinationRegion: { placeId: P, country: "VE", timeZone: "America/Caracas" } }, BRIEF, undefined);
    expect(venezuela.ok && venezuela.brief).toMatchObject({ destination: "Valencia", pays: "Venezuela", fuseau: "America/Caracas" });
    const espagne = briefDepuisFormulaire({ ...DRAFT, destination: "Valencia" }, BRIEF, undefined);
    expect(espagne.ok && espagne.brief).toMatchObject({ destination: "Valencia", pays: "Espagne", fuseau: "Europe/Madrid" });
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

  it("lot 5 : les clés admises par la contrainte de la base (0018) sont exactement celles de BriefSchema", () => {
    const sql = readFileSync(path.join(process.cwd(), "db/migrations/0018_brief_saisi_a_eviter.sql"), "utf8");
    const liste = /ARRAY\[([^\]]+)\]/.exec(sql)?.[1];
    if (liste === undefined) throw new Error("liste de clés introuvable");
    const cles = [...liste.matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1]);
    expect(cles.sort()).toEqual(Object.keys(BriefSchema.shape).sort());
  });
});
