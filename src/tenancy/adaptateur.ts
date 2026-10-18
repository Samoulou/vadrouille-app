import "server-only";

import type { BetterAuthOptions, DBAdapter } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import type { Database } from "../../db/index.ts";
import { accounts, memberships, organizations, sessions, users, verifications } from "../../db/schema/auth.ts";
import { envelopperCreationCompte } from "./creation-compte";
import { envelopperJetons } from "./jetons-haches";

/**
 * Adaptateur de base de Better Auth 1.7.7 (spécification B3, B3b point 2) : adaptateur Drizzle sur le client
 * `vadrouille_auth`, avec transactions réelles, tables de B1 (vérification 7.8 : noms configurables, aucun doublon),
 * enveloppé par la création atomique du compte (`./creation-compte.ts`) puis par le hachage des jetons de session
 * (`./jetons-haches.ts`, B3-TL-9). Les tests du hachage l'instancient avec `MODELES` seuls (critère B8, chemins de la
 * bibliothèque hors de la liste blanche).
 */

/** Correspondance des modèles du cœur de la bibliothèque avec les tables de B1. */
export const MODELES = Object.freeze({
  user: { modelName: "users" },
  session: { modelName: "sessions" },
  account: { modelName: "accounts" },
  verification: { modelName: "verifications" },
} as const);

export function fabriqueAdaptateur(database: Database): (options: BetterAuthOptions) => DBAdapter {
  const base = drizzleAdapter(database, {
    provider: "pg",
    transaction: true,
    schema: { users, sessions, accounts, verifications, organizations, memberships },
  });
  return (options) => envelopperJetons(envelopperCreationCompte(base(options), database));
}
