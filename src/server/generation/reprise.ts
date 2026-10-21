import "server-only";

/**
 * Reprise d'un voyage complet échoué (spécification B9, B9d points 5 et 6, B9-PO-17 ; décisions 0087 § 1.2 et § 1.3,
 * 0081 B9-TL-12 point 4) : **une** écriture conditionnelle `failed` → `queued` sur la ligne `full` du voyage, qui **ne
 * démarre rien**. Module feuille : aucun import (ni la composition, ni les workflows, ni la conversion des codes, ni
 * `src/ai`, `src/research`, `src/grounding`) ; il reçoit un exécuteur de la transaction déjà ouverte dans le contexte de
 * l'organisation (`withOrg` pour la personne, `withSystemOrg` pour la commande du studio), la liste des causes
 * réessayables (tirée par l'appelant de la conversion unique, `raison-echec.ts`) et le maximum de reprises de la personne
 * (configuration), jamais recopiés ici. Seuls importateurs : `retryGeneration` (`src/server/creation/nouvel-essai.ts`) et la
 * commande `scripts/reprise-studio.ts` (0087 § 1.6 point 3).
 *
 * Écriture (0087 § 1.3 point 1) : `phase = 'queued'`, `step` nul, `step_seq = 0`, `workflow_run_id`, `stop_reason` et
 * `finished_at` nuls ; `request_id` n'est jamais écrit (0087 § 1.2). Sous `READ COMMITTED`, deux reprises simultanées : la
 * seconde réévalue sa condition sur la ligne déjà passée en `queued` et ne touche rien (0087 § 1.3 point 2).
 * - **Personne** : cause réessayable, moins de `maximum` reprises, aucune reprise du studio, `requestId` nouveau ; le
 *   `requestId` est ajouté au tableau des reprises de la personne.
 * - **Studio** : aucune condition de cause ni de compteur ; le compteur du studio est incrémenté ; le compteur de la
 *   personne est laissé tel quel.
 * Un couple organisation et voyage qui ne correspond pas ne touche aucune ligne (sécurité par ligne forcée et filtre).
 */

export interface ExecuteurReprise {
  query(texte: string, valeurs?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export type AuteurReprise =
  | {
      readonly type: "personne";
      readonly requestId: string;
      /** Causes réessayables de la conversion unique (`CODES_REESSAYABLES`), passées par l'appelant. */
      readonly causesReessayables: readonly string[];
      /** Maximum de reprises de la personne (`MAX_REPRISES_PERSONNE`, configuration). */
      readonly maximum: number;
    }
  | { readonly type: "studio" };

/** Ligne reprise : identifiants internes seulement (aucune donnée de lieu). */
export type LigneReprise = { readonly generationRunId: string };

export const SQL_REPRISE_PERSONNE = `UPDATE public.generation_runs
  SET phase = 'queued', step = NULL, step_seq = 0, workflow_run_id = NULL, stop_reason = NULL, finished_at = NULL,
    updated_at = $4::timestamptz, person_retry_request_ids = array_append(person_retry_request_ids, $3::uuid)
  WHERE organization_id = $1 AND trip_id = $2 AND kind = 'full' AND phase = 'failed'
    AND stop_reason = ANY($5::text[])
    AND cardinality(person_retry_request_ids) < $6
    AND studio_retries = 0
    AND NOT ($3::uuid = ANY(person_retry_request_ids))
  RETURNING id`;

export const SQL_REPRISE_STUDIO = `UPDATE public.generation_runs
  SET phase = 'queued', step = NULL, step_seq = 0, workflow_run_id = NULL, stop_reason = NULL, finished_at = NULL,
    updated_at = $3::timestamptz, studio_retries = studio_retries + 1
  WHERE organization_id = $1 AND trip_id = $2 AND kind = 'full' AND phase = 'failed'
  RETURNING id`;

/** Fait la reprise ; `null` si aucune ligne n'a été touchée (rien à reprendre, condition fausse, concurrent gagnant). */
export async function reprendreVoyageComplet(
  executeur: ExecuteurReprise,
  cible: { readonly organizationId: string; readonly tripId: string; readonly instant: Date },
  auteur: AuteurReprise,
): Promise<LigneReprise | null> {
  const { organizationId, tripId, instant } = cible;
  const { rows } =
    auteur.type === "personne"
      ? await executeur.query(SQL_REPRISE_PERSONNE, [organizationId, tripId, auteur.requestId, instant.toISOString(), [...auteur.causesReessayables], auteur.maximum])
      : await executeur.query(SQL_REPRISE_STUDIO, [organizationId, tripId, instant.toISOString()]);
  const ligne = rows[0];
  return ligne === undefined ? null : { generationRunId: String(ligne.id) };
}
