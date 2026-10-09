// @vitest-environment node
import { describe, expect, it } from "vitest";

import { formatDateCourte, formatVoyageurs, plateMeta } from "./plate";

describe("ligne de la plaque (format de F5)", () => {
  it("« sam. 29.08 – jeu. 03.09 · 2 adultes »", () => {
    expect(plateMeta({ start: "2026-08-29", end: "2026-09-03", travellers: { adults: 2, children: 0 } })).toBe(
      "sam. 29.08 – jeu. 03.09 · 2 adultes",
    );
  });

  it("jours de la semaine", () => {
    expect(formatDateCourte("2026-08-30")).toBe("dim. 30.08");
    expect(formatDateCourte("2026-08-31")).toBe("lun. 31.08");
  });

  it("voyageurs : singulier, enfants", () => {
    expect(formatVoyageurs({ adults: 1, children: 0 })).toBe("1 adulte");
    expect(formatVoyageurs({ adults: 2, children: 1 })).toBe("2 adultes, 1 enfant");
    expect(formatVoyageurs({ adults: 2, children: 3 })).toBe("2 adultes, 3 enfants");
  });
});
