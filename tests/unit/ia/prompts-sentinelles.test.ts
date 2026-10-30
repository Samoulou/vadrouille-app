// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createMockTripAdapter } from "@/adapters/mock";
import { createMockStopReports } from "@/adapters/mock-reports";

import type { ClientModeles, EtapeRequete } from "@/ai/client";
import { creerCoucheIa, type ReglagesIa } from "@/ai/couche";
import { EntreeProgrammeV5Schema, versEntreeQuartier, type EntreeModeles, type EntreeProgrammeV5 } from "@/ai/entrees";
import { EntreeRevisionV3Schema, type EntreeRevisionV3 } from "@/ai/entree-revision";
import { PROMPT_PROGRAMME, PROMPT_PROGRAMME_V5 } from "@/ai/prompts/programme";
import { PROMPT_REVISION } from "@/ai/prompts/revision";
import { creerRedigerProgramme, creerRedigerProgrammeV5 } from "@/ai/rediger-programme";
import { creerRedigerRevision, creerRedigerRevisionV3 } from "@/ai/rediger-revision";
import { requeteProgrammeV5, requeteRevisionV3 } from "@/ai/requetes";
import { MAX_CITIES, type LodgingRequest } from "@/contracts";
import { creerPlacesSimule } from "@/grounding/places.simule";
import { creerRoutesSimule } from "@/grounding/routes.simule";
import { EDIMBOURG_TRIP_ID, MOCK_ORGANIZATION_ID, MOCK_USER_ID } from "@/mocks/edimbourg";
import { RECIT_API_AUTORISE } from "@/server/config/generation";
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
    const { fixtures } = charger();
    const sentinelles = avecSentinellesGoogle({ places: creerPlacesSimule(fixtures.places), routes: creerRoutesSimule(fixtures.routes) });
    for (const lieu of Object.values(fixtures.places.lieux)) await sentinelles.places.details(lieu.placeId);
    expect(sentinelles.valeurs.size).toBeGreaterThan(5);

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

  // Revue de la PR #921, bloquant 1 : une date invalide (format accepté par la forme, refusée par `IsoDateSchema`) est
  // refusée par `safeParse` sans exception, et la capacité rejette par `RangeError`, sans requête.
  it("prompts: entrée v5, date invalide refusée sans exception ni requête", async () => {
    const { journal, rediger } = preparer();
    const [rome, florence] = ENTREE_V5.villes;
    for (const date of ["2027-13-45", "2027-02-30"]) {
      const entrees: unknown[] = [
        { ...ENTREE_V5, villes: [rome, { ...florence!, arrivee: date }] },
        { ...ENTREE_V5, villes: [{ ...rome!, arrivee: date }, florence] },
        { ...ENTREE_V5, depart: date },
        { ...ENTREE_V5, arrivee: date },
      ];
      for (const entree of entrees) {
        let lu: ReturnType<typeof EntreeProgrammeV5Schema.safeParse> | undefined;
        expect(() => {
          lu = EntreeProgrammeV5Schema.safeParse(entree);
        }, date).not.toThrow();
        expect(lu?.success, date).toBe(false);
        await expect(rediger(entree as EntreeProgrammeV5)).rejects.toBeInstanceOf(RangeError);
      }
    }
    // Nuits non entières : même règle, aucune exception.
    expect(() => EntreeProgrammeV5Schema.safeParse({ ...ENTREE_V5, villes: [{ ...rome!, nuits: 1.5 }, florence] })).not.toThrow();
    expect(journal.requetes).toHaveLength(0);
  });

  // Revue de la PR #921, mineur 3 : plafond `MAX_CITIES` des villes et `MAX_CITIES - 1` des changements, sans valeur en dur.
  it("prompts: entrée v5, au plus MAX_CITIES villes et MAX_CITIES - 1 changements", () => {
    const noms = Array.from({ length: MAX_CITIES + 1 }, (_, i) => `Ville ${String.fromCharCode(65 + i)}`);
    const entree = (n: number) => {
      const villes = noms.slice(0, n).map((nom, i) => ({ nom, arrivee: `2027-05-${String(4 + i).padStart(2, "0")}`, nuits: 1, logement: `Logement, ${nom}` }));
      const changements = villes.slice(1).map((ville, i) => ({ date: ville.arrivee, de: villes[i]!.nom, vers: ville.nom, source: "estime" as const, depart: "09:00", activitesMax: 2 }));
      return { ...ENTREE_V5, depart: `2027-05-${String(4 + n).padStart(2, "0")}`, villes, changements };
    };
    expect(EntreeProgrammeV5Schema.safeParse(entree(MAX_CITIES)).success).toBe(true);
    const trop = EntreeProgrammeV5Schema.safeParse(entree(MAX_CITIES + 1));
    expect(trop.success).toBe(false);
    expect(trop.error?.issues.map((issue) => issue.path[0])).toEqual(expect.arrayContaining(["villes", "changements"]));
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
 * M4a-2 (ticket #926 ; décision 0148 § 8 point 2 ; verdict de la Sécurité 0149 § 1.3, S-M4-1, S-M4-2, S-M4-5 : mêmes
 * conditions que pour la v5). Entrée `revision` v3 d'un voyage Rome puis Florence : le brief v5 (sans récit, sans le
 * libellé du billet devenu changement de ville), le programme précédent tel que l'écrit l'instantané (le titre du jour
 * du changement de ville, écrit par le code, y est une sentinelle) et les choix du tri. La requête passe par la capacité
 * de production (`creerRedigerRevisionV3`), journalisée.
 */
const BRIEF_REVISION_V3: EntreeProgrammeV5 = { ...ENTREE_V5 };
delete BRIEF_REVISION_V3.recit;
const TITRE_CODE = "SENTINELLE_TITRE_DU_CODE";
const ENTREE_REVISION_V3: EntreeRevisionV3 = {
  brief: BRIEF_REVISION_V3,
  programme: {
    jours: [
      { date: "2027-05-06", titre: "Centre historique", etapes: [{ id: "j3-1", debut: "09:30", fin: "10:30", repas: false, lieu: "Panthéon", quartier: "Centro storico", pourquoi: "Le temple antique le mieux conservé." }] },
      {
        date: "2027-05-07",
        titre: TITRE_CODE,
        etapes: [
          { id: "j4-1", debut: "09:00", fin: "10:15", repas: false, lieu: "Villa Borghese", quartier: "Pincio", pourquoi: "Une promenade avant le train." },
          { id: "j4-2", debut: "15:00", fin: "16:30", repas: false, lieu: "Duomo de Florence", quartier: "Duomo", pourquoi: "La coupole de Brunelleschi." },
        ],
      },
      { date: "2027-05-08", titre: "Offices et Oltrarno", etapes: [{ id: "j5-1", debut: "18:30", fin: "20:00", repas: true, lieu: "Osteria Santo Spirito", quartier: "Santo Spirito", pourquoi: "Un dîner toscan sur la place." }] },
    ],
  },
  choix: { pasPourMoi: ["j5-1"], jAime: ["j4-2"] },
};

describe("prompts: entrée et requête revision v3 (plusieurs villes, M4a-2)", () => {
  const preparer = () => {
    const modeles: ClientModeles = { envoyer: async () => ({ texte: "{}", coutUsd: 0 }) };
    const journal = journalDePrompts(modeles);
    const reviser = creerRedigerRevisionV3(journal.client, { modele: "test/revision", routage: { data_collection: "allow", zdr: false } as unknown as ReglagesIa["plan"]["routage"] });
    return { journal, reviser };
  };

  it("revision: prompt v3 sans donnée Google : requête journalisée sans sentinelle, zdr et data_collection deny imposés ; v2 inchangée", async () => {
    const { fixtures } = charger();
    const sentinelles = avecSentinellesGoogle({ places: creerPlacesSimule(fixtures.places), routes: creerRoutesSimule(fixtures.routes) });
    for (const lieu of Object.values(fixtures.places.lieux)) await sentinelles.places.details(lieu.placeId);
    expect(sentinelles.valeurs.size).toBeGreaterThan(5);

    const { journal, reviser } = preparer();
    await reviser(ENTREE_REVISION_V3);
    expect(journal.requetes).toHaveLength(1);
    const [requete] = journal.requetes;
    expect(requete?.etape).toBe("programme");
    expect(requete?.prompt).toEqual({ id: "revision", version: 3 });
    expect(requete?.routage).toMatchObject({ zdr: true, data_collection: "deny" });
    expect(sentinellesPresentes(journal.texte(), sentinelles)).toEqual([]);
    for (const cle of ["placeId", "place_id", "websiteUri", "lat", "lng", "location", "duration", "distanceMeters", "ville", "transfer"]) {
      expect(journal.texte(), cle).not.toContain(`"${cle}"`);
      expect(journal.texte(), cle).not.toContain(`\\"${cle}\\"`);
    }
    // Le brief est celui de la v5 (même projection) : villes et cadre du changement de ville.
    const donnees = JSON.stringify(requete?.messages[1]);
    for (const attendu of ['\\"villes\\"', '\\"changements\\"', '\\"activitesMax\\":2', '\\"pasPourMoi\\":[\\"j5-1\\"]']) expect(donnees).toContain(attendu);
    // La v2 reste celle du site d'essai.
    expect(PROMPT_REVISION.version).toBe(2);
  });

  it("prompts: entrée revision v3 sans libellé du billet de changement de ville (ses heures seulement)", async () => {
    const { journal, reviser } = preparer();
    await reviser(ENTREE_REVISION_V3);
    const texte = journal.texte();
    expect(texte).not.toContain(LIBELLE_BILLET);
    expect(texte).not.toMatch(/Train/);
    const donnees = JSON.stringify(journal.requetes[0]?.messages[1]);
    for (const attendu of ['\\"depart\\":\\"12:10\\"', '\\"arrivee\\":\\"13:45\\"', '\\"source\\":\\"saisi\\"']) expect(donnees).toContain(attendu);
    expect(donnees).toContain('\\"fin\\":\\"22:00\\"');
    // Glissé dans le cadre du jour ou dans un engagement de plus : refusé sans requête ; la projection ne le recopierait pas.
    const glisse = { ...ENTREE_REVISION_V3, brief: { ...BRIEF_REVISION_V3, changements: [{ ...BRIEF_REVISION_V3.changements[0]!, libelle: LIBELLE_BILLET }] } } as unknown as EntreeRevisionV3;
    await expect(reviser(glisse)).rejects.toBeInstanceOf(RangeError);
    expect(journal.requetes).toHaveLength(1);
    expect(JSON.stringify(requeteRevisionV3(glisse, "test/revision", { data_collection: "deny", zdr: true }))).not.toContain(LIBELLE_BILLET);
  });

  it("prompts: titre du jour de changement de ville (écrit par le code) jamais renvoyé ; les autres titres le sont", async () => {
    const { journal, reviser } = preparer();
    await reviser(ENTREE_REVISION_V3);
    const donnees = JSON.stringify(journal.requetes[0]?.messages[1]);
    expect(donnees).not.toContain(TITRE_CODE);
    expect(donnees).toContain("Offices et Oltrarno");
    expect(donnees).toContain("Villa Borghese");
  });

  it("prompts: entrée revision v3 refuse une clé en trop (schéma strict à chaque niveau), sans requête", async () => {
    const { journal, reviser } = preparer();
    const [j3, j4, j5] = ENTREE_REVISION_V3.programme.jours;
    const avecJours = (jours: unknown[]) => ({ ...ENTREE_REVISION_V3, programme: { jours } });
    const glissees: unknown[] = [
      { ...ENTREE_REVISION_V3, placeId: "SENTINELLE" },
      { ...ENTREE_REVISION_V3, brief: { ...BRIEF_REVISION_V3, placeId: "SENTINELLE" } },
      { ...ENTREE_REVISION_V3, brief: { ...BRIEF_REVISION_V3, logements: [{ texte: "Hôtel", nuits: 5 }] } },
      { ...ENTREE_REVISION_V3, brief: { ...BRIEF_REVISION_V3, villes: [{ ...BRIEF_REVISION_V3.villes[0]!, position: { lat: 41.9, lng: 12.5 } }, BRIEF_REVISION_V3.villes[1]] } },
      { ...ENTREE_REVISION_V3, brief: { ...BRIEF_REVISION_V3, changements: [{ ...BRIEF_REVISION_V3.changements[0]!, dureeMinutes: 95 }] } },
      { ...ENTREE_REVISION_V3, brief: { ...BRIEF_REVISION_V3, engagements: [{ ...BRIEF_REVISION_V3.engagements![0]!, lieu: "Église" }] } },
      { ...ENTREE_REVISION_V3, programme: { ...ENTREE_REVISION_V3.programme, transfer: { label: LIBELLE_BILLET } } },
      avecJours([j3, { ...j4!, transfer: { label: LIBELLE_BILLET, start: "12:10", end: "13:45" } }, j5]),
      avecJours([j3, { ...j4!, dureeEstimeeMinutes: 95 }, j5]),
      avecJours([j3, { ...j4!, etapes: [{ ...j4!.etapes[0]!, ville: "Rome" }, j4!.etapes[1]] }, j5]),
      avecJours([j3, { ...j4!, etapes: [{ ...j4!.etapes[0]!, placeId: "SENTINELLE" }, j4!.etapes[1]] }, j5]),
      avecJours([j3, { ...j4!, etapes: [{ ...j4!.etapes[0]!, segment: { minutes: 12 } }, j4!.etapes[1]] }, j5]),
      { ...ENTREE_REVISION_V3, choix: { ...ENTREE_REVISION_V3.choix, raison: "closed" } },
    ];
    for (const entree of glissees) {
      expect(EntreeRevisionV3Schema.safeParse(entree).success, JSON.stringify(entree).slice(0, 80)).toBe(false);
      await expect(reviser(entree as EntreeRevisionV3)).rejects.toBeInstanceOf(RangeError);
    }
    expect(journal.requetes).toHaveLength(0);
    expect(EntreeRevisionV3Schema.safeParse(ENTREE_REVISION_V3).success).toBe(true);
  });

  it("prompts: entrée revision v3, contrôles du brief v5 et du programme (fin, cohérence des villes, journées du séjour, choix)", () => {
    const refusees: [string, unknown][] = [
      ["fin d'engagement hors format", { ...ENTREE_REVISION_V3, brief: { ...BRIEF_REVISION_V3, engagements: [{ ...BRIEF_REVISION_V3.engagements![0]!, fin: "22h" }] } }],
      ["changement manquant", { ...ENTREE_REVISION_V3, brief: { ...BRIEF_REVISION_V3, changements: [] } }],
      ["arrivée d'un départ estimé", { ...ENTREE_REVISION_V3, brief: { ...BRIEF_REVISION_V3, changements: [{ ...BRIEF_REVISION_V3.changements[0]!, source: "estime" }] } }],
      ["journée hors du séjour", { ...ENTREE_REVISION_V3, programme: { jours: [...ENTREE_REVISION_V3.programme.jours, { date: "2027-05-10", etapes: [] }] } }],
      ["journée répétée", { ...ENTREE_REVISION_V3, programme: { jours: [...ENTREE_REVISION_V3.programme.jours, { date: "2027-05-06", etapes: [] }] } }],
      ["choix hors du programme", { ...ENTREE_REVISION_V3, choix: { pasPourMoi: ["j9-9"], jAime: [] } }],
      ["étape aimée et écartée", { ...ENTREE_REVISION_V3, choix: { pasPourMoi: ["j5-1"], jAime: ["j5-1"] } }],
    ];
    for (const [nom, entree] of refusees) expect(EntreeRevisionV3Schema.safeParse(entree).success, nom).toBe(false);
  });

  // Garde du récit (0139 § 1.2 points 2 et 6 ; 0149 § 1.3 point 7) étendue à l'entrée v3 : aucune requête de révision ne
  // reçoit le récit. La garde de l'app est fermée ; l'entrée v3 refuse le récit quel que soit son état (une ouverture de la
  // garde n'ouvre pas la révision : verdict de la Sécurité requis, question de la PR #926).
  it("prompts: garde du récit étendue à l'entrée revision v3 (récit refusé avant toute requête, jamais recopié)", async () => {
    expect(RECIT_API_AUTORISE).toBe(false);
    const { journal, reviser } = preparer();
    const RECIT = "SENTINELLE_RECIT Nous aimons marcher.";
    const avecRecit = { ...ENTREE_REVISION_V3, brief: { ...BRIEF_REVISION_V3, recit: RECIT } };
    const lu = EntreeRevisionV3Schema.safeParse(avecRecit);
    expect(lu.success).toBe(false);
    expect(lu.error?.issues.map((issue) => issue.path.join("."))).toContain("brief.recit");
    await expect(reviser(avecRecit)).rejects.toBeInstanceOf(RangeError);
    expect(journal.requetes).toHaveLength(0);
    // Même sans le schéma, la projection de la requête v3 ne recopie pas le récit (la v5 le recopierait).
    expect(JSON.stringify(requeteRevisionV3(avecRecit, "test/revision", { data_collection: "deny", zdr: true }))).not.toContain("SENTINELLE_RECIT");
    expect(JSON.stringify(requeteProgrammeV5({ ...ENTREE_V5, recit: RECIT }, "test/programme", { data_collection: "deny", zdr: true }))).toContain("SENTINELLE_RECIT");
    // Sans récit : admise, une requête.
    await reviser(ENTREE_REVISION_V3);
    expect(journal.requetes).toHaveLength(1);
    expect(journal.texte()).not.toMatch(/recit/);
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


/**
 * M5d-1 (ticket 939 ; décision 0147 § 12 S4) : un lieu ajouté par la personne n'entre jamais dans un prompt, ni par son nom
 * saisi, ni par son `placeId`, ni par son identifiant `ajout-…` ; un choix qui le viserait est ignoré. La requête passe par la
 * capacité de production de la révision (`creerRedigerRevision`), journalisée.
 */
describe("prompts: lieu à soi jamais dans une entrée de modèle (0147 § 12 S4)", () => {
  it("entrée et requête de la révision sans le nom saisi, le placeId ni l'identifiant de l'étape ajoutée", async () => {
    const NOM = "SENTINELLE-NOM-SAISI-M5D";
    const PLACE = "SENTINELLE_PLACE_AJOUT_M5D";
    const AJOUT = "ajout-0d000000-0000-4000-8000-0000000000cc";
    const etape = (id: string, name: string, start: string, extra: Record<string, unknown> = {}) => ({
      type: "stop" as const,
      stop: { id, kind: "activity" as const, name, start, end: start.replace(/^(\d\d)/, (h) => String(Number(h) + 1).padStart(2, "0")), facts: { area: "Old Town" }, reason: "Parce que.", exceptions: [], locked: false, ...extra },
    });
    const jour = (items: ReturnType<typeof etape>[]) => ({ index: 1, date: "2027-05-04", theme: "Old Town", travelBudgetMinutes: 90, events: [], items });
    const sans = [jour([etape("j1-1", "Château d'Édimbourg", "10:00"), etape("j1-2", "Royal Mile", "13:00")])];
    const jours = [jour([etape("j1-1", "Château d'Édimbourg", "10:00"), etape("j1-2", "Royal Mile", "13:00"), etape(AJOUT, NOM, "16:00", { placeId: PLACE, locked: true, addedBy: "person" })])];
    const brief: Parameters<typeof entreeRevisionDepuisJours>[1] = {
      destination: "Édimbourg",
      pays: "Royaume-Uni",
      arrivee: "2027-05-04",
      depart: "2027-05-07",
      heureArrivee: "09:00",
      heureDepart: "20:00",
      voyageurs: { adultes: 2, enfants: 0 },
      rythme: "equilibre",
      envies: ["museum"],
      deplacements: ["walk"],
      logements: [{ texte: "Old Town, Édimbourg", nuits: 3 }],
    };
    const entree = entreeRevisionDepuisJours(jours, brief, { pasPourMoi: [AJOUT, "j1-2"], jAime: [AJOUT] });
    // Même entrée que sans l'étape ajoutée.
    expect(entree).toEqual(entreeRevisionDepuisJours(sans, brief, { pasPourMoi: ["j1-2"], jAime: [] }));
    const texte = JSON.stringify(entree);
    for (const sentinelle of [NOM, PLACE, AJOUT, "addedBy"]) expect(texte, sentinelle).not.toContain(sentinelle);

    const modeles: ClientModeles = { envoyer: async () => ({ texte: "{}", coutUsd: 0 }) };
    const journal = journalDePrompts(modeles);
    const reviser = creerRedigerRevision(journal.client, { modele: "test/revision", routage: { data_collection: "allow", zdr: false } as unknown as ReglagesIa["plan"]["routage"] });
    await reviser(entree);
    expect(journal.requetes).toHaveLength(1);
    for (const sentinelle of [NOM, PLACE, AJOUT]) expect(journal.texte(), sentinelle).not.toContain(sentinelle);
  });
});
