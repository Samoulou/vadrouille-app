// @vitest-environment node
import { describe, expect, it } from "vitest";

import { TRANSFER_ESTIMATED_MINUTES_MAX } from "@/contracts/values";
import { joursHorsChangement } from "@/domain/apercu";
import {
  changementsDuVoyage,
  creneauOccupe,
  departEstime,
  dureeEstimeeAdmise,
  elementDuChangement,
  engagementDuChangement,
  themeDuChangement,
  villeDeLEngagement,
  villesDuVoyage,
  type EngagementLu,
} from "@/domain/changement-de-ville";
import { ConfigurationMoteurSchema } from "@/domain/configuration";
import { villesDeLaDate, villesDesSejours } from "@/domain/villes-du-voyage";
import { DUREE_ESTIMEE_MINUTES } from "@/ai/sorties";
import { controlerVilles, memeVilleQueLaPrecedente } from "@/lib/fuseaux";
import { CONFIGURATION_MOTEUR } from "@/server/config/moteur";

/**
 * Règles du changement de ville (M4b, ticket #928 ; décision 0148 § 2, § 4, § 5, § 6, § 10 ; décision 0151 § 1 point 5,
 * § 5 et § 6) : module pur `src/domain/changement-de-ville.ts`, `villes-du-voyage.ts`, `joursHorsChangement`, contrôle des
 * villes et section `changementDeVille` de `moteur.json`.
 */

const C = CONFIGURATION_MOTEUR;
const JOUR = "2027-05-07";
const sortie = (start: string, end?: string): EngagementLu => ({ kind: "booking", date: JOUR, start, ...(end === undefined ? {} : { end }) });

describe("configuration: changementDeVille (moteur.json, M4b)", () => {
  it("valeurs posées par M4b : départ 10:00 au plus tôt, créneau sans durée 180, durée 20 à 600, 1/2/2 activités, seuil 30", () => {
    expect(C.changementDeVille).toEqual({
      activitesParRythme: { relaxed: 1, balanced: 2, intense: 2 },
      departEstime: { heureParDefaut: "10:00", limite: "18:00" },
      creneauSansDureeMinutes: 180,
      dureeEstimeeMinutes: { min: 20, max: 600 },
    });
    expect(C.seuilTempsLibreMinutes).toBe(30);
  });

  it("borne de la durée estimée : jamais au-delà du contrat (décision 0151 § 1 point 5), égale à la lecture de src/ai", () => {
    expect(C.changementDeVille.dureeEstimeeMinutes.max).toBeLessThanOrEqual(TRANSFER_ESTIMATED_MINUTES_MAX);
    expect(C.changementDeVille.dureeEstimeeMinutes).toEqual(DUREE_ESTIMEE_MINUTES);
    const avec = (dureeEstimeeMinutes: unknown) => ConfigurationMoteurSchema.safeParse({ ...C, changementDeVille: { ...C.changementDeVille, dureeEstimeeMinutes } }).success;
    expect(avec({ min: 20, max: TRANSFER_ESTIMATED_MINUTES_MAX + 5 })).toBe(false);
    expect(avec({ min: 600, max: 20 })).toBe(false);
    expect(avec({ min: 21, max: 600 })).toBe(false);
  });

  it("le départ par défaut est dans la fenêtre du jour, la limite plus le créneau sans durée aussi", () => {
    const avec = (departEstime: unknown) => ConfigurationMoteurSchema.safeParse({ ...C, changementDeVille: { ...C.changementDeVille, departEstime } }).success;
    expect(avec({ heureParDefaut: "08:00", limite: "18:00" })).toBe(false);
    expect(avec({ heureParDefaut: "10:00", limite: "21:00" })).toBe(false);
    expect(avec({ heureParDefaut: "10:00", limite: "18:00" })).toBe(true);
  });
});

describe("changement de ville: départ (0148 § 5.2 ; spécification M4 § 3.3)", () => {
  it("changement de ville: départ estimé, sortie du matin et dîner du soir", () => {
    const engagements = [sortie("09:30", "11:30"), sortie("19:30", "21:00")];
    expect(departEstime(engagements, JOUR, C)).toBe("11:30");
  });

  it("changement de ville: départ estimé, sortie sans fin", () => {
    // Sortie à 10:00 sans fin, hors des fenêtres de repas : durée d'une activité (90 minutes).
    expect(departEstime([sortie("10:00")], JOUR, C)).toBe("11:30");
  });

  it("sans engagement ce jour-là : 10:00 ; jamais sous 10:00 ; une fin au-delà de 18:00 est ignorée", () => {
    expect(departEstime([], JOUR, C)).toBe("10:00");
    expect(departEstime([sortie("08:00", "09:00")], JOUR, C)).toBe("10:00");
    expect(departEstime([sortie("17:00", "19:00")], JOUR, C)).toBe("10:00");
    expect(departEstime([{ ...sortie("09:00", "15:00"), date: "2027-05-08" }], JOUR, C)).toBe("10:00");
  });

  it("détection du départ saisi sans configuration (décision 0151 § 6) : premier billet ou vol, par heure puis saisie", () => {
    // La signature ne prend aucune configuration : l'écran 1 l'appelle côté client.
    expect(engagementDuChangement.length).toBe(2);
    const engagements = [
      { kind: "booking" as const, date: JOUR, start: "08:00" },
      { kind: "ticket" as const, date: JOUR, start: "14:00" },
      { kind: "flight" as const, date: JOUR, start: "09:15" },
      { kind: "ticket" as const, date: JOUR, start: "09:15" },
    ];
    expect(engagementDuChangement(engagements, JOUR)).toBe(2);
    expect(engagementDuChangement(engagements, "2027-05-08")).toBeUndefined();
    expect(engagementDuChangement([{ kind: "booking", date: JOUR, start: "08:00" }], JOUR)).toBeUndefined();
  });

  it("changements du voyage : départ saisi (billet), sinon estimé avec le mode ; activités par rythme", () => {
    const villes = villesDuVoyage("Rome", [{ nom: "Florence", arrivee: "2027-05-07" }, { nom: "Venise", arrivee: "2027-05-09" }], { start: "2027-05-04", end: "2027-05-11" });
    expect(villes).toEqual([
      { nom: "Rome", arrivee: "2027-05-04", nuits: 3 },
      { nom: "Florence", arrivee: "2027-05-07", nuits: 2 },
      { nom: "Venise", arrivee: "2027-05-09", nuits: 2 },
    ]);
    const engagements: EngagementLu[] = [{ kind: "ticket", date: "2027-05-07", start: "10:12", end: "11:50" }, sortie("09:00", "12:00")];
    const changements = changementsDuVoyage(villes, engagements, { pace: "relaxed", deplacements: ["walk", "transit"] }, C);
    expect(changements).toEqual([
      { date: "2027-05-07", de: "Rome", vers: "Florence", source: "entered", depart: "10:12", arrivee: "11:50", activitesMax: 1, engagement: 0 },
      { date: "2027-05-09", de: "Florence", vers: "Venise", source: "estimated", depart: "10:00", mode: "transit", activitesMax: 1 },
    ]);
    expect(changementsDuVoyage(villes, [], { pace: "intense", deplacements: ["walk"] }, C).map((c) => [c.mode, c.activitesMax])).toEqual([
      [undefined, 2],
      [undefined, 2],
    ]);
    expect(themeDuChangement(changements[0] ?? { de: "", vers: "" })).toBe("De Rome à Florence");
  });

  it("changement de ville: l'engagement devenu transfer n'est pas un événement (ville de l'engagement par l'heure)", () => {
    const changement = { depart: "14:00" };
    expect(villeDeLEngagement(sortie("10:00", "12:00"), changement, C)).toBe("de");
    expect(villeDeLEngagement(sortie("13:00", "15:00"), changement, C)).toBe("vers");
    expect(villeDeLEngagement(sortie("19:00"), changement, C)).toBe("vers");
  });
});

describe("changement de ville: créneau occupé et durée estimée (0148 § 2 et § 5.3)", () => {
  it("billet avec fin, billet sans fin, estimé avec et sans durée", () => {
    expect(creneauOccupe({ source: "entered", start: "10:00", end: "12:30" }, C)).toEqual({ debut: 600, fin: 750 });
    expect(creneauOccupe({ source: "entered", start: "10:00" }, C)).toEqual({ debut: 600, fin: 600 });
    expect(creneauOccupe({ source: "estimated", start: "11:30", estimatedMinutes: 120 }, C)).toEqual({ debut: 690, fin: 810 });
    expect(creneauOccupe({ source: "estimated", start: "11:30" }, C)).toEqual({ debut: 690, fin: 690 + 180 });
  });

  it("changement de ville: durée estimée longue bornée à la fin du jour", () => {
    expect(creneauOccupe({ source: "estimated", start: "18:00", estimatedMinutes: 600 }, C)).toEqual({ debut: 1080, fin: 1350 });
  });

  it("changement de ville: durée estimée hors bornes → durée à confirmer", () => {
    for (const valeur of [19, 601, 120.5, Number.NaN, "120", undefined, -5]) expect(dureeEstimeeAdmise(valeur, C)).toBeUndefined();
    expect(dureeEstimeeAdmise(20, C)).toBe(20);
    expect(dureeEstimeeAdmise(122, C)).toBe(120);
    expect(dureeEstimeeAdmise(123, C)).toBe(125);
    expect(dureeEstimeeAdmise(600, C)).toBe(600);
    const changement = { date: JOUR, de: "Rome", vers: "Florence", source: "estimated" as const, depart: "10:00", activitesMax: 2 };
    expect(elementDuChangement(changement, undefined, dureeEstimeeAdmise(900, C))).toEqual({ type: "transfer", from: "Rome", to: "Florence", source: "estimated", start: "10:00" });
  });

  it("élément saisi : libellé de la personne, ni durée ni mode", () => {
    const changement = { date: JOUR, de: "Rome", vers: "Florence", source: "entered" as const, depart: "10:12", arrivee: "11:50", activitesMax: 2, engagement: 0 };
    expect(elementDuChangement(changement, "Train Rome–Florence", 120)).toEqual({
      type: "transfer",
      from: "Rome",
      to: "Florence",
      source: "entered",
      start: "10:12",
      end: "11:50",
      label: "Train Rome–Florence",
    });
  });
});

describe("villes: ville d'un jour et Trip.cities (0148 § 6)", () => {
  const cities = [
    { name: "Rome", start: "2027-05-04", end: "2027-05-07" },
    { name: "Florence", start: "2027-05-07", end: "2027-05-09" },
  ];

  it("jour ordinaire, jour de changement, jour du départ (dernière ville), hors du voyage", () => {
    expect(villesDeLaDate(cities, "2027-05-05")).toEqual({ ville: "Rome" });
    expect(villesDeLaDate(cities, "2027-05-07")).toEqual({ de: "Rome", vers: "Florence" });
    expect(villesDeLaDate(cities, "2027-05-08")).toEqual({ ville: "Florence" });
    expect(villesDeLaDate(cities, "2027-05-09")).toEqual({ ville: "Florence" });
    expect(villesDeLaDate(cities, "2027-05-03")).toBeUndefined();
    expect(villesDeLaDate(cities, "2027-05-10")).toBeUndefined();
  });

  it("plusieurs-villes: Trip.cities absent pour une ville ; deux villes depuis les séjours, dans l'ordre", () => {
    expect(villesDesSejours([{ ville: "Rome", from: "2027-05-04", to: "2027-05-09" }])).toBeUndefined();
    expect(
      villesDesSejours([
        { ville: "Florence", from: "2027-05-07", to: "2027-05-09" },
        { ville: "Rome", from: "2027-05-04", to: "2027-05-07" },
      ]),
    ).toEqual(cities);
    expect(villesDesSejours([{ ville: null, from: "2027-05-04", to: "2027-05-07" }, { ville: "Florence", from: "2027-05-07", to: "2027-05-09" }])).toBeUndefined();
    expect(villesDesSejours([{ ville: "Rome", from: "2027-05-04", to: "2027-05-06" }, { ville: "Florence", from: "2027-05-07", to: "2027-05-09" }])).toBeUndefined();
  });
});

describe("aperçu et villes (0148 § 4 et § 10.1)", () => {
  const ligne = (type: string) => ({ type });

  it("aperçu: joursHorsChangement ne retire jamais J1", () => {
    const jours = [
      { index: 1, items: [ligne("terminus"), ligne("transfer")] },
      { index: 2, items: [ligne("stop"), ligne("transfer")] },
      { index: 3, items: [ligne("stop")] },
    ];
    expect(joursHorsChangement(jours).map((jour) => jour.index)).toEqual([1, 3]);
  });

  it("villes: même ville de suite refusée avant le décalage", () => {
    expect(memeVilleQueLaPrecedente(["Rome", "Florence", "Rome"])).toBeUndefined();
    expect(memeVilleQueLaPrecedente(["Rome", "rome"])).toBe(1);
    expect(controlerVilles(["Rome", "Florence", "Florence"], "2027-05-04", "2027-05-11")).toEqual({ ok: false, indice: 2, raison: "repetee" });
    // Ville inconnue d'abord ; même ville de suite avant un décalage différent.
    expect(controlerVilles(["Rome", "Rome", "Ville-Inconnue-M4b"], "2027-05-04", "2027-05-11")).toMatchObject({ ok: false, raison: "inconnue" });
    expect(controlerVilles(["Rome", "Florence", "Florence", "Athènes"], "2027-05-04", "2027-05-11")).toEqual({ ok: false, indice: 2, raison: "repetee" });
    expect(controlerVilles(["Rome", "Athènes"], "2027-05-04", "2027-05-11")).toMatchObject({ ok: false, indice: 1, raison: "decalage" });
    expect(controlerVilles(["Rome", "Florence"], "2027-05-04", "2027-05-11")).toMatchObject({ ok: true });
  });
});
