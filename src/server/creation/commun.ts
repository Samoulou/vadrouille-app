import "server-only";

import type { AdapterContext } from "@/adapters/types";
import { TRIP_ID_PATTERN } from "@/contracts/values";
import { executeurSql, withOrg as withOrgParDefaut, type OrgTransaction } from "@/server/with-org";

import { demarrerApercuSansAppel, type DemarrerApercu } from "./demarrage";

/**
 * Dépendances et outils communs des cas d'usage de la création (spécification B9, B9b ; décision 0081 B9-TL-1 :
 * `src/server/creation/`). Les tests injectent `withOrg` (client de test), l'horloge et l'espion du démarrage ; aucun
 * appelant applicatif ne les pose, sauf `demarrerApercu` que B9c branchera sur le workflow 1.
 */

type FonctionWithOrg = <T>(ctx: Pick<AdapterContext, "organizationId" | "userId">, fn: (tx: OrgTransaction) => Promise<T>) => Promise<T>;

export interface DependancesCreation {
  /** **Tests seulement** : `withOrg` de `src/server/with-org.ts` par défaut. */
  readonly withOrg?: FonctionWithOrg;
  /** Horloge (instant en millisecondes) ; `Date.now` par défaut. */
  readonly maintenant?: () => number;
  /** Démarrage du workflow 1 ; le double sans appel par défaut (B9b). */
  readonly demarrerApercu?: DemarrerApercu;
}

export interface Outils {
  readonly withOrg: FonctionWithOrg;
  readonly maintenant: () => number;
  readonly demarrerApercu: DemarrerApercu;
}

export function outils(dependances: DependancesCreation): Outils {
  return {
    withOrg: dependances.withOrg ?? withOrgParDefaut,
    maintenant: dependances.maintenant ?? Date.now,
    demarrerApercu: dependances.demarrerApercu ?? demarrerApercuSansAppel,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Contexte d'une action authentifiée : organisation et personne en `uuid` (sinon `unauthenticated`, rien n'est lu). */
export function contexteValide(ctx: AdapterContext | null | undefined): ctx is AdapterContext {
  return ctx != null && typeof ctx.organizationId === "string" && UUID.test(ctx.organizationId) && typeof ctx.userId === "string" && UUID.test(ctx.userId);
}

/** Identifiant de voyage lisible en base : `TRIP_ID_PATTERN`, puis `uuid` ; sinon inconnu, sans requête (B6-PO-11). */
export function identifiantVoyage(tripId: unknown): tripId is string {
  return typeof tripId === "string" && TRIP_ID_PATTERN.test(tripId) && UUID.test(tripId);
}

export { executeurSql };

/** Verrou de la règle « un aperçu actif à la fois » de l'organisation (B9-PO-4), pour la durée de la transaction. */
export const SQL_VERROU_APERCU = "SELECT pg_advisory_xact_lock(hashtextextended('vadrouille:apercu:' || $1::text, 0))";

/** Aperçu actif de l'organisation (B9-PO-4) : une exécution `preview` en `queued` ou `preparing`. */
export const SQL_APERCU_ACTIF = `SELECT trip_id FROM public.generation_runs
  WHERE organization_id = $1 AND kind = 'preview' AND phase IN ('queued', 'preparing')
  ORDER BY started_at DESC LIMIT 1`;

/**
 * Nouvelle exécution `preview` en `queued` (B9b point 2, B9-TL-11). `started_at` est strictement postérieur à celui de
 * toute exécution du voyage (horloge en retard ou égale) : « la dernière exécution » (`ORDER BY started_at DESC`) est
 * toujours la plus récente créée, sous le verrou d'organisation.
 */
export const SQL_NOUVELLE_EXECUTION = `INSERT INTO public.generation_runs (organization_id, trip_id, kind, phase, request_id, started_at, updated_at)
  VALUES ($1, $2, 'preview', 'queued', $3,
    GREATEST($4::timestamptz, (SELECT max(started_at) + interval '1 millisecond' FROM public.generation_runs WHERE organization_id = $1 AND trip_id = $2)),
    $4::timestamptz)
  RETURNING id`;

const SQL_WORKFLOW = `UPDATE public.generation_runs SET workflow_run_id = $3
  WHERE organization_id = $1 AND id = $2 AND workflow_run_id IS NULL`;

/**
 * Démarrage après validation de la transaction : un seul appel du port par exécution créée. Une erreur du port n'est
 * ni rendue ni journalisée (l'exécution reste `queued` et expire, B9-TL-3 point 5) ; un identifiant rendu est écrit par
 * une écriture conditionnelle.
 */
export async function demarrer(o: Outils, ctx: AdapterContext, generationRunId: string): Promise<void> {
  let workflowRunId: string | null;
  try {
    workflowRunId = await o.demarrerApercu(generationRunId);
  } catch {
    return;
  }
  if (workflowRunId === null) return;
  try {
    await o.withOrg(ctx, (tx) => executeurSql(tx).query(SQL_WORKFLOW, [ctx.organizationId, generationRunId, workflowRunId]));
  } catch {
    // Même issue qu'un démarrage perdu : l'exécution expire (B9-TL-3 point 5).
  }
}
