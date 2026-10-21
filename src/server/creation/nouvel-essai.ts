import "server-only";

import type { AdapterContext } from "@/adapters/types";
import { fail, ok, type CreatedTrip, type Result } from "@/contracts";
import { RetryGenerationRequestSchema } from "@/contracts/creation";
import { MAX_REPRISES_PERSONNE } from "@/server/config/generation";
import { CODES_REESSAYABLES, relancable } from "@/server/generation/raison-echec";
import { demarrerReclamee } from "@/server/generation/reconciliation";
import { reprendreVoyageComplet } from "@/server/generation/reprise";
import { lireDroitVoyage } from "@/server/payment/paiements";

import {
  SQL_APERCU_ACTIF,
  SQL_NOUVELLE_EXECUTION,
  SQL_VERROU_APERCU,
  contexteValide,
  demarrer,
  executeurSql,
  identifiantVoyage,
  transactionDeSession,
  type Outils,
} from "./commun";

/**
 * `retryGeneration(ctx, { tripId, requestId, kind? })` (spécification B9, B9b point 3 bis ; B9-PO-9 ; décisions 0081
 * B9-TL-11 et 0087 § 1.1) : seul chemin d'un nouvel essai par la personne. Sous le verrou d'organisation de B9-PO-4 :
 * voyage d'une autre organisation ou inconnu → `not_found` ; `requestId` de `createTrip` → `validation_failed` (ce
 * n'est pas un essai) ; même `requestId` qu'un essai de ce voyage → le même `{ tripId }`
 * sans écriture (idempotence par `generation_runs.request_id`) ; sinon la dernière exécution `preview` du voyage doit
 * être `failed` et réessayable (`relancable`), sinon `validation_failed` ; une autre génération `preview` de
 * l'organisation en cours → `active_preview_exists` ; sinon une **nouvelle** exécution `preview` `queued` du même
 * voyage (jamais un second voyage), puis démarrage du workflow 1 après validation. Cette nouvelle exécution reprend, à son
 * étape `b`, les recherches et les candidats des essais précédents du voyage, ré-ancrés à l'étape `c`, au lieu de chercher à
 * nouveau les villes déjà cherchées (B9c-suite : décisions 0106 § 5 et 0105 § 6 ; `@/server/generation/reprise-recherches`). Rien
 * n'est écrit ici pour cela : ni la ligne précédente, ni un compteur.
 *
 * `kind: "full"` (B9d ; B9-PO-17 points 1 à 3 ; décisions 0087 § 1.1.4, § 1.3 et 0081 B9-TL-12 point 4) : reprise du voyage
 * complet par la personne. Voyage d'une autre organisation → `not_found` ; aucun droit `tripUnlocked` (lu par le cas d'usage de
 * B4a) → `validation_failed` ; sinon **une** écriture conditionnelle `failed` → `queued` de la ligne `full` (module feuille
 * `@/server/generation/reprise`), avec les causes réessayables de la conversion unique et le maximum de la configuration :
 * aucune ligne touchée → la ligne est relue : `requestId` déjà dans ses reprises (rejeu, ou concurrent gagnant de la même
 * requête) → le même `{ tripId }` sans écriture, sinon `validation_failed` (aucune ligne `full`, ligne qui n'est pas `failed`,
 * cause non réessayable, compteur épuisé, voyage repris par le studio). `active_preview_exists` ne s'applique pas (B9-PO-4 ne
 * compte que les aperçus). Ligne reprise : `generateFullTrip` est démarré après la validation (la même ligne, jamais une
 * seconde ; les jours déjà publiés restent, seuls les jours manquants sont planifiés) ; un démarrage échoué laisse la ligne
 * `queued` sans identifiant, que la réconciliation réclame (aucune reprise de plus n'est comptée).
 */

const SQL_REPRISES = `SELECT person_retry_request_ids::text[] AS reprises FROM public.generation_runs
  WHERE organization_id = $1 AND trip_id = $2 AND kind = 'full'`;

type IssueComplet = { readonly type: "inconnu" } | { readonly type: "rien" } | { readonly type: "existant" } | { readonly type: "repris"; readonly generationRunId: string };

async function reprendreParLaPersonne(o: Outils, ctx: AdapterContext, tripId: string, requestId: string): Promise<Result<CreatedTrip>> {
  const org = ctx.organizationId;
  let issue: IssueComplet;
  try {
    issue = await o.withOrg(ctx, async (tx): Promise<IssueComplet> => {
      const sql = executeurSql(tx);
      if ((await sql.query(SQL_VOYAGE, [org, tripId])).rows[0] === undefined) return { type: "inconnu" };
      if ((await lireDroitVoyage(sql, tripId)) === null) return { type: "rien" };
      const reprise = await reprendreVoyageComplet(
        sql,
        { organizationId: org, tripId, instant: new Date(o.maintenant()) },
        { type: "personne", requestId, causesReessayables: CODES_REESSAYABLES, maximum: MAX_REPRISES_PERSONNE },
      );
      if (reprise !== null) return { type: "repris", generationRunId: reprise.generationRunId };
      const ligne = (await sql.query(SQL_REPRISES, [org, tripId])).rows[0];
      const reprises = Array.isArray(ligne?.reprises) ? (ligne.reprises as unknown[]).map((id) => String(id).toLowerCase()) : [];
      return reprises.includes(requestId.toLowerCase()) ? { type: "existant" } : { type: "rien" };
    });
  } catch {
    return fail("provider_error");
  }
  switch (issue.type) {
    case "inconnu":
      return fail("not_found");
    case "rien":
      return fail("validation_failed");
    case "existant":
      return ok({ tripId });
    case "repris":
      await demarrerReclamee(transactionDeSession(o, ctx), o.demarrerVoyageComplet, org, issue.generationRunId);
      return ok({ tripId });
  }
}

const SQL_VOYAGE = "SELECT request_id FROM public.trips WHERE organization_id = $1 AND id = $2";
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
  if (kind === "full") return reprendreParLaPersonne(o, ctx, tripId, requestId);
  const org = ctx.organizationId;

  let issue: Issue;
  try {
    issue = await o.withOrg(ctx, async (tx): Promise<Issue> => {
      const sql = executeurSql(tx);
      await sql.query(SQL_VERROU_APERCU, [org]);
      const voyage = (await sql.query(SQL_VOYAGE, [org, tripId])).rows[0];
      if (voyage === undefined) return { type: "inconnu" };
      // Le `requestId` de `createTrip` désigne la première exécution, pas un essai : rien à relancer.
      if (String(voyage.request_id).toLowerCase() === requestId.toLowerCase()) return { type: "rien" };
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
