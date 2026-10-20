import "server-only";

import { errorNameOf, logEvent } from "@/server/log";

/**
 * Suite « voyage débloqué » (spécification B4, B4-PO-15 ; décisions 0081 B9-TL-12 point 2, option B, et 0097
 * B4-TL-12) : fonction unique, qui ne reçoit que les identifiants du droit, du voyage et de l'organisation, appelée
 * **hors de la transaction** du webhook après sa validation, après `granted` comme après `alreadyGranted`, et aussi
 * pour un événement déjà enregistré `granted` ou `alreadyGranted` (reprise idempotente) ; jamais pour `ignored` ni
 * `rejected`. Trois relances internes (démarrages sans appel payant, handover § 8), puis une ligne
 * `payment.followup_failed` (nom d'erreur seulement). Un échec ne retire jamais le droit et ne change pas la réponse du
 * webhook (`200`). B9d y branche la réconciliation du voyage complet dans le contexte système de l'organisation
 * (`suite-voyage-complet.ts`, posée par défaut par le webhook simulé).
 */

export type VoyageDebloque = { readonly entitlementId: string; readonly tripId: string; readonly organizationId: string };
export type SuiteVoyageDebloque = (droit: VoyageDebloque) => Promise<void>;

/** Relances internes après le premier essai. */
export const RELANCES_SUITE = 3;

/** Suite de B4a : ne fait rien (B9d la remplace). */
export const suiteSansEffet: SuiteVoyageDebloque = async () => undefined;

/** Appelle la suite (1 essai + `RELANCES_SUITE` relances) ; ne lève jamais. */
export async function lancerSuite(suite: SuiteVoyageDebloque, droit: VoyageDebloque): Promise<void> {
  let derniere: unknown;
  for (let essai = 0; essai <= RELANCES_SUITE; essai += 1) {
    try {
      await suite({ entitlementId: droit.entitlementId, tripId: droit.tripId, organizationId: droit.organizationId });
      return;
    } catch (error) {
      derniere = error;
    }
  }
  logEvent("payment.followup_failed", { errorName: errorNameOf(derniere) }, "warn");
}
