import "server-only";

import { EXPIRATION_EXECUTION_MS } from "@/server/config/generation";

import { CODE_ETAPE_EXPIREE } from "./reessayables";
import { echecCompletDeLigne, type EchecComplet } from "./voyage-complet";

/**
 * Expiration d'une exécution figée (décision 0081 B9-TL-3 point 5) : toute exécution du voyage en `queued` ou en
 * `preparing` dont `updated_at` date de plus de N (`EXPIRATION_EXECUTION_MS`) passe en `failed`, `stop_reason`
 * `step_expired` (donc `provider_error`, `retryable` vrai), **sauf** un `full` en `queued` sans `workflow_run_id`
 * (laissé à la réconciliation, B9-TL-12 point 3). Une seule écriture conditionnelle : deux appels simultanés ne
 * modifient la ligne qu'une fois (le second ne la voit plus en `queued` ou `preparing`). Appelée par
 * `getGenerationStatus` (B9b), puis par la lecture de l'état du voyage complet et la réconciliation (B9d, mêmes
 * fonctions, 0087 § 1.5 point 3). Horloge injectée (tests) ; aucune donnée de lieu.
 */

/** Exécuteur structurel (`executeurSql` de `src/server/with-org.ts`). */
export interface ExecuteurGeneration {
  query(texte: string, valeurs?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

const SQL_EXPIRATION = `UPDATE public.generation_runs
  SET phase = 'failed', stop_reason = '${CODE_ETAPE_EXPIREE}', updated_at = $3::timestamptz, finished_at = $3::timestamptz
  WHERE organization_id = $1 AND trip_id = $2
    AND phase IN ('queued', 'preparing')
    AND updated_at < $4::timestamptz
    AND NOT (kind = 'full' AND phase = 'queued' AND workflow_run_id IS NULL)
  RETURNING id, kind, trip_id, stop_reason, cardinality(person_retry_request_ids)::int AS reprises_personne, studio_retries`;

/**
 * Ligne expirée par cet appel : son identifiant et, pour une ligne `full`, ce qu'il faut pour évaluer l'état bloqué (0087
 * § 1.4 point 2 : l'expiration est un des écrivains de `generation.full_stuck` ; l'appelant l'écrit après la validation de sa
 * transaction, `signalerSiBloquee`).
 */
export type ExecutionExpiree = { readonly id: string; readonly complet: EchecComplet | null };

/** Expire les exécutions figées du voyage ; rend les lignes modifiées par cet appel. */
export async function expirerExecutions(executeur: ExecuteurGeneration, organizationId: string, tripId: string, maintenantMs: number): Promise<ExecutionExpiree[]> {
  const maintenant = new Date(maintenantMs).toISOString();
  const seuil = new Date(maintenantMs - EXPIRATION_EXECUTION_MS).toISOString();
  const { rows } = await executeur.query(SQL_EXPIRATION, [organizationId, tripId, maintenant, seuil]);
  return rows.map((ligne) => ({ id: String(ligne.id), complet: ligne.kind === "full" ? echecCompletDeLigne(ligne) : null }));
}
