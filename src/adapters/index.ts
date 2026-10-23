import type { PlacePhoto } from "@/contracts/photo";
import { APP_TRIAL_TRIP_ID_PATTERN, type RevisionFixtures, type Trip, type TrialRevisionRequest, type TrialRevisionResult } from "@/contracts";
import { unlockRoutes } from "@/features/presentation/routes";
import { PROTOTYPE_ORG_ID } from "@/prototype/programme-reduit";
import { OFFER_CONFIG } from "@/server/config/offer";

import { apiCreationAdapter } from "./api-creation-instance";
import { apiTripAdapter } from "./api-instance";
import { assertAuthAdapter } from "./auth-guard";
import { betterAuthServerAdapter } from "./better-auth";
import { counterpartOf, getMockRevisionFixtures, mockTripAdapter } from "./mock";
import { createMockAuthAdapter } from "./mock-auth";
import { createMockCreationAdapter } from "./mock-creation";
import { createMockPaymentAdapter } from "./mock-payment";
import { createMockShareAdapter, shareEnded } from "./mock-share";
import { assertPrototypeAllowedOnProcess, deblocagesEssai, photosEssai, prototypeCreationAdapter, prototypeTripAdapter, revisionEssai } from "./prototype-instance";
import { withSimulatedUnlock } from "./mock-unlock";
import { adapterChoice, isPrototypeAdapter, paymentAvailable } from "./payment-guard";
import { shareAvailable } from "./share-guard";
import { authHmacKey, defaultScope, getSimulationScope, MAX_AUTH_ADDRESSES_PER_SCOPE, MAX_LAUNCHES_PER_SCOPE, type SimulationScope } from "./simulation";
import type { AdapterContext, AuthAdapter, CreationAdapter, PaymentAdapter, PaymentSimulator, ShareAdapter, TripAdapter } from "./types";

export type {
  AdapterContext,
  AuthAdapter,
  AuthConfig,
  CreationAdapter,
  MemberRole,
  PaymentAdapter,
  PaymentSimulator,
  ShareAdapter,
  TripAdapter,
} from "./types";
export { MOCK_DEMO_TRIP, MOCK_DEMO_UNLOCKED_TRIP } from "./mock";
/**
 * Brouillon de démonstration de `R3-dev` (décision 0017 § 7) : réservé aux pages de développement et aux tests,
 * comme `MOCK_DEMO_TRIP`. Jamais lu par une route produit.
 */
export { MOCK_DEMO_TRIP_DRAFT as MOCK_DEMO_DRAFT } from "@/mocks/creation-edimbourg";
export { authAdapterChoice, betterAuthAllowed, mockAuthAllowed } from "./auth-guard";
export { assertApiAdapter } from "./api-guard";
export { getRequestContext, SessionRequiseError } from "./context";
export { isPrototypeAdapter, paymentAvailable, paymentDemoAllowed } from "./payment-guard";
export { shareAvailable, shareDemoAvailable } from "./share-guard";
export { getSimulationScope, type SimulationScope } from "./simulation";
export { brancherLectureProgrammesReels, prototypeRelectures } from "./prototype-instance";

/**
 * Vrai quand l'adaptateur de données est `mock` (`DATA_ADAPTER` absent, vide ou `mock`), faux pour
 * toute autre valeur, sans lever d'erreur (spécification D1, D1-PO-1). Ne dépend ni de `NODE_ENV`
 * ni des pages de développement.
 */
export function isMockAdapter(value: string | undefined = process.env.DATA_ADAPTER): boolean {
  return adapterChoice(value) === "mock";
}

/**
 * Garde du site d'essai (spécification E2E-essai, lot 2), pour une page qui n'a rien à lire : faux avec `mock` et `api` ;
 * avec `prototype`, vrai dans la liste blanche (`prototypeAdapterAllowed`, décision 0032 § A4.2), sinon lève la même
 * erreur que `getTripAdapter()` (erreur 500), sans construire l'adaptateur ni rien lire.
 */
export function siteEssaiAutorise(value: string | undefined = process.env.DATA_ADAPTER): boolean {
  if (adapterChoice(value) !== "prototype") return false;
  assertPrototypeAllowedOnProcess();
  return true;
}

/**
 * Choisit l'adaptateur selon la variable serveur `DATA_ADAPTER`
 * (`mock` par défaut). Sans préfixe `NEXT_PUBLIC_`, elle n'est jamais
 * exposée au navigateur. `prototype` (décision 0032 § A4) lève une erreur hors de la liste blanche
 * `prototypeAdapterAllowed(env)` ; `api` (B6b) lève hors de sa garde (`assertApiAdapter`), sans repli vers `mock`, et
 * rend l'adaptateur branché au démarrage par `src/instrumentation.ts` (`./api-instance.ts`).
 */
export function getTripAdapter(value: string | undefined = process.env.DATA_ADAPTER, env: NodeJS.ProcessEnv = process.env): TripAdapter {
  const choice = adapterChoice(value);
  switch (choice) {
    case "mock":
      return mockTripAdapter;
    case "api":
      // Garde lue sur l'environnement du processus, jamais sur `env` (src/adapters/api-guard.ts).
      return apiTripAdapter();
    case "prototype":
      return prototypeTripAdapter(env);
    default:
      throw new Error(`DATA_ADAPTER inconnu : « ${choice} » (valeurs : mock, api, prototype)`);
  }
}

/**
 * Création du voyage (décision 0017 § 3.1), selon la variable serveur `DATA_ADAPTER` (`mock` par défaut, même
 * normalisation que `getTripAdapter`, erreur pour une valeur inconnue). L'état simulé (lancements, issue de la
 * génération, horloge) vit dans la portée `options.scope` (portée par défaut sinon, § 10) ; `structureBrief` et
 * `suggestLodging` ne gardent rien. Les voyages sont lus par `getTripAdapter()` (voyage jamais lancé dans la portée).
 * `api` (B9e) : garde `assertApiAdapter`, sans repli vers `mock`, puis l'adaptateur branché au démarrage par
 * `src/instrumentation.ts` (`./api-creation-instance.ts`). `prototype` (site d'essai, lot 3 de E2E-essai) : liste blanche,
 * puis la création d'un voyage d'essai (`./prototype-creation.ts`).
 */
export function getCreationAdapter(value: string | undefined = process.env.DATA_ADAPTER, options: { scope?: SimulationScope } = {}): CreationAdapter {
  const choice = adapterChoice(value);
  switch (choice) {
    case "mock": {
      const scope = options.scope ?? defaultScope();
      return createMockCreationAdapter({
        now: () => scope.clock.now(),
        store: scope.creation,
        trips: getTripAdapter(value),
        maxLaunches: MAX_LAUNCHES_PER_SCOPE,
      });
    }
    case "api":
      // B9e : garde (`assertApiAdapter`), puis la création branchée au démarrage par `src/instrumentation.ts`
      // (`./api-creation-instance.ts`) ; la portée de simulation ne sert pas (l'état vit en base).
      return apiCreationAdapter();
    case "prototype":
      // Spécification E2E-essai, lot 3 (décision 0125 § 4) : lancement de `p0Run` sur le brief saisi et avancement, par
      // le port branché au démarrage ; même liste blanche que la lecture (erreur hors liste blanche, jamais de repli).
      return prototypeCreationAdapter();
    default:
      throw new Error(`DATA_ADAPTER inconnu : « ${choice} » (valeurs : mock, api, prototype)`);
  }
}

/**
 * Connexion (décision 0017 § 3.1 et § 11.2), selon la variable serveur `AUTH_ADAPTER` (`mock` par défaut). **Garde
 * fermée par défaut** (`assertAuthAdapter`) : lève une erreur à l'appel, avant toute connexion à la base, pour
 * l'adaptateur `mock` sur un déploiement de production ou hors `development`/`test` sans `VADROUILLE_DEMO_AUTH=1`, pour
 * `better-auth` hors `local` et `ci` (B3c ; B3-TL-2, décision 0077 § 5.1), et pour un adaptateur inconnu. Aucun repli
 * permissif. `better-auth` : adaptateur réel de `./better-auth.ts` (B3c), qui charge ses modules à l'appel. `mock` :
 * l'état simulé vit dans la portée `options.scope` (portée par défaut sinon) ; `env` sert aux tests.
 */
export function getAuthAdapter(options: { scope?: SimulationScope; env?: NodeJS.ProcessEnv } = {}): AuthAdapter {
  if (assertAuthAdapter(options.env) === "better-auth") return betterAuthServerAdapter();
  const scope = options.scope ?? defaultScope();
  return createMockAuthAdapter({
    now: () => scope.clock.now(),
    store: scope.auth,
    key: authHmacKey(),
    maxAddresses: MAX_AUTH_ADDRESSES_PER_SCOPE,
  });
}

/** Durées de la simulation de paiement (décision 0020 § 6). */
export const CHECKOUT_TTL_MS = 30 * 60_000;
export const DEMO_UNLOCK_TTL_MS = 30 * 60_000;

function paymentAdapterChoice(value: string | undefined = process.env.PAYMENT_ADAPTER): "mock" {
  const choice = adapterChoice(value);
  switch (choice) {
    case "mock":
      return "mock";
    case "stripe":
      throw new Error("adaptateur de paiement stripe non implémenté (tâche de paiement réel, après G0 et Q26)");
    default:
      throw new Error(`PAYMENT_ADAPTER inconnu : « ${choice} » (valeurs : mock, stripe)`);
  }
}

function mockPaymentFor(scope: SimulationScope): PaymentAdapter & PaymentSimulator {
  return createMockPaymentAdapter({
    offer: OFFER_CONFIG,
    trips: getTripAdapter(),
    now: () => scope.clock.now(),
    store: scope.payment,
    checkoutTtlMs: CHECKOUT_TTL_MS,
    confirmationDelayMs: scope.payment.confirmationDelayMs,
    // Portée par défaut, partagée par les visiteurs d'une instance : un droit simulé y expire après 30 min.
    entitlementTtlMs: scope.explicit ? undefined : DEMO_UNLOCK_TTL_MS,
    simulationPath: (tripId, checkoutId) => unlockRoutes(tripId).paiementSimule(checkoutId),
  });
}

/**
 * Adaptateur de paiement (variable serveur `PAYMENT_ADAPTER`, `mock` par défaut). **Filet de sécurité** :
 * lève une erreur si `paymentAvailable()` est faux ; les pages et les actions consultent la garde avant
 * et ne l'atteignent jamais dans ce cas.
 */
export function getPaymentAdapter(options: { scope?: SimulationScope } = {}): PaymentAdapter {
  if (!paymentAvailable()) {
    throw new Error("paiement indisponible : paymentAvailable() est faux (décision 0020 § 2.3)");
  }
  paymentAdapterChoice();
  return mockPaymentFor(options.scope ?? defaultScope());
}

/** Simulation des issues : `null` hors adaptateur simulé autorisé (décision 0020 § 2.3). */
export function getPaymentSimulator(options: { scope?: SimulationScope } = {}): PaymentSimulator | null {
  if (!paymentAvailable()) return null;
  return mockPaymentFor(options.scope ?? defaultScope());
}

/**
 * Lecture des voyages par les pages du voyage (décision 0020 § 3, forme B) : l'adaptateur de base tel quel
 * sans paiement simulé disponible ; sinon, le décorateur qui sert un voyage débloqué par un droit de la
 * portée (lue à chaque appel, par `getSimulationScope()` si `options.scope` est absent).
 */
export function getTripReader(options: { scope?: SimulationScope } = {}): TripAdapter {
  const base = getTripAdapter();
  if (!paymentAvailable()) return base;
  if (isPrototypeAdapter()) {
    // Voyage d'essai (spécification E2E-essai, lot 1) : débloqué par le droit simulé de la portée, ou par le cookie signé
    // de l'essai (préversion seulement, garde du mode réel ouverte) ; l'adaptateur sert alors toutes ses journées.
    return prototypeTripAdapter(process.env, async (ctx, tripId) => {
      const scope = options.scope ?? (await getSimulationScope());
      if ((await mockPaymentFor(scope).getEntitlement(ctx, tripId)).unlocked) return true;
      return (await deblocagesEssai()?.lire(ctx))?.has(tripId) === true;
    });
  }
  return withSimulatedUnlock(
    base,
    async (ctx, tripId) => mockPaymentFor(options.scope ?? (await getSimulationScope())).getEntitlement(ctx, tripId),
    counterpartOf,
  );
}

/**
 * Voyage d'essai (spécification E2E-essai, lot 1 ; décision 0124 § 4) : indicateur décidé par l'adaptateur
 * (`TripAdapter.isTrialTrip`), seul prédicat que lisent les écrans. Adaptateur sans la méthode (`mock`, `api`) ou
 * lecture qui lève : `false` (parcours habituel).
 */
export async function isTrialTrip(adapter: TripAdapter, ctx: AdapterContext, tripId: string): Promise<boolean> {
  try {
    return (await adapter.isTrialTrip?.(ctx, tripId)) === true;
  } catch {
    return false;
  }
}

/**
 * Retient le déblocage simulé d'un voyage d'essai (spécification E2E-essai, lot 1) après un paiement simulé réussi :
 * cookie signé de l'essai, écrit par une action serveur seulement. Sans effet hors adaptateur `prototype`, paiement
 * simulé indisponible ou cookie non branché (garde du mode réel fermée). Ne lève jamais.
 */
export async function retenirDeblocageEssai(ctx: AdapterContext, tripId: string): Promise<void> {
  if (!isPrototypeAdapter() || !paymentAvailable()) return;
  try {
    await deblocagesEssai()?.retenir(ctx, tripId);
  } catch {
    // Cookie non écrit : le droit simulé de la portée reste ; la page n'échoue pas.
  }
}

/**
 * Voyage d'essai dont le tri réécrit le programme (spécification E2E-essai, lot 4 ; décision 0126) : voyage lancé depuis
 * l'app (identifiant `proto_<slug>_<exécution>`, décision 0125 § 2). Les voyages d'un brief commité ne se révisent pas
 * (leur fusible d'IA est entier, 0126 § 2).
 */
export function voyageEssaiRevisable(tripId: string): boolean {
  // Même motif que `lireIdentifiantVoyageSaisi` (`src/domain/identifiant.ts`), source unique dans `@/contracts`.
  return APP_TRIAL_TRIP_ID_PATTERN.test(tripId);
}

/** Statuts du lancement d'une révision ramenés au contrat (décision 0126) ; tout autre devient `unavailable`. */
const STATUT_REVISION: ReadonlyMap<string, TrialRevisionResult["status"]> = new Map([
  ["lancee", "started"],
  ["en_cours", "inProgress"],
  ["epuisees", "exhausted"],
  ["acces_refuse", "accessExpired"],
  ["cap_reached", "capReached"],
  ["envelope_reached", "capReached"],
  ["daily_quota_insufficient", "capReached"],
]);

/**
 * « Pas pour moi » change le programme d'un voyage d'essai (spécification E2E-essai, lot 4 ; décision 0126) : lance la
 * révision par le port de création de l'adaptateur `prototype` (même garde que le lancement : code d'accès, forfaits).
 * Hors adaptateur `prototype`, hors organisation de l'essai ou port non branché : `unavailable`, rien n'est lancé. Ne lève
 * jamais ; aucun journal.
 */
export async function reviserProgrammeEssai(ctx: AdapterContext, demande: TrialRevisionRequest): Promise<TrialRevisionResult> {
  if (!isPrototypeAdapter() || ctx.organizationId !== PROTOTYPE_ORG_ID) return { status: "unavailable" };
  try {
    const reviser = revisionEssai();
    if (reviser === null) return { status: "unavailable" };
    const { statut } = await reviser({ tripId: demande.tripId, pasPourMoi: demande.notForMe, jAime: demande.liked });
    return { status: STATUT_REVISION.get(statut) ?? "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

/** Identifiant de lieu admis pour une photo : même forme que `PLACE_ID_GOOGLE` (`src/grounding/enveloppe-google.ts`). */
const PLACE_ID_PHOTO = /^[A-Za-z0-9_-]{1,256}$/;

/**
 * Photo d'une carte du tri d'un voyage d'essai (décision 0128, demande de Samuel du 2026-10-23 15:23 UTC), chargée à la
 * demande par les photos branchées sur l'adaptateur `prototype` (`src/server/p0/photos.ts` : garde du mode réel, cookie
 * d'accès, forfait réservé). Hors adaptateur `prototype`, hors organisation de l'essai, identifiant mal formé ou photos
 * non branchées : `null`, aucun appel. Ne lève jamais ; rien n'est stocké.
 */
export async function photoLieuEssai(ctx: AdapterContext, placeId: string): Promise<PlacePhoto | null> {
  if (!isPrototypeAdapter() || ctx.organizationId !== PROTOTYPE_ORG_ID || !PLACE_ID_PHOTO.test(placeId)) return null;
  try {
    return (await photosEssai()?.photo(placeId)) ?? null;
  } catch {
    return null;
  }
}

/**
 * Jeu simulé de révision d'un voyage (spécification F7, F7-TL-3 ; décision 0016 § 6) : fonction à part, et non une
 * méthode de `TripAdapter` (l'adaptateur `api` n'aurait rien à y renvoyer ; B11 remplace l'ensemble par les Server
 * Actions). `null` quand l'adaptateur configuré n'est pas `mock`, et pour un voyage inconnu ou d'une autre
 * organisation. Lu par la mise en page du voyage, qui le transmet à `TripShell`.
 */
export async function getRevisionFixtures(
  ctx: AdapterContext,
  tripId: string,
  value: string | undefined = process.env.DATA_ADAPTER,
): Promise<RevisionFixtures | null> {
  if (!isMockAdapter(value)) return null;
  return getMockRevisionFixtures(ctx, tripId);
}

/**
 * Adaptateur de partage (spécification F10, F10-TL-7 ; décision 0039), simulé dans la portée de la requête : liens en
 * mémoire de la portée, voyages lus par `getTripReader()` de la même portée, durée du partage lue dans la
 * configuration serveur. **Filet de sécurité** : lève une erreur si `shareAvailable()` est faux ; les pages et les
 * actions consultent la garde avant et ne l'atteignent jamais dans ce cas.
 */
export function getShareAdapter(options: { scope?: SimulationScope } = {}): ShareAdapter {
  if (!shareAvailable()) {
    throw new Error("partage indisponible : shareAvailable() est faux (spécification F10, F10-TL-7)");
  }
  const scope = options.scope ?? defaultScope();
  return createMockShareAdapter({
    trips: getTripReader({ scope }),
    now: () => scope.clock.now(),
    store: scope.share,
    accessDaysAfterReturn: OFFER_CONFIG.accessDaysAfterReturn,
  });
}

/**
 * Bouton « Partager » du Séjour et de la Journée (F10-PO-13, F10-PO-21) : partage disponible, voyage débloqué et fin
 * du partage pas encore passée à l'horloge de la portée de la requête. Rien n'est lu si la garde est fermée.
 */
export async function shareButtonVisible(trip: Pick<Trip, "unlocked" | "end" | "timeZone">): Promise<boolean> {
  if (!shareAvailable() || !trip.unlocked) return false;
  const scope = await getSimulationScope();
  return !shareEnded(trip, scope.clock.now(), OFFER_CONFIG.accessDaysAfterReturn);
}
