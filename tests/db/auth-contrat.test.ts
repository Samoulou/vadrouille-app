import { randomBytes } from "node:crypto";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, type Mock, vi } from "vitest";

import {
  brancherConnexionReelle,
  createBetterAuthAdapter,
  type DemandeLimiteur,
  type Limiteur,
  type OperationsConnexion,
} from "@/adapters/better-auth";
import { RATE_LIMITS, type RateLimitConfig } from "@/server/config/limites";
import { disabledCodeMailer } from "@/server/mail/disabled";
import { createRateLimiter } from "@/server/rate-limit";

import { createDatabase } from "../../db/index";
import { executerContratAuth } from "../support/auth-contrat";
import { type Banc, connecter, identifiant, preparerBanc } from "./auth-outils";
import { closeAll, connect, type DbClient, unique } from "./helpers";

/**
 * Adaptateur `better-auth` et actions de `compte.ts` sur la base réelle (spécification B3, B3c ; critères C1 à C6).
 * Opérations de `src/server/auth` configurées par injection (`preparerBanc` : secret tiré au hasard, double de capture
 * du port d'envoi, pools `vadrouille_auth`) ; limiteur réel sur `action_rate_limits` (pool `vadrouille_app`), avec des
 * noms d'action propres à ce fichier et à cette exécution (aucun compteur partagé) ; adresses IP des plages de
 * documentation, adresses e-mail en `exemple.test`. Les actions passent par `getAuthAdapter()` avec
 * `AUTH_ADAPTER=better-auth` et `VADROUILLE_ENV=ci` ; la connexion réelle est branchée comme au démarrage
 * (`brancherConnexionReelle`), les en-têtes de la requête viennent du double de `next/headers`.
 */

const requete = vi.hoisted(() => ({ enTetes: (): Headers => new Headers() }));
// Hors requête Next.js, comme le vrai module : `cookies()` lève (le greffon `nextCookies` l'ignore alors ; les cookies
// sont reçus par `onSetCookie` du banc).
vi.mock("next/headers", () => ({
  headers: async () => requete.enTetes(),
  cookies: async () => {
    throw new Error("`cookies` was called outside a request scope.");
  },
}));

const { requestCode, signOut, verifyCode, hasSession } = await import("@/server/actions/compte");

const [HMAC = ""] = Object.keys({ RATE_LIMIT_HMAC_SECRET: 0 });
const ENTETE = "x-vercel-forwarded-for";
const ENV_LIMITEUR = { VADROUILLE_ENV: "ci", TRUSTED_IP_HEADER: ENTETE, [HMAC]: randomBytes(32).toString("base64url") };
const SUFFIXE = randomBytes(4).toString("hex");

/** Adresse IPv6 de documentation propre à l'appel (préfixe /64 aléatoire dans `2001:db8::/32`). */
const ipDocumentation = () => `2001:db8:${randomBytes(4).toString("hex").replace(/(.{4})/, "$1:")}::1`;

const pools: { end(): Promise<void> }[] = [];
const bancs: Banc[] = [];
let auth: DbClient;

beforeAll(async () => {
  auth = await connect("auth");
});

afterAll(async () => {
  await Promise.all([...bancs.map((b) => b.fermer()), ...pools.map((p) => p.end())]);
  await closeAll();
});

/** Limiteur réel, noms d'action propres au test : `request-code` et `verify-code` deviennent `<nom>-rq-…`, `<nom>-vf-…`. */
function limiteurPropre(nom: string, env: Record<string, string> = ENV_LIMITEUR) {
  const pool = createDatabase("vadrouille_app").$client;
  pools.push(pool);
  const actions = { requestCode: `t-${nom}-rq-${SUFFIXE}`, verifyCode: `t-${nom}-vf-${SUFFIXE}` };
  const config: RateLimitConfig = { [actions.requestCode]: RATE_LIMITS["request-code"] ?? [], [actions.verifyCode]: RATE_LIMITS["verify-code"] ?? [] };
  const limiteur = createRateLimiter({ config, env, pool });
  const appels: DemandeLimiteur[] = [];
  const parNom: Record<string, string> = { "request-code": actions.requestCode, "verify-code": actions.verifyCode };
  const check: Limiteur = (demande) => {
    appels.push(demande);
    return limiteur.check({ ...demande, action: parNom[demande.action] ?? demande.action });
  };
  return { actions, check, appels };
}

function banc(options: Parameters<typeof preparerBanc>[0] = {}): Banc {
  const b = preparerBanc({ trustedIpHeader: ENTETE, ...options });
  bancs.push(b);
  return b;
}

describe("contrat auth : better-auth", () => {
  it("adaptateurs: mock et better-auth passent la même suite de contrat auth", async () => {
    const b = banc();
    const limiteur = limiteurPropre("contrat");
    let ip = ipDocumentation();
    const adapter = createBetterAuthAdapter({
      operations: () => b.operations,
      headers: () => b.enTetes({ [ENTETE]: ip }),
      limiter: limiteur.check,
    });
    expect(adapter.mode).toBe("real");
    await executerContratAuth({
      adapter,
      adresse: () => {
        ip = ipDocumentation();
        return `b3c-${unique()}@exemple.test`;
      },
      code: (email) => b.mailer.dernierCode(email),
      expirer: async (email) => {
        await auth.query("UPDATE verifications SET expires_at = now() - interval '1 second' WHERE identifier = $1", [`sign-in-otp-${email}`]);
      },
    });
  });
});

describe("actions", () => {
  /** Requête courante : en-tête de confiance (ou aucun) et autres en-têtes, plus les cookies du banc. */
  let courante: { banc: Banc; ip: string | null; autres: Record<string, string> };
  let espions: { operations: Mock<() => OperationsConnexion>; envois: () => number };

  function brancher(b: Banc, limiteur: { check: Limiteur }) {
    const operations = vi.fn((): OperationsConnexion => b.operations);
    espions = { operations, envois: () => b.mailer.envois.length };
    courante = { banc: b, ip: ipDocumentation(), autres: {} };
    brancherConnexionReelle({ operations, limiter: limiteur.check, contexte: async () => null });
  }

  beforeEach(() => {
    vi.stubEnv("AUTH_ADAPTER", "better-auth");
    vi.stubEnv("VADROUILLE_ENV", "ci");
    requete.enTetes = () => courante.banc.enTetes({ ...courante.autres, ...(courante.ip === null ? {} : { [ENTETE]: courante.ip }) });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("auth: réponse identique pour une adresse connue ou inconnue", async () => {
    const b = banc();
    const limiteur = limiteurPropre("c2");
    brancher(b, limiteur);
    // Adresse connue : un compte existe (connexion préalable, puis déconnexion).
    const connue = `b3c-connue-${unique()}@exemple.test`;
    await connecter(b, connue as Parameters<typeof connecter>[1]);
    b.cookies.clear();
    const inconnue = `b3c-inconnue-${unique()}@exemple.test`;

    async function parcours(email: string) {
      const reponses: unknown[] = [];
      const avant = { limiteur: limiteur.appels.length, envois: espions.envois(), operations: espions.operations.mock.calls.length };
      courante.ip = ipDocumentation();
      reponses.push(await requestCode({ email }));
      reponses.push(await verifyCode({ email, code: b.mailer.dernierCode(email) === "000000" ? "111111" : "000000" }));
      reponses.push(await verifyCode({ email, code: b.mailer.dernierCode(email) ?? "" }));
      b.cookies.clear();
      // Code expiré.
      courante.ip = ipDocumentation();
      reponses.push(await requestCode({ email }));
      await auth.query("UPDATE verifications SET expires_at = now() - interval '1 second' WHERE identifier = $1", [`sign-in-otp-${email}`]);
      reponses.push(await verifyCode({ email, code: b.mailer.dernierCode(email) ?? "" }));
      // Limite atteinte (5 envois par heure et par adresse e-mail) : d'autres adresses IP, la limite par e-mail tient.
      for (let i = 0; i < 4; i += 1) {
        courante.ip = ipDocumentation();
        reponses.push(await requestCode({ email }));
      }
      return {
        reponses,
        limiteur: limiteur.appels.length - avant.limiteur,
        envois: espions.envois() - avant.envois,
        operations: espions.operations.mock.calls.length - avant.operations,
      };
    }

    const a = await parcours(connue);
    const c = await parcours(inconnue);
    expect(JSON.stringify(a.reponses)).toBe(JSON.stringify(c.reponses));
    expect(a.reponses).toEqual([
      { ok: true, value: { sent: true } },
      { ok: false, error: { code: "invalid_code" } },
      { ok: true, value: { signedIn: true } },
      { ok: true, value: { sent: true } },
      { ok: false, error: { code: "code_expired" } },
      { ok: true, value: { sent: true } },
      { ok: true, value: { sent: true } },
      { ok: true, value: { sent: true } },
      { ok: false, error: { code: "rate_limited", retryable: true } },
    ]);
    expect([a.limiteur, a.envois, a.operations]).toEqual([c.limiteur, c.envois, c.operations]);
  });

  it("auth: limitation des envois", async () => {
    const b = banc();
    const limiteur = limiteurPropre("c3");
    brancher(b, limiteur);
    // Adresse IP de confiance fixe, en-têtes forgés et changeants : le 4e envoi en 10 minutes est refusé.
    const ip = ipDocumentation();
    const reponses: unknown[] = [];
    for (let i = 0; i < 4; i += 1) {
      courante.ip = ip;
      courante.autres = { "x-forwarded-for": ipDocumentation(), "x-real-ip": ipDocumentation() };
      reponses.push(await requestCode({ email: `b3c-ip-${unique()}@exemple.test` }));
    }
    expect(reponses.slice(0, 3)).toEqual(Array(3).fill({ ok: true, value: { sent: true } }));
    expect(reponses[3]).toEqual({ ok: false, error: { code: "rate_limited", retryable: true } });

    // Variantes d'une même adresse depuis des adresses IP différentes : le 6e envoi dans l'heure est refusé.
    const p = `b3c${unique().replace(/[^a-z0-9]/gi, "").toLowerCase()}`;
    // ` a@exemple.test ` (espaces autour) : refusée par le contrat `CodeRequestSchema` (`isEmailShape`, 0017 § 2.1)
    // avant le limiteur ; écart signalé dans la PR de B3c. Sa forme canonique est éprouvée sur l'adaptateur (C5).
    courante.ip = ipDocumentation();
    expect(await requestCode({ email: ` ${p}a@exemple.test ` })).toEqual({ ok: false, error: { code: "validation_failed", field: "email" } });
    const variantes = [`${p}a@exemple.test`, `${p}A@Exemple.test`, ...[1, 2, 3, 4, 5].map((n) => `${p}a+${n}@exemple.test`)];
    const resultats: unknown[] = [];
    for (const email of variantes) {
      courante.ip = ipDocumentation();
      courante.autres = {};
      const envois = espions.envois();
      const operations = espions.operations.mock.calls.length;
      const resultat = await requestCode({ email });
      resultats.push(resultat);
      if (resultats.length > 5) {
        // Un refus du limiteur n'appelle ni Better Auth ni le port d'envoi.
        expect(espions.envois()).toBe(envois);
        expect(espions.operations.mock.calls.length).toBe(operations);
      }
    }
    expect(resultats.slice(0, 5)).toEqual(Array(5).fill({ ok: true, value: { sent: true } }));
    expect(resultats.slice(5)).toEqual(Array(2).fill({ ok: false, error: { code: "rate_limited", retryable: true } }));
  });

  it("auth: sans en-tête de confiance, la limite reste appliquée", async () => {
    const b = banc();
    const limiteur = limiteurPropre("c4");
    brancher(b, limiteur);
    const reponses: unknown[] = [];
    for (let i = 0; i < 4; i += 1) {
      courante.ip = null;
      courante.autres = { "x-forwarded-for": ipDocumentation(), "x-real-ip": ipDocumentation(), forwarded: `for="[${ipDocumentation()}]"` };
      reponses.push(await requestCode({ email: `b3c-commun-${unique()}@exemple.test` }));
    }
    expect(reponses.slice(0, 3)).toEqual(Array(3).fill({ ok: true, value: { sent: true } }));
    expect(reponses[3]).toEqual({ ok: false, error: { code: "rate_limited", retryable: true } });
  });

  it("ordre des contrôles : entrée invalide refusée avant le limiteur, forme canonique ensuite (critère C5)", async () => {
    const b = banc();
    const limiteur = limiteurPropre("c5");
    brancher(b, limiteur);
    const invalides: [string, Record<string, unknown>][] = [
      ["request", { email: `${"a".repeat(242)}@exemple.test` }],
      ["request", { email: "a@exemple.test\r\nBcc: b@exemple.test" }],
      ["request", { email: "a\u0007b@exemple.test" }],
      ["request", { email: "a@b@exemple.test" }],
      ["request", { email: "x <a@exemple.test>" }],
      ["request", { email: "a,b@exemple.test" }],
      ["request", { email: '"a b"@exemple.test' }],
      ["request", { email: "a@exemple.test", inconnu: true }],
      ["verify", { email: "a@exemple.test", code: "12345a" }],
      ["verify", { email: "a@b@exemple.test", code: "123456" }],
      ["verify", { email: "a@exemple.test", code: "123456", organizationId: "org" }],
    ];
    for (const [action, entree] of invalides) {
      const reponse = action === "request" ? await requestCode(entree) : await verifyCode(entree);
      expect(reponse.ok).toBe(false);
      if (!reponse.ok) expect(reponse.error.code).toBe("validation_failed");
      expect(JSON.stringify(reponse)).not.toContain(String(entree.email));
    }
    expect(limiteur.appels).toEqual([]);
    expect(espions.operations).not.toHaveBeenCalled();
    expect(espions.envois()).toBe(0);

    // Adresse valide : la forme canonique circule seule (limiteur, bibliothèque, base, port d'envoi). Par l'action,
    // `A@Exemple.test` (le contrat refuse les espaces autour, voir « limitation des envois ») ; par l'adaptateur,
    // ` A@Exemple.test `.
    expect(await requestCode({ email: "A@Exemple.test" })).toEqual({ ok: true, value: { sent: true } });
    const adapter = createBetterAuthAdapter({
      operations: espions.operations,
      headers: () => b.enTetes({ [ENTETE]: ipDocumentation() }),
      limiter: limiteur.check,
    });
    expect(await adapter.requestCode({ email: " A@Exemple.test " })).toEqual({ ok: true, value: { sent: true } });
    expect(limiteur.appels.map((appel) => appel.email)).toEqual(["a@exemple.test", "a@exemple.test"]);
    expect(espions.operations).toHaveBeenCalledTimes(2);
    expect(b.mailer.envois.map((envoi) => envoi.to)).toEqual(["a@exemple.test", "a@exemple.test"]);
    const { rows } = await auth.query("SELECT count(*)::int AS n FROM verifications WHERE identifier = $1", [identifiant("a@exemple.test" as never)]);
    expect(rows[0].n).toBe(1);
  });

  it("correspondance des erreurs : codes de API_ERROR_CODES seulement, aucune chaîne de la bibliothèque (critère C6)", async () => {
    // Secret du limiteur absent : `rate_limited` (`retryable: true`) pour les deux actions, ni opération ni envoi.
    const sansSecret = banc();
    const envSansSecret = Object.fromEntries(Object.entries(ENV_LIMITEUR).filter(([nom]) => nom !== HMAC)) as Record<string, string>;
    brancher(sansSecret, limiteurPropre("c6a", envSansSecret));
    expect(await requestCode({ email: `b3c-${unique()}@exemple.test` })).toEqual({ ok: false, error: { code: "rate_limited", retryable: true } });
    expect(await verifyCode({ email: `b3c-${unique()}@exemple.test`, code: "123456" })).toEqual({ ok: false, error: { code: "rate_limited", retryable: true } });
    expect(espions.operations).not.toHaveBeenCalled();
    expect(espions.envois()).toBe(0);

    // Secret de la bibliothèque absent de la configuration injectée : `provider_error` (`retryable: true`).
    brancher(banc({ secret: null }), limiteurPropre("c6b"));
    expect(await requestCode({ email: `b3c-${unique()}@exemple.test` })).toEqual({ ok: false, error: { code: "provider_error", retryable: true } });
    courante.ip = ipDocumentation();
    expect(await verifyCode({ email: `b3c-${unique()}@exemple.test`, code: "123456" })).toEqual({ ok: false, error: { code: "provider_error", retryable: true } });

    // Port d'envoi désactivé : `provider_error`, identique pour une adresse connue ou inconnue.
    const connu = banc();
    const connue = `b3c-connue-${unique()}@exemple.test`;
    await connecter(connu, connue as Parameters<typeof connecter>[1]);
    const desactive = banc({ port: disabledCodeMailer });
    brancher(desactive, limiteurPropre("c6c"));
    const pourConnue = await requestCode({ email: connue });
    courante.ip = ipDocumentation();
    const pourInconnue = await requestCode({ email: `b3c-inconnue-${unique()}@exemple.test` });
    expect(pourConnue).toEqual({ ok: false, error: { code: "provider_error", retryable: true } });
    expect(JSON.stringify(pourInconnue)).toBe(JSON.stringify(pourConnue));

    // Erreur inattendue du port d'envoi, dont le message porte une adresse : `provider_error`, aucune chaîne reçue.
    const panne = banc();
    brancher(panne, limiteurPropre("c6d"));
    const victime = `b3c-panne-${unique()}@exemple.test`;
    panne.mailer.echouerAvec = new Error(`échec SMTP pour ${victime} (INVALID_OTP)`);
    const reponse = await requestCode({ email: victime });
    expect(reponse).toEqual({ ok: false, error: { code: "provider_error", retryable: true } });
    expect(JSON.stringify(reponse)).not.toMatch(/SMTP|exemple\.test|INVALID_OTP/);
  });

  it("déconnexion par l'action : session fermée, cookie effacé, idempotente", async () => {
    const b = banc();
    brancher(b, limiteurPropre("sortie"));
    const email = `b3c-sortie-${unique()}@exemple.test`;
    expect(await requestCode({ email })).toEqual({ ok: true, value: { sent: true } });
    expect(await verifyCode({ email, code: b.mailer.dernierCode(email) ?? "" })).toEqual({ ok: true, value: { signedIn: true } });
    expect(await hasSession()).toBe(true);
    expect(await signOut()).toEqual({ ok: true, value: { signedOut: true } });
    expect(await hasSession()).toBe(false);
    expect(await signOut()).toEqual({ ok: true, value: { signedOut: true } });
  });
});
