import "server-only";

import { serverEnv, type ServerEnv } from "@/server/env";
import { secretWebhookStripe, webhookStripeOuvert } from "@/server/env/payment";
import type { DependancesPaiement } from "@/server/payment/dependances";
import { formeStripe } from "@/server/payment/formes";
import { verifierEvenementStripe } from "@/server/payment/stripe";

import { creerWebhook, type ConfigurationWebhookCommun } from "./webhook-commun";

/**
 * Webhook Stripe `/api/v1/webhooks/stripe` en mode test (spécification B4, B4c point 5 ; décision 0140 § 2). Importé
 * seulement par `src/app/api/v1/webhooks/stripe/route.ts` (`ligne/route-handlers`), qui exporte ce gestionnaire pour les
 * sept méthodes. Ordre des contrôles et réponses : ceux de la fabrique commune (`./webhook-commun.ts`, 0097 B4-TL-11) ;
 * ce module ne garde que sa configuration :
 * - étape 1 : `webhookStripeOuvert` (`PAYMENT_ADAPTER=stripe` et pas la production, `productionPaiement`) ;
 * - étape 5 : secret lu par `secretWebhookStripe` à ce moment seulement, vérification par `verifierEvenementStripe`
 *   (bibliothèque, sans clé d'API, tolérance de 300 s, horloge en millisecondes) ;
 * - étape 7 : forme Stripe des identifiants (`formeStripe`, critère C7 : un identifiant simulé est refusé).
 * Événements traités : ceux de `analyserEvenement`, inchangés ; remboursement et litige restent en alerte seule (§ 2.4).
 */

/** Configuration tirée d'un `ServerEnv` validé : prédicat `webhookStripeOuvert`, secret lu à l'étape 5 seulement. */
export function configurationStripeDepuisEnv(env: ServerEnv): ConfigurationWebhookCommun {
  return {
    ouvert: webhookStripeOuvert(env),
    verifierSignature: () => {
      const lu = secretWebhookStripe();
      if (!lu.ok) return null;
      const secret = lu.secret;
      return (corps, entete, maintenantMs) => verifierEvenementStripe(corps, entete, secret, maintenantMs);
    },
  };
}

export type OptionsWebhookStripe = {
  /** Configuration (défaut : `configurationStripeDepuisEnv(serverEnv())`) ; les tests l'injectent avec un secret de test. */
  readonly lireConfiguration?: () => ConfigurationWebhookCommun;
  readonly dependances?: DependancesPaiement;
  readonly creerDependances?: () => DependancesPaiement;
};

export function creerWebhookStripe(options: OptionsWebhookStripe = {}): (request: Request) => Promise<Response> {
  return creerWebhook({
    lireConfiguration: options.lireConfiguration ?? (() => configurationStripeDepuisEnv(serverEnv())),
    formeAttendue: formeStripe,
    dependances: options.dependances,
    creerDependances: options.creerDependances,
  });
}

let parDefaut: ((request: Request) => Promise<Response>) | undefined;

/** Gestionnaire du serveur (`serverEnv()`, client de `vadrouille_app`), créé au premier appel. */
export function webhookStripe(request: Request): Promise<Response> {
  parDefaut ??= creerWebhookStripe();
  return parDefaut(request);
}
