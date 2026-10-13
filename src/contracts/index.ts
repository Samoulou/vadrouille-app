export {
  ChangeSchema,
  ChecklistItemSchema,
  ChecklistMomentSchema,
  CommitmentSchema,
  DayLineItemSchema,
  DaySchema,
  ExceptionSchema,
  HttpsUrlSchema,
  IsoDateSchema,
  MealSchema,
  ProposalBaseSchema,
  ProposalNeighbourSchema,
  ProposalNeighboursSchema,
  ProposalSchema,
  SegmentSchema,
  SourceSchema,
  StopFactsSchema,
  StopSchema,
  SurpriseIdeaSchema,
  TimeSchema,
  TimeZoneSchema,
  TripBaseSchema,
  TripSchema,
  WeekdaySchema,
} from "./trip";
export type {
  Change,
  ChecklistItem,
  ChecklistMoment,
  Commitment,
  Day,
  DayLineItem,
  Exception,
  Meal,
  Proposal,
  ProposalNeighbour,
  ProposalNeighbours,
  Segment,
  Source,
  Stop,
  StopFacts,
  SurpriseIdea,
  Trip,
  Weekday,
} from "./trip";
export {
  refineChecklistDays,
  refineChecklistStops,
  refineDetour,
  refineEventKind,
  refineNoCommitment,
  refineSnapshotExceptions,
} from "./refinements";
export {
  DayLineItemSnapshotSchema,
  DaySnapshotSchema,
  EventSnapshotSchema,
  ProposalRecordSchema,
  SegmentSnapshotSchema,
  StopSnapshotSchema,
  SurpriseIdeaSnapshotSchema,
  TripSnapshotSchema,
} from "./snapshot";
export type {
  DayLineItemSnapshot,
  DaySnapshot,
  EventSnapshot,
  ProposalRecord,
  SegmentSnapshot,
  StopSnapshot,
  SurpriseIdeaSnapshot,
  TripSnapshot,
} from "./snapshot";
export { PreviewSlotSchema, PreviewSlotsSchema } from "./preview";
export type { PreviewSlot } from "./preview";
export { ADDED_STOP_NAME_MAX, PatchResultSchema, TripPatchOperationSchema, TripPatchSchema } from "./patch";
export type { PatchResult, TripPatch, TripPatchOperation } from "./patch";
export {
  ReplacementDraftSchema,
  ReplacementFixtureSchema,
  ReplacementRequestSchema,
  RevisionFixturesSchema,
  RevisionPreviewSchema,
} from "./revision";
export type {
  ApplyResult,
  ReplacementDraft,
  ReplacementFixture,
  ReplacementRequest,
  RevisionError,
  RevisionFixtures,
  RevisionPreview,
  RevisionResult,
} from "./revision";
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
