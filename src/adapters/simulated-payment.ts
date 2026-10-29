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
 * Créé par sa fabrique (suite de contrat et tests de base) et par la composition (`src/server/payment/composition.ts`),
 * que `src/instrumentation.ts` branche sur `./simulated-payment-instance.ts` quand `PAYMENT_ADAPTER` vaut `simulated` ;
 * `getPaymentAdapter()` et `getPaymentSimulator()` le rendent alors (B4b, amendement B4-TL-14 de 0020 § 2.3).
 */
export type OptionsPaiementSimule = DependancesPaiement & {
  /** Prestataire simulé ; il construit l'adresse de `R9-sim` (`cheminSimulationParDefaut`, décision 0140 § 5 point 0). */
  readonly prestataire: PrestataireSimule;
};

/** Adresse de `R9-sim` d'un paiement (module d'adresses de 0020 § 5), passée au prestataire simulé par ses fabriques. */
export const cheminSimulationParDefaut = (tripId: string, checkoutId: string): string => unlockRoutes(tripId).paiementSimule(checkoutId);

export function createSimulatedPaymentAdapter(options: OptionsPaiementSimule): PaymentAdapter & PaymentSimulator {
  const cas = creerCasPaiement(options);
  return {
    getOffer: (ctx, tripId) => cas.getOffer(ctx, tripId),
    createCheckout: (ctx, request) => cas.createCheckout(ctx, request, options.prestataire),
    getCheckoutStatus: (ctx, checkoutId) => cas.getCheckoutStatus(ctx, checkoutId),
    getEntitlement: (ctx, tripId) => cas.getEntitlement(ctx, tripId),
    simulateOutcome: (ctx, checkoutId, outcome) => cas.simulateOutcome(ctx, checkoutId, outcome, options.prestataire),
    // Reçu maison marqué « simulé » (B4d) : seul cet adaptateur l'expose ; l'adaptateur `stripe` attend la colonne du
    // lien du reçu de Stripe (migration décrite dans la PR de B4d).
    getReceipt: (ctx, tripId) => cas.getReceipt(ctx, tripId),
    listReceipts: (ctx) => cas.listReceipts(ctx),
  };
}
