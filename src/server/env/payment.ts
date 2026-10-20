import "server-only";

import type { ServerEnv } from "./index";

/**
 * Module d'environnement du paiement (spécification B4, B4a point 5 ; décision 0097 B4-TL-3 point 5 et B4-TL-7). Ne lit
 * **pas** `process.env` : il reçoit l'objet `ServerEnv` validé par `parseServerEnv` (seul module qui lit et décode
 * `SIMULATED_WEBHOOK_SECRET`). Importé par deux fichiers seulement (`ligne/server-env-imports`, test de graphe du
 * confinement) : la composition du paiement simulé (`src/server/payment/composition.ts`) et le webhook simulé
 * (`src/server/routes/simulated-webhook.ts`).
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
