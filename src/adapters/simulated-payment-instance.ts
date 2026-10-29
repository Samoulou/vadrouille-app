import type { PaymentAdapter, PaymentSimulator } from "./types";

/**
 * Adaptateur de paiement `simulated` de l'application (spécification B4, B4b point 1 ; décision 0097 B4-TL-5 ; même
 * modèle que `api-instance.ts`, `api-creation-instance.ts` et `api-tri-instance.ts`, décision 0108).
 *
 * **Branchement au démarrage** : ce module n'importe rien de `src/server` (ni la composition de
 * `src/server/payment/composition.ts`, ni `withOrg`, ni la base, ni `src/server/env`). Le régime de confinement l'exige :
 * `@/adapters` est importé par les pages et par `src/features`, qui ne doivent atteindre ni `src/server/env` ni un module
 * à capacité, même par un `import()` (test « p0: clé côté serveur seulement »). `src/instrumentation.ts` branche, quand
 * `PAYMENT_ADAPTER` vaut `simulated`, la fabrique `composerPaiementSimule`, appelée **une fois**, au premier usage (la clé
 * de signature n'est lue qu'à la construction, jamais à l'import, B4-TL-3 point 5 ; un seul client de la base par
 * processus).
 *
 * Non branché (tests, `next build`, autre runtime, ou fabrique qui lève) : chaque méthode rend `provider_error`
 * (`retryable: false`), et `getEntitlement` aucun droit, sans rien lire ni écrire (échec fermé). Les pages et les actions consultent `paymentAvailable()`
 * avant et ne l'atteignent pas sans la garde ouverte.
 *
 * Garde-fou : un second branchement lève `PaiementSimuleDejaBrancheError`, et hors de `tests/` seuls ce module et
 * `src/instrumentation.ts` nomment `brancherPaiementSimule` (`tests/unit/auth/points-injection.test.ts`).
 */

/** Fabrique branchée au démarrage : construit l'adaptateur (clé, base, prestataire) au premier usage. */
export type FabriquePaiementSimule = () => PaymentAdapter & PaymentSimulator;

type Etat = { readonly fabrique: FabriquePaiementSimule; instance?: PaymentAdapter & PaymentSimulator };

// Sur `globalThis`, comme les autres branchements : Next.js charge une copie du module par route.
const PAIEMENT_KEY = Symbol.for("vadrouille.paiement-simule");
const holder = globalThis as typeof globalThis & { [PAIEMENT_KEY]?: Etat };

/** Second branchement refusé ; ne porte aucune valeur. */
export class PaiementSimuleDejaBrancheError extends Error {
  override name = "PaiementSimuleDejaBrancheError";

  constructor() {
    super("Paiement simulé déjà branché.");
  }
}

/** Branche la fabrique de l'adaptateur `simulated` (appelé une fois, au démarrage, par `src/instrumentation.ts`). */
export function brancherPaiementSimule(fabrique: FabriquePaiementSimule): void {
  if (holder[PAIEMENT_KEY] !== undefined) throw new PaiementSimuleDejaBrancheError();
  holder[PAIEMENT_KEY] = { fabrique };
}

/** Tests seulement : retire la fabrique branchée et l'adaptateur construit. */
export function debrancherPaiementSimulePourTests(): void {
  delete holder[PAIEMENT_KEY];
}

const refus = async () => ({ ok: false as const, error: { code: "provider_error" as const, retryable: false } });

/** Adaptateur non branché : chaque méthode rend `provider_error` (aucun droit pour `getEntitlement`) sans rien lire. */
const NON_BRANCHE: PaymentAdapter & PaymentSimulator = {
  getOffer: refus,
  createCheckout: refus,
  getCheckoutStatus: refus,
  getEntitlement: async () => ({ unlocked: false }),
  simulateOutcome: refus,
};

/** Adaptateur `simulated` du processus : celui de la fabrique branchée (construit une fois), sinon le refus. */
export function paiementSimule(): PaymentAdapter & PaymentSimulator {
  const etat = holder[PAIEMENT_KEY];
  if (etat === undefined) return NON_BRANCHE;
  try {
    etat.instance ??= etat.fabrique();
    return etat.instance;
  } catch {
    // Fabrique qui lève (webhook simulé fermé) : échec fermé, rien n'est retenu, la prochaine requête réessaie.
    return NON_BRANCHE;
  }
}
