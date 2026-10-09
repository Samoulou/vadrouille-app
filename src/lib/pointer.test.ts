import { describe, expect, it } from "vitest";

import { releaseVelocity, VELOCITY_WINDOW_MS } from "./pointer";

describe("releaseVelocity (déplacée de deck.ts, décision 0015 § 5.2)", () => {
  it("calcule la vitesse sur les 100 dernières millisecondes", () => {
    expect(VELOCITY_WINDOW_MS).toBe(100);
    const samples = [
      { pos: 0, t: 0 },
      { pos: 10, t: 900 },
      { pos: 30, t: 950 },
    ];
    expect(releaseVelocity(samples, { pos: 60, t: 1000 })).toBeCloseTo(0.5);
    expect(releaseVelocity(samples, { pos: 30, t: 2000 })).toBe(0);
  });

  it("est négative quand le pointeur recule sur l'axe (glisser vers le haut)", () => {
    expect(releaseVelocity([{ pos: 500, t: 0 }], { pos: 440, t: 60 })).toBeCloseTo(-1);
  });
});
