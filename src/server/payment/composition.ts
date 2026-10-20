import "server-only";

import { createSimulatedPaymentAdapter } from "@/adapters/simulated-payment";
import type { PaymentAdapter, PaymentSimulator } from "@/adapters/types";
import { serverEnv } from "@/server/env";
import { cleWebhookSimule } from "@/server/env/payment";
import { checkRateLimit } from "@/server/rate-limit";
import { withOrg } from "@/server/with-org";

import { createDatabase } from "../../../db/index.ts";

import { creerPrestataireSimule } from "./simulated-provider";
import { transportHttp } from "./transport-http";

/**
 * Composition de l'adaptateur de paiement `simulated` (décision 0097 B4-TL-3 point 5 et B4-TL-5) : seul lieu, avec le
 * webhook simulé, où la clé de signature est lue (`cleWebhookSimule`), **à la construction** de l'adaptateur, jamais à
 * l'import d'un module ; elle n'est gardée que dans la fermeture du prestataire. La composition ne rend que l'adaptateur.
 * **Non branchée en B4a** : `getPaymentAdapter()` et `getPaymentSimulator()` restent fermés à `simulated` jusqu'à B4b
 * (B4-TL-14). Lève si le webhook simulé n'est pas ouvert (`PAYMENT_ADAPTER=simulated` et ses gardes, B4-TL-7).
 */
export function composerPaiementSimule(): PaymentAdapter & PaymentSimulator {
  const env = serverEnv();
  const cle = cleWebhookSimule(env);
  if (cle === null || env.betterAuth === null) throw new Error("paiement simulé indisponible : webhook simulé fermé");
  const maintenant = () => Date.now();
  return createSimulatedPaymentAdapter({
    database: createDatabase("vadrouille_app"),
    withOrg,
    maintenant,
    prestataire: creerPrestataireSimule({ cle, transport: transportHttp(env.betterAuth.appUrl), maintenant }),
    // Limiteur des actions (B4-TL-6 point 2) : en-têtes de la requête de l'action, lus par l'en-tête de confiance seul.
    limiteur: async (action) => checkRateLimit({ action, headers: new Headers(await (await import("next/headers")).headers()) }),
  });
}
