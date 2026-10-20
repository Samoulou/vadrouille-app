import { randomBytes, randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createSimulatedPaymentAdapter } from "@/adapters/simulated-payment";
import type { AdapterContext } from "@/adapters/types";
import type { CheckoutOutcome } from "@/contracts/values";
import { depuisIdentifiantPublic } from "@/server/payment/identifiant";
import { evenementSimule } from "@/server/payment/simulated-provider";
import { ENTETE_SIGNATURE, signer } from "@/server/payment/signature";

import { closeAll, connect, createOrg, expectRefused, inTx, type DbClient, type Org } from "./helpers";
import { contexte, creerBanc, fermerBase, nouveauVoyage, OFFRE, URL_WEBHOOK, type Banc } from "./paiement-banc";

/**
 * Paiement simulé en base (spécification B4, B4a ; critères A1 à A9, A11 à A17, A19, A22 et A25 ; décisions 0097
 * B4-TL-1 à B4-TL-13). Cas d'usage sur `vadrouille_app`, webhook simulé appelé directement (transport de test, A22) ;
 * clé de signature tirée au hasard par banc. Les lectures de contrôle passent par `vadrouille_app` avec le contexte de
 * l'organisation (RLS), ou par l'administration pour un décompte global (A9).
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

// --- A22 : aucun appel réseau sortant ; A19 : sortie du journal capturée ------------------------------------------

/** Doubles qui échouent et comptent : `fetch` global et modules `http`/`https` (section 4 du régime, forme 1). */
const { reseau, echoue } = vi.hoisted(() => {
  const etat = { appels: [] as string[] };
  return {
    reseau: etat,
    echoue: (nom: string) => () => {
      etat.appels.push(nom);
      throw new Error(`${nom} appelé pendant un test de base`);
    },
  };
});
vi.mock("node:http", () => ({ request: echoue("http.request"), get: echoue("http.get"), Agent: class {} }));
vi.mock("node:https", () => ({ request: echoue("https.request"), get: echoue("https.get"), Agent: class {} }));
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

/** Lignes `payment.alert` écrites pendant le test, analysées. */
const alertes = () =>
  lignesJournal
    .map((ligne) => JSON.parse(ligne) as Record<string, unknown>)
    .filter((ligne) => ligne.event === "payment.alert");

// --- Outils -------------------------------------------------------------------------------------------------------

type Paiement = { publicId: string; uuid: string; session: string };

async function organisation(membres = 0): Promise<{ org: Org & { members: string[] }; tripId: string; ctx: AdapterContext }> {
  const org = await createOrg(auth, membres);
  return { org, tripId: await nouveauVoyage(app, org), ctx: contexte(org) };
}

async function commencer(banc: Banc, ctx: AdapterContext, tripId: string, method: "twint" | "card" = "twint"): Promise<Paiement> {
  const depart = await banc.adapter.createCheckout(ctx, { tripId, method, requestId: randomUUID() });
  if (!depart.ok) throw new Error(`createCheckout : ${depart.error.code}`);
  const uuid = depuisIdentifiantPublic(depart.value.checkoutId) as string;
  const session = await ligne(ctx, "SELECT stripe_checkout_session_id AS s FROM checkouts WHERE id = $1", [uuid]);
  return { publicId: depart.value.checkoutId, uuid, session: String(session?.s) };
}

async function lignes(ctx: AdapterContext, sql: string, valeurs: unknown[] = []): Promise<Record<string, unknown>[]> {
  return inTx(app, { org: ctx.organizationId, user: ctx.userId }, async (c) => (await c.query(sql, valeurs)).rows);
}
const ligne = async (ctx: AdapterContext, sql: string, valeurs: unknown[] = []) => (await lignes(ctx, sql, valeurs))[0];

async function etat(ctx: AdapterContext, p: Paiement, tripId: string) {
  const checkout = await ligne(ctx, "SELECT status, amount_cents, currency FROM checkouts WHERE id = $1", [p.uuid]);
  const billing = await lignes(ctx, "SELECT outcome, outcome_code, type FROM billing WHERE checkout_id = $1 ORDER BY received_at, id", [p.uuid]);
  const droits = await lignes(ctx, "SELECT id::text AS id, billing_id::text AS billing_id FROM entitlements WHERE trip_id = $1", [tripId]);
  return { status: checkout?.status, billing, droits };
}

/** Événement simulé de l'issue pour le paiement, modifiable champ par champ. */
function evenement(banc: Banc, p: Paiement, issue: CheckoutOutcome, objet: Record<string, unknown> = {}, racine: Record<string, unknown> = {}) {
  const brut = evenementSimule({ checkoutId: p.uuid, sessionId: p.session, amount: OFFRE.amount, currency: OFFRE.currency }, issue, Math.floor(banc.maintenant() / 1000));
  const data = brut.data as { object: Record<string, unknown> };
  return { ...brut, ...racine, data: { object: { ...data.object, ...objet } } };
}

/** Signe et livre `corps` au webhook du banc (horodatage décalé de `decalage` secondes, clé au choix). */
async function livrer(banc: Banc, objet: unknown, options: { decalage?: number; cle?: Buffer; entete?: string | null; corps?: Buffer } = {}) {
  const corps = options.corps ?? Buffer.from(JSON.stringify(objet), "utf8");
  const signature = signer(Buffer.from(JSON.stringify(objet), "utf8"), options.cle ?? banc.cle, Math.floor(banc.maintenant() / 1000) + (options.decalage ?? 0));
  const entetes: Record<string, string> = { "content-type": "application/json" };
  const entete = options.entete === undefined ? signature : options.entete;
  if (entete !== null) entetes[ENTETE_SIGNATURE] = entete;
  const reponse = await banc.webhook(new Request(URL_WEBHOOK, { method: "POST", body: new Uint8Array(corps), headers: entetes }));
  return { status: reponse.status, corps: await reponse.text() };
}

const RECU = JSON.stringify({ received: true });

// --- Critères -----------------------------------------------------------------------------------------------------

describe("paiement simulé en base (B4a)", () => {
  it("paiement: un événement rejoué ne crédite pas deux fois (A1)", async () => {
    const suite = vi.fn(async () => undefined);
    const banc = creerBanc({ suite });
    const { ctx, tripId } = await organisation();
    const p = await commencer(banc, ctx, tripId);
    const objet = evenement(banc, p, "succeeded");
    const premiere = await livrer(banc, objet);
    const [deux, trois] = await Promise.all([livrer(banc, objet), livrer(banc, objet)]);
    for (const r of [premiere, deux, trois]) expect(r).toEqual({ status: 200, corps: RECU });
    const { status, billing, droits } = await etat(ctx, p, tripId);
    expect(status).toBe("succeeded");
    expect(billing).toEqual([{ outcome: "granted", outcome_code: null, type: "checkoutCompleted" }]);
    expect(droits).toHaveLength(1);
    expect(suite).toHaveBeenCalledTimes(3);
    for (const [droit] of suite.mock.calls as unknown as [{ entitlementId: string; tripId: string; organizationId: string }][]) {
      expect(droit).toEqual({ entitlementId: droits[0]?.id, tripId, organizationId: ctx.organizationId });
    }
  });

  it("paiement: signature invalide refusée sans écriture (A2)", async () => {
    const banc = creerBanc();
    const { ctx, tripId, org } = await organisation();
    const p = await commencer(banc, ctx, tripId);
    const objet = evenement(banc, p, "succeeded");
    const modifie = Buffer.from(JSON.stringify(objet), "utf8");
    modifie[modifie.length - 2] = modifie[modifie.length - 2] === 0x31 ? 0x32 : 0x31;
    const cas = [
      await livrer(banc, objet, { entete: null }),
      await livrer(banc, objet, { entete: `t=${Math.floor(banc.maintenant() / 1000)},v1=${"0".repeat(64)}` }),
      await livrer(banc, objet, { cle: randomBytes(32) }),
      await livrer(banc, objet, { corps: modifie }),
    ];
    for (const r of cas) expect(r).toEqual({ status: 400, corps: JSON.stringify({ error: "invalid_request" }) });
    expect(await etat(ctx, p, tripId)).toEqual({ status: "pending", billing: [], droits: [] });
    expect(lignesJournal.join("\n")).not.toContain(org.email);
  });

  it("paiement: horodatage de signature hors tolérance refusé sans écriture (A3)", async () => {
    const banc = creerBanc();
    const { ctx, tripId } = await organisation();
    const p = await commencer(banc, ctx, tripId);
    const objet = evenement(banc, p, "succeeded");
    for (const decalage of [-301, 301]) expect((await livrer(banc, objet, { decalage })).status).toBe(400);
    expect(await etat(ctx, p, tripId)).toEqual({ status: "pending", billing: [], droits: [] });
    expect((await livrer(banc, objet, { decalage: -299 })).status).toBe(200);
    expect((await etat(ctx, p, tripId)).droits).toHaveLength(1);
  });

  it("paiement: le droit n'est accordé que par le webhook (A4)", async () => {
    const interceptees: { corps: Uint8Array; entetes: Readonly<Record<string, string>> }[] = [];
    const banc = creerBanc({
      transport: () => async (requete) => {
        interceptees.push(requete);
        return 200;
      },
    });
    const { ctx, tripId } = await organisation();
    const p = await commencer(banc, ctx, tripId);
    const statut = await banc.adapter.simulateOutcome(ctx, p.publicId, "succeeded");
    expect(statut.ok && statut.value.status).toBe("pending");
    expect(await banc.adapter.getEntitlement(ctx, tripId)).toEqual({ unlocked: false });
    expect(await etat(ctx, p, tripId)).toEqual({ status: "pending", billing: [], droits: [] });
    expect(interceptees).toHaveLength(1);
    // `vadrouille_app` ne peut pas écrire de droit (rappel de B1).
    await inTx(app, { org: ctx.organizationId, user: ctx.userId }, (c) =>
      expectRefused(c, "INSERT INTO entitlements (organization_id, trip_id, kind) VALUES ($1, $2, 'tripUnlocked')", [ctx.organizationId, tripId]),
    );
    // La même issue livrée au webhook accorde le droit.
    const [requete] = interceptees;
    const reponse = await banc.webhook(new Request(URL_WEBHOOK, { method: "POST", body: new Uint8Array(requete?.corps ?? []), headers: { ...requete?.entetes } }));
    expect(reponse.status).toBe(200);
    expect(await banc.adapter.getEntitlement(ctx, tripId)).toEqual({ unlocked: true });
  });

  it("paiement: prix lu dans la configuration (A5)", async () => {
    const banc = creerBanc();
    const { ctx, tripId } = await organisation();
    expect(await banc.adapter.createCheckout(ctx, { tripId, method: "twint", requestId: randomUUID(), amount: 1 } as never)).toEqual({
      ok: false,
      error: { code: "validation_failed" },
    });
    expect(await lignes(ctx, "SELECT 1 FROM checkouts WHERE trip_id = $1", [tripId])).toHaveLength(0);
    const p = await commencer(banc, ctx, tripId);
    expect(await ligne(ctx, "SELECT amount_cents, currency, price_variant FROM checkouts WHERE id = $1", [p.uuid])).toEqual({
      amount_cents: 3900,
      currency: "CHF",
      price_variant: "chf_29",
    });
    // Configuration changée après la création : l'instantané et le contrôle du montant n'en dépendent pas.
    const change = createSimulatedPaymentAdapter({ ...banc.deps, offre: { ...OFFRE, amount: 4900 }, prestataire: banc.prestataire });
    const statut = await change.simulateOutcome(ctx, p.publicId, "succeeded");
    expect(statut.ok && statut.value).toMatchObject({ status: "succeeded", amount: 3900 });
  });

  describe("paiement: statut, montant, devise, mode ou voyage incohérents n'accordent rien (A6)", () => {
    const CAS: [string, (banc: Banc, p: Paiement, autre: Paiement) => unknown][] = [
      ["livemode", (banc, p) => evenement(banc, p, "succeeded", {}, { livemode: true })],
      ["payment_status", (banc, p) => evenement(banc, p, "succeeded", { payment_status: "no_payment_required" })],
      ["amount_mismatch", (banc, p) => evenement(banc, p, "succeeded", { amount_total: 3901 })],
      ["currency_mismatch", (banc, p) => evenement(banc, p, "succeeded", { currency: "eur" })],
      ["checkout_mismatch", (banc, p, autre) => evenement(banc, p, "succeeded", { metadata: { checkoutId: autre.uuid } })],
      ["checkout_mismatch", (banc, p) => evenement(banc, p, "succeeded", { metadata: {} })],
    ];
    it.each(CAS)("%s → ligne rejected avec son code, aucun droit, 200, une alerte", async (code, fabriquer) => {
      const banc = creerBanc();
      const { ctx, tripId, org } = await organisation();
      const p = await commencer(banc, ctx, tripId);
      const autre = await commencer(banc, ctx, tripId, "card");
      expect(await livrer(banc, fabriquer(banc, p, autre))).toEqual({ status: 200, corps: RECU });
      const { status, billing, droits } = await etat(ctx, p, tripId);
      expect({ status, billing, droits }).toEqual({ status: "pending", billing: [{ outcome: "rejected", outcome_code: code, type: "checkoutCompleted" }], droits: [] });
      expect(alertes()).toEqual([expect.objectContaining({ level: "error", alertCode: code, checkoutId: p.uuid, eventType: "checkoutCompleted" })]);
      expect(lignesJournal.join("\n")).not.toContain(org.email);
      expect(lignesJournal.join("\n")).not.toContain(p.session);
    });

    it("session_mismatch : session d'un autre paiement du même voyage (métadonnée du premier)", async () => {
      const banc = creerBanc();
      const { ctx, tripId } = await organisation();
      const p = await commencer(banc, ctx, tripId);
      const autre = await commencer(banc, ctx, tripId, "card");
      expect((await livrer(banc, evenement(banc, autre, "succeeded", { metadata: { checkoutId: p.uuid } }))).status).toBe(200);
      expect((await etat(ctx, autre, tripId)).billing).toEqual([{ outcome: "rejected", outcome_code: "checkout_mismatch", type: "checkoutCompleted" }]);
      expect((await etat(ctx, p, tripId)).billing).toEqual([]);
    });

    it("trip_mismatch : voyage invisible dans l'organisation du paiement → rejected", async () => {
      // Le voyage est rattaché à l'organisation par RLS ; on rend le voyage invisible en le supprimant côté administration.
      const banc = creerBanc();
      const { ctx, tripId } = await organisation();
      const p = await commencer(banc, ctx, tripId);
      await admin.query("BEGIN");
      await admin.query("SET LOCAL session_replication_role = replica");
      await admin.query("UPDATE trips SET organization_id = (SELECT organization_id FROM memberships WHERE user_id <> $2 LIMIT 1) WHERE id = $1", [tripId, ctx.userId]);
      await admin.query("COMMIT");
      expect((await livrer(banc, evenement(banc, p, "succeeded"))).status).toBe(200);
      const billing = await lignes(ctx, "SELECT outcome, outcome_code FROM billing WHERE checkout_id = $1", [p.uuid]);
      expect(billing).toEqual([{ outcome: "rejected", outcome_code: "trip_mismatch" }]);
      expect(alertes()).toEqual([expect.objectContaining({ alertCode: "trip_mismatch" })]);
    });

    it("la devise `chf` est acceptée pour `CHF`", async () => {
      const banc = creerBanc();
      const { ctx, tripId } = await organisation();
      const p = await commencer(banc, ctx, tripId);
      expect((await livrer(banc, evenement(banc, p, "succeeded", { currency: "chf" }))).status).toBe(200);
      expect((await etat(ctx, p, tripId)).droits).toHaveLength(1);
      expect(alertes()).toEqual([]);
    });
  });

  it("paiement: une panne entre l'enregistrement et le droit ne perd pas le paiement (A7)", async () => {
    let panne = true;
    const banc = creerBanc({
      apresEnregistrement: () => {
        if (panne) throw new Error("panne injectée");
      },
    });
    const { ctx, tripId } = await organisation();
    const p = await commencer(banc, ctx, tripId);
    const objet = evenement(banc, p, "succeeded");
    expect(await livrer(banc, objet)).toEqual({ status: 500, corps: JSON.stringify({ error: "server_error" }) });
    expect(await etat(ctx, p, tripId)).toEqual({ status: "pending", billing: [], droits: [] });
    panne = false;
    expect((await livrer(banc, objet)).status).toBe(200);
    const { status, billing, droits } = await etat(ctx, p, tripId);
    expect({ status, n: billing.length, d: droits.length }).toEqual({ status: "succeeded", n: 1, d: 1 });
  });

  it("paiement: un événement déjà enregistré relance la suite manquante (A8, option B)", async () => {
    let echec = true;
    const suite = vi.fn(async () => {
      if (echec) throw new TypeError("suite en échec");
    });
    const banc = creerBanc({ suite });
    const { ctx, tripId } = await organisation();
    const p = await commencer(banc, ctx, tripId);
    const second = await commencer(banc, ctx, tripId, "card");
    const objet = evenement(banc, p, "succeeded");
    expect((await livrer(banc, objet)).status).toBe(200);
    expect(suite).toHaveBeenCalledTimes(4);
    const suivies = lignesJournal.map((l) => JSON.parse(l) as Record<string, unknown>).filter((l) => l.event === "payment.followup_failed");
    expect(suivies).toEqual([{ level: "warn", event: "payment.followup_failed", errorName: "TypeError" }]);
    const avant = await etat(ctx, p, tripId);
    expect(avant.billing).toEqual([{ outcome: "granted", outcome_code: null, type: "checkoutCompleted" }]);
    echec = false;
    suite.mockClear();
    expect((await livrer(banc, objet)).status).toBe(200);
    expect(await etat(ctx, p, tripId)).toEqual(avant);
    expect(suite).toHaveBeenCalledWith({ entitlementId: avant.droits[0]?.id, tripId, organizationId: ctx.organizationId });
    // Même chose pour un événement `alreadyGranted`.
    echec = true;
    const doublon = evenement(banc, second, "succeeded");
    expect((await livrer(banc, doublon)).status).toBe(200);
    echec = false;
    suite.mockClear();
    const avantDoublon = await etat(ctx, second, tripId);
    expect(avantDoublon.billing).toEqual([{ outcome: "alreadyGranted", outcome_code: null, type: "checkoutCompleted" }]);
    expect((await livrer(banc, doublon)).status).toBe(200);
    expect(await etat(ctx, second, tripId)).toEqual(avantDoublon);
    expect(suite).toHaveBeenCalledTimes(1);
    expect(suite).toHaveBeenCalledWith({ entitlementId: avant.droits[0]?.id, tripId, organizationId: ctx.organizationId });
  });

  it("paiement: un événement d'une session inconnue n'écrit rien, n'accorde rien et alerte (A9)", async () => {
    const banc = creerBanc();
    const eventId = `evt_sim_${randomBytes(16).toString("hex")}`;
    const objet = {
      id: eventId,
      type: "checkout.session.completed",
      livemode: false,
      created: Math.floor(banc.maintenant() / 1000),
      data: { object: { id: `cs_sim_${randomBytes(16).toString("base64url")}`, payment_status: "paid", amount_total: 3900, currency: "chf", metadata: { checkoutId: randomUUID() } } },
    };
    const avant = (await admin.query("SELECT (SELECT count(*) FROM billing)::int AS b, (SELECT count(*) FROM entitlements)::int AS e, (SELECT count(*) FROM checkouts)::int AS c")).rows[0];
    expect(await livrer(banc, objet)).toEqual({ status: 200, corps: RECU });
    const apres = (await admin.query("SELECT (SELECT count(*) FROM billing)::int AS b, (SELECT count(*) FROM entitlements)::int AS e, (SELECT count(*) FROM checkouts)::int AS c")).rows[0];
    expect(apres).toEqual(avant);
    expect((await admin.query("SELECT 1 FROM billing WHERE stripe_event_id = $1", [eventId])).rows).toHaveLength(0);
    expect(alertes()).toEqual([{ level: "error", event: "payment.alert", eventId, eventType: "checkoutCompleted", alertCode: "unknown_checkout" }]);
  });

  it("paiement: un second paiement du même voyage n'accorde pas de second droit (A11)", async () => {
    const banc = creerBanc();
    const { ctx, tripId } = await organisation();
    const p = await commencer(banc, ctx, tripId);
    const second = await commencer(banc, ctx, tripId, "card");
    expect((await livrer(banc, evenement(banc, p, "succeeded"))).status).toBe(200);
    expect((await livrer(banc, evenement(banc, second, "succeeded"))).status).toBe(200);
    expect((await etat(ctx, second, tripId)).status).toBe("duplicate");
    expect((await etat(ctx, second, tripId)).billing).toEqual([{ outcome: "alreadyGranted", outcome_code: null, type: "checkoutCompleted" }]);
    expect((await etat(ctx, p, tripId)).droits).toHaveLength(1);
    expect(alertes()).toEqual([expect.objectContaining({ alertCode: "duplicate_payment", checkoutId: second.uuid })]);
    const n = (await lignes(ctx, "SELECT 1 FROM checkouts WHERE trip_id = $1", [tripId])).length;
    expect(await banc.adapter.createCheckout(ctx, { tripId, method: "twint", requestId: randomUUID() })).toEqual({ ok: false, error: { code: "already_unlocked" } });
    expect(await lignes(ctx, "SELECT 1 FROM checkouts WHERE trip_id = $1", [tripId])).toHaveLength(n);
  });

  it("paiement: deux réussites simultanées n'accordent qu'un droit (A12)", async () => {
    const banc = creerBanc();
    const { ctx, tripId } = await organisation();
    const p = await commencer(banc, ctx, tripId);
    const second = await commencer(banc, ctx, tripId, "card");
    const reponses = await Promise.all([livrer(banc, evenement(banc, p, "succeeded")), livrer(banc, evenement(banc, second, "succeeded"))]);
    expect(reponses.map((r) => r.status)).toEqual([200, 200]);
    const issues = (await lignes(ctx, "SELECT outcome FROM billing WHERE checkout_id = ANY($1::uuid[])", [[p.uuid, second.uuid]])).map((r) => r.outcome).sort();
    expect(issues).toEqual(["alreadyGranted", "granted"]);
    expect((await etat(ctx, p, tripId)).droits).toHaveLength(1);
  });

  describe("paiement: statuts tirés des événements (A13)", () => {
    it("checkoutCompleted non payé : pending, ignored ; reste pending après la durée de vie", async () => {
      const banc = creerBanc();
      const { ctx, tripId } = await organisation();
      const p = await commencer(banc, ctx, tripId);
      expect((await livrer(banc, evenement(banc, p, "succeeded", { payment_status: "unpaid" }))).status).toBe(200);
      expect(await etat(ctx, p, tripId)).toEqual({ status: "pending", billing: [{ outcome: "ignored", outcome_code: null, type: "checkoutCompleted" }], droits: [] });
      banc.avancer(31 * 60_000);
      const lu = await banc.adapter.getCheckoutStatus(ctx, p.publicId);
      expect(lu.ok && lu.value.status).toBe("pending");
      // Puis la réussite asynchrone accorde le droit.
      expect((await livrer(banc, evenement(banc, p, "succeeded", {}, { id: `evt_sim_${randomBytes(16).toString("hex")}`, type: "checkout.session.async_payment_succeeded" }))).status).toBe(200);
      expect((await etat(ctx, p, tripId)).status).toBe("succeeded");
      expect(alertes()).toEqual([]);
    });

    it("asyncPaymentFailed : declined, ignored", async () => {
      const banc = creerBanc();
      const { ctx, tripId } = await organisation();
      const p = await commencer(banc, ctx, tripId);
      expect((await livrer(banc, evenement(banc, p, "declined"))).status).toBe(200);
      expect(await etat(ctx, p, tripId)).toEqual({ status: "declined", billing: [{ outcome: "ignored", outcome_code: null, type: "asyncPaymentFailed" }], droits: [] });
    });

    it("checkoutExpired avant la durée de vie : cancelled ; après : expired", async () => {
      const banc = creerBanc();
      const { ctx, tripId } = await organisation();
      const avant = await commencer(banc, ctx, tripId);
      expect((await livrer(banc, evenement(banc, avant, "cancelled"))).status).toBe(200);
      expect((await etat(ctx, avant, tripId)).status).toBe("cancelled");
      const apres = await commencer(banc, ctx, tripId);
      banc.avancer(30 * 60_000 + 1000);
      expect((await livrer(banc, evenement(banc, apres, "cancelled"))).status).toBe(200);
      expect(await etat(ctx, apres, tripId)).toEqual({ status: "expired", billing: [{ outcome: "ignored", outcome_code: null, type: "checkoutExpired" }], droits: [] });
    });

    it("pending après la durée de vie : lu expired, sans écriture", async () => {
      const banc = creerBanc();
      const { ctx, tripId } = await organisation();
      const p = await commencer(banc, ctx, tripId);
      banc.avancer(30 * 60_000 + 1000);
      const lu = await banc.adapter.getCheckoutStatus(ctx, p.publicId);
      expect(lu.ok && lu.value.status).toBe("expired");
      expect((await etat(ctx, p, tripId)).status).toBe("pending");
    });

    it("refund, dispute, other : statut inchangé, ignored ; alerte pour refund et dispute", async () => {
      const banc = creerBanc();
      const { ctx, tripId } = await organisation();
      const p = await commencer(banc, ctx, tripId);
      for (const type of ["checkout.session.inconnu"]) {
        expect((await livrer(banc, evenement(banc, p, "succeeded", {}, { id: `evt_sim_${randomBytes(16).toString("hex")}`, type }))).status).toBe(200);
      }
      expect(await etat(ctx, p, tripId)).toEqual({ status: "pending", billing: [{ outcome: "ignored", outcome_code: null, type: "other" }], droits: [] });
      // Remboursement et litige : sans session dans l'événement analysé, ils sont traités sans organisation (A9), avec leur alerte.
      for (const [type, code] of [
        ["charge.refunded", "refund"],
        ["charge.dispute.created", "dispute"],
      ] as const) {
        const objet = { id: `evt_sim_${randomBytes(16).toString("hex")}`, type, livemode: false, data: { object: { id: "ch_x" } } };
        expect((await livrer(banc, objet)).status).toBe(200);
        expect(alertes().at(-1)).toEqual(expect.objectContaining({ alertCode: code, eventType: code }));
      }
      expect((await etat(ctx, p, tripId)).status).toBe("pending");
    });
  });

  describe("paiement: un paiement encaissé n'est jamais perdu (A14)", () => {
    it.each(["cancelled", "declined"] as const)("réussite valide sur un paiement %s → droit, succeeded, alerte paid_after_failure", async (echec) => {
      const banc = creerBanc();
      const { ctx, tripId } = await organisation();
      const p = await commencer(banc, ctx, tripId);
      expect((await livrer(banc, evenement(banc, p, echec))).status).toBe(200);
      expect((await etat(ctx, p, tripId)).status).toBe(echec);
      expect((await livrer(banc, evenement(banc, p, "succeeded"))).status).toBe(200);
      const { status, droits } = await etat(ctx, p, tripId);
      expect({ status, d: droits.length }).toEqual({ status: "succeeded", d: 1 });
      expect(alertes()).toEqual([expect.objectContaining({ alertCode: "paid_after_failure", checkoutId: p.uuid })]);
    });

    it("réussite valide sur un paiement affiché expired → droit, succeeded, alerte paid_after_failure", async () => {
      const banc = creerBanc();
      const { ctx, tripId } = await organisation();
      const p = await commencer(banc, ctx, tripId);
      banc.avancer(30 * 60_000 + 1000);
      expect((await livrer(banc, evenement(banc, p, "succeeded"))).status).toBe(200);
      expect((await etat(ctx, p, tripId)).status).toBe("succeeded");
      expect(alertes()).toEqual([expect.objectContaining({ alertCode: "paid_after_failure" })]);
    });

    it("réussite valide sur un paiement declined d'un voyage déjà débloqué → duplicate, alreadyGranted, deux alertes", async () => {
      const banc = creerBanc();
      const { ctx, tripId } = await organisation();
      const p = await commencer(banc, ctx, tripId);
      const second = await commencer(banc, ctx, tripId, "card");
      await livrer(banc, evenement(banc, second, "declined"));
      await livrer(banc, evenement(banc, p, "succeeded"));
      expect((await livrer(banc, evenement(banc, second, "succeeded"))).status).toBe(200);
      expect((await etat(ctx, second, tripId)).status).toBe("duplicate");
      expect(alertes().map((a) => a.alertCode).sort()).toEqual(["duplicate_payment", "paid_after_failure"]);
    });
  });

  it("paiement: idempotence de startCheckout (A15)", async () => {
    const banc = creerBanc();
    const { ctx, tripId } = await organisation();
    const autreVoyage = await nouveauVoyage(app, { org: ctx.organizationId, owner: ctx.userId, email: "" });
    const requestId = randomUUID();
    const premier = await banc.adapter.createCheckout(ctx, { tripId, method: "twint", requestId });
    expect(await banc.adapter.createCheckout(ctx, { tripId, method: "twint", requestId })).toEqual(premier);
    for (const demande of [
      { tripId: autreVoyage, method: "twint" as const, requestId },
      { tripId, method: "card" as const, requestId },
    ]) {
      expect(await banc.adapter.createCheckout(ctx, demande)).toEqual({ ok: false, error: { code: "validation_failed" } });
    }
    expect(await lignes(ctx, "SELECT 1 FROM checkouts WHERE request_id = $1", [requestId])).toHaveLength(1);
    expect(await lignes(ctx, "SELECT 1 FROM checkouts WHERE trip_id = $1", [autreVoyage])).toHaveLength(0);
  });

  it("paiement: isolation et lecture par la personne (A16, sans la partie « sans session » de B4b)", async () => {
    const banc = creerBanc();
    const { ctx, tripId, org } = await organisation(1);
    const p = await commencer(banc, ctx, tripId);
    const autreOrg = contexte(await createOrg(auth));
    const membre: AdapterContext = { organizationId: ctx.organizationId, userId: org.members[0] as string, role: "member" };
    for (const lecteur of [autreOrg, membre]) {
      expect(await banc.adapter.getCheckoutStatus(lecteur, p.publicId)).toEqual({ ok: false, error: { code: "not_found" } });
      expect(await banc.adapter.simulateOutcome(lecteur, p.publicId, "succeeded")).toEqual({ ok: false, error: { code: "not_found" } });
    }
    expect(banc.livraisons).toHaveLength(0);
    const n = (await lignes(ctx, "SELECT 1 FROM checkouts")).length;
    expect(await banc.adapter.createCheckout(membre, { tripId, method: "twint", requestId: randomUUID() })).toEqual({ ok: false, error: { code: "not_found" } });
    expect(await lignes(ctx, "SELECT 1 FROM checkouts")).toHaveLength(n);
    expect((await banc.adapter.simulateOutcome(ctx, p.publicId, "succeeded")).ok).toBe(true);
    // Droit lu pour l'organisation entière ; pas pour une autre.
    expect(await banc.adapter.getEntitlement(membre, tripId)).toEqual({ unlocked: true });
    expect(await banc.adapter.getEntitlement(autreOrg, tripId)).toEqual({ unlocked: false });
  });

  it("paiement: le webhook simulé refuse un identifiant non simulé (A17)", async () => {
    const banc = creerBanc();
    const { ctx, tripId } = await organisation();
    // Session connue mais sans la forme simulée (écrite par un prestataire de test) : provider_mismatch.
    const sessionStripe = `cs_test_${randomBytes(16).toString("hex")}`;
    const autrePrestataire = createSimulatedPaymentAdapter({ ...banc.deps, prestataire: { ...banc.prestataire, creerSession: async () => sessionStripe } });
    const depart = await autrePrestataire.createCheckout(ctx, { tripId, method: "twint", requestId: randomUUID() });
    if (!depart.ok) throw new Error(depart.error.code);
    const p: Paiement = { publicId: depart.value.checkoutId, uuid: depuisIdentifiantPublic(depart.value.checkoutId) as string, session: sessionStripe };
    expect((await livrer(banc, evenement(banc, p, "succeeded"))).status).toBe(200);
    expect((await etat(ctx, p, tripId)).billing).toEqual([{ outcome: "rejected", outcome_code: "provider_mismatch", type: "checkoutCompleted" }]);
    // Identifiant d'événement non simulé sur une session simulée connue : provider_mismatch aussi.
    const simule = await commencer(banc, ctx, tripId, "card");
    expect((await livrer(banc, evenement(banc, simule, "succeeded", {}, { id: `evt_${randomBytes(12).toString("hex")}` }))).status).toBe(200);
    expect((await etat(ctx, simule, tripId)).billing).toEqual([{ outcome: "rejected", outcome_code: "provider_mismatch", type: "checkoutCompleted" }]);
    // Session non simulée inconnue : traitée comme une session inconnue (A9).
    const inconnu = { ...evenement(banc, simule, "succeeded", { id: `cs_test_${randomBytes(16).toString("hex")}` }), id: `evt_sim_${randomBytes(16).toString("hex")}` };
    expect((await livrer(banc, inconnu)).status).toBe(200);
    expect((await etat(ctx, simule, tripId)).billing).toHaveLength(1);
    expect(alertes().map((a) => a.alertCode)).toEqual(["provider_mismatch", "provider_mismatch", "unknown_checkout"]);
    expect(await banc.adapter.getEntitlement(ctx, tripId)).toEqual({ unlocked: false });
  });

  it("paiement: aucune donnée personnelle dans les alertes ni les journaux (A19)", async () => {
    const banc = creerBanc();
    const { ctx, tripId, org } = await organisation();
    const p = await commencer(banc, ctx, tripId);
    const second = await commencer(banc, ctx, tripId, "card");
    const objet = evenement(banc, p, "succeeded", { customer_details: { email: org.email }, amount_total: 1 });
    await livrer(banc, objet);
    await livrer(banc, evenement(banc, p, "succeeded"));
    await livrer(banc, evenement(banc, second, "succeeded"));
    await livrer(banc, evenement(banc, p, "succeeded"), { entete: "t=1,v1=00" });
    expect(lignesJournal.length).toBeGreaterThan(0);
    const sortie = lignesJournal.join("\n");
    const signature = signer(Buffer.from(JSON.stringify(objet)), banc.cle, Math.floor(banc.maintenant() / 1000));
    for (const interdit of [org.email, p.session, second.session, banc.cle.toString("hex"), banc.cle.toString("base64"), banc.cle.toString("base64url"), signature, "127.0.0.1", "customer_details"]) {
      expect(sortie).not.toContain(interdit);
    }
    const champsAdmis = new Set(["level", "event", "eventId", "eventType", "alertCode", "checkoutId"]);
    for (const alerte of alertes()) expect(Object.keys(alerte).filter((champ) => !champsAdmis.has(champ))).toEqual([]);
  });

  it("paiement: rejouer une issue simulée réémet le même événement (A25)", async () => {
    const banc = creerBanc();
    const { ctx, tripId } = await organisation();
    const p = await commencer(banc, ctx, tripId);
    for (let i = 0; i < 2; i += 1) {
      const r = await banc.adapter.simulateOutcome(ctx, p.publicId, "succeeded");
      expect(r.ok && r.value.status).toBe("succeeded");
    }
    const ids = banc.livraisons.map((l) => (JSON.parse(l.corps) as { id: string }).id);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
    expect(banc.livraisons.map((l) => l.status)).toEqual([200, 200]);
    const { billing, droits } = await etat(ctx, p, tripId);
    expect({ b: billing.length, d: droits.length }).toEqual({ b: 1, d: 1 });

    // « Refuser » puis « Payer » : le prestataire ne signe que pour un paiement `pending` (B4-TL-3 point 3), donc
    // « Payer » ne réémet rien et le statut reste `declined` ; l'événement de réussite, s'il arrivait (ordre inhabituel),
    // a un autre identifiant et suit B4-PO-5 (droit et `paid_after_failure`, A14). Écart avec A25 signalé dans la PR.
    const banc2 = creerBanc();
    const autre = await organisation();
    const q = await commencer(banc2, autre.ctx, autre.tripId);
    const refus = await banc2.adapter.simulateOutcome(autre.ctx, q.publicId, "declined");
    expect(refus.ok && refus.value.status).toBe("declined");
    const paye = await banc2.adapter.simulateOutcome(autre.ctx, q.publicId, "succeeded");
    expect(paye.ok && paye.value.status).toBe("declined");
    expect(banc2.livraisons).toHaveLength(1);
    const reussite = evenementSimule({ checkoutId: q.uuid, sessionId: q.session, amount: OFFRE.amount, currency: OFFRE.currency }, "succeeded", 0);
    expect(reussite.id).not.toBe((JSON.parse(banc2.livraisons[0]?.corps ?? "{}") as { id: string }).id);
    // Rejouer le refus réémet le même événement de refus, sans nouvelle ligne.
    const rejeu = await banc2.adapter.simulateOutcome(autre.ctx, q.publicId, "declined");
    expect(rejeu.ok && rejeu.value.status).toBe("declined");
    expect(banc2.livraisons).toHaveLength(2);
    expect(banc2.livraisons[1]?.corps).toContain((JSON.parse(banc2.livraisons[0]?.corps ?? "{}") as { id: string }).id);
    expect((await etat(autre.ctx, q, autre.tripId)).billing).toHaveLength(1);
  });

  it("paiement: le défaut de checkouts.id est gen_random_uuid() (0097 B4-TL-1 point 4)", async () => {
    const { rows } = await admin.query("SELECT column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'checkouts' AND column_name = 'id'");
    expect(rows).toEqual([{ column_default: "gen_random_uuid()" }]);
  });

  it("paiement: une livraison en échec rend provider_error et laisse le paiement pending (B4-TL-3 point 2)", async () => {
    const banc = creerBanc({ transport: () => async () => 500 });
    const { ctx, tripId } = await organisation();
    const p = await commencer(banc, ctx, tripId);
    expect(await banc.adapter.simulateOutcome(ctx, p.publicId, "succeeded")).toEqual({ ok: false, error: { code: "provider_error", retryable: true } });
    expect(await etat(ctx, p, tripId)).toEqual({ status: "pending", billing: [], droits: [] });
  });
});
