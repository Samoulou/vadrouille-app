// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { classer } from "@/domain/classement";
import type { JourSquelette } from "@/domain/squelette";
import { BriefSchema } from "@/prototype/brief";
import type { CandidatNote, Notes } from "@/prototype/candidat";
import { CONFIGURATION_MOTEUR } from "@/server/config/moteur";
import {
  classementParType,
  identifiantDuVoyage,
  joursDuSejour,
  lireClassement,
  planifierLeJour,
} from "@/server/p0/moteur-final";
import {
  briefDepuisBrief,
  candidatVersMoteur,
  demandeBornee,
  demandeDuJour,
  engagementsDepuisBrief,
  modeDeTrajet,
  nuitsDepuisBrief,
  relecturesDepuisAncrages,
  TYPES_SERIE,
} from "@/server/p0/vers-moteur";

/**
 * Passage au moteur de l'étape finale de `p0Run` (`src/server/p0/moteur-final.ts`, P0r3c-5) : squelette, demande d'un
 * jour (première série), demande bornée par la matrice Routes du jour, classement par type sans coût de trajet avant
 * les fiches, planification d'un jour, identifiant du voyage. Moteur seulement, en mémoire.
 */

const RACINE = process.cwd();
const brief = BriefSchema.parse(JSON.parse(readFileSync(path.join(RACINE, "prototype/briefs/edimbourg-1.json"), "utf8")));
const CLASSEMENT = JSON.parse(readFileSync(path.join(RACINE, "prototype/config/classement.json"), "utf8")) as Record<string, unknown>;

const jours = () =>
  joursDuSejour({
    voyage: { start: brief.arrivee, end: brief.depart },
    pace: briefDepuisBrief(brief).pace,
    nombreDeNuits: 5,
    engagements: engagementsDepuisBrief(brief),
    configuration: CONFIGURATION_MOTEUR,
  });

const notes = (modifs: Partial<Notes> = {}): Notes => ({
  matchesWishes: true,
  notForMeRisk: 2,
  mustSee: false,
  slotFit: ["activity"],
  ...modifs,
});

function candidat(n: number, typeEtape: "activity" | "meal", modifs: Partial<Notes> = {}): CandidatNote {
  return {
    id: `c_00${n}`,
    nom: `Lieu maison ${n}`,
    resume: "Résumé maison.",
    categorie: typeEtape === "meal" ? "food" : "walk",
    typeEtape,
    source: {
      url: "https://guide.example/page",
      date: "2026-09-01",
      classe: "independante",
    },
    aReserver: false,
    notes: notes(modifs),
  } as CandidatNote;
}

const parametres = () => {
  const classement = lireClassement(CLASSEMENT);
  if (classement === undefined) throw new Error("classement.json invalide");
  return { classement, ageSourceMaxJours: 365, dateReference: "2026-10-15" };
};

describe("p0: passage au moteur de l'étape finale (moteur-final.ts)", () => {
  it("lireClassement : le fichier commité est valide ; un fichier mal formé est refusé (undefined)", () => {
    expect(lireClassement(CLASSEMENT)).toBeDefined();
    expect(lireClassement({ ...CLASSEMENT, schema: 2 })).toBeUndefined();
    expect(lireClassement({ ...CLASSEMENT, inconnu: 1 })).toBeUndefined();
    expect(lireClassement(null)).toBeUndefined();
  });

  it("joursDuSejour : un jour par date du séjour, logements de la nuit du jour", () => {
    const squelette = jours();
    expect(squelette.map((jour) => jour.date)).toEqual(["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28"]);
    for (const jour of squelette) expect(jour.logementDepart).toBeLessThan(5);
  });

  it("demandeDuJour : un jour complet demande un lieu par créneau du squelette, plus une activité pour l'idée du jour", () => {
    for (const jour of jours().filter((candidat) => candidat.complet)) {
      const demande = demandeDuJour(jour, CONFIGURATION_MOTEUR);
      const compter = (type: string) => jour.creneaux.filter((creneau) => creneau.type === type).length;
      expect(demande).toEqual({
        activity: compter("activity") + 1,
        meal: compter("meal"),
        evening: compter("evening"),
      });
    }
  });

  // Ticket 483 (essai rome-1 du 2026-10-18) : la demande ignorait l'heure d'arrivée et l'heure de départ.
  it("demandeDuJour : bornée par la fenêtre réelle du jour (arrivée, départ), jamais au-delà du squelette", () => {
    const rome = BriefSchema.parse(JSON.parse(readFileSync(path.join(RACINE, "prototype/briefs/rome-1.json"), "utf8")));
    const squelette = joursDuSejour({
      voyage: { start: rome.arrivee, end: rome.depart },
      pace: briefDepuisBrief(rome).pace,
      nombreDeNuits: 4,
      engagements: engagementsDepuisBrief(rome),
      configuration: CONFIGURATION_MOTEUR,
    });
    const demandes = squelette.map((jour) => demandeDuJour(jour, CONFIGURATION_MOTEUR));
    // Arrivée à 12:00 : une seule activité tient avant la fin du déjeuner (14:00), puis déjeuner, après-midi, dîner, soirée.
    expect(demandes[0]).toEqual({ activity: 3, meal: 2, evening: 1 });
    // Jours complets : tout le squelette (3 activités et l'idée, 2 repas, la soirée).
    for (const demande of demandes.slice(1, -1)) expect(demande).toEqual({ activity: 4, meal: 2, evening: 1 });
    // Départ à 16:00 : ni dîner ni soirée.
    expect(demandes.at(-1)).toEqual({ activity: 4, meal: 1, evening: 0 });

    const jour = squelette[1] as JourSquelette;
    const plein = demandeDuJour(jour, CONFIGURATION_MOTEUR);
    // Départ à 9:30 : seule l'idée du jour reste demandée.
    expect(demandeDuJour({ ...jour, fin: 9 * 60 + 30 }, CONFIGURATION_MOTEUR)).toEqual({ activity: 1, meal: 0, evening: 0 });
    // Arrivée à 19:00 : ni activité du matin ni déjeuner ; une activité 19:00-20:30, le dîner 20:30-22:00, plus de soirée.
    expect(demandeDuJour({ ...jour, debut: 19 * 60 }, CONFIGURATION_MOTEUR)).toEqual({ activity: 2, meal: 1, evening: 0 });
    for (const type of TYPES_SERIE) expect(demandeDuJour({ ...jour, debut: 15 * 60 }, CONFIGURATION_MOTEUR)[type]).toBeLessThanOrEqual(plein[type]);
  });

  it("demandeBornee : jamais au-delà de la capacité, types dans l'ordre activités, repas, soirée", () => {
    const demande = { activity: 3, meal: 2, evening: 1 };
    expect(TYPES_SERIE).toEqual(["activity", "meal", "evening"]);
    expect(demandeBornee(demande, 10)).toEqual(demande);
    expect(demandeBornee(demande, 6)).toEqual(demande);
    expect(demandeBornee(demande, 4)).toEqual({
      activity: 3,
      meal: 1,
      evening: 0,
    });
    expect(demandeBornee(demande, 0)).toEqual({
      activity: 0,
      meal: 0,
      evening: 0,
    });
    expect(demandeBornee(demande, -3)).toEqual({
      activity: 0,
      meal: 0,
      evening: 0,
    });
  });

  it("classementParType : admission comme planifierJour (slotFit et type d'étape), ordre du classement sans trajet", () => {
    const candidats = [
      candidat(1, "activity", {
        slotFit: ["activity", "evening"],
        mustSee: true,
      }),
      candidat(2, "meal", { slotFit: ["meal"] }),
      candidat(3, "activity", { slotFit: ["meal"] }),
      candidat(4, "activity", { slotFit: ["activity"], matchesWishes: false }),
      candidat(5, "meal", { slotFit: ["evening"] }),
    ].map((c) => candidatVersMoteur(c, undefined));
    const parType = classementParType(candidats, parametres());
    expect(parType.activity.map((c) => c.id)).toEqual(["c_001", "c_004"]);
    expect(parType.meal.map((c) => c.id)).toEqual(["c_002"]);
    // Un repas n'est jamais une soirée (même règle que le moteur) ; une activité peut l'être.
    expect(parType.evening.map((c) => c.id)).toEqual(["c_001"]);
    // Même ordre que `classer` avec un coût de trajet nul.
    expect(parType.activity).toEqual(
      classer(
        [candidats[0], candidats[3]].flatMap((c) => c ?? []),
        "activity",
        () => 0,
        parametres(),
      ),
    );
  });

  it("planifierLeJour : le jour donné seulement, sans candidat : aucune étape inventée", () => {
    const [jour] = jours() as [JourSquelette];
    const planifie = planifierLeJour({
      jour,
      candidats: [],
      evenements: [],
      relectures: relecturesDepuisAncrages(new Map(), nuitsDepuisBrief(brief, ["LOGEMENT_TEST"]), () => undefined),
      mode: modeDeTrajet(brief),
      parametres: parametres(),
      configuration: CONFIGURATION_MOTEUR,
      voyage: { start: brief.arrivee, end: brief.depart },
    });
    expect(planifie.squelette).toBe(jour);
    expect(planifie.etapes).toEqual([]);
    expect(planifie.idee).toBeUndefined();
  });

  it("identifiantDuVoyage : proto_<destination>_<jour de quota>_<rang dans le jour> ; jour ou rang mal formé refusé", () => {
    expect(identifiantDuVoyage("Édimbourg", "2026-10-15", 1)).toBe("proto_edimbourg_20261015_1");
    // 0071 : plusieurs exécutions le même jour de quota, identifiants distincts.
    expect(identifiantDuVoyage("Édimbourg", "2026-10-15", 2)).toBe("proto_edimbourg_20261015_2");
    expect(() => identifiantDuVoyage("Édimbourg", "15/10/2026", 1)).toThrow(RangeError);
    expect(() => identifiantDuVoyage("Édimbourg", "2026-10-15", 0)).toThrow(RangeError);
    expect(() => identifiantDuVoyage("Édimbourg", "2026-10-15", 1000)).toThrow(RangeError);
  });
});
