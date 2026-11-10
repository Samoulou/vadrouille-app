// @vitest-environment node
import { describe, expect, it } from "vitest";

import { cadreLectureChangements, DUREE_ESTIMEE_MINUTES, lireBriefDeduit, lireDureeEstimee, lireNotes, lireProgramme, lireQuartier, lireRaisons, ordreEcrit, racineLisible, retoursDeQuartier } from "@/ai/sorties";

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

/**
 * M4a (ticket #920) : lecture tolérante de la durée estimée de la sortie du prompt `programme` v5 (décision 0148 § 2 et
 * § 5.3 ; verdict de la Sécurité 0149 S-M4-2, tests exigés de M4a). La durée n'est lue qu'au niveau d'une journée de
 * changement de ville à départ estimé (`joursDureeEstimee`), comme nombre JSON entier de 20 à 600, arrondi à 5 ; toute
 * autre valeur est retirée et comptée (`champsRetires`), jamais convertie ni remplacée : la journée garde alors sa
 * « durée à confirmer » (champ absent).
 */
describe("sorties: durée estimée du programme v5 (0149 S-M4-2)", () => {
  const SEJOUR = { arrivee: "2027-05-04", depart: "2027-05-08" };
  const CHANGEMENT = "2027-05-06";
  const CADRE = { joursDureeEstimee: [CHANGEMENT] };
  const creneau = { debut: "09:30", fin: "10:30", nature: "visite", lieu: "Musée maison", quartier: "Centre", pourquoi: "Pour commencer la journée." };
  const sortie = (duree: unknown, date = CHANGEMENT) =>
    JSON.stringify({
      jours: [
        { date: "2027-05-05", titre: "Centre", creneaux: [creneau] },
        { date, ...(duree === undefined ? {} : { dureeEstimeeMinutes: duree }), creneaux: [creneau] },
      ],
      bonsPlans: [],
    });
  const lire = (duree: unknown, date = CHANGEMENT) => lireProgramme(sortie(duree, date), SEJOUR, CADRE);
  const jourDuChangement = (lecture: ReturnType<typeof lireProgramme>) => lecture.valeur?.jours.find((jour) => jour.date === CHANGEMENT);

  it("programme v5: durée estimée entière dans les bornes lue sur la journée de changement de ville", () => {
    const lecture = lire(90);
    expect(lecture).toMatchObject({ illisible: false, joursRetires: 0, creneauxRetires: 0, champsRetires: 0 });
    expect(jourDuChangement(lecture)?.dureeEstimeeMinutes).toBe(90);
    // Les autres journées n'ont aucune durée ; l'ordre écrit la garde.
    expect(lecture.valeur?.jours[0]).not.toHaveProperty("dureeEstimeeMinutes");
    expect(ordreEcrit(lecture.valeur!).jours[1]?.dureeEstimeeMinutes).toBe(90);
  });

  it.each([
    ["chaîne de chiffres", "120"],
    ["texte", "2 h"],
    ["booléen", true],
    ["objet", { minutes: 120 }],
    ["null", null],
  ])("programme v5: durée estimée en texte retirée (%s), jamais convertie", (_nom, duree) => {
    const lecture = lire(duree);
    expect(jourDuChangement(lecture)).not.toHaveProperty("dureeEstimeeMinutes");
    expect(lecture.champsRetires).toBe(1);
    expect(lecture.creneauxRetires).toBe(0);
  });

  it.each([120.5, 92.4, Number.MAX_SAFE_INTEGER + 2])("programme v5: durée estimée non entière retirée (%s), jamais arrondie", (duree) => {
    const lecture = lire(duree);
    expect(jourDuChangement(lecture)).not.toHaveProperty("dureeEstimeeMinutes");
    expect(lecture.champsRetires).toBe(1);
  });

  it.each([
    [93, 95],
    [92, 90],
    [20, 20],
    [22, 20],
    [23, 25],
    [598, 600],
    [600, 600],
  ])("programme v5: durée estimée arrondie aux 5 minutes (%s → %s)", (duree, attendue) => {
    const lecture = lire(duree);
    expect(jourDuChangement(lecture)?.dureeEstimeeMinutes).toBe(attendue);
    expect(lecture.champsRetires).toBe(0);
  });

  it.each([19, 601, 0, -90, 6000])("programme v5: durée estimée hors bornes retirée (%s) → durée à confirmer", (duree) => {
    const lecture = lire(duree);
    expect(jourDuChangement(lecture)).not.toHaveProperty("dureeEstimeeMinutes");
    expect(lecture.champsRetires).toBe(1);
  });

  it("programme v5: durée estimée sur un jour ordinaire ignorée et comptée", () => {
    const ordinaire = lireProgramme(
      JSON.stringify({ jours: [{ date: "2027-05-05", dureeEstimeeMinutes: 90, creneaux: [creneau] }], bonsPlans: [] }),
      SEJOUR,
      CADRE,
    );
    expect(ordinaire.valeur?.jours[0]).not.toHaveProperty("dureeEstimeeMinutes");
    expect(ordinaire.champsRetires).toBe(1);
    // Départ saisi : la date n'est pas dans le cadre, la durée est ignorée de même (0148 § 2 point 2).
    const saisi = lireProgramme(sortie(90), SEJOUR, { joursDureeEstimee: [] });
    expect(jourDuChangement(saisi)).not.toHaveProperty("dureeEstimeeMinutes");
    expect(saisi.champsRetires).toBe(1);
    // Sans cadre (prompts v4 et revision) : ignorée partout, comme toute clé inconnue.
    const v4 = lireProgramme(sortie(90), SEJOUR);
    expect(jourDuChangement(v4)).not.toHaveProperty("dureeEstimeeMinutes");
    expect(v4.champsRetires).toBe(1);
  });

  it("programme v5: durée absente → durée à confirmer, rien n'est compté ni inventé", () => {
    const lecture = lire(undefined);
    expect(jourDuChangement(lecture)).not.toHaveProperty("dureeEstimeeMinutes");
    expect(lecture.champsRetires).toBe(0);
  });

  it("lireDureeEstimee : ordre des contrôles et bornes inclusives de 0149", () => {
    expect(DUREE_ESTIMEE_MINUTES).toEqual({ min: 20, max: 600 });
    expect(DUREE_ESTIMEE_MINUTES.min % 5).toBe(0);
    expect(DUREE_ESTIMEE_MINUTES.max % 5).toBe(0);
    for (const refusee of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, "90", 90n, undefined, [90]]) expect(lireDureeEstimee(refusee)).toBeUndefined();
    expect(lireDureeEstimee(20)).toBe(20);
    expect(lireDureeEstimee(600)).toBe(600);
    expect(lireDureeEstimee(137)).toBe(135);
    expect(lireDureeEstimee(138)).toBe(140);
  });
});

/**
 * M4a-2 (ticket #926) : lecture tolérante de la sortie du prompt `revision` v3, par la même lecture que la v5 et le même
 * cadre, dérivé des `changements` de l'entrée (`cadreLectureChangements`) : durée estimée lue seulement sur une journée
 * de changement de ville à départ estimé, nombre JSON entier de 20 à 600, arrondi à 5, retirée sinon ; un `transfer`
 * écrit par le modèle n'est jamais lu (le code le recopie, 0148 § 8 point 2) ; la ville d'un créneau reste facultative
 * (le cadrage de M4b l'écrase).
 */
describe("sorties: lecture de la sortie revision v3 (mêmes contrôles que la v5)", () => {
  const SEJOUR = { arrivee: "2027-06-10", depart: "2027-06-15" };
  const CHANGEMENTS = [
    { date: "2027-06-12", source: "saisi" as const },
    { date: "2027-06-13", source: "estime" as const },
  ];
  const CADRE = cadreLectureChangements(CHANGEMENTS);
  const creneau = { debut: "09:30", fin: "10:30", nature: "visite", lieu: "Musée maison", quartier: "Centre", pourquoi: "Pour commencer la journée." };
  const sortie = (jourEstime: Record<string, unknown>, jourSaisi: Record<string, unknown> = {}) =>
    JSON.stringify({
      jours: [
        { date: "2027-06-11", titre: "Centre", creneaux: [creneau] },
        { date: "2027-06-12", ...jourSaisi, creneaux: [creneau] },
        { date: "2027-06-13", ...jourEstime, creneaux: [creneau] },
      ],
      bonsPlans: [],
    });
  const jour = (lecture: ReturnType<typeof lireProgramme>, date: string) => lecture.valeur?.jours.find((j) => j.date === date);

  it("cadreLectureChangements : seules les dates des départs estimés", () => {
    expect(CADRE).toEqual({ joursDureeEstimee: ["2027-06-13"] });
    expect(cadreLectureChangements([])).toEqual({ joursDureeEstimee: [] });
  });

  it.each([
    [93, 95],
    [20, 20],
    [600, 600],
  ])("revision v3: durée estimée entière lue et arrondie aux 5 minutes (%s → %s)", (duree, attendue) => {
    const lecture = lireProgramme(sortie({ dureeEstimeeMinutes: duree }), SEJOUR, CADRE);
    expect(jour(lecture, "2027-06-13")?.dureeEstimeeMinutes).toBe(attendue);
    expect(lecture.champsRetires).toBe(0);
  });

  it.each([["texte", "120"], ["non entière", 120.5], ["sous la borne", 19], ["au-dessus de la borne", 601], ["null", null]])(
    "revision v3: durée estimée refusée (%s) retirée et comptée, jamais convertie",
    (_nom, duree) => {
      const lecture = lireProgramme(sortie({ dureeEstimeeMinutes: duree }), SEJOUR, CADRE);
      expect(jour(lecture, "2027-06-13")).not.toHaveProperty("dureeEstimeeMinutes");
      expect(lecture.champsRetires).toBe(1);
    },
  );

  it("revision v3: durée estimée sur un départ saisi ou un jour ordinaire ignorée et comptée", () => {
    const lecture = lireProgramme(
      JSON.stringify({
        jours: [
          { date: "2027-06-11", dureeEstimeeMinutes: 90, creneaux: [creneau] },
          { date: "2027-06-12", dureeEstimeeMinutes: 90, creneaux: [creneau] },
        ],
        bonsPlans: [],
      }),
      SEJOUR,
      CADRE,
    );
    for (const j of lecture.valeur!.jours) expect(j).not.toHaveProperty("dureeEstimeeMinutes");
    expect(lecture.champsRetires).toBe(2);
  });

  it("revision v3: un transfer écrit par le modèle n'est jamais lu (racine, journée, créneau, nature), compté", () => {
    const transfer = { label: "Train", start: "12:10", end: "13:45" };
    const texte = JSON.stringify({
      transfer,
      jours: [
        { date: "2027-06-11", titre: "Centre", creneaux: [creneau] },
        {
          date: "2027-06-13",
          transfer,
          dureeEstimeeMinutes: 180,
          creneaux: [
            { ...creneau, transfer },
            { debut: "11:30", fin: "14:30", nature: "transfer", lieu: "Gare", pourquoi: "Le train." },
            { debut: "11:30", fin: "14:30", nature: "trajet", pourquoi: "Le train." },
          ],
        },
      ],
      bonsPlans: [],
    });
    const lecture = lireProgramme(texte, SEJOUR, CADRE);
    expect(lecture.valeur).not.toBeNull();
    expect(JSON.stringify(lecture.valeur)).not.toMatch(/transfer|trajet|Train|Gare/);
    const changement = jour(lecture, "2027-06-13");
    expect(changement?.dureeEstimeeMinutes).toBe(180);
    expect(changement?.creneaux).toHaveLength(1);
    // Clés `transfer` de la racine, de la journée et du créneau : comptées ; créneaux de nature hors liste : retirés.
    expect(lecture.champsRetires).toBe(3);
    expect(lecture.creneauxRetires).toBe(2);
  });

  it("revision v3: une ville écrite par créneau reste facultative (le cadrage de M4b l'écrase), jamais un refus", () => {
    const lecture = lireProgramme(sortie({}, {}).replace('"quartier":"Centre"', '"quartier":"Centre","ville":"Porto"'), SEJOUR, CADRE);
    expect(lecture).toMatchObject({ illisible: false, joursRetires: 0, creneauxRetires: 0, champsRetires: 0 });
  });
});
