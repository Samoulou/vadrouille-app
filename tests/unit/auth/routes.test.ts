// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Aucune route de Better Auth (spécification B3, B3b point 3 ; critère B2, partie « sources ») : aucun fichier sous
 * `src/app/api/auth`, aucun appel au gestionnaire HTTP de la bibliothèque (`toNextJsHandler`, `auth.handler`) dans
 * `src`. La partie « serveur construit » (404 sur un échantillon de chemins) est `tests/e2e/api-auth.e2e.spec.ts`.
 */

const racine = process.cwd();

function fichiers(dossier: string): string[] {
  const chemin = path.join(racine, dossier);
  if (!existsSync(chemin)) return [];
  return readdirSync(chemin).flatMap((nom) => {
    const relatif = path.posix.join(dossier, nom);
    return statSync(path.join(racine, relatif)).isDirectory() ? fichiers(relatif) : [relatif];
  });
}

describe("sources", () => {
  it("auth: aucune route /api/auth n'est exposée", () => {
    expect(existsSync(path.join(racine, "src/app/api/auth"))).toBe(false);
    expect(fichiers("src/app").filter((f) => /(^|\/)api\/auth(\/|$)/.test(f))).toEqual([]);
    const sources = fichiers("src").filter((f) => /\.(ts|tsx|mts|js|mjs)$/.test(f));
    expect(sources.length).toBeGreaterThan(100);
    const appels = sources.filter((f) => {
      const texte = readFileSync(path.join(racine, f), "utf8");
      return /toNextJsHandler|toNodeHandler|\.handler\s*\(/.test(texte);
    });
    expect(appels).toEqual([]);
  });
});
