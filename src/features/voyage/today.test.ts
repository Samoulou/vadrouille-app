// @vitest-environment node
import { describe, expect, it } from "vitest";

import { localDateAt, yearOf } from "./today";

/** Date de la destination (décision 0021 § 3). */

const at = (iso: string) => Date.parse(iso);

describe("localDateAt", () => {
  it("appareil à Zurich le 29.08 à 00:30 : 28.08 à Londres ; à 01:30 : 29.08", () => {
    expect(localDateAt(at("2026-08-29T00:30:00+02:00"), "Europe/London")).toBe("2026-08-28");
    expect(localDateAt(at("2026-08-29T01:30:00+02:00"), "Europe/London")).toBe("2026-08-29");
    expect(localDateAt(at("2026-08-29T00:30:00+02:00"), "Europe/Zurich")).toBe("2026-08-29");
  });

  it("changement d'heure d'été (Londres, 29.03.2026 à 01:00 UTC)", () => {
    expect(localDateAt(at("2026-03-28T23:59:00Z"), "Europe/London")).toBe("2026-03-28");
    expect(localDateAt(at("2026-03-29T00:30:00Z"), "Europe/London")).toBe("2026-03-29");
    expect(localDateAt(at("2026-03-29T23:30:00Z"), "Europe/London")).toBe("2026-03-30");
    // Fin de l'heure d'été (25.10.2026) : 23:30 UTC est encore le 25 à Londres.
    expect(localDateAt(at("2026-10-25T23:30:00Z"), "Europe/London")).toBe("2026-10-25");
  });

  it("autres fuseaux et alias", () => {
    expect(localDateAt(at("2026-05-17T23:30:00Z"), "Europe/Lisbon")).toBe("2026-05-18");
    expect(localDateAt(at("2026-05-17T20:00:00Z"), "Asia/Kolkata")).toBe("2026-05-18");
    expect(localDateAt(at("2026-12-31T23:59:59Z"), "UTC")).toBe("2026-12-31");
  });

  it("fuseau inconnu : erreur levée", () => {
    expect(() => localDateAt(0, "Lune/Base")).toThrow(RangeError);
  });

  it("yearOf", () => {
    expect(yearOf("2027-05-08")).toBe(2027);
  });
});
