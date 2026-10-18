import "server-only";

import type { AuthConfig } from "@/adapters/types";
import { RATE_LIMITS } from "@/server/config/limites";
import { CODE_CONNEXION } from "@/tenancy/options";

/**
 * Limites de la connexion réelle lues par l'interface (`AuthAdapter.config` de l'adaptateur `better-auth` ; spécification
 * B3, B3-PO-6) : celles **par adresse e-mail** de l'envoi de code (`src/server/config/limites.ts`), pas celles par
 * adresse IP (l'interface parle à une personne) ; durée et essais du code de `@/tenancy/options` (B3-PO-5). Tirées de la
 * configuration serveur, jamais recopiées. Module sans import de la bibliothèque, chargé par `src/adapters/better-auth.ts`.
 */
function limitesInterface(): AuthConfig {
  const regleEmail = RATE_LIMITS["request-code"]?.find((regle) => regle.kind === "email");
  if (regleEmail === undefined) throw new Error("limite par e-mail de request-code absente (src/server/config/limites.ts)");
  return Object.freeze({
    codeTtlMs: CODE_CONNEXION.dureeSecondes * 1000,
    maxAttempts: CODE_CONNEXION.essais,
    maxCodeRequests: regleEmail.threshold,
    codeRequestWindowMs: regleEmail.windowSeconds * 1000,
  });
}

export const BETTER_AUTH_CONFIG: AuthConfig = limitesInterface();
