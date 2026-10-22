"use server";

import { authAdapterChoice, getAuthAdapter, getCreationAdapter, isPrototypeAdapter, type AdapterContext } from "@/adapters";
import { getSimulationScope } from "@/adapters/simulation";
import {
  BriefRequestSchema,
  FullTripStatusSchema,
  GenerationStatusSchema,
  InferredBriefSchema,
  LodgingRequestSchema,
  LodgingSuggestionSchema,
  ApiErrorSchema,
  TripRequestSchema,
  fail,
  ok,
  type CreatedTrip,
  type FullTripStatus,
  type GenerationStatus,
  type InferredBrief,
  type LodgingSuggestion,
  type Result,
  type Session,
} from "@/contracts";
import { CreatedTripSchema, FullTripStatusRequestSchema, GenerationStatusRequestSchema, RetryGenerationRequestSchema } from "@/contracts/creation";
import type { ApiErrorCode } from "@/contracts/values";
import { contexteFacultatif } from "@/features/compte/session";

import { parseInput } from "../parse-input";

/**
 * Actions serveur de la création du voyage (décision 0017 § 3.3 et § 3.4, F8-PO-17). F8a livre
 * `structureBrief`, F8b `suggestLodging` ; F8c ajoute `createTrip` (action authentifiée) et `getGenerationStatus`.
 *
 * Action anonyme : 1. `parseInput` de l'entrée reçue en `unknown` (`validation_failed`, sans appel à
 * l'adaptateur) ; 2. appel de l'adaptateur ; 3. validation de la sortie par `InferredBriefSchema` : une sortie non
 * conforme devient `provider_error` et rien n'est rendu. Aucun journal : ni récit ni destination.
 */

/**
 * Erreurs de structuration transmises telles quelles ; toute autre devient `provider_error`. Typées par
 * `ApiErrorCode` (dérivé de `API_ERROR_CODES`) : un code absent de la liste commune ne compile pas.
 */
const STRUCTURE_ERRORS: ReadonlySet<ApiErrorCode> = new Set<ApiErrorCode>(["rate_limited", "cost_cap_reached", "provider_error"]);

/**
 * Site d'essai (adaptateur `prototype` ; spécification E2E-essai, lot 2, décision D2) : ni structuration du récit ni
 * suggestion de logement. Les deux actions sont fermées **avant** toute lecture de l'entrée et tout appel à
 * l'adaptateur : aucun appel de modèle ni de Google. L'interface du site d'essai ne les appelle pas ; cette garde
 * couvre un appel direct.
 */
function essaiFerme(): boolean {
  return isPrototypeAdapter();
}

export async function structureBrief(input: unknown): Promise<Result<InferredBrief>> {
  if (essaiFerme()) return fail("provider_error");
  const parsed = parseInput(BriefRequestSchema, input);
  if (!parsed.ok) return parsed;
  let result: Result<unknown>;
  try {
    result = await getCreationAdapter().structureBrief(parsed.value);
  } catch {
    return fail("provider_error");
  }
  if (!result.ok) return fail(STRUCTURE_ERRORS.has(result.error.code) ? result.error.code : "provider_error");
  const output = InferredBriefSchema.safeParse(result.value);
  return output.success ? ok(output.data) : fail("provider_error");
}

/** Erreurs de la suggestion de logement transmises telles quelles ; toute autre devient `provider_error`. */
const LODGING_ERRORS: ReadonlySet<ApiErrorCode> = new Set<ApiErrorCode>(["no_option", "rate_limited", "cost_cap_reached", "provider_error"]);

/**
 * Écran 3 (F8b, F8-PO-8) : action anonyme, même ordre que `structureBrief` (0017 § 3.4) : `parseInput` par
 * `LodgingRequestSchema` (sans appel à l'adaptateur en cas d'échec), appel de l'adaptateur, validation de la sortie
 * par `LodgingSuggestionSchema` (sinon `provider_error`, rien n'est rendu). Aucun journal : ni destination ni ville.
 */
export async function suggestLodging(input: unknown): Promise<Result<LodgingSuggestion>> {
  // Site d'essai (D2) : « aucun quartier à proposer », sans appel ; l'écran 3 propose « Continuer sans logement ».
  if (essaiFerme()) return fail("no_option");
  const parsed = parseInput(LodgingRequestSchema, input);
  if (!parsed.ok) return parsed;
  let result: Result<unknown>;
  try {
    result = await getCreationAdapter().suggestLodging(parsed.value);
  } catch {
    return fail("provider_error");
  }
  if (!result.ok) return fail(LODGING_ERRORS.has(result.error.code) ? result.error.code : "provider_error");
  const output = LodgingSuggestionSchema.safeParse(result.value);
  return output.success ? ok(output.data) : fail("provider_error");
}

/** Erreurs de la création du voyage transmises telles quelles (handover back-end, écran 5) ; toute autre devient `provider_error`. */
const CREATE_ERRORS: ReadonlySet<ApiErrorCode> = new Set<ApiErrorCode>(["cost_cap_reached", "provider_error"]);

/** Un jour, en millisecondes : tolérance des fuseaux pour « arrivée au plus tôt aujourd'hui » (0017 § 2.2). */
const DAY_MS = 86_400_000;

/**
 * Lancement (F8c, `R-lancer`) : action **authentifiée** (0017 § 3.4) : 1. session de la portée de simulation de la
 * requête (`unauthenticated` sans session : aucun voyage créé, et `validation_failed` ne sert pas d'oracle du schéma) ;
 * 2. `parseInput` par `TripRequestSchema`, puis « arrivée au plus tôt aujourd'hui » sur l'horloge de la portée, à un
 * jour près pour les fuseaux (0017 § 2.2) ; 3. appel de l'adaptateur avec l'organisation **de la session**, jamais une
 * valeur du navigateur (F8-PO-17) ; 4. validation de la sortie. `active_preview_exists` porte le voyage en préparation
 * dans `error.activeTripId` (`ApiErrorSchema`, revalidé ici).
 * Aucun journal : ni brouillon, ni brief.
 */
export async function createTrip(input: unknown): Promise<Result<CreatedTrip>> {
  const scope = await getSimulationScope();
  let session: Session | null;
  try {
    session = await getAuthAdapter({ scope }).getSession();
  } catch {
    // Garde fermée de l'adaptateur `auth` (0017 § 11.2) : erreur générique, aucun voyage créé.
    return fail("provider_error");
  }
  if (!session) return fail("unauthenticated");
  const parsed = parseInput(TripRequestSchema, input);
  if (!parsed.ok) return parsed;
  const earliest = new Date(scope.clock.now() - DAY_MS).toISOString().slice(0, 10);
  if (parsed.value.draft.start < earliest) return fail("validation_failed", "draft.start");

  // Contexte : avec `better-auth`, celui de la session (organisation active, personne et rôle lus par
  // `getServerRequestContext()`, comme `getGenerationStatus`) ; en phase 0, la session simulée ne porte pas de rôle et
  // la personne connectée est propriétaire de son organisation simulée.
  let ctx: AdapterContext | null;
  if (authAdapterChoice() === "better-auth") {
    try {
      ctx = await contexteFacultatif();
    } catch {
      return fail("provider_error");
    }
    if (ctx === null) return fail("unauthenticated");
  } else {
    ctx = { organizationId: session.organizationId, userId: session.userId, role: "owner" };
  }
  let result: Result<CreatedTrip>;
  try {
    result = await getCreationAdapter(undefined, { scope }).createTrip(ctx, parsed.value);
  } catch {
    return fail("provider_error");
  }
  if (!result.ok && result.error.code === "active_preview_exists") return conflictOf(result.error);
  // B9b : refus de l'adaptateur `api` sur une ville (table des fuseaux, B9-PO-18) ou sur la date d'arrivée dans le
  // fuseau du voyage ; seul un champ de la forme de `parseInput` est transmis.
  if (!result.ok && result.error.code === "validation_failed") return fail("validation_failed", fieldOf(result.error));
  if (!result.ok) return fail(CREATE_ERRORS.has(result.error.code) ? result.error.code : "provider_error");
  const output = CreatedTripSchema.safeParse(result.value);
  return output.success ? ok(output.data) : fail("provider_error");
}

/**
 * Conflit `active_preview_exists` reconstruit avec `code` et `activeTripId` seulement : `retryable` et `field` éventuels
 * de l'adaptateur sont écartés (rien à rejouer ni à corriger dans le brouillon), comme les autres erreurs ramenées à
 * leur code.
 */
function conflictOf(error: { activeTripId?: string }): Result<never> {
  const conflict = ApiErrorSchema.safeParse({ code: "active_preview_exists", activeTripId: error.activeTripId });
  return conflict.success ? { ok: false, error: conflict.data } : fail("provider_error");
}

/** Champ d'un refus de l'adaptateur, gardé seulement s'il a la forme d'un chemin de `parseInput` (`draft.otherCities.0.name`). */
const FIELD_PATTERN = /^[A-Za-z][A-Za-z0-9]*(\.([A-Za-z][A-Za-z0-9]*|[0-9]+))*$/;
function fieldOf(error: { field?: string }): string | undefined {
  return typeof error.field === "string" && error.field.length <= 64 && FIELD_PATTERN.test(error.field) ? error.field : undefined;
}

/**
 * Écran 5 (F8c) : avancement de la génération, lu par la page (état initial) puis interrogé par le navigateur toutes
 * les secondes (0017 § 9). Le contexte vient de `contexteFacultatif()`, comme la page (0017 § 3.1) : celui de la
 * session avec `better-auth` (B3c ; sans session, `unauthenticated` avant toute lecture de l'entrée), celui de la phase
 * 0 sinon. Le contrôle d'appartenance de l'adaptateur réel reste à B9 (0017 § 3.6). `not_found` pour un voyage inconnu
 * ou d'une autre organisation ; une sortie non conforme ou d'un autre voyage devient `provider_error`.
 */
export async function getGenerationStatus(input: unknown): Promise<Result<GenerationStatus>> {
  let ctx: AdapterContext | null;
  try {
    ctx = await contexteFacultatif();
  } catch {
    return fail("provider_error");
  }
  if (ctx === null) return fail("unauthenticated");
  const parsed = parseInput(GenerationStatusRequestSchema, input);
  if (!parsed.ok) return parsed;
  const scope = await getSimulationScope();
  let result: Result<unknown>;
  try {
    result = await getCreationAdapter(undefined, { scope }).getGenerationStatus(ctx, parsed.value.tripId);
  } catch {
    return fail("provider_error");
  }
  if (!result.ok) return fail(result.error.code === "not_found" ? "not_found" : "provider_error");
  const output = GenerationStatusSchema.safeParse(result.value);
  return output.success && output.data.tripId === parsed.value.tripId ? ok(output.data) : fail("provider_error");
}

/** Erreurs du nouvel essai transmises telles quelles (B9-TL-11) ; toute autre devient `provider_error`. */
const RETRY_ERRORS: ReadonlySet<ApiErrorCode> = new Set<ApiErrorCode>(["validation_failed", "not_found", "provider_error"]);

/**
 * Nouvel essai de l'écran 5 (B9b, B9-PO-9 ; décision 0081 B9-TL-11, 0087 § 1.1) : action authentifiée, contexte de
 * `contexteFacultatif()` comme `getGenerationStatus` (`unauthenticated` sans session, avant toute lecture de l'entrée) ;
 * `parseInput` par `RetryGenerationRequestSchema` ; appel de l'adaptateur ; `active_preview_exists` reconstruit avec le
 * voyage en préparation ; sortie validée et du même voyage. Le bouton « Réessayer » y est branché par une tâche
 * d'interface à part (question 13 de la spécification B9). Aucun journal.
 */
export async function retryGeneration(input: unknown): Promise<Result<CreatedTrip>> {
  let ctx: AdapterContext | null;
  try {
    ctx = await contexteFacultatif();
  } catch {
    return fail("provider_error");
  }
  if (ctx === null) return fail("unauthenticated");
  const parsed = parseInput(RetryGenerationRequestSchema, input);
  if (!parsed.ok) return parsed;
  const scope = await getSimulationScope();
  let result: Result<CreatedTrip>;
  try {
    result = await getCreationAdapter(undefined, { scope }).retryGeneration(ctx, parsed.value);
  } catch {
    return fail("provider_error");
  }
  if (!result.ok && result.error.code === "active_preview_exists") return conflictOf(result.error);
  if (!result.ok) return fail(RETRY_ERRORS.has(result.error.code) ? result.error.code : "provider_error");
  const output = CreatedTripSchema.safeParse(result.value);
  return output.success && output.data.tripId === parsed.value.tripId ? ok(output.data) : fail("provider_error");
}

/**
 * État du voyage complet (B9d ; décision 0087 § 1.5) : source des deux bandeaux `error` de Séjour et de 6b, interrogée toutes
 * les 5 secondes tant que la phase est `preparing`. Même forme que `getGenerationStatus` : contexte de `contexteFacultatif()`
 * (`unauthenticated` sans session, avant toute lecture de l'entrée), `parseInput` par `FullTripStatusRequestSchema`, appel de
 * l'adaptateur, sortie validée par `FullTripStatusSchema` et du même voyage ; `not_found` transmis, toute autre erreur devient
 * `provider_error`. Ne relance jamais rien. Aucun journal.
 */
export async function getFullTripStatus(input: unknown): Promise<Result<FullTripStatus>> {
  let ctx: AdapterContext | null;
  try {
    ctx = await contexteFacultatif();
  } catch {
    return fail("provider_error");
  }
  if (ctx === null) return fail("unauthenticated");
  const parsed = parseInput(FullTripStatusRequestSchema, input);
  if (!parsed.ok) return parsed;
  const scope = await getSimulationScope();
  let result: Result<unknown>;
  try {
    result = await getCreationAdapter(undefined, { scope }).getFullTripStatus(ctx, parsed.value.tripId);
  } catch {
    return fail("provider_error");
  }
  if (!result.ok) return fail(result.error.code === "not_found" ? "not_found" : "provider_error");
  const output = FullTripStatusSchema.safeParse(result.value);
  return output.success && output.data.tripId === parsed.value.tripId ? ok(output.data) : fail("provider_error");
}
