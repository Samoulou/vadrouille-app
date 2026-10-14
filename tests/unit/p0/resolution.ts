import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Résolution des spécificateurs du dépôt, module d'appui partagé (décision 0055, section 3 point 2 : « même résolveur
 * que `tests/unit/p0/imports.test.ts`, extrait en module d'appui plutôt que recopié »). Utilisé par
 * `tests/unit/p0/imports.test.ts` (liste d'autorisation et graphes d'import de P0) et `tests/unit/p0/composition.test.ts`
 * (seule composition, port isolé). Déplacé tel quel, sans changement de comportement.
 */

export const RACINE = fileURLToPath(new URL("../../../", import.meta.url));
export const rel = (absolu: string) => path.relative(RACINE, absolu).split(path.sep).join("/");

export type Cible = { type: "projet"; chemin: string } | { type: "externe"; nom: string };

export function resoudreProjet(base: string): string | undefined {
  for (const candidat of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    const absolu = path.join(RACINE, candidat);
    if (existsSync(absolu) && statSync(absolu).isFile()) return rel(absolu);
  }
  return undefined;
}

export function resoudre(depuis: string, specificateur: string): Cible {
  if (specificateur.startsWith("@/")) {
    const chemin = resoudreProjet(path.posix.join("src", specificateur.slice(2)));
    return chemin ? { type: "projet", chemin } : { type: "externe", nom: specificateur };
  }
  if (specificateur.startsWith("./") || specificateur.startsWith("../")) {
    const chemin = resoudreProjet(path.posix.normalize(path.posix.join(path.posix.dirname(depuis), specificateur)));
    return chemin ? { type: "projet", chemin } : { type: "externe", nom: specificateur };
  }
  return { type: "externe", nom: specificateur };
}
