import "server-only";

/**
 * Point d'appel de l'étape (d) de `verifyCode` (handover § 12 ; décision 0077 § 5.2, B3-TL-3) : reprise de l'étape 2
 * de la suppression du compte quand une vérification réussit pour une personne dont l'organisation personnelle est en
 * suppression. **Vide en B3b** : B11 le remplit avec `src/server/account/delete.ts` (qui supprime aussi toute session
 * restante). Ne lève jamais.
 */
export async function reprendreSuppression(userId: string): Promise<void> {
  void userId;
}
