import "server-only";

import { sql } from "drizzle-orm";

import type { Database } from "../../db/index.ts";

/**
 * Lectures d'organisation et d'adhésion sous `vadrouille_auth` (spécification B3, B3b points 5 et 9 ; amendement de
 * 0007 par B3b) : droits `SELECT` de B1 sur `organizations` et `memberships`, politiques `organizations_auth` et
 * `memberships_auth` (`USING (true)`, `db/migrations/0001_securite.sql`). Aucun droit nouveau. Paramètres liés
 * seulement.
 */

export type OrganisationPersonnelle = { readonly id: string; readonly enSuppression: boolean };
export type Adhesion = { readonly role: "owner" | "member"; readonly enSuppression: boolean };

/** Organisation personnelle de `userId` (adhésion `owner`, `kind = personal`), ou `null`. */
export async function organisationPersonnelle(db: Database, userId: string): Promise<OrganisationPersonnelle | null> {
  const resultat = await db.execute<{ id: string; en_suppression: boolean }>(
    sql`SELECT o.id, o.deletion_requested_at IS NOT NULL AS en_suppression
        FROM memberships m JOIN organizations o ON o.id = m.organization_id
        WHERE m.user_id = ${userId} AND m.role = 'owner' AND o.kind = 'personal'
        ORDER BY o.created_at, o.id LIMIT 1`,
  );
  const ligne = resultat.rows[0];
  return ligne === undefined ? null : { id: ligne.id, enSuppression: ligne.en_suppression };
}

/** Adhésion de `userId` à `organizationId`, avec l'état de suppression de l'organisation, ou `null`. */
export async function adhesion(db: Database, organizationId: string, userId: string): Promise<Adhesion | null> {
  const resultat = await db.execute<{ role: string; en_suppression: boolean }>(
    sql`SELECT m.role, o.deletion_requested_at IS NOT NULL AS en_suppression
        FROM memberships m JOIN organizations o ON o.id = m.organization_id
        WHERE m.organization_id = ${organizationId} AND m.user_id = ${userId}
        LIMIT 1`,
  );
  const ligne = resultat.rows[0];
  if (ligne === undefined || (ligne.role !== "owner" && ligne.role !== "member")) return null;
  return { role: ligne.role, enSuppression: ligne.en_suppression };
}
