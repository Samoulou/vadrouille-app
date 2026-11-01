import "server-only";

import type { AdapterContext } from "@/adapters/types";
import { fail, ok, type Result, type TripRemindersStatus } from "@/contracts";
import { TripRemindersRequestSchema, TripRemindersUpdateSchema } from "@/contracts/rappels";
import type { HeadersLike } from "@/server/ip";
import { errorNameOf, logEvent } from "@/server/log";
import { parseInput } from "@/server/parse-input";
import type { RateLimitRequest, RateLimitVerdict } from "@/server/rate-limit";
import { identifiantLisible } from "@/server/voyages/conversion";
import { executeurSql, withOrg as withOrgParDefaut, type OrgTransaction } from "@/server/with-org";

import type { EtatRappel } from "./etat";

/**
 * Accord et retrait des rappels par e-mail (M6c, ticket 1021 ; spécification M6 § 5.2 ; décision 0157 § 1.7 points 1, 5 et
 * 6, § 1.8). Cœur des actions de `src/server/actions/rappels.ts`, **jamais** sous `"use server"`, dépendances injectées.
 *
 * **Activation** (`enabled: true`), dans cet ordre : garde (rappels disponibles : adaptateur `api`, port des notifications
 * branché, origine connue ; sinon `not_found`) → session (`unauthenticated`) → entrée stricte (`validation_failed`) → voyage
 * dans l'organisation, débloqué, **personne propriétaire** (`trips.created_by`), sinon `not_found` → limite `rappels-accord`
 * (espèce `ip` puis `trip`, après ce contrôle ; au-delà `rate_limited`, rien n'est écrit et aucun workflow ne démarre) →
 * écriture de l'accord par ses **trois** colonnes `(organization_id, trip_id, user_id)` (`id`, `consented_at` et
 * `withdrawn_at` viennent de la base, droits de 0024) → démarrage d'**un** workflow par accord, entrée identifiants seuls.
 * Un accord déjà actif (index unique partiel) : rien n'est écrit ni démarré, l'état actif est rendu. Démarrage échoué : retrait
 * de cet accord dans une seconde transaction, puis `internal` (jamais un accord affiché actif sans exécution).
 *
 * **Retrait** (`enabled: false`) : **jamais refusé par la limite** (RGPD art. 7 (3)). Session → entrée → espèce `ip` de
 * `rappels-accord` **comptée** (verdict ignoré, panne comprise) → lignes `(organization_id, trip_id, user_id)` de la session :
 * aucune → `not_found` (voyage inconnu, accord jamais donné, accord d'une autre personne ou organisation : indiscernables) ;
 * sinon `UPDATE … SET withdrawn_at` sur l'accord actif (la base pose l'instant, déclencheur de 0024 ; zéro ligne si tout est
 * déjà retiré : succès idempotent) → espèce `trip` **comptée** seulement si une ligne existe (0147 § 6.4 point 1). Aucun
 * contrôle du voyage, de son déblocage ni de la personne propriétaire ; la garde de disponibilité ne s'applique pas non plus :
 * un accord se retire toujours. Aucun workflow n'est démarré : l'exécution se termine à son réveil suivant.
 *
 * **État** (`getTripReminders`) : garde, session, entrée, voyage dans l'organisation et personne propriétaire, puis
 * `{ active }` (un accord non retiré existe). Aucune limite (lecture seule).
 *
 * Toute erreur inattendue devient `internal` et écrit `voyages.action_failed` (nom de l'action, classe de l'erreur) ;
 * aucune adresse, aucun texte n'est écrit en base ni journalisé.
 */

type FonctionWithOrg = <T>(ctx: Pick<AdapterContext, "organizationId" | "userId">, fn: (tx: OrgTransaction) => Promise<T>) => Promise<T>;

/** Démarrage du workflow d'un accord (`demarrerRappels` de `src/workflows/index.ts`). */
export type DemarrerRappels = (entree: EtatRappel) => Promise<{ readonly ok: boolean }>;

export type DependancesRappels = {
  /** Rappels disponibles : adaptateur `api`, port des notifications branché, origine connue (composition du serveur). */
  readonly disponibles: () => boolean;
  /** Contexte de la session, ou `null` sans session ; jamais une valeur de l'entrée. */
  readonly contexte: () => Promise<AdapterContext | null>;
  /** En-têtes de la requête (clé d'adresse du limiteur). */
  readonly headers: () => Promise<HeadersLike>;
  /** Limiteur `rappels-accord` complet (espèces `ip` puis `trip`) : verdict de l'activation. */
  readonly verdict: (request: RateLimitRequest) => Promise<RateLimitVerdict>;
  /** Compte une seule espèce de `rappels-accord` pour le retrait ; verdict ignoré, ne lève jamais. */
  readonly compter: (espece: "ip" | "trip", request: RateLimitRequest) => Promise<void>;
  readonly demarrer: DemarrerRappels;
  /** Tests seulement : `withOrg` lié à un client de test. */
  readonly withOrg?: FonctionWithOrg;
};

export const ACTION_LIMITEUR_RAPPELS = "rappels-accord";

/** Voyage dans l'organisation : propriétaire et droit « débloqué ». */
export const SQL_VOYAGE_ACCORD = `SELECT t.created_by::text AS created_by,
  EXISTS (SELECT 1 FROM public.entitlements e WHERE e.organization_id = t.organization_id AND e.trip_id = t.id AND e.kind = 'tripUnlocked') AS debloque
  FROM public.trips t WHERE t.organization_id = $1 AND t.id = $2`;
/** Accord : **trois colonnes seulement** (droits par colonne de 0024) ; déjà actif → aucune ligne (index unique partiel). */
export const SQL_INSERT_ACCORD = `INSERT INTO public.reminder_consents (organization_id, trip_id, user_id) VALUES ($1, $2, $3)
  ON CONFLICT (organization_id, trip_id, user_id) WHERE withdrawn_at IS NULL DO NOTHING RETURNING id::text AS id`;
/** Lignes d'accord de la personne pour ce voyage : leur nombre et s'il en reste un actif. */
export const SQL_ACCORDS = `SELECT count(*)::int AS n, count(*) FILTER (WHERE withdrawn_at IS NULL)::int AS actifs
  FROM public.reminder_consents WHERE organization_id = $1 AND trip_id = $2 AND user_id = $3`;
/** Retrait : `withdrawn_at` reçoit une valeur non nulle, la base pose l'instant (déclencheur `reminder_consents_withdraw_once`). */
export const SQL_RETRAIT = `UPDATE public.reminder_consents SET withdrawn_at = pg_catalog.now()
  WHERE organization_id = $1 AND trip_id = $2 AND user_id = $3 AND withdrawn_at IS NULL`;
/** Retrait d'un accord dont le workflow n'a pas démarré (0157 § 1.7 point 6). */
export const SQL_RETRAIT_ACCORD = `UPDATE public.reminder_consents SET withdrawn_at = pg_catalog.now()
  WHERE organization_id = $1 AND trip_id = $2 AND user_id = $3 AND id = $4 AND withdrawn_at IS NULL`;

type NomActionRappels = "set-trip-reminders" | "get-trip-reminders";

function interne(nom: NomActionRappels, erreur: unknown): Result<never> {
  const errorName = errorNameOf(erreur);
  logEvent("voyages.action_failed", { action: nom, ...(errorName === undefined ? {} : { errorName }) }, "error");
  return fail("internal");
}

/** Voyage de la session : `null` s'il est inconnu, d'une autre organisation, ou d'une autre personne. */
async function voyageDeLaPersonne(
  executeur: ReturnType<typeof executeurSql>,
  ctx: AdapterContext,
  tripId: string,
): Promise<{ readonly debloque: boolean } | null> {
  const ligne = (await executeur.query(SQL_VOYAGE_ACCORD, [ctx.organizationId, tripId])).rows[0];
  if (ligne === undefined || ligne.created_by !== ctx.userId.toLowerCase()) return null;
  return { debloque: ligne.debloque === true };
}

async function activer(ctx: AdapterContext, tripId: string, deps: DependancesRappels, withOrg: FonctionWithOrg): Promise<Result<TripRemindersStatus>> {
  const voyage = await withOrg(ctx, (tx) => voyageDeLaPersonne(executeurSql(tx), ctx, tripId));
  if (voyage === null || !voyage.debloque) return fail("not_found");
  const verdict = await deps.verdict({
    action: ACTION_LIMITEUR_RAPPELS,
    headers: await deps.headers(),
    tripId,
  });
  if (!verdict.ok) return { ok: false, error: { code: "rate_limited", retryable: true } };
  const consentId = await withOrg(ctx, async (tx) => {
    const ligne = (await executeurSql(tx).query(SQL_INSERT_ACCORD, [ctx.organizationId, tripId, ctx.userId])).rows[0];
    return typeof ligne?.id === "string" ? ligne.id : null;
  });
  // Accord déjà actif : son exécution existe déjà ; rien n'est écrit ni démarré.
  if (consentId === null) return ok({ active: true });
  const demarrage = await deps.demarrer({
    organizationId: ctx.organizationId,
    tripId,
    userId: ctx.userId,
    consentId,
  });
  if (demarrage.ok) return ok({ active: true });
  await withOrg(ctx, (tx) => executeurSql(tx).query(SQL_RETRAIT_ACCORD, [ctx.organizationId, tripId, ctx.userId, consentId]));
  return fail("internal");
}

/** Compte une espèce du limiteur sans jamais refuser ni lever (retrait, 0157 § 1.7 point 5). */
async function compterSansRefus(deps: DependancesRappels, espece: "ip" | "trip", request: RateLimitRequest): Promise<void> {
  try {
    await deps.compter(espece, request);
  } catch {
    // Panne du limiteur : le retrait réussit quand même.
  }
}

async function retirer(ctx: AdapterContext, tripId: string, deps: DependancesRappels, withOrg: FonctionWithOrg): Promise<Result<TripRemindersStatus>> {
  let headers: HeadersLike | null = null;
  try {
    headers = await deps.headers();
  } catch {
    headers = null;
  }
  if (headers !== null)
    await compterSansRefus(deps, "ip", {
      action: ACTION_LIMITEUR_RAPPELS,
      headers,
    });
  const trouve = await withOrg(ctx, async (tx) => {
    const executeur = executeurSql(tx);
    const lignes = (await executeur.query(SQL_ACCORDS, [ctx.organizationId, tripId, ctx.userId])).rows[0];
    if (Number(lignes?.n ?? 0) === 0) return false;
    if (Number(lignes?.actifs ?? 0) > 0) await executeur.query(SQL_RETRAIT, [ctx.organizationId, tripId, ctx.userId]);
    return true;
  });
  if (!trouve) return fail("not_found");
  if (headers !== null)
    await compterSansRefus(deps, "trip", {
      action: ACTION_LIMITEUR_RAPPELS,
      headers,
      tripId,
    });
  return ok({ active: false });
}

/** `setTripReminders` : accord (`enabled: true`) ou retrait (`enabled: false`) de la personne de la session. */
export async function modifierRappels(input: unknown, deps: DependancesRappels): Promise<Result<TripRemindersStatus>> {
  try {
    const enabled = typeof input === "object" && input !== null && (input as { enabled?: unknown }).enabled === true;
    // La garde ne vaut que pour l'activation : un accord se retire toujours.
    if (enabled && !deps.disponibles()) return fail("not_found");
    const ctx = await deps.contexte();
    if (ctx === null) return fail("unauthenticated");
    const lue = parseInput(TripRemindersUpdateSchema, input);
    if (!lue.ok) return lue;
    if (!identifiantLisible(lue.value.tripId)) return fail("not_found");
    const tripId = lue.value.tripId.toLowerCase();
    const withOrg = deps.withOrg ?? withOrgParDefaut;
    return lue.value.enabled ? await activer(ctx, tripId, deps, withOrg) : await retirer(ctx, tripId, deps, withOrg);
  } catch (erreur) {
    return interne("set-trip-reminders", erreur);
  }
}

/** `getTripReminders` : état de l'accord de la personne de la session pour ce voyage. */
export async function lireRappels(
  input: unknown,
  deps: Pick<DependancesRappels, "disponibles" | "contexte" | "withOrg">,
): Promise<Result<TripRemindersStatus>> {
  try {
    if (!deps.disponibles()) return fail("not_found");
    const ctx = await deps.contexte();
    if (ctx === null) return fail("unauthenticated");
    const lue = parseInput(TripRemindersRequestSchema, input);
    if (!lue.ok) return lue;
    if (!identifiantLisible(lue.value.tripId)) return fail("not_found");
    const tripId = lue.value.tripId.toLowerCase();
    const etat = await (deps.withOrg ?? withOrgParDefaut)(ctx, async (tx) => {
      const executeur = executeurSql(tx);
      if ((await voyageDeLaPersonne(executeur, ctx, tripId)) === null) return null;
      const lignes = (await executeur.query(SQL_ACCORDS, [ctx.organizationId, tripId, ctx.userId])).rows[0];
      return { active: Number(lignes?.actifs ?? 0) > 0 };
    });
    return etat === null ? fail("not_found") : ok(etat);
  } catch (erreur) {
    return interne("get-trip-reminders", erreur);
  }
}
