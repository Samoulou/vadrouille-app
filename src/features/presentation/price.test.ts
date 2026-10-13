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

  it("indépendant de l'ICU (F-ICU, ticket 171) : milliers séparés par U+202F, devise après U+00A0", () => {
    expect(formatPrice(99900, "CHF")).toBe("999\u00A0CHF");
    expect(formatPrice(100000, "CHF")).toBe("1\u202F000\u00A0CHF");
    expect(formatPrice(1234550, "CHF")).toBe("12\u202F345.50\u00A0CHF");
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
