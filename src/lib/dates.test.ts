import { describe, expect, it } from "vitest";

import { formatDateLongue } from "./dates";

describe("formatDateLongue", () => {
  it("écrit la date en toutes lettres", () => {
    expect(formatDateLongue("2026-08-15")).toBe("15 août 2026");
    expect(formatDateLongue("2026-09-01")).toBe("1 septembre 2026");
  });

  it("rend la valeur telle quelle si elle n'est pas une date ISO", () => {
    expect(formatDateLongue("inconnue")).toBe("inconnue");
  });
});
