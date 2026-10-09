import { describe, expect, it } from "vitest";

import type { Day, DayLineItem } from "@/contracts";
import { edimbourg } from "@/mocks/edimbourg";

import { dayTravelLine, formatMontant, isOverTravelBudget, longestSegmentToStop, travelBannerMessage } from "./travel";

const day = (n: number): Day => edimbourg.days.find((candidate) => candidate.index === n)!;

describe("travel: dépassement strict", () => {
  it("bandeau seulement au-delà du budget, jamais à égalité (valeurs lues dans les données)", () => {
    expect(isOverTravelBudget(day(5))).toBe(true); // 165 pour 90
    expect(isOverTravelBudget(day(1))).toBe(false); // 90 pour 90
    expect(isOverTravelBudget(day(2))).toBe(false); // 85 pour 90
    expect(travelBannerMessage(day(1))).toBeNull();
    expect(travelBannerMessage(day(2))).toBeNull();
  });

  it("suit un budget de test modifié (aucune valeur en dur, Q8)", () => {
    expect(travelBannerMessage({ ...day(2), travelBudgetMinutes: 84 })).toBe(
      "1 h 25 de trajet ce jour, au-delà des 1 h 24 prévues pour ton rythme. Le plus long : À pied, 20 min, vers [Dean Village].",
    );
    expect(travelBannerMessage({ ...day(5), travelBudgetMinutes: 165 })).toBeNull();
    expect(travelBannerMessage({ ...day(5), travelBudgetMinutes: 200 })).toBeNull();
  });

  it("J5 : texte complet, plus long trajet vers la distillerie", () => {
    expect(travelBannerMessage(day(5))).toBe(
      "2 h 45 de trajet ce jour, au-delà des 1 h 30 prévues pour ton rythme. Le plus long : Bus, environ 50 min (estimation), vers [Distillerie accessible en bus].",
    );
  });

  it("omet la seconde phrase sans segment suivi d'une étape", () => {
    const items: DayLineItem[] = [
      { type: "terminus", role: "start", time: "09:00", label: "[Hôtel]" },
      { type: "segment", segment: { mode: "car", minutes: 120, estimated: true } },
      { type: "terminus", role: "end", time: "11:00", label: "[Hôtel]" },
    ];
    expect(travelBannerMessage({ ...day(2), items, travelMinutes: 120 })).toBe(
      "2 h de trajet ce jour, au-delà des 1 h 30 prévues pour ton rythme.",
    );
  });
});

describe("travel: plus long segment suivi d'une étape", () => {
  it("ignore un segment suivi d'un temps libre ou d'un terminus", () => {
    // J5 : le second bus de 50 min est suivi d'un temps libre ; le premier mène à la distillerie.
    const longest = longestSegmentToStop(day(5).items);
    expect(longest?.stop.id).toBe("j5-distillerie");
    expect(longest?.segment).toEqual({ mode: "transit", minutes: 50, estimated: true });
  });

  it("à égalité, garde le premier", () => {
    const stop = (id: string) => ({ ...day(2).events[0]!, id, kind: "activity" as const });
    const items: DayLineItem[] = [
      { type: "segment", segment: { mode: "walk", minutes: 20, estimated: false } },
      { type: "stop", stop: stop("a") },
      { type: "segment", segment: { mode: "walk", minutes: 20, estimated: false } },
      { type: "stop", stop: stop("b") },
    ];
    expect(longestSegmentToStop(items)?.stop.id).toBe("a");
    expect(longestSegmentToStop([])).toBeNull();
  });
});

describe("travel: ligne trajet et budget", () => {
  it("J2 : « 1 h 25 de trajet · environ 95 CHF par personne »", () => {
    expect(dayTravelLine(day(2))).toBe("1 h 25 de trajet · environ 95 CHF par personne");
  });

  it("sans budget : la durée seule", () => {
    expect(dayTravelLine({ travelMinutes: 40, budgetPerPerson: undefined })).toBe("40 min de trajet");
  });

  it("formate les montants en fr-CH", () => {
    expect(formatMontant(1640)).toBe(new Intl.NumberFormat("fr-CH").format(1640));
    expect(formatMontant(95)).toBe("95");
  });
});
