import { createHash, randomBytes } from "node:crypto";

import Stripe from "stripe";

import { ORIGINE_PRESTATAIRE } from "@/contracts/billing";
import type { CheckoutOutcome } from "@/contracts/values";
import type { ClientStripe, FabriqueClientStripe, ParametresSessionStripe } from "@/server/payment/stripe";

/**
 * Émetteur Stripe **de test** (spécification B4, B4c ; décision 0140 § 9, critères C1, C3, T3 à T5) : seul fichier de
 * test qui importe `stripe` (ligne `module:stripe` du régime de confinement, 0140 § 6 ligne 3). Il signe des événements
 * de la forme de Stripe par la fonction de test de la bibliothèque (`generateTestHeaderString`) et fournit un **double
 * du client** (`ClientStripe`) : aucun client réel n'est construit, aucun appel réseau n'est fait. Les clés et secrets
 * sont tirés au hasard à chaque exécution et construits à l'exécution (aucun texte de clé dans le dépôt).
 */

/** Bibliothèque, pour les espions et l'épinglage de la version d'API (T3, T4, T5). */
export const SDK = { webhooks: Stripe.webhooks, errors: Stripe.errors, apiVersion: Stripe.API_VERSION } as const;

const alnum = (n: number): string =>
  randomBytes(n * 2)
    .toString("base64")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, n)
    .padEnd(n, "x");

/** Secret de signature de test, de la forme de 0140 § 3 point 2, tiré au hasard. */
export const secretWebhookDeTest = (): string => ["whsec", alnum(32)].join("_");

/** Clé secrète de test, de la forme de 0140 § 3 point 1, tirée au hasard (préfixe assemblé à l'exécution). */
export const cleDeTest = (): string => ["sk", "test", alnum(24)].join("_");

/** Identifiant d'événement de la forme de Stripe (`evt_` + 24 caractères), déterministe pour un paiement et une issue. */
export function idEvenementStripe(checkoutUuid: string, issue: string): string {
  return `evt_${createHash("sha256").update(`${checkoutUuid}:${issue}`).digest("hex").slice(0, 24)}`;
}

/** Identifiant de session de la forme de Stripe en mode test (`cs_test_` + 24 caractères), tiré au hasard. */
export const idSessionStripe = (): string => `cs_test_${alnum(24)}`;

/** En-tête `Stripe-Signature` d'un corps, signé par la fonction de test de la bibliothèque, horodaté en secondes. */
export function signerStripe(corps: string, secret: string, secondes: number, scheme?: string): string {
  if (secondes <= 0) throw new Error("horodatage nul : la bibliothèque prendrait l'horloge système");
  return Stripe.webhooks.generateTestHeaderString({ payload: corps, secret, timestamp: secondes, ...(scheme === undefined ? {} : { scheme }) });
}

/** Type d'événement et `payment_status` de chaque issue (mêmes que le prestataire simulé, B4-PO-3). */
export const EMISSION_STRIPE: Readonly<Record<CheckoutOutcome, { readonly type: string; readonly paymentStatus: string }>> = {
  succeeded: { type: "checkout.session.completed", paymentStatus: "paid" },
  declined: { type: "checkout.session.async_payment_failed", paymentStatus: "unpaid" },
  cancelled: { type: "checkout.session.expired", paymentStatus: "unpaid" },
};

export type DonneesEvenementStripe = {
  readonly id: string;
  readonly type: string;
  readonly sessionId: string;
  readonly checkoutUuid: string;
  readonly amount: number;
  readonly currency: string;
  readonly paymentStatus: string;
  readonly created: number;
  readonly livemode?: boolean;
};

/** Événement de la forme de Stripe (aucune donnée de la personne). */
export function evenementStripe(d: DonneesEvenementStripe): Record<string, unknown> {
  return {
    id: d.id,
    object: "event",
    api_version: Stripe.API_VERSION,
    type: d.type,
    livemode: d.livemode ?? false,
    created: d.created,
    data: {
      object: {
        id: d.sessionId,
        object: "checkout.session",
        mode: "payment",
        payment_status: d.paymentStatus,
        amount_total: d.amount,
        currency: d.currency.toLowerCase(),
        metadata: { checkoutId: d.checkoutUuid },
      },
    },
  };
}

/** Session gardée par le double, telle que l'API de Stripe la rendrait (champs lus par l'adaptateur seulement). */
export type SessionDouble = {
  id: string;
  url: string | null;
  status: string;
  metadata: { checkoutId: string };
  params: ParametresSessionStripe;
};

export type AppelDouble =
  | { readonly methode: "create"; readonly cle: string; readonly params: ParametresSessionStripe; readonly idempotencyKey: string }
  | { readonly methode: "retrieve"; readonly cle: string; readonly id: string };

export type OptionsDouble = {
  /** Réponse à rendre à la place de la session (réponse invalide, adresse hors liste…). */
  readonly reponse?: (session: SessionDouble) => unknown;
  /** Erreur levée par `create` ou `retrieve` (classe du SDK ou autre). */
  readonly erreur?: () => unknown;
};

/**
 * Double du client Stripe (A22 étendu) : `create` est idempotent par clé (même clé, même session, comme l'API), `retrieve`
 * rend la session gardée ; chaque appel est noté avec la clé reçue (pour vérifier qu'aucune autre clé n'est employée).
 */
export function creerDoubleStripe(options: OptionsDouble = {}) {
  const sessions = new Map<string, SessionDouble>();
  const parCle = new Map<string, string>();
  const appels: AppelDouble[] = [];
  let reglages: OptionsDouble = { ...options };
  const fabrique: FabriqueClientStripe = (cle): ClientStripe => ({
    checkout: {
      sessions: {
        async create(params, { idempotencyKey }) {
          appels.push({ methode: "create", cle, params, idempotencyKey });
          if (reglages.erreur) throw reglages.erreur();
          const existante = parCle.get(idempotencyKey);
          let session = existante === undefined ? undefined : sessions.get(existante);
          if (session === undefined) {
            const id = idSessionStripe();
            session = { id, url: `${ORIGINE_PRESTATAIRE}/c/pay/${id}`, status: "open", metadata: { checkoutId: params.metadata.checkoutId }, params };
            sessions.set(id, session);
            parCle.set(idempotencyKey, id);
          }
          return reglages.reponse ? reglages.reponse(session) : { ...session };
        },
        async retrieve(id) {
          appels.push({ methode: "retrieve", cle, id });
          if (reglages.erreur) throw reglages.erreur();
          const session = sessions.get(id);
          if (session === undefined) throw new Stripe.errors.StripeInvalidRequestError({ message: "No such checkout.session", type: "invalid_request_error" });
          return reglages.reponse ? reglages.reponse(session) : { ...session };
        },
      },
    },
  });
  return {
    fabrique,
    sessions,
    appels,
    /** Change le comportement du double pour les appels suivants. */
    regler(nouveaux: OptionsDouble) {
      reglages = { ...nouveaux };
    },
    /** Session d'un paiement (`uuid` interne). */
    sessionDe(checkoutUuid: string): SessionDouble | undefined {
      return [...sessions.values()].find((s) => s.metadata.checkoutId === checkoutUuid);
    },
  };
}

export type DoubleStripe = ReturnType<typeof creerDoubleStripe>;
