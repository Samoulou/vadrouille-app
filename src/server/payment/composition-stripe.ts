import "server-only";

import { adressesRetourStripe, createStripePaymentAdapter } from "@/adapters/stripe-payment";
import type { PaymentAdapter } from "@/adapters/types";
import type { PaymentMethod } from "@/contracts/values";
import { OFFER_CONFIG } from "@/server/config/offer";
import { serverEnv } from "@/server/env";
import { cleStripe, productionPaiement, type ResultatCleStripe } from "@/server/env/payment";
import { logEvent } from "@/server/log";
import { checkRateLimit } from "@/server/rate-limit";
import { withOrg } from "@/server/with-org";

import { createDatabase } from "../../../db/index.ts";

import type { PrestatairePaiement } from "./paiements";
import { creerClientSessionsStripe, type FabriqueClientStripe } from "./stripe";

/**
 * Composition de l'adaptateur de paiement `stripe` en mode test (spécification B4, B4c ; décision 0140 § 3 point 4 et
 * § 5 point 1) : **seul appelant de `cleStripe` hors des tests** (test du dépôt, 0140 § 6 ligne 9). Branchée par
 * `src/instrumentation.ts` sur `src/adapters/stripe-payment-instance.ts`, qui l'appelle une fois, au premier usage.
 * Refuse de construire l'adaptateur (lève) hors de `PAYMENT_ADAPTER=stripe`, en production (`productionPaiement`) ou
 * sans `APP_URL` validée.
 */

export type OptionsPrestataireStripe = {
  /** Lecture de la clé, rappelée à **chaque** appel au prestataire (défaut : `cleStripe` sur `process.env`). */
  readonly lireCle?: () => ResultatCleStripe;
  readonly adressesRetour: (paiement: { readonly tripId: string; readonly checkoutId: string }) => { readonly succes: string; readonly annulation: string };
  readonly moyens: readonly PaymentMethod[];
  /** Double du client dans les tests ; client réel sinon. */
  readonly fabriqueClient?: FabriqueClientStripe;
};

/**
 * Prestataire Stripe : à chaque appel, la clé est relue par `cleStripe`, donc la barrière de sortie rejouée, puis un
 * client neuf est construit (aucun client en cache, aucune clé gardée hors de la fermeture d'un appel). Refus de la
 * barrière : `provider_error` (`retryable: false`), aucun client construit, aucun appel, une ligne
 * `payment.provider_failed` de valeur `egress_refused` (clé absente ou mal formée : `other`).
 */
export function prestataireStripe(options: OptionsPrestataireStripe): PrestatairePaiement {
  const lireCle = options.lireCle ?? (() => cleStripe());
  const configuration = { adressesRetour: options.adressesRetour, moyens: options.moyens, fabriqueClient: options.fabriqueClient };
  const client = (): PrestatairePaiement | null => {
    const lue = lireCle();
    if (lue.ok) return creerClientSessionsStripe(lue.cle, configuration);
    logEvent("payment.provider_failed", { errorClass: lue.code === "egress_refused" ? "egress_refused" : "other" }, "warn");
    return null;
  };
  const refus = { ok: false, code: "provider_error", retryable: false } as const;
  return {
    async creerSession(paiement, cleIdempotence) {
      return (await client()?.creerSession(paiement, cleIdempotence)) ?? refus;
    },
    async adresseSession(sessionId, paiement) {
      return (await client()?.adresseSession(sessionId, paiement)) ?? refus;
    },
  };
}

export function composerPaiementStripe(): PaymentAdapter {
  const env = serverEnv();
  if (env.paymentAdapter !== "stripe" || productionPaiement(env) || env.betterAuth === null) throw new Error("paiement Stripe indisponible");
  return createStripePaymentAdapter({
    database: createDatabase("vadrouille_app"),
    withOrg,
    maintenant: () => Date.now(),
    prestataire: prestataireStripe({ adressesRetour: adressesRetourStripe(env.betterAuth.appUrl), moyens: OFFER_CONFIG.methods }),
    // Limiteur des actions (B4-TL-6 point 2) : en-têtes de la requête de l'action, lus par l'en-tête de confiance seul.
    limiteur: async (action) => checkRateLimit({ action, headers: new Headers(await (await import("next/headers")).headers()) }),
  });
}
