import type { PaymentAdapter } from "./types";

/**
 * Adaptateur de paiement `stripe` de l'application (spécification B4, B4c point 2 ; décision 0140 § 5 point 1 ; même
 * modèle que `simulated-payment-instance.ts`).
 *
 * **Branchement au démarrage** : ce module n'importe rien de `src/server` (ni la composition de
 * `src/server/payment/composition-stripe.ts`, ni la base, ni `src/server/env`) : `@/adapters` est importé par les pages
 * et par `src/features`, qui ne doivent atteindre ni `src/server/env` ni un module à capacité, même par un `import()`.
 * `src/instrumentation.ts` branche, quand `PAYMENT_ADAPTER` vaut `stripe`, la fabrique `composerPaiementStripe`, appelée
 * **une fois**, au premier usage (un seul client de la base par processus ; la clé Stripe n'est lue qu'à chaque appel au
 * prestataire, jamais à la construction).
 *
 * Non branché (tests, `next build`, autre runtime, ou fabrique qui lève) : chaque méthode rend `provider_error`
 * (`retryable: false`), et `getEntitlement` aucun droit, sans rien lire ni écrire (échec fermé). Un second branchement
 * lève `PaiementStripeDejaBrancheError`.
 */

/** Fabrique branchée au démarrage : construit l'adaptateur (base, prestataire) au premier usage. */
export type FabriquePaiementStripe = () => PaymentAdapter;

type Etat = { readonly fabrique: FabriquePaiementStripe; instance?: PaymentAdapter };

// Sur `globalThis`, comme les autres branchements : Next.js charge une copie du module par route.
const PAIEMENT_KEY = Symbol.for("vadrouille.paiement-stripe");
const holder = globalThis as typeof globalThis & { [PAIEMENT_KEY]?: Etat };

/** Second branchement refusé ; ne porte aucune valeur. */
export class PaiementStripeDejaBrancheError extends Error {
  override name = "PaiementStripeDejaBrancheError";

  constructor() {
    super("Paiement Stripe déjà branché.");
  }
}

/** Branche la fabrique de l'adaptateur `stripe` (appelé une fois, au démarrage, par `src/instrumentation.ts`). */
export function brancherPaiementStripe(fabrique: FabriquePaiementStripe): void {
  if (holder[PAIEMENT_KEY] !== undefined) throw new PaiementStripeDejaBrancheError();
  holder[PAIEMENT_KEY] = { fabrique };
}

/** Tests seulement : retire la fabrique branchée et l'adaptateur construit. */
export function debrancherPaiementStripePourTests(): void {
  delete holder[PAIEMENT_KEY];
}

const refus = async () => ({ ok: false as const, error: { code: "provider_error" as const, retryable: false } });

/** Adaptateur non branché : chaque méthode rend `provider_error` (aucun droit pour `getEntitlement`) sans rien lire. */
const NON_BRANCHE: PaymentAdapter = {
  getOffer: refus,
  createCheckout: refus,
  getCheckoutStatus: refus,
  getEntitlement: async () => ({ unlocked: false }),
};

/** Adaptateur `stripe` du processus : celui de la fabrique branchée (construit une fois), sinon le refus. */
export function paiementStripe(): PaymentAdapter {
  const etat = holder[PAIEMENT_KEY];
  if (etat === undefined) return NON_BRANCHE;
  try {
    etat.instance ??= etat.fabrique();
    return etat.instance;
  } catch {
    // Fabrique qui lève (configuration refusée) : échec fermé, rien n'est retenu, la prochaine requête réessaie.
    return NON_BRANCHE;
  }
}
