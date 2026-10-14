// @vitest-environment node
import { describe, expect, it } from "vitest";

import { ApiErrorSchema, type Day, type DayLineItem, type Stop } from "@/contracts";

import { aConfirmer } from "@/domain/calculs";
import type { ConfigurationMoteur } from "@/domain/configuration";
import type { EtatChoix, Nuit } from "@/domain/entrees";
import { INCONNU, type Plage, type Point, type Relectures, type Validite } from "@/domain/relectures";
import {
  CODES_REGLE,
  compterParRegle,
  estBloquante,
  validerProgramme,
  type CodeRegle,
  type ContexteValidation,
  type RapportValidation,
} from "@/domain/validation";
import { etapesVerrouilleesModifiees } from "@/domain/verrous";
import { controlerVersion, erreurDeVersion } from "@/domain/version";

/**
 * Validateurs R1 à R10 (spécification B5a ; décision 0045 § 11 : un cas conforme et un cas en violation par règle,
 * plus les sous-cas nommés par les critères). Jeux fabriqués ici ; les interfaces injectées sont des doubles à
 * **valeurs sentinelles** (aucune réponse réelle de Google).
 */

// --- Configuration et doubles ------------------------------------------------------------------------------

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
};

/** Valeurs sentinelles des doubles : aucune ne doit figurer dans un rapport. */
const SENTINELLES = {
  placeIds: ["SENTINELLE_PLACE_A", "SENTINELLE_PLACE_B", "SENTINELLE_PLACE_C", "SENTINELLE_PLACE_D", "SENTINELLE_PLACE_E", "SENTINELLE_PLACE_F"],
  logement: "SENTINELLE_PLACE_LOGEMENT",
  duree: 17,
  plage: { debut: 547, fin: 1433 } satisfies Plage,
  statuts: ["ferme_definitivement", "introuvable", "inconnu", "valide"],
};
const [PA, PB, PC, PD, PE, PF] = SENTINELLES.placeIds as [string, string, string, string, string, string];
const P_FERME = "SENTINELLE_PLACE_FERME";
const P_INTROUVABLE = "SENTINELLE_PLACE_INTROUVABLE";
const P_INCONNU = "SENTINELLE_PLACE_INCONNUE";
const P_HORAIRES_INCONNUS = "SENTINELLE_PLACE_HORAIRES_INCONNUS";
const P_SANS_TRAJET = "SENTINELLE_PLACE_SANS_TRAJET";

type Doubles = { validite?: Map<string, Validite>; plages?: Map<string, readonly Plage[] | typeof INCONNU>; lent?: boolean };

function relectures(doubles: Doubles = {}): Relectures {
  return {
    validite(placeId) {
      const forcee = doubles.validite?.get(placeId);
      if (forcee !== undefined) return forcee;
      if (placeId === P_FERME) return "ferme_definitivement";
      if (placeId === P_INTROUVABLE) return "introuvable";
      if (placeId === P_INCONNU) return INCONNU;
      return "valide";
    },
    plages(placeId) {
      const forcee = doubles.plages?.get(placeId);
      if (forcee !== undefined) return forcee;
      return placeId === P_HORAIRES_INCONNUS ? INCONNU : [SENTINELLES.plage];
    },
    duree(depuis: Point, vers: Point) {
      const lieux = [depuis, vers].flatMap((point) => ("lieu" in point ? [point.lieu] : []));
      if (lieux.includes(P_SANS_TRAJET)) return INCONNU;
      return { minutes: doubles.lent === true ? 600 : SENTINELLES.duree, estimee: false };
    },
  };
}

// --- Programme de référence, conforme à toutes les règles ----------------------------------------------------

const NUITS: Nuit[] = [
  { etiquette: "Logement de test", placeId: SENTINELLES.logement },
  { etiquette: "Logement de test", placeId: SENTINELLES.logement },
];
const source = (n: number) => ({ label: "guide.example", url: `https://guide.example/lieu-${n}` });

function etape(id: string, placeId: string | undefined, kind: Stop["kind"], start: string, end: string, cout: number, extra: Partial<Stop> = {}): Stop {
  return {
    id,
    kind,
    ...(placeId === undefined ? {} : { placeId }),
    name: `Lieu maison ${id}`,
    start,
    end,
    facts: { costPerPerson: cout },
    source: source(id.length),
    exceptions: [],
    locked: false,
    ...extra,
  };
}

const segment: DayLineItem = { type: "segment", segment: { mode: "walk", minutes: SENTINELLES.duree, estimated: false } };

/** J2 (jour complet) : quatre étapes, temps libre écrit, budget calculé, un événement, une idée. */
function jourDeReference(): Day {
  return {
    index: 2,
    date: "2026-11-24",
    items: [
      { type: "terminus", role: "start", time: "09:00", label: "Logement de test" },
      segment,
      { type: "stop", stop: etape("v1-j2-1", PA, "activity", "09:25", "10:55", 0) },
      { type: "free", from: "10:55", to: "11:35" },
      segment,
      { type: "stop", stop: etape("v1-j2-2", PB, "meal", "12:00", "13:15", 25) },
      segment,
      { type: "stop", stop: etape("v1-j2-3", PC, "activity", "13:40", "15:10", 12) },
      { type: "free", from: "15:10", to: "18:30" },
      segment,
      { type: "stop", stop: etape("v1-j2-4", PD, "meal", "19:00", "20:30", 40) },
      segment,
      { type: "terminus", role: "end", time: "20:50", label: "Logement de test" },
    ],
    budgetPerPerson: 87,
    events: [etape("v1-j2-e1", PE, "event", "21:00", "22:00", 10)],
    generating: false,
    travelMinutes: 5 * SENTINELLES.duree,
    travelBudgetMinutes: 90,
    surprise: { id: "v1-j2-idee", placeId: PF, name: "Idée maison", facts: {}, reason: "Raison maison.", source: source(9) },
  };
}

const CHOIX = new Map<string, EtatChoix>([
  ["v1-j2-2", "choisi"],
  ["v1-j2-4", "garde"],
]);

function contexte(modif: Partial<ContexteValidation> = {}): ContexteValidation {
  return {
    voyage: { start: "2026-11-23", end: "2026-11-25" },
    pace: "balanced",
    configuration: CONFIG,
    relectures: relectures(),
    modes: ["walk", "transit"],
    nuits: NUITS,
    evenementsNonRelus: new Set(),
    choix: CHOIX,
    ...modif,
  };
}

/** Remplace l'étape `id` du jour par `modif(étape)`. */
function avecEtape(jour: Day, id: string, modif: (stop: Stop) => Stop): Day {
  return { ...jour, items: jour.items.map((item) => (item.type === "stop" && item.stop.id === id ? { type: "stop", stop: modif(item.stop) } : item)) };
}

type Cas = { jours: Day[]; contexte: ContexteValidation };
const cas = (jour: Day, modif: Partial<ContexteValidation> = {}): Cas => ({ jours: [jour], contexte: contexte(modif) });
const rapportDe = (c: Cas): RapportValidation => validerProgramme(c.jours, c.contexte);
const reglesDe = (rapport: RapportValidation) => rapport.map((entree) => entree.regle);

// --- Table typée R1 à R10 (0045 § 11.3) : le compilateur refuse une règle oubliée -----------------------------

const verrouille = (jour: Day) => avecEtape(jour, "v1-j2-3", (stop) => ({ ...stop, locked: true }));

const TABLE: Record<CodeRegle, { conforme: () => Cas; violation: () => Cas }> = {
  R1: {
    conforme: () => cas(jourDeReference()),
    violation: () => cas(avecEtape(jourDeReference(), "v1-j2-1", (stop) => ({ ...stop, placeId: P_FERME }))),
  },
  R2: {
    // Date non relue mais signalée « à confirmer » : conforme.
    conforme: () =>
      cas(
        { ...jourDeReference(), events: [{ ...etape("v1-j2-e1", PE, "event", "21:00", "22:00", 10), exceptions: ["unconfirmed"] }] },
        { evenementsNonRelus: new Set(["v1-j2-e1"]) },
      ),
    violation: () => cas(jourDeReference(), { evenementsNonRelus: new Set(["v1-j2-e1"]) }),
  },
  R3: {
    conforme: () => cas(verrouille(jourDeReference()), { base: [verrouille(jourDeReference())] }),
    violation: () =>
      cas(avecEtape(verrouille(jourDeReference()), "v1-j2-3", (stop) => ({ ...stop, start: "13:45", end: "15:10" })), {
        base: [verrouille(jourDeReference())],
      }),
  },
  R4: {
    conforme: () => cas(jourDeReference()),
    violation: () => cas(jourDeReference(), { relectures: relectures({ plages: new Map([[PA, [{ debut: 600, fin: 1080 }]]]) }) }),
  },
  R5: {
    conforme: () => cas(jourDeReference()),
    violation: () => cas(avecEtape(jourDeReference(), "v1-j2-3", (stop) => ({ ...stop, start: "13:20", end: "14:50" }))),
  },
  R6: {
    conforme: () => cas(jourDeReference()),
    violation: () => {
      const jour = jourDeReference();
      return cas({ ...jour, items: jour.items.map((item) => (item.type === "terminus" && item.role === "end" ? { ...item, label: "Autre logement" } : item)) });
    },
  },
  R7: {
    conforme: () => cas(jourDeReference()),
    violation: () => cas(jourDeReference(), { choix: new Map([["v1-j2-2", "choisi"]]) }),
  },
  R8: {
    conforme: () => cas(jourDeReference()),
    violation: () => {
      const jour = jourDeReference();
      // Le temps libre écrit entre le dîner et la seconde activité disparaît : trou de plus de 30 min.
      return cas({ ...jour, items: jour.items.filter((item) => !(item.type === "free" && item.from === "15:10")) });
    },
  },
  R9: {
    conforme: () => cas(jourDeReference()),
    violation: () => cas({ ...jourDeReference(), budgetPerPerson: 80 }),
  },
  R10: {
    conforme: () => cas(jourDeReference(), { versions: { base: 4, courante: 4 } }),
    violation: () => cas(jourDeReference(), { versions: { base: 3, courante: 4 } }),
  },
};

describe("validation: table des règles R1 à R10 (un cas conforme, un cas en violation)", () => {
  it("la table couvre exactement R1 à R10", () => {
    expect(Object.keys(TABLE)).toEqual([...CODES_REGLE]);
  });

  for (const regle of CODES_REGLE) {
    it(`${regle} : le cas conforme ne produit aucune entrée, le cas en violation produit une entrée ${regle}`, () => {
      const { conforme, violation } = TABLE[regle as keyof typeof TABLE];
      expect(rapportDe(conforme())).toEqual([]);
      expect(reglesDe(rapportDe(violation()))).toContain(regle);
    });
  }
});

describe("validation: R1 lieu ancré et sourcé", () => {
  const r1 = (c: Cas) => rapportDe(c).filter((entree) => entree.regle === "R1");

  it("étape choisie par le moteur : sans placeId, fermée, introuvable, validité inconnue ou sans source https : violation", () => {
    for (const modif of [
      (stop: Stop): Stop => ({ ...stop, placeId: undefined }),
      (stop: Stop): Stop => ({ ...stop, placeId: P_FERME }),
      (stop: Stop): Stop => ({ ...stop, placeId: P_INTROUVABLE }),
      (stop: Stop): Stop => ({ ...stop, placeId: P_INCONNU }),
      (stop: Stop): Stop => ({ ...stop, source: undefined }),
      (stop: Stop): Stop => ({ ...stop, source: { label: "x", url: "http://guide.example/x" } }),
    ]) {
      expect(r1(cas(avecEtape(jourDeReference(), "v1-j2-1", modif)))).toEqual([{ regle: "R1", etape: "v1-j2-1" }]);
    }
  });

  it("l'idée « Surprends-moi » et les événements suivent la même règle", () => {
    const jour = jourDeReference();
    const surprise = { ...(jour.surprise as NonNullable<Day["surprise"]>), placeId: P_FERME };
    expect(r1(cas({ ...jour, surprise }))).toEqual([{ regle: "R1", etape: "v1-j2-idee" }]);
    const sansLieu = { ...etape("v1-j2-e1", undefined, "event", "21:00", "22:00", 10) };
    expect(r1(cas({ ...jour, events: [sansLieu] }))).toEqual([{ regle: "R1", etape: "v1-j2-e1" }]);
    // Règle de P0 (adaptateur de scripts/p0 seulement) : un événement non ancré garde sa source.
    expect(r1(cas({ ...jour, events: [sansLieu] }, { porteeR1: { evenementsSansLieu: "admis" } }))).toEqual([]);
  });

  it("un engagement n'est pas contrôlé", () => {
    const engagement = avecEtape(jourDeReference(), "v1-j2-1", (stop) => ({ ...stop, placeId: undefined, source: undefined, commitment: "ticket", locked: true }));
    expect(r1(cas(engagement))).toEqual([]);
  });

  it("une étape ajoutée par la personne suit la portée B5-PO-4 (paramètre, valeur provisoire : lieu contrôlé s'il existe, sans source)", () => {
    const ajout = avecEtape(jourDeReference(), "v1-j2-1", (stop) => ({ ...stop, source: undefined }));
    const ajouts = new Set(["v1-j2-1"]);
    expect(r1(cas(ajout, { ajouts }))).toEqual([]);
    expect(r1(cas(avecEtape(ajout, "v1-j2-1", (stop) => ({ ...stop, placeId: P_FERME })), { ajouts }))).toEqual([{ regle: "R1", etape: "v1-j2-1" }]);
    expect(r1(cas(avecEtape(ajout, "v1-j2-1", (stop) => ({ ...stop, placeId: undefined })), { ajouts }))).toEqual([]);
    expect(r1(cas(ajout, { ajouts, porteeR1: { ajouts: "complete" } }))).toEqual([{ regle: "R1", etape: "v1-j2-1" }]);
    expect(r1(cas(avecEtape(ajout, "v1-j2-1", (stop) => ({ ...stop, placeId: P_FERME })), { ajouts, porteeR1: { ajouts: "aucune" } }))).toEqual([]);
  });
});

describe("validation: R2 événement dans les dates et date relue", () => {
  const r2 = (c: Cas) => rapportDe(c).filter((entree) => entree.regle === "R2");

  it("un événement hors des dates du séjour est une violation", () => {
    expect(r2(cas({ ...jourDeReference(), date: "2026-11-27" }))).toEqual([{ regle: "R2", etape: "v1-j2-e1" }]);
  });

  it("un événement dont la date n'est pas relue est une violation sans « unconfirmed », conforme avec", () => {
    const nonRelus = new Set(["v1-j2-e1"]);
    expect(r2(cas(jourDeReference(), { evenementsNonRelus: nonRelus }))).toEqual([{ regle: "R2", etape: "v1-j2-e1" }]);
    const marque = { ...jourDeReference(), events: [{ ...etape("v1-j2-e1", PE, "event", "21:00", "22:00", 10), exceptions: ["unconfirmed" as const] }] };
    expect(r2(cas(marque, { evenementsNonRelus: nonRelus }))).toEqual([]);
  });
});

describe("validation: R3 étapes verrouillées inchangées", () => {
  const base = () => [verrouille(jourDeReference())];
  const r3 = (brouillon: Day[], depart: Day[] = base()) => etapesVerrouilleesModifiees(depart, brouillon);

  it("étape verrouillée déplacée (heure ou jour), supprimée, copiée dans un autre jour, renommée, ou changée de lieu : violation", () => {
    const jour = verrouille(jourDeReference());
    expect(r3([avecEtape(jour, "v1-j2-3", (stop) => ({ ...stop, start: "14:00" }))])).toEqual(["v1-j2-3"]);
    expect(r3([avecEtape(jour, "v1-j2-3", (stop) => ({ ...stop, end: "15:30" }))])).toEqual(["v1-j2-3"]);
    expect(r3([{ ...jour, items: jour.items.filter((item) => !(item.type === "stop" && item.stop.id === "v1-j2-3")) }])).toEqual(["v1-j2-3"]);
    expect(r3([avecEtape(jour, "v1-j2-3", (stop) => ({ ...stop, name: "Autre nom" }))])).toEqual(["v1-j2-3"]);
    expect(r3([avecEtape(jour, "v1-j2-3", (stop) => ({ ...stop, placeId: PE }))])).toEqual(["v1-j2-3"]);
    // Changement de jour : retirée du J2 touché, ajoutée au J3.
    const sans = { ...jour, items: jour.items.filter((item) => !(item.type === "stop" && item.stop.id === "v1-j2-3")) };
    const j3: Day = { ...jourDeReference(), index: 3, date: "2026-11-25", items: [...jour.items.filter((item) => item.type === "stop" && item.stop.id === "v1-j2-3")] };
    expect(r3([sans, j3])).toEqual(["v1-j2-3"]);
    // Copiée dans un autre jour touché alors que son jour ne l'est pas.
    expect(r3([j3])).toEqual(["v1-j2-3"]);
    expect(reglesDe(rapportDe(cas(avecEtape(jour, "v1-j2-3", (stop) => ({ ...stop, placeId: PE })), { base: base() })))).toContain("R3");
  });

  it("seules les étapes locked: true sont contrôlées : engagement verrouillé contrôlé, engagement déverrouillé non, verrouillée sans commitment contrôlée", () => {
    const engagement = (locked: boolean) =>
      avecEtape(jourDeReference(), "v1-j2-1", (stop) => ({ ...stop, commitment: "reservation", locked }));
    const deplace = (jour: Day) => avecEtape(jour, "v1-j2-1", (stop) => ({ ...stop, start: "09:45" }));
    expect(r3([deplace(engagement(true))], [engagement(true)])).toEqual(["v1-j2-1"]);
    expect(r3([deplace(engagement(false))], [engagement(false)])).toEqual([]);
    expect(r3([avecEtape(verrouille(jourDeReference()), "v1-j2-3", (stop) => ({ ...stop, start: "14:00" }))])).toEqual(["v1-j2-3"]);
    expect(r3([avecEtape(jourDeReference(), "v1-j2-1", (stop) => ({ ...stop, start: "09:45" }))], [jourDeReference()])).toEqual([]);
  });
});

describe("validation: R4 horaires d'ouverture", () => {
  const r4 = (c: Cas) => rapportDe(c).filter((entree) => entree.regle === "R4");

  it("étape hors d'une plage connue : violation", () => {
    const etroite = relectures({ plages: new Map([[PA, [{ debut: 600, fin: 1080 }]]]) });
    expect(r4(cas(jourDeReference(), { relectures: etroite }))).toEqual([{ regle: "R4", etape: "v1-j2-1" }]);
  });

  it("plage inconnue : conforme, marquée toConfirm en mémoire (B5-PO-5)", () => {
    const jour = avecEtape(jourDeReference(), "v1-j2-1", (stop) => ({ ...stop, placeId: P_HORAIRES_INCONNUS }));
    expect(r4(cas(jour))).toEqual([]);
    const stop = jour.items.find((item) => item.type === "stop" && item.stop.id === "v1-j2-1");
    expect(stop?.type === "stop" && aConfirmer(stop.stop, jour.date, relectures())).toBe(true);
    expect(stop?.type === "stop" && stop.stop.exceptions).toEqual([]);
  });

  it("étape verrouillée ou engagement hors des heures connues : reste conforme, marqué toConfirm", () => {
    const etroite = relectures({ plages: new Map([[PA, [{ debut: 600, fin: 1080 }]]]) });
    const jour = avecEtape(jourDeReference(), "v1-j2-1", (stop) => ({ ...stop, locked: true }));
    expect(r4(cas(jour, { relectures: etroite }))).toEqual([]);
    const stop = jour.items.find((item) => item.type === "stop" && item.stop.id === "v1-j2-1");
    expect(stop?.type === "stop" && aConfirmer(stop.stop, jour.date, etroite)).toBe(true);
  });
});

describe("validation: R5 trajets faisables avec marge", () => {
  const r5 = (c: Cas) => rapportDe(c).filter((entree) => entree.regle === "R5");

  it("départ de l'étape suivante avant la fin de la précédente plus la durée fournie plus la marge : violation", () => {
    // Fin 13:15, trajet 17, marge 5 : 13:37 au plus tôt.
    expect(r5(cas(avecEtape(jourDeReference(), "v1-j2-3", (stop) => ({ ...stop, start: "13:36", end: "15:10" }))))).toEqual([{ regle: "R5", etape: "v1-j2-3" }]);
    expect(r5(cas(avecEtape(jourDeReference(), "v1-j2-3", (stop) => ({ ...stop, start: "13:37", end: "15:10" }))))).toEqual([]);
  });

  it("trajet sans durée connue pour aucun mode admis : violation", () => {
    expect(r5(cas(avecEtape(jourDeReference(), "v1-j2-3", (stop) => ({ ...stop, placeId: P_SANS_TRAJET }))))).toEqual([
      // Les deux trajets qui touchent ce lieu (arrivée sur l'étape 3, puis départ vers l'étape 4) sont inconnus.
      { regle: "R5", etape: "v1-j2-3" },
      { regle: "R5", etape: "v1-j2-4" },
    ]);
  });

  it("deux étapes verrouillées incompatibles : signalées, sans bloquer ; une étape non verrouillée trop proche bloque", () => {
    const serre = (locked: boolean) =>
      avecEtape(
        avecEtape(jourDeReference(), "v1-j2-2", (stop) => ({ ...stop, locked: true })),
        "v1-j2-3",
        (stop) => ({ ...stop, start: "13:20", end: "14:50", locked }),
      );
    for (const [locked, bloquant] of [
      [true, false],
      [false, true],
    ] as const) {
      const jours = [serre(locked)];
      const entrees = rapportDe({ jours, contexte: contexte() }).filter((entree) => entree.regle === "R5");
      expect(entrees).toEqual([{ regle: "R5", etape: "v1-j2-3" }]);
      expect(entrees.every((entree) => estBloquante(entree, jours) === bloquant)).toBe(true);
    }
  });
});

describe("validation: R6 logement du jour", () => {
  const r6 = (c: Cas) => rapportDe(c).filter((entree) => entree.regle === "R6");
  const autreTerminus = (jour: Day, role: "start" | "end", label: string): Day => ({
    ...jour,
    items: jour.items.map((item) => (item.type === "terminus" && item.role === role ? { ...item, label } : item)),
  });

  it("jour qui ne commence pas par le terminus start du bon logement, ou ne finit pas par le terminus end du bon logement", () => {
    expect(r6(cas(autreTerminus(jourDeReference(), "start", "Autre logement")))).toEqual([{ regle: "R6", jour: 2 }]);
    expect(r6(cas(autreTerminus(jourDeReference(), "end", "Autre logement")))).toEqual([{ regle: "R6", jour: 2 }]);
    const jour = jourDeReference();
    expect(r6(cas({ ...jour, items: jour.items.slice(1) }))).toEqual([{ regle: "R6", jour: 2 }]);
  });

  it("jour de changement de logement : part de l'ancien, finit au nouveau (B5-PO-7)", () => {
    const nuits: Nuit[] = [{ etiquette: "Hôtel A" }, { etiquette: "Hôtel B", placeId: SENTINELLES.logement }];
    const changement = autreTerminus(autreTerminus(jourDeReference(), "start", "Hôtel A"), "end", "Hôtel B");
    expect(r6(cas(changement, { nuits }))).toEqual([]);
    expect(r6(cas(autreTerminus(changement, "end", "Hôtel A"), { nuits }))).toEqual([{ regle: "R6", jour: 2 }]);
  });
});

describe("validation: R7 aucun repas ni soirée sans choix", () => {
  const r7 = (c: Cas) => rapportDe(c).filter((entree) => entree.regle === "R7");

  it("une étape de repas ou de soirée sans état admis (B5-PO-8) est une violation", () => {
    expect(r7(cas(jourDeReference(), { choix: new Map() }))).toEqual([
      { regle: "R7", etape: "v1-j2-2" },
      { regle: "R7", etape: "v1-j2-4" },
    ]);
    const soiree = avecEtape(jourDeReference(), "v1-j2-4", (stop) => ({ ...stop, kind: "activity", start: "20:35", end: "22:00" }));
    expect(r7(cas(soiree, { choix: new Map([["v1-j2-2", "garde"]]) }))).toEqual([{ regle: "R7", etape: "v1-j2-4" }]);
  });

  it("états admis : choisie, gardée, engagement, ajoutée par la personne", () => {
    for (const etat of ["choisi", "garde", "engagement", "ajout"] as const) {
      expect(r7(cas(jourDeReference(), { choix: new Map([["v1-j2-2", etat], ["v1-j2-4", etat]]) }))).toEqual([]);
    }
    const engagement = avecEtape(avecEtape(jourDeReference(), "v1-j2-2", (stop) => ({ ...stop, commitment: "reservation" })), "v1-j2-4", (stop) => stop);
    expect(r7(cas(engagement, { choix: new Map([["v1-j2-4", "choisi"]]) }))).toEqual([]);
    expect(r7(cas(jourDeReference(), { choix: new Map(), ajouts: new Set(["v1-j2-2", "v1-j2-4"]) }))).toEqual([]);
  });
});

describe("validation: R8 rythme et temps libre", () => {
  const r8 = (c: Cas) => rapportDe(c).filter((entree) => entree.regle === "R8");

  it("plus d'activités que le rythme n'en admet (plus une soirée) : violation", () => {
    const jour = jourDeReference();
    const premiere = jour.items.at(2) as DayLineItem;
    const items = [...jour.items];
    items.splice(2, 0, premiere, premiere, premiere);
    expect(r8(cas({ ...jour, items }, { pace: "relaxed" }))).toContainEqual({ regle: "R8", jour: 2 });
  });

  it("temps libre sous le minimum d'un jour complet : violation ; jour d'arrivée ou de départ non contrôlé", () => {
    expect(r8(cas(jourDeReference(), { relectures: relectures({ lent: true }) }))).toContainEqual({ regle: "R8", jour: 2 });
    expect(r8(cas(jourDeReference(), { pace: "relaxed", relectures: relectures({ lent: false }) }))).toEqual([]);
    const arrivee = { ...jourDeReference(), date: "2026-11-23" };
    expect(r8(cas(arrivee, { relectures: relectures({ lent: true }) }))).toEqual([]);
    const depart = { ...jourDeReference(), date: "2026-11-25" };
    expect(r8(cas(depart, { relectures: relectures({ lent: true }) }))).toEqual([]);
  });

  it("trou de 30 min ou plus non écrit comme temps libre : violation (B5-PO-9)", () => {
    const jour = jourDeReference();
    expect(r8(cas({ ...jour, items: jour.items.filter((item) => item.type !== "free") }))).toEqual([{ regle: "R8", jour: 2 }]);
  });
});

describe("validation: R9 budget calculé et distinct", () => {
  const r9 = (c: Cas) => rapportDe(c).filter((entree) => entree.regle === "R9");

  it("budgetPerPerson égal à la somme des coûts quand tous sont connus, absent sinon", () => {
    expect(r9(cas(jourDeReference()))).toEqual([]);
    expect(r9(cas({ ...jourDeReference(), budgetPerPerson: 80 }))).toEqual([{ regle: "R9", jour: 2 }]);
    const inconnu = avecEtape(jourDeReference(), "v1-j2-1", (stop) => ({ ...stop, facts: {} }));
    expect(r9(cas(inconnu))).toEqual([{ regle: "R9", jour: 2 }]);
    const { budgetPerPerson: _absent, ...sansBudget } = inconnu;
    void _absent;
    expect(r9(cas(sansBudget))).toEqual([]);
  });

  it("mealBudgetPerPerson du brief ne change jamais le budget calculé (il n'est pas une entrée du validateur)", () => {
    // Le contexte de validation n'a pas de brief : le budget ne dépend que des coûts des étapes et des événements.
    expect(Object.keys(contexte())).not.toContain("brief");
    expect(r9(cas(jourDeReference()))).toEqual([]);
  });
});

describe("validation: R10 patch sur sa version de base", () => {
  it("même version : conforme ; baseVersion différente de la version courante : refus version_conflict avec currentVersion", () => {
    expect(controlerVersion(4, 4)).toEqual({ ok: true });
    const refus = controlerVersion(3, 4);
    expect(refus).toEqual({ ok: false, code: "version_conflict", currentVersion: 4 });
    if (refus.ok) throw new Error("refus attendu");
    const erreur = erreurDeVersion(refus);
    expect(ApiErrorSchema.safeParse(erreur).success).toBe(true);
    expect(erreur).toEqual({ code: "version_conflict", retryable: true, currentVersion: 4 });
    expect(rapportDe(cas(jourDeReference(), { versions: { base: 3, courante: 4 } }))).toEqual([{ regle: "R10" }]);
  });
});

/** Liste interdite du handover back-end § 8 (« workflows : aucune donnée Google dans l'état sérialisé »). */
const CLES_INTERDITES = [
  "rating", "userRatingCount", "openingHours", "regularOpeningHours", "currentOpeningHours", "businessStatus", "priceLevel",
  "photos", "phone", "nationalPhoneNumber", "internationalPhoneNumber", "address", "formattedAddress", "displayName", "reviews",
  "lat", "lng", "latitude", "longitude", "location", "viewport", "duration", "staticDuration", "distanceMeters", "polyline",
];

describe("validation: le rapport ne contient que des codes et des identifiants", () => {
  it("rapport d'un programme en violation sur chaque règle : aucune valeur sentinelle des doubles, aucune clé interdite", () => {
    const rapport = CODES_REGLE.flatMap((regle) => rapportDe(TABLE[regle as keyof typeof TABLE].violation()));
    expect(new Set(reglesDe(rapport))).toEqual(new Set(CODES_REGLE));
    const texte = JSON.stringify(rapport);
    for (const sentinelle of [
      ...SENTINELLES.placeIds,
      SENTINELLES.logement,
      "SENTINELLE",
      String(SENTINELLES.duree),
      String(SENTINELLES.plage.debut),
      String(SENTINELLES.plage.fin),
      "09:07",
      "23:53",
      ...SENTINELLES.statuts,
    ]) {
      expect(texte, sentinelle).not.toContain(sentinelle);
    }
    for (const entree of rapport) {
      for (const cle of Object.keys(entree)) {
        expect(["regle", "etape", "jour"]).toContain(cle);
        expect(CLES_INTERDITES).not.toContain(cle);
      }
    }
    expect(Object.values(compterParRegle(rapport)).every((n) => n >= 1)).toBe(true);
  });
});
