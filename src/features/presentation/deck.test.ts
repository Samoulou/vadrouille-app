// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Category, Proposal } from "@/contracts";
import { propositions } from "@/mocks/edimbourg";

import {
  buildDeck,
  currentCard,
  deckReducer,
  distancePromptFor,
  emptySession,
  initDeck,
  isLastOption,
  preferencePromptFor,
  releaseVelocity,
  resolveSwipe,
  swipeRotation,
  type DeckEvent,
  type DeckState,
} from "./deck";

const run = (state: DeckState, ...events: DeckEvent[]) => events.reduce(deckReducer, state);
const decide = (decision: "like" | "dislike", prompt: DeckState["prompt"] = null): DeckEvent[] => [
  { type: "decide", decision },
  { type: "resolved", prompt },
];
const ids = (state: DeckState) => state.cards.map((card) => card.id);

/** Proposition d'activité minimale pour les cas hors jeu simulé. */
function activity(id: string, day: number, time: string, category: Category): Proposal {
  return {
    id,
    kind: "activity",
    day,
    weekday: "sam.",
    time,
    context: "[Contexte]",
    category,
    stop: { id: `s-${id}`, kind: "activity", name: `[${id}]`, start: time, meta: "[Meta]", exceptions: [], locked: false },
  };
}

describe("presentation: ordre et filtrage du paquet", () => {
  it("garde l'ordre des données, regroupé par jour puis heure (8 propositions simulées)", () => {
    expect(buildDeck(propositions).map((p) => p.id)).toEqual(propositions.map((p) => p.id));
  });

  it("trie de façon stable par jour puis heure, et les options d'un créneau par index", () => {
    const shuffled = [...propositions].reverse();
    expect(buildDeck(shuffled).map((p) => p.id)).toEqual(propositions.map((p) => p.id));
    const a = activity("a", 2, "10:00", "walk");
    const b = activity("b", 1, "18:00", "walk");
    const c = activity("c", 1, "09:00", "walk");
    const d = activity("d", 1, "09:00", "nature");
    expect(buildDeck([a, b, c, d]).map((p) => p.id)).toEqual(["c", "d", "b", "a"]);
  });

  it("ne présente jamais une proposition verrouillée", () => {
    const locked = { ...activity("verrou", 1, "08:00", "museum") };
    locked.stop = { ...locked.stop, locked: true };
    expect(buildDeck([locked, ...propositions]).map((p) => p.id)).not.toContain("verrou");
  });
});

describe("deckReducer", () => {
  const initial = initDeck(propositions);

  it("décider avance d'une carte, enregistre la décision et propose l'annulation", () => {
    const state = run(initial, ...decide("like"));
    expect(state.index).toBe(1);
    expect(state.decisions).toEqual([{ proposalId: "prop-j1-chateau", decision: "like" }]);
    expect(state.undo?.toast).toEqual({ kind: "liked", name: "[Château d'Édimbourg]" });
    expect(state.undo?.position).toBe(1);
  });

  it("presentation: annuler restaure l'état exact (égalité profonde)", () => {
    for (const events of [decide("like"), decide("dislike"), [{ type: "keepDay" } as DeckEvent]]) {
      const before = run(initial, ...decide("dislike"), { type: "expireUndo" });
      const after = run(before, ...events, { type: "undo" });
      expect(after).toEqual(before);
    }
  });

  it("annuler retire aussi la réponse à la question déclenchée et les cartes retirées", () => {
    const deck = initDeck([
      activity("m1", 1, "09:00", "museum"),
      activity("m2", 1, "10:00", "museum"),
      activity("m3", 1, "11:00", "museum"),
      activity("w1", 1, "12:00", "walk"),
    ]);
    const before = run(deck, ...decide("dislike"), { type: "expireUndo" });
    const prompt = { kind: "category", category: "museum" } as const;
    const answered = run(before, ...decide("dislike", prompt), {
      type: "answer",
      prompt,
      answer: { answer: "yes", reason: "tooExpensive" },
      next: null,
    });
    expect(ids(answered)).toEqual(["m1", "m2", "w1"]);
    expect(answered.answers).toHaveLength(1);
    expect(run(answered, { type: "undo" })).toEqual(before);
  });

  it("une seule action annulable : une nouvelle décision remplace la précédente", () => {
    const state = run(initial, ...decide("like"), ...decide("like"));
    expect(state.undo?.position).toBe(2);
    const undone = run(state, { type: "undo" });
    expect(undone.index).toBe(1);
    expect(undone.undo).toBeNull();
    expect(run(undone, { type: "undo" })).toBe(undone);
  });

  it("presentation: créneau de repas — « Je choisis » retire les autres options, la progression passe à 3 sur 7", () => {
    const atDinner = run(initial, ...decide("like"));
    expect(currentCard(atDinner)?.option).toEqual({ index: 1, total: 2 });
    expect(isLastOption(atDinner)).toBe(false);
    const chosen = run(atDinner, ...decide("like"));
    expect(chosen.cards).toHaveLength(7);
    expect(chosen.index + 1).toBe(3);
    expect(ids(chosen)).not.toContain("prop-j1-diner-2");
    expect(chosen.undo?.toast).toEqual({ kind: "chosen", name: "[Bonne table de l'Old Town]" });
  });

  it("« Option suivante » montre l'option 2, dernière du créneau", () => {
    const next = run(initial, ...decide("like"), ...decide("dislike"));
    expect(currentCard(next)?.id).toBe("prop-j1-diner-2");
    expect(isLastOption(next)).toBe(true);
    expect(next.cards).toHaveLength(8);
  });

  it("« Tout garder pour le jour 1 » passe à la première carte du jour 2, annulable", () => {
    const kept = run(initial, { type: "keepDay" });
    expect(currentCard(kept)?.id).toBe("prop-j2-dean-village");
    expect(kept.keptDays).toEqual([1]);
    expect(kept.decisions).toEqual([]);
    expect(kept.undo?.toast).toEqual({ kind: "dayKept", day: 1 });
    expect(run(kept, { type: "undo" })).toEqual(initial);
  });

  it("« Tout garder » sur le dernier jour mène à la fin du paquet", () => {
    const last = { ...initial, index: 6 };
    const kept = run(last, { type: "keepDay" });
    expect(kept.index).toBe(kept.cards.length);
    expect(currentCard(kept)).toBeUndefined();
  });

  it("« Non » ne retire rien ; fermer la feuille n'enregistre rien", () => {
    const prompt = { kind: "category", category: "museum" } as const;
    const open = run(initial, ...decide("dislike", prompt));
    expect(open.prompt).toEqual(prompt);
    const no = run(open, { type: "answer", prompt, answer: { answer: "no" }, next: null });
    expect(no.cards).toEqual(open.cards);
    expect(no.prompt).toBeNull();
    const dismissed = run(open, { type: "dismissPrompt" });
    expect(dismissed.answers).toEqual([]);
    expect(dismissed.prompt).toBeNull();
  });

  it("ignore les décisions pendant une question ou en attente", () => {
    const pending = run(initial, { type: "decide", decision: "like" });
    expect(run(pending, { type: "decide", decision: "like" })).toBe(pending);
    const prompt = { kind: "distance" } as const;
    const open = run(initial, ...decide("dislike", prompt));
    expect(run(open, { type: "decide", decision: "like" })).toBe(open);
    expect(run(open, { type: "undo" })).toBe(open);
  });
});

describe("presentation: seuils et rotation du geste", () => {
  const width = 340;
  it.each([
    [{ dx: 0.31 * width, velocity: 0 }, "like"],
    [{ dx: -0.31 * width, velocity: 0 }, "dislike"],
    [{ dx: 0.29 * width, velocity: 0.1 }, "return"],
    [{ dx: 0.15 * width, velocity: 0.6 }, "like"],
    [{ dx: -0.15 * width, velocity: -0.6 }, "dislike"],
    [{ dx: 0.15 * width, velocity: -0.6 }, "return"],
    [{ dx: 20, velocity: 1 }, "return"],
    [{ dx: 9, velocity: 0 }, "tap"],
    [{ dx: -9, velocity: 2 }, "tap"],
  ] as const)("%j → %s", (input, expected) => {
    expect(resolveSwipe({ ...input, width })).toBe(expected);
  });

  it("swipeRotation ne dépasse jamais 8° et vaut 8° à 30 %", () => {
    expect(swipeRotation(0.3 * width, width)).toBeCloseTo(8);
    expect(swipeRotation(-0.3 * width, width)).toBeCloseTo(-8);
    expect(swipeRotation(0.15 * width, width)).toBeCloseTo(4);
    for (let dx = -2 * width; dx <= 2 * width; dx += 7) {
      expect(Math.abs(swipeRotation(dx, width))).toBeLessThanOrEqual(8);
    }
    expect(swipeRotation(0, width)).toBe(0);
  });

  it("calcule la vitesse sur les 100 dernières millisecondes", () => {
    const samples = [
      { x: 0, t: 0 },
      { x: 10, t: 900 },
      { x: 30, t: 950 },
    ];
    expect(releaseVelocity(samples, { x: 60, t: 1000 })).toBeCloseTo(0.5);
    expect(releaseVelocity(samples, { x: 30, t: 2000 })).toBe(0);
  });
});

describe("préférences: aucune généralisation sans réponse (règle pure)", () => {
  const museum = { decision: "dislike", kind: "activity", category: "museum" } as const;

  it("question au deuxième refus d'une même catégorie, une seule fois", () => {
    const one = { ...emptySession(), dislikes: [{ proposalId: "a", category: "museum" as const }] };
    expect(preferencePromptFor(one, museum)).toBeNull();
    const two = { ...one, dislikes: [...one.dislikes, { proposalId: "b", category: "museum" as const }] };
    expect(preferencePromptFor(two, museum)).toEqual({ kind: "category", category: "museum" });
    expect(preferencePromptFor({ ...two, askedCategories: ["museum"] }, museum)).toBeNull();
  });

  it("les repas et les « J'aime » ne comptent pas ; deux nature puis un museum ne la déclenchent pas pour museum", () => {
    const session = {
      ...emptySession(),
      dislikes: [
        { proposalId: "n1", category: "nature" as const },
        { proposalId: "n2", category: "nature" as const },
        { proposalId: "m1", category: "museum" as const },
      ],
    };
    expect(preferencePromptFor(session, museum)).toBeNull();
    expect(preferencePromptFor(session, { ...museum, kind: "meal" })).toBeNull();
    expect(preferencePromptFor(session, { ...museum, decision: "like" })).toBeNull();
  });

  it("distance après deux raisons « Trop loin », une seule fois", () => {
    const session = {
      ...emptySession(),
      dislikes: [
        { proposalId: "n", category: "nature" as const, reason: "tooFar" as const },
        { proposalId: "m", category: "museum" as const, reason: "tooFar" as const },
      ],
    };
    expect(distancePromptFor(session)).toEqual({ kind: "distance" });
    expect(distancePromptFor({ ...session, distanceAsked: true })).toBeNull();
    expect(distancePromptFor({ ...session, dislikes: session.dislikes.slice(1) })).toBeNull();
  });
});
