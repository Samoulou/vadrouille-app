import { z } from "zod";

import { refineEventKind, refineNoCommitment, refineSnapshotExceptions } from "./refinements";
import {
  DaySchema,
  FreeItemSchema,
  OpenMealItemSchema,
  ProposalBaseSchema,
  SegmentItemSchema,
  SegmentSchema,
  StopItemSchema,
  StopSchema,
  SurpriseIdeaSchema,
  TerminusItemSchema,
  TripBaseSchema,
} from "./trip";

/**
 * Schémas de stockage dérivés (décision 0010, principes 6 et 7, amendés par 0037 ; spécification B2, § 1).
 *
 * Méthode : dérivation **depuis les bases non raffinées seulement** (`TripBaseSchema`, `ProposalBaseSchema`, ou
 * `StopSchema`, qui n'a aucun raffinement), par `.omit()` et `.pick()`. Le seul `.extend()` admis remplace un champ
 * de type objet ou tableau par sa version de stockage, elle-même dérivée ; un champ scalaire n'est jamais
 * redéclaré. Les raffinements sont ceux de `refinements.ts`, réappliqués.
 *
 * Omis (catégorie du handover § 5, « Partie Q5 » de 0011) : `Segment.minutes`, `Stop.verifiedAt`,
 * `SurpriseIdea.verifiedAt`, `Day.travelMinutes` (dérivés de Google, recomposés à la lecture), `Day.budgetPerPerson`,
 * `Day.generating`, `Proposal.neighbours`, `Proposal.option` (calculés), `Proposal.photoUrl` (chargé à la demande).
 * `exceptions` garde son type ; `toConfirm` y est refusé par `refineSnapshotExceptions`.
 *
 * Chaque écriture passe par ces schémas stricts (handover § 6) : une clé Google (`displayName`, `rating`…) est
 * refusée à tous les niveaux.
 */

export const SegmentSnapshotSchema = SegmentSchema.omit({ minutes: true });
export type SegmentSnapshot = z.infer<typeof SegmentSnapshotSchema>;

/** Étape du programme stockée : `commitment` reste admis (une étape du programme peut être un engagement). */
export const StopSnapshotSchema = StopSchema.omit({ verifiedAt: true }).superRefine(refineSnapshotExceptions);
export type StopSnapshot = z.infer<typeof StopSnapshotSchema>;

export const EventSnapshotSchema = StopSnapshotSchema.superRefine(refineEventKind);
export type EventSnapshot = z.infer<typeof EventSnapshotSchema>;

export const SurpriseIdeaSnapshotSchema = SurpriseIdeaSchema.omit({ verifiedAt: true });
export type SurpriseIdeaSnapshot = z.infer<typeof SurpriseIdeaSnapshotSchema>;

/**
 * Mêmes variantes que `DayLineItemSchema` : `terminus` (avec son `label`, Q50), `free` et `openMeal` par référence ;
 * `stop` et `segment` portent leur version de stockage.
 */
export const DayLineItemSnapshotSchema = z.discriminatedUnion("type", [
  TerminusItemSchema,
  StopItemSchema.extend({ stop: StopSnapshotSchema }),
  SegmentItemSchema.extend({ segment: SegmentSnapshotSchema }),
  FreeItemSchema,
  OpenMealItemSchema,
]);
export type DayLineItemSnapshot = z.infer<typeof DayLineItemSnapshotSchema>;

export const DaySnapshotSchema = DaySchema.omit({ budgetPerPerson: true, generating: true, travelMinutes: true }).extend({
  items: z.array(DayLineItemSnapshotSchema),
  events: z.array(EventSnapshotSchema),
  surprise: SurpriseIdeaSnapshotSchema.optional(),
});
export type DaySnapshot = z.infer<typeof DaySnapshotSchema>;

/**
 * Contenu de `trip_versions.snapshot` : les jours seulement (0037, B2-TL-2). Les autres champs stockés du voyage
 * vivent dans `trips` et `checklist_items` ; leur cohérence est contrôlée par `TripSchema` à la recomposition (B6).
 */
export const TripSnapshotSchema = TripBaseSchema.pick({ days: true }).extend({ days: z.array(DaySnapshotSchema) });
export type TripSnapshot = z.infer<typeof TripSnapshotSchema>;

/**
 * Contenu de `proposals.content` : `detour` y est obligatoire (« Partie Q5 ») et `stop.commitment` refusé (une
 * proposition n'est jamais un engagement). Clés de premier niveau égales à `PROPOSAL_RECORD_KEYS` de B1.
 */
export const ProposalRecordSchema = ProposalBaseSchema.omit({ neighbours: true, option: true, photoUrl: true })
  .extend({ stop: StopSnapshotSchema, travelFromPrevious: SegmentSnapshotSchema.optional() })
  .required({ detour: true })
  .superRefine(refineNoCommitment);
export type ProposalRecord = z.infer<typeof ProposalRecordSchema>;
