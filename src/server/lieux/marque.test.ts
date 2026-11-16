import { describe, expect, it } from "vitest";

import { marqueAuMoment } from "./marque";

/**
 * Marque d'un ajout à l'horloge du serveur (tâche M8b, ticket 1111 ; spécification M8 § 6.4, critère M8b-1 ; décision 0160
 * § 2.6) : la date est celle de la **destination** (`trips.time_zone`), jamais celle de l'appareil. Édimbourg, 2026-08-29
 * au 2026-09-03, `Europe/London` (UTC+1 en été) ; un appareil à Zurich (UTC+2) est déjà le lendemain une heure plus tôt.
 */
const EDIMBOURG = { start: "2026-08-29", end: "2026-09-03", timeZone: "Europe/London" };
const le = (instant: string) => Date.parse(instant);

describe("lieu à soi: marque à l'instant du serveur", () => {
  it("cas d'Édimbourg à midi, heure de Londres", () => {
    expect(marqueAuMoment(EDIMBOURG, 3, le("2026-08-31T12:00:00+01:00"))).toBe("discovered");
    expect(marqueAuMoment(EDIMBOURG, 2, le("2026-08-31T12:00:00+01:00"))).toBe("discovered");
    expect(marqueAuMoment(EDIMBOURG, 4, le("2026-08-31T12:00:00+01:00"))).toBe("person");
    expect(marqueAuMoment(EDIMBOURG, 1, le("2026-08-20T12:00:00+01:00"))).toBe("person");
  });

  it("autour de minuit, appareil à Zurich et destination à Londres : seule l'heure de Londres compte", () => {
    // 00:30 le 29.08 à Zurich, encore 23:30 le 28.08 à Londres : le voyage n'a pas commencé.
    expect(marqueAuMoment(EDIMBOURG, 1, le("2026-08-29T00:30:00+02:00"))).toBe("person");
    // 00:00 le 29.08 à Londres : premier jour.
    expect(marqueAuMoment(EDIMBOURG, 1, le("2026-08-29T00:00:00+01:00"))).toBe("discovered");
    // 00:30 le 31.08 à Zurich, 23:30 le 30.08 à Londres : J3 (31.08) est encore un jour à venir.
    expect(marqueAuMoment(EDIMBOURG, 3, le("2026-08-31T00:30:00+02:00"))).toBe("person");
    expect(marqueAuMoment(EDIMBOURG, 3, le("2026-08-31T00:00:00+01:00"))).toBe("discovered");
    // Dernier jour : 23:59 à Londres (déjà le 04.09 à Zurich) reste dans le voyage ; 00:00 le 04.09 à Londres n'y est plus.
    expect(marqueAuMoment(EDIMBOURG, 6, le("2026-09-03T23:59:00+01:00"))).toBe("discovered");
    expect(marqueAuMoment(EDIMBOURG, 6, le("2026-09-04T00:00:00+01:00"))).toBe("person");
  });

  it("le fuseau du voyage décide : le même instant donne une autre date à Tokyo", () => {
    const tokyo = { start: "2026-08-29", end: "2026-09-03", timeZone: "Asia/Tokyo" };
    const instant = le("2026-08-28T16:00:00Z"); // 17:00 le 28.08 à Londres, 01:00 le 29.08 à Tokyo.
    expect(marqueAuMoment(EDIMBOURG, 1, instant)).toBe("person");
    expect(marqueAuMoment(tokyo, 1, instant)).toBe("discovered");
  });
});
