import type { ClientModeles, EtapeRequete, RequeteModele } from "@/ai/client";
import type { EntreeModeles } from "@/ai/entrees";
import type { ClientRechercheWeb, ResultatWeb } from "@/ai/recherche-web";
import type { ConfigurationRecherche } from "@/research/recherche";
import type { LecteurPages } from "@/research/fetch-page";

/**
 * Doubles de la recherche de production (B7b) : tous fabriqués, valeurs sentinelles, aucun réseau, aucune clé, aucune
 * donnée Google. Les réponses de modèle sont des textes JSON de la forme que lisent `lirePlan` et `lireTour`.
 */

export const URL_GUIDE = "https://guide.example/lieux";

export const ENTREE: EntreeModeles = {
  destination: "Édimbourg",
  pays: "Royaume-Uni",
  arrivee: "2026-11-23",
  depart: "2026-11-28",
  voyageurs: { adultes: 2, enfants: 0 },
  rythme: "balanced",
  envies: ["restaurant", "walk", "museum"],
  deplacements: ["walk", "transit"],
};

export const PLAN = JSON.stringify({
  requetes: [{ requete: "musées Édimbourg", creneau: "activity" }],
});
export const RECHERCHER = {
  type: "rechercher",
  requete: "musées Édimbourg",
} as const;
export const LIRE = { type: "lire", url: URL_GUIDE } as const;

export type CandidatBrut = Record<string, unknown>;

export const candidatBrut = (nom: string, surcharge: CandidatBrut = {}): CandidatBrut => ({
  nom,
  resume: "Un lieu décrit par nous.",
  categorie: "museum",
  typeEtape: "activity",
  sourceUrl: URL_GUIDE,
  sourceDate: "2026-09-01",
  aReserver: false,
  ...surcharge,
});

export const tour = (valeur: Record<string, unknown>): string => JSON.stringify({ actions: [], candidats: [], termine: false, ...valeur });

/** Modèles scriptés : une file de réponses par étape ; chaque requête est journalisée. */
export function modelesScriptes(
  reponses: Partial<Record<EtapeRequete, string[]>>,
  options: {
    readonly avant?: (requete: RequeteModele) => void | Promise<void>;
    readonly coutUsd?: number;
  } = {},
) {
  const files = new Map(Object.entries(reponses).map(([etape, textes]) => [etape, [...(textes ?? [])]]));
  const requetes: RequeteModele[] = [];
  const client: ClientModeles = {
    async envoyer(requete) {
      requetes.push(structuredClone(requete));
      await options.avant?.(requete);
      const texte = files.get(requete.etape)?.shift() ?? (requete.etape === "recherche" ? tour({ termine: true }) : "{}");
      return { texte, coutUsd: options.coutUsd ?? 0.001 };
    },
  };
  return {
    client,
    requetes,
    appels: (etape: EtapeRequete) => requetes.filter((requete) => requete.etape === etape).length,
  };
}

/** Recherche web scriptée : mêmes résultats à chaque requête, ou une fonction de la requête. */
export function rechercheScriptee(
  resultats: readonly ResultatWeb[] | ((requete: string) => readonly ResultatWeb[]),
  options: {
    readonly avant?: (requete: string) => void | Promise<void>;
    readonly coutUsd?: number;
  } = {},
) {
  const requetes: string[] = [];
  const client: ClientRechercheWeb = {
    async rechercher(requete) {
      requetes.push(requete);
      await options.avant?.(requete);
      return {
        resultats: [...(typeof resultats === "function" ? resultats(requete) : resultats)],
        coutUsd: options.coutUsd ?? 0.002,
      };
    },
  };
  return { client, requetes };
}

export const GUIDE: ResultatWeb = {
  url: URL_GUIDE,
  titre: "Guide",
  extrait: "Extrait du guide.",
};

/** Lecteur de pages scripté : le texte de la page, ou un refus. */
export function lecteurScripte(texte: string | null = "Page du guide.") {
  const lues: string[] = [];
  const lecteur: LecteurPages = {
    async lire(url) {
      lues.push(url);
      return texte === null ? { ok: false, raison: "http_status" } : { ok: true, texte };
    },
  };
  return { lecteur, lues };
}

export function configurationRecherche(surcharge: Partial<ConfigurationRecherche["profils"]> = {}): ConfigurationRecherche {
  return {
    recherche: {
      modele: "fournisseur/recherche-test",
      routage: { data_collection: "deny" },
    },
    ageSourceMaxJours: 1095,
    profils: {
      apercu: {
        ciblesParCreneau: { activity: 2, meal: 1, evening: 0 },
        totalCandidats: 4,
        toursMax: 3,
        ageSourceMaxJours: 1095,
        delaiMs: 30_000,
      },
      complet: {
        ciblesParCreneau: { activity: 3, meal: 2, evening: 1 },
        totalCandidats: 8,
        toursMax: 4,
        ageSourceMaxJours: 1095,
        delaiMs: 300_000,
      },
      mini: {
        cible: 2,
        totalCandidats: 3,
        toursMax: 2,
        delaiMs: 20_000,
        logements: { cible: 3, recherchesWeb: 2 },
      },
      ...surcharge,
    },
  };
}
