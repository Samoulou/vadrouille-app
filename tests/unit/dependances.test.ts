// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Dépendances de B3b (spécification B3, « Critères communs » ; critère B17 ; décisions 0006 et 0008) : aucun script
 * d'installation permis aux nouvelles dépendances, et `better-auth` en version exacte. B3b-envoi refait le premier
 * test après l'ajout de `nodemailer` (critère E1).
 */

type Manifeste = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  pnpm?: { onlyBuiltDependencies?: string[] };
};

const manifeste = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as Manifeste;

describe("dépendances", () => {
  it("dépendances: aucun script d'installation permis", () => {
    expect(manifeste.pnpm?.onlyBuiltDependencies).toEqual(["sharp", "unrs-resolver"]);
  });

  it("better-auth 1.7.7 en version exacte (décision 0008)", () => {
    expect(manifeste.dependencies?.["better-auth"]).toBe("1.7.7");
    expect(manifeste.devDependencies?.["better-auth"]).toBeUndefined();
  });
});
