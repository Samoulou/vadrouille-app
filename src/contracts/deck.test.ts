// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  API_ERROR_CODES,
  ApiErrorSchema,
  CategorySchema,
  CompleteDeckRequestSchema,
  CompleteDeckResultSchema,
  DECK_DECISIONS,
  DeckCountsSchema,
  DeckDecisionResultSchema,
  DeckDecisionSchema,
  DeckSessionSchema,
  PREFERENCE_SIGNALS,
  PreferenceAnswerRequestSchema,
  PreferenceAnswerResultSchema,
  PreferenceAnswerSchema,
  PreferencePromptSchema,
  PreferenceReasonSchema,
  PreferenceSignalSchema,
  UndoDecisionRequestSchema,
  UndoDecisionResultSchema,
} from "./index";

describe("contrats de la présentation (décision 0013, § 3.1 et § 3.2)", () => {
  it("CategorySchema : codes de F6-PO-10, puis ceux des envies de F8 (F8-TL-8, décision 0017 § 8)", () => {
    expect(CategorySchema.options).toEqual(["museum", "walk", "nature", "tasting", "restaurant", "heritage", "market", "nightlife"]);
  });

  it("PreferenceReasonSchema : codes de B0, dans l'ordre", () => {
    expect(PreferenceReasonSchema.options).toEqual(["notMyStyle", "tooBusy", "tooExpensive", "tooFar", "other"]);
  });

  it("PreferencePrompt : catégorie ou distance, objets stricts", () => {
    expect(PreferencePromptSchema.safeParse({ kind: "category", category: "museum" }).success).toBe(true);
    expect(PreferencePromptSchema.safeParse({ kind: "distance" }).success).toBe(true);
    expect(PreferencePromptSchema.safeParse({ kind: "category", category: "musées" }).success).toBe(false);
    expect(PreferencePromptSchema.safeParse({ kind: "distance", name: "[Lieu]" }).success).toBe(false);
  });

  it("PreferenceAnswer : oui ou non, raison facultative du vocabulaire fermé", () => {
    expect(PreferenceAnswerSchema.safeParse({ answer: "yes" }).success).toBe(true);
    expect(PreferenceAnswerSchema.safeParse({ answer: "no", reason: "tooFar" }).success).toBe(true);
    expect(PreferenceAnswerSchema.safeParse({ answer: "yes", reason: "Trop loin" }).success).toBe(false);
    expect(PreferenceAnswerSchema.safeParse({ answer: "peut-être" }).success).toBe(false);
  });
});

const TRIP = "0b6f7a8e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
const REQUEST = "5d1c9a6e-2b3f-4c7d-9e8f-1a2b3c4d5e6f";
const OTHER_REQUEST = "7e2d0b1f-3c4a-4d8e-af90-2b3c4d5e6f7a";
const counts = { decided: 2, remaining: 3 };

describe("contrats du tri enregistré (spécification B10, B10a ; décision 0112 § 1)", () => {
  it("valeurs : décisions de carte, puis signaux de preference_signals dans l'ordre de la contrainte CHECK", () => {
    expect(DECK_DECISIONS).toEqual(["like", "dislike", "choose", "nextOption"]);
    expect(PREFERENCE_SIGNALS).toEqual(["like", "dislike", "choose", "nextOption", "answerYes", "answerNo", "travelReduction"]);
  });

  it("generation_in_progress : à la fin des codes, sans réordonner, retryable vrai exigé", () => {
    expect(API_ERROR_CODES.at(-1)).toBe("generation_in_progress");
    expect(API_ERROR_CODES.at(-2)).toBe("internal");
    expect(ApiErrorSchema.safeParse({ code: "generation_in_progress", retryable: true }).success).toBe(true);
    expect(ApiErrorSchema.safeParse({ code: "generation_in_progress" }).success).toBe(false);
    expect(ApiErrorSchema.safeParse({ code: "generation_in_progress", retryable: false }).success).toBe(false);
  });

  describe("DeckDecision", () => {
    const decision = { tripId: TRIP, requestId: REQUEST, proposalId: "v1-j1-2", decision: "dislike" };

    it.each(DECK_DECISIONS)("accepte la décision %s", (value) => {
      expect(DeckDecisionSchema.safeParse({ ...decision, decision: value }).success).toBe(true);
    });

    it.each([
      ["une décision hors liste", { decision: "skip" }],
      ["un signal de réponse", { decision: "answerYes" }],
      ["un requestId qui n'est pas un uuid", { requestId: "geste-1" }],
      ["un voyage illisible", { tripId: "voyage/1" }],
      ["une proposition vide", { proposalId: "" }],
    ])("refuse %s", (_, change) => {
      expect(DeckDecisionSchema.safeParse({ ...decision, ...change }).success).toBe(false);
    });

    it.each([
      ["organizationId", "org-1"],
      ["userId", "user-1"],
      ["gesture", "swipe"],
      ["reason", "tooFar"],
      ["category", "museum"],
      ["placeId", "sentinelle_place"],
      ["name", "[Lieu]"],
    ])("refuse le champ %s (objet strict)", (key, value) => {
      expect(DeckDecisionSchema.safeParse({ ...decision, [key]: value }).success).toBe(false);
    });
  });

  it("DeckCounts : entiers positifs ou nuls", () => {
    expect(DeckCountsSchema.safeParse({ decided: 0, remaining: 0 }).success).toBe(true);
    expect(DeckCountsSchema.safeParse({ decided: -1, remaining: 0 }).success).toBe(false);
    expect(DeckCountsSchema.safeParse({ decided: 1.5, remaining: 0 }).success).toBe(false);
    expect(DeckCountsSchema.safeParse({ decided: 1, remaining: 2, total: 3 }).success).toBe(false);
  });

  it("DeckDecisionResult : question ouverte ou null, compteurs, rien d'autre", () => {
    expect(DeckDecisionResultSchema.safeParse({ prompt: null, counts }).success).toBe(true);
    expect(DeckDecisionResultSchema.safeParse({ prompt: { kind: "category", category: "museum" }, counts }).success).toBe(true);
    expect(DeckDecisionResultSchema.safeParse({ counts }).success).toBe(false);
    expect(DeckDecisionResultSchema.safeParse({ prompt: null }).success).toBe(false);
    expect(DeckDecisionResultSchema.safeParse({ prompt: null, counts, signalId: REQUEST }).success).toBe(false);
  });

  describe("PreferenceAnswerRequest : PreferenceAnswer étendu sans renommer", () => {
    const request = { tripId: TRIP, requestId: REQUEST, prompt: { kind: "category", category: "museum" }, answer: "yes" };

    it("garde answer et reason de PreferenceAnswer", () => {
      expect(Object.keys(PreferenceAnswerRequestSchema.shape)).toEqual(expect.arrayContaining(Object.keys(PreferenceAnswerSchema.shape)));
      expect(PreferenceAnswerRequestSchema.shape.answer).toBe(PreferenceAnswerSchema.shape.answer);
      expect(PreferenceAnswerRequestSchema.shape.reason).toBe(PreferenceAnswerSchema.shape.reason);
    });

    it("accepte une réponse de catégorie ou de distance, raison facultative", () => {
      expect(PreferenceAnswerRequestSchema.safeParse(request).success).toBe(true);
      expect(PreferenceAnswerRequestSchema.safeParse({ ...request, answer: "no", reason: "tooFar" }).success).toBe(true);
      expect(PreferenceAnswerRequestSchema.safeParse({ ...request, prompt: { kind: "distance" } }).success).toBe(true);
    });

    it.each(["tripId", "requestId", "prompt", "answer"])("refuse une réponse sans %s", (key) => {
      const without: Record<string, unknown> = { ...request };
      delete without[key];
      expect(PreferenceAnswerRequestSchema.safeParse(without).success).toBe(false);
    });

    it("reste strict : champ inconnu refusé", () => {
      expect(PreferenceAnswerRequestSchema.safeParse({ ...request, organizationId: "org-1" }).success).toBe(false);
      expect(PreferenceAnswerRequestSchema.safeParse({ ...request, proposalId: "v1-j1-2" }).success).toBe(false);
    });

    it("PreferenceAnswer seul reste la forme de la feuille (écran 7)", () => {
      expect(PreferenceAnswerSchema.safeParse({ answer: "yes" }).success).toBe(true);
      expect(PreferenceAnswerSchema.safeParse({ answer: "yes", tripId: TRIP }).success).toBe(false);
    });
  });

  it("PreferenceAnswerResult : question suivante ou null, compteurs", () => {
    expect(PreferenceAnswerResultSchema.safeParse({ next: null, counts }).success).toBe(true);
    expect(PreferenceAnswerResultSchema.safeParse({ next: { kind: "distance" }, counts }).success).toBe(true);
    expect(PreferenceAnswerResultSchema.safeParse({ next: null }).success).toBe(false);
  });

  it("UndoDecisionRequest : deux requestId distincts, objet strict", () => {
    const request = { tripId: TRIP, requestId: REQUEST, decisionRequestId: OTHER_REQUEST };
    expect(UndoDecisionRequestSchema.safeParse(request).success).toBe(true);
    expect(UndoDecisionRequestSchema.safeParse({ ...request, decisionRequestId: REQUEST }).success).toBe(false);
    expect(UndoDecisionRequestSchema.safeParse({ ...request, proposalId: "v1-j1-2" }).success).toBe(false);
    expect(UndoDecisionResultSchema.safeParse({ counts }).success).toBe(true);
    expect(UndoDecisionResultSchema.safeParse({}).success).toBe(false);
  });

  it("CompleteDeckRequest : { tripId, requestId } seulement", () => {
    expect(CompleteDeckRequestSchema.safeParse({ tripId: TRIP, requestId: REQUEST }).success).toBe(true);
    expect(CompleteDeckRequestSchema.safeParse({ tripId: TRIP }).success).toBe(false);
    expect(CompleteDeckRequestSchema.safeParse({ tripId: TRIP, requestId: REQUEST, recompute: true }).success).toBe(false);
  });

  describe("DeckSession", () => {
    const session = {
      tripId: TRIP,
      proposalIds: ["v1-j1-3", "v1-j1-4", "v1-j2-1"],
      openPrompt: null,
      closed: false,
      counts,
    };

    it("accepte un tri ouvert, avec ou sans question ouverte, et un tri clos vide", () => {
      expect(DeckSessionSchema.safeParse(session).success).toBe(true);
      expect(DeckSessionSchema.safeParse({ ...session, openPrompt: { kind: "category", category: "museum" } }).success).toBe(true);
      expect(
        DeckSessionSchema.safeParse({ ...session, proposalIds: [], openPrompt: { kind: "category", category: "museum" }, counts: { decided: 5, remaining: 0 } })
          .success,
      ).toBe(true);
      expect(DeckSessionSchema.safeParse({ ...session, proposalIds: [], closed: true, counts: { decided: 2, remaining: 0 } }).success).toBe(true);
    });

    it("refuse des identifiants en double", () => {
      expect(DeckSessionSchema.safeParse({ ...session, proposalIds: ["v1-j1-3", "v1-j1-3", "v1-j2-1"] }).success).toBe(false);
    });

    it("refuse counts.remaining différent du nombre de cartes", () => {
      expect(DeckSessionSchema.safeParse({ ...session, counts: { decided: 2, remaining: 4 } }).success).toBe(false);
    });

    it("refuse un tri clos qui a encore une carte ou une question ouverte", () => {
      expect(DeckSessionSchema.safeParse({ ...session, closed: true }).success).toBe(false);
      expect(
        DeckSessionSchema.safeParse({
          ...session,
          proposalIds: [],
          closed: true,
          openPrompt: { kind: "category", category: "museum" },
          counts: { decided: 2, remaining: 0 },
        }).success,
      ).toBe(false);
    });

    it.each([
      ["organizationId", "org-1"],
      ["proposals", []],
      ["placeIds", ["sentinelle_place"]],
    ])("refuse le champ %s (objet strict)", (key, value) => {
      expect(DeckSessionSchema.safeParse({ ...session, [key]: value }).success).toBe(false);
    });

    it("CompleteDeckResult : l'état du tri après la clôture", () => {
      const closed = { ...session, proposalIds: [], closed: true, counts: { decided: 2, remaining: 0 } };
      expect(CompleteDeckResultSchema.safeParse({ deck: closed }).success).toBe(true);
      expect(CompleteDeckResultSchema.safeParse({ deck: session }).success).toBe(true);
      expect(CompleteDeckResultSchema.safeParse({ deck: { ...session, closed: true } }).success).toBe(false);
    });
  });

  describe("PreferenceSignal (formes de la décision 0112 § 3.3)", () => {
    const card = { signal: "dislike", category: "museum", origin: "gesture", status: "confirmed", proposalId: "v1-j1-2" };
    const answer = { signal: "answerYes", category: "museum", origin: "question", status: "confirmed" };

    it.each(DECK_DECISIONS)("décision de carte %s : origine gesture, catégorie et proposalId", (signal) => {
      expect(PreferenceSignalSchema.safeParse({ ...card, signal }).success).toBe(true);
      expect(PreferenceSignalSchema.safeParse({ ...card, signal, origin: "question" }).success).toBe(false);
      expect(PreferenceSignalSchema.safeParse({ ...card, signal, category: null }).success).toBe(false);
      expect(PreferenceSignalSchema.safeParse({ ...card, signal, proposalId: undefined }).success).toBe(false);
      expect(PreferenceSignalSchema.safeParse({ ...card, signal, reason: "tooFar" }).success).toBe(false);
    });

    it("réponses : origine question, sans proposalId, raison facultative ; answerNo de distance à catégorie nulle", () => {
      expect(PreferenceSignalSchema.safeParse(answer).success).toBe(true);
      expect(PreferenceSignalSchema.safeParse({ ...answer, reason: "notMyStyle" }).success).toBe(true);
      expect(PreferenceSignalSchema.safeParse({ ...answer, signal: "answerNo", reason: "tooFar" }).success).toBe(true);
      expect(PreferenceSignalSchema.safeParse({ ...answer, signal: "answerNo", category: null }).success).toBe(true);
      expect(PreferenceSignalSchema.safeParse({ ...answer, category: null }).success).toBe(false);
      expect(PreferenceSignalSchema.safeParse({ ...answer, origin: "gesture" }).success).toBe(false);
      expect(PreferenceSignalSchema.safeParse({ ...answer, proposalId: "v1-j1-2" }).success).toBe(false);
    });

    it("travelReduction : origine question, catégorie nulle, ni raison ni proposalId", () => {
      const reduction = { signal: "travelReduction", category: null, origin: "question", status: "confirmed" };
      expect(PreferenceSignalSchema.safeParse(reduction).success).toBe(true);
      expect(PreferenceSignalSchema.safeParse({ ...reduction, category: "walk" }).success).toBe(false);
      expect(PreferenceSignalSchema.safeParse({ ...reduction, reason: "tooFar" }).success).toBe(false);
    });

    it("statuts confirmed, inferred, cancelled ; origine brief sans forme admise", () => {
      for (const status of ["confirmed", "inferred", "cancelled"]) {
        expect(PreferenceSignalSchema.safeParse({ ...card, status }).success).toBe(true);
      }
      expect(PreferenceSignalSchema.safeParse({ ...card, status: "removed" }).success).toBe(false);
      expect(PreferenceSignalSchema.safeParse({ ...card, origin: "brief" }).success).toBe(false);
      expect(PreferenceSignalSchema.safeParse({ ...answer, origin: "brief" }).success).toBe(false);
    });

    it.each([
      ["name", "[Lieu]"],
      ["placeId", "sentinelle_place"],
      ["candidateId", REQUEST],
      ["userId", "user-1"],
      ["organizationId", "org-1"],
    ])("aucun nom, aucune donnée Google ni identifiant de personne : %s refusé", (key, value) => {
      expect(PreferenceSignalSchema.safeParse({ ...card, [key]: value }).success).toBe(false);
    });
  });
});
