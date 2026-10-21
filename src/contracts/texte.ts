import { z } from "zod";

/**
 * Règle de texte maison des contrats (décision 0094 § 7) : une ligne, Unicode imprimable, sans balise ni URL. Elle
 * borne les infos pratiques de l'étape (`StopFacts.tip`, `priceNote`, `hoursNote`) et le titre libre du jour
 * (`Day.theme`), écrits par notre recherche ou par le modèle (décision 0116 § 6, lot 1 bis), jamais tirés de Google.
 *
 * Module feuille : il n'importe que `zod` (chargé sous Node nu par `pnpm p0`). **Transition** : `src/ai/candidat.ts`
 * et `src/prototype/candidat.ts` portent encore leurs propres définitions ; 0094 § 7 prévoit qu'ils réexportent
 * celles-ci. D'ici là, `tests/unit/p0/copies.test.ts` vérifie que les trois rendent le même verdict (table).
 */

/** Caractères refusés : contrôle, invisibles, direction (catégorie Unicode C), et balises. */
const CARACTERES_INTERDITS = /[\p{C}<>]/u;

/** Formes d'URL refusées dans un texte libre (motifs de longueur bornée, donc linéaires ; égaux à `src/ai/candidat.ts`). */
const FORMES_URL = [
  /[a-z0-9+.-]:\/\//i,
  /\bwww\./i,
  /\b(?:javascript|data|mailto|file):/i,
  /[a-z0-9-]\.(?:com|org|net|info|io|co|uk|scot|fr|ch|de|eu|gov|edu|app|dev|example)\b/i,
];

/** Vrai si le texte contient une URL ou un nom de domaine. */
export function contientUrl(texte: string): boolean {
  return FORMES_URL.some((forme) => forme.test(texte));
}

/** Texte libre maison : une ligne, longueur bornée, Unicode imprimable, sans balise ni URL. */
export function texteMaison(max: number) {
  return z
    .string()
    .min(1)
    .max(max)
    .refine((valeur) => valeur.trim().length > 0, "texte vide")
    .refine((valeur) => !CARACTERES_INTERDITS.test(valeur), "caractère interdit")
    .refine((valeur) => !contientUrl(valeur), "URL interdite dans un texte libre");
}

/**
 * Longueurs des textes maison du contrat (décision 0116 § 1 point 2 et § 6 ; 0094 § 7) : égales à `conseil`,
 * `prix` et `horaires` de `LONGUEURS_TEXTE` (`src/ai/candidat.ts`) et au titre du jour du prompt `programme`.
 */
export const LONGUEURS_CONTRAT = { tip: 160, priceNote: 60, hoursNote: 120, theme: 80 } as const;
