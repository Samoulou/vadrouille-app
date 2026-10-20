// @vitest-environment node
import { randomBytes } from "node:crypto";
import { inspect } from "node:util";

import { describe, expect, it, vi } from "vitest";

import { authAdapterChoice, betterAuthAllowed } from "@/adapters/auth-guard";
import { isProductionDeployment } from "@/dev/flags";
import * as moduleEnv from "@/server/env";
import { assertServerProcessEnv, parseServerEnv, rateLimitSettings, SERVER_ENV_VARIABLES, ServerEnvError, type ServerEnvRule, type ServerEnvVariable } from "@/server/env";
import { resolveServerEnvironment, ServerEnvironmentUndeclaredError } from "@/server/env/resolve";
import { LOG_VARIABLES } from "@/server/log";

import { isProductionForDatabase } from "../../../db/connection";

/**
 * Gardes de configuration du serveur (spécification B3, critères A1, A2 et A13 ; décisions 0050, B3-TL-1 et B3-TL-5,
 * et 0051, points 2, 3 et 6.5). Seul test admis à importer `@/server/env` et `@/server/env/resolve`
 * (`ligne/server-env-imports`). Tout passe par des objets d'environnement injectés, jamais par `process.env`.
 *
 * Les secrets sont tirés à l'exécution (`crypto.randomBytes`), jamais écrits en dur ; les noms des variables secrètes
 * sont des clés d'objet (régime de confinement P0c, « Noms secrets »), relus par `NOM`.
 */

type Env = Record<string, string | undefined>;

/** Noms des variables, par clés d'objet : `NOM.RATE_LIMIT_HMAC_SECRET === "RATE_LIMIT_HMAC_SECRET"`. */
const NOM = Object.fromEntries(SERVER_ENV_VARIABLES.map((nom) => [nom, nom])) as { readonly [K in ServerEnvVariable]: K };

const SENTINELLE = `sentinelle${randomBytes(8).toString("hex")}`;
const aleatoire = (n = 32) => randomBytes(n);
const base64url = (octets: Buffer) => octets.toString("base64url");
const base64 = (octets: Buffer) => octets.toString("base64");
const hex = (octets: Buffer) => octets.toString("hex");

/** Environnement `ci` minimal, plus les variables du cas. */
const ci = (extra: Env = {}): Env => ({ VADROUILLE_ENV: "ci", ...extra });
/**
 * Variables de la connexion réelle (B3b), plus `extra` : secret tiré au hasard, URL de la bibliothèque et de
 * l'application, URL de connexion de `vadrouille_auth` (présence seulement ; valeur factice sans mot de passe).
 */
const connexionReelle = (extra: Env = {}): Env => ({
  AUTH_ADAPTER: "better-auth",
  [NOM.BETTER_AUTH_SECRET]: base64url(aleatoire()),
  [NOM.BETTER_AUTH_URL]: "http://127.0.0.1:3000",
  [NOM.APP_URL]: "http://127.0.0.1:3000",
  [NOM.VADROUILLE_DATABASE_URL_AUTH]: "postgresql://vadrouille_auth@127.0.0.1:5432/vadrouille",
  ...extra,
});

/** Environnement d'un déploiement Vercel (`VERCEL_ENV` déclarée et `VERCEL=1`). */
const vercel = (vercelEnv: string, extra: Env = {}): Env => ({ VERCEL_ENV: vercelEnv, VERCEL: "1", ...extra });

/**
 * Attend un refus de `appel` : `ServerEnvError` de la variable et de la règle attendues, sans `cause` ; ni la
 * sentinelle, ni aucune des valeurs données n'apparaît dans `message`, `stack` ou `util.inspect(error)` (0051, 6.5).
 */
function attendreRefus(appel: () => unknown, variable: ServerEnvVariable, rule: ServerEnvRule, valeurs: readonly string[] = []): void {
  let erreur: unknown;
  try {
    appel();
  } catch (error) {
    erreur = error;
  }
  expect(erreur).toBeInstanceOf(ServerEnvError);
  const refus = erreur as ServerEnvError;
  expect({ variable: refus.variable, rule: refus.rule }).toEqual({ variable, rule });
  expect(refus.cause).toBeUndefined();
  for (const texte of [refus.message, refus.stack ?? "", inspect(refus)]) {
    expect(texte).not.toContain(SENTINELLE);
    for (const valeur of valeurs) if (valeur.trim().length >= 3) expect(texte).not.toContain(valeur.trim());
  }
}

/** Noms d'environnement : présents dans les codes de règle (`production_prefix`), ils ne sont pas des valeurs à chercher. */
const NOMS_ENVIRONNEMENT = new Set(["production", "preview", "development", "staging", "local"]);
const refusParse = (env: Env, variable: ServerEnvVariable, rule: ServerEnvRule) =>
  attendreRefus(
    () => parseServerEnv(env),
    variable,
    rule,
    Object.values(env).filter((v): v is string => v !== undefined && v.length >= 8 && !NOMS_ENVIRONNEMENT.has(v.trim().toLowerCase())),
  );

describe("env: gardes de configuration", () => {
  describe("environnement (resolveServerEnvironment)", () => {
    it("aucune variable, ou des variables vides ou faites d'espaces → refus, sans valeur dans le message", () => {
      for (const env of [{}, { VADROUILLE_ENV: "" }, { VERCEL_ENV: "   " }, { VADROUILLE_ENV: " ", VERCEL_ENV: "\t" }]) {
        expect(() => resolveServerEnvironment(env)).toThrow(ServerEnvironmentUndeclaredError);
        refusParse(env, NOM.VADROUILLE_ENV, "missing");
      }
    });

    it.each([
      [{ VADROUILLE_ENV: "prod" }, "production"],
      [{ VADROUILLE_ENV: " Production " }, "production"],
      [{ VADROUILLE_ENV: "ci", VERCEL_ENV: "production" }, "production"],
      [{ VERCEL_ENV: "preview" }, "staging"],
      [{ VADROUILLE_ENV: "local", VERCEL_ENV: "preview" }, "staging"],
      [{ VERCEL_ENV: "development" }, "local"],
      [{ VADROUILLE_ENV: "local" }, "local"],
      [{ VADROUILLE_ENV: "CI" }, "ci"],
      [{ VADROUILLE_ENV: "staging" }, "staging"],
      [{ VADROUILLE_ENV: "inconnu" }, "production"],
      [{ VADROUILLE_ENV: "ci", VERCEL_ENV: "inconnu" }, "production"],
      [{ VADROUILLE_ENV: "constructor" }, "production"],
      [{ VADROUILLE_ENV: "__proto__" }, "production"],
    ] as const)("%o → %s", (env, attendu) => {
      expect(resolveServerEnvironment(env)).toBe(attendu);
      expect(parseServerEnv(env).environment).toBe(attendu);
    });
  });

  describe("secrets (B3-TL-5, 0051 point 3)", () => {
    const hmac = (valeur: string, extra: Env = {}) => ci({ [NOM.RATE_LIMIT_HMAC_SECRET]: valeur, ...extra });
    const accepte = (valeur: string) => parseServerEnv(hmac(valeur)).rateLimitHmacSecret;
    const refuse = (valeur: string, rule: ServerEnvRule) => refusParse(hmac(valeur), NOM.RATE_LIMIT_HMAC_SECRET, rule);

    it("32 octets aléatoires → acceptés ; 31 octets → refus", () => {
      const octets = aleatoire();
      expect(accepte(base64url(octets))).toEqual(octets);
      refuse(base64url(aleatoire(31)), "secret_too_short");
    });

    it("64 caractères hexadécimaux aléatoires → lus en hexadécimal (32 octets), acceptés ; majuscules mêlées → acceptés", () => {
      const octets = aleatoire();
      expect(accepte(hex(octets))?.length).toBe(32);
      expect(accepte(hex(octets))).toEqual(octets);
      const mele = [...hex(octets)].map((c, i) => (i % 2 === 0 ? c.toUpperCase() : c)).join("");
      expect(accepte(mele)).toEqual(octets);
    });

    it("65 caractères hexadécimaux (longueur impaire) → refus ; 32 caractères hexadécimaux → 16 octets, refus", () => {
      refuse(`${hex(aleatoire())}a`, "secret_encoding");
      refuse(hex(aleatoire(16)), "secret_too_short");
    });

    it("44 caractères tous hexadécimaux → lus en hexadécimal (22 octets), refus", () => {
      refuse(hex(aleatoire(22)), "secret_too_short");
    });

    it("base64 laxiste refusé : \\n interne, caractère hors alphabet, mélange de + et de -", () => {
      const url = base64url(aleatoire());
      refuse(`${url.slice(0, 20)}\n${url.slice(20)}`, "secret_encoding");
      refuse(`${url.slice(0, 20)}*${url.slice(21)}`, "secret_encoding");
      const b64 = base64(aleatoire());
      refuse(`${b64.slice(0, 3)}+${b64.slice(4, 7)}-${b64.slice(8)}`, "secret_encoding");
      refuse(`${url.slice(0, 20)}=`, "secret_encoding");
    });

    it("bits de fin non nuls (aller-retour inexact) → refus", () => {
      const url = base64url(aleatoire());
      const dernier = url.at(-1) ?? "A";
      // 32 octets en base64url : 43 caractères, les 2 derniers bits du dernier sont nuls ; « B » les rend non nuls.
      const altere = `${url.slice(0, -1)}${dernier === "B" ? "C" : "B"}`;
      refuse(altere, "secret_encoding");
    });

    it("43 caractères base64url de randomBytes(32) et 44 caractères de openssl rand -base64 32 → acceptés", () => {
      const a = aleatoire();
      const b = aleatoire();
      expect(base64url(a)).toHaveLength(43);
      expect(base64(b)).toHaveLength(44);
      expect(accepte(base64url(a))).toEqual(a);
      expect(accepte(base64(b))).toEqual(b);
    });

    it("un seul caractère répété → refus", () => {
      refuse("a".repeat(64), "secret_trivial");
      refuse("z".repeat(44), "secret_trivial");
    });

    it("valeurs de la liste des mots triviaux, répétées jusqu'à la longueur → refus", () => {
      for (const mot of Object.keys({ changeme: 0, secret: 0, password: 0, test: 0, example: 0, vadrouille: 0 })) {
        const valeur = mot.repeat(Math.ceil(48 / mot.length)).slice(0, 48);
        let erreur: unknown;
        try {
          parseServerEnv(hmac(valeur));
        } catch (error) {
          erreur = error;
        }
        expect(erreur, mot).toBeInstanceOf(ServerEnvError);
        expect((erreur as ServerEnvError).variable).toBe(NOM.RATE_LIMIT_HMAC_SECRET);
      }
    });

    it("motifs sur les octets décodés (0051 point 3.4) → refus", () => {
      refuse(base64(Buffer.from("0123456789abcdef".repeat(2), "latin1")), "secret_trivial");
      refuse(hex(Buffer.from(Array.from({ length: 32 }, (_, i) => i))), "secret_trivial");
      refuse(base64(Buffer.from("changeme".repeat(4), "latin1")), "secret_trivial");
      refuse(hex(Buffer.from(Array.from({ length: 32 }, (_, i) => 255 - 3 * i))), "secret_trivial");
    });

    it("moins de 16 octets distincts → refus", () => {
      const peu = Buffer.from(Array.from({ length: 48 }, () => 1 + (randomBytes(1)[0] ?? 0) % 8));
      refuse(base64url(peu), "secret_trivial");
    });

    it("deux secrets identiques, ou les mêmes octets en hexadécimal et en base64 → secret_duplicate", () => {
      const octets = aleatoire();
      refusParse(hmac(hex(octets), { [NOM.BETTER_AUTH_SECRET]: base64(octets) }), NOM.BETTER_AUTH_SECRET, "secret_duplicate");
      refusParse(hmac(base64url(octets), { [NOM.SIMULATED_WEBHOOK_SECRET]: base64url(octets) }), NOM.SIMULATED_WEBHOOK_SECRET, "secret_duplicate");
      expect(parseServerEnv(hmac(base64url(octets), { [NOM.BETTER_AUTH_SECRET]: base64url(aleatoire()) })).rateLimitHmacSecret).toEqual(octets);
    });

    it("les secrets de B3b et B4, s'ils sont présents, sont contrôlés dès B3a", () => {
      refusParse(ci({ [NOM.BETTER_AUTH_SECRET]: hex(aleatoire(16)) }), NOM.BETTER_AUTH_SECRET, "secret_too_short");
      refusParse(ci({ [NOM.BETTER_AUTH_SECRET]: `${SENTINELLE}#` }), NOM.BETTER_AUTH_SECRET, "secret_encoding");
      refusParse(ci({ [NOM.SIMULATED_WEBHOOK_SECRET]: "a".repeat(64) }), NOM.SIMULATED_WEBHOOK_SECRET, "secret_trivial");
    });

    it("une valeur sentinelle refusée n'apparaît ni dans le message, ni dans la pile, ni dans util.inspect", () => {
      attendreRefus(() => parseServerEnv(hmac(`${SENTINELLE}!`)), NOM.RATE_LIMIT_HMAC_SECRET, "secret_encoding", [SENTINELLE]);
    });

    it("l'objet rendu ne porte aucune chaîne secrète, et il est figé", () => {
      const valeur = base64url(aleatoire());
      const config = parseServerEnv(hmac(valeur));
      expect(Object.isFrozen(config)).toBe(true);
      expect(JSON.stringify(config)).not.toContain(valeur);
      expect(inspect(config, { depth: 5 })).not.toContain(valeur);
    });

    it("secret du limiteur absent → démarrage accepté, limiteur refusé à l'usage (missing)", () => {
      const config = parseServerEnv(ci());
      expect(config.rateLimitHmacSecret).toBeNull();
      attendreRefus(() => rateLimitSettings(config), NOM.RATE_LIMIT_HMAC_SECRET, "missing");
    });
  });

  describe("TRUSTED_IP_HEADER (B3a point 5, 0051 point 2)", () => {
    const secret = () => ({ [NOM.RATE_LIMIT_HMAC_SECRET]: base64url(aleatoire()) });

    it("absent en staging → démarrage accepté, limiteur refusé à l'usage ; absent en local → compartiment commun", () => {
      const staging = parseServerEnv(vercel("preview", secret()));
      expect(staging.trustedIpHeader).toBeNull();
      attendreRefus(() => rateLimitSettings(staging), NOM.TRUSTED_IP_HEADER, "missing");
      const production = parseServerEnv({ VADROUILLE_ENV: "production", ...secret() });
      attendreRefus(() => rateLimitSettings(production), NOM.TRUSTED_IP_HEADER, "missing");
      const local = parseServerEnv({ VADROUILLE_ENV: "local", ...secret() });
      expect(rateLimitSettings(local).trustedIpHeader).toBeNull();
      expect(rateLimitSettings(parseServerEnv(ci(secret()))).trustedIpHeader).toBeNull();
    });

    it.each(["x-vercel-forwarded-for", " X-Vercel-Forwarded-For "])("%o → accepté en ci, et en staging ou production derrière Vercel", (entete) => {
      expect(parseServerEnv(ci({ TRUSTED_IP_HEADER: entete })).trustedIpHeader).toBe("x-vercel-forwarded-for");
      expect(parseServerEnv(vercel("preview", { TRUSTED_IP_HEADER: entete })).trustedIpHeader).toBe("x-vercel-forwarded-for");
      expect(parseServerEnv(vercel("production", { TRUSTED_IP_HEADER: entete })).trustedIpHeader).toBe("x-vercel-forwarded-for");
      expect(parseServerEnv(vercel("preview", { VERCEL: " 1 ", TRUSTED_IP_HEADER: entete })).trustedIpHeader).toBe("x-vercel-forwarded-for");
    });

    it("staging avec VERCEL_ENV=preview sans VERCEL, ou VERCEL différent de 1 → refus", () => {
      refusParse({ VERCEL_ENV: "preview", TRUSTED_IP_HEADER: "x-vercel-forwarded-for" }, NOM.TRUSTED_IP_HEADER, "header_outside_vercel");
      refusParse(vercel("preview", { VERCEL: "true", TRUSTED_IP_HEADER: "x-vercel-forwarded-for" }), NOM.TRUSTED_IP_HEADER, "header_outside_vercel");
    });

    it("en local → refus ; en production par VADROUILLE_ENV=production seule (image Docker) → refus", () => {
      refusParse({ VADROUILLE_ENV: "local", TRUSTED_IP_HEADER: "x-vercel-forwarded-for" }, NOM.TRUSTED_IP_HEADER, "header_outside_vercel");
      refusParse({ VADROUILLE_ENV: "production", TRUSTED_IP_HEADER: "x-vercel-forwarded-for" }, NOM.TRUSTED_IP_HEADER, "header_outside_vercel");
      refusParse({ VADROUILLE_ENV: "production", VERCEL: "1", TRUSTED_IP_HEADER: "x-vercel-forwarded-for" }, NOM.TRUSTED_IP_HEADER, "header_outside_vercel");
    });

    it("x-forwarded-for, x-real-ip, forwarded, cf-connecting-ip → refus dans les quatre environnements", () => {
      const environnements: Env[] = [{ VADROUILLE_ENV: "local" }, ci(), vercel("preview"), vercel("production")];
      for (const entete of ["x-forwarded-for", "x-real-ip", "forwarded", "cf-connecting-ip", `x-${SENTINELLE}`]) {
        for (const env of environnements) refusParse({ ...env, TRUSTED_IP_HEADER: entete }, NOM.TRUSTED_IP_HEADER, "untrusted_header");
      }
    });
  });

  describe("processus serveur (assertServerProcessEnv)", () => {
    const migrateur = (valeur: string): Env => ci({ [NOM.VADROUILLE_DATABASE_URL_MIGRATOR]: valeur });
    const admin = (valeur: string): Env => ci({ VADROUILLE_DB_ADMIN_URL: valeur });
    const url = `postgres://vadrouille_migrator:${SENTINELLE}@127.0.0.1:5432/vadrouille`;

    it("URL du migrateur présente → refus ; vide → accepté", () => {
      attendreRefus(() => assertServerProcessEnv(migrateur(url)), NOM.VADROUILLE_DATABASE_URL_MIGRATOR, "forbidden", [url]);
      expect(() => assertServerProcessEnv(migrateur(""))).not.toThrow();
      expect(() => assertServerProcessEnv(migrateur("  "))).not.toThrow();
    });

    it("VADROUILLE_DB_ADMIN_URL présente → refus (lecture de présence, aucune valeur rendue) ; vide → accepté", () => {
      attendreRefus(() => assertServerProcessEnv(admin(url)), NOM.VADROUILLE_DB_ADMIN_URL, "forbidden", [url]);
      expect(() => assertServerProcessEnv(admin(""))).not.toThrow();
    });

    it("parseServerEnv avec ces deux variables présentes → accepté (garde absente hors du serveur)", () => {
      const config = parseServerEnv(ci({ [NOM.VADROUILLE_DATABASE_URL_MIGRATOR]: url, VADROUILLE_DB_ADMIN_URL: url }));
      expect(inspect(config)).not.toContain(SENTINELLE);
    });

    it("environnement non déclaré → refus", () => {
      attendreRefus(() => assertServerProcessEnv({}), NOM.VADROUILLE_ENV, "missing");
    });

    it("ci + en-tête + HOSTNAME absente ou 0.0.0.0 → refus ; 127.0.0.1, ::1, localhost → accepté ; sans en-tête → accepté", () => {
      const entete = { TRUSTED_IP_HEADER: "x-vercel-forwarded-for" };
      attendreRefus(() => assertServerProcessEnv(ci(entete)), NOM.TRUSTED_IP_HEADER, "header_outside_vercel");
      attendreRefus(() => assertServerProcessEnv(ci({ ...entete, HOSTNAME: "0.0.0.0" })), NOM.TRUSTED_IP_HEADER, "header_outside_vercel");
      attendreRefus(() => assertServerProcessEnv(ci({ ...entete, HOSTNAME: SENTINELLE })), NOM.TRUSTED_IP_HEADER, "header_outside_vercel", [SENTINELLE]);
      for (const hote of ["127.0.0.1", " 127.0.0.1 ", "::1", "localhost"]) expect(() => assertServerProcessEnv(ci({ ...entete, HOSTNAME: hote })), hote).not.toThrow();
      expect(() => assertServerProcessEnv(ci({ HOSTNAME: "0.0.0.0" }))).not.toThrow();
      expect(() => assertServerProcessEnv(vercel("preview", { ...entete, HOSTNAME: "0.0.0.0" }))).not.toThrow();
    });
  });

  describe("Stripe (préfixes de production)", () => {
    const stripe = (nom: string, valeur: string, base: Env = ci()) => ({ ...base, [nom]: valeur });
    const environnements: Env[] = [{ VADROUILLE_ENV: "local" }, ci(), vercel("preview"), vercel("production")];
    const [STRIPE_AUTRE = ""] = Object.keys({ STRIPE_RESTRICTED_KEY: 0 });

    it("sk_live_, SK_LIVE_ avec espaces, rk_live_ → refus dans les quatre environnements", () => {
      for (const env of environnements) {
        for (const valeur of [`sk_live_${SENTINELLE}`, ` SK_LIVE_${SENTINELLE}`, `rk_live_${SENTINELLE}`]) {
          refusParse(stripe(NOM.STRIPE_SECRET_KEY, valeur, env), NOM.STRIPE_SECRET_KEY, "production_prefix");
        }
      }
    });

    it("clé publiable à pk_live_ ou PK_LIVE_ → refus ; autre variable Stripe de production → refus", () => {
      refusParse(stripe(NOM.STRIPE_PUBLISHABLE_KEY, `pk_live_${SENTINELLE}`), NOM.STRIPE_PUBLISHABLE_KEY, "production_prefix");
      refusParse(stripe(NOM.STRIPE_PUBLISHABLE_KEY, `PK_LIVE_${SENTINELLE}`), NOM.STRIPE_PUBLISHABLE_KEY, "production_prefix");
      refusParse(stripe(STRIPE_AUTRE, `rk_live_${SENTINELLE}`), NOM["STRIPE_*"], "production_prefix");
    });

    it("clé secrète Stripe à abc (ni test ni live) → refus ; sk_test_ → accepté ; absente → accepté", () => {
      refusParse(stripe(NOM.STRIPE_SECRET_KEY, "abc"), NOM.STRIPE_SECRET_KEY, "invalid_value");
      expect(() => parseServerEnv(stripe(NOM.STRIPE_SECRET_KEY, `sk_test_${SENTINELLE}`))).not.toThrow();
      expect(() => parseServerEnv(ci())).not.toThrow();
      expect(inspect(parseServerEnv(stripe(NOM.STRIPE_SECRET_KEY, `sk_test_${SENTINELLE}`)))).not.toContain(SENTINELLE);
    });
  });

  it("SIMULATED_WEBHOOK_ENABLED=true en production → refus ; ailleurs → accepté", () => {
    refusParse({ VADROUILLE_ENV: "production", SIMULATED_WEBHOOK_ENABLED: "true" }, NOM.SIMULATED_WEBHOOK_ENABLED, "forbidden");
    refusParse(vercel("production", { SIMULATED_WEBHOOK_ENABLED: " TRUE " }), NOM.SIMULATED_WEBHOOK_ENABLED, "forbidden");
    expect(() => parseServerEnv(ci({ SIMULATED_WEBHOOK_ENABLED: "true" }))).not.toThrow();
  });

  describe("AUTH_ADAPTER", () => {
    it("inconnu → refus ; better-auth → refus en staging et production (B3-TL-2, B3b) ; mock, absent ou vide → accepté", () => {
      refusParse(ci({ AUTH_ADAPTER: `x${SENTINELLE}` }), NOM.AUTH_ADAPTER, "invalid_value");
      refusParse({ VADROUILLE_ENV: "staging", ...connexionReelle() }, NOM.AUTH_ADAPTER, "forbidden");
      refusParse({ VADROUILLE_ENV: "production", ...connexionReelle() }, NOM.AUTH_ADAPTER, "forbidden");
      expect(parseServerEnv(ci(connexionReelle())).authAdapter).toBe("better-auth");
      for (const valeur of [undefined, "", "  ", "mock", " mock "]) expect(parseServerEnv(ci({ AUTH_ADAPTER: valeur })).authAdapter).toBe("mock");
    });

    it("même choix normalisé que authAdapterChoice (src/adapters/auth-guard.ts) : accepté en ci si et seulement si mock ou better-auth", () => {
      for (const valeur of [undefined, "", " ", "mock", " mock ", "Mock", "MOCK", "better-auth", " better-auth ", "Better-Auth", "api", "mock2"]) {
        const accepte = (() => {
          try {
            parseServerEnv(ci({ ...connexionReelle(), AUTH_ADAPTER: valeur }));
            return true;
          } catch {
            return false;
          }
        })();
        const choix = authAdapterChoice({ NODE_ENV: "test", AUTH_ADAPTER: valeur });
        expect(accepte, String(valeur)).toBe(choix === "mock" || choix === "better-auth");
      }
    });
  });

  describe("B3b : connexion réelle et envoi (critère B16 ; décision 0077 § 5.1)", () => {
    it("AUTH_ADAPTER=better-auth en staging ou production → refus (forbidden), Vercel compris", () => {
      refusParse(vercel("preview", connexionReelle()), NOM.AUTH_ADAPTER, "forbidden");
      refusParse(vercel("production", connexionReelle()), NOM.AUTH_ADAPTER, "forbidden");
      refusParse({ VADROUILLE_ENV: "staging", ...connexionReelle({ [NOM.BETTER_AUTH_SECRET]: undefined }) }, NOM.AUTH_ADAPTER, "forbidden");
    });

    it("better-auth en local ou ci : secret de Better Auth absent → refus au démarrage ; variables requises absentes ou invalides → refus", () => {
      for (const environnement of ["local", "ci"]) {
        const env = (extra: Env = {}): Env => ({ VADROUILLE_ENV: environnement, ...connexionReelle(extra) });
        refusParse(env({ [NOM.BETTER_AUTH_SECRET]: undefined }), NOM.BETTER_AUTH_SECRET, "missing");
        refusParse(env({ [NOM.BETTER_AUTH_SECRET]: "  " }), NOM.BETTER_AUTH_SECRET, "missing");
        refusParse(env({ [NOM.BETTER_AUTH_URL]: undefined }), NOM.BETTER_AUTH_URL, "missing");
        refusParse(env({ [NOM.APP_URL]: "" }), NOM.APP_URL, "missing");
        refusParse(env({ [NOM.VADROUILLE_DATABASE_URL_AUTH]: undefined }), NOM.VADROUILLE_DATABASE_URL_AUTH, "missing");
        for (const invalide of [`ftp://${SENTINELLE}.test`, `${SENTINELLE}`, `http://u:${SENTINELLE}@127.0.0.1:3000`, "http://127.0.0.1:3000/chemin", "javascript:alert(1)"]) {
          refusParse(env({ [NOM.BETTER_AUTH_URL]: invalide }), NOM.BETTER_AUTH_URL, "invalid_value");
          refusParse(env({ [NOM.APP_URL]: invalide }), NOM.APP_URL, "invalid_value");
        }
        const secret = aleatoire();
        const config = parseServerEnv(env({ [NOM.BETTER_AUTH_SECRET]: hex(secret), [NOM.BETTER_AUTH_URL]: " http://127.0.0.1:3100/ " }));
        expect(config.authAdapter).toBe("better-auth");
        expect(config.betterAuth?.environment).toBe(environnement);
        expect(config.betterAuth?.secret.equals(secret)).toBe(true);
        expect(config.betterAuth?.baseUrl).toBe("http://127.0.0.1:3100");
        expect(config.betterAuth?.appUrl).toBe("http://127.0.0.1:3000");
        expect(Object.isFrozen(config.betterAuth)).toBe(true);
        expect(JSON.stringify(config)).not.toContain(hex(secret));
        expect(inspect(config, { depth: 5 })).not.toContain(hex(secret));
      }
    });

    it("variables lues par Better Auth (origines, télémétrie, secrets de repli) présentes → refus dans les quatre environnements, mock compris (décision 0082)", () => {
      const noms = [
        NOM.BETTER_AUTH_TRUSTED_ORIGINS,
        NOM.BETTER_AUTH_TELEMETRY,
        NOM.BETTER_AUTH_TELEMETRY_ENDPOINT,
        NOM.BETTER_AUTH_TELEMETRY_ID,
        NOM.BETTER_AUTH_TELEMETRY_DEBUG,
        NOM.BETTER_AUTH_SECRETS,
        NOM.AUTH_SECRET,
      ];
      const espions = [vi.spyOn(console, "log"), vi.spyOn(console, "error"), vi.spyOn(console, "warn")];
      try {
        for (const env of [ci(), { VADROUILLE_ENV: "local" }, vercel("preview"), vercel("production")]) {
          for (const nom of noms) {
            for (const valeur of [SENTINELLE, ""]) {
              attendreRefus(() => parseServerEnv({ ...env, [nom]: valeur }), nom, "forbidden", [SENTINELLE]);
            }
            refusParse({ ...env, [NOM.AUTH_ADAPTER]: "mock", [nom]: "1" }, nom, "forbidden");
          }
        }
        for (const nom of noms) refusParse({ ...ci(), ...connexionReelle(), [nom]: "1" }, nom, "forbidden");
        const ecrit = espions.flatMap((espion) => espion.mock.calls.flat()).map(String).join("\n");
        expect(ecrit).not.toContain(SENTINELLE);
      } finally {
        for (const espion of espions) espion.mockRestore();
      }
    });

    it("secret de Better Auth égal au secret du limiteur → refus (secret_duplicate)", () => {
      const octets = aleatoire();
      refusParse(ci(connexionReelle({ [NOM.RATE_LIMIT_HMAC_SECRET]: base64url(octets), [NOM.BETTER_AUTH_SECRET]: hex(octets) })), NOM.BETTER_AUTH_SECRET, "secret_duplicate");
    });

    it("AUTH_ADAPTER=mock et secret de Better Auth trivial → refus (un secret présent est toujours validé, 0051 § 3.6)", () => {
      refusParse(ci({ AUTH_ADAPTER: "mock", [NOM.BETTER_AUTH_SECRET]: "changeme".repeat(6) }), NOM.BETTER_AUTH_SECRET, "secret_trivial");
      const config = parseServerEnv(ci({ AUTH_ADAPTER: "mock", [NOM.BETTER_AUTH_SECRET]: base64url(aleatoire()), [NOM.BETTER_AUTH_URL]: "pas une adresse" }));
      expect(config.betterAuth).toBeNull();
    });
  });

  it("une erreur inattendue de forme (valeur non textuelle) est refusée sans la valeur", () => {
    const env = { ...ci(), TRUSTED_IP_HEADER: 42 } as unknown as Env;
    attendreRefus(() => parseServerEnv(env), NOM.TRUSTED_IP_HEADER, "invalid_value");
  });
});

describe("env: gardes de configuration (B3b-envoi : EMAIL_TRANSPORT et SMTP_URL, décision 0098 § 4)", () => {
  const TRANSPORT = NOM.EMAIL_TRANSPORT;
  const URL_SMTP = NOM.SMTP_URL;
  /** Environnement de la connexion réelle avec le transport SMTP, plus `extra` (qui peut retirer ou remplacer). */
  const smtp = (url: string | undefined, environnement = "ci", extra: Env = {}): Env => ({
    VADROUILLE_ENV: environnement,
    ...connexionReelle(),
    [TRANSPORT]: "smtp",
    [URL_SMTP]: url,
    ...extra,
  });

  /** Refus avec journaux capturés : ni la sentinelle ni la valeur n'y figurent (0098 § 4, cas de test de E2). */
  function refus(env: Env, variable: ServerEnvVariable, rule: ServerEnvRule): void {
    const espions = [vi.spyOn(console, "log"), vi.spyOn(console, "error"), vi.spyOn(console, "warn")];
    try {
      attendreRefus(
        () => parseServerEnv(env),
        variable,
        rule,
        Object.values(env).filter((v): v is string => v !== undefined && v.length >= 8 && !NOMS_ENVIRONNEMENT.has(v.trim().toLowerCase())),
      );
      const ecrit = espions.flatMap((espion) => espion.mock.calls.flat()).map(String).join("\n");
      expect(ecrit).not.toContain(SENTINELLE);
    } finally {
      for (const espion of espions) espion.mockRestore();
    }
  }

  it("sans EMAIL_TRANSPORT ni SMTP_URL : port désactivé, `smtp` vaut null (B3b-envoi-PO-2)", () => {
    expect(parseServerEnv(ci()).smtp).toBeNull();
    expect(parseServerEnv({ VADROUILLE_ENV: "local", ...connexionReelle() }).smtp).toBeNull();
    expect(parseServerEnv({ VADROUILLE_ENV: "production" }).smtp).toBeNull();
  });

  it("EMAIL_TRANSPORT=smtp sans SMTP_URL → refus ; SMTP_URL sans EMAIL_TRANSPORT → refus (même vide)", () => {
    refus(smtp(undefined), URL_SMTP, "missing");
    refus(smtp(undefined, "local"), URL_SMTP, "missing");
    for (const environnement of ["ci", "local"]) {
      for (const valeur of ["smtp://127.0.0.1:1025", `smtp://u:${SENTINELLE}@127.0.0.1:1025`, "", "   ", SENTINELLE]) {
        refus({ VADROUILLE_ENV: environnement, ...connexionReelle(), [URL_SMTP]: valeur }, URL_SMTP, "forbidden");
        refus({ VADROUILLE_ENV: environnement, [URL_SMTP]: valeur }, URL_SMTP, "forbidden");
      }
    }
  });

  it("EMAIL_TRANSPORT : exactement `smtp` après trim() ; SMTP, ses, resend, vide → refus", () => {
    for (const valeur of ["ses", "resend", "SMTP", "Smtp", "", "   ", "smtp,ses", `smtp${SENTINELLE}`, SENTINELLE]) {
      refus(smtp("smtp://127.0.0.1:1025", "ci", { [TRANSPORT]: valeur }), TRANSPORT, "invalid_value");
      // Une valeur inconnue passe avant le contrôle de l'adresse du transport.
      refus(smtp(undefined, "ci", { [TRANSPORT]: valeur }), TRANSPORT, "invalid_value");
    }
    expect(parseServerEnv(smtp("smtp://127.0.0.1:1025", "ci", { [TRANSPORT]: " smtp " })).smtp).toEqual({ host: "127.0.0.1", port: 1025 });
  });

  it("EMAIL_TRANSPORT=smtp avec AUTH_ADAPTER=mock, absent ou vide → refus", () => {
    for (const adaptateur of ["mock", "", undefined]) {
      refus({ VADROUILLE_ENV: "ci", AUTH_ADAPTER: adaptateur, [TRANSPORT]: "smtp", [URL_SMTP]: "smtp://127.0.0.1:1025" }, TRANSPORT, "forbidden");
    }
  });

  it("staging, production et Vercel, quelle que soit VADROUILLE_ENV : l'une ou l'autre variable présente → refus, valeur non examinée", () => {
    const valeurs = ["smtp", "smtp://127.0.0.1:1025", "", "   ", `smtp://u:${SENTINELLE}@smtp.exemple.test:587`, SENTINELLE];
    const deploiements: Env[] = [
      { VADROUILLE_ENV: "staging" },
      { VADROUILLE_ENV: "production" },
      vercel("preview"),
      vercel("production"),
      // Déclaration de l'opérateur fausse : Vercel prime sur VADROUILLE_ENV=local ou ci.
      vercel("preview", { VADROUILLE_ENV: "ci" }),
      vercel("preview", { VADROUILLE_ENV: "local" }),
      vercel("development", { VADROUILLE_ENV: "ci" }),
      vercel("development", { VADROUILLE_ENV: "local" }),
      vercel("development"),
    ];
    for (const base of deploiements) {
      for (const valeur of valeurs) {
        refus({ ...base, [TRANSPORT]: valeur }, TRANSPORT, "forbidden");
        refus({ ...base, [URL_SMTP]: valeur }, URL_SMTP, "forbidden");
        refus({ ...base, ...connexionReelle(), [TRANSPORT]: "smtp", [URL_SMTP]: valeur }, TRANSPORT, "forbidden");
        refus({ ...base, [TRANSPORT]: "smtp", [URL_SMTP]: valeur }, TRANSPORT, "forbidden");
      }
    }
  });

  it("SMTP_URL acceptée : forme stricte, liste fermée ; hôte rendu = constante de la liste, port entier", () => {
    const acceptes: [string, string, "localhost" | "127.0.0.1" | "::1", number][] = [
      ["smtp://127.0.0.1:1025", "ci", "127.0.0.1", 1025],
      ["smtp://127.0.0.1:1025", "local", "127.0.0.1", 1025],
      ["smtp://[::1]:1025", "ci", "::1", 1025],
      ["smtp://[0:0:0:0:0:0:0:1]:1025", "local", "::1", 1025],
      ["smtp://[0000:0000:0000:0000:0000:0000:0000:0001]:2525", "ci", "::1", 2525],
      ["smtp://LocalHost:1025", "ci", "localhost", 1025],
      ["smtp://LOCALHOST:1025", "local", "localhost", 1025],
      ["smtp://localhost:1025/", "local", "localhost", 1025],
      ["smtp://localhost:65535", "ci", "localhost", 65535],
      ["smtp://localhost:1", "ci", "localhost", 1],
      ["  smtp://127.0.0.1:1025  ", "ci", "127.0.0.1", 1025],
    ];
    for (const [url, environnement, host, port] of acceptes) {
      const config = parseServerEnv(smtp(url, environnement));
      expect(config.smtp, url).toEqual({ host, port });
      expect(Object.isFrozen(config.smtp), url).toBe(true);
      expect(Object.keys(config.smtp ?? {}).sort()).toEqual(["host", "port"]);
    }
  });

  it("SMTP_URL refusée → invalid_value en local comme en ci, sans valeur dans l'erreur ni le journal", () => {
    const refusees = [
      // Spécification B3b-envoi, critère E2.
      "smtp://smtp.exemple.test:587",
      "smtp://localhost.exemple.test:25",
      "smtp://127.1:1025",
      "smtps://localhost:465",
      "smtp://localhost",
      "smtp://utilisateur:motdepasse@localhost:1025",
      "smtp://u@localhost:1025",
      "smtp://localhost:1025/?host=smtp.exemple.test",
      "smtp://localhost:1025?host=smtp.exemple.test",
      "smtp://localhost:1025?logger=true",
      "smtp://localhost:1025?",
      "smtp://localhost:1025#x",
      "smtp://localhost:1025#",
      "smtp://local\thost:1025",
      "smtp://localhost:1025/chemin",
      // Décision 0098 § 4 : écarts de la règle de la spécification, fermés par la forme de la chaîne brute.
      "smtp://:@localhost:1025",
      "smtp://localhost:1025/%2e",
      "smtp://127.0.0.1:1025/.",
      "smtp://localhost:001025",
      "smtp://localhost:01025",
      "smtp://localhost:0",
      "smtp://localhost:99999",
      "smtp://localhost:65536",
      "SMTP://localhost:1025",
      "Smtp://localhost:1025",
      "smtp://local%68ost:1025",
      "smtp://localhost:1025\\@x.test",
      "smtp://[::ffff:127.0.0.1]:1025",
      "smtp://localhost.:1025",
      "smtp://127.0.0.1.:1025",
      "smtp://localhost:1025//",
      "smtp://ｌocalhost:1025",
      "smtp://localhost:１０２５",
      "smtp:localhost:1025",
      "smtp:/localhost:1025",
      "direct://localhost:1025",
      "smtp://local\nhost:1025",
      "smtp://localhost:1025\n/",
      "smtp://local host:1025",
      "smtp://[::1]:1025?x=1",
      "smtp://[::2]:1025",
      "smtp://[::1:1025",
      "smtp://0.0.0.0:1025",
      "smtp://10.0.0.1:1025",
      "smtp://mailpit.:1025",
      "localhost:1025",
      "127.0.0.1",
      "",
      "   ",
      SENTINELLE,
      `smtp://${SENTINELLE}.exemple.test:25`,
      `smtp://localhost:1025/${SENTINELLE}`,
      `smtp://u:${SENTINELLE}@localhost:1025`,
    ];
    for (const url of refusees) {
      for (const environnement of ["local", "ci"]) refus(smtp(url, environnement), URL_SMTP, "invalid_value");
    }
  });

  it("`mailpit` et `mailpit.` : hors de la liste fermée (0098 § 2.4), refusés en local et en ci", () => {
    for (const url of ["smtp://mailpit:1025", "smtp://MAILPIT:1025/", "smtp://mailpit.:1025"]) {
      for (const environnement of ["local", "ci"]) refus(smtp(url, environnement), URL_SMTP, "invalid_value");
    }
  });

  it("le résultat ne porte pas la chaîne brute : seuls `host` et `port`, aucune sentinelle", () => {
    const config = parseServerEnv(smtp("  smtp://LocalHost:1025/  ", "ci", { RATE_LIMIT_HMAC_SECRET: base64url(aleatoire()) }));
    expect(config.smtp).toEqual({ host: "localhost", port: 1025 });
    expect(JSON.stringify(config)).not.toContain("smtp://");
    expect(inspect(config, { depth: 6 })).not.toContain("LocalHost");
  });
});

describe("env: mode réel du prototype (P0r3b ; décision 0055, section 1 point 2)", () => {
  const code = () => ({ [NOM.P0_RUN_TOKEN]: hex(aleatoire()) });

  it("toute variable P0_* présente en production → forbidden, libellé P0_* (jamais le nom exact ni la valeur)", () => {
    const [INVENTEE = ""] = Object.keys({ P0_X: 0 });
    for (const base of [vercel("production"), { VADROUILLE_ENV: "production" }, { VADROUILLE_ENV: "ci", VERCEL_ENV: "production" }]) {
      refusParse({ ...base, P0_REAL_RUNS: "enabled" }, NOM["P0_*"], "forbidden");
      refusParse({ ...base, ...code() }, NOM["P0_*"], "forbidden");
      refusParse({ ...base, [INVENTEE]: SENTINELLE }, NOM["P0_*"], "forbidden");
    }
    // Clé présente, valeur vide ou faite d'espaces : refus aussi (présence de la clé seulement, sans trim()).
    for (const valeur of ["", " ", "\t\n"]) {
      refusParse({ ...vercel("production"), P0_REAL_RUNS: valeur }, NOM["P0_*"], "forbidden");
      refusParse({ ...vercel("production"), [INVENTEE]: valeur }, NOM["P0_*"], "forbidden");
    }
    // Préfixe exact, sensible à la casse : `p0_x` n'est pas une variable du prototype.
    expect(() => parseServerEnv(vercel("production", { p0_x: SENTINELLE }))).not.toThrow();
    // Hors production : admises.
    for (const base of [vercel("preview"), ci(), { VADROUILLE_ENV: "local" }]) expect(() => parseServerEnv({ ...base, P0_REAL_RUNS: "enabled", ...code() })).not.toThrow();
  });

  it("P0_REAL_RUNS : enabled seulement, comparaison exacte, sans trim()", () => {
    for (const valeur of ["Enabled", "enabled ", " enabled", "true", "1", SENTINELLE]) refusParse(ci({ P0_REAL_RUNS: valeur }), NOM.P0_REAL_RUNS, "invalid_value");
    expect(() => parseServerEnv(ci({ P0_REAL_RUNS: "enabled" }))).not.toThrow();
    expect(() => parseServerEnv(ci({ P0_REAL_RUNS: undefined }))).not.toThrow();
  });

  it("code d'accès présent : décodé comme tout secret (longueur, forme, motifs) et unique parmi les secrets", () => {
    refusParse(ci({ [NOM.P0_RUN_TOKEN]: hex(aleatoire(31)) }), NOM.P0_RUN_TOKEN, "secret_too_short");
    refusParse(ci({ [NOM.P0_RUN_TOKEN]: `${SENTINELLE}!` }), NOM.P0_RUN_TOKEN, "secret_encoding");
    refusParse(ci({ [NOM.P0_RUN_TOKEN]: `${hex(aleatoire())}\n` }), NOM.P0_RUN_TOKEN, "secret_encoding");
    refusParse(ci({ [NOM.P0_RUN_TOKEN]: "changeme".repeat(8) }), NOM.P0_RUN_TOKEN, "secret_trivial");
    const octets = aleatoire();
    refusParse(ci({ [NOM.RATE_LIMIT_HMAC_SECRET]: base64url(octets), [NOM.P0_RUN_TOKEN]: hex(octets) }), NOM.P0_RUN_TOKEN, "secret_duplicate");
    const config = parseServerEnv(ci(code()));
    expect(Object.keys(config).sort()).toEqual(["authAdapter", "betterAuth", "environment", "rateLimitHmacSecret", "smtp", "trustedIpHeader"]);
  });
});

describe("env: modules d'environnement", () => {
  it("@/server/env n'exporte ni clé Google ni clé de fournisseur de modèles", () => {
    expect(Object.keys(moduleEnv).filter((nom) => /google|maps|anthropic|openai|mistral|model|api_?key/i.test(nom))).toEqual([]);
  });

  it("les valeurs rendues ne contiennent aucune clé de service posée dans l'environnement injecté", () => {
    const env = ci({ GOOGLE_MAPS_SERVER_KEY: SENTINELLE, ANTHROPIC_API_KEY: SENTINELLE, OPENAI_API_KEY: SENTINELLE });
    const config = parseServerEnv(env);
    expect(JSON.stringify(config)).not.toContain(SENTINELLE);
    expect(inspect(config, { depth: 5 })).not.toContain(SENTINELLE);
    expect(Object.keys(config).sort()).toEqual(["authAdapter", "betterAuth", "environment", "rateLimitHmacSecret", "smtp", "trustedIpHeader"]);
  });

  it("la liste des variables du journal est celle de src/server/env/index.ts", () => {
    expect([...LOG_VARIABLES].sort()).toEqual([...SERVER_ENV_VARIABLES].sort());
  });
});

describe("env: lien avec la garde de base et les gardes d'interface (A10, A13)", () => {
  it.each([
    [{ VADROUILLE_ENV: " PRODUCTION " }, true],
    [{ VERCEL_ENV: "inconnu" }, true],
    [{ VADROUILLE_ENV: "ci" }, false],
    [{ VADROUILLE_ENV: "local" }, false],
    [{ VADROUILLE_ENV: "staging" }, false],
    [{ VERCEL_ENV: "preview" }, false],
    [{}, false],
  ] as const)("isProductionForDatabase(%o) → %s (suit resolveServerEnvironment)", (env, attendu) => {
    expect(isProductionForDatabase(env)).toBe(attendu);
  });

  it("isProductionDeployment vraie ⇒ resolveServerEnvironment rend production (la garde d'interface ne ferme jamais moins)", () => {
    const valeurs = [undefined, "", " ", "production", " Production", "PRODUCTION", "preview", "development", "ci", "local", "staging", "inconnu"];
    for (const vadrouille of valeurs) {
      for (const vercelEnv of valeurs) {
        const env = { VADROUILLE_ENV: vadrouille, VERCEL_ENV: vercelEnv };
        if (isProductionDeployment({ NODE_ENV: "test", ...env })) expect(resolveServerEnvironment(env), JSON.stringify(env)).toBe("production");
      }
    }
  });

  it("betterAuthAllowed suit resolveServerEnvironment : vrai seulement pour local et ci (B3c ; B3-TL-2)", () => {
    const valeurs = [undefined, "", " ", "local", "development", " CI ", "ci", "staging", "preview", "production", " Production", "inconnu", "constructor"];
    for (const vadrouille of valeurs) {
      for (const vercelEnv of valeurs) {
        const env = { VADROUILLE_ENV: vadrouille, VERCEL_ENV: vercelEnv };
        let attendu: boolean;
        try {
          attendu = ["local", "ci"].includes(resolveServerEnvironment(env));
        } catch {
          attendu = false;
        }
        expect(betterAuthAllowed({ NODE_ENV: "test", ...env }), JSON.stringify(env)).toBe(attendu);
      }
    }
  });

  it("valeur blanche déclarée : non déclarée pour resolveServerEnvironment comme pour betterAuthAllowed (revue du head `2b80bd7` de la PR 452, mineur 8)", () => {
    const env = { VADROUILLE_ENV: "  ", VERCEL_ENV: "local" };
    expect(resolveServerEnvironment(env)).toBe("local");
    expect(betterAuthAllowed({ NODE_ENV: "test", ...env })).toBe(true);
    expect(() => resolveServerEnvironment({ VADROUILLE_ENV: "  " })).toThrow(ServerEnvironmentUndeclaredError);
    expect(betterAuthAllowed({ NODE_ENV: "test", VADROUILLE_ENV: "  " })).toBe(false);
  });
});
