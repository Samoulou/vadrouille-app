import { beforeEach, describe, expect, it, vi } from "vitest";

const w = vi.hoisted(() => ({ demarrerRappels: vi.fn() }));
vi.mock("@/workflows", () => w);
const rl = vi.hoisted(() => ({ verdict: vi.fn(), createRateLimiter: vi.fn() }));
vi.mock("@/server/rate-limit", () => ({
  createRateLimiter: rl.createRateLimiter,
}));

import { RATE_LIMITS } from "@/server/config/limites";

import { demarrerRappelsReel } from "./demarrage";
import { compterEspeceRappels } from "./limiteurs";

/**
 * Démarrage réel du workflow 7 et décompte par espèce de `rappels-accord` (M6c, ticket 1021 ; décision 0157 § 1.7 points
 * 1 et 5) : interface des workflows et limiteur simulés.
 */

const ENTREE = {
  organizationId: "0a000000-0000-4000-8000-00000000000a",
  tripId: "0b000000-0000-4000-8000-00000000000b",
  userId: "0c000000-0000-4000-8000-00000000000c",
  consentId: "0d000000-0000-4000-8000-00000000000d",
};

beforeEach(() => {
  vi.clearAllMocks();
  rl.createRateLimiter.mockImplementation(() => ({ verdict: rl.verdict }));
});

describe("demarrerRappelsReel", () => {
  it("entrée réduite aux quatre identifiants : transmise telle quelle ; rend { ok } seulement, jamais l'identifiant d'exécution", async () => {
    w.demarrerRappels.mockResolvedValueOnce({
      ok: true,
      workflowRunId: "wrun_1",
    });
    expect(await demarrerRappelsReel(ENTREE)).toEqual({ ok: true });
    expect(w.demarrerRappels).toHaveBeenCalledWith(ENTREE);
    w.demarrerRappels.mockResolvedValueOnce({
      ok: false,
      code: "start_failed",
    });
    expect(await demarrerRappelsReel(ENTREE)).toEqual({ ok: false });
  });

  it("entrée hors contrat (champ de plus, identifiant illisible) : { ok: false } sans appeler l'interface des workflows", async () => {
    expect(
      await demarrerRappelsReel({
        ...ENTREE,
        email: "voyageuse@exemple.test",
      } as typeof ENTREE),
    ).toEqual({ ok: false });
    expect(await demarrerRappelsReel({ ...ENTREE, tripId: "x" })).toEqual({
      ok: false,
    });
    expect(w.demarrerRappels).not.toHaveBeenCalled();
  });
});

describe("compterEspeceRappels", () => {
  it("un limiteur par espèce, sur la seule règle de cette espèce de `rappels-accord` (mêmes clés que la règle complète)", async () => {
    const request = { headers: new Headers(), tripId: ENTREE.tripId };
    await compterEspeceRappels("ip", request as never);
    await compterEspeceRappels("trip", request as never);
    await compterEspeceRappels("ip", request as never);
    const regles = RATE_LIMITS["rappels-accord"] ?? [];
    expect(rl.createRateLimiter.mock.calls).toEqual([
      [{ config: { "rappels-accord": regles.filter((r) => r.kind === "ip") } }],
      [
        {
          config: { "rappels-accord": regles.filter((r) => r.kind === "trip") },
        },
      ],
    ]);
    expect(rl.verdict).toHaveBeenCalledTimes(3);
  });
});
