import "server-only";

import Stripe from "stripe";

import { adressePrestataireAdmise } from "@/contracts/billing";
import type { PaymentMethod } from "@/contracts/values";
import { logEvent } from "@/server/log";

import { DUREE_VIE_PAIEMENT_MS } from "./dependances";
import { SESSION_STRIPE } from "./formes";
import type { PaiementPrestataire, PrestatairePaiement, ResultatPrestataire } from "./paiements";
import { LONGUEUR_MAX_ENTETE, TOLERANCE_SECONDES } from "./signature";

/**
 * **Seul module qui importe le paquet `stripe`** (23.0.0 exacte ; décision 0140 § 1, amendement de 0006), en mode test
 * seulement. Importé hors des tests par `src/server/payment/composition-stripe.ts` et `src/server/routes/stripe-webhook.ts`
 * seulement (test du dépôt, 0140 § 6 ligne 9). N'exporte rien de la bibliothèque : deux fonctions et leurs types.
 *
 * - `creerClientSessionsStripe(cle, configuration)` : le port `PrestatairePaiement` (création et relecture d'une session
 *   Checkout) ; seul lieu où un client `Stripe` est construit, **à chaque appel** (aucun client en cache), avec
 *   `telemetry: false`, `maxNetworkRetries: 1`, un délai de 10 s, sans `appInfo` et sans surcharger `apiVersion`.
 * - `verifierEvenementStripe(corps, entete, secret, maintenantMs)` : vérification de la signature d'un événement par la
 *   fonction de la bibliothèque, **sans clé d'API** (aucun client construit), corps brut, tolérance de 300 s passée
 *   explicitement, horloge injectée par `receivedAt`.
 *
 * **Toute erreur du SDK est neutralisée** (0140 § 1.2) : le corps entier de chaque méthode, construction du client
 * comprise, est dans un `try` dont le `catch` ne lit de l'erreur que sa classe, comparée par `instanceof` aux classes
 * exportées du SDK (ni `name` ni `constructor.name`), selon une liste fermée ; l'objet d'erreur (qui porte la clé
 * masquée, des en-têtes et les paramètres envoyés) n'est ni rendu, ni relancé, ni attaché en `cause`, ni journalisé.
 * Le résultat est fermé (`provider_error` et `retryable`) et une seule ligne `payment.provider_failed` est écrite, avec
 * le seul champ `errorClass`. Un 409 « clé d'idempotence en cours d'utilisation » (deux créations concurrentes sous la
 * même clé) est relancé une fois par le SDK 23.0.0 (`maxNetworkRetries: 1`), puis levé en `StripeAPIError`
 * (`retryable: true`) ; levé en `StripeIdempotencyError`, il donnerait `retryable: false`, ce qui est acceptable en mode
 * test (l'écran propose alors un nouveau paiement, F9).
 */

/** Options du client (0140 § 1.1 point 4) : rien n'est envoyé sans nécessité. */
const OPTIONS_CLIENT = { telemetry: false, maxNetworkRetries: 1, timeout: 10_000 } as const;

/** Nom du produit de la ligne de la session : constant, sans aucune donnée de la personne ni du voyage. */
export const NOM_PRODUIT_STRIPE = "Déblocage du voyage";

/**
 * Expiration de la session (0140 § 5 point 4) : création de la ligne + durée de vie (30 min, B4-PO-4) + 120 s de marge,
 * en secondes. Stripe exige au moins 30 min **après la création de la session**, qui suit la création de la ligne.
 */
export const MARGE_EXPIRATION_SESSION_S = 120;
export const EXPIRATION_SESSION_S = DUREE_VIE_PAIEMENT_MS / 1000 + MARGE_EXPIRATION_SESSION_S;

/** Paramètres envoyés à la création d'une session Checkout (0140 § 5 point 4, critère C5). */
export type ParametresSessionStripe = {
  mode: "payment";
  line_items: { price_data: { currency: string; unit_amount: number; product_data: { name: string } }; quantity: 1 }[];
  payment_method_types: PaymentMethod[];
  metadata: { checkoutId: string };
  success_url: string;
  cancel_url: string;
  expires_at: number;
};

/** Interface étroite du client Stripe employée ici : un double la remplace dans les tests (C1, A22). */
export type ClientStripe = {
  readonly checkout: {
    readonly sessions: {
      create(params: ParametresSessionStripe, options: { idempotencyKey: string }): Promise<unknown>;
      retrieve(id: string): Promise<unknown>;
    };
  };
};

export type FabriqueClientStripe = (cle: string) => ClientStripe;

/** Client réel, construit à chaque appel ; la clé ne vit que dans ce client. */
const clientReel: FabriqueClientStripe = (cle) => {
  const client = new Stripe(cle, OPTIONS_CLIENT);
  return {
    checkout: {
      sessions: {
        create: (params, options) => client.checkout.sessions.create(params, options),
        retrieve: (id) => client.checkout.sessions.retrieve(id),
      },
    },
  };
};

export type ConfigurationSessionsStripe = {
  /** Adresses de retour **absolues**, construites depuis `APP_URL` par le module d'adresses (B4c point 3, C2). */
  readonly adressesRetour: (paiement: { readonly tripId: string; readonly checkoutId: string }) => { readonly succes: string; readonly annulation: string };
  /** Moyens de l'offre (`src/server/config/offer.ts`). */
  readonly moyens: readonly PaymentMethod[];
  /** Fabrique du client (défaut : le client réel) ; un double dans les tests. */
  readonly fabriqueClient?: FabriqueClientStripe;
};

/** Classes d'erreur du SDK nommées dans le journal (liste fermée, 0140 § 1.2), avec leur caractère réessayable. */
const CLASSES_ERREUR: readonly (readonly [abstract new (...args: never[]) => unknown, string, boolean])[] = [
  [Stripe.errors.StripeConnectionError, "StripeConnectionError", true],
  [Stripe.errors.StripeRateLimitError, "StripeRateLimitError", true],
  [Stripe.errors.StripeAPIError, "StripeAPIError", true],
  [Stripe.errors.StripeIdempotencyError, "StripeIdempotencyError", false],
  [Stripe.errors.StripeAuthenticationError, "StripeAuthenticationError", false],
  [Stripe.errors.StripePermissionError, "StripePermissionError", false],
  [Stripe.errors.StripeInvalidRequestError, "StripeInvalidRequestError", false],
];

/** Noms des classes nommées, pour le test d'égalité avec `LOG_PROVIDER_ERROR_CLASSES`. */
export const CLASSES_ERREUR_STRIPE: readonly string[] = CLASSES_ERREUR.map(([, nom]) => nom);

/** Échec fermé et sa seule ligne de journal (`errorClass` d'une liste fermée). */
function echec(errorClass: string, retryable: boolean): ResultatPrestataire<never> {
  logEvent("payment.provider_failed", { errorClass }, "warn");
  return { ok: false, code: "provider_error", retryable };
}

/** Échec d'une erreur levée : seule sa classe est lue, par `instanceof`. */
function echecErreur(erreur: unknown): ResultatPrestataire<never> {
  for (const [classe, nom, retryable] of CLASSES_ERREUR) {
    if (erreur instanceof classe) return echec(nom, retryable);
  }
  return echec("other", false);
}

const objet = (valeur: unknown): valeur is Record<string, unknown> => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);

/** Paramètres de la session d'un paiement : montant et devise de l'instantané, moyens de l'offre, aucune donnée de la personne. */
export function parametresSessionStripe(paiement: PaiementPrestataire, configuration: ConfigurationSessionsStripe): ParametresSessionStripe {
  const retour = configuration.adressesRetour({ tripId: paiement.tripId, checkoutId: paiement.checkoutId });
  return {
    mode: "payment",
    line_items: [{ price_data: { currency: paiement.currency.toLowerCase(), unit_amount: paiement.amount, product_data: { name: NOM_PRODUIT_STRIPE } }, quantity: 1 }],
    payment_method_types: [...configuration.moyens],
    metadata: { checkoutId: paiement.id },
    success_url: retour.succes,
    cancel_url: retour.annulation,
    expires_at: Math.ceil(paiement.createdMs / 1000) + EXPIRATION_SESSION_S,
  };
}

/**
 * Port `PrestatairePaiement` sur l'API de Stripe, pour la clé reçue (lue par `cleStripe` après la barrière de sortie,
 * dans `composition-stripe.ts`). La clé n'est gardée que dans la fermeture ; aucun type de la bibliothèque n'en sort.
 */
export function creerClientSessionsStripe(cle: string, configuration: ConfigurationSessionsStripe): PrestatairePaiement {
  const fabrique = configuration.fabriqueClient ?? clientReel;
  return {
    async creerSession(paiement, cleIdempotence) {
      try {
        const client = fabrique(cle);
        const session = await client.checkout.sessions.create(parametresSessionStripe(paiement, configuration), { idempotencyKey: cleIdempotence });
        if (!objet(session) || typeof session.id !== "string" || !SESSION_STRIPE.test(session.id)) return echec("invalid_response", false);
        if (typeof session.url !== "string" || !adressePrestataireAdmise(session.url)) return echec("invalid_response", false);
        return { ok: true, value: { sessionId: session.id, redirectUrl: session.url } };
      } catch (erreur) {
        return echecErreur(erreur);
      }
    },

    async adresseSession(sessionId, paiement) {
      try {
        if (!SESSION_STRIPE.test(sessionId)) return echec("invalid_response", false);
        const client = fabrique(cle);
        const session = await client.checkout.sessions.retrieve(sessionId);
        if (!objet(session) || session.id !== sessionId || !objet(session.metadata) || session.metadata.checkoutId !== paiement.id) {
          return echec("invalid_response", false);
        }
        // Session expirée ou close : un nouveau paiement est proposé (F9), sans ligne de journal (cas attendu).
        if (session.status !== "open") return { ok: false, code: "provider_error", retryable: false };
        if (typeof session.url !== "string" || !adressePrestataireAdmise(session.url)) return echec("invalid_response", false);
        return { ok: true, value: session.url };
      } catch (erreur) {
        return echecErreur(erreur);
      }
    },
  };
}

/**
 * Vérification de la signature d'un événement Stripe (0140 § 2.3) : en-tête absent, vide ou de plus de 512 caractères
 * refusé **avant tout calcul** ; puis `constructEvent` de la bibliothèque sur le **corps brut** (octets lus, jamais une
 * chaîne réencodée), tolérance explicite de 300 s (jamais `0`), horloge injectée par `receivedAt` (millisecondes). La
 * bibliothèque ne compare que l'âge de l'horodatage (pas le futur : écart assumé, épinglé par T4) ; seul le schéma
 * `v1` compte. Rend un booléen : l'erreur levée (qui porte l'en-tête et le corps reçus) est attrapée **sans être liée**,
 * ni relancée, ni journalisée.
 */
export function verifierEvenementStripe(corps: Uint8Array, entete: string | null, secret: string, maintenantMs: number): boolean {
  if (entete === null || entete.length === 0 || entete.length > LONGUEUR_MAX_ENTETE) return false;
  try {
    Stripe.webhooks.constructEvent(Buffer.from(corps.buffer, corps.byteOffset, corps.byteLength), entete, secret, TOLERANCE_SECONDES, undefined, maintenantMs);
    return true;
  } catch {
    return false;
  }
}
