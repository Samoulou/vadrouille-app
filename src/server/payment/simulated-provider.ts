import "server-only";

import type { CheckoutOutcome } from "@/contracts/values";

import { idEvenementSimule, idSessionSimulee } from "./formes";
import type { PaiementAEmettre, PrestataireSimule } from "./paiements";
import { ENTETE_SIGNATURE, signer } from "./signature";

/**
 * Prestataire simulé (spécification B4, B4a point 3 ; décision 0097 B4-TL-3) : crée les identifiants de session et
 * d'événement simulés (B4-TL-10), construit l'événement d'une issue (B4-PO-3), le signe comme Stripe avec la clé
 * injectée (B4-TL-2) et le livre au webhook simulé par un **transport injecté** : `POST` HTTP dans l'application
 * (`./transport-http.ts`), appel direct du gestionnaire de `src/server/routes/simulated-webhook.ts` avec une `Request`
 * construite dans les tests de `pnpm test:db` (même corps brut, mêmes en-têtes). Il n'écrit rien en base et n'accorde
 * rien : seul le webhook le fait (B4-PO-2). La clé n'est jamais gardée dans une variable de module.
 */

/** Livraison d'un événement signé ; rend le statut HTTP de la réponse du webhook. */
export type TransportWebhook = (requete: { readonly corps: Uint8Array; readonly entetes: Readonly<Record<string, string>> }) => Promise<number>;

export type OptionsPrestataireSimule = {
  /** Octets de `SIMULATED_WEBHOOK_SECRET` (`cleWebhookSimule`), ou clé tirée au hasard par les tests. */
  readonly cle: Buffer;
  readonly transport: TransportWebhook;
  readonly maintenant: () => number;
  /**
   * Adresse de `R9-sim` pour un voyage et l'identifiant **public** d'un paiement (module d'adresses de 0020 § 5 :
   * `cheminSimulationParDefaut` de `src/adapters/simulated-payment.ts`) : c'est le prestataire qui construit
   * `redirectUrl` (décision 0140 § 5 point 0).
   */
  readonly cheminSimulation: (tripId: string, checkoutId: string) => string;
};

/** Type d'événement et `payment_status` émis pour chaque issue de `R9-sim` (B4-PO-3). */
const EMISSION: Readonly<Record<CheckoutOutcome, { type: string; paymentStatus: string }>> = {
  succeeded: { type: "checkout.session.completed", paymentStatus: "paid" },
  declined: { type: "checkout.session.async_payment_failed", paymentStatus: "unpaid" },
  cancelled: { type: "checkout.session.expired", paymentStatus: "unpaid" },
};

/**
 * Événement simulé d'une issue, dans la forme de Stripe : `livemode` toujours faux, montant et devise de l'instantané
 * (devise en minuscules, comme Stripe), métadonnée `checkoutId` (uuid interne). Aucune donnée de la personne.
 */
export function evenementSimule(paiement: PaiementAEmettre, issue: CheckoutOutcome, maintenantSecondes: number): Record<string, unknown> {
  const { type, paymentStatus } = EMISSION[issue];
  return {
    id: idEvenementSimule(paiement.checkoutId, issue),
    object: "event",
    type,
    livemode: false,
    created: maintenantSecondes,
    data: {
      object: {
        id: paiement.sessionId,
        object: "checkout.session",
        mode: "payment",
        payment_status: paymentStatus,
        amount_total: paiement.amount,
        currency: paiement.currency.toLowerCase(),
        metadata: { checkoutId: paiement.checkoutId },
      },
    },
  };
}

export function creerPrestataireSimule(options: OptionsPrestataireSimule): PrestataireSimule {
  return {
    // Session simulée : identifiant `cs_sim_` tiré au hasard (la clé d'idempotence ne sert pas : rien ne sort du
    // processus) ; adresse de `R9-sim` construite depuis l'identifiant public, sans appel.
    async creerSession(paiement) {
      return { ok: true, value: { sessionId: idSessionSimulee(), redirectUrl: options.cheminSimulation(paiement.tripId, paiement.checkoutId) } };
    },
    async adresseSession(_sessionId, paiement) {
      return { ok: true, value: options.cheminSimulation(paiement.tripId, paiement.checkoutId) };
    },
    async emettre(paiement, issue) {
      const secondes = Math.floor(options.maintenant() / 1000);
      const corps = Buffer.from(JSON.stringify(evenementSimule(paiement, issue, secondes)), "utf8");
      const entetes = { "content-type": "application/json", [ENTETE_SIGNATURE]: signer(corps, options.cle, secondes) };
      try {
        return (await options.transport({ corps, entetes })) === 200;
      } catch {
        return false;
      }
    },
  };
}
