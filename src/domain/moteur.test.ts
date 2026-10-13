// @vitest-environment node
import { describe, expect, it } from "vitest";

import { TRIP_ID_PATTERN, TripSchema, type Stop, type Trip } from "@/contracts";
import { assembler } from "@/domain/assemblage";
import { classer, type ParametresClassement } from "@/domain/classement";
import { identifiantVoyage, slugDestination } from "@/domain/identifiant";
import { planifier } from "@/domain/planification";
import { squelette } from "@/domain/squelette";
import { valider, type ContexteValidation } from "@/domain/validation";
import type { AncrageResolu, Position } from "@/prototype/ancrage";
import type { Brief } from "@/prototype/brief";
import type { Candidat, CandidatNote } from "@/prototype/candidat";
import type { ConfigClassement } from "@/prototype/config";
import { ProgrammeReduitSchema } from "@/prototype/programme-reduit";
import { reduireProgramme, ReductionRefusee } from "@/prototype/reduction";

/** Moteur déterministe (spécification P0, étapes 5 à 11) sur des jours de test fabriqués ici, sans fixture. */

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

const CLASSEMENT: ConfigClassement = {
  schema: 1,
  poids: { matchesWishes: 30, mustSee: 25, notForMeRisk: 4, source: { officielle: 4, independante: 6, generique: -8 }, sourceAncienne: 6 },
  matchesWishesNon: "penaliser",
  penaliteHorsEnvies: 20,
  prioriteMustSee: "avant",
  coutTrajetParMinute: { activity: 0.1, meal: 1, evening: 1, surprise: 2 },
} as ConfigClassement;

const PARAMETRES: ParametresClassement = { classement: CLASSEMENT, ageSourceMaxJours: 1095, dateExecution: "2026-10-12" };

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

function ancrages(exclus: readonly string[] = []): Map<string, AncrageResolu> {
  const resultat = new Map<string, AncrageResolu>();
  for (const c of CANDIDATS) {
    if (exclus.includes(c.id)) continue;
    resultat.set(c.id, { resolu: true, placeId: placeDe(c.id), statut: "ouvert", position: { lat: 1, lng: 1 }, horaires: toujoursOuvert });
  }
  return resultat;
}

const trajets = (de: string, vers: string) => (de === vers ? 0 : de === LOIN || vers === LOIN ? 45 : 10);

function executerMoteur(options: { exclus?: string[]; candidats?: CandidatNote[] } = {}) {
  const parId = ancrages(options.exclus);
  const candidats = (options.candidats ?? CANDIDATS).filter((c) => parId.has(c.id));
  const jours = planifier({
    jours: squelette(BRIEF),
    candidats,
    ancrages: parId,
    evenements: [],
    logements: [LOGEMENT],
    trajets,
    parametres: PARAMETRES,
    arrivee: BRIEF.arrivee,
    depart: BRIEF.depart,
  });
  const positions = new Map<string, Position>([[LOGEMENT, { lat: 1, lng: 1 }]]);
  for (const ancrage of parId.values()) positions.set(ancrage.placeId, ancrage.position);
  const complet = assembler({
    tripId: identifiantVoyage(BRIEF.destination, "2026-10-12", 1),
    brief: BRIEF,
    jours,
    candidats: new Map(CANDIDATS.map((c) => [c.id, c])),
    raisons: new Map(CANDIDATS.map((c) => [c.id, { raison: `Raison maison ${c.id}.`, detour: `Justification maison ${c.id}.` }])),
    mode: "walk",
    positions,
  });
  const ancragesParPlace = new Map<string, AncrageResolu>([
    [LOGEMENT, { resolu: true, placeId: LOGEMENT, statut: "ouvert", position: { lat: 1, lng: 1 }, horaires: null }],
  ]);
  for (const ancrage of parId.values()) ancragesParPlace.set(ancrage.placeId, ancrage);
  const contexte: ContexteValidation = {
    brief: BRIEF,
    ancrages: ancragesParPlace,
    trajets,
    terminus: complet.terminus,
    logementsAttendus: jours.map((jour) => ({ jour: jour.squelette.index, depart: LOGEMENT, arrivee: LOGEMENT })),
    evenementsNonConfirmes: new Set(),
  };
  return { jours, complet, contexte };
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
    const ordre = () => classer(CANDIDATS, "activity", (c) => trajets(LOGEMENT, placeDe(c.id)), PARAMETRES).map((c) => c.id);
    expect(ordre()).toEqual(ordre());
    expect(classer([...CANDIDATS].reverse(), "activity", (c) => trajets(LOGEMENT, placeDe(c.id)), PARAMETRES).map((c) => c.id)).toEqual(ordre());
    expect(executerMoteur().complet.trip).toEqual(executerMoteur().complet.trip);
  });

  it("un incontournable loin du logement reste proposé (la distance est un coût, pas un filtre)", () => {
    const activites = classer(CANDIDATS, "activity", (c) => trajets(LOGEMENT, placeDe(c.id)), PARAMETRES);
    expect(activites.slice(0, 2).map((c) => c.id).sort()).toEqual(["c_001", "c_007"]);
    const { complet } = executerMoteur();
    const places = [...stopsDe(complet.trip), ...complet.trip.days.flatMap((d) => (d.surprise ? [d.surprise] : []))].map((s) => s.placeId);
    expect(places).toContain(LOIN);
  });

  it("matchesWishes à « non » est pénalisé, classé après les autres", () => {
    const activites = classer(CANDIDATS, "activity", () => 10, PARAMETRES);
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
    const { complet, contexte } = executerMoteur();
    expect(TripSchema.safeParse(complet.trip).success).toBe(true);
    expect(stopsDe(complet.trip).length).toBeGreaterThan(4);
    expect(valider(complet.trip, contexte)).toEqual({ R1: 0, R2: 0, R4: 0, R5: 0, R6: 0, R8: 0 });
  });

  function modifierPremierStop(trip: Trip, modif: (stop: Stop) => Stop): Trip {
    const copie = structuredClone(trip);
    for (const day of copie.days) {
      const index = day.items.findIndex((item) => item.type === "stop");
      const item = day.items[index];
      if (item?.type === "stop") {
        day.items[index] = { type: "stop", stop: modif(item.stop) };
        return copie;
      }
    }
    return copie;
  }

  it("R1 : lieu non ancré ou source invalide", () => {
    const { complet, contexte } = executerMoteur();
    expect(valider(modifierPremierStop(complet.trip, (s) => ({ ...s, placeId: "P_INCONNU" })), contexte).R1).toBe(1);
    expect(valider(modifierPremierStop(complet.trip, (s) => ({ ...s, source: { label: "x", url: "javascript:alert(1)" } })), contexte).R1).toBe(1);
    const ferme = new Map(contexte.ancrages);
    const premier = stopsDe(complet.trip)[0]?.placeId as string;
    ferme.set(premier, { ...(ferme.get(premier) as AncrageResolu), statut: "ferme_definitivement" });
    expect(valider(complet.trip, { ...contexte, ancrages: ferme }).R1).toBe(1);
  });

  it("R2 : événement hors séjour, ou non confirmé sans « unconfirmed »", () => {
    const { complet, contexte } = executerMoteur();
    const trip = structuredClone(complet.trip);
    const evenement: Stop = {
      id: "ev-1",
      kind: "event",
      name: "Concert de test",
      start: "19:30",
      facts: {},
      source: { label: "agenda.example", url: "https://agenda.example/concert" },
      exceptions: [],
      locked: false,
    };
    trip.days[1]?.events.push(evenement);
    expect(valider(trip, contexte).R2).toBe(0);
    expect(valider(trip, { ...contexte, evenementsNonConfirmes: new Set(["ev-1"]) }).R2).toBe(1);
    expect(valider(trip, { ...contexte, brief: { ...BRIEF, depart: "2026-11-23" } }).R2).toBeGreaterThanOrEqual(1);
  });

  it("R4 : étape hors des horaires d'ouverture", () => {
    const { complet, contexte } = executerMoteur();
    const premier = stopsDe(complet.trip)[0]?.placeId as string;
    const ferme = new Map(contexte.ancrages);
    ferme.set(premier, { ...(ferme.get(premier) as AncrageResolu), horaires: [] });
    expect(valider(complet.trip, { ...contexte, ancrages: ferme }).R4).toBe(1);
  });

  it("R5 : trajet infaisable entre deux étapes", () => {
    const { complet, contexte } = executerMoteur();
    const lents = (de: string, vers: string) => (de === vers ? 0 : 600);
    expect(valider(complet.trip, { ...contexte, trajets: lents }).R5).toBeGreaterThan(0);
  });

  it("R6 : journée qui ne part pas du bon logement", () => {
    const { complet, contexte } = executerMoteur();
    const terminus = contexte.terminus.map((t, i) => (i === 0 ? { ...t, depart: "P_AUTRE" } : t));
    expect(valider(complet.trip, { ...contexte, terminus }).R6).toBe(1);
  });

  it("R8 : rythme dépassé ou temps libre insuffisant", () => {
    const { complet, contexte } = executerMoteur();
    const trip = structuredClone(complet.trip);
    const jourComplet = trip.days[1] as Trip["days"][number];
    jourComplet.travelMinutes = 600;
    expect(valider(trip, contexte).R8).toBe(1);
    const intense = structuredClone(complet.trip);
    const jour = intense.days[1] as Trip["days"][number];
    const modele = jour.items.find((item) => item.type === "stop");
    for (let i = 0; i < 4; i += 1) if (modele) jour.items.splice(1, 0, structuredClone(modele));
    expect(valider(intense, { ...contexte, brief: { ...BRIEF, rythme: "tranquille" } }).R8).toBeGreaterThanOrEqual(1);
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
