import "server-only";

import { RANG_ETAPE, type EtapeApercu } from "@/server/config/generation";

import { ArretEtape, codeFerme } from "./codes";
import type { CodeArret } from "./raison-echec";

/**
 * Garde d'idempotence des étapes de `generatePreview` (décision 0081 B9-TL-3 point 2, amendée par 0087 § 2 : l'étape `l` de
 * rang 2). **Seul `step_seq` entre dans la garde** (`step` sert à l'observation, sauf dans la condition de rejeu de `a`).
 *
 * - Début d'étape : une écriture conditionnelle unique, `UPDATE … SET step, step_seq = n, phase = 'preparing' WHERE step_seq =
 *   n - 1 AND phase IN ('queued', 'preparing')` ; aucune ligne touchée (étape redistribuée, déjà commencée, exécution finie
 *   ou expirée) : l'étape s'arrête avant toute composition et tout appel, sans rien écrire. **Exception de `a`**, seule
 *   rejouable : `step_seq IN (0, 1) AND (step_seq = 0 OR step = 'a')`.
 * - Toute écriture ultérieure de l'étape (données, `failed`, publication) est conditionnée à `step_seq = n AND phase =
 *   'preparing'` : une exécution expirée (`step_expired`, 20 min) ou déjà arrêtée n'est plus écrite.
 */

export interface ExecuteurGarde {
  query(texte: string, valeurs?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

const SQL_DEBUT = `UPDATE public.generation_runs SET step = $3, step_seq = $4, phase = 'preparing', updated_at = $5::timestamptz
  WHERE organization_id = $1 AND id = $2 AND phase IN ('queued', 'preparing') AND kind = 'preview'
    AND step_seq = $4 - 1
  RETURNING trip_id, request_id`;

const SQL_DEBUT_A = `UPDATE public.generation_runs SET step = $3, step_seq = $4, phase = 'preparing', updated_at = $5::timestamptz
  WHERE organization_id = $1 AND id = $2 AND phase IN ('queued', 'preparing') AND kind = 'preview'
    AND step_seq IN (0, 1) AND (step_seq = 0 OR step = 'a')
  RETURNING trip_id, request_id`;

/** Exécution ouverte par une étape : voyage et identifiant de la demande, lus dans la même écriture. */
export type ExecutionOuverte = { readonly tripId: string; readonly requestId: string | null };

/** Commence l'étape : `null` si la garde la refuse (rien n'a été écrit). */
export async function commencerEtape(executeur: ExecuteurGarde, organizationId: string, generationRunId: string, etape: EtapeApercu, instant: Date): Promise<ExecutionOuverte | null> {
  const rang = RANG_ETAPE[etape];
  const { rows } = await executeur.query(etape === "a" ? SQL_DEBUT_A : SQL_DEBUT, [organizationId, generationRunId, etape, rang, instant.toISOString()]);
  const ligne = rows[0];
  if (ligne === undefined) return null;
  return { tripId: String(ligne.trip_id), requestId: ligne.request_id === null || ligne.request_id === undefined ? null : String(ligne.request_id) };
}

const SQL_GARDE = `UPDATE public.generation_runs SET updated_at = $4::timestamptz
  WHERE organization_id = $1 AND id = $2 AND step_seq = $3 AND phase = 'preparing' RETURNING id`;

/**
 * Condition d'écriture d'une étape, dans la transaction qui écrit : vrai si l'exécution est toujours à l'étape `rang` et en
 * `preparing` (la ligne est alors verrouillée jusqu'à la fin de la transaction et `updated_at` avancé). Faux : l'appelant
 * n'écrit rien (`ArretEtape("step_expired")`).
 */
export async function gardeOuverte(executeur: ExecuteurGarde, organizationId: string, generationRunId: string, etape: EtapeApercu, instant: Date): Promise<boolean> {
  const { rows } = await executeur.query(SQL_GARDE, [organizationId, generationRunId, RANG_ETAPE[etape], instant.toISOString()]);
  return rows.length > 0;
}

/** Lève `step_expired` si la garde est fermée. */
export async function exigerGarde(executeur: ExecuteurGarde, organizationId: string, generationRunId: string, etape: EtapeApercu, instant: Date): Promise<void> {
  if (!(await gardeOuverte(executeur, organizationId, generationRunId, etape, instant))) throw new ArretEtape("step_expired");
}

const SQL_ECHEC = `UPDATE public.generation_runs SET phase = 'failed', stop_reason = $4, updated_at = $5::timestamptz, finished_at = $5::timestamptz
  WHERE organization_id = $1 AND id = $2 AND step_seq = $3 AND phase = 'preparing' RETURNING id`;

/** Clôt l'exécution en `failed` sur un code fermé, si elle est toujours à cette étape ; rien de la version n'est écrit. */
export async function cloreEnEchec(executeur: ExecuteurGarde, organizationId: string, generationRunId: string, etape: EtapeApercu, code: CodeArret | string, instant: Date): Promise<boolean> {
  const { rows } = await executeur.query(SQL_ECHEC, [organizationId, generationRunId, RANG_ETAPE[etape], codeFerme(code), instant.toISOString()]);
  return rows.length > 0;
}
