// @vitest-environment node
import { describe, expect, it } from "vitest";

import { TRIP_ID_PATTERN, TripSchema, type Stop, type Trip } from "@/contracts";
import { classer, type ParametresClassement } from "@/domain/classement";
import { identifiantVoyage, slugDestination } from "@/domain/identifiant";
import { planifier } from "@/domain/planification";
import { squelette } from "@/domain/squelette";
import type { AncrageResolu, Position, Trajets } from "@/prototype/ancrage";
import type { Brief } from "@/prototype/brief";
import type { Candidat, CandidatNote } from "@/prototype/candidat";
import { ProgrammeReduitSchema } from "@/prototype/programme-reduit";
import { reduireProgramme, ReductionRefusee } from "@/prototype/reduction";

import { assembler } from "@/server/p0/assemblage";
import { lireConfiguration, lireConfigurationMoteur } from "../../../scripts/p0/fichiers";
import {
  briefDepuisBrief,
  candidatVersMoteur,
  engagementsDepuisBrief,
  nuitsDepuisBrief,
  evenementVersMoteur,
  relecturesDepuisAncrages,
  violationsP0,
} from "@/server/p0/vers-moteur";

/**
 * Moteur de P0 de bout en bout (spécification P0, étapes 5 à 11), sur des jours de test fabriqués ici, sans
 * fixture : adaptateur `vers-moteur.ts`, moteur de `src/domain`, assemblage et réduction propres à P0. Ces cas
 * étaient dans `src/domain/moteur.test.ts` ; ils ont quitté `src/domain` avec B5a (décision 0045 § 1, « Ce que B5a
 * doit tester » : `src/domain` n'importe plus `@/prototype`, les cas de réduction partent dans `tests/unit/p0/`).
 * Les validateurs sont ceux du moteur, ramenés aux six compteurs du rapport de P0 (`violationsP0`).
 */

const BRIEF: Brief = {
  schema: 1,
  destination: "Édimbourg",
  pays: "Royaume-Uni",
  fuseau: "Europe/London",
  arrivee: "2026-11-23",
  depart: "2026-11-25",
  heureArrivee: "12:00",
  heureDepart: "16:00",
  voyageurs: { adultes: 2, enfants: 0 },
  rythme: "equilibre",
  envies: ["walk", "museum", "restaurant"],
  deplacements: ["walk", "transit"],
  logements: [{ texte: "Logement de test", nuits: 2 }],
};

const CLASSEMENT = lireConfiguration().classement;
const MOTEUR = lireConfigurationMoteur();
const PARAMETRES: ParametresClassement = { classement: CLASSEMENT, ageSourceMaxJours: 1095, dateReference: "2026-10-12" };

const LOGEMENT = "P_LOGEMENT";
const LOIN = "P_007";

function candidat(numero: number, typeEtape: Candidat["typeEtape"], notes: Partial<CandidatNote["notes"]> = {}): CandidatNote {
  const id = `c_${String(numero).padStart(3, "0")}`;
  return {
    id,
    nom: `Lieu de test ${numero}`,
    resume: `Résumé maison du lieu ${numero}.`,
    categorie: typeEtape === "meal" ? "restaurant" : "walk",
    typeEtape,
    source: { url: `https://guide-${numero}.example/page`, date: "2026-09-01", classe: "independante" },
    aReserver: false,
    notes: {
      matchesWishes: true,
      notForMeRisk: 3,
      mustSee: false,
      slotFit: [typeEtape === "meal" ? "meal" : "activity"],
      ...notes,
    },
  };
}

const CANDIDATS: CandidatNote[] = [
  candidat(1, "activity", { mustSee: true }),
  candidat(2, "activity"),
  candidat(3, "activity", { notForMeRisk: 2 }),
  candidat(4, "meal"),
  candidat(5, "meal", { notForMeRisk: 2 }),
  candidat(6, "meal"),
  candidat(7, "activity", { mustSee: true, notForMeRisk: 5 }), // loin du logement
  candidat(8, "activity", { slotFit: ["activity", "evening"] }),
  candidat(9, "meal", { slotFit: ["meal", "evening"] }),
  candidat(10, "activity"),
  candidat(11, "meal"),
  candidat(12, "activity", { matchesWishes: false, notForMeRisk: 9 }),
];

const placeDe = (id: string) => `P_${id.slice(2)}`;
const toujoursOuvert = Array.from({ length: 7 }, (_, jour) => ({ jour, debut: 0, fin: 1440 }));
const ancre = (placeId: string): AncrageResolu => ({ resolu: true, placeId, statut: "ouvert", position: { lat: 1, lng: 1 }, horaires: toujoursOuvert });

function ancrages(exclus: readonly string[] = []): Map<string, AncrageResolu> {
  const resultat = new Map<string, AncrageResolu>();
  for (const c of CANDIDATS) if (!exclus.includes(c.id)) resultat.set(c.id, ancre(placeDe(c.id)));
  return resultat;
}

const trajets: Trajets = (de, vers) => (de === vers ? 0 : de === LOIN || vers === LOIN ? 45 : 10);
const enMoteur = (candidats: readonly CandidatNote[]) => candidats.map((c) => candidatVersMoteur(c, ancre(placeDe(c.id))));

/** Événement trouvé dont la page relue ne confirme pas la date (R2). */
const EVENEMENT: Candidat = {
  ...candidat(13, "activity"),
  typeEtape: "event",
  evenement: { date: "2026-11-24", heure: "19:30", dateConfirmee: false },
};

type Options = {
  exclus?: string[];
  evenements?: Candidat[];
  /** Modifie, après la planification, ce que relisent les validateurs (ancrages, trajets). */
  relecture?: { ancrages?: (carte: Map<string, AncrageResolu>) => void; trajets?: Trajets };
};

function executerMoteur(options: Options = {}) {
  const parId = ancrages(options.exclus);
  const candidats = CANDIDATS.filter((c) => parId.has(c.id));
  const nuits = nuitsDepuisBrief(BRIEF, [LOGEMENT]);
  const ancragesParPlace = new Map<string, AncrageResolu>([
    [LOGEMENT, { resolu: true, placeId: LOGEMENT, statut: "ouvert", position: { lat: 1, lng: 1 }, horaires: null }],
  ]);
  for (const ancrage of parId.values()) ancragesParPlace.set(ancrage.placeId, ancrage);
  const briefMoteur = briefDepuisBrief(BRIEF);
  const jours = planifier({
    jours: squelette({
      voyage: { start: BRIEF.arrivee, end: BRIEF.depart },
      pace: briefMoteur.pace,
      nombreDeNuits: nuits.length,
      engagements: engagementsDepuisBrief(BRIEF),
      configuration: MOTEUR,
      budgetTrajetReduit: false,
    }),
    candidats: candidats.map((c) => candidatVersMoteur(c, parId.get(c.id))),
    evenements: (options.evenements ?? []).flatMap((c) => evenementVersMoteur(c, undefined) ?? []),
    relectures: relecturesDepuisAncrages(ancragesParPlace, nuits, trajets),
    mode: "walk",
    parametres: PARAMETRES,
    configuration: MOTEUR,
    voyage: { start: BRIEF.arrivee, end: BRIEF.depart },
  });
  const positions = new Map<string, Position>([[LOGEMENT, { lat: 1, lng: 1 }]]);
  for (const ancrage of parId.values()) positions.set(ancrage.placeId, ancrage.position);
  const parCandidat = new Map<string, Candidat>([...CANDIDATS, ...(options.evenements ?? [])].map((c) => [c.id, c]));
  const complet = assembler({
    tripId: identifiantVoyage(BRIEF.destination, "2026-10-12", 1),
    brief: BRIEF,
    nuits,
    configuration: MOTEUR,
    jours,
    candidats: parCandidat,
    raisons: new Map([...CANDIDATS, ...(options.evenements ?? [])].map((c) => [c.id, { raison: `Raison maison ${c.id}.`, detour: `Justification maison ${c.id}.` }])),
    mode: "walk",
    positions,
  });
  options.relecture?.ancrages?.(ancragesParPlace);
  const violations = (trip: Trip) =>
    violationsP0(trip.days, {
      brief: BRIEF,
      briefMoteur,
      nuits,
      relectures: relecturesDepuisAncrages(ancragesParPlace, nuits, options.relecture?.trajets ?? trajets),
      configuration: MOTEUR,
      planifies: jours,
      candidats: parCandidat,
    });
  return { jours, complet, violations };
}

const stopsDe = (trip: Trip) => trip.days.flatMap((day) => day.items.flatMap((item) => (item.type === "stop" ? [item.stop] : [])));

describe("p0: identifiant de voyage ASCII conforme à TRIP_ID_PATTERN", () => {
  it("brief « Édimbourg » → proto_edimbourg_…", () => {
    const id = identifiantVoyage("Édimbourg", "2026-10-12", 1);
    expect(id).toBe("proto_edimbourg_20261012_1");
    expect(TRIP_ID_PATTERN.test(id)).toBe(true);
  });

  it("destination longue tronquée sous 64 caractères, sans caractère hors ASCII", () => {
    const id = identifiantVoyage("Saint-Jean-de-Luz et la côte basque jusqu'à Hondarribia, Pays basque", "2026-10-12", 999);
    expect(id.length).toBeLessThanOrEqual(64);
    expect(id).toMatch(/^[\x20-\x7e]+$/);
    expect(TRIP_ID_PATTERN.test(id)).toBe(true);
    expect(slugDestination("Zákynthos — Ζάκυνθος")).toBe("zakynthos");
    expect(slugDestination("Ζάκυνθος")).toBe("destination");
  });

  it("refuse un numéro ou une date hors forme", () => {
    expect(() => identifiantVoyage("Édimbourg", "2026-10-12", 0)).toThrow();
    expect(() => identifiantVoyage("Édimbourg", "12/10/2026", 1)).toThrow();
  });
});

describe("p0: classement déterministe", () => {
  it("mêmes notes, mêmes trajets : même ordre, même programme", () => {
    const ordre = () => classer(enMoteur(CANDIDATS), "activity", (c) => trajets(LOGEMENT, placeDe(c.id)), PARAMETRES).map((c) => c.id);
    expect(ordre()).toEqual(ordre());
    expect(classer(enMoteur([...CANDIDATS].reverse()), "activity", (c) => trajets(LOGEMENT, placeDe(c.id)), PARAMETRES).map((c) => c.id)).toEqual(ordre());
    expect(executerMoteur().complet.trip).toEqual(executerMoteur().complet.trip);
  });

  it("un incontournable loin du logement reste proposé (la distance est un coût, pas un filtre)", () => {
    const activites = classer(enMoteur(CANDIDATS), "activity", (c) => trajets(LOGEMENT, placeDe(c.id)), PARAMETRES);
    expect(activites.slice(0, 2).map((c) => c.id).sort()).toEqual(["c_001", "c_007"]);
    const { complet } = executerMoteur();
    const places = [...stopsDe(complet.trip), ...complet.trip.days.flatMap((d) => (d.surprise ? [d.surprise] : []))].map((s) => s.placeId);
    expect(places).toContain(LOIN);
  });

  it("matchesWishes à « non » est pénalisé, classé après les autres", () => {
    const activites = classer(enMoteur(CANDIDATS), "activity", () => 10, PARAMETRES);
    expect(activites.at(-1)?.id).toBe("c_012");
  });
});

describe("p0: un candidat non résolu ou fermé définitivement n'entre pas dans le programme", () => {
  it("un candidat sans ancrage n'est jamais planifié", () => {
    const { complet } = executerMoteur({ exclus: ["c_001", "c_004"] });
    const places = JSON.stringify(complet.trip);
    expect(places).not.toContain('"P_001"');
    expect(places).not.toContain('"P_004"');
    expect(places).not.toContain("Lieu de test 1\"");
  });
});

describe("p0: R1, R2, R4, R5, R6, R8 sur des jours de test", () => {
  it("le programme planifié ne viole aucune règle et passe TripSchema", () => {
    const { complet, violations } = executerMoteur();
    expect(TripSchema.safeParse(complet.trip).success).toBe(true);
    expect(stopsDe(complet.trip).length).toBeGreaterThan(4);
    expect(violations(complet.trip)).toEqual({ R1: 0, R2: 0, R4: 0, R5: 0, R6: 0, R8: 0 });
  });

  function modifierPremierStop(trip: Trip, modif: (stop: Stop) => Stop): Trip {
    const copie = structuredClone(trip);
    for (const day of copie.days) {
      const index = day.items.findIndex((item) => item.type === "stop");
      const item = day.items.at(index);
      if (item?.type === "stop") {
        day.items.splice(index, 1, { type: "stop", stop: modif(item.stop) });
        return copie;
      }
    }
    return copie;
  }

  const premierLieu = () => stopsDe(executerMoteur().complet.trip)[0]?.placeId as string;

  it("R1 : lieu non ancré, source invalide ou lieu fermé définitivement", () => {
    const { complet, violations } = executerMoteur();
    expect(violations(modifierPremierStop(complet.trip, (s) => ({ ...s, placeId: "P_INCONNU" }))).R1).toBe(1);
    expect(violations(modifierPremierStop(complet.trip, (s) => ({ ...s, source: { label: "x", url: "javascript:alert(1)" } }))).R1).toBe(1);
    const premier = premierLieu();
    const ferme = executerMoteur({
      relecture: { ancrages: (carte) => carte.set(premier, { ...(carte.get(premier) as AncrageResolu), statut: "ferme_definitivement" }) },
    });
    expect(ferme.violations(ferme.complet.trip).R1).toBe(1);
  });

  it("R2 : événement non relu sans « unconfirmed »", () => {
    const { complet, violations } = executerMoteur({ evenements: [EVENEMENT] });
    const evenement = complet.trip.days.flatMap((day) => day.events).find((stop) => stop.commitment === undefined);
    expect(evenement?.exceptions).toContain("unconfirmed");
    expect(violations(complet.trip).R2).toBe(0);
    const trip = structuredClone(complet.trip);
    for (const day of trip.days) for (const stop of day.events) stop.exceptions = [];
    expect(violations(trip).R2).toBe(1);
  });

  it("R4 : étape hors des horaires d'ouverture", () => {
    const premier = premierLieu();
    const { complet, violations } = executerMoteur({
      relecture: { ancrages: (carte) => carte.set(premier, { ...(carte.get(premier) as AncrageResolu), horaires: [] }) },
    });
    expect(violations(complet.trip).R4).toBe(1);
  });

  it("R5 : trajet infaisable entre deux étapes", () => {
    const { complet, violations } = executerMoteur({ relecture: { trajets: (de, vers) => (de === vers ? 0 : 600) } });
    expect(violations(complet.trip).R5).toBeGreaterThan(0);
  });

  it("R6 : journée qui ne part pas du bon logement", () => {
    const { complet, violations } = executerMoteur();
    const trip = structuredClone(complet.trip);
    const premier = trip.days.at(0)?.items.at(0);
    if (premier?.type === "terminus") premier.label = "Autre logement";
    expect(violations(trip).R6).toBe(1);
  });

  it("R8 : rythme dépassé", () => {
    const { complet, violations } = executerMoteur();
    const trip = structuredClone(complet.trip);
    const jour = trip.days.at(1) as Trip["days"][number];
    const modele = jour.items.find((item) => item.type === "stop" && item.stop.kind === "activity");
    for (let i = 0; i < 4; i += 1) if (modele) jour.items.splice(1, 0, structuredClone(modele));
    expect(violations(trip).R8).toBeGreaterThanOrEqual(1);
  });
});

describe("p0: réduction du programme complet (forme écrite sur disque)", () => {
  function reduire(modif?: (complet: ReturnType<typeof executerMoteur>["complet"]) => void, sansPosition?: string) {
    const { complet } = executerMoteur();
    modif?.(complet);
    const positions = new Map<string, Position>();
    for (const placeId of JSON.stringify(complet).match(/P_[A-Z0-9]+/g) ?? []) positions.set(placeId, { lat: 1, lng: 1 });
    if (sansPosition) positions.delete(sansPosition);
    return reduireProgramme(complet, { positions, terminus: complet.terminus, justifications: complet.justifications });
  }

  it("retire les clés dérivées de Google et pose detour sur chaque proposition", () => {
    const programme = reduire((complet) => {
      const stop = stopsDe(complet.trip)[0];
      if (stop) stop.verifiedAt = "2026-10-12T10:00:00Z";
    });
    const texte = JSON.stringify(programme);
    for (const cle of ['"verifiedAt"', '"minutes"', '"travelMinutes"', '"photoUrl"']) expect(texte).not.toContain(cle);
    expect(programme.proposals.length).toBeGreaterThan(0);
    for (const proposition of programme.proposals) expect(proposition.detour.length).toBeGreaterThan(0);
    expect(ProgrammeReduitSchema.safeParse(programme).success).toBe(true);
  });

  it("refuse un programme dont une étape porte toConfirm, avant l'écriture", () => {
    expect(() =>
      reduire((complet) => {
        const stop = stopsDe(complet.trip)[0];
        if (stop) stop.exceptions = ["toConfirm"];
      }),
    ).toThrow(ReductionRefusee);
  });

  it("refuse une proposition sans justification detour, et un placeId sans position", () => {
    expect(() => reduire((complet) => complet.justifications.clear())).toThrow(ReductionRefusee);
    expect(() => reduire(undefined, LOGEMENT)).toThrow(ReductionRefusee);
  });
});
