import { describe, expect, it } from "vitest";

import type { Day, DayLineItem } from "@/contracts";
import { edimbourg } from "@/mocks/edimbourg";

import {
  daySummary,
  dayTravelLine,
  formatMontant,
  isOverTravelBudget,
  longestSegmentToStop,
  pathTo,
  pathToLabel,
  travelBannerMessage,
  tripBudgetLine,
  tripEvents,
} from "./travel";

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

  it("un créneau de repas pas encore choisi n'est pas une destination (décision 0015 § 2)", () => {
    const stop = (id: string) => ({ ...day(2).events[0]!, id, kind: "activity" as const });
    const items: DayLineItem[] = [
      { type: "segment", segment: { mode: "walk", minutes: 10, estimated: false } },
      { type: "stop", stop: stop("a") },
      { type: "segment", segment: { mode: "transit", minutes: 40, estimated: true } },
      { type: "openMeal", time: "12:30", meal: "lunch" },
      { type: "segment", segment: { mode: "walk", minutes: 15, estimated: false } },
      { type: "stop", stop: stop("b") },
    ];
    expect(longestSegmentToStop(items)).toEqual({ segment: { mode: "walk", minutes: 15, estimated: false }, stop: stop("b") });
  });
});

describe("travel: « Pour y aller » (F5-PO-9)", () => {
  it("J2, Dean Village : « À pied, 20 min depuis [Royal Mile] »", () => {
    const path = pathTo(day(2).items, "j2-dean-village");
    expect(path).toEqual({ segment: { mode: "walk", minutes: 20, estimated: false }, origin: "[Royal Mile]" });
    expect(pathToLabel(path!)).toBe("À pied, 20 min depuis [Royal Mile]");
  });

  it("J5, distillerie : « Bus, environ 50 min (estimation) depuis [Petite adresse de Chambers Street] »", () => {
    expect(pathToLabel(pathTo(day(5).items, "j5-distillerie")!)).toBe(
      "Bus, environ 50 min (estimation) depuis [Petite adresse de Chambers Street]",
    );
  });

  it("première étape : origine = terminus de départ ; temps libre entre l'origine et le segment ignoré", () => {
    expect(pathToLabel(pathTo(day(2).items, "j2-royal-mile")!)).toMatch(/^À pied, 10 min depuis \[/);
    // J2 : jardin, temps libre, bus de 20 min, dîner : l'origine est le jardin.
    const stops = day(2).items.flatMap((item) => (item.type === "stop" ? [item.stop] : []));
    const path = pathTo(day(2).items, stops[stops.length - 1]!.id);
    expect(path?.segment.mode).toBe("transit");
    expect(path?.origin).toBe(stops[stops.length - 2]?.name);
  });

  it("événement hors programme, étape inconnue ou sans segment avant elle : null", () => {
    expect(pathTo(day(2).items, "j2-concert-orgue")).toBeNull();
    expect(pathTo(day(2).items, "inconnue")).toBeNull();
    const stop = (id: string) => ({ ...day(2).events[0]!, id, kind: "activity" as const });
    const items: DayLineItem[] = [
      { type: "terminus", role: "start", time: "09:00", label: "[Hôtel]" },
      { type: "stop", stop: stop("a") },
      { type: "segment", segment: { mode: "walk", minutes: 5, estimated: false } },
      { type: "stop", stop: stop("b") },
      { type: "stop", stop: stop("c") },
    ];
    expect(pathTo(items, "a")).toBeNull();
    expect(pathTo(items, "c")).toBeNull();
    expect(pathTo(items, "b")).toEqual({ segment: { mode: "walk", minutes: 5, estimated: false }, origin: stop("a").name });
  });

  it("un créneau de repas pas encore choisi n'est ni origine ni étape intermédiaire (décision 0015 § 2)", () => {
    const stop = (id: string) => ({ ...day(2).events[0]!, id, kind: "activity" as const });
    const items: DayLineItem[] = [
      { type: "stop", stop: stop("a") },
      { type: "openMeal", time: "12:30", meal: "lunch" },
      { type: "segment", segment: { mode: "walk", minutes: 12, estimated: false } },
      { type: "openMeal", time: "13:00", meal: "lunch" },
      { type: "stop", stop: stop("b") },
    ];
    expect(pathTo(items, "b")).toEqual({ segment: { mode: "walk", minutes: 12, estimated: false }, origin: stop("a").name });
    expect(pathToLabel({ segment: { mode: "car", minutes: 15, estimated: false } })).toBe("En voiture, 15 min");
  });
});

describe("travel: ligne trajet et budget", () => {
  it("J2 : « 1 h 25 de trajet · environ 95 CHF par personne »", () => {
    expect(dayTravelLine(day(2))).toBe("1 h 25 de trajet · environ 95 CHF par personne");
  });

  it("sans budget : la durée seule", () => {
    expect(dayTravelLine({ travelMinutes: 40, budgetPerPerson: undefined })).toBe("40 min de trajet");
  });

  it("formate les montants en fr-CH, sans dépendre de l'ICU (F-ICU, ticket 171)", () => {
    expect(formatMontant(95)).toBe("95");
    expect(formatMontant(999)).toBe("999");
    expect(formatMontant(1000)).toBe("1\u202F000");
    expect(formatMontant(1640)).toBe("1\u202F640");
    expect(formatMontant(12345)).toBe("12\u202F345");
  });
});

describe("travel: budget total du Séjour (F5-PO-3)", () => {
  it("somme des budgets journaliers par personne : 640 CHF pour Édimbourg", () => {
    expect(tripBudgetLine(edimbourg.days)).toBe("Budget estimé : environ 640 CHF par personne");
  });

  it("un jour sans budget est nommé, et n'entre pas dans le total", () => {
    const days = edimbourg.days.map((candidate) => (candidate.index === 4 ? { ...candidate, budgetPerPerson: undefined } : candidate));
    expect(tripBudgetLine(days)).toBe("Budget estimé : environ 570 CHF par personne (sans le jour 4)");
  });

  it("chaque jour sans budget est nommé, dans l'ordre des jours", () => {
    const days = edimbourg.days.map((candidate) =>
      candidate.index === 2 || candidate.index === 6 ? { ...candidate, budgetPerPerson: undefined } : candidate,
    );
    expect(tripBudgetLine(days)).toBe("Budget estimé : environ 500 CHF par personne (sans le jour 2) (sans le jour 6)");
  });

  it("aucun jour avec budget : pas de ligne", () => {
    expect(tripBudgetLine(edimbourg.days.map((candidate) => ({ ...candidate, budgetPerPerson: undefined })))).toBeNull();
    expect(tripBudgetLine([])).toBeNull();
  });

  it("montant formaté par formatNombre (milliers séparés par U+202F)", () => {
    expect(tripBudgetLine([{ index: 1, budgetPerPerson: 1200 }])).toBe(
      "Budget estimé : environ 1\u202F200 CHF par personne",
    );
  });
});

describe("travel: résumé du jour (« Jour par jour »)", () => {
  it("nombre d'étapes et durée de trajet au format de F3", () => {
    const stops = day(2).items.filter((item) => item.type === "stop").length;
    expect(daySummary(day(2))).toBe(`${stops} étapes · 1 h 25 de trajet`);
    expect(daySummary(day(5))).toMatch(/ · 2 h 45 de trajet$/);
  });

  it("singulier pour une étape ; ni le temps libre, ni les segments, ni un repas pas encore choisi ne comptent", () => {
    const items: DayLineItem[] = [
      { type: "terminus", role: "start", time: "09:00", label: "[Hôtel]" },
      { type: "segment", segment: { mode: "walk", minutes: 10, estimated: false } },
      { type: "stop", stop: (day(2).items.find((item) => item.type === "stop") as Extract<DayLineItem, { type: "stop" }>).stop },
      { type: "free", from: "12:00", to: "14:00" },
      { type: "openMeal", time: "19:00", meal: "dinner" },
    ];
    expect(daySummary({ items, travelMinutes: 10 })).toBe("1 étape · 10 min de trajet");
  });
});

describe("travel: événements du séjour (« Pendant ton séjour »)", () => {
  it("par jour, puis par heure ; seulement les Day.events (le Tattoo, dans le programme, n'y est pas)", () => {
    const list = tripEvents(edimbourg.days);
    expect(list.map(({ day: d, event }) => [d.index, event.name])).toEqual([
      [2, "[Concert d'orgue à St Giles]"],
      [4, "[Marché nocturne de Leith]"],
    ]);
  });

  it("trie par heure de début dans un jour et par jour, quel que soit l'ordre des données", () => {
    const concert = day(2).events[0]!;
    const days = [
      { index: 3, events: [{ ...concert, id: "b", start: "21:00" }, { ...concert, id: "a", start: "09:30" }] },
      { index: 1, events: [{ ...concert, id: "c", start: "18:00" }] },
    ];
    expect(tripEvents(days).map(({ event }) => event.id)).toEqual(["c", "a", "b"]);
  });
});
