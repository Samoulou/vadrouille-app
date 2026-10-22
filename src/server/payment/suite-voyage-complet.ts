import "server-only";

import { demarrerRecalculReel, demarrerVoyageCompletReel } from "@/server/generation/demarrage";
import { recalculerAuDeblocage, type DemarrerRecalcul } from "@/server/generation/lot";
import type { DemarrerVoyageComplet } from "@/server/generation/reconciliation";
import { reconcilierVoyageComplet } from "@/server/generation/reconciliation";
import { errorNameOf, logEvent } from "@/server/log";
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
 *
 * **Second travail** (B10b ; décision 0119 § 1.3 points 3 et 4 ; verdict 0120 S2), **après** le premier et dans sa propre
 * transaction : clôture du tri de l'aperçu si elle manque, puis ligne `batch` et démarrage du workflow 5 si un signal de ce tri
 * touche un jour planifié (`recalculerAuDeblocage`). Son erreur est **attrapée ici** et journalisée
 * (`recalcul.unlock_failed`, identifiants internes et nom d'erreur seulement), jamais relancée vers `lancerSuite` : un défaut
 * du recalcul ne rejoue pas la réconciliation et ne retire pas le droit. L'erreur du premier travail
 * (`DemarrageVoyageCompletError`) n'est pas attrapée par ce mécanisme : elle est levée après le second travail et garde ses
 * relances (0120 S2 point 6).
 */

export type DependancesSuite = {
  readonly transaction?: <T>(organizationId: string, fn: (tx: OrgTransaction) => Promise<T>) => Promise<T>;
  readonly demarrer?: DemarrerVoyageComplet;
  /** Démarreur du workflow 5 (tests) ; `demarrerRecalculReel` par défaut. */
  readonly demarrerRecalcul?: DemarrerRecalcul;
  readonly maintenant?: () => number;
};

/** Démarrage du voyage complet non obtenu (aucun message, aucune valeur). */
export class DemarrageVoyageCompletError extends Error {
  override name = "DemarrageVoyageCompletError";
}

export function creerSuiteVoyageComplet(dependances: DependancesSuite = {}): SuiteVoyageDebloque {
  const transaction = dependances.transaction ?? withSystemOrg;
  const demarrer = dependances.demarrer ?? demarrerVoyageCompletReel;
  const demarrerRecalcul = dependances.demarrerRecalcul ?? demarrerRecalculReel;
  const maintenant = dependances.maintenant ?? Date.now;
  return async ({ entitlementId, tripId, organizationId }) => {
    const issue = await reconcilierVoyageComplet((travail) => transaction(organizationId, (tx) => travail(executeurSql(tx))), demarrer, {
      organizationId,
      tripId,
      maintenant: maintenant(),
      etouffement: false,
    });
    try {
      await recalculerAuDeblocage((travail) => transaction(organizationId, (tx) => travail(executeurSql(tx))), demarrerRecalcul, { entitlementId, tripId, organizationId }, maintenant);
    } catch (erreur) {
      const errorName = errorNameOf(erreur);
      logEvent("recalcul.unlock_failed", { organizationId, tripId, ...(errorName === undefined ? {} : { errorName }) }, "warn");
    }
    if (issue.aDemarrer !== null && !issue.demarre) throw new DemarrageVoyageCompletError();
  };
}
