// @vitest-environment node
import { describe, expect, it } from "vitest";

import { TripSnapshotSchema, type DaySnapshot, type StopSnapshot, type TripCommitment, type TripSnapshot } from "@/contracts";

import type { ConfigClassement } from "@/domain/classement";
import type { ConfigurationMoteur } from "@/domain/configuration";
import type { CandidatEvenement, CandidatIdee, CandidatMoteur, EntreeMoteur, EtatChoix, Nuit } from "@/domain/entrees";
import { generer, replanifierJour, type ResultatGeneration } from "@/domain/generation";
import { estJourNonPlanifie, pointsDesJours } from "@/domain/jours-planifies";
import { INCONNU, memePoint, type ModeTrajet, type Plage, type Point, type Relectures } from "@/domain/relectures";
import { squeletteAvecEngagements } from "@/domain/squelette";
import { versMinutes } from "@/domain/temps";
import { estBloquante } from "@/domain/validation";
import { etapesVerrouilleesModifiees } from "@/domain/verrous";

/**
 * Moteur sans IA, sous-tâche B5b (décision 0041) : squelette, planification, événements et idée, réparation et
 * sortie d'écriture. Jeux fabriqués ici ; doubles des interfaces à valeurs sentinelles (durées 37 et 41 min, plage
 * 547–1433, `placeId` `SENTINELLE_PLACE_*`), jamais tirés d'une réponse réelle.
 */

const CONFIG: ConfigurationMoteur = {
  schema: 1,
  budgetTrajetParRythme: { relaxed: 60, balanced: 90, intense: 150 },
  activitesParRythme: { relaxed: 2, balanced: 3, intense: 4 },
  tempsLibreMinParRythme: { relaxed: 120, balanced: 60, intense: 30 },
  // Fin à 23:00 : la soirée (20:30 + 90 min) laisse le retour (37 min, double) et la marge.
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

const SENTINELLES = {
  marche: 41,
  transports: 37,
  plage: { debut: 547, fin: 1433 } satisfies Plage,
  logement: "SENTINELLE_PLACE_LOGEMENT",
  loin: "SENTINELLE_PLACE_LOIN",
};
const place = (id: string) => `SENTINELLE_PLACE_${id.toUpperCase()}`;

type Doubles = { plages?: (placeId: string, date: string) => readonly Plage[] | typeof INCONNU | undefined };

function relectures(doubles: Doubles = {}): Relectures {
  return {
    validite: (placeId) => (placeId === place("ferme") ? "ferme_definitivement" : "valide"),
    plages: (placeId, date) => doubles.plages?.(placeId, date) ?? [SENTINELLES.plage],
    duree(depuis: Point, vers: Point, mode: ModeTrajet) {
      const mesure = (minutes: number) => ({ minutes, estimee: false });
      if (memePoint(depuis, vers)) return mesure(0);
      const lieux = [depuis, vers].flatMap((point) => ("lieu" in point ? [point.lieu] : []));
      if (lieux.includes(SENTINELLES.loin)) return mesure(600);
      if (mode === "walk") return mesure(SENTINELLES.marche);
      if (mode === "transit") return mesure(SENTINELLES.transports);
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

const ACTIVITES = ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8", "a9"].map((id) => candidat(id, "activity"));
const REPAS = ["m1", "m2", "m3", "m4", "m5", "m6"].map((id) => candidat(id, "meal"));
const SOIREES = ["s1", "s2"].map((id) =>
  candidat(id, "activity", { notes: { matchesWishes: true, notForMeRisk: 1, mustSee: false, slotFit: ["evening"] } }),
);
const TOUS_CHOISIS = new Map<string, EtatChoix>([...REPAS, ...SOIREES].map((c) => [c.id, "choisi"]));

const VOLS: TripCommitment[] = [
  { kind: "flight", label: "Arrivée", date: "2026-11-23", start: "08:10", end: "11:40" },
  { kind: "flight", label: "Départ", date: "2026-11-25", start: "17:00" },
];
const NUITS: Nuit[] = [
  { etiquette: "Logement de test", placeId: SENTINELLES.logement },
  { etiquette: "Logement de test", placeId: SENTINELLES.logement },
];

function entree(modif: Partial<EntreeMoteur> = {}): EntreeMoteur {
  return {
    voyage: { destination: "Édimbourg", start: "2026-11-23", end: "2026-11-25", timeZone: "Europe/London", travellers: { adults: 2, children: 0 } },
    brief: { travellers: { adults: 2, children: 0 }, pace: "balanced", wishes: ["museum"], limits: [], mobility: ["walk", "transit"], inferredFields: [] },
    nuits: NUITS,
    engagements: VOLS,
    candidats: [...ACTIVITES, ...REPAS, ...SOIREES],
    evenements: [],
    idees: [],
    choix: TOUS_CHOISIS,
    configuration: CONFIG,
    classement: { formule: FORMULE, ageSourceMaxJours: 365 },
    relectures: relectures(),
    dateReference: "2026-10-13",
    version: 3,
    budgetTrajetReduit: false,
    ...modif,
  };
}

function reussi(resultat: ResultatGeneration): TripSnapshot {
  if (!resultat.ok) throw new Error(`génération refusée : ${resultat.code}`);
  return resultat.instantane;
}

const etapes = (jour: DaySnapshot): StopSnapshot[] => jour.items.flatMap((item) => (item.type === "stop" ? [item.stop] : []));
const jourN = (instantane: TripSnapshot, index: number): DaySnapshot => {
  const jour = instantane.days.find((d) => d.index === index);
  if (jour === undefined) throw new Error(`jour ${index} absent`);
  return jour;
};
const estSoiree = (stop: StopSnapshot) => stop.kind === "activity" && versMinutes(stop.start) >= versMinutes(CONFIG.debutSoiree);

describe("moteur: squelette selon le rythme", () => {
  it("créneaux d'activités par rythme, soirée sauf rythme relaxed et dernier jour (B5-PO-1)", () => {
    for (const [pace, activites] of [
      ["relaxed", 2],
      ["balanced", 3],
      ["intense", 4],
    ] as const) {
      const jours = squeletteAvecEngagements({
        voyage: { start: "2026-11-23", end: "2026-11-25" },
        pace,
        nombreDeNuits: 2,
        engagements: VOLS,
        configuration: CONFIG,
        budgetTrajetReduit: false,
      });
      const complet = jours.at(1);
      expect(complet?.creneaux.filter((c) => c.type === "activity")).toHaveLength(activites);
      expect(complet?.creneaux.filter((c) => c.type === "meal")).toHaveLength(2);
      expect(complet?.creneaux.some((c) => c.type === "evening")).toBe(pace !== "relaxed");
      expect(jours.at(-1)?.creneaux.some((c) => c.type === "evening")).toBe(false);
    }
  });

  it("jour d'arrivée et jour de départ bornés par les vols ; sans vol, fenêtre du jour (B5-PO-7, B5-PO-12)", () => {
    const base = { voyage: { start: "2026-11-23", end: "2026-11-25" }, pace: "balanced", nombreDeNuits: 2, configuration: CONFIG, budgetTrajetReduit: false } as const;
    const avecVols = squeletteAvecEngagements({ ...base, engagements: VOLS });
    expect([avecVols.at(0)?.debut, avecVols.at(-1)?.fin]).toEqual([versMinutes("11:40"), versMinutes("17:00")]);
    const sansVol = squeletteAvecEngagements({ ...base, engagements: [] });
    expect([sansVol.at(0)?.debut, sansVol.at(-1)?.fin]).toEqual([versMinutes("09:00"), versMinutes("23:00")]);
  });

  it("le programme généré respecte le rythme : jour complet à 3 activités et une soirée (balanced)", () => {
    const instantane = reussi(generer(entree()));
    const complet = etapes(jourN(instantane, 2));
    expect(complet.filter((s) => s.kind === "activity" && !estSoiree(s))).toHaveLength(3);
    expect(complet.filter(estSoiree)).toHaveLength(1);
    expect(etapes(jourN(instantane, 3)).some(estSoiree)).toBe(false);
    expect(jourN(instantane, 1).items.at(0)).toMatchObject({ type: "terminus", role: "start", time: "11:40" });
    const dernier = jourN(instantane, 3).items.at(-1);
    expect(dernier?.type === "terminus" && versMinutes(dernier.time) <= versMinutes("17:00")).toBe(true);
    expect(instantane.days.map((d) => d.travelBudgetMinutes)).toEqual([90, 90, 90]);
  });
});

describe("moteur: engagements posés et verrouillés", () => {
  const engagements: TripCommitment[] = [
    ...VOLS,
    { kind: "ticket", label: "Billet du château", date: "2026-11-24", start: "10:00", end: "11:30" },
    { kind: "booking", label: "Table réservée", date: "2026-11-24", start: "19:00" },
    { kind: "booking", label: "Atelier réservé", date: "2026-11-23", start: "15:00", end: "16:00" },
  ];

  it("ticket et booking deviennent des étapes verrouillées à leur date et heure, avec commitment", () => {
    const instantane = reussi(generer(entree({ engagements })));
    const j2 = etapes(jourN(instantane, 2));
    expect(j2.find((s) => s.name === "Billet du château")).toMatchObject({
      kind: "activity",
      start: "10:00",
      end: "11:30",
      locked: true,
      commitment: "ticket",
    });
    expect(j2.find((s) => s.name === "Table réservée")).toMatchObject({ kind: "meal", start: "19:00", locked: true, commitment: "reservation" });
    expect(etapes(jourN(instantane, 1)).find((s) => s.name === "Atelier réservé")).toMatchObject({
      kind: "activity",
      start: "15:00",
      locked: true,
      commitment: "reservation",
    });
    // Un engagement n'a ni lieu ni source inventés.
    for (const stop of [...j2, ...etapes(jourN(instantane, 1))].filter((s) => s.commitment !== undefined)) {
      expect(stop.placeId).toBeUndefined();
      expect(stop.source).toBeUndefined();
    }
  });

  it("un booking dans une fenêtre de repas prend la place de ce repas", () => {
    const instantane = reussi(generer(entree({ engagements })));
    const j2 = jourN(instantane, 2);
    const diners = etapes(j2).filter((s) => s.kind === "meal" && versMinutes(s.start) >= versMinutes("18:30"));
    expect(diners.map((s) => s.name)).toEqual(["Table réservée"]);
    expect(j2.items.some((item) => item.type === "openMeal" && item.meal === "dinner")).toBe(false);
  });

  it("un flight borne la journée et n'est pas une étape", () => {
    const instantane = reussi(generer(entree({ engagements })));
    const noms = instantane.days.flatMap((d) => etapes(d).map((s) => s.name));
    expect(noms).not.toContain("Arrivée");
    expect(noms).not.toContain("Départ");
    for (const stop of etapes(jourN(instantane, 1))) expect(versMinutes(stop.start)).toBeGreaterThanOrEqual(versMinutes("11:40"));
    for (const stop of etapes(jourN(instantane, 3))) expect(versMinutes(stop.end ?? stop.start)).toBeLessThanOrEqual(versMinutes("17:00"));
  });
});

describe("moteur: événements et idée du jour", () => {
  function evenement(id: string, date: string, heure: string | undefined, dateRelue: boolean): CandidatEvenement {
    const base = candidat(id, "activity");
    return {
      id,
      nom: base.nom,
      resume: base.resume,
      categorie: "museum",
      faits: { costPerPerson: 15 },
      sources: base.sources,
      placeId: place(id),
      aReserver: false,
      evenement: { date, ...(heure === undefined ? {} : { heure }), dateRelue },
    };
  }
  function idee(id: string, extra: Partial<CandidatIdee> = {}, sansLieu = false): CandidatIdee {
    const base = candidat(id, "activity");
    return {
      id,
      nom: base.nom,
      resume: base.resume,
      categorie: "museum",
      faits: {},
      sources: base.sources,
      notes: base.notes,
      ...(sansLieu ? {} : { placeId: place(id) }),
      aReserver: false,
      raison: `Raison maison ${id}.`,
      ...extra,
    };
  }
  const evenements = [
    evenement("ev-non-relu", "2026-11-24", "21:00", false),
    evenement("ev-relu", "2026-11-24", "19:30", true),
    evenement("ev-hors-dates", "2026-11-30", "20:00", true),
    evenement("ev-sans-heure", "2026-11-24", undefined, true),
  ];

  it("hors des dates ou sans heure : écarté ; date non relue : unconfirmed ; relue : sans exception", () => {
    const instantane = reussi(generer(entree({ evenements })));
    const events = jourN(instantane, 2).events;
    expect(events.map((e) => e.name)).toEqual(["Lieu maison ev-non-relu", "Lieu maison ev-relu"]);
    expect(events.at(0)?.exceptions).toEqual(["unconfirmed"]);
    expect(events.at(1)?.exceptions).toEqual([]);
    const tous = instantane.days.flatMap((d) => d.events.map((e) => e.name));
    expect(tous).not.toContain("Lieu maison ev-hors-dates");
    expect(tous).not.toContain("Lieu maison ev-sans-heure");
    expect(events.map((e) => e.id)).toEqual(["v3-j2-e1", "v3-j2-e2"]);
  });

  it("idée retenue : placeId, raison et source https ; sans source ou sans placeId, jamais retenue", () => {
    const sansSource = idee("i-sans-source", { sources: [] });
    const sansPlace = idee("i-sans-lieu", { notes: { matchesWishes: true, notForMeRisk: 1, mustSee: true, slotFit: ["activity"] } }, true);
    const instantane = reussi(generer(entree({ idees: [sansSource, sansPlace, idee("i-bonne")] })));
    const surprises = instantane.days.flatMap((d) => (d.surprise === undefined ? [] : [d.surprise]));
    expect(surprises).toHaveLength(1);
    expect(surprises.at(0)).toMatchObject({ placeId: place("i-bonne"), reason: "Raison maison i-bonne.", source: { url: "https://guide.example/i-bonne" } });
    const seulementMauvaises = reussi(generer(entree({ idees: [sansSource, sansPlace] })));
    expect(seulementMauvaises.days.every((d) => d.surprise === undefined)).toBe(true);
  });

  it("ni les événements ni l'idée ne figurent dans items ; la sortie passe TripSnapshotSchema", () => {
    const instantane = reussi(generer(entree({ evenements, idees: [idee("i-bonne")] })));
    const ids = new Set(instantane.days.flatMap((d) => etapes(d).map((s) => s.placeId)));
    expect(ids.has(place("ev-relu"))).toBe(false);
    expect(ids.has(place("i-bonne"))).toBe(false);
    expect(TripSnapshotSchema.safeParse(instantane).success).toBe(true);
  });
});

describe("moteur: réparation par l'option suivante, sans modèle", () => {
  const incontournable = (id: string, extra: Partial<CandidatMoteur> = {}) =>
    candidat(id, "activity", { notes: { matchesWishes: true, notForMeRisk: 1, mustSee: true, slotFit: ["activity"] }, ...extra });

  it("un candidat fermé ce jour-là, ou trop loin pour la marge, est remplacé par le suivant du classement", () => {
    const ferme = incontournable("x-ferme");
    const loin = incontournable("x-loin", { placeId: SENTINELLES.loin });
    const instantane = reussi(
      generer(
        entree({
          candidats: [ferme, loin, ...ACTIVITES, ...REPAS],
          relectures: relectures({ plages: (placeId) => (placeId === place("x-ferme") ? [] : undefined) }),
        }),
      ),
    );
    const lieux = instantane.days.flatMap((d) => etapes(d).map((s) => s.placeId));
    expect(lieux).not.toContain(place("x-ferme"));
    expect(lieux).not.toContain(SENTINELLES.loin);
    // Le suivant du classement (a1, premier à score égal) prend le premier créneau du voyage.
    expect(etapes(jourN(instantane, 1)).at(0)?.placeId).toBe(place("a1"));
  });

  it("sans suivant : repas en openMeal, activité en temps libre", () => {
    const instantane = reussi(generer(entree({ candidats: [candidat("seule", "activity")], choix: new Map() })));
    const j2 = jourN(instantane, 2);
    expect(j2.items.filter((i) => i.type === "openMeal").map((i) => (i.type === "openMeal" ? i.meal : ""))).toEqual(["lunch", "dinner"]);
    expect(j2.items.some((i) => i.type === "free")).toBe(true);
    expect(etapes(j2)).toHaveLength(0);
  });

  it("aucune interface de modèle n'est passée au moteur (type d'entrée)", () => {
    // Le compilateur refuse cette table si une clé de `EntreeMoteur` manque ou s'ajoute.
    const cles = {
      voyage: true,
      brief: true,
      nuits: true,
      engagements: true,
      candidats: true,
      evenements: true,
      idees: true,
      choix: true,
      configuration: true,
      classement: true,
      relectures: true,
      porteeR1: true,
      dateReference: true,
      version: true,
      budgetTrajetReduit: true,
      jours: true,
      conservees: true,
    } satisfies Record<keyof EntreeMoteur, true>;
    expect(Object.keys(cles).filter((cle) => /mod[eè]le|client|prompt|ia$/i.test(cle))).toEqual([]);
    expect(Object.keys(relectures()).sort()).toEqual(["duree", "plages", "validite"]);
  });
});

describe("moteur: aucun repas ni soirée sans choix", () => {
  it("sans état de choix : des openMeal et aucune soirée", () => {
    const instantane = reussi(generer(entree({ choix: new Map() })));
    for (const jour of instantane.days) {
      expect(etapes(jour).filter((s) => s.kind === "meal")).toEqual([]);
      expect(etapes(jour).some(estSoiree)).toBe(false);
    }
    expect(jourN(instantane, 2).items.filter((i) => i.type === "openMeal")).toHaveLength(2);
  });

  it("avec un choix : l'étape choisie y est", () => {
    const choix = new Map<string, EtatChoix>([
      ["m3", "choisi"],
      ["s2", "garde"],
    ]);
    const instantane = reussi(generer(entree({ choix })));
    const lieux = instantane.days.flatMap((d) => etapes(d).map((s) => s.placeId));
    expect(lieux).toContain(place("m3"));
    expect(lieux).toContain(place("s2"));
    expect(lieux.filter((p) => p !== undefined && /_M\d$/.test(p))).toEqual([place("m3")]);
  });
});

describe("moteur: sortie d'écriture sans durée ni date de contrôle", () => {
  const evenements: CandidatEvenement[] = [
    {
      id: "ev",
      nom: "Événement maison",
      resume: "Résumé.",
      categorie: "museum",
      faits: {},
      sources: [{ url: "https://agenda.example/ev", date: "2026-10-01", classe: "officielle" }],
      placeId: place("ev"),
      aReserver: false,
      evenement: { date: "2026-11-24", heure: "21:00", dateRelue: true },
    },
  ];
  // Horaires inconnus partout : chaque étape serait « à confirmer » en mémoire, jamais dans l'instantané.
  const resultat = generer(entree({ evenements, relectures: relectures({ plages: () => INCONNU }) }));

  it("passe TripSnapshotSchema ; aucun minutes, verifiedAt, toConfirm ni travelMinutes", () => {
    const instantane = reussi(resultat);
    expect(TripSnapshotSchema.safeParse(instantane).success).toBe(true);
    for (const jour of instantane.days) {
      expect(jour).not.toHaveProperty("travelMinutes");
      expect(jour).not.toHaveProperty("budgetPerPerson");
      expect(jour).not.toHaveProperty("generating");
      for (const item of jour.items) {
        if (item.type === "segment") expect(item.segment).not.toHaveProperty("minutes");
        if (item.type === "stop") {
          expect(item.stop).not.toHaveProperty("verifiedAt");
          expect(item.stop.exceptions).not.toContain("toConfirm");
        }
      }
      for (const evenement of jour.events) expect(evenement).not.toHaveProperty("verifiedAt");
      if (jour.surprise !== undefined) expect(jour.surprise).not.toHaveProperty("verifiedAt");
    }
  });

  it("les valeurs sentinelles des doubles n'y figurent pas, sauf les placeId des étapes", () => {
    const texte = JSON.stringify(reussi(resultat));
    expect(texte).not.toMatch(new RegExp(`\\b(${SENTINELLES.marche}|${SENTINELLES.transports}|${SENTINELLES.plage.debut}|${SENTINELLES.plage.fin})\\b`));
    expect(texte).not.toContain(SENTINELLES.logement);
    expect(texte).not.toMatch(/ferme_definitivement|introuvable|inconnu|"valide"/);
    expect(texte).not.toMatch(/"(minutes|travelMinutes|verifiedAt|toConfirm)"/);
  });
});

describe("moteur: déterministe", () => {
  it("deux exécutions sur la même entrée donnent des sorties égales, identifiants compris", () => {
    const premiere = generer(entree({ engagements: [...VOLS, { kind: "ticket", label: "Billet", date: "2026-11-24", start: "15:00" }] }));
    const seconde = generer(entree({ engagements: [...VOLS, { kind: "ticket", label: "Billet", date: "2026-11-24", start: "15:00" }] }));
    expect(JSON.stringify(seconde)).toBe(JSON.stringify(premiere));
    const ids = reussi(premiere).days.flatMap((d) => [...etapes(d).map((s) => s.id), ...d.events.map((e) => e.id)]);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(id).toMatch(/^v3-j\d+-(\d+|e\d+)$/);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("moteur: aucun trou dans la journée", () => {
  function fin(item: DaySnapshot["items"][number]): number | undefined {
    switch (item.type) {
      case "terminus":
        return versMinutes(item.time);
      case "stop":
        return versMinutes(item.stop.end ?? item.stop.start);
      case "openMeal":
        return versMinutes(item.time) + (item.meal === "lunch" ? CONFIG.dureesParDefaut.lunch : CONFIG.dureesParDefaut.dinner);
      default:
        return undefined;
    }
  }
  function debut(item: DaySnapshot["items"][number]): number | undefined {
    switch (item.type) {
      case "terminus":
        return versMinutes(item.time);
      case "stop":
        return versMinutes(item.stop.start);
      case "openMeal":
        return versMinutes(item.time);
      default:
        return undefined;
    }
  }

  it("entre deux éléments consécutifs : un trajet, un temps libre, ou une marge de moins de 30 min", () => {
    const cas = [
      entree(),
      entree({ choix: new Map() }),
      entree({ candidats: [candidat("seule", "activity")] }),
      entree({ engagements: [...VOLS, { kind: "ticket", label: "Billet", date: "2026-11-24", start: "10:00", end: "11:30" }] }),
    ];
    for (const e of cas) {
      for (const jour of reussi(generer(e)).days) {
        let precedent: DaySnapshot["items"][number] | undefined;
        let trajet = 0;
        for (const item of jour.items) {
          if (item.type === "segment") {
            // Durée du double : transports publics, le mode le plus rapide admis (B5-PO-6).
            expect(item.segment.mode).toBe("transit");
            trajet = SENTINELLES.transports;
            continue;
          }
          if (item.type === "free") {
            precedent = undefined;
            trajet = 0;
            continue;
          }
          const finPrecedent = precedent === undefined ? undefined : fin(precedent);
          const debutItem = debut(item);
          if (finPrecedent !== undefined && debutItem !== undefined) {
            const attente = debutItem - finPrecedent - trajet - (trajet > 0 ? CONFIG.margeMinutes : 0);
            expect(attente, `jour ${jour.index}, avant ${JSON.stringify(item)}`).toBeLessThan(CONFIG.seuilTempsLibreMinutes);
          }
          precedent = item;
          trajet = 0;
        }
      }
    }
  });
});

describe("moteur: une étape verrouillée est conservée", () => {
  const engagements: TripCommitment[] = [
    ...VOLS,
    { kind: "ticket", label: "Billet verrouillé", date: "2026-11-24", start: "15:00", end: "16:00" },
    { kind: "booking", label: "Réservation déverrouillée", date: "2026-11-24", start: "19:00" },
  ];
  const v3 = reussi(generer(entree({ engagements })));
  // Version 3 : la personne verrouille la première activité du J2 et déverrouille la réservation.
  const j2 = jourN(v3, 2);
  const premiere = etapes(j2).find((s) => s.commitment === undefined && s.kind === "activity");
  if (premiere === undefined) throw new Error("jeu de test : aucune activité au J2");
  const base: TripSnapshot = {
    days: v3.days.map((jour) =>
      jour.index !== 2
        ? jour
        : {
            ...jour,
            items: jour.items.map((item) => {
              if (item.type !== "stop") return item;
              if (item.stop.id === premiere.id) return { type: "stop", stop: { ...item.stop, locked: true } };
              if (item.stop.commitment === "reservation") return { type: "stop", stop: { ...item.stop, locked: false } };
              return item;
            }),
          },
    ),
  };
  const gardees = etapes(jourN(base, 2)).filter((s) => s.locked || s.commitment !== undefined);
  // Un meilleur candidat (incontournable) existe pour le créneau de l'étape verrouillée.
  const meilleur = candidat("meilleur", "activity", { notes: { matchesWishes: true, notForMeRisk: 1, mustSee: true, slotFit: ["activity"] } });
  const resultat = replanifierJour(entree({ engagements, version: 4, candidats: [meilleur, ...ACTIVITES, ...REPAS, ...SOIREES] }), base, 2);

  it("étape verrouillée et engagement verrouillé identiques, même avec un meilleur candidat", () => {
    if (!resultat.ok) throw new Error(resultat.code);
    const apres = etapes(resultat.jour);
    for (const stop of gardees.filter((s) => s.locked)) expect(apres.find((s) => s.id === stop.id)).toEqual(stop);
    expect(etapesVerrouilleesModifiees(base.days, [resultat.jour])).toEqual([]);
    expect(resultat.rapport.filter((e) => e.regle === "R3")).toEqual([]);
    // Le meilleur candidat est planifié ailleurs dans le jour, jamais à la place de l'étape verrouillée.
    expect(apres.find((s) => s.id === premiere.id)?.placeId).toBe(premiere.placeId);
  });

  it("un engagement déverrouillé garde son lieu, son jour et son commitment, et n'est jamais remplacé", () => {
    if (!resultat.ok) throw new Error(resultat.code);
    const reservation = gardees.find((s) => s.commitment === "reservation");
    const apres = etapes(resultat.jour).find((s) => s.id === reservation?.id);
    expect(reservation?.locked).toBe(false);
    expect(apres).toMatchObject({ name: "Réservation déverrouillée", commitment: "reservation", locked: false, start: "19:00" });
    expect(apres?.placeId).toBe(reservation?.placeId);
    expect(resultat.jour.index).toBe(2);
  });

  it("le jour replanifié passe TripSnapshotSchema et ses nouvelles étapes portent la version 4", () => {
    if (!resultat.ok) throw new Error(resultat.code);
    expect(TripSnapshotSchema.safeParse({ days: [resultat.jour] }).success).toBe(true);
    const gardeesIds = new Set(gardees.map((s) => s.id));
    for (const stop of etapes(resultat.jour)) {
      if (!gardeesIds.has(stop.id)) expect(stop.id).toMatch(/^v4-j2-\d+$/);
    }
    // Aucun lieu d'un autre jour n'est repris.
    const ailleurs = new Set(v3.days.filter((d) => d.index !== 2).flatMap((d) => etapes(d).map((s) => s.placeId)));
    for (const stop of etapes(resultat.jour)) if (!gardeesIds.has(stop.id)) expect(ailleurs.has(stop.placeId)).toBe(false);
  });
});

describe("moteur: jours à planifier (B9-TL-13)", () => {
  // Voyage de 4 jours, 3 nuits d'étiquettes distinctes : J3 et J4 sont seuls à lire la nuit 2.
  const NUITS_4: Nuit[] = [
    { etiquette: "Logement A", placeId: place("nuit-a") },
    { etiquette: "Logement B", placeId: place("nuit-b") },
    { etiquette: "Logement C", placeId: place("nuit-c") },
  ];
  const ENGAGEMENTS_4: TripCommitment[] = [
    { kind: "flight", label: "Arrivée", date: "2026-11-23", start: "08:10", end: "11:40" },
    { kind: "ticket", label: "Billet du J4", date: "2026-11-26", start: "10:00", end: "11:00" },
    { kind: "flight", label: "Départ", date: "2026-11-26", start: "17:00" },
  ];
  const EVENEMENT_J3: CandidatEvenement = {
    id: "ev-j3",
    nom: "Événement maison J3",
    resume: "Résumé maison.",
    categorie: "museum",
    faits: {},
    sources: [{ url: "https://guide.example/ev-j3", date: "2026-10-01", classe: "independante" }],
    placeId: place("ev-j3"),
    aReserver: false,
    evenement: { date: "2026-11-25", heure: "21:00", dateRelue: true },
  };
  const IDEE: CandidatIdee = {
    ...candidat("idee-1", "activity"),
    raison: "Raison maison idee-1.",
  };
  const PLUS = ["b1", "b2", "b3", "b4", "b5", "b6"].map((id) => candidat(id, "activity"));

  function entree4(modif: Partial<EntreeMoteur> = {}): EntreeMoteur {
    return entree({
      voyage: { destination: "Édimbourg", start: "2026-11-23", end: "2026-11-26", timeZone: "Europe/London", travellers: { adults: 2, children: 0 } },
      nuits: NUITS_4,
      engagements: ENGAGEMENTS_4,
      candidats: [...ACTIVITES, ...PLUS, ...REPAS, ...SOIREES],
      evenements: [EVENEMENT_J3],
      idees: [IDEE],
      ...modif,
    });
  }

  /** Relectures qui notent chaque lieu, nuit et date lus. */
  function espion(): { relectures: Relectures; lieux: Set<string>; nuits: Set<number>; dates: Set<string> } {
    const base = relectures();
    const lieux = new Set<string>();
    const nuits = new Set<number>();
    const dates = new Set<string>();
    const noter = (point: Point) => ("lieu" in point ? lieux.add(point.lieu) : nuits.add(point.logement));
    return {
      lieux,
      nuits,
      dates,
      relectures: {
        validite(placeId) {
          lieux.add(placeId);
          return base.validite(placeId);
        },
        plages(placeId, date) {
          lieux.add(placeId);
          dates.add(date);
          return base.plages(placeId, date);
        },
        duree(depuis, vers, mode) {
          noter(depuis);
          noter(vers);
          return base.duree(depuis, vers, mode);
        },
      },
    };
  }

  it("sans jours, ou avec tous les jours : la même sortie que B5", () => {
    expect(generer(entree4({ jours: [1, 2, 3, 4] }))).toEqual(generer(entree4()));
    expect(generer(entree({ jours: [3, 1, 2, 2] }))).toEqual(generer(entree()));
  });

  it("jours hors de jours : termini de logement seuls, sans étape, événement ni idée (B9-PO-6)", () => {
    const partiel = reussi(generer(entree4({ jours: [1, 2] })));
    const complet = reussi(generer(entree4()));
    expect(partiel.days.map((d) => d.index)).toEqual([1, 2, 3, 4]);
    expect(jourN(partiel, 1)).toEqual(jourN(complet, 1));
    expect(jourN(partiel, 2)).toEqual(jourN(complet, 2));
    expect(jourN(partiel, 3)).toEqual({
      index: 3,
      date: "2026-11-25",
      items: [
        { type: "terminus", role: "start", time: "09:00", label: "Logement B" },
        { type: "terminus", role: "end", time: "23:00", label: "Logement C" },
      ],
      events: [],
      travelBudgetMinutes: jourN(complet, 3).travelBudgetMinutes,
    });
    // L'engagement du J4 n'est pas posé ; le vol de départ borne toujours la fin.
    expect(jourN(partiel, 4).items).toEqual([
      { type: "terminus", role: "start", time: "09:00", label: "Logement C" },
      { type: "terminus", role: "end", time: "17:00", label: "Logement C" },
    ]);
    expect(jourN(complet, 3).events.map((e) => e.name)).toEqual(["Événement maison J3"]);
    expect(TripSnapshotSchema.safeParse(partiel).success).toBe(true);
  });

  it("aucune relecture pour un point qui n'appartient qu'aux jours non planifiés", () => {
    const { relectures: espionnes, lieux, nuits, dates } = espion();
    reussi(generer(entree4({ jours: [1, 2], relectures: espionnes })));
    expect(nuits.has(2)).toBe(false);
    expect(lieux.has(place("ev-j3"))).toBe(false);
    expect([...dates].sort()).toEqual(["2026-11-23", "2026-11-24"]);
  });

  it("pointsDesJours rend les nuits, engagements et événements des seuls jours demandés", () => {
    const e = entree4();
    expect(pointsDesJours(e, [1, 2])).toEqual([
      { index: 1, date: "2026-11-23", nuits: [0], engagements: [ENGAGEMENTS_4[0]], evenements: [] },
      { index: 2, date: "2026-11-24", nuits: [0, 1], engagements: [], evenements: [] },
    ]);
    expect(pointsDesJours(e, [3, 4])).toEqual([
      { index: 3, date: "2026-11-25", nuits: [1, 2], engagements: [], evenements: [EVENEMENT_J3] },
      { index: 4, date: "2026-11-26", nuits: [2], engagements: [ENGAGEMENTS_4[1], ENGAGEMENTS_4[2]], evenements: [] },
    ]);
    expect(pointsDesJours(e).map((p) => p.index)).toEqual([1, 2, 3, 4]);
  });

  it("un jour hors du séjour est refusé (RangeError)", () => {
    expect(() => generer(entree4({ jours: [5] }))).toThrow(RangeError);
    expect(() => generer(entree4({ jours: [0] }))).toThrow(RangeError);
    expect(() => pointsDesJours(entree4(), [1.5])).toThrow(RangeError);
  });

  it("replanifierJour planifie un jour de base non planifié, sans toucher aux autres jours (B9-PO-7)", () => {
    const apercu = reussi(generer(entree4({ jours: [1, 2], version: 1 })));
    expect(estJourNonPlanifie(jourN(apercu, 3))).toBe(true);
    expect(estJourNonPlanifie(jourN(apercu, 2))).toBe(false);
    const { relectures: espionnes, nuits, dates } = espion();
    const resultat = replanifierJour(entree4({ version: 2, relectures: espionnes }), apercu, 3);
    if (!resultat.ok) throw new Error(resultat.code);
    const jour = resultat.jour;
    expect(jour.index).toBe(3);
    expect(etapes(jour).length).toBeGreaterThan(0);
    expect(jour.events.map((e) => [e.id, e.name])).toEqual([["v2-j3-e1", "Événement maison J3"]]);
    for (const stop of etapes(jour)) expect(stop.id).toMatch(/^v2-j3-\d+$/);
    expect(jour.items.at(0)).toMatchObject({ type: "terminus", role: "start", label: "Logement B" });
    expect(jour.items.at(-1)).toMatchObject({ type: "terminus", role: "end", label: "Logement C" });
    // Aucun lieu des jours de l'aperçu n'est repris, ni leur idée.
    const apercuLieux = new Set(
      apercu.days.flatMap((d) => [...etapes(d).map((s) => s.placeId), ...(d.surprise === undefined ? [] : [d.surprise.placeId])]),
    );
    for (const stop of etapes(jour)) expect(apercuLieux.has(stop.placeId)).toBe(false);
    if (jour.surprise !== undefined) expect(apercuLieux.has(jour.surprise.placeId)).toBe(false);
    expect(resultat.rapport.filter((r) => estBloquante(r, [jour]))).toEqual([]);
    expect([...dates]).toEqual(["2026-11-25"]);
    expect(nuits.has(0)).toBe(false);
    expect(TripSnapshotSchema.safeParse({ days: [jour] }).success).toBe(true);
  });

  it("plusieurs-villes: replanifierJour recopie tel quel un jour qui porte un transfer (décision 0151 § 4)", () => {
    const base = reussi(generer(entree4({ jours: [1, 2, 3], version: 1 })));
    const transfer = { type: "transfer" as const, from: "Ville 1", to: "Ville 2", source: "estimated" as const, start: "11:30", estimatedMinutes: 120 };
    const avec: TripSnapshot = {
      ...base,
      days: base.days.map((jour) => (jour.index === 3 ? { ...jour, items: [...jour.items.slice(0, -1), transfer, ...jour.items.slice(-1)] } : jour)),
    };
    const gele = structuredClone(avec);
    const resultat = replanifierJour(entree4({ version: 2 }), avec, 3);
    if (!resultat.ok) throw new Error(resultat.code);
    expect(resultat.jour).toEqual(jourN(avec, 3));
    expect(resultat.jour.items).toContainEqual(transfer);
    expect(resultat.rapport).toEqual([]);
    expect(avec).toEqual(gele);
  });

  it("replanifierJour pose l'engagement d'un jour de base non planifié, verrouillé (B5-PO-12)", () => {
    const apercu = reussi(generer(entree4({ jours: [1, 2], version: 1 })));
    const resultat = replanifierJour(entree4({ version: 2 }), apercu, 4);
    if (!resultat.ok) throw new Error(resultat.code);
    expect(etapes(resultat.jour).find((s) => s.commitment === "ticket")).toMatchObject({
      name: "Billet du J4",
      start: "10:00",
      end: "11:00",
      locked: true,
    });
  });
});

describe("moteur: étapes conservées (0119 § 2.1, B10-TL-6)", () => {
  // Version 3, J2 entier : la personne en écarte la première activité ; tout le reste du jour est conservé.
  const v3 = reussi(generer(entree()));
  const j2 = jourN(v3, 2);
  const ecartee = etapes(j2).find((s) => s.kind === "activity" && s.commitment === undefined && !s.locked);
  if (ecartee === undefined) throw new Error("jeu de test : aucune activité au J2");
  const conservees = new Set(etapes(j2).flatMap((s) => (s.id === ecartee.id ? [] : [s.id])));
  // R7 : les repas conservés sont « gardés » par leur identifiant d'étape (B5-PO-8).
  const choix = new Map<string, EtatChoix>([...TOUS_CHOISIS, ...etapes(j2).map((s) => [s.id, "garde"] as const)]);
  // Un incontournable existe : sans `conservees`, il prendrait la place d'une étape non verrouillée.
  const meilleur = candidat("meilleur", "activity", { notes: { matchesWishes: true, notForMeRisk: 1, mustSee: true, slotFit: ["activity"] } });
  const reserve = [meilleur, ...ACTIVITES, ...REPAS, ...SOIREES].filter((c) => c.placeId !== ecartee.placeId);
  const sansEcartee = entree({ version: 4, choix, candidats: reserve });
  const resultat = replanifierJour({ ...sansEcartee, conservees }, v3, 2);

  it("une étape conservée garde son jour, son heure, son identifiant et reste non verrouillée", () => {
    if (!resultat.ok) throw new Error(resultat.code);
    const apres = etapes(resultat.jour);
    for (const stop of etapes(j2)) if (conservees.has(stop.id)) expect(apres.find((s) => s.id === stop.id)).toEqual(stop);
    expect(apres.filter((s) => conservees.has(s.id) && s.locked)).toEqual(etapes(j2).filter((s) => s.locked));
    expect(resultat.rapport.filter((e) => estBloquante(e, [resultat.jour]))).toEqual([]);
    expect(TripSnapshotSchema.safeParse({ days: [resultat.jour] }).success).toBe(true);
  });

  it("l'étape non conservée est remplacée depuis la réserve, sans reprendre un lieu conservé ni un lieu d'un autre jour", () => {
    if (!resultat.ok) throw new Error(resultat.code);
    const apres = etapes(resultat.jour);
    expect(apres.some((s) => s.id === ecartee.id || s.placeId === ecartee.placeId)).toBe(false);
    const nouvelles = apres.filter((s) => !conservees.has(s.id));
    expect(nouvelles.length).toBeGreaterThan(0);
    for (const stop of nouvelles) expect(stop.id).toMatch(/^v4-j2-\d+$/);
    const lieux = etapes(resultat.jour).map((s) => s.placeId);
    expect(new Set(lieux).size).toBe(lieux.length);
    const ailleurs = new Set(v3.days.filter((d) => d.index !== 2).flatMap((d) => etapes(d).map((s) => s.placeId)));
    for (const stop of nouvelles) expect(ailleurs.has(stop.placeId)).toBe(false);
  });

  it("sans conservees, ou vide : le comportement de B5 (seules les étapes verrouillées et les engagements restent)", () => {
    const sans = replanifierJour(sansEcartee, v3, 2);
    expect(replanifierJour({ ...sansEcartee, conservees: new Set() }, v3, 2)).toEqual(sans);
    if (!sans.ok) throw new Error(sans.code);
    // Le jeu de test n'est pas trivial : sans conservees, une étape non verrouillée du J2 n'est pas reprise telle quelle.
    const libres = etapes(j2).filter((s) => conservees.has(s.id) && !s.locked && s.commitment === undefined);
    expect(libres.some((stop) => !etapes(sans.jour).some((s) => s.id === stop.id))).toBe(true);
  });

  it("generer ignore conservees ; un jour de base non planifié aussi", () => {
    expect(generer({ ...entree(), conservees })).toEqual(generer(entree()));
    const apercu = reussi(generer(entree({ jours: [1, 2], version: 1 })));
    const autre = new Set(["v1-j3-1", ...conservees]);
    expect(replanifierJour({ ...entree({ version: 2 }), conservees: autre }, apercu, 3)).toEqual(replanifierJour(entree({ version: 2 }), apercu, 3));
  });
});
