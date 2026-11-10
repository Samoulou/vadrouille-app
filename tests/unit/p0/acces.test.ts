// @vitest-environment node
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ATTENTE_VERROU_ESSAIS,
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

import type { PoolSql } from "@/server/usage/neon";

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

  it("affichage de la page garde fermée : aucun p0.guard_closed en production ; écrit en préversion (relevé) et par les actions", async () => {
    const lignes: string[] = [];
    vi.spyOn(console, "log").mockImplementation((ligne: unknown) => void lignes.push(String(ligne)));
    const lus = () => lignes.splice(0).map((l) => JSON.parse(l) as unknown);
    // Production : refus de la barrière (VERCEL_ENV du processus), du calcul de l'environnement ou du déploiement.
    vi.stubEnv("VERCEL_ENV", "production");
    for (const env of [preversion(code, { VERCEL_ENV: "production" }), preversion(code, { VADROUILLE_ENV: "production" })]) {
      for (let i = 0; i < 3; i += 1) expect(etatPageAcces(cookie, { env, execArgv: [], maintenant: () => T0 })).toBe("fermee");
    }
    expect(lus()).toEqual([]);
    vi.stubEnv("VERCEL_ENV", "preview");
    // Préversion d'une autre branche : la page écrit le code fermé (outil du relevé de la section 1 point 3).
    const ferme = { env: preversion(code, { VERCEL_GIT_COMMIT_REF: "main" }), execArgv: [], maintenant: () => T0 };
    expect(etatPageAcces(cookie, ferme)).toBe("fermee");
    expect(lus()).toEqual([{ level: "info", event: "p0.guard_closed", guard: "branch_refused" }]);
    expect(await saisirCodeAcces("x", () => baseEssais(T0).pool, ferme)).toEqual({ ok: false, code: "fermee" });
    expect(lus()).toEqual([{ level: "info", event: "p0.guard_closed", guard: "branch_refused" }]);
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

  it("5 refus puis bon code : accepté ; 5 refus puis mauvais code : too_many_attempts sans ligne ; libre une heure après", async () => {
    // Décision 0165 § 1.2 et § 4.1 : seuls les refus sont comptés ; le bon code n'est jamais refusé par le compte.
    const base = baseEssais(T0);
    const pool = () => base.pool;
    for (let i = 0; i < 5; i += 1) expect(await saisirCodeAcces("faux", pool, dependances(base))).toEqual({ ok: false, code: "invalid_code" });
    expect((await saisirCodeAcces(code.toString("hex"), pool, dependances(base))).ok).toBe(true);
    expect(await saisirCodeAcces("faux", pool, dependances(base))).toEqual({ ok: false, code: "too_many_attempts" });
    expect(await saisirCodeAcces(randomBytes(32).toString("hex"), pool, dependances(base))).toEqual({ ok: false, code: "too_many_attempts" });
    expect(base.essais.map((e) => e.resultat)).toEqual(["refuse", "refuse", "refuse", "refuse", "refuse", "accepte"]);
    base.maintenant += HEURE;
    expect(await saisirCodeAcces("faux", pool, dependances(base))).toEqual({ ok: false, code: "invalid_code" });
    expect(base.essais).toHaveLength(7);
    expect((await saisirCodeAcces(code.toString("hex"), pool, dependances(base))).ok).toBe(true);
  });

  it("saisie de plus de 256 caractères : essai refusé et compté ; 6 mauvaises saisies simultanées et le bon code → 5 refus au plus, un too_many_attempts, bon code accepté", async () => {
    const base = baseEssais(T0);
    const pool = () => base.pool;
    const long = "a".repeat(LONGUEUR_SAISIE_MAX + 1);
    const resultats = await Promise.all([
      saisirCodeAcces(long, pool, dependances(base)),
      ...Array.from({ length: 5 }, () => saisirCodeAcces("faux", pool, dependances(base))),
      saisirCodeAcces(code.toString("hex"), pool, dependances(base)),
    ]);
    expect(base.essais.filter((e) => e.resultat === "refuse").length).toBeLessThanOrEqual(5);
    expect(base.essais.filter((e) => e.resultat === "accepte")).toHaveLength(1);
    expect(resultats.filter((r) => !r.ok && r.code === "too_many_attempts")).toHaveLength(1);
    expect(resultats[0]).toEqual({ ok: false, code: "invalid_code" });
    const dernier = resultats.at(-1);
    expect(dernier?.ok).toBe(true);
    if (dernier?.ok) expect(cookieAccesValide(dernier.cookie, code, T0)).toBe(true);
  });

  it("après 5 refus dans l'heure, le bon code (hexadécimal ou base64) est accepté et sa ligne « accepte » écrite, sans verrou ni compte", async () => {
    const base = baseEssais(T0);
    const pool = () => base.pool;
    for (let i = 0; i < 5; i += 1) await saisirCodeAcces(randomBytes(32).toString("hex"), pool, dependances(base));
    expect(await saisirCodeAcces("faux", pool, dependances(base))).toEqual({ ok: false, code: "too_many_attempts" });
    for (const forme of [code.toString("hex"), code.toString("base64")]) {
      const avant = base.requetes.length;
      const resultat = await saisirCodeAcces(forme, pool, dependances(base));
      expect(resultat.ok).toBe(true);
      if (resultat.ok) expect(cookieAccesValide(resultat.cookie, code, T0)).toBe(true);
      // Ordre des requêtes du bon code : ni `pg_advisory_xact_lock`, ni `pg_catalog.count(*)`.
      const textes = base.requetes.slice(avant).map((r) => r.texte);
      expect(textes).toEqual(["BEGIN", "INSERT INTO prototype.run_attempts (resultat) VALUES ($1)", "COMMIT"]);
      expect(base.requetes.slice(avant).map((r) => r.valeurs)).toEqual([[], ["accepte"], []]);
    }
    expect(base.essais.map((e) => e.resultat)).toEqual(["refuse", "refuse", "refuse", "refuse", "refuse", "accepte", "accepte"]);
  });

  it("mauvais code : borne d'attente, verrou, compte des seuls refus, puis ligne « refuse » ; compte illisible → indisponible, sans ligne", async () => {
    const base = baseEssais(T0);
    const avant = base.requetes.length;
    expect(await saisirCodeAcces("faux", () => base.pool, dependances(base))).toEqual({ ok: false, code: "invalid_code" });
    const textes = base.requetes.slice(avant).map((r) => r.texte);
    expect(textes).toHaveLength(6);
    expect(textes[0]).toBe("BEGIN");
    // `lock_timeout` local à la transaction, posé après `BEGIN` et avant le verrou (risque 4 de l'amendement de 0165).
    expect(textes[1]).toBe(`SELECT pg_catalog.set_config('lock_timeout', '${ATTENTE_VERROU_ESSAIS}', true)`);
    expect(textes[2]).toContain("pg_advisory_xact_lock");
    expect(textes[3]).toContain("pg_catalog.count(*)");
    expect(textes[3]).toContain("resultat = 'refuse'");
    expect(textes[4]).toBe("INSERT INTO prototype.run_attempts (resultat) VALUES ($1)");
    expect(textes[5]).toBe("COMMIT");
    const illisible = (): PoolSql => ({
      connect: async () => {
        const client = await base.pool.connect();
        return {
          query: async (texte, valeurs) => (texte.includes("pg_catalog.count(*)") ? { rows: [{ n: "illisible" }] } : client.query(texte, valeurs)),
          release: () => client.release(),
        };
      },
    });
    expect(await saisirCodeAcces("faux", illisible, dependances(base))).toEqual({ ok: false, code: "indisponible" });
    expect(base.essais.map((e) => e.resultat)).toEqual(["refuse"]);
  });

  it("verrou tenu au-delà de la borne d'attente : mauvais code → indisponible, sans compte ni ligne ; le bon code passe", async () => {
    // Risque 4 de l'amendement de 0165 ; revue de #1077, mineur 3 : l'attente du verrou est bornée (`lock_timeout`).
    expect(ATTENTE_VERROU_ESSAIS).toBe("5s");
    const base = baseEssais(T0);
    const pool = () => base.pool;
    base.verrouTenu = true;
    for (const saisie of ["faux", randomBytes(32).toString("hex"), "a".repeat(LONGUEUR_SAISIE_MAX + 1)]) {
      const avant = base.requetes.length;
      expect(await saisirCodeAcces(saisie, pool, dependances(base))).toEqual({ ok: false, code: "indisponible" });
      const textes = base.requetes.slice(avant).map((r) => r.texte);
      expect(textes[0]).toBe("BEGIN");
      expect(textes[1]).toContain("set_config('lock_timeout'");
      expect(textes[2]).toContain("pg_advisory_xact_lock");
      expect(textes.slice(3)).toEqual(["ROLLBACK"]);
    }
    expect(base.requetes.some((r) => r.texte.startsWith("INSERT") || r.texte.includes("pg_catalog.count(*)"))).toBe(false);
    expect(base.essais).toEqual([]);
    // Le bon code ne prend pas le verrou (0165 § 1.2, critère 4 de § 4.1) : accepté même verrou tenu, sans borne posée.
    const avant = base.requetes.length;
    const accepte = await saisirCodeAcces(code.toString("hex"), pool, dependances(base));
    expect(accepte.ok).toBe(true);
    expect(base.requetes.slice(avant).map((r) => r.texte)).toEqual(["BEGIN", "INSERT INTO prototype.run_attempts (resultat) VALUES ($1)", "COMMIT"]);
    expect(base.essais.map((e) => e.resultat)).toEqual(["accepte"]);
    // Verrou libéré : le mauvais code est de nouveau compté.
    base.verrouTenu = false;
    expect(await saisirCodeAcces("faux", pool, dependances(base))).toEqual({ ok: false, code: "invalid_code" });
    expect(base.essais.map((e) => e.resultat)).toEqual(["accepte", "refuse"]);
  });

  it("six bons codes dans l'heure sont tous acceptés (six lignes « accepte »)", async () => {
    const base = baseEssais(T0);
    const pool = () => base.pool;
    for (let i = 0; i < 6; i += 1) expect((await saisirCodeAcces(code.toString("hex"), pool, dependances(base))).ok).toBe(true);
    expect(base.essais.map((e) => e.resultat)).toEqual(Array<string>(6).fill("accepte"));
    expect(base.requetes.some((r) => r.texte.includes("pg_advisory_xact_lock") || r.texte.includes("pg_catalog.count(*)"))).toBe(false);
  });

  it("bon code : insertion ou COMMIT en échec → indisponible, jamais un cookie (échec fermé)", async () => {
    for (const enEchec of ["INSERT", "COMMIT"]) {
      const base = baseEssais(T0);
      const pool = (): PoolSql => ({
        connect: async () => {
          const client = await base.pool.connect();
          return {
            query: async (texte, valeurs) => {
              if (texte.startsWith(enEchec)) throw new Error("base");
              return client.query(texte, valeurs);
            },
            release: () => client.release(),
          };
        },
      });
      expect(await saisirCodeAcces(code.toString("hex"), pool, dependances(base)), enEchec).toEqual({ ok: false, code: "indisponible" });
      expect(base.essais).toEqual([]);
    }
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
