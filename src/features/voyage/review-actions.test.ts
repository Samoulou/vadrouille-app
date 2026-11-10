import { describe, expect, it, vi } from "vitest";

import { EMPTY_SESSION, recordReview, reviewsOf } from "./trip-session";
import { createMemoryReviewActions, createServerReviewActions } from "./review-actions";

vi.mock("@/server/actions/avis", () => ({ rateStop: vi.fn() }));

/** Actions de l'écran 16 (M8a ; décision 0160 § 1.2 point 6) et mémoire de l'onglet de `mock` (0021 § 4). */

describe("mémoire des avis de l'onglet (réducteur pur)", () => {
  it("enregistre, change, efface ; état inchangé (même référence) si rien ne change ; voyages séparés", () => {
    const a = recordReview(EMPTY_SESSION, "t1", "s1", "liked");
    expect(reviewsOf(a, "t1").get("s1")).toBe("liked");
    expect(recordReview(a, "t1", "s1", "liked")).toBe(a);
    const b = recordReview(a, "t1", "s1", "notDone");
    expect(reviewsOf(b, "t1").get("s1")).toBe("notDone");
    expect(reviewsOf(b, "t2").size).toBe(0);
    const c = recordReview(b, "t1", "s1", null);
    expect(reviewsOf(c, "t1").has("s1")).toBe(false);
    expect(recordReview(EMPTY_SESSION, "t1", "s1", null)).toBe(EMPTY_SESSION);
  });
});

describe("createMemoryReviewActions (mock)", () => {
  it("écrit dans la mémoire ; une étape qui n'est pas à évaluer est refusée (validation_failed, stopId)", async () => {
    const memory = { recordReview: vi.fn() };
    const actions = createMemoryReviewActions(memory, new Set(["s1"]));
    expect(await actions.rateStop("t1", "s1", "disliked")).toEqual({ ok: true, value: { stopId: "s1", rating: "disliked" } });
    expect(await actions.rateStop("t1", "s1", null)).toEqual({ ok: true, value: null });
    expect(await actions.rateStop("t1", "inconnue", "liked")).toEqual({ ok: false, error: { code: "validation_failed", field: "stopId" } });
    expect(memory.recordReview.mock.calls).toEqual([
      ["t1", "s1", "disliked"],
      ["t1", "s1", null],
    ]);
  });
});

describe("createServerReviewActions (api)", () => {
  it("un requestId neuf à chaque appel (un « Réessayer » est un nouvel appel) ; aucune autre donnée envoyée", async () => {
    const send = vi.fn(async () => ({ ok: true as const, value: null }));
    let n = 0;
    const actions = createServerReviewActions(send, () => `00000000-0000-4000-8000-00000000000${(n += 1)}`);
    await actions.rateStop("t1", "s1", "liked");
    await actions.rateStop("t1", "s1", "liked");
    expect(send.mock.calls).toEqual([
      [{ tripId: "t1", stopId: "s1", rating: "liked", requestId: "00000000-0000-4000-8000-000000000001" }],
      [{ tripId: "t1", stopId: "s1", rating: "liked", requestId: "00000000-0000-4000-8000-000000000002" }],
    ]);
  });
});
