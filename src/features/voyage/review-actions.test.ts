import { describe, expect, it, vi } from "vitest";

import { EMPTY_SESSION, recordReview, reviewsOf } from "./trip-session";
import type { RetainedPreference } from "@/contracts";

import { createLocalTasteMemory, createMemoryReviewActions, createServerReviewActions } from "./review-actions";

vi.mock("@/server/actions/avis", () => ({ rateStop: vi.fn() }));
vi.mock("@/server/actions/gouts", () => ({ retainTastes: vi.fn(), removeTaste: vi.fn(), restoreTaste: vi.fn(), removeAllTastes: vi.fn() }));

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

/** M8c-1 (ticket 1121) : goûts retenus, sur la mémoire de l'onglet (`mock`) puis vers le serveur (`api`). */
const EVITER_MUSEES: RetainedPreference = { id: "category:museum:less", origin: "confirmed", subject: { kind: "category", category: "museum", direction: "less" } };
const AIMER_DEGUSTATIONS: RetainedPreference = { id: "category:tasting:more", origin: "inferred", subject: { kind: "category", category: "tasting", direction: "more" } };

describe("createMemoryReviewActions : goûts (mock)", () => {
  const banc = () => {
    const memory = createLocalTasteMemory();
    return { memory, actions: createMemoryReviewActions({ recordReview: vi.fn() }, new Set(), { memory, candidates: [EVITER_MUSEES, AIMER_DEGUSTATIONS] }) };
  };

  it("retenir : seuls les nouveaux goûts sont rendus, avec le voyage ; un sujet déjà retenu garde son premier voyage", async () => {
    const { memory, actions } = banc();
    expect(await actions.retainTastes("t1", [EVITER_MUSEES.id])).toEqual({ ok: true, value: [{ ...EVITER_MUSEES, fromTripId: "t1" }] });
    expect(await actions.retainTastes("t2", [EVITER_MUSEES.id, AIMER_DEGUSTATIONS.id])).toEqual({ ok: true, value: [{ ...AIMER_DEGUSTATIONS, fromTripId: "t2" }] });
    expect(memory.tastes()).toEqual([
      { ...EVITER_MUSEES, fromTripId: "t1" },
      { ...AIMER_DEGUSTATIONS, fromTripId: "t2" },
    ]);
  });

  it("retenir : aucune case, ou un identifiant hors des candidats : validation_failed (candidateIds), rien d'écrit", async () => {
    const { memory, actions } = banc();
    const refus = { ok: false, error: { code: "validation_failed", field: "candidateIds" } };
    expect(await actions.retainTastes("t1", [])).toEqual(refus);
    expect(await actions.retainTastes("t1", [EVITER_MUSEES.id, "distance"])).toEqual(refus);
    expect(memory.tastes()).toEqual([]);
  });

  it("retirer rend le goût supprimé ; le rétablir le remet en fin de liste, une seule fois ; goût absent : not_found", async () => {
    const { memory, actions } = banc();
    await actions.retainTastes("t1", [EVITER_MUSEES.id, AIMER_DEGUSTATIONS.id]);
    const retire = await actions.removeTaste(EVITER_MUSEES.id);
    expect(retire).toEqual({ ok: true, value: { ...EVITER_MUSEES, fromTripId: "t1" } });
    expect(await actions.removeTaste(EVITER_MUSEES.id)).toEqual({ ok: false, error: { code: "not_found" } });
    if (!retire.ok) throw new Error("retrait attendu");
    expect(await actions.restoreTaste(retire.value)).toEqual({ ok: true, value: undefined });
    expect(await actions.restoreTaste(retire.value)).toEqual({ ok: true, value: undefined });
    expect(memory.tastes().map((taste) => taste.id)).toEqual([AIMER_DEGUSTATIONS.id, EVITER_MUSEES.id]);
  });

  it("tout retirer vide la mémoire, même déjà vide", async () => {
    const { memory, actions } = banc();
    await actions.retainTastes("t1", [EVITER_MUSEES.id, AIMER_DEGUSTATIONS.id]);
    expect(await actions.removeAllTastes()).toEqual({ ok: true, value: undefined });
    expect(await actions.removeAllTastes()).toEqual({ ok: true, value: undefined });
    expect(memory.tastes()).toEqual([]);
  });

  it("sans mémoire de goûts (écran sans goûts), chaque action de goût rend not_found", async () => {
    const actions = createMemoryReviewActions({ recordReview: vi.fn() }, new Set());
    const refus = { ok: false, error: { code: "not_found" } };
    expect(await actions.retainTastes("t1", [EVITER_MUSEES.id])).toEqual(refus);
    expect(await actions.removeTaste(EVITER_MUSEES.id)).toEqual(refus);
    expect(await actions.restoreTaste({ ...EVITER_MUSEES, fromTripId: null })).toEqual(refus);
    expect(await actions.removeAllTastes()).toEqual(refus);
  });
});

describe("createServerReviewActions : goûts (api)", () => {
  it("chaque action envoie sa requête du contrat, avec un requestId neuf, et rien d'autre", async () => {
    const gouts = {
      retainTastes: vi.fn(async () => ({ ok: true as const, value: [] })),
      removeTaste: vi.fn(async () => ({ ok: true as const, value: { ...EVITER_MUSEES, fromTripId: null } })),
      restoreTaste: vi.fn(async () => ({ ok: true as const, value: undefined })),
      removeAllTastes: vi.fn(async () => ({ ok: true as const, value: undefined })),
    };
    let n = 0;
    const actions = createServerReviewActions(vi.fn(), () => `00000000-0000-4000-8000-00000000000${(n += 1)}`, gouts);
    const taste = { ...EVITER_MUSEES, fromTripId: "t1" };
    await actions.retainTastes("t1", Object.freeze([EVITER_MUSEES.id]));
    await actions.removeTaste(EVITER_MUSEES.id);
    await actions.restoreTaste(taste);
    await actions.removeAllTastes();
    expect(gouts.retainTastes.mock.calls).toEqual([[{ tripId: "t1", candidateIds: [EVITER_MUSEES.id], requestId: "00000000-0000-4000-8000-000000000001" }]]);
    expect(gouts.removeTaste.mock.calls).toEqual([[{ tasteId: EVITER_MUSEES.id, requestId: "00000000-0000-4000-8000-000000000002" }]]);
    expect(gouts.restoreTaste.mock.calls).toEqual([[{ taste, requestId: "00000000-0000-4000-8000-000000000003" }]]);
    expect(gouts.removeAllTastes.mock.calls).toEqual([[{ requestId: "00000000-0000-4000-8000-000000000004" }]]);
  });
});
