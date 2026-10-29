import { describe, expect, it } from "vitest";

import { accesReelApi } from "./acces-reel";

// Décision 0141 § 6.2 point 1 (T11d, PR 885) : le crochet de la barrière de `api` est fermé jusqu'à M1h.
describe("crochet d'accès de api", () => {
  it("fermé : accesReelApi rend false", async () => {
    expect(await accesReelApi()).toBe(false);
  });
});
