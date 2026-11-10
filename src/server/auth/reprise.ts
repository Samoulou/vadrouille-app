import "server-only";

import { suppressionCompte } from "@/server/account/delete";
import { errorNameOf, logEvent } from "@/server/log";

/**
 * Point d'appel de l'étape (d) de `verifyCode` (handover § 12 ; décision 0077 § 5.2, B3-TL-3) : reprise de la suppression
 * du compte quand une vérification réussit pour une personne dont l'organisation personnelle est en suppression. Rempli
 * par M9b (ticket 1106 ; spécification M9 § 4.2 point 4) avec `src/server/account/delete.ts`, qui rejoue les étapes 1 et
 * 2 et supprime aussi toute session restante. Appelé **après** le refus de la création de la session (aucun cookie) ;
 * `verifyCode` répond ensuite `unauthenticated`, que la reprise ait fini ou non. Jamais refusée par la limite
 * `suppression` (elle ne passe pas par le limiteur de l'action, S7). **Ne lève jamais** : un échec est journalisé
 * (`compte.suppression_failed`, `errorName` seul) et une prochaine vérification la reprend.
 */
export async function reprendreSuppression(userId: string): Promise<void> {
  try {
    await suppressionCompte().reprendre(userId);
  } catch (erreur) {
    const errorName = errorNameOf(erreur);
    logEvent("compte.suppression_failed", errorName === undefined ? {} : { errorName }, "error");
  }
}
