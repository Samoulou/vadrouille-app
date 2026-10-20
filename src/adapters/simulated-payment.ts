import { unlockRoutes } from "@/features/presentation/routes";
import { creerCasPaiement, type PrestataireSimule } from "@/server/payment/paiements";
import type { DependancesPaiement } from "@/server/payment/dependances";

import type { PaymentAdapter, PaymentSimulator } from "./types";

/**
 * Adaptateur de paiement `simulated` (spécification B4, B4a point 6 ; décision 0097 B4-TL-5) : implémente
 * `PaymentAdapter` en déléguant aux cas d'usage de `src/server/payment` dans le même processus (aucun appel HTTP pour
 * les lectures, handover § 11), et `PaymentSimulator` en déléguant au prestataire simulé, qui signe et livre l'événement
 * au webhook simulé : seul ce dernier accorde le droit (B4-PO-2).
 *
 * **Non branché en B4a** : créé seulement par sa fabrique (suite de contrat et tests de base) et par la composition
 * (`src/server/payment/composition.ts`) ; `getPaymentAdapter()`, `getPaymentSimulator()`, `getTripReader()` et
 * `paymentAvailable()` ne changent pas (B4b, B4-TL-14).
 */
export type OptionsPaiementSimule = DependancesPaiement & {
  readonly prestataire: PrestataireSimule;
  /** Adresse de `R9-sim` (module d'adresses de 0020 § 5 par défaut). */
  readonly cheminSimulation?: (tripId: string, checkoutId: string) => string;
};

export function createSimulatedPaymentAdapter(options: OptionsPaiementSimule): PaymentAdapter & PaymentSimulator {
  const cas = creerCasPaiement(options);
  const chemin = options.cheminSimulation ?? ((tripId: string, checkoutId: string) => unlockRoutes(tripId).paiementSimule(checkoutId));
  return {
    getOffer: (ctx, tripId) => cas.getOffer(ctx, tripId),
    createCheckout: (ctx, request) => cas.createCheckout(ctx, request, options.prestataire, chemin),
    getCheckoutStatus: (ctx, checkoutId) => cas.getCheckoutStatus(ctx, checkoutId),
    getEntitlement: (ctx, tripId) => cas.getEntitlement(ctx, tripId),
    simulateOutcome: (ctx, checkoutId, outcome) => cas.simulateOutcome(ctx, checkoutId, outcome, options.prestataire),
  };
}
