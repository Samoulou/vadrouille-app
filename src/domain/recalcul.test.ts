// @vitest-environment node
import { describe, expect, it } from "vitest";

import { TripSnapshotSchema, type DaySnapshot, type StopSnapshot, type TripCommitment, type TripSnapshot } from "@/contracts";

import type { ConfigClassement } from "@/domain/classement";
import type { ConfigurationMoteur } from "@/domain/configuration";
import type { CandidatMoteur, EntreeMoteur, EtatChoix, Nuit } from "@/domain/entrees";
import { generer, replanifierJour } from "@/domain/generation";
import {
  entreeDuJour,
  joursTouches,
  planDuJour,
  reserveFiltree,
  type PropositionDuRecalcul,
  type SignalDuRecalcul,
  type TriDuRecalcul,
} from "@/domain/recalcul";
import { INCONNU, memePoint, type ModeTrajet, type Point, type Relectures } from "@/domain/relectures";
import { estBloquante } from "@/domain/validation";

/**
 * Règles pures du recalcul (spécification B10, B10b ; décision 0119 § 2.2) : réserve filtrée, jours touchés, plan d'un
 * jour, et remplacement par le moteur (`replanifierJour` avec `conservees`). Jeux fabriqués ici ; doubles des
 * interfaces à valeurs sentinelles (durées 37 et 41 min, `placeId` `SENTINELLE_PLACE_*`), jamais tirés d'une réponse
 * réelle. Les tests de B5 (R1 à R10) sont dans `generation.test.ts` et `validation.test.ts`, inchangés.
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
  changementDeVille: {
    activitesParRythme: { relaxed: 1, balanced: 2, intense: 2 },
    departEstime: { heureParDefaut: "10:00", limite: "18:00" },
    creneauSansDureeMinutes: 180,
    dureeEstimeeMinutes: { min: 20, max: 600 },
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

function relectures(fermes: ReadonlySet<string> = new Set()): Relectures {
  return {
    validite: (placeId) => (fermes.has(placeId) ? "ferme_definitivement" : "valide"),
    plages: () => [{ debut: 547, fin: 1433 }],
    duree(depuis: Point, vers: Point, mode: ModeTrajet) {
      if (memePoint(depuis, vers)) return { minutes: 0, estimee: false };
      if (mode === "walk") return { minutes: 41, estimee: false };
      if (mode === "transit") return { minutes: 37, estimee: false };
      return INCONNU;
    },
  };
}

function candidat(id: string, typeEtape: CandidatMoteur["typeEtape"], extra: Partial<CandidatMoteur> = {}): CandidatMoteur {
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
    ...extra,
  };
}

// Musées (a*) d'abord, lieux de nature (p*) ensuite : la catégorie arrêtée a des remplaçants d'une autre catégorie.
const MUSEES = ["a1", "a2", "a3", "a4", "a5", "a6"].map((id) => candidat(id, "activity"));
const NATURE = ["p1", "p2", "p3", "p4", "p5", "p6"].map((id) =>
  candidat(id, "activity", { categorie: "nature", notes: { matchesWishes: false, notForMeRisk: 1, mustSee: false, slotFit: ["activity"] } }),
);
const REPAS = ["m1", "m2", "m3", "m4", "m5", "m6"].map((id) => candidat(id, "meal"));
const SOIREES = ["s1", "s2"].map((id) =>
  candidat(id, "activity", { categorie: "nightlife", notes: { matchesWishes: true, notForMeRisk: 1, mustSee: false, slotFit: ["evening"] } }),
);
const RESERVE = [...MUSEES, ...NATURE, ...REPAS, ...SOIREES];
const PAR_LIEU = new Map(RESERVE.map((c) => [c.placeId, c]));

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
    choix: new Map<string, EtatChoix>([...REPAS, ...SOIREES].map((c) => [c.id, "choisi"])),
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
const jourN = (instantane: TripSnapshot, index: number): DaySnapshot => {
  const jour = instantane.days.find((d) => d.index === index);
  if (jour === undefined) throw new Error(`jour ${index} absent`);
  return jour;
};
const lieuxDe = (jour: DaySnapshot) => new Set(etapes(jour).map((s) => s.placeId));

// Version de base : J1 et J2 planifiés (aperçu), J3 non planifié.
const genere = generer(entree({ jours: [1, 2] }));
if (!genere.ok) throw new Error(genere.code);
const BASE: TripSnapshot = genere.instantane;
const J2 = jourN(BASE, 2);
const activitesJ2 = etapes(J2).filter((s) => s.kind === "activity" && s.commitment === undefined);
const repasJ2 = etapes(J2).filter((s) => s.kind === "meal");
const ACT = activitesJ2.at(0);
// Dîner placé (le déjeuner du J2 est déjà un repas « pas encore choisi » dans ce jeu).
const DINER = repasJ2.find((s) => s.start >= "18:30");
if (ACT === undefined || DINER === undefined) throw new Error("jeu de test : J2 sans activité ni dîner");
if (J2.items.some((i) => i.type === "openMeal" && i.meal === "dinner")) throw new Error("jeu de test : dîner déjà libre");

/** Cases du tri : une par étape d'activité ou de repas de la base (comme l'aperçu), catégorie du candidat du lieu. */
const CASES: PropositionDuRecalcul[] = BASE.days.flatMap((jour) =>
  etapes(jour)
    .filter((s) => (s.kind === "activity" || s.kind === "meal") && s.commitment === undefined)
    .map((s) => {
      const source = s.placeId === undefined ? undefined : PAR_LIEU.get(s.placeId);
      if (source === undefined) throw new Error("jeu de test : étape sans candidat");
      return {
        id: `case-${s.id}`,
        kind: s.kind === "meal" ? ("meal" as const) : ("activity" as const),
        category: source.categorie,
        day: jour.index,
        time: s.start,
        stopId: s.id,
        ...(s.placeId === undefined ? {} : { placeId: s.placeId }),
        candidat: source,
      };
    }),
);
const caseDe = (stop: StopSnapshot): PropositionDuRecalcul => {
  const trouvee = CASES.find((c) => c.stopId === stop.id);
  if (trouvee === undefined) throw new Error("jeu de test : étape sans case");
  return trouvee;
};

/** Options 2 et 3 du dîner du J2 (suite du tri), candidats hors du programme. */
const OPTION_2 = candidat("opt2", "meal");
const OPTION_3 = candidat("opt3", "meal");
const optionsDiner = (): PropositionDuRecalcul[] => {
  const premiere = { ...caseDe(DINER), option: { index: 1 } };
  const option = (rang: number, c: CandidatMoteur): PropositionDuRecalcul => ({
    id: `case-diner-${rang}`,
    kind: "meal",
    category: "restaurant",
    day: 2,
    time: DINER.start,
    option: { index: rang },
    stopId: `deck-diner-${rang}`,
    ...(c.placeId === undefined ? {} : { placeId: c.placeId }),
    candidat: c,
  });
  return [premiere, option(2, OPTION_2), option(3, OPTION_3)];
};

function signal(proposition: PropositionDuRecalcul, kind: SignalDuRecalcul["signal"], extra: Partial<SignalDuRecalcul> = {}): SignalDuRecalcul {
  return {
    signal: kind,
    category: proposition.category,
    origin: "gesture",
    status: "confirmed",
    proposalId: proposition.id,
    ...(proposition.candidat === undefined ? {} : { candidatId: proposition.candidat.id }),
    ...(proposition.placeId === undefined ? {} : { placeId: proposition.placeId }),
    ...extra,
  };
}
const arret = (categorie: SignalDuRecalcul["category"]): SignalDuRecalcul => ({ signal: "answerYes", category: categorie, origin: "question", status: "confirmed" });

/** Recalcul d'un jour : plan, entrée filtrée, `replanifierJour` sur la base (version 2). */
function recalculer(tri: TriDuRecalcul, index: number, modif: Partial<EntreeMoteur> = {}) {
  const plan = planDuJour(jourN(BASE, index), tri);
  const resultat = replanifierJour(entreeDuJour(entree({ version: 2, ...modif }), plan, tri.signaux), BASE, index);
  if (!resultat.ok) throw new Error(resultat.code);
  expect(resultat.rapport.filter((e) => estBloquante(e, [resultat.jour]))).toEqual([]);
  expect(TripSnapshotSchema.safeParse({ days: [resultat.jour] }).success).toBe(true);
  return { plan, jour: resultat.jour };
}

describe("recalcul: réserve filtrée (B10-PO-10 point 1)", () => {
  it("sans les lieux refusés, par candidat et par placeId, ni les activités d'une catégorie arrêtée", () => {
    const refusParCandidat = signal(caseDe(ACT), "dislike", { placeId: undefined });
    const autre = CASES.find((c) => c.kind === "activity" && c.id !== caseDe(ACT).id);
    if (autre === undefined) throw new Error("jeu de test");
    const refusParLieu = signal(autre, "dislike", { candidatId: undefined });
    const filtree = reserveFiltree(RESERVE, [refusParCandidat, refusParLieu, arret("nature")]);
    const ids = new Set(filtree.map((c) => c.id));
    expect(ids.has(caseDe(ACT).candidat?.id ?? "")).toBe(false);
    expect(filtree.some((c) => c.placeId === autre.placeId)).toBe(false);
    expect(filtree.some((c) => c.categorie === "nature")).toBe(false);
    // Repas, soirées et autres musées restent, dans l'ordre de l'entrée.
    expect(filtree).toEqual(RESERVE.filter((c) => ids.has(c.id)));
    expect(filtree.length).toBe(RESERVE.length - 2 - NATURE.length);
  });

  it("une catégorie arrêtée ne retire pas les repas ; « Option suivante », « J'aime » et un signal annulé ne retirent rien", () => {
    expect(reserveFiltree(RESERVE, [arret("restaurant")])).toEqual(RESERVE);
    const [premiere] = optionsDiner();
    if (premiere === undefined) throw new Error("jeu de test");
    expect(reserveFiltree(RESERVE, [signal(premiere, "nextOption"), signal(caseDe(ACT), "like")])).toEqual(RESERVE);
    expect(reserveFiltree(RESERVE, [signal(caseDe(ACT), "dislike", { status: "cancelled" }), { ...arret("museum"), status: "cancelled" }])).toEqual(RESERVE);
  });
});

describe("recalcul: jours touchés (B10-PO-9)", () => {
  const options = optionsDiner();
  const [option1, option2, option3] = options;
  if (option1 === undefined || option2 === undefined || option3 === undefined) throw new Error("jeu de test");
  const tri = (signaux: SignalDuRecalcul[], propositions: PropositionDuRecalcul[] = CASES): TriDuRecalcul => ({ signaux, propositions });
  const avecOptions = [...CASES.filter((c) => c.stopId !== DINER.id), ...options];

  it("une activité refusée touche son jour, et seulement lui", () => {
    expect(joursTouches(BASE, tri([signal(caseDe(ACT), "dislike")]))).toEqual([2]);
  });

  it("« J'aime », « Option suivante » seule, « Je choisis » sur l'option placée, un refus annulé : aucun jour", () => {
    expect(joursTouches(BASE, tri([signal(caseDe(ACT), "like")]))).toEqual([]);
    expect(joursTouches(BASE, tri([signal(option1, "nextOption")], avecOptions))).toEqual([]);
    expect(joursTouches(BASE, tri([signal(option1, "choose")], avecOptions))).toEqual([]);
    expect(joursTouches(BASE, tri([signal(caseDe(ACT), "dislike", { status: "cancelled" })]))).toEqual([]);
  });

  it("« Je choisis » sur une autre option que l'option placée touche le jour", () => {
    expect(joursTouches(BASE, tri([signal(option1, "nextOption"), signal(option2, "choose")], avecOptions))).toEqual([2]);
  });

  it("créneau réglé sans choix : touché, que l'option refusée soit placée ou non", () => {
    const sansChoix = [signal(option1, "nextOption"), signal(option2, "nextOption"), signal(option3, "dislike")];
    expect(joursTouches(BASE, tri(sansChoix, avecOptions))).toEqual([2]);
    // Option unique placée (aperçu) refusée : même règle.
    expect(joursTouches(BASE, tri([signal(caseDe(DINER), "dislike")]))).toEqual([2]);
    // « Pas pour moi » sur une option qui n'est pas la dernière, sans lieu placé : le créneau n'est pas réglé.
    expect(joursTouches(BASE, tri([signal(option2, "dislike")], avecOptions))).toEqual([]);
  });

  it("catégorie arrêtée dans ce tri : les jours qui en ont une activité, hors étapes verrouillées et engagements", () => {
    const musees = BASE.days.filter((j) => etapes(j).some((s) => s.kind === "activity" && caseDe(s).category === "museum")).map((j) => j.index);
    expect(musees.length).toBeGreaterThan(0);
    expect(joursTouches(BASE, tri([arret("museum")]))).toEqual(musees);
    // Les musées verrouillés ne touchent plus aucun jour.
    const verrouillee: TripSnapshot = {
      days: BASE.days.map((j) => ({ ...j, items: j.items.map((i) => (i.type === "stop" ? { type: "stop" as const, stop: { ...i.stop, locked: true } } : i)) })),
    };
    expect(joursTouches(verrouillee, tri([arret("museum")]))).toEqual([]);
    // Catégorie d'une étape sans case : lue dans `categories`, par lieu.
    const categories = new Map(RESERVE.flatMap((c) => (c.placeId === undefined ? [] : [[c.placeId, c.categorie] as const])));
    expect(joursTouches(BASE, { signaux: [arret("museum")], propositions: [], categories })).toEqual(musees);
    expect(joursTouches(BASE, { signaux: [arret("museum")], propositions: [] })).toEqual([]);
  });

  it("un jour non planifié n'est jamais touché", () => {
    const j3 = jourN(BASE, 3);
    expect(j3.items.every((i) => i.type === "terminus")).toBe(true);
    const refusJ3: PropositionDuRecalcul = { id: "case-j3", kind: "activity", category: "museum", day: 3, time: "10:00", placeId: place("a6") };
    expect(joursTouches(BASE, tri([signal(refusJ3, "dislike"), arret("museum")])).includes(3)).toBe(false);
  });
});

describe("recalcul: plan d'un jour (0119 § 2.2 point 3)", () => {
  it("conserve toutes les étapes sauf celles qu'un signal retire ; repas conservés gardés pour R7", () => {
    const plan = planDuJour(J2, { signaux: [signal(caseDe(ACT), "dislike")], propositions: CASES });
    expect(plan.retirees).toEqual([ACT.id]);
    expect([...plan.conservees].sort()).toEqual(etapes(J2).filter((s) => s.id !== ACT.id).map((s) => s.id).sort());
    expect(plan.choix.get(DINER.id)).toBe("garde");
    expect(plan.choix.has(ACT.id)).toBe(false);
    expect(plan.repasChoisis).toEqual([]);
    expect(plan.creneauxARouvrir).toEqual([]);
  });

  it("une étape verrouillée ou un engagement n'est jamais retiré", () => {
    const verrouille: DaySnapshot = {
      ...J2,
      items: J2.items.map((i) => (i.type === "stop" && i.stop.id === ACT.id ? { type: "stop" as const, stop: { ...i.stop, locked: true } } : i)),
    };
    const plan = planDuJour(verrouille, { signaux: [signal(caseDe(ACT), "dislike"), arret("museum")], propositions: CASES });
    expect(plan.conservees.has(ACT.id)).toBe(true);
  });
});

describe("recalcul: remplacement par le moteur (B10-PO-10 points 2 et 3)", () => {
  const options = optionsDiner();
  const [option1, option2, option3] = options;
  if (option1 === undefined || option2 === undefined || option3 === undefined) throw new Error("jeu de test");
  const avecOptions = [...CASES.filter((c) => c.stopId !== DINER.id), ...options];

  it("un lieu écarté est remplacé par un candidat de la réserve ; le reste du jour ne bouge pas, sans verrou ajouté", () => {
    const tri: TriDuRecalcul = { signaux: [signal(caseDe(ACT), "dislike")], propositions: CASES };
    const { plan, jour } = recalculer(tri, 2);
    expect(lieuxDe(jour).has(ACT.placeId)).toBe(false);
    for (const stop of etapes(J2)) if (plan.conservees.has(stop.id)) expect(etapes(jour).find((s) => s.id === stop.id)).toEqual(stop);
    const nouvelles = etapes(jour).filter((s) => !plan.conservees.has(s.id));
    expect(nouvelles.length).toBe(1);
    expect(nouvelles.every((s) => s.kind === "activity" && !s.locked && /^v2-j2-\d+$/.test(s.id))).toBe(true);
    // Aucun lieu d'un autre jour n'est repris.
    for (const stop of nouvelles) expect(lieuxDe(jourN(BASE, 1)).has(stop.placeId)).toBe(false);
  });

  it("réserve épuisée : l'activité écartée devient du temps libre, aucun lieu inventé", () => {
    const tri: TriDuRecalcul = { signaux: [signal(caseDe(ACT), "dislike")], propositions: CASES };
    const { plan, jour } = recalculer(tri, 2, { candidats: [] });
    expect(etapes(jour).map((s) => s.id)).toEqual(etapes(J2).filter((s) => s.id !== ACT.id).map((s) => s.id));
    expect(jour.items.some((i) => i.type === "free" && i.from <= ACT.start && i.to >= ACT.start)).toBe(true);
    expect(plan.retirees).toEqual([ACT.id]);
  });

  it("catégorie arrêtée : plus aucune activité de cette catégorie dans le jour recalculé", () => {
    const tri: TriDuRecalcul = { signaux: [arret("museum")], propositions: CASES };
    const { jour } = recalculer(tri, 2);
    const categorie = (s: StopSnapshot) => (s.placeId === undefined ? undefined : PAR_LIEU.get(s.placeId)?.categorie);
    expect(etapes(jour).filter((s) => s.kind === "activity" && categorie(s) === "museum")).toEqual([]);
    expect(etapes(jour).some((s) => s.kind === "activity" && categorie(s) === "nature")).toBe(true);
  });

  it("créneau réglé sans choix : repas « pas encore choisi », sans aucune des trois options, même avec une réserve", () => {
    const tri: TriDuRecalcul = { signaux: [signal(option1, "nextOption"), signal(option2, "nextOption"), signal(option3, "dislike")], propositions: avecOptions };
    const { plan, jour } = recalculer(tri, 2, { candidats: [...RESERVE, OPTION_2, OPTION_3] });
    expect(plan.creneauxARouvrir).toEqual([{ day: 2, time: DINER.start }]);
    expect(plan.repasChoisis).toEqual([]);
    expect(jour.items.some((i) => i.type === "openMeal" && i.meal === "dinner")).toBe(true);
    for (const lieu of [DINER.placeId, OPTION_2.placeId, OPTION_3.placeId]) expect(lieuxDe(jour).has(lieu)).toBe(false);
    expect(etapes(jour).filter((s) => s.kind === "meal").map((s) => s.id)).toEqual(repasJ2.filter((s) => s.id !== DINER.id).map((s) => s.id));
  });

  it("même résultat quand le programme place l'option refusée elle-même", () => {
    const tri: TriDuRecalcul = { signaux: [signal(caseDe(DINER), "dislike")], propositions: CASES };
    const { jour } = recalculer(tri, 2);
    expect(jour.items.some((i) => i.type === "openMeal" && i.meal === "dinner")).toBe(true);
    expect(lieuxDe(jour).has(DINER.placeId)).toBe(false);
  });

  it("repas choisi sur une autre option : le candidat de l'option prend le créneau, jamais l'option placée", () => {
    const tri: TriDuRecalcul = { signaux: [signal(option1, "nextOption"), signal(option2, "choose")], propositions: avecOptions };
    const { plan, jour } = recalculer(tri, 2);
    expect(plan.repasChoisis).toEqual([OPTION_2]);
    expect(plan.choix.get(OPTION_2.id)).toBe("choisi");
    expect(plan.choix.has(option1.candidat?.id ?? "")).toBe(false);
    expect(lieuxDe(jour).has(OPTION_2.placeId)).toBe(true);
    expect(lieuxDe(jour).has(DINER.placeId)).toBe(false);
  });

  it("option choisie refusée par la relecture : repas « pas encore choisi », jamais l'option écartée", () => {
    const tri: TriDuRecalcul = { signaux: [signal(option1, "nextOption"), signal(option2, "choose")], propositions: avecOptions };
    const { jour } = recalculer(tri, 2, { relectures: relectures(new Set([OPTION_2.placeId ?? ""])) });
    expect(jour.items.some((i) => i.type === "openMeal" && i.meal === "dinner")).toBe(true);
    expect(lieuxDe(jour).has(OPTION_2.placeId)).toBe(false);
    expect(lieuxDe(jour).has(DINER.placeId)).toBe(false);
  });
});

describe("recalcul: cas fixés par B10b-serveur (Q581, Q582, Q584)", () => {
  const dejeuner = J2.items.find((i) => i.type === "openMeal" && i.meal === "lunch");
  if (dejeuner === undefined || dejeuner.type !== "openMeal") throw new Error("jeu de test : J2 sans déjeuner libre");
  const OPTION_DEJ_2 = candidat("dej2", "meal");
  const optionDejeuner = (rang: number, c: CandidatMoteur, total?: number): PropositionDuRecalcul => ({
    id: `case-dej-${rang}`,
    kind: "meal",
    category: "restaurant",
    day: 2,
    time: dejeuner.time,
    option: total === undefined ? { index: rang } : { index: rang, total },
    stopId: `deck-dej-${rang}`,
    ...(c.placeId === undefined ? {} : { placeId: c.placeId }),
    candidat: c,
  });

  it("Q581 (limite acceptée, 0119 « Quand revoir », ticket n° 664) : créneau rouvert et repas choisi sur une autre option le même jour — le moteur pose le repas choisi dans le créneau rouvert", () => {
    // Dîner placé refusé (créneau réglé sans choix, rouvert) ; déjeuner libre dont l'option 2 est choisie.
    const dej1 = optionDejeuner(1, candidat("dej1", "meal"), 2);
    const dej2 = optionDejeuner(2, OPTION_DEJ_2, 2);
    const tri: TriDuRecalcul = { signaux: [signal(caseDe(DINER), "dislike"), signal(dej1, "nextOption"), signal(dej2, "choose")], propositions: [...CASES, dej1, dej2] };
    const { plan, jour } = recalculer(tri, 2);
    expect(plan.creneauxARouvrir).toEqual([{ day: 2, time: DINER.start }]);
    expect(plan.repasChoisis).toEqual([OPTION_DEJ_2]);
    // Comportement épinglé : le repas choisi pour le déjeuner prend l'heure du dîner rouvert ; le déjeuner reste libre.
    const pose = etapes(jour).find((s) => s.placeId === OPTION_DEJ_2.placeId);
    expect(pose?.start).toBe(DINER.start);
    expect(jour.items.some((i) => i.type === "openMeal" && i.meal === "lunch")).toBe(true);
    expect(jour.items.some((i) => i.type === "openMeal" && i.meal === "dinner")).toBe(false);
    expect(lieuxDe(jour).has(DINER.placeId)).toBe(false);
  });

  it.todo("Q581, cible du ticket n° 664 « créneau imposé pour un candidat » : le repas choisi garde le créneau de son option (déjeuner), le créneau rouvert reste « pas encore choisi »");

  it("Q584 : « Pas pour moi » sur l'option placée qui n'est pas la dernière — repas retiré, créneau non rouvert, repas « pas encore choisi »", () => {
    const options = optionsDiner();
    const [option1] = options;
    if (option1 === undefined) throw new Error("jeu de test");
    const avecOptions = [...CASES.filter((c) => c.stopId !== DINER.id), ...options];
    const tri: TriDuRecalcul = { signaux: [signal(option1, "dislike")], propositions: avecOptions };
    expect(joursTouches(BASE, tri)).toEqual([2]);
    const { plan, jour } = recalculer(tri, 2, { candidats: [...RESERVE, OPTION_2, OPTION_3] });
    expect(plan.retirees).toEqual([DINER.id]);
    expect(plan.creneauxARouvrir).toEqual([]);
    expect(plan.repasChoisis).toEqual([]);
    expect(lieuxDe(jour).has(DINER.placeId)).toBe(false);
    expect(jour.items.some((i) => i.type === "openMeal" && i.meal === "dinner")).toBe(true);
  });

  it("Q582 : nombre réel d'options du créneau (`option.total`, lu par le serveur) préféré au plus grand rang observé", () => {
    const options = optionsDiner();
    const [option1, option2] = options;
    if (option1 === undefined || option2 === undefined) throw new Error("jeu de test");
    // Le tri n'a montré que les options 1 et 2 ; « Pas pour moi » sur l'option 2.
    const vues = (total?: number) => [...CASES.filter((c) => c.stopId !== DINER.id), ...[option1, option2].map((o) => ({ ...o, option: total === undefined ? { index: o.option?.index ?? 1 } : { index: o.option?.index ?? 1, total } }))];
    const signaux = [signal(option1, "nextOption"), signal(option2, "dislike")];
    // Sans le total : l'option 2 est prise pour la dernière, le créneau est réglé sans choix et rouvert.
    expect(planDuJour(J2, { signaux, propositions: vues() }).creneauxARouvrir).toEqual([{ day: 2, time: DINER.start }]);
    // Avec le total réel (3) : l'option 2 n'est pas la dernière, le créneau n'est pas réglé, aucun jour touché.
    expect(planDuJour(J2, { signaux, propositions: vues(3) }).creneauxARouvrir).toEqual([]);
    expect(joursTouches(BASE, { signaux, propositions: vues(3) })).toEqual([]);
    // Total égal au rang : dernière option, même règle que sans total.
    expect(planDuJour(J2, { signaux, propositions: vues(2) }).creneauxARouvrir).toEqual([{ day: 2, time: DINER.start }]);
  });
});
