import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { applyTokens } from "../../../tests/unit/carte-fixtures";

import { layoutFitPadding, useMapLayout } from "./map-layout";

const MAIN = { width: 390, height: 844 };

beforeAll(() => {
  applyTokens(["--touch-target"]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("M4-suite-carte: étiquette de ville (marges du cadrage, map-layout.ts)", () => {
  it("avec étiquettes : marge haute de deux cibles tactiles, en mobile comme en grand écran", () => {
    expect(layoutFitPadding(MAIN, false, true)).toEqual({ top: 88, right: 44, bottom: 0.55 * 844, left: 44 });
    expect(layoutFitPadding(MAIN, true, true)).toEqual({ top: 88, right: 44, bottom: 44, left: 44 });
  });

  it("sans étiquette (une ville, jours ordinaires) : inchangée", () => {
    expect(layoutFitPadding(MAIN, false)).toEqual({ top: 44, right: 44, bottom: 0.55 * 844, left: 44 });
    expect(layoutFitPadding(MAIN, true)).toEqual({ top: 44, right: 44, bottom: 44, left: 44 });
    expect(layoutFitPadding(MAIN, false, false)).toEqual(layoutFitPadding(MAIN, false));
  });

  it("useMapLayout recalcule la marge quand l'indication change (Journée J2 puis J3), sans changer fitScope", () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(MAIN.width);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(MAIN.height);
    const { result, rerender } = renderHook(({ etiquettes }) => useMapLayout(0.55, etiquettes), { initialProps: { etiquettes: false } });
    act(() => {
      result.current.mainRef(document.createElement("main"));
    });
    expect(result.current.fitPadding?.top).toBe(44);
    const scope = result.current.fitScope;
    rerender({ etiquettes: true });
    expect(result.current.fitPadding?.top).toBe(88);
    expect(result.current.fitScope).toBe(scope);
    rerender({ etiquettes: false });
    expect(result.current.fitPadding?.top).toBe(44);
  });
});
