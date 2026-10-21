// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/actions/presentation", () => ({
  decideCard: vi.fn(),
  undoDecision: vi.fn(),
  answerPreferencePrompt: vi.fn(),
  completeDeck: vi.fn(),
}));

import { refusDe } from "./server-actions";

/** Refus d'une action du tri enregistré, tel que l'écran le reçoit (revue de la PR 621, correction 2). */
describe("présentation: refus du tri enregistré", () => {
  it.each([
    [null, "echec"],
    [{ ok: false, error: { code: "generation_in_progress", retryable: true } }, "recalcul"],
    [{ ok: false, error: { code: "validation_failed" } }, "dejaDecidee"],
    [{ ok: false, error: { code: "validation_failed", field: "proposalId" } }, "echec"],
    [{ ok: false, error: { code: "not_found" } }, "echec"],
    [{ ok: false, error: { code: "internal" } }, "echec"],
    [{ ok: false, error: { code: "unauthenticated" } }, "echec"],
  ] as const)("%j → %s", (resultat, attendu) => {
    expect(refusDe(resultat as Parameters<typeof refusDe>[0])).toBe(attendu);
  });
});
