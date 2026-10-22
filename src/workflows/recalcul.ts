import "server-only";

import { etapeClotureLot as cloture, etapeLotDebut as debut, etapeLotPlanification as planification } from "@/server/generation/etapes-lot";
import type { EtatLot } from "@/server/generation/etat";

/**
 * Workflow 5, `batchRecompute` (spécification B10, B10b ; décisions 0119 § 1.4 et § 1.5 point 1, 0120, 0009) : le pont qui
 * **câble** les étapes de `src/server/generation/etapes-lot.ts`, sans règle métier, sur le modèle de `voyage-complet.ts`.
 * Importé par `src/workflows/index.ts` seulement (règle `ligne/creation-imports`). Étapes : `a` (jours touchés, forfait du lot),
 * puis `e` (relecture, planification des jours touchés, raisons des remplaçants, publication d'une version).
 *
 * - **État sérialisé** : `{ generationRunId, organizationId, rang }` plus, après un arrêt, le code fermé (`EtatLotSchema`) ;
 *   ni jour, ni signal, ni catégorie, ni `placeId`, ni candidat.
 * - **Fin** : une étape qui trouve la ligne déjà finie (`ready` : aucun jour touché, ou version publiée) rend son entrée
 *   inchangée ; le workflow s'arrête alors sans rien écrire.
 * - **Reprises de la file** : `maxRetries` 2 pour `a` (déterministe, sans appel), 0 pour `e` (une étape rejouée repaierait).
 * - **Arrêt** : une étape arrêtée a clos l'exécution en `failed` ; une erreur inattendue la clôt sur `upstream_unavailable`.
 */

export async function etapeLotDebut(entree: EtatLot): Promise<EtatLot> {
  "use step";
  return debut(entree);
}
etapeLotDebut.maxRetries = 2;

export async function etapeLotPlanification(entree: EtatLot): Promise<EtatLot> {
  "use step";
  return planification(entree);
}
etapeLotPlanification.maxRetries = 0;

export async function etapeClotureLot(entree: EtatLot): Promise<EtatLot> {
  "use step";
  return cloture(entree, "upstream_unavailable");
}
etapeClotureLot.maxRetries = 0;

/** Workflow 5 : la ligne `batch` créée (`queued`) par `completeDeck` ou la suite du déblocage, jusqu'à sa version publiée. */
export async function batchRecompute(entree: EtatLot): Promise<EtatLot> {
  "use workflow";
  let etat = entree;
  try {
    for (const etape of [etapeLotDebut, etapeLotPlanification]) {
      const suivant = await etape(etat);
      // Arrêt (code fermé) ou ligne déjà finie (entrée rendue inchangée) : rien de plus.
      if (suivant.arret !== undefined || suivant.rang === etat.rang) return suivant;
      etat = suivant;
    }
  } catch {
    etat = await etapeClotureLot(etat);
  }
  return etat;
}
