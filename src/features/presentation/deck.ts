import type { Category, PreferenceAnswer, PreferencePrompt, PreferenceReason, Proposal } from "@/contracts";

/**
 * État du paquet de la présentation (spécification F6, décision 0013 § 3.2) : réducteur pur et
 * fonctions pures du geste et de la question de préférence. Aucune persistance : l'état vit en
 * mémoire, le temps d'une instance de la page (F6-PO-15).
 */

export type Decision = "like" | "dislike";
export type Gesture = "swipe" | "button" | "key";

// --- Paquet -------------------------------------------------------------------

const toMinutes = (time: string) => {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

/** Même créneau de repas : même jour, même heure (F6-PO-7). */
export function sameMealSlot(a: Proposal, b: Proposal): boolean {
  return a.kind === "meal" && b.kind === "meal" && a.day === b.day && a.time === b.time;
}

/**
 * Cartes du paquet (F6-PO-1) : sans étape verrouillée, tri stable par jour puis heure, options d'un
 * même créneau de repas par `option.index`.
 */
export function buildDeck(proposals: readonly Proposal[]): Proposal[] {
  return proposals
    .filter((proposal) => !proposal.stop.locked)
    .map((proposal, order) => ({ proposal, order }))
    .sort((a, b) => {
      const byDay = a.proposal.day - b.proposal.day;
      if (byDay !== 0) return byDay;
      const byTime = toMinutes(a.proposal.time) - toMinutes(b.proposal.time);
      if (byTime !== 0) return byTime;
      if (sameMealSlot(a.proposal, b.proposal)) {
        const byOption = (a.proposal.option?.index ?? 0) - (b.proposal.option?.index ?? 0);
        if (byOption !== 0) return byOption;
      }
      return a.order - b.order;
    })
    .map(({ proposal }) => proposal);
}

/** Message du toast d'annulation (F6-PO-6). */
export type UndoToastInfo =
  | { kind: "liked" | "disliked" | "chosen"; name: string }
  | { kind: "dayKept"; day: number };

export interface DeckCore {
  cards: Proposal[];
  /** Rang (à partir de 0) de la carte en cours ; égal à `cards.length` en fin de paquet. */
  index: number;
  decisions: { proposalId: string; decision: Decision }[];
  /** Jours gardés en bloc par « Tout garder pour le jour N ». */
  keptDays: number[];
  /** Réponses aux questions de préférence de la session (F6-PO-9). */
  answers: { prompt: PreferencePrompt; answer: PreferenceAnswer }[];
  /** Question ouverte (feuille de l'écran 7), `null` sinon. */
  prompt: PreferencePrompt | null;
  /** Décision envoyée à `DeckActions.decide`, en attente de la question éventuelle. */
  pending: boolean;
}

export interface DeckState extends DeckCore {
  /** Seule action annulable (une à la fois) : l'état exact d'avant, le message, la position. */
  undo: { snapshot: DeckCore; toast: UndoToastInfo; position: number; decision: boolean } | null;
}

export function initDeck(proposals: readonly Proposal[]): DeckState {
  return {
    cards: buildDeck(proposals),
    index: 0,
    decisions: [],
    keptDays: [],
    answers: [],
    prompt: null,
    pending: false,
    undo: null,
  };
}

export type DeckEvent =
  | { type: "decide"; decision: Decision }
  | { type: "resolved"; prompt: PreferencePrompt | null }
  | { type: "answer"; prompt: PreferencePrompt; answer: PreferenceAnswer; next: PreferencePrompt | null }
  | { type: "dismissPrompt" }
  | { type: "keepDay" }
  | { type: "undo" }
  | { type: "expireUndo" };

const coreOf = (state: DeckState): DeckCore => ({
  cards: state.cards,
  index: state.index,
  decisions: state.decisions,
  keptDays: state.keptDays,
  answers: state.answers,
  prompt: state.prompt,
  pending: state.pending,
});

export const currentCard = (state: DeckState): Proposal | undefined => state.cards[state.index];

/** Dernière option du créneau de la carte en cours (aucune option du même créneau après elle). */
export function isLastOption(state: DeckState): boolean {
  const card = currentCard(state);
  if (!card || card.kind !== "meal") return false;
  return !state.cards.slice(state.index + 1).some((other) => sameMealSlot(card, other));
}

export function deckReducer(state: DeckState, event: DeckEvent): DeckState {
  switch (event.type) {
    case "decide": {
      const card = currentCard(state);
      if (!card || state.prompt || state.pending) return state;
      const snapshot = coreOf(state);
      // « Je choisis » : les autres options du créneau sortent du paquet (F6-PO-7).
      const cards =
        card.kind === "meal" && event.decision === "like"
          ? state.cards.filter((other, i) => i <= state.index || !sameMealSlot(card, other))
          : state.cards;
      const name = card.stop.name;
      const toast: UndoToastInfo =
        event.decision === "dislike"
          ? { kind: "disliked", name }
          : { kind: card.kind === "meal" ? "chosen" : "liked", name };
      return {
        ...state,
        cards,
        index: state.index + 1,
        decisions: [...state.decisions, { proposalId: card.id, decision: event.decision }],
        pending: true,
        undo: { snapshot, toast, position: state.index + 1, decision: true },
      };
    }
    case "resolved":
      return state.pending ? { ...state, pending: false, prompt: event.prompt } : state;
    case "answer": {
      if (!state.prompt) return state;
      const { prompt } = event;
      // « Oui » : les cartes restantes de la catégorie sortent du paquet (F6-PO-8).
      const cards =
        prompt.kind === "category" && event.answer.answer === "yes"
          ? state.cards.filter(
              (card, i) => i < state.index || card.kind !== "activity" || card.category !== prompt.category,
            )
          : state.cards;
      return {
        ...state,
        cards,
        answers: [...state.answers, { prompt, answer: event.answer }],
        prompt: event.next,
      };
    }
    case "dismissPrompt":
      return { ...state, prompt: null };
    case "keepDay": {
      const card = currentCard(state);
      if (!card || state.prompt || state.pending) return state;
      const next = state.cards.findIndex((other, i) => i > state.index && other.day !== card.day);
      return {
        ...state,
        index: next === -1 ? state.cards.length : next,
        keptDays: [...state.keptDays, card.day],
        undo: {
          snapshot: coreOf(state),
          toast: { kind: "dayKept", day: card.day },
          position: state.index + 1,
          decision: false,
        },
      };
    }
    case "undo":
      return state.undo && !state.prompt ? { ...state.undo.snapshot, undo: null } : state;
    case "expireUndo":
      return state.undo ? { ...state, undo: null } : state;
  }
}

/** Nombre de cartes retirées par une réponse (annonce « {nombre} propositions retirées »). */
export const removedCount = (before: DeckState, after: DeckState) => before.cards.length - after.cards.length;

// --- Geste (F6-PO-4) ------------------------------------------------------------

/** Part de la largeur de la carte au-delà de laquelle le relâchement décide. */
export const SWIPE_DISTANCE_RATIO = 0.3;
/** Vitesse horizontale minimale (px/ms) d'un geste rapide. */
export const SWIPE_VELOCITY = 0.5;
/** Déplacement minimal (px) d'un geste rapide. */
export const SWIPE_FLICK_MIN_DISTANCE = 24;
/** En deçà (px), le geste est un toucher. */
export const TAP_MAX_DISTANCE = 10;
/** Rotation maximale (degrés). */
export const MAX_ROTATION = 8;
/** Fenêtre de temps (ms) des derniers mouvements qui servent au calcul de la vitesse. */
export const VELOCITY_WINDOW_MS = 100;

export type SwipeOutcome = Decision | "return" | "tap";

/** Issue du relâchement : `dx` en px (positif vers la droite), `velocity` en px/ms, `width` de la carte. */
export function resolveSwipe({ dx, velocity, width }: { dx: number; velocity: number; width: number }): SwipeOutcome {
  const distance = Math.abs(dx);
  if (distance < TAP_MAX_DISTANCE) return "tap";
  const decision: Decision = dx > 0 ? "like" : "dislike";
  if (distance > SWIPE_DISTANCE_RATIO * width) return decision;
  const sameDirection = Math.sign(velocity) === Math.sign(dx);
  if (sameDirection && Math.abs(velocity) >= SWIPE_VELOCITY && distance >= SWIPE_FLICK_MIN_DISTANCE) return decision;
  return "return";
}

/** Rotation (degrés) : 8° × min(|dx| / (30 % de la largeur), 1), du signe du déplacement. */
export function swipeRotation(dx: number, width: number): number {
  if (dx === 0 || width <= 0) return 0;
  const ratio = Math.min(Math.abs(dx) / (SWIPE_DISTANCE_RATIO * width), 1);
  return Math.sign(dx) * MAX_ROTATION * ratio;
}

/**
 * Vitesse horizontale (px/ms) au relâchement, sur les mouvements des `VELOCITY_WINDOW_MS` dernières
 * millisecondes ; nulle si le pointeur n'a pas bougé dans la fenêtre.
 */
export function releaseVelocity(samples: readonly { x: number; t: number }[], release: { x: number; t: number }): number {
  const recent = samples.filter((sample) => release.t - sample.t <= VELOCITY_WINDOW_MS);
  const first = recent[0];
  if (!first || release.t <= first.t) return 0;
  return (release.x - first.x) / (release.t - first.t);
}

// --- Question de préférence (F6-PO-8, F6-PO-9) -------------------------------------

/** Session de tri côté « moteur » : refus d'activités, questions déjà posées. */
export interface PreferenceSession {
  dislikes: { proposalId: string; category: Category; reason?: PreferenceReason }[];
  askedCategories: Category[];
  distanceAsked: boolean;
}

export const emptySession = (): PreferenceSession => ({ dislikes: [], askedCategories: [], distanceAsked: false });

/**
 * Question à poser après une décision, la session incluant déjà cette décision : deuxième
 * « Pas pour moi » sur une activité de même catégorie, une question par catégorie ; les repas ne
 * comptent pas.
 */
export function preferencePromptFor(
  session: PreferenceSession,
  decided: { decision: Decision; kind: Proposal["kind"]; category: Category },
): PreferencePrompt | null {
  if (decided.decision !== "dislike" || decided.kind !== "activity") return null;
  if (session.askedCategories.includes(decided.category)) return null;
  const count = session.dislikes.filter((dislike) => dislike.category === decided.category).length;
  return count >= 2 ? { kind: "category", category: decided.category } : null;
}

/** Question de distance : deux refus avec la raison « Trop loin », une seule fois par session. */
export function distancePromptFor(session: PreferenceSession): PreferencePrompt | null {
  if (session.distanceAsked) return null;
  const tooFar = session.dislikes.filter((dislike) => dislike.reason === "tooFar").length;
  return tooFar >= 2 ? { kind: "distance" } : null;
}
