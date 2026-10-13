import { fail, ok, type CreatedShareLink, type Result, type ShareStatus, type Trip } from "@/contracts";
import { CreatedShareLinkSchema, SharedDayViewSchema, SharedTripViewSchema, ShareStatusSchema } from "@/contracts/share";
import { SHARE_TOKEN_PATTERN } from "@/contracts/values";
import { localDateAt } from "@/features/voyage/today";
import { accessUntil } from "@/lib/dates";

import { projectSharedMaps, projectSharedPoints, projectSharedTrip } from "./share-projection";
import { hashShareToken, randomShareToken } from "./share-token";
import { MAX_SHARE_LINKS_PER_SCOPE, type ShareLinkRecord, type ShareStore } from "./simulation";
import type { AdapterContext, ShareAdapter, TripAdapter } from "./types";

export interface MockShareOptions {
  /** Lecteur des voyages de la portée (`getTripReader()`, droit « débloqué » compris). */
  trips: TripAdapter;
  /** Horloge de la portée : ce module n'appelle jamais l'horloge système (lint). */
  now: () => number;
  /** État de la portée. */
  store: ShareStore;
  /** Durée du partage après le dernier jour (`accessDaysAfterReturn`, `src/server/config/offer.ts`), injectée. */
  accessDaysAfterReturn: number;
  /** Jeton aléatoire de 32 octets ; injectable pour les tests. */
  randomToken?: () => string;
}

/** Dernier jour de validité d'un lien du voyage, à l'heure de la destination (F10-PO-21 ; décision 0039, A4). */
export function shareExpiresOn(trip: Pick<Trip, "end">, accessDaysAfterReturn: number): string {
  return accessUntil(trip.end, accessDaysAfterReturn);
}

/**
 * Fin du partage passée (décision 0039, F10-TL-7 point 2) : un lien est valable tant que la date de la destination à
 * l'instant `now` est au plus `expiresOn` (comparaison de dates ISO).
 */
export function shareEnded(trip: Pick<Trip, "end" | "timeZone">, now: number, accessDaysAfterReturn: number): boolean {
  return localDateAt(now, trip.timeZone) > shareExpiresOn(trip, accessDaysAfterReturn);
}

/**
 * Adaptateur de partage simulé (spécification F10, F10-TL-7 et F10-PO-18) : en mémoire de la portée, sans réseau,
 * sans écriture disque, sans journal. Seule l'empreinte SHA-256 des jetons est gardée. Un seul lien actif par voyage :
 * la création désactive le précédent dans le même bloc synchrone, sans `await` entre la lecture et l'écriture.
 */
export function createMockShareAdapter(options: MockShareOptions): ShareAdapter {
  const { trips, now, store, accessDaysAfterReturn } = options;
  const randomToken = options.randomToken ?? randomShareToken;

  /** Voyage de l'organisation, débloqué ; `null` sinon (inconnu, autre organisation, non débloqué). */
  async function shareableTrip(ctx: AdapterContext, tripId: string): Promise<Trip | null> {
    const trip = await trips.getTrip(ctx, tripId);
    return trip && trip.unlocked ? trip : null;
  }

  function activeLink(organizationId: string, tripId: string): ShareLinkRecord | undefined {
    for (const record of store.links.values()) {
      if (record.organizationId === organizationId && record.tripId === tripId && record.revokedAt === undefined) return record;
    }
    return undefined;
  }

  function status(trip: Trip, record: ShareLinkRecord | undefined): ShareStatus {
    return ShareStatusSchema.parse(
      record
        ? { active: true, createdAt: new Date(record.createdAt).toISOString(), expiresOn: shareExpiresOn(trip, accessDaysAfterReturn) }
        : { active: false },
    );
  }

  /** Retire les liens créés les plus anciens au-delà de la limite de la portée ; les liens fixes restent. */
  function trim(): void {
    const created = [...store.links.values()].filter((record) => !record.fixed);
    for (const record of created.slice(0, Math.max(0, created.length - MAX_SHARE_LINKS_PER_SCOPE))) {
      store.links.delete(record.tokenHash);
    }
  }

  /** Lien valide d'un jeton : forme, empreinte connue, non désactivé ; puis voyage débloqué et partage en cours. */
  async function resolve(token: string): Promise<{ trip: Trip; ctx: AdapterContext } | null> {
    if (!SHARE_TOKEN_PATTERN.test(token)) return null;
    const record = store.links.get(hashShareToken(token));
    if (!record || record.revokedAt !== undefined) return null;
    const ctx: AdapterContext = { organizationId: record.organizationId, userId: record.userId, role: "owner" };
    const trip = await trips.getTrip(ctx, record.tripId);
    if (!trip || !trip.unlocked || shareEnded(trip, now(), accessDaysAfterReturn)) return null;
    // Désactivé pendant la lecture du voyage : la requête suivante répond déjà 404.
    if (record.revokedAt !== undefined) return null;
    return { trip, ctx };
  }

  return {
    async createLink(ctx, tripId): Promise<Result<CreatedShareLink>> {
      const trip = await shareableTrip(ctx, tripId);
      if (!trip || shareEnded(trip, now(), accessDaysAfterReturn)) return fail("not_found");
      const token = randomToken();
      const createdAt = now();
      const previous = activeLink(ctx.organizationId, tripId);
      if (previous) previous.revokedAt = createdAt;
      const tokenHash = hashShareToken(token);
      store.links.set(tokenHash, { tokenHash, tripId, organizationId: ctx.organizationId, userId: ctx.userId, createdAt, fixed: false });
      trim();
      return ok(
        CreatedShareLinkSchema.parse({
          token,
          createdAt: new Date(createdAt).toISOString(),
          expiresOn: shareExpiresOn(trip, accessDaysAfterReturn),
        }),
      );
    },

    async revokeLink(ctx, tripId): Promise<Result<ShareStatus>> {
      const trip = await shareableTrip(ctx, tripId);
      if (!trip) return fail("not_found");
      const record = activeLink(ctx.organizationId, tripId);
      if (record) record.revokedAt = now();
      return ok(status(trip, undefined));
    },

    async getStatus(ctx, tripId): Promise<Result<ShareStatus>> {
      const trip = await shareableTrip(ctx, tripId);
      if (!trip) return fail("not_found");
      return ok(status(trip, activeLink(ctx.organizationId, tripId)));
    },

    async getSharedTrip(token) {
      const resolved = await resolve(token);
      if (!resolved) return null;
      const maps = await trips.getTripMap(resolved.ctx, resolved.trip.id);
      return SharedTripViewSchema.parse({ trip: projectSharedTrip(resolved.trip), maps: projectSharedMaps(resolved.trip, maps) });
    },

    async getSharedDay(token, index) {
      const resolved = await resolve(token);
      if (!resolved) return null;
      const day = resolved.trip.days.find((candidate) => candidate.index === index);
      if (!day) return null;
      const map = await trips.getDayMap(resolved.ctx, resolved.trip.id, index);
      return SharedDayViewSchema.parse({
        trip: projectSharedTrip(resolved.trip),
        dayIndex: index,
        points: projectSharedPoints(day, map),
      });
    },
  };
}
