import "server-only";

import type { AdapterContext } from "@/adapters/types";
import { TRIP_ID_PATTERN } from "@/contracts/values";
import { executeurSql, withOrg as withOrgParDefaut, type OrgTransaction } from "@/server/with-org";

import type { ChaineApercu } from "@/server/config/generation";
import { chaineDe } from "@/server/generation/chaine";
import type { DemarrerVoyageComplet, TransactionReconciliation } from "@/server/generation/reconciliation";

import { demarrerApercuReel, demarrerProgrammeReel, demarrerVoyageCompletReel, type DemarrerApercu } from "./demarrage";

/**
 * Dépendances et outils communs des cas d'usage de la création (spécification B9, B9b ; décision 0081 B9-TL-1 :
 * `src/server/creation/`). Les tests injectent `withOrg` (client de test), l'horloge et l'espion du démarrage ; aucun
 * appelant applicatif ne les pose.
 */

type FonctionWithOrg = <T>(ctx: Pick<AdapterContext, "organizationId" | "userId">, fn: (tx: OrgTransaction) => Promise<T>) => Promise<T>;

export interface DependancesCreation {
  /** **Tests seulement** : `withOrg` de `src/server/with-org.ts` par défaut. */
  readonly withOrg?: FonctionWithOrg;
  /** Horloge (instant en millisecondes) ; `Date.now` par défaut. */
  readonly maintenant?: () => number;
  /** Démarrage du workflow 1 ; `generatePreview` par défaut (B9c), un double sans appel (`demarrerApercuSansAppel`) dans les tests. */
  readonly demarrerApercu?: DemarrerApercu;
  /** Démarrage du workflow 4 (B9d) ; `generateFullTrip` par défaut, un double sans appel dans les tests. */
  readonly demarrerVoyageComplet?: DemarrerVoyageComplet;
  /**
   * Chaîne de l'aperçu (décision 0136 § 4.2) : un jeu de dépendances injecté qui ne la nomme pas vaut `"ancienne"` ; sans jeu
   * injecté (adaptateur `api` de production), `CHAINE_APERCU`, lue à chaque appel.
   */
  readonly chaine?: ChaineApercu;
}

export interface Outils {
  readonly withOrg: FonctionWithOrg;
  readonly maintenant: () => number;
  readonly demarrerApercu: DemarrerApercu;
  readonly demarrerVoyageComplet: DemarrerVoyageComplet;
  /** Chaîne de l'aperçu, lue **à chaque appel** (0136 § 4.2 : aucune valeur en cache). */
  chaine(): ChaineApercu;
}

/**
 * Outils des cas d'usage. `dependances` absent : la composition de l'app (production), qui lit `CHAINE_APERCU` à l'appel ;
 * présent : un jeu injecté (tests), dont la chaîne vaut `"ancienne"` s'il ne la nomme pas. Le démarrage par défaut suit la
 * chaîne (`generatePreview` ou `generateProgramme`) ; un démarrage injecté (`demarrerApercu`) sert les deux.
 */
export function outils(dependances?: DependancesCreation): Outils {
  const d = dependances ?? {};
  const chaine = () => chaineDe(dependances);
  return {
    withOrg: d.withOrg ?? withOrgParDefaut,
    maintenant: d.maintenant ?? Date.now,
    demarrerApercu: d.demarrerApercu ?? ((generationRunId, organizationId) => (chaine() === "inversee" ? demarrerProgrammeReel : demarrerApercuReel)(generationRunId, organizationId)),
    demarrerVoyageComplet: d.demarrerVoyageComplet ?? demarrerVoyageCompletReel,
    chaine,
  };
}

/** Transaction de la session pour la réconciliation (contexte de la personne, B9-TL-12 point 3). */
export function transactionDeSession(o: Outils, ctx: AdapterContext): TransactionReconciliation {
  return (travail) => o.withOrg(ctx, (tx) => travail(executeurSql(tx)));
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
    workflowRunId = await o.demarrerApercu(generationRunId, ctx.organizationId);
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
