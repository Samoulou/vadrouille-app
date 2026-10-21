import { z } from "zod";

/**
 * Copies tenues égales de `src/prototype/candidat.ts` (décision 0077 § 1 point 3, B7-TL-1 : liste fermée ; toute autre
 * copie demande un amendement de 0077). `src/ai` n'importe plus rien de `src/prototype` ; l'original reste pour P0, et
 * `tests/unit/p0/copies.test.ts` vérifie que les deux côtés restent égaux (listes et motifs élément par élément, même
 * verdict de `texteMaison` et de `NotesSchema` sur une table de valeurs, égalité des types). Une copie qui doit
 * diverger cesse d'être une copie : décision du Tech Lead.
 *
 * Chargé par `pnpm p0` sous Node nu (par `sorties.ts` et `modeles.simule.ts`) : exception nominative de
 * `ligne/require-server-only` (spécification B7a, point 6).
 */

/** Types de créneau (notation `slotFit`, cibles de la recherche). Égaux au `CHECK` `candidates_slot_fit_check`. */
export const TYPES_CRENEAU = ["activity", "meal", "evening"] as const;
export type TypeCreneau = (typeof TYPES_CRENEAU)[number];

/**
 * Longueurs maximales des textes produits par un modèle (B7-PO-8) ; secteur, incontournable et infos pratiques du
 * candidat enrichi (décision 0094 § 1 point 2 : écrites ici une seule fois pour `src/ai`, d'où `LONGUEURS_PLAN` et
 * `LONGUEURS_INFOS` de `sorties.ts` sont dérivées).
 */
export const LONGUEURS_TEXTE = {
  nom: 80,
  resume: 300,
  raison: 280,
  requete: 200,
  secteur: 60,
  incontournable: 80,
  prix: 60,
  horaires: 120,
  conseil: 160,
  // Programme écrit par l'IA (décision 0117 § 1 point 2 ; `pourquoi` à 280, borne de `Stop.reason`, décision 0116 § 1.2).
  pourquoi: 280,
  bonPlan: 200,
  titreJour: 80,
  titreProgramme: 120,
} as const;

/** Identifiant interne d'un candidat, attribué par le code (jamais par le modèle). */
export const CANDIDAT_ID_PATTERN = /^c_\d{3}$/;

/** Caractères refusés : contrôle, invisibles, direction (catégorie Unicode C), et balises. */
const CARACTERES_INTERDITS = /[\p{C}<>]/u;

/** Formes d'URL refusées dans un texte libre (les URL ne vivent que dans les sources, validées à part). */
const FORMES_URL = [
  /[a-z0-9+.-]:\/\//i,
  /\bwww\./i,
  /\b(?:javascript|data|mailto|file):/i,
  /[a-z0-9-]\.(?:com|org|net|info|io|co|uk|scot|fr|ch|de|eu|gov|edu|app|dev|example)\b/i,
];

/**
 * Vrai si le texte contient une URL ou un nom de domaine. Motifs de longueur bornée, donc linéaires (pas de répétition
 * suivie d'un suffixe obligatoire, qui rendait l'essai quadratique sur « aaaa… », « a-a-… » ou « a.a.… » : revue de
 * #597) ; chacun admet tout ce qu'admettait l'ancien motif (ce qui précède « :// » ou « .tld » n'est plus exigé en
 * entier), la détection n'est donc jamais affaiblie.
 */
export function contientUrl(texte: string): boolean {
  return FORMES_URL.some((forme) => forme.test(texte));
}

/**
 * Texte libre maison : une ligne, longueur bornée, Unicode imprimable, sans balise ni URL. Un texte refusé fait
 * écarter l'élément qui le porte (compté `model_output_invalid`), jamais recopier.
 */
export function texteMaison(max: number) {
  return z
    .string()
    .min(1)
    .max(max)
    .refine((valeur) => valeur.trim().length > 0, "texte vide")
    .refine((valeur) => !CARACTERES_INTERDITS.test(valeur), "caractère interdit")
    .refine((valeur) => !contientUrl(valeur), "URL interdite dans un texte libre");
}

/** Les quatre notes de l'étape « Notation » (décisions 0027 et 0076). */
export const NotesSchema = z.strictObject({
  matchesWishes: z.boolean(),
  notForMeRisk: z.number().int().min(1).max(10),
  mustSee: z.boolean(),
  slotFit: z
    .array(z.enum(TYPES_CRENEAU))
    .min(1)
    .max(3)
    .refine((valeurs) => new Set(valeurs).size === valeurs.length, "slotFit sans doublon"),
});
export type Notes = z.infer<typeof NotesSchema>;
