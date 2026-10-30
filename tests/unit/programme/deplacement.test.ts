// @vitest-environment node
import { describe, expect, it } from "vitest";

import { DaySnapshotSchema, TripSnapshotSchema, type Day, type DaySnapshot, type StopSnapshot, type TripSnapshot } from "@/contracts";
import type { ConfigurationMoteur } from "@/domain/configuration";
import { memePoint } from "@/domain/relectures";
import { edimbourg } from "@/mocks/edimbourg";
import {
  changementsDuRejeu,
  demandeDuDeplacement,
  identifiantDuPoint,
  patchDuDeplacement,
  pointsDeDeplacement,
  situerEtapeADeplacer,
} from "@/server/versions/deplacement";
import { formeAdmise } from "@/server/versions/retouches";

/**
 * Déplacer une étape sur `api` (ticket 947 ; `src/server/versions/deplacement.ts` ; décision 0153, PR en cours) : fonctions
 * pures — points d'insertion proposés, demande de relectures, patch `[move]` (forme admise), « Ce qui change » d'un rejeu. Le
 * moteur (`appliquerPatch`, cas `move`), la relecture et l'écriture sont éprouvés sous `tests/db/deplacement.test.ts`.
 * Instantané tiré du voyage simulé d'Édimbourg (durées retirées, comme `TripSnapshotSchema` l'exige) ; aucune donnée Google
 * (noms entre crochets, `placeId` simulés).
 */

const CONFIG: ConfigurationMoteur = {
  schema: 1,
  budgetTrajetParRythme: { relaxed: 60, balanced: 90, intense: 150 },
  activitesParRythme: { relaxed: 2, balanced: 3, intense: 4 },
  tempsLibreMinParRythme: { relaxed: 120, balanced: 60, intense: 30 },
  fenetreJour: { debut: "09:00", fin: "22:30" },
  repas: { lunch: { auPlusTot: "12:00", auPlusTard: "14:00" }, dinner: { auPlusTot: "18:30", auPlusTard: "20:45" } },
  debutSoiree: "20:30",
  dureesParDefaut: { activity: 90, lunch: 75, dinner: 90, evening: 90 },
  margeMinutes: 5,
  seuilTempsLibreMinutes: 30,
  changementDeVille: {
    activitesParRythme: { relaxed: 1, balanced: 2, intense: 2 },
    departEstime: { heureParDefaut: "10:00", limite: "18:00", arrondiMinutes: 15 },
    creneauSansDureeMinutes: 180,
    dureeEstimeeMinutes: { min: 20, max: 600 },
    margesMinutes: { avantDepart: { ticket: 45, flight: 120, estimated: 30 }, apresArrivee: { ticket: 30, flight: 60, estimated: 30 } },
    long: { seuilMinutes: 240, activitesMax: 1 },
  },
};

/** Jour simulé en jour stocké : sans durées, sans mesure ni budget, sans date de contrôle ni `toConfirm` (calculés à la lecture). */
function versInstantane(day: Day): DaySnapshot {
  const sansDate = <T extends { verifiedAt?: string }>(valeur: T): Partial<T> => {
    const copie: Partial<T> = { ...valeur };
    delete copie.verifiedAt;
    return copie;
  };
  const stocke = <T extends { verifiedAt?: string; exceptions: readonly string[] }>(stop: T) => ({ ...sansDate(stop), exceptions: stop.exceptions.filter((e) => e !== "toConfirm") });
  return DaySnapshotSchema.parse({
    index: day.index,
    date: day.date,
    items: day.items.map((item) =>
      item.type === "segment"
        ? { type: "segment", segment: { mode: item.segment.mode, estimated: item.segment.estimated } }
        : item.type === "stop"
          ? { type: "stop", stop: stocke(item.stop) }
          : item,
    ),
    events: day.events.map(stocke),
    travelBudgetMinutes: day.travelBudgetMinutes,
    ...(day.surprise === undefined ? {} : { surprise: sansDate(day.surprise) }),
    ...(day.theme === undefined ? {} : { theme: day.theme }),
  });
}

const BASE: TripSnapshot = TripSnapshotSchema.parse({ days: edimbourg.days.map(versInstantane) });
const JARDIN = "j2-jardin-botanique";
const jour = (s: TripSnapshot, n: number): DaySnapshot => s.days.find((d) => d.index === n)!;
const avecVerrou = (s: TripSnapshot, id: string): TripSnapshot => ({
  days: s.days.map((d) => ({ ...d, items: d.items.map((i) => (i.type === "stop" && i.stop.id === id ? { ...i, stop: { ...i.stop, locked: true } } : i)) })),
});
const jardin = (): StopSnapshot => {
  const situee = situerEtapeADeplacer(BASE, JARDIN);
  if (situee.type !== "etape") throw new Error("jardin absent");
  return situee.stop;
};

describe("déplacer sur api : points d'insertion proposés (ticket 947)", () => {
  it("deplacer: le jardin (J2, 13:25 – 15:00) a des points J1 vers 16:20 et J4 vers 15:50 ; aucun dans ses temps libres voisins", () => {
    const points = pointsDeDeplacement(BASE, JARDIN, CONFIG);
    if (!points.ok) throw new Error("refus inattendu");
    expect(points.points).toContainEqual({ id: identifiantDuPoint(1, "16:20"), day: 1, time: "16:20" });
    expect(points.points).toContainEqual({ id: identifiantDuPoint(4, "15:50"), day: 4, time: "15:50" });
    expect(identifiantDuPoint(4, "15:50")).toBe("deplacer-j4-1550");
    // Le temps libre de J2 qui suit le jardin n'est pas un point (l'étape déplacée n'y figure pas comme point, F7).
    expect(points.points.some((p) => p.day === 2)).toBe(false);
    // J3 n'a aucun temps libre, J6 un temps libre trop court.
    expect(points.points.some((p) => p.day === 3 || p.day === 6)).toBe(false);
  });

  it("deplacer: étape verrouillée, engagement, événement : non_deplacable ; inconnue : absente ; repas : aucun point", () => {
    expect(pointsDeDeplacement(avecVerrou(BASE, JARDIN), JARDIN, CONFIG)).toEqual({ ok: false, situation: { type: "non_deplacable" } });
    expect(situerEtapeADeplacer(BASE, "j1-tattoo")).toEqual({ type: "non_deplacable" });
    const evenement = jour(BASE, 2).events[0]!;
    expect(pointsDeDeplacement(BASE, evenement.id, CONFIG)).toEqual({ ok: false, situation: { type: "non_deplacable" } });
    expect(pointsDeDeplacement(BASE, "j9-inconnue", CONFIG)).toEqual({ ok: false, situation: { type: "absente" } });
    expect(pointsDeDeplacement(BASE, "j2-diner", CONFIG)).toEqual({ ok: true, points: [] });
  });
});

describe("déplacer sur api : patch et relecture (ticket 947)", () => {
  it("deplacer: patch [move] sur la version de base, forme admise (0147 § 11)", () => {
    const patch = patchDuDeplacement("00000000-0000-4000-8000-000000000947", 3, JARDIN, { day: 4, time: "15:50" });
    expect(patch).toEqual({ requestId: "00000000-0000-4000-8000-000000000947", baseVersion: 3, operations: [{ op: "move", stopId: JARDIN, day: 4, time: "15:50" }] });
    expect(formeAdmise(patch)).toBe(true);
  });

  it("deplacer: la demande de relectures couvre les trajets du jardin entre ses nouveaux voisins du J4 et ceux du J2 sans lui", () => {
    const stop = jardin();
    const demande = demandeDuDeplacement({ snapshot: BASE, nuits: 5, modes: ["walk", "transit"] }, stop, { id: "deplacer-j4-1550", day: 4, time: "15:50" });
    const lieu = stop.placeId!;
    const versJardin = demande.trajets.filter((t) => memePoint(t.vers, { lieu }));
    const depuisJardin = demande.trajets.filter((t) => memePoint(t.depuis, { lieu }));
    expect(versJardin.length).toBeGreaterThan(0);
    expect(depuisJardin.length).toBeGreaterThan(0);
    // Le lieu du jardin est relu à la date du J4 (plages), et toujours à celle du J2 (jour de base).
    expect(demande.lieux.find((l) => l.placeId === lieu)?.dates).toEqual(expect.arrayContaining([jour(BASE, 4).date, jour(BASE, 2).date]));
    // Le J2 sans le jardin : le dernier lieu avant lui (Dean Village ; le déjeuner et le dîner n'ont pas de lieu) va
    // directement au logement du soir.
    expect(demande.trajets.some((t) => memePoint(t.depuis, { lieu: "mock_place_dean_village" }) && "logement" in t.vers)).toBe(true);
  });

  it("deplacer: « Ce qui change » d'un rejeu : le déplacement d'abord, puis les autres étapes décalées ; jours touchés triés", () => {
    const stop = jardin();
    const apres: TripSnapshot = {
      days: BASE.days.map((d) => {
        if (d.index === 2) return { ...d, items: d.items.filter((i) => !(i.type === "stop" && i.stop.id === JARDIN)) };
        if (d.index !== 4) return d;
        const items = d.items.map((i) => (i.type === "stop" && i.stop.id === "j4-diner" ? { ...i, stop: { ...i.stop, start: "19:30" } } : i));
        return { ...d, items: [...items, { type: "stop" as const, stop: { ...stop, start: "15:50" } }] };
      }),
    };
    const { touchedDays, changes } = changementsDuRejeu(BASE, apres, JARDIN, []);
    expect(touchedDays).toEqual([2, 4]);
    expect(changes[0]).toEqual({ type: "moved", label: stop.name, before: { day: 2, time: "13:25" }, after: { day: 4, time: "15:50" } });
    expect(changes).toContainEqual(expect.objectContaining({ type: "moved", after: { day: 4, time: "19:30" } }));
    expect(changes).toHaveLength(2);
  });
});
