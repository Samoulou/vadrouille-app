"use server";

import { getShareAdapter, getSimulationScope, shareAvailable } from "@/adapters";
import { contexteFacultatif } from "@/features/compte/session";
import { fail, type CreatedShareLink, type Result, type ShareStatus } from "@/contracts";
import { ShareRequestSchema } from "@/contracts/share";

import { parseInput } from "../parse-input";

/**
 * Actions serveur du partage (spécification F10, F10-PO-17 ; décisions 0020 § 11 et 0039). Ordre des contrôles :
 * 1. `shareAvailable()`, sinon `not_found` sans rien lire ni modifier ;
 * 2. session : contexte par `contexteFacultatif()` (organisation de la session, jamais une valeur du navigateur),
 *    sinon `unauthenticated` (B3c : seulement avec `better-auth` ; jamais `null` en `mock`) ;
 * 3. `parseInput` de l'entrée reçue en `unknown`, sinon `validation_failed` sans appel à l'adaptateur ;
 * 4. portée par `getSimulationScope()`, puis adaptateur de partage, qui lit le voyage par `getTripReader()`.
 * Codes renvoyés : `unauthenticated`, `validation_failed` et `not_found` ; sur `api` (ticket 1013, M6a ; décision 0157
 * § 1.3), aussi `rate_limited` (création au-delà de la limite `partage-lien`) et `internal` (lecture ou écriture en échec). Le jeton en clair n'existe que dans la réponse de
 * `createShareLink` ; aucun journal (lint `no-console`).
 */

export async function createShareLink(input: unknown): Promise<Result<CreatedShareLink>> {
  if (!shareAvailable()) return fail("not_found");
  const ctx = await contexteFacultatif();
  if (ctx === null) return fail("unauthenticated");
  const parsed = parseInput(ShareRequestSchema, input);
  if (!parsed.ok) return parsed;
  const scope = await getSimulationScope();
  return getShareAdapter({ scope }).createLink(ctx, parsed.value.tripId);
}

export async function revokeShareLink(input: unknown): Promise<Result<ShareStatus>> {
  if (!shareAvailable()) return fail("not_found");
  const ctx = await contexteFacultatif();
  if (ctx === null) return fail("unauthenticated");
  const parsed = parseInput(ShareRequestSchema, input);
  if (!parsed.ok) return parsed;
  const scope = await getSimulationScope();
  return getShareAdapter({ scope }).revokeLink(ctx, parsed.value.tripId);
}

export async function getShareStatus(input: unknown): Promise<Result<ShareStatus>> {
  if (!shareAvailable()) return fail("not_found");
  const ctx = await contexteFacultatif();
  if (ctx === null) return fail("unauthenticated");
  const parsed = parseInput(ShareRequestSchema, input);
  if (!parsed.ok) return parsed;
  const scope = await getSimulationScope();
  return getShareAdapter({ scope }).getStatus(ctx, parsed.value.tripId);
}
