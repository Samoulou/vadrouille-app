// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cleResend, RAISONS_REFUS_TRANSPORT } from "@/server/env/cle-resend";
import { resendAdmis } from "@/server/env/index";

// 0046 D21 : la barrière de sortie lit aussi le vrai `process.env` ; ces tests le posent en préversion, puis le rétablissent.
beforeEach(() => {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("VERCEL_TARGET_ENV", undefined);
  vi.stubEnv("VADROUILLE_ENV", undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

/**
 * `env: gardes de l'envoi réel` (spécification B3d, R1 ; décision 0138 § 2 à § 4) pour `cleResend` : barrière de sortie
 * d'abord, puis cas admis, puis forme de la clé, sur un objet d'environnement injecté (jamais `process.env` pour la clé).
 * Clé : sentinelle manifestement fausse, de la forme admise.
 */

const SENTINELLE = "re_SENTINELLE_exemple_0000000000";
const ADMIS = { VERCEL: "1", VERCEL_ENV: "preview" } as const;
const [NOM_CLE = ""] = Object.keys({ RESEND_API_KEY: 0 });
const cleValant = (env: Record<string, string | undefined>, cle: string | undefined) => ({ ...env, [NOM_CLE]: cle });
const avecCle = (env: Record<string, string | undefined>) => cleValant(env, SENTINELLE);

describe("env: gardes de l'envoi réel, lecture de la clé Resend à l'envoi (R1)", () => {
  it("cas admis et clé de forme valide : la clé est rendue", () => {
    expect(cleResend(avecCle(ADMIS), [])).toEqual({ ok: true, cle: SENTINELLE });
    expect(cleResend(avecCle({ ...ADMIS, VERCEL_TARGET_ENV: "preview", VADROUILLE_ENV: "  " }), [])).toEqual({ ok: true, cle: SENTINELLE });
  });

  it("barrière de sortie en premier : proxy, TLS affaibli, option de Node ou production → egress_refused, quelle que soit la clé", () => {
    const cas: Record<string, string>[] = [
      { HTTPS_PROXY: "http://proxy.exemple.test:3128" },
      { NODE_USE_ENV_PROXY: "1" },
      { NODE_TLS_REJECT_UNAUTHORIZED: "0" },
      { SSLKEYLOGFILE: "/tmp/cles" },
      { VERCEL_ENV: "production" },
      { VERCEL_TARGET_ENV: "production" },
    ];
    for (const extra of cas) expect(cleResend(avecCle({ ...ADMIS, ...extra }), []), JSON.stringify(extra)).toEqual({ ok: false, code: "egress_refused" });
    expect(cleResend(avecCle(ADMIS), ["--use-env-proxy"])).toEqual({ ok: false, code: "egress_refused" });
  });

  it("vrai process.env en production : refusé même si l'objet reçu dit préversion", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(cleResend(avecCle(ADMIS), [])).toEqual({ ok: false, code: "egress_refused" });
  });

  it("hors du cas admis : not_admitted (développement, sans VERCEL=1, déclaration de VADROUILLE_ENV, cible personnalisée)", () => {
    const cas: Record<string, string | undefined>[] = [
      { VERCEL: "1", VERCEL_ENV: "development" },
      { VERCEL_ENV: "preview" },
      { VERCEL: "0", VERCEL_ENV: "preview" },
      { ...ADMIS, VADROUILLE_ENV: "staging" },
      { ...ADMIS, VADROUILLE_ENV: "ci" },
    ];
    for (const env of cas) expect(cleResend(avecCle(env), []), JSON.stringify(env)).toEqual({ ok: false, code: "not_admitted" });
  });

  it("clé absente ou de forme invalide : key_invalid", () => {
    const invalides = [undefined, "", "   ", ` ${SENTINELLE}`, `${SENTINELLE} `, "re_court", "rk_SENTINELLE_exemple_0000000000", `re_${"é".repeat(20)}`, `re_${"a".repeat(126)}`, "re_SENTINELLE exemple 0000000"];
    for (const cle of invalides) expect(cleResend(cleValant(ADMIS, cle), []), String(cle?.length)).toEqual({ ok: false, code: "key_invalid" });
    expect(cleResend(cleValant(ADMIS, `re_${"a".repeat(16)}`), [])).toEqual({ ok: true, cle: `re_${"a".repeat(16)}` });
    expect(cleResend(cleValant(ADMIS, `re_${"a".repeat(125)}`), [])).toEqual({ ok: true, cle: `re_${"a".repeat(125)}` });
  });

  it("un refus ne porte jamais la clé", () => {
    for (const env of [{ ...ADMIS, HTTPS_PROXY: "http://proxy.exemple.test:3128" }, { VERCEL_ENV: "preview" }, ADMIS]) {
      const resultat = cleResend(cleValant(env, env === ADMIS ? `${SENTINELLE} ` : SENTINELLE), []);
      expect(resultat.ok).toBe(false);
      expect(JSON.stringify(resultat)).not.toContain("SENTINELLE");
      expect(Object.keys(resultat).sort()).toEqual(["code", "ok"]);
    }
  });

  it("ordre : la clé n'est pas lue quand la barrière ou le cas admis refusent", () => {
    const lectures: string[] = [];
    const piege = (env: Record<string, string>): Record<string, string | undefined> => ({
      ...env,
      get RESEND_API_KEY() {
        lectures.push("cle");
        return SENTINELLE;
      },
    });
    cleResend(piege({ ...ADMIS, HTTPS_PROXY: "http://proxy.exemple.test:3128" }), []);
    cleResend(piege({ VERCEL_ENV: "preview" }), []);
    expect(lectures).toEqual([]);
    cleResend(piege(ADMIS), []);
    expect(lectures).toEqual(["cle"]);
  });

  it("le prédicat du cas admis est celui de parseServerEnv", () => {
    expect(resendAdmis(ADMIS)).toBe(true);
    expect(resendAdmis({ VERCEL: "1", VERCEL_ENV: "development" })).toBe(false);
  });

  it("raisons fermées (même liste littérale que `LOG_EMAIL_TRANSPORT_REASONS`, vérifiée par src/server/mail/resend.test.ts)", () => {
    expect([...RAISONS_REFUS_TRANSPORT]).toEqual(["egress_refused", "not_admitted", "key_invalid"]);
  });
});
