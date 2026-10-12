import { describe, expect, it } from "vitest";

import { SEPARATEUR_MILLIERS, formatNombre } from "./brief-fields";

describe("formatNombre", () => {
  it("sépare les milliers par une espace fine insécable, sans dépendre de l'ICU", () => {
    expect(SEPARATEUR_MILLIERS).toBe(" ");
    expect(formatNombre(0)).toBe("0");
    expect(formatNombre(900)).toBe("900");
    expect(formatNombre(1000)).toBe("1 000");
    expect(formatNombre(1234567)).toBe("1 234 567");
  });

  it("tronque les décimales et signe les négatifs avec U+2212", () => {
    expect(formatNombre(40.9)).toBe("40");
    expect(formatNombre(-1500)).toBe("−1 500");
  });
});
