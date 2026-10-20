import { z } from "zod";

import { CANDIDAT_ID_PATTERN, LONGUEURS_TEXTE, texteMaison } from "@/ai/candidat";
import { CategorySchema, IsoDateSchema, STOP_KINDS, TimeSchema } from "@/contracts";

/**
 * Copies tenues égales de `src/prototype/candidat.ts` (décision 0077 § 1 point 3, B7-TL-1 : liste fermée) : classes de
 * source et schéma du candidat sortant de l'agent (`CandidatRechercheSchema`, copie de `CandidatSchema` et de
 * `SourceCandidatSchema`). `src/research` n'importe plus rien de `src/prototype` ; l'original reste pour P0, et
 * `tests/unit/p0/copies.test.ts` vérifie que les deux côtés restent égaux (listes élément par élément, même verdict du
 * schéma sur une table de valeurs admises et refusées, égalité des types).
 *
 * Chargé par `pnpm p0` sous Node nu (par `agent.ts` et `sources.ts`) : exception nominative de
 * `ligne/require-server-only` (spécification B7a, point 6).
 */

/** Classes de source de la politique de sources (cadrage § 6.5) ; clés de `classement.json`. */
export const CLASSES_SOURCE = ["officielle", "independante", "generique"] as const;
export type ClasseSource = (typeof CLASSES_SOURCE)[number];

/** Source web d'un candidat : URL déjà validée (`https`, sans identifiants), date de la page, classe de domaine. */
export const SourceCandidatRechercheSchema = z.strictObject({
  url: z.string().min(1).max(2048),
  date: IsoDateSchema,
  classe: z.enum(CLASSES_SOURCE),
});

/** Candidat sortant de l'agent : données maison issues de la recherche web seulement, **aucune donnée Google**. */
export const CandidatRechercheSchema = z
  .strictObject({
    id: z.string().regex(CANDIDAT_ID_PATTERN),
    nom: texteMaison(LONGUEURS_TEXTE.nom),
    resume: texteMaison(LONGUEURS_TEXTE.resume),
    categorie: CategorySchema,
    typeEtape: z.enum(STOP_KINDS),
    source: SourceCandidatRechercheSchema,
    /** Événement : date et heure lues sur la page ; `dateConfirmee` si la page relue mentionne la date (R2). */
    evenement: z.strictObject({ date: IsoDateSchema, heure: TimeSchema.optional(), dateConfirmee: z.boolean() }).optional(),
    /** La source indique qu'il faut réserver (badge `toReserve`). */
    aReserver: z.boolean(),
    /** Prix par personne d'après la source web, en devise locale (R9) ; absent si aucune source ne le donne. */
    prixParPersonne: z.number().finite().nonnegative().max(1000).optional(),
    /** Durée de visite d'après la source web, en minutes. */
    dureeMinutes: z.number().int().min(15).max(600).optional(),
    /** Candidat enrichi (décision 0094 § 1) : secteur et incontournable du plan, infos pratiques de la source. */
    secteur: texteMaison(LONGUEURS_TEXTE.secteur).optional(),
    incontournable: texteMaison(LONGUEURS_TEXTE.incontournable).optional(),
    prix: texteMaison(LONGUEURS_TEXTE.prix).optional(),
    horaires: texteMaison(LONGUEURS_TEXTE.horaires).optional(),
    conseil: texteMaison(LONGUEURS_TEXTE.conseil).optional(),
  })
  /** `incontournable` présent exige `secteur` présent (0094 § 1 point 1). */
  .refine((candidat) => candidat.incontournable === undefined || candidat.secteur !== undefined, "incontournable sans secteur");
export type CandidatRecherche = z.infer<typeof CandidatRechercheSchema>;
