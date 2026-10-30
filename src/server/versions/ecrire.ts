import "server-only";

import { CHECKLIST_KINDS, TripPatchSchema, TripSnapshotSchema, type TripSnapshot } from "@/contracts";
import { identifiantLigneAFaire, lignesApresVersion, type LigneAFaire, type SuiteDeLaListe } from "@/domain/a-faire";

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
 *
 * **Liste « À faire »** (décision 0147 § 7.2, T7) : `instantanePrecedent` est **obligatoire** (le type fait échouer la
 * compilation de tout écrivain qui l'oublierait). Nul pour la version 1 seulement, dont la génération écrit les lignes
 * (§ 7.1) ; sinon, quand la version est créée (jamais sur un rejeu), les lignes du voyage sont relues et `lignesApresVersion`
 * est appliquée **dans la même transaction**, sous le verrou des versions de l'appelant : lignes non faites d'une étape
 * absente retirées, lignes faites déliées, une ligne `reservation` par étape `toReserve` nouvelle (identifiant
 * `identifiantLigneAFaire` sur le `request_id` de la version, `ON CONFLICT (id) DO NOTHING`).
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
  /**
   * Patch de la version (`trip_versions.patch`, décision 0037 B2-TL-3), validé par `TripPatchSchema` avant toute requête :
   * même `requestId` que la demande, et `baseVersion` égale à la version qu'il remplace (la dernière du voyage, lue sous le
   * verrou de l'appelant), sinon rien n'est écrit. Absent : colonne nulle (version 1 et versions du moteur, comme avant).
   */
  readonly patch?: unknown;
  /**
   * Instantané de la version que celle-ci remplace (la dernière du voyage, lue sous le verrou de l'appelant), validé par
   * `TripSnapshotSchema` ; `null` pour la version 1 seulement (décision 0147 § 7.2 point 2). Sert à suivre la liste « À faire ».
   */
  readonly instantanePrecedent: TripSnapshot | null;
};

/**
 * Écriture refusée par la garde du patch (`HAVING max(version) = baseVersion`) : la dernière version du voyage n'est plus la
 * `baseVersion` du patch ; rien n'est écrit. L'appelant la rend en conflit (`conflict`), jamais en `internal`.
 */
export class BaseDeVersionDepassee extends Error {
  override name = "BaseDeVersionDepassee";
}

export type VersionEcrite = {
  readonly version: number;
  readonly creee: boolean;
  readonly instantane: TripSnapshot;
  /** Effet sur la liste « À faire » (version créée avec un instantané précédent), sinon absent. */
  readonly aFaire?: SuiteDeLaListe;
};

const SQL_EXISTANTE = `SELECT version FROM public.trip_versions WHERE organization_id = $1 AND trip_id = $2 AND request_id = $3`;
const SQL_INSERTION = `INSERT INTO public.trip_versions (organization_id, trip_id, version, parent_version, request_id, snapshot, author_kind, author_user_id, patch)
  SELECT $1::uuid, $2::uuid, COALESCE(max(version), 0) + 1, max(version), $3::uuid, $4::jsonb, $5, $6::uuid, $7::jsonb
  FROM public.trip_versions WHERE organization_id = $1 AND trip_id = $2
  HAVING $8::integer IS NULL OR max(version) = $8::integer
  RETURNING version`;
const SQL_COURANTE = `UPDATE public.trips SET current_version = $3
  WHERE organization_id = $1 AND id = $2 AND (current_version IS NULL OR current_version < $3)`;

/** Lignes « À faire » du voyage (0147 § 7.2). */
export const SQL_LIGNES_A_FAIRE = `SELECT id, stop_id, kind, done, label FROM public.checklist_items
  WHERE organization_id = $1 AND trip_id = $2 ORDER BY id`;
/** Lignes non faites d'une étape absente : retirées (une ligne cochée entre-temps reste, déliée par la requête suivante). */
const SQL_RETIRER = `DELETE FROM public.checklist_items
  WHERE organization_id = $1 AND trip_id = $2 AND id = ANY($3::uuid[]) AND NOT done`;
/** Lignes restantes d'une étape absente (faites) : gardées, sans lien. */
const SQL_DELIER = `UPDATE public.checklist_items SET stop_id = NULL
  WHERE organization_id = $1 AND trip_id = $2 AND id = ANY($3::uuid[])`;
const SQL_AJOUTER = `INSERT INTO public.checklist_items (id, organization_id, trip_id, stop_id, kind, label, moment, sponsored, done)
  VALUES ($3::uuid, $1, $2, $4, $5, $6, '{"type":"beforeDeparture"}'::jsonb, false, false)
  ON CONFLICT (id) DO NOTHING`;

/** Lignes du voyage lues pour `lignesApresVersion` ; une ligne illisible lève (convertie en `internal` par l'appelant). */
export async function lireLignesAFaire(executeur: ExecuteurVersions, organizationId: string, tripId: string): Promise<LigneAFaire[]> {
  const lignes = (await executeur.query(SQL_LIGNES_A_FAIRE, [organizationId, tripId])).rows;
  return lignes.map((ligne) => {
    const kind = CHECKLIST_KINDS.find((sorte) => sorte === ligne.kind);
    const stopId = ligne.stop_id === null ? null : ligne.stop_id;
    if (typeof ligne.id !== "string" || kind === undefined || typeof ligne.done !== "boolean" || typeof ligne.label !== "string" || (stopId !== null && typeof stopId !== "string")) {
      throw new RangeError("versions: ligne « À faire » illisible");
    }
    return { id: ligne.id, stopId, kind, done: ligne.done, label: ligne.label };
  });
}

async function suivreLaListe(executeur: ExecuteurVersions, demande: DemandeVersion, avant: TripSnapshot, apres: TripSnapshot): Promise<SuiteDeLaListe> {
  const { organizationId, tripId } = demande;
  const suite = lignesApresVersion(await lireLignesAFaire(executeur, organizationId, tripId), avant, apres);
  if (suite.retirer.length > 0) await executeur.query(SQL_RETIRER, [organizationId, tripId, suite.retirer]);
  // Les lignes à retirer sont aussi passées à la déliaison : `toggleChecklistItem` ne prend pas le verrou des versions, une
  // ligne lue non faite peut donc être cochée entre la lecture et le `DELETE … AND NOT done`, qui la garde. Elle reste alors
  // comme une ligne faite d'une étape absente : déliée, jamais orpheline (0147 § 7.2 point 1). Sur une ligne déjà supprimée,
  // l'`UPDATE` ne touche rien.
  const delier = [...suite.retirer, ...suite.delier];
  if (delier.length > 0) await executeur.query(SQL_DELIER, [organizationId, tripId, delier]);
  for (const [rang, ligne] of suite.ajouter.entries()) {
    await executeur.query(SQL_AJOUTER, [organizationId, tripId, identifiantLigneAFaire(demande.requestId, rang), ligne.stopId, ligne.kind, ligne.label]);
  }
  return suite;
}

export async function ecrireVersion(executeur: ExecuteurVersions, demande: DemandeVersion): Promise<VersionEcrite> {
  if (!UUID.test(demande.organizationId) || !UUID.test(demande.tripId) || !UUID.test(demande.requestId)) throw new RangeError("versions: identifiant illisible");
  if (demande.auteur === "user" ? demande.auteurUserId === undefined || !UUID.test(demande.auteurUserId) : demande.auteurUserId !== undefined) {
    throw new RangeError("versions: auteur incohérent");
  }
  // Validation stricte avant toute requête : un instantané refusé ne laisse rien.
  const instantane = TripSnapshotSchema.parse(demande.instantane);
  const patch = demande.patch === undefined ? null : TripPatchSchema.parse(demande.patch);
  const precedent = demande.instantanePrecedent === null ? null : TripSnapshotSchema.parse(demande.instantanePrecedent);
  if (patch !== null && patch.requestId !== demande.requestId) throw new RangeError("versions: patch d'une autre demande");

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
      patch === null ? null : JSON.stringify(patch),
      patch === null ? null : patch.baseVersion,
    ])
  ).rows[0];
  // Avec un patch, aucune ligne : la dernière version n'est pas sa `baseVersion` (rien n'est écrit).
  if (ecrite === undefined) throw new BaseDeVersionDepassee("versions: aucune ligne écrite");
  const version = Number(ecrite.version);
  await executeur.query(SQL_COURANTE, [demande.organizationId, demande.tripId, version]);
  if (precedent === null) return { version, creee: true, instantane };
  return { version, creee: true, instantane, aFaire: await suivreLaListe(executeur, demande, precedent, instantane) };
}

/**
 * Verrou des versions d'un voyage (décision 0119 § 1.6 point 1 ; verdict 0120 S3) : verrou consultatif **de transaction** sur
 * la clé `'vadrouille:versions:' || trip_id`, défini ici seulement (aucune copie de la chaîne de clé ailleurs). Pris au début
 * de toute transaction qui relit la dernière version pour en écrire une (publication d'un jour du workflow 4, publication du
 * workflow 5, puis écritures de B11), **après** la garde de l'étape (exécution relue dans l'organisation) : aucun verrou n'est
 * pris pour le voyage d'une autre organisation. Ordre unique : verrou du tri, puis verrou des versions, jamais l'inverse ;
 * aucun appel externe tant qu'il est tenu.
 */
export const SQL_VERROU_VERSIONS = "SELECT pg_advisory_xact_lock(hashtextextended('vadrouille:versions:' || $1::text, 0))";

/** Prend le verrou des versions du voyage dans la transaction de l'appelant (relâché à sa fin). */
export async function verrouillerVersions(executeur: ExecuteurVersions, tripId: string): Promise<void> {
  if (!UUID.test(tripId)) throw new RangeError("versions: identifiant illisible");
  await executeur.query(SQL_VERROU_VERSIONS, [tripId]);
}
