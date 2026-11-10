import { type CreatedShareLink, type Result, type ShareStatus } from "@/contracts";
import { SharedDayViewSchema, SharedTripViewSchema } from "@/contracts/share";
import { SHARE_TOKEN_PATTERN } from "@/contracts/values";
import { localDateAt } from "@/features/voyage/today";
import { accessUntil } from "@/lib/dates";

import type { AdapterContext, ShareAdapter } from "./types";

/**
 * Adaptateur de partage de l'adaptateur `api` (spécification M6 § 3 et § 6.1 ; décisions 0157 § 1.1 à § 1.4 et 0158
 * § 3 ; ticket 1013, M6a) : jeton aléatoire, empreinte dans `share_links`, vue partagée lue par les vues de la base.
 *
 * Ce module n'importe rien de `src/server` : les cas d'usage (`src/server/partage/liens.ts` et `vue.ts`) lui sont remis
 * par `./api-share-instance.ts`, où `src/instrumentation.ts` les branche au démarrage (modèle de `api-instance.ts` et de
 * `api-creation-instance.ts`, décisions 0101 § 1 et 0108). Appel direct dans le même processus, sans action ni appel
 * HTTP vers soi-même ; la garantie « côté serveur seulement » tient par `server-only` des modules appelés.
 *
 * - **Jeton** : seule la forme aléatoire (`SHARE_TOKEN_PATTERN`) est lue ; un jeton signé du site d'essai
 *   (`SIGNED_SHARE_TOKEN_PATTERN`) ou toute autre forme répond 404 **sans aucune lecture** (critère 13, option (A)).
 * - **Fin du partage** (0157 § 1.3 point 2) : en plus de la borne stockée (la base refuse `expires_at <= now()`), la
 *   règle de F10-TL-7 sur le voyage tel qu'il est lu : `localDateAt(now, timeZone) > accessUntil(end, …)` → 404.
 * - **Projection stricte** : la vue lue est validée par `SharedTripViewSchema` / `SharedDayViewSchema` ; un champ en trop
 *   lève (page d'erreur commune), jamais une donnée en trop à l'écran.
 */

/** Vue lue par le serveur, avant la validation stricte ; `timeZone` ne sort pas de l'adaptateur. */
export type VuePartageeApi = { readonly trip: unknown; readonly maps: unknown; readonly timeZone: string };

/** Cas d'usage du serveur branchés au démarrage (`src/server/partage/liens.ts` et `vue.ts`). */
export type PartageApi = {
  readonly creer: (ctx: AdapterContext, tripId: string, maintenant: number) => Promise<Result<CreatedShareLink>>;
  readonly desactiver: (ctx: AdapterContext, tripId: string) => Promise<Result<ShareStatus>>;
  readonly etat: (ctx: AdapterContext, tripId: string, maintenant: number) => Promise<Result<ShareStatus>>;
  readonly lireVue: (token: string, chemin: string) => Promise<VuePartageeApi | null>;
};

export type OptionsPartageApi = {
  /** Horloge de la portée de la requête. */
  readonly now: () => number;
  /** Durée du partage après le dernier jour (`accessDaysAfterReturn`). */
  readonly accessDaysAfterReturn: number;
};

export function createApiShareAdapter(partage: PartageApi, options: OptionsPartageApi): ShareAdapter {
  const { now, accessDaysAfterReturn } = options;

  /** Vue d'un jeton aléatoire, partage en cours à l'heure de la destination ; `null` sinon (404 commun). */
  async function lire(token: string, chemin: string) {
    if (!SHARE_TOKEN_PATTERN.test(token)) return null;
    const vue = await partage.lireVue(token, chemin);
    if (vue === null) return null;
    const trip = SharedTripViewSchema.shape.trip.parse(vue.trip);
    if (localDateAt(now(), vue.timeZone) > accessUntil(trip.end, accessDaysAfterReturn)) return null;
    return { trip, maps: vue.maps };
  }

  return {
    createLink: (ctx, tripId) => partage.creer(ctx, tripId, now()),
    revokeLink: (ctx, tripId) => partage.desactiver(ctx, tripId),
    getStatus: (ctx, tripId) => partage.etat(ctx, tripId, now()),

    async getSharedTrip(token) {
      const lu = await lire(token, `/p/${token}`);
      return lu === null ? null : SharedTripViewSchema.parse({ trip: lu.trip, maps: lu.maps });
    },

    async getSharedDay(token, index) {
      const lu = await lire(token, `/p/${token}/jour/${index}`);
      if (lu === null || !lu.trip.days.some((day) => day.index === index)) return null;
      const maps = SharedTripViewSchema.shape.maps.parse(lu.maps);
      const points = maps.find((map) => map.index === index)?.points ?? [];
      return SharedDayViewSchema.parse({ trip: lu.trip, dayIndex: index, points });
    },
  };
}
