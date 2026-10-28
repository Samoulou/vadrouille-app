import { isProductionDeployment, prototypeAdapterAllowed } from "@/dev/flags";

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
 * Partage **réel** du site d'essai (décision 0135, amendement de 0039 F10-TL-7) : adaptateur de données `prototype`
 * (programmes réels de `p0-reel`, ou dossier de programmes en local et en CI), sous sa liste blanche
 * (`prototypeAdapterAllowed` : jamais en production), et jamais sur un déploiement de production. Ne dépend pas de
 * `VADROUILLE_DEMO_SHARE`, qui reste le drapeau de la démonstration simulée. La session vérifiée est exigée par
 * l'adaptateur à la création du lien (`signed-share.ts`), pas par cette garde, qui ne lit que l'environnement.
 * L'adaptateur `api` reste fermé (B12, avec une table et la décision de Samuel sur la production, Q101).
 */
export function realShareAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  if (isProductionDeployment(env)) return false;
  return adapterChoice(env.DATA_ADAPTER) === "prototype" && prototypeAdapterAllowed(env);
}

/**
 * Seule fonction que consultent les pages `RP` et `RPJ`, le bouton « Partager » (par la mise en page du voyage) et
 * les trois actions : démonstration ouverte **et** adaptateur de données `mock`, ou partage réel du site d'essai
 * (`realShareAvailable`, décision 0135). Production : toujours fermée (Q101).
 */
export function shareAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  if (isProductionDeployment(env)) return false;
  return (shareDemoAvailable(env) && adapterChoice(env.DATA_ADAPTER) === "mock") || realShareAvailable(env);
}
