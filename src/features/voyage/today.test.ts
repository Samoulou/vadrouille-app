// @vitest-environment node
import { describe, expect, it } from "vitest";

import { edimbourg } from "@/mocks/edimbourg";

import {
  currentDayIndex,
  deviceTimeDiffers,
  firstStop,
  hasStops,
  isPastStop,
  localDateAt,
  localTimeAt,
  nextUp,
  nowAt,
  previousDate,
  projectTodayTrip,
  reminders,
  tripMoment,
  yearOf,
} from "./today";

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

/** Écran 15 (spécification F10, « Tests », `today.ts` ; F10-TL-2, F10-PO-3, F10-PO-4, F10-PO-5). */

const trip = projectTodayTrip(edimbourg);
const day = (index: number) => trip.days.find((candidate) => candidate.index === index)!;
const names = (stops: readonly { name: string }[]) => stops.map((stop) => stop.name);

describe("localTimeAt et previousDate", () => {
  it("heure de la destination à la minute près, secondes ignorées", () => {
    expect(localTimeAt(at("2026-08-30T10:49:59+01:00"), "Europe/London")).toBe("10:49");
    expect(localTimeAt(at("2026-08-30T10:50:00+01:00"), "Europe/London")).toBe("10:50");
    expect(localTimeAt(at("2026-08-30T00:30:00+02:00"), "Europe/London")).toBe("23:30");
    expect(localTimeAt(at("2026-08-30T00:05:00+01:00"), "Europe/London")).toBe("00:05");
  });

  it("veille d'une date, changement de mois et d'année compris", () => {
    expect(previousDate("2026-08-29")).toBe("2026-08-28");
    expect(previousDate("2026-09-01")).toBe("2026-08-31");
    expect(previousDate("2027-01-01")).toBe("2026-12-31");
  });

  it("fuseau de l'appareil différent de celui de la destination à cet instant (Q188)", () => {
    expect(deviceTimeDiffers(at("2026-08-30T10:40:00+01:00"), "Europe/London", "Europe/Zurich")).toBe(true);
    expect(deviceTimeDiffers(at("2026-08-30T10:40:00+01:00"), "Europe/London", "Europe/London")).toBe(false);
    // Lisbonne et Londres ont la même heure en été.
    expect(deviceTimeDiffers(at("2026-08-30T10:40:00+01:00"), "Europe/London", "Europe/Lisbon")).toBe(false);
  });
});

describe("projectTodayTrip (F10-TL-2)", () => {
  it("garde les jours, la ligne du jour et le placeId ; retire raisons, sources, verrous, événements, budget et idées", () => {
    expect(trip).toMatchObject({ id: edimbourg.id, destination: "Édimbourg", timeZone: "Europe/London" });
    expect(trip.days.map((candidate) => candidate.index)).toEqual([1, 2, 3, 4, 5, 6]);
    const dean = day(2).items.find((item) => item.type === "stop" && item.stop.id === "j2-dean-village");
    expect(dean).toEqual({
      type: "stop",
      stop: {
        id: "j2-dean-village",
        kind: "activity",
        name: "[Dean Village]",
        start: "10:50",
        end: "11:50",
        meta: "[Water of Leith, 1 h, gratuit]",
        exceptions: [],
        placeId: "mock_place_dean_village",
      },
    });
    expect(Object.keys(day(2)).sort()).toEqual(["date", "generating", "index", "items", "title"]);
    const serialized = JSON.stringify(trip);
    for (const absent of ["reason", "source", "verifiedAt", "locked", "events", "surprise", "budgetPerPerson", "[Concert d'orgue à St Giles]"]) {
      expect(serialized).not.toContain(absent);
    }
  });
});

describe("tripMoment et currentDayIndex (date de la destination)", () => {
  it("appareil à Zurich le 30.08 à 00:30 : 29.08 à Édimbourg, jour 1", () => {
    expect(currentDayIndex(trip, at("2026-08-30T00:30:00+02:00"))).toBe(1);
    expect(tripMoment(trip, at("2026-08-30T00:30:00+02:00"))).toEqual({ kind: "during", dayIndex: 1 });
    expect(tripMoment(trip, at("2026-08-30T01:30:00+02:00"))).toEqual({ kind: "during", dayIndex: 2 });
  });

  it("avant le voyage, la veille, premier et dernier jour, après le voyage (30 jours et plus compris)", () => {
    expect(tripMoment(trip, at("2026-08-01T12:00:00+01:00"))).toEqual({ kind: "before", eve: false });
    expect(tripMoment(trip, at("2026-08-28T12:00:00+01:00"))).toEqual({ kind: "before", eve: true });
    expect(tripMoment(trip, at("2026-08-29T00:00:00+01:00"))).toEqual({ kind: "during", dayIndex: 1 });
    expect(tripMoment(trip, at("2026-09-03T23:59:00+01:00"))).toEqual({ kind: "during", dayIndex: 6 });
    expect(tripMoment(trip, at("2026-09-04T12:00:00+01:00"))).toEqual({ kind: "after" });
    expect(tripMoment(trip, at("2026-10-11T12:00:00+01:00"))).toEqual({ kind: "after" });
    expect(currentDayIndex(trip, at("2026-09-04T12:00:00+01:00"))).toBeNull();
  });
});

describe("nowAt, nextUp, isPastStop (F10-PO-4)", () => {
  it("bornes exactes : en cours de start inclus à end exclu ; prochaine strictement après", () => {
    expect(nowAt(day(2), "10:49")).toBeNull();
    expect(nextUp(day(2), "10:49")?.stop.name).toBe("[Dean Village]");
    expect(nowAt(day(2), "10:50")).toEqual({ kind: "stop", stop: expect.objectContaining({ name: "[Dean Village]" }) });
    expect(nextUp(day(2), "10:50")?.stop.name).toBe("[Café de Stockbridge]");
    expect(nowAt(day(2), "11:50")).toBeNull();
  });

  it("segment qui précède la prochaine étape dans la ligne du jour", () => {
    expect(nextUp(day(2), "10:40")?.segment).toEqual({ mode: "walk", minutes: 20, estimated: false });
    expect(nextUp(day(2), "16:00")).toMatchObject({ stop: { name: "[Bonne table de New Town]" }, segment: { mode: "transit" } });
  });

  it("temps libre en cours ; plus d'étape ; avant la première étape", () => {
    expect(nowAt(day(2), "16:00")).toEqual({ kind: "free", to: "18:30" });
    expect(nowAt(day(2), "21:00")).toBeNull();
    expect(nextUp(day(2), "21:00")).toBeNull();
    expect(nowAt(day(2), "08:00")).toBeNull();
    expect(nextUp(day(2), "08:00")?.stop.name).toBe("[Royal Mile]");
  });

  it("étape sans end : jamais en cours, prochaine jusqu'à son heure, puis passée", () => {
    const sansFin = {
      items: [{ type: "stop" as const, stop: { id: "a", kind: "activity" as const, name: "[A]", start: "10:00", meta: "", exceptions: [] } }],
    };
    expect(nowAt(sansFin, "10:00")).toBeNull();
    expect(nextUp(sansFin, "09:59")?.stop.id).toBe("a");
    expect(nextUp(sansFin, "10:00")).toBeNull();
    expect(isPastStop({ start: "10:00" }, "09:59")).toBe(false);
    expect(isPastStop({ start: "10:00" }, "10:00")).toBe(true);
  });

  it("étapes passées : end ≤ maintenant", () => {
    expect(isPastStop({ start: "09:15", end: "10:30" }, "10:51")).toBe(true);
    expect(isPastStop({ start: "10:50", end: "11:50" }, "10:51")).toBe(false);
    expect(isPastStop({ start: "10:50", end: "11:50" }, "11:50")).toBe(true);
  });

  it("repas pas encore choisi : jamais prochaine étape ; jour sans étape", () => {
    const repas = {
      items: [
        { type: "openMeal" as const, time: "12:30", meal: "lunch" as const },
        { type: "free" as const, from: "14:00", to: "18:00" },
      ],
    };
    expect(nextUp(repas, "08:00")).toBeNull();
    expect(hasStops(repas)).toBe(false);
    expect(firstStop(repas)).toBeNull();
    expect(hasStops(day(2))).toBe(true);
    expect(firstStop(day(3))?.name).toBe("[Excursion guidée dans les Highlands]");
  });
});

describe("reminders « À réserver » (F10-PO-5)", () => {
  it("aujourd'hui : à venir seulement ; demain : toutes", () => {
    const at1040 = reminders(trip.days, 2, "10:40");
    expect(names(at1040.today)).toEqual(["[Bonne table de New Town]"]);
    expect(names(at1040.tomorrow)).toEqual(["[Excursion guidée dans les Highlands]"]);
    expect(names(reminders(trip.days, 2, "21:00").today)).toEqual([]);
    expect(names(reminders(trip.days, 2, "19:00").today)).toEqual([]);
  });

  it("dernier jour : rien pour demain", () => {
    expect(reminders(trip.days, 6, "10:00").tomorrow).toEqual([]);
  });
});
