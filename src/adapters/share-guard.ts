import { isProductionDeployment } from "@/dev/flags";

import { adapterChoice } from "./payment-guard";

/**
 * Garde du partage simulé (spécification F10, F10-TL-7 ; décision 0039), **fermée par défaut**, fonctions pures,
 * alignée sur `payment-guard.ts` (décision 0020 § 2.3). Drapeau propre, `VADROUILLE_DEMO_SHARE` : ouvrir la
 * démonstration du paiement n'ouvre pas celle du partage, et inversement.
 *
 * Ouvrir la vue partagée simulée sur un déploiement de production demande la décision de Samuel (Q101), puis un
 * amendement écrit de la décision 0039 : une variable ne suffit pas.
 */

/**
 * Faux sur tout déploiement de production (`VADROUILLE_ENV` ou `VERCEL_ENV` à `production`), quels que soient
 * `NODE_ENV` et le drapeau ; sinon vrai seulement en `development` ou `test`, ou avec `VADROUILLE_DEMO_SHARE` à
 * exactement `1` (posé par `playwright.config.ts` seulement).
 */
export function shareDemoAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  if (isProductionDeployment(env)) return false;
  return env.NODE_ENV === "development" || env.NODE_ENV === "test" || env.VADROUILLE_DEMO_SHARE === "1";
}

/**
 * Seule fonction que consultent les pages `RP` et `RPJ`, le bouton « Partager » (par la mise en page du voyage) et
 * les trois actions : démonstration ouverte **et** adaptateur de données `mock`. Avec des données réelles, le partage
 * reste fermé jusqu'à B12, qui amende cette garde avec la session vérifiée de B3.
 */
export function shareAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  return shareDemoAvailable(env) && adapterChoice(env.DATA_ADAPTER) === "mock";
}
