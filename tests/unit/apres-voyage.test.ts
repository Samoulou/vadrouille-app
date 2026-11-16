// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Day, DayLineItem, Stop } from "@/contracts";
import { localDateAt } from "@/features/voyage/today";
import { accessUntil } from "@/lib/dates";
import { edimbourgDebloque } from "@/mocks/edimbourg";

import { accesApresVoyage, etapesAEvaluer } from "@/domain/apres-voyage";

/**
 * Écran 16 (M8a, ticket 1062 ; décision 0160 § 1.5 point 4 ; spécification M8 § 3.1 point 4, § 3.2 point 1, § 6.3
 * critères 1, 2 et 7) : étapes à évaluer et accès, fonctions pures uniques de l'écran, du serveur et de `mock`.
 */

const stop = (id: string, kind: Stop["kind"], extra: Partial<Stop> = {}): Stop => ({
  id,
  kind,
  name: `[${id}]`,
  start: "10:00",
  facts: {},
  exceptions: [],
  locked: false,
  ...extra,
});
const at = (s: Stop): DayLineItem => ({ type: "stop", stop: s });

const jour = (index: number, items: DayLineItem[], extra: Partial<Day> = {}): Day => ({
  index,
  date: `2026-08-${String(28 + index).padStart(2, "0")}`,
  items,
  events: [],
  generating: false,
  travelMinutes: 0,
  travelBudgetMinutes: 90,
  ...extra,
});

describe("etapesAEvaluer (critère 2)", () => {
  it("activité, repas, événement placé, lieu à soi et adresse découverte ; ni terminus, segment, temps libre, openMeal, changement de ville", () => {
    const days = [
      jour(1, [
        { type: "terminus", role: "start", time: "09:00", label: "[Hôtel]" },
        at(stop("a", "activity", { placeId: "ChIJ-a" })),
        { type: "segment", segment: { mode: "walk", minutes: 10, estimated: false } },
        { type: "free", from: "11:00", to: "12:00" },
        { type: "openMeal", time: "12:30", meal: "lunch" },
        at(stop("m", "meal")),
        at(stop("e", "event", { commitment: "ticket" })),
        at(stop("soi", "activity", { addedBy: "person", placeId: "ChIJ-soi" })),
        at(stop("decouvert", "meal", { addedBy: "discovered" })),
        { type: "transfer", from: "[Rome]", to: "[Florence]", source: "estimated", start: "16:00" },
        { type: "terminus", role: "end", time: "18:00", label: "[Hôtel]" },
      ]),
    ];
    expect(etapesAEvaluer(days)).toEqual([
      { stopId: "a", placeId: "ChIJ-a", kind: "activity", name: "[a]", dayIndex: 1 },
      { stopId: "m", placeId: null, kind: "meal", name: "[m]", dayIndex: 1 },
      { stopId: "e", placeId: null, kind: "event", name: "[e]", dayIndex: 1 },
      { stopId: "soi", placeId: "ChIJ-soi", kind: "activity", name: "[soi]", dayIndex: 1 },
      { stopId: "decouvert", placeId: null, kind: "meal", name: "[decouvert]", dayIndex: 1 },
    ]);
  });

  it("ni événement hors programme (`Day.events`), ni journée en préparation (`generating`) ; ordre des jours gardé", () => {
    const days = [
      jour(1, [at(stop("j1", "activity"))], { events: [stop("hors-programme", "event", { commitment: "ticket" })] }),
      jour(2, [at(stop("j2-prepa", "activity"))], { generating: true }),
      jour(3, [at(stop("j3", "meal"))]),
    ];
    expect(etapesAEvaluer(days).map((etape) => [etape.stopId, etape.dayIndex])).toEqual([
      ["j1", 1],
      ["j3", 3],
    ]);
  });

  it("instantané sans `generating` : une journée sans étape ne donne rien ; un identifiant répété n'est gardé qu'une fois", () => {
    const snapshot = [{ index: 1, items: [at(stop("x", "activity"))] }, { index: 2, items: [] }, { index: 3, items: [at(stop("x", "activity"))] }];
    expect(etapesAEvaluer(snapshot)).toEqual([{ stopId: "x", placeId: null, kind: "activity", name: "[x]", dayIndex: 1 }]);
  });

  it("voyage débloqué d'Édimbourg du jeu simulé : chaque étape de la ligne des jours prêts (J6 en préparation exclu), aucune de `Day.events`", () => {
    const etapes = etapesAEvaluer(edimbourgDebloque.days);
    expect(edimbourgDebloque.days.filter((day) => day.generating).map((day) => day.index)).toEqual([6]);
    const attendues = edimbourgDebloque.days.filter((day) => !day.generating).flatMap((day) => day.items.flatMap((item) => (item.type === "stop" ? [item.stop.id] : [])));
    expect(etapes.map((etape) => etape.stopId)).toEqual(attendues);
    const evenements = new Set(edimbourgDebloque.days.flatMap((day) => day.events.map((event) => event.id)));
    expect(etapes.some((etape) => evenements.has(etape.stopId) && !attendues.includes(etape.stopId))).toBe(false);
  });
});

describe("accesApresVoyage (critères 1 et 7, Édimbourg 2026-08-29 au 2026-09-03, Europe/London)", () => {
  const FIN = "2026-09-03";
  const FIN_ACCES = accessUntil(FIN, 30);
  const acces = (iso: string) => accesApresVoyage(FIN, FIN_ACCES, localDateAt(Date.parse(iso), "Europe/London"));

  it("dernier jour d'accès : 30 jours après le retour", () => {
    expect(FIN_ACCES).toBe("2026-10-03");
  });

  it("2026-09-02 à 23:59 à Londres : notEnded ; 2026-09-03 à 00:00 : open", () => {
    expect(acces("2026-09-02T23:59:00+01:00")).toBe("notEnded");
    expect(acces("2026-09-03T00:00:00+01:00")).toBe("open");
  });

  it("appareil à Zurich : 2026-09-03 à 00:30 à Zurich est encore le 2 à Londres", () => {
    expect(acces("2026-09-03T00:30:00+02:00")).toBe("notEnded");
    expect(acces("2026-09-03T01:30:00+02:00")).toBe("open");
  });

  it("2026-10-03 (dernier jour d'accessUntil) : open ; 2026-10-04 : readOnly", () => {
    expect(acces("2026-10-03T23:59:00+01:00")).toBe("open");
    expect(acces("2026-10-04T00:00:00+01:00")).toBe("readOnly");
  });
});
