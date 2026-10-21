import "server-only";

import type { AdapterContext } from "@/adapters/types";
import { FullTripStatusSchema, fail, ok, type FullTripStatus, type Result } from "@/contracts";
import { MAX_REPRISES_PERSONNE } from "@/server/config/generation";
import { reconcilierVoyageComplet } from "@/server/generation/reconciliation";
import { estBloquee } from "@/server/generation/voyage-complet";
import { lireDroitVoyage } from "@/server/payment/paiements";

import { contexteValide, executeurSql, identifiantVoyage, transactionDeSession, type Outils } from "./commun";

/**
 * `getFullTripStatus(ctx, tripId)` (spécification B9, B9d point 5 ; décision 0087 § 1.5) : état du voyage complet, source des
 * deux bandeaux `error` de Séjour et de 6b.
 * 1. contexte de la session ; identifiant illisible, voyage inconnu ou d'une autre organisation → `not_found` ;
 * 2. réconciliation du voyage complet, par **les mêmes fonctions** que `getGenerationStatus` (expiration, création ou
 *    redémarrage d'une ligne `queued` sans identifiant, étouffement de 60 s) ; jamais la relance d'une ligne `failed` : ouvrir
 *    Séjour ou interroger l'état ne relance rien (B9-PO-17 point 5) ;
 * 3. aucun droit `tripUnlocked` ou aucune ligne `full` → `none` ; `queued` et `preparing` → `preparing` ; `ready`,
 *    `incomplete` ; `failed` → `retryable` vrai si et seulement si « Réessayer » est proposé (cause réessayable et ligne non
 *    bloquée, 0087 § 1.4). Ni reprises restantes, ni raison, ni nom de lieu, ni rang ne sortent. Sortie validée par
 *    `FullTripStatusSchema` ; une ligne incohérente ou une erreur de base → `provider_error`.
 */

const SQL_VOYAGE = "SELECT id FROM public.trips WHERE organization_id = $1 AND id = $2";
const SQL_COMPLET = `SELECT phase, stop_reason, cardinality(person_retry_request_ids)::int AS reprises_personne, studio_retries
  FROM public.generation_runs WHERE organization_id = $1 AND trip_id = $2 AND kind = 'full'`;

type Lu = { readonly type: "inconnu" } | { readonly type: "etat"; readonly etat: unknown };

export async function lireEtatVoyageComplet(o: Outils, ctx: AdapterContext | null | undefined, tripId: unknown): Promise<Result<FullTripStatus>> {
  if (!contexteValide(ctx)) return fail("unauthenticated");
  if (!identifiantVoyage(tripId)) return fail("not_found");
  const org = ctx.organizationId;
  let lu: Lu;
  try {
    await reconcilierVoyageComplet(transactionDeSession(o, ctx), o.demarrerVoyageComplet, { organizationId: org, tripId, maintenant: o.maintenant(), etouffement: true });
    lu = await o.withOrg(ctx, async (tx): Promise<Lu> => {
      const sql = executeurSql(tx);
      if ((await sql.query(SQL_VOYAGE, [org, tripId])).rows.length === 0) return { type: "inconnu" };
      if ((await lireDroitVoyage(sql, tripId)) === null) return { type: "etat", etat: { phase: "none", tripId } };
      const ligne = (await sql.query(SQL_COMPLET, [org, tripId])).rows[0];
      if (ligne === undefined) return { type: "etat", etat: { phase: "none", tripId } };
      switch (ligne.phase) {
        case "queued":
        case "preparing":
          return { type: "etat", etat: { phase: "preparing", tripId } };
        case "ready":
        case "incomplete":
          return { type: "etat", etat: { phase: ligne.phase, tripId } };
        case "failed": {
          const bloquee = estBloquee(
            {
              phase: "failed",
              stopReason: typeof ligne.stop_reason === "string" ? ligne.stop_reason : null,
              reprisesPersonne: Number(ligne.reprises_personne),
              reprisesStudio: Number(ligne.studio_retries),
            },
            MAX_REPRISES_PERSONNE,
          );
          return { type: "etat", etat: { phase: "failed", tripId, retryable: !bloquee } };
        }
        default:
          throw new Error("état du voyage complet : phase illisible");
      }
    });
  } catch {
    return fail("provider_error");
  }
  if (lu.type === "inconnu") return fail("not_found");
  const sortie = FullTripStatusSchema.safeParse(lu.etat);
  return sortie.success ? ok(sortie.data) : fail("provider_error");
}
