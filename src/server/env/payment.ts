import "server-only";

import { isProductionTarget } from "@/dev/flags";

import { verifierSortie, type EnvSortie } from "./egress";
import { cleStripeBienFormee, secretWebhookStripeBienForme, type ServerEnv } from "./index";

/**
 * Module d'environnement du paiement (spécification B4, B4a point 5 et B4c point 7 ; décisions 0097 B4-TL-3 point 5 et
 * B4-TL-7, 0140 § 3). Importé par quatre fichiers seulement (`ligne/server-env-imports`, test de graphe du
 * confinement) : les compositions du paiement simulé et du paiement Stripe (`src/server/payment/composition.ts`,
 * `src/server/payment/composition-stripe.ts`) et les deux webhooks (`src/server/routes/simulated-webhook.ts`,
 * `src/server/routes/stripe-webhook.ts`).
 *
 * - Webhook simulé : ne lit **pas** `process.env` ; il reçoit l'objet `ServerEnv` validé par `parseServerEnv` (seul
 *   module qui lit et décode `SIMULATED_WEBHOOK_SECRET`).
 * - Stripe (B4c, 0140 § 3 point 4) : la clé secrète et le secret du webhook ne sont **jamais** des champs de
 *   `ServerEnv` ; ils sont lus **à l'appel**, dans l'environnement reçu (par défaut `process.env`), par `cleStripe`
 *   (**après** la barrière de sortie, `verifierSortie`) et par `secretWebhookStripe`, qui refont le contrôle de forme de
 *   `parseServerEnv`. Résultats fermés, sans valeur et sans exception ; la valeur n'est jamais gardée ici, copiée,
 *   journalisée ni jointe à une erreur.
 */

/**
 * Webhook simulé ouvert (B4-TL-7) : `SIMULATED_WEBHOOK_ENABLED` vaut exactement `true`, `PAYMENT_ADAPTER` vaut
 * `simulated` et l'environnement serveur est `local` ou `ci`. Seul prédicat, commun à la route et au prestataire
 * simulé ; il ne lit que des drapeaux, jamais la clé.
 */
export function webhookSimuleOuvert(env: ServerEnv): boolean {
  return env.simulatedWebhookFlag && env.paymentAdapter === "simulated" && (env.environment === "local" || env.environment === "ci");
}

/** Octets de la clé de signature du webhook simulé, seulement si le webhook est ouvert ; sinon `null`. */
export function cleWebhookSimule(env: ServerEnv): Buffer | null {
  return webhookSimuleOuvert(env) ? env.simulatedWebhookSecret : null;
}

/**
 * Production pour le paiement Stripe (0140 § 3 point 6) : environnement serveur `production`, ou cible de production
 * (`isProductionTarget`, prédicat partagé de `src/dev/flags.ts`) sur l'environnement reçu **ou** sur le vrai
 * `process.env`, toujours lu en plus : un objet injecté ne peut que resserrer (comme 0046 D21).
 */
export function productionPaiement(env: ServerEnv, processEnv: NodeJS.ProcessEnv = process.env): boolean {
  return env.environment === "production" || isProductionTarget(processEnv) || isProductionTarget(process.env);
}

/**
 * Webhook Stripe ouvert (B4c point 5 ; 0140 § 2.1) : `PAYMENT_ADAPTER` vaut `stripe` **et** ce n'est pas la production
 * (`productionPaiement`). Il ne lit que des drapeaux, jamais le secret.
 */
export function webhookStripeOuvert(env: ServerEnv): boolean {
  return env.paymentAdapter === "stripe" && !productionPaiement(env);
}

/** Refus d'une lecture de clé Stripe : barrière de sortie fermée, ou valeur absente ou de forme invalide. */
export type CodeRefusCleStripe = "egress_refused" | "key_invalid";

export type ResultatCleStripe = { readonly ok: true; readonly cle: string } | { readonly ok: false; readonly code: CodeRefusCleStripe };

/**
 * Clé secrète Stripe (0140 § 3 point 4), lue à chaque construction du client : **d'abord** la barrière de sortie
 * (`verifierSortie`, qui n'admet que `VERCEL_ENV` `preview` ou `development` : jamais en `local` ni en `ci`, 0140 § 3
 * point 5), puis la valeur, dont la forme est refaite (`cleStripeBienFormee`). Appelée hors des tests par
 * `src/server/payment/composition-stripe.ts` seulement (test du dépôt, 0140 § 6 ligne 9).
 */
export function cleStripe(env: EnvSortie = process.env, execArgv?: readonly string[]): ResultatCleStripe {
  if (!verifierSortie(env, execArgv).ok) return { ok: false, code: "egress_refused" };
  const cle = env.STRIPE_SECRET_KEY;
  if (typeof cle !== "string" || !cleStripeBienFormee(cle)) return { ok: false, code: "key_invalid" };
  return { ok: true, cle };
}

export type ResultatSecretWebhookStripe = { readonly ok: true; readonly secret: string } | { readonly ok: false; readonly code: "key_invalid" };

/**
 * Secret de signature du webhook Stripe (0140 § 3 point 4), lu à l'étape 5 de la route Stripe seulement ; forme refaite
 * (`secretWebhookStripeBienForme`). Pas de barrière de sortie : rien ne sort (la vérification se fait sans clé d'API).
 */
export function secretWebhookStripe(env: EnvSortie = process.env): ResultatSecretWebhookStripe {
  const secret = env.STRIPE_WEBHOOK_SECRET;
  if (typeof secret !== "string" || !secretWebhookStripeBienForme(secret)) return { ok: false, code: "key_invalid" };
  return { ok: true, secret };
}
