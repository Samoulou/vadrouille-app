import "server-only";

import type { ClientModeles } from "@/ai/client";
import { createOpenRouterClient } from "@/ai/openrouter-client";
import { creerRechercheWebReelle } from "@/ai/recherche-web-reelle";
import { creerRedigerRaisons, type RedigerRaisons } from "@/ai/rediger-raisons";
import { capacitesAncrage, type CapacitesAncrage } from "@/grounding/ancrage-zone";
import type { ClientPlaces, ClientRoutes } from "@/grounding/interfaces";
import { createPlacesClient } from "@/grounding/places-client";
import { createRoutesClient } from "@/grounding/routes-client";
import { moteurRechercheWebAttendu, type MoteurRechercheWeb, type Routage } from "@/prototype/config";
import { creerLecteurPages, type LecteurPages } from "@/research/fetch-page";
import type { ClientRechercheWeb } from "@/research/recherche-web";
import { createUndiciTransport } from "@/research/undici-transport";
import type { GardeOuverte } from "@/server/p0/garde";
import { periodesDe } from "@/server/usage/periodes";
import { horlogeSysteme, type ContexteAppel, type Fournisseur, type Horloge, type Plafond, type PortConsommation } from "@/server/usage/port";

/**
 * Module de composition du mode réel (décision 0055, section 3, D18 ; avis de la Sécurité S-3). **Câble seulement** :
 * aucune logique métier (ni tri, ni notation, ni plan), aucune lecture d'environnement (les clés sont lues par les
 * clients, paresseusement, à leur construction, par `@/server/env/ai` et `@/server/env/grounding`).
 *
 * - **Seul importateur** des modules de capacité hors de leurs tests (`openrouter-client.ts`, `places-client.ts`,
 *   `routes-client.ts`, `undici-transport.ts`) ; lui-même importé par `src/workflows/p0-run.ts` seulement (test
 *   `p0: modules de capacité importés par la seule composition`).
 * - **Garde exigée** : `composerP0Reel` prend une `GardeOuverte` (type de marque fabriqué par `src/server/p0/garde.ts`
 *   seul) ; l'exécution de la réservation est celle de la garde. La sûreté repose sur `verifierGardeEtape` à l'entrée de
 *   chaque étape (S-1 point 3), pas sur le type seul.
 * - **Séparation des capacités** (section 3 point 5) : trois fabriques, une par famille d'étapes, chacune ne construisant
 *   que ses clients (une étape de l'agent ne lit pas la clé Google) :
 *   - `agent()` : modèles, recherche web et pages, rien de Google ;
 *   - `ancrage()` : `textSearch` et `detailsLogement` seulement, rien d'autre de Places, aucun modèle ;
 *   - `etapeFinale()` : fiches Place Details, Routes, et `redigerRaisons` (jamais le client de modèles brut, ni la
 *     recherche web, ni les pages).
 * - **Port de consommation** : chaque client reçoit le port et les plafonds du mode (réservation avant chaque appel) ;
 *   le contexte de chaque appel porte l'exécution de la garde et les périodes du fournisseur (D20), calculées à l'appel.
 */

/** Réglages des modèles du mode réel, lus par l'appelant dans la configuration (aucune valeur ici). */
export type ReglagesModeles = {
  readonly routage: Routage;
  /**
   * Recherche web du fournisseur : modèle de l'étape `recherche`, moteur fixé du greffon (`modeles.json`,
   * `rechercheWeb.moteur`, bloquant 1c de la PR 326) et nombre de résultats.
   */
  readonly rechercheWeb: { readonly modele: string; readonly moteur: MoteurRechercheWeb; readonly maxResultats: number };
  /** Modèle de la rédaction des raisons (étape `raisons`). */
  readonly raisons: { readonly modele: string };
};

export type OptionsComposition = {
  /** Port de consommation de l'exécution (registre du forfait réservé au lancement, P0r2). */
  readonly usage: PortConsommation;
  /** Plafonds du mode réel, calculés par l'appelant à partir de sa configuration. */
  readonly plafonds: readonly Plafond[];
  /** Coût estimé d'une requête de modèle, en micro-USD (réservé avant l'appel). */
  readonly coutEstimeModelesMicros: number;
  /**
   * Coût estimé d'une recherche web du fournisseur (jetons du modèle et frais du moteur), en micro-USD, réservé avant
   * l'appel et distinct de celui d'une requête ordinaire (mineur 2 de la PR 326).
   */
  readonly coutEstimeRechercheWebMicros: number;
  readonly modeles: ReglagesModeles;
  readonly horloge?: Horloge;
};

/** Capacités des étapes de l'agent (recherche, lecture, notation) : modèles, recherche web, pages ; rien de Google. */
export type CapacitesAgent = {
  readonly modeles: ClientModeles;
  readonly rechercheWeb: ClientRechercheWeb;
  readonly pages: LecteurPages;
};

/** Capacités de l'étape finale : fiches Place Details, Routes et rédaction des raisons ; rien d'autre. */
export type CapacitesEtapeFinale = {
  readonly places: Pick<ClientPlaces, "details">;
  readonly routes: ClientRoutes;
  readonly redigerRaisons: RedigerRaisons;
};

export type CompositionP0Reel = {
  readonly agent: () => CapacitesAgent;
  readonly ancrage: () => CapacitesAncrage;
  readonly etapeFinale: () => CapacitesEtapeFinale;
};

/**
 * Signature `(garde, options)` au lieu de `(garde, runId)` de 0055 § 3 point 1 : l'identifiant d'exécution est lu dans
 * la garde, jamais passé à part (écart demandé par le mineur 9 de la revue de la PR 326 ; ligne d'amendement de 0055
 * § 3 point 1 proposée dans la PR, à écrire par le CEO).
 *
 * Moteur de recherche web : refusé à la construction s'il n'est pas celui qu'exige le modèle de l'étape (`native` si le
 * modèle l'offre, sinon `exa`), même règle que la configuration (défense en profondeur).
 */
export function composerP0Reel(garde: GardeOuverte, options: OptionsComposition): CompositionP0Reel {
  if (options.modeles.rechercheWeb.moteur !== moteurRechercheWebAttendu(options.modeles.rechercheWeb.modele)) {
    throw new RangeError("composition : moteur de recherche web incohérent avec le modèle de l'étape recherche");
  }
  const horloge = options.horloge ?? horlogeSysteme;
  const executionId = garde.runId;
  const contexte =
    (fournisseur: Fournisseur) =>
    (): ContexteAppel => ({ nature: "execution", executionId, periodes: periodesDe(fournisseur, horloge) });
  const modeles = () =>
    createOpenRouterClient({
      usage: options.usage,
      contexte: contexte("modeles"),
      plafonds: options.plafonds,
      coutEstimeMicros: options.coutEstimeModelesMicros,
      coutEstimeRechercheWebMicros: options.coutEstimeRechercheWebMicros,
      horloge,
    });
  const google = { usage: options.usage, contexte: contexte("google"), plafonds: options.plafonds, horloge };

  return {
    agent() {
      const client = modeles();
      return {
        modeles: { envoyer: (requete) => client.envoyer(requete) },
        rechercheWeb: creerRechercheWebReelle(client.rechercherWeb, { ...options.modeles.rechercheWeb, routage: options.modeles.routage }),
        pages: creerLecteurPages(createUndiciTransport()),
      };
    },
    ancrage() {
      const { textSearch, detailsLogement } = capacitesAncrage(createPlacesClient(google));
      return { textSearch, detailsLogement };
    },
    etapeFinale() {
      const places = createPlacesClient(google);
      return {
        places: { details: (placeId) => places.details(placeId) },
        routes: createRoutesClient(google),
        redigerRaisons: creerRedigerRaisons(modeles(), { modele: options.modeles.raisons.modele, routage: options.modeles.routage }),
      };
    },
  };
}
