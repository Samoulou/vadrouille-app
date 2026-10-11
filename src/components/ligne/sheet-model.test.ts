// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  DEFAULT_SNAP,
  SHEET_FLICK_VELOCITY,
  SNAP_POINTS,
  handleReduces,
  handleTarget,
  nearestSnap,
  nextSnapDown,
  nextSnapUp,
  snapAfterRelease,
} from "./sheet-model";

describe("sheet-model (F5-PO-2, décision 0015 § 5.2)", () => {
  it("hauteurs 25, 55 (défaut) et 92 %", () => {
    expect(SNAP_POINTS).toEqual([0.25, 0.55, 0.92]);
    expect(DEFAULT_SNAP).toBe(0.55);
    expect(SHEET_FLICK_VELOCITY).toBe(0.5);
  });

  it("nearestSnap : hauteur la plus proche", () => {
    expect(nearestSnap(0.1)).toBe(0.25);
    expect(nearestSnap(0.39)).toBe(0.25);
    expect(nearestSnap(0.41)).toBe(0.55);
    expect(nearestSnap(0.8)).toBe(0.92);
    expect(nearestSnap(1)).toBe(0.92);
  });

  it("snapAfterRelease : lent, la plus proche ; 200 px lents depuis 55 % : 92 % ; 40 px : 55 %", () => {
    const h = 844;
    expect(snapAfterRelease({ height: (464 + 200) / h, velocity: 0.25 })).toBe(0.92);
    expect(snapAfterRelease({ height: (464 + 40) / h, velocity: 0.25 })).toBe(0.55);
    expect(snapAfterRelease({ height: 0.55, velocity: SHEET_FLICK_VELOCITY })).toBe(0.55);
  });

  it("snapAfterRelease : rapide, la suivante dans le sens du geste (60 px vers le bas depuis 55 % : 25 %)", () => {
    expect(snapAfterRelease({ height: (464 - 60) / 844, velocity: -1.2 })).toBe(0.25);
    expect(snapAfterRelease({ height: (464 + 30) / 844, velocity: 0.8 })).toBe(0.92);
    expect(snapAfterRelease({ height: 0.92, velocity: 2 })).toBe(0.92);
    expect(snapAfterRelease({ height: 0.25, velocity: -2 })).toBe(0.25);
  });

  it("poignée : agrandit à 25 et 55 %, réduit de 92 à 25 %", () => {
    expect(handleTarget(0.25)).toBe(0.55);
    expect(handleTarget(0.55)).toBe(0.92);
    expect(handleTarget(0.92)).toBe(0.25);
    expect(handleReduces(0.92)).toBe(true);
    expect(handleReduces(0.55)).toBe(false);
  });

  it("flèches : une hauteur, bornées", () => {
    expect(nextSnapUp(0.25)).toBe(0.55);
    expect(nextSnapUp(0.55)).toBe(0.92);
    expect(nextSnapUp(0.92)).toBe(0.92);
    expect(nextSnapDown(0.92)).toBe(0.55);
    expect(nextSnapDown(0.55)).toBe(0.25);
    expect(nextSnapDown(0.25)).toBe(0.25);
  });
});
