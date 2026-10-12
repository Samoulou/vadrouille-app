export {
  ChangeSchema,
  ChecklistItemSchema,
  CommitmentSchema,
  DayLineItemSchema,
  DaySchema,
  ExceptionSchema,
  IsoDateSchema,
  MealSchema,
  ProposalSchema,
  SegmentSchema,
  SourceSchema,
  StopSchema,
  SurpriseIdeaSchema,
  TimeSchema,
  TimeZoneSchema,
  TripSchema,
  WeekdaySchema,
} from "./trip";
export type {
  Change,
  ChecklistItem,
  Commitment,
  Day,
  DayLineItem,
  Exception,
  Meal,
  Proposal,
  Segment,
  Source,
  Stop,
  SurpriseIdea,
  Trip,
  Weekday,
} from "./trip";
export { TripSummarySchema } from "./trip-summary";
export type { TripSummary } from "./trip-summary";
export {
  DayMapSchema,
  MapPointRefSchema,
  MapPointSchema,
  validateDayMap,
} from "./map";
export type { DayMap, MapPoint, MapPointRef } from "./map";
export { CategorySchema } from "./category";
export type { Category } from "./category";
export { PreferenceAnswerSchema, PreferencePromptSchema, PreferenceReasonSchema } from "./deck";
export type { PreferenceAnswer, PreferencePrompt, PreferenceReason } from "./deck";
export {
  AppPathSchema,
  CheckoutIdSchema,
  CheckoutOutcomeSchema,
  CheckoutRequestSchema,
  CheckoutStartSchema,
  CheckoutStatusCodeSchema,
  CheckoutStatusRequestSchema,
  CheckoutStatusSchema,
  CurrencySchema,
  OfferConfigSchema,
  OfferInclusionSchema,
  OfferSchema,
  PaymentMethodSchema,
  PriceVariantSchema,
  SimulateOutcomeRequestSchema,
  TripIdSchema,
} from "./billing";
export type {
  CheckoutRequest,
  CheckoutStart,
  CheckoutStatus,
  CheckoutStatusRequest,
  Offer,
  OfferConfig,
  SimulateOutcomeRequest,
} from "./billing";
export {
  BRIEF_FIELD_PROPERTY,
  BriefFieldSchema,
  BriefRequestSchema,
  BriefSchema,
  InferredBriefSchema,
  LodgingSchema,
  MobilityModeSchema,
  OtherCitySchema,
  PaceSchema,
  TravellersSchema,
  TripCommitmentSchema,
  TripDraftSchema,
} from "./creation";
export type { Brief, BriefRequest, InferredBrief, Lodging, OtherCity, TripCommitment, TripDraft } from "./creation";
export { ApiErrorCodeSchema, ApiErrorSchema, fail, ok } from "./errors";
export type { ApiError, Result } from "./errors";
// Valeurs sans Zod (décision 0016 § 3.1 règle 1) : `mapPointKey`, `DETOUR_THRESHOLD_MINUTES`, `CATEGORIES`,
// `PREFERENCE_REASONS` et celles du paiement. Le code serveur continue de les lire ici.
export * from "./values";
