import { z } from "zod";

import { TripIdSchema } from "./billing";
import { CategorySchema } from "./category";
import { PREFERENCE_DIRECTIONS, PREFERENCE_ORIGINS, isPreferenceKey, preferenceKey } from "./values";

/**
 * Forme commune des préférences (décision 0021 § 1.3, reprise telle quelle par 0160 § 1.2 point 2 ; PR de contrat M8-C,
 * ticket 1041). Objets stricts : un `placeId`, un nom, une destination, un texte libre ou une clé inconnue sont refusés.
 * Une préférence est une donnée maison (code de catégorie et sens, ou distance), jamais une donnée Google (0011).
 */

/** Sujet d'une préférence : une catégorie dans un sens, ou la distance (« Tu préfères rester près de ton hôtel »). */
export const PreferenceSubjectSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("category"), category: CategorySchema, direction: z.enum(PREFERENCE_DIRECTIONS) }),
  z.strictObject({ kind: z.literal("distance") }),
]);
export type PreferenceSubject = z.infer<typeof PreferenceSubjectSchema>;

/** Clé d'un sujet possible (`preferenceKey`) : `category:museum:less`, `distance` ; tout autre texte est refusé. */
export const PreferenceKeySchema = z.string().refine(isPreferenceKey, { message: "clé de préférence inconnue" });

/** Base non raffinée, non exportée : Zod 4 refuse `.extend()` sur un objet raffiné. */
const RetainedPreferenceBaseSchema = z.strictObject({
  id: PreferenceKeySchema,
  origin: z.enum(PREFERENCE_ORIGINS),
  subject: PreferenceSubjectSchema,
});

/** Raffinement commun (0021 § 1.3, testé) : l'identifiant est la clé du sujet. */
function idEgalCleDuSujet(value: { id: string; subject: PreferenceSubject }, ctx: z.RefinementCtx): void {
  if (value.id !== preferenceKey(value.subject)) {
    ctx.addIssue({ code: "custom", message: "id : doit valoir preferenceKey(subject)", path: ["id"] });
  }
}

/**
 * Préférence retenue ou candidate (« Tu préfères éviter les musées », confirmé) : `{ id, origin, subject }`, avec
 * `id === preferenceKey(subject)`. Les candidats de l'écran 16 (`TripReview.tasteCandidates`) ont cette forme.
 */
export const RetainedPreferenceSchema = RetainedPreferenceBaseSchema.superRefine(idEgalCleDuSujet);
export type RetainedPreference = z.infer<typeof RetainedPreferenceSchema>;
/** Candidat de l'écran 16 : alias de type, pas un second schéma (0021 § 1.4). */
export type TasteCandidate = RetainedPreference;

/**
 * Goût retenu par une personne (« Tes goûts retenus », F11-PO-13 ; décision 0160 § 1.2 point 2, amende 0021 § 1.4) :
 * la préférence et son voyage d'origine, `null` quand ce voyage n'existe plus (« Retenu après un voyage »). Ni
 * destination (relue par `fromTripId` dans les résumés de « Mes voyages »), ni instant, ni nom, ni identifiant de ligne.
 */
export const RetainedTasteSchema = RetainedPreferenceBaseSchema.extend({
  fromTripId: TripIdSchema.nullable(),
}).superRefine(idEgalCleDuSujet);
export type RetainedTaste = z.infer<typeof RetainedTasteSchema>;
