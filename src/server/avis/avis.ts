import "server-only";

import type { AdapterContext } from "@/adapters/types";
import {
  fail,
  ok,
  StopReviewRequestSchema,
  TripReviewSchema,
  type Result,
  type StopReview,
  type TripReview,
} from "@/contracts";
import type { StopRating } from "@/contracts/values";
import { etapesAEvaluer, type EtapeAEvaluer } from "@/domain/apres-voyage";
import { accesAuMoment } from "@/server/avis/acces";
import { candidatsDuVoyage, clesRetenues, type LectureDesSignaux } from "@/server/gouts/lecture";
import { checkRateLimit } from "@/server/rate-limit";
import { verrouillerVersions } from "@/server/versions/ecrire";
import { executerActionVoyage, type DependancesAction, type ExecuteurAction } from "@/server/voyages/actions";
import { identifiantLisible } from "@/server/voyages/conversion";
import { lireEtatApresVoyage, transactionDeLecture, type EtatApresVoyage } from "@/server/voyages/lecture";
import { withOrg as withOrgParDefaut } from "@/server/with-org";

/**
 * Avis rapide après le voyage sur `api` (tâche M8a, ticket 1062 ; décision 0160 § 1.1, § 1.2 point 3 et § 1.5 ; spécification
 * `specs/M8-apres-le-voyage-api.md` § 3). Deux cas d'usage, sur la table `stop_reviews` de la migration 0026 (colonne de la
 * valeur `opinion`, propriété `rating` du contrat) :
 *
 * - `lireRevue` (`getTripReview` de `@/adapters`) : `TripReview` du voyage, ou `null` (404 de la page) pour un voyage
 *   inconnu, d'une autre organisation, non débloqué, ou d'une autre personne que la propriétaire (`trips.created_by`) ;
 * - `donnerAvis` (action `rateStop`) : un geste, une instruction ; `rating: null` efface l'avis.
 *
 * **Accès** calculé par le serveur seul, à chaque lecture et à chaque écriture (0160 § 1.5 point 3) : date locale de la
 * destination (`localDateAt`, fuseau du voyage), `accessUntil(trip.end, OFFER_CONFIG.accessDaysAfterReturn)`.
 *
 * **Ordre des contrôles de `donnerAvis`** (0160 § 1.5 point 5) : session, entrée stricte, voyage dans l'organisation
 * (`not_found`) — par le cadre `executerActionVoyage` ; puis, sous le verrou des versions du voyage, personne propriétaire
 * (`not_found`), débloqué (`not_found`), accès `open` (`not_found` : avant le dernier jour et en lecture seule), limite
 * `avis` (`rate_limited`), étape à évaluer de la version courante (`validation_failed`, `field: "stopId"`), écriture.
 *
 * **Identité d'un avis** (0160 § 1.1 points 3 et 5) : `(organisation, voyage, stop_id, place_id)`, où `place_id` est celui
 * de l'étape **dans la version courante**, lu par le serveur, jamais reçu du client. Une étape remplacée (autre `placeId`)
 * revient sans avis ; l'ancienne ligne reste, invisible. **Idempotence** : l'`INSERT … ON CONFLICT … WHERE request_id IS
 * DISTINCT FROM` rend le rejeu au même `requestId` sans effet ; un effacement sans ligne réussit sans rien faire.
 *
 * **Une personne** (revue de #1057, mineur 1) : l'index unique de 0026 n'inclut pas `created_by` ; l'écran est mono-membre
 * (seule la propriétaire lit et écrit). Les avis ne vont dans aucun prompt, aucun goût, aucun journal (Q151, M8-PO-4) : ni
 * nom d'étape, ni `placeId`, ni valeur ne sont journalisés.
 */

/** Action du limiteur pour les avis (`RATE_LIMITS`, proposition de 0160 § 2.3 : 120 par heure et par adresse IP, S3). */
export const ACTION_LIMITEUR_AVIS = "avis";

export type DependancesAvis = DependancesAction & {
  /** Horloge (millisecondes) ; `Date.now` par défaut. Les tests de base l'injectent (critères 1 et 7). */
  readonly maintenant?: () => number;
  /** Débit par adresse IP ; `checkRateLimit` avec les en-têtes de la requête par défaut (échec fermé : `rate_limited`). */
  readonly limiteur?: () => Promise<Result<void>>;
  /** **Tests sans base seulement** : lecture du voyage dans la transaction ; `lireEtatApresVoyage` par défaut. */
  readonly lireEtat?: (executeur: ExecuteurAction, ctx: AdapterContext, tripId: string) => Promise<EtatApresVoyage | null>;
  /** **Tests sans base seulement** : signaux actifs du voyage (candidats de goûts, M8c-1) ; `lireSignauxActifs` par défaut. */
  readonly lireSignaux?: LectureDesSignaux;
};

/** Propriétaire du voyage (0160 § 1.5 point 5 ; M6-PO-2) : seule elle lit et écrit l'écran 16. */
export const SQL_PROPRIETAIRE = "SELECT created_by FROM public.trips WHERE organization_id = $1 AND id = $2";

/** Avis du voyage, toutes étapes confondues : le filtre par la version courante se fait en mémoire (`avisVisibles`). */
export const SQL_AVIS_DU_VOYAGE = "SELECT stop_id, place_id, opinion FROM public.stop_reviews WHERE organization_id = $1 AND trip_id = $2";

/** Écriture d'une valeur (0160 § 1.1 point 4) : rejeu au même `request_id` sans effet, `updated_at` compris. */
export const SQL_ECRIRE_AVIS = `INSERT INTO public.stop_reviews (organization_id, trip_id, stop_id, place_id, opinion, created_by, request_id)
  VALUES ($1, $2, $3, $4, $5, $6, $7)
  ON CONFLICT (organization_id, trip_id, stop_id, (COALESCE(place_id, ''))) DO UPDATE
  SET opinion = EXCLUDED.opinion, request_id = EXCLUDED.request_id, updated_at = now()
  WHERE stop_reviews.request_id IS DISTINCT FROM EXCLUDED.request_id
  RETURNING opinion`;

/**
 * Valeur enregistrée de l'étape et du lieu, lue quand l'écriture n'a rien fait (rejeu au même `request_id`) : le rejeu
 * rend la valeur en base, même si la demande rejouée en portait une autre (revue de la PR 1068, mineur 11).
 */
export const SQL_AVIS_ENREGISTRE = `SELECT opinion FROM public.stop_reviews
  WHERE organization_id = $1 AND trip_id = $2 AND stop_id = $3 AND COALESCE(place_id, '') = COALESCE($4::text, '')`;

/** Effacement (spécification § 3.2 point 3) : la ligne de l'étape et du lieu de la version courante, s'il y en a une. */
export const SQL_EFFACER_AVIS = `DELETE FROM public.stop_reviews
  WHERE organization_id = $1 AND trip_id = $2 AND stop_id = $3 AND COALESCE(place_id, '') = COALESCE($4::text, '')`;

const VALEURS: ReadonlySet<string> = new Set<StopRating>(["liked", "disliked", "notDone"]);

type Ligne = Record<string, unknown>;

/** Accès du voyage à l'instant `maintenant` (calcul unique de `./acces`). */
function accesDu(etat: Pick<EtatApresVoyage, "end" | "timeZone">, maintenant: number): TripReview["access"] {
  return accesAuMoment(etat.end, etat.timeZone, maintenant);
}

/** Avis visibles : ceux dont `(stop_id, place_id)` est une étape à évaluer de la version courante (critère 4). */
export function avisVisibles(etapes: readonly EtapeAEvaluer[], lignes: readonly Ligne[]): StopReview[] {
  const lieuParEtape = new Map(etapes.map((etape) => [etape.stopId, etape.placeId]));
  const avis: StopReview[] = [];
  for (const ligne of lignes) {
    const stopId = ligne.stop_id;
    const placeId = ligne.place_id ?? null;
    const valeur = ligne.opinion;
    if (typeof stopId !== "string" || typeof valeur !== "string" || !VALEURS.has(valeur)) continue;
    if (!lieuParEtape.has(stopId) || lieuParEtape.get(stopId) !== placeId) continue;
    avis.push({ stopId, rating: valeur as StopRating });
  }
  // Ordre du programme, pour une réponse stable.
  const rang = new Map(etapes.map((etape, index) => [etape.stopId, index]));
  return avis.sort((x, y) => (rang.get(x.stopId) ?? 0) - (rang.get(y.stopId) ?? 0));
}

/** Voyage de la propriétaire, débloqué : son état, sinon `null` (404 sans distinguer les cas). Lu aussi par `src/server/gouts/gouts.ts`. */
export async function lireVoyageDeLaPersonne(
  dependances: Pick<DependancesAvis, "lireEtat">,
  executeur: ExecuteurAction,
  ctx: AdapterContext,
  tripId: string,
): Promise<EtatApresVoyage | null> {
  const [proprietaire] = (await executeur.query(SQL_PROPRIETAIRE, [ctx.organizationId, tripId])).rows;
  if (proprietaire === undefined || proprietaire.created_by !== ctx.userId) return null;
  const etat = await (dependances.lireEtat ?? lireEtatApresVoyage)(executeur, ctx, tripId);
  if (etat === null || !etat.debloque) return null;
  return etat;
}

/**
 * Lecture de l'écran 16 (`getTripReview` sur `api`), en lecture seule. Goûts (M8c-1, ticket 1121 ; spécification § 5.1) :
 * candidats calculés depuis les signaux actifs de ce voyage et clés des goûts déjà retenus par la personne ; rien avant le
 * dernier jour (`notEnded`).
 */
export async function lireRevue(dependances: Omit<DependancesAvis, "contexte" | "limiteur">, ctx: AdapterContext, tripId: string): Promise<TripReview | null> {
  if (!identifiantLisible(tripId)) return null;
  const withOrg = dependances.withOrg ?? withOrgParDefaut;
  const maintenant = (dependances.maintenant ?? Date.now)();
  return transactionDeLecture(withOrg, ctx, async (executeur) => {
    const etat = await lireVoyageDeLaPersonne(dependances, executeur, ctx, tripId);
    if (etat === null) return null;
    const access = accesDu(etat, maintenant);
    const reviews =
      access === "notEnded" ? [] : avisVisibles(etapesAEvaluer(etat.jours), (await executeur.query(SQL_AVIS_DU_VOYAGE, [ctx.organizationId, tripId])).rows);
    const tasteCandidates = access === "notEnded" ? [] : await candidatsDuVoyage(executeur, ctx, tripId, dependances.lireSignaux);
    const retainedIds = access === "notEnded" ? [] : await clesRetenues(executeur, ctx);
    return TripReviewSchema.parse({ tripId, access, reviews, tasteCandidates, retainedIds });
  });
}

const limiteurParDefaut = async (): Promise<Result<void>> => {
  const { headers } = await import("next/headers");
  return checkRateLimit({ action: ACTION_LIMITEUR_AVIS, headers: new Headers(await headers()) });
};

type Issue = { readonly type: "fait"; readonly avis: StopReview | null } | { readonly type: "refus"; readonly erreur: Result<never> };

/** Avis sur une étape (`rateStop` sur `api`) : `StopReview` écrit, ou `null` quand l'avis est effacé. */
export async function donnerAvis(dependances: DependancesAvis, entree: unknown): Promise<Result<StopReview | null>> {
  const maintenant = dependances.maintenant ?? Date.now;
  const limiteur = dependances.limiteur ?? limiteurParDefaut;
  const resultat = await executerActionVoyage("rate-stop", dependances, StopReviewRequestSchema, entree, async (executeur, ctx, demande): Promise<Issue | null> => {
    await verrouillerVersions(executeur, demande.tripId);
    const etat = await lireVoyageDeLaPersonne(dependances, executeur, ctx, demande.tripId);
    if (etat === null || accesDu(etat, maintenant()) !== "open") return null;
    const debit = await limiteur();
    if (!debit.ok) return { type: "refus", erreur: debit };
    const etape = etapesAEvaluer(etat.jours).find((candidate) => candidate.stopId === demande.stopId);
    if (etape === undefined) return { type: "refus", erreur: fail("validation_failed", "stopId") };
    const org = ctx.organizationId;
    if (demande.rating === null) {
      await executeur.query(SQL_EFFACER_AVIS, [org, demande.tripId, etape.stopId, etape.placeId]);
      return { type: "fait", avis: null };
    }
    const [ecrit] = (await executeur.query(SQL_ECRIRE_AVIS, [org, demande.tripId, etape.stopId, etape.placeId, demande.rating, ctx.userId, demande.requestId])).rows;
    const [enBase] = ecrit === undefined ? (await executeur.query(SQL_AVIS_ENREGISTRE, [org, demande.tripId, etape.stopId, etape.placeId])).rows : [ecrit];
    const valeur = enBase?.opinion;
    if (typeof valeur !== "string" || !VALEURS.has(valeur)) return { type: "refus", erreur: fail("internal") };
    return { type: "fait", avis: { stopId: etape.stopId, rating: valeur as StopRating } };
  });
  if (!resultat.ok) return resultat;
  return resultat.value.type === "refus" ? resultat.value.erreur : ok(resultat.value.avis);
}
