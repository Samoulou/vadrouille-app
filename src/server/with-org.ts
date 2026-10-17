import "server-only";

import { sql } from "drizzle-orm";

import { createDatabase, type Database } from "../../db/index.ts";
import type { AdapterContext } from "@/adapters/types";

/**
 * Contexte d'organisation d'une transaction (spécification B3, B3b point 8 ; décision 0007). `withOrg(ctx, fn)` ouvre
 * une transaction sur le pool `vadrouille_app`, pose `app.organization_id` et `app.user_id` par `set_config(…, true)`
 * (portée de la transaction) avec des **paramètres liés**, puis exécute `fn`. Les deux identifiants sont validés comme
 * `uuid` avant toute requête ; un refus lève `WithOrgContextError`, sans valeur. Jamais sous `"use server"` ; aucun cas
 * d'usage métier dans B3 (B6).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Contexte refusé (identifiant qui n'est pas un `uuid`) ; ne porte aucune valeur. */
export class WithOrgContextError extends Error {
  override name = "WithOrgContextError";

  constructor() {
    super("Contexte d'organisation refusé.");
  }
}

export type OrgTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

let parDefaut: Database | undefined;

/** `database` : client du rôle `vadrouille_app` (injecté par les tests) ; par défaut, celui de `db/index.ts`. */
export async function withOrg<T>(
  ctx: Pick<AdapterContext, "organizationId" | "userId">,
  fn: (tx: OrgTransaction) => Promise<T>,
  database?: Database,
): Promise<T> {
  if (typeof ctx.organizationId !== "string" || !UUID.test(ctx.organizationId)) throw new WithOrgContextError();
  if (typeof ctx.userId !== "string" || !UUID.test(ctx.userId)) throw new WithOrgContextError();
  const db = database ?? (parDefaut ??= createDatabase("vadrouille_app"));
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.organization_id', ${ctx.organizationId}, true), set_config('app.user_id', ${ctx.userId}, true)`);
    return fn(tx);
  });
}
