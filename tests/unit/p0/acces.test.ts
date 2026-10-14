// @vitest-environment node
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cookieAccesValide,
  DUREE_COOKIE_S,
  etatPageAcces,
  LONGUEUR_SAISIE_MAX,
  memeCode,
  NOM_COOKIE_ACCES,
  OPTIONS_COOKIE_ACCES,
  saisirCodeAcces,
  valeurCookieAcces,
} from "@/server/p0/acces";

import { baseEssais } from "../../support/base-essais-p0";

/**
 * Accès au mode réel (décision 0055, section 2, D19 ; avis de la Sécurité S-2) : critères `p0: jeton limité à 5 essais
 * par heure, comparé en temps constant, masqué` et `p0: cookie d'accès invalidé par la rotation du jeton et expiré
 * après 12 heures`. Base et horloge doublées ; le code est tiré à l'exécution, les noms secrets sont des clés d'objet.
 */

beforeEach(() => {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("VERCEL_TARGET_ENV", undefined);
  vi.stubEnv("VADROUILLE_ENV", undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const [NOM_CODE = "", NOM_BASE = ""] = Object.keys({
  P0_RUN_TOKEN: 0,
  P0_DATABASE_URL: 0,
});
const T0 = Date.UTC(2026, 9, 14, 8);
const HEURE = 3_600_000;

function preversion(code: Buffer, extra: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "p0-reel",
    P0_REAL_RUNS: "enabled",
    [NOM_BASE]: "postgres://exemple.invalid/p0",
    [NOM_CODE]: code.toString("hex"),
    ...extra,
  };
}

describe("p0: code comparé en temps constant", () => {
  it("mêmes octets → vrai ; autres octets, autre longueur → faux, sans exception", () => {
    const code = randomBytes(32);
    expect(memeCode(Buffer.from(code), code)).toBe(true);
    expect(memeCode(randomBytes(32), code)).toBe(false);
    expect(memeCode(Buffer.concat([code, Buffer.from([0])]), code)).toBe(false);
    expect(memeCode(code.subarray(0, 31), code)).toBe(false);
  });

  it("acces.ts ne compare jamais le code ni le MAC par ===, !== ou equals (test statique)", () => {
    const source = readFileSync("src/server/p0/acces.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(source).not.toMatch(/\.equals\(/);
    expect(source).toContain("timingSafeEqual(");
    // Seules égalités admises : formes et types des entrées, jamais une valeur dérivée du code.
    const egalites = [...source.matchAll(/([^\s(]+)\s*(===|!==|==|!=)\s*([^\s);,]+)/g)].map((m) => `${m[1]} ${m[2]} ${m[3]}`);
    expect(new Set(egalites)).toEqual(new Set(['brut !== "string"', "forme === null", 'saisie !== "string"', "octets !== null"]));
  });
});

describe("p0: cookie d'accès invalidé par la rotation du jeton et expiré après 12 heures", () => {
  const code = randomBytes(32);
  const cookie = valeurCookieAcces(code, T0);

  it("forme v1.<exp>.<mac>, échéance = émission + 12 heures ; le code n'y est pas", () => {
    expect(cookie).toMatch(/^v1\.[0-9]{10}\.[0-9a-f]{64}$/);
    expect(cookie.split(".")[1]).toBe(String(T0 / 1000 + DUREE_COOKIE_S));
    expect(cookie).not.toContain(code.toString("hex"));
    expect(OPTIONS_COOKIE_ACCES).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
      maxAge: 43_200,
    });
    expect(NOM_COOKIE_ACCES.startsWith("__Host-")).toBe(true);
  });

  it("11 h 59 → accepté ; 12 h 00 → refusé ; jamais prolongé à l'usage", () => {
    expect(cookieAccesValide(cookie, code, T0)).toBe(true);
    expect(cookieAccesValide(cookie, code, T0 + 11 * HEURE + 59 * 60_000)).toBe(true);
    expect(cookieAccesValide(cookie, code, T0 + 12 * HEURE)).toBe(false);
    expect(cookieAccesValide(cookie, code, T0 + 13 * HEURE)).toBe(false);
  });

  it("échéance modifiée, MAC d'un autre code, v2, valeur tronquée, majuscules, échéance qu'aucun serveur n'émet → refus", () => {
    const [, exp = "", mac = ""] = cookie.split(".");
    const autre = randomBytes(32);
    const cas = [
      `v1.${Number(exp) + 60}.${mac}`,
      valeurCookieAcces(autre, T0),
      `v2.${exp}.${mac}`,
      cookie.slice(0, -1),
      `v1.${exp}.${mac.toUpperCase()}`,
      `${cookie} `,
      "",
      undefined,
      // Signé avec le bon code, mais échéance au-delà de maintenant + 12 h (émis « dans une heure »).
      valeurCookieAcces(code, T0 + HEURE),
    ];
    for (const valeur of cas) expect(cookieAccesValide(valeur, code, T0), String(valeur)).toBe(false);
    expect(cookieAccesValide(42, code, T0)).toBe(false);
  });

  it("après rotation du code, l'ancien cookie est refusé", () => {
    expect(cookieAccesValide(cookie, randomBytes(32), T0)).toBe(false);
  });

  it("état de la page : fermée hors garde, saisie sans cookie valide, ouverte avec", () => {
    const env = preversion(code);
    expect(etatPageAcces(cookie, { env, execArgv: [], maintenant: () => T0 })).toBe("ouverte");
    expect(etatPageAcces(undefined, { env, execArgv: [], maintenant: () => T0 })).toBe("saisie");
    expect(
      etatPageAcces(cookie, {
        env,
        execArgv: [],
        maintenant: () => T0 + 12 * HEURE,
      }),
    ).toBe("saisie");
    expect(
      etatPageAcces(cookie, {
        env: preversion(code, { VERCEL_GIT_COMMIT_REF: "main" }),
        execArgv: [],
        maintenant: () => T0,
      }),
    ).toBe("fermee");
  });
});

describe("p0: jeton limité à 5 essais par heure, masqué", () => {
  const code = randomBytes(32);
  const dependances = (base: ReturnType<typeof baseEssais>, extra: Record<string, string | undefined> = {}) => ({
    env: preversion(code, extra),
    execArgv: [],
    maintenant: () => base.maintenant,
  });

  it("bon code (hexadécimal ou base64) → cookie valide, ligne « accepte » ; mauvais code → invalid_code, ligne « refuse »", async () => {
    const base = baseEssais(T0);
    const pool = () => base.pool;
    const accepte = await saisirCodeAcces(code.toString("hex"), pool, dependances(base));
    expect(accepte.ok).toBe(true);
    if (accepte.ok) expect(cookieAccesValide(accepte.cookie, code, T0)).toBe(true);
    expect((await saisirCodeAcces(code.toString("base64"), pool, dependances(base))).ok).toBe(true);
    expect(await saisirCodeAcces(randomBytes(32).toString("hex"), pool, dependances(base))).toEqual({ ok: false, code: "invalid_code" });
    expect(await saisirCodeAcces("pas-un-code", pool, dependances(base))).toEqual({ ok: false, code: "invalid_code" });
    expect(await saisirCodeAcces(null, pool, dependances(base))).toEqual({
      ok: false,
      code: "invalid_code",
    });
    expect(base.essais.map((e) => e.resultat)).toEqual(["accepte", "accepte", "refuse", "refuse", "refuse"]);
  });

  it("garde fermée → fermee, sans connexion à la base", async () => {
    const base = baseEssais(T0);
    const pool = vi.fn(() => base.pool);
    for (const extra of [{ VERCEL_GIT_COMMIT_REF: "main" }, { P0_REAL_RUNS: undefined }, { CI: "1" }, { [NOM_CODE]: undefined }]) {
      expect(await saisirCodeAcces(code.toString("hex"), pool, dependances(base, extra))).toEqual({ ok: false, code: "fermee" });
    }
    expect(pool).not.toHaveBeenCalled();
    expect(base.connexions).toBe(0);
  });

  it("au 6e essai de l'heure (acceptés compris) → too_many_attempts, sans comparaison ni ligne nouvelle ; libre une heure après", async () => {
    const base = baseEssais(T0);
    const pool = () => base.pool;
    for (let i = 0; i < 4; i += 1) await saisirCodeAcces("faux", pool, dependances(base));
    expect((await saisirCodeAcces(code.toString("hex"), pool, dependances(base))).ok).toBe(true);
    expect(await saisirCodeAcces(code.toString("hex"), pool, dependances(base))).toEqual({ ok: false, code: "too_many_attempts" });
    expect(base.essais).toHaveLength(5);
    base.maintenant += HEURE;
    expect((await saisirCodeAcces(code.toString("hex"), pool, dependances(base))).ok).toBe(true);
  });

  it("saisie de plus de 256 caractères : essai refusé et compté ; 6 essais simultanés → 5 lignes au plus, un refus", async () => {
    const base = baseEssais(T0);
    const pool = () => base.pool;
    const long = "a".repeat(LONGUEUR_SAISIE_MAX + 1);
    const resultats = await Promise.all([
      saisirCodeAcces(long, pool, dependances(base)),
      ...Array.from({ length: 4 }, () => saisirCodeAcces("faux", pool, dependances(base))),
      saisirCodeAcces(code.toString("hex"), pool, dependances(base)),
    ]);
    expect(base.essais.length).toBeLessThanOrEqual(5);
    expect(resultats.filter((r) => !r.ok && r.code === "too_many_attempts")).toHaveLength(1);
    expect(resultats[0]).toEqual({ ok: false, code: "invalid_code" });
  });

  it("base indisponible → indisponible (échec fermé)", async () => {
    const base = baseEssais(T0);
    const enPanne = () => ({
      connect: async () => {
        throw new Error("base");
      },
    });
    expect(await saisirCodeAcces(code.toString("hex"), enPanne, dependances(base))).toEqual({ ok: false, code: "indisponible" });
  });

  it("p0: aucune trace du jeton en base, ni dans la console, les journaux, les résultats ou les erreurs", async () => {
    const base = baseEssais(T0);
    const ecrits: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void ecrits.push(a.map(String).join(" ")));
    vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void ecrits.push(a.map(String).join(" ")));
    vi.spyOn(console, "warn").mockImplementation((...a: unknown[]) => void ecrits.push(a.map(String).join(" ")));
    const formes = [code.toString("hex"), code.toString("base64"), code.toString("base64url")];
    const resultats = [
      await saisirCodeAcces(formes[0], () => base.pool, dependances(base)),
      await saisirCodeAcces(randomBytes(32).toString("hex"), () => base.pool, dependances(base)),
      await saisirCodeAcces(formes[1], () => base.pool, dependances(base, { VERCEL_GIT_COMMIT_REF: "main" })),
    ];
    const traces = [JSON.stringify(base.requetes), ...ecrits, JSON.stringify(resultats), String(resultats.map((r) => Object.values(r).join("|")))];
    for (const trace of traces) for (const forme of formes) expect(trace).not.toContain(forme);
    // Seule la colonne `resultat` est écrite : aucune empreinte, aucun préfixe, aucune longueur.
    const insertions = base.requetes.filter((r) => r.texte.startsWith("INSERT"));
    expect(insertions.length).toBeGreaterThan(0);
    for (const r of insertions) {
      expect(r.texte).toBe("INSERT INTO prototype.run_attempts (resultat) VALUES ($1)");
      expect(r.valeurs).toHaveLength(1);
      expect(["accepte", "refuse"]).toContain(r.valeurs[0]);
    }
    for (const r of base.requetes) for (const valeur of r.valeurs) expect(["accepte", "refuse"]).toContain(valeur);
  });
});
