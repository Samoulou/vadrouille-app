import { z } from "zod";

import { CategorySchema } from "./category";
import {
  refineChecklistDays,
  refineChecklistStops,
  refineDetour,
  refineEventKind,
  refineNoCommitment,
} from "./refinements";
import { STOP_KINDS, WEEKDAYS } from "./values";

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

/**
 * Fuseau horaire IANA de la destination (`Europe/London`), champ maison (spécification F10, F10-TL-1 ; décision
 * 0021 § 3). Tout identifiant accepté par `Intl.DateTimeFormat` passe, alias compris (`Asia/Kolkata`, `UTC`) :
 * la liste `Intl.supportedValuesOf("timeZone")` ne contient que les noms canoniques de l'environnement.
 */
export const TimeZoneSchema = z.string().min(1).refine(
  (value) => {
    try {
      new Intl.DateTimeFormat("fr", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  },
  { message: "fuseau horaire IANA attendu (par exemple Europe/London)" },
);

const MinutesSchema = z.number().int().nonnegative();
const TextSchema = z.string().min(1);

/**
 * Jour abrégé (« sam. »), calculé depuis `Day.date` par `weekdayOf` (`./values`, seul calcul ; évolution E1 de B2) :
 * ce n'est plus un champ de `Day` ni de `Proposal`. Il type `DayBadge`, `DayTabs` et la forme réduite du prototype,
 * qui garde son champ.
 */
export const WeekdaySchema = z.enum(WEEKDAYS);
export type Weekday = z.infer<typeof WeekdaySchema>;

/** Badges d'exception uniquement ; jamais « Vérifié » (handover § 0, règle 5). */
export const ExceptionSchema = z.enum(["toReserve", "toConfirm", "unconfirmed"]);
export type Exception = z.infer<typeof ExceptionSchema>;

/**
 * Adresse issue du web (handover back-end § 12) : protocole `https:` seulement. `http:`, `javascript:`, `data:`,
 * `ftp:` et toute autre forme sont refusées.
 */
export const HttpsUrlSchema = z.url({ protocol: /^https$/, error: "adresse https attendue" });

export const SourceSchema = z.strictObject({
  label: TextSchema,
  url: HttpsUrlSchema,
});
export type Source = z.infer<typeof SourceSchema>;

/**
 * Engagement saisi par la personne avant la génération (décision 0015 § 9) : billet ou réservation.
 * Indépendant du verrou : un engagement déverrouillé garde la trace de sa réservation.
 */
export const CommitmentSchema = z.enum(["ticket", "reservation"]);
export type Commitment = z.infer<typeof CommitmentSchema>;

/**
 * Faits d'une étape (évolution E3 de B2, B2-PO-2), à la place du texte `meta` : l'interface compose
 * « {secteur}, {durée}, {coût} ». Objet vide valide (aucune ligne de faits). Noms de clés égaux à
 * `STOP_FACTS_KEYS` de B1.
 */
export const StopFactsSchema = z.strictObject({
  /** Durée prévue de la visite ou du repas, en minutes. */
  durationMinutes: z.number().int().positive().optional(),
  /** Coût estimé par personne, en CHF (unité de `Day.budgetPerPerson`) ; 0 = gratuit. */
  costPerPerson: z.number().nonnegative().optional(),
  /**
   * Secteur (« Old Town ») : contenu maison issu de notre recherche web, jamais le secteur d'un résultat Google
   * (décision 0016 § 4.3).
   */
  area: z.string().min(1).max(60).optional(),
});
export type StopFacts = z.infer<typeof StopFactsSchema>;

export const StopSchema = z.strictObject({
  id: TextSchema,
  kind: z.enum(STOP_KINDS),
  /** Identifiant de lieu Google : seul élément Google stockable. */
  placeId: TextSchema.optional(),
  name: TextSchema,
  start: TimeSchema,
  end: TimeSchema.optional(),
  facts: StopFactsSchema,
  reason: TextSchema.optional(),
  source: SourceSchema.optional(),
  verifiedAt: IsoDateSchema.optional(),
  /** Au plus 2 badges par étape (design system, Tag). */
  exceptions: z.array(ExceptionSchema).max(2),
  locked: z.boolean(),
  /** Engagement saisi (décision 0015 § 9) : ajout au handover § 9, signalé. Absent : pas un engagement. */
  commitment: CommitmentSchema.optional(),
});
export type Stop = z.infer<typeof StopSchema>;

export const SegmentSchema = z.strictObject({
  mode: z.enum(["walk", "transit", "car"]),
  /** `null` : temps indisponible (prototype seulement, décision 0092 § 4) ; le MVP ne produit jamais `null`. */
  minutes: MinutesSchema.nullable(),
  /** Affiche « (estimation) ». */
  estimated: z.boolean(),
});
export type Segment = z.infer<typeof SegmentSchema>;

/** Repas d'un créneau laissé vide (décision 0015 § 2). */
export const MealSchema = z.enum(["lunch", "dinner"]);
export type Meal = z.infer<typeof MealSchema>;

/*
 * Variantes de la ligne du jour, exportées de ce module (pas de `index.ts`) pour que `DayLineItemSnapshotSchema`
 * les reprenne par référence, sans copie (spécification B2, § 1).
 */
export const TerminusItemSchema = z.strictObject({
  type: z.literal("terminus"),
  role: z.enum(["start", "end"]),
  time: TimeSchema,
  label: TextSchema,
});
export const StopItemSchema = z.strictObject({ type: z.literal("stop"), stop: StopSchema });
export const SegmentItemSchema = z.strictObject({ type: z.literal("segment"), segment: SegmentSchema });
export const FreeItemSchema = z.strictObject({ type: z.literal("free"), from: TimeSchema, to: TimeSchema });
/**
 * Créneau de repas pas encore choisi (décision 0015 § 2, évolution E8 ; F6-PO-7) : sans nom ni lieu,
 * il ne peut porter aucune donnée de lieu. Ce n'est pas une étape : ni numéro sur la carte, ni fiche.
 */
export const OpenMealItemSchema = z.strictObject({ type: z.literal("openMeal"), time: TimeSchema, meal: MealSchema });

export const DayLineItemSchema = z.discriminatedUnion("type", [
  TerminusItemSchema,
  StopItemSchema,
  SegmentItemSchema,
  FreeItemSchema,
  OpenMealItemSchema,
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
  facts: StopFactsSchema,
  reason: TextSchema,
  source: SourceSchema,
  verifiedAt: IsoDateSchema.optional(),
});
export type SurpriseIdea = z.infer<typeof SurpriseIdeaSchema>;

/** Événement de `Day.events` : `StopSchema` + `refineEventKind`. */
export const EventStopSchema = StopSchema.superRefine(refineEventKind);

export const DaySchema = z.strictObject({
  /** 1 = J1. */
  index: z.number().int().positive(),
  /** Jour de la semaine et titre (« Samedi 29 août ») sont calculés par l'interface depuis cette date (E1). */
  date: IsoDateSchema,
  items: z.array(DayLineItemSchema),
  /** Nombre ; formaté côté interface (`fr-CH`, `formatNombre` de `src/lib/nombre.ts`, indépendant de l'ICU). */
  budgetPerPerson: z.number().nonnegative().optional(),
  /** Événements du jour seulement. */
  events: z.array(EventStopSchema),
  generating: z.boolean(),
  /**
   * Total des trajets du jour, hors excursion. `null` : total indisponible, un trajet du jour est sans durée
   * (prototype seulement, décision 0092 § 4) ; le MVP ne produit jamais `null`.
   */
  travelMinutes: MinutesSchema.nullable(),
  /** Budget du rythme choisi, fourni par les données (à calibrer, Q8). */
  travelBudgetMinutes: MinutesSchema,
  /** Idée « Surprends-moi » du jour, facultative (décision 0015 § 3) : ajout au handover § 9, signalé. */
  surprise: SurpriseIdeaSchema.optional(),
});
export type Day = z.infer<typeof DaySchema>;

/**
 * Moment d'une ligne « À faire » (évolution E4, décision 0010 PO-2), à la place d'un texte : l'interface compose
 * « Avant le {date} », « Avant le départ », « À l'arrivée » ou « J{n} ».
 */
export const ChecklistMomentSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("deadline"), date: IsoDateSchema }),
  z.strictObject({ type: z.literal("beforeDeparture") }),
  /** 1 = J1 ; ne dépasse pas `Trip.days.length` (`refineChecklistDays`). */
  z.strictObject({ type: z.literal("tripDay"), day: z.number().int().positive() }),
]);
export type ChecklistMoment = z.infer<typeof ChecklistMomentSchema>;

export const ChecklistItemSchema = z.strictObject({
  id: TextSchema,
  label: TextSchema,
  when: ChecklistMomentSchema,
  done: z.boolean(),
  bookingUrl: HttpsUrlSchema.optional(),
  sponsored: z.boolean(),
  /**
   * Étape concernée (évolution E9, décision 0016 § 11) : identifiant interne d'une étape ou d'un événement du
   * voyage (`refineChecklistStops`), jamais un `placeId`.
   */
  stopId: TextSchema.optional(),
});
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;

/**
 * Voyage, objet strict **non raffiné** : base des dérivations (`TripSummarySchema`, `TripSnapshotSchema`, forme
 * réduite du prototype), Zod 4 refusant `.pick()` et `.omit()` sur un objet raffiné. Le contrat public est
 * `TripSchema`.
 */
export const TripBaseSchema = z.strictObject({
  id: TextSchema,
  /** Toute donnée appartient à une organisation (cadrage § 6.8). */
  organizationId: TextSchema,
  destination: TextSchema,
  destinationColor: z.enum(["bruyere", "azulejo", "ocre", "granit"]),
  start: IsoDateSchema,
  end: IsoDateSchema,
  /**
   * Fuseau de la destination : « aujourd'hui » et « en cours » s'y calculent (F11-PO-6, F10-PO-3). Ajout au
   * handover § 9, signalé (créé par F11a, décision 0021 § 3, dans la forme de F10-TL-1).
   */
  timeZone: TimeZoneSchema,
  travellers: z.strictObject({
    adults: z.number().int().nonnegative(),
    children: z.number().int().nonnegative(),
  }),
  days: z.array(DaySchema),
  checklist: z.array(ChecklistItemSchema),
  /** Voyage débloqué ou non. */
  unlocked: z.boolean(),
});

/** Voyage : `TripBaseSchema` + raffinements du voyage entier (E4, E9). */
export const TripSchema = TripBaseSchema.superRefine(refineChecklistDays).superRefine(refineChecklistStops);
export type Trip = z.infer<typeof TripSchema>;

/**
 * Voisin d'une proposition (évolution E2, décision 0037 B2-TL-1) : élément de la ligne du jour qui précède ou
 * suit son créneau. Aucun nom ni texte : l'interface lit le nom d'une étape dans le voyage.
 */
export const ProposalNeighbourSchema = z.discriminatedUnion("type", [
  /** Étape (activité ou événement) du même jour, par identifiant. */
  z.strictObject({ type: z.literal("stop"), stopId: TextSchema }),
  /** Repas, choisi ou laissé vide. */
  z.strictObject({ type: z.literal("meal"), meal: MealSchema }),
  z.strictObject({ type: z.literal("free") }),
  /** Départ du logement (`start`) ou retour au logement (`end`). */
  z.strictObject({ type: z.literal("terminus"), role: z.enum(["start", "end"]) }),
]);
export type ProposalNeighbour = z.infer<typeof ProposalNeighbourSchema>;

/**
 * Voisins d'une proposition : **calculé** à la lecture par le moteur (B5), jamais stocké. `{}` quand le jour est
 * en préparation ou sans élément de part et d'autre (B2-PO-13).
 */
export const ProposalNeighboursSchema = z.strictObject({
  before: ProposalNeighbourSchema.optional(),
  after: ProposalNeighbourSchema.optional(),
});
export type ProposalNeighbours = z.infer<typeof ProposalNeighboursSchema>;

/**
 * Proposition, objet strict **non raffiné** : base de `ProposalRecordSchema`. Le contrat public est
 * `ProposalSchema`. Jour de la semaine et contexte sont calculés par l'interface (E1, E2).
 */
export const ProposalBaseSchema = z.strictObject({
  id: TextSchema,
  kind: z.enum(["activity", "meal"]),
  day: z.number().int().positive(),
  time: TimeSchema,
  /** Voisins du créneau, pour « Entre ton déjeuner et [Distillerie] » composé par l'interface. */
  neighbours: ProposalNeighboursSchema,
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
});

/** Proposition : `ProposalBaseSchema` + `refineNoCommitment` + `refineDetour`. */
export const ProposalSchema = ProposalBaseSchema.superRefine(refineNoCommitment).superRefine(refineDetour);
export type Proposal = z.infer<typeof ProposalSchema>;

/** Moment d'une étape déplacée (décision 0016 § 4.5) : jour (1 = J1) et heure, sans texte composé (handover § 9). */
const ChangeMomentSchema = z.strictObject({ day: z.number().int().positive(), time: TimeSchema });

/**
 * Changement de l'aperçu des effets (handover § 9, forme de la décision 0016 § 4.5, appliquée par F7a) : aucun
 * texte d'interface, `ChangeSet` compose les lignes. Les noms (`label`, `before`, `after` de `replaced`) sont des
 * noms maison (`Stop.name`, ou le nom saisi pour un ajout), jamais un nom Google.
 */
export const ChangeSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("replaced"), time: TimeSchema, before: TextSchema, after: TextSchema }),
  /** Étape ajoutée (F7c) : heure et nom saisi. */
  z.strictObject({ type: z.literal("added"), time: TimeSchema, label: TextSchema }),
  z.strictObject({ type: z.literal("moved"), label: TextSchema, before: ChangeMomentSchema, after: ChangeMomentSchema }),
  z.strictObject({
    type: z.literal("segment"),
    /** Nom de l'étape d'arrivée, pour distinguer deux trajets (« Trajet vers {nom} »). */
    label: TextSchema,
    before: MinutesSchema,
    after: MinutesSchema,
    estimated: z.boolean(),
  }),
  z.strictObject({ type: z.literal("budget"), deltaPerPerson: z.number() }),
  z.strictObject({ type: z.literal("unchanged"), label: TextSchema, time: TimeSchema }),
]);
export type Change = z.infer<typeof ChangeSchema>;
