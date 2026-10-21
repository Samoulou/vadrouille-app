import "server-only";

import { demarrerVoyageCompletReel } from "@/server/generation/demarrage";
import type { DemarrerVoyageComplet } from "@/server/generation/reconciliation";
import { reconcilierVoyageComplet } from "@/server/generation/reconciliation";
import { executeurSql } from "@/server/with-org";
import { withSystemOrg } from "@/server/with-system-org";
import type { OrgTransaction } from "@/server/with-org";

import type { SuiteVoyageDebloque } from "./suite";

/**
 * Suite « voyage débloqué » de B9d (spécification B9, B9d point 1 ; décisions 0081 B9-TL-12 points 1 à 3 et 0097 B4-TL-12) :
 * remplace la suite sans effet de B4a dans les dépendances par défaut du webhook. Elle appelle la réconciliation du voyage
 * complet dans le **contexte système** de l'organisation du droit (`withSystemOrg`, aucun `userId`), sans étouffement : la
 * ligne `full` est créée une fois par droit (index unique partiel), puis `generateFullTrip` est démarré. Un démarrage qui ne
 * rend pas d'identifiant lève, pour que `lancerSuite` fasse ses relances (démarrages sans appel payant) ; le droit n'est jamais
 * retiré (B4-PO-15) et la réconciliation des lectures d'état reprend une ligne restée `queued`.
 */

export type DependancesSuite = {
  readonly transaction?: <T>(organizationId: string, fn: (tx: OrgTransaction) => Promise<T>) => Promise<T>;
  readonly demarrer?: DemarrerVoyageComplet;
  readonly maintenant?: () => number;
};

/** Démarrage du voyage complet non obtenu (aucun message, aucune valeur). */
export class DemarrageVoyageCompletError extends Error {
  override name = "DemarrageVoyageCompletError";
}

export function creerSuiteVoyageComplet(dependances: DependancesSuite = {}): SuiteVoyageDebloque {
  const transaction = dependances.transaction ?? withSystemOrg;
  const demarrer = dependances.demarrer ?? demarrerVoyageCompletReel;
  const maintenant = dependances.maintenant ?? Date.now;
  return async ({ tripId, organizationId }) => {
    const issue = await reconcilierVoyageComplet((travail) => transaction(organizationId, (tx) => travail(executeurSql(tx))), demarrer, {
      organizationId,
      tripId,
      maintenant: maintenant(),
      etouffement: false,
    });
    if (issue.aDemarrer !== null && !issue.demarre) throw new DemarrageVoyageCompletError();
  };
}
