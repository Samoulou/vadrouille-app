// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * `clés: clé serveur distincte et confinée à src/grounding` (spécification B8, B8a ; handover § 12). Lecture statique
 * du dépôt (aucune valeur de clé lue ni affichée) et de la configuration ESLint réelle (`ligne/server-env-imports`).
 * La restriction de la clé navigateur (référents HTTP, Maps JavaScript seule) est un contrôle manuel (Samuel, console
 * Google), noté dans la PR de B8a.
 */

const RACINE = process.cwd();
const NOM_CLE_SERVEUR = ["GOOGLE", "MAPS", "SERVER", "KEY"].join("_");
const NOM_CLE_NAVIGATEUR = ["NEXT", "PUBLIC", "GOOGLE", "MAPS", "API", "KEY"].join("_");
const estTest = (fichier: string) => /\.(test|spec)\.(ts|tsx|mts)$/.test(fichier);

/** Fichiers source non-test de `src/`, `scripts/`, `db/` et de la racine (configuration). */
function sources(): string[] {
  const fichiers: string[] = [];
  const parcourir = (dossier: string) => {
    for (const nom of readdirSync(path.join(RACINE, dossier))) {
      const relatif = path.posix.join(dossier, nom);
      if (statSync(path.join(RACINE, relatif)).isDirectory()) parcourir(relatif);
      else if (/\.(ts|tsx|mts|mjs|js|cjs)$/.test(nom) && !estTest(relatif)) fichiers.push(relatif);
    }
  };
  for (const dossier of ["src", "scripts", "db"]) parcourir(dossier);
  for (const nom of readdirSync(RACINE)) if (/\.(ts|mts|mjs|js|cjs|json)$/.test(nom) && statSync(path.join(RACINE, nom)).isFile()) fichiers.push(nom);
  return fichiers;
}

/** Texte sans commentaires (approximation suffisante pour des noms et des spécificateurs). */
const sansCommentaires = (texte: string) => texte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const lire = (fichier: string) => sansCommentaires(readFileSync(path.join(RACINE, fichier), "utf8"));

describe("clés: clé serveur distincte et confinée à src/grounding", () => {
  const fichiers = sources();

  it("la clé serveur n'est lue que par src/server/env/grounding.ts (et la garde des tests, présence seule)", () => {
    const lecteurs = fichiers.filter((fichier) => lire(fichier).includes(NOM_CLE_SERVEUR));
    // `garde-cles.ts` vérifie l'absence de la clé dans l'environnement des tests (P0r1), sans rendre de valeur ;
    // `src/server/env/index.ts` la validerait sans l'exporter (handover § 12) : il ne la nomme pas aujourd'hui.
    expect(lecteurs.sort()).toEqual(["src/server/env/garde-cles.ts", "src/server/env/grounding.ts"]);
  });

  it("@/server/env/grounding n'est importé que sous src/grounding", () => {
    const motif = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)["'](?:@\/|(?:\.\.?\/)+(?:src\/)?)server\/env\/grounding(?:\.ts)?["']/;
    const importateurs = fichiers.filter((fichier) => motif.test(lire(fichier)));
    expect(importateurs.length).toBeGreaterThan(0);
    for (const fichier of importateurs) expect(fichier.startsWith("src/grounding/"), fichier).toBe(true);
  });

  it("la règle ligne/server-env-imports refuse @/server/env/grounding hors de src/grounding", async () => {
    const eslint = new ESLint({ cwd: RACINE });
    const code = 'import { lireCleGoogle } from "@/server/env/grounding";\nexport const x = lireCleGoogle;\n';
    for (const fichier of ["src/server/relecture/relectures.ts", "src/server/composition/generation.ts", "src/domain/exemple.ts", "src/ai/exemple.ts"]) {
      const [resultat] = await eslint.lintText(code, { filePath: fichier });
      expect(resultat?.messages.some((m) => m.ruleId === "ligne/server-env-imports"), fichier).toBe(true);
    }
  });

  it("aucune variable NEXT_PUBLIC_ ne porte la clé serveur", () => {
    for (const fichier of fichiers) {
      const texte = lire(fichier);
      expect(new RegExp(`NEXT_PUBLIC_\\w*${["SERVER", "KEY"].join("_")}`).test(texte), fichier).toBe(false);
      expect(texte.includes(`NEXT_PUBLIC_${NOM_CLE_SERVEUR}`), fichier).toBe(false);
    }
  });

  it("la clé navigateur n'est jamais lue par src/grounding (tests compris)", () => {
    const parcourir = (dossier: string): string[] =>
      readdirSync(path.join(RACINE, dossier)).flatMap((nom) => {
        const relatif = path.posix.join(dossier, nom);
        return statSync(path.join(RACINE, relatif)).isDirectory() ? parcourir(relatif) : [relatif];
      });
    for (const fichier of parcourir("src/grounding")) expect(readFileSync(path.join(RACINE, fichier), "utf8").includes(NOM_CLE_NAVIGATEUR), fichier).toBe(false);
  });
});
