import "server-only";

import { randomBytes } from "node:crypto";

import type { DBAdapter } from "better-auth";
import { sql } from "drizzle-orm";

import type { Database } from "../../db/index.ts";
import { memberships, users } from "../../db/schema/auth.ts";

/**
 * Création atomique du compte (spécification B3, B3b point 5 ; B3-PO-3 ; critère B15). Better Auth 1.7.7 exécute
 * `databaseHooks.user.create.after` **hors** de la transaction de création de l'utilisateur (vérification 7.9,
 * amendement de 0008) : une erreur dans ce crochet laisserait un utilisateur sans organisation. Parade retenue (option 2
 * de la vérification 7.9, soumise au Tech Lead) : cet adaptateur enveloppe l'adaptateur de la bibliothèque et
 * remplace la création d'un `user` par **une** transaction du pool `vadrouille_auth` qui insère :
 * 1. l'utilisateur (`email` et `email_verified` seulement ; ni nom ni image : B3-PO-2) ;
 * 2. son organisation personnelle (`kind = personal`, nom fixe `personal`, slug `p-` suivi de 16 caractères
 *    hexadécimaux aléatoires : ni l'adresse ni sa partie locale ; B3-PO-3), par les seules colonnes `name`, `slug` et
 *    `kind` (droit de colonne `INSERT (id, name, slug, kind, created_at)` de B1 ; jamais `deletion_requested_at`) ;
 * 3. l'adhésion `owner`.
 * Le déclencheur différé « exactement un propriétaire » de B1 est contrôlé à la validation de cette transaction. Une
 * erreur à n'importe quelle étape annule les trois insertions ; aucune session n'est alors créée (la bibliothèque ne
 * crée la session qu'après le retour de `create`).
 */

const MODELES_UTILISATEUR = new Set(["user", "users"]);

/** Nom de l'organisation personnelle (jamais l'adresse ni sa partie locale ; B3-PO-3). */
export const NOM_ORGANISATION_PERSONNELLE = "personal";

/** Slug de l'organisation personnelle : `p-` et 16 caractères hexadécimaux aléatoires. */
export function slugPersonnel(): string {
  return `p-${randomBytes(8).toString("hex")}`;
}

/** Création refusée faute d'adresse ; ne porte aucune valeur. */
export class CreationCompteError extends Error {
  override name = "CreationCompteError";

  constructor() {
    super("Création du compte refusée.");
  }
}

type DonneesUtilisateur = { readonly email?: unknown; readonly emailVerified?: unknown };

/** Insère l'utilisateur, son organisation personnelle et son adhésion `owner` dans une seule transaction. */
export async function creerCompte(db: Database, donnees: DonneesUtilisateur): Promise<Record<string, unknown>> {
  if (typeof donnees.email !== "string" || donnees.email.length === 0) throw new CreationCompteError();
  const email = donnees.email;
  const emailVerified = donnees.emailVerified === true;
  return db.transaction(async (tx) => {
    const [utilisateur] = await tx.insert(users).values({ email, emailVerified }).returning();
    if (utilisateur === undefined) throw new CreationCompteError();
    const organisation = await tx.execute<{ id: string }>(
      sql`INSERT INTO organizations (name, slug, kind) VALUES (${NOM_ORGANISATION_PERSONNELLE}, ${slugPersonnel()}, 'personal') RETURNING id`,
    );
    const organizationId = organisation.rows[0]?.id;
    if (organizationId === undefined) throw new CreationCompteError();
    await tx.insert(memberships).values({ organizationId, userId: utilisateur.id, role: "owner" });
    return { ...utilisateur };
  });
}

/**
 * Enveloppe `adaptateur` : la création d'un `user` passe par `creerCompte` ; tout le reste est inchangé. Dans une
 * transaction de la bibliothèque (`db === null`), la création d'un `user` est refusée : elle ne pourrait pas joindre
 * l'organisation et l'adhésion à cette transaction (aucune opération de la liste blanche ne le fait en 1.7.7).
 */
export function envelopperCreationCompte<A extends DBAdapter>(adaptateur: A, db: Database | null): A {
  return {
    ...adaptateur,
    transaction: (rappel: (trx: DBAdapter) => Promise<unknown>) =>
      adaptateur.transaction((trx) => rappel(envelopperCreationCompte(trx as DBAdapter, null)) as Promise<never>),
    create: async (parametres: { model: string; data: DonneesUtilisateur }, ...reste: unknown[]) => {
      if (!MODELES_UTILISATEUR.has(parametres.model)) return (adaptateur.create as (...a: unknown[]) => unknown)(parametres, ...reste);
      if (db === null) throw new CreationCompteError();
      return creerCompte(db, parametres.data);
    },
  } as A;
}
