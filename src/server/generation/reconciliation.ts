import "server-only";

import { ETOUFFEMENT_RECONCILIATION_MS } from "@/server/config/generation";
import { lireDroitVoyage } from "@/server/payment/paiements";

import { signalerSiBloquee } from "./blocage";
import { expirerExecutions, type ExecuteurGeneration, type ExecutionExpiree } from "./expiration";

/**
 * Réconciliation du voyage complet (spécification B9, B9d points 1 et 4 ; décisions 0081 B9-TL-12 points 1 à 4 et B9-TL-3
 * point 5, 0087 § 1.5 point 3 et § 1.6 point 1). Fonction idempotente, appelée par la suite du paiement (B4a, contexte système
 * de l'organisation), par `getGenerationStatus` et par `getFullTripStatus` (contexte de la session) :
 * 1. expiration des exécutions figées du voyage (`expirerExecutions`, la même fonction que `getGenerationStatus`) ; une ligne
 *    `full` expirée et bloquée écrit **un** `generation.full_stuck`, après la validation (écrivain unique, 0087 § 1.4) ;
 * 2. droit `tripUnlocked` lu par le cas d'usage de B4a (`lireDroitVoyage`) ; sans droit, rien d'autre ;
 * 3. aucune ligne `full` : créée (`INSERT … ON CONFLICT DO NOTHING` sur l'index unique partiel, « une fois par droit ») en
 *    `queued`, puis démarrée ; un voyage de deux jours ou moins n'a rien à compléter : la ligne est créée `ready`, sans appel
 *    (B9-PO-7). Tant que l'aperçu n'a publié aucune version, rien n'est créé (le voyage complet part de la dernière version) ;
 * 4. ligne `full` en `queued` sans `workflow_run_id` : réclamée par une écriture conditionnelle sur `updated_at` (un seul
 *    appelant la réclame), puis démarrée ; depuis une lecture d'état, seulement si elle n'a pas été touchée depuis 60 s
 *    (étouffement). C'est ainsi qu'une reprise du studio (écriture seule, 0087 § 1.6) est démarrée ;
 * 5. une ligne `failed` n'est **jamais** relancée (elle repaierait, B9-TL-12 point 4 ; B9-PO-17 point 5).
 * Le démarrage a lieu **après** la validation de la transaction ; l'identifiant d'exécution est écrit par une écriture
 * conditionnelle. Aucune donnée de lieu n'est lue ni écrite.
 */

export type TransactionReconciliation = <T>(travail: (executeur: ExecuteurGeneration) => Promise<T>) => Promise<T>;

/** Port de démarrage de `generateFullTrip` : identifiant de l'exécution du SDK, ou `null` si rien n'a démarré. */
export type DemarrerVoyageComplet = (generationRunId: string, organizationId: string) => Promise<string | null>;

export type CibleReconciliation = {
  readonly organizationId: string;
  readonly tripId: string;
  readonly maintenant: number;
  /** Vrai depuis une lecture d'état (étouffement de 60 s) ; faux depuis la suite du paiement. */
  readonly etouffement: boolean;
};

export type IssueReconciliation = {
  /** Exécution réclamée ou créée à démarrer par cet appel (`null` : rien à démarrer). */
  readonly aDemarrer: string | null;
  /** Vrai si le démarrage a rendu un identifiant d'exécution, écrit sur la ligne. */
  readonly demarre: boolean;
};

const SQL_VOYAGE = `SELECT (end_date - start_date + 1)::int AS jours, current_version FROM public.trips WHERE organization_id = $1 AND id = $2`;
const SQL_COMPLET = `SELECT id, phase, workflow_run_id, updated_at FROM public.generation_runs WHERE organization_id = $1 AND trip_id = $2 AND kind = 'full'`;
const SQL_CREATION = `INSERT INTO public.generation_runs (organization_id, trip_id, kind, phase, started_at, updated_at, finished_at)
  VALUES ($1, $2, 'full', $3,
    GREATEST($4::timestamptz, (SELECT max(started_at) + interval '1 millisecond' FROM public.generation_runs WHERE organization_id = $1 AND trip_id = $2)),
    $4::timestamptz, CASE WHEN $3 = 'ready' THEN $4::timestamptz END)
  ON CONFLICT (organization_id, trip_id) WHERE kind = 'full' DO NOTHING
  RETURNING id, phase`;
const SQL_RECLAMATION = `UPDATE public.generation_runs SET updated_at = $4::timestamptz
  WHERE organization_id = $1 AND id = $2 AND kind = 'full' AND phase = 'queued' AND workflow_run_id IS NULL AND date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $3::timestamptz)
  RETURNING id`;
const SQL_WORKFLOW = `UPDATE public.generation_runs SET workflow_run_id = $3
  WHERE organization_id = $1 AND id = $2 AND kind = 'full' AND workflow_run_id IS NULL`;

/** Voyage de deux jours ou moins : rien à compléter (B9-PO-7). */
const JOURS_SANS_COMPLEMENT = 2;

const instantDe = (valeur: unknown): string => (valeur instanceof Date ? valeur.toISOString() : new Date(String(valeur)).toISOString());

/** Écritures de la réconciliation, dans la transaction de l'appelant ; rend l'exécution à démarrer et les lignes expirées. */
export async function reconcilierDansTransaction(
  executeur: ExecuteurGeneration,
  cible: Omit<CibleReconciliation, "etouffement"> & { readonly etouffement: boolean },
): Promise<{ readonly aDemarrer: string | null; readonly expirees: readonly ExecutionExpiree[] }> {
  const { organizationId, tripId, maintenant } = cible;
  const expirees = await expirerExecutions(executeur, organizationId, tripId, maintenant);
  if ((await lireDroitVoyage(executeur, tripId)) === null) return { aDemarrer: null, expirees };
  const voyage = (await executeur.query(SQL_VOYAGE, [organizationId, tripId])).rows[0];
  if (voyage === undefined) return { aDemarrer: null, expirees };
  const instant = new Date(maintenant).toISOString();
  const ligne = (await executeur.query(SQL_COMPLET, [organizationId, tripId])).rows[0];
  if (ligne === undefined) {
    if (voyage.current_version === null || voyage.current_version === undefined) return { aDemarrer: null, expirees };
    const phase = Number(voyage.jours) <= JOURS_SANS_COMPLEMENT ? "ready" : "queued";
    const creee = (await executeur.query(SQL_CREATION, [organizationId, tripId, phase, instant])).rows[0];
    return { aDemarrer: creee !== undefined && creee.phase === "queued" ? String(creee.id) : null, expirees };
  }
  if (ligne.phase !== "queued" || (ligne.workflow_run_id !== null && ligne.workflow_run_id !== undefined)) return { aDemarrer: null, expirees };
  const touchee = instantDe(ligne.updated_at);
  if (cible.etouffement && Date.parse(touchee) > maintenant - ETOUFFEMENT_RECONCILIATION_MS) return { aDemarrer: null, expirees };
  const reclamee = (await executeur.query(SQL_RECLAMATION, [organizationId, ligne.id, touchee, instant])).rows[0];
  return { aDemarrer: reclamee === undefined ? null : String(reclamee.id), expirees };
}

/** Événements `generation.full_stuck` des lignes `full` expirées par cet appel (après la validation de sa transaction). */
export function signalerExpirees(organizationId: string, expirees: readonly ExecutionExpiree[]): void {
  for (const { complet } of expirees) if (complet !== null) signalerSiBloquee(organizationId, complet);
}

/** Démarre l'exécution réclamée (après validation) puis écrit son identifiant par une écriture conditionnelle. */
export async function demarrerReclamee(transaction: TransactionReconciliation, demarrer: DemarrerVoyageComplet, organizationId: string, generationRunId: string): Promise<boolean> {
  let workflowRunId: string | null;
  try {
    workflowRunId = await demarrer(generationRunId, organizationId);
  } catch {
    return false;
  }
  if (workflowRunId === null) return false;
  try {
    await transaction((x) => x.query(SQL_WORKFLOW, [organizationId, generationRunId, workflowRunId]));
  } catch {
    // Même issue qu'un démarrage perdu : la ligne `queued` avec un identifiant expire (B9-TL-3 point 5), celle sans identifiant
    // est réclamée de nouveau.
  }
  return true;
}

/** Réconciliation complète : écritures, événements des lignes expirées, démarrage. */
export async function reconcilierVoyageComplet(transaction: TransactionReconciliation, demarrer: DemarrerVoyageComplet, cible: CibleReconciliation): Promise<IssueReconciliation> {
  const { aDemarrer, expirees } = await transaction((x) => reconcilierDansTransaction(x, cible));
  signalerExpirees(cible.organizationId, expirees);
  if (aDemarrer === null) return { aDemarrer, demarre: false };
  return { aDemarrer, demarre: await demarrerReclamee(transaction, demarrer, cible.organizationId, aDemarrer) };
}
