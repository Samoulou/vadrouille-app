import { authAdapterChoice, betterAuthAllowed } from "./auth-guard";

/**
 * Garde de l'adaptateur `api` (spécification B6, B6b point 1 ; décision 0086 § 2.1, B6-TL-7), **fermée par défaut**,
 * lue **à l'appel** de `getTripAdapter("api")`, jamais à l'import ni au build, sur l'environnement **du processus**
 * (`process.env`, par les valeurs par défaut de `betterAuthAllowed` et `authAdapterChoice`), jamais sur un environnement
 * transmis par l'appelant. L'adaptateur ne sert que :
 * - en `local` ou en `ci` (`betterAuthAllowed` : même règle que `resolveServerEnvironment`, chaque variable déclarée
 *   parmi `VADROUILLE_ENV` et `VERCEL_ENV` doit désigner l'un des deux), **ou sur la préversion Vercel de la seule
 *   branche `mvp-essai`** (`previewMvpEssai`, décision 0169 § 1, qui amende 0086 § 2.1 sur la réponse de Samuel à Q634 :
 *   oui, pour cette seule branche) ; aucune déclaration, toute autre préversion, `staging` déclaré, `production` ou une
 *   valeur inconnue : refus ;
 * - avec `AUTH_ADAPTER=better-auth` : le contexte d'organisation n'existe qu'avec une vraie session ;
 * - avec une source de relectures : dans B6b, le double de `src/mocks/relectures-voyages.ts`, toujours présent ; la
 *   source réelle de B8b n'est choisie qu'en `local` avec `RELECTURES_SOURCE=google` (0100 § 5.3,
 *   `choisirSourceRelectures`), **préversion `mvp-essai` comprise** (0169 § 7 : la relecture réelle y reste fermée).
 * Aucun repli vers `mock`. Q417 (Samuel, 2026-10-14) refusait toute préversion lisant la vraie base avant G0 ; Q634
 * (Samuel, 2026-11-09) l'admet pour `mvp-essai` seule : toute autre ouverture demande une nouvelle décision écrite.
 */
export function assertApiAdapter(): void {
  if (!betterAuthAllowed()) {
    throw new Error("adaptateur api refusé hors local et ci, préversion mvp-essai exceptée (décisions 0086 § 2.1, B6-TL-7, et 0169 § 1 ; Q417, Q634)");
  }
  if (authAdapterChoice() !== "better-auth") {
    throw new Error("adaptateur api refusé sans AUTH_ADAPTER=better-auth (décision 0086 § 2.1, B6-TL-7)");
  }
}
