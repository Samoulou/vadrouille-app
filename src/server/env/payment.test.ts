import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cleDeTest, secretWebhookDeTest } from "../../../tests/support/stripe-evenements";
import { parseServerEnv, SERVER_ENV_VARIABLES, type ServerEnvVariable } from "./index";
import { cleStripe, cleWebhookSimule, productionPaiement, secretWebhookStripe, webhookSimuleOuvert, webhookStripeOuvert } from "./payment";

/**
 * Module d'environnement du paiement (spécification B4, B4a point 5 ; décision 0097 B4-TL-3 point 5 et B4-TL-7) :
 * prédicat « webhook simulé ouvert » et clé rendue seulement s'il est vrai. Environnements injectés, jamais
 * `process.env` ; clé tirée à l'exécution ; noms secrets en clés d'objet (`NOM`). Les réponses du gestionnaire (A10,
 * A24) sont testées dans `tests/unit/server/env.test.ts`.
 */

type Env = Record<string, string | undefined>;
const NOM = Object.fromEntries(SERVER_ENV_VARIABLES.map((nom) => [nom, nom])) as { readonly [K in ServerEnvVariable]: K };

const aleatoire = () => Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(32)));
const CLE = aleatoire();

const ouvertWebhook = (extra: Env = {}): Env => ({
  VADROUILLE_ENV: "ci",
  AUTH_ADAPTER: "better-auth",
  [NOM.BETTER_AUTH_SECRET]: aleatoire().toString("base64url"),
  [NOM.BETTER_AUTH_URL]: "http://127.0.0.1:3000",
  [NOM.APP_URL]: "http://127.0.0.1:3000",
  [NOM.VADROUILLE_DATABASE_URL_AUTH]: "postgresql://vadrouille_auth@127.0.0.1:5432/vadrouille",
  [NOM.RATE_LIMIT_HMAC_SECRET]: aleatoire().toString("base64url"),
  [NOM.SIMULATED_WEBHOOK_SECRET]: CLE.toString("base64url"),
  SIMULATED_WEBHOOK_ENABLED: "true",
  PAYMENT_ADAPTER: "simulated",
  DATA_ADAPTER: "api",
  ...extra,
});

describe("env: module du paiement (B4-TL-7)", () => {
  it("ouvert : drapeau exactement `true`, `PAYMENT_ADAPTER=simulated`, `local` ou `ci` ; la clé n'est rendue que si ouvert", () => {
    for (const environnement of ["ci", "local"]) {
      const env = parseServerEnv(ouvertWebhook({ VADROUILLE_ENV: environnement }));
      expect(webhookSimuleOuvert(env)).toBe(true);
      expect(cleWebhookSimule(env)?.equals(CLE)).toBe(true);
    }
    for (const drapeau of [undefined, "TRUE", "1", " true", "true "]) {
      const env = parseServerEnv({ VADROUILLE_ENV: "ci", SIMULATED_WEBHOOK_ENABLED: drapeau, [NOM.SIMULATED_WEBHOOK_SECRET]: CLE.toString("base64url") });
      expect(webhookSimuleOuvert(env)).toBe(false);
      expect(cleWebhookSimule(env)).toBeNull();
    }
    const sansAdaptateur = parseServerEnv({ VADROUILLE_ENV: "ci", SIMULATED_WEBHOOK_ENABLED: "true", [NOM.SIMULATED_WEBHOOK_SECRET]: CLE.toString("base64url") });
    expect(webhookSimuleOuvert(sansAdaptateur)).toBe(false);
    expect(cleWebhookSimule(sansAdaptateur)).toBeNull();
  });
});

// B4c (PR 863 ; décision 0140 § 3 points 4 à 6 ; critère T7) : clé et secret Stripe lus à l'appel, dans l'objet reçu
// (noms en clés d'objet, jamais `vi.stubEnv` d'un nom secret), barrière de sortie d'abord ; prédicat de production.
describe("env: clés Stripe lues à l'appel après la barrière de sortie", () => {
  // La barrière lit aussi le vrai `process.env` (0046 D21) : posé en préversion, puis rétabli.
  beforeEach(() => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_TARGET_ENV", undefined);
    vi.stubEnv("VADROUILLE_ENV", undefined);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const PREVERSION = { VERCEL: "1", VERCEL_ENV: "preview" } as const;
  const avecCle = (env: Env, cle: string | undefined) => ({ ...env, [NOM.STRIPE_SECRET_KEY]: cle });

  it("préversion et clé de forme valide : la clé est rendue", () => {
    const cle = cleDeTest();
    expect(cleStripe(avecCle(PREVERSION, cle), [])).toEqual({ ok: true, cle });
  });

  it("barrière de sortie en premier : local, ci, production, proxy ou option de Node → egress_refused, sans valeur, quelle que soit la clé", () => {
    const cle = cleDeTest();
    const refus: [Env, readonly string[]][] = [
      [{ VADROUILLE_ENV: "local" }, []],
      [{ VADROUILLE_ENV: "ci" }, []],
      [{ VERCEL: "1", VERCEL_ENV: "production" }, []],
      [{ ...PREVERSION, VERCEL_TARGET_ENV: "production" }, []],
      [{ ...PREVERSION, HTTPS_PROXY: "http://proxy.exemple.test:3128" }, []],
      [{ ...PREVERSION, NODE_TLS_REJECT_UNAUTHORIZED: "0" }, []],
      [PREVERSION, ["--use-env-proxy"]],
      [PREVERSION, ["--tls-min-v1.0"]],
    ];
    for (const [env, execArgv] of refus) {
      for (const valeur of [cle, undefined, "abc"]) {
        const resultat = cleStripe(avecCle(env, valeur), execArgv);
        expect(resultat, JSON.stringify(env)).toEqual({ ok: false, code: "egress_refused" });
        expect(JSON.stringify(resultat)).not.toContain(cle);
      }
    }
  });

  it("vrai process.env en production : refusé même si l'objet reçu dit préversion", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(cleStripe(avecCle(PREVERSION, cleDeTest()), [])).toEqual({ ok: false, code: "egress_refused" });
  });

  it("clé absente ou de forme invalide (préfixe, longueur, espaces, retour à la ligne) : key_invalid, sans valeur", () => {
    const cle = cleDeTest();
    for (const valeur of [undefined, "", `${cle} `, ` ${cle}`, `${cle}\n`, cle.replace("sk_test_", "sk_live_"), cle.replace("sk_test_", "pk_test_"), `sk_test_${"a".repeat(15)}`, `sk_test_${"a".repeat(256)}`, `sk_test_${"a".repeat(20)}-`]) {
      const resultat = cleStripe(avecCle(PREVERSION, valeur), []);
      expect(resultat, JSON.stringify(valeur)).toEqual({ ok: false, code: "key_invalid" });
    }
    expect(cleStripe(avecCle(PREVERSION, `rk_test_${"a".repeat(16)}`), [])).toEqual({ ok: true, cle: `rk_test_${"a".repeat(16)}` });
  });

  it("secret du webhook : rendu si de forme valide, sinon key_invalid ; aucune barrière (rien ne sort)", () => {
    const secret = secretWebhookDeTest();
    expect(secretWebhookStripe({ VADROUILLE_ENV: "ci", [NOM.STRIPE_WEBHOOK_SECRET]: secret })).toEqual({ ok: true, secret });
    for (const valeur of [undefined, "", `${secret} `, "whsec_court", secret.replace("whsec_", "whsek_"), `whsec_${"a".repeat(129)}`]) {
      expect(secretWebhookStripe({ VADROUILLE_ENV: "ci", [NOM.STRIPE_WEBHOOK_SECRET]: valeur }), JSON.stringify(valeur)).toEqual({ ok: false, code: "key_invalid" });
    }
  });

  it("ni la clé ni le secret ne sont des champs de ServerEnv", () => {
    const cle = cleDeTest();
    const secret = secretWebhookDeTest();
    const config = parseServerEnv(stripeOuvert({ [NOM.STRIPE_SECRET_KEY]: cle, [NOM.STRIPE_WEBHOOK_SECRET]: secret }));
    expect(config.paymentAdapter).toBe("stripe");
    for (const texte of [JSON.stringify(config), String(Object.values(config))]) {
      expect(texte).not.toContain(cle);
      expect(texte).not.toContain(secret);
    }
  });
});

/** Configuration Stripe complète en `ci` (secrets tirés au hasard, noms en clés d'objet). */
function stripeOuvert(extra: Env = {}): Env {
  return {
    ...ouvertWebhook({ SIMULATED_WEBHOOK_ENABLED: undefined, [NOM.SIMULATED_WEBHOOK_SECRET]: undefined, PAYMENT_ADAPTER: "stripe" }),
    [NOM.STRIPE_SECRET_KEY]: cleDeTest(),
    [NOM.STRIPE_WEBHOOK_SECRET]: secretWebhookDeTest(),
    ...extra,
  };
}

/** Pose une variable de production du vrai `process.env`, par nom littéral (régime des tests). */
const POSER_PRODUCTION: readonly (readonly [string, (valeur: string) => void])[] = [
  ["VADROUILLE_ENV", (valeur) => vi.stubEnv("VADROUILLE_ENV", valeur)],
  ["VERCEL_ENV", (valeur) => vi.stubEnv("VERCEL_ENV", valeur)],
  ["VERCEL_TARGET_ENV", (valeur) => vi.stubEnv("VERCEL_TARGET_ENV", valeur)],
];

describe("env: prédicat de production du paiement Stripe et webhook Stripe ouvert (0140 § 3 point 6)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("PAYMENT_ADAPTER=stripe hors production : ouvert ; autre adaptateur : fermé", () => {
    vi.stubEnv("VERCEL_ENV", undefined);
    vi.stubEnv("VERCEL_TARGET_ENV", undefined);
    vi.stubEnv("VADROUILLE_ENV", undefined);
    for (const environnement of ["ci", "local"]) expect(webhookStripeOuvert(parseServerEnv(stripeOuvert({ VADROUILLE_ENV: environnement })))).toBe(true);
    expect(webhookStripeOuvert(parseServerEnv(ouvertWebhook()))).toBe(false);
    expect(webhookStripeOuvert(parseServerEnv({ VADROUILLE_ENV: "ci" }))).toBe(false);
  });

  it.each(POSER_PRODUCTION)("%s à production (casse et espaces ignorés) dans le vrai process.env : fermé", (_nom, poser) => {
    vi.stubEnv("VERCEL_ENV", undefined);
    vi.stubEnv("VERCEL_TARGET_ENV", undefined);
    vi.stubEnv("VADROUILLE_ENV", undefined);
    const env = parseServerEnv(stripeOuvert());
    for (const valeur of ["production", " Production "]) {
      poser(valeur);
      expect(productionPaiement(env)).toBe(true);
      expect(webhookStripeOuvert(env)).toBe(false);
    }
  });

  it("objet reçu : production dans processEnv injecté ferme ; il ne peut que resserrer", () => {
    vi.stubEnv("VERCEL_ENV", undefined);
    vi.stubEnv("VERCEL_TARGET_ENV", undefined);
    vi.stubEnv("VADROUILLE_ENV", undefined);
    const env = parseServerEnv(stripeOuvert());
    expect(productionPaiement(env, {} as NodeJS.ProcessEnv)).toBe(false);
    expect(productionPaiement(env, { VERCEL_TARGET_ENV: " PRODUCTION " } as unknown as NodeJS.ProcessEnv)).toBe(true);
    vi.stubEnv("VERCEL_TARGET_ENV", "production");
    expect(productionPaiement(env, {} as NodeJS.ProcessEnv)).toBe(true);
  });
});
