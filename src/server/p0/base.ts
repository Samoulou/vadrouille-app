import "server-only";

import { createDatabase } from "../../../db/index.ts";

import type { PoolSql } from "@/server/usage/neon";

/**
 * Pool `vadrouille_prototype` du mode réel (décision 0046, D15 point 6 et D21 ; 0055, sections 1 et 2), créé au
 * premier appel par la fabrique gardée de `db/connection.ts` (refus en production, liste d'autorisation de D21,
 * environnement lu à l'appel), puis réutilisé. Appelé seulement après une garde ouverte (`ouvertureP0`) : une garde
 * fermée n'ouvre aucune connexion.
 */
let pool: PoolSql | undefined;

export function poolPrototype(): PoolSql {
  pool ??= createDatabase("vadrouille_prototype").$client;
  return pool;
}
