import { randomBytes } from "node:crypto";

import { cheminSimulationParDefaut, createSimulatedPaymentAdapter } from "@/adapters/simulated-payment";
import { adressesRetourStripe, createStripePaymentAdapter } from "@/adapters/stripe-payment";
import type { AdapterContext } from "@/adapters/types";
import { OFFER_INCLUSIONS, type OfferConfig } from "@/contracts";
import { prestataireStripe } from "@/server/payment/composition-stripe";
import type { DependancesPaiement } from "@/server/payment/dependances";
import { creerCasPaiement, type PaiementAEmettre, type PrestataireSimule } from "@/server/payment/paiements";
import { creerPrestataireSimule, type TransportWebhook } from "@/server/payment/simulated-provider";
import { verifierEvenementStripe } from "@/server/payment/stripe";
import { creerWebhookSimule, type OptionsWebhookSimule } from "@/server/routes/simulated-webhook";
import { creerWebhookStripe } from "@/server/routes/stripe-webhook";
import { creerWithOrg } from "@/server/with-org";

import { createDatabase, type Database } from "../../db/index";
import { cleDeTest, creerDoubleStripe, EMISSION_STRIPE, evenementStripe, idEvenementStripe, secretWebhookDeTest, signerStripe, type OptionsDouble } from "../support/stripe-evenements";

import { createOrg, inTx, insertSql, type DbClient, type Org, type SeedIds } from "./helpers";

/**
 * Banc des tests de base du paiement simulé (spécification B4, B4a ; critères A18 et A22 ; décision 0097 B4-TL-3) :
 * adaptateur `simulated` sur le client `vadrouille_app`, prestataire simulé dont le **transport de test** appelle
 * directement le gestionnaire du webhook simulé avec une `Request` construite (corps brut et en-têtes du prestataire,
 * sans serveur ni réseau). Clé de signature tirée au hasard à chaque exécution, injectée (jamais `process.env`).
 * Horloge propre à chaque banc, commune au prestataire, au webhook et aux cas d'usage.
 */

export const URL_WEBHOOK = "http://127.0.0.1:3000/api/v1/webhooks/simulated";

export const OFFRE: OfferConfig = {
  amount: 3900,
  currency: "CHF",
  priceVariant: "chf_29",
  methods: ["twint", "card"],
  includes: [...OFFER_INCLUSIONS],
  accessDaysAfterReturn: 30,
};

let partage: Database | undefined;
/** Client `vadrouille_app` partagé par les bancs d'un fichier ; fermé par `fermerBase`. */
export function base(): Database {
  partage ??= createDatabase("vadrouille_app");
  return partage;
}
export async function fermerBase(): Promise<void> {
  await partage?.$client.end();
  partage = undefined;
}

export const contexte = (org: Org): AdapterContext => ({ organizationId: org.org, userId: org.owner, role: "owner" });

/** Voyage neuf de l'organisation, écrit sous `vadrouille_app` avec son contexte. */
export async function nouveauVoyage(app: DbClient, org: Org): Promise<string> {
  return inTx(app, { org: org.org, user: org.owner }, async (c) => {
    const { sql, params } = insertSql("trips", { ...org, trip: "", rows: {} } satisfies SeedIds);
    return (await c.query(sql, params)).rows[0].id as string;
  });
}

export type Banc = ReturnType<typeof creerBanc>;

export type OptionsBanc = Partial<Omit<DependancesPaiement, "database" | "withOrg" | "maintenant">> & {
  /** Instant de départ (défaut : maintenant). */
  readonly debut?: number;
  /** Remplace le transport de test (panne de livraison, interception). */
  readonly transport?: (defaut: TransportWebhook) => TransportWebhook;
  readonly webhook?: Omit<OptionsWebhookSimule, "lireConfiguration" | "dependances">;
};

export function creerBanc(options: OptionsBanc = {}) {
  const { debut, transport: remplacer, webhook: optionsWebhook, ...reste } = options;
  let t = debut ?? Date.now();
  const cle = randomBytes(32);
  const deps: DependancesPaiement = { offre: OFFRE, ...reste, database: base(), withOrg: creerWithOrg(base()), maintenant: () => t };
  const webhook = creerWebhookSimule({ lireConfiguration: () => ({ ouvert: true, cle: () => cle }), dependances: deps, ...optionsWebhook });
  const livraisons: { status: number; corps: string; entetes: Readonly<Record<string, string>> }[] = [];
  const direct: TransportWebhook = async ({ corps, entetes }) => {
    const reponse = await webhook(new Request(URL_WEBHOOK, { method: "POST", body: Buffer.from(corps), headers: { ...entetes } }));
    livraisons.push({ status: reponse.status, corps: Buffer.from(corps).toString("utf8"), entetes });
    return reponse.status;
  };
  const transport = remplacer ? remplacer(direct) : direct;
  const prestataire = creerPrestataireSimule({ cle, transport, maintenant: () => t, cheminSimulation: cheminSimulationParDefaut });
  const adapter = createSimulatedPaymentAdapter({ ...deps, prestataire });
  return {
    adapter,
    deps,
    cle,
    webhook,
    prestataire,
    livraisons,
    avancer: (ms: number) => {
      t += ms;
    },
    maintenant: () => t,
  };
}

/** Organisation neuve, son voyage et un contexte `owner`. */
export async function nouvelleOrganisation(auth: DbClient, app: DbClient, membres = 0) {
  const org = await createOrg(auth, membres);
  const tripId = await nouveauVoyage(app, org);
  return { org, tripId, ctx: contexte(org) };
}

/** Adresse du webhook Stripe et origine de l'application des bancs Stripe (jamais lue de la requête, C2). */
export const URL_WEBHOOK_STRIPE = "http://127.0.0.1:3000/api/v1/webhooks/stripe";
export const APP_URL_BANC = "https://essai.vadrouille.test";

export type OptionsBancStripe = Partial<Omit<DependancesPaiement, "database" | "withOrg" | "maintenant">> & {
  readonly debut?: number;
  readonly double?: OptionsDouble;
};

/**
 * Banc des tests de base de l'adaptateur `stripe` (spécification B4, B4c ; décision 0140 § 9, C1, C3, T6) : adaptateur
 * `stripe` sur `vadrouille_app`, prestataire de la composition (`prestataireStripe`) avec une clé de test tirée au
 * hasard et le **double du client** (aucun appel réseau) ; webhook Stripe de la fabrique commune, secret de test tiré au
 * hasard, horloge du banc. `emettre` signe un événement de la forme de Stripe par la fonction de test de la
 * bibliothèque et le livre au webhook Stripe avec une `Request` construite : la suite de contrat rejoue ainsi
 * `simulateOutcome` sur le chemin réel du webhook Stripe.
 */
export function creerBancStripe(options: OptionsBancStripe = {}) {
  const { debut, double: reglagesDouble, ...reste } = options;
  let t = debut ?? Date.now();
  const cle = cleDeTest();
  const secret = secretWebhookDeTest();
  const double = creerDoubleStripe(reglagesDouble);
  const deps: DependancesPaiement = { offre: OFFRE, ...reste, database: base(), withOrg: creerWithOrg(base()), maintenant: () => t };
  const webhook = creerWebhookStripe({
    lireConfiguration: () => ({ ouvert: true, verifierSignature: () => (corps, entete, ms) => verifierEvenementStripe(corps, entete, secret, ms) }),
    dependances: deps,
  });
  const prestataire = prestataireStripe({
    lireCle: () => ({ ok: true, cle }),
    adressesRetour: adressesRetourStripe(APP_URL_BANC),
    moyens: OFFRE.methods,
    fabriqueClient: double.fabrique,
  });
  const livraisons: { status: number; corps: string }[] = [];
  /** Livre un corps signé (ou un en-tête donné) au webhook Stripe ; rend le statut HTTP. */
  async function livrer(corps: string, entete?: string, secondes: number = Math.floor(t / 1000)): Promise<number> {
    const signature = entete ?? signerStripe(corps, secret, secondes);
    const reponse = await webhook(
      new Request(URL_WEBHOOK_STRIPE, { method: "POST", body: Buffer.from(corps, "utf8"), headers: { "content-type": "application/json", "stripe-signature": signature } }),
    );
    livraisons.push({ status: reponse.status, corps });
    return reponse.status;
  }
  /** Événement d'une issue pour un paiement lu en base (identifiant déterministe : rejouer l'issue rejoue l'événement). */
  const evenementIssue = (paiement: PaiementAEmettre, issue: keyof typeof EMISSION_STRIPE) =>
    evenementStripe({
      id: idEvenementStripe(paiement.checkoutId, issue),
      type: EMISSION_STRIPE[issue].type,
      paymentStatus: EMISSION_STRIPE[issue].paymentStatus,
      sessionId: paiement.sessionId,
      checkoutUuid: paiement.checkoutId,
      amount: paiement.amount,
      currency: paiement.currency,
      created: Math.floor(t / 1000),
    });
  const emetteur: PrestataireSimule = {
    ...prestataire,
    async emettre(paiement, issue) {
      return (await livrer(JSON.stringify(evenementIssue(paiement, issue)))) === 200;
    },
  };
  const adapter = createStripePaymentAdapter({ ...deps, prestataire });
  const cas = creerCasPaiement(deps);
  return {
    adapter,
    /** Adaptateur et simulateur de la suite de contrat : `simulateOutcome` passe par le webhook Stripe signé. */
    contrat: { ...adapter, simulateOutcome: (ctx: AdapterContext, id: string, issue: "succeeded" | "declined" | "cancelled") => cas.simulateOutcome(ctx, id, issue, emetteur) },
    deps,
    cle,
    secret,
    double,
    webhook,
    prestataire,
    livrer,
    evenementIssue,
    livraisons,
    avancer: (ms: number) => {
      t += ms;
    },
    maintenant: () => t,
  };
}

export type BancStripe = ReturnType<typeof creerBancStripe>;
