import { authAdapterChoice, betterAuthAllowed } from "./auth-guard";

/**
 * Garde de l'adaptateur `api` (spécification B6, B6b point 1 ; décision 0086 § 2.1, B6-TL-7), **fermée par défaut**,
 * lue **à l'appel** de `getTripAdapter("api")`, jamais à l'import ni au build, sur l'environnement **du processus**
 * (`process.env`, par les valeurs par défaut de `betterAuthAllowed` et `authAdapterChoice`), jamais sur un environnement
 * transmis par l'appelant. L'adaptateur ne sert que :
 * - en `local` ou en `ci` (`betterAuthAllowed` : même règle que `resolveServerEnvironment`, chaque variable déclarée
 *   parmi `VADROUILLE_ENV` et `VERCEL_ENV` doit désigner l'un des deux ; aucune déclaration, `staging`, `production` ou
 *   une valeur inconnue : refus) ;
 * - avec `AUTH_ADAPTER=better-auth` : le contexte d'organisation n'existe qu'avec une vraie session ;
 * - avec une source de relectures : dans B6b, le double de `src/mocks/relectures-voyages.ts`, toujours présent en
 *   `local` et en `ci` ; la source réelle de B8b n'est choisie qu'en `local` avec `RELECTURES_SOURCE=google`
 *   (0100 § 5.3, `choisirSourceRelectures`).
 * Aucun repli vers `mock`. Q417 (Samuel) : aucune préversion ne lit la vraie base avant G0 ; lever cette garde demande
 * une décision écrite (B8, Q25).
 */
export function assertApiAdapter(): void {
  if (!betterAuthAllowed()) {
    throw new Error("adaptateur api refusé hors local et ci (décision 0086 § 2.1, B6-TL-7 ; Q417)");
  }
  if (authAdapterChoice() !== "better-auth") {
    throw new Error("adaptateur api refusé sans AUTH_ADAPTER=better-auth (décision 0086 § 2.1, B6-TL-7)");
  }
}
