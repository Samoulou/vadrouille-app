// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createMockTripAdapter } from "@/adapters/mock";
import { createMockStopReports } from "@/adapters/mock-reports";

import type { ClientModeles, EtapeRequete } from "@/ai/client";
import { creerCoucheIa, type ReglagesIa } from "@/ai/couche";
import { EntreeProgrammeV5Schema, versEntreeQuartier, type EntreeModeles, type EntreeProgrammeV5 } from "@/ai/entrees";
import { PROMPT_PROGRAMME, PROMPT_PROGRAMME_V5 } from "@/ai/prompts/programme";
import { creerRedigerProgramme, creerRedigerProgrammeV5 } from "@/ai/rediger-programme";
import { requeteProgrammeV5 } from "@/ai/requetes";
import type { LodgingRequest } from "@/contracts";
import { creerPlacesSimule } from "@/grounding/places.simule";
import { creerRoutesSimule } from "@/grounding/routes.simule";
import { EDIMBOURG_TRIP_ID, MOCK_ORGANIZATION_ID, MOCK_USER_ID } from "@/mocks/edimbourg";
import { entreeRevisionDepuisJours } from "@/server/programme/revision";
import { candidatPourModele, entreeModelesDepuisBrief, entreeProgrammeDepuisBrief, lieuRetenuDepuisCandidat } from "@/server/p0/vers-couche-ia";

import { journalDePrompts } from "../../support/journal-prompts";
import { avecSentinellesGoogle, sentinellesPresentes } from "../../support/sentinelles-google";
import { charger, executerCapture } from "../p0/harnais";

/**
 * B7a (spécification, critère « prompts: aucun prompt journalisé ne contient de donnée Google » ; handover § 10 et § 12 ;
 * décision 0011). Un seul test, étendu en canari par B9 : clients Places et Routes décorés à valeurs sentinelles sur
 * chaque champ de leur interface, valeurs de `GroundingVerdict`, codes `R1` à `R10`. Aucune sentinelle dans les
 * requêtes du journal de prompts (messages système et données), ni dans les requêtes de recherche web.
 *
 * - `plan`, `recherche`, `notation`, `raisons` : l'orchestrateur de P0 de bout en bout (les clients Google y sont
 *   appelés, et leurs réponses sentinelles circulent dans le moteur avant l'étape `raisons`) ;
 * - `structuration`, `quartier` (et les cinq méthodes de la couche) : `creerCoucheIa` sur des entrées construites
 *   après les mêmes appels Google. **Test de fumée** (revue du head `5a955f8`, mineur 9) : aucune sentinelle n'entre
 *   dans ces entrées, il passerait donc même en cas de fuite ; le canari est le premier test (orchestrateur de P0), que
 *   B9 étendra à ses étapes.
 *
 * Distances et polylignes ne sont pas des champs des interfaces `ClientPlaces` et `ClientRoutes` (le client réel ne
 * les rend jamais) : elles restent couvertes par le test de P0r1 sur le client réel (réponse Q13 de la revue).
 */

const ROUTAGE = { data_collection: "deny" as const };
const REGLAGES: ReglagesIa = {
  structuration: { modele: "test/structuration", routage: ROUTAGE },
  quartier: { modele: "test/quartier", routage: ROUTAGE },
  plan: { modele: "test/plan", routage: ROUTAGE },
  notation: { modele: "test/notation", routage: ROUTAGE },
  raisons: { modele: "test/raisons", routage: ROUTAGE },
};
const REPONSES: Partial<Record<EtapeRequete, string>> = {
  structuration: JSON.stringify({ pace: "relaxed", inferredFields: ["pace"] }),
  quartier: JSON.stringify({ zone: null, logements: [] }),
  plan: JSON.stringify({ requetes: [{ requete: "musées Édimbourg", creneau: "activity" }] }),
  notation: JSON.stringify({ notes: [] }),
  raisons: JSON.stringify({ raisons: [] }),
};

describe("prompts: aucun prompt journalisé ne contient de donnée Google", () => {
  it("plan, recherche, notation, raisons : orchestrateur de P0 avec clients Google à sentinelles", async () => {
    const { fixtures } = charger();
    const sentinelles = avecSentinellesGoogle({ places: creerPlacesSimule(fixtures.places), routes: creerRoutesSimule(fixtures.routes) });
    const { resultat, capture } = await executerCapture({ google: { places: sentinelles.places, routes: sentinelles.routes } });

    // Le canari mord : les clients Google ont bien été appelés et ont rendu des valeurs sentinelles.
    expect(capture.details.length).toBeGreaterThan(0);
    expect(capture.matrices.length).toBeGreaterThan(0);
    expect(sentinelles.valeurs.size).toBeGreaterThan(5);
    // … et leurs valeurs ont circulé dans l'orchestrateur (résultat du moteur) : leur absence des prompts n'est pas fortuite.
    expect(sentinellesPresentes(JSON.stringify(resultat), sentinelles).length).toBeGreaterThan(0);
    const etapes = new Set(capture.requetes.map((requete) => requete.etape));
    for (const etape of ["plan", "recherche", "notation", "raisons"] as const) expect(etapes, etape).toContain(etape);

    for (const requete of capture.requetes) expect(sentinellesPresentes(JSON.stringify(requete), sentinelles), requete.etape).toEqual([]);
    expect(sentinellesPresentes(JSON.stringify(capture.recherches), sentinelles)).toEqual([]);
  });

  it("structuration, quartier et les cinq méthodes de la couche IA : entrées de production, aucune sentinelle", async () => {
    const { brief, fixtures } = charger();
    const sentinelles = avecSentinellesGoogle({ places: creerPlacesSimule(fixtures.places), routes: creerRoutesSimule(fixtures.routes) });
    // Les clients Google sont appelés avant la couche IA, comme dans un workflow : leurs valeurs ne doivent pas la traverser.
    for (const lieu of Object.values(fixtures.places.lieux)) await sentinelles.places.details(lieu.placeId);
    expect(sentinelles.valeurs.size).toBeGreaterThan(5);

    const modeles: ClientModeles = { envoyer: async (requete) => ({ texte: REPONSES[requete.etape] ?? "{}", coutUsd: 0 }) };
    const journal = journalDePrompts(modeles);
    const couche = creerCoucheIa({ modeles: journal.client, reglages: REGLAGES });
    const entree: EntreeModeles = entreeModelesDepuisBrief(brief);
    const demande: LodgingRequest = {
      draft: { destination: brief.destination, start: brief.arrivee, end: brief.depart, lodging: { kind: "none" }, otherCities: [], commitments: [] },
      city: 0,
    };
    const quartier = versEntreeQuartier(demande);

    expect(
      await couche.structurerBrief({ story: "Nous aimons les musées.", trip: { destination: brief.destination, start: brief.arrivee, end: brief.depart, otherCities: [] } }),
    ).toMatchObject({ ok: true });
    await couche.proposerQuartier({ quartier, resultats: [{ url: "https://guide.example/logements", titre: "Logements", extrait: "Centre." }] });
    await couche.planifierRecherche({ entree });
    const candidat = { id: "c_001", nom: "Musée maison", resume: "Résumé maison.", categorie: "museum", typeEtape: "activity", source: { url: "https://guide.example/m", date: "2026-09-01", classe: "independante" }, aReserver: false } as const;
    await couche.noter({ entree, candidats: [candidatPourModele(candidat)] });
    await couche.rediger({ entree, lieux: [lieuRetenuDepuisCandidat(candidat)] });

    expect(journal.requetes.map((requete) => requete.etape)).toEqual(["structuration", "quartier", "plan", "notation", "raisons"]);
    for (const requete of journal.requetes) expect(sentinellesPresentes(JSON.stringify(requete), sentinelles), requete.etape).toEqual([]);
  });

  // A13 (`specs/P0-programme-par-ia.md` § 11.6, amendement 2 ; 0121 § 5 ; 0122 § 3, écrite au temps de la v2 : « le prompt
  // `programme` v2 ne reçoit toujours que le brief », règle tenue à l'identique par la v4) : la requête du prompt `programme`
  // v4 envoyée par la capacité de `p0Run` ne porte aucune valeur rendue par les clients Google, même appelés avant elle ;
  // une entrée à clé Google glissée est refusée sans requête.
  it("programme: prompt v4 demande le site officiel, sans donnée Google (A13) : requête journalisée sans sentinelle", async () => {
    const { brief, fixtures } = charger();
    const sentinelles = avecSentinellesGoogle({ places: creerPlacesSimule(fixtures.places), routes: creerRoutesSimule(fixtures.routes) });
    for (const lieu of Object.values(fixtures.places.lieux)) await sentinelles.places.details(lieu.placeId);
    expect(sentinelles.valeurs.size).toBeGreaterThan(5);

    const modeles: ClientModeles = { envoyer: async () => ({ texte: "{}", coutUsd: 0 }) };
    const journal = journalDePrompts(modeles);
    const rediger = creerRedigerProgramme(journal.client, { modele: "test/programme", routage: ROUTAGE });
    await rediger(entreeProgrammeDepuisBrief(brief));

    expect(journal.requetes).toHaveLength(1);
    const [requete] = journal.requetes;
    expect(requete?.prompt).toEqual({ id: "programme", version: 4 });
    expect(PROMPT_PROGRAMME.version).toBe(4);
    expect(journal.texte()).toContain('\\"site\\" (facultatif)');
    expect(sentinellesPresentes(journal.texte(), sentinelles)).toEqual([]);
    for (const cle of ["placeId", "place_id", "websiteUri", "lat", "lng"]) {
      expect(journal.texte(), cle).not.toContain(`"${cle}"`);
      expect(journal.texte(), cle).not.toContain(`\\"${cle}\\"`);
    }

    // Lot 5 de E2E-essai : sans « à éviter » saisi, aucun champ `aEviter` dans l'entrée ; avec, le champ est transmis
    // (catégories maison seulement) et la requête reste sans sentinelle Google.
    expect(brief.aEviter).toBeUndefined();
    expect(journal.texte()).not.toContain('\\"aEviter\\":');
    const aEviter = (["nightlife", "market", "nature", "museum"] as const).filter((categorie) => !brief.envies.includes(categorie)).slice(0, 2);
    expect(aEviter.length).toBeGreaterThan(0);
    await rediger(entreeProgrammeDepuisBrief({ ...brief, aEviter }));
    expect(journal.requetes).toHaveLength(2);
    const avecAEviter = JSON.stringify(journal.requetes[1]);
    expect(avecAEviter).toContain(`\\"aEviter\\":${JSON.stringify(JSON.stringify(aEviter)).slice(1, -1)}`);
    expect(sentinellesPresentes(avecAEviter, sentinelles)).toEqual([]);

    // Une donnée Google glissée dans l'entrée (clé en trop) : refusée par le schéma strict, aucune requête de plus.
    const placeId = Object.values(fixtures.places.lieux)[0]?.placeId;
    expect(placeId).toBeDefined();
    const glissee = { ...entreeProgrammeDepuisBrief(brief), placeId } as Parameters<typeof rediger>[0];
    await expect(rediger(glissee)).rejects.toBeInstanceOf(RangeError);
    expect(journal.requetes).toHaveLength(2);
  });
});

/**
 * M4a (ticket #920 ; spécification M4 § 5 point 1 ; décision 0148 § 8 point 3 ; verdict de la Sécurité 0149 S-M4-1,
 * S-M4-2 et S-M4-5, tests exigés de M4a). Entrée v5 d'un voyage Rome puis Florence, telle que la construira
 * `briefProgrammeDepuisFormulaire` (M4b) d'un brouillon avec un « Billet » « Train Rome–Florence » de 12:10 à 13:45 le
 * jour du changement de ville : le billet est devenu le changement de ville (`changements`, heures et source seulement)
 * et n'est plus dans `engagements` ; une Sortie du soir garde son libellé et sa fin. La requête passe par la capacité
 * de production (`creerRedigerProgrammeV5`), journalisée.
 */
const LIBELLE_BILLET = "Train Rome–Florence";
const ENTREE_V5: EntreeProgrammeV5 = {
  destination: "Rome",
  pays: "Italie",
  arrivee: "2027-05-04",
  depart: "2027-05-09",
  heureArrivee: "11:00",
  heureDepart: "17:00",
  voyageurs: { adultes: 2, enfants: 0 },
  rythme: "equilibre",
  envies: ["heritage", "restaurant", "walk"],
  deplacements: ["walk", "transit"],
  budgetRepas: 2,
  villes: [
    { nom: "Rome", arrivee: "2027-05-04", nuits: 3, logement: "Hôtel des Monts, Rome" },
    { nom: "Florence", arrivee: "2027-05-07", nuits: 2, logement: "Maison d'hôtes de l'Arno, Florence" },
  ],
  changements: [{ date: "2027-05-07", de: "Rome", vers: "Florence", source: "saisi", depart: "12:10", arrivee: "13:45", activitesMax: 2 }],
  engagements: [{ libelle: "Concert d'orgue", date: "2027-05-08", heure: "20:30", fin: "22:00", type: "reservation" }],
  recit: "Nous aimons marcher et bien manger.",
};

describe("prompts: entrée et requête programme v5 (plusieurs villes, M4a)", () => {
  const preparer = () => {
    const modeles: ClientModeles = { envoyer: async () => ({ texte: "{}", coutUsd: 0 }) };
    const journal = journalDePrompts(modeles);
    const rediger = creerRedigerProgrammeV5(journal.client, { modele: "test/programme", routage: { data_collection: "allow", zdr: false } as unknown as ReglagesIa["plan"]["routage"] });
    return { journal, rediger };
  };

  it("programme: prompt v5 sans donnée Google : requête journalisée sans sentinelle, zdr et data_collection deny imposés", async () => {
    const { brief, fixtures } = charger();
    const sentinelles = avecSentinellesGoogle({ places: creerPlacesSimule(fixtures.places), routes: creerRoutesSimule(fixtures.routes) });
    for (const lieu of Object.values(fixtures.places.lieux)) await sentinelles.places.details(lieu.placeId);
    expect(sentinelles.valeurs.size).toBeGreaterThan(5);
    expect(brief.destination).toBeDefined();

    const { journal, rediger } = preparer();
    await rediger(ENTREE_V5);
    expect(journal.requetes).toHaveLength(1);
    const [requete] = journal.requetes;
    expect(requete?.prompt).toEqual({ id: "programme", version: 5 });
    expect(PROMPT_PROGRAMME_V5.version).toBe(5);
    expect(requete?.routage).toMatchObject({ zdr: true, data_collection: "deny" });
    expect(sentinellesPresentes(journal.texte(), sentinelles)).toEqual([]);
    for (const cle of ["placeId", "place_id", "websiteUri", "lat", "lng", "location", "duration", "distanceMeters"]) {
      expect(journal.texte(), cle).not.toContain(`"${cle}"`);
      expect(journal.texte(), cle).not.toContain(`\\"${cle}\\"`);
    }
    // La v4 reste la version du site d'essai et de `p0Run`.
    expect(PROMPT_PROGRAMME.version).toBe(4);
  });

  it("prompts: entrée v5 sans libellé du billet de changement de ville (ses heures seulement)", async () => {
    const { journal, rediger } = preparer();
    await rediger(ENTREE_V5);
    const texte = journal.texte();
    expect(texte).not.toContain(LIBELLE_BILLET);
    expect(texte).not.toMatch(/Train/);
    // Les heures du billet et sa source passent, dans le cadre du jour.
    const donnees = JSON.stringify(journal.requetes[0]?.messages[1]);
    for (const attendu of ['\\"depart\\":\\"12:10\\"', '\\"arrivee\\":\\"13:45\\"', '\\"source\\":\\"saisi\\"', '\\"activitesMax\\":2']) expect(donnees).toContain(attendu);
    // Les autres engagements gardent leur libellé, avec leur fin (0149 § 5).
    expect(donnees).toContain("Concert d'orgue");
    expect(donnees).toContain('\\"fin\\":\\"22:00\\"');
    // Aucun champ ne peut porter le libellé : glissé dans le cadre du jour, il est refusé sans requête…
    const glisse = { ...ENTREE_V5, changements: [{ ...ENTREE_V5.changements[0]!, libelle: LIBELLE_BILLET }] } as unknown as EntreeProgrammeV5;
    await expect(rediger(glisse)).rejects.toBeInstanceOf(RangeError);
    expect(journal.requetes).toHaveLength(1);
    // … et la projection champ par champ ne le recopierait pas, même sans le schéma.
    expect(JSON.stringify(requeteProgrammeV5(glisse, "test/programme", { data_collection: "deny", zdr: true }))).not.toContain(LIBELLE_BILLET);
  });

  it("prompts: entrée v5 refuse une clé en trop (schéma strict à chaque niveau), sans requête", async () => {
    const { journal, rediger } = preparer();
    const glissees: unknown[] = [
      { ...ENTREE_V5, placeId: "SENTINELLE" },
      { ...ENTREE_V5, logements: [{ texte: "Hôtel", nuits: 5 }] },
      { ...ENTREE_V5, villes: [{ ...ENTREE_V5.villes[0]!, placeId: "SENTINELLE" }, ENTREE_V5.villes[1]] },
      { ...ENTREE_V5, villes: [{ ...ENTREE_V5.villes[0]!, position: { lat: 41.9, lng: 12.5 } }, ENTREE_V5.villes[1]] },
      { ...ENTREE_V5, changements: [{ ...ENTREE_V5.changements[0]!, dureeMinutes: 95 }] },
      { ...ENTREE_V5, changements: [{ ...ENTREE_V5.changements[0]!, ville: "Florence" }] },
      { ...ENTREE_V5, engagements: [{ ...ENTREE_V5.engagements![0]!, lieu: "Église" }] },
      { ...ENTREE_V5, engagements: [{ ...ENTREE_V5.engagements![0]!, kind: "booking" }] },
    ];
    for (const entree of glissees) {
      expect(EntreeProgrammeV5Schema.safeParse(entree).success, JSON.stringify(entree).slice(0, 80)).toBe(false);
      await expect(rediger(entree as EntreeProgrammeV5)).rejects.toBeInstanceOf(RangeError);
    }
    expect(journal.requetes).toHaveLength(0);
    expect(EntreeProgrammeV5Schema.safeParse(ENTREE_V5).success).toBe(true);
  });

  it("prompts: entrée v5, fin d'engagement au format HH:MM seulement (refusée avant toute requête)", async () => {
    const { journal, rediger } = preparer();
    const avecFin = (fin: unknown) => ({ ...ENTREE_V5, engagements: [{ ...ENTREE_V5.engagements![0]!, fin }] }) as unknown as EntreeProgrammeV5;
    for (const fin of ["22h", "22:00:00", "24:00", "9:30", "", 2200, "20:30", "19:00"]) {
      expect(EntreeProgrammeV5Schema.safeParse(avecFin(fin)).success, String(fin)).toBe(false);
      await expect(rediger(avecFin(fin))).rejects.toBeInstanceOf(RangeError);
    }
    expect(journal.requetes).toHaveLength(0);
    expect(EntreeProgrammeV5Schema.safeParse(avecFin("23:59")).success).toBe(true);
    const sansFin = { ...ENTREE_V5, engagements: [{ libelle: "Concert d'orgue", date: "2027-05-08", heure: "20:30", type: "reservation" as const }] };
    expect(EntreeProgrammeV5Schema.safeParse(sansFin).success).toBe(true);
  });

  it("prompts: entrée v5, bornes et cohérence des villes et des changements", () => {
    const refusees: [string, unknown][] = [
      ["aucune ville", { ...ENTREE_V5, villes: [], changements: [] }],
      ["nom de ville trop long", { ...ENTREE_V5, villes: [{ ...ENTREE_V5.villes[0]!, nom: "R".repeat(81) }, ENTREE_V5.villes[1]], changements: [{ ...ENTREE_V5.changements[0]!, de: "R".repeat(81) }] }],
      ["logement trop long", { ...ENTREE_V5, villes: [ENTREE_V5.villes[0], { ...ENTREE_V5.villes[1]!, logement: "L".repeat(121) }] }],
      ["changement manquant", { ...ENTREE_V5, changements: [] }],
      ["changement à une autre date", { ...ENTREE_V5, changements: [{ ...ENTREE_V5.changements[0]!, date: "2027-05-06" }] }],
      ["ville d'arrivée hors de la suite", { ...ENTREE_V5, changements: [{ ...ENTREE_V5.changements[0]!, vers: "Naples" }] }],
      ["nuits différentes du séjour", { ...ENTREE_V5, villes: [ENTREE_V5.villes[0], { ...ENTREE_V5.villes[1]!, nuits: 3 }] }],
      ["même ville deux fois de suite", { ...ENTREE_V5, villes: [ENTREE_V5.villes[0], { ...ENTREE_V5.villes[1]!, nom: "Rome" }], changements: [{ ...ENTREE_V5.changements[0]!, vers: "Rome" }] }],
      ["arrivée d'un départ estimé", { ...ENTREE_V5, changements: [{ ...ENTREE_V5.changements[0]!, source: "estime" }] }],
      ["arrivée avant le départ", { ...ENTREE_V5, changements: [{ ...ENTREE_V5.changements[0]!, arrivee: "11:00" }] }],
      ["activités au-delà de 4", { ...ENTREE_V5, changements: [{ ...ENTREE_V5.changements[0]!, activitesMax: 5 }] }],
      ["source inconnue", { ...ENTREE_V5, changements: [{ ...ENTREE_V5.changements[0]!, source: "entered" }] }],
      ["engagements au-delà de 10", { ...ENTREE_V5, engagements: Array(11).fill(ENTREE_V5.engagements![0]) }],
    ];
    for (const [nom, entree] of refusees) expect(EntreeProgrammeV5Schema.safeParse(entree).success, nom).toBe(false);
    // Une seule ville, sans changement ; et un départ estimé sans arrivée : admis.
    const uneVille = { ...ENTREE_V5, villes: [{ ...ENTREE_V5.villes[0]!, nuits: 5 }], changements: [] };
    expect(EntreeProgrammeV5Schema.safeParse(uneVille).success).toBe(true);
    const estime = { date: "2027-05-07", de: "Rome", vers: "Florence", source: "estime", depart: "09:00", activitesMax: 2 };
    expect(EntreeProgrammeV5Schema.safeParse({ ...ENTREE_V5, changements: [estime] }).success).toBe(true);
  });
});

/**
 * M5c (ticket 904 ; spécification M5, critère 15 ; décision 0147 § 12 S1) : un signalement n'entre dans aucun prompt. Aucun
 * module qui construit ou envoie une requête de modèle (`src/ai`, `src/research`, la génération et la chaîne de P0 de
 * `src/server`) ne lit la table `feedback`, n'importe le signalement ni ne nomme ses motifs : rien ne peut y faire passer
 * un motif ou un signalement, de ce voyage ou d'un autre.
 */
describe("signalement: jamais dans un prompt", () => {
  const RACINE = path.resolve(__dirname, "../../..");
  const DOSSIERS = ["src/ai", "src/research", "src/server/generation", "src/server/p0"];
  const INTERDITS = [/\bfeedback\b/, /signalement/i, /STOP_REPORT_REASONS|StopReport/, /reportStop/];
  const fichiers = (dossier: string): string[] =>
    readdirSync(path.join(RACINE, dossier), { withFileTypes: true }).flatMap((entree) => {
      const relatif = `${dossier}/${entree.name}`;
      if (entree.isDirectory()) return fichiers(relatif);
      return /\.tsx?$/.test(entree.name) && !/\.test\.tsx?$/.test(entree.name) ? [relatif] : [];
    });

  it("aucun module des prompts ne lit feedback, n'importe le signalement ni ne nomme ses motifs", () => {
    const sources = DOSSIERS.flatMap(fichiers);
    expect(sources).toContain("src/ai/entree-revision.ts");
    const fautifs = sources.filter((fichier) => {
      const texte = readFileSync(path.join(RACINE, fichier), "utf8");
      return INTERDITS.some((motif) => motif.test(texte));
    });
    expect(fautifs).toEqual([]);
  });
});

/**
 * Critère 15 par valeurs sentinelles (revue de la PR 909, mineur 11) : un voyage portant des signalements (identifiant de
 * demande sentinelle, chaque motif) donne exactement la même entrée de révision qu'avant ; ni l'identifiant, ni un code de
 * motif de plus n'y entre.
 */
describe("signalement: jamais dans une entrée de modèle (valeurs sentinelles)", () => {
  it("entrée de la révision identique avant et après des signalements de chaque motif, sans la sentinelle", async () => {
    const SENTINELLE = "5e471e11-0000-4000-8000-00000000c0de";
    const ctx = { organizationId: MOCK_ORGANIZATION_ID, userId: MOCK_USER_ID, role: "owner" as const };
    const trips = createMockTripAdapter();
    const store = { records: [] as { requestId: string }[] } as Parameters<typeof createMockStopReports>[0]["store"];
    const reports = createMockStopReports({ trips, store, now: () => Date.parse("2026-10-29T10:00:00Z"), plafond: 20, max: 200 });
    const entree = async () => {
      const trip = await trips.getTrip(ctx, EDIMBOURG_TRIP_ID);
      if (trip === null) throw new Error("voyage simulé absent");
      return JSON.stringify(entreeRevisionDepuisJours(trip.days, { destination: "Édimbourg" } as Parameters<typeof entreeRevisionDepuisJours>[1], { pasPourMoi: [], jAime: [] }));
    };
    const avant = await entree();
    const motifs = ["closed", "hours", "wrongPlace", "price", "other"] as const;
    for (const [i, reason] of motifs.entries()) {
      const requestId = i === 0 ? SENTINELLE : `5e471e11-0000-4000-8000-00000000000${i}`;
      expect(await reports.reportStop(ctx, { tripId: EDIMBOURG_TRIP_ID, stopId: "j2-dean-village", reason, requestId })).toEqual({ ok: true, value: null });
    }
    expect(store.records).toHaveLength(motifs.length);
    const apres = await entree();
    expect(apres).toBe(avant);
    expect(apres).not.toContain(SENTINELLE);
    expect(apres).not.toContain("wrongPlace");
  });
});

