// @vitest-environment node
import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { DaySchema, ProposalSchema, TripSchema } from "@/contracts";
import { cleTrajet, PROTOTYPE_ORG_ID, pairesDistinctes, pairesDuProgramme, ProgrammeReduitSchema, type ProgrammeReduit } from "@/prototype/programme-reduit";

import { createPrototypeAdapterReel, type PaireRelecture, type RelecteurTrajets, type SourceProgrammesReels, type TrajetsConserves } from "./prototype";

/**
 * Temps de trajet conservés (décision 0092 § 4, « Relecture ») : l'adaptateur des programmes réels prend les temps lus
 * avec le programme, n'appelle le relecteur (Routes) que pour les paires manquantes, et rend la page sans ces temps si
 * Google refuse, jamais l'état d'erreur ni une durée inventée.
 */

const TRIP_ID = "proto_test_20261012_1";
const ctx = { organizationId: PROTOTYPE_ORG_ID, userId: "user_test", role: "owner" as const };
const DOSSIER = realpathSync(join(process.cwd(), "prototype", "programmes-test"));
const CONSERVE = 13;
const RELU = 4;

function programme(): ProgrammeReduit {
  return ProgrammeReduitSchema.parse(JSON.parse(readFileSync(join(DOSSIER, `${TRIP_ID}.json`), "utf8")));
}

function source(trajets: TrajetsConserves): SourceProgrammesReels {
  const lu = () => ({ programme: programme(), trajets });
  return { lister: async () => [lu()], lire: async (id) => (id === TRIP_ID ? lu() : null) };
}

/** Temps conservés de toutes les paires du programme (tous modes), sauf celles que `garder` écarte. */
function conserves(garder: (paire: PaireRelecture) => boolean = () => true): Map<string, number> {
  return new Map(pairesDistinctes(pairesDuProgramme(programme())).filter(garder).map((paire) => [cleTrajet(paire), CONSERVE]));
}

/** Relecteur double : appels notés ; réponse fixe, refus ou exception. */
function relecteur(reponse: "ok" | "quota_reached" | "unavailable" | "leve" = "ok") {
  const appels: PaireRelecture[][] = [];
  const relireJournee = vi.fn<RelecteurTrajets["relireJournee"]>(async (paires) => {
    appels.push([...paires]);
    if (reponse === "leve") throw new Error("SENTINELLE_PANNE");
    if (reponse !== "ok") return { ok: false, raison: reponse };
    return { ok: true, minutes: paires.map(() => RELU) };
  });
  return { relireJournee, appels };
}

const segments = (jour: { items: { type: string; segment?: { minutes: number | null } }[] }) =>
  jour.items.flatMap((item) => (item.type === "segment" && item.segment ? [item.segment.minutes] : []));

describe("p0: aucun appel Google quand tous les temps sont conservés (0092 § 4 point 2)", () => {
  it("voyage, journée et propositions rendus avec les temps conservés ; relecteur jamais appelé", async () => {
    const r = relecteur();
    const adapter = createPrototypeAdapterReel({ programmes: source(conserves()), relecteurs: { trajets: r } });
    const trip = await adapter.getTrip(ctx, TRIP_ID);
    TripSchema.parse(trip);
    for (const jour of trip!.days) {
      const minutes = segments(jour);
      expect(minutes.length).toBeGreaterThan(0);
      expect(minutes.every((m) => m === CONSERVE)).toBe(true);
      expect(jour.travelMinutes).toBe(CONSERVE * minutes.length);
    }
    const day = await adapter.getDay(ctx, TRIP_ID, 2);
    DaySchema.parse(day);
    expect(segments(day!).every((m) => m === CONSERVE)).toBe(true);
    const proposals = await adapter.listProposals(ctx, TRIP_ID);
    expect(proposals.length).toBeGreaterThan(0);
    for (const proposal of proposals) {
      ProposalSchema.parse(proposal);
      expect(proposal.travelFromPrevious).toEqual({ mode: expect.any(String), minutes: CONSERVE, estimated: false });
    }
    expect(r.relireJournee).not.toHaveBeenCalled();
  });
});

describe("p0: seules les paires manquantes sont relues (0092 § 4 point 2)", () => {
  it("le relecteur reçoit exactement les paires absentes des temps conservés, journée par journée", async () => {
    const p = programme();
    const premiereDuJour1 = pairesDuProgramme(p).jours.get(1)![0]!;
    const manquante = cleTrajet(premiereDuJour1);
    const r = relecteur();
    const adapter = createPrototypeAdapterReel({ programmes: source(conserves((paire) => cleTrajet(paire) !== manquante)), relecteurs: { trajets: r } });
    const jour = await adapter.getDay(ctx, TRIP_ID, 1);
    const attendues = pairesDuProgramme(p).jours.get(1)!.filter((paire) => cleTrajet(paire!) === manquante);
    expect(r.appels).toEqual([attendues]);
    const minutes = segments(jour!);
    expect(minutes.map((m, rang) => (pairesDuProgramme(p).jours.get(1)![rang] && cleTrajet(pairesDuProgramme(p).jours.get(1)![rang]!) === manquante ? m === RELU : m === CONSERVE))).not.toContain(false);
    expect(jour!.travelMinutes).toBe(minutes.reduce<number>((total, m) => total + (m ?? 0), 0));
    // Jour 2 : tout est conservé, aucun appel de plus.
    await adapter.getDay(ctx, TRIP_ID, 2);
    expect(r.appels).toHaveLength(1);
  });

  it("propositions : seule la paire manquante est relue", async () => {
    const p = programme();
    const [rang, paire] = [...pairesDuProgramme(p).propositions].find(([, candidate]) => candidate !== null)!;
    const r = relecteur();
    const adapter = createPrototypeAdapterReel({ programmes: source(conserves((autre) => cleTrajet(autre) !== cleTrajet(paire!))), relecteurs: { trajets: r } });
    const proposals = await adapter.listProposals(ctx, TRIP_ID);
    const relues = r.appels.flat();
    expect(relues.length).toBeGreaterThan(0);
    expect(relues.every((demandee) => cleTrajet(demandee) === cleTrajet(paire!))).toBe(true);
    expect(proposals[rang]?.travelFromPrevious?.minutes).toBe(RELU);
  });
});

describe("p0: Google refuse ou échoue : page rendue sans les temps manquants (0092 § 4 point 3)", () => {
  it.each(["quota_reached", "unavailable", "leve"] as const)("%s : temps conservés affichés, trajet manquant sans durée, journée sans total, aucune erreur", async (reponse) => {
    const p = programme();
    const manquante = cleTrajet(pairesDuProgramme(p).jours.get(1)![0]!);
    const r = relecteur(reponse);
    const adapter = createPrototypeAdapterReel({ programmes: source(conserves((paire) => cleTrajet(paire) !== manquante)), relecteurs: { trajets: r } });
    const trip = await adapter.getTrip(ctx, TRIP_ID);
    TripSchema.parse(trip);
    const [jour1, jour2] = trip!.days;
    const minutes1 = segments(jour1!);
    expect(minutes1[0]).toBeNull();
    expect(minutes1.filter((m) => m === null)).toHaveLength(minutes1.filter((_, i) => cleTrajet(pairesDuProgramme(p).jours.get(1)![i]!) === manquante).length);
    expect(minutes1.filter((m) => m !== null).every((m) => m === CONSERVE)).toBe(true);
    expect(jour1!.travelMinutes).toBeNull();
    // Journée entièrement conservée : intacte, avec son total.
    expect(jour2!.travelMinutes).toBe(CONSERVE * segments(jour2!).length);
    // Aucune durée inventée : ni la valeur relue (refusée) ni zéro.
    expect(minutes1).not.toContain(RELU);
    expect(minutes1).not.toContain(0);
  });

  it("propositions sans trajet relu : sans travelFromPrevious ni detour ; les autres gardent leur temps conservé", async () => {
    const p = programme();
    const [rang, paire] = [...pairesDuProgramme(p).propositions].find(([, candidate]) => candidate !== null)!;
    const adapter = createPrototypeAdapterReel({
      programmes: source(conserves((autre) => cleTrajet(autre) !== cleTrajet(paire!))),
      relecteurs: { trajets: relecteur("quota_reached") },
    });
    const proposals = await adapter.listProposals(ctx, TRIP_ID);
    expect(proposals[rang]?.travelFromPrevious).toBeUndefined();
    expect(proposals[rang]?.detour).toBeUndefined();
    const autres = proposals.filter((_, i) => i !== rang && pairesDuProgramme(p).propositions.get(i) && cleTrajet(pairesDuProgramme(p).propositions.get(i)!) !== cleTrajet(paire!));
    for (const proposal of autres) expect(proposal.travelFromPrevious?.minutes).toBe(CONSERVE);
  });
});
