import { z } from "zod";

import { CategorySchema, IsoDateSchema, STOP_KINDS, TimeSchema } from "@/contracts";

/**
 * Candidat trouvé par la recherche et ses notes (décision 0032, A3.1). Défini une seule fois, ici : la recherche
 * (`src/research`), les modèles (`src/ai`), l'ancrage (`src/grounding`) et le moteur (`src/domain`) l'importent.
 *
 * Un candidat ne porte que des données maison issues de la recherche web : nom maison, résumé maison, catégorie,
 * type d'étape, source. **Aucune donnée Google** : le résultat d'ancrage vit à part (`ancrage.ts`), que `src/ai`
 * et `src/research` n'ont pas le droit d'importer.
 *
 * Module pur, feuille : n'importe que `@/contracts` et `zod`.
 */

/** Types de créneau (notation `slotFit`, cibles de la recherche ; clés de `recherche.json`). */
export const TYPES_CRENEAU = ["activity", "meal", "evening"] as const;
export type TypeCreneau = (typeof TYPES_CRENEAU)[number];

/** Classes de source de la politique de sources (cadrage § 6.5) ; clés de `classement.json`. */
export const CLASSES_SOURCE = ["officielle", "independante", "generique"] as const;
export type ClasseSource = (typeof CLASSES_SOURCE)[number];

/** Longueurs maximales des textes produits par un modèle (spécification, « Sorties des modèles »). */
export const LONGUEURS_TEXTE = { nom: 80, resume: 300, raison: 280, requete: 200 } as const;

/** Identifiant interne d'un candidat, attribué par le code (jamais par le modèle). */
export const CANDIDAT_ID_PATTERN = /^c_\d{3}$/;

/** Caractères refusés : contrôle, invisibles, direction (catégorie Unicode C), et balises. */
const CARACTERES_INTERDITS = /[\p{C}<>]/u;

/** Formes d'URL refusées dans un texte libre (les URL ne vivent que dans `source`, validée à part). */
const FORMES_URL = [
  /[a-z][a-z0-9+.-]*:\/\//i,
  /\bwww\./i,
  /\b(?:javascript|data|mailto|file):/i,
  /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|org|net|info|io|co|uk|scot|fr|ch|de|eu|gov|edu|app|dev|example)\b/i,
];

/** Vrai si le texte contient une URL ou un nom de domaine. */
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

/** Date de source et d'événement. */
const DateSchema = IsoDateSchema;

/** Source web d'un candidat : URL déjà validée (`https`, sans identifiants), date de la page, classe de domaine. */
export const SourceCandidatSchema = z.strictObject({
  url: z.string().min(1).max(2048),
  date: DateSchema,
  classe: z.enum(CLASSES_SOURCE),
});

export const CandidatSchema = z.strictObject({
  id: z.string().regex(CANDIDAT_ID_PATTERN),
  nom: texteMaison(LONGUEURS_TEXTE.nom),
  resume: texteMaison(LONGUEURS_TEXTE.resume),
  categorie: CategorySchema,
  typeEtape: z.enum(STOP_KINDS),
  source: SourceCandidatSchema,
  /** Événement : date et heure lues sur la page ; `dateConfirmee` si la page relue mentionne la date (R2). */
  evenement: z
    .strictObject({ date: DateSchema, heure: TimeSchema.optional(), dateConfirmee: z.boolean() })
    .optional(),
  /** La source indique qu'il faut réserver (badge `toReserve`). */
  aReserver: z.boolean(),
  /** Prix par personne d'après la source web, en devise locale (R9) ; absent si aucune source ne le donne. */
  prixParPersonne: z.number().finite().nonnegative().max(1000).optional(),
  /** Durée de visite d'après la source web, en minutes. */
  dureeMinutes: z.number().int().min(15).max(600).optional(),
});
export type Candidat = z.infer<typeof CandidatSchema>;

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

export type CandidatNote = Candidat & { notes: Notes };

/**
 * Ce qu'un modèle voit d'un candidat (notation, raisons) : identifiant interne, nom maison, résumé maison,
 * catégorie, type d'étape. Rien d'autre, et jamais une donnée Google (contrainte 7).
 */
export function vuePourModele(candidat: Candidat): {
  id: string;
  nom: string;
  resume: string;
  categorie: Candidat["categorie"];
  typeEtape: Candidat["typeEtape"];
} {
  return {
    id: candidat.id,
    nom: candidat.nom,
    resume: candidat.resume,
    categorie: candidat.categorie,
    typeEtape: candidat.typeEtape,
  };
}
