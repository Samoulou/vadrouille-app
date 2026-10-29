import { unlockRoutes } from "@/features/presentation/routes";
import type { DependancesPaiement } from "@/server/payment/dependances";
import { creerCasPaiement, type PrestatairePaiement } from "@/server/payment/paiements";

import type { PaymentAdapter } from "./types";

/**
 * Adaptateur de paiement `stripe` en mode test (spécification B4, B4c point 2 ; décision 0140 § 5 point 1), sur le
 * modèle de `simulated-payment.ts` : implémente `PaymentAdapter` en déléguant aux cas d'usage de `src/server/payment`
 * dans le même processus. Il ne connaît que le port `PrestatairePaiement`, injecté : un double dans les tests (C1,
 * A22), le client réel de `src/server/payment/stripe.ts` par la composition (`src/server/payment/composition-stripe.ts`,
 * seul appelant de `cleStripe` hors des tests), branchée par `src/instrumentation.ts` sur `./stripe-payment-instance.ts`.
 * Il n'implémente pas `PaymentSimulator` : seul le webhook Stripe accorde le droit, sur un événement signé.
 */
export type OptionsPaiementStripe = DependancesPaiement & { readonly prestataire: PrestatairePaiement };

export function createStripePaymentAdapter(options: OptionsPaiementStripe): PaymentAdapter {
  const cas = creerCasPaiement(options);
  return {
    getOffer: (ctx, tripId) => cas.getOffer(ctx, tripId),
    createCheckout: (ctx, request) => cas.createCheckout(ctx, request, options.prestataire),
    getCheckoutStatus: (ctx, checkoutId) => cas.getCheckoutStatus(ctx, checkoutId),
    getEntitlement: (ctx, tripId) => cas.getEntitlement(ctx, tripId),
  };
}

/**
 * Adresses de retour de la session Stripe (B4c point 3, critère C2), construites depuis `APP_URL` (origine validée par
 * `parseServerEnv`), **jamais depuis la requête** (ni `Host` ni `X-Forwarded-Host`), par le module d'adresses de
 * 0020 § 5 : réussite `R9-retour`, annulation `R9?paiement=<identifiant public>`.
 */
export function adressesRetourStripe(appUrl: string) {
  return ({ tripId, checkoutId }: { readonly tripId: string; readonly checkoutId: string }) => ({
    succes: new URL(unlockRoutes(tripId).confirmation(checkoutId), appUrl).href,
    annulation: new URL(unlockRoutes(tripId).debloquer(checkoutId), appUrl).href,
  });
}
