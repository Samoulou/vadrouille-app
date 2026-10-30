import { z } from "zod";

import { CategorySchema } from "./category";
import {
  refineChecklistDays,
  refineChecklistStops,
  refineDetour,
  refineEventKind,
  refineNoCommitment,
} from "./refinements";
import { LONGUEURS_CONTRAT, texteMaison } from "./texte";
import { CHECKLIST_KINDS, MAX_CITIES, STOP_KINDS, STOP_REPORT_REASONS, TRIP_ID_PATTERN, WEEKDAYS } from "./values";

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
/** Identifiant interne (étape, ligne, aperçu) : chaîne non vide ; partagé avec `revision.ts`. */
export const IdSchema = z.string().min(1);

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
  /*
   * Infos pratiques (décision 0094 § 7 ; décision 0116 § 6, lot 1 bis) : texte maison facultatif, une ligne, sans
   * balise ni URL (`texteMaison`), jamais un texte Google. Affichées en texte brut, jamais en lien ni en HTML ;
   * absentes de la vue partagée (décision 0103) et de `candidates.facts` (`STOP_FACTS_KEYS` inchangé).
   */
  /** Conseil pratique (« Réserve le créneau de 9 h »). */
  tip: texteMaison(LONGUEURS_CONTRAT.tip).optional(),
  /** Note de prix en texte (« Environ 18 EUR, gratuit le premier dimanche ») ; le montant chiffré reste `costPerPerson`. */
  priceNote: texteMaison(LONGUEURS_CONTRAT.priceNote).optional(),
  /** Note d'horaires en texte (« Fermé le lundi ») ; jamais les horaires d'une fiche Google. */
  hoursNote: texteMaison(LONGUEURS_CONTRAT.hoursNote).optional(),
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
  /**
   * Lieu à soi (décision 0147 § 6.1, T6) : `"person"` quand la personne a ajouté l'étape (opération `add`, écrit par le
   * moteur), absent pour une étape du programme. Stocké dans l'instantané, rétabli par un `revert` ; absent de la vue
   * partagée (liste blanche de `shared_stop`). M8b étendra la valeur (`"discovered"`).
   */
  addedBy: z.literal("person").optional(),
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

/**
 * Changement de ville, ligne « Vers {ville} » de la ligne du jour (décision 0148 § 1, T1 ; spécification M4 § 3.2).
 * Ce n'est **pas une étape** : ni `Stop` ni `Segment` (`Day.travelMinutes` ne le compte pas), sans identifiant, donc
 * jamais visé par un patch (`replace`, `move`, `lock`). **Aucun `placeId`, aucune donnée Google** : `from` et `to`
 * sont les noms maison des villes (`Trip.cities`), `estimatedMinutes` est une estimation du modèle (0148 § 2), les
 * heures saisies viennent de la personne. Absent de la vue partagée (liste blanche, `SharedDayItemSchema`).
 *
 * Raffinement : `source: "entered"` (billet ou vol saisi) exige `label` et interdit `estimatedMinutes` et `mode` ;
 * `source: "estimated"` interdit `end` et `label` ; `end`, s'il est présent, est postérieur à `start`.
 */
export const TransferItemSchema = z
  .strictObject({
    type: z.literal("transfer"),
    /** Nom maison de la ville quittée (celui de `Trip.cities`). */
    from: TextSchema,
    /** Nom maison de la ville d'arrivée. */
    to: TextSchema,
    source: z.enum(["entered", "estimated"]),
    /** Départ : heure du billet ou du vol, sinon départ estimé (0148 § 5.2). */
    start: TimeSchema,
    /** Arrivée : seulement l'heure de fin saisie ; absente = « à confirmer ». */
    end: TimeSchema.optional(),
    /** Durée estimée, en minutes (0148 § 2) ; absente = « durée à confirmer ». */
    estimatedMinutes: MinutesSchema.optional(),
    /** Libellé saisi par la personne (« Train Rome–Florence »). */
    label: TextSchema.optional(),
    /** Mode d'un départ estimé (spécification M4 § 3.3) ; absent avec la marche seule. */
    mode: z.enum(["car", "transit"]).optional(),
  })
  .superRefine((item, ctx) => {
    if (item.source === "entered") {
      if (item.label === undefined) ctx.addIssue({ code: "custom", message: "transfer saisi : label obligatoire", path: ["label"] });
      if (item.estimatedMinutes !== undefined) {
        ctx.addIssue({ code: "custom", message: "transfer saisi : estimatedMinutes interdit", path: ["estimatedMinutes"] });
      }
      if (item.mode !== undefined) ctx.addIssue({ code: "custom", message: "transfer saisi : mode interdit", path: ["mode"] });
    } else {
      if (item.end !== undefined) ctx.addIssue({ code: "custom", message: "transfer estimé : end interdit", path: ["end"] });
      if (item.label !== undefined) ctx.addIssue({ code: "custom", message: "transfer estimé : label interdit", path: ["label"] });
    }
    // « HH:MM » : l'ordre des chaînes est celui des heures.
    if (item.end !== undefined && item.end <= item.start) {
      ctx.addIssue({ code: "custom", message: "transfer : end postérieur à start", path: ["end"] });
    }
  });
export type TransferItem = z.infer<typeof TransferItemSchema>;

export const DayLineItemSchema = z.discriminatedUnion("type", [
  TerminusItemSchema,
  StopItemSchema,
  SegmentItemSchema,
  FreeItemSchema,
  OpenMealItemSchema,
  TransferItemSchema,
]);
export type DayLineItem = z.infer<typeof DayLineItemSchema>;

/**
 * Idée « Surprends-moi » d'un jour (décision 0015 § 3) : hors programme, choisie côté serveur
 * par la génération (`ideeDuJour` de B5b, B9 ; décision 0086 § 3, question 3) et lue telle que stockée. Justification et source obligatoires : une idée sans source n'existe pas
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
  /**
   * Titre libre du jour (« Colisée et Monti »), texte maison facultatif (décision 0116 § 6, lot 1 bis) : il s'affiche
   * sous le titre calculé depuis la date, qu'il ne remplace pas (E1). Absent de la vue partagée (liste blanche).
   */
  theme: texteMaison(LONGUEURS_CONTRAT.theme).optional(),
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
  /**
   * Sorte de la ligne (décision 0147 § 6.2, T8), obligatoire : `reservation` (libellé = le seul nom de l'étape, le
   * préfixe « Réserver : » est composé à l'écran ; seule sorte comptée par `countToReserve`), `ticket` (engagement déjà
   * pris, § 6.3), `other` (bon plan).
   */
  kind: z.enum(CHECKLIST_KINDS),
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
 * Coche ou décoche une ligne « À faire » (handover § 4, écran 11 ; décision 0086 § 2.2 point 2, créé par B6b au lieu
 * de B11) : état final, rejouer donne le même résultat. Objet strict : aucun `organizationId` ni `userId` (le contexte
 * vient de la session). `tripId` suit `TRIP_ID_PATTERN` ; un identifiant qui n'est pas un `uuid` est traité comme
 * inconnu par le serveur (`not_found`, B6-PO-11).
 */
export const ChecklistUpdateSchema = z.strictObject({
  tripId: z.string().regex(TRIP_ID_PATTERN),
  itemId: TextSchema,
  done: z.boolean(),
});
export type ChecklistUpdate = z.infer<typeof ChecklistUpdateSchema>;

/**
 * Signalement d'une erreur sur une étape (décision 0147 § 1, T1 ; action `reportStop` de M5c) : motif fermé
 * (`STOP_REPORT_REASONS`), **aucun champ de texte** (M5-PO-9). Objet strict : tout champ de plus (texte, `placeId`,
 * `organizationId`) est refusé (`validation_failed`). `tripId` suit `TRIP_ID_PATTERN` comme `ChecklistUpdate` ;
 * `stopId` est l'identifiant interne de l'étape ; `requestId` rend l'envoi idempotent.
 */
export const StopReportSchema = z.strictObject({
  tripId: z.string().regex(TRIP_ID_PATTERN),
  stopId: IdSchema,
  reason: z.enum(STOP_REPORT_REASONS),
  requestId: z.uuid(),
});
export type StopReport = z.infer<typeof StopReportSchema>;

/**
 * Ville d'un voyage à plusieurs villes (décision 0148 § 6) : nom maison et dates, `end` exclusif (date d'arrivée dans
 * la ville suivante, ou fin du voyage), comme une ligne `stays`. Aucun `placeId`, aucune donnée Google.
 */
export const TripCitySchema = z.strictObject({ name: TextSchema, start: IsoDateSchema, end: IsoDateSchema });
export type TripCity = z.infer<typeof TripCitySchema>;

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
  /**
   * Villes du voyage, dans l'ordre (décision 0148 § 6, T6) : **absent pour un voyage à une seule ville**, de 2 à
   * `MAX_CITIES` sinon. Lu depuis les lignes `stays` par la lecture des voyages, jamais depuis l'instantané ; `end`
   * exclusif (date d'arrivée dans la ville suivante, ou fin du voyage), comme `stays`. Noms maison seulement. Absent de
   * `SharedTripSchema` et de `TripSnapshotSchema`.
   */
  cities: z.array(TripCitySchema).min(2).max(MAX_CITIES).optional(),
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
  /*
   * Variantes de M5 (décision 0147 § 5.1), ajoutées à la fin de l'union sans renommer ni réordonner.
   */
  /** Étape présente dans la version de départ, absente de la version d'arrivée ; `before` : son jour et son heure. */
  z.strictObject({ type: z.literal("removed"), label: TextSchema, before: ChangeMomentSchema }),
  /** Verrou posé sur une étape (même identité avant et après, 0147 § 5.2 point 3) ; `time` : son heure d'arrivée. */
  z.strictObject({ type: z.literal("locked"), label: TextSchema, time: TimeSchema }),
  /** Verrou retiré d'une étape. */
  z.strictObject({ type: z.literal("unlocked"), label: TextSchema, time: TimeSchema }),
  /**
   * Ligne « À faire » ajoutée ou retirée par l'écriture (0016 § 11, F7-PO-20 ; spécification M5 § 7.4) : `label` est
   * `ChecklistItem.label` (nom maison). Ajoutée par la fonction de liste côté serveur (0147 § 7), jamais par
   * `changements()`.
   */
  z.strictObject({ type: z.literal("checklist"), action: z.enum(["added", "removed"]), label: TextSchema }),
]);
export type Change = z.infer<typeof ChangeSchema>;
