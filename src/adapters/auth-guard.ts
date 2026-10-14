import { isProductionDeployment } from "@/dev/flags";

import { adapterChoice } from "./payment-guard";

/**
 * Garde de l'adaptateur `auth` simulé (décision 0017 § 11.2), **fermée par défaut**, fonction pure. La connexion
 * simulée accepte un code connu de tous : elle ne doit jamais servir par erreur sur un déploiement.
 *
 * Ouvrir la démonstration sur un déploiement de production demande la décision de Samuel (Q101, F8-Q12), puis un
 * amendement écrit de la décision 0017 : une variable ne suffit pas.
 */

/** Choix normalisé de `AUTH_ADAPTER` (absent ou vide = `mock`). */
export function authAdapterChoice(env: NodeJS.ProcessEnv = process.env): string {
  return adapterChoice(env.AUTH_ADAPTER);
}

/**
 * Faux sur tout déploiement de production (`VADROUILLE_ENV` ou `VERCEL_ENV` à `production`, comparaison tolérante),
 * quels que soient `NODE_ENV` et le drapeau ; sinon vrai seulement en `development` ou `test`, ou avec
 * `VADROUILLE_DEMO_AUTH` à exactement `1` (posé par `playwright.config.ts` seulement).
 */
export function mockAuthAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  if (isProductionDeployment(env)) return false;
  return env.NODE_ENV === "development" || env.NODE_ENV === "test" || env.VADROUILLE_DEMO_AUTH === "1";
}

/**
 * Lève une erreur à l'appel (jamais à l'import ni au build) si la connexion ne peut pas servir : adaptateur `mock`
 * hors de `mockAuthAllowed`, ou adaptateur inconnu ou pas encore livré (`better-auth` avant B3). Aucun repli vers
 * un mode permissif ; l'écran qui l'appelle affiche l'erreur générique.
 */
export function assertAuthAdapter(env: NodeJS.ProcessEnv = process.env): "mock" {
  const choice = authAdapterChoice(env);
  switch (choice) {
    case "mock":
      if (!mockAuthAllowed(env)) {
        throw new Error("connexion simulée refusée : déploiement de production, ou VADROUILLE_DEMO_AUTH absent (décision 0017 § 11.2)");
      }
      return "mock";
    case "better-auth":
      throw new Error("adaptateur auth better-auth non implémenté (B3)");
    default:
      throw new Error(`AUTH_ADAPTER inconnu : « ${choice} » (valeurs : mock, better-auth)`);
  }
}
