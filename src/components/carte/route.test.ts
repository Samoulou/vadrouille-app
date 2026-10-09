// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Day, DayLineItem, DayMap, MapPoint, Segment } from "@/contracts";

import { boundsOf, buildDayRoute, buildOverview, offsetCenter } from "./route";

const stopItem = (id: string): DayLineItem => ({
  type: "stop",
  stop: { id, kind: "activity", name: `[${id}]`, start: "10:00", meta: "", exceptions: [], locked: false },
});
const segment = (mode: Segment["mode"]): DayLineItem => ({ type: "segment", segment: { mode, minutes: 10, estimated: false } });

function dayOf(lastMode: Segment["mode"] = "walk"): Day {
  return {
    index: 1,
    date: "2026-08-29",
    weekday: "sam.",
    title: "Samedi 29 août",
    items: [
      { type: "terminus", role: "start", time: "09:00", label: "[Hôtel]" },
      segment("walk"),
      stopItem("s1"),
      segment("transit"),
      stopItem("s2"),
      { type: "free", from: "12:00", to: "13:00" },
      segment("walk"),
      stopItem("s3"),
      segment("car"),
      stopItem("s4"),
      segment(lastMode),
      { type: "terminus", role: "end", time: "20:00", label: "[Hôtel]" },
    ],
    events: [{ id: "e1", kind: "event", name: "[E]", start: "18:00", meta: "", exceptions: [], locked: false }],
    generating: false,
    travelMinutes: 50,
    travelBudgetMinutes: 90,
  };
}

const at = (stopId: string, lat: number, lng: number): MapPoint => ({ ref: { type: "stop", stopId }, lat, lng });
const terminus = (role: "start" | "end", lat: number, lng: number): MapPoint => ({ ref: { type: "terminus", role }, lat, lng });
const mapOf = (points: MapPoint[]): DayMap => ({ tripId: "t", dayIndex: 1, points });

const ALL = [terminus("start", 0, 0), at("s1", 1, 1), at("s2", 2, 2), at("s3", 3, 3), at("s4", 4, 4), terminus("end", 0, 0)];

describe("buildDayRoute", () => {
  it("numérote les 4 étapes de 1 à 4 dans l'ordre de items", () => {
    const route = buildDayRoute(dayOf(), mapOf(ALL));
    expect(route.stops.map((stop) => [stop.stopId, stop.number])).toEqual([
      ["s1", 1],
      ["s2", 2],
      ["s3", 3],
      ["s4", 4],
    ]);
    expect(route.stops[0]?.name).toBe("[s1]");
  });

  it("ignore un créneau de repas pas encore choisi (openMeal, décision 0015 § 2) : ni marqueur, ni rang, ni tronçon", () => {
    const day = dayOf();
    const withMeal: Day = {
      ...day,
      items: [...day.items.slice(0, 3), { type: "openMeal", time: "12:30", meal: "lunch" }, ...day.items.slice(3)],
    };
    const route = buildDayRoute(withMeal, mapOf(ALL));
    expect(route.stops.map((stop) => [stop.stopId, stop.number])).toEqual([
      ["s1", 1],
      ["s2", 2],
      ["s3", 3],
      ["s4", 4],
    ]);
    expect(route.legs).toEqual(buildDayRoute(day, mapOf(ALL)).legs);
  });

  it("garde le rang dans la liste quand l'étape 2 n'a pas de position : marqueurs 1, 3, 4", () => {
    const route = buildDayRoute(dayOf(), mapOf(ALL.filter((p) => !(p.ref.type === "stop" && p.ref.stopId === "s2"))));
    expect(route.stops.map((stop) => stop.number)).toEqual([1, 3, 4]);
    // Les voisines de l'étape sans position sont reliées : s1 → s3.
    expect(route.legs.map((leg) => [leg.from, leg.to])).toContainEqual([
      { lat: 1, lng: 1 },
      { lat: 3, lng: 3 },
    ]);
    expect(route.legs).toHaveLength(4);
  });

  it("fusionne départ et retour à la même position en un terminus sans numéro", () => {
    const route = buildDayRoute(dayOf(), mapOf(ALL));
    expect(route.termini).toEqual([{ roles: ["start", "end"], position: { lat: 0, lng: 0 } }]);
    expect(route.termini[0]).not.toHaveProperty("number");
  });

  it("garde deux terminus à des positions différentes", () => {
    const points = ALL.map((p) => (p.ref.type === "terminus" && p.ref.role === "end" ? terminus("end", 9, 9) : p));
    expect(buildDayRoute(dayOf(), mapOf(points)).termini.map((t) => t.roles)).toEqual([["start"], ["end"]]);
  });

  it("compte n + 1 tronçons, même quand départ et retour sont fusionnés", () => {
    const route = buildDayRoute(dayOf(), mapOf(ALL));
    expect(route.legs).toHaveLength(5);
    expect(route.legs[0]?.from).toEqual({ lat: 0, lng: 0 });
    expect(route.legs[4]?.to).toEqual({ lat: 0, lng: 0 });
  });

  it("ne pointille que le dernier tronçon, si et seulement si le segment qui le précède est à pied", () => {
    const walk = buildDayRoute(dayOf("walk"), mapOf(ALL));
    expect(walk.legs.map((leg) => leg.dashed)).toEqual([false, false, false, false, true]);
    for (const mode of ["transit", "car"] as const) {
      expect(buildDayRoute(dayOf(mode), mapOf(ALL)).legs.every((leg) => !leg.dashed)).toBe(true);
    }
  });

  it("omet un terminus sans position et le tronçon qui le touche", () => {
    const route = buildDayRoute(dayOf(), mapOf(ALL.filter((p) => !(p.ref.type === "terminus" && p.ref.role === "end"))));
    expect(route.termini.map((t) => t.roles)).toEqual([["start"]]);
    expect(route.legs).toHaveLength(4);
    expect(route.legs.every((leg) => !leg.dashed)).toBe(true);
  });

  it("n'affiche ni segment, ni temps libre, ni événement du jour", () => {
    const route = buildDayRoute(dayOf(), mapOf([...ALL]));
    expect(route.stops.map((stop) => stop.stopId)).not.toContain("e1");
    expect(route.positions).toHaveLength(5);
  });

  it("ne renvoie rien sans positions", () => {
    expect(buildDayRoute(dayOf(), null)).toEqual({ stops: [], termini: [], legs: [], positions: [] });
  });
});

describe("buildOverview", () => {
  it("un anneau par étape positionnée et un par position de terminus distincte", () => {
    const other: DayMap = { tripId: "t", dayIndex: 2, points: [terminus("start", 0, 0), at("x", 5, 5), terminus("end", 7, 7)] };
    const rings = buildOverview([mapOf(ALL), other]);
    // 4 + 1 étapes ; terminus distincts : (0, 0) et (7, 7).
    expect(rings).toHaveLength(7);
  });
});

describe("offsetCenter (décision 0015 § 4)", () => {
  const target = { lat: 55.95, lng: -3.19 };

  it("inserts nuls ou absents : centre inchangé", () => {
    expect(offsetCenter(target, undefined, 14)).toEqual(target);
    expect(offsetCenter(target, { top: 0, right: 0, bottom: 0, left: 0 }, 14)).toEqual(target);
    expect(offsetCenter(target, { top: 100, right: 30, bottom: 100, left: 30 }, 14)).toEqual(target);
  });

  it("panneau en bas : centre au sud de la cible, même longitude", () => {
    const center = offsetCenter(target, { top: 0, right: 0, bottom: 464, left: 0 }, 14);
    expect(center.lat).toBeLessThan(target.lat);
    expect(center.lng).toBeCloseTo(target.lng, 12);
  });

  it("décale de (bottom − top) / 2 pixels en Web Mercator au zoom courant", () => {
    const zoom = 14;
    const size = 256 * 2 ** zoom;
    const y = (lat: number) => {
      const sin = Math.sin((lat * Math.PI) / 180);
      return (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size;
    };
    const center = offsetCenter(target, { top: 0, right: 0, bottom: 464, left: 0 }, zoom);
    expect(y(center.lat) - y(target.lat)).toBeCloseTo(232, 6);
    const east = offsetCenter(target, { top: 0, right: 0, bottom: 0, left: 100 }, zoom);
    expect(((east.lng - target.lng) / 360) * size).toBeCloseTo(-50, 6);
  });
});

describe("boundsOf", () => {
  it("renvoie la boîte englobante, ou null sans position", () => {
    expect(boundsOf([])).toBeNull();
    expect(boundsOf([{ lat: 1, lng: -2 }, { lat: 3, lng: 4 }])).toEqual({ north: 3, south: 1, east: 4, west: -2 });
  });
});
