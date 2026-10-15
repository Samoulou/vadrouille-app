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
  demandeBornee,
  demandeDuJour,
  identifiantDuVoyage,
  joursDuSejour,
  lireClassement,
  planifierLeJour,
  TYPES_SERIE,
} from "@/server/p0/moteur-final";
import {
  briefDepuisBrief,
  candidatVersMoteur,
  engagementsDepuisBrief,
  modeDeTrajet,
  nuitsDepuisBrief,
  relecturesDepuisAncrages,
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

  it("demandeDuJour : un lieu par créneau du squelette, plus une activité pour l'idée du jour", () => {
    for (const jour of jours()) {
      const demande = demandeDuJour(jour);
      const compter = (type: string) => jour.creneaux.filter((creneau) => creneau.type === type).length;
      expect(demande).toEqual({
        activity: compter("activity") + 1,
        meal: compter("meal"),
        evening: compter("evening"),
      });
    }
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

  it("identifiantDuVoyage : proto_<destination>_<jour de quota>_1 ; jour mal formé refusé", () => {
    expect(identifiantDuVoyage("Édimbourg", "2026-10-15")).toBe("proto_edimbourg_20261015_1");
    expect(() => identifiantDuVoyage("Édimbourg", "15/10/2026")).toThrow(RangeError);
  });
});
