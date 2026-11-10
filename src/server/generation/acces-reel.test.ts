import { afterEach, describe, expect, it, vi } from "vitest";

import { accesGenerationReelle, accesReelApi } from "./acces-reel";

afterEach(() => {
  vi.unstubAllEnvs();
});

// Décision 0141 § 6.2 point 1 (T11d, PR 885) : le crochet des recherches de `api` reste fermé (0169 § 5 : seuils non validés).
describe("crochet d'accès de api", () => {
  it("fermé : accesReelApi rend false", async () => {
    expect(await accesReelApi()).toBe(false);
  });
});

// Décision 0169 § 5 : le crochet de la génération suit la garde `api` du processus (`assertApiAdapter`).
describe("crochet d'accès de la génération de api", () => {
  const MVP = { VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "mvp-essai", AUTH_ADAPTER: "better-auth" } as const;
  type Valeurs = { VADROUILLE_ENV?: string; VERCEL?: string; VERCEL_ENV?: string; VERCEL_TARGET_ENV?: string; VERCEL_GIT_COMMIT_REF?: string; AUTH_ADAPTER?: string };
  const poser = (valeurs: Valeurs): void => {
    vi.stubEnv("VADROUILLE_ENV", valeurs.VADROUILLE_ENV);
    vi.stubEnv("VERCEL", valeurs.VERCEL);
    vi.stubEnv("VERCEL_ENV", valeurs.VERCEL_ENV);
    vi.stubEnv("VERCEL_TARGET_ENV", valeurs.VERCEL_TARGET_ENV);
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", valeurs.VERCEL_GIT_COMMIT_REF);
    vi.stubEnv("AUTH_ADAPTER", valeurs.AUTH_ADAPTER);
  };

  it("ouvert sur la préversion de mvp-essai avec better-auth", async () => {
    poser(MVP);
    expect(await accesGenerationReelle()).toBe(true);
  });

  it.each([
    ["sans better-auth", { ...MVP, AUTH_ADAPTER: undefined }],
    ["connexion simulée", { ...MVP, AUTH_ADAPTER: "mock" }],
    ["autre branche", { ...MVP, VERCEL_GIT_COMMIT_REF: "p0-reel" }],
    ["main", { ...MVP, VERCEL_GIT_COMMIT_REF: "main" }],
    ["production", { ...MVP, VERCEL_ENV: "production" }],
    ["cible de production", { ...MVP, VERCEL_TARGET_ENV: "production" }],
    ["hors de Vercel", { ...MVP, VERCEL: undefined }],
    ["aucun environnement", { AUTH_ADAPTER: "better-auth" }],
  ] as const satisfies readonly (readonly [string, Valeurs])[])("fermé : %s", async (_cas, valeurs) => {
    poser(valeurs);
    expect(await accesGenerationReelle()).toBe(false);
  });
});
