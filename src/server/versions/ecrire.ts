import "server-only";

import { TripSnapshotSchema, type TripSnapshot } from "@/contracts";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Module unique d'écriture des versions d'un programme (décision 0081 B9-TL-10 : la version de la génération passe ici,
 * comme celles de B11). Valide l'instantané par `TripSnapshotSchema` **avant** toute écriture (une clé Google est refusée
 * à tous les niveaux), pose l'auteur (`workflow`, `engine` ou `user`) et le `request_id`, écrit `trip_versions` et avance
 * `trips.current_version`. N'importe ni `@/ai`, ni `@/research`, ni `@/grounding`.
 *
 * Idempotent par `(trip_id, request_id)` (contrainte d'unicité de `trip_versions`) : rejouée après une transaction dont la
 * confirmation s'est perdue, l'écriture reconnaît la version déjà là et n'écrit rien de plus (rejeu de la transaction de
 * publication, 0081 B9-TL-3 point 4). Le numéro de version est `max + 1` du voyage, ou 1 ; l'appelant tient la transaction
 * (organisation posée) et le verrou de sa propre garde.
 */

export interface ExecuteurVersions {
  query(texte: string, valeurs?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export type AuteurVersion = "user" | "engine" | "workflow";

export type DemandeVersion = {
  readonly organizationId: string;
  readonly tripId: string;
  readonly requestId: string;
  readonly auteur: AuteurVersion;
  readonly instantane: unknown;
  /** Identifiant de la personne, pour l'auteur `user` seulement. */
  readonly auteurUserId?: string;
};

export type VersionEcrite = { readonly version: number; readonly creee: boolean; readonly instantane: TripSnapshot };

const SQL_EXISTANTE = `SELECT version FROM public.trip_versions WHERE organization_id = $1 AND trip_id = $2 AND request_id = $3`;
const SQL_INSERTION = `INSERT INTO public.trip_versions (organization_id, trip_id, version, parent_version, request_id, snapshot, author_kind, author_user_id)
  SELECT $1::uuid, $2::uuid, COALESCE(max(version), 0) + 1, max(version), $3::uuid, $4::jsonb, $5, $6::uuid
  FROM public.trip_versions WHERE organization_id = $1 AND trip_id = $2
  RETURNING version`;
const SQL_COURANTE = `UPDATE public.trips SET current_version = $3
  WHERE organization_id = $1 AND id = $2 AND (current_version IS NULL OR current_version < $3)`;

export async function ecrireVersion(executeur: ExecuteurVersions, demande: DemandeVersion): Promise<VersionEcrite> {
  if (!UUID.test(demande.organizationId) || !UUID.test(demande.tripId) || !UUID.test(demande.requestId)) throw new RangeError("versions: identifiant illisible");
  if (demande.auteur === "user" ? demande.auteurUserId === undefined || !UUID.test(demande.auteurUserId) : demande.auteurUserId !== undefined) {
    throw new RangeError("versions: auteur incohérent");
  }
  // Validation stricte avant toute requête : un instantané refusé ne laisse rien.
  const instantane = TripSnapshotSchema.parse(demande.instantane);

  const existante = (await executeur.query(SQL_EXISTANTE, [demande.organizationId, demande.tripId, demande.requestId])).rows[0];
  if (existante !== undefined) return { version: Number(existante.version), creee: false, instantane };

  const ecrite = (
    await executeur.query(SQL_INSERTION, [
      demande.organizationId,
      demande.tripId,
      demande.requestId,
      JSON.stringify(instantane),
      demande.auteur,
      demande.auteurUserId ?? null,
    ])
  ).rows[0];
  if (ecrite === undefined) throw new Error("versions: aucune ligne écrite");
  const version = Number(ecrite.version);
  await executeur.query(SQL_COURANTE, [demande.organizationId, demande.tripId, version]);
  return { version, creee: true, instantane };
}
