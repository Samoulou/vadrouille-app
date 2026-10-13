"use server";

import { getAuthAdapter } from "@/adapters";
import { getSimulationScope } from "@/adapters/simulation";
import { CodeRequestSchema, CodeVerificationSchema, fail, ok, type Result } from "@/contracts";
import type { ApiErrorCode } from "@/contracts/values";

import { parseInput } from "../parse-input";

/**
 * Actions serveur de la connexion par code (écran 4 ; décision 0017 § 3.3 et § 3.4, F8-PO-9, F8-PO-17). Actions
 * anonymes : 1. `parseInput` de l'entrée reçue en `unknown` (`validation_failed`, sans appel à l'adaptateur : aucun
 * essai consommé, aucune demande comptée) ; 2. appel de l'adaptateur `auth` de la portée de simulation de la
 * requête. **Aucun journal** : ni adresse, ni code (règle `no-console` et test « aucune donnée journalisée »).
 *
 * Les réponses sont les mêmes pour une adresse connue ou inconnue : la réussite ne renvoie aucune donnée de session
 * au navigateur (en phase 0, la session vit dans la portée de simulation, sans cookie : 0017 § 3.5).
 */

const REQUEST_ERRORS: ReadonlySet<ApiErrorCode> = new Set<ApiErrorCode>(["rate_limited"]);
const VERIFY_ERRORS: ReadonlySet<ApiErrorCode> = new Set<ApiErrorCode>(["invalid_code", "code_expired", "too_many_attempts"]);

export type CodeSent = { sent: true };
export type SignedIn = { signedIn: true };

export async function requestCode(input: unknown): Promise<Result<CodeSent>> {
  const parsed = parseInput(CodeRequestSchema, input);
  if (!parsed.ok) return parsed;
  const scope = await getSimulationScope();
  try {
    const adapter = getAuthAdapter({ scope });
    const result = await adapter.requestCode(parsed.value);
    if (!result.ok) return fail(REQUEST_ERRORS.has(result.error.code) ? result.error.code : "provider_error");
    return ok({ sent: true });
  } catch {
    // Garde fermée (0017 § 11.2) ou erreur de l'adaptateur : erreur générique, sans détail.
    return fail("provider_error");
  }
}

export async function verifyCode(input: unknown): Promise<Result<SignedIn>> {
  const parsed = parseInput(CodeVerificationSchema, input);
  if (!parsed.ok) return parsed;
  const scope = await getSimulationScope();
  try {
    const adapter = getAuthAdapter({ scope });
    const result = await adapter.verifyCode(parsed.value);
    if (!result.ok) return fail(VERIFY_ERRORS.has(result.error.code) ? result.error.code : "provider_error");
    return ok({ signedIn: true });
  } catch {
    return fail("provider_error");
  }
}
