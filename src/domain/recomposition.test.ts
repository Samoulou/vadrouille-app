// @vitest-environment node
import { describe, expect, it } from "vitest";

import { DaySnapshotSchema, ProposalRecordSchema, type DaySnapshot, type ProposalRecord } from "@/contracts";
import type { ConfigurationMoteur } from "@/domain/configuration";
import {
  demandeDeRelectures,
  optionsDesRepas,
  pointAvantProposition,
  pointsDesSegments,
  recomposerJour,
  recomposerProposition,
  type DateDeVerification,
} from "@/domain/recomposition";
import { INCONNU, memePoint, type ModeTrajet, type Point, type Relectures } from "@/domain/relectures";

/**
 * Assemblage pur de B6a (spécification B6, B6-TL-2 (b) ; décision 0086 § 1.2) : un `Day` et une `Proposal`
 * recomposés depuis le stocké et des relectures en mémoire. Doubles à valeurs sentinelles (`test_place_*`, durées
 * 7, 11, 13 min), jamais tirés d'une réponse réelle.
 */

const CONFIG: ConfigurationMoteur = {
  schema: 1,
  budgetTrajetParRythme: { relaxed: 60, balanced: 90, intense: 150 },
  activitesParRythme: { relaxed: 2, balanced: 3, intense: 4 },
  tempsLibreMinParRythme: { relaxed: 120, balanced: 60, intense: 30 },
  fenetreJour: { debut: "09:00", fin: "23:00" },
  repas: { lunch: { auPlusTot: "12:00", auPlusTard: "14:00" }, dinner: { auPlusTot: "18:30", auPlusTard: "20:45" } },
  debutSoiree: "20:30",
  dureesParDefaut: { activity: 90, lunch: 75, dinner: 90, evening: 90 },
  margeMinutes: 5,
  seuilTempsLibreMinutes: 30,
};

type Item = DaySnapshot["items"][number];
const term = (role: "start" | "end", time: string): Item => ({ type: "terminus", role, time, label: "[Hôtel de test]" });
const seg = (mode: ModeTrajet, estimated = false): Item => ({ type: "segment", segment: { mode, estimated } });
const etape = (id: string, start: string, end: string, placeId?: string, exceptions: ("toReserve" | "unconfirmed")[] = [], cout: number | undefined = 10): Item => ({
  type: "stop",
  stop: {
    id,
    kind: "activity",
    ...(placeId === undefined ? {} : { placeId }),
    name: "[Étape de test]",
    start,
    end,
    facts: cout === undefined ? {} : { costPerPerson: cout },
    exceptions,
    locked: false,
  },
});
const jour = (index: number, items: Item[]): DaySnapshot =>
  DaySnapshotSchema.parse({ index, date: `2027-05-0${index}`, items, events: [], travelBudgetMinutes: 90 });

const A = "test_place_a";
const B = "test_place_b";
const C = "test_place_c";

/** Relectures en mémoire : durées par (lieu ou nuit, lieu ou nuit, mode) ; plages inconnues pour `inconnus`. */
function relectures(durees: [Point, Point, ModeTrajet, number][], inconnus: string[] = []): Relectures {
  return {
    validite: () => "valide",
    plages: (placeId) => (inconnus.includes(placeId) ? INCONNU : [{ debut: 0, fin: 2880 }]),
    duree(depuis, vers, mode) {
      const trouvee = durees.find(([d, v, m]) => memePoint(d, depuis) && memePoint(v, vers) && m === mode);
      return trouvee === undefined ? INCONNU : { minutes: trouvee[3], estimee: false };
    },
  };
}

const sansDate: DateDeVerification = () => undefined;
const L0: Point = { logement: 0 };
const L1: Point = { logement: 1 };

describe("recomposition: points des segments (B6-PO-4)", () => {
  it("dernier point avec lieu avant, premier après ; logements aux bouts (J1 : nuit 0 au départ et à l'arrivée) ; une étape sans lieu est sautée", () => {
    const j = jour(1, [term("start", "09:00"), seg("walk"), etape("a", "10:00", "11:00", A), seg("transit"), etape("x", "11:30", "12:00"), seg("walk"), etape("b", "13:00", "14:00", B), seg("car"), term("end", "18:00")]);
    const couples = pointsDesSegments(j, 2);
    expect(couples.get(1)).toEqual({ depuis: L0, vers: { lieu: A } });
    expect(couples.get(3)).toEqual({ depuis: { lieu: A }, vers: { lieu: B } });
    expect(couples.get(5)).toEqual({ depuis: { lieu: A }, vers: { lieu: B } });
    expect(couples.get(7)).toEqual({ depuis: { lieu: B }, vers: L0 });
  });

  it("dernier jour : arrivée au logement de la dernière nuit", () => {
    const j = jour(3, [term("start", "09:00"), seg("walk"), etape("a", "10:00", "11:00", A), seg("walk"), term("end", "18:00")]);
    const couples = pointsDesSegments(j, 2);
    expect(couples.get(1)).toEqual({ depuis: L1, vers: { lieu: A } });
    expect(couples.get(3)).toEqual({ depuis: { lieu: A }, vers: L1 });
  });

  it("point avant une proposition : dernier lieu qui commence avant l'heure, l'étape exclue ; logement sinon", () => {
    const j = jour(1, [term("start", "09:00"), etape("a", "10:00", "11:00", A), etape("b", "13:00", "14:00", B), term("end", "18:00")]);
    expect(pointAvantProposition(j, "12:00", "p", 2)).toEqual({ lieu: A });
    expect(pointAvantProposition(j, "15:00", "p", 2)).toEqual({ lieu: B });
    expect(pointAvantProposition(j, "15:00", "b", 2)).toEqual({ lieu: A });
    expect(pointAvantProposition(j, "09:30", "p", 2)).toEqual(L0);
  });
});

describe("recomposition: demande de relectures (0086 § 1.2 point 2)", () => {
  const j1 = jour(1, [term("start", "09:00"), seg("walk"), etape("a", "10:00", "11:00", A), seg("walk"), etape("b", "12:00", "13:00", B), seg("transit"), term("end", "18:00")]);
  const j2 = jour(2, [term("start", "09:00"), seg("car"), etape("c", "10:00", "11:00", C), seg("car"), term("end", "18:00")]);

  it("lieux par date, couples des segments au mode stocké et couples du jour aux modes admis, fusionnés", () => {
    const demande = demandeDeRelectures({ jours: [{ jour: j1, mesure: true }], nombreDeNuits: 2, modes: ["walk", "car"] });
    expect(demande.lieux).toEqual([
      { placeId: A, dates: ["2027-05-01"] },
      { placeId: B, dates: ["2027-05-01"] },
    ]);
    expect(demande.trajets).toEqual([
      { depuis: L0, vers: { lieu: A }, modes: ["walk", "car"] },
      { depuis: { lieu: A }, vers: { lieu: B }, modes: ["walk", "car"] },
      { depuis: { lieu: B }, vers: L0, modes: ["transit", "walk", "car"] },
    ]);
  });

  it("un jour non mesuré n'entre pas dans la demande", () => {
    const demande = demandeDeRelectures({ jours: [{ jour: j1, mesure: false }, { jour: j2, mesure: true }], nombreDeNuits: 2, modes: ["car"] });
    expect(demande.lieux.map((l) => l.placeId)).toEqual([C]);
    expect(demande.trajets.every((t) => t.modes.every((m) => m === "car"))).toBe(true);
  });

  it("propositions : lieu à la date du jour visé ; trajet depuis le point d'avant au mode stocké", () => {
    const proposition = ProposalRecordSchema.parse({
      id: "p",
      kind: "activity",
      day: 1,
      time: "14:00",
      stop: { id: "p", kind: "activity", placeId: C, name: "[Proposition]", start: "14:00", end: "15:00", facts: {}, exceptions: [], locked: false },
      category: "museum",
      travelFromPrevious: { mode: "transit", estimated: false },
      detour: "[Détour de test]",
    });
    const demande = demandeDeRelectures({ jours: [], propositions: [{ proposition, jour: j1 }], nombreDeNuits: 2, modes: [] });
    expect(demande).toEqual({ lieux: [{ placeId: C, dates: ["2027-05-01"] }], trajets: [{ depuis: { lieu: B }, vers: { lieu: C }, modes: ["transit"] }] });
  });
});

describe("recomposition: jour (B6-PO-4 à B6-PO-8)", () => {
  const j = jour(1, [term("start", "09:00"), seg("walk"), etape("a", "10:00", "11:00", A), seg("transit", true), etape("b", "12:00", "13:00", B, ["toReserve"]), seg("walk"), term("end", "18:00")]);
  const r = relectures([
    [L0, { lieu: A }, "walk", 7],
    [{ lieu: A }, { lieu: B }, "transit", 11],
    [{ lieu: A }, { lieu: B }, "walk", 13],
    [{ lieu: B }, L0, "walk", 7],
  ]);

  it("segments au mode stocké, estimated stocké, travelMinutes au plus rapide des modes admis, budget", () => {
    const resultat = recomposerJour(j, { nombreDeNuits: 2, generating: false, relectures: r, modes: ["walk", "transit"], verification: sansDate });
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    const segments = resultat.valeur.items.flatMap((item) => (item.type === "segment" ? [item.segment] : []));
    expect(segments).toEqual([
      { mode: "walk", minutes: 7, estimated: false },
      { mode: "transit", minutes: 11, estimated: true },
      { mode: "walk", minutes: 7, estimated: false },
    ]);
    expect(resultat.valeur.travelMinutes).toBe(25);
    expect(resultat.valeur.budgetPerPerson).toBe(20);
    expect(resultat.valeur.generating).toBe(false);
    // Modes admis : marche seule, le couple A → B se fait à pied (13 min).
    const aPied = recomposerJour(j, { nombreDeNuits: 2, generating: false, relectures: r, modes: ["walk"], verification: sansDate });
    expect(aPied.ok && aPied.valeur.travelMinutes).toBe(27);
  });

  it("une durée inconnue (segment ou trajet du jour) : travel_unknown", () => {
    const sansRetour = relectures([
      [L0, { lieu: A }, "walk", 7],
      [{ lieu: A }, { lieu: B }, "transit", 11],
    ]);
    expect(recomposerJour(j, { nombreDeNuits: 2, generating: false, relectures: sansRetour, modes: ["walk", "transit"], verification: sansDate })).toEqual({ ok: false, raison: "travel_unknown" });
    expect(recomposerJour(j, { nombreDeNuits: 2, generating: false, modes: ["walk", "transit"], verification: sansDate })).toEqual({ ok: false, raison: "travel_unknown" });
  });

  it("toConfirm après les exceptions stockées, dans la limite de deux badges", () => {
    const inconnus = relectures(
      [
        [L0, { lieu: A }, "walk", 7],
        [{ lieu: A }, { lieu: B }, "transit", 11],
        [{ lieu: B }, L0, "walk", 7],
      ],
      [A, B],
    );
    const deux = jour(1, [term("start", "09:00"), seg("walk"), etape("a", "10:00", "11:00", A), seg("transit"), etape("b", "12:00", "13:00", B, ["toReserve", "unconfirmed"]), seg("walk"), term("end", "18:00")]);
    const resultat = recomposerJour(deux, { nombreDeNuits: 2, generating: false, relectures: inconnus, modes: ["walk", "transit"], verification: sansDate });
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    const exceptions = resultat.valeur.items.flatMap((item) => (item.type === "stop" ? [item.stop.exceptions] : []));
    expect(exceptions).toEqual([["toConfirm"], ["toReserve", "unconfirmed"]]);
  });

  it("verifiedAt fourni par la date de contrôle, pour les éléments avec lieu", () => {
    const verification: DateDeVerification = (index, ref) => (index === 1 && ref.id === "a" ? "2026-10-02" : undefined);
    const resultat = recomposerJour(j, { nombreDeNuits: 2, generating: false, relectures: r, modes: ["walk", "transit"], verification });
    const stops = resultat.ok ? resultat.valeur.items.flatMap((item) => (item.type === "stop" ? [item.stop] : [])) : [];
    expect(stops.map((s) => s.verifiedAt)).toEqual(["2026-10-02", undefined]);
  });

  it("jour en préparation : ni mesure, ni budget, ni toConfirm ; un segment y est travel_unknown", () => {
    const sansSegment = jour(1, [term("start", "09:00"), etape("a", "10:00", "11:00", A), term("end", "18:00")]);
    const resultat = recomposerJour(sansSegment, { nombreDeNuits: 2, generating: true, modes: [], verification: sansDate });
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(resultat.valeur.generating).toBe(true);
    expect(resultat.valeur.travelMinutes).toBe(0);
    expect(resultat.valeur.budgetPerPerson).toBeUndefined();
    expect(recomposerJour(j, { nombreDeNuits: 2, generating: true, relectures: r, modes: [], verification: sansDate })).toEqual({ ok: false, raison: "travel_unknown" });
  });
});

describe("recomposition: propositions (B6-PO-4, B6-PO-9)", () => {
  const j = jour(1, [term("start", "09:00"), etape("a", "10:00", "11:00", A), etape("b", "13:00", "14:00", B), term("end", "18:00")]);
  const proposition = (champs: Partial<ProposalRecord> & { placeId?: string } = {}): ProposalRecord => {
    const { placeId = C, ...reste } = champs;
    return ProposalRecordSchema.parse({
      id: "p",
      kind: "activity",
      day: 1,
      time: "15:00",
      stop: { id: "p", kind: "activity", ...(placeId === "" ? {} : { placeId }), name: "[Proposition]", start: "15:00", end: "16:00", facts: {}, exceptions: [], locked: false },
      category: "museum",
      travelFromPrevious: { mode: "walk", estimated: true },
      detour: "[Détour de test]",
      ...reste,
    });
  };
  const r = relectures([[{ lieu: B }, { lieu: C }, "walk", 13]], [C]);

  it("trajet au mode stocké depuis le point d'avant, voisins, toConfirm de l'étape, option fournie", () => {
    const resultat = recomposerProposition(proposition(), j, { nombreDeNuits: 2, generating: false, relectures: r, configuration: CONFIG, option: { index: 1, total: 2 } });
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(resultat.valeur.travelFromPrevious).toEqual({ mode: "walk", minutes: 13, estimated: true });
    expect(resultat.valeur.stop.exceptions).toEqual(["toConfirm"]);
    expect(resultat.valeur.option).toEqual({ index: 1, total: 2 });
    expect(resultat.valeur.neighbours.before).toBeDefined();
    expect(resultat.valeur).not.toHaveProperty("photoUrl");
  });

  it("travelFromPrevious sans lieu : proposal_invalid ; durée inconnue : travel_unknown", () => {
    expect(recomposerProposition(proposition({ placeId: "" }), j, { nombreDeNuits: 2, generating: false, relectures: r, configuration: CONFIG })).toEqual({ ok: false, raison: "proposal_invalid" });
    expect(recomposerProposition(proposition({ time: "12:00" }), j, { nombreDeNuits: 2, generating: false, relectures: r, configuration: CONFIG })).toEqual({ ok: false, raison: "travel_unknown" });
  });

  it("jour en préparation : aucun voisin", () => {
    const resultat = recomposerProposition(proposition(), j, { nombreDeNuits: 2, generating: true, relectures: r, configuration: CONFIG });
    expect(resultat.ok && resultat.valeur.neighbours).toEqual({});
  });

  it("options des repas : rang dans le créneau (jour, heure) ; un créneau à une proposition n'en a pas", () => {
    const repas = (day: number, time: string) => ({ kind: "meal" as const, day, time });
    expect(optionsDesRepas([repas(1, "19:00"), { kind: "activity", day: 1, time: "19:00" }, repas(1, "19:00"), repas(1, "12:30"), repas(2, "19:00"), repas(1, "19:00")])).toEqual([
      { index: 1, total: 3 },
      undefined,
      { index: 2, total: 3 },
      undefined,
      undefined,
      { index: 3, total: 3 },
    ]);
  });
});
