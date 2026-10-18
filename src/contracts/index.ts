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
  MoveDraftSchema,
  MoveFixtureSchema,
  MoveOptionsSchema,
  MoveRequestSchema,
  ReplacementDraftSchema,
  ReplacementFixtureSchema,
  ReplacementRequestSchema,
  RevisionFixturesSchema,
  RevisionPreviewSchema,
} from "./revision";
export type {
  ApplyResult,
  MoveDraft,
  MoveFixture,
  MoveOptions,
  MoveRequest,
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
  FullTripStatusSchema,
  GenerationDaySchema,
  GenerationStatusSchema,
  InferredBriefSchema,
  LodgingRequestSchema,
  LodgingSchema,
  LodgingSuggestionSchema,
  MobilityModeSchema,
  OtherCitySchema,
  PaceSchema,
  TravellersSchema,
  TripCommitmentSchema,
  TripDraftSchema,
  TripRequestSchema,
} from "./creation";
export type {
  Brief,
  BriefRequest,
  CreatedTrip,
  FullTripStatus,
  FullTripStatusRequest,
  GenerationDay,
  GenerationStatus,
  GenerationStatusRequest,
  InferredBrief,
  Lodging,
  LodgingRequest,
  LodgingSuggestion,
  OtherCity,
  RetryGenerationRequest,
  TripCommitment,
  TripDraft,
  TripRequest,
} from "./creation";
export { CodeRequestSchema, CodeVerificationSchema, SessionSchema } from "./auth";
export type { CodeRequest, CodeVerification, Session } from "./auth";
export type {
  CreatedShareLink,
  ShareRequest,
  ShareStatus,
  SharedDay,
  SharedDayItem,
  SharedDayMap,
  SharedDayView,
  SharedEvent,
  SharedMapPoint,
  SharedStop,
  SharedTrip,
  SharedTripView,
} from "./share";
export { ApiErrorCodeSchema, ApiErrorSchema, fail, ok } from "./errors";
export type { ApiError, Result } from "./errors";
// Valeurs sans Zod (décision 0016 § 3.1 règle 1) : `mapPointKey`, `DETOUR_THRESHOLD_MINUTES`, `CATEGORIES`,
// `PREFERENCE_REASONS` et celles du paiement. Le code serveur continue de les lire ici.
export * from "./values";
