import { describe, expect, it } from "vitest";

import { accessUntil, formatDateCourte, formatDateLongue, formatTitreJour, formatTripDates, formatVoyageurs, instantLocal } from "./dates";

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

// Déplacé de `src/features/presentation/price.test.ts` avec `accessUntil` (décision 0039, F10-TL-7 point 1).
describe("accessUntil", () => {
  it("fin du voyage + 30 jours", () => {
    expect(accessUntil("2026-09-03", 30)).toBe("2026-10-03");
  });

  it("change de mois et d'année", () => {
    expect(accessUntil("2026-12-20", 30)).toBe("2027-01-19");
    expect(accessUntil("2026-09-03", 0)).toBe("2026-09-03");
  });
});

describe("instantLocal (décision 0157 § 1.6 point 5, M6b)", () => {
  const iso = (date: string, heure: string, fuseau: string) => instantLocal(date, heure, fuseau).toISOString();

  it("Londres en été (BST, UTC+1) : critère 5 de la spécification M6 § 6.2", () => {
    expect(iso("2026-08-30", "19:00", "Europe/London")).toBe("2026-08-30T18:00:00.000Z");
    expect(iso("2026-08-29", "12:45", "Europe/London")).toBe("2026-08-29T11:45:00.000Z");
  });

  it("Lisbonne : UTC+1 en été, UTC en hiver", () => {
    expect(iso("2026-07-14", "09:30", "Europe/Lisbon")).toBe("2026-07-14T08:30:00.000Z");
    expect(iso("2026-12-03", "09:30", "Europe/Lisbon")).toBe("2026-12-03T09:30:00.000Z");
  });

  it("passage à l'heure d'hiver du 2026-10-25 : avant, après, et heure ambiguë (première occurrence)", () => {
    expect(iso("2026-10-24", "10:00", "Europe/London")).toBe("2026-10-24T09:00:00.000Z");
    expect(iso("2026-10-25", "10:00", "Europe/London")).toBe("2026-10-25T10:00:00.000Z");
    // 01:30 existe deux fois à Londres (BST puis GMT) : la première, 00:30Z.
    expect(iso("2026-10-25", "01:30", "Europe/London")).toBe("2026-10-25T00:30:00.000Z");
    // Lisbonne : même nuit, mêmes règles ; Zurich (UTC+2 puis UTC+1) : 02:30 ambiguë, première occurrence 00:30Z.
    expect(iso("2026-10-25", "01:30", "Europe/Lisbon")).toBe("2026-10-25T00:30:00.000Z");
    expect(iso("2026-10-25", "02:30", "Europe/Zurich")).toBe("2026-10-25T00:30:00.000Z");
    expect(iso("2026-10-25", "12:00", "Europe/Zurich")).toBe("2026-10-25T11:00:00.000Z");
  });

  it("saut d'heure d'été : heure inexistante décalée de la durée du saut", () => {
    // Londres, 2026-03-29 : 01:00 GMT devient 02:00 BST ; 01:30 n'existe pas, lue 02:30 BST = 01:30Z.
    expect(iso("2026-03-29", "01:30", "Europe/London")).toBe("2026-03-29T01:30:00.000Z");
    // Zurich, même jour : 02:00 devient 03:00 ; 02:15 lue 03:15 CEST = 01:15Z.
    expect(iso("2026-03-29", "02:15", "Europe/Zurich")).toBe("2026-03-29T01:15:00.000Z");
    expect(iso("2026-03-29", "03:00", "Europe/Zurich")).toBe("2026-03-29T01:00:00.000Z");
  });

  it("fuseau sans heure d'été et minuit", () => {
    expect(iso("2026-08-30", "00:00", "Asia/Tokyo")).toBe("2026-08-29T15:00:00.000Z");
    expect(iso("2026-08-30", "23:59", "UTC")).toBe("2026-08-30T23:59:00.000Z");
  });

  it("refuse une date, une heure ou un fuseau mal formés", () => {
    expect(() => instantLocal("2026-02-30", "10:00", "Europe/London")).toThrow(RangeError);
    expect(() => instantLocal("30.08.2026", "10:00", "Europe/London")).toThrow(RangeError);
    expect(() => instantLocal("2026-08-30", "24:00", "Europe/London")).toThrow(RangeError);
    expect(() => instantLocal("2026-08-30", "10:00", "Europe/Nulle_Part")).toThrow(RangeError);
  });
});
