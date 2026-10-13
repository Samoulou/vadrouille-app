// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as adapters from "@/adapters";
import { MOCK_AUTH_CONFIG } from "@/adapters/mock-auth";
import { advanceClock, explicitScope } from "@/adapters/simulation";
import { MOCK_AUTH_CODE, MOCK_KNOWN_EMAIL, MOCK_WRONG_AUTH_CODE } from "@/mocks/auth-simule";

import { requestCode, verifyCode } from "./compte";

const scopeName = vi.hoisted(() => ({ value: "compte-1" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-vadrouille-simulation": scopeName.value }) }));
vi.mock("@/adapters", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/adapters")>();
  return { ...actual, getAuthAdapter: vi.fn(actual.getAuthAdapter) };
});

/** Le serveur fait foi (F8-PO-17, décision 0017 § 3.4) : `requestCode` et `verifyCode`, connexion simulée (F8-PO-9). */

const UNKNOWN_EMAIL = "inconnue@exemple.org";

let serial = 0;
beforeEach(() => {
  serial += 1;
  scopeName.value = `compte-${serial}`;
  vi.mocked(adapters.getAuthAdapter).mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("requestCode et verifyCode : validation", () => {
  it.each([
    ["email sans @", requestCode, { email: "camille.exemple.ch" }, "email"],
    ["email absent", requestCode, {}, "email"],
    ["champ inconnu", requestCode, { email: MOCK_KNOWN_EMAIL, inconnu: 1 }, undefined],
    ["code de 5 chiffres", verifyCode, { email: MOCK_KNOWN_EMAIL, code: "24681" }, "code"],
    ["code avec une lettre", verifyCode, { email: MOCK_KNOWN_EMAIL, code: "24681a" }, "code"],
    ["code de 7 chiffres", verifyCode, { email: MOCK_KNOWN_EMAIL, code: "2468100" }, "code"],
  ] as const)("%s : validation_failed sans appeler l'adaptateur", async (_label, action, input, field) => {
    const result = await action(input);
    expect(result).toEqual({ ok: false, error: field ? { code: "validation_failed", field } : { code: "validation_failed" } });
    expect(adapters.getAuthAdapter).not.toHaveBeenCalled();
  });

  it("une entrée refusée ne consomme ni demande ni essai", async () => {
    expect((await requestCode({ email: MOCK_KNOWN_EMAIL })).ok).toBe(true);
    for (let i = 0; i < 5; i += 1) await verifyCode({ email: MOCK_KNOWN_EMAIL, code: "12" });
    expect(await verifyCode({ email: MOCK_KNOWN_EMAIL, code: MOCK_AUTH_CODE })).toEqual({ ok: true, value: { signedIn: true } });
  });
});

describe("requestCode et verifyCode : machine d'états (F8-PO-9)", () => {
  async function sequence(email: string) {
    const responses: unknown[] = [];
    responses.push(await requestCode({ email }));
    for (let i = 0; i < MOCK_AUTH_CONFIG.maxAttempts + 1; i += 1) responses.push(await verifyCode({ email, code: MOCK_WRONG_AUTH_CODE }));
    responses.push(await requestCode({ email }));
    advanceClock(scopeName.value, MOCK_AUTH_CONFIG.codeTtlMs + 1000);
    responses.push(await verifyCode({ email, code: MOCK_AUTH_CODE }));
    responses.push(await requestCode({ email }));
    responses.push(await verifyCode({ email, code: MOCK_AUTH_CODE }));
    return responses;
  }

  it("code faux, trop d'essais, renvoi, expiration, renvoi, code valable : même suite, adresse connue ou inconnue", async () => {
    const known = await sequence(MOCK_KNOWN_EMAIL);
    scopeName.value = `compte-${serial}-b`;
    const unknown = await sequence(UNKNOWN_EMAIL);
    const expected = [
      { ok: true, value: { sent: true } },
      { ok: false, error: { code: "invalid_code" } },
      { ok: false, error: { code: "invalid_code" } },
      { ok: false, error: { code: "too_many_attempts" } },
      { ok: false, error: { code: "too_many_attempts" } },
      { ok: true, value: { sent: true } },
      { ok: false, error: { code: "code_expired" } },
      { ok: true, value: { sent: true } },
      { ok: true, value: { signedIn: true } },
    ];
    expect(known).toEqual(expected);
    expect(unknown).toEqual(expected);
  });

  it("la réussite ne renvoie aucune donnée de session au navigateur", async () => {
    await requestCode({ email: MOCK_KNOWN_EMAIL });
    const result = await verifyCode({ email: MOCK_KNOWN_EMAIL, code: MOCK_AUTH_CODE });
    expect(JSON.stringify(result)).not.toMatch(/session|user|organization/i);
    expect(explicitScope(scopeName.value).auth.session).not.toBeNull();
  });

  it("maxCodeRequests demandes dans la fenêtre, puis rate_limited ; de nouveau acceptée après la fenêtre", async () => {
    for (let i = 0; i < MOCK_AUTH_CONFIG.maxCodeRequests; i += 1) {
      expect(await requestCode({ email: UNKNOWN_EMAIL })).toEqual({ ok: true, value: { sent: true } });
    }
    expect(await requestCode({ email: UNKNOWN_EMAIL })).toEqual({ ok: false, error: { code: "rate_limited" } });
    // Même limite pour une autre casse de la même adresse (adresse normalisée en minuscules).
    expect(await requestCode({ email: "Inconnue@Exemple.ORG" })).toEqual({ ok: false, error: { code: "rate_limited" } });
    advanceClock(scopeName.value, MOCK_AUTH_CONFIG.codeRequestWindowMs);
    expect(await requestCode({ email: UNKNOWN_EMAIL })).toEqual({ ok: true, value: { sent: true } });
  });

  it("verifyCode sans code demandé : code_expired", async () => {
    expect(await verifyCode({ email: UNKNOWN_EMAIL, code: MOCK_AUTH_CODE })).toEqual({ ok: false, error: { code: "code_expired" } });
  });
});

describe("requestCode et verifyCode : erreurs", () => {
  it("garde fermée (déploiement de production) : provider_error, sans détail", async () => {
    vi.stubEnv("VADROUILLE_ENV", "production");
    expect(await requestCode({ email: MOCK_KNOWN_EMAIL })).toEqual({ ok: false, error: { code: "provider_error" } });
    expect(await verifyCode({ email: MOCK_KNOWN_EMAIL, code: MOCK_AUTH_CODE })).toEqual({ ok: false, error: { code: "provider_error" } });
  });

  it("une erreur inattendue de l'adaptateur devient provider_error", async () => {
    vi.mocked(adapters.getAuthAdapter).mockReturnValueOnce({
      requestCode: async () => ({ ok: false, error: { code: "not_found" } }),
    } as never);
    expect(await requestCode({ email: MOCK_KNOWN_EMAIL })).toEqual({ ok: false, error: { code: "provider_error" } });
    vi.mocked(adapters.getAuthAdapter).mockReturnValueOnce({
      verifyCode: async () => {
        throw new Error(MOCK_KNOWN_EMAIL);
      },
    } as never);
    expect(await verifyCode({ email: MOCK_KNOWN_EMAIL, code: MOCK_AUTH_CODE })).toEqual({ ok: false, error: { code: "provider_error" } });
  });

  it("aucune donnée journalisée : ni adresse ni code sur la console ou la sortie du processus", async () => {
    const spies = [
      ...(["log", "info", "warn", "error", "debug"] as const).map((method) => vi.spyOn(console, method)),
      vi.spyOn(process.stdout, "write"),
      vi.spyOn(process.stderr, "write"),
    ];
    try {
      await requestCode({ email: MOCK_KNOWN_EMAIL });
      await verifyCode({ email: MOCK_KNOWN_EMAIL, code: MOCK_WRONG_AUTH_CODE });
      await verifyCode({ email: MOCK_KNOWN_EMAIL, code: MOCK_AUTH_CODE });
      await requestCode({ email: "pas-une-adresse" });
      vi.mocked(adapters.getAuthAdapter).mockReturnValueOnce({
        requestCode: async () => {
          throw new Error(MOCK_KNOWN_EMAIL);
        },
      } as never);
      await requestCode({ email: MOCK_KNOWN_EMAIL });
      const written = spies.flatMap((spy) => spy.mock.calls.flat()).map(String).join("\n");
      expect(written).not.toContain(MOCK_KNOWN_EMAIL);
      expect(written).not.toContain(MOCK_AUTH_CODE);
      expect(written).not.toContain(MOCK_WRONG_AUTH_CODE);
      expect(written).not.toContain("pas-une-adresse");
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});
