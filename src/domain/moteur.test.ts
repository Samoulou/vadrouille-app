// @vitest-environment node
import { describe, expect, it } from "vitest";

import { ProposalNeighboursSchema, type Day, type Stop, type TripCommitment } from "@/contracts";

import { budgetsDuVoyage, budgetTrajetDuJour, demanderReduction, reduireBudget } from "@/domain/budget-trajet";
import { budgetParPersonne, changementDeBudget, destinationColor, minutesDeTrajet, optionDeRepas, voisins } from "@/domain/calculs";
import type { ConfigurationMoteur } from "@/domain/configuration";
import { identifiantEtape } from "@/domain/identifiant";
import { INCONNU, logementsDuJour, trajetLePlusRapide, type Point, type Relectures } from "@/domain/relectures";
import { heuresDeVol, squelette } from "@/domain/squelette";

/**
 * Moteur sans IA (spécification B5a) : budget de trajet, champs calculés, voisins d'une proposition, identifiants et
 * squelette lus dans la configuration. Jeux fabriqués ici ; doubles à valeurs sentinelles.
 */

const CONFIG: ConfigurationMoteur = {
  schema: 1,
  budgetTrajetParRythme: { relaxed: 60, balanced: 90, intense: 150 },
  activitesParRythme: { relaxed: 2, balanced: 3, intense: 4 },
  tempsLibreMinParRythme: { relaxed: 120, balanced: 60, intense: 30 },
  fenetreJour: { debut: "09:00", fin: "22:30" },
  repas: { lunch: { auPlusTot: "12:00", auPlusTard: "14:00" }, dinner: { auPlusTot: "18:30", auPlusTard: "20:45" } },
  debutSoiree: "20:30",
  dureesParDefaut: { activity: 90, lunch: 75, dinner: 90, evening: 90 },
  margeMinutes: 5,
  seuilTempsLibreMinutes: 30,
};

function etape(id: string, kind: Stop["kind"], start: string, end: string, cout?: number): Stop {
  return {
    id,
    kind,
    placeId: `SENTINELLE_PLACE_${id}`,
    name: `Lieu maison ${id}`,
    start,
    end,
    facts: cout === undefined ? {} : { costPerPerson: cout },
    source: { label: "guide.example", url: "https://guide.example/x" },
    exceptions: [],
    locked: false,
  };
}

const segment: Day["items"][number] = { type: "segment", segment: { mode: "walk", minutes: 17, estimated: false } };

function jour(generating = false): Day {
  return {
    index: 2,
    date: "2026-11-24",
    items: [
      { type: "terminus", role: "start", time: "09:00", label: "Logement de test" },
      segment,
      { type: "stop", stop: etape("v1-j2-1", "activity", "09:25", "10:55", 0) },
      { type: "free", from: "10:55", to: "11:35" },
      segment,
      { type: "stop", stop: etape("v1-j2-2", "meal", "12:00", "13:15", 25) },
      segment,
      { type: "stop", stop: etape("v1-j2-3", "activity", "13:40", "15:10", 12) },
      { type: "openMeal", time: "18:30", meal: "dinner" },
      segment,
      { type: "terminus", role: "end", time: "20:50", label: "Logement de test" },
    ],
    events: [],
    generating,
    travelMinutes: 68,
    travelBudgetMinutes: 90,
  };
}

describe("moteur: budget réduit 60 → 45, 90 → 65, 150 → 110, une seule fois", () => {
  it("réduction d'un quart arrondie au multiple de 5 inférieur", () => {
    expect([60, 90, 150].map(reduireBudget)).toEqual([45, 65, 110]);
  });

  it("le budget du jour est lu dans la configuration, réduit pour tous les jours du voyage", () => {
    expect(budgetTrajetDuJour("relaxed", CONFIG, false)).toBe(60);
    expect(budgetTrajetDuJour("balanced", CONFIG, true)).toBe(65);
    expect(budgetsDuVoyage(3, "intense", CONFIG, true)).toEqual([110, 110, 110]);
    expect(budgetTrajetDuJour("relaxed", { ...CONFIG, budgetTrajetParRythme: { relaxed: 40, balanced: 90, intense: 150 } }, false)).toBe(40);
  });

  it("une seconde demande est sans effet : jamais réduit deux fois", () => {
    expect(demanderReduction(false)).toEqual({ reduit: true });
    expect(demanderReduction(true)).toBe("sans_effet");
    const premiere = demanderReduction(false);
    const reduit = premiere !== "sans_effet" && premiere.reduit;
    expect(demanderReduction(reduit)).toBe("sans_effet");
    expect(budgetTrajetDuJour("intense", CONFIG, reduit)).toBe(110);
  });

  it("le squelette applique le budget réduit à chaque jour", () => {
    const jours = squelette({
      voyage: { start: "2026-11-23", end: "2026-11-25" },
      pace: "relaxed",
      nombreDeNuits: 2,
      engagements: [],
      configuration: CONFIG,
      budgetTrajetReduit: true,
    });
    expect(jours.map((j) => j.budgetTrajet)).toEqual([45, 45, 45]);
  });
});

describe("moteur: voisins d'une proposition", () => {
  it("élément qui précède et qui suit le créneau, trajets ignorés", () => {
    expect(voisins(jour(), { time: "15:30", stopId: "v1-j2-c1" }, CONFIG)).toEqual({
      before: { type: "stop", stopId: "v1-j2-3" },
      after: { type: "meal", meal: "dinner" },
    });
    expect(voisins(jour(), { time: "11:00", stopId: "v1-j2-c1" }, CONFIG)).toEqual({
      before: { type: "free" },
      after: { type: "meal", meal: "lunch" },
    });
  });

  it("l'étape de la proposition est ignorée ; un terminus est un voisin", () => {
    expect(voisins(jour(), { time: "09:25", stopId: "v1-j2-1" }, CONFIG)).toEqual({
      before: { type: "terminus", role: "start" },
      after: { type: "free" },
    });
    expect(voisins(jour(), { time: "20:45", stopId: "v1-j2-c1" }, CONFIG)).toEqual({
      before: { type: "meal", meal: "dinner" },
      after: { type: "terminus", role: "end" },
    });
  });

  it("aucun élément d'un côté : clé absente ; jour en préparation : objet vide", () => {
    expect(voisins(jour(), { time: "08:00", stopId: "v1-j2-c1" }, CONFIG)).toEqual({ after: { type: "terminus", role: "start" } });
    expect(voisins(jour(), { time: "23:00", stopId: "v1-j2-c1" }, CONFIG)).toEqual({ before: { type: "terminus", role: "end" } });
    expect(voisins(jour(true), { time: "15:30", stopId: "v1-j2-c1" }, CONFIG)).toEqual({});
  });

  it("le résultat est accepté par ProposalNeighboursSchema", () => {
    for (const time of ["08:00", "11:00", "15:30", "23:00"]) {
      expect(ProposalNeighboursSchema.safeParse(voisins(jour(), { time, stopId: "v1-j2-c1" }, CONFIG)).success).toBe(true);
    }
  });
});

describe("moteur: champs calculés", () => {
  const relectures = (duree: (depuis: Point, vers: Point) => number | typeof INCONNU): Relectures => ({
    validite: () => "valide",
    plages: () => INCONNU,
    duree,
  });

  it("travelMinutes : somme de tous les trajets du jour, retour au logement compris ; inconnu si un trajet l'est", () => {
    // Logement → 3 étapes → logement : 4 trajets.
    expect(minutesDeTrajet(jour(), 2, relectures(() => 17), ["walk"])).toBe(4 * 17);
    expect(minutesDeTrajet(jour(), 2, relectures((_, vers) => ("logement" in vers ? INCONNU : 17)), ["walk"])).toBe(INCONNU);
  });

  it("mode le plus rapide parmi les modes admis, à égalité dans l'ordre marche, transports, voiture", () => {
    const parMode: Relectures = {
      validite: () => "valide",
      plages: () => INCONNU,
      duree: (_depuis, _vers, mode) => (mode === "walk" ? 30 : mode === "transit" ? 20 : 20),
    };
    const a: Point = { lieu: "SENTINELLE_PLACE_A" };
    const b: Point = { lieu: "SENTINELLE_PLACE_B" };
    expect(trajetLePlusRapide(parMode, a, b, ["walk", "transit", "car"])).toEqual({ mode: "transit", minutes: 20 });
    expect(trajetLePlusRapide(parMode, a, b, ["car", "walk"])).toEqual({ mode: "car", minutes: 20 });
    expect(trajetLePlusRapide(parMode, a, b, ["walk"])).toEqual({ mode: "walk", minutes: 30 });
  });

  it("logements du jour : départ et arrivée bornés aux nuits du séjour", () => {
    expect([0, 1, 2].map((j) => logementsDuJour(j, 2))).toEqual([
      { depart: 0, arrivee: 0 },
      { depart: 0, arrivee: 1 },
      { depart: 1, arrivee: 1 },
    ]);
  });

  it("budgetPerPerson : somme si tous les coûts sont connus, absent sinon ; Change[budget] seulement si l'écart est non nul", () => {
    expect(budgetParPersonne(jour())).toBe(37);
    const inconnu = { ...jour(), events: [etape("v1-j2-e1", "event", "21:00", "22:00")] };
    expect(budgetParPersonne(inconnu)).toBeUndefined();
    expect(budgetParPersonne({ items: [], events: [] })).toBeUndefined();
    expect(changementDeBudget(37, 52)).toEqual({ type: "budget", deltaPerPerson: 15 });
    expect(changementDeBudget(37, 37)).toBeUndefined();
    expect(changementDeBudget(undefined, 37)).toBeUndefined();
  });

  it("destinationColor stable ; option de repas bornée à 3", () => {
    expect(destinationColor("Lisbonne")).toBe(destinationColor("Lisbonne"));
    expect(["bruyere", "azulejo", "ocre", "granit"]).toContain(destinationColor("Porto"));
    expect(optionDeRepas(1, 5)).toEqual({ index: 1, total: 3 });
    expect(optionDeRepas(2, 2)).toEqual({ index: 2, total: 2 });
    expect(optionDeRepas(4, 5)).toBeUndefined();
    expect(optionDeRepas(0, 2)).toBeUndefined();
  });
});

describe("moteur: identifiants d'étape v<n>-j<jour>-<rang>", () => {
  it("déterministes, par genre", () => {
    expect(identifiantEtape(1, 2, "etape", 3)).toBe("v1-j2-3");
    expect(identifiantEtape(4, 1, "evenement", 2)).toBe("v4-j1-e2");
    expect(identifiantEtape(4, 1, "idee")).toBe("v4-j1-idee");
    expect(identifiantEtape(2, 3, "proposition", 1)).toBe("v2-j3-c1");
    expect(() => identifiantEtape(0, 1, "etape")).toThrow(RangeError);
    expect(() => identifiantEtape(1, 1, "etape", 1.5)).toThrow(RangeError);
  });
});

describe("moteur: squelette lu dans la configuration", () => {
  const vols: TripCommitment[] = [
    { kind: "flight", label: "Arrivée", date: "2026-11-23", start: "08:10", end: "11:40" },
    { kind: "flight", label: "Départ", date: "2026-11-25", start: "17:00" },
  ];

  it("heures de vol : arrivée par la fin du premier vol du premier jour, départ par le début du dernier vol du dernier jour", () => {
    expect(heuresDeVol({ start: "2026-11-23", end: "2026-11-25" }, vols)).toEqual({ arrivee: 700, depart: 1020 });
    expect(heuresDeVol({ start: "2026-11-23", end: "2026-11-25" }, [])).toEqual({});
  });

  it("fenêtre, créneaux et temps libre minimal viennent de la configuration", () => {
    const jours = squelette({
      voyage: { start: "2026-11-23", end: "2026-11-25" },
      pace: "balanced",
      nombreDeNuits: 2,
      engagements: vols,
      configuration: { ...CONFIG, fenetreJour: { debut: "08:30", fin: "22:00" } },
      budgetTrajetReduit: false,
    });
    expect(jours.map((j) => [j.debut, j.fin, j.complet, j.tempsLibreMin])).toEqual([
      [700, 1320, false, 0],
      [510, 1320, true, 60],
      [510, 1020, false, 0],
    ]);
    expect(jours.map((j) => [j.logementDepart, j.logementArrivee])).toEqual([
      [0, 0],
      [0, 1],
      [1, 1],
    ]);
    expect(jours.at(1)?.creneaux.map((c) => c.type)).toEqual(["activity", "activity", "meal", "activity", "meal", "evening"]);
    expect(jours.at(2)?.creneaux.some((c) => c.type === "evening")).toBe(false);
  });
});
