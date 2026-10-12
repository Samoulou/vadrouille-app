import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";

import { type AppDatabaseRole, createGuardedPool } from "./connection.ts";
import * as schema from "./schema/index.ts";

/**
 * Client Drizzle d'un rôle applicatif, sur le pool gardé de `db/connection.ts` (refus en production, refus d'un
 * rôle administrateur). Le contexte d'organisation (`withOrg`, décision 0007) est posé par `src/server` (B3).
 */
export function createDatabase(role: AppDatabaseRole, env: Readonly<Record<string, string | undefined>> = process.env) {
  return drizzle({ client: createGuardedPool(role, env), schema });
}

export type Database = ReturnType<typeof createDatabase>;
