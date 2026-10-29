import { isProductionDeployment, isProductionTarget, prototypeAdapterAllowed } from "@/dev/flags";

import { betterAuthAllowed } from "./auth-guard";

/**
 * Garde du paiement simulé (décision 0020 § 2.3), **fermée par défaut**, fonctions pures.
 *
 * Ouvrir le paiement simulé sur un déploiement de production demande la décision de Samuel (Q131),
 * puis un amendement écrit de la décision 0020 : une variable ne suffit pas.
 */

/** Valeur normalisée d'une variable de choix d'adaptateur : absente ou vide = `mock`. */
export function adapterChoice(value: string | undefined): string {
  return value?.trim() || "mock";
}

/**
 * Vrai quand l'adaptateur de données est `prototype` (spécification P0, P0b1), sans lever d'erreur ni consulter
 * la liste blanche : `getTripAdapter()` et `getRequestContext()` la consultent, et lèvent hors liste blanche.
 */
export function isPrototypeAdapter(value: string | undefined = process.env.DATA_ADAPTER): boolean {
  return adapterChoice(value) === "prototype";
}

/**
 * Faux sur tout déploiement de production (`VADROUILLE_ENV` ou `VERCEL_ENV` à `production`), quels que
 * soient `NODE_ENV` et le drapeau ; sinon vrai seulement en `development` ou `test`, ou avec
 * `VADROUILLE_DEMO_PAYMENT` à exactement `1` (posé par `playwright.config.ts` seulement).
 */
export function paymentDemoAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  if (isProductionDeployment(env)) return false;
  return env.NODE_ENV === "development" || env.NODE_ENV === "test" || env.VADROUILLE_DEMO_PAYMENT === "1";
}

/**
 * Seule fonction que consultent les pages, les actions, `DeckEnd` (par sa page) et la section
 * « Démonstration ». Jamais sur un déploiement de production ; sinon l'un des trois cas :
 * - `PAYMENT_ADAPTER=mock`, adaptateur de données `mock` et paiement simulé autorisé (`paymentDemoAllowed`) ;
 * - `PAYMENT_ADAPTER=mock`, adaptateur de données `prototype` dans sa liste blanche (`prototypeAdapterAllowed` :
 *   préversion, `development`, `test` ou CI ; jamais la production) : déblocage simulé d'un voyage d'essai
 *   (spécification E2E-essai, lot 1), sans prestataire, sans e-mail, sans écriture en base ;
 * - `PAYMENT_ADAPTER=simulated` (spécification B4, B4b point 1 ; amendement B4-TL-14 de 0020 § 2.3) : paiement simulé
 *   autorisé (`paymentDemoAllowed`), `DATA_ADAPTER=api`, `AUTH_ADAPTER=better-auth` et webhook simulé ouvert
 *   (`local` ou `ci` seulement) : paiement simulé en base, droit accordé par le webhook simulé ;
 * - `PAYMENT_ADAPTER=stripe` (spécification B4, B4c ; amendement de 0020 § 2.3 par la décision 0140 § 5 point 1) :
 *   jamais sur une cible de production (`isProductionTarget`, prédicat partagé de 0140 § 3 point 6, appelé ici
 *   directement : ce module ne peut pas importer `src/server/env/payment`), `DATA_ADAPTER=api` et
 *   `AUTH_ADAPTER=better-auth` admis (`betterAuthAllowed`) : session Stripe en mode test, droit accordé par le webhook
 *   Stripe. La clé n'est jamais lue ici.
 * Toute autre combinaison ferme (sans quoi `getRequestContext()` lèverait et la page répondrait 500).
 */
export function paymentAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  if (isProductionDeployment(env)) return false;
  const paiement = adapterChoice(env.PAYMENT_ADAPTER);
  const donnees = adapterChoice(env.DATA_ADAPTER);
  if (paiement === "simulated") {
    // Webhook simulé ouvert : même règle que `webhookSimuleOuvert` de `src/server/env/payment.ts` (drapeau à exactement
    // `true`, environnement `local` ou `ci` par `betterAuthAllowed`), recalculée ici sans importer `src/server/env`, que
    // `src/features` ne doit pas atteindre (test « p0: clé côté serveur seulement ») ; la clé n'est jamais lue.
    const webhookOuvert = env.SIMULATED_WEBHOOK_ENABLED === "true" && betterAuthAllowed(env);
    return paymentDemoAllowed(env) && donnees === "api" && adapterChoice(env.AUTH_ADAPTER) === "better-auth" && webhookOuvert;
  }
  if (paiement === "stripe") {
    if (isProductionTarget(env)) return false;
    return donnees === "api" && adapterChoice(env.AUTH_ADAPTER) === "better-auth" && betterAuthAllowed(env);
  }
  if (paiement !== "mock") return false;
  if (donnees === "mock") return paymentDemoAllowed(env);
  return donnees === "prototype" && prototypeAdapterAllowed(env);
}

/**
 * Vrai quand `PAYMENT_ADAPTER` vaut `simulated` (spécification B4, B4b point 1), sans lever d'erreur ni consulter la
 * garde : `src/instrumentation.ts` y branche la composition du paiement simulé ; `parseServerEnv` a déjà refusé de
 * démarrer hors `local` et `ci` ou sans webhook simulé ouvert, et `paymentAvailable()` reste vérifiée à chaque appel.
 */
export function simulatedPaymentChosen(env: NodeJS.ProcessEnv = process.env): boolean {
  return adapterChoice(env.PAYMENT_ADAPTER) === "simulated";
}

/**
 * Vrai quand `PAYMENT_ADAPTER` vaut `stripe` (spécification B4, B4c ; décision 0140 § 5 point 1), sans lever d'erreur
 * ni consulter la garde : `src/instrumentation.ts` y branche la composition du paiement Stripe ; `parseServerEnv` a
 * déjà refusé de démarrer en production ou sans ses variables, et `paymentAvailable()` reste vérifiée à chaque appel.
 */
export function stripePaymentChosen(env: NodeJS.ProcessEnv = process.env): boolean {
  return adapterChoice(env.PAYMENT_ADAPTER) === "stripe";
}
