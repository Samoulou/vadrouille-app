import { z } from "zod";

import { contientUrl, texteMaison } from "@/contracts";

/**
 * Copies tenues égales de `src/prototype/candidat.ts` (décision 0077 § 1 point 3, B7-TL-1 : liste fermée ; toute autre
 * copie demande un amendement de 0077). `src/ai` n'importe plus rien de `src/prototype` ; l'original reste pour P0, et
 * `tests/unit/p0/copies.test.ts` vérifie que les deux côtés restent égaux (listes et motifs élément par élément, même
 * verdict de `NotesSchema` sur une table de valeurs, égalité des types). Une copie qui doit diverger cesse d'être une
 * copie : décision du Tech Lead. `texteMaison` et `contientUrl` ne sont plus des copies : les deux modules les
 * réexportent de `src/contracts/texte.ts` (0094 § 7, ticket 633).
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

/**
 * Règle de texte maison : **réexportée** de `src/contracts/texte.ts`, sa seule définition (décision 0094 § 7, amendement
 * de 0077 § 1 point 3 ; ticket 633). Une ligne, Unicode imprimable, sans balise ni URL, espaces de début et de fin
 * retirés avant la mesure. `tests/unit/p0/copies.test.ts` vérifie que c'est la même fonction ; la table de verdicts vit
 * dans `src/contracts/texte.test.ts`.
 */
export { contientUrl, texteMaison };

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
