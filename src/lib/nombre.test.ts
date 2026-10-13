import { describe, expect, it } from "vitest";

import { SEPARATEUR_MILLIERS, formatNombre } from "./nombre";

describe("formatNombre (F-ICU, ticket 171)", () => {
  it("sépare les milliers par une espace fine insécable, sans dépendre de l'ICU", () => {
    expect(SEPARATEUR_MILLIERS).toBe("\u202F");
    expect(formatNombre(0)).toBe("0");
    expect(formatNombre(900)).toBe("900");
    expect(formatNombre(1000)).toBe("1\u202F000");
    expect(formatNombre(1234567)).toBe("1\u202F234\u202F567");
  });

  it("aux bornes : 999, 1000 et 12 345", () => {
    expect(formatNombre(999)).toBe("999");
    expect(formatNombre(1000)).toBe("1\u202F000");
    expect(formatNombre(12345)).toBe("12\u202F345");
  });

  it("tronque les décimales et signe les négatifs avec U+2212", () => {
    expect(formatNombre(40.9)).toBe("40");
    expect(formatNombre(-1500)).toBe("\u22121\u202F500");
  });
});
