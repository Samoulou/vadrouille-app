// @vitest-environment node
import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { MOCK_AUTH_CODE, MOCK_KNOWN_EMAIL, MOCK_WRONG_AUTH_CODE } from "@/mocks/auth-simule";
import { MOCK_ORGANIZATION_ID, MOCK_USER_ID } from "@/mocks/edimbourg";

import { createMockAuthAdapter, MOCK_AUTH_CONFIG } from "./mock-auth";
import { MAX_AUTH_ADDRESSES_PER_SCOPE, type AuthStore } from "./simulation";

/** Connexion simulée (décision 0017 § 3.2, § 3.5 et § 10.4 ; F8-PO-9) : horloge injectée, magasin minimisé. */

function setup({ maxAddresses = MAX_AUTH_ADDRESSES_PER_SCOPE } = {}) {
  let now = Date.UTC(2026, 7, 1, 6);
  const store: AuthStore = { addresses: new Map(), session: null };
  const adapter = createMockAuthAdapter({ now: () => now, store, key: randomBytes(32), maxAddresses });
  return {
    adapter,
    store,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

const UNKNOWN = "inconnue@exemple.org";

describe("connexion simulée : configuration", () => {
  it("limites de la simulation : 10 minutes, 3 essais, 3 demandes en 15 minutes", () => {
    expect(MOCK_AUTH_CONFIG).toEqual({ codeTtlMs: 600_000, maxAttempts: 3, maxCodeRequests: 3, codeRequestWindowMs: 900_000 });
    expect(setup().adapter.mode).toBe("simulated");
    expect(setup().adapter.config).toBe(MOCK_AUTH_CONFIG);
  });
});

describe("connexion simulée : machine d'états", () => {
  it("code valable : session avec l'organisation simulée, code consommé", async () => {
    const { adapter, store } = setup();
    expect(await adapter.getSession()).toBeNull();
    expect(await adapter.requestCode({ email: MOCK_KNOWN_EMAIL })).toEqual({ ok: true, value: { sent: true } });
    const result = await adapter.verifyCode({ email: MOCK_KNOWN_EMAIL, code: MOCK_AUTH_CODE });
    expect(result.ok && result.value).toMatchObject({ userId: MOCK_USER_ID, organizationId: MOCK_ORGANIZATION_ID });
    expect(await adapter.getSession()).toEqual(result.ok ? result.value : null);
    expect(store.session).not.toBeNull();
    // Code consommé : une seconde vérification ne réussit pas.
    expect(await adapter.verifyCode({ email: MOCK_KNOWN_EMAIL, code: MOCK_AUTH_CODE })).toEqual({ ok: false, error: { code: "code_expired" } });
    await adapter.signOut();
    expect(await adapter.getSession()).toBeNull();
  });

  it("adresse inconnue : même réussite, autre identifiant de personne, même organisation simulée", async () => {
    const { adapter } = setup();
    await adapter.requestCode({ email: UNKNOWN });
    const result = await adapter.verifyCode({ email: UNKNOWN, code: MOCK_AUTH_CODE });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.userId).not.toBe(MOCK_USER_ID);
      expect(result.value.userId).toMatch(/^mock_user_[0-9a-f]{16}$/);
      expect(result.value.organizationId).toBe(MOCK_ORGANIZATION_ID);
    }
  });

  it("codes faux : invalid_code puis too_many_attempts au maxAttempts-ième ; bloqué jusqu'au renvoi", async () => {
    const { adapter } = setup();
    await adapter.requestCode({ email: UNKNOWN });
    const wrong = () => adapter.verifyCode({ email: UNKNOWN, code: MOCK_WRONG_AUTH_CODE });
    expect(await wrong()).toEqual({ ok: false, error: { code: "invalid_code" } });
    expect(await wrong()).toEqual({ ok: false, error: { code: "invalid_code" } });
    expect(await wrong()).toEqual({ ok: false, error: { code: "too_many_attempts" } });
    // Bloqué : même le code valable est refusé.
    expect(await adapter.verifyCode({ email: UNKNOWN, code: MOCK_AUTH_CODE })).toEqual({ ok: false, error: { code: "too_many_attempts" } });
    await adapter.requestCode({ email: UNKNOWN });
    expect(await wrong()).toEqual({ ok: false, error: { code: "invalid_code" } });
    expect((await adapter.verifyCode({ email: UNKNOWN, code: MOCK_AUTH_CODE })).ok).toBe(true);
  });

  it("expiration à codeTtlMs, pas avant ; un renvoi relance la durée", async () => {
    const { adapter, advance } = setup();
    await adapter.requestCode({ email: UNKNOWN });
    advance(MOCK_AUTH_CONFIG.codeTtlMs);
    expect(await adapter.verifyCode({ email: UNKNOWN, code: MOCK_WRONG_AUTH_CODE })).toEqual({ ok: false, error: { code: "invalid_code" } });
    advance(1);
    expect(await adapter.verifyCode({ email: UNKNOWN, code: MOCK_AUTH_CODE })).toEqual({ ok: false, error: { code: "code_expired" } });
    await adapter.requestCode({ email: UNKNOWN });
    expect((await adapter.verifyCode({ email: UNKNOWN, code: MOCK_AUTH_CODE })).ok).toBe(true);
  });

  it("fenêtre glissante : maxCodeRequests demandes, puis rate_limited jusqu'à la sortie de la plus ancienne", async () => {
    const { adapter, advance } = setup();
    await adapter.requestCode({ email: UNKNOWN });
    advance(60_000);
    await adapter.requestCode({ email: UNKNOWN });
    await adapter.requestCode({ email: UNKNOWN });
    expect(await adapter.requestCode({ email: UNKNOWN })).toEqual({ ok: false, error: { code: "rate_limited" } });
    advance(MOCK_AUTH_CONFIG.codeRequestWindowMs - 60_000 - 1);
    expect(await adapter.requestCode({ email: UNKNOWN })).toEqual({ ok: false, error: { code: "rate_limited" } });
    advance(1);
    expect(await adapter.requestCode({ email: UNKNOWN })).toEqual({ ok: true, value: { sent: true } });
  });

  it("une demande refusée n'invalide pas le code en cours", async () => {
    const { adapter } = setup();
    for (let i = 0; i < MOCK_AUTH_CONFIG.maxCodeRequests; i += 1) await adapter.requestCode({ email: UNKNOWN });
    expect((await adapter.requestCode({ email: UNKNOWN })).ok).toBe(false);
    expect((await adapter.verifyCode({ email: UNKNOWN, code: MOCK_AUTH_CODE })).ok).toBe(true);
  });

  it("même limite pour toutes les écritures d'une adresse (casse, espaces)", async () => {
    const { adapter } = setup();
    await adapter.requestCode({ email: "Camille@Exemple.ch" });
    await adapter.requestCode({ email: " camille@exemple.ch " });
    await adapter.requestCode({ email: MOCK_KNOWN_EMAIL });
    expect(await adapter.requestCode({ email: "CAMILLE@EXEMPLE.CH" })).toEqual({ ok: false, error: { code: "rate_limited" } });
  });

  it("même suite de réponses pour une adresse connue et une inconnue", async () => {
    async function run(email: string) {
      const { adapter, advance } = setup();
      const out: unknown[] = [await adapter.requestCode({ email })];
      for (let i = 0; i < 4; i += 1) out.push(await adapter.verifyCode({ email, code: MOCK_WRONG_AUTH_CODE }));
      out.push(await adapter.requestCode({ email }));
      advance(MOCK_AUTH_CONFIG.codeTtlMs + 1000);
      out.push(await adapter.verifyCode({ email, code: MOCK_AUTH_CODE }));
      out.push(await adapter.requestCode({ email }));
      const last = await adapter.verifyCode({ email, code: MOCK_AUTH_CODE });
      out.push(last.ok);
      return out;
    }
    expect(await run(MOCK_KNOWN_EMAIL)).toEqual(await run(UNKNOWN));
  });
});

describe("connexion simulée : magasin minimisé (0017 § 3.5, § 10.4)", () => {
  it("ni adresse ni code en clair dans le magasin", async () => {
    const { adapter, store } = setup();
    await adapter.requestCode({ email: MOCK_KNOWN_EMAIL });
    await adapter.verifyCode({ email: MOCK_KNOWN_EMAIL, code: MOCK_WRONG_AUTH_CODE });
    const dump = JSON.stringify({ keys: [...store.addresses.keys()], values: [...store.addresses.values()] });
    expect(dump).not.toMatch(/camille|exemple/i);
    expect(dump).not.toContain(MOCK_AUTH_CODE);
    expect(dump).not.toContain(MOCK_WRONG_AUTH_CODE);
    for (const key of store.addresses.keys()) expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("clé HMAC propre au processus : deux magasins ne partagent pas leurs clés d'adresse", async () => {
    const a = setup();
    const b = setup();
    await a.adapter.requestCode({ email: UNKNOWN });
    await b.adapter.requestCode({ email: UNKNOWN });
    expect([...a.store.addresses.keys()]).not.toEqual([...b.store.addresses.keys()]);
  });

  it("au plus maxAddresses adresses ; la moins récemment utilisée est retirée", async () => {
    const { adapter, store } = setup({ maxAddresses: 3 });
    for (const email of ["a@exemple.org", "b@exemple.org", "c@exemple.org"]) await adapter.requestCode({ email });
    // « a » redevient la plus récente : « b » est retirée à l'arrivée de « d ».
    await adapter.verifyCode({ email: "a@exemple.org", code: MOCK_WRONG_AUTH_CODE });
    await adapter.requestCode({ email: "d@exemple.org" });
    expect(store.addresses.size).toBe(3);
    expect((await adapter.verifyCode({ email: "b@exemple.org", code: MOCK_AUTH_CODE })).ok).toBe(false);
    expect((await adapter.verifyCode({ email: "a@exemple.org", code: MOCK_AUTH_CODE })).ok).toBe(true);
    expect(MAX_AUTH_ADDRESSES_PER_SCOPE).toBe(50);
  });

  it("une vérification sans code demandé ne crée aucune entrée", async () => {
    const { adapter, store } = setup();
    await adapter.verifyCode({ email: UNKNOWN, code: MOCK_AUTH_CODE });
    expect(store.addresses.size).toBe(0);
  });
});
