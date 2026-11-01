import "server-only";

import { RATE_LIMITS } from "@/server/config/limites";
import { createRateLimiter, type RateLimiter, type RateLimitRequest } from "@/server/rate-limit";

import { ACTION_LIMITEUR_RAPPELS } from "./accord";

/**
 * Décompte d'une seule espèce de la règle `rappels-accord` (M6c, ticket 1021 ; décision 0157 § 1.7 point 5) : le retrait
 * compte l'adresse IP avant de chercher l'accord, puis le voyage, et n'est jamais refusé. Un limiteur par espèce, construit
 * sur la règle filtrée : mêmes clés (action, fenêtre, espèce) que la règle complète lue par `verdictRateLimit`.
 */

const limiteursParEspece = new Map<"ip" | "trip", RateLimiter>();

function limiteurDe(espece: "ip" | "trip"): RateLimiter {
  let limiteur = limiteursParEspece.get(espece);
  if (limiteur === undefined) {
    const regles = (RATE_LIMITS["rappels-accord"] ?? []).filter((regle) => regle.kind === espece);
    limiteur = createRateLimiter({
      config: { [ACTION_LIMITEUR_RAPPELS]: regles },
    });
    limiteursParEspece.set(espece, limiteur);
  }
  return limiteur;
}

/** Compte une espèce ; le verdict est ignoré (le retrait n'est jamais refusé). */
export async function compterEspeceRappels(espece: "ip" | "trip", request: RateLimitRequest): Promise<void> {
  await limiteurDe(espece).verdict(request);
}
