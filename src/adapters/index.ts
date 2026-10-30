import type { PlacePhoto } from "@/contracts/photo";
import { APP_TRIAL_TRIP_ID_PATTERN, type RevisionFixtures, type Trip, type TrialRevisionRequest, type TrialRevisionResult } from "@/contracts";
import { unlockRoutes } from "@/features/presentation/routes";
import { PROTOTYPE_ORG_ID } from "@/prototype/programme-reduit";
import { SIGNALEMENTS_PAR_VOYAGE_ET_PAR_JOUR } from "@/server/config/lieux";
import { RATE_LIMITS } from "@/server/config/limites";
import { CONFIGURATION_MOTEUR } from "@/server/config/moteur";
import { OFFER_CONFIG } from "@/server/config/offer";

import { apiCreationAdapter } from "./api-creation-instance";
import { photosApi, type PhotosApiBranchees } from "./api-photos-instance";
import { apiTripAdapter } from "./api-instance";
import { assertAuthAdapter } from "./auth-guard";
import { betterAuthServerAdapter } from "./better-auth";
import { counterpartOf, getMockRevisionFixtures, mockTripAdapter } from "./mock";
import { createMockAuthAdapter } from "./mock-auth";
import { createMockCreationAdapter } from "./mock-creation";
import { createMockPaymentAdapter } from "./mock-payment";
import { createMockPlaces } from "./mock-lieux";
import { createMockStopReports } from "./mock-reports";
import { createMockShareAdapter, shareEnded } from "./mock-share";
import {
  assertPrototypeAllowedOnProcess,
  clePartageEssai,
  deblocagesEssai,
  photosEssai,
  prototypeCreationAdapter,
  prototypeSharedReader,
  prototypeTripAdapter,
  revisionEssai,
  sessionPartageEssaiVerifiee,
} from "./prototype-instance";
import { withSimulatedUnlock } from "./mock-unlock";
import { adapterChoice, isPrototypeAdapter, paymentAvailable } from "./payment-guard";
import { realShareAvailable, shareAvailable } from "./share-guard";
import { createSignedShareAdapter } from "./signed-share";
import { paiementSimule } from "./simulated-payment-instance";
import { paiementStripe } from "./stripe-payment-instance";
import {
  authHmacKey,
  defaultScope,
  getSimulationScope,
  MAX_AUTH_ADDRESSES_PER_SCOPE,
  MAX_LAUNCHES_PER_SCOPE,
  MAX_PLACE_SEARCHES_PER_SCOPE,
  MAX_STOP_REPORTS_PER_SCOPE,
  type SimulationScope,
} from "./simulation";
import type {
  AddPlaceAdapter,
  AdapterContext,
  AuthAdapter,
  CreationAdapter,
  PaymentAdapter,
  PaymentSimulator,
  PlaceAdapter,
  RevisionAdapter,
  ShareAdapter,
  StopReportAdapter,
  TripAdapter,
} from "./types";

export type {
  AddPlaceAdapter,
  AdapterContext,
  AuthAdapter,
  AuthConfig,
  CreationAdapter,
  MemberRole,
  PaymentAdapter,
  PaymentSimulator,
  PlaceAdapter,
  RevisionAdapter,
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
export { realShareAvailable, shareAvailable, shareDemoAvailable } from "./share-guard";
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
 * Vrai quand l'adaptateur de données est exactement `api` (`DATA_ADAPTER`, après `trim()`), faux pour toute autre valeur,
 * sans lever d'erreur ni rien construire (décision 0141 § 6.4) : l'écran 1 n'y monte la recherche de ville de `api` que si
 * `rechercheVilleApiOuverte()` rend aussi vrai.
 */
export function isApiAdapter(value: string | undefined = process.env.DATA_ADAPTER): boolean {
  return adapterChoice(value) === "api";
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

function paymentAdapterChoice(value: string | undefined = process.env.PAYMENT_ADAPTER): "mock" | "simulated" | "stripe" {
  const choice = adapterChoice(value);
  switch (choice) {
    case "mock":
      return "mock";
    case "simulated":
      // B4b (spécification B4, B4b point 1) : paiement simulé en base, branché au démarrage (`./simulated-payment-instance.ts`).
      return "simulated";
    case "stripe":
      // B4c (spécification B4, B4c point 2 ; décision 0140 § 5 point 1) : Stripe en mode test, branché au démarrage
      // (`./stripe-payment-instance.ts`) ; sans simulateur.
      return "stripe";
    default:
      throw new Error(`PAYMENT_ADAPTER inconnu : « ${choice} » (valeurs : mock, simulated, stripe)`);
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
 * Adaptateur du choix courant : `mock` dans la portée, `simulated` ou `stripe` branchés au démarrage (la portée ne sert
 * pas) ; `stripe` n'a pas de simulateur.
 */
function paymentFor(scope: SimulationScope | undefined): { adapter: PaymentAdapter; simulator: PaymentSimulator | null } {
  const choice = paymentAdapterChoice();
  if (choice === "stripe") return { adapter: paiementStripe(), simulator: null };
  const adapter = choice === "simulated" ? paiementSimule() : mockPaymentFor(scope ?? defaultScope());
  return { adapter, simulator: adapter };
}

/**
 * Adaptateur de paiement (variable serveur `PAYMENT_ADAPTER`, `mock` par défaut ; `simulated` depuis B4b et `stripe` en
 * mode test depuis B4c : l'état vit alors en base et la portée de simulation ne sert pas). **Filet de sécurité** : lève
 * une erreur si `paymentAvailable()` est faux ; les pages et les actions consultent la garde avant et ne l'atteignent
 * jamais dans ce cas.
 */
export function getPaymentAdapter(options: { scope?: SimulationScope } = {}): PaymentAdapter {
  if (!paymentAvailable()) {
    throw new Error("paiement indisponible : paymentAvailable() est faux (décision 0020 § 2.3)");
  }
  return paymentFor(options.scope).adapter;
}

/**
 * Simulation des issues : `null` hors adaptateur simulé autorisé (décision 0020 § 2.3, amendée par B4b), et toujours
 * `null` pour `stripe` (B4c, décision 0140 § 5 point 1 : seul le webhook Stripe accorde le droit).
 */
export function getPaymentSimulator(options: { scope?: SimulationScope } = {}): PaymentSimulator | null {
  if (!paymentAvailable()) return null;
  return paymentFor(options.scope).simulator;
}

/**
 * Lecture des voyages par les pages du voyage (décision 0020 § 3, forme B) : l'adaptateur de base tel quel
 * sans paiement simulé disponible, ou si l'adaptateur de paiement n'est pas le simulé **en mémoire** (`mock`) : avec
 * `simulated` (B4b point 3, B4-TL-14), `Trip.unlocked` vient de `entitlements` par l'adaptateur `api`. Sinon, le
 * décorateur qui sert un voyage débloqué par un droit de la portée (lue à chaque appel, par `getSimulationScope()` si
 * `options.scope` est absent).
 */
export function getTripReader(options: { scope?: SimulationScope } = {}): TripAdapter {
  const base = getTripAdapter();
  if (!paymentAvailable() || adapterChoice(process.env.PAYMENT_ADAPTER) !== "mock") return base;
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
 * Lieu d'une proposition **du voyage demandé**, parmi les cartes que l'écran montre (`loadPresentation`) : l'aperçu
 * (`listPreviewSlots`) d'un voyage d'essai non débloqué, ses propositions (`listProposals`) sinon. Voyage inconnu ou
 * d'une autre organisation (les deux lectures rendent une liste vide), proposition absente ou sans lieu : `null`.
 */
async function lieuDeLaProposition(lecteur: TripAdapter, ctx: AdapterContext, tripId: string, proposalId: string): Promise<string | null> {
  // L'aperçu d'abord : vide sans recomposition pour un voyage débloqué ou un programme qui porte ses propositions, qui
  // passent alors par `listProposals` ; une seule recomposition des journées dans tous les cas.
  const apercu = (await lecteur.listPreviewSlots(ctx, tripId)).flatMap((slot) => (slot.type === "proposal" ? [slot.proposal] : []));
  const proposals = apercu.length > 0 ? apercu : await lecteur.listProposals(ctx, tripId);
  return proposals.find((proposal) => proposal.id === proposalId)?.stop.placeId ?? null;
}

/**
 * Étape commune aux photos du site d'essai et de `api` (décisions 0128 et 0143) : lecture différée du lieu de la carte,
 * appelée par le service des photos après sa barrière seulement ; lieu absent ou mal formé : `null`.
 */
function lieuDeLaCarte(
  lecteur: () => TripAdapter,
  ctx: AdapterContext,
  demande: { readonly tripId: string; readonly proposalId: string },
): () => Promise<string | null> {
  return async () => {
    const placeId = await lieuDeLaProposition(lecteur(), ctx, demande.tripId, demande.proposalId);
    return placeId !== null && PLACE_ID_PHOTO.test(placeId) ? placeId : null;
  };
}

/**
 * Photo d'une carte du tri d'un voyage d'essai (décision 0128, demande de Samuel du 2026-10-23 15:23 UTC), chargée à la
 * demande par les photos branchées sur l'adaptateur `prototype` (`src/server/p0/photos.ts` : garde du mode réel, cookie
 * d'accès, cadence et forfait réservé). **Le lieu n'est jamais pris de l'entrée** : il est lu sur la proposition
 * `proposalId` du voyage `tripId`, dans le contexte d'organisation de la requête (F13-TL-2 : une proposition du voyage du
 * demandeur seulement). Hors adaptateur `prototype`, hors organisation de l'essai, photos non branchées, voyage inconnu,
 * proposition d'un autre voyage ou sans lieu, identifiant mal formé : `null`, aucun appel. Ne lève jamais ; rien n'est
 * stocké.
 */
export async function photoLieuEssai(
  ctx: AdapterContext,
  demande: { readonly tripId: string; readonly proposalId: string },
  lecteur: () => TripAdapter = getTripReader,
): Promise<PlacePhoto | null> {
  if (!isPrototypeAdapter() || ctx.organizationId !== PROTOTYPE_ORG_ID) return null;
  try {
    const photos = photosEssai();
    if (photos === null) return null;
    // Le voyage n'est lu qu'après la garde et le cookie d'accès (`src/server/p0/photos.ts`) : sans code d'accès, aucune lecture.
    const lieu = lieuDeLaCarte(lecteur, ctx, demande);
    return (await photos.photo(lieu)) ?? null;
  } catch {
    return null;
  }
}

/**
 * Chemin des photos du tri selon l'adaptateur de données (décision 0128, ticket 879) : `prototype` (site d'essai),
 * `api` (vraie app), `null` pour `mock` et toute autre valeur (aucune photo, rien n'est lu). Sans lever d'erreur.
 */
export function cheminPhotosDuTri(value: string | undefined = process.env.DATA_ADAPTER): "prototype" | "api" | null {
  const choix = adapterChoice(value);
  return choix === "prototype" || choix === "api" ? choix : null;
}

/**
 * Photo d'une carte du tri sur l'adaptateur `api` (décision 0143, qui généralise 0128 ; ticket 879, M1e) : barrière
 * B9-TL-8, client branché, lieu, cadence et client de `src/server/photos/api.ts`, branchés au démarrage
 * (`api-photos-instance.ts`). **Le lieu n'est jamais pris de l'entrée** : il est lu en base sur la proposition
 * `proposalId` du voyage `tripId`, par `getTripReader()` dans le contexte d'organisation de la requête (mêmes cartes que
 * l'écran, `lieuDeLaProposition`), et seulement barrière ouverte et client branché. Hors adaptateur `api`,
 * voyage inconnu ou d'une autre organisation, proposition d'un autre voyage ou sans lieu, identifiant mal formé : `null`,
 * photos non branchées, aucun appel. Ne lève jamais ; rien n'est stocké.
 */
export async function photoLieuApi(
  ctx: AdapterContext,
  demande: { readonly tripId: string; readonly proposalId: string },
  lecteur: () => TripAdapter = getTripReader,
): Promise<PlacePhoto | null> {
  if (cheminPhotosDuTri() !== "api") return null;
  try {
    const photos = photosApi();
    if (photos === null) return null;
    const lieu = lieuDeLaCarte(lecteur, ctx, demande);
    return (await photos.photo(lieu)) ?? null;
  } catch {
    return null;
  }
}

/**
 * Vrai si l'écran du tri demande la photo de la carte affichée : site d'essai (`prototype`, sa garde est celle de
 * l'action), ou `api` barrière ouverte et client branché (`photosApiOuvertes`) ; faux sinon (`mock`, `api` sous la
 * barrière fermée ou photos non branchées : l'emplacement « Photo du lieu » reste, sans appel à l'action).
 */
export async function photosDuTriActives(photos: () => PhotosApiBranchees | null = photosApi): Promise<boolean> {
  const chemin = cheminPhotosDuTri();
  if (chemin === "prototype") return true;
  if (chemin !== "api") return false;
  try {
    return (await photos()?.ouvertes()) === true;
  } catch {
    return false;
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
 * Révision enregistrée (écran 14 ; tâche M1g, ticket 869) : celle de l'adaptateur `api` (`TripAdapter.revision`),
 * `null` pour `mock` et `prototype` (l'écran garde alors son implémentation en mémoire et le jeu simulé de révision).
 * Lue par les actions serveur de `src/server/actions/remplacement.ts` et par la mise en page du voyage.
 */
export function revisionEnregistree(value: string | undefined = process.env.DATA_ADAPTER): RevisionAdapter | null {
  if (adapterChoice(value) !== "api") return null;
  return getTripAdapter(value).revision ?? null;
}

/**
 * Signalement d'une erreur sur une étape (tâche M5c, ticket 904 ; décision 0147 § 1) : `mock`, dans la portée de simulation
 * (`options.scope`, sinon celle de la requête), voyages lus par `getTripReader()` de la même portée ; `api`, la table
 * `feedback` (`TripAdapter.reports`) ; `null` pour `prototype` (le site d'essai n'a pas de signalement : la fiche ne montre
 * pas le bouton, `signalementDisponible`). Lu par l'action serveur `reportStop` (`src/server/actions/retouches.ts`).
 */
export async function signalementsDuVoyage(
  value: string | undefined = process.env.DATA_ADAPTER,
  options: { scope?: SimulationScope } = {},
): Promise<StopReportAdapter | null> {
  const choice = adapterChoice(value);
  if (choice === "api") return getTripAdapter(value).reports ?? null;
  if (choice !== "mock") return null;
  const scope = options.scope ?? (await getSimulationScope());
  const store = (scope.reports ??= { records: [] });
  return createMockStopReports({
    trips: getTripReader({ scope }),
    store,
    now: () => scope.clock.now(),
    plafond: SIGNALEMENTS_PAR_VOYAGE_ET_PAR_JOUR,
    max: MAX_STOP_REPORTS_PER_SCOPE,
  });
}

/** Recherches par voyage et par 24 heures sur `mock` : la règle `trip` de `lieu-recherche` (décision 0147 § 6.4 point 1). */
function plafondRechercheParVoyage(): number {
  return RATE_LIMITS["lieu-recherche"]?.find((regle) => regle.kind === "trip")?.threshold ?? 0;
}

/**
 * Lieu à soi (tâche M5d-1, ticket 939 ; décision 0147 § 3) : `mock`, recherche et ajout simulés dans la portée de
 * simulation (`options.scope`, sinon celle de la requête), voyages lus par `getTripReader()` de la même portée ; `null`
 * pour `api` (recherche par le terminal de la composition, ajout par `ajoutDeLieu`) et pour `prototype` (le site d'essai
 * n'a pas d'ajout). Lu par les actions serveur de `src/server/actions/lieux.ts`.
 */
export async function lieuxSimules(
  value: string | undefined = process.env.DATA_ADAPTER,
  options: { scope?: SimulationScope } = {},
): Promise<PlaceAdapter | null> {
  if (adapterChoice(value) !== "mock") return null;
  const scope = options.scope ?? (await getSimulationScope());
  const store = (scope.placeSearches ??= { records: [] });
  const { activity, lunch, dinner } = CONFIGURATION_MOTEUR.dureesParDefaut;
  return createMockPlaces({
    trips: getTripReader({ scope }),
    store,
    now: () => scope.clock.now(),
    plafond: plafondRechercheParVoyage(),
    durees: { activity, lunch, dinner },
    max: MAX_PLACE_SEARCHES_PER_SCOPE,
  });
}

/**
 * Aperçu et application d'un ajout (M5d-1) : `api`, cas d'usage de `src/server/lieux/ajout.ts` (`TripAdapter.places`) ;
 * `mock`, l'ajout simulé de `lieuxSimules` ; `null` pour `prototype`.
 */
export async function ajoutDeLieu(value: string | undefined = process.env.DATA_ADAPTER, options: { scope?: SimulationScope } = {}): Promise<AddPlaceAdapter | null> {
  const choice = adapterChoice(value);
  if (choice === "api") return getTripAdapter(value).places ?? null;
  return lieuxSimules(value, options);
}

/** Bouton « Signaler une erreur » de la fiche (M5c) : adaptateurs `mock` et `api` seulement, décidé côté serveur. */
export function signalementDisponible(value: string | undefined = process.env.DATA_ADAPTER): boolean {
  const choice = adapterChoice(value);
  return choice === "mock" || choice === "api";
}

/**
 * Version courante d'un voyage pour la révision enregistrée (M1g) : base de la première demande d'aperçu, transmise par
 * la mise en page du voyage à `TripShell`. `null` hors adaptateur `api`, pour un voyage inconnu ou d'une autre
 * organisation, ou si la lecture échoue (l'écran garde alors son implémentation en mémoire).
 */
export async function getRevisionVersion(ctx: AdapterContext, tripId: string, value: string | undefined = process.env.DATA_ADAPTER): Promise<number | null> {
  const revision = revisionEnregistree(value);
  if (revision === null) return null;
  const version = await revision.currentVersion(ctx, { tripId });
  return version.ok ? version.value : null;
}

/**
 * Adaptateur de partage (spécification F10, F10-TL-7 ; décision 0039), simulé dans la portée de la requête : liens en
 * mémoire de la portée, voyages lus par `getTripReader()` de la même portée, durée du partage lue dans la
 * configuration serveur. **Partage réel du site d'essai** (`realShareAvailable`, décision 0135) : jeton signé sans
 * stockage, lien créé depuis la session vérifiée (`getTripReader()` de la requête), vue partagée lue par un lecteur du
 * seul voyage du lien, dans l'organisation du jeton. **Filet de sécurité** : lève une erreur si `shareAvailable()` est
 * faux ; les pages et les actions consultent la garde avant et ne l'atteignent jamais dans ce cas.
 */
export function getShareAdapter(options: { scope?: SimulationScope } = {}): ShareAdapter {
  if (!shareAvailable()) {
    throw new Error("partage indisponible : shareAvailable() est faux (spécification F10, F10-TL-7)");
  }
  const scope = options.scope ?? defaultScope();
  if (realShareAvailable()) {
    return createSignedShareAdapter({
      creatorTrips: getTripReader({ scope }),
      sharedTrips: (tripId) => prototypeSharedReader(tripId),
      key: () => clePartageEssai(),
      sessionVerified: () => sessionPartageEssaiVerifiee(),
      now: () => scope.clock.now(),
      accessDaysAfterReturn: OFFER_CONFIG.accessDaysAfterReturn,
    });
  }
  return createMockShareAdapter({
    trips: getTripReader({ scope }),
    now: () => scope.clock.now(),
    store: scope.share,
    accessDaysAfterReturn: OFFER_CONFIG.accessDaysAfterReturn,
  });
}

/**
 * Bouton « Partager » du Séjour et de la Journée (F10-PO-13, F10-PO-21) : partage disponible, voyage débloqué et fin
 * du partage pas encore passée à l'horloge de la portée de la requête. Partage réel (décision 0135) : en plus, clé de
 * signature présente et session vérifiée. Rien n'est lu si la garde est fermée.
 */
export async function shareButtonVisible(trip: Pick<Trip, "unlocked" | "end" | "timeZone">): Promise<boolean> {
  if (!shareAvailable() || !trip.unlocked) return false;
  if (realShareAvailable() && (clePartageEssai() === null || !(await sessionPartageEssaiVerifiee()))) return false;
  const scope = await getSimulationScope();
  return !shareEnded(trip, scope.clock.now(), OFFER_CONFIG.accessDaysAfterReturn);
}
