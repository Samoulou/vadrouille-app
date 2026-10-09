import { z } from "zod";

import { CategorySchema } from "./category";

/**
 * Contrats du programme de voyage (handover front-end § 9).
 *
 * Tous les objets sont stricts : un champ inconnu est refusé. C'est ce qui
 * empêche d'y glisser des contenus Google (note, horaires, photos,
 * coordonnées) : seul `Stop.placeId` peut venir de Google (CONTEXT.md,
 * principe technique 2).
 */

/** Heure locale de la destination, « HH:MM » de 00:00 à 23:59. */
export const TimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "heure attendue au format HH:MM (00:00 à 23:59)");

/** Date ISO « AAAA-MM-JJ » (date réelle du calendrier). */
export const IsoDateSchema = z.iso.date("date attendue au format AAAA-MM-JJ");

const MinutesSchema = z.number().int().nonnegative();
const TextSchema = z.string().min(1);

export const WeekdaySchema = z.enum(["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."]);
export type Weekday = z.infer<typeof WeekdaySchema>;

/** Badges d'exception uniquement ; jamais « Vérifié » (handover § 0, règle 5). */
export const ExceptionSchema = z.enum(["toReserve", "toConfirm", "unconfirmed"]);
export type Exception = z.infer<typeof ExceptionSchema>;

export const SourceSchema = z.strictObject({
  label: TextSchema,
  url: z.url(),
});
export type Source = z.infer<typeof SourceSchema>;

export const StopSchema = z.strictObject({
  id: TextSchema,
  kind: z.enum(["activity", "meal", "event"]),
  /** Identifiant de lieu Google : seul élément Google stockable. */
  placeId: TextSchema.optional(),
  name: TextSchema,
  start: TimeSchema,
  end: TimeSchema.optional(),
  meta: z.string(),
  reason: TextSchema.optional(),
  source: SourceSchema.optional(),
  verifiedAt: IsoDateSchema.optional(),
  /** Au plus 2 badges par étape (design system, Tag). */
  exceptions: z.array(ExceptionSchema).max(2),
  locked: z.boolean(),
});
export type Stop = z.infer<typeof StopSchema>;

export const SegmentSchema = z.strictObject({
  mode: z.enum(["walk", "transit", "car"]),
  minutes: MinutesSchema,
  /** Affiche « (estimation) ». */
  estimated: z.boolean(),
});
export type Segment = z.infer<typeof SegmentSchema>;

export const DayLineItemSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("terminus"),
    role: z.enum(["start", "end"]),
    time: TimeSchema,
    label: TextSchema,
  }),
  z.strictObject({ type: z.literal("stop"), stop: StopSchema }),
  z.strictObject({ type: z.literal("segment"), segment: SegmentSchema }),
  z.strictObject({ type: z.literal("free"), from: TimeSchema, to: TimeSchema }),
]);
export type DayLineItem = z.infer<typeof DayLineItemSchema>;

/**
 * Idée « Surprends-moi » d'un jour (décision 0015 § 3) : hors programme, choisie côté serveur
 * (sélection de B6). Justification et source obligatoires : une idée sans source n'existe pas
 * (principe produit 2). Seul `placeId` peut venir de Google ; `name` suit la règle de `Stop.name`.
 */
export const SurpriseIdeaSchema = z.strictObject({
  id: TextSchema,
  placeId: TextSchema.optional(),
  name: TextSchema,
  meta: z.string(),
  reason: TextSchema,
  source: SourceSchema,
  verifiedAt: IsoDateSchema.optional(),
});
export type SurpriseIdea = z.infer<typeof SurpriseIdeaSchema>;

const EventStopSchema = StopSchema.refine((stop) => stop.kind === "event", {
  message: "Day.events ne contient que des étapes de kind « event »",
  path: ["kind"],
});

export const DaySchema = z.strictObject({
  /** 1 = J1. */
  index: z.number().int().positive(),
  date: IsoDateSchema,
  weekday: WeekdaySchema,
  title: TextSchema,
  items: z.array(DayLineItemSchema),
  /** Nombre ; formaté côté interface (Intl.NumberFormat « fr-CH »). */
  budgetPerPerson: z.number().nonnegative().optional(),
  /** Événements du jour seulement. */
  events: z.array(EventStopSchema),
  generating: z.boolean(),
  /** Total des trajets du jour, hors excursion. */
  travelMinutes: MinutesSchema,
  /** Budget du rythme choisi, fourni par les données (à calibrer, Q8). */
  travelBudgetMinutes: MinutesSchema,
  /** Idée « Surprends-moi » du jour, facultative (décision 0015 § 3) : ajout au handover § 9, signalé. */
  surprise: SurpriseIdeaSchema.optional(),
});
export type Day = z.infer<typeof DaySchema>;

export const ChecklistItemSchema = z.strictObject({
  id: TextSchema,
  label: TextSchema,
  when: TextSchema,
  done: z.boolean(),
  bookingUrl: z.url().optional(),
  sponsored: z.boolean(),
});
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;

export const TripSchema = z.strictObject({
  id: TextSchema,
  /** Toute donnée appartient à une organisation (cadrage § 6.8). */
  organizationId: TextSchema,
  destination: TextSchema,
  destinationColor: z.enum(["bruyere", "azulejo", "ocre", "granit"]),
  start: IsoDateSchema,
  end: IsoDateSchema,
  travellers: z.strictObject({
    adults: z.number().int().nonnegative(),
    children: z.number().int().nonnegative(),
  }),
  days: z.array(DaySchema),
  checklist: z.array(ChecklistItemSchema),
  /** Voyage débloqué ou non. */
  unlocked: z.boolean(),
});
export type Trip = z.infer<typeof TripSchema>;

/** Au-delà de ce trajet, une proposition doit justifier son détour (cadrage § 3.7). */
export const DETOUR_THRESHOLD_MINUTES = 20;

export const ProposalSchema = z
  .strictObject({
    id: TextSchema,
    kind: z.enum(["activity", "meal"]),
    day: z.number().int().positive(),
    weekday: WeekdaySchema,
    time: TimeSchema,
    /** « Entre ton déjeuner et [Distillerie] ». */
    context: TextSchema,
    stop: StopSchema,
    /** Catégorie (décision 0013, § 3.1) : ajout au handover § 9, signalé comme `Trip.organizationId`. */
    category: CategorySchema,
    /** Repas : option 1 sur 3 au plus (cadrage § 3.4). */
    option: z
      .strictObject({
        index: z.number().int().min(1),
        total: z.number().int().max(3),
      })
      .refine((option) => option.index <= option.total, {
        message: "option : 1 ≤ index ≤ total ≤ 3",
        path: ["index"],
      })
      .optional(),
    photoUrl: z.url().optional(),
    /** Trajet depuis l'étape précédente (ou l'hôtel). */
    travelFromPrevious: SegmentSchema.optional(),
    /** Ce qui justifie le détour, obligatoire si le trajet dépasse 20 min. */
    detour: TextSchema.optional(),
  })
  .superRefine((proposal, ctx) => {
    const minutes = proposal.travelFromPrevious?.minutes ?? 0;
    if (minutes > DETOUR_THRESHOLD_MINUTES && proposal.detour === undefined) {
      ctx.addIssue({
        code: "custom",
        message: `detour obligatoire quand le trajet dépasse ${DETOUR_THRESHOLD_MINUTES} min`,
        path: ["detour"],
      });
    }
  });
export type Proposal = z.infer<typeof ProposalSchema>;

export const ChangeSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("replaced"), time: TimeSchema, before: TextSchema, after: TextSchema }),
  z.strictObject({ type: z.literal("moved"), label: TextSchema, before: TextSchema, after: TextSchema }),
  z.strictObject({
    type: z.literal("segment"),
    before: MinutesSchema,
    after: MinutesSchema,
    estimated: z.boolean(),
  }),
  z.strictObject({ type: z.literal("budget"), deltaPerPerson: z.number() }),
  z.strictObject({ type: z.literal("unchanged"), label: TextSchema, time: TimeSchema }),
]);
export type Change = z.infer<typeof ChangeSchema>;
