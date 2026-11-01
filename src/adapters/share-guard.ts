import { isProductionDeployment, isProductionTarget, prototypeAdapterAllowed } from "@/dev/flags";

import { authAdapterChoice, betterAuthAllowed } from "./auth-guard";
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
 * L'adaptateur `api` a sa propre garde, `apiShareAvailable` (décision 0157 § 1.2).
 */
export function realShareAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  if (isProductionDeployment(env)) return false;
  return adapterChoice(env.DATA_ADAPTER) === "prototype" && prototypeAdapterAllowed(env);
}

/** Seule valeur admise de `TRUSTED_IP_HEADER` (décision 0051 point 2.1 ; `TRUSTED_IP_HEADERS` de `src/server/env`). */
export const EN_TETE_ADRESSE_DE_CONFIANCE = "x-vercel-forwarded-for";

/**
 * Vrai si chaque variable déclarée parmi `VADROUILLE_ENV` et `VERCEL_ENV` désigne `local` ou `ci` (règles de
 * `resolveServerEnvironment`, recalculées sans importer `src/server/env`, que `src/adapters` ne doit pas atteindre ;
 * décision 0157 § 1.2, mineur 8 de la revue du head `217e389`). Même calcul que `betterAuthAllowed` : équivalence avec
 * `resolveServerEnvironment` vérifiée par `tests/unit/server/env.test.ts`.
 */
export function environnementLocalOuCi(env: NodeJS.ProcessEnv = process.env): boolean {
  return betterAuthAllowed(env);
}

/** Valeurs connues hors production de `VADROUILLE_ENV` et `VERCEL_ENV` (règles de `resolveServerEnvironment`). */
const ENVIRONNEMENTS_HORS_PRODUCTION: ReadonlySet<string> = new Set(["local", "development", "ci", "staging", "preview"]);

/**
 * Vrai si au moins une variable parmi `VADROUILLE_ENV` et `VERCEL_ENV` est déclarée et si chacune désigne un
 * environnement connu autre que `production` : une valeur inconnue vaut `production` pour `resolveServerEnvironment`.
 */
function declareHorsProduction(vadrouilleEnv: string | undefined, vercelEnv: string | undefined): boolean {
  const declarees = [vadrouilleEnv, vercelEnv].map((valeur) => valeur?.trim().toLowerCase() ?? "").filter((valeur) => valeur !== "");
  return declarees.length > 0 && declarees.every((valeur) => ENVIRONNEMENTS_HORS_PRODUCTION.has(valeur));
}

/**
 * Partage **`api`** (décision 0157 § 1.2, T2 ; ticket 1013, M6a) : jeton aléatoire, empreinte dans `share_links`.
 * Fonction pure de l'environnement reçu :
 * - jamais sur une cible de production (`isProductionTarget`, qui couvre aussi `VERCEL_TARGET_ENV`), ni sans
 *   environnement déclaré, ni avec une valeur inconnue (`production` pour `resolveServerEnvironment`) ;
 * - `DATA_ADAPTER=api` **et** `AUTH_ADAPTER=better-auth` ;
 * - `betterAuthAllowed(env)` : même domaine que `assertApiAdapter` (aujourd'hui `local` et `ci` ; la préversion
 *   `mvp-essai` quand M1h l'ouvrira). `ouverte` ne sert qu'aux tests, pour simuler cette ouverture (0157 § 1.2) ;
 * - hors de `local` et `ci`, en plus, `TRUSTED_IP_HEADER` posé à sa seule valeur admise (0157 § 2.1 point 3, S1) :
 *   sans elle, `/p/` reste fermé (404 commun) et le compartiment commun du limiteur n'est jamais atteint par
 *   `partage-vue` sur un déploiement.
 * `NODE_ENV=test` seul ne l'ouvre pas (correction du critère 1 de M6a, 0157 § 1.2).
 */
export function apiShareAvailable(env: NodeJS.ProcessEnv = process.env, ouverte: boolean = betterAuthAllowed(env)): boolean {
  if (isProductionTarget(env)) return false;
  if (adapterChoice(env.DATA_ADAPTER) !== "api" || authAdapterChoice(env) !== "better-auth") return false;
  if (!ouverte || !declareHorsProduction(env.VADROUILLE_ENV, env.VERCEL_ENV)) return false;
  if (environnementLocalOuCi(env)) return true;
  return env.TRUSTED_IP_HEADER?.trim().toLowerCase() === EN_TETE_ADRESSE_DE_CONFIANCE;
}

/**
 * Seule fonction que consultent les pages `RP` et `RPJ`, le bouton « Partager » (par la mise en page du voyage) et
 * les trois actions : démonstration ouverte **et** adaptateur de données `mock`, ou partage réel du site d'essai
 * (`realShareAvailable`, décision 0135), ou partage `api` (`apiShareAvailable`, décision 0157 § 1.2). Les trois
 * branches sont exclusives (adaptateurs différents). Production : toujours fermée (Q101).
 */
export function shareAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  if (isProductionDeployment(env)) return false;
  return (shareDemoAvailable(env) && adapterChoice(env.DATA_ADAPTER) === "mock") || realShareAvailable(env) || apiShareAvailable(env);
}
