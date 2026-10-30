// @vitest-environment node
import { describe, expect, expectTypeOf, it } from "vitest";

import type { ConfigClassement } from "@/domain/classement";
import type { ConfigurationMoteur } from "@/domain/configuration";
import type { CandidatMoteur, EntreeMoteur, EtatChoix } from "@/domain/entrees";
import { generer } from "@/domain/generation";
import { INCONNU, memePoint, type ModeTrajet, type Plage, type Point, type Relectures } from "@/domain/relectures";
import { chargerFiches, type IssueFiche } from "@/grounding/fiches";
import { chargerTrajets, type TableTrajets } from "@/grounding/trajets";
import { versRelectures } from "@/server/relecture/relectures";

import { creerPlacesDouble, creerRoutesDouble, LAT_SENTINELLE, LNG_SENTINELLE, type LieuDouble } from "../../../tests/support/doubles-grounding";

/**
 * `versRelectures` (B8a ; spécification B8, B8-PO-6 à B8-PO-8 ; décision 0085 § 1.7) : conformité à l'interface du
 * moteur (`src/domain/relectures.ts`, inchangée), par le type et à l'exécution. Doubles à valeurs sentinelles.
 */

const DATE_LUNDI = "2026-11-23";
const POS = (i: number) => ({ lat: LAT_SENTINELLE + i / 500, lng: LNG_SENTINELLE });
const TABLE_VIDE: TableTrajets = { duree: () => undefined };

const chargee = (placeId: string, extra: Partial<Extract<IssueFiche, { issue: "chargee" }>> = {}): IssueFiche => ({
  placeId,
  issue: "chargee",
  statut: "OPERATIONAL",
  position: POS(0),
  horaires: [{ jour: 1, debut: 547, fin: 1433 }],
  ...extra,
});

describe("relectures: conformes à l'interface du moteur", () => {
  it("type : versRelectures rend exactement Relectures", () => {
    expectTypeOf(versRelectures({ usage: "lecture", fiches: [], trajets: TABLE_VIDE, logementsParNuit: [] })).toEqualTypeOf<Relectures>();
  });

  it.each(["planification", "lecture"] as const)("%s : chargee, introuvable, CLOSED_PERMANENTLY et placeId non relu", (usage) => {
    const fiches: IssueFiche[] = [chargee("P_OK"), { placeId: "P_ABSENT", issue: "introuvable" }, chargee("P_FERME", { statut: "CLOSED_PERMANENTLY" })];
    const r = versRelectures({ usage, fiches, trajets: TABLE_VIDE, logementsParNuit: [] });
    expect(r.validite("P_OK")).toBe("valide");
    expect(r.plages("P_OK", DATE_LUNDI)).toEqual([{ debut: 547, fin: 1433 }]);
    expect(r.validite("P_ABSENT")).toBe("introuvable");
    expect(r.plages("P_ABSENT", DATE_LUNDI)).toBe(INCONNU);
    expect(r.validite("P_FERME")).toBe("ferme_definitivement");
    expect(r.plages("P_FERME", DATE_LUNDI)).toBe(INCONNU);
    expect(r.validite("P_NON_RELU")).toBe(INCONNU);
    expect(r.plages("P_NON_RELU", DATE_LUNDI)).toBe(INCONNU);
  });

  it("CLOSED_TEMPORARILY : valide ; plages vides en planification, inconnues en lecture ; statut absent : valide", () => {
    const fiches = [chargee("P_TEMP", { statut: "CLOSED_TEMPORARILY" }), { placeId: "P_PARC", issue: "chargee" as const, position: POS(1), horaires: null }];
    const planification = versRelectures({ usage: "planification", fiches, trajets: TABLE_VIDE, logementsParNuit: [] });
    const lecture = versRelectures({ usage: "lecture", fiches, trajets: TABLE_VIDE, logementsParNuit: [] });
    expect(planification.validite("P_TEMP")).toBe("valide");
    expect(planification.plages("P_TEMP", DATE_LUNDI)).toEqual([]);
    expect(lecture.validite("P_TEMP")).toBe("valide");
    expect(lecture.plages("P_TEMP", DATE_LUNDI)).toBe(INCONNU);
    expect(lecture.validite("P_PARC")).toBe("valide");
  });

  it("generer : même programme avec versRelectures (doubles) qu'avec des relectures écrites à la main de mêmes valeurs", async () => {
    // Un jour, un logement, trois lieux dont un sans horaires ; repas pour remplir les créneaux du rythme.
    const PLAGE: Plage = { debut: 540, fin: 1380 };
    const ids = ["a1", "a2", "a3", "m1", "m2"];
    const lieux: Record<string, LieuDouble> = Object.fromEntries([
      ["P_LOGEMENT", { statut: "OPERATIONAL", position: POS(0), horaires: null }],
      ...ids.map((id, i): [string, LieuDouble] => [
        `P_${id.toUpperCase()}`,
        {
          statut: "OPERATIONAL",
          position: POS(i + 1),
          horaires: id === "a3" ? null : [0, 1, 2, 3, 4, 5, 6].map((jour) => ({ jour, debut: PLAGE.debut, fin: PLAGE.fin })),
        },
      ]),
    ]);
    const placeIds = Object.keys(lieux);
    const places = creerPlacesDouble({ lieux });
    const fiches = await chargerFiches(placeIds, places);
    if (!fiches.ok) throw new Error(fiches.code);
    const secondes = (de: string, vers: string, mode: string) => (mode === "walk" ? 1200 + ((de.length * 7 + vers.length * 3) % 5) * 60 : null);
    const routes = creerRoutesDouble({ secondes });
    const points = fiches.valeur.flatMap((issue) => (issue.issue === "chargee" ? [{ placeId: issue.placeId, position: issue.position }] : []));
    const trajets = await chargerTrajets(points, ["walk", "transit"], routes);
    if (!trajets.ok) throw new Error(trajets.code);
    const automatiques = versRelectures({ usage: "planification", fiches: fiches.valeur, trajets: trajets.valeur, logementsParNuit: ["P_LOGEMENT"] });

    const placeIdDe = (point: Point) => ("lieu" in point ? point.lieu : "P_LOGEMENT");
    const aLaMain: Relectures = {
      validite: (placeId) => (placeId in lieux ? "valide" : INCONNU),
      plages: (placeId) => (!(placeId in lieux) || placeId === "P_A3" || placeId === "P_LOGEMENT" ? INCONNU : [PLAGE]),
      duree(depuis: Point, vers: Point, mode: ModeTrajet) {
        if (memePoint(depuis, vers) || placeIdDe(depuis) === placeIdDe(vers)) return { minutes: 0, estimee: false };
        if (mode !== "walk") return INCONNU;
        return { minutes: Math.ceil((secondes(placeIdDe(depuis), placeIdDe(vers), mode) as number) / 60), estimee: false };
      },
    };
    const entree = (relectures: Relectures): EntreeMoteur => entreeDeTest(ids, relectures);
    const avec = generer(entree(automatiques));
    const sans = generer(entree(aLaMain));
    expect(avec.ok).toBe(true);
    expect(avec).toEqual(sans);
  });
});

describe("relectures: horaires par date", () => {
  it("plages du jour de la semaine de chaque date ; plage qui passe minuit jusqu'au lendemain (fin ≤ 2 880) ; horaires absents : inconnu", () => {
    const fiches: IssueFiche[] = [
      chargee("P_BAR", {
        horaires: [
          { jour: 1, debut: 600, fin: 1080 },
          { jour: 5, debut: 1200, fin: 1440, finLendemain: 120 },
          { jour: 6, debut: 1320, fin: 1440, finLendemain: 1440 },
        ],
      }),
      chargee("P_SANS", { horaires: null }),
    ];
    const r = versRelectures({ usage: "planification", fiches, trajets: TABLE_VIDE, logementsParNuit: [] });
    expect(r.plages("P_BAR", "2026-11-23")).toEqual([{ debut: 600, fin: 1080 }]); // lundi
    expect(r.plages("P_BAR", "2026-11-24")).toEqual([]); // mardi
    expect(r.plages("P_BAR", "2026-11-27")).toEqual([{ debut: 1200, fin: 1560 }]); // vendredi
    expect(r.plages("P_BAR", "2026-11-28")).toEqual([{ debut: 1320, fin: 2880 }]); // samedi
    expect(r.plages("P_SANS", "2026-11-23")).toBe(INCONNU);
    expect(r.plages("P_BAR", "2026-02-30")).toBe(INCONNU);
  });
});

describe("relectures: plage qui passe minuit", () => {
  it("fin = 1 440 + fermeture du lendemain, au plus 2 880", () => {
    const r = versRelectures({
      usage: "lecture",
      fiches: [chargee("P_NUIT", { horaires: [{ jour: 1, debut: 1260, fin: 1440, finLendemain: 180 }] })],
      trajets: TABLE_VIDE,
      logementsParNuit: [],
    });
    const plages = r.plages("P_NUIT", DATE_LUNDI);
    expect(plages).toEqual([{ debut: 1260, fin: 1620 }]);
  });
});

describe("relectures: durées par points du moteur", () => {
  it("logement d'une nuit par logementsParNuit ; nuit inconnue ou durée absente : inconnu", () => {
    const trajets: TableTrajets = { duree: (de, vers, mode) => (de === "P_LOG" && vers === "P_A" && mode === "walk" ? { minutes: 15, estimee: true } : undefined) };
    const r = versRelectures({ usage: "planification", fiches: [], trajets, logementsParNuit: ["P_LOG"] });
    expect(r.duree({ logement: 0 }, { lieu: "P_A" }, "walk")).toEqual({ minutes: 15, estimee: true });
    expect(r.duree({ logement: 1 }, { lieu: "P_A" }, "walk")).toBe(INCONNU);
    expect(r.duree({ logement: 0 }, { lieu: "P_A" }, "car")).toBe(INCONNU);
  });
});

// --- Entrée de test du moteur (modèle : src/domain/generation.test.ts) ------------------------------------------

const CONFIG: ConfigurationMoteur = {
  schema: 1,
  budgetTrajetParRythme: { relaxed: 120, balanced: 150, intense: 200 },
  activitesParRythme: { relaxed: 2, balanced: 3, intense: 4 },
  tempsLibreMinParRythme: { relaxed: 60, balanced: 60, intense: 30 },
  fenetreJour: { debut: "09:00", fin: "23:00" },
  repas: { lunch: { auPlusTot: "12:00", auPlusTard: "14:00" }, dinner: { auPlusTot: "18:30", auPlusTard: "20:45" } },
  debutSoiree: "20:30",
  dureesParDefaut: { activity: 90, lunch: 75, dinner: 90, evening: 90 },
  margeMinutes: 5,
  seuilTempsLibreMinutes: 30,
  changementDeVille: {
    activitesParRythme: { relaxed: 1, balanced: 2, intense: 2 },
    departEstime: { heureParDefaut: "10:00", limite: "18:00", arrondiMinutes: 15 },
    creneauSansDureeMinutes: 180,
    dureeEstimeeMinutes: { min: 20, max: 600 },
    margesMinutes: { avantDepart: { ticket: 45, flight: 120, estimated: 30 }, apresArrivee: { ticket: 30, flight: 60, estimated: 30 } },
    long: { seuilMinutes: 240, activitesMax: 1 },
  },
};

const FORMULE: ConfigClassement = {
  schema: 1,
  poids: { matchesWishes: 30, mustSee: 25, notForMeRisk: 4, source: { officielle: 4, independante: 6, generique: -8 }, sourceAncienne: 6 },
  matchesWishesNon: "penaliser",
  penaliteHorsEnvies: 20,
  prioriteMustSee: "avant",
  coutTrajetParMinute: { activity: 0.1, meal: 1, evening: 1, surprise: 2 },
};

function candidat(id: string): CandidatMoteur {
  const repas = id.startsWith("m");
  return {
    id,
    nom: `Lieu maison ${id}`,
    resume: `Résumé maison ${id}.`,
    categorie: repas ? "restaurant" : "museum",
    typeEtape: repas ? "meal" : "activity",
    faits: { costPerPerson: 10 },
    sources: [{ url: `https://guide.example/${id}`, date: "2026-10-01", classe: "independante" }],
    notes: { matchesWishes: true, notForMeRisk: 1, mustSee: false, slotFit: repas ? ["meal"] : ["activity"] },
    placeId: `P_${id.toUpperCase()}`,
    aReserver: false,
  };
}

function entreeDeTest(ids: readonly string[], relectures: Relectures): EntreeMoteur {
  const candidats = ids.map(candidat);
  return {
    voyage: { destination: "Ville-de-test", start: "2026-11-23", end: "2026-11-24", timeZone: "Europe/London", travellers: { adults: 2, children: 0 } },
    brief: { travellers: { adults: 2, children: 0 }, pace: "relaxed", wishes: ["museum"], limits: [], mobility: ["walk", "transit"], inferredFields: [] },
    nuits: [{ etiquette: "Logement de test", placeId: "P_LOGEMENT" }],
    engagements: [],
    candidats,
    evenements: [],
    idees: [],
    choix: new Map<string, EtatChoix>(candidats.filter((c) => c.typeEtape === "meal").map((c) => [c.id, "choisi"])),
    configuration: CONFIG,
    classement: { formule: FORMULE, ageSourceMaxJours: 365 },
    relectures,
    dateReference: "2026-10-13",
    version: 1,
    budgetTrajetReduit: false,
  };
}

describe("relectures: le lendemain d'une plage qui passe minuit (B8-PO-17)", () => {
  const VENDREDI = "2026-11-27";
  const SAMEDI = "2026-11-28";
  const DIMANCHE = "2026-11-29";

  it("vendredi 22 h – 2 h : 1 320 à 1 560 le vendredi, rien le samedi (la fin du lendemain est portée par la plage de la veille)", () => {
    const r = versRelectures({
      usage: "lecture",
      fiches: [chargee("P_BAR", { horaires: [{ jour: 5, debut: 1320, fin: 1440, finLendemain: 120 }] })],
      trajets: TABLE_VIDE,
      logementsParNuit: [],
    });
    expect(r.plages("P_BAR", VENDREDI)).toEqual([{ debut: 1320, fin: 1560 }]);
    expect(r.plages("P_BAR", SAMEDI)).toEqual([]);
  });

  it("plage qui traverse deux minuits : coupée à 1 440, rien le samedi ni le dimanche", () => {
    const r = versRelectures({ usage: "lecture", fiches: [chargee("P_BAR", { horaires: [{ jour: 5, debut: 1320, fin: 1440 }] })], trajets: TABLE_VIDE, logementsParNuit: [] });
    expect(r.plages("P_BAR", VENDREDI)).toEqual([{ debut: 1320, fin: 1440 }]);
    expect(r.plages("P_BAR", SAMEDI)).toEqual([]);
    expect(r.plages("P_BAR", DIMANCHE)).toEqual([]);
  });
});
