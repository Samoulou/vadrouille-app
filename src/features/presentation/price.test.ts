// @vitest-environment node
import { describe, expect, it } from "vitest";

import { accessUntil, formatPrice } from "./price";

const normalize = (text: string) => text.replace(/[  ]/g, " ");

describe("formatPrice (F9-PO-4)", () => {
  it("montant rond sans décimales", () => {
    expect(normalize(formatPrice(2900, "CHF"))).toBe("29 CHF");
    expect(normalize(formatPrice(3900, "CHF"))).toBe("39 CHF");
  });

  it("deux décimales sinon", () => {
    expect(normalize(formatPrice(2950, "CHF"))).toBe("29.50 CHF");
    expect(normalize(formatPrice(2905, "CHF"))).toBe("29.05 CHF");
  });
});

describe("accessUntil", () => {
  it("fin du voyage + 30 jours", () => {
    expect(accessUntil("2026-09-03", 30)).toBe("2026-10-03");
  });

  it("change de mois et d'année", () => {
    expect(accessUntil("2026-12-20", 30)).toBe("2027-01-19");
    expect(accessUntil("2026-09-03", 0)).toBe("2026-09-03");
  });
});
