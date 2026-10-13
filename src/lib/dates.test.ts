import { describe, expect, it } from "vitest";

import { formatDateCourte, formatDateLongue, formatTitreJour, formatTripDates, formatVoyageurs } from "./dates";

describe("formatDateLongue", () => {
  it("écrit la date en toutes lettres", () => {
    expect(formatDateLongue("2026-08-15")).toBe("15 août 2026");
    // « 1er » pour le premier du mois (B2-PO-12).
    expect(formatDateLongue("2026-09-01")).toBe("1er septembre 2026");
    expect(formatDateLongue("2026-09-02")).toBe("2 septembre 2026");
  });

  it("rend la valeur telle quelle si elle n'est pas une date ISO", () => {
    expect(formatDateLongue("inconnue")).toBe("inconnue");
  });
});

describe("formatTitreJour (B2, E1)", () => {
  it("titre de la Journée calculé depuis la date, « 1er » pour le premier", () => {
    expect(formatTitreJour("2026-08-29")).toBe("Samedi 29 août");
    expect(formatTitreJour("2026-09-01")).toBe("Mardi 1er septembre");
    expect(formatTitreJour("2026-08-30")).toBe("Dimanche 30 août");
    expect(formatTitreJour("inconnue")).toBe("inconnue");
  });
});

describe("formatTripDates (décision 0021 § 3)", () => {
  const two = { adults: 2, children: 0 };

  it("sans année courante : jamais d'année (Séjour, écran 9)", () => {
    expect(formatTripDates("2026-08-29", "2026-09-03", two)).toBe("sam. 29.08 – jeu. 03.09 · 2 adultes");
    expect(formatTripDates("2027-05-08", "2027-05-11", two)).toBe("sam. 08.05 – mar. 11.05 · 2 adultes");
  });

  it("voyage de l'année en cours : sans année ; autre année : l'année après la date de fin", () => {
    expect(formatTripDates("2026-05-14", "2026-05-17", two, { currentYear: 2026 })).toBe("jeu. 14.05 – dim. 17.05 · 2 adultes");
    expect(formatTripDates("2027-05-08", "2027-05-11", two, { currentYear: 2026 })).toBe("sam. 08.05 – mar. 11.05.2027 · 2 adultes");
    expect(formatTripDates("2025-12-30", "2026-01-02", two, { currentYear: 2026 })).toBe("mar. 30.12 – ven. 02.01.2026 · 2 adultes");
  });

  it("voyageurs et dates courtes", () => {
    expect(formatTripDates("2026-08-29", "2026-08-29", { adults: 1, children: 2 })).toBe("sam. 29.08 – sam. 29.08 · 1 adulte, 2 enfants");
    expect(formatDateCourte("2027-05-11", true)).toBe("mar. 11.05.2027");
    expect(formatVoyageurs({ adults: 2, children: 1 })).toBe("2 adultes, 1 enfant");
  });
});
