import { randomBytes } from "node:crypto";

import { createSimulatedPaymentAdapter } from "@/adapters/simulated-payment";
import type { AdapterContext } from "@/adapters/types";
import { OFFER_INCLUSIONS, type OfferConfig } from "@/contracts";
import type { DependancesPaiement } from "@/server/payment/dependances";
import { creerPrestataireSimule, type TransportWebhook } from "@/server/payment/simulated-provider";
import { creerWebhookSimule, type OptionsWebhookSimule } from "@/server/routes/simulated-webhook";
import { creerWithOrg } from "@/server/with-org";

import { createDatabase, type Database } from "../../db/index";

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
  const prestataire = creerPrestataireSimule({ cle, transport, maintenant: () => t });
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
