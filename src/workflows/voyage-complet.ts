import "server-only";

import {
  etapeClotureComplet as cloture,
  etapeCompletAncrage as ancrage,
  etapeCompletDebut as debut,
  etapeCompletLogement as logement,
  etapeCompletNotation as notation,
  etapeCompletPlanification as planification,
  etapeCompletRecherche as recherche,
} from "@/server/generation/etapes-complet";
import type { EtatComplet } from "@/server/generation/etat";
import { JOURS_VOYAGE_COMPLET_MAX } from "@/server/config/generation";

/**
 * Workflow 4, `generateFullTrip` (spécification B9, B9d ; décisions 0081 B9-TL-3, B9-TL-12 et B9-TL-13, 0087 § 1.3, 0009) :
 * le pont qui **câble** les étapes de `src/server/generation/etapes-complet.ts`, sans règle métier. Importé par
 * `src/workflows/index.ts` seulement (règle `ligne/creation-imports`). Étapes : `a` (jours du passage, forfait), `l` (contrôle
 * du logement), puis `b`, `c`, `d`, `e` pour chaque jour à planifier, jours croissants ; chaque `e` publie une version.
 *
 * - **État sérialisé** : `{ generationRunId, organizationId, rang }` plus, après un arrêt, le code fermé (`EtatCompletSchema`).
 * - **Fin** : une étape qui trouve la ligne déjà finie (`ready`, `incomplete` : dernier jour publié, ou aucun jour à planifier)
 *   rend son entrée inchangée ; le workflow s'arrête alors sans rien écrire.
 * - **Reprises de la file** : `maxRetries` 2 pour `a` (déterministe, sans appel), 0 pour les autres (une étape rejouée repaierait).
 * - **Arrêt** : une étape arrêtée a clos l'exécution en `failed` ; une erreur inattendue la clôt sur `upstream_unavailable`.
 */

export async function etapeCompletDebut(entree: EtatComplet): Promise<EtatComplet> {
  "use step";
  return debut(entree);
}
etapeCompletDebut.maxRetries = 2;

export async function etapeCompletLogement(entree: EtatComplet): Promise<EtatComplet> {
  "use step";
  return logement(entree);
}
etapeCompletLogement.maxRetries = 0;

export async function etapeCompletRecherche(entree: EtatComplet): Promise<EtatComplet> {
  "use step";
  return recherche(entree);
}
etapeCompletRecherche.maxRetries = 0;

export async function etapeCompletAncrage(entree: EtatComplet): Promise<EtatComplet> {
  "use step";
  return ancrage(entree);
}
etapeCompletAncrage.maxRetries = 0;

export async function etapeCompletNotation(entree: EtatComplet): Promise<EtatComplet> {
  "use step";
  return notation(entree);
}
etapeCompletNotation.maxRetries = 0;

export async function etapeCompletPlanification(entree: EtatComplet): Promise<EtatComplet> {
  "use step";
  return planification(entree);
}
etapeCompletPlanification.maxRetries = 0;

export async function etapeClotureComplet(entree: EtatComplet): Promise<EtatComplet> {
  "use step";
  return cloture(entree, "upstream_unavailable");
}
etapeClotureComplet.maxRetries = 0;

/** Workflow 4 : la ligne `full` réservée (`queued`) par la réconciliation ou une reprise, du début au dernier jour publié. */
export async function generateFullTrip(entree: EtatComplet): Promise<EtatComplet> {
  "use workflow";
  let etat = entree;
  try {
    const suite = [etapeCompletDebut, etapeCompletLogement];
    for (let i = 0; i < JOURS_VOYAGE_COMPLET_MAX; i += 1) suite.push(etapeCompletRecherche, etapeCompletAncrage, etapeCompletNotation, etapeCompletPlanification);
    for (const etape of suite) {
      const suivant = await etape(etat);
      // Arrêt (code fermé) ou ligne déjà finie (entrée rendue inchangée) : rien de plus.
      if (suivant.arret !== undefined || suivant.rang === etat.rang) return suivant;
      etat = suivant;
    }
  } catch {
    etat = await etapeClotureComplet(etat);
  }
  return etat;
}
