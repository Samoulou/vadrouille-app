// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { assertApiAdapter } from "@/adapters/api-guard";
import { assertAuthAdapter, betterAuthAllowed, betterAuthLocalOuCi } from "@/adapters/auth-guard";
import { paymentAvailable } from "@/adapters/payment-guard";
import { apiShareAvailable, environnementLocalOuCi } from "@/adapters/share-guard";
import { BRANCHE_MVP_ESSAI, previewMvpEssai } from "@/dev/flags";

/**
 * Gardes de la préversion `mvp-essai` (décision 0169 § 1, ticket 1105, ligne M1h du plan) : les gardes `better-auth`
 * (0077 § 5.1) et `api` (0086 § 2.1) s'ouvrent sur la préversion Vercel de la **seule** branche `mvp-essai`, et restent
 * fermées partout ailleurs, production comprise. Environnements injectés pour les fonctions pures ; `vi.stubEnv` pour
 * `assertApiAdapter`, qui ne lit que l'environnement du processus.
 */

type Env = Readonly<Record<string, string | undefined>>;
const env = (valeurs: Env): NodeJS.ProcessEnv => ({ NODE_ENV: "test", ...valeurs }) as unknown as NodeJS.ProcessEnv;

/** Préversion Vercel de la branche `mvp-essai`, telle que Vercel la déclare. */
const MVP: Env = { VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "mvp-essai" };

/** Tout ce qui n'est pas cette préversion : chaque cas ne diffère de `MVP` que par ce que son nom dit. */
const AILLEURS: readonly (readonly [string, Env])[] = [
  ["production de Vercel", { ...MVP, VERCEL_ENV: "production" }],
  ["production déclarée par l'opérateur", { ...MVP, VADROUILLE_ENV: "production" }],
  ["cible de production", { ...MVP, VERCEL_TARGET_ENV: "production" }],
  ["cible de production, casse et espaces", { ...MVP, VERCEL_TARGET_ENV: " Production " }],
  ["environnement personnalisé de Vercel", { ...MVP, VERCEL_TARGET_ENV: "recette" }],
  ["cible vide", { ...MVP, VERCEL_TARGET_ENV: "" }],
  ["branche main", { ...MVP, VERCEL_GIT_COMMIT_REF: "main" }],
  ["branche p0-reel", { ...MVP, VERCEL_GIT_COMMIT_REF: "p0-reel" }],
  ["branche claude/…", { ...MVP, VERCEL_GIT_COMMIT_REF: "claude/1105-m1h-mvp-essai" }],
  ["branche au nom voisin", { ...MVP, VERCEL_GIT_COMMIT_REF: "mvp-essai-2" }],
  ["branche avec une espace", { ...MVP, VERCEL_GIT_COMMIT_REF: "mvp-essai " }],
  ["branche en majuscules", { ...MVP, VERCEL_GIT_COMMIT_REF: "MVP-ESSAI" }],
  ["branche vide", { ...MVP, VERCEL_GIT_COMMIT_REF: "" }],
  ["déploiement sans Git", { ...MVP, VERCEL_GIT_COMMIT_REF: undefined }],
  ["préversion écrite autrement", { ...MVP, VERCEL_ENV: " Preview " }],
  ["VERCEL_ENV=staging", { ...MVP, VERCEL_ENV: "staging" }],
  ["hors de Vercel", { ...MVP, VERCEL: undefined }],
  ["VERCEL=0", { ...MVP, VERCEL: "0" }],
  ["VERCEL avec une espace", { ...MVP, VERCEL: " 1" }],
  ["staging déclaré par l'opérateur", { ...MVP, VADROUILLE_ENV: "staging" }],
  ["preview déclaré par l'opérateur", { ...MVP, VADROUILLE_ENV: "preview" }],
  ["déclaration vide de l'opérateur", { ...MVP, VADROUILLE_ENV: "" }],
  ["valeur inconnue", { ...MVP, VADROUILLE_ENV: "recette" }],
  ["aucune déclaration", {}],
  ["branche seule, sans préversion", { VERCEL_GIT_COMMIT_REF: "mvp-essai" }],
];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("gardes mvp-essai : prédicat de la préversion (0169 § 1)", () => {
  it("nom de la branche : une seule définition", () => {
    expect(BRANCHE_MVP_ESSAI).toBe("mvp-essai");
  });

  it("ouverte sur la préversion Vercel de mvp-essai, avec ou sans VERCEL_TARGET_ENV=preview", () => {
    expect(previewMvpEssai(env(MVP))).toBe(true);
    expect(previewMvpEssai(env({ ...MVP, VERCEL_TARGET_ENV: "preview" }))).toBe(true);
  });

  it.each(AILLEURS)("fermée : %s", (_cas, valeurs) => {
    expect(previewMvpEssai(env(valeurs))).toBe(false);
  });
});

describe("gardes mvp-essai : connexion better-auth (amendement de 0077 § 5.1)", () => {
  it("ouverte sur la préversion de mvp-essai ; local et ci inchangés", () => {
    expect(betterAuthAllowed(env(MVP))).toBe(true);
    expect(betterAuthLocalOuCi(env(MVP))).toBe(false);
    expect(environnementLocalOuCi(env(MVP))).toBe(false);
    expect(assertAuthAdapter(env({ ...MVP, AUTH_ADAPTER: "better-auth" }))).toBe("better-auth");
    // `VERCEL_ENV=development` désigne `local` (règle inchangée de `resolveServerEnvironment`), quelle que soit la branche.
    expect(betterAuthLocalOuCi(env({ ...MVP, VERCEL_ENV: "development" }))).toBe(true);
    expect(previewMvpEssai(env({ ...MVP, VERCEL_ENV: "development" }))).toBe(false);
    for (const valeur of ["local", "ci"]) {
      expect(betterAuthAllowed(env({ VADROUILLE_ENV: valeur }))).toBe(true);
      expect(betterAuthLocalOuCi(env({ VADROUILLE_ENV: valeur }))).toBe(true);
    }
  });

  it.each(AILLEURS)("fermée : %s", (_cas, valeurs) => {
    expect(betterAuthAllowed(env(valeurs))).toBe(false);
    expect(() => assertAuthAdapter(env({ ...valeurs, AUTH_ADAPTER: "better-auth" }))).toThrow("connexion better-auth refusée");
  });

  it("la connexion simulée ne s'ouvre pas sur la préversion (code connu de tous, 0017 § 11.2)", () => {
    expect(() => assertAuthAdapter({ ...env(MVP), NODE_ENV: "production" } as NodeJS.ProcessEnv)).toThrow("connexion simulée refusée");
  });
});

describe("gardes mvp-essai : adaptateur api (amendement de 0086 § 2.1)", () => {
  const poser = (valeurs: Env): void => {
    vi.stubEnv("VADROUILLE_ENV", valeurs.VADROUILLE_ENV);
    vi.stubEnv("VERCEL", valeurs.VERCEL);
    vi.stubEnv("VERCEL_ENV", valeurs.VERCEL_ENV);
    vi.stubEnv("VERCEL_TARGET_ENV", valeurs.VERCEL_TARGET_ENV);
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", valeurs.VERCEL_GIT_COMMIT_REF);
    vi.stubEnv("AUTH_ADAPTER", valeurs.AUTH_ADAPTER);
  };

  it("ouverte sur la préversion de mvp-essai avec AUTH_ADAPTER=better-auth", () => {
    poser({ ...MVP, AUTH_ADAPTER: "better-auth" });
    expect(() => assertApiAdapter()).not.toThrow();
  });

  it("refusée sur la préversion de mvp-essai sans better-auth (aucun repli vers la connexion simulée)", () => {
    poser(MVP);
    expect(() => assertApiAdapter()).toThrow("sans AUTH_ADAPTER=better-auth");
    poser({ ...MVP, AUTH_ADAPTER: "mock" });
    expect(() => assertApiAdapter()).toThrow("sans AUTH_ADAPTER=better-auth");
  });

  it.each(AILLEURS)("fermée : %s", (_cas, valeurs) => {
    poser({ ...valeurs, AUTH_ADAPTER: "better-auth" });
    expect(() => assertApiAdapter()).toThrow("adaptateur api refusé hors local et ci");
  });
});

describe("gardes mvp-essai : paiement et partage (0169 § 6)", () => {
  const APP: Env = { ...MVP, DATA_ADAPTER: "api", AUTH_ADAPTER: "better-auth" };

  it("paiement Stripe de test : disponible sur la préversion de mvp-essai, jamais sur une cible de production", () => {
    expect(paymentAvailable(env({ ...APP, PAYMENT_ADAPTER: "stripe" }))).toBe(true);
    expect(paymentAvailable(env({ ...APP, PAYMENT_ADAPTER: "stripe", VERCEL_TARGET_ENV: "production" }))).toBe(false);
    expect(paymentAvailable(env({ ...APP, PAYMENT_ADAPTER: "stripe", VERCEL_ENV: "production" }))).toBe(false);
    expect(paymentAvailable(env({ ...APP, PAYMENT_ADAPTER: "stripe", VERCEL_GIT_COMMIT_REF: "main" }))).toBe(false);
  });

  it("paiement simulé : jamais ouvert par la préversion (local et ci seulement, Q131)", () => {
    const simule = { ...APP, PAYMENT_ADAPTER: "simulated", SIMULATED_WEBHOOK_ENABLED: "true", VADROUILLE_DEMO_PAYMENT: "1" };
    expect(paymentAvailable(env(simule))).toBe(false);
    expect(paymentAvailable(env({ ...simule, VERCEL: undefined, VERCEL_ENV: undefined, VERCEL_GIT_COMMIT_REF: undefined, VADROUILLE_ENV: "ci" }))).toBe(true);
  });

  it("paiement de démonstration (mock) : indisponible avec l'adaptateur api", () => {
    expect(paymentAvailable(env({ ...APP, VADROUILLE_DEMO_PAYMENT: "1" }))).toBe(false);
  });

  it("partage api : ouvert sur la préversion avec l'en-tête de confiance seulement (0157 § 2.1 point 3)", () => {
    expect(apiShareAvailable(env({ ...APP, TRUSTED_IP_HEADER: "x-vercel-forwarded-for" }))).toBe(true);
    expect(apiShareAvailable(env(APP))).toBe(false);
    expect(apiShareAvailable(env({ ...APP, TRUSTED_IP_HEADER: "x-vercel-forwarded-for", VERCEL_GIT_COMMIT_REF: "main" }))).toBe(false);
    expect(apiShareAvailable(env({ ...APP, TRUSTED_IP_HEADER: "x-vercel-forwarded-for", VERCEL_ENV: "production" }))).toBe(false);
  });
});
