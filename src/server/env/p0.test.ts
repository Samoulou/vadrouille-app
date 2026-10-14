// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CODES_REFUS_SORTIE } from "@/server/env/egress";
import { CODES_ENV_P0, decoderJetonSaisi, lireEnvP0, type CodeEnvP0 } from "@/server/env/p0";

/**
 * `p0: mode réel refusé` (spécification `specs/P0-suite-2.md`, critères P0r3 ; décision 0055, section 1 points 2 et 4 ;
 * avis de la Sécurité S-1 point 2) : module étroit `lireEnvP0`. Chaque condition est prise **seule** sur une
 * configuration par ailleurs ouverte ; l'ordre des contrôles est relevé par un espion sur l'objet d'environnement.
 * Codes de test fabriqués par une suite non arithmétique (aucun module de capacité dans ce dossier) ; les noms secrets
 * ne sont que des clés d'objet (régime P0c, section 5).
 */

// 0046 D21 : la barrière de sortie lit aussi le vrai `process.env` ; posé en préversion, puis rétabli.
beforeEach(() => {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("VERCEL_TARGET_ENV", undefined);
  vi.stubEnv("VADROUILLE_ENV", undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

type Env = Record<string, string | undefined>;

/** Noms des variables du mode réel, par clés d'objet. */
const [NOM_CODE = "", NOM_BASE = ""] = Object.keys({
  P0_RUN_TOKEN: 0,
  P0_DATABASE_URL: 0,
});

/** `n` octets de test, distincts et sans motif trivial (suite quadratique décalée par `graine`). */
const octets = (n: number, graine: number) => Buffer.from(Array.from({ length: n }, (_, i) => (i * i * 7 + i * 13 + graine) % 256));
const CODE = octets(32, 5);
const SENTINELLE = "sentinelle-p0-6d1f";

/** Préversion de `p0-reel`, réglages posés : garde ouverte. */
const ouvert = (extra: Env = {}): Env => ({
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "p0-reel",
  P0_REAL_RUNS: "enabled",
  [NOM_BASE]: `postgres://${SENTINELLE}`,
  [NOM_CODE]: CODE.toString("hex"),
  ...extra,
});

/** Environnement dont chaque lecture d'un nom de la garde est notée (S-1 point 2), par accesseurs littéraux. */
function espion(valeurs: Env): { env: Env; lus: string[] } {
  const lus: string[] = [];
  const env = {
    get VERCEL_ENV() {
      lus.push("VERCEL_ENV");
      return valeurs.VERCEL_ENV;
    },
    get VERCEL_TARGET_ENV() {
      lus.push("VERCEL_TARGET_ENV");
      return valeurs.VERCEL_TARGET_ENV;
    },
    get VADROUILLE_ENV() {
      lus.push("VADROUILLE_ENV");
      return valeurs.VADROUILLE_ENV;
    },
    get CI() {
      lus.push("CI");
      return valeurs.CI;
    },
    get VERCEL_GIT_COMMIT_REF() {
      lus.push("VERCEL_GIT_COMMIT_REF");
      return valeurs.VERCEL_GIT_COMMIT_REF;
    },
    get P0_REAL_RUNS() {
      lus.push("P0_REAL_RUNS");
      return valeurs.P0_REAL_RUNS;
    },
    get P0_DATABASE_URL() {
      lus.push(NOM_BASE);
      return valeurs.P0_DATABASE_URL;
    },
    get P0_RUN_TOKEN() {
      lus.push(NOM_CODE);
      return valeurs.P0_RUN_TOKEN;
    },
  };
  return { env, lus };
}

const refus = (env: Env): CodeEnvP0 | "ouvert" => {
  const resultat = lireEnvP0(env, []);
  return resultat.ok ? "ouvert" : resultat.code;
};

describe("p0: mode réel refusé (lireEnvP0)", () => {
  it("préversion de p0-reel, réglages posés : ouvert, octets du code rendus (jamais la chaîne)", () => {
    const resultat = lireEnvP0(ouvert(), []);
    expect(resultat).toEqual({ ok: true, jeton: CODE });
    expect(JSON.stringify(resultat)).not.toContain(CODE.toString("hex"));
    // Base64 du même secret : mêmes octets (0055, section 2 point 2).
    expect(lireEnvP0(ouvert({ [NOM_CODE]: CODE.toString("base64") }), [])).toEqual({ ok: true, jeton: CODE });
  });

  it.each<[string, Env, CodeEnvP0]>([
    ["VERCEL_ENV=production", { VERCEL_ENV: "production" }, "production_refused"],
    ["VADROUILLE_ENV=production", { VADROUILLE_ENV: "production" }, "production_refused"],
    ["VERCEL_TARGET_ENV=production", { VERCEL_TARGET_ENV: "production" }, "production_refused"],
    ["proxy posé", { HTTPS_PROXY: "http://127.0.0.1:1" }, "proxy_env_refused"],
    ["TLS affaibli", { NODE_TLS_REJECT_UNAUTHORIZED: "0" }, "tls_env_refused"],
    ["local (development)", { VERCEL_ENV: "development" }, "environment_refused"],
    ["local (VADROUILLE_ENV=local, VERCEL_ENV absente)", { VERCEL_ENV: "development", VADROUILLE_ENV: "local" }, "environment_refused"],
    ["ci", { VERCEL_ENV: "development", VADROUILLE_ENV: "ci" }, "environment_refused"],
    ["CI=1", { CI: "1" }, "ci_refused"],
    ["CI=true", { CI: "true" }, "ci_refused"],
    ["branche main", { VERCEL_GIT_COMMIT_REF: "main" }, "branch_refused"],
    ["branche claude/x", { VERCEL_GIT_COMMIT_REF: "claude/x" }, "branch_refused"],
    ["branche « p0-reel » suivie d'une espace", { VERCEL_GIT_COMMIT_REF: "p0-reel " }, "branch_refused"],
    ["branche P0-REEL", { VERCEL_GIT_COMMIT_REF: "P0-REEL" }, "branch_refused"],
    ["branche absente", { VERCEL_GIT_COMMIT_REF: undefined }, "branch_refused"],
    ["P0_REAL_RUNS absente", { P0_REAL_RUNS: undefined }, "real_runs_disabled"],
    ["P0_REAL_RUNS vide", { P0_REAL_RUNS: "" }, "real_runs_disabled"],
    ["P0_REAL_RUNS=Enabled", { P0_REAL_RUNS: "Enabled" }, "real_runs_disabled"],
    ["P0_REAL_RUNS « enabled » suivie d'une espace", { P0_REAL_RUNS: "enabled " }, "real_runs_disabled"],
    ["base du prototype absente", { [NOM_BASE]: undefined }, "database_missing"],
    ["code absent", { [NOM_CODE]: undefined }, "access_code_missing"],
    ["code vide", { [NOM_CODE]: "" }, "access_code_missing"],
    ["code trop court (31 octets)", { [NOM_CODE]: octets(31, 9).toString("hex") }, "access_code_invalid"],
    ["code invalide (forme)", { [NOM_CODE]: `${SENTINELLE}!` }, "access_code_invalid"],
    ["code suivi d'un retour à la ligne", { [NOM_CODE]: `${CODE.toString("hex")}\n` }, "access_code_invalid"],
  ])("%s, seule → %s", (_nom, extra, attendu) => {
    const env = ouvert(extra);
    // La condition de production est aussi celle du vrai `process.env` (D21) : posée des deux côtés.
    if (extra.VERCEL_TARGET_ENV !== undefined) vi.stubEnv("VERCEL_TARGET_ENV", extra.VERCEL_TARGET_ENV);
    expect(refus(env)).toBe(attendu);
  });

  it("environnement non déclaré (aucune variable d'environnement) : refusé", () => {
    expect(refus({})).toBe("production_refused");
  });

  it("le vrai process.env en production ferme aussi, quel que soit l'environnement injecté (D21)", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(refus(ouvert())).toBe("production_refused");
  });

  it("aucune lecture du code ni de la base quand (1) à (5) refusent ; ordre des lectures respecté (S-1 point 2)", () => {
    for (const extra of [
      { VERCEL_ENV: "production" },
      { VERCEL_ENV: "development" },
      { CI: "1" },
      { VERCEL_GIT_COMMIT_REF: "main" },
      { P0_REAL_RUNS: "Enabled" },
    ] satisfies Env[]) {
      const { env, lus } = espion(ouvert(extra));
      expect(lireEnvP0(env, []).ok).toBe(false);
      expect(lus).not.toContain(NOM_CODE);
      expect(lus).not.toContain(NOM_BASE);
    }
    const { env, lus } = espion(ouvert());
    expect(lireEnvP0(env, []).ok).toBe(true);
    const rang = (nom: string) => lus.indexOf(nom);
    expect(rang("CI")).toBeLessThan(rang("VERCEL_GIT_COMMIT_REF"));
    expect(rang("VERCEL_GIT_COMMIT_REF")).toBeLessThan(rang("P0_REAL_RUNS"));
    expect(rang("P0_REAL_RUNS")).toBeLessThan(rang(NOM_BASE));
    expect(rang(NOM_BASE)).toBeLessThan(rang(NOM_CODE));
  });

  it("aucune valeur dans un refus : seulement un code de la liste fermée", () => {
    const resultat = lireEnvP0(
      ouvert({
        [NOM_CODE]: `${SENTINELLE}!`,
        VERCEL_GIT_COMMIT_REF: "p0-reel",
      }),
      [],
    );
    expect(resultat).toEqual({ ok: false, code: "access_code_invalid" });
    expect(JSON.stringify(resultat)).not.toContain(SENTINELLE);
    expect(CODES_ENV_P0).toEqual(expect.arrayContaining([...CODES_REFUS_SORTIE]));
  });
});

describe("p0: saisie du code décodée par la même fonction (decoderJetonSaisi)", () => {
  it("hexadécimal ou base64 du même secret : mêmes octets ; aucune normalisation ni trim()", () => {
    expect(decoderJetonSaisi(CODE.toString("hex"))).toEqual(CODE);
    expect(decoderJetonSaisi(CODE.toString("base64"))).toEqual(CODE);
    expect(decoderJetonSaisi(CODE.toString("base64url"))).toEqual(CODE);
    for (const saisie of [` ${CODE.toString("hex")}`, `${CODE.toString("hex")} `, `${CODE.toString("hex")}\n`])
      expect(decoderJetonSaisi(saisie)).toBeNull();
  });

  it("toute saisie refusée par decodeSecret rend null, sans valeur ni motif", () => {
    for (const saisie of ["", `${SENTINELLE}!`, octets(31, 9).toString("hex"), "a".repeat(64), "changeme".repeat(8)]) {
      expect(decoderJetonSaisi(saisie)).toBeNull();
    }
  });
});
