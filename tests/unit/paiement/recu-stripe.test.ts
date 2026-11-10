// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PaymentAdapter } from "@/adapters/types";
import { ReceiptSchema } from "@/contracts";
import { LONGUEUR_MAX_RECU, ORIGINES_RECU, recuStripeAdmis } from "@/contracts/values";
import { contientLienStripe, formatLogLine, LOG_EVENTS, LOG_RECEIPT_REASONS, ligneSansLienStripe } from "@/server/log";
import type { DependancesPaiement } from "@/server/payment/dependances";
import { creerConserverRecu, DUREE_MAX_RECU_MS, RAISONS_RECU } from "@/server/payment/recu-stripe";
import type { RecuAConserver } from "@/server/payment/webhook";

/**
 * Reçu de Stripe (spécification B4, B4e ; décision 0144 § 2 point 3, § 5.3 points 3 à 5, § 5.4) : revalidation
 * `recuStripeAdmis`, forme `stripe` de `ReceiptSchema`, journal à code fixe et contrôle global de `formatLogLine`,
 * conservation du lien après la transaction (durée totale, échéance, pannes avalées) sur une base factice. Aucun appel
 * réseau, aucune clé ; la base réelle est éprouvée par `tests/db/recu-stripe-webhook.test.ts`.
 */

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const LIEN = "https://pay.stripe.com/receipts/payment/CAcaFwoVYWNjdF8xVGVzdA";

describe("paiement: recuStripeAdmis (0144 § 5.3 point 3, mêmes cas que le CHECK de 0025)", () => {
  it("liste fermée d'une seule origine ; plafond de 2048 caractères", () => {
    expect(ORIGINES_RECU).toEqual(["https://pay.stripe.com"]);
    expect(LONGUEUR_MAX_RECU).toBe(2048);
  });

  it.each([
    LIEN,
    "https://pay.stripe.com/receipts/x",
    "https://pay.stripe.com/receipts/a.b~c_d-e%20f/g?h=i&j=k.l~m",
    "https://pay.stripe.com/receipts/x?",
  ])("admis : %s", (valeur) => {
    expect(recuStripeAdmis(valeur)).toBe(true);
  });

  it("admis jusqu'à 2048 caractères, refusé à 2049", () => {
    const base = "https://pay.stripe.com/receipts/";
    expect(recuStripeAdmis(base + "a".repeat(2048 - base.length))).toBe(true);
    expect(recuStripeAdmis(base + "a".repeat(2049 - base.length))).toBe(false);
  });

  it.each([
    "http://pay.stripe.com/receipts/x",
    "https://pay.stripe.com.example/receipts/x",
    "https://pay.stripe.com/receiptsx",
    "https://pay.stripe.com/receipts/",
    "https://PAY.STRIPE.COM/receipts/x",
    "HTTPS://pay.stripe.com/receipts/x",
    "https://pay.stripe.com/receipts/../x",
    "https://pay.stripe.com/receipts/%2e%2e/x",
    "https://pay.stripe.com/receipts/%2E%2E/x",
    "https://pay.stripe.com/receipts/.%2e/x",
    "https://pay.stripe.com/receipts/%2E./x",
    "javascript:alert(1)",
    "https://pay.stripe.com/receipts/a b",
    "https://pay.stripe.com/receipts/x#fragment",
    "https://pay.stripe.com/receipts/x\n",
    "https://u@pay.stripe.com/receipts/x",
    "https://u:p@pay.stripe.com/receipts/x",
    "https://pay.stripe.com:443/receipts/x",
    "https://pay.stripe.com:8443/receipts/x",
    "https://checkout.stripe.com/receipts/x",
    "https://evil.example/receipts/x",
    "//pay.stripe.com/receipts/x",
    "",
  ])("refusé : %j", (valeur) => {
    expect(recuStripeAdmis(valeur)).toBe(false);
  });

  it("refusé : valeur qui n'est pas une chaîne", () => {
    for (const valeur of [undefined, null, 1, {}, [LIEN], new URL(LIEN)]) expect(recuStripeAdmis(valeur)).toBe(false);
  });
});

describe("paiement: ReceiptSchema, union discriminée stricte (0144 § 2 point 3)", () => {
  const CHAMPS = {
    checkoutId: "nVpPQ49PSzmdDjwLT1srEQ",
    tripId: "3f0b1f0c-5d1e-4e0f-8a0c-1b2c3d4e5f60",
    method: "card",
    amount: 2900,
    currency: "CHF",
    paidAt: "2026-10-29T13:05:42.250Z",
  } as const;

  it("simulated sans lien, stripe avec lien admis", () => {
    expect(ReceiptSchema.safeParse({ kind: "simulated", ...CHAMPS }).success).toBe(true);
    expect(ReceiptSchema.safeParse({ kind: "stripe", ...CHAMPS, url: LIEN }).success).toBe(true);
  });

  it("refus : lien sur la forme simulée, forme stripe sans lien ou avec un lien refusé, champ libre, autre forme", () => {
    expect(ReceiptSchema.safeParse({ kind: "simulated", ...CHAMPS, url: LIEN }).success).toBe(false);
    expect(ReceiptSchema.safeParse({ kind: "stripe", ...CHAMPS }).success).toBe(false);
    expect(ReceiptSchema.safeParse({ kind: "stripe", ...CHAMPS, url: "https://evil.example/receipts/x" }).success).toBe(false);
    expect(ReceiptSchema.safeParse({ kind: "stripe", ...CHAMPS, url: "https://PAY.STRIPE.COM/receipts/x" }).success).toBe(false);
    expect(ReceiptSchema.safeParse({ kind: "stripe", ...CHAMPS, url: LIEN, receiptNumber: "1234" }).success).toBe(false);
    expect(ReceiptSchema.safeParse({ kind: "invoice", ...CHAMPS }).success).toBe(false);
  });

  it("le lien rendu est la valeur reçue, telle quelle (jamais décodée ni réécrite)", () => {
    const encode = "https://pay.stripe.com/receipts/a%20b";
    const lu = ReceiptSchema.parse({ kind: "stripe", ...CHAMPS, url: encode });
    expect(lu.kind === "stripe" ? lu.url : null).toBe(encode);
  });

  it("getReceipt et listReceipts sont obligatoires sur le port de paiement (0144 § 2 point 2)", () => {
    const sansRecu = { getOffer: vi.fn(), createCheckout: vi.fn(), getCheckoutStatus: vi.fn(), getEntitlement: vi.fn() };
    // @ts-expect-error -- `getReceipt` et `listReceipts` manquent : le type refuse l'adaptateur.
    const refuse: PaymentAdapter = sansRecu;
    // @ts-expect-error -- `listReceipts` manque.
    const refuseListe: PaymentAdapter = { ...sansRecu, getReceipt: vi.fn() };
    const admis: PaymentAdapter = { ...sansRecu, getReceipt: vi.fn(), listReceipts: vi.fn() };
    expect([refuse, refuseListe, admis]).toHaveLength(3);
  });
});

describe("paiement: journal du reçu et contrôle global (0144 § 5.3 points 4 et 5)", () => {
  const eventId = "evt_1NG8Du2eZvKYlo2CUI79vXWy";

  it("payment.receipt_unavailable : eventId et reason seulement, raisons fermées = RAISONS_RECU", () => {
    expect(LOG_EVENTS).toContain("payment.receipt_unavailable");
    expect([...LOG_RECEIPT_REASONS]).toEqual([...RAISONS_RECU]);
    for (const reason of RAISONS_RECU) {
      expect(JSON.parse(formatLogLine("payment.receipt_unavailable", { eventId, reason }, "warn"))).toEqual({ level: "warn", event: "payment.receipt_unavailable", eventId, reason });
    }
    const autres = { eventId, reason: "autre", code: "provider_error", checkoutId: "0b6f3c7e-6a1e-4c55-9f2d-3c1a2b4d5e6f", errorClass: "other", tripId: "0b6f3c7e-6a1e-4c55-9f2d-3c1a2b4d5e6f" };
    expect(JSON.parse(formatLogLine("payment.receipt_unavailable", autres as object, "warn"))).toEqual({ level: "warn", event: "payment.receipt_unavailable", eventId, dropped: 5 });
    // Une raison du reçu n'est admise sur aucun autre événement.
    expect(JSON.parse(formatLogLine("payment.provider_failed", { reason: "timeout" }, "warn"))).toEqual({ level: "warn", event: "payment.provider_failed", dropped: 1 });
  });

  it.each([
    "https://pay.stripe.com/receipts/x",
    "HTTPS://PAY.STRIPE.COM/receipts/x",
    "pay%2estripe%2ecom",
    "STRIPE%2ECOM",
    "api.stripe.com",
    "checkout.Stripe.Com/c/pay",
  ])("contrôle global : %s reconnu", (valeur) => {
    expect(contientLienStripe(valeur)).toBe(true);
    expect(contientLienStripe([1, valeur])).toBe(true);
    expect(contientLienStripe({ a: { b: [valeur] } })).toBe(true);
  });

  it("limite écrite : le double encodage (%252e) n'est pas reconnu ; texte légitime sans faux positif", () => {
    expect(contientLienStripe("stripe%252ecom")).toBe(false);
    for (const valeur of ["stripe", "stripe_event_id", "evt_1NG8Du2eZvKYlo2CUI79vXWy", "StripeAPIError", "payment.provider_failed", 42, null]) {
      expect(contientLienStripe(valeur)).toBe(false);
    }
  });

  it("dernier filet : une clé imbriquée portant le lien fait remplacer la ligne entière", () => {
    const ligne = JSON.stringify({ level: "warn", event: "payment.alert", eventId, detail: { "https://pay.stripe.com/receipts/x": 1 } });
    expect(JSON.parse(ligneSansLienStripe(ligne, "warn"))).toEqual({ level: "warn", event: "log.unknown_event", dropped: 1 });
    const saine = JSON.stringify({ level: "warn", event: "payment.alert", eventId });
    expect(ligneSansLienStripe(saine, "warn")).toBe(saine);
  });

  it("aucune ligne ne contient stripe.com, sous aucune casse ni forme %2e, quel que soit le champ passé", () => {
    const valeurs = ["https://pay.stripe.com/receipts/x", "HTTPS://PAY.STRIPE.COM/x", "pay%2estripe%2ecom", ["x", "STRIPE%2ECOM"], { u: "https://pay.stripe.com/receipts/x" }];
    const champs = ["reason", "eventId", "action", "errorName", "code", "checkoutId", "url", "detail"];
    for (const event of ["payment.receipt_unavailable", "payment.alert", "payment.provider_failed", "voyages.read_failed", "inconnu"]) {
      for (const champ of champs) {
        for (const valeur of valeurs) {
          const ligne = formatLogLine(event, { eventId, [champ]: valeur }, "warn");
          expect(ligne).not.toMatch(/stripe\.com|stripe%2ecom/i);
          expect(JSON.parse(ligne)).toHaveProperty("dropped");
        }
      }
    }
  });

  it("aucun faux positif sur les événements existants du paiement", () => {
    const checkoutId = "0b6f3c7e-6a1e-4c55-9f2d-3c1a2b4d5e6f";
    expect(JSON.parse(formatLogLine("payment.alert", { eventId, eventType: "checkoutCompleted", alertCode: "duplicate_payment", checkoutId }, "error"))).toEqual({
      level: "error",
      event: "payment.alert",
      eventId,
      eventType: "checkoutCompleted",
      alertCode: "duplicate_payment",
      checkoutId,
    });
    expect(JSON.parse(formatLogLine("payment.provider_failed", { errorClass: "StripeConnectionError" }, "warn"))).toEqual({
      level: "warn",
      event: "payment.provider_failed",
      errorClass: "StripeConnectionError",
    });
  });
});

describe("paiement: conservation du reçu, base factice (0144 § 5.3 point 4)", () => {
  /** Texte et paramètres d'une requête de `executeurSql` (morceaux de `drizzle-orm` : texte brut, paramètre, sous-requête). */
  type Morceau = { value?: unknown; encoder?: unknown; queryChunks?: Morceau[] };
  function rendreSql(requete: Morceau, params: unknown[] = []): { sql: string; params: unknown[] } {
    const texte = (requete.queryChunks ?? [])
      .map((morceau) => {
        if (morceau.queryChunks !== undefined) return rendreSql(morceau, params).sql;
        if (morceau.encoder !== undefined) {
          params.push(morceau.value);
          return `$${params.length}`;
        }
        return Array.isArray(morceau.value) ? morceau.value.join("") : "";
      })
      .join("");
    return { sql: texte, params };
  }
  const RECU: RecuAConserver = {
    checkoutId: "9d5a4f43-8f4f-4b39-9d0e-3c0b4f5b2a11",
    sessionId: "cs_test_a1B2c3D4e5F6g7H8i9J0k1L2",
    tripId: "3f0b1f0c-5d1e-4e0f-8a0c-1b2c3d4e5f60",
    organizationId: "6a0d2f1e-2b3c-4d5e-8f90-1a2b3c4d5e6f",
    eventId: "evt_1NG8Du2eZvKYlo2CUI79vXWy",
  };

  /** Base factice : requêtes rendues en texte ; `panne` fait lever l'`UPDATE`. */
  function baseFactice(options: { panne?: boolean } = {}) {
    const requetes: { texte: string; params: unknown[] }[] = [];
    let transactions = 0;
    const database = {
      async transaction(fn: (tx: unknown) => Promise<unknown>, config: unknown) {
        transactions += 1;
        expect(config).toEqual({ isolationLevel: "read committed" });
        return fn({
          async execute(requete: Morceau) {
            const { sql, params } = rendreSql(requete);
            requetes.push({ texte: sql, params });
            if (options.panne && sql.startsWith("UPDATE")) throw new Error(`panne ${LIEN}`);
            return { rows: [] };
          },
        });
      },
    };
    const deps = { database, withOrg: vi.fn(), maintenant: () => 0 } as unknown as DependancesPaiement;
    return { deps, requetes, transactions: () => transactions };
  }

  function capturer() {
    const lignes: string[] = [];
    for (const methode of ["log", "error", "warn", "info"] as const) vi.spyOn(console, methode).mockImplementation((...args: unknown[]) => void lignes.push(args.map(String).join(" ")));
    return lignes;
  }

  const prestataire = (resultat: () => Promise<unknown>) => {
    const adresseRecu = vi.fn(resultat as never);
    return { adresseRecu, fabrique: () => ({ adresseRecu }) as never };
  };

  it("durée totale de 3 s par défaut", () => {
    expect(DUREE_MAX_RECU_MS).toBe(3_000);
  });

  it("réussite : organisation positionnée, délais de la base, puis UPDATE unique ; aucune ligne de journal", async () => {
    const base = baseFactice();
    const p = prestataire(async () => ({ ok: true, value: LIEN }));
    const lignes = capturer();
    await creerConserverRecu(base.deps, { prestataire: p.fabrique })(RECU);
    expect(p.adresseRecu).toHaveBeenCalledWith(RECU.sessionId, { id: RECU.checkoutId, checkoutId: expect.stringMatching(/^[A-Za-z0-9_-]{22}$/), tripId: RECU.tripId });
    expect(base.requetes.map((r) => r.texte)).toEqual([
      "SET LOCAL ROLE vadrouille_webhook",
      "SELECT set_config('app.organization_id', $1, true)",
      "SET LOCAL statement_timeout = '1s'",
      "SET LOCAL idle_in_transaction_session_timeout = '2s'",
      "UPDATE public.checkouts SET stripe_receipt_url = $1 WHERE id = $2 AND stripe_receipt_url IS NULL",
    ]);
    expect(base.requetes[1]?.params).toEqual([RECU.organizationId]);
    expect(base.requetes[4]?.params).toEqual([LIEN, RECU.checkoutId]);
    expect(lignes).toEqual([]);
  });

  /** Seule ligne attendue : `payment.receipt_unavailable` de la raison donnée, sans lien ni session. */
  function attendreLigne(lignes: string[], reason: string) {
    expect(lignes.map((l) => JSON.parse(l) as unknown)).toEqual([{ level: "warn", event: "payment.receipt_unavailable", eventId: RECU.eventId, reason }]);
    for (const ligne of lignes) {
      expect(ligne).not.toMatch(/stripe\.com/i);
      expect(ligne).not.toContain(RECU.sessionId);
    }
  }

  it("prestataire en échec, ou qui lève : provider_error, aucune transaction", async () => {
    for (const resultat of [async () => ({ ok: false, code: "provider_error", retryable: true }), async () => Promise.reject(new Error(LIEN))]) {
      const base = baseFactice();
      const lignes = capturer();
      await creerConserverRecu(base.deps, { prestataire: prestataire(resultat).fabrique })(RECU);
      attendreLigne(lignes, "provider_error");
      expect(base.transactions()).toBe(0);
      vi.restoreAllMocks();
    }
    const base = baseFactice();
    const lignes = capturer();
    await creerConserverRecu(base.deps, {
      prestataire: () => {
        throw new Error("composition refusée");
      },
    })(RECU);
    attendreLigne(lignes, "provider_error");
  });

  it("lien refusé par la revalidation : refused, aucune transaction", async () => {
    for (const lien of ["https://PAY.STRIPE.COM/receipts/x", "https://evil.example/receipts/x", "https://pay.stripe.com/receipts/%2e%2e/x"]) {
      const base = baseFactice();
      const lignes = capturer();
      await creerConserverRecu(base.deps, { prestataire: prestataire(async () => ({ ok: true, value: lien })).fabrique })(RECU);
      attendreLigne(lignes, "refused");
      expect(base.transactions()).toBe(0);
      vi.restoreAllMocks();
    }
  });

  it("panne de la base : db_error, sans le message de l'erreur", async () => {
    const base = baseFactice({ panne: true });
    const lignes = capturer();
    await creerConserverRecu(base.deps, { prestataire: prestataire(async () => ({ ok: true, value: LIEN })).fabrique })(RECU);
    attendreLigne(lignes, "db_error");
  });

  it("durée totale dépassée pendant l'appel : timeout à l'échéance, aucune transaction ouverte ensuite, aucune minuterie pendante", async () => {
    vi.useFakeTimers();
    const base = baseFactice();
    let resoudre: (v: unknown) => void = () => undefined;
    const p = prestataire(() => new Promise((r) => (resoudre = r)));
    const lignes = capturer();
    let horloge = 0;
    const fin = creerConserverRecu(base.deps, { prestataire: p.fabrique, horloge: () => horloge })(RECU);
    horloge = 3_000;
    await vi.advanceTimersByTimeAsync(3_000);
    await fin;
    attendreLigne(lignes, "timeout");
    expect(vi.getTimerCount()).toBe(0);
    // L'appel qui finit après l'échéance n'ouvre pas de transaction.
    resoudre({ ok: true, value: LIEN });
    await vi.runAllTimersAsync();
    expect(base.transactions()).toBe(0);
    expect(lignes).toHaveLength(1);
  });

  it("réussite rapide : la minuterie est libérée dès la fin de la course", async () => {
    vi.useFakeTimers();
    const base = baseFactice();
    capturer();
    await creerConserverRecu(base.deps, { prestataire: prestataire(async () => ({ ok: true, value: LIEN })).fabrique })(RECU);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("échéance passée entre l'appel et la base : timeout, transaction non ouverte", async () => {
    const base = baseFactice();
    let horloge = 0;
    const p = prestataire(async () => {
      horloge = 5_000;
      return { ok: true, value: LIEN };
    });
    const lignes = capturer();
    await creerConserverRecu(base.deps, { prestataire: p.fabrique, horloge: () => horloge })(RECU);
    attendreLigne(lignes, "timeout");
    expect(base.transactions()).toBe(0);
  });

  it("échéance passée dans la transaction, avant l'UPDATE : timeout, rien d'écrit", async () => {
    const base = baseFactice();
    let horloge = 0;
    const appels = { n: 0 };
    const lignes = capturer();
    await creerConserverRecu(base.deps, {
      prestataire: prestataire(async () => ({ ok: true, value: LIEN })).fabrique,
      // 1 : échéance ; 2 : avant BEGIN (non passée) ; 3 : avant l'UPDATE (passée).
      horloge: () => {
        appels.n += 1;
        if (appels.n >= 3) horloge = 5_000;
        return horloge;
      },
    })(RECU);
    attendreLigne(lignes, "timeout");
    expect(base.transactions()).toBe(1);
    expect(base.requetes.some((r) => r.texte.startsWith("UPDATE"))).toBe(false);
  });
});
