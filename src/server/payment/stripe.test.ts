// @vitest-environment node
import { randomBytes } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { adressePrestataireAdmise, ORIGINE_PRESTATAIRE } from "@/contracts/billing";
import { LOG_PROVIDER_ERROR_CLASSES } from "@/server/log";

import { cleDeTest, creerDoubleStripe, SDK, secretWebhookDeTest, signerStripe } from "../../../tests/support/stripe-evenements";
import { prestataireStripe } from "./composition-stripe";
import { DUREE_VIE_PAIEMENT_MS } from "./dependances";
import { formeSimulee, formeStripe, idEvenementSimule, idSessionSimulee } from "./formes";
import type { PaiementPrestataire } from "./paiements";
import { signer } from "./signature";
import {
  CLASSES_ERREUR_STRIPE,
  creerClientSessionsStripe,
  EXPIRATION_SESSION_S,
  fabriqueClientSdk,
  NOM_PRODUIT_STRIPE,
  parametresSessionStripe,
  verifierEvenementStripe,
  type TransportHttpStripe,
} from "./stripe";

/**
 * Module `stripe.ts` (spécification B4, B4c ; décision 0140 § 1.2, § 2.3, § 5 point 4 ; critères C5, T3, T4, T5) : sans
 * réseau, sans clé réelle. Le double remplace le client (`fabriqueClient`) ; la vérification de signature passe par la
 * bibliothèque, sans client. Clés et secrets tirés au hasard à l'exécution.
 */

afterEach(() => vi.restoreAllMocks());

const CREATION_MS = Date.UTC(2026, 9, 29, 10, 0, 0, 250);
const PAIEMENT: PaiementPrestataire = {
  id: "9d5a4f43-8f4f-4b39-9d0e-3c0b4f5b2a11",
  checkoutId: "nVpPQ49PSzmdDjwLT1srEQ",
  tripId: "3f0b1f0c-5d1e-4e0f-8a0c-1b2c3d4e5f60",
  amount: 3900,
  currency: "CHF",
  method: "twint",
  createdMs: CREATION_MS,
};
const RETOUR = (p: { readonly tripId: string; readonly checkoutId: string }) => ({
  succes: `https://essai.vadrouille.test/voyages/${p.tripId}/debloquer/confirmation?paiement=${p.checkoutId}`,
  annulation: `https://essai.vadrouille.test/voyages/${p.tripId}/debloquer?paiement=${p.checkoutId}`,
});
const configuration = (double = creerDoubleStripe()) => ({ adressesRetour: RETOUR, moyens: ["twint", "card"] as const, fabriqueClient: double.fabrique });

/** Lignes écrites sur la console pendant `appel`. */
async function capturer<T>(appel: () => Promise<T>): Promise<{ valeur: T; lignes: string[] }> {
  const espions = [vi.spyOn(console, "log"), vi.spyOn(console, "error"), vi.spyOn(console, "warn")].map((e) => e.mockImplementation(() => undefined));
  try {
    const valeur = await appel();
    return { valeur, lignes: espions.flatMap((e) => e.mock.calls.map((c) => c.map(String).join(" "))) };
  } finally {
    for (const e of espions) e.mockRestore();
  }
}

describe("paiement: paramètres de la session Stripe", () => {
  it("montant, devise en minuscules, moyens de l'offre, métadonnée = uuid interne, adresses de retour, expires_at = création + 1920 s ; aucune donnée de la personne", () => {
    const params = parametresSessionStripe(PAIEMENT, configuration());
    expect(EXPIRATION_SESSION_S).toBe(DUREE_VIE_PAIEMENT_MS / 1000 + 120);
    expect(EXPIRATION_SESSION_S).toBe(1920);
    expect(params).toEqual({
      mode: "payment",
      line_items: [{ price_data: { currency: "chf", unit_amount: 3900, product_data: { name: NOM_PRODUIT_STRIPE } }, quantity: 1 }],
      payment_method_types: ["twint", "card"],
      metadata: { checkoutId: PAIEMENT.id },
      success_url: RETOUR(PAIEMENT).succes,
      cancel_url: RETOUR(PAIEMENT).annulation,
      expires_at: Math.ceil(CREATION_MS / 1000) + 1920,
    });
    for (const champ of ["customer", "customer_email", "client_reference_id"]) expect(params).not.toHaveProperty(champ);
    expect(JSON.stringify(params)).not.toContain("@");
  });

  it("création : clé reçue passée au client, clé d'idempotence reçue, session et adresse rendues", async () => {
    const double = creerDoubleStripe();
    const cle = cleDeTest();
    const resultat = await creerClientSessionsStripe(cle, configuration(double)).creerSession(PAIEMENT, `checkout:${PAIEMENT.id}`);
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(resultat.value.sessionId).toMatch(/^cs_test_[A-Za-z0-9]+$/);
    expect(adressePrestataireAdmise(resultat.value.redirectUrl)).toBe(true);
    expect(double.appels).toEqual([{ methode: "create", cle, params: parametresSessionStripe(PAIEMENT, configuration()), idempotencyKey: `checkout:${PAIEMENT.id}` }]);
  });
});

describe("paiement: relecture d'une session Stripe (reprise)", () => {
  async function avecSession(reglage?: Parameters<ReturnType<typeof creerDoubleStripe>["regler"]>[0]) {
    const double = creerDoubleStripe();
    const client = creerClientSessionsStripe(cleDeTest(), configuration(double));
    const cree = await client.creerSession(PAIEMENT, `checkout:${PAIEMENT.id}`);
    if (!cree.ok) throw new Error("création");
    if (reglage) double.regler(reglage);
    return { double, client, sessionId: cree.value.sessionId, url: cree.value.redirectUrl };
  }

  it("session ouverte du même paiement → son adresse", async () => {
    const { client, sessionId, url } = await avecSession();
    expect(await client.adresseSession(sessionId, PAIEMENT)).toEqual({ ok: true, value: url });
  });

  it("session expirée ou close → provider_error non réessayable, sans ligne de journal", async () => {
    for (const status of ["expired", "complete"]) {
      const { client, sessionId } = await avecSession({ reponse: (s) => ({ ...s, status }) });
      const { valeur, lignes } = await capturer(() => client.adresseSession(sessionId, PAIEMENT));
      expect(valeur).toEqual({ ok: false, code: "provider_error", retryable: false });
      expect(lignes).toEqual([]);
    }
  });

  it("métadonnée d'un autre paiement, identifiant différent, adresse hors liste ou absente → invalid_response", async () => {
    const cas = [
      (s: object) => ({ ...s, metadata: { checkoutId: crypto.randomUUID() } }),
      (s: object) => ({ ...s, id: "cs_test_autre" }),
      (s: object) => ({ ...s, url: "https://evil.example/x" }),
      (s: object) => ({ ...s, url: null }),
      () => null,
    ];
    for (const reponse of cas) {
      const { client, sessionId } = await avecSession({ reponse });
      const { valeur, lignes } = await capturer(() => client.adresseSession(sessionId, PAIEMENT));
      expect(valeur).toEqual({ ok: false, code: "provider_error", retryable: false });
      expect(lignes.map((l) => JSON.parse(l) as object)).toEqual([expect.objectContaining({ event: "payment.provider_failed", errorClass: "invalid_response" })]);
    }
  });

  it("identifiant de session qui n'a pas la forme Stripe → invalid_response sans appel", async () => {
    const double = creerDoubleStripe();
    const { valeur } = await capturer(() => creerClientSessionsStripe(cleDeTest(), configuration(double)).adresseSession("cs_sim_abc", PAIEMENT));
    expect(valeur).toEqual({ ok: false, code: "provider_error", retryable: false });
    expect(double.appels).toEqual([]);
  });
});

describe("paiement: aucune donnée d'une erreur du SDK Stripe ne sort", () => {
  /** Sentinelle de la forme d'une clé de test, assemblée à l'exécution. */
  const SENTINELLE = ["sk", "test", `SENTINELLE${randomBytes(12).toString("hex")}`].join("_");

  /** Erreur du SDK (classe réelle) dont le message, les propriétés et la cause portent la sentinelle. */
  function erreurPiegee(Classe: new (raw: Record<string, unknown>) => Error): Error {
    const erreur = new Classe({
      message: `Invalid API Key provided: ${SENTINELLE}`,
      headers: { "stripe-signature": SENTINELLE, authorization: `Bearer ${SENTINELLE}` },
      requestId: `req_${SENTINELLE}`,
      param: SENTINELLE,
      raw: { params: { metadata: { checkoutId: SENTINELLE } } },
    });
    Object.assign(erreur, { cause: new Error(SENTINELLE), parametres: { cle: SENTINELLE } });
    return erreur;
  }

  const CAS = [
    [SDK.errors.StripeConnectionError, "StripeConnectionError", true],
    [SDK.errors.StripeRateLimitError, "StripeRateLimitError", true],
    [SDK.errors.StripeAPIError, "StripeAPIError", true],
    [SDK.errors.StripeIdempotencyError, "StripeIdempotencyError", false],
    [SDK.errors.StripeAuthenticationError, "StripeAuthenticationError", false],
    [SDK.errors.StripePermissionError, "StripePermissionError", false],
    [SDK.errors.StripeInvalidRequestError, "StripeInvalidRequestError", false],
  ] as const;

  it("liste fermée des classes : égale aux sept premières valeurs de `LOG_PROVIDER_ERROR_CLASSES`", () => {
    expect(CLASSES_ERREUR_STRIPE).toEqual(LOG_PROVIDER_ERROR_CLASSES.slice(0, 7));
    expect(LOG_PROVIDER_ERROR_CLASSES.slice(7)).toEqual(["invalid_response", "egress_refused", "other"]);
    expect(CAS.map(([, nom]) => nom)).toEqual(CLASSES_ERREUR_STRIPE);
  });

  it.each(CAS)("création et relecture : %o levée → résultat fermé, une ligne `payment.provider_failed` (%s), aucune sentinelle", async (Classe, nom, retryable) => {
    for (const methode of ["creerSession", "adresseSession"] as const) {
      const double = creerDoubleStripe({ erreur: () => erreurPiegee(Classe as unknown as new (raw: Record<string, unknown>) => Error) });
      const client = creerClientSessionsStripe(cleDeTest(), configuration(double));
      const { valeur, lignes } = await capturer<unknown>(() =>
        methode === "creerSession" ? client.creerSession(PAIEMENT, `checkout:${PAIEMENT.id}`) : client.adresseSession("cs_test_abc", PAIEMENT),
      );
      expect(valeur).toStrictEqual({ ok: false, code: "provider_error", retryable });
      expect(lignes).toHaveLength(1);
      const ligne = JSON.parse(lignes[0] ?? "{}") as Record<string, unknown>;
      expect(ligne).toEqual({ level: "warn", event: "payment.provider_failed", errorClass: nom, ...(ligne.ts === undefined ? {} : { ts: ligne.ts }) });
      for (const texte of [...lignes, JSON.stringify(valeur), String(valeur)]) expect(texte).not.toContain(SENTINELLE);
    }
  });

  it("une erreur qui n'est pas une classe nommée (Error, chaîne, objet imitant le nom) → `other`, non réessayable", async () => {
    const imitation = Object.assign(new Error(SENTINELLE), { name: "StripeConnectionError", type: "StripeConnectionError" });
    for (const erreur of [new Error(SENTINELLE), SENTINELLE, { message: SENTINELLE }, imitation]) {
      const client = creerClientSessionsStripe(cleDeTest(), configuration(creerDoubleStripe({ erreur: () => erreur })));
      const { valeur, lignes } = await capturer(() => client.creerSession(PAIEMENT, `checkout:${PAIEMENT.id}`));
      expect(valeur).toStrictEqual({ ok: false, code: "provider_error", retryable: false });
      expect(lignes.map((l) => (JSON.parse(l) as { errorClass: string }).errorClass)).toEqual(["other"]);
      expect(lignes.join("\n")).not.toContain(SENTINELLE);
    }
  });

  it("réponse sans `url`, avec un `url` hors liste ou un identifiant d'une autre forme → `invalid_response`, non réessayable", async () => {
    const reponses = [
      (s: object) => ({ ...s, url: undefined }),
      (s: object) => ({ ...s, url: "https://evil.example/x" }),
      (s: object) => ({ ...s, url: `${ORIGINE_PRESTATAIRE}:443/c/pay/x` }),
      (s: object) => ({ ...s, id: "cs_live_abc" }),
      () => "texte",
    ];
    for (const reponse of reponses) {
      const client = creerClientSessionsStripe(cleDeTest(), configuration(creerDoubleStripe({ reponse })));
      const { valeur, lignes } = await capturer(() => client.creerSession(PAIEMENT, `checkout:${PAIEMENT.id}`));
      expect(valeur).toStrictEqual({ ok: false, code: "provider_error", retryable: false });
      expect(lignes.map((l) => (JSON.parse(l) as { errorClass: string }).errorClass)).toEqual(["invalid_response"]);
    }
  });

  it("refus de la barrière de sortie → `egress_refused`, non réessayable, aucun client construit, aucun appel au double", async () => {
    const double = creerDoubleStripe();
    const fabrique = vi.fn(double.fabrique);
    const prestataire = prestataireStripe({ lireCle: () => ({ ok: false, code: "egress_refused" }), adressesRetour: RETOUR, moyens: ["twint", "card"], fabriqueClient: fabrique });
    for (const appel of [() => prestataire.creerSession(PAIEMENT, `checkout:${PAIEMENT.id}`), () => prestataire.adresseSession("cs_test_abc", PAIEMENT)]) {
      const { valeur, lignes } = await capturer<unknown>(appel);
      expect(valeur).toStrictEqual({ ok: false, code: "provider_error", retryable: false });
      expect(lignes.map((l) => (JSON.parse(l) as { errorClass: string }).errorClass)).toEqual(["egress_refused"]);
    }
    expect(fabrique).not.toHaveBeenCalled();
    expect(double.appels).toEqual([]);
    const { lignes } = await capturer(() =>
      prestataireStripe({ lireCle: () => ({ ok: false, code: "key_invalid" }), adressesRetour: RETOUR, moyens: ["twint"], fabriqueClient: fabrique }).creerSession(PAIEMENT, "k"),
    );
    expect(lignes.map((l) => (JSON.parse(l) as { errorClass: string }).errorClass)).toEqual(["other"]);
  });

  it("la clé est relue à chaque appel (aucun client gardé)", async () => {
    const double = creerDoubleStripe();
    const lireCle = vi.fn(() => ({ ok: true as const, cle: cleDeTest() }));
    const prestataire = prestataireStripe({ lireCle, adressesRetour: RETOUR, moyens: ["twint"], fabriqueClient: double.fabrique });
    await prestataire.creerSession(PAIEMENT, `checkout:${PAIEMENT.id}`);
    await prestataire.creerSession(PAIEMENT, `checkout:${PAIEMENT.id}`);
    expect(lireCle).toHaveBeenCalledTimes(2);
    expect(new Set(double.appels.map((a) => a.cle)).size).toBe(2);
  });

  it("vérification : l'erreur levée par la bibliothèque (en-tête et corps reçus) n'est ni rendue ni journalisée", async () => {
    const corps = `{"id":"evt_${SENTINELLE.replace(/_/g, "")}"}`;
    const { valeur, lignes } = await capturer(async () => verifierEvenementStripe(Buffer.from(corps), `t=1,v1=${SENTINELLE}`, secretWebhookDeTest(), 1000));
    expect(valeur).toBe(false);
    expect(lignes).toEqual([]);
  });
});

describe("paiement: 409 d'idempotence sur le client réel du SDK (PR 878, revue de la PR 867, mineur 4)", () => {
  /**
   * Transport HTTP de test : le client **réel** du SDK (options de l'application, `maxNetworkRetries: 1`) lui envoie ses
   * requêtes au lieu du réseau ; chaque appel rend la réponse fixée. Aucun appel réseau, clé de test tirée au hasard.
   */
  function transport(statut: number, corps: unknown, entetes: Record<string, string> = {}) {
    const requetes: { methode: string; chemin: string; cleIdempotence: unknown }[] = [];
    const client = {
      getClientName: () => "transport-de-test",
      makeRequest: async (_hote: string, _port: string, chemin: string, methode: string, enTetes: Record<string, unknown>) => {
        requetes.push({ methode, chemin, cleIdempotence: enTetes["Idempotency-Key"] });
        return {
          getStatusCode: () => statut,
          getHeaders: () => ({ "request-id": "req_test", ...entetes }),
          getRawResponse: () => undefined,
          toStream: () => undefined,
          toJSON: async () => corps,
        };
      },
    };
    return { requetes, client: client as unknown as TransportHttpStripe };
  }
  const configurationSdk = (t: ReturnType<typeof transport>) => ({ adressesRetour: RETOUR, moyens: ["twint"] as const, fabriqueClient: fabriqueClientSdk(t.client) });
  const CONFLIT = { error: { type: "invalid_request_error", code: "idempotency_key_in_use", message: "Requête concurrente sous la même clé." } };

  it("409 : relancé une fois sous la même clé d'idempotence, puis `StripeAPIError`, `retryable: true`", async () => {
    const t = transport(409, CONFLIT);
    const { valeur, lignes } = await capturer(() => creerClientSessionsStripe(cleDeTest(), configurationSdk(t)).creerSession(PAIEMENT, `checkout:${PAIEMENT.id}`));
    expect(valeur).toStrictEqual({ ok: false, code: "provider_error", retryable: true });
    expect(lignes.map((l) => (JSON.parse(l) as { errorClass: string }).errorClass)).toEqual(["StripeAPIError"]);
    expect(t.requetes).toHaveLength(2);
    expect(t.requetes.map((r) => [r.methode, r.chemin, r.cleIdempotence])).toEqual([
      ["POST", "/v1/checkout/sessions", `checkout:${PAIEMENT.id}`],
      ["POST", "/v1/checkout/sessions", `checkout:${PAIEMENT.id}`],
    ]);
  });

  it("409 de `type` `idempotency_error` : même classe (`StripeAPIError`) ; avec `stripe-should-retry: false`, aucune relance", async () => {
    const t = transport(409, { error: { type: "idempotency_error", message: "x" } }, { "stripe-should-retry": "false" });
    const { valeur, lignes } = await capturer(() => creerClientSessionsStripe(cleDeTest(), configurationSdk(t)).creerSession(PAIEMENT, `checkout:${PAIEMENT.id}`));
    expect(valeur).toStrictEqual({ ok: false, code: "provider_error", retryable: true });
    expect(lignes.map((l) => (JSON.parse(l) as { errorClass: string }).errorClass)).toEqual(["StripeAPIError"]);
    expect(t.requetes).toHaveLength(1);
  });

  it("400 de `type` `idempotency_error` (autres paramètres sous la même clé) : `StripeIdempotencyError`, `retryable: false`, sans relance", async () => {
    const t = transport(400, { error: { type: "idempotency_error", message: "x" } });
    const { valeur, lignes } = await capturer(() => creerClientSessionsStripe(cleDeTest(), configurationSdk(t)).creerSession(PAIEMENT, `checkout:${PAIEMENT.id}`));
    expect(valeur).toStrictEqual({ ok: false, code: "provider_error", retryable: false });
    expect(lignes.map((l) => (JSON.parse(l) as { errorClass: string }).errorClass)).toEqual(["StripeIdempotencyError"]);
    expect(t.requetes).toHaveLength(1);
  });
});

describe("paiement: constructEvent accepte une signature de signer", () => {
  const MAINTENANT_S = 1_800_000_000;
  /** Clé de signature en octets ASCII 0x21-0x7e : la chaîne passée à la bibliothèque et les octets de `signer` sont égaux. */
  const cleAscii = () => Buffer.from(Array.from(randomBytes(48), (o) => 0x21 + (o % 94)));

  it("signature de `signer` (webhook simulé) acceptée par `constructEvent` avec la même clé ; chaîne et octets égaux", () => {
    const octets = cleAscii();
    const chaine = octets.toString("latin1");
    expect(Buffer.from(chaine, "utf8").equals(octets)).toBe(true);
    const corps = Buffer.from(JSON.stringify({ id: "evt_1", type: "checkout.session.completed", livemode: false }));
    const entete = signer(corps, octets, MAINTENANT_S);
    expect(verifierEvenementStripe(corps, entete, chaine, MAINTENANT_S * 1000)).toBe(true);
    // Et réciproquement : la fonction de test de la bibliothèque produit le même en-tête.
    expect(signerStripe(corps.toString("utf8"), chaine, MAINTENANT_S)).toBe(entete);
    // Un octet de plus dans le corps : refus.
    expect(verifierEvenementStripe(Buffer.concat([corps, Buffer.from(" ")]), entete, chaine, MAINTENANT_S * 1000)).toBe(false);
  });

  it("en-tête à deux `v1`, l'un faux et l'autre bon → accepté ; seulement un `v0` valide → refusé", () => {
    const secret = secretWebhookDeTest();
    const corps = '{"id":"evt_2"}';
    const bon = signerStripe(corps, secret, MAINTENANT_S).split("v1=")[1] ?? "";
    const octets = Buffer.from(corps);
    expect(verifierEvenementStripe(octets, `t=${MAINTENANT_S},v1=${"0".repeat(64)},v1=${bon}`, secret, MAINTENANT_S * 1000)).toBe(true);
    expect(verifierEvenementStripe(octets, `t=${MAINTENANT_S},v1=${bon},v1=${"0".repeat(64)}`, secret, MAINTENANT_S * 1000)).toBe(true);
    expect(verifierEvenementStripe(octets, signerStripe(corps, secret, MAINTENANT_S, "v0"), secret, MAINTENANT_S * 1000)).toBe(false);
    expect(verifierEvenementStripe(octets, `t=${MAINTENANT_S},v0=${bon}`, secret, MAINTENANT_S * 1000)).toBe(false);
  });

  it("en-tête absent, vide ou de plus de 512 caractères → refusé sans appel à `constructEvent`", () => {
    const espion = vi.spyOn(SDK.webhooks, "constructEvent");
    const secret = secretWebhookDeTest();
    const corps = '{"id":"evt_3"}';
    const valide = signerStripe(corps, secret, MAINTENANT_S);
    for (const entete of [null, "", `${valide},v1=${"0".repeat(512)}`]) expect(verifierEvenementStripe(Buffer.from(corps), entete, secret, MAINTENANT_S * 1000)).toBe(false);
    expect(espion).not.toHaveBeenCalled();
    expect(verifierEvenementStripe(Buffer.from(corps), valide, secret, MAINTENANT_S * 1000)).toBe(true);
    expect(espion).toHaveBeenCalledTimes(1);
    expect(espion.mock.calls[0]?.[3]).toBe(300);
    expect(espion.mock.calls[0]?.[5]).toBe(MAINTENANT_S * 1000);
  });

  it("version d'API de la bibliothèque épinglée (2026-09-30.endive, 0140 § 1.1)", () => {
    expect(SDK.apiVersion).toBe("2026-09-30.endive");
  });
});

describe("paiement: tolérance de la vérification Stripe", () => {
  const MAINTENANT_S = 1_800_000_000;
  const secret = secretWebhookDeTest();
  const corps = '{"id":"evt_4"}';
  const verifier = (decalage: number) => verifierEvenementStripe(Buffer.from(corps), signerStripe(corps, secret, MAINTENANT_S + decalage), secret, MAINTENANT_S * 1000);

  it("passé : −299 et −300 s acceptés, −301 s refusé (300 s passés explicitement, horloge par `receivedAt`)", () => {
    expect(verifier(-299)).toBe(true);
    expect(verifier(-300)).toBe(true);
    expect(verifier(-301)).toBe(false);
  });

  it("futur : +301 s accepté — épingle le comportement de stripe 23.0.0 (seul l'âge est comparé ; écart assumé, 0140 § 2.3)", () => {
    expect(verifier(301)).toBe(true);
    expect(verifier(3600)).toBe(true);
  });
});

// B4c (PR 863 ; décision 0140 § 8 point 1, critère C7) : réciprocité des formes.
describe("paiement: formes simulée et Stripe disjointes", () => {
  it("aucun identifiant n'est admis à la fois par formeSimulee et formeStripe ; chaque forme refuse l'autre", () => {
    const evenementsStripe = ["evt_1NG8Du2eZvKYlo2CUI79vXWy", "evt_a", `evt_${"A".repeat(255)}`];
    const sessionsStripe = ["cs_test_a1B2c3", `cs_test_${"z".repeat(255)}`];
    const evenementsSimules = [idEvenementSimule(crypto.randomUUID(), "succeeded"), idEvenementSimule(crypto.randomUUID(), "declined")];
    const sessionsSimulees = [idSessionSimulee(), idSessionSimulee()];
    const tous = [...evenementsStripe, ...evenementsSimules, "evt_", "evt_sim_", "evt_a-b", `evt_${"A".repeat(256)}`];
    const sessions = [undefined, ...sessionsStripe, ...sessionsSimulees, "cs_live_abc", "cs_test_", "cs_test_a_b"];
    for (const e of tous) for (const s of sessions) expect(formeSimulee(e, s) && formeStripe(e, s), `${e} ${String(s)}`).toBe(false);
    for (const e of evenementsStripe) {
      expect(formeStripe(e, undefined)).toBe(true);
      for (const s of sessionsStripe) expect(formeStripe(e, s)).toBe(true);
      for (const s of sessionsSimulees) expect(formeStripe(e, s)).toBe(false);
    }
    for (const e of evenementsSimules) {
      expect(formeStripe(e, undefined)).toBe(false);
      for (const s of sessionsSimulees) expect(formeSimulee(e, s)).toBe(true);
      for (const s of sessionsStripe) expect(formeSimulee(e, s)).toBe(false);
    }
    expect(formeStripe("evt_abc", "cs_live_abc")).toBe(false);
  });
});
