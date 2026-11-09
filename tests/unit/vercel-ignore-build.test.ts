// @vitest-environment node
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * `scripts/vercel/ignore-build.sh` (décision 0163, ticket #1050) : convention de Vercel, sortie 0 = construction
 * ignorée, sortie 1 = construction lancée. Seules `main` et `p0-reel` sont construites.
 */
const script = join(process.cwd(), "scripts/vercel/ignore-build.sh");

function sortie(ref: string | undefined): number | null {
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test", PATH: process.env.PATH };
  if (ref !== undefined) env.VERCEL_GIT_COMMIT_REF = ref;
  return spawnSync("sh", [script], { env, encoding: "utf8" }).status;
}

describe("vercel ignore-build : seules main et p0-reel sont construites (décision 0163)", () => {
  it.each(["main", "p0-reel"])("construit %s (sortie 1)", (ref) => {
    expect(sortie(ref)).toBe(1);
  });

  it.each([
    "claude/1050-vercel-offre-gratuite",
    "mvp-essai",
    "Main",
    "main ",
    " p0-reel",
    "main/suite",
    "p0-reel-2",
    "feature/main",
    "",
  ])("ignore « %s » (sortie 0)", (ref) => {
    expect(sortie(ref)).toBe(0);
  });

  it("ignore un déploiement sans branche (variable absente, sortie 0)", () => {
    expect(sortie(undefined)).toBe(0);
  });
});
