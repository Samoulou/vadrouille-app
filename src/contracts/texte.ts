import { z } from "zod";

/**
 * Règle de texte maison des contrats (décision 0094 § 7) : une ligne, Unicode imprimable, sans balise ni URL. Elle
 * borne les infos pratiques de l'étape (`StopFacts.tip`, `priceNote`, `hoursNote`) et le titre libre du jour
 * (`Day.theme`), écrits par notre recherche ou par le modèle (décision 0116 § 6, lot 1 bis), jamais tirés de Google.
 *
 * Module feuille : il n'importe que `zod` (chargé sous Node nu par `pnpm p0`). **Unique définition** : `src/ai/candidat.ts`
 * et `src/prototype/candidat.ts` la réexportent (0094 § 7, ticket 633) ; `tests/unit/p0/copies.test.ts` vérifie que
 * c'est la même fonction. Par rapport aux anciennes copies, elle refuse en plus les domaines `.it`, `.va`, `.es`, `.pt`,
 * `.nl`, les séparateurs de ligne et de paragraphe (U+2028, U+2029) et les points homoglyphes devant une extension
 * (U+2024, U+FE52, U+FF0E, U+3002), et retire les espaces de début et de fin avant de mesurer (`.trim()`).
 */

/** Caractères refusés : contrôle, invisibles, direction (catégorie Unicode C), séparateurs de ligne et de paragraphe, balises. */
const CARACTERES_INTERDITS = /[\p{C}\u2028\u2029<>]/u;

/** Point d'un nom de domaine, homoglyphes compris (point de conduite, petit point, point pleine chasse, point idéographique). */
const POINT = "[.\\u2024\\uFE52\\uFF0E\\u3002]";

/**
 * Formes d'URL refusées dans un texte libre. Motifs de longueur bornée, donc linéaires. Liste fermée d'extensions : un
 * nombre décimal (« 12.50 », « 9.30 ») ou une abréviation (« Dr. Martin ») n'est jamais pris pour un domaine.
 */
const FORMES_URL = [
  /[a-z0-9+.-]:\/\//i,
  new RegExp(`\\bwww${POINT}`, "iu"),
  /\b(?:javascript|data|mailto|file):/i,
  new RegExp(`[a-z0-9-]${POINT}(?:com|org|net|info|io|co|uk|scot|fr|ch|de|eu|gov|edu|app|dev|example|it|va|es|pt|nl)\\b`, "iu"),
];

/** Vrai si le texte contient une URL ou un nom de domaine. */
export function contientUrl(texte: string): boolean {
  return FORMES_URL.some((forme) => forme.test(texte));
}

/**
 * Texte libre maison : une ligne, longueur bornée, Unicode imprimable, sans balise ni URL. Les espaces de début et de
 * fin sont retirés avant tout contrôle (la valeur lue est la valeur coupée) ; un texte fait d'espaces est refusé.
 */
export function texteMaison(max: number) {
  return z
    .string()
    .trim()
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
