// @vitest-environment node
// Décision 0040 (D2, A8) : épingle l'environnement que `workflowsTreeId` de scripts/ci/techlead-gate.mjs
// passe à `git` (exactement `PATH`, `HOME` et `GIT_LITERAL_PATHSPECS`). Fichier séparé de
// techlead-gate-workflow.test.ts : `vi.mock` remplace `node:child_process` pour tout le fichier,
// alors que ces tests-là exécutent le vrai `git`.
import { afterEach, describe, expect, it, vi } from "vitest";

import { workflowsTreeId } from "../../../scripts/ci/techlead-gate.mjs";

type Appel = { args: readonly string[]; env: Record<string, string | undefined> };

const appels: Appel[] = [];

vi.mock("node:child_process", () => ({
  execFileSync: (_fichier: string, args: readonly string[], options: { env: Record<string, string | undefined> }) => {
    appels.push({ args, env: options.env });
    return "";
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  appels.length = 0;
});

describe("workflowsTreeId : environnement de git (0040 A8)", () => {
  it("passe exactement PATH, HOME et GIT_LITERAL_PATHSPECS aux deux appels de git", () => {
    vi.stubEnv("PATH", "/chemin/factice");
    vi.stubEnv("HOME", "/maison/factice");
    vi.stubEnv("GIT_DIR", "/git-dir/factice");
    vi.stubEnv("GIT_INDEX_FILE", "/index/factice");
    vi.stubEnv("GIT_CONFIG_PARAMETERS", "'core.bare'='true'");
    vi.stubEnv("LANG", "C");

    expect(workflowsTreeId({ sha: "a".repeat(40), cwd: "/depot/factice" })).toBe("absent");

    expect(appels.map((appel) => appel.args[0])).toEqual(["cat-file", "ls-tree"]);
    for (const appel of appels) {
      // Noms d'abord : un échec n'affiche jamais les valeurs de l'environnement du job.
      expect(Object.keys(appel.env).sort()).toEqual(["GIT_LITERAL_PATHSPECS", "HOME", "PATH"]);
      expect(appel.env.PATH).toBe("/chemin/factice");
      expect(appel.env.HOME).toBe("/maison/factice");
      expect(appel.env.GIT_LITERAL_PATHSPECS).toBe("1");
    }
  });
});
