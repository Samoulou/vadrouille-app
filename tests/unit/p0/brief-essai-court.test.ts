// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { briefPourRecherche } from "@/ai/requetes";
import { complementDepuisBrief, entreeModelesDepuisBrief } from "@/server/p0/vers-couche-ia";
import { planRoutes } from "@/grounding/budget-routes";
import { BriefSchema, NOM_BRIEF_PATTERN, RYTHMES, type Brief } from "@/prototype/brief";
import { BORNES_ESSAI, validerConfigEssai } from "@/prototype/config";
import { CONFIGURATION_MOTEUR } from "@/server/config/moteur";
import { joursDuSejour } from "@/server/p0/moteur-final";
import { briefDepuisBrief, demandeBornee, demandeDuJour, engagementsDepuisBrief, TYPES_SERIE } from "@/server/p0/vers-moteur";

/**
 * Brief court de l'essai d'intégration (ticket #355 ; question du Product Owner de 0063, amendement P0r3c-5 point 7 d) :
 * Édimbourg, deux jours, un logement. Le test refait le calcul de l'étape finale de `p0Run` (plan Routes, capacité de
 * la matrice du jour, première série) avec les fonctions qu'elle appelle, sur la configuration de l'essai.
 */

const RACINE = process.cwd();
const NOM = "edimbourg-court";
const lire = (fichier: string): unknown => JSON.parse(readFileSync(path.join(RACINE, fichier), "utf8"));
const brief = BriefSchema.parse(lire(`prototype/briefs/${NOM}.json`));
const essai = lire("prototype/config/essai.json") as { routesElements: number; routesRequetes: number; placesDetails: number; placesTextSearch: number };
const rechercheEssai = lire("prototype/config/recherche-essai.json") as { totalCandidats: number; ciblesParCreneau: Record<"activity" | "meal" | "evening", number> };

/** Plafond d'éléments Routes par essai fixé par Samuel (0053, relevé à 840 par 0088 § 13). */
const PLAFOND_ROUTES_SAMUEL = 840;

const nuitsDu = (b: Brief) => b.logements.reduce((total, logement) => total + logement.nuits, 0);

/** Première série de l'étape finale pour un brief à un logement : demande de chaque jour bornée par sa matrice. */
function premiereSerie(b: Brief) {
  const jours = joursDuSejour({
    voyage: { start: b.arrivee, end: b.depart },
    pace: briefDepuisBrief(b).pace,
    nombreDeNuits: nuitsDu(b),
    engagements: engagementsDepuisBrief(b),
    configuration: CONFIGURATION_MOTEUR,
  });
  const plan = planRoutes(jours.length, { elements: essai.routesElements, requetes: essai.routesRequetes });
  const parType = { activity: 0, meal: 0, evening: 0 };
  for (const jour of jours) {
    const demande = demandeBornee(demandeDuJour(jour, CONFIGURATION_MOTEUR), plan.n - b.logements.length);
    for (const type of TYPES_SERIE) parType[type] += demande[type];
  }
  const serie = TYPES_SERIE.reduce((somme, type) => somme + parType[type], 0);
  return { jours: jours.length, plan, serie, parType };
}

const mots = (texte: string) =>
  texte
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((mot) => mot.length > 2);

describe("p0: brief court de l'essai d'intégration (ticket 355)", () => {
  it("passe le schéma strict des briefs, nom admis", () => {
    expect(NOM_BRIEF_PATTERN.test(NOM)).toBe(true);
    expect(BriefSchema.safeParse(lire(`prototype/briefs/${NOM}.json`)).success).toBe(true);
  });

  it("Édimbourg, trois jours au plus, un seul logement, aucun engagement", () => {
    expect(brief.destination).toBe("Édimbourg");
    const { jours } = premiereSerie(brief);
    expect(jours).toBeLessThanOrEqual(3);
    expect(jours).toBe(2);
    expect(brief.logements).toHaveLength(1);
    expect(brief.engagements).toBeUndefined();
  });

  it("plan Routes tenu sous les plafonds de l'essai et sous les 840 éléments de Samuel", () => {
    const { plan } = premiereSerie(brief);
    expect(essai.routesElements).toBeLessThanOrEqual(PLAFOND_ROUTES_SAMUEL);
    expect(plan.tient).toBe(true);
    // Plafonds de l'essai alignés sur le mode réel (décision 0073) : 840 éléments (0088 § 13) et 30 requêtes, matrice de 19 lieux.
    expect(plan.n).toBe(19);
    expect(plan.elementsSansReprise).toBeLessThanOrEqual(essai.routesElements);
    expect(plan.requetesSansReprise).toBeLessThanOrEqual(essai.routesRequetes);
  });

  it("première série la plus petite parmi les séjours de 2 à 4 jours, tous rythmes : deux jours au rythme tranquille, 9 lieux", () => {
    // Un séjour d'un jour est refusé par le schéma (nuits ≥ 1 et nuits = jours).
    expect(BriefSchema.safeParse({ ...brief, depart: brief.arrivee, logements: [{ ...brief.logements[0], nuits: 0 }] }).success).toBe(false);
    const { serie } = premiereSerie(brief);
    for (const rythme of RYTHMES) {
      for (const depart of ["2026-11-24", "2026-11-25", "2026-11-26"]) {
        const nuits = (Date.parse(`${depart}T00:00:00Z`) - Date.parse(`${brief.arrivee}T00:00:00Z`)) / 86_400_000;
        const autre = BriefSchema.parse({ ...brief, rythme, depart, logements: [{ ...brief.logements[0], nuits }] });
        expect(premiereSerie(autre).serie, `${rythme} ${depart}`).toBeGreaterThanOrEqual(serie);
      }
    }
    // Ticket 483 : demande bornée par la fenêtre réelle ; départ à 16:00, pas de dîner le second jour (10 avant).
    expect(serie).toBe(9);
  });

  it("la série tient dans le budget de fiches de l'essai (formule de l'étape finale de p0Run ; plafonds de 0073)", () => {
    const { serie } = premiereSerie(brief);
    // `p0-run.ts` : budgetFiches = placesDetails − 2 × logements ; série plus grande : arrêt avant toute fiche.
    const budgetFiches = essai.placesDetails - 2 * brief.logements.length;
    expect(validerConfigEssai(lire("prototype/config/essai.json"), rechercheEssai.totalCandidats).ok).toBe(true);
    expect(essai.placesDetails).toBe(90);
    expect(essai.placesDetails).toBeLessThanOrEqual(BORNES_ESSAI.placesDetails);
    expect(serie).toBeLessThanOrEqual(budgetFiches);
    expect(budgetFiches - serie).toBe(79);
  });

  it("la série tient dans les candidats visés par la recherche de l'essai avec 3 de marge, et totalCandidats + 5 ≤ placesTextSearch", () => {
    const { serie, parType } = premiereSerie(brief);
    // Profil de recherche de l'essai inchangé par 0073 : 12 candidats visés ; contrôle de cohérence de 0102 § 5 :
    // `totalCandidats + 5 ≤ placesTextSearch`.
    expect(rechercheEssai.totalCandidats).toBe(12);
    expect(rechercheEssai.totalCandidats + 5).toBeLessThanOrEqual(essai.placesTextSearch);
    expect(serie).toBeLessThanOrEqual(rechercheEssai.totalCandidats);
    expect(rechercheEssai.totalCandidats - serie).toBe(3);
    const cibles = rechercheEssai.ciblesParCreneau;
    expect(cibles.activity + cibles.meal + cibles.evening).toBe(rechercheEssai.totalCandidats);
    // Activités et soirées prennent des candidats de type activité ; repas, des candidats de type repas.
    // Réserve par type de candidat (7 contre 6, 5 contre 3 : pas de dîner le jour du départ, ticket 483).
    expect(parType).toEqual({ activity: 6, meal: 3, evening: 0 });
    expect(cibles.activity + cibles.evening - (parType.activity + parType.evening)).toBe(1);
    expect(cibles.meal - parType.meal).toBe(2);
  });

  it("réserve Google de l'essai (fiches et Routes, méthode Q329) : 6,00 USD, celle du mode réel (0073, 0088 § 13)", () => {
    const prix = lire("prototype/config/prix-google.json") as { skus: Record<string, { prixPour1000: number }> };
    const prixDe = (sku: string) => (prix.skus[sku]?.prixPour1000 ?? Number.POSITIVE_INFINITY) / 1000;
    // Spécification P0-suite-2, P0S2-PO-12 amendé : fiches au SKU Enterprise, éléments Routes au SKU Essentials ;
    // Text Search au SKU « IDs only », sans coût.
    const reserve = essai.placesDetails * prixDe("places_details_enterprise") + essai.routesElements * prixDe("routes_matrix_essentials");
    // 90 × 0,020 + 840 × 0,005 = 1,80 + 4,20 (0053, 0088 § 13). Aucune enveloppe ne borne plus le nombre d'essais (0071).
    expect(reserve).toBeCloseTo(6, 6);
  });

  it("le modèle de la recherche ne voit pas le logement ; le récit n'en reprend aucun mot ; aucun champ personnel", () => {
    const vue = JSON.stringify(briefPourRecherche(entreeModelesDepuisBrief(brief), complementDepuisBrief(brief)));
    expect(vue).not.toContain(brief.logements[0]?.texte);
    const lieu = new Set(mots(`${brief.destination} ${brief.pays}`));
    const motsLogement = mots(brief.logements[0]?.texte ?? "").filter((mot) => !lieu.has(mot));
    expect(motsLogement.length).toBeGreaterThan(0);
    for (const mot of mots(brief.recit ?? "")) expect(motsLogement, mot).not.toContain(mot);
    expect(Object.keys(brief.voyageurs).sort()).toEqual(["adultes", "enfants"]);
  });
});
