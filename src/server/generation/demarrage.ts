import "server-only";

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
