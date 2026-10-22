"use server";

import { revalidatePath } from "next/cache";

import {
  getPaymentAdapter,
  getPaymentSimulator,
  getSimulationScope,
  paymentAvailable,
  retenirDeblocageEssai,
  type AdapterContext,
} from "@/adapters";
import { contexteFacultatif } from "@/features/compte/session";
import {
  CheckoutRequestSchema,
  CheckoutStatusRequestSchema,
  SimulateOutcomeRequestSchema,
  fail,
  type CheckoutStart,
  type CheckoutStatus,
  type Result,
} from "@/contracts";
import { tripRoutes } from "@/features/sejour/routes";

import { parseInput } from "../parse-input";

/**
 * Actions serveur du paiement (décision 0020 § 11, F9-PO-7). Ordre des contrôles :
 * 1. `paymentAvailable()`, sinon `not_found` sans rien lire ni modifier ;
 * 2. session : contexte par `contexteFacultatif()` (jamais une valeur du navigateur), sinon `unauthenticated`
 *    (B3c : seulement avec `better-auth` ; jamais `null` en `mock`) ;
 * 3. `parseInput` de l'entrée reçue en `unknown`, sinon `validation_failed` sans appel à l'adaptateur ;
 * 4. portée, puis adaptateur.
 * Le montant, la devise et la variante viennent de la configuration serveur, jamais de l'entrée.
 * Aucun journal : ni montant ni identifiant de paiement.
 */

/**
 * Le voyage vient d'être débloqué : invalide le cache du routeur client pour toutes ses pages (0020 § 3) ; voyage d'essai
 * (adaptateur `prototype`, spécification E2E-essai, lot 1) : le déblocage est aussi retenu par le cookie signé de l'essai.
 */
async function revalidateIfUnlocked(ctx: AdapterContext, result: Result<CheckoutStatus>): Promise<void> {
  if (result.ok && (result.value.status === "succeeded" || result.value.status === "duplicate")) {
    await retenirDeblocageEssai(ctx, result.value.tripId);
    revalidatePath(tripRoutes("/voyages", result.value.tripId).sejour(), "layout");
  }
}

export async function startCheckout(input: unknown): Promise<Result<CheckoutStart>> {
  if (!paymentAvailable()) return fail("not_found");
  const ctx = await contexteFacultatif();
  if (ctx === null) return fail("unauthenticated");
  const parsed = parseInput(CheckoutRequestSchema, input);
  if (!parsed.ok) return parsed;
  const scope = await getSimulationScope();
  return getPaymentAdapter({ scope }).createCheckout(ctx, parsed.value);
}

/** Rôle du webhook du prestataire (B0 § 9) : seule voie qui accorde le droit « voyage débloqué ». */
export async function simulateCheckoutOutcome(input: unknown): Promise<Result<CheckoutStatus>> {
  if (!paymentAvailable()) return fail("not_found");
  const ctx = await contexteFacultatif();
  if (ctx === null) return fail("unauthenticated");
  const parsed = parseInput(SimulateOutcomeRequestSchema, input);
  if (!parsed.ok) return parsed;
  const scope = await getSimulationScope();
  const simulator = getPaymentSimulator({ scope });
  if (!simulator) return fail("not_found");
  const result = await simulator.simulateOutcome(ctx, parsed.value.checkoutId, parsed.value.outcome);
  await revalidateIfUnlocked(ctx, result);
  return result;
}

export async function getCheckoutStatus(input: unknown): Promise<Result<CheckoutStatus>> {
  if (!paymentAvailable()) return fail("not_found");
  const ctx = await contexteFacultatif();
  if (ctx === null) return fail("unauthenticated");
  const parsed = parseInput(CheckoutStatusRequestSchema, input);
  if (!parsed.ok) return parsed;
  const scope = await getSimulationScope();
  const result = await getPaymentAdapter({ scope }).getCheckoutStatus(ctx, parsed.value.checkoutId);
  await revalidateIfUnlocked(ctx, result);
  return result;
}
