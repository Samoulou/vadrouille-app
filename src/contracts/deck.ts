import { z } from "zod";

import { TripIdSchema } from "./billing";
import { CategorySchema } from "./category";
import {
  DECK_DECISIONS,
  PREFERENCE_REASONS,
  PREFERENCE_SIGNAL_ORIGINS,
  PREFERENCE_SIGNAL_STATUSES,
  PREFERENCE_SIGNALS,
} from "./values";

/**
 * Question de préférence et réponse de la présentation (décision 0013, § 3.2).
 *
 * F6 ne pose que les champs dont il a besoin ; B10 les étend (`PreferenceAnswerRequest`, compteurs de
 * `DeckDecisionResult`, décision 0112 § 1) sans renommer ceux-ci.
 */

/** Codes de raison de B0 : Pas mon style, Trop chargé, Trop cher, Trop loin, Autre raison (dans cet ordre, `values.ts`). */
export const PreferenceReasonSchema = z.enum(PREFERENCE_REASONS);
export type PreferenceReason = z.infer<typeof PreferenceReasonSchema>;

export const PreferencePromptSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("category"), category: CategorySchema }),
  z.strictObject({ kind: z.literal("distance") }),
]);
export type PreferencePrompt = z.infer<typeof PreferencePromptSchema>;

export const PreferenceAnswerSchema = z.strictObject({
  answer: z.enum(["yes", "no"]),
  reason: PreferenceReasonSchema.optional(),
});
export type PreferenceAnswer = z.infer<typeof PreferenceAnswerSchema>;

/*
 * Tri enregistré côté serveur (spécification B10, B10a ; décision 0112 § 1, B10-TL-1). Entrées des actions
 * `decideCard`, `undoDecision`, `answerPreferencePrompt` et `completeDeck`, leurs réponses, l'état du tri lu par
 * l'écran (`DeckSession`) et la forme d'un signal enregistré (`PreferenceSignal`). Objets stricts : un champ inconnu
 * (`organizationId`, `userId`, un nom, un `placeId`) est refusé. L'organisation et la personne viennent de la session,
 * jamais de l'entrée. Aucun nom de lieu, aucun `placeId` ni aucune donnée Google n'entre ou ne sort par ces contrats.
 */

/** Identifiant d'une proposition : `Proposal.id` (identifiant d'étape de la case, B9c), jamais une clé de la base. */
const ProposalIdSchema = z.string().min(1);

/**
 * Entrée de `decideCard` (B10a point 2, B10-PO-2) : une décision sur une carte du tri ouvert. `requestId` est créé une
 * fois par geste (idempotence par voyage). Ni geste (il reste dans l'événement de mesure, B10-PO-2 point 1), ni raison
 * (elle s'enregistre avec la réponse à la question, B10-PO-2 point 3), ni catégorie, ni nature : le serveur les lit sur
 * la proposition.
 */
export const DeckDecisionSchema = z.strictObject({
  tripId: TripIdSchema,
  requestId: z.uuid(),
  proposalId: ProposalIdSchema,
  decision: z.enum(DECK_DECISIONS),
});
export type DeckDecision = z.infer<typeof DeckDecisionSchema>;

/**
 * Compteurs du tri ouvert (F6-PO-16) : `decided`, cartes du tri qui portent une décision active ; `remaining`, cartes du
 * paquet de reprise (B10-PO-4 point 2).
 */
export const DeckCountsSchema = z.strictObject({
  decided: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
});
export type DeckCounts = z.infer<typeof DeckCountsSchema>;

/**
 * Réponse de `decideCard` : la question que cette décision a ouverte (`null` sinon) et les compteurs. B10e y ajoutera
 * la préférence déduite (`inferred`, champ facultatif) par sa PR de contrat, sans renommer.
 */
export const DeckDecisionResultSchema = z.strictObject({
  prompt: PreferencePromptSchema.nullable(),
  counts: DeckCountsSchema,
});
export type DeckDecisionResult = z.infer<typeof DeckDecisionResultSchema>;

/**
 * Entrée de `answerPreferencePrompt` (B10a point 4) : `PreferenceAnswer` étendu, sans renommer `answer` ni `reason`.
 * `prompt` désigne la question à laquelle la personne répond ; le serveur la refuse si elle n'est pas ouverte
 * (B10-PO-5 point 3). `PreferenceAnswer` reste la forme de la feuille (écran 7), inchangée.
 */
export const PreferenceAnswerRequestSchema = PreferenceAnswerSchema.extend({
  tripId: TripIdSchema,
  requestId: z.uuid(),
  prompt: PreferencePromptSchema,
});
export type PreferenceAnswerRequest = z.infer<typeof PreferenceAnswerRequestSchema>;

/** Réponse de `answerPreferencePrompt` : question suivante éventuelle (distance, à partir de B10f) et compteurs. */
export const PreferenceAnswerResultSchema = z.strictObject({
  next: PreferencePromptSchema.nullable(),
  counts: DeckCountsSchema,
});
export type PreferenceAnswerResult = z.infer<typeof PreferenceAnswerResultSchema>;

/**
 * Entrée de `undoDecision` (B10a point 3, B10-PO-6) : `decisionRequestId` est le `requestId` de la décision à annuler ;
 * `requestId`, celui de l'annulation (idempotence). Les deux diffèrent.
 */
export const UndoDecisionRequestSchema = z
  .strictObject({
    tripId: TripIdSchema,
    requestId: z.uuid(),
    decisionRequestId: z.uuid(),
  })
  .refine((request) => request.requestId !== request.decisionRequestId, {
    message: "requestId de l'annulation différent de celui de la décision",
    path: ["requestId"],
  });
export type UndoDecisionRequest = z.infer<typeof UndoDecisionRequestSchema>;

/** Réponse de `undoDecision` : compteurs après l'annulation. */
export const UndoDecisionResultSchema = z.strictObject({ counts: DeckCountsSchema });
export type UndoDecisionResult = z.infer<typeof UndoDecisionResultSchema>;

/** Entrée de `completeDeck` (« Passer » ou fin du paquet, B10-PO-4 point 3) : clôt le tri ouvert. */
export const CompleteDeckRequestSchema = z.strictObject({
  tripId: TripIdSchema,
  requestId: z.uuid(),
});
export type CompleteDeckRequest = z.infer<typeof CompleteDeckRequestSchema>;

/**
 * État du tri d'un voyage tel que l'écran le reçoit sur l'adaptateur `api` (B10a point 5 ; nom indicatif `DeckState`
 * de B10-TL-1, renommé pour ne pas se confondre avec l'état local du paquet de `src/features/presentation/deck.ts`) :
 * identifiants des cartes du paquet de reprise, dans l'ordre de F6-PO-1 ; question ouverte (posée, ni répondue, ni
 * fermée, B10-PO-5 point 3) ; tri clos ; compteurs. Raffinements : identifiants sans doublon ; `counts.remaining`
 * égal au nombre d'identifiants ; un tri clos n'a ni carte ni question ouverte.
 */
export const DeckSessionSchema = z
  .strictObject({
    tripId: TripIdSchema,
    proposalIds: z.array(ProposalIdSchema),
    openPrompt: PreferencePromptSchema.nullable(),
    closed: z.boolean(),
    counts: DeckCountsSchema,
  })
  .superRefine((session, ctx) => {
    if (new Set(session.proposalIds).size !== session.proposalIds.length) {
      ctx.addIssue({ code: "custom", message: "proposalIds sans doublon", path: ["proposalIds"] });
    }
    if (session.counts.remaining !== session.proposalIds.length) {
      ctx.addIssue({ code: "custom", message: "counts.remaining = nombre de proposalIds", path: ["counts", "remaining"] });
    }
    if (session.closed && (session.proposalIds.length > 0 || session.openPrompt !== null)) {
      ctx.addIssue({ code: "custom", message: "tri clos : ni carte ni question ouverte", path: ["closed"] });
    }
  });
export type DeckSession = z.infer<typeof DeckSessionSchema>;

/**
 * Réponse de `completeDeck` : l'état du tri après sa clôture. B10b y ajoutera le recalcul démarré (champ facultatif)
 * par sa PR de contrat, sans renommer.
 */
export const CompleteDeckResultSchema = z.strictObject({ deck: DeckSessionSchema });
export type CompleteDeckResult = z.infer<typeof CompleteDeckResultSchema>;

/** Signaux d'une décision de carte (`DECK_DECISIONS`). */
const CARD_SIGNALS: ReadonlySet<string> = new Set(DECK_DECISIONS);

/**
 * Signal de préférence enregistré (handover § 4 et § 6, table `preference_signals` ; décision 0112 § 1.5), tel que le
 * serveur le passe aux règles pures de `src/domain/preferences.ts` : contrat interne du serveur, jamais rendu au
 * navigateur. **Sans nom**, sans `placeId`, sans identifiant de personne (B10-PO-2 point 5) ; `proposalId` est
 * `Proposal.id`. Formes (décision 0112 § 3.3) :
 * - décision de carte (`like`, `dislike`, `choose`, `nextOption`) : origine `gesture`, catégorie de la proposition et
 *   `proposalId` présents, aucune raison ;
 * - réponse (`answerYes`, `answerNo`) : origine `question`, sans `proposalId`, raison facultative ; `answerYes` porte la
 *   catégorie de la question ; `answerNo` la porte aussi, ou `null` pour la question de distance (B10f) ;
 * - `travelReduction` (B10f) : origine `question`, catégorie `null`, sans `proposalId` ni raison.
 * L'origine `brief` n'a pas encore de forme admise (aucune tâche de B10 ne l'écrit ; B12 la fixera).
 */
export const PreferenceSignalSchema = z
  .strictObject({
    signal: z.enum(PREFERENCE_SIGNALS),
    category: CategorySchema.nullable(),
    origin: z.enum(PREFERENCE_SIGNAL_ORIGINS),
    status: z.enum(PREFERENCE_SIGNAL_STATUSES),
    reason: PreferenceReasonSchema.optional(),
    proposalId: ProposalIdSchema.optional(),
  })
  .superRefine((signal, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    if (CARD_SIGNALS.has(signal.signal)) {
      if (signal.origin !== "gesture") issue("origin", "décision de carte : origine gesture");
      if (signal.category === null) issue("category", "décision de carte : catégorie de la proposition");
      if (signal.proposalId === undefined) issue("proposalId", "décision de carte : proposalId présent");
      if (signal.reason !== undefined) issue("reason", "décision de carte : la raison va sur la réponse");
      return;
    }
    if (signal.origin !== "question") issue("origin", "réponse ou réduction : origine question");
    if (signal.proposalId !== undefined) issue("proposalId", "réponse ou réduction : sans proposalId");
    if (signal.signal === "answerYes" && signal.category === null) issue("category", "answerYes : catégorie de la question");
    if (signal.signal === "travelReduction") {
      if (signal.category !== null) issue("category", "travelReduction : catégorie nulle");
      if (signal.reason !== undefined) issue("reason", "travelReduction : aucune raison");
    }
  });
export type PreferenceSignal = z.infer<typeof PreferenceSignalSchema>;

/**
 * Révision d'un voyage d'essai après le tri (spécification E2E-essai, lot 4 ; décision 0126) : à la fin du paquet, les
 * étapes « Pas pour moi » (`notForMe`, une au moins) et « J'aime » (`liked`) du tri en mémoire, par leur identifiant
 * d'étape (`Proposal.id`, identifiant maison du programme). Le serveur réécrit le programme sous le même voyage ; il ne
 * rend qu'un statut fermé, jamais une valeur.
 */
export const TRIAL_REVISION_CHOICES_MAX = 120;
export const TrialRevisionRequestSchema = z.strictObject({
  tripId: TripIdSchema,
  notForMe: z.array(ProposalIdSchema).min(1).max(TRIAL_REVISION_CHOICES_MAX),
  liked: z.array(ProposalIdSchema).max(TRIAL_REVISION_CHOICES_MAX),
});
export type TrialRevisionRequest = z.infer<typeof TrialRevisionRequestSchema>;

/**
 * Statut d'une révision : `started` (la nouvelle version remplacera la version servie une fois écrite), `inProgress` (une
 * révision de ce voyage est déjà en cours), `exhausted` (le voyage a déjà eu sa révision), `accessExpired` (code
 * d'accès à saisir de nouveau), `capReached` (plafond des essais atteint), `unavailable` (toute autre cause).
 */
export const TRIAL_REVISION_STATUSES = ["started", "inProgress", "exhausted", "accessExpired", "capReached", "unavailable"] as const;
export const TrialRevisionResultSchema = z.strictObject({ status: z.enum(TRIAL_REVISION_STATUSES) });
export type TrialRevisionResult = z.infer<typeof TrialRevisionResultSchema>;
