// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * `vercel.json` (décision 0002, amendement du 2026-10-14 ; ticket #321) : les fonctions de Vercel tournent à
 * Francfort (`fra1`), près de la base Neon (Q24). Le fichier ne porte que la région : aucun KV, aucune Edge Config,
 * aucune autre clé qui réglerait la plateforme hors relecture.
 */
const config = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as Record<string, unknown>;

describe("vercel.json : région des fonctions (décision 0002, amendement du 2026-10-14)", () => {
  it("fixe une seule région, fra1", () => {
    expect(config.regions).toEqual(["fra1"]);
  });

  it("ne contient que le schéma et la région", () => {
    expect(Object.keys(config).sort()).toEqual(["$schema", "regions"]);
    expect(config.$schema).toBe("https://openapi.vercel.sh/vercel.json");
  });
});
