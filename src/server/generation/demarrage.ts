import "server-only";

import type { DemarrerRecalcul } from "./lot";
import type { DemarrerVoyageComplet } from "./reconciliation";

/**
 * Démarrage réel du workflow 4 (`generateFullTrip`, B9d) par l'interface des workflows : import dynamique, comme
 * `demarrerApercuReel` de `src/server/creation/demarrage.ts` (le SDK n'est chargé qu'au démarrage d'une exécution). Un refus ou
 * une erreur de démarrage rend `null` : la ligne reste `queued` sans identifiant et la réconciliation la réclame de nouveau.
 * Partagé par la suite du paiement (`src/server/payment/`) et les cas d'usage de la création.
 */
export const demarrerVoyageCompletReel: DemarrerVoyageComplet = async (generationRunId, organizationId) => {
  const { demarrerVoyageComplet } = await import("@/workflows");
  const issue = await demarrerVoyageComplet(generationRunId, organizationId);
  return issue.ok ? issue.workflowRunId : null;
};

/** Double sans appel du workflow 4 : ne démarre rien (la ligne reste `queued` sans identifiant). */
export const demarrerVoyageCompletSansAppel: DemarrerVoyageComplet = async () => null;

/**
 * Démarrage réel du workflow 5 (`batchRecompute`, B10b ; décision 0119 § 1.5 point 1) par l'interface des workflows, même forme
 * que `demarrerVoyageCompletReel`. Appelé **après** la validation de la transaction qui a créé la ligne `batch` (0119 § 1.3
 * point 2). Un refus ou une erreur de démarrage rend `null` : l'appelant clôt aussitôt la ligne en `failed` (§ 1.3 point 5).
 */
export const demarrerRecalculReel: DemarrerRecalcul = async (generationRunId, organizationId) => {
  const { demarrerRecalcul } = await import("@/workflows");
  const issue = await demarrerRecalcul(generationRunId, organizationId);
  return issue.ok ? issue.workflowRunId : null;
};

/** Double sans appel du workflow 5 : ne démarre rien (la ligne est close aussitôt en `failed` par l'appelant). */
export const demarrerRecalculSansAppel: DemarrerRecalcul = async () => null;
