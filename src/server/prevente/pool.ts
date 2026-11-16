import "server-only";

import { createDatabase } from "../../../db/index.ts";

/**
 * Pool propre de la mesure de la prévente (décision 0175 § 4 point 4 ; décision 0177 § 3) : **un seul**, partagé par le
 * compteur de visites (`visites.ts`) et l'écriture des réponses (`reponses.ts`). 2 connexions, attente et requête bornées
 * à 2 s (modèle de `src/server/villes/compteurs.ts`) : une base trop lente ne retient rien au-delà.
 *
 * Créé au premier besoin par la fabrique gardée de `db/connection.ts` (rôle `vadrouille_app`, garde de production de
 * 0034) et gardé ; la fabrique **lève** tant que la garde refuse, et la création est retentée à l'appel suivant.
 * **Créer le pool n'ouvre aucune connexion** (`pg` connecte à la première requête). Aucune variable n'est lue ici.
 */

/** Pool minimal (`pg.Pool`), injectable par les tests. */
export type PoolPrevente = { query(text: string, values?: unknown[]): Promise<unknown> };

const POOL_PREVENTE = { max: 2, connectionTimeoutMillis: 2_000, query_timeout: 2_000 } as const;

let pool: PoolPrevente | undefined;

/** Le pool de la mesure ; lève si la garde de connexion refuse. */
export function poolPrevente(): PoolPrevente {
  return (pool ??= createDatabase("vadrouille_app", undefined, POOL_PREVENTE).$client);
}
