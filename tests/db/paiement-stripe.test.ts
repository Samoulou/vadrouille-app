import { randomBytes, randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createStripePaymentAdapter } from "@/adapters/stripe-payment";
import type { AdapterContext } from "@/adapters/types";
import { adressePrestataireAdmise } from "@/contracts/billing";
import { depuisIdentifiantPublic } from "@/server/payment/identifiant";
import { cleIdempotenceSession, type PrestatairePaiement } from "@/server/payment/paiements";
import { EXPIRATION_SESSION_S } from "@/server/payment/stripe";

import { idEvenementStripe, idSessionStripe, secretWebhookDeTest, signerStripe } from "../support/stripe-evenements";
import { closeAll, connect, createOrg, inTx, type DbClient, type Org } from "./helpers";
import { APP_URL_BANC, contexte, creerBanc, creerBancStripe, fermerBase, nouveauVoyage, OFFRE, type BancStripe } from "./paiement-banc";

/**
 * Paiement Stripe en mode test, en base (spécification B4, B4c ; décision 0140 § 5, § 8 et § 9 ; critères C2, C3, C5,
 * C7, T6). Adaptateur `stripe` sur `vadrouille_app`, **double du client** (aucun appel réseau : `fetch`, `http` et
 * `https` échouent et comptent, A22 étendu), webhook Stripe de la fabrique commune, événements de la forme de Stripe
 * signés par la fonction de test de la bibliothèque (`tests/support/stripe-evenements.ts`) ; clé et secret de test tirés
 * au hasard par banc.
 */

let app: DbClient;
let auth: DbClient;
let admin: DbClient;

beforeAll(async () => {
  app = await connect("app");
  auth = await connect("auth");
  admin = await connect("admin");
});

afterAll(async () => {
  await fermerBase();
  await closeAll();
});

const { reseau, echoue, entetesRequete } = vi.hoisted(() => {
  const etat = { appels: [] as string[] };
  return {
    reseau: etat,
    echoue: (nom: string) => () => {
      etat.appels.push(nom);
      throw new Error(`${nom} appelé pendant un test de base`);
    },
    // C2 : en-têtes forgés d'une requête (jamais lus pour les adresses de retour).
    entetesRequete: { "host": "evil.example", "x-forwarded-host": "evil.example", "x-forwarded-proto": "http" },
  };
});
vi.mock("node:http", () => ({ request: echoue("http.request"), get: echoue("http.get"), Agent: class {} }));
vi.mock("node:https", () => ({ request: echoue("https.request"), get: echoue("https.get"), Agent: class {} }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(entetesRequete) }));
vi.stubGlobal("fetch", echoue("fetch"));

let lignesJournal: string[] = [];

beforeEach(() => {
  lignesJournal = [];
  for (const methode of ["log", "error", "warn", "info"] as const) {
    vi.spyOn(console, methode).mockImplementation((...args: unknown[]) => {
      lignesJournal.push(args.map(String).join(" "));
    });
  }
});

afterEach(() => {
  expect(reseau.appels).toEqual([]);
  vi.restoreAllMocks();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

const journal = () => lignesJournal.map((ligne) => JSON.parse(ligne) as Record<string, unknown>);
const alertes = () => journal().filter((ligne) => ligne.event === "payment.alert");
const RECU = JSON.stringify({ received: true });

type Paiement = { publicId: string; uuid: string; session: string };

async function organisation(): Promise<{ org: Org; tripId: string; ctx: AdapterContext }> {
  const org = await createOrg(auth);
  return { org, tripId: await nouveauVoyage(app, org), ctx: contexte(org) };
}

async function lignes(ctx: AdapterContext, sql: string, valeurs: unknown[] = []): Promise<Record<string, unknown>[]> {
  return inTx(app, { org: ctx.organizationId, user: ctx.userId }, async (c) => (await c.query(sql, valeurs)).rows);
}
const ligne = async (ctx: AdapterContext, sql: string, valeurs: unknown[] = []) => (await lignes(ctx, sql, valeurs))[0];

async function commencer(banc: BancStripe, ctx: AdapterContext, tripId: string, method: "twint" | "card" = "twint", requestId = randomUUID()): Promise<Paiement> {
  const depart = await banc.adapter.createCheckout(ctx, { tripId, method, requestId });
  if (!depart.ok) throw new Error(`createCheckout : ${depart.error.code}`);
  const uuid = depuisIdentifiantPublic(depart.value.checkoutId) as string;
  const session = await ligne(ctx, "SELECT stripe_checkout_session_id AS s FROM checkouts WHERE id = $1", [uuid]);
  return { publicId: depart.value.checkoutId, uuid, session: String(session?.s) };
}

async function etat(ctx: AdapterContext, p: Pick<Paiement, "uuid">, tripId: string) {
  const checkout = await ligne(ctx, "SELECT status FROM checkouts WHERE id = $1", [p.uuid]);
  const billing = await lignes(ctx, "SELECT outcome, outcome_code, type FROM billing WHERE checkout_id = $1 ORDER BY received_at, id", [p.uuid]);
  const droits = await lignes(ctx, "SELECT id FROM entitlements WHERE trip_id = $1", [tripId]);
  return { status: checkout?.status, billing, droits };
}

/** Événement Stripe de l'issue pour le paiement, modifiable champ par champ. */
function evenement(banc: BancStripe, p: Paiement, issue: "succeeded" | "declined" | "cancelled" = "succeeded", objet: Record<string, unknown> = {}, racine: Record<string, unknown> = {}) {
  const brut = banc.evenementIssue({ checkoutId: p.uuid, sessionId: p.session, amount: OFFRE.amount, currency: OFFRE.currency }, issue);
  const data = brut.data as { object: Record<string, unknown> };
  return { ...brut, ...racine, data: { object: { ...data.object, ...objet } } };
}

async function livrer(banc: BancStripe, objet: unknown, options: { decalage?: number; secret?: string; entete?: string } = {}) {
  const corps = JSON.stringify(objet);
  const secondes = Math.floor(banc.maintenant() / 1000) + (options.decalage ?? 0);
  const entete = options.entete ?? signerStripe(corps, options.secret ?? banc.secret, secondes);
  return { status: await banc.livrer(corps, entete), corps: RECU };
}

const nbLignes = async () =>
  (await admin.query("SELECT (SELECT count(*) FROM billing)::int AS b, (SELECT count(*) FROM entitlements)::int AS e, (SELECT count(*) FROM checkouts)::int AS c")).rows[0];

describe("paiement Stripe en base (B4c)", () => {
  it("paiement: paramètres de la session Stripe", async () => {
    const debut = Date.UTC(2026, 9, 29, 10, 0, 0, 400);
    const banc = creerBancStripe({ debut });
    const { ctx, tripId } = await organisation();
    const requestId = randomUUID();
    const p = await commencer(banc, ctx, tripId, "card", requestId);
    expect(banc.double.appels).toHaveLength(1);
    const [appel] = banc.double.appels;
    if (appel?.methode !== "create") throw new Error("création attendue");
    expect(appel.cle).toBe(banc.cle);
    expect(appel.idempotencyKey).toBe(cleIdempotenceSession(p.uuid));
    expect(appel.params).toEqual({
      mode: "payment",
      line_items: [{ price_data: { currency: "chf", unit_amount: OFFRE.amount, product_data: { name: "Déblocage du voyage" } }, quantity: 1 }],
      payment_method_types: ["twint", "card"],
      metadata: { checkoutId: p.uuid },
      success_url: `${APP_URL_BANC}/voyages/${tripId}/debloquer/confirmation?paiement=${p.publicId}`,
      cancel_url: `${APP_URL_BANC}/voyages/${tripId}/debloquer?paiement=${p.publicId}`,
      expires_at: Math.ceil(debut / 1000) + 1920,
    });
    expect(EXPIRATION_SESSION_S).toBe(1920);
    for (const champ of ["customer", "customer_email", "client_reference_id"]) expect(appel.params).not.toHaveProperty(champ);
    // Aucune donnée de la personne : ni courriel, ni identifiant de personne ou d'organisation.
    const texte = JSON.stringify(appel.params);
    for (const valeur of [ctx.userId, ctx.organizationId, "@"]) expect(texte).not.toContain(valeur);
    // Session écrite une fois ; redirectUrl jamais stocké.
    expect(p.session).toBe(banc.double.sessionDe(p.uuid)?.id);
  });

  it("paiement: adresses de retour construites depuis APP_URL", async () => {
    const banc = creerBancStripe();
    const { ctx, tripId } = await organisation();
    const p = await commencer(banc, ctx, tripId);
    const params = banc.double.sessionDe(p.uuid)?.params;
    for (const adresse of [params?.success_url, params?.cancel_url]) {
      expect(new URL(String(adresse)).origin).toBe(APP_URL_BANC);
      expect(String(adresse)).not.toContain(entetesRequete.host);
    }
    expect(lignesJournal.join("\n")).not.toContain(entetesRequete.host);
  });

  it("paiement (stripe): signature invalide refusée sans écriture", async () => {
    const banc = creerBancStripe();
    const { ctx, tripId } = await organisation();
    const p = await commencer(banc, ctx, tripId);
    const objet = evenement(banc, p);
    const corps = JSON.stringify(objet);
    const s = Math.floor(banc.maintenant() / 1000);
    const valide = signerStripe(corps, banc.secret, s);
    const cas = [
      await livrer(banc, objet, { secret: secretWebhookDeTest() }),
      await livrer(banc, objet, { entete: `t=${s},v1=${"0".repeat(64)}` }),
      await livrer(banc, objet, { entete: valide.replace("v1=", "v0=") }),
      { status: await banc.livrer(corps.replace("checkout.session.completed", "checkout.session.completeD"), valide), corps: RECU },
    ];
    for (const r of cas) expect(r.status).toBe(400);
    expect(await etat(ctx, p, tripId)).toEqual({ status: "pending", billing: [], droits: [] });
  });

  it("paiement (stripe): horodatage hors tolérance refusé", async () => {
    const banc = creerBancStripe();
    const { ctx, tripId } = await organisation();
    const p = await commencer(banc, ctx, tripId);
    const objet = evenement(banc, p);
    expect((await livrer(banc, objet, { decalage: -301 })).status).toBe(400);
    expect(await etat(ctx, p, tripId)).toEqual({ status: "pending", billing: [], droits: [] });
    expect((await livrer(banc, objet, { decalage: -299 })).status).toBe(200);
    expect((await etat(ctx, p, tripId)).droits).toHaveLength(1);
  });

  describe("paiement (stripe): contrôles incohérents n'accordent rien", () => {
    const CAS: [string, (banc: BancStripe, p: Paiement, autre: Paiement) => unknown][] = [
      ["livemode", (banc, p) => evenement(banc, p, "succeeded", {}, { livemode: true })],
      ["payment_status", (banc, p) => evenement(banc, p, "succeeded", { payment_status: "no_payment_required" })],
      ["amount_mismatch", (banc, p) => evenement(banc, p, "succeeded", { amount_total: OFFRE.amount + 1 })],
      ["currency_mismatch", (banc, p) => evenement(banc, p, "succeeded", { currency: "eur" })],
      ["checkout_mismatch", (banc, p, autre) => evenement(banc, p, "succeeded", { metadata: { checkoutId: autre.uuid } })],
    ];
    it.each(CAS)("%s → ligne rejected avec son code, aucun droit, 200, une alerte", async (code, fabriquer) => {
      const banc = creerBancStripe();
      const { ctx, tripId } = await organisation();
      const p = await commencer(banc, ctx, tripId);
      const autre = await commencer(banc, ctx, tripId, "card");
      expect((await livrer(banc, fabriquer(banc, p, autre))).status).toBe(200);
      expect(await etat(ctx, p, tripId)).toEqual({ status: "pending", billing: [{ outcome: "rejected", outcome_code: code, type: "checkoutCompleted" }], droits: [] });
      expect(alertes()).toEqual([expect.objectContaining({ level: "error", alertCode: code, checkoutId: p.uuid })]);
      expect(lignesJournal.join("\n")).not.toContain(p.session);
    });
  });

  it("paiement (stripe): une panne entre l'enregistrement et le droit ne perd pas le paiement", async () => {
    let panne = true;
    const banc = creerBancStripe({
      apresEnregistrement: () => {
        if (panne) throw new Error("panne injectée");
      },
    });
    const { ctx, tripId } = await organisation();
    const p = await commencer(banc, ctx, tripId);
    const objet = evenement(banc, p);
    expect((await livrer(banc, objet)).status).toBe(500);
    expect(await etat(ctx, p, tripId)).toEqual({ status: "pending", billing: [], droits: [] });
    panne = false;
    expect((await livrer(banc, objet)).status).toBe(200);
    const { status, billing, droits } = await etat(ctx, p, tripId);
    expect({ status, n: billing.length, d: droits.length }).toEqual({ status: "succeeded", n: 1, d: 1 });
  });

  it("paiement (stripe): session inconnue", async () => {
    const banc = creerBancStripe();
    const eventId = idEvenementStripe(randomUUID(), "succeeded");
    const objet = {
      id: eventId,
      object: "event",
      type: "checkout.session.completed",
      livemode: false,
      created: Math.floor(banc.maintenant() / 1000),
      data: { object: { id: idSessionStripe(), payment_status: "paid", amount_total: OFFRE.amount, currency: "chf", metadata: { checkoutId: randomUUID() } } },
    };
    const avant = await nbLignes();
    expect((await livrer(banc, objet)).status).toBe(200);
    expect(await nbLignes()).toEqual(avant);
    expect(alertes()).toEqual([{ level: "error", event: "payment.alert", eventId, eventType: "checkoutCompleted", alertCode: "unknown_checkout" }]);
  });

  it("paiement (stripe): second paiement", async () => {
    const banc = creerBancStripe();
    const { ctx, tripId } = await organisation();
    const p = await commencer(banc, ctx, tripId);
    const second = await commencer(banc, ctx, tripId, "card");
    expect((await livrer(banc, evenement(banc, p))).status).toBe(200);
    expect((await livrer(banc, evenement(banc, second))).status).toBe(200);
    expect((await etat(ctx, second, tripId)).status).toBe("duplicate");
    expect((await etat(ctx, second, tripId)).billing).toEqual([{ outcome: "alreadyGranted", outcome_code: null, type: "checkoutCompleted" }]);
    expect((await etat(ctx, p, tripId)).droits).toHaveLength(1);
    expect(alertes()).toEqual([expect.objectContaining({ alertCode: "duplicate_payment", checkoutId: second.uuid })]);
    expect(await banc.adapter.createCheckout(ctx, { tripId, method: "twint", requestId: randomUUID() })).toEqual({ ok: false, error: { code: "already_unlocked" } });
  });

  it("paiement (stripe): un événement rejoué ne crédite pas deux fois", async () => {
    const banc = creerBancStripe();
    const { ctx, tripId } = await organisation();
    const p = await commencer(banc, ctx, tripId);
    const objet = evenement(banc, p);
    const premiere = await livrer(banc, objet);
    const [deux, trois] = await Promise.all([livrer(banc, objet), livrer(banc, objet)]);
    for (const r of [premiere, deux, trois]) expect(r.status).toBe(200);
    const { status, billing, droits } = await etat(ctx, p, tripId);
    expect(status).toBe("succeeded");
    expect(billing).toEqual([{ outcome: "granted", outcome_code: null, type: "checkoutCompleted" }]);
    expect(droits).toHaveLength(1);
  });

  it("paiement (stripe): clé au préfixe de production → refus de démarrer (rappel tests/unit/server/env.test.ts) ; le banc n'emploie qu'une clé de test", () => {
    const banc = creerBancStripe();
    expect(banc.cle.startsWith(["sk", "test", ""].join("_"))).toBe(true);
  });
});

describe("paiement: le webhook Stripe refuse un identifiant simulé", () => {
  /** Paiement posé par le test avec une session simulée (`cs_sim_…`) : créé par l'adaptateur `simulated` sur la même base. */
  async function avecSessionSimulee() {
    const { ctx, tripId } = await organisation();
    const simule = creerBanc();
    const depart = await simule.adapter.createCheckout(ctx, { tripId, method: "twint", requestId: randomUUID() });
    if (!depart.ok) throw new Error("createCheckout simulé");
    const uuid = depuisIdentifiantPublic(depart.value.checkoutId) as string;
    const session = String((await ligne(ctx, "SELECT stripe_checkout_session_id AS s FROM checkouts WHERE id = $1", [uuid]))?.s);
    expect(session.startsWith("cs_sim_")).toBe(true);
    return { ctx, tripId, p: { publicId: depart.value.checkoutId, uuid, session } };
  }
  const evtSim = () => `evt_sim_${randomBytes(16).toString("hex")}`;

  it("(a) session cs_sim_ connue, événement evt_ valide → rejected/provider_mismatch, aucun droit, 200", async () => {
    const banc = creerBancStripe();
    const { ctx, tripId, p } = await avecSessionSimulee();
    expect((await livrer(banc, evenement(banc, p))).status).toBe(200);
    expect(await etat(ctx, p, tripId)).toEqual({ status: "pending", billing: [{ outcome: "rejected", outcome_code: "provider_mismatch", type: "checkoutCompleted" }], droits: [] });
    expect(alertes()).toEqual([expect.objectContaining({ alertCode: "provider_mismatch", checkoutId: p.uuid })]);
  });

  it("(b) même session, identifiant evt_sim_ → même résultat", async () => {
    const banc = creerBancStripe();
    const { ctx, tripId, p } = await avecSessionSimulee();
    expect((await livrer(banc, evenement(banc, p, "succeeded", {}, { id: evtSim() }))).status).toBe(200);
    expect(await etat(ctx, p, tripId)).toEqual({ status: "pending", billing: [{ outcome: "rejected", outcome_code: "provider_mismatch", type: "checkoutCompleted" }], droits: [] });
  });

  it("(c) session cs_test_ connue, identifiant evt_sim_ → provider_mismatch", async () => {
    const banc = creerBancStripe();
    const { ctx, tripId } = await organisation();
    const p = await commencer(banc, ctx, tripId);
    expect(p.session.startsWith("cs_test_")).toBe(true);
    expect((await livrer(banc, evenement(banc, p, "succeeded", {}, { id: evtSim() }))).status).toBe(200);
    expect(await etat(ctx, p, tripId)).toEqual({ status: "pending", billing: [{ outcome: "rejected", outcome_code: "provider_mismatch", type: "checkoutCompleted" }], droits: [] });
  });

  it("(d) session simulée inconnue → aucune ligne, alerte unknown_checkout, 200", async () => {
    const banc = creerBancStripe();
    const eventId = idEvenementStripe(randomUUID(), "succeeded");
    const objet = {
      id: eventId,
      object: "event",
      type: "checkout.session.completed",
      livemode: false,
      created: Math.floor(banc.maintenant() / 1000),
      data: { object: { id: `cs_sim_${randomBytes(16).toString("base64url")}`, payment_status: "paid", amount_total: OFFRE.amount, currency: "chf", metadata: { checkoutId: randomUUID() } } },
    };
    const avant = await nbLignes();
    expect((await livrer(banc, objet)).status).toBe(200);
    expect(await nbLignes()).toEqual(avant);
    expect(alertes()).toEqual([expect.objectContaining({ alertCode: "unknown_checkout", eventId })]);
  });
});

describe("paiement: la ligne checkouts précède l'appel à Stripe", () => {
  it("panne après l'appel au double et avant l'écriture de la session : la reprise par le même requestId recrée la même session (même clé), écrite une fois", async () => {
    const banc = creerBancStripe();
    let panne = true;
    const prestataire: PrestatairePaiement = {
      async creerSession(paiement, cle) {
        // La ligne `checkouts` est validée avant l'appel (lue hors de la transaction de l'adaptateur).
        expect((await admin.query("SELECT status, stripe_checkout_session_id AS s FROM checkouts WHERE id = $1", [paiement.id])).rows).toEqual([{ status: "pending", s: null }]);
        const resultat = await banc.prestataire.creerSession(paiement, cle);
        if (panne) throw new Error("panne injectée après l'appel");
        return resultat;
      },
      adresseSession: (id, paiement) => banc.prestataire.adresseSession(id, paiement),
    };
    const adapter = createStripePaymentAdapter({ ...banc.deps, prestataire });
    const { ctx, tripId } = await organisation();
    const requestId = randomUUID();
    expect(await adapter.createCheckout(ctx, { tripId, method: "twint", requestId })).toEqual({ ok: false, error: { code: "provider_error", retryable: true } });
    const [ligneEcrite] = await lignes(ctx, "SELECT id::text AS id, stripe_checkout_session_id AS s FROM checkouts WHERE request_id = $1", [requestId]);
    expect(ligneEcrite?.s).toBeNull();
    panne = false;
    banc.avancer(30_000);
    const reprise = await adapter.createCheckout(ctx, { tripId, method: "twint", requestId });
    expect(reprise.ok).toBe(true);
    const creations = banc.double.appels.filter((a) => a.methode === "create");
    expect(creations).toHaveLength(2);
    expect(new Set(creations.map((a) => (a.methode === "create" ? a.idempotencyKey : "")))).toEqual(new Set([cleIdempotenceSession(String(ligneEcrite?.id))]));
    expect(creations[0]?.methode === "create" && creations[1]?.methode === "create" && creations[0].params).toEqual(creations[1]?.methode === "create" && creations[1].params);
    expect(banc.double.sessions.size).toBe(1);
    const session = (await lignes(ctx, "SELECT stripe_checkout_session_id AS s FROM checkouts WHERE request_id = $1", [requestId]))[0]?.s;
    expect(session).toBe([...banc.double.sessions.keys()][0]);
    // Reprise suivante : session écrite → relecture de l'adresse, aucune nouvelle création (A15 sur `stripe`).
    const encore = await adapter.createCheckout(ctx, { tripId, method: "twint", requestId });
    expect(encore).toEqual(reprise);
    expect(banc.double.appels.filter((a) => a.methode === "create")).toHaveLength(2);
    expect(banc.double.appels.filter((a) => a.methode === "retrieve")).toHaveLength(1);
    if (reprise.ok) expect(adressePrestataireAdmise(reprise.value.redirectUrl)).toBe(true);
  });
});

describe("paiement: reprise sans session bornée à 120 s", () => {
  /** Adaptateur dont le prestataire échoue **avant** l'appel au double tant que `panne` est vrai. */
  async function bancAvecPanne() {
    const banc = creerBancStripe();
    const etat = { panne: true };
    const prestataire: PrestatairePaiement = {
      async creerSession(paiement, cle) {
        if (etat.panne) throw new Error("panne injectée avant l'appel");
        return banc.prestataire.creerSession(paiement, cle);
      },
      adresseSession: (id, paiement) => banc.prestataire.adresseSession(id, paiement),
    };
    const adapter = createStripePaymentAdapter({ ...banc.deps, prestataire });
    const { ctx, tripId } = await organisation();
    const requestId = randomUUID();
    const demande = { tripId, method: "twint" as const, requestId };
    expect(await adapter.createCheckout(ctx, demande)).toEqual({ ok: false, error: { code: "provider_error", retryable: true } });
    expect(banc.double.appels).toEqual([]);
    etat.panne = false;
    const uuid = String((await lignes(ctx, "SELECT id::text AS id FROM checkouts WHERE request_id = $1", [requestId]))[0]?.id);
    return { banc, adapter, ctx, demande, uuid };
  }

  it("reprise à 119 s de la création → appel au double avec la même clé et le même expires_at, session écrite", async () => {
    const { banc, adapter, ctx, demande, uuid } = await bancAvecPanne();
    const creation = banc.maintenant();
    banc.avancer(119_000);
    const reprise = await adapter.createCheckout(ctx, demande);
    expect(reprise.ok).toBe(true);
    const [appel] = banc.double.appels;
    expect(appel?.methode === "create" && { cle: appel.idempotencyKey, expires: appel.params.expires_at }).toEqual({ cle: cleIdempotenceSession(uuid), expires: Math.ceil(creation / 1000) + 1920 });
    expect((await lignes(ctx, "SELECT stripe_checkout_session_id AS s FROM checkouts WHERE id = $1", [uuid]))[0]?.s).toMatch(/^cs_test_/);
  });

  it.each([120_000, 121_000])("reprise à %i ms de la création → provider_error non réessayable, aucun appel au double, rien d'écrit", async (delai) => {
    const { banc, adapter, ctx, demande, uuid } = await bancAvecPanne();
    banc.avancer(delai);
    expect(await adapter.createCheckout(ctx, demande)).toEqual({ ok: false, error: { code: "provider_error", retryable: false } });
    expect(banc.double.appels).toEqual([]);
    expect((await lignes(ctx, "SELECT status, stripe_checkout_session_id AS s FROM checkouts WHERE id = $1", [uuid]))[0]).toEqual({ status: "pending", s: null });
  });

  it.each(["declined", "cancelled", "succeeded"])("ligne %s sans session → provider_error, aucun appel", async (statut) => {
    const { banc, adapter, ctx, demande, uuid } = await bancAvecPanne();
    await admin.query("UPDATE checkouts SET status = $1 WHERE id = $2", [statut, uuid]);
    banc.avancer(1_000);
    expect(await adapter.createCheckout(ctx, demande)).toEqual({ ok: false, error: { code: "provider_error", retryable: false } });
    expect(banc.double.appels).toEqual([]);
  });
});
