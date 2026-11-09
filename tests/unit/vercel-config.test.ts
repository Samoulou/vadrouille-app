// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * `vercel.json` (décision 0002, amendement du 2026-10-14 ; ticket #321) : les fonctions de Vercel tournent à
 * Francfort (`fra1`), près de la base Neon (Q24). Décision 0163 (ticket #1050) : `ignoreCommand` ne laisse construire
 * que `main` et `p0-reel` (offre gratuite, 100 déploiements par jour). Aucune autre clé : aucun KV, aucune Edge Config,
 * aucun réglage de la plateforme hors relecture.
 */
const config = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as Record<string, unknown>;

describe("vercel.json : région des fonctions (décision 0002, amendement du 2026-10-14)", () => {
  it("fixe une seule région, fra1", () => {
    expect(config.regions).toEqual(["fra1"]);
  });

  it("ne contient que le schéma, la région et l'étape de construction ignorée (décision 0163)", () => {
    expect(Object.keys(config).sort()).toEqual(["$schema", "ignoreCommand", "regions"]);
    expect(config.$schema).toBe("https://openapi.vercel.sh/vercel.json");
  });

  it("confie la décision de construire au script testé (décision 0163)", () => {
    expect(config.ignoreCommand).toBe("sh scripts/vercel/ignore-build.sh");
  });
});
