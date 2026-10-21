import "server-only";

import type { AdapterContext } from "@/adapters/types";
import { GenerationStatusSchema, fail, ok, type GenerationStatus, type Result } from "@/contracts";
import { CASES_APERCU, JOURS_APERCU } from "@/server/config/generation";
import { echecDeCode } from "@/server/generation/raison-echec";
import { reconcilierVoyageComplet } from "@/server/generation/reconciliation";

import { contexteValide, executeurSql, identifiantVoyage, transactionDeSession, type Outils } from "./commun";

/**
 * `getGenerationStatus(ctx, tripId)` (spécification B9, B9b point 5 ; B9-PO-12 ; décision 0081 B9-TL-3 point 5) :
 * 1. contexte de la session ; identifiant illisible, voyage inconnu ou d'une autre organisation → `not_found` (la RLS
 *    forcée ne rend que les lignes de l'organisation posée) ;
 * 2. réconciliation du voyage complet (B9d ; 0081 B9-TL-12 point 3, avec étouffement de 60 s), qui applique d'abord
 *    l'expiration des exécutions figées du voyage (`expirerExecutions`, horloge injectée) et écrit `generation.full_stuck`
 *    pour une ligne `full` expirée et bloquée ; elle ne relance jamais une ligne `failed` ;
 * 3. dernière exécution `preview` ou `full` du voyage : `queued` et `preparing` → `preparing` ; `ready`, `incomplete` ;
 *    `failed` → `failed` avec la raison et `retryable` de `echecDeCode` ;
 * 4. propositions prêtes par jour de l'aperçu (cases `proposal` de la dernière exécution `preview`, J1 et J2), qui ne
 *    changent qu'à la publication (étape e, B9-PO-12).
 * Ne lit que `phase`, `stop_reason` et des comptes : aucun nom de lieu, `placeId`, `step` ni `step_seq` ne sort. Sortie
 * validée par `GenerationStatusSchema` ; une ligne incohérente ou une erreur de base → `provider_error`.
 */

const SQL_VOYAGE = "SELECT id FROM public.trips WHERE organization_id = $1 AND id = $2";
const SQL_DERNIERE = `SELECT phase, stop_reason FROM public.generation_runs
  WHERE organization_id = $1 AND trip_id = $2 AND kind IN ('preview', 'full')
  ORDER BY started_at DESC, id DESC LIMIT 1`;
const SQL_APERCU = `SELECT id, phase FROM public.generation_runs
  WHERE organization_id = $1 AND trip_id = $2 AND kind = 'preview'
  ORDER BY started_at DESC, id DESC LIMIT 1`;
const SQL_COMPTES = `SELECT day, count(*) FILTER (WHERE slot_type = 'proposal')::int AS prets FROM public.proposals
  WHERE organization_id = $1 AND trip_id = $2 AND generation_run_id = $3 AND phase = 'preview'
  GROUP BY day`;

const PUBLIEES: ReadonlySet<unknown> = new Set(["ready", "incomplete"]);

type Lu = { readonly type: "inconnu" } | { readonly type: "etat"; readonly etat: unknown };

export async function lireEtatGeneration(o: Outils, ctx: AdapterContext | null | undefined, tripId: unknown): Promise<Result<GenerationStatus>> {
  if (!contexteValide(ctx)) return fail("unauthenticated");
  if (!identifiantVoyage(tripId)) return fail("not_found");
  const org = ctx.organizationId;
  let lu: Lu;
  try {
    await reconcilierVoyageComplet(transactionDeSession(o, ctx), o.demarrerVoyageComplet, { organizationId: org, tripId, maintenant: o.maintenant(), etouffement: true });
    lu = await o.withOrg(ctx, async (tx): Promise<Lu> => {
      const sql = executeurSql(tx);
      if ((await sql.query(SQL_VOYAGE, [org, tripId])).rows.length === 0) return { type: "inconnu" };
      const derniere = (await sql.query(SQL_DERNIERE, [org, tripId])).rows[0];
      if (derniere === undefined) throw new Error("état : aucune exécution");
      const apercu = (await sql.query(SQL_APERCU, [org, tripId])).rows[0];
      const comptes = new Map<number, number>();
      if (apercu !== undefined) {
        for (const ligne of (await sql.query(SQL_COMPTES, [org, tripId, apercu.id])).rows) comptes.set(Number(ligne.day), Number(ligne.prets));
      }
      const etatDesJours = apercu !== undefined && PUBLIEES.has(apercu.phase) ? "ready" : "preparing";
      const days = Array.from({ length: JOURS_APERCU }, (_, rang) => ({
        index: rang + 1,
        state: etatDesJours,
        readyStops: comptes.get(rang + 1) ?? 0,
      }));
      const champs = { tripId, days, expected: CASES_APERCU, ready: days.reduce((total, jour) => total + jour.readyStops, 0) };
      switch (derniere.phase) {
        case "queued":
        case "preparing":
          return { type: "etat", etat: { phase: "preparing", ...champs } };
        case "ready":
        case "incomplete":
          return { type: "etat", etat: { phase: derniere.phase, ...champs } };
        case "failed": {
          const echec = echecDeCode(typeof derniere.stop_reason === "string" ? derniere.stop_reason : null);
          return { type: "etat", etat: { phase: "failed", ...champs, reason: echec.reason, retryable: echec.retryable } };
        }
        default:
          throw new Error("état : phase illisible");
      }
    });
  } catch {
    return fail("provider_error");
  }
  if (lu.type === "inconnu") return fail("not_found");
  const sortie = GenerationStatusSchema.safeParse(lu.etat);
  return sortie.success ? ok(sortie.data) : fail("provider_error");
}
