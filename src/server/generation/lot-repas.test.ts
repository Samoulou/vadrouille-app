// @vitest-environment node
import { describe, expect, it } from "vitest";

import { ProposalRecordSchema, type DaySnapshot, type StopSnapshot, type TripCommitment, type TripSnapshot } from "@/contracts";
import type { ConfigClassement } from "@/domain/classement";
import type { ConfigurationMoteur } from "@/domain/configuration";
import type { CandidatMoteur, EntreeMoteur, EtatChoix, Nuit } from "@/domain/entrees";
import { generer } from "@/domain/generation";
import { joursTouches } from "@/domain/recalcul";
import { INCONNU, memePoint, type ModeTrajet, type Point, type Relectures } from "@/domain/relectures";
import { SQL_CASES } from "@/server/presentation/etat";

import { planifierJoursDuLot, remplacantsDuLot, repasChoisisDuTri, triAvecChoisis, type EligibleLot } from "./etapes-lot";
import type { CandidatLu } from "./etapes";
import type { ExecuteurLecture } from "./lecture";
import { lireTriClos } from "./signaux";

/**
 * Critères 4 et 5 de B10b côté serveur (spécification B10 ; décision 0119 § 1.5 point 3, § 2.2 point 3 ; revue consolidée de la
 * PR 667, bloquant 1) sur un créneau de dîner à **trois options** : lecture du tri clos (`lireTriClos`, base simulée par un
 * double d'exécuteur), construction des repas choisis de l'étape `e` (`repasChoisisDuTri`, `triAvecChoisis`), planification
 * des jours touchés (`planifierJoursDuLot`, moteur réel) et remplaçants envoyés à la requête `raisons` (`remplacantsDuLot`).
 * Jeux fabriqués ici : `placeId` `SENTINELLE_PLACE_*`, durées 37 et 41 min, aucune réponse réelle, aucun appel.
 */

const ORG = "00000000-0000-4000-8000-0000000000c1";
const TRIP = "00000000-0000-4000-8000-0000000000c2";
const RUN = "00000000-0000-4000-8000-0000000000c3";
const CLOTURE = "00000000-0000-4000-8000-0000000000c4";

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
  changementDeVille: {
    activitesParRythme: { relaxed: 1, balanced: 2, intense: 2 },
    departEstime: { heureParDefaut: "10:00", limite: "18:00", arrondiMinutes: 15 },
    creneauSansDureeMinutes: 180,
    dureeEstimeeMinutes: { min: 20, max: 600 },
    margesMinutes: { avantDepart: { ticket: 45, flight: 120, estimated: 30 }, apresArrivee: { ticket: 30, flight: 60, estimated: 30 } },
    long: { seuilMinutes: 240, activitesMax: 1 },
  },
};

const FORMULE: ConfigClassement = {
  schema: 1,
  poids: { matchesWishes: 30, mustSee: 25, notForMeRisk: 4, source: { officielle: 4, independante: 6, generique: -8 }, sourceAncienne: 6 },
  matchesWishesNon: "penaliser",
  penaliteHorsEnvies: 20,
  prioriteMustSee: "avant",
  coutTrajetParMinute: { activity: 0.1, meal: 1, evening: 1, surprise: 2 },
};

const place = (id: string) => `SENTINELLE_PLACE_${id.toUpperCase()}`;
const LOGEMENT = "SENTINELLE_PLACE_LOGEMENT";

/** Relectures fabriquées ; un lieu de `inconnus` n'a pas été relu (relecture refusée) : validité `inconnu`, jamais admis. */
function relectures(inconnus: ReadonlySet<string> = new Set()): Relectures {
  return {
    validite: (placeId) => (inconnus.has(placeId) ? INCONNU : "valide"),
    plages: (placeId) => (inconnus.has(placeId) ? INCONNU : [{ debut: 547, fin: 1433 }]),
    duree(depuis: Point, vers: Point, mode: ModeTrajet) {
      if (memePoint(depuis, vers)) return { minutes: 0, estimee: false };
      if (mode === "walk") return { minutes: 41, estimee: false };
      if (mode === "transit") return { minutes: 37, estimee: false };
      return INCONNU;
    },
  };
}

function candidat(id: string, typeEtape: CandidatMoteur["typeEtape"]): CandidatMoteur {
  return {
    id,
    nom: `Lieu maison ${id}`,
    resume: `Résumé maison ${id}.`,
    categorie: typeEtape === "meal" ? "restaurant" : "museum",
    typeEtape,
    faits: { costPerPerson: 10 },
    sources: [{ url: `https://guide.example/${id}`, date: "2026-10-01", classe: "independante" }],
    notes: { matchesWishes: true, notForMeRisk: 1, mustSee: false, slotFit: typeEtape === "meal" ? ["meal"] : ["activity"] },
    placeId: place(id),
    aReserver: false,
  };
}

const MUSEES = ["a1", "a2", "a3", "a4", "a5", "a6"].map((id) => candidat(id, "activity"));
const REPAS = ["m1", "m2", "m3", "m4"].map((id) => candidat(id, "meal"));
const OPT_A = candidat("opta", "meal");
const OPT_B = candidat("optb", "meal");
const RESERVE = [...MUSEES, ...REPAS];
const TOUS = [...RESERVE, OPT_A, OPT_B];
const PAR_LIEU = new Map(TOUS.map((c) => [c.placeId, c]));

const VOLS: TripCommitment[] = [
  { kind: "flight", label: "Arrivée", date: "2026-11-23", start: "08:10", end: "11:40" },
  { kind: "flight", label: "Départ", date: "2026-11-25", start: "17:00" },
];
const NUITS: Nuit[] = [
  { etiquette: "Logement de test", placeId: LOGEMENT },
  { etiquette: "Logement de test", placeId: LOGEMENT },
];

function entree(modif: Partial<EntreeMoteur> = {}): EntreeMoteur {
  return {
    voyage: { destination: "Édimbourg", start: "2026-11-23", end: "2026-11-25", timeZone: "Europe/London", travellers: { adults: 2, children: 0 } },
    brief: { travellers: { adults: 2, children: 0 }, pace: "balanced", wishes: ["museum"], limits: [], mobility: ["walk", "transit"], inferredFields: [] },
    nuits: NUITS,
    engagements: VOLS,
    candidats: RESERVE,
    evenements: [],
    idees: [],
    choix: new Map<string, EtatChoix>(REPAS.map((c) => [c.id, "choisi"])),
    configuration: CONFIG,
    classement: { formule: FORMULE, ageSourceMaxJours: 365 },
    relectures: relectures(),
    dateReference: "2026-10-13",
    version: 1,
    budgetTrajetReduit: false,
    ...modif,
  };
}

const etapes = (jour: DaySnapshot): StopSnapshot[] => jour.items.flatMap((item) => (item.type === "stop" ? [item.stop] : []));

const genere = generer(entree({ jours: [1, 2] }));
if (!genere.ok) throw new Error(genere.code);
const BASE: TripSnapshot = genere.instantane;
const J2 = BASE.days.find((d) => d.index === 2);
const DINER = J2 === undefined ? undefined : etapes(J2).find((s) => s.kind === "meal" && s.start >= "18:30");
if (DINER === undefined || DINER.placeId === undefined) throw new Error("jeu de test : J2 sans dîner placé");
const CANDIDAT_DINER = PAR_LIEU.get(DINER.placeId);
if (CANDIDAT_DINER === undefined) throw new Error("jeu de test : dîner sans candidat");

/** Ligne `candidates` lue (champs maison) et sa forme pour le moteur. */
const lu = (c: CandidatMoteur): CandidatLu => ({
  id: c.id,
  nom: c.nom,
  resume: c.resume,
  categorie: c.categorie,
  kind: "place",
  stopKind: c.typeEtape === "meal" ? "meal" : "activity",
  aReserver: false,
  faits: c.faits,
  sources: [{ label: "guide", url: c.sources[0]?.url ?? "", checkedOn: "2026-10-01" }],
  placeId: c.placeId ?? null,
  fit: true,
  risque: 1,
  incontournable: false,
  slotFit: c.notes.slotFit,
  ville: 0,
});
const ELIGIBLES: EligibleLot[] = TOUS.map((c) => ({ lu: lu(c), moteur: { ...c, ville: 0 } }));
const PAR_PLACE_ID = new Map(ELIGIBLES.map((e) => [e.moteur.placeId as string, e.lu]));

// --- Base simulée de `lireTriClos` -------------------------------------------------------------------------------------------

type Option = { readonly candidat: CandidatMoteur; readonly placee: boolean };
type Decision = "choose" | "nextOption" | "dislike";

/** Case de dîner du J2 pour une option ; l'option placée porte l'étape du programme, les autres une étape du tri. */
function caseDe(option: Option, rang: number) {
  const time = DINER?.start ?? "19:00";
  const stop: StopSnapshot =
    option.placee && DINER !== undefined
      ? DINER
      : { id: `deck-diner-${rang}`, kind: "meal", placeId: option.candidat.placeId, name: option.candidat.nom, start: time, facts: {}, exceptions: [], locked: false };
  return {
    id: `case-${rang}`,
    position: rang,
    slot_type: "proposal",
    day: 2,
    time,
    kind: "meal",
    candidate_id: option.candidat.id,
    content: ProposalRecordSchema.parse({ id: `case-${rang}`, kind: "meal", day: 2, time, stop, category: "restaurant", detour: "Détour maison." }),
  };
}

/** Double d'exécuteur : clôture `through_position = jusqua`, cases des options, décisions actives, aucune question. */
function base(options: readonly Option[], decisions: readonly (Decision | null)[], jusqua: number = options.length): ExecuteurLecture {
  const cases = options.map((option, i) => caseDe(option, i + 1));
  const signaux = decisions.flatMap((decision, i) => {
    const option = options[i];
    if (decision === null || option === undefined) return [];
    return [
      {
        id: `signal-${i + 1}`,
        signal: decision,
        category: "restaurant",
        origin: "gesture",
        status: "confirmed",
        reason: null,
        candidate_id: option.candidat.id,
        place_id: option.candidat.placeId,
        proposal_id: `case-${i + 1}`,
      },
    ];
  });
  return {
    async query(texte: string) {
      if (texte.includes("FROM public.deck_closures c")) return { rows: [{ generation_run_id: RUN, phase: "preview", through_position: jusqua, precedente: null }] };
      if (texte === SQL_CASES) return { rows: cases };
      if (texte.includes("public.preference_signals")) return { rows: signaux };
      if (texte.includes("public.preference_prompts")) return { rows: [] };
      if (texte.includes("public.candidates")) return { rows: TOUS.map((c) => ({ place_id: c.placeId, category: c.categorie })) };
      throw new Error(`requête inattendue : ${texte.slice(0, 60)}`);
    },
  };
}

/** Étape `e` du lot sur le J2, sans appel : tri lu, repas choisis, relectures (lieux `nonRelus` refusés), plan, remplaçants. */
async function lot(options: readonly Option[], decisions: readonly (Decision | null)[], nonRelus: ReadonlySet<string> = new Set()) {
  const tri = await lireTriClos(base(options, decisions), ORG, TRIP, CLOTURE);
  const jours = joursTouches(BASE, tri);
  const relus = ELIGIBLES.map((e) => e.moteur).filter((c) => c.placeId === undefined || !nonRelus.has(c.placeId));
  const choisis = repasChoisisDuTri(tri, ELIGIBLES);
  const planifies = planifierJoursDuLot({
    base: BASE,
    derniere: { version: 1, instantane: BASE },
    aPlanifier: jours,
    tri: triAvecChoisis(tri, choisis, relus),
    signaux: tri.signaux,
    entree: (version) => entree({ version, candidats: relus, choix: new Map(), relectures: relectures(nonRelus) }),
  });
  const jour = planifies.find((j) => j.index === 2)?.jour;
  return { tri, jours, choisis, jour, remplacants: remplacantsDuLot(planifies, PAR_PLACE_ID).map((c) => c.id) };
}

const lieux = (jour: DaySnapshot | undefined) => new Set(jour === undefined ? [] : etapes(jour).map((s) => s.placeId));
const dinerLibre = (jour: DaySnapshot | undefined) => jour?.items.some((i) => i.type === "openMeal" && i.meal === "dinner") ?? false;

describe("recalcul (serveur) : créneau de dîner à trois options (critères 4 et 5 de B10b)", () => {
  const PLACEE_EN_1: Option[] = [
    { candidat: CANDIDAT_DINER, placee: true },
    { candidat: OPT_A, placee: false },
    { candidat: OPT_B, placee: false },
  ];

  it("critère 4 : « Je choisis » sur l'option 2, l'option 1 placée — le repas choisi remplace celui du programme et reçoit sa raison", async () => {
    const { jours, choisis, jour, remplacants } = await lot(PLACEE_EN_1, [null, "choose", null]);
    expect(jours).toEqual([2]);
    // Candidat de l'option pris dans sa proposition (`proposals.candidate_id`), pas dans la réserve.
    expect([...choisis.entries()].map(([caseId, e]) => [caseId, e.lu.id])).toEqual([["case-2", OPT_A.id]]);
    expect(lieux(jour).has(OPT_A.placeId)).toBe(true);
    expect(lieux(jour).has(DINER.placeId)).toBe(false);
    expect(lieux(jour).has(OPT_B.placeId)).toBe(false);
    const pose = jour === undefined ? undefined : etapes(jour).find((s) => s.placeId === OPT_A.placeId);
    expect(pose?.kind).toBe("meal");
    expect(pose !== undefined && pose.start >= "18:30").toBe(true);
    expect(remplacants).toContain(OPT_A.id);
  });

  it("critère 5 : « Option suivante » sur 1 et 2, « Pas pour moi » sur 3 — openMeal, aucune des trois options, aucune raison pour ce créneau", async () => {
    const { jours, jour, remplacants } = await lot(PLACEE_EN_1, ["nextOption", "nextOption", "dislike"]);
    expect(jours).toEqual([2]);
    expect(dinerLibre(jour)).toBe(true);
    for (const c of [CANDIDAT_DINER, OPT_A, OPT_B]) {
      expect(lieux(jour).has(c.placeId), c.id).toBe(false);
      expect(remplacants, c.id).not.toContain(c.id);
    }
    // Aucun autre repas de la réserve ne prend le créneau (le moteur ne place un repas que s'il est choisi, B5-PO-8).
    expect(etapes(jour as DaySnapshot).some((s) => s.kind === "meal" && s.start >= "18:30")).toBe(false);
  });

  it("critère 5, l'option 3 étant elle-même l'option placée : même résultat", async () => {
    const placeeEn3: Option[] = [
      { candidat: OPT_A, placee: false },
      { candidat: OPT_B, placee: false },
      { candidat: CANDIDAT_DINER, placee: true },
    ];
    const { jours, jour, remplacants } = await lot(placeeEn3, ["nextOption", "nextOption", "dislike"]);
    expect(jours).toEqual([2]);
    expect(dinerLibre(jour)).toBe(true);
    for (const c of [CANDIDAT_DINER, OPT_A, OPT_B]) {
      expect(lieux(jour).has(c.placeId), c.id).toBe(false);
      expect(remplacants, c.id).not.toContain(c.id);
    }
  });

  it("relecture refusée sur le candidat choisi : openMeal, ni l'option choisie ni l'option écartée", async () => {
    const { jours, jour, remplacants } = await lot(PLACEE_EN_1, [null, "choose", null], new Set([OPT_A.placeId as string]));
    expect(jours).toEqual([2]);
    expect(dinerLibre(jour)).toBe(true);
    expect(lieux(jour).has(OPT_A.placeId)).toBe(false);
    expect(lieux(jour).has(DINER.placeId)).toBe(false);
    expect(remplacants).not.toContain(OPT_A.id);
  });

  it("Q582 : `option.total` compté sur toutes les cases de l'exécution et de la phase, y compris hors du tri", async () => {
    // Le tri clos ne couvre que les options 1 et 2 (position 2) ; l'option 3 est écrite, hors de ce tri.
    const tri = await lireTriClos(base(PLACEE_EN_1, ["nextOption", "dislike", null], 2), ORG, TRIP, CLOTURE);
    expect(tri.propositions.map((p) => p.id)).toEqual(["case-1", "case-2"]);
    expect(tri.propositions.map((p) => p.option)).toEqual([
      { index: 1, total: 3 },
      { index: 2, total: 3 },
    ]);
    // « Pas pour moi » sur l'option 2, qui n'est pas la dernière : le créneau n'est pas réglé, aucun jour touché.
    expect(joursTouches(BASE, tri)).toEqual([]);
    // Tri couvrant les trois options : même total.
    const complet = await lireTriClos(base(PLACEE_EN_1, [null, null, null]), ORG, TRIP, CLOTURE);
    expect(complet.propositions.map((p) => p.option?.total)).toEqual([3, 3, 3]);
  });
});
