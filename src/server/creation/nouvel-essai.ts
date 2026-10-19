import "server-only";

import type { AdapterContext } from "@/adapters/types";
import { fail, ok, type CreatedTrip, type Result } from "@/contracts";
import { RetryGenerationRequestSchema } from "@/contracts/creation";
import { relancable } from "@/server/generation/raison-echec";

import {
  SQL_APERCU_ACTIF,
  SQL_NOUVELLE_EXECUTION,
  SQL_VERROU_APERCU,
  contexteValide,
  demarrer,
  executeurSql,
  identifiantVoyage,
  type Outils,
} from "./commun";

/**
 * `retryGeneration(ctx, { tripId, requestId, kind? })` (spécification B9, B9b point 3 bis ; B9-PO-9 ; décisions 0081
 * B9-TL-11 et 0087 § 1.1) : seul chemin d'un nouvel essai par la personne. Sous le verrou d'organisation de B9-PO-4 :
 * voyage d'une autre organisation ou inconnu → `not_found` ; même `requestId` pour ce voyage → le même `{ tripId }`
 * sans écriture (idempotence par `generation_runs.request_id`) ; sinon la dernière exécution `preview` du voyage doit
 * être `failed` et réessayable (`relancable`), sinon `validation_failed` ; une autre génération `preview` de
 * l'organisation en cours → `active_preview_exists` ; sinon une **nouvelle** exécution `preview` `queued` du même
 * voyage (jamais un second voyage), puis démarrage du workflow 1 après validation.
 *
 * `kind: "full"` (0087 § 1.1.4) : aucune ligne `full` n'existe avant B9d, donc rien n'est à relancer :
 * `validation_failed`, sans écriture (B9d remplace cette branche).
 */

const SQL_VOYAGE = "SELECT id FROM public.trips WHERE organization_id = $1 AND id = $2";
const SQL_MEME_DEMANDE = "SELECT id FROM public.generation_runs WHERE organization_id = $1 AND trip_id = $2 AND request_id = $3";
const SQL_DERNIERE = `SELECT phase, stop_reason FROM public.generation_runs
  WHERE organization_id = $1 AND trip_id = $2 AND kind = 'preview'
  ORDER BY started_at DESC, id DESC LIMIT 1`;

type Issue =
  | { readonly type: "inconnu" }
  | { readonly type: "rien" }
  | { readonly type: "existant" }
  | { readonly type: "actif"; readonly tripId: string }
  | { readonly type: "cree"; readonly generationRunId: string };

export async function relancerGeneration(o: Outils, ctx: AdapterContext | null | undefined, entree: unknown): Promise<Result<CreatedTrip>> {
  if (!contexteValide(ctx)) return fail("unauthenticated");
  const parsed = RetryGenerationRequestSchema.safeParse(entree);
  if (!parsed.success) return fail("validation_failed");
  const { tripId, requestId, kind = "preview" } = parsed.data;
  if (!identifiantVoyage(tripId)) return fail("not_found");
  const org = ctx.organizationId;

  let issue: Issue;
  try {
    issue = await o.withOrg(ctx, async (tx): Promise<Issue> => {
      const sql = executeurSql(tx);
      await sql.query(SQL_VERROU_APERCU, [org]);
      if ((await sql.query(SQL_VOYAGE, [org, tripId])).rows.length === 0) return { type: "inconnu" };
      if (kind === "full") return { type: "rien" };
      if ((await sql.query(SQL_MEME_DEMANDE, [org, tripId, requestId])).rows.length > 0) return { type: "existant" };
      const derniere = (await sql.query(SQL_DERNIERE, [org, tripId])).rows[0];
      if (derniere === undefined || derniere.phase !== "failed") return { type: "rien" };
      const code = typeof derniere.stop_reason === "string" ? derniere.stop_reason : null;
      if (!relancable(code)) return { type: "rien" };
      const actif = (await sql.query(SQL_APERCU_ACTIF, [org])).rows[0];
      if (actif !== undefined) return { type: "actif", tripId: String(actif.trip_id) };
      const execution = (await sql.query(SQL_NOUVELLE_EXECUTION, [org, tripId, requestId, new Date(o.maintenant()).toISOString()])).rows[0];
      if (execution === undefined) throw new Error("nouvel essai : exécution non écrite");
      return { type: "cree", generationRunId: String(execution.id) };
    });
  } catch {
    return fail("provider_error");
  }

  switch (issue.type) {
    case "inconnu":
      return fail("not_found");
    case "rien":
      return fail("validation_failed");
    case "actif":
      return { ok: false, error: { code: "active_preview_exists", activeTripId: issue.tripId } };
    case "cree":
      await demarrer(o, ctx, issue.generationRunId);
      return ok({ tripId });
    case "existant":
      return ok({ tripId });
  }
}
