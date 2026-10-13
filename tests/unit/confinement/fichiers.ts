import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Seul énumérateur des fichiers suivis du régime de confinement (spécification P0c, section 1 ; décision 0038,
 * P0c-TL-1 point 1). Ligne nominative du régime lui-même : `node:child_process`, `execFileSync` seulement, commande
 * littérale `git`, arguments littéraux `ls-files`, `-z`, `-s`, sans `shell`.
 */

export const RACINE = fileURLToPath(new URL("../../../", import.meta.url));

/** Extensions analysées (section 1), déclarations `.d.ts` et `.d.mts` comprises. */
export const EXTENSIONS_ANALYSEES = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"] as const;

export type FichierSuivi = { readonly chemin: string; readonly mode: string };

/** `git ls-files -z -s` : chemins et modes. Une erreur de `git` ou une liste vide fait échouer (échec fermé). */
export function fichiersSuivis(): FichierSuivi[] {
  const sortie = execFileSync("git", ["ls-files", "-z", "-s"], { cwd: RACINE, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const fichiers: FichierSuivi[] = [];
  for (const entree of sortie.split("\0")) {
    if (entree === "") continue;
    const tabulation = entree.indexOf("\t");
    const entete = entree.slice(0, tabulation).split(" ");
    const mode = entete[0];
    const chemin = entree.slice(tabulation + 1);
    if (tabulation < 0 || mode === undefined || chemin === "") throw new Error(`confinement: sortie de git illisible : ${entree}`);
    fichiers.push({ chemin, mode });
  }
  if (fichiers.length === 0) throw new Error("confinement: aucun fichier suivi (git ls-files vide)");
  return fichiers;
}

/** Fichier analysé par le régime (section 1), d'après son extension. */
export function estAnalyse(chemin: string): boolean {
  return EXTENSIONS_ANALYSEES.some((extension) => chemin.endsWith(extension));
}

/** Contenu d'un fichier du dépôt (lecture seulement, pas d'énumération). */
export function lireFichier(chemin: string): string {
  return readFileSync(path.join(RACINE, chemin), "utf8");
}
