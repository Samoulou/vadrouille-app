import { describe, expect, it } from "vitest";

import { lireEnvGeneration } from "./generation";

describe("env: déclarations de la barrière de génération", () => {
  it("rend les quatre déclarations telles quelles, et rien d'autre", () => {
    const env = {
      VADROUILLE_ENV: "ci",
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "claude/x",
      GENERATION_APPELS_REELS: "1",
      OPENROUTER_API_KEY: "ne-doit-pas-sortir",
      GOOGLE_MAPS_SERVER_KEY: "ne-doit-pas-sortir",
    };
    const lu = lireEnvGeneration(env);
    expect(Object.keys(lu).sort()).toEqual(["GENERATION_APPELS_REELS", "VADROUILLE_ENV", "VERCEL_ENV", "VERCEL_GIT_COMMIT_REF"]);
    expect(lu.VERCEL_ENV).toBe("preview");
    expect(JSON.stringify(lu)).not.toContain("ne-doit-pas-sortir");
  });

  it("environnement vide : quatre valeurs absentes", () => {
    expect(Object.values(lireEnvGeneration({}))).toEqual([undefined, undefined, undefined, undefined]);
  });
});
