import { afterAll, beforeAll, describe } from "vitest";

import { decrireContratPaiement } from "../support/payment-contract";

import { closeAll, connect, createOrg, type DbClient } from "./helpers";
import { contexte, creerBanc, creerBancStripe, fermerBase, nouvelleOrganisation, OFFRE } from "./paiement-banc";

/**
 * Suite de contrat paiement (spécification B4, critère A18 ; décision 0097 B4-TL-9) sur l'adaptateur `simulated` :
 * cas d'usage sur `vadrouille_app`, prestataire simulé livrant au webhook simulé par le transport de test (A22).
 */

let app: DbClient;
let auth: DbClient;

beforeAll(async () => {
  app = await connect("app");
  auth = await connect("auth");
});

afterAll(async () => {
  await fermerBase();
  await closeAll();
});

describe("adaptateurs: mock et simulated passent la même suite de contrat paiement", () => {
  decrireContratPaiement("simulated", {
    offre: OFFRE,
    dureeVieMs: 30 * 60_000,
    redirection: "chemin",
    async nouveau() {
      const banc = creerBanc();
      const { tripId, ctx } = await nouvelleOrganisation(auth, app);
      const autre = contexte(await createOrg(auth));
      return { adapter: banc.adapter, ctx, tripId, autre, avancer: banc.avancer };
    },
  });
});

// B4c (PR 863 ; décision 0140 § 9, C1) : adaptateur `stripe` avec le double du client (aucun appel réseau) ; les issues
// sont des événements de la forme de Stripe, signés par la fonction de test de la bibliothèque et livrés au webhook Stripe.
describe("adaptateurs: stripe passe la suite de contrat paiement", () => {
  async function instance(url?: string) {
    const banc = creerBancStripe(url === undefined ? {} : { double: { reponse: (session) => ({ ...session, url }) } });
    const { tripId, ctx } = await nouvelleOrganisation(auth, app);
    const autre = contexte(await createOrg(auth));
    return { adapter: banc.contrat, ctx, tripId, autre, avancer: banc.avancer };
  }
  decrireContratPaiement("stripe", {
    offre: OFFRE,
    dureeVieMs: 30 * 60_000,
    redirection: "prestataire",
    nouveau: () => instance(),
    avecAdresseSession: (url) => instance(url),
  });
});
