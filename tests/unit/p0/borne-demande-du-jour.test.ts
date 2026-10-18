// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { slugDestination } from "@/domain/identifiant";
import type { JourPlanifie } from "@/domain/planification";
import { INCONNU, type Relectures } from "@/domain/relectures";
import { BriefSchema } from "@/prototype/brief";
import type { CandidatNote, Notes } from "@/prototype/candidat";
import { CONFIGURATION_MOTEUR } from "@/server/config/moteur";
import type { ConfigurationMoteur } from "@/domain/configuration";
import { joursDuSejour, lireClassement } from "@/server/p0/moteur-final";
import { briefDepuisBrief, candidatVersMoteur, demandeDuJour, engagementsDepuisBrief, modeDeTrajet, TYPES_SERIE } from "@/server/p0/vers-moteur";

import { charger, executerCapture } from "./harnais";

/**
 * Garde de la borne `demandeDuJour` (décision 0088 § 5, ticket 483) : la demande d'un jour n'est une borne haute de ce que
 * planifie le moteur que tant qu'elle suit les règles de `planifierJour`. Pour chaque jour planifié, le nombre d'étapes
 * de chaque type (l'idée du jour comptée comme une activité) reste au plus `demandeDuJour` de ce jour :
 * - pour chaque brief de `prototype/briefs/` qui a des fixtures, en mode simulé (orchestrateur de `pnpm p0`) ;
 * - pour rome-1 (sans fixtures), par le moteur seul, avec une réserve abondante de chaque type.
 * Une évolution de `planifierJour` qui casse ce test oblige à changer `demandeDuJour` dans la même PR.
 */

const capture = vi.hoisted(() => ({ planifies: [] as JourPlanifie[][] }));

vi.mock("@/domain/planification", async (original) => {
  const reel = await original<typeof import("@/domain/planification")>();
  return {
    ...reel,
    planifier: (...args: Parameters<typeof reel.planifier>) => {
      const resultat = reel.planifier(...args);
      capture.planifies.push(resultat);
      return resultat;
    },
  };
});

const RACINE = process.cwd();
const lire = (fichier: string): unknown => JSON.parse(readFileSync(path.join(RACINE, fichier), "utf8"));
const NOMS_BRIEFS = readdirSync(path.join(RACINE, "prototype/briefs"))
  .filter((nom) => nom.endsWith(".json"))
  .map((nom) => nom.slice(0, -".json".length))
  .sort();
const briefDe = (nom: string) => BriefSchema.parse(lire(`prototype/briefs/${nom}.json`));
const aDesFixtures = (nom: string) => existsSync(path.join(RACINE, "prototype/fixtures/places", `${slugDestination(briefDe(nom).destination)}.json`));

/** Étapes planifiées du jour par type ; l'idée « Surprends-moi » compte comme une activité (`demandeDuJour`). */
function planifiesParType(jour: JourPlanifie): Record<(typeof TYPES_SERIE)[number], number> {
  const compte = { activity: jour.idee === undefined ? 0 : 1, meal: 0, evening: 0 };
  for (const etape of jour.etapes) compte[etape.creneau] += 1;
  return compte;
}

/** Vérifie la borne sur chaque jour ; rend le nombre total d'étapes planifiées (garde contre un test vide). */
function verifierBorne(jours: readonly JourPlanifie[], configuration: ConfigurationMoteur, contexte: string): number {
  let total = 0;
  for (const [rang, jour] of jours.entries()) {
    const demande = demandeDuJour(jour.squelette, configuration);
    const planifie = planifiesParType(jour);
    for (const type of TYPES_SERIE) {
      expect(planifie[type], `${contexte}, jour ${rang + 1}, ${type}`).toBeLessThanOrEqual(demande[type]);
      total += planifie[type];
    }
  }
  return total;
}

describe("p0: demandeDuJour borne ce que planifie le moteur (décision 0088 § 5)", () => {
  it("chaque brief commité est couvert : en mode simulé s'il a des fixtures, sinon rome-1 par le moteur seul", () => {
    expect(NOMS_BRIEFS.filter((nom) => !aDesFixtures(nom))).toEqual(["rome-1"]);
    expect(NOMS_BRIEFS.filter(aDesFixtures).length).toBeGreaterThanOrEqual(4);
  });

  for (const nomBrief of NOMS_BRIEFS.filter(aDesFixtures)) {
    it(`${nomBrief}, mode simulé : par jour et par type, étapes planifiées ≤ demandeDuJour`, async () => {
      capture.planifies.length = 0;
      const { resultat } = await executerCapture({ nomBrief });
      expect(resultat.rapport.statut).toBe("complete");
      expect(capture.planifies).toHaveLength(1);
      const [jours = []] = capture.planifies;
      expect(jours.length).toBeGreaterThan(0);
      expect(verifierBorne(jours, charger(nomBrief).configuration.moteur, nomBrief)).toBeGreaterThan(0);
    });
  }

  it("rome-1 (cas du test de moteur-final), moteur seul, réserve abondante : par jour et par type, étapes ≤ demandeDuJour", async () => {
    const { planifier } = await import("@/domain/planification");
    const rome = briefDe("rome-1");
    const squelette = joursDuSejour({
      voyage: { start: rome.arrivee, end: rome.depart },
      pace: briefDepuisBrief(rome).pace,
      nombreDeNuits: 4,
      engagements: engagementsDepuisBrief(rome),
      configuration: CONFIGURATION_MOTEUR,
    });
    const notes = (slotFit: Notes["slotFit"]): Notes => ({ matchesWishes: true, notForMeRisk: 1, mustSee: false, slotFit });
    // Réserve plus grande que toute demande : 40 activités (activité ou soirée) et 20 repas, horaires inconnus.
    const candidat = (n: number, typeEtape: "activity" | "meal"): CandidatNote =>
      ({
        id: `c_${String(n).padStart(3, "0")}`,
        nom: `Lieu maison ${n}`,
        resume: "Résumé maison.",
        categorie: typeEtape === "meal" ? "food" : "walk",
        typeEtape,
        source: { url: "https://guide.example/page", date: "2026-09-01", classe: "independante" },
        aReserver: false,
        notes: notes(typeEtape === "meal" ? ["meal"] : ["activity", "evening"]),
      }) as CandidatNote;
    const candidats = [
      ...Array.from({ length: 40 }, (_, k) => candidat(k + 1, "activity")),
      ...Array.from({ length: 20 }, (_, k) => candidat(k + 41, "meal")),
    ].map((c) => ({ ...candidatVersMoteur(c, undefined), placeId: `LIEU_${c.id}` }));
    // Trajets courts et connus partout, aucun horaire : la fenêtre du jour et les durées seules limitent le moteur.
    const relectures: Relectures = {
      validite: () => "valide",
      plages: () => INCONNU,
      duree: () => ({ minutes: 5, estimee: false }),
    };
    const classement = lireClassement(lire("prototype/config/classement.json"));
    if (classement === undefined) throw new Error("classement.json invalide");
    const jours = planifier({
      jours: squelette,
      candidats,
      evenements: [],
      relectures,
      mode: modeDeTrajet(rome),
      parametres: { classement, ageSourceMaxJours: 365, dateReference: "2026-10-15" },
      configuration: CONFIGURATION_MOTEUR,
      voyage: { start: rome.arrivee, end: rome.depart },
    });
    expect(jours).toHaveLength(squelette.length);
    expect(verifierBorne(jours, CONFIGURATION_MOTEUR, "rome-1")).toBeGreaterThan(0);
  });
});
