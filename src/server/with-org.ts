import "server-only";

import { type SQL, sql } from "drizzle-orm";

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

type FonctionWithOrg = <T>(ctx: Pick<AdapterContext, "organizationId" | "userId">, fn: (tx: OrgTransaction) => Promise<T>) => Promise<T>;

/**
 * Fabrique liée à un client donné (tests, revue du head `f0b8c5a`, mineur 9) : l'API de production, `withOrg`, ne
 * prend aucun client en paramètre.
 */
export function creerWithOrg(database: Database): FonctionWithOrg {
  return async (ctx, fn) => {
    if (typeof ctx.organizationId !== "string" || !UUID.test(ctx.organizationId)) throw new WithOrgContextError();
    if (typeof ctx.userId !== "string" || !UUID.test(ctx.userId)) throw new WithOrgContextError();
    return database.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.organization_id', ${ctx.organizationId}, true), set_config('app.user_id', ${ctx.userId}, true)`);
      return fn(tx);
    });
  };
}

/**
 * Exécuteur structurel `{ query(texte, valeurs) }` sur la transaction de `withOrg` (décision 0083 § 2 : réservation du
 * forfait d'une génération, `src/server/usage/reservation.ts` ; même forme qu'`ExecuteurPositions`). Les marques
 * `$1`, `$2`… du texte deviennent des **paramètres liés** (`sql.param`, un tableau reste un seul paramètre) ; une
 * marque sans valeur est refusée avant toute requête. Le texte est une constante du module appelant, jamais une
 * entrée.
 */
export function executeurSql(tx: OrgTransaction): { query(texte: string, valeurs?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }> } {
  return {
    async query(texte, valeurs = []) {
      const parties: SQL[] = texte.split(/\$(\d+)/).map((morceau, i) => {
        if (i % 2 === 0) return sql.raw(morceau);
        const rang = Number(morceau);
        if (!Number.isSafeInteger(rang) || rang < 1 || rang > valeurs.length) throw new Error("executeurSql: paramètre absent");
        return sql`${sql.param(valeurs[rang - 1])}`;
      });
      const resultat = await tx.execute<Record<string, unknown>>(sql.join(parties));
      return { rows: resultat.rows };
    },
  };
}

let parDefaut: FonctionWithOrg | undefined;

/** Sur le client du rôle `vadrouille_app` de `db/index.ts`. */
export async function withOrg<T>(ctx: Pick<AdapterContext, "organizationId" | "userId">, fn: (tx: OrgTransaction) => Promise<T>): Promise<T> {
  parDefaut ??= creerWithOrg(createDatabase("vadrouille_app"));
  return parDefaut(ctx, fn);
}
