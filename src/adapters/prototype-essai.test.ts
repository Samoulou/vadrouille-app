// @vitest-environment node
import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PreviewSlotsSchema, TripSchema, type Day, type DayLineItem, type Stop } from "@/contracts";
import { cleTrajet, pairesDuProgramme, PROTOTYPE_ORG_ID, ProgrammeReduitSchema, type ProgrammeReduit } from "@/prototype/programme-reduit";

import { createPrototypeAdapter, type LecteurDeblocage, type PaireRelecture, type SourceProgrammes } from "./prototype";
import { JOURS_APERCU, propositionsDesJours, selectionApercu, voyageNonDebloque } from "./prototype-parcours";

/**
 * Spécification E2E-essai, lot 1 (ticket 691 ; décision D4) : un programme d'essai sans propositions enregistrées (forme
 * écrite par `p0Run`) suit le parcours de l'app : non débloqué, premières propositions tirées du programme à la lecture,
 * seules leurs journées lisibles ; après le déblocage simulé, toutes les journées et la suite du tri.
 */

const ESSAI_ID = "proto_essai_20271010_1";
const DOSSIER = realpathSync(join(process.cwd(), "prototype", "programmes-essai"));
const ctx = { organizationId: PROTOTYPE_ORG_ID, userId: "user_test", role: "owner" as const };

function programmeEssai(): ProgrammeReduit {
  return ProgrammeReduitSchema.parse(JSON.parse(readFileSync(join(DOSSIER, `${ESSAI_ID}.json`), "utf8")));
}

function source(programme: ProgrammeReduit = programmeEssai()): SourceProgrammes {
  return { ids: async () => [programme.trip.id], lire: async (id) => (id === programme.trip.id ? structuredClone(programme) : null) };
}

function relecteur(minutes = 7) {
  const appels: PaireRelecture[][] = [];
  return {
    appels,
    trajets: {
      async relireJournee(paires: readonly PaireRelecture[]) {
        appels.push([...paires]);
        return { ok: true as const, minutes: paires.map(() => minutes) };
      },
    },
  };
}

function adaptateur(deblocage?: LecteurDeblocage, programme?: ProgrammeReduit, minutes?: number) {
  const r = relecteur(minutes);
  return { r, adapter: createPrototypeAdapter({ programmes: source(programme), relecteurs: { trajets: r.trajets }, deblocage }) };
}

const etape = (id: string, kind: Stop["kind"] = "activity", extra: Partial<Stop> = {}): DayLineItem => ({
  type: "stop",
  stop: { id, kind, name: `[${id}]`, start: "10:00", facts: {}, exceptions: [], locked: false, ...extra },
});
const trajet = (minutes: number | null): DayLineItem => ({ type: "segment", segment: { mode: "walk", minutes, estimated: false } });

function jour(index: number, items: DayLineItem[]): Day {
  return { index, date: `2027-05-${String(9 + index).padStart(2, "0")}`, items, events: [], generating: false, travelMinutes: null, travelBudgetMinutes: 120 };
}

describe("essai: sélection des premières propositions (fonctions pures)", () => {
  it("8 étapes au plus, la première journée puis le début de la deuxième, dans l'ordre du programme ; jamais la troisième", () => {
    const jours = [
      jour(2, [etape("b1"), etape("b2"), etape("b3"), etape("b4"), etape("b5")]),
      jour(1, [etape("a1"), etape("a2"), etape("a3"), etape("a4"), etape("a5")]),
      jour(3, [etape("c1")]),
    ];
    const selection = selectionApercu(jours);
    expect(selection.etapes).toEqual(["a1", "a2", "a3", "a4", "a5", "b1", "b2", "b3"]);
    expect([...selection.jours].sort()).toEqual([1, 2]);
    expect(JOURS_APERCU).toBe(2);
    expect(selectionApercu([jour(1, [etape("a1")]), jour(2, []), jour(3, [etape("c1")])]).etapes).toEqual(["a1"]);
  });

  it("un engagement saisi n'est jamais une proposition ; une journée sans étape reste lisible si c'est la première", () => {
    const engagement = etape("billet", "activity", { commitment: "ticket", locked: true });
    expect(selectionApercu([jour(1, [engagement, etape("a1")])]).etapes).toEqual(["a1"]);
    expect([...selectionApercu([jour(1, [])]).jours]).toEqual([1]);
  });

  it("propositions tirées des étapes : voisins de la ligne du jour, trajet relu ; détour au-delà de 20 min justifié par la raison", () => {
    const items: DayLineItem[] = [
      { type: "terminus", role: "start", time: "09:00", label: "[Logement]" },
      trajet(10),
      etape("a1"),
      trajet(25),
      etape("a2", "meal", { reason: "Raison maison." }),
      trajet(30),
      etape("a3"),
      { type: "openMeal", time: "19:00", meal: "dinner" },
    ];
    const [p1, p2, p3] = propositionsDesJours([jour(1, items)], () => true);
    expect(p1).toMatchObject({ id: "a1", kind: "activity", day: 1, neighbours: { before: { type: "terminus", role: "start" }, after: { type: "stop", stopId: "a2" } } });
    expect(p1?.travelFromPrevious).toEqual({ mode: "walk", minutes: 10, estimated: false });
    expect(p2).toMatchObject({ id: "a2", kind: "meal", category: "restaurant", detour: "Raison maison." });
    expect(p2?.travelFromPrevious?.minutes).toBe(25);
    // Sans raison, aucun détour inventé : le trajet de plus de 20 min n'est pas montré.
    expect(p3?.travelFromPrevious).toBeUndefined();
    expect(p3?.detour).toBeUndefined();
    expect(p3?.neighbours.after).toEqual({ type: "meal", meal: "dinner" });
    // Durée indisponible : aucun trajet, jamais 0.
    expect(propositionsDesJours([jour(1, [trajet(null), etape("x")])], () => true)[0]?.travelFromPrevious).toBeUndefined();
  });

  it("voyage non débloqué : journées données, `unlocked: false`, lignes « À faire » d'une journée retirée enlevées", () => {
    const j1 = jour(1, [etape("a1")]);
    const trip = TripSchema.parse({
      id: "proto_x_1",
      organizationId: PROTOTYPE_ORG_ID,
      destination: "Rome",
      destinationColor: "ocre",
      start: "2027-05-10",
      end: "2027-05-11",
      timeZone: "Europe/Rome",
      travellers: { adults: 2, children: 0 },
      days: [j1, jour(2, [etape("b1")])],
      checklist: [
        { id: "c1", label: "Avant", when: { type: "beforeDeparture" }, done: false, sponsored: false },
        { id: "c2", label: "Jour 2", when: { type: "tripDay", day: 2 }, done: false, sponsored: false },
        { id: "c3", label: "Étape b1", when: { type: "beforeDeparture" }, done: false, sponsored: false, stopId: "b1" },
      ],
      unlocked: true,
    });
    const vue = voyageNonDebloque(trip, [j1]);
    expect(vue.unlocked).toBe(false);
    expect(vue.days.map((d) => d.index)).toEqual([1]);
    expect(vue.checklist.map((c) => c.id)).toEqual(["c1"]);
  });
});

describe("essai: adaptateur prototype sur un programme sans propositions", () => {
  it("avant le déblocage : non débloqué, aperçu tiré du programme, journées 1 et 2 seulement, journée 3 introuvable", async () => {
    const { adapter, r } = adaptateur();
    const trip = await adapter.getTrip(ctx, ESSAI_ID);
    expect(trip?.unlocked).toBe(false);
    expect(trip?.days.map((d) => d.index)).toEqual([1, 2]);
    const cases = PreviewSlotsSchema.parse(await adapter.listPreviewSlots(ctx, ESSAI_ID));
    expect(cases.map((c) => (c.type === "proposal" ? c.proposal.id : c.type))).toEqual(["j1-a1", "j1-dejeuner", "j1-a2", "j1-diner", "j2-a1", "j2-dejeuner"]);
    expect((await adapter.listProposals(ctx, ESSAI_ID)).map((p) => p.id)).toEqual(cases.map((c) => (c.type === "proposal" ? c.proposal.id : "")));
    expect(await adapter.getDay(ctx, ESSAI_ID, 3)).toBeNull();
    expect(await adapter.getDayMap(ctx, ESSAI_ID, 3)).toBeNull();
    expect((await adapter.getTripMap(ctx, ESSAI_ID)).map((m) => m.dayIndex)).toEqual([1, 2]);
    const [resume] = await adapter.listTrips(ctx);
    // Compteurs de « Mes voyages » sur le programme entier (décision 0124 § 6) : trois journées annoncées.
    expect(resume).toMatchObject({ id: ESSAI_ID, unlocked: false, dayCount: 3 });
    expect(r.appels.length).toBeGreaterThan(0);
  });

  /** Clés des paires d'une journée du programme (lieux manquants exclus), dans l'ordre de la ligne. */
  const clesDuJour = (index: number): string[] =>
    (pairesDuProgramme(programmeEssai()).jours.get(index) ?? []).flatMap((paire) => (paire ? [cleTrajet(paire)] : []));

  it.each([
    ["getTrip", (a: ReturnType<typeof adaptateur>["adapter"]) => a.getTrip(ctx, ESSAI_ID)],
    ["listPreviewSlots", (a: ReturnType<typeof adaptateur>["adapter"]) => a.listPreviewSlots(ctx, ESSAI_ID)],
    ["listProposals", (a: ReturnType<typeof adaptateur>["adapter"]) => a.listProposals(ctx, ESSAI_ID)],
  ])("avant le déblocage, %s relit exactement les paires des journées 1 et 2, une requête par journée, aucune de la journée 3", async (_nom, lire) => {
    // Les lieux de la journée 3 sont propres à elle (SENTINELLE_PLACE_ID_8 à 11) : une de ses paires relue se verrait.
    const j3 = new Set(clesDuJour(3));
    expect(j3.size).toBeGreaterThan(0);
    for (const cle of [...clesDuJour(1), ...clesDuJour(2)]) expect(j3.has(cle)).toBe(false);
    const { adapter, r } = adaptateur();
    await lire(adapter);
    expect(r.appels.map((appel) => appel.map(cleTrajet))).toEqual([clesDuJour(1), clesDuJour(2)]);
  });

  it("après le déblocage, getTrip relit les trois journées, une requête chacune", async () => {
    const { adapter, r } = adaptateur(async () => true);
    await adapter.getTrip(ctx, ESSAI_ID);
    expect(r.appels.map((appel) => appel.map(cleTrajet))).toEqual([clesDuJour(1), clesDuJour(2), clesDuJour(3)]);
  });

  it("indicateur du voyage d'essai (`isTrialTrip`) : vrai pour le programme sans propositions, faux hors organisation ou inconnu", async () => {
    const { adapter } = adaptateur();
    expect(await adapter.isTrialTrip?.(ctx, ESSAI_ID)).toBe(true);
    expect(await adapter.isTrialTrip?.({ ...ctx, organizationId: "org_autre" }, ESSAI_ID)).toBe(false);
    expect(await adapter.isTrialTrip?.(ctx, "proto_inconnu_1")).toBe(false);
  });

  it("après le déblocage : toutes les journées, aperçu vide, suite du tri avec les étapes hors des premières propositions", async () => {
    const { adapter } = adaptateur(async (_ctx, tripId) => tripId === ESSAI_ID);
    const trip = await adapter.getTrip(ctx, ESSAI_ID);
    expect(trip?.unlocked).toBe(true);
    expect(trip?.days.map((d) => d.index)).toEqual([1, 2, 3]);
    expect(await adapter.listPreviewSlots(ctx, ESSAI_ID)).toEqual([]);
    expect((await adapter.listProposals(ctx, ESSAI_ID)).map((p) => p.id)).toEqual(["j3-a1", "j3-dejeuner", "j3-a2", "j3-diner"]);
    expect((await adapter.getDay(ctx, ESSAI_ID, 3))?.index).toBe(3);
    expect((await adapter.listTrips(ctx))[0]).toMatchObject({ unlocked: true });
  });

  it("un lecteur du déblocage qui lève vaut « non débloqué » ; autre organisation : rien", async () => {
    const { adapter } = adaptateur(async () => {
      throw new Error("cookie illisible");
    });
    expect((await adapter.getTrip(ctx, ESSAI_ID))?.unlocked).toBe(false);
    expect(await adapter.getTrip({ ...ctx, organizationId: "org_autre" }, ESSAI_ID)).toBeNull();
    expect(await adapter.listPreviewSlots({ ...ctx, organizationId: "org_autre" }, ESSAI_ID)).toEqual([]);
  });

  it("un programme qui porte ses propositions (programmes de test) est servi comme avant, débloqué", async () => {
    const test = ProgrammeReduitSchema.parse(
      JSON.parse(readFileSync(join(process.cwd(), "prototype", "programmes-test", "proto_test_20261012_1.json"), "utf8")),
    );
    const { adapter } = adaptateur(async () => false, test);
    const trip = await adapter.getTrip(ctx, test.trip.id);
    expect(trip?.unlocked).toBe(true);
    // Seul prédicat du parcours (décision 0124 § 4) : pas un voyage d'essai, l'écran garde ses questions.
    expect(await adapter.isTrialTrip?.(ctx, test.trip.id)).toBe(false);
    expect(await adapter.listPreviewSlots(ctx, test.trip.id)).toEqual([]);
    expect((await adapter.listProposals(ctx, test.trip.id)).length).toBe(test.proposals.length);
  });
});
