import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { AdapterContext } from "@/adapters/types";
import { recuStripeAdmis } from "@/contracts/values";
import type { DependancesPaiement } from "@/server/payment/dependances";
import { depuisIdentifiantPublic } from "@/server/payment/identifiant";

import { lienRecuDeTest, SDK, sessionPayeeDeTest, signerStripe } from "../support/stripe-evenements";
import { closeAll, connect, createOrg, inTx, type DbClient, type Org } from "./helpers";
import { contexte, creerBanc, creerBancStripe, fermerBase, nouveauVoyage, OFFRE, type BancStripe, type OptionsBancStripe } from "./paiement-banc";

/**
 * Reçu de Stripe en base (spécification B4, B4e ; décision 0144 § 5.3 points 2 à 7, § 5.4) : webhook Stripe de la
 * fabrique commune sur une fixture signée, **double du client** (aucun appel réseau : `fetch`, `http` et `https` échouent
 * et comptent), conservation du lien après la transaction qui accorde le droit, puis lecture par l'adaptateur `stripe`
 * (`getReceipt`, `listReceipts`) réservée à la personne qui a payé. Le lien n'est jamais journalisé.
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
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
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
  // Jamais le lien, sous aucune casse ni forme encodée, dans aucune ligne du journal (0144 § 5.3 point 5).
  expect(lignesJournal.join("\n")).not.toMatch(/stripe\.com|stripe%2ecom/i);
  vi.restoreAllMocks();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

const journal = () => lignesJournal.map((ligne) => JSON.parse(ligne) as Record<string, unknown>);
const indisponibles = () => journal().filter((ligne) => ligne.event === "payment.receipt_unavailable");

type Paiement = { publicId: string; uuid: string; session: string };

async function organisation(membres = 0): Promise<{ org: Org & { members: string[] }; tripId: string; ctx: AdapterContext }> {
  const org = await createOrg(auth, membres);
  return { org, tripId: await nouveauVoyage(app, org), ctx: contexte(org) };
}

async function commencer(banc: BancStripe, ctx: AdapterContext, tripId: string, method: "twint" | "card" = "card"): Promise<Paiement> {
  const depart = await banc.adapter.createCheckout(ctx, { tripId, method, requestId: randomUUID() });
  if (!depart.ok) throw new Error(`createCheckout : ${depart.error.code}`);
  const uuid = depuisIdentifiantPublic(depart.value.checkoutId) as string;
  const session = (await admin.query("SELECT stripe_checkout_session_id AS s FROM checkouts WHERE id = $1", [uuid])).rows[0]?.s as string;
  return { publicId: depart.value.checkoutId, uuid, session };
}

/** Événement de réussite signé, livré au webhook Stripe ; rend le statut HTTP. */
async function reussir(banc: BancStripe, p: Paiement, issue: "succeeded" = "succeeded"): Promise<number> {
  const corps = JSON.stringify(banc.evenementIssue({ checkoutId: p.uuid, sessionId: p.session, amount: OFFRE.amount, currency: OFFRE.currency }, issue));
  return banc.livrer(corps, signerStripe(corps, banc.secret, Math.floor(banc.maintenant() / 1000)));
}

const lien = async (p: Pick<Paiement, "uuid">): Promise<unknown> =>
  (await admin.query("SELECT stripe_receipt_url AS u FROM checkouts WHERE id = $1", [p.uuid])).rows[0]?.u;
const droits = async (tripId: string): Promise<number> => (await admin.query("SELECT count(*)::int AS n FROM entitlements WHERE trip_id = $1", [tripId])).rows[0]?.n as number;
const lecturesRecu = (banc: BancStripe) => banc.double.appels.filter((a) => a.methode === "recu");

function banc(options: OptionsBancStripe = {}) {
  return creerBancStripe(options);
}

describe("reçu Stripe : conservation par le webhook (B4e)", () => {
  it("le lien est conservé après l'octroi : une seule lecture développée (2 s, aucune relance), droit accordé, 200", async () => {
    const b = banc();
    const { ctx, tripId } = await organisation();
    const p = await commencer(b, ctx, tripId);
    expect(await reussir(b, p)).toBe(200);
    expect(await droits(tripId)).toBe(1);
    expect(await lien(p)).toBe(lienRecuDeTest(p.session));
    expect(recuStripeAdmis(await lien(p))).toBe(true);
    expect(lecturesRecu(b)).toEqual([
      { methode: "recu", cle: b.cle, id: p.session, expand: ["payment_intent.latest_charge"], options: { timeout: 2000, maxNetworkRetries: 0 } },
    ]);
    expect(indisponibles()).toEqual([]);
  });

  it("panne du prestataire (erreur du SDK, lien refusé, session non payée) : 200, droit accordé, colonne NULL, journal à code fixe", async () => {
    const cas: [NonNullable<OptionsBancStripe["double"]>["recu"], string][] = [
      [
        () => {
          throw new SDK.errors.StripeConnectionError({ message: "connexion" } as never);
        },
        "provider_error",
      ],
      [(s) => ({ ...sessionPayeeDeTest(s), payment_intent: { latest_charge: { receipt_url: "https://PAY.STRIPE.COM/receipts/x" } } }), "provider_error"],
      [(s) => ({ ...sessionPayeeDeTest(s), payment_status: "unpaid" }), "provider_error"],
    ];
    for (const [recu, reason] of cas) {
      const b = banc({ double: { recu } });
      const { ctx, tripId } = await organisation();
      const p = await commencer(b, ctx, tripId);
      lignesJournal = [];
      expect(await reussir(b, p)).toBe(200);
      expect(await droits(tripId)).toBe(1);
      expect(await lien(p)).toBeNull();
      expect(indisponibles()).toEqual([{ level: "warn", event: "payment.receipt_unavailable", eventId: expect.stringMatching(/^evt_/), reason }]);
      expect(journal().filter((l) => l.event === "payment.provider_failed")).toHaveLength(1);
      expect(lignesJournal.join("\n")).not.toContain(p.session);
    }
  });

  it("panne de la base pendant l'écriture du lien : 200, droit accordé, colonne NULL, `db_error`", async () => {
    const enPanne = (d: DependancesPaiement): DependancesPaiement => ({
      ...d,
      database: {
        ...d.database,
        transaction: async () => {
          throw new Error("base indisponible");
        },
      } as unknown as DependancesPaiement["database"],
    });
    const b = banc({ recu: { deps: enPanne } });
    const { ctx, tripId } = await organisation();
    const p = await commencer(b, ctx, tripId);
    expect(await reussir(b, p)).toBe(200);
    expect(await droits(tripId)).toBe(1);
    expect(await lien(p)).toBeNull();
    expect(indisponibles().map((l) => l.reason)).toEqual(["db_error"]);
  });

  it("durée totale dépassée (prestataire qui ne répond pas) : 200 sans attendre au-delà de la borne, droit accordé, colonne NULL, `timeout`", async () => {
    const b = banc({ double: { recu: () => new Promise(() => undefined) }, recu: { dureeMaxMs: 150 } });
    const { ctx, tripId } = await organisation();
    const p = await commencer(b, ctx, tripId);
    const debut = performance.now();
    expect(await reussir(b, p)).toBe(200);
    expect(performance.now() - debut).toBeLessThan(2_000);
    expect(await droits(tripId)).toBe(1);
    expect(await lien(p)).toBeNull();
    expect(indisponibles().map((l) => l.reason)).toEqual(["timeout"]);
  });

  it("rejeu de l'événement : colonne remplie → aucun second appel ; colonne NULL → un appel, puis le lien", async () => {
    const b = banc();
    const { ctx, tripId } = await organisation();
    const p = await commencer(b, ctx, tripId);
    expect(await reussir(b, p)).toBe(200);
    expect(await reussir(b, p)).toBe(200);
    expect(lecturesRecu(b)).toHaveLength(1);

    const b2 = banc({ double: { recu: () => Promise.reject(new SDK.errors.StripeAPIError({ message: "x" } as never)) } });
    const autre = await organisation();
    const q = await commencer(b2, autre.ctx, autre.tripId);
    expect(await reussir(b2, q)).toBe(200);
    expect(await lien(q)).toBeNull();
    b2.double.regler({});
    // Même événement relivré par Stripe : la colonne est encore NULL, un appel, le lien est écrit.
    expect(await reussir(b2, q)).toBe(200);
    expect(lecturesRecu(b2)).toHaveLength(2);
    expect(await lien(q)).toBe(lienRecuDeTest(q.session));
  });

  it("second paiement (`duplicate`) : aucun appel pour lui ; **rejeu d'un `duplicate` (déjà enregistré `alreadyGranted`) : aucun appel**", async () => {
    const b = banc();
    const { ctx, tripId } = await organisation();
    const p = await commencer(b, ctx, tripId);
    const second = await commencer(b, ctx, tripId, "twint");
    expect(await reussir(b, p)).toBe(200);
    expect(lecturesRecu(b)).toHaveLength(1);
    expect(await reussir(b, second)).toBe(200);
    expect((await admin.query("SELECT status FROM checkouts WHERE id = $1", [second.uuid])).rows[0]?.status).toBe("duplicate");
    expect(lecturesRecu(b)).toHaveLength(1);
    // Rejeu du même événement du second paiement (ligne `billing` `alreadyGranted` d'un autre paiement que le droit).
    expect(await reussir(b, second)).toBe(200);
    expect(lecturesRecu(b)).toHaveLength(1);
    expect(lecturesRecu(b).every((a) => a.id === p.session)).toBe(true);
    expect(await lien(second)).toBeNull();
    expect(await lien(p)).toBe(lienRecuDeTest(p.session));
  });

  it("événement sans droit (refus, expiration) : aucun appel", async () => {
    const b = banc();
    const { ctx, tripId } = await organisation();
    const p = await commencer(b, ctx, tripId);
    const corps = JSON.stringify(b.evenementIssue({ checkoutId: p.uuid, sessionId: p.session, amount: OFFRE.amount, currency: OFFRE.currency }, "declined"));
    expect(await b.livrer(corps, signerStripe(corps, b.secret, Math.floor(b.maintenant() / 1000)))).toBe(200);
    expect(lecturesRecu(b)).toEqual([]);
    expect(await lien(p)).toBeNull();
  });

  it("route simulée : aucune conservation (pas de `conserverRecu`), reçu maison inchangé", async () => {
    const b = creerBanc();
    const { ctx, tripId } = await organisation();
    const depart = await b.adapter.createCheckout(ctx, { tripId, method: "twint", requestId: randomUUID() });
    if (!depart.ok) throw new Error("createCheckout");
    expect((await b.adapter.simulateOutcome(ctx, depart.value.checkoutId, "succeeded")).ok).toBe(true);
    expect(await lien({ uuid: depuisIdentifiantPublic(depart.value.checkoutId) as string })).toBeNull();
    expect(indisponibles()).toEqual([]);
    expect((await b.adapter.getReceipt(ctx, tripId)).ok && (await b.adapter.getReceipt(ctx, tripId))).toMatchObject({ value: { kind: "simulated" } });
  });
});

describe("reçu Stripe : lecture par l'adaptateur stripe (B4e ; 0144 § 2 point 4, § 5.3 point 7)", () => {
  it("lien rendu à la seule personne `created_by` ; autre membre de l'organisation, autre organisation : aucun reçu", async () => {
    const b = banc();
    const { ctx, tripId, org } = await organisation(1);
    const membre: AdapterContext = { organizationId: ctx.organizationId, userId: org.members[0] as string, role: "member" };
    const autreOrg = contexte(await createOrg(auth));
    const p = await commencer(b, ctx, tripId);
    expect(await b.adapter.getReceipt(ctx, tripId)).toEqual({ ok: false, error: { code: "not_found" } });
    expect(await reussir(b, p)).toBe(200);
    const recu = await b.adapter.getReceipt(ctx, tripId);
    expect(recu).toEqual({
      ok: true,
      value: { kind: "stripe", checkoutId: p.publicId, tripId, method: "card", amount: OFFRE.amount, currency: OFFRE.currency, paidAt: expect.any(String), url: lienRecuDeTest(p.session) },
    });
    expect(await b.adapter.listReceipts(ctx)).toEqual({ ok: true, value: [recu.ok ? recu.value : null] });
    for (const lecteur of [membre, autreOrg]) {
      expect(await b.adapter.getReceipt(lecteur, tripId)).toEqual({ ok: false, error: { code: "not_found" } });
      expect(await b.adapter.listReceipts(lecteur)).toEqual({ ok: true, value: [] });
    }
    // L'autre organisation ne lit ni n'écrit la colonne (RLS).
    const vue = await inTx(app, { org: autreOrg.organizationId, user: autreOrg.userId }, async (c) => (await c.query("SELECT stripe_receipt_url FROM checkouts WHERE id = $1", [p.uuid])).rows);
    expect(vue).toEqual([]);
  });

  it("paiement Stripe dont la colonne est NULL (appel échoué) : aucun reçu, aucun lien", async () => {
    const b = banc({ double: { recu: () => Promise.reject(new SDK.errors.StripeAPIError({ message: "x" } as never)) } });
    const { ctx, tripId } = await organisation();
    const p = await commencer(b, ctx, tripId);
    expect(await reussir(b, p)).toBe(200);
    expect(await b.adapter.getEntitlement(ctx, tripId)).toEqual({ unlocked: true });
    expect(await b.adapter.getReceipt(ctx, tripId)).toEqual({ ok: false, error: { code: "not_found" } });
    expect(await b.adapter.listReceipts(ctx)).toEqual({ ok: true, value: [] });
  });

  it("adaptateur simulé : reçu maison même si un lien était présent (forme `simulated`, sans lien)", async () => {
    const b = banc();
    const { ctx, tripId } = await organisation();
    const p = await commencer(b, ctx, tripId);
    expect(await reussir(b, p)).toBe(200);
    const simule = creerBanc();
    const recu = await simule.adapter.getReceipt(ctx, tripId);
    expect(recu).toMatchObject({ ok: true, value: { kind: "simulated" } });
    expect(JSON.stringify(recu)).not.toContain("pay.stripe.com");
  });
});
