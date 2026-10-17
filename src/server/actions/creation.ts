"use server";

import { getAuthAdapter, getCreationAdapter, getRequestContext, type AdapterContext } from "@/adapters";
import { getSimulationScope } from "@/adapters/simulation";
import {
  BriefRequestSchema,
  GenerationStatusSchema,
  InferredBriefSchema,
  LodgingRequestSchema,
  LodgingSuggestionSchema,
  ApiErrorSchema,
  TripRequestSchema,
  fail,
  ok,
  type CreatedTrip,
  type GenerationStatus,
  type InferredBrief,
  type LodgingSuggestion,
  type Result,
  type Session,
} from "@/contracts";
import { CreatedTripSchema, GenerationStatusRequestSchema } from "@/contracts/creation";
import type { ApiErrorCode } from "@/contracts/values";

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

export async function structureBrief(input: unknown): Promise<Result<InferredBrief>> {
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

  // Phase 0 : la session simulée ne porte pas de rôle ; la personne connectée est propriétaire de son organisation (B3).
  const ctx: AdapterContext = { organizationId: session.organizationId, userId: session.userId, role: "owner" };
  let result: Result<CreatedTrip>;
  try {
    result = await getCreationAdapter(undefined, { scope }).createTrip(ctx, parsed.value);
  } catch {
    return fail("provider_error");
  }
  if (!result.ok && result.error.code === "active_preview_exists") {
    // Le conflit est reconstruit avec `code` et `activeTripId` seulement : `retryable` et `field` éventuels de
    // l'adaptateur sont écartés (rien à rejouer ni à corriger dans le brouillon), comme les autres erreurs ramenées à
    // leur code ci-dessous.
    const conflict = ApiErrorSchema.safeParse({ code: "active_preview_exists", activeTripId: result.error.activeTripId });
    return conflict.success ? { ok: false, error: conflict.data } : fail("provider_error");
  }
  if (!result.ok) return fail(CREATE_ERRORS.has(result.error.code) ? result.error.code : "provider_error");
  const output = CreatedTripSchema.safeParse(result.value);
  return output.success ? ok(output.data) : fail("provider_error");
}

/**
 * Écran 5 (F8c) : avancement de la génération, lu par la page (état initial) puis interrogé par le navigateur toutes
 * les secondes (0017 § 9). En phase 0, le contexte vient de `getRequestContext()`, comme la page (0017 § 3.1) : l'action
 * ne doit jamais être branchée sur un adaptateur réel avant B3, qui la remplace par la session et le contrôle
 * d'appartenance (0017 § 3.6). `not_found` pour un voyage inconnu ou d'une autre organisation ; une sortie non conforme
 * ou d'un autre voyage devient `provider_error`.
 */
export async function getGenerationStatus(input: unknown): Promise<Result<GenerationStatus>> {
  const parsed = parseInput(GenerationStatusRequestSchema, input);
  if (!parsed.ok) return parsed;
  const scope = await getSimulationScope();
  let result: Result<unknown>;
  try {
    result = await getCreationAdapter(undefined, { scope }).getGenerationStatus(getRequestContext(), parsed.value.tripId);
  } catch {
    return fail("provider_error");
  }
  if (!result.ok) return fail(result.error.code === "not_found" ? "not_found" : "provider_error");
  const output = GenerationStatusSchema.safeParse(result.value);
  return output.success && output.data.tripId === parsed.value.tripId ? ok(output.data) : fail("provider_error");
}
