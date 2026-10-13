import type { ClientModeles, RequeteModele } from "@/ai/client";
import { creerModelesSimules } from "@/ai/modeles.simule";
import type { ClientPlaces, ClientRoutes, RequeteMatrice, RequeteTextSearch } from "@/grounding/interfaces";
import { creerPlacesSimule } from "@/grounding/places.simule";
import { creerRoutesSimule } from "@/grounding/routes.simule";
import type { Brief } from "@/prototype/brief";
import type { Variante } from "@/prototype/config";
import { creerLecteurPages, type LecteurPages, type RequeteHttp } from "@/research/fetch-page";
import { creerHttpSimule, creerResolveurSimule } from "@/research/pages.simule";
import type { ClientRechercheWeb } from "@/research/recherche-web";
import { creerRechercheSimulee } from "@/research/recherche-web.simule";

import { lireBrief, lireConfiguration, lireFixtures, type Configuration, type Fixtures } from "../../../scripts/p0/fichiers";
import { creerJournal, creerRedacteur } from "../../../scripts/p0/journal";
import { executer, type ResultatPipeline } from "../../../scripts/p0/pipeline";

/**
 * Harnais des tests transverses de P0a1 : exécute l'orchestrateur sur les fixtures commitées, avec des clients
 * simulés **enveloppés** pour capturer chaque requête au modèle, chaque recherche, chaque lecture de page, chaque
 * appel Places et Routes, et l'ordre des appels. Aucune connexion, aucune variable d'environnement.
 */

export const DATE_TEST = "2026-10-12";

export type Capture = {
  requetes: RequeteModele[];
  recherches: string[];
  lectures: string[];
  http: RequeteHttp[];
  textSearch: RequeteTextSearch[];
  details: string[];
  matrices: RequeteMatrice[];
  /** Ordre des appels : `modele:<etape>`, `recherche`, `page`, `places`, `routes`. */
  ordre: string[];
  journal: string[];
};

export type Options = {
  nomBrief?: string;
  brief?: Brief;
  variante?: Variante;
  configuration?: Configuration;
  fixtures?: Fixtures;
  /** Remplace un client après capture (par exemple pour simuler une erreur de fournisseur). */
  modeles?: (client: ClientModeles) => ClientModeles;
  places?: (client: ClientPlaces) => ClientPlaces;
  secrets?: string[];
};

export function charger(nomBrief = "edimbourg-1") {
  const brief = lireBrief(nomBrief);
  const configuration = lireConfiguration();
  const fixtures = lireFixtures("edimbourg");
  return { brief, configuration, fixtures };
}

export async function executerCapture(options: Options = {}): Promise<{ resultat: ResultatPipeline; capture: Capture }> {
  const nomBrief = options.nomBrief ?? "edimbourg-1";
  const base = charger(nomBrief);
  const brief = options.brief ?? base.brief;
  const configuration = options.configuration ?? base.configuration;
  const fixtures = options.fixtures ?? base.fixtures;
  const capture: Capture = {
    requetes: [],
    recherches: [],
    lectures: [],
    http: [],
    textSearch: [],
    details: [],
    matrices: [],
    ordre: [],
    journal: [],
  };

  const modelesSimules = creerModelesSimules(fixtures.modeles);
  const modelesCaptures: ClientModeles = {
    async envoyer(requete) {
      capture.requetes.push(structuredClone(requete));
      capture.ordre.push(`modele:${requete.etape}`);
      return modelesSimules.envoyer(requete);
    },
  };
  const rechercheSimulee = creerRechercheSimulee(fixtures.recherche);
  const recherche: ClientRechercheWeb = {
    async rechercher(requete) {
      capture.recherches.push(requete);
      capture.ordre.push("recherche");
      return rechercheSimulee.rechercher(requete);
    },
  };
  const lecteurSimule = creerLecteurPages({
    resoudre: creerResolveurSimule(fixtures.pages.dns),
    http: creerHttpSimule(fixtures.pages.pages, (requete) => capture.http.push(requete)),
  });
  const lecteur: LecteurPages = {
    async lire(url, autorisees) {
      capture.lectures.push(url);
      capture.ordre.push("page");
      return lecteurSimule.lire(url, autorisees);
    },
  };
  const placesSimule = creerPlacesSimule(fixtures.places);
  const placesCaptures: ClientPlaces = {
    async textSearch(requete) {
      capture.textSearch.push(structuredClone(requete));
      capture.ordre.push("places");
      return placesSimule.textSearch(requete);
    },
    async details(placeId) {
      capture.details.push(placeId);
      capture.ordre.push("places");
      return placesSimule.details(placeId);
    },
  };
  const routesSimule = creerRoutesSimule(fixtures.routes);
  const routes: ClientRoutes = {
    async matrice(requete) {
      capture.matrices.push(structuredClone(requete));
      capture.ordre.push("routes");
      return routesSimule.matrice(requete);
    },
  };

  const redacteur = creerRedacteur(options.secrets ?? []);
  const journal = creerJournal((ligne) => capture.journal.push(ligne), redacteur);
  let instant = 0;
  const resultat = await executer({
    nomBrief,
    brief,
    variante: options.variante ?? "b",
    configuration,
    dateExecution: DATE_TEST,
    numero: 1,
    journal,
    horloge: () => (instant += 1),
    clients: {
      modeles: options.modeles ? options.modeles(modelesCaptures) : modelesCaptures,
      recherche,
      lecteur,
      places: options.places ? options.places(placesCaptures) : placesCaptures,
      routes,
    },
  });
  return { resultat, capture };
}

/** Texte complet des requêtes capturées (messages compris). */
export function texteDesRequetes(requetes: readonly RequeteModele[]): string {
  return JSON.stringify(requetes);
}

/** Toutes les valeurs sentinelles des fixtures Places et Routes (hors identifiants). */
export function sentinelles(fixtures: Fixtures): { placeIds: string[]; autres: string[] } {
  const lieux = Object.values(fixtures.places.lieux);
  const autres = new Set<string>(["SENTINELLE-NOM-GOOGLE", "SENTINELLE-ADRESSE-GOOGLE", "SENTINELLE_NIVEAU_PRIX", "55.9533123", "1.234", "4321"]);
  for (const lieu of lieux) {
    autres.add(lieu.nom);
    autres.add(lieu.adresse);
    autres.add(lieu.niveauPrix);
  }
  return { placeIds: lieux.map((lieu) => lieu.placeId), autres: [...autres] };
}

/** Clés interdites hors de la table `positions` (handover back-end § 8, extrait pertinent). */
export const CLES_INTERDITES = [
  "rating",
  "displayName",
  "formattedAddress",
  "location",
  "duration",
  "regularOpeningHours",
  "currentOpeningHours",
  "priceLevel",
  "businessStatus",
  "userRatingCount",
  "photos",
  "reviews",
  "lat",
  "lng",
  "latitude",
  "longitude",
  "verifiedAt",
  "minutes",
  "travelMinutes",
];

/** Toutes les clés d'objets d'une valeur JSON, à toute profondeur. */
export function clesDe(valeur: unknown, ignorer: ReadonlySet<string> = new Set()): Set<string> {
  const cles = new Set<string>();
  const parcourir = (noeud: unknown) => {
    if (Array.isArray(noeud)) {
      noeud.forEach(parcourir);
      return;
    }
    if (noeud === null || typeof noeud !== "object") return;
    for (const [cle, enfant] of Object.entries(noeud)) {
      cles.add(cle);
      if (!ignorer.has(cle)) parcourir(enfant);
    }
  };
  parcourir(valeur);
  return cles;
}
