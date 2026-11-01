import "server-only";

import { headers } from "next/headers";

import { hashShareToken, randomShareToken } from "@/adapters/share-token";
import type { AdapterContext } from "@/adapters/types";
import { fail, ok, type CreatedShareLink, type Result, type ShareStatus } from "@/contracts";
import { CreatedShareLinkSchema, ShareStatusSchema } from "@/contracts/share";
import { localDateAt } from "@/features/voyage/today";
import { accessUntil } from "@/lib/dates";
import { OFFER_CONFIG } from "@/server/config/offer";
import type { HeadersLike } from "@/server/ip";
import { verdictRateLimit, type RateLimitRequest, type RateLimitVerdict } from "@/server/rate-limit";
import { executeurSql, withOrg as withOrgParDefaut, type OrgTransaction } from "@/server/with-org";

/**
 * Lien privé sur `api` : création, remplacement, désactivation et état (spécification M6 § 3.2 ; décision 0157 § 1.2,
 * § 1.3 et § 1.9 ; décision 0158 § 3 point 6 ; ticket 1013, M6a). Cas d'usage appelés par l'adaptateur `api` du partage
 * (`src/adapters/api-share.ts`, branché par `src/instrumentation.ts`), après la garde et la session des actions
 * (`src/server/actions/partage.ts`). Chaque cas d'usage tient dans **une** transaction `withOrg` (organisation et
 * personne de la session, RLS de `vadrouille_app`), dans cet ordre (0157 § 1.2) :
 * 1. voyage dans l'organisation (requête bornée par `organization_id = $1`, en plus de la RLS), **personne
 *    propriétaire** (`trips.created_by = ctx.userId`, sinon `not_found` : la RLS ne connaît que l'organisation) et,
 *    sauf pour la désactivation, voyage débloqué (ligne `tripUnlocked` d'`entitlements`) ;
 * 2. limite `partage-lien` (espèce `trip` après ce contrôle, 0147 § 6.4 point 1) : refuse la création et le
 *    remplacement (`rate_limited`, rien n'est écrit) ; la désactivation est **comptée** (verdict ignoré, panne comprise),
 *    jamais refusée ; l'état n'est pas limité ;
 * 3. écriture.
 *
 * Droits de `vadrouille_app` sur `share_links` (migration 0023, M6a-D) : `INSERT` des cinq colonnes
 * `organization_id, trip_id, token_hash, created_by, expires_at` seulement (une requête qui cite `id`, `created_at` ou
 * `revoked_at` est refusée, même avec `DEFAULT`), d'où l'insertion en SQL explicite ; `UPDATE (revoked_at)` seulement,
 * posé par le déclencheur à `now()`. `expires_at` n'est jamais réécrit (0157 § 1.3 point 3).
 *
 * Le jeton en clair n'existe que dans la réponse de la création (F10-PO-17) : jamais écrit, journalisé ni rendu par
 * l'état. Aucun journal dans ce module (`no-console`) ; aucun événement `partage.*` (0157 § 1.2, dernier tiret).
 */

/** Exécuteur de la transaction (`executeurSql` de `withOrg`). */
type Executeur = ReturnType<typeof executeurSql>;

type FonctionWithOrg = <T>(ctx: Pick<AdapterContext, "organizationId" | "userId">, fn: (tx: OrgTransaction) => Promise<T>) => Promise<T>;

/** Nom d'action du limiteur (`src/server/config/limites.ts`). */
export const ACTION_LIMITE_LIEN = "partage-lien";

/** Marge de la borne d'`expires_at` : 3 ans moins 2 jours (0157 § 1.9 : un jour de plus pour un changement d'heure). */
const ANNEES_BORNE = 3;
const JOURS_DE_MARGE = 2;

// --- Requêtes (constantes ; paramètres liés) ------------------------------------------------------------------

/**
 * Voyage de l'organisation : personne créatrice, dernier jour, fuseau, déblocage. `FOR UPDATE OF t` en création
 * seulement (0157 § 1.3 point 6 : deux créations simultanées s'exécutent l'une après l'autre).
 */
const SQL_VOYAGE = `SELECT t.created_by, t.end_date::text AS fin, t.time_zone,
  EXISTS (SELECT 1 FROM public.entitlements e WHERE e.organization_id = t.organization_id AND e.trip_id = t.id AND e.kind = 'tripUnlocked') AS debloque
  FROM public.trips t WHERE t.organization_id = $1 AND t.id = $2`;
export const SQL_VOYAGE_VERROU = `${SQL_VOYAGE} FOR UPDATE OF t`;

/** Désactivation idempotente (0157 § 1.3 point 5) : zéro ligne touchée est un succès. */
export const SQL_DESACTIVER = `UPDATE public.share_links SET revoked_at = now()
  WHERE organization_id = $1 AND trip_id = $2 AND revoked_at IS NULL`;

/**
 * Insertion des **cinq** colonnes admises (0157 § 1.9). `expires_at` : premier instant du jour qui suit `expiresOn`
 * (paramètre `$5`, calculé en TypeScript par `accessUntil`) à l'heure de la destination, lue sur la ligne `trips`
 * verrouillée (0157 § 1.3 point 1). `created_at` est rendu par la base (droit `SELECT` de la table). Les deux bornes
 * des `CHECK` de la table (`expires_at > created_at`, `expires_at <= created_at + 3 ans`) sont reprises dans le `WHERE`
 * à l'horloge de la base : une fin déjà passée ou trop lointaine pour la base (horloge de la portée décalée) n'insère
 * aucune ligne, et la création rend `not_found` au lieu d'atteindre la contrainte.
 */
export const SQL_INSERER = `INSERT INTO public.share_links (organization_id, trip_id, token_hash, created_by, expires_at)
  SELECT t.organization_id, t.id, $3::bytea, $4::uuid, f.expires_at
  FROM public.trips t CROSS JOIN LATERAL (SELECT (($5::date + 1)::timestamp AT TIME ZONE t.time_zone) AS expires_at) f
  WHERE t.organization_id = $1 AND t.id = $2 AND f.expires_at > now() AND f.expires_at <= now() + interval '3 years'
  RETURNING (extract(epoch FROM created_at) * 1000)::float8 AS cree_ms`;

/**
 * Lien actif (non désactivé) du voyage, pour l'état : instant de création, date locale du dernier instant valable
 * (`expires_at − 1 µs` dans le fuseau du voyage) et validité à l'horloge de la base (0157 § 1.3 point 4).
 */
export const SQL_LIEN_ACTIF = `SELECT (extract(epoch FROM s.created_at) * 1000)::float8 AS cree_ms,
  ((s.expires_at - interval '1 microsecond') AT TIME ZONE t.time_zone)::date::text AS fin_stockee,
  s.expires_at > now() AS en_cours
  FROM public.share_links s JOIN public.trips t ON t.organization_id = s.organization_id AND t.id = s.trip_id
  WHERE s.organization_id = $1 AND s.trip_id = $2 AND s.revoked_at IS NULL`;

// --- Dépendances --------------------------------------------------------------------------------------------

export type DependancesLiens = {
  /** **Tests seulement** : `withOrg` de `src/server/with-org.ts` par défaut. */
  readonly withOrg?: FonctionWithOrg;
  /** Limiteur (`verdictRateLimit` du serveur par défaut). */
  readonly limiteur?: (request: RateLimitRequest) => Promise<RateLimitVerdict>;
  /** En-têtes de la requête (`headers()` de Next.js par défaut) : seul l'en-tête de confiance est lu par le limiteur. */
  readonly entetes?: () => Promise<HeadersLike>;
  /** Jeton aléatoire de 32 octets (`randomShareToken` par défaut). */
  readonly jeton?: () => string;
  /** Durée du partage après le dernier jour (`OFFER_CONFIG.accessDaysAfterReturn` par défaut). */
  readonly accessDaysAfterReturn?: number;
};

export type CasLiens = {
  creer(ctx: AdapterContext, tripId: string, maintenant: number): Promise<Result<CreatedShareLink>>;
  desactiver(ctx: AdapterContext, tripId: string): Promise<Result<ShareStatus>>;
  etat(ctx: AdapterContext, tripId: string, maintenant: number): Promise<Result<ShareStatus>>;
};

type Voyage = { readonly fin: string; readonly timeZone: string; readonly debloque: boolean };

/** Voyage de l'organisation dont la personne de la session est la créatrice ; `null` sinon (même réponse, `not_found`). */
async function voyageDeLaPersonne(executeur: Executeur, ctx: AdapterContext, tripId: string, sql: string): Promise<Voyage | null> {
  const ligne = (await executeur.query(sql, [ctx.organizationId, tripId])).rows[0];
  if (ligne === undefined || ligne.created_by !== ctx.userId) return null;
  if (typeof ligne.fin !== "string" || typeof ligne.time_zone !== "string" || ligne.time_zone === "") return null;
  return { fin: ligne.fin, timeZone: ligne.time_zone, debloque: ligne.debloque === true };
}

/** Date ISO `jour` + `annees` ans − `jours` jours (calendrier UTC, sans fuseau ; un 29 février passe au 1er mars). */
export function borneDeFin(jour: string, annees: number = ANNEES_BORNE, jours: number = JOURS_DE_MARGE): string {
  const [annee = 0, mois = 1, quantieme = 1] = jour.split("-").map(Number);
  return new Date(Date.UTC(annee + annees, mois - 1, quantieme - jours)).toISOString().slice(0, 10);
}

/** Code SQLSTATE d'une erreur de `pg`, éventuellement enveloppée par Drizzle (`cause`). */
function codeSql(erreur: unknown): string | undefined {
  const lire = (valeur: unknown) => (typeof valeur === "object" && valeur !== null && typeof (valeur as { code?: unknown }).code === "string" ? (valeur as { code: string }).code : undefined);
  return lire(erreur) ?? lire((erreur as { cause?: unknown } | null)?.cause);
}

/** Uuid d'un voyage du MVP : un autre identifiant (simulé, d'essai) ne désigne aucun voyage en base. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const enTetesDeLaRequete = async (): Promise<HeadersLike> => headers();

export function creerCasLiens(dependances: DependancesLiens = {}): CasLiens {
  const withOrg = dependances.withOrg ?? withOrgParDefaut;
  const limiteur = dependances.limiteur ?? verdictRateLimit;
  const entetes = dependances.entetes ?? enTetesDeLaRequete;
  const jeton = dependances.jeton ?? randomShareToken;
  const jours = dependances.accessDaysAfterReturn ?? OFFER_CONFIG.accessDaysAfterReturn;

  const verdict = async (tripId: string): Promise<RateLimitVerdict> => limiteur({ action: ACTION_LIMITE_LIEN, headers: await entetes(), tripId });

  return {
    async creer(ctx, tripId, maintenant) {
      if (!UUID.test(tripId)) return fail("not_found");
      return withOrg(ctx, async (tx) => {
        const executeur = executeurSql(tx);
        const voyage = await voyageDeLaPersonne(executeur, ctx, tripId, SQL_VOYAGE_VERROU);
        if (voyage === null || !voyage.debloque) return fail("not_found");
        // 0157 § 1.3 point 1 et § 1.9 : fin calculée par la seule implémentation ; refus avant l'écriture, sans jamais
        // atteindre les `CHECK` de la base, si la fin est passée ou au-delà de la borne (3 ans moins 2 jours).
        const expiresOn = accessUntil(voyage.fin, jours);
        const aujourdhui = localDateAt(maintenant, voyage.timeZone);
        if (aujourdhui > expiresOn || expiresOn > borneDeFin(aujourdhui)) return fail("not_found");
        if (!(await verdict(tripId)).ok) return fail("rate_limited");
        const token = jeton();
        const empreinte = Buffer.from(hashShareToken(token), "hex");
        const ecrire = async () => {
          await executeur.query(SQL_DESACTIVER, [ctx.organizationId, tripId]);
          return (await executeur.query(SQL_INSERER, [ctx.organizationId, tripId, empreinte, ctx.userId, expiresOn])).rows[0];
        };
        // 0157 § 1.3 point 6 : une violation `23505` malgré le verrou est rejouée une fois (point de sauvegarde) ; au
        // second échec, `internal` (jamais une page 500).
        let ligne: Record<string, unknown> | undefined;
        await executeur.query("SAVEPOINT partage_lien");
        try {
          ligne = await ecrire();
        } catch (erreur) {
          if (codeSql(erreur) !== "23505") throw erreur;
          await executeur.query("ROLLBACK TO SAVEPOINT partage_lien");
          try {
            ligne = await ecrire();
          } catch (second) {
            if (codeSql(second) !== "23505") throw second;
            await executeur.query("ROLLBACK TO SAVEPOINT partage_lien");
            return fail("internal");
          }
        }
        if (ligne === undefined) {
          // Fin hors des bornes de la base : rien n'est désactivé ni écrit.
          await executeur.query("ROLLBACK TO SAVEPOINT partage_lien");
          return fail("not_found");
        }
        const creeMs = Number(ligne.cree_ms);
        if (!Number.isFinite(creeMs)) return fail("internal");
        return ok(CreatedShareLinkSchema.parse({ token, createdAt: new Date(creeMs).toISOString(), expiresOn }));
      });
    },

    async desactiver(ctx, tripId) {
      if (!UUID.test(tripId)) return fail("not_found");
      return withOrg(ctx, async (tx) => {
        const executeur = executeurSql(tx);
        // Ni déblocage ni fin du partage contrôlés (0157 § 1.2, 0158 § 3 point 6) : un lien reste toujours désactivable.
        const voyage = await voyageDeLaPersonne(executeur, ctx, tripId, SQL_VOYAGE);
        if (voyage === null) return fail("not_found");
        // Comptée, jamais refusée (0157 § 1.2, § 2.1 point 1) : verdict et panne du limiteur ignorés.
        await verdict(tripId).catch(() => undefined);
        await executeur.query(SQL_DESACTIVER, [ctx.organizationId, tripId]);
        return ok(ShareStatusSchema.parse({ active: false }));
      });
    },

    async etat(ctx, tripId, maintenant) {
      if (!UUID.test(tripId)) return fail("not_found");
      return withOrg(ctx, async (tx) => {
        const executeur = executeurSql(tx);
        await executeur.query("SET TRANSACTION READ ONLY");
        // « Voyage débloqué » requis (0157 § 1.2 ; 0158 § 3 point 7 : après un reverrouillage, `not_found`).
        const voyage = await voyageDeLaPersonne(executeur, ctx, tripId, SQL_VOYAGE);
        if (voyage === null || !voyage.debloque) return fail("not_found");
        const lien = (await executeur.query(SQL_LIEN_ACTIF, [ctx.organizationId, tripId])).rows[0];
        const inactif = ok(ShareStatusSchema.parse({ active: false }));
        if (lien === undefined || lien.en_cours !== true || typeof lien.fin_stockee !== "string") return inactif;
        // Les deux règles, la plus proche l'emporte (0157 § 1.3 points 2 et 4) : borne stockée et fin recalculée sur le
        // voyage tel qu'il est lu ; un lien expiré non désactivé se lit `{ active: false }`.
        const recalculee = accessUntil(voyage.fin, jours);
        const valableJusquAu = recalculee < lien.fin_stockee ? recalculee : lien.fin_stockee;
        if (localDateAt(maintenant, voyage.timeZone) > valableJusquAu) return inactif;
        const creeMs = Number(lien.cree_ms);
        if (!Number.isFinite(creeMs)) return fail("internal");
        return ok(ShareStatusSchema.parse({ active: true, createdAt: new Date(creeMs).toISOString(), expiresOn: valableJusquAu }));
      });
    },
  };
}
