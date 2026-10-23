import { z } from "zod";

import { TripIdSchema } from "./billing";
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
  GENERATION_DAY_STATES,
  GENERATION_FAILURE_REASONS,
  KNOWN_LODGING_LENGTH,
  MAX_CITIES,
  MAX_COMMITMENTS,
  MAX_SUGGESTED_LODGINGS,
  MEAL_BUDGET_CHF,
  MOBILITY_MODES,
  PACES,
  STORY_LENGTH,
  type BriefField,
} from "./values";

/**
 * Contrats de phase 0 de la création du voyage (décision 0017 § 2, F8-TL-2) : objets stricts, noms du handover
 * back-end, aucun texte d'interface. Les bornes viennent de `values.ts` (aucune seconde copie). F8a livre
 * `TripDraft`, `BriefRequest`, `Brief` et `InferredBrief` ; F8b `LodgingRequest` et `LodgingSuggestion` ; F8c
 * `TripRequest`, `CreatedTrip`, `GenerationStatusRequest` et `GenerationStatus`. La PR de contrat de B9b (0081
 * § B9-TL-14) ajoute les valeurs maison des suggestions retenues (B9-TL-5), `GenerationDay` (exporté pour le tableau
 * des champs du handover § 5) et `RetryGenerationRequest` (B9-TL-11). La PR de contrat de B9d (0087 § 1.1 et § 1.5)
 * ajoute `kind` à `RetryGenerationRequest`, `FullTripStatusRequest` et `FullTripStatus`.
 */

const text = (bounds: { min: number; max: number }) => z.string().trim().min(bounds.min).max(bounds.max);

/** Comparaison de deux `IsoDate` (« AAAA-MM-JJ ») ou de deux `Time` (« HH:MM ») : l'ordre du texte est celui du temps. */
const before = (a: string, b: string) => a < b;

/** Textes maison des suggestions : jamais un nom Google (spécification F8, « Source des noms »). */
const houseText = z.string().trim().min(1).max(160);
const identifier = z.string().min(1).max(64);
/** Centre et rayon d'une zone maison (sortie du modèle, B7) : jamais une géométrie ni des coordonnées Google (0011, 0027). */
const center = z.strictObject({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
const radiusM = z.number().int().min(50).max(20_000);

/**
 * Logement d'une ville (0017 § 2.2, amendé par 0081 § B9-TL-5). Une suggestion retenue porte ses **valeurs maison**
 * (nom, et pour une zone son centre et son rayon), avec les mêmes schémas et bornes que `LodgingSuggestionSchema`,
 * parce que `suggestLodging` ne stocke rien et que `createTrip` en a besoin (B9-PO-2). Saisie non fiable : revalidée
 * par ce schéma à l'entrée de `createTrip`, jamais envoyée à un modèle ; le `placeId` est revérifié par une fiche au
 * début du workflow 1, jamais cru.
 */
export const LodgingSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("known"), label: text(KNOWN_LODGING_LENGTH) }),
  z.strictObject({ kind: z.literal("area"), label: text(AREA_LENGTH) }),
  z.strictObject({ kind: z.literal("none") }),
  z.strictObject({ kind: z.literal("suggestedLodging"), lodgingId: identifier, placeId: identifier.optional(), name: houseText }),
  z.strictObject({ kind: z.literal("suggestedArea"), areaId: identifier, name: houseText, center, radiusM }),
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
 * Ville choisie à l'écran 1 du site d'essai dans les suggestions Google (demande de Samuel du 23 octobre 2026 ; ajout
 * facultatif, par addition) : le `placeId` (seul identifiant Google conservable), et le pays et le fuseau **des tables
 * maison** retrouvés côté serveur à partir de la fiche (`src/server/composition/villes.ts`). Forme seulement : le code
 * et le fuseau sont revérifiés côté serveur contre la table maison des pays (`fuseauDuPays` de `src/lib/fuseaux`, liste
 * fermée), jamais repris tels quels. Aucun texte Google.
 */
export const DestinationRegionSchema = z.strictObject({
  /** Identifiant de lieu Google de la ville choisie. */
  placeId: z.string().regex(/^[A-Za-z0-9_-]{1,256}$/),
  /** Code ISO 3166-1 alpha-2 du pays (table maison). */
  country: z.string().regex(/^[A-Z]{2}$/),
  /** Fuseau IANA de la table maison pour ce pays. */
  timeZone: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_+\-/]+$/),
});
export type DestinationRegion = z.infer<typeof DestinationRegionSchema>;

/**
 * Brouillon de l'écran 1 (0017 § 2.2). Les dates de départ de chaque ville ne sont pas stockées : elles se
 * déduisent (`cityRanges` de `src/features/creation/validation.ts`). « Arrivée au plus tôt aujourd'hui »
 * dépend de l'heure et du fuseau : ce n'est pas un raffinement du schéma (vérifié par `createTrip`, F8c).
 */
export const TripDraftSchema = z
  .strictObject({
    destination: text(DESTINATION_LENGTH),
    /** Facultatif : ville choisie dans les suggestions (site d'essai) : `placeId`, pays et fuseau maison. */
    destinationRegion: DestinationRegionSchema.optional(),
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

/*
 * Écran 3 « Où loger » (0017 § 2.4, F8b).
 */

/**
 * Demande de `suggestLodging` (0017 § 2.4) : le brouillon validé et la ville, `0` pour la destination, `i` pour
 * `otherCities[i − 1]`. Ni `requestId` ni brief : c'est le « `TripRequest` sans logement » du handover.
 */
export const LodgingRequestSchema = z
  .strictObject({
    draft: TripDraftSchema,
    city: z.number().int().min(0).max(MAX_CITIES - 1),
  })
  .superRefine((request, ctx) => {
    if (request.city > request.draft.otherCities.length) {
      ctx.addIssue({ code: "custom", path: ["city"], message: "ville absente du brouillon" });
    }
  });
export type LodgingRequest = z.infer<typeof LodgingRequestSchema>;

/**
 * Quartier conseillé et jusqu'à 3 logements (0017 § 2.4) : identifiants, noms et raisons **maison** (entre
 * crochets dans le jeu simulé), centre et rayon de la zone maison (jamais une géométrie Google). Aucun prix, aucune
 * photo, aucun lien de réservation (F8-Q5, Q6).
 */
export const LodgingSuggestionSchema = z.strictObject({
  area: z.strictObject({
    areaId: identifier,
    name: houseText,
    reason: houseText,
    center,
    radiusM,
  }),
  lodgings: z
    .array(
      z.strictObject({
        lodgingId: identifier,
        placeId: identifier.optional(),
        name: houseText,
        meta: houseText,
      }),
    )
    .max(MAX_SUGGESTED_LODGINGS),
});
export type LodgingSuggestion = z.infer<typeof LodgingSuggestionSchema>;

/*
 * Lancement et écran 5 « Propositions prêtes » (0017 § 2.4, F8c).
 */

/**
 * Demande de `createTrip` (0017 § 2.4) : `requestId` créé une fois par brouillon (idempotence par organisation et
 * `requestId`), brouillon validé (choix de logement compris, identifiants seulement) et brief complet. L'organisation
 * **n'y figure pas** : elle vient de la session (F8-PO-17).
 */
export const TripRequestSchema = z.strictObject({
  requestId: z.uuid(),
  draft: TripDraftSchema,
  brief: BriefSchema,
  /**
   * Récit saisi à l'écran 2, facultatif (décision 0125 § 1, spécification E2E-essai lot 3) : seul l'adaptateur
   * `prototype` le lit (il le transmet au brief de la chaîne inversée) ; `mock` et `api` l'ignorent.
   */
  story: text(STORY_LENGTH).optional(),
});
export type TripRequest = z.infer<typeof TripRequestSchema>;

// `CreatedTripSchema`, `GenerationStatusRequestSchema`, `RetryGenerationRequestSchema` (B9b, `kind` par B9d) et
// `FullTripStatusRequestSchema` (B9d) ne sont pas réexportés par `index.ts` (seulement leurs types) : enveloppes d'une
// action (`{ tripId }`, `{ tripId, requestId, kind? }`), absentes
// de « Contrats à créer » et du tableau des champs du handover § 5 (même règle que `share.ts`). Les actions et l'adaptateur simulé les importent depuis `@/contracts/creation`.

/** Réponse de `createTrip` (0017 § 2.4) : l'identifiant du voyage, que l'écran 5 relit par `TripAdapter`. */
export const CreatedTripSchema = z.strictObject({ tripId: TripIdSchema });
export type CreatedTrip = z.infer<typeof CreatedTripSchema>;

/** Entrée de l'action `getGenerationStatus` : l'identifiant du voyage seulement. */
export const GenerationStatusRequestSchema = z.strictObject({ tripId: TripIdSchema });
export type GenerationStatusRequest = z.infer<typeof GenerationStatusRequestSchema>;

const count = z.number().int().min(0);

/** Un jour couvert par les premières propositions : rang (1 = J1), état, propositions prêtes ce jour-là (U2-Q2). */
export const GenerationDaySchema = z.strictObject({
  index: z.number().int().positive(),
  state: z.enum(GENERATION_DAY_STATES),
  readyStops: count,
});
export type GenerationDay = z.infer<typeof GenerationDaySchema>;

const generationFields = {
  tripId: TripIdSchema,
  days: z.array(GenerationDaySchema).min(1),
  expected: count,
  ready: count,
};

/**
 * Avancement de la génération (0017 § 2.4), union discriminée sur `phase`. **Aucun nom de lieu ni identifiant
 * d'étape** : l'écran 5 ne montre que des anneaux (F8-PO-12). Raffinements : jours dans l'ordre sans doublon,
 * `ready` = somme des `readyStops` et au plus `expected` ; `ready` = `expected` pour `ready`, `ready` < `expected`
 * pour `incomplete` ; tous les jours prêts pour `ready` et `incomplete`.
 */
export const GenerationStatusSchema = z
  .discriminatedUnion("phase", [
    z.strictObject({ phase: z.literal("preparing"), ...generationFields }),
    z.strictObject({ phase: z.literal("ready"), ...generationFields }),
    z.strictObject({ phase: z.literal("incomplete"), ...generationFields }),
    z.strictObject({
      phase: z.literal("failed"),
      ...generationFields,
      reason: z.enum(GENERATION_FAILURE_REASONS),
      retryable: z.boolean(),
    }),
  ])
  .superRefine((status, ctx) => {
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
    status.days.forEach((day, position) => {
      if (day.index !== position + 1) issue(["days", position, "index"], "jours dans l'ordre");
    });
    if (status.days.reduce((total, day) => total + day.readyStops, 0) !== status.ready) issue(["ready"], "somme des readyStops");
    if (status.ready > status.expected) issue(["ready"], "au plus expected");
    if (status.phase === "ready" && status.ready !== status.expected) issue(["ready"], "ready = expected");
    if (status.phase === "incomplete" && status.ready >= status.expected) issue(["ready"], "ready < expected");
    if ((status.phase === "ready" || status.phase === "incomplete") && status.days.some((day) => day.state !== "ready")) {
      issue(["days"], "tous les jours prêts");
    }
  });
export type GenerationStatus = z.infer<typeof GenerationStatusSchema>;

/** Génération que relance `retryGeneration` (0087 § 1.1 point 2) : l'aperçu (écran 5) ou le voyage complet (Séjour, 6b). */
export const RETRY_GENERATION_KINDS = ["preview", "full"] as const;

/**
 * Entrée de `retryGeneration` (0081 § B9-TL-11, B9-PO-9, étendue par 0087 § 1.1 et B9-PO-17 point 2) : seul chemin
 * d'un nouvel essai par la personne. `requestId` est créé une fois par essai. `kind` désigne la génération relancée ;
 * **absent, il vaut `preview`** (l'appel de B9b, `{ tripId, requestId }`, est inchangé). Réponse : `CreatedTrip`
 * (`{ tripId }`). Refus sans écriture : `validation_failed` si rien n'est à relancer, `active_preview_exists` (aperçu
 * seulement : jamais pour `kind: "full"`, 0087 § 1.1 point 4) si une autre génération de l'organisation est en cours,
 * `not_found` pour un voyage d'une autre organisation.
 */
export const RetryGenerationRequestSchema = z.strictObject({
  tripId: TripIdSchema,
  requestId: z.uuid(),
  kind: z.enum(RETRY_GENERATION_KINDS).optional(),
});
export type RetryGenerationRequest = z.infer<typeof RetryGenerationRequestSchema>;

/** Entrée de la lecture `getFullTripStatus` (0087 § 1.5 point 2) : l'identifiant du voyage seulement. */
export const FullTripStatusRequestSchema = z.strictObject({ tripId: TripIdSchema });
export type FullTripStatusRequest = z.infer<typeof FullTripStatusRequestSchema>;

/**
 * État du voyage complet (0087 § 1.5 point 2), source des deux bandeaux `error` de Séjour et de 6b ; union discriminée
 * sur `phase` : `none` (aucun droit ou aucune exécution du voyage complet), `preparing` (`queued` ou `preparing`),
 * `ready`, `incomplete`, `failed` avec `retryable`, vrai si et seulement si « Réessayer » est proposé à la personne
 * (cause réessayable et exécution non bloquée, 0087 § 1.4). Chaque variante porte `tripId`, **rien d'autre** : ni
 * reprises restantes, ni raison d'échec, ni nom de lieu, ni identifiant d'étape ou de rang. `Day.generating` (0086
 * § 1.7) reste la source du bandeau `generating`.
 */
export const FullTripStatusSchema = z.discriminatedUnion("phase", [
  z.strictObject({ phase: z.literal("none"), tripId: TripIdSchema }),
  z.strictObject({ phase: z.literal("preparing"), tripId: TripIdSchema }),
  z.strictObject({ phase: z.literal("ready"), tripId: TripIdSchema }),
  z.strictObject({ phase: z.literal("incomplete"), tripId: TripIdSchema }),
  z.strictObject({ phase: z.literal("failed"), tripId: TripIdSchema, retryable: z.boolean() }),
]);
export type FullTripStatus = z.infer<typeof FullTripStatusSchema>;
