import { z } from "zod";

import { CategorySchema, CommitmentSchema, IsoDateSchema, TimeSchema, TimeZoneSchema } from "@/contracts";
import { PROTOTYPE_STAY_DAYS_MAX } from "@/contracts/values";

/**
 * Brief du prototype (spécification P0, P0-PO-2) : un fichier par voyage dans `prototype/briefs/`, commité.
 * Il préfigure le `Brief` de B9 sans le figer. **Aucune donnée personnelle** (ni nom, ni email, ni téléphone) :
 * un email ou un numéro de téléphone dans un champ texte fait refuser le brief, sans recopier la valeur.
 *
 * Module pur, feuille : n'importe que `@/contracts` et `zod`.
 */

export const RYTHMES = ["tranquille", "equilibre", "intense"] as const;
export type Rythme = (typeof RYTHMES)[number];

export const MODES_DEPLACEMENT = ["walk", "transit", "car"] as const;

/** Nom de brief accepté par `--brief` : jamais un chemin. */
export const NOM_BRIEF_PATTERN = /^[a-z0-9-]{1,32}$/;

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
/** Suite de 9 chiffres ou plus, séparés au plus par des espaces, points, tirets ou parenthèses. */
const TELEPHONE = /\+?\d(?:[\s.()-]*\d){8,}/;

function sansDonneePersonnelle(valeur: string): boolean {
  return !EMAIL.test(valeur) && !TELEPHONE.test(valeur);
}

const texte = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine(sansDonneePersonnelle, "donnée personnelle interdite dans un brief (email, téléphone)");

export const BriefSchema = z
  .strictObject({
    schema: z.literal(1),
    /** Ville ou région, texte maison. */
    destination: texte(80),
    pays: texte(60),
    /** Fuseau de la destination (champ maison de `Trip`). */
    fuseau: TimeZoneSchema,
    arrivee: IsoDateSchema,
    depart: IsoDateSchema,
    heureArrivee: TimeSchema,
    heureDepart: TimeSchema,
    voyageurs: z.strictObject({
      adultes: z.number().int().min(1).max(9),
      enfants: z.number().int().min(0).max(9),
    }),
    rythme: z.enum(RYTHMES),
    envies: z
      .array(CategorySchema)
      .min(1)
      .refine((valeurs) => new Set(valeurs).size === valeurs.length, "envies sans doublon"),
    /**
     * Catégories « à éviter » saisies par la personne (`limits` du brief de l'app ; spécification E2E-essai, lot 5) :
     * facultatif, absent quand rien n'est coché, sans doublon et jamais une envie (même règle que `checkLimits`).
     */
    aEviter: z
      .array(CategorySchema)
      .min(1)
      .refine((valeurs) => new Set(valeurs).size === valeurs.length, "à éviter sans doublon")
      .optional(),
    deplacements: z
      .array(z.enum(MODES_DEPLACEMENT))
      .min(1)
      .refine((valeurs) => new Set(valeurs).size === valeurs.length, "déplacements sans doublon"),
    /** Niveau de budget par repas, 1 à 3 (facultatif). */
    budgetRepas: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    /** Logement(s) : texte maison (nom de l'hôtel ou quartier) et nombre de nuits ; résolu par l'ancrage. */
    logements: z.array(z.strictObject({ texte: texte(120), nuits: z.number().int().min(1).max(60) })).min(1).max(5),
    /** Billets ou réservations à heure fixe. */
    engagements: z
      .array(
        z.strictObject({
          libelle: texte(80),
          date: IsoDateSchema,
          heure: TimeSchema,
          type: CommitmentSchema,
        }),
      )
      .max(10)
      .optional(),
    /** Récit libre, 1 000 caractères au plus (Q84) ; envoyé au fournisseur d'IA (Q197). */
    recit: texte(1000).optional(),
  })
  .superRefine((brief, ctx) => {
    if (brief.depart < brief.arrivee) {
      ctx.addIssue({ code: "custom", message: "départ avant l'arrivée", path: ["depart"] });
    }
    const jours = (Date.parse(`${brief.depart}T00:00:00Z`) - Date.parse(`${brief.arrivee}T00:00:00Z`)) / 86_400_000;
    // Borne unique, relue par l'écran 1 du site d'essai (`src/features/creation/validation.ts`).
    if (jours > PROTOTYPE_STAY_DAYS_MAX - 1) {
      ctx.addIssue({ code: "custom", message: `séjour de ${PROTOTYPE_STAY_DAYS_MAX} jours au plus`, path: ["depart"] });
    }
    const nuits = brief.logements.reduce((total, logement) => total + logement.nuits, 0);
    if (nuits !== jours) {
      ctx.addIssue({ code: "custom", message: "les nuits des logements couvrent le séjour", path: ["logements"] });
    }
    const envies = new Set<string>(brief.envies);
    if ((brief.aEviter ?? []).some((categorie) => envies.has(categorie))) {
      ctx.addIssue({ code: "custom", message: "à éviter commun avec les envies", path: ["aEviter"] });
    }
    for (const engagement of brief.engagements ?? []) {
      if (engagement.date < brief.arrivee || engagement.date > brief.depart) {
        ctx.addIssue({ code: "custom", message: "engagement hors du séjour", path: ["engagements"] });
      }
    }
  });
export type Brief = z.infer<typeof BriefSchema>;
