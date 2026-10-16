// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { ClientModeles, EtapeRequete } from "@/ai/client";
import { creerCoucheIa, type ReglagesIa } from "@/ai/couche";
import { versEntreeQuartier, type EntreeModeles } from "@/ai/entrees";
import type { LodgingRequest } from "@/contracts";
import { creerPlacesSimule } from "@/grounding/places.simule";
import { creerRoutesSimule } from "@/grounding/routes.simule";
import { candidatPourModele, entreeModelesDepuisBrief, lieuRetenuDepuisCandidat } from "@/server/p0/vers-couche-ia";

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
 *   après les mêmes appels Google.
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
});
