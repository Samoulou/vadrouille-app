import "server-only";

import type { AdapterContext } from "@/adapters/types";
import { RetainedTasteSchema, type PreferenceSubject, type RetainedPreference, type RetainedTaste } from "@/contracts";
import { CATEGORIES, PREFERENCE_DIRECTIONS, preferenceKey } from "@/contracts/values";
import { candidatsDeGouts, type SignalDeGout } from "@/domain/gouts";
import { GOUT_DEDUIT_SEUIL, GOUT_DISTANCE_PROPOSE } from "@/server/config/gouts";
import { lireSignauxActifs, type SignalLuDuRecalcul } from "@/server/generation/signaux";
import { transactionDeLecture } from "@/server/voyages/lecture";
import { withOrg as withOrgParDefaut, type OrgTransaction } from "@/server/with-org";

/**
 * Lecture des goûts sur `api` (tâche M8c-1, ticket 1121 ; spécification `specs/M8-apres-le-voyage-api.md` § 5.1 à § 5.3 ;
 * décision 0160 § 1.3 point 7 et § 1.8), sur la table `preferences` durcie par la migration 0026 :
 *
 * - `candidatsDuVoyage` : candidats de l'écran 16, calculés à la lecture depuis les signaux actifs **de ce voyage**
 *   (`lireSignauxActifs`, module unique de lecture des signaux), projetés sur trois champs avant le domaine ;
 * - `clesRetenues` : clés (`preferenceKey`) des goûts déjà retenus par la personne (« Déjà retenu ») ;
 * - `lireGoutsRetenus` : « Tes goûts retenus » de « Mes voyages », dans l'ordre où ils ont été retenus.
 *
 * Chaque requête porte l'organisation **et** la personne de la session (en plus de la RLS par personne de 0026). Une ligne
 * de `preferences` n'a ni nom, ni `placeId`, ni texte : codes fermés, voyage d'origine, instant posé par la base.
 */

type Executeur = { query(texte: string, valeurs?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }> };
type FonctionWithOrg = <T>(ctx: Pick<AdapterContext, "organizationId" | "userId">, fn: (tx: OrgTransaction) => Promise<T>) => Promise<T>;

/** Lecture des signaux actifs d'un voyage ; `lireSignauxActifs` par défaut (les tests sans base injectent la leur). */
export type LectureDesSignaux = (executeur: Executeur, organizationId: string, tripId: string) => Promise<readonly SignalLuDuRecalcul[]>;

/**
 * Goûts de la personne, dans l'ordre où ils ont été retenus (0160 § 1.3 point 7) : à instant égal (un geste, une
 * transaction), l'ordre de `preferenceKey`. Un goût rétabli par « Annuler » a un nouvel instant et passe en fin de liste.
 */
export const SQL_GOUTS_DE_LA_PERSONNE = `SELECT subject_kind, category, direction, origin, source_trip_id FROM public.preferences
  WHERE organization_id = $1 AND user_id = $2 ORDER BY consented_at, subject_kind, category, direction`;

/**
 * Projection **explicite** d'un signal lu (0160 § 1.8 point 2) : trois champs, jamais `placeId`, `candidatId`,
 * `proposalId`, `origin`, `reason` ni l'identifiant de ligne.
 */
export function projeterSignal(signal: SignalLuDuRecalcul): SignalDeGout {
  return { signal: signal.signal, category: signal.category, status: signal.status };
}

/** Candidats de goûts du voyage (spécification § 5.1), triés par `preferenceKey` ; aucun « distance » sur `api` (0160 § 1.7). */
export async function candidatsDuVoyage(
  executeur: Executeur,
  ctx: Pick<AdapterContext, "organizationId">,
  tripId: string,
  lireSignaux: LectureDesSignaux = lireSignauxActifs,
): Promise<RetainedPreference[]> {
  const signaux = await lireSignaux(executeur, ctx.organizationId, tripId);
  return candidatsDeGouts(signaux.map(projeterSignal), { seuilDeduit: GOUT_DEDUIT_SEUIL, distance: GOUT_DISTANCE_PROPOSE });
}

/** Sujet d'une clé de préférence déjà validée (`PreferenceKeySchema`) ; `null` pour tout autre texte. */
export function sujetDeCle(cle: string): PreferenceSubject | null {
  if (cle === "distance") return { kind: "distance" };
  const [prefixe, categorie, sens, ...reste] = cle.split(":");
  const category = CATEGORIES.find((valeur) => valeur === categorie);
  const direction = PREFERENCE_DIRECTIONS.find((valeur) => valeur === sens);
  if (prefixe !== "category" || category === undefined || direction === undefined || reste.length > 0) return null;
  return { kind: "category", category, direction };
}

/** Sujet d'une ligne de `preferences` ; `null` si la ligne n'a pas la forme des `CHECK` de 0026. */
function sujetDeLigne(ligne: Record<string, unknown>): PreferenceSubject | null {
  if (ligne.subject_kind === "distance") return ligne.category === null && ligne.direction === null ? { kind: "distance" } : null;
  if (ligne.subject_kind !== "category" || typeof ligne.category !== "string" || typeof ligne.direction !== "string") return null;
  return sujetDeCle(`category:${ligne.category}:${ligne.direction}`);
}

/** Goût d'une ligne (`origin`, `source_trip_id` et le sujet), validé par le schéma strict ; ligne illisible : erreur. */
export function goutDeLigne(sujet: PreferenceSubject, ligne: Record<string, unknown>): RetainedTaste {
  return RetainedTasteSchema.parse({ id: preferenceKey(sujet), origin: ligne.origin, subject: sujet, fromTripId: ligne.source_trip_id ?? null });
}

async function lireLignes(executeur: Executeur, ctx: Pick<AdapterContext, "organizationId" | "userId">): Promise<RetainedTaste[]> {
  const lignes = (await executeur.query(SQL_GOUTS_DE_LA_PERSONNE, [ctx.organizationId, ctx.userId])).rows;
  return lignes.map((ligne) => {
    const sujet = sujetDeLigne(ligne);
    if (sujet === null) throw new Error("preferences : ligne illisible");
    return goutDeLigne(sujet, ligne);
  });
}

/** Clés des goûts déjà retenus par la personne, dans l'ordre de la liste (`TripReview.retainedIds`). */
export async function clesRetenues(executeur: Executeur, ctx: Pick<AdapterContext, "organizationId" | "userId">): Promise<string[]> {
  return (await lireLignes(executeur, ctx)).map((gout) => gout.id);
}

/**
 * « Tes goûts retenus » (spécification § 5.3 point 1) : les goûts de **la personne de la session** dans **l'organisation
 * de la session**, en lecture seule. Ne lit ni voyage, ni déblocage, ni dates (la destination se relit par `fromTripId`
 * dans les résumés de « Mes voyages »).
 */
export async function lireGoutsRetenus(dependances: { readonly withOrg?: FonctionWithOrg }, ctx: AdapterContext): Promise<RetainedTaste[]> {
  return transactionDeLecture(dependances.withOrg ?? withOrgParDefaut, ctx, (executeur) => lireLignes(executeur, ctx));
}
