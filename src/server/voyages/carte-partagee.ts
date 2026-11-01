import "server-only";

import type { SharedDayMap } from "@/contracts";

/**
 * Carte de la vue partagée sur `api` (spécification M6 § 3.3 point 5 et critère 17 de M6a ; décision 0157 § 1.4, T4,
 * et § 3 ; ticket 1013, M6a). **Aucune position n'est lue** : la lecture des positions pour un visiteur anonyme
 * (`place_coordinates` par `lirePositions`, dans l'organisation du lien, par `withSystemOrg`) attend la réponse écrite
 * de Samuel à la question 1 de 0157 (Q814 ; S7, condition 7 : « sans réponse, la vue partagée reste sans carte ; aucun
 * délai sans réponse ne vaut accord »). D'ici là, 0157 § 1.4 ne s'applique pas : ce module n'importe ni
 * `@/server/positions/lecture` ni `@/server/with-system-org`, et chaque jour reçoit une liste de points vide. Sans
 * aucun point, `DayMap` montre l'état de remplacement (`MapFallback`, cause `unavailable`) et ne charge aucun script
 * de Google : aucune autre carte, aucun appel Places ni Routes pour un visiteur.
 *
 * Seul importateur hors des tests : `src/server/partage/vue.ts` (`tests/unit/lint/positions-imports.test.ts`). La tâche
 * qui ouvrira la carte, après la réponse de Samuel, remplacera ce corps selon 0157 § 1.4 (transaction 2 dédiée, `placeId`
 * des étapes de la version partagée seulement), avec les tests (a) à (f) du point 9 et la règle de confinement du point 8.
 */
export function carteDeLaVuePartagee(jours: readonly { readonly index: number }[]): SharedDayMap[] {
  return jours.map((jour) => ({ index: jour.index, points: [] }));
}
