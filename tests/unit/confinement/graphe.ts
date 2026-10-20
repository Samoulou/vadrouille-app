import { readFileSync } from "node:fs";

import { doubleOriginalAdmis, estFichierTest, estRelatif, moduleACapaciteNormalise, resoudre, type RegleFermeture, type Resultat } from "./analyse";
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
/**
 * Modules de composition, seuls points d'entrée admis vers les modules de capacité de P0r1 : celle du prototype et, depuis
 * B8b (décision 0100 § 5.2), la fabrique commune des clients Google (`places-client.ts`, `routes-client.ts`), que seules
 * les compositions de la lecture (et de la génération, B9c) importent (`ligne/relecture-imports`, `composition.test.ts`).
 */
export const MODULES_COMPOSITION: readonly string[] = [MODULE_COMPOSITION, "src/server/composition/clients-google.ts", "src/server/composition/generation.ts"];

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

/**
 * Fichiers qui importent, directement, un module à capacité (section 3, spécificateur normalisé) ou un spécificateur
 * que l'analyseur refuse (non listé, non résolu, hors zone) : échec fermé, un import inconnu compte comme une capacité.
 */
function importateursDeCapacite(resultats: readonly Resultat[]): Set<string> {
  const fichiers = new Set<string>();
  for (const r of resultats) {
    const capacite = r.imports.some((i) => i.cible === undefined && moduleACapaciteNormalise(i.specificateur));
    const refuse = r.constats.some((c) => !c.admis && (c.regle === "specificateur" || c.regle === "module-capacite"));
    if (capacite || refuse) fichiers.add(r.fichier);
  }
  return fichiers;
}

/** Violation typée : le fichier en cause et la règle qui la refuse (0038 TL-1 point 4). */
export type Violation = { readonly fichier: string; readonly regle: RegleFermeture; readonly message: string };

/**
 * Contrôles de fermeture transitive ; renvoie les violations (vide si tout passe) :
 * 1. `fermeture-import-de-test` : un fichier non-test qui importe un fichier de test ou un fichier de `tests/` ;
 * 2. `fermeture-portee` : une ligne de portée test ou outil atteinte depuis un fichier non-test de `src/` ou de `db/` ;
 * 3. `fermeture-module-p0r1` : un module de capacité de P0r1 atteint, directement ou par des intermédiaires (barrels,
 *    ré-exports), depuis un fichier non-test autre que le module de composition (le parcours s'arrête au module de
 *    composition, seul point d'entrée admis) ;
 * 4. `fermeture-double-original` : un double de test qui charge le module réel (`importOriginal`, `vi.importActual`,
 *    `vi.importMock`, fabrique absente ou non littérale) d'un fichier qui atteint un module à capacité, d'un
 *    spécificateur relatif non résolu, ou d'un spécificateur tiers que `doubleOriginalAdmis` refuse (nom nu, module à
 *    capacité en toute casse et avec ou sans `node:`, paquet non listé) : section 4, forme 2 ; revue du head
 *    `ad0b008`, bloquant 1. Aucun nom nu n'est admis comme « paquet sans capacité » sans ligne de la section 6.
 */
export function verifierFermeture(
  resultats: readonly Resultat[],
  lignes: readonly LigneCapacite[],
  existe: (chemin: string) => boolean,
): Violation[] {
  const violations: Violation[] = [];
  const graphe = construireGraphe(resultats);

  for (const r of resultats) {
    if (estFichierTest(r.fichier)) continue;
    for (const i of r.imports) {
      if (i.cible !== undefined && estFichierTest(i.cible)) {
        violations.push({ fichier: r.fichier, regle: "fermeture-import-de-test", message: `${r.fichier}:${i.ligne} : fichier non-test qui importe un fichier de test (${i.cible})` });
      }
    }
  }

  const applicatifs = resultats.map((r) => r.fichier).filter((f) => (f.startsWith("src/") || f.startsWith("db/")) && !estFichierTest(f));
  const atteints = atteignables(graphe, applicatifs);
  for (const ligne of lignes) {
    if (ligne.portee !== "application" && atteints.has(ligne.fichier)) {
      violations.push({ fichier: ligne.fichier, regle: "fermeture-portee", message: `${ligne.fichier} : ligne de portée ${ligne.portee} atteinte depuis un fichier non-test de src/ ou db/` });
    }
  }

  const sansComposition = new Map([...graphe].map(([f, cibles]) => [f, MODULES_COMPOSITION.includes(f) ? new Set<string>() : cibles]));
  for (const r of resultats) {
    if (estFichierTest(r.fichier) || MODULES_COMPOSITION.includes(r.fichier) || MODULES_CAPACITE_P0R1.includes(r.fichier)) continue;
    const atteint = [...atteignables(sansComposition, [r.fichier])].find((f) => f !== r.fichier && MODULES_CAPACITE_P0R1.includes(f));
    if (atteint) {
      violations.push({ fichier: r.fichier, regle: "fermeture-module-p0r1", message: `${r.fichier} : module de capacité de P0r1 atteint hors des tests et du module de composition (${atteint})` });
    }
  }

  const capacite = importateursDeCapacite(resultats);
  for (const r of resultats) {
    for (const d of r.doubles) {
      if (!d.original) continue;
      const refus = (motif: string) =>
        violations.push({ fichier: r.fichier, regle: "fermeture-double-original", message: `${r.fichier}:${d.ligne} : double qui charge le module réel de ${d.specificateur} (${motif})` });
      if (!estRelatif(d.specificateur)) {
        if (!doubleOriginalAdmis(r.fichier, d.specificateur)) refus("spécificateur ni relatif, ni `@/`, ni listé sans capacité");
        continue;
      }
      const cible = resoudre(r.fichier, d.specificateur, existe);
      if (cible === undefined) {
        refus("spécificateur relatif non résolu");
        continue;
      }
      const atteint = [...atteignables(graphe, [cible])].find((f) => capacite.has(f));
      if (atteint) {
        violations.push({
          fichier: r.fichier,
          regle: "fermeture-double-original",
          message: `${r.fichier}:${d.ligne} : double qui charge le module réel de ${d.specificateur}, qui atteint un module à capacité (${atteint})`,
        });
      }
    }
  }
  return violations;
}
