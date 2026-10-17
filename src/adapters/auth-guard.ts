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

/** Valeurs de `VADROUILLE_ENV` et de `VERCEL_ENV` qui désignent `local` ou `ci` (règles de `resolveServerEnvironment`). */
const ENVIRONNEMENTS_BETTER_AUTH: ReadonlySet<string> = new Set(["local", "development", "ci"]);

/**
 * Vrai seulement si le serveur tourne en `local` ou en `ci` (décision 0077 § 5.1, B3-TL-2) : `better-auth` reste refusé
 * en `staging` et en `production`, et quand aucun environnement n'est déclaré. Chaque variable déclarée
 * (`VADROUILLE_ENV`, `VERCEL_ENV`, comparaison `trim().toLowerCase()`) doit désigner `local` ou `ci` : c'est le
 * résultat de `resolveServerEnvironment` (B3a, règles 1 à 5, la plus restrictive l'emporte, valeur inconnue =
 * `production`), recalculé ici sans importer `src/server/env`, que `src/features` ne doit pas atteindre (test
 * « p0: clé côté serveur seulement »). Équivalence vérifiée par `tests/unit/server/env.test.ts`.
 */
export function betterAuthAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  const declarees = [env.VADROUILLE_ENV, env.VERCEL_ENV].map((valeur) => valeur?.trim().toLowerCase() ?? "").filter((valeur) => valeur !== "");
  return declarees.length > 0 && declarees.every((valeur) => ENVIRONNEMENTS_BETTER_AUTH.has(valeur));
}

/**
 * Lève une erreur à l'appel (jamais à l'import ni au build) si la connexion ne peut pas servir : adaptateur `mock`
 * hors de `mockAuthAllowed`, adaptateur `better-auth` hors de `betterAuthAllowed` (B3c ; refusé en `staging` et en
 * `production` tant que B3-TL-2 tient, décision 0077 § 5.1), ou adaptateur inconnu. Aucun repli vers un mode
 * permissif ; l'écran qui l'appelle affiche l'erreur générique. Aucune connexion à la base n'est ouverte ici.
 */
export function assertAuthAdapter(env: NodeJS.ProcessEnv = process.env): "mock" | "better-auth" {
  const choice = authAdapterChoice(env);
  switch (choice) {
    case "mock":
      if (!mockAuthAllowed(env)) {
        throw new Error("connexion simulée refusée : déploiement de production, ou VADROUILLE_DEMO_AUTH absent (décision 0017 § 11.2)");
      }
      return "mock";
    case "better-auth":
      if (!betterAuthAllowed(env)) {
        throw new Error("connexion better-auth refusée hors local et ci (décision 0077 § 5.1, B3-TL-2)");
      }
      return "better-auth";
    default:
      throw new Error(`AUTH_ADAPTER inconnu : « ${choice} » (valeurs : mock, better-auth)`);
  }
}
