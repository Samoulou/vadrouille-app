// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { RACINE, rel } from "../p0/resolution";

/**
 * Points d'injection de la connexion réelle (revue consolidée du head `ed79edb` de la PR 446, mineur 4 ; B3c, ticket
 * 447) : `createAuthOperations` (configuration injectée : secret, base, port d'envoi), `creerWithOrg` (base injectée) et
 * `creerContexteServeur` (opérations injectées) ne servent qu'aux tests. Hors de `tests/`, leur nom n'apparaît que dans
 * leur propre module, commentaires compris : le serveur passe par `authOperations()`, `withOrg` et
 * `getServerRequestContext()`, qui lisent leur configuration de l'environnement validé.
 *
 * Dossiers lus : `src/` (tests colocalisés compris), `db/`, `scripts/` et `eslint-rules/`.
 */

const POINTS: Readonly<Record<string, string>> = {
  createAuthOperations: "src/server/auth/index.ts",
  creerWithOrg: "src/server/with-org.ts",
  creerContexteServeur: "src/server/session.ts",
};

const DOSSIERS = ["src", "db", "scripts", "eslint-rules"];
const EXTENSIONS = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const IGNORES = new Set(["node_modules", ".next", ".git", "coverage"]);

function fichiers(dossier: string): string[] {
  const absolu = path.join(RACINE, dossier);
  if (!existsSync(absolu)) return [];
  const resultat: string[] = [];
  for (const nom of readdirSync(absolu)) {
    if (IGNORES.has(nom)) continue;
    const chemin = path.join(absolu, nom);
    if (statSync(chemin).isDirectory()) resultat.push(...fichiers(rel(chemin)));
    else if (EXTENSIONS.test(nom)) resultat.push(rel(chemin));
  }
  return resultat;
}

describe("points d'injection de la connexion réelle", () => {
  it("auth: createAuthOperations, creerWithOrg et creerContexteServeur réservés à tests/ et à leur module", () => {
    const lus = DOSSIERS.flatMap(fichiers);
    expect(lus).toEqual(expect.arrayContaining(Object.values(POINTS)));
    const ecarts: string[] = [];
    for (const fichier of lus) {
      const texte = readFileSync(path.join(RACINE, fichier), "utf8");
      for (const [nom, proprietaire] of Object.entries(POINTS)) {
        if (fichier !== proprietaire && new RegExp(`\\b${nom}\\b`).test(texte)) ecarts.push(`${fichier} : ${nom}`);
      }
    }
    expect(ecarts).toEqual([]);
  });
});
