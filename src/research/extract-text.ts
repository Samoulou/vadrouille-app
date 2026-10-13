import { parse } from "parse5";

/**
 * Extraction du texte d'une page HTML (décision 0032, A7.2) : `parse5`, analyseur conforme à la norme HTML, sans
 * DOM vivant, sans exécution de script ni chargement de ressource. Seul importateur de `parse5`. Rend du texte
 * brut borné ; le contenu reste une donnée, jamais une instruction.
 */

/** Longueur maximale du texte extrait d'une page. */
export const TEXTE_MAX = 20_000;

/** Éléments dont le contenu n'est jamais du texte de page. */
const IGNORES = new Set(["script", "style", "noscript", "template", "iframe", "object", "embed", "svg", "math", "head"]);

type Noeud = { nodeName: string; value?: string; childNodes?: Noeud[] };

export function extraireTexte(html: string): string {
  const morceaux: string[] = [];
  let longueur = 0;
  const pile: Noeud[] = [parse(html) as unknown as Noeud];
  while (pile.length > 0 && longueur < TEXTE_MAX) {
    const noeud = pile.pop();
    if (noeud === undefined) break;
    if (IGNORES.has(noeud.nodeName)) continue;
    if (noeud.nodeName === "#text" && typeof noeud.value === "string") {
      const texte = noeud.value.replace(/\s+/g, " ").trim();
      if (texte !== "") {
        morceaux.push(texte);
        longueur += texte.length + 1;
      }
      continue;
    }
    const enfants = noeud.childNodes ?? [];
    for (let index = enfants.length - 1; index >= 0; index -= 1) {
      const enfant = enfants.at(index);
      if (enfant !== undefined) pile.push(enfant);
    }
  }
  return nettoyer(morceaux.join(" ")).slice(0, TEXTE_MAX);
}

/** Retire les caractères de contrôle et invisibles d'un texte web (le cadre des données échappe `<` et `>`). */
export function nettoyer(texte: string): string {
  return texte.replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim();
}
