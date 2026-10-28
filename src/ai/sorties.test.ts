// @vitest-environment node
import { describe, expect, it } from "vitest";

import { lireBriefDeduit, lireNotes, lireProgramme, lireQuartier, lireRaisons, ordreEcrit, racineLisible, retoursDeQuartier } from "@/ai/sorties";

/**
 * Spécification B7a, critère `sorties: schémas stricts` : les cas existants de P0 restent dans `src/ai/ai.test.ts`
 * (inchangés) ; ici, les lecteurs ajoutés par B7a. Brief déduit invalide refusé en entier (F8-PO-17) ; quartier : zone
 * valide exigée ou « aucune zone » explicite, logement sans source `https:` écarté et compté, plus de 3 logements
 * tronqués et comptés, aucun identifiant accepté du modèle.
 */

const ZONE = { nom: "Vieille ville", raison: "Proche des musées et des transports.", centre: { lat: 55.95, lng: -3.19 }, rayonM: 800 };
const LOGEMENT = (n: number) => ({ nom: `Maison d'hôtes ${n}`, meta: "Maison d'hôtes · près du tram", sourceUrl: `https://guide.example/logement-${n}` });

describe("sorties: schémas stricts", () => {
  describe("brief déduit (structuration)", () => {
    it("un InferredBrief conforme est lu ; un brief vide est conforme", () => {
      const brief = { pace: "relaxed", wishes: ["museum", "walk"], inferredFields: ["pace", "wishes"] };
      expect(lireBriefDeduit(JSON.stringify(brief))).toEqual({ valeur: brief, refuses: 0 });
      expect(lireBriefDeduit('{"inferredFields":[]}')).toEqual({ valeur: { inferredFields: [] }, refuses: 0 });
    });

    it.each([
      ["pas du JSON", "pas du JSON"],
      ["clé inconnue", JSON.stringify({ inferredFields: [], story: "x" })],
      ["inferredFields faux", JSON.stringify({ pace: "relaxed", inferredFields: [] })],
      ["catégorie inconnue", JSON.stringify({ wishes: ["plage"], inferredFields: ["wishes"] })],
      ["un champ valide et un invalide", JSON.stringify({ pace: "relaxed", travellers: { adults: 0, children: 0 }, inferredFields: ["pace", "travellers"] })],
      ["lieu proposé", JSON.stringify({ inferredFields: [], placeId: "x" })],
    ])("%s : refusé en entier (illisible), aucun brief partiel", (_nom, texte) => {
      expect(lireBriefDeduit(texte)).toEqual({ valeur: null, refuses: 1, illisible: true });
    });
  });

  describe("quartier", () => {
    it("zone valide et logements : lus", () => {
      const lu = lireQuartier(JSON.stringify({ zone: ZONE, logements: [LOGEMENT(1), LOGEMENT(2)] }));
      expect(lu).toEqual({ valeur: { zone: ZONE, logements: [LOGEMENT(1), LOGEMENT(2)] }, refuses: 0 });
    });

    it("« aucune zone » explicite : zone nulle, aucun logement lu (ceux rendus quand même sont comptés)", () => {
      expect(lireQuartier('{"zone": null, "logements": []}')).toEqual({ valeur: { zone: null, logements: [] }, refuses: 0 });
      expect(lireQuartier(JSON.stringify({ zone: null, logements: [LOGEMENT(1)] }))).toEqual({ valeur: { zone: null, logements: [] }, refuses: 1 });
    });

    it.each([
      ["zone absente", JSON.stringify({ logements: [] })],
      ["zone invalide (rayon)", JSON.stringify({ zone: { ...ZONE, rayonM: 10 }, logements: [] })],
      ["zone avec un identifiant", JSON.stringify({ zone: { ...ZONE, areaId: "area_9" }, logements: [] })],
      ["zone avec une URL dans la raison", JSON.stringify({ zone: { ...ZONE, raison: "voir https://exemple.org" }, logements: [] })],
      ["clé de racine inconnue", JSON.stringify({ zone: ZONE, logements: [], placeId: "x" })],
      ["pas du JSON", "pas du JSON"],
    ])("%s : réponse refusée en entier (illisible)", (_nom, texte) => {
      expect(lireQuartier(texte)).toEqual({ valeur: { zone: null, logements: [] }, refuses: 1, illisible: true });
    });

    it("logement sans source https:, ou avec un identifiant proposé par le modèle : écarté et compté", () => {
      const logements = [
        LOGEMENT(1),
        { ...LOGEMENT(2), sourceUrl: "http://guide.example/x" },
        { ...LOGEMENT(3), sourceUrl: "pas une url" },
        { ...LOGEMENT(4), lodgingId: "lodging_1" },
        { ...LOGEMENT(5), placeId: "ChIJ-sentinelle" },
        { ...LOGEMENT(6), meta: "un <b>logement</b>" },
      ];
      const lu = lireQuartier(JSON.stringify({ zone: ZONE, logements }));
      // Au-delà de 3, tronqués et comptés : seuls les trois premiers sont examinés.
      expect(lu.valeur.logements).toEqual([LOGEMENT(1)]);
      expect(lu.refuses).toBe(5);
    });

    it("plus de 3 logements : tronqués et comptés", () => {
      const lu = lireQuartier(JSON.stringify({ zone: ZONE, logements: [1, 2, 3, 4, 5].map(LOGEMENT) }));
      expect(lu.valeur.logements).toEqual([1, 2, 3].map(LOGEMENT));
      expect(lu.refuses).toBe(2);
    });
  });

  it("notes et raisons : forme de P0 inchangée ; lisibilité de la racine demandée à part (couche IA)", () => {
    const ids = new Set(["c_001"]);
    expect(lireNotes("pas du JSON", ids)).toEqual({ valeur: new Map(), refuses: 1 });
    expect(lireRaisons("pas du JSON", ids)).toEqual({ valeur: new Map(), refuses: 1 });
    expect(racineLisible("pas du JSON", ["notes"])).toBe(false);
    expect(racineLisible('{"notes": [], "x": 1}', ["notes"])).toBe(false);
    expect(racineLisible('{"notes": []}', ["notes"])).toBe(true);
  });
});

/**
 * Ticket #800 (amendement 4 de `specs/P0-programme-par-ia.md`) : la règle « les étapes d'un même quartier se suivent »
 * des prompts `programme` v4 et `revision` v2 se mesure sur un programme simulé, lu par la lecture de production puis mis
 * en ordre écrit. Mesure seulement : aucun créneau retiré ni déplacé. Aucune coordonnée ni donnée Google.
 */
describe("sorties: retours de quartier (journées sans allers-retours)", () => {
  const SEJOUR = { arrivee: "2027-05-04", depart: "2027-05-05" };
  const etape = (debut: string, nature: string, lieu: string, quartier?: string) => ({
    debut,
    nature,
    lieu,
    pourquoi: "Parce que c'est sur ton chemin.",
    ...(quartier === undefined ? {} : { quartier }),
    aReserver: false,
    incontournable: false,
  });
  const lire = (jours: unknown[]) => {
    const lecture = lireProgramme(JSON.stringify({ titre: "Essai", jours, bonsPlans: [] }), SEJOUR);
    expect(lecture).toMatchObject({ illisible: false, creneauxRetires: 0, champsRetires: 0 });
    return ordreEcrit(lecture.valeur!);
  };

  it("programme simulé en parcours : quartiers consécutifs, aucun retour", () => {
    const programme = lire([
      {
        date: "2027-05-04",
        creneaux: [
          { debut: "09:00", nature: "arrivee" },
          etape("10:00", "visite", "Musée A", "Monti"),
          etape("12:30", "repas_midi", "Trattoria B", "monti"),
          etape("14:30", "visite", "Basilique C", "Celio"),
          { debut: "16:00", nature: "pause" },
          etape("17:00", "visite", "Jardin D", "Célio"),
          etape("19:00", "apero", "Bar E"),
          etape("20:30", "repas_soir", "Osteria F", "Testaccio"),
        ],
      },
      { date: "2027-05-05", creneaux: [etape("09:30", "visite", "Place G", "Centro storico"), { debut: "12:00", nature: "depart" }] },
    ]);
    expect(retoursDeQuartier(programme)).toEqual([0, 0]);
  });

  it("aller-retour mesuré dans l'ordre écrit (A, B, A, B) ; rien n'est retiré ; arrivée et départ ignorés", () => {
    const programme = lire([
      {
        date: "2027-05-04",
        // Ordre de l'IA mélangé : la mesure suit l'ordre écrit (tri stable par heure).
        creneaux: [
          etape("14:30", "visite", "Fontaine C", "Monti"),
          etape("10:00", "visite", "Musée A", "Monti"),
          etape("12:30", "repas_midi", "Trattoria B", "Prati"),
          etape("17:00", "visite", "Château D", "Prati"),
          { debut: "18:00", nature: "depart", lieu: "Gare", quartier: "Monti", pourquoi: "Ton train." },
        ],
      },
    ]);
    expect(programme.jours[0]?.creneaux).toHaveLength(5);
    // Ordre écrit : Monti (10:00), Prati (12:30), Monti (14:30), Prati (17:00) ; le départ à Monti ne compte pas.
    expect(retoursDeQuartier(programme)).toEqual([2]);
  });
});
