import { z } from "zod";

import { CategorySchema } from "./category";
import { IsoDateSchema, TimeSchema } from "./trip";
import {
  ADULTS,
  AREA_LENGTH,
  BRIEF_FIELDS,
  CHILDREN,
  CITY_NAME_LENGTH,
  COMMITMENT_KINDS,
  COMMITMENT_LABEL_LENGTH,
  DESTINATION_LENGTH,
  KNOWN_LODGING_LENGTH,
  MAX_CITIES,
  MAX_COMMITMENTS,
  MEAL_BUDGET_CHF,
  MOBILITY_MODES,
  PACES,
  STORY_LENGTH,
  type BriefField,
} from "./values";

/**
 * Contrats de phase 0 de la création du voyage (décision 0017 § 2, F8-TL-2) : objets stricts, noms du handover
 * back-end, aucun texte d'interface. Les bornes viennent de `values.ts` (aucune seconde copie). F8a livre
 * `TripDraft`, `BriefRequest`, `Brief` et `InferredBrief` ; F8b et F8c complètent ce module.
 */

const text = (bounds: { min: number; max: number }) => z.string().trim().min(bounds.min).max(bounds.max);

/** Comparaison de deux `IsoDate` (« AAAA-MM-JJ ») ou de deux `Time` (« HH:MM ») : l'ordre du texte est celui du temps. */
const before = (a: string, b: string) => a < b;

/** Logement d'une ville (0017 § 2.2) : une suggestion retenue ne porte que des identifiants, jamais le nom affiché. */
export const LodgingSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("known"), label: text(KNOWN_LODGING_LENGTH) }),
  z.strictObject({ kind: z.literal("area"), label: text(AREA_LENGTH) }),
  z.strictObject({ kind: z.literal("none") }),
  z.strictObject({ kind: z.literal("suggestedLodging"), lodgingId: z.string().min(1), placeId: z.string().min(1).optional() }),
  z.strictObject({ kind: z.literal("suggestedArea"), areaId: z.string().min(1) }),
]);
export type Lodging = z.infer<typeof LodgingSchema>;

export const OtherCitySchema = z.strictObject({
  name: text(CITY_NAME_LENGTH),
  arrival: IsoDateSchema,
  lodging: LodgingSchema,
});
export type OtherCity = z.infer<typeof OtherCitySchema>;

export const TripCommitmentSchema = z.strictObject({
  kind: z.enum(COMMITMENT_KINDS),
  label: text(COMMITMENT_LABEL_LENGTH),
  date: IsoDateSchema,
  start: TimeSchema,
  end: TimeSchema.optional(),
});
export type TripCommitment = z.infer<typeof TripCommitmentSchema>;

/** Arrivées des autres villes strictement croissantes, strictement entre `start` et `end` (0017 § 2.2). */
function checkCities(
  trip: { start: string; end: string; otherCities: readonly { arrival: string }[] },
  ctx: z.RefinementCtx,
) {
  if (!before(trip.start, trip.end)) {
    ctx.addIssue({ code: "custom", path: ["end"], message: "départ après l'arrivée" });
  }
  let previous = trip.start;
  trip.otherCities.forEach((city, index) => {
    if (!before(previous, city.arrival) || !before(city.arrival, trip.end)) {
      ctx.addIssue({ code: "custom", path: ["otherCities", index, "arrival"], message: "arrivée hors des dates" });
    }
    previous = city.arrival;
  });
}

/**
 * Brouillon de l'écran 1 (0017 § 2.2). Les dates de départ de chaque ville ne sont pas stockées : elles se
 * déduisent (`cityRanges` de `src/features/creation/validation.ts`). « Arrivée au plus tôt aujourd'hui »
 * dépend de l'heure et du fuseau : ce n'est pas un raffinement du schéma (vérifié par `createTrip`, F8c).
 */
export const TripDraftSchema = z
  .strictObject({
    destination: text(DESTINATION_LENGTH),
    start: IsoDateSchema,
    end: IsoDateSchema,
    lodging: LodgingSchema,
    otherCities: z.array(OtherCitySchema).max(MAX_CITIES - 1),
    commitments: z.array(TripCommitmentSchema).max(MAX_COMMITMENTS),
  })
  .superRefine((draft, ctx) => {
    checkCities(draft, ctx);
    draft.commitments.forEach((commitment, index) => {
      if (before(commitment.date, draft.start) || before(draft.end, commitment.date)) {
        ctx.addIssue({ code: "custom", path: ["commitments", index, "date"], message: "date hors du voyage" });
      }
      if (commitment.end !== undefined && !before(commitment.start, commitment.end)) {
        ctx.addIssue({ code: "custom", path: ["commitments", index, "end"], message: "fin avant le début" });
      }
    });
  });
export type TripDraft = z.infer<typeof TripDraftSchema>;

/**
 * Entrée de `structureBrief` (0017 § 2.3) : le **minimum** que la structuration reçoit. Ni logement saisi, ni
 * identifiant de logement ou de lieu, ni engagement : ils ne servent pas à déduire le brief, et un `placeId` ne
 * doit pas entrer dans un prompt.
 */
export const BriefRequestSchema = z.strictObject({
  story: text(STORY_LENGTH),
  trip: z
    .strictObject({
      destination: text(DESTINATION_LENGTH),
      start: IsoDateSchema,
      end: IsoDateSchema,
      otherCities: z
        .array(z.strictObject({ name: text(CITY_NAME_LENGTH), arrival: IsoDateSchema }))
        .max(MAX_CITIES - 1),
    })
    .superRefine(checkCities),
});
export type BriefRequest = z.infer<typeof BriefRequestSchema>;

export const PaceSchema = z.enum(PACES);
export const MobilityModeSchema = z.enum(MOBILITY_MODES);
export const BriefFieldSchema = z.enum(BRIEF_FIELDS);

export const TravellersSchema = z.strictObject({
  adults: z.number().int().min(ADULTS.min).max(ADULTS.max),
  children: z.number().int().min(CHILDREN.min).max(CHILDREN.max),
});

const unique = <T>(values: readonly T[]) => new Set(values).size === values.length;
const categories = z.array(CategorySchema).refine(unique, "doublon");
const MealBudgetSchema = z.number().int().min(MEAL_BUDGET_CHF.min).max(MEAL_BUDGET_CHF.max);

function checkLimits(brief: { wishes?: readonly string[]; limits?: readonly string[] }, ctx: z.RefinementCtx) {
  const wishes = new Set(brief.wishes ?? []);
  if ((brief.limits ?? []).some((limit) => wishes.has(limit))) {
    ctx.addIssue({ code: "custom", path: ["limits"], message: "élément commun avec les envies" });
  }
}

/** Brief complet (0017 § 2.3), porté par `TripRequest` (F8c). */
export const BriefSchema = z
  .strictObject({
    travellers: TravellersSchema,
    pace: PaceSchema,
    wishes: categories.min(1),
    limits: categories,
    mobility: z.array(MobilityModeSchema).refine(unique, "doublon"),
    mealBudgetPerPerson: MealBudgetSchema.optional(),
    inferredFields: z.array(BriefFieldSchema).refine(unique, "doublon"),
  })
  .superRefine(checkLimits);
export type Brief = z.infer<typeof BriefSchema>;

/** Propriété du brief qui porte chaque champ de `BriefField`. */
export const BRIEF_FIELD_PROPERTY = {
  travellers: "travellers",
  pace: "pace",
  wishes: "wishes",
  mobility: "mobility",
  limits: "limits",
  mealBudget: "mealBudgetPerPerson",
} as const satisfies Record<BriefField, string>;

/**
 * Sortie de `structureBrief` (0017 § 2.3) : un brief déduit peut être incomplet (« aucun choix par défaut si le
 * rythme n'est pas déduit »). Tous les champs sont facultatifs ; `inferredFields` est exactement l'ensemble des
 * champs présents. Une sortie non conforme devient `provider_error` et rien n'est rendu (F8-PO-17).
 */
export const InferredBriefSchema = z
  .strictObject({
    travellers: TravellersSchema.optional(),
    pace: PaceSchema.optional(),
    wishes: categories.min(1).optional(),
    limits: categories.min(1).optional(),
    mobility: z.array(MobilityModeSchema).min(1).refine(unique, "doublon").optional(),
    mealBudgetPerPerson: MealBudgetSchema.optional(),
    inferredFields: z.array(BriefFieldSchema).refine(unique, "doublon"),
  })
  .superRefine((brief, ctx) => {
    checkLimits(brief, ctx);
    const present = BRIEF_FIELDS.filter((field) => brief[BRIEF_FIELD_PROPERTY[field]] !== undefined);
    const declared = new Set(brief.inferredFields);
    if (present.length !== declared.size || present.some((field) => !declared.has(field))) {
      ctx.addIssue({ code: "custom", path: ["inferredFields"], message: "champs déduits différents des champs présents" });
    }
  });
export type InferredBrief = z.infer<typeof InferredBriefSchema>;
