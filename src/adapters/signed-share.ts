import { fail, ok, type CreatedShareLink, type Result, type ShareStatus, type Trip } from "@/contracts";
import { CreatedShareLinkSchema, ShareStatusSchema } from "@/contracts/share";
import { localDateAt } from "@/features/voyage/today";

import { shareEnded, shareExpiresOn } from "./mock-share";
import { signShareToken, verifyShareToken, type SignedSharePayload } from "./share-signed-token";
import { buildSharedDayView, buildSharedTripView } from "./share-views";
import type { AdapterContext, ShareAdapter, TripAdapter } from "./types";

/**
 * Personne du contexte de lecture d'un lien partagé : aucune (le jeton ne porte aucune identité). Valeur technique
 * fixe, jamais une personne ; rôle `member` (lecture). Les adaptateurs de voyage ne filtrent que sur l'organisation.
 */
export const SHARED_LINK_USER_ID = "lien-partage";

/**
 * Fuseau le plus tardif (UTC−12) : sa date est la plus ancienne date locale du monde à un instant donné. Un jeton dont le
 * dernier jour la précède est expiré dans **tout** fuseau : refusé sans lire la base.
 */
const FUSEAU_LE_PLUS_TARDIF = "Etc/GMT+12";

export interface SignedShareOptions {
  /** Lecteur des voyages de la requête de la personne qui partage (`getTripReader()`, droit « débloqué » compris). */
  creatorTrips: TripAdapter;
  /**
   * Lecteur de la vue partagée, construit pour **ce seul voyage** : lecture seule, sans cookie de la personne qui
   * regarde, sans relecture payante, sans écriture (`prototypeSharedReader`, décision 0135 § 5).
   */
  sharedTrips: (tripId: string) => TripAdapter;
  /** Clé de signature (32 octets au moins), ou `null` : partage fermé (aucun lien créé, tout lien répond 404). */
  key: () => Buffer | null;
  /** Session vérifiée de la personne qui crée le lien (décision 0135 § 2) ; lue à chaque création. */
  sessionVerified: () => Promise<boolean>;
  /** Horloge de la portée. */
  now: () => number;
  /** Durée du partage après le dernier jour (`accessDaysAfterReturn`). */
  accessDaysAfterReturn: number;
}

/**
 * Adaptateur de partage **réel** du site d'essai (décision 0135, amendement de 0039 F10-TL-7) : jeton signé, sans
 * stockage. Aucune écriture, aucun journal. Différences assumées avec l'adaptateur simulé, écrites dans 0135 § 7 :
 * le serveur ne connaît pas les liens émis, donc `getStatus` rend toujours `{ active: false }` (la feuille propose
 * « Créer un lien ») et `revokeLink` rend `not_found` (révocation d'un lien : tâche suivante, avec une table) ; le même
 * voyage donne le même jeton tant que sa fin et la clé ne changent pas.
 */
export function createSignedShareAdapter(options: SignedShareOptions): ShareAdapter {
  const { creatorTrips, sharedTrips, key, sessionVerified, now, accessDaysAfterReturn } = options;

  /** Voyage de l'organisation de la session, débloqué ; `null` sinon. */
  async function shareableTrip(ctx: AdapterContext, tripId: string): Promise<Trip | null> {
    const trip = await creatorTrips.getTrip(ctx, tripId);
    return trip && trip.unlocked ? trip : null;
  }

  /**
   * Lien valide d'un jeton : clé présente, signature et charge valides, pas expiré dans tout fuseau ; puis voyage lu
   * **dans l'organisation du jeton**, débloqué, et partage en cours à l'heure de la destination (F10-TL-7 point 2,
   * avec le dernier jour signé et celui du voyage tel qu'il est lu).
   */
  async function resolve(token: string): Promise<{ trip: Trip; ctx: AdapterContext; reader: TripAdapter } | null> {
    const cle = key();
    if (cle === null) return null;
    const payload: SignedSharePayload | null = verifyShareToken(cle, token);
    if (payload === null) return null;
    const instant = now();
    if (payload.expiresOn < localDateAt(instant, FUSEAU_LE_PLUS_TARDIF)) return null;
    const ctx: AdapterContext = { organizationId: payload.organizationId, userId: SHARED_LINK_USER_ID, role: "member" };
    const reader = sharedTrips(payload.tripId);
    const trip = await reader.getTrip(ctx, payload.tripId);
    if (!trip || !trip.unlocked) return null;
    if (localDateAt(instant, trip.timeZone) > payload.expiresOn) return null;
    if (shareEnded(trip, instant, accessDaysAfterReturn)) return null;
    return { trip, ctx, reader };
  }

  return {
    async createLink(ctx, tripId): Promise<Result<CreatedShareLink>> {
      if (!(await sessionVerified())) return fail("unauthenticated");
      const cle = key();
      if (cle === null) return fail("not_found");
      const trip = await shareableTrip(ctx, tripId);
      if (!trip) return fail("not_found");
      const instant = now();
      if (shareEnded(trip, instant, accessDaysAfterReturn)) return fail("not_found");
      const expiresOn = shareExpiresOn(trip, accessDaysAfterReturn);
      const token = signShareToken(cle, { tripId: trip.id, organizationId: ctx.organizationId, expiresOn });
      return ok(CreatedShareLinkSchema.parse({ token, createdAt: new Date(instant).toISOString(), expiresOn }));
    },

    async revokeLink(): Promise<Result<ShareStatus>> {
      // Aucun lien n'est gardé : rien à désactiver un par un (décision 0135 § 7). La feuille ne propose pas l'action,
      // `getStatus` ne rendant jamais de lien actif.
      return fail("not_found");
    },

    async getStatus(ctx, tripId): Promise<Result<ShareStatus>> {
      if (!(await sessionVerified())) return fail("unauthenticated");
      if (key() === null) return fail("not_found");
      const trip = await shareableTrip(ctx, tripId);
      if (!trip) return fail("not_found");
      return ok(ShareStatusSchema.parse({ active: false }));
    },

    async getSharedTrip(token) {
      const resolved = await resolve(token);
      return resolved ? buildSharedTripView(resolved.reader, resolved.ctx, resolved.trip) : null;
    },

    async getSharedDay(token, index) {
      const resolved = await resolve(token);
      return resolved ? buildSharedDayView(resolved.reader, resolved.ctx, resolved.trip, index) : null;
    },
  };
}
