import "server-only";

import type { ClientModeles } from "@/ai/client";
import { createOpenRouterClient } from "@/ai/openrouter-client";
import { creerRechercheWebReelle } from "@/ai/recherche-web-reelle";
import { creerNoterCandidats, type NoterCandidats } from "@/ai/noter-candidats";
import { creerRedigerProgramme, type RedigerProgramme } from "@/ai/rediger-programme";
import { creerRedigerRevision, type RedigerRevision } from "@/ai/rediger-revision";
import { creerRedigerRaisons, type RedigerRaisons } from "@/ai/rediger-raisons";
import { capacitesAncrage, type CapacitesAncrage } from "@/grounding/ancrage-zone";
import type { ClientPhotosLieu, ClientPlaces, ClientRoutes } from "@/grounding/interfaces";
import { createPlacesClient, createPlacesPhotosClient } from "@/grounding/places-client";
import { creerCadence, type Cadence } from "@/grounding/budget-routes";
import { createRoutesClient } from "@/grounding/routes-client";
import { moteurRechercheWebAttendu, type MoteurRechercheWeb, type Routage } from "@/prototype/config";
import { creerLecteurPages, creerVerificateurStatut, type LecteurPages, type VerificateurStatut } from "@/research/fetch-page";
import type { ClientRechercheWeb } from "@/ai/recherche-web";
import { createUndiciTransport } from "@/research/undici-transport";
import type { GardeOuverte, GardeRelecture } from "@/server/p0/garde";
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
 *   - `etapeFinale()` : fiches Place Details, Routes, `noterCandidats` et `redigerRaisons` (jamais le client de modèles
 *     brut, ni la recherche web, ni les pages), et `detailsLogement` (logements du brief seulement : leurs identifiants
 *     ne passent pas d'une étape à l'autre, amendement A3 de 0055 § 3 point 5) ;
 *   - `programme()` (décision 0116 § 3, seule famille appelée par `p0Run` depuis le lot 1 du programme écrit par l'IA) :
 *     `redigerProgramme` (une requête `programme`, jamais le client brut ni la recherche web), `textSearch`, fiches
 *     Place Details, `detailsLogement`, Routes et, depuis le lot 2a, `verifierSite` (vérification de statut des sites
 *     proposés par l'IA, `creerVerificateurStatut` sur le transport réel, derrière sa barrière de sortie ; 0121 § 3.4,
 *     0122 § 1 condition 11 : la seule famille qui la reçoit). Les trois familles précédentes restent pour leurs tests
 *     (0116 § 7).
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
  /** Modèle de la notation (étape `notation`, selon la variante). */
  readonly notation: { readonly modele: string };
  /** Modèle de la rédaction des raisons (étape `raisons`). */
  readonly raisons: { readonly modele: string };
  /** Modèle de la rédaction du programme (étape de requête `programme`, décision 0116 § 2.2). */
  readonly programme: { readonly modele: string };
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

/**
 * Capacités de l'étape finale (0055 § 3 point 5, amendement A3) : fiches Place Details, Routes, notation et rédaction des
 * raisons, et la fiche d'un **logement du brief** (`detailsLogement`, même capacité que l'ancrage : entrée = brief et
 * indice, jamais un `placeId`) ; rien d'autre.
 */
export type CapacitesEtapeFinale = {
  readonly places: Pick<ClientPlaces, "details">;
  readonly routes: ClientRoutes;
  readonly detailsLogement: CapacitesAncrage["detailsLogement"];
  readonly noterCandidats: NoterCandidats;
  readonly redigerRaisons: RedigerRaisons;
};

/**
 * Capacités de l'étape `etapeProgramme` (décision 0116 § 3 et § 4) : rédaction du programme (une requête `programme`),
 * Text Search restreint à la zone (masque `id`), fiches Place Details, fiche des logements du brief, Routes et
 * vérification de statut des sites (lot 2a). Ni client de modèles brut, ni recherche web, ni lecture de pages.
 */
export type CapacitesProgramme = {
  readonly redigerProgramme: RedigerProgramme;
  /** Révision après le tri (E2E-essai, lot 4 ; décision 0126) : une requête, même modèle et même routage `zdr`. */
  readonly redigerRevision: RedigerRevision;
  readonly textSearch: CapacitesAncrage["textSearch"];
  readonly places: Pick<ClientPlaces, "details">;
  readonly detailsLogement: CapacitesAncrage["detailsLogement"];
  readonly routes: ClientRoutes;
  /** Vérification de statut des sites (lot 2a) : `GET` borné, corps jamais lu, résultat fermé (0122 § 1). */
  readonly verifierSite: VerificateurStatut;
};

export type CompositionP0Reel = {
  readonly agent: () => CapacitesAgent;
  readonly ancrage: () => CapacitesAncrage;
  readonly etapeFinale: () => CapacitesEtapeFinale;
  readonly programme: () => CapacitesProgramme;
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
  // Non-confusion (P0r4, décision 0079) : une preuve de relecture n'ouvre jamais une exécution.
  if (typeof garde.runId !== "string" || "relecture" in garde) throw new RangeError("composition : garde d'exécution attendue");
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
  // `zdr` (0116 § 2.2) ne vaut que pour la requête `programme` (0117 § 5.3) : les autres requêtes (recherche web,
  // notation, raisons de l'ancienne chaîne) reçoivent le routage sans lui (revue 1 de #632, mineur 7).
  const routageHorsProgramme = { data_collection: options.modeles.routage.data_collection };

  return {
    agent() {
      const client = modeles();
      return {
        modeles: { envoyer: (requete) => client.envoyer(requete) },
        rechercheWeb: creerRechercheWebReelle(client.rechercherWeb, { ...options.modeles.rechercheWeb, routage: routageHorsProgramme }),
        pages: creerLecteurPages(createUndiciTransport()),
      };
    },
    ancrage() {
      const { textSearch, detailsLogement } = capacitesAncrage(createPlacesClient(google));
      return { textSearch, detailsLogement };
    },
    etapeFinale() {
      const places = createPlacesClient(google);
      const client = modeles();
      return {
        places: { details: (placeId) => places.details(placeId) },
        routes: createRoutesClient(google),
        detailsLogement: capacitesAncrage(places).detailsLogement,
        noterCandidats: creerNoterCandidats(client, { modele: options.modeles.notation.modele, routage: routageHorsProgramme }),
        redigerRaisons: creerRedigerRaisons(client, { modele: options.modeles.raisons.modele, routage: routageHorsProgramme }),
      };
    },
    programme() {
      const places = createPlacesClient(google);
      const { textSearch, detailsLogement } = capacitesAncrage(places);
      // `creerRedigerProgramme` et `creerRedigerRevision` posent `zdr: true` et `data_collection: "deny"` (verdict S5 de
      // 0117, 0116 § 2.2). Un seul client pour les deux : une étape n'appelle que l'un d'eux.
      const client = modeles();
      const reglage = { modele: options.modeles.programme.modele, routage: options.modeles.routage };
      return {
        redigerProgramme: creerRedigerProgramme(client, reglage),
        redigerRevision: creerRedigerRevision(client, reglage),
        textSearch,
        places: { details: (placeId) => places.details(placeId) },
        detailsLogement,
        routes: createRoutesClient(google),
        verifierSite: creerVerificateurStatut(createUndiciTransport()),
      };
    },
  };
}

export type OptionsRelecture = {
  /** Registre en mémoire du forfait de relecture réservé (P0r2) : il borne les appels de cette relecture. */
  readonly usage: PortConsommation;
  readonly plafonds: readonly Plafond[];
  readonly horloge?: Horloge;
};

/**
 * Relecture Routes d'une Journée (P0r4, décision 0079) : le seul client Routes, rien d'autre (ni Places, ni modèle).
 * Exige une `GardeRelecture` (barrière, purge et forfait de relecture réservé, `src/server/p0/garde.ts`). Le contexte de
 * chaque appel porte la nature `relecture`, sans exécution, et les périodes Google calculées à l'appel (D20).
 */
export function composerRelecture(garde: GardeRelecture, options: OptionsRelecture): { readonly routes: ClientRoutes } {
  // Non-confusion : une preuve d'exécution (`runId`) n'ouvre jamais une relecture.
  if (garde.relecture !== true || "runId" in garde) throw new RangeError("composition : garde de relecture attendue");
  const horloge = options.horloge ?? horlogeSysteme;
  const contexte = (): ContexteAppel => ({ nature: "relecture", executionId: null, periodes: periodesDe("google", horloge) });
  return { routes: createRoutesClient({ usage: options.usage, contexte, plafonds: options.plafonds, horloge }) };
}

/**
 * Photos du tri d'un voyage d'essai (décision 0128) : le seul client des photos de lieu, rien d'autre (ni fiche complète,
 * ni Text Search, ni Routes, ni modèle). Exige une `GardeRelecture` (barrière du mode réel et cookie d'accès, forfait de
 * la photo réservé, `src/server/p0/photos.ts`) ; contexte de nature `relecture`, sans exécution, périodes Google à l'appel.
 */
export function composerPhotos(garde: GardeRelecture, options: OptionsRelecture): { readonly photos: ClientPhotosLieu } {
  if (garde.relecture !== true || "runId" in garde) throw new RangeError("composition : garde de relecture attendue");
  const horloge = options.horloge ?? horlogeSysteme;
  const contexte = (): ContexteAppel => ({ nature: "relecture", executionId: null, periodes: periodesDe("google", horloge) });
  return { photos: createPlacesPhotosClient({ usage: options.usage, contexte, plafonds: options.plafonds, horloge }) };
}

/**
 * Cadence des relectures Routes (P0r4 ; bloquant 2 de la revue du head `e79fbed`) : fenêtre glissante d'une minute de
 * `creerCadence`, `maxParMinute` éléments au plus, minuterie réelle. **Câble seulement** : l'instance unique par
 * processus (3 000 éléments par minute, Q330) est gardée par `src/server/p0/relecture.ts` (`cadenceRelecture`).
 */
export function creerCadenceRelecture(maxParMinute: number): Cadence {
  return creerCadence(maxParMinute, {
    maintenant: () => Date.now(),
    attendre: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  });
}
