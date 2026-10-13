// @vitest-environment node
import { describe, expect, it } from "vitest";

import { BriefSchema as BriefContratSchema } from "@/contracts";
import { INCONNU } from "@/domain/relectures";
import type { AncrageResolu, Trajets } from "@/prototype/ancrage";
import type { Brief } from "@/prototype/brief";
import type { CandidatNote } from "@/prototype/candidat";

import {
  briefDepuisBrief,
  candidatVersMoteur,
  engagementsDepuisBrief,
  evenementVersMoteur,
  modeDeTrajet,
  nuitsDepuisBrief,
  relecturesDepuisAncrages,
  rythmeVersPace,
  voyageDepuisBrief,
} from "../../../scripts/p0/vers-moteur";

/**
 * Adaptateur de P0 vers les entrées du moteur (décision 0045 § 1.3, B5-TL-1) : conversion testée, pas une copie de
 * types. Jeux fabriqués ici ; identifiants de lieu sentinelles.
 */

const BRIEF: Brief = {
  schema: 1,
  destination: "Édimbourg",
  pays: "Royaume-Uni",
  fuseau: "Europe/London",
  arrivee: "2026-11-23",
  depart: "2026-11-27",
  heureArrivee: "11:30",
  heureDepart: "16:00",
  voyageurs: { adultes: 2, enfants: 1 },
  rythme: "tranquille",
  envies: ["walk", "museum"],
  deplacements: ["walk", "transit"],
  budgetRepas: 2,
  logements: [
    { texte: "Logement A", nuits: 2 },
    { texte: "Logement B", nuits: 2 },
  ],
  engagements: [
    { libelle: "Concert", date: "2026-11-24", heure: "20:00", type: "ticket" },
    { libelle: "Table", date: "2026-11-25", heure: "19:30", type: "reservation" },
  ],
};

const CANDIDAT: CandidatNote = {
  id: "c_001",
  nom: "Lieu de test",
  resume: "Résumé maison.",
  categorie: "museum",
  typeEtape: "activity",
  source: { url: "https://guide.example/page", date: "2026-09-01", classe: "officielle" },
  aReserver: true,
  prixParPersonne: 12,
  dureeMinutes: 90,
  notes: { matchesWishes: true, notForMeRisk: 1, mustSee: true, slotFit: ["activity"] },
};

const ancre = (placeId: string, extra: Partial<AncrageResolu> = {}): AncrageResolu => ({
  resolu: true,
  placeId,
  statut: "ouvert",
  position: { lat: 1, lng: 1 },
  horaires: [{ jour: 2, debut: 600, fin: 1080 }],
  ...extra,
});

describe("vers-moteur: brief de P0 vers le voyage et le brief des contrats", () => {
  it("rythmes tranquille, equilibre, intense → relaxed, balanced, intense", () => {
    expect((["tranquille", "equilibre", "intense"] as const).map(rythmeVersPace)).toEqual(["relaxed", "balanced", "intense"]);
  });

  it("voyage et brief des contrats ; budgetRepas non repris ; brief accepté par le schéma des contrats", () => {
    expect(voyageDepuisBrief(BRIEF)).toEqual({
      destination: "Édimbourg",
      start: "2026-11-23",
      end: "2026-11-27",
      timeZone: "Europe/London",
      travellers: { adults: 2, children: 1 },
    });
    const brief = briefDepuisBrief(BRIEF);
    expect(brief).toEqual({
      travellers: { adults: 2, children: 1 },
      pace: "relaxed",
      wishes: ["walk", "museum"],
      limits: [],
      mobility: ["walk", "transit"],
      inferredFields: [],
    });
    expect(BriefContratSchema.safeParse(brief).success).toBe(true);
  });

  it("vols synthétiques d'arrivée et de départ, puis ticket → ticket et reservation → booking", () => {
    expect(engagementsDepuisBrief(BRIEF)).toEqual([
      { kind: "flight", label: "Arrivée", date: "2026-11-23", start: "11:30" },
      { kind: "flight", label: "Départ", date: "2026-11-27", start: "16:00" },
      { kind: "ticket", label: "Concert", date: "2026-11-24", start: "20:00" },
      { kind: "booking", label: "Table", date: "2026-11-25", start: "19:30" },
    ]);
    const { engagements: _sans, ...sansEngagement } = BRIEF;
    void _sans;
    expect(engagementsDepuisBrief(sansEngagement)).toHaveLength(2);
  });

  it("une nuit par nuit du séjour, avec l'ancrage de son logement ; mode de trajet de la matrice", () => {
    expect(nuitsDepuisBrief(BRIEF, ["SENTINELLE_A"])).toEqual([
      { etiquette: "Logement A", placeId: "SENTINELLE_A" },
      { etiquette: "Logement A", placeId: "SENTINELLE_A" },
      { etiquette: "Logement B" },
      { etiquette: "Logement B" },
    ]);
    expect(modeDeTrajet(BRIEF)).toBe("transit");
    expect(modeDeTrajet({ ...BRIEF, deplacements: ["walk"] })).toBe("walk");
    expect(modeDeTrajet({ ...BRIEF, deplacements: ["car"] })).toBe("car");
  });
});

describe("vers-moteur: candidats", () => {
  it("candidat de la réserve : faits, source, notes et placeId de l'ancrage ; prix non nul non repris", () => {
    const moteur = candidatVersMoteur(CANDIDAT, ancre("SENTINELLE_LIEU"));
    expect(moteur).toEqual({
      id: "c_001",
      nom: "Lieu de test",
      resume: "Résumé maison.",
      categorie: "museum",
      typeEtape: "activity",
      faits: { durationMinutes: 90 },
      sources: [{ url: "https://guide.example/page", date: "2026-09-01", classe: "officielle" }],
      notes: CANDIDAT.notes,
      placeId: "SENTINELLE_LIEU",
      aReserver: true,
    });
    expect(candidatVersMoteur({ ...CANDIDAT, prixParPersonne: 0 }, undefined).faits).toEqual({ durationMinutes: 90, costPerPerson: 0 });
    expect(candidatVersMoteur(CANDIDAT, undefined)).not.toHaveProperty("placeId");
    expect(() => candidatVersMoteur({ ...CANDIDAT, typeEtape: "event" }, undefined)).toThrow();
  });

  it("événement : date, heure et date relue ; sans information d'événement : undefined", () => {
    const evenement = { ...CANDIDAT, typeEtape: "event" as const, evenement: { date: "2026-11-24", dateConfirmee: false } };
    expect(evenementVersMoteur(evenement, undefined)?.evenement).toEqual({ date: "2026-11-24", dateRelue: false });
    expect(evenementVersMoteur({ ...evenement, evenement: { date: "2026-11-24", heure: "19:30", dateConfirmee: true } }, ancre("SENTINELLE_E"))).toMatchObject({
      placeId: "SENTINELLE_E",
      evenement: { date: "2026-11-24", heure: "19:30", dateRelue: true },
    });
    expect(evenementVersMoteur(CANDIDAT, undefined)).toBeUndefined();
  });
});

describe("vers-moteur: doubles des interfaces Relectures", () => {
  const nuits = nuitsDepuisBrief(BRIEF, ["SENTINELLE_LOGEMENT_A", "SENTINELLE_LOGEMENT_B"]);
  const parPlace = new Map<string, AncrageResolu>([
    ["SENTINELLE_LIEU", ancre("SENTINELLE_LIEU")],
    ["SENTINELLE_FERME", ancre("SENTINELLE_FERME", { statut: "ferme_definitivement" })],
    ["SENTINELLE_TEMP", ancre("SENTINELLE_TEMP", { statut: "ferme_temporairement" })],
    ["SENTINELLE_SANS_HORAIRES", ancre("SENTINELLE_SANS_HORAIRES", { horaires: null })],
  ]);
  const trajets: Trajets = (de, vers) => (de === "SENTINELLE_SANS_TRAJET" || vers === "SENTINELLE_SANS_TRAJET" ? undefined : `${de}>${vers}`.length);
  const relectures = relecturesDepuisAncrages(parPlace, nuits, trajets);

  it("validité : ouvert ou fermé temporairement → valide ; fermé définitivement ; non ancré → introuvable", () => {
    expect(relectures.validite("SENTINELLE_LIEU")).toBe("valide");
    expect(relectures.validite("SENTINELLE_TEMP")).toBe("valide");
    expect(relectures.validite("SENTINELLE_FERME")).toBe("ferme_definitivement");
    expect(relectures.validite("SENTINELLE_ABSENT")).toBe("introuvable");
  });

  it("plages : celles du jour de la semaine de la date ; horaires inconnus ou lieu absent → inconnu", () => {
    // 2026-11-24 est un mardi (jour 2).
    expect(relectures.plages("SENTINELLE_LIEU", "2026-11-24")).toEqual([{ debut: 600, fin: 1080 }]);
    expect(relectures.plages("SENTINELLE_LIEU", "2026-11-25")).toEqual([]);
    expect(relectures.plages("SENTINELLE_SANS_HORAIRES", "2026-11-24")).toBe(INCONNU);
    expect(relectures.plages("SENTINELLE_ABSENT", "2026-11-24")).toBe(INCONNU);
  });

  it("durées : matrice de P0, logement par index de nuit, mode ignoré ; trajet absent → inconnu", () => {
    const attendu = "SENTINELLE_LOGEMENT_B>SENTINELLE_LIEU".length;
    expect(relectures.duree({ logement: 2 }, { lieu: "SENTINELLE_LIEU" }, "walk")).toBe(attendu);
    expect(relectures.duree({ logement: 2 }, { lieu: "SENTINELLE_LIEU" }, "car")).toBe(attendu);
    expect(relectures.duree({ logement: 0 }, { lieu: "SENTINELLE_LIEU" }, "walk")).toBe("SENTINELLE_LOGEMENT_A>SENTINELLE_LIEU".length);
    expect(relectures.duree({ lieu: "SENTINELLE_LIEU" }, { lieu: "SENTINELLE_SANS_TRAJET" }, "walk")).toBe(INCONNU);
  });
});
