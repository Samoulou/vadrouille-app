import { readFileSync } from "node:fs";

import { estFichierTest, moduleACapacite, resoudre, type Resultat } from "./analyse";
import type { LigneCapacite } from "./listes/capacites";

/**
 * Graphe d'imports et fermeture transitive (spécification P0c, section 3, « Fermeture transitive » ; décision 0038,
 * P0c-TL-1 point 2). Arêtes : imports, ré-exports, `import()` littéraux, imports de types, vers les fichiers suivis.
 */

export type Graphe = ReadonlyMap<string, ReadonlySet<string>>;

/**
 * Modules de capacité de P0r1 : importables seulement par des fichiers de test et le module de composition. Leurs
 * chemins nomment un fragment surveillé : ils sont lus dans les données du régime (section 1).
 */
export const MODULES_CAPACITE_P0R1: readonly string[] = (
  JSON.parse(readFileSync(new URL("./donnees/refus.json", import.meta.url), "utf8")) as { modulesCapaciteP0r1: string[] }
).modulesCapaciteP0r1;
export const MODULE_COMPOSITION = "src/server/composition/p0-reel.ts";

export function construireGraphe(resultats: readonly Resultat[]): Graphe {
  const graphe = new Map<string, Set<string>>();
  for (const resultat of resultats) {
    const cibles = new Set<string>();
    for (const i of resultat.imports) if (i.cible !== undefined) cibles.add(i.cible);
    graphe.set(resultat.fichier, cibles);
  }
  return graphe;
}

/** Fichiers atteints depuis `departs` (départs compris). */
export function atteignables(graphe: Graphe, departs: Iterable<string>): Set<string> {
  const vus = new Set<string>();
  const pile = [...departs];
  while (pile.length > 0) {
    const fichier = pile.pop() as string;
    if (vus.has(fichier)) continue;
    vus.add(fichier);
    for (const cible of graphe.get(fichier) ?? []) if (!vus.has(cible)) pile.push(cible);
  }
  return vus;
}

/** Fichiers qui importent un module à capacité (section 3), directement. */
function importateursDeCapacite(resultats: readonly Resultat[]): Set<string> {
  const fichiers = new Set<string>();
  for (const r of resultats) if (r.imports.some((i) => i.cible === undefined && moduleACapacite(i.specificateur))) fichiers.add(r.fichier);
  return fichiers;
}

/**
 * Contrôles de fermeture transitive ; renvoie les violations (vide si tout passe) :
 * 1. un fichier non-test qui importe un fichier de test ou un fichier de `tests/` ;
 * 2. une ligne de portée test ou outil atteinte depuis un fichier non-test de `src/` ou de `db/` ;
 * 3. un module de capacité de P0r1 importé par autre chose qu'un test ou le module de composition (barrels compris) ;
 * 4. un double de test qui charge le module réel (`importOriginal`, `vi.importActual`, `vi.importMock`) d'un fichier
 *    qui atteint un module à capacité (section 4, forme 2).
 */
export function verifierFermeture(
  resultats: readonly Resultat[],
  lignes: readonly LigneCapacite[],
  existe: (chemin: string) => boolean,
): string[] {
  const violations: string[] = [];
  const graphe = construireGraphe(resultats);

  for (const r of resultats) {
    if (estFichierTest(r.fichier)) continue;
    for (const i of r.imports) {
      if (i.cible !== undefined && estFichierTest(i.cible)) violations.push(`${r.fichier}:${i.ligne} : fichier non-test qui importe un fichier de test (${i.cible})`);
    }
  }

  const applicatifs = resultats.map((r) => r.fichier).filter((f) => (f.startsWith("src/") || f.startsWith("db/")) && !estFichierTest(f));
  const atteints = atteignables(graphe, applicatifs);
  for (const ligne of lignes) {
    if (ligne.portee !== "application" && atteints.has(ligne.fichier)) {
      violations.push(`${ligne.fichier} : ligne de portée ${ligne.portee} atteinte depuis un fichier non-test de src/ ou db/`);
    }
  }

  for (const r of resultats) {
    for (const i of r.imports) {
      if (i.cible !== undefined && MODULES_CAPACITE_P0R1.includes(i.cible) && !estFichierTest(r.fichier) && r.fichier !== MODULE_COMPOSITION) {
        violations.push(`${r.fichier}:${i.ligne} : module de capacité de P0r1 importé hors des tests et du module de composition (${i.cible})`);
      }
    }
  }

  const capacite = importateursDeCapacite(resultats);
  for (const r of resultats) {
    for (const d of r.doubles) {
      if (!d.original || moduleACapacite(d.specificateur)) continue; // module à capacité : refusé par l'analyseur
      const cible = resoudre(r.fichier, d.specificateur, existe);
      if (cible === undefined) continue; // paquet sans capacité : admis (section 4, forme 2)
      const atteint = [...atteignables(graphe, [cible])].find((f) => capacite.has(f));
      if (atteint) violations.push(`${r.fichier}:${d.ligne} : double qui charge le module réel de ${d.specificateur}, qui atteint un module à capacité (${atteint})`);
    }
  }
  return violations;
}
