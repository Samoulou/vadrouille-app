import "server-only";

import {
  getRequestContext,
  getRevisionVersion,
  getTripReader,
  isApiAdapter,
  isMockAdapter,
  SessionRequiseError,
  versionsDuVoyage,
  type AdapterContext,
} from "@/adapters";
import type { Trip } from "@/contracts";
import { TRIP_ID_PATTERN } from "@/contracts/values";
import { connexionRoute } from "@/features/compte/suite";
import { tripRoutes } from "@/features/sejour/routes";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";
import { entreesDuCalendrier, genererIcs } from "@/server/calendrier/ics";
import { serverEnv } from "@/server/env";
import { verdictRateLimit, type RateLimitVerdict } from "@/server/rate-limit";

/**
 * Route `GET /api/v1/voyages/[id]/calendrier` (spécification M6 § 4 et § 6.2 ; décision 0157 § 1.6, T6, et § 2.5, S5 ;
 * ticket 1005, M6b). Importé seulement par `src/app/api/v1/voyages/[id]/calendrier/route.ts` (`ligne/route-handlers`).
 * Contrôles, dans cet ordre :
 * 1. `[id]` conforme à `TRIP_ID_PATTERN` **avant toute lecture**, sinon 404 ;
 * 2. adaptateur `mock` ou `api` seulement : `prototype` (site d'essai, plan § 10) → 404 ;
 * 3. session : sans session (`better-auth`), même réponse que le Séjour sans session (redirection vers l'écran 4, suite le
 *    Séjour du voyage) ;
 * 4. voyage lu par `getTripReader()` dans l'organisation de la session : inconnu, d'une autre organisation ou non débloqué
 *    → 404 sans contenu ;
 * 5. limite `calendrier` **par voyage** (`src/server/config/limites.ts`), après la session et le contrôle du voyage, avant
 *    la version et la génération ; `api` seulement (le limiteur est en base ; `mock` n'en a pas, comme pour `retouche`) ;
 *    au-delà, 429 sans corps ;
 * 6. aucune étape à ajouter (toutes les journées en préparation) → 404 : un `VCALENDAR` sans composant n'est pas valide
 *    (RFC 5545 § 3.4), et l'écran ne propose alors pas de téléchargement (critère 10) ;
 * 7. fichier : version courante (`SEQUENCE`), origine de `APP_URL` (nulle : ni `URL` ni lien), textes du § 7.
 * Toute réponse porte `Cache-Control: private, no-store` et `X-Content-Type-Options: nosniff` ; le fichier, en plus,
 * `Content-Type: text/calendar; charset=utf-8` et `Content-Disposition: attachment; filename="programme.ics"` (nom fixe,
 * aucun texte de la personne dans un en-tête). Aucun appel externe, aucun modèle, aucune mesure.
 */

const t = messages.sejour.sejour.calendrier;

const ACTION_LIMITEUR = "calendrier";

/** Dépendances de la route, injectables par les tests (aucune base, aucun `process.env`). */
export type DependancesCalendrier = {
  /** Adaptateur de données : `mock`, `api`, ou autre (`prototype`, refusé). */
  readonly adaptateur: () => "mock" | "api" | "autre";
  /** Contexte de la session, `null` sans session (`SessionRequiseError`). */
  readonly contexte: () => Promise<AdapterContext | null>;
  /** Voyage lu dans l'organisation du contexte (`getTripReader()`), `null` si inconnu ou d'une autre organisation. */
  readonly lireVoyage: (ctx: AdapterContext, tripId: string) => Promise<Trip | null>;
  /** Limiteur `calendrier`, espèce `trip` (`verdictRateLimit`). */
  readonly limiteur: (request: Request, tripId: string) => Promise<RateLimitVerdict>;
  /** Version courante du programme (`SEQUENCE`), `null` si elle ne peut pas être lue. */
  readonly version: (ctx: AdapterContext, tripId: string, adaptateur: "mock" | "api") => Promise<number | null>;
  /** Origine de `APP_URL`, `null` sans elle. */
  readonly origine: () => string | null;
  readonly maintenant: () => Date;
};

async function contexteDeLaSession(): Promise<AdapterContext | null> {
  try {
    return await getRequestContext();
  } catch (error) {
    if (error instanceof SessionRequiseError) return null;
    throw error;
  }
}

/** Version courante : `trip_versions` sur `api` (`currentVersion`), historique simulé de la portée sur `mock`. */
async function versionCourante(ctx: AdapterContext, tripId: string, adaptateur: "mock" | "api"): Promise<number | null> {
  if (adaptateur === "api") return getRevisionVersion(ctx, tripId);
  const versions = await versionsDuVoyage();
  if (versions === null) return null;
  const page = await versions.listTripVersions(ctx, { tripId });
  return page.ok ? (page.value.items.find((item) => item.current)?.version ?? null) : null;
}

/**
 * Origine de `APP_URL` (validée par `parseServerEnv`), présente avec la connexion réelle seulement (`better-auth`), comme
 * pour les notifications ; une configuration refusée (`ServerEnvError`) donne un fichier sans lien, jamais une erreur.
 */
function origine(): string | null {
  try {
    return serverEnv().betterAuth?.appUrl ?? null;
  } catch {
    return null;
  }
}

const PAR_DEFAUT: DependancesCalendrier = {
  adaptateur: () => (isApiAdapter() ? "api" : isMockAdapter() ? "mock" : "autre"),
  contexte: contexteDeLaSession,
  lireVoyage: (ctx, tripId) => getTripReader().getTrip(ctx, tripId),
  limiteur: (request, tripId) => verdictRateLimit({ action: ACTION_LIMITEUR, headers: request.headers, tripId }),
  version: versionCourante,
  origine,
  maintenant: () => new Date(),
};

const EN_TETES_COMMUNS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } as const;

const sansCorps = (status: number, extra: Record<string, string> = {}) => new Response(null, { status, headers: { ...EN_TETES_COMMUNS, ...extra } });

export type ContexteRoute = { readonly params: Promise<{ id: string }> };

export function creerRouteCalendrier(surcharges: Partial<DependancesCalendrier> = {}): (request: Request, route: ContexteRoute) => Promise<Response> {
  const d: DependancesCalendrier = { ...PAR_DEFAUT, ...surcharges };
  return async (request, route) => {
    const { id } = await route.params;
    if (!TRIP_ID_PATTERN.test(id)) return sansCorps(404);
    const adaptateur = d.adaptateur();
    if (adaptateur === "autre") return sansCorps(404);
    const ctx = await d.contexte();
    if (ctx === null) return sansCorps(307, { Location: connexionRoute(tripRoutes("/voyages", id).sejour()) });
    const trip = await d.lireVoyage(ctx, id);
    if (trip === null || !trip.unlocked) return sansCorps(404);
    if (adaptateur === "api" && !(await d.limiteur(request, id)).ok) return sansCorps(429);
    if (entreesDuCalendrier(trip).length === 0) return sansCorps(404);
    const version = await d.version(ctx, id, adaptateur);
    if (version === null) return sansCorps(500);
    const texte = genererIcs({ trip, version }, d.origine(), d.maintenant(), {
      nomCalendrier: format(t.nom, { destination: trip.destination }),
      aReserver: t.aReserver,
    });
    return new Response(texte, {
      status: 200,
      headers: {
        ...EN_TETES_COMMUNS,
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="programme.ics"',
      },
    });
  };
}

let parDefaut: ((request: Request, route: ContexteRoute) => Promise<Response>) | undefined;

/** Gestionnaire du serveur (adaptateurs de la requête, limiteur en base, `serverEnv()`), créé au premier appel. */
export function telechargerCalendrier(request: Request, route: ContexteRoute): Promise<Response> {
  parDefaut ??= creerRouteCalendrier();
  return parDefaut(request, route);
}
