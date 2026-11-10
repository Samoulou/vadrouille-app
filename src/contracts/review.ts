import { z } from "zod";

import { TripIdSchema } from "./billing";
import { PreferenceKeySchema, RetainedPreferenceSchema, RetainedTasteSchema } from "./preference";
import { IdSchema } from "./trip";
import { PREFERENCE_SUBJECTS_MAX, REVIEW_ACCESS, STOP_RATINGS } from "./values";

/**
 * Contrats de l'écran 16 « Après le voyage » (décision 0021 § 1.4, complétée et amendée par 0160 § 1.2 point 3 ; PR de
 * contrat M8-C, ticket 1041 ; spécification `specs/M8-apres-le-voyage-api.md` § 6.1). Objets stricts : ni `placeId`, ni
 * nom d'étape ou d'adresse, ni destination, ni texte libre. Aucun cas d'usage ni action ici : M8a et M8c-1 les branchent.
 *
 * Les étapes à évaluer ne sont pas dans le contrat : elles se dérivent du `Trip` par une fonction pure (0160 § 1.5
 * point 4). Aucune liste d'adresses à part : une adresse découverte est une étape `addedBy: "discovered"` (0160 § 1.2 point 4).
 */

/** Sans doublon, pour les raffinements ci-dessous. */
function distincts(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

/**
 * Avis donné sur une étape de la version courante : identifiant d'étape maison et valeur. **Sans `placeId`** : l'identité
 * par lieu vit en base (`stop_reviews`), et le serveur ne renvoie que les avis des étapes de la version courante (0160
 * § 1.1 point 5).
 */
export const StopReviewSchema = z.strictObject({
  stopId: IdSchema,
  rating: z.enum(STOP_RATINGS),
});
export type StopReview = z.infer<typeof StopReviewSchema>;

/**
 * Lecture de l'écran 16 (`getTripReview`, 0160 § 1.2 point 3) : accès calculé par le serveur, avis déjà donnés, goûts
 * candidats (calculés à la lecture, triés par `preferenceKey`) et clés des goûts déjà retenus par la personne (« Déjà
 * retenu »). Avant le dernier jour (`notEnded`), ni avis ni candidat.
 */
export const TripReviewSchema = z
  .strictObject({
    tripId: TripIdSchema,
    access: z.enum(REVIEW_ACCESS),
    reviews: z.array(StopReviewSchema),
    tasteCandidates: z.array(RetainedPreferenceSchema).max(PREFERENCE_SUBJECTS_MAX),
    retainedIds: z.array(PreferenceKeySchema).max(PREFERENCE_SUBJECTS_MAX),
  })
  .superRefine((review, ctx) => {
    if (!distincts(review.reviews.map((avis) => avis.stopId))) {
      ctx.addIssue({ code: "custom", message: "reviews : un avis au plus par étape", path: ["reviews"] });
    }
    if (!distincts(review.tasteCandidates.map((candidat) => candidat.id))) {
      ctx.addIssue({ code: "custom", message: "tasteCandidates : identifiants distincts", path: ["tasteCandidates"] });
    }
    if (!distincts(review.retainedIds)) {
      ctx.addIssue({ code: "custom", message: "retainedIds : clés distinctes", path: ["retainedIds"] });
    }
    if (review.access === "notEnded" && (review.reviews.length > 0 || review.tasteCandidates.length > 0)) {
      ctx.addIssue({ code: "custom", message: "notEnded : ni avis ni candidat", path: ["access"] });
    }
  });
export type TripReview = z.infer<typeof TripReviewSchema>;

/**
 * Avis sur une étape (`rateStop`, M8a) : `rating: null` efface l'avis (spécification § 3.2 point 3). Le `placeId` de
 * l'étape est lu par le serveur dans la version courante, jamais reçu du client (0160 § 1.1 point 3).
 */
export const StopReviewRequestSchema = z.strictObject({
  tripId: TripIdSchema,
  stopId: IdSchema,
  rating: z.enum(STOP_RATINGS).nullable(),
  requestId: z.uuid(),
});
export type StopReviewRequest = z.infer<typeof StopReviewRequestSchema>;

/**
 * « Retenir ces goûts » (`retainTastes`, M8c-1) : clés des candidats cochés, 1 à 17, sans doublon. Sujet, origine et
 * voyage d'origine sont recalculés par le serveur, jamais reçus du client (0160 § 1.8 point 4).
 */
export const RetainTastesRequestSchema = z.strictObject({
  tripId: TripIdSchema,
  candidateIds: z
    .array(PreferenceKeySchema)
    .min(1)
    .max(PREFERENCE_SUBJECTS_MAX)
    .refine(distincts, { message: "candidateIds : clés distinctes" }),
  requestId: z.uuid(),
});
export type RetainTastesRequest = z.infer<typeof RetainTastesRequestSchema>;

/**
 * « Retirer » un goût (`removeTaste`, M8c-1) : `tasteId` est `preferenceKey(subject)` ; l'identifiant de ligne de la
 * base n'est jamais exposé. Le serveur ne supprime que le goût de la personne et de l'organisation de la session.
 */
export const RemoveTasteRequestSchema = z.strictObject({
  tasteId: PreferenceKeySchema,
  requestId: z.uuid(),
});
export type RemoveTasteRequest = z.infer<typeof RemoveTasteRequestSchema>;

/** « Annuler » un retrait (`restoreTaste`, M8c-1) : le goût rendu par `removeTaste` (0160 § 1.2 point 6 ; S2). */
export const RestoreTasteRequestSchema = z.strictObject({
  taste: RetainedTasteSchema,
  requestId: z.uuid(),
});
export type RestoreTasteRequest = z.infer<typeof RestoreTasteRequestSchema>;

/** « Retirer tous mes goûts » (`removeAllTastes`, M8c-1) : aucune autre donnée que l'idempotence. */
export const RemoveAllTastesRequestSchema = z.strictObject({
  requestId: z.uuid(),
});
export type RemoveAllTastesRequest = z.infer<typeof RemoveAllTastesRequestSchema>;
