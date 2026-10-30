import { describe, expect, it } from "vitest";

import { DaySnapshotSchema, PatchResultSchema, TripSnapshotSchema, type Day, type DaySnapshot, type StopSnapshot, type TripPatch, type TripSnapshot } from "@/contracts";
import type { ConfigurationMoteur } from "@/domain/configuration";
import { deplacerSansRelecture, identifiantDuPoint, pointsDeDeplacement, situerEtapeADeplacer } from "@/domain/deplacement";
import { etapesVerrouilleesModifiees } from "@/domain/verrous";
import { edimbourg } from "@/mocks/edimbourg";

/**
 * Déplacer une étape sans relecture (ticket 947 ; `src/domain/deplacement.ts`) : points d'insertion, réécriture des jours
 * touchés (aucune autre étape ne bouge), R3 rejouée, R10, refus typés. Instantané tiré du voyage simulé d'Édimbourg (durées
 * retirées, comme `TripSnapshotSchema` l'exige) ; aucune donnée Google (noms entre crochets, `placeId` simulés).
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
const NUITS = 5;

const move = (stopId: string, day: number, time: string, baseVersion = 3): TripPatch => ({
  requestId: "00000000-0000-4000-8000-000000000947",
  baseVersion,
  operations: [{ op: "move", stopId, day, time }],
});
const deplacer = (patch: TripPatch, base: TripSnapshot = BASE, versionCourante = 3) =>
  deplacerSansRelecture({ base, versionCourante, patch, configuration: CONFIG, nombreDeNuits: NUITS, modes: ["walk", "transit"] });
const jour = (s: TripSnapshot, n: number): DaySnapshot => s.days.find((d) => d.index === n)!;
const etapes = (d: DaySnapshot): StopSnapshot[] => d.items.flatMap((i) => (i.type === "stop" ? [i.stop] : []));
const avecVerrou = (s: TripSnapshot, id: string): TripSnapshot => ({
  days: s.days.map((d) => ({ ...d, items: d.items.map((i) => (i.type === "stop" && i.stop.id === id ? { ...i, stop: { ...i.stop, locked: true } } : i)) })),
});

describe("déplacer sans relecture : points d'insertion (ticket 947)", () => {
  it("deplacer: le jardin (J2, 13:25 – 15:00) a des points J1 vers 16:15 et J4 vers 15:45 ; aucun dans ses temps libres voisins", () => {
    const points = pointsDeDeplacement(BASE, JARDIN, CONFIG);
    if (!points.ok) throw new Error("refus inattendu");
    expect(points.points).toContainEqual({ id: identifiantDuPoint(1, "16:15"), day: 1, time: "16:15" });
    expect(points.points).toContainEqual({ id: identifiantDuPoint(4, "15:45"), day: 4, time: "15:45" });
    expect(identifiantDuPoint(4, "15:45")).toBe("deplacer-j4-1545");
    // Le temps libre de J2 qui suit le jardin n'est pas un point (l'étape déplacée n'y figure pas comme point, F7).
    expect(points.points.some((p) => p.day === 2)).toBe(false);
    // J3 n'a aucun temps libre, J6 un temps libre trop court.
    expect(points.points.some((p) => p.day === 3 || p.day === 6)).toBe(false);
  });

  it("deplacer: étape verrouillée, engagement, événement : non_deplacable ; inconnue : absente ; repas : aucun point", () => {
    expect(pointsDeDeplacement(avecVerrou(BASE, JARDIN), JARDIN, CONFIG)).toEqual({ ok: false, situation: { type: "non_deplacable", verrouillee: true } });
    expect(situerEtapeADeplacer(BASE, "j1-tattoo")).toEqual({ type: "non_deplacable", verrouillee: true });
    const evenement = jour(BASE, 2).events[0]!;
    expect(pointsDeDeplacement(BASE, evenement.id, CONFIG)).toEqual({ ok: false, situation: { type: "non_deplacable", verrouillee: false } });
    expect(pointsDeDeplacement(BASE, "j9-inconnue", CONFIG)).toEqual({ ok: false, situation: { type: "absente" } });
    expect(pointsDeDeplacement(BASE, "j2-diner", CONFIG)).toEqual({ ok: true, points: [] });
  });

  it("deplacer: aucun point par-dessus un engagement de Day.events", () => {
    const engagement: StopSnapshot = { id: "j4-billet", kind: "activity", name: "[Billet de test]", start: "15:30", end: "17:30", facts: {}, exceptions: [], locked: true, commitment: "ticket" };
    const avecEngagement: TripSnapshot = { days: BASE.days.map((d) => (d.index === 4 ? { ...d, events: [...d.events, engagement] } : d)) };
    const points = pointsDeDeplacement(avecEngagement, JARDIN, CONFIG);
    if (!points.ok) throw new Error("refus inattendu");
    expect(points.points.some((p) => p.day === 4)).toBe(false);
  });
});

describe("déplacer sans relecture : application (ticket 947)", () => {
  it("deplacer: jardin vers J4 à 15:45 : étape 15:45 – 17:20 au J4, temps libre de J2 élargi depuis la fin du déjeuner, aucune autre étape ne bouge", () => {
    const resultat = deplacer(move(JARDIN, 4, "15:45"));
    if (!resultat.ok) throw new Error(resultat.code);
    const { instantane } = resultat;
    expect(TripSnapshotSchema.parse(instantane)).toEqual(instantane);
    const j4 = jour(instantane, 4);
    const jardin = etapes(j4).find((s) => s.id === JARDIN);
    expect(jardin).toMatchObject({ start: "15:45", end: "17:20", locked: false });
    expect(etapes(jour(instantane, 2)).some((s) => s.id === JARDIN)).toBe(false);
    // J2 : temps libre de la fin du déjeuner (13:15) au départ vers le dîner, trajet du dîner gardé.
    const j2 = jour(instantane, 2).items;
    const rangDiner = j2.findIndex((i) => i.type === "stop" && i.stop.id === "j2-diner");
    expect(j2[rangDiner - 1]).toEqual({ type: "segment", segment: { mode: "transit", estimated: true } });
    expect(j2[rangDiner - 2]).toEqual({ type: "free", from: "13:15", to: "18:30" });
    // J4 : trajet vers le jardin (mode du trajet qui suivait le temps libre), le jardin, temps libre jusqu'au départ vers le dîner.
    const rang = j4.items.findIndex((i) => i.type === "stop" && i.stop.id === JARDIN);
    expect(j4.items[rang - 1]).toEqual({ type: "segment", segment: { mode: "walk", estimated: false } });
    expect(j4.items[rang + 1]).toEqual({ type: "free", from: "17:20", to: "18:45" });
    // Aucune autre étape ne bouge (heures et jours identiques), terminus compris.
    for (const d of [2, 4]) {
      const avant = etapes(jour(BASE, d)).filter((s) => s.id !== JARDIN);
      expect(etapes(jour(instantane, d)).filter((s) => s.id !== JARDIN)).toEqual(avant);
      expect(jour(instantane, d).items.filter((i) => i.type === "terminus")).toEqual(jour(BASE, d).items.filter((i) => i.type === "terminus"));
    }
    // Les autres jours sont recopiés tels quels.
    for (const d of [1, 3, 5, 6]) expect(jour(instantane, d)).toEqual(jour(BASE, d));
    expect(PatchResultSchema.parse(resultat.resultat)).toEqual(resultat.resultat);
    expect(resultat.resultat).toMatchObject({ version: 4, touchedDays: [2, 4] });
    expect(resultat.resultat.changes[0]).toEqual({ type: "moved", label: "[Jardin botanique royal]", before: { day: 2, time: "13:25" }, after: { day: 4, time: "15:45" } });
    expect(resultat.resultat.changes.some((c) => c.type === "segment" || c.type === "checklist" || c.type === "removed")).toBe(false);
    expect(resultat.resultat.changes).toContainEqual({ type: "unchanged", label: "[Bonne table de New Town]", time: "19:00" });
  });

  it("deplacer: R3 rejouée : une étape verrouillée ne bouge jamais et n'est jamais retirée", () => {
    const base = avecVerrou(BASE, "j4-arthurs-seat");
    const resultat = deplacer(move(JARDIN, 4, "15:45"), base);
    if (!resultat.ok) throw new Error(resultat.code);
    expect(etapesVerrouilleesModifiees(base.days, resultat.instantane.days)).toEqual([]);
    expect(etapes(jour(resultat.instantane, 4)).find((s) => s.id === "j4-arthurs-seat")).toEqual(etapes(jour(base, 4)).find((s) => s.id === "j4-arthurs-seat"));
    // L'étape verrouillée elle-même : refus locked_stop, rien n'est calculé.
    expect(deplacer(move(JARDIN, 4, "15:45"), avecVerrou(BASE, JARDIN))).toEqual({ ok: false, code: "locked_stop" });
    expect(deplacer(move("j1-tattoo", 4, "15:45"))).toEqual({ ok: false, code: "locked_stop" });
  });

  it("deplacer: R10 d'abord (version_conflict avec currentVersion), puis refus typés : étape inconnue, jour hors voyage, point absent", () => {
    expect(deplacer(move(JARDIN, 4, "15:45", 2))).toEqual({ ok: false, code: "version_conflict", currentVersion: 3 });
    expect(deplacer(move("j9-inconnue", 4, "15:45"))).toEqual({ ok: false, code: "unknown_stop" });
    expect(deplacer(move(JARDIN, 9, "15:45"))).toEqual({ ok: false, code: "out_of_trip" });
    expect(deplacer(move(JARDIN, 4, "16:00"))).toEqual({ ok: false, code: "no_option" });
    expect(deplacer(move(JARDIN, 2, "16:00"))).toEqual({ ok: false, code: "no_option" });
    expect(() => deplacer({ ...move(JARDIN, 4, "15:45"), operations: [{ op: "lock", stopId: JARDIN }] })).toThrow(RangeError);
  });

  it("deplacer: fonction pure : même entrée, même sortie ; la base n'est pas modifiée", () => {
    const copie = structuredClone(BASE);
    expect(deplacer(move(JARDIN, 1, "16:15"))).toEqual(deplacer(move(JARDIN, 1, "16:15")));
    expect(BASE).toEqual(copie);
  });

  it("deplacer: jardin vers J1 à 16:15 : posé entre le château et le dîner, trajet d'arrivée du mode qui suivait le temps libre", () => {
    const resultat = deplacer(move(JARDIN, 1, "16:15"));
    if (!resultat.ok) throw new Error(resultat.code);
    const j1 = jour(resultat.instantane, 1);
    expect(etapes(j1).map((s) => [s.id, s.start])).toEqual([
      ["j1-dejeuner", "12:45"],
      ["j1-chateau", "14:00"],
      [JARDIN, "16:15"],
      ["j1-diner", "18:45"],
      ["j1-tattoo", "21:30"],
    ]);
    expect(resultat.resultat.touchedDays).toEqual([1, 2]);
  });
});
