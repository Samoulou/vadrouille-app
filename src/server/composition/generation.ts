import "server-only";

import type { ClientModeles, RequeteModele } from "@/ai/client";
import { usdEnMicros } from "@/ai/client";
import { creerCoucheIa, type CoucheIa } from "@/ai/couche";
import { creerRedigerProgramme } from "@/ai/rediger-programme";
import { lieuxDuProgramme, lireProgramme, ordreEcrit, type ProgrammeIa } from "@/ai/sorties";
import type { EntreeModeles } from "@/ai/entrees";
import { ErreurOpenRouter, createOpenRouterClient } from "@/ai/openrouter-client";
import type { ClientRechercheWeb } from "@/ai/recherche-web";
import { creerRechercheWebReelle } from "@/ai/recherche-web-reelle";
import type { TracesIa } from "@/ai/traces";
import type { Brief, Category, Lodging, MobilityMode } from "@/contracts";
import type { ParametresClassement } from "@/domain/classement";
import type { ConfigurationMoteur } from "@/domain/configuration";
import type { CandidatMoteur, NotesMoteur } from "@/domain/entrees";
import type { Relectures } from "@/domain/relectures";
import type { JourSquelette } from "@/domain/squelette";
import { ErreurClientGoogle } from "@/grounding/enveloppe-google";
import type { ClientPlacesMvp, ClientRoutes } from "@/grounding/interfaces";
import { ancrerCandidats, verifierLogement, zoneEtDepart } from "@/grounding/ancrage-production";
import { lieuxHorsPartTextSearch } from "@/grounding/ancrage";
import { ancrerLogementsDuSejour, capacitesAncrage, verifierLieuxDuProgramme } from "@/grounding/ancrage-zone";
import type { RectangleZone } from "@/grounding/interfaces";
import { positionsFraiches } from "@/grounding/fiches";
import { capturer, valeurOuEchec, type ResultatAncrage } from "@/grounding/resultat";
import { creerLecteurPages, creerVerificateurStatut, reduireSite, type LecteurPages } from "@/research/fetch-page";
import { creerRecherche, type ConfigurationRecherche } from "@/research/recherche";
import { versLignes, type LignesCandidat } from "@/research/candidat-trouve";
import { classerSource } from "@/research/sources";
import { createUndiciTransport } from "@/research/undici-transport";
import { creerClientsGoogle, envelopperClientsGoogle, type ClientsGoogle } from "@/server/composition/clients-google";
import { CONFIGURATION_IA } from "@/server/config/ia";
import { COUTS_ESTIMES_MICROS, MARGE_FICHES } from "@/server/config/generation";
import { preparerPlanification } from "@/server/relecture/planification";
import { ecrirePositionsAbsentes, type FabriquePortPositions, type ResultatEcriturePositions } from "@/server/relecture/positions-ecriture";
import { reglesDeLecture } from "@/server/relecture/regles";
import { periodesDe } from "@/server/usage/periodes";
import type { Forfait } from "@/server/usage/forfait";
import {
  avecReservation,
  DELAI_REQUETE_MS,
  demandeDe,
  horlogeSysteme,
  type ContexteAppel,
  type Fournisseur,
  type Horloge,
  type Plafond,
  type PortConsommation,
} from "@/server/usage/port";
import type { ReglesUsage } from "@/server/usage/reservation";
import type { PlafondsUsage } from "@/server/config/usage";


/**
 * Composition de la génération (spécification B9, B9c ; décisions 0081 B9-TL-2, amendée par 0100 § 5.2, B9-TL-1 et
 * B9-TL-8 ; verdict de la Sécurité attendu). **Câble seulement** : aucune logique métier (ni tri, ni plan, ni notation),
 * aucune lecture d'environnement (les clés sont lues par les clients, à leur construction). Importée par
 * `src/server/generation/` et `src/server/creation/` seulement (règle `ligne/creation-imports`).
 *
 * - **Capacités à types neutres** : `src/server/generation/` ne peut importer ni `@/ai`, ni `@/research`, ni
 *   `@/grounding` (0081 B9-TL-1 point 2) ; il reçoit donc de ce module des capacités dont les types ne mentionnent que le
 *   domaine et les contrats. Les données Google ne traversent jamais ces types, sauf dans `planifier`, où elles sont des
 *   `Relectures` en mémoire.
 * - **Une fabrique par famille d'étapes**, appelée **dans** l'étape (aucun client en cache de module, rien ne traverse la
 *   frontière sérialisée) : `logement` (Text Search et fiche `details`, rien d'autre), `recherche` (modèles, recherche
 *   web, pages : rien de Google), `ancrage` (Text Search et position), `notation` (modèles), `finale` (fiches, Routes et
 *   rédaction des raisons : jamais la recherche web ni les pages), `programme` (chaîne inversée, décision 0136 § 1.4 :
 *   logements, une requête `programme`, lecture tolérante, vérification des lieux et des sites ; jamais la recherche web, les
 *   pages ni Routes).
 * - **Variantes** : `reelle` (clients de `clients-google.ts`, OpenRouter, recherche web et pages sur le transport réel) et
 *   `simulee` (doubles sur les fixtures d'Édimbourg de `prototype/fixtures/`, les seules en local et en CI, chargées hors du graphe de production par `fixtures-simulees.ts`, atteint seulement par `import()` dynamique : décision 0105). Les doubles
 *   sont enveloppés dans la même réservation que les clients réels (`avecReservation`) : un plafond ou un quota agit de la
 *   même façon dans les deux variantes. Le choix de la variante est celui de la barrière (`generation/barriere.ts`).
 * - **Positions** (B8c fusionnée, 0081 B9-TL-9) : la composition n'écrit rien elle-même ; `planifier` rend les positions des fiches
 *   lues sous la forme `PositionsDeLEtape`, que l'étape `e` écrit dans la transaction de la version publiée seulement si
 *   `ECRITURE_POSITIONS_AUTORISEE` (condition (a) de 0060 § 3.4 : premier succès de `coords-purge.yml`) et si
 *   `POSITIONS_ECRITURE_SUSPENDUE` n'est pas posé (`src/server/generation/barriere.ts`).
 */

// --- Types neutres ------------------------------------------------------------------------------------------------------

/** Échec fermé d'une capacité : code du jeu fermé de `generation_runs.stop_reason`, jamais un message. */
export type EchecCapacite = { readonly ok: false; readonly code: string; readonly retryable: boolean };
export type ResultatCapacite<T> = { readonly ok: true; readonly valeur: T } | EchecCapacite;

/** Logement d'une ville prêt pour la zone et le départ : `known` et `suggestedLodging` portent leur `placeId` vérifié. */
export type LogementVille =
  | { readonly kind: "known" | "suggestedLodging"; readonly placeId: string }
  | Extract<Lodging, { readonly kind: "suggestedArea" | "area" | "none" }>;

/** Ville de l'aperçu : rang dans l'ordre du séjour, nom saisi, dates de l'aperçu dans cette ville. */
export type VilleApercu = { readonly rang: number; readonly nom: string; readonly arrivee: string; readonly depart: string };

export type BilanRecherche = {
  readonly queries: readonly string[];
  readonly pagesRead: number;
  readonly durationMs: number;
  readonly costEstimateMicros: number;
  readonly errors: readonly string[];
};

export type LignesRecherche = LignesCandidat;

export type CandidatANoter = {
  /** Identifiant interne (`uuid`) ; la composition le traduit en `c_NNN` pour le modèle. */
  readonly id: string;
  readonly nom: string;
  readonly resume: string;
  readonly categorie: Category;
  readonly typeEtape: "activity" | "meal";
};

/** Lieu à rédiger : la source est facultative (aucune URL lisible : le champ `sourceDomaine` est omis, jamais inventé). */
export type LieuARedige = CandidatANoter & { readonly sourceUrl?: string };

export type EntreePlanifier = {
  readonly jours: readonly JourSquelette[];
  readonly nuitsVille: readonly number[];
  readonly villes: readonly { readonly rang: number; readonly nom: string; readonly logement: LogementVille }[];
  readonly candidats: readonly (CandidatMoteur & { readonly ville: number })[];
  readonly modes: readonly MobilityMode[];
  readonly classement: ParametresClassement;
  readonly configuration: ConfigurationMoteur;
};

/** Exécuteur SQL de la transaction de publication (même forme que `ExecuteurPositions` de `@/server/positions/lecture`). */
export type ExecuteurPublication = { query(texte: string, valeurs: readonly unknown[]): Promise<{ rows: readonly Record<string, unknown>[] }> };

/**
 * Positions des fiches lues par la planification (données Google, en mémoire), que l'étape `e` écrit au cache **dans la
 * transaction de la version publiée** (0081 B9-TL-9 ; 0100 § 3.1 point 2) : les seuls `placeId` de la version publiée,
 * absents du cache (jamais une position rendue par `lire`). Ne porte aucune valeur lisible par `generation/`.
 */
export interface PositionsDeLEtape {
  ecrire(executeur: ExecuteurPublication, publies: ReadonlySet<string>, obtenuesA: number, creerPort?: FabriquePortPositions): Promise<ResultatEcriturePositions>;
}

export type SortiePlanifier = { readonly candidats: readonly CandidatMoteur[]; readonly relectures: Relectures; readonly positions: PositionsDeLEtape };

export type { FabriquePortPositions, ResultatEcriturePositions };

export interface CapaciteLogement {
  /** `null` : logement sans `placeId` à vérifier, aucun appel. */
  verifier(logement: Lodging, ville: string): Promise<ResultatCapacite<{ readonly placeId: string } | null>>;
}

export interface CapaciteRecherche {
  /** `profil` : bornes de la recherche (B7-PO-5) ; `apercu` par défaut, `complet` pour le voyage complet (B9d). */
  rechercher(
    brief: Brief,
    ville: VilleApercu,
    dejaTrouves: readonly string[],
    fuseau: string,
    profil?: "apercu" | "complet",
  ): Promise<ResultatCapacite<{ readonly lignes: readonly LignesRecherche[]; readonly bilan: BilanRecherche }>>;
}

export interface CapaciteAncrage {
  /** Zone du séjour de la ville, puis `placeId` des candidats résolus dans cette zone (les autres sont absents). */
  ancrer(logement: LogementVille, ville: string, candidats: readonly { readonly id: string; readonly nom: string }[]): Promise<ResultatCapacite<ReadonlyMap<string, string>>>;
}

export interface CapaciteNotation {
  noter(brief: Brief, ville: VilleApercu, candidats: readonly CandidatANoter[]): Promise<ResultatCapacite<ReadonlyMap<string, NotesMoteur>>>;
}

export interface CapaciteFinale {
  planifier(entree: EntreePlanifier): Promise<ResultatCapacite<SortiePlanifier>>;
  rediger(brief: Brief, ville: VilleApercu, lieux: readonly LieuARedige[]): Promise<ResultatCapacite<ReadonlyMap<string, { readonly raison: string; readonly detour: string }>>>;
}

/**
 * Formes structurelles de l'étape « programme » (décision 0136 § 1.4) : celles de `src/server/programme/` (`CreneauAssemble`,
 * `BriefEssai`, `VerificateurSites`), **redites ici sans import** (zone sensible de 0038 : ce pont n'importe de `src/server`
 * que ses lignes nominatives) ; l'étape qui les reçoit les passe aux fonctions du dossier, dont les types vérifient
 * l'accord à la compilation. Textes maison, jamais une donnée Google.
 */
export type CreneauProgramme = {
  readonly debut: string;
  readonly fin?: string;
  readonly nature: "arrivee" | "visite" | "repas_midi" | "repas_soir" | "apero" | "soiree" | "pause" | "depart";
  readonly lieu?: string;
  readonly quartier?: string;
  readonly pourquoi?: string;
  readonly conseil?: string;
  readonly prix?: string;
  readonly horaires?: string;
  readonly aReserver?: boolean;
  /** Adresse du site proposée par l'IA, **brute** : l'étape la réduit et ne remet au créneau que l'adresse vérifiée. */
  readonly site?: string;
  readonly ville?: string;
};

/** Brief de l'étape (forme de `BriefEssai`) : ce que lisent l'ancrage des logements et l'entrée du modèle. */
export type BriefDuProgramme = {
  readonly destination: string;
  readonly pays: string;
  readonly logements: readonly { readonly texte: string; readonly nuits: number }[];
};

/** Entrée de la requête `programme` (validée par son schéma strict dans `creerRedigerProgramme`). */
export type EntreeRedaction = Parameters<ReturnType<typeof creerRedigerProgramme>>[0];

/** Vérificateur de statut des sites (forme de `VerificateurSites` et de `VerificateurStatut`). */
export type VerificateurDesSites = {
  readonly barriereFermee: boolean;
  verifier(adresse: string, signal?: AbortSignal): Promise<{ readonly ok: boolean }>;
};

/** Programme lu, **dans l'ordre écrit** (`ordreEcrit`, une seule fois, avant toute vérification). */
export type ProgrammeRedige = {
  readonly jours: readonly { readonly date: string; readonly titre?: string; readonly creneaux: readonly CreneauProgramme[] }[];
  readonly bonsPlans: readonly string[];
};

/** Issue de la requête `programme` : le programme lu (`null` : aucune journée lisible) et les compteurs de la lecture. */
export type RedactionProgramme = {
  readonly programme: ProgrammeRedige | null;
  readonly joursRetires: number;
  readonly creneauxRetires: number;
  readonly champsRetires: number;
  readonly textesCoupes: number;
  /** Raison de fin fermée et jetons de la requête (client réel seulement, décision 0130 § 2), jamais le texte. */
  readonly fin?: string;
  readonly tokens?: { readonly entree: number; readonly sortie: number };
};

/**
 * Contrôle fait par l'étape **avant** chaque appel de la vérification (forme de `ControleAppel`, `src/grounding/ancrage-zone.ts`) :
 * `ok`, ou la raison de l'arrêt de la boucle (`part` épuisée, `temps` : le délai de l'appel ne tient plus avant l'échéance).
 */
export type ControleVerification = (methode: "textSearch" | "fiche") => Promise<"ok" | "part" | "temps">;

/**
 * Lieux vérifiés du programme : le `placeId` vérifié de chaque créneau (jour et rang de l'ordre écrit), et les positions des
 * fiches lues (logements et lieux, données Google en mémoire) que l'étape écrit au cache dans la transaction de publication,
 * sous les mêmes conditions que l'ancienne chaîne (0081 B9-TL-9 ; 0136 § 3.7 : jamais en variante simulée).
 */
export type LieuxVerifies = { readonly placeIdDe: (jour: number, rang: number) => string | undefined; readonly positions: PositionsDeLEtape };

/**
 * Capacités de l'étape « programme » de `generateProgramme` (décision 0136 § 1.4 et § 2.3), **dans cet ordre** :
 * `logements` (une recherche et une fiche par logement, zone du séjour gardée en mémoire), `rediger` (une requête
 * `programme`, jamais une donnée Google), puis `lieux` (lieux distincts dans l'ordre écrit) et leur vérification. Seuls des
 * `placeId` sortent de Google, jamais un nom, une position ni un verdict ; les noms vérifiés sont ceux de l'IA (0139 § 5.2).
 */
export interface CapaciteProgramme {
  /** `placeId` de chaque logement du brief, dans son ordre ; un logement introuvable ou fermé lève `lodging_unresolved`. */
  logements(brief: BriefDuProgramme): Promise<readonly string[]>;
  /** Une requête `programme` (entrée validée par son schéma strict), lecture tolérante et ordre écrit. */
  rediger(entree: EntreeRedaction, sejour: { readonly arrivee: string; readonly depart: string }): Promise<RedactionProgramme>;
  /**
   * Lieux distincts du dernier programme rédigé (ordre écrit) : leur nombre, et leur vérification sous `controle` (part et
   * échéance avant chaque appel ; non tenu : les lieux restants sans `placeId`). Rend le `placeId` vérifié de chaque créneau.
   */
  lieux(destination: string): { readonly nombre: number; verifier(controle: ControleVerification): Promise<LieuxVerifies> };
  /** Vérification de statut des sites proposés (0122 § 1) : variante simulée, barrière fermée, ni résolution ni connexion. */
  readonly sites: VerificateurDesSites;
}

/** Ce que reçoit chaque fabrique : le registre de l'étape, les plafonds de sa part du forfait et l'exécution couverte. */
export type OptionsEtape = {
  readonly usage: PortConsommation;
  readonly plafonds: readonly Plafond[];
  readonly executionId: string;
  readonly forfait: Forfait;
  readonly horloge?: Horloge;
  /** Instant (horloge du serveur) après lequel aucun appel externe ne doit encore partir. */
  readonly echeance?: number;
};

export interface FabriqueGeneration {
  readonly variante: "reelle" | "simulee";
  logement(options: OptionsEtape): CapaciteLogement;
  recherche(options: OptionsEtape): CapaciteRecherche;
  ancrage(options: OptionsEtape): CapaciteAncrage;
  notation(options: OptionsEtape): CapaciteNotation;
  finale(options: OptionsEtape): CapaciteFinale;
  programme(options: OptionsEtape): CapaciteProgramme;
}

// --- Fonctions pures exposées à `generation/` --------------------------------------------------------------------------

/** Classe de la source d'un candidat (politique de sources, cadrage § 6.5). */
export function classeDeSource(url: string): ReturnType<typeof classerSource> {
  return classerSource(url);
}

/** Règles du forfait (plafonds de la configuration, table de prix, horloge) ; `null` : aucune réservation possible. */
export function reglesDeGeneration(horloge: Horloge, plafonds?: PlafondsUsage | null): ReglesUsage | null {
  return plafonds === undefined ? reglesDeLecture(horloge) : reglesDeLecture(horloge, plafonds);
}

/** Adresse réduite d'un site proposé par l'IA (`reduireSite`, 0121 § 2.1) ; forme refusée : `undefined`. */
export function reduireSiteDuProgramme(brut: unknown): string | undefined {
  return reduireSite(brut);
}

/** Lieux hors de la part Text Search (0117 § 4, `unverifiedForCap`), des seuls nombres, avant la vérification. */
export function lieuxHorsPart(nombreLieux: number, partTextSearch: number, logements: number): number {
  return lieuxHorsPartTextSearch(nombreLieux, partTextSearch, logements);
}

// --- Conversions ---------------------------------------------------------------------------------------------------------

/** Entrée des modèles pour une ville de l'aperçu (destination, dates de l'aperçu dans la ville, brief). */
export function entreeModelesDeVille(brief: Brief, ville: VilleApercu): EntreeModeles {
  return {
    destination: ville.nom,
    arrivee: ville.arrivee,
    depart: ville.depart,
    voyageurs: { adultes: brief.travellers.adults, enfants: brief.travellers.children },
    rythme: brief.pace,
    envies: [...brief.wishes],
    ...(brief.limits.length === 0 ? {} : { limites: [...brief.limits] }),
    deplacements: [...brief.mobility],
    ...(brief.mealBudgetPerPerson === undefined ? {} : { budgetRepasChf: brief.mealBudgetPerPerson }),
  } as EntreeModeles;
}

const identifiantModele = (rang: number): string => `c_${String(rang + 1).padStart(3, "0")}`;

function echecDeCode(code: string, retryable: boolean): EchecCapacite {
  return { ok: false, code, retryable };
}

function depuisAncrage<T>(resultat: ResultatAncrage<T>): ResultatCapacite<T> {
  return resultat.ok ? resultat : echecDeCode(resultat.code, resultat.retryable);
}

/** Domaine d'une source, ou `undefined` si l'URL stockée est illisible (le champ est alors omis du prompt). */
function domaine(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  try {
    const nom = new URL(url).hostname;
    return nom === "" ? undefined : nom;
  } catch {
    return undefined;
  }
}

// --- Doubles et clients --------------------------------------------------------------------------------------------------

/** Clients d'une étape de la variante simulée (doubles) ; tous facultatifs en test, les fixtures d'Édimbourg par défaut. */
export type DoublesGeneration = {
  readonly modeles: ClientModeles;
  readonly rechercheWeb: ClientRechercheWeb;
  readonly lecteur: LecteurPages;
  readonly places: ClientPlacesMvp;
  readonly routes: ClientRoutes;
};

function contexteDe(options: OptionsEtape, fournisseur: Fournisseur, horloge: Horloge): () => ContexteAppel {
  return () => ({ nature: "execution", executionId: options.executionId, periodes: periodesDe(fournisseur, horloge) });
}

/** Échéance de l'étape (0075) : aucun appel externe ne part si son délai entier ne tient plus avant elle. */
function verifierEcheance(options: OptionsEtape, delai: number, erreur: (code: string) => Error): void {
  const horloge = options.horloge ?? horlogeSysteme;
  if (options.echeance !== undefined && horloge.maintenant() + delai > options.echeance) throw erreur("cap_reached");
}

/**
 * Réservation d'un appel de double de **modèles**, comme celle d'un client réel : refus du port ou du registre → l'erreur
 * fermée du client (aucun appel du double), délai → `upstream_timeout`, erreur du double → `upstream_error`. Les doubles
 * Google passent par `envelopperClientsGoogle` (`clients-google.ts`), qui importe les SKU et coûts des clients réels.
 */
async function sousReservation<T>(
  options: OptionsEtape,
  fournisseur: Fournisseur,
  appel: Parameters<typeof demandeDe>[1],
  delai: number,
  erreur: (code: string) => Error,
  operation: () => Promise<{ readonly valeur: T; readonly coutReelMicros: number | null }>,
): Promise<T> {
  const horloge = options.horloge ?? horlogeSysteme;
  verifierEcheance(options, delai, erreur);
  const issue = await avecReservation({ port: options.usage, horloge }, demandeDe(contexteDe(options, fournisseur, horloge)(), appel, options.plafonds), delai, async (_signal, appele) => {
    appele();
    return operation();
  });
  if (issue.ok) return issue.valeur;
  if ("code" in issue) throw erreur(issue.code);
  throw erreur("upstream_error");
}

const erreurGoogle = (code: string): Error => new ErreurClientGoogle(code as ConstructorParameters<typeof ErreurClientGoogle>[0]);
const erreurModele = (code: string): Error => new ErreurOpenRouter(code as ConstructorParameters<typeof ErreurOpenRouter>[0]);

/** Clients Google (réels ou enveloppés) sous l'échéance de l'étape ; aucune réservation ici. */
function googleAvecEcheance(clients: ClientsGoogle, options: OptionsEtape): ClientsGoogle {
  const garde = (delai: number) => verifierEcheance(options, delai, erreurGoogle);
  const { places, routes } = clients;
  return {
    places: {
      textSearch: async (requete) => (garde(DELAI_REQUETE_MS.places), places.textSearch(requete)),
      details: async (placeId) => (garde(DELAI_REQUETE_MS.places), places.details(placeId)),
      position: async (placeId) => (garde(DELAI_REQUETE_MS.places), places.position(placeId)),
      identifiant: async (placeId) => (garde(DELAI_REQUETE_MS.places), places.identifiant(placeId)),
    },
    routes: { matrice: async (requete) => (garde(DELAI_REQUETE_MS.routes), routes.matrice(requete)) },
  };
}

/** Clients Google de la variante simulée : les doubles, enveloppés dans la réservation des clients réels. */
function googleSimule(doubles: DoublesGeneration, options: OptionsEtape): ClientsGoogle {
  const horloge = options.horloge ?? horlogeSysteme;
  return googleAvecEcheance(
    envelopperClientsGoogle({ places: doubles.places, routes: doubles.routes }, { usage: options.usage, contexte: contexteDe(options, "google", horloge), plafonds: options.plafonds, horloge }),
    options,
  );
}

function modelesSousPlafond(base: ClientModeles, options: OptionsEtape, delai: number = DELAI_REQUETE_MS.openrouter): ClientModeles {
  return {
    envoyer: (requete: RequeteModele) =>
      sousReservation(
        options,
        "modeles",
        { fournisseur: "modeles", methode: "chat", sku: requete.modele, unites: { requetes: 1, elements: 0 }, coutEstimeMicros: COUTS_ESTIMES_MICROS.requeteModele },
        delai,
        erreurModele,
        async () => {
          const reponse = await base.envoyer(requete);
          return { valeur: reponse, coutReelMicros: usdEnMicros(reponse.coutUsd) };
        },
      ),
  };
}

function rechercheWebSousPlafond(base: ClientRechercheWeb, options: OptionsEtape): ClientRechercheWeb {
  return {
    rechercher: (requete) =>
      sousReservation(
        options,
        "modeles",
        {
          fournisseur: "modeles",
          methode: "chat",
          sku: CONFIGURATION_IA.rechercheWeb.modele,
          unites: { requetes: 1, elements: 0 },
          coutEstimeMicros: COUTS_ESTIMES_MICROS.rechercheWeb,
        },
        DELAI_REQUETE_MS.openrouter,
        erreurModele,
        async () => {
          const reponse = await base.rechercher(requete);
          return { valeur: reponse, coutReelMicros: usdEnMicros(reponse.coutUsd) };
        },
      ),
  };
}

// --- Capacités (communes aux deux variantes) ------------------------------------------------------------------------------

type ClientsPlaces = Pick<ClientPlacesMvp, "textSearch" | "details" | "position">;

function capaciteLogement(places: ClientsPlaces): CapaciteLogement {
  return {
    async verifier(logement, ville) {
      return depuisAncrage(await verifierLogement(logement, ville, places));
    },
  };
}

function configurationRecherche(): ConfigurationRecherche {
  const { recherche, profils } = CONFIGURATION_IA;
  return { recherche, profils, ageSourceMaxJours: profils.apercu.ageSourceMaxJours };
}

function capaciteRecherche(modeles: ClientModeles, rechercheWeb: ClientRechercheWeb, lecteur: LecteurPages, horloge: Horloge, traces?: TracesIa): CapaciteRecherche {
  const ia = creerCoucheIa({ modeles, reglages: CONFIGURATION_IA.reglages, ...(traces === undefined ? {} : { traces }) });
  const recherche = creerRecherche({ ia, modeles, rechercheWeb, lecteur, configuration: configurationRecherche(), horloge: () => horloge.maintenant() });
  return {
    async rechercher(brief, ville, dejaTrouves, fuseau, profil = "apercu") {
      const issue = await recherche.rechercher({ entree: entreeModelesDeVille(brief, ville), ...(dejaTrouves.length === 0 ? {} : { dejaTrouves: [...dejaTrouves] }) }, profil);
      if (!issue.ok) return echecDeCode(issue.code, issue.retryable);
      const { candidats, bilan } = issue.valeur;
      return {
        ok: true,
        valeur: {
          lignes: candidats.map((candidat) => versLignes(candidat, fuseau)),
          bilan: { queries: bilan.queries, pagesRead: bilan.pagesRead, durationMs: bilan.durationMs, costEstimateMicros: bilan.costEstimateMicros, errors: bilan.errors },
        },
      };
    },
  };
}

function capaciteAncrage(places: ClientsPlaces): CapaciteAncrage {
  return {
    async ancrer(logement, ville, candidats) {
      return depuisAncrage(
        await capturer(async () => {
          const ancre = valeurOuEchec(await zoneEtDepart(logement, ville, places));
          return valeurOuEchec(await ancrerCandidats(candidats, ville, ancre.zone, places));
        }),
      );
    },
  };
}

function capaciteNotation(ia: CoucheIa): CapaciteNotation {
  return {
    async noter(brief, ville, candidats) {
      const entree = entreeModelesDeVille(brief, ville);
      const notes = new Map<string, NotesMoteur>();
      const taille = Math.max(1, CONFIGURATION_IA.tailleLotNotation);
      for (let debut = 0; debut < candidats.length; debut += taille) {
        const lot = candidats.slice(debut, debut + taille);
        const issue = await ia.noter({
          entree,
          candidats: lot.map((candidat, rang) => ({ id: identifiantModele(rang), nom: candidat.nom, resume: candidat.resume, categorie: candidat.categorie, typeEtape: candidat.typeEtape })),
        });
        if (!issue.ok) return echecDeCode(issue.code, issue.retryable);
        lot.forEach((candidat, rang) => {
          const note = issue.valeur.notes.get(identifiantModele(rang));
          if (note !== undefined) notes.set(candidat.id, { matchesWishes: note.matchesWishes, notForMeRisk: note.notForMeRisk, mustSee: note.mustSee, slotFit: [...note.slotFit] });
        });
      }
      return { ok: true, valeur: notes };
    },
  };
}

function capaciteFinale(places: ClientsPlaces, routes: ClientRoutes, ia: CoucheIa, forfait: Forfait): CapaciteFinale {
  return {
    async planifier(entree) {
      const issue = await preparerPlanification(
        {
          jours: entree.jours,
          nuitsVille: entree.nuitsVille,
          villes: entree.villes,
          candidats: entree.candidats,
          modes: entree.modes,
          classement: entree.classement,
          configuration: entree.configuration,
          budgets: {
            textSearch: forfait.textSearchRequetes,
            // Positions comprises : la planification retire une fiche par ville qu'elle positionne (0113 § 4 point 3).
            fiches: forfait.placeDetailsRequetes,
            routesRequetes: forfait.routesRequetes,
            routesElements: forfait.routesElements,
            marge: MARGE_FICHES,
          },
        },
        { places, routes },
      );
      if (!issue.ok) return depuisAncrage(issue);
      const { positions } = issue.valeur;
      return {
        ok: true,
        valeur: {
          candidats: issue.valeur.candidats,
          relectures: issue.valeur.relectures,
          positions: {
            ecrire: (executeur, publies, obtenuesA, creerPort) =>
              ecrirePositionsAbsentes(
                  executeur,
                  positionsFraiches([...positions].filter(([placeId]) => publies.has(placeId)).map(([placeId, position]) => ({ issue: "chargee" as const, placeId, position }))),
                  obtenuesA,
                  creerPort,
                ),
          },
        },
      };
    },
    async rediger(brief, ville, lieux) {
      // Un lieu dont la source n'a pas de domaine lisible n'est pas rédigé (le prompt exige `sourceDomaine`, jamais inventé) :
      // il reste sans raison, donc sans case.
      const lisibles = lieux.flatMap((lieu) => {
        const sourceDomaine = domaine(lieu.sourceUrl);
        return sourceDomaine === undefined ? [] : [{ lieu, sourceDomaine }];
      });
      if (lisibles.length === 0) return { ok: true, valeur: new Map() };
      const issue = await ia.rediger({
        entree: entreeModelesDeVille(brief, ville),
        lieux: lisibles.map(({ lieu, sourceDomaine }, rang) => ({
          id: identifiantModele(rang),
          nom: lieu.nom,
          resume: lieu.resume,
          categorie: lieu.categorie,
          typeEtape: lieu.typeEtape,
          sourceDomaine,
        })),
      });
      if (!issue.ok) return echecDeCode(issue.code, issue.retryable);
      const raisons = new Map<string, { raison: string; detour: string }>();
      lisibles.forEach(({ lieu }, rang) => {
        const lue = issue.valeur.raisons.get(identifiantModele(rang));
        if (lue !== undefined) raisons.set(lieu.id, { raison: lue.raison, detour: lue.detour });
      });
      return { ok: true, valeur: raisons };
    },
  };
}

/**
 * Famille `programme()` (décision 0136 § 1.4 ; verdict 0139 § 1.1 et § 5.2) : la rédaction par `creerRedigerProgramme`
 * (**réutilisée**, `zdr: true` et `data_collection: "deny"` imposés), la lecture tolérante (`lireProgramme`, `ordreEcrit`,
 * `lieuxDuProgramme`), l'ancrage des logements et la vérification des lieux (`ancrerLogementsDuSejour`,
 * `verifierLieuxDuProgramme`), tels que `p0Run` les appelle. État en mémoire de la capacité (une par étape) : la zone du
 * séjour et le dernier programme lu, jamais rendus.
 */
function capaciteProgramme(places: ClientsPlaces, modeles: ClientModeles, sites: VerificateurDesSites): CapaciteProgramme {
  const ancrage = capacitesAncrage(places);
  const rediger = creerRedigerProgramme(modeles, CONFIGURATION_IA.programme);
  let zone: RectangleZone | undefined;
  let lu: ProgrammeIa | undefined;
  // Positions lues d'une fiche Google de cette étape (logements ancrés, lieux vérifiés), en mémoire ; marquées pour l'écriture
  // au cache par `positionsFraiches` (`@/grounding/fiches`) au moment d'écrire, et seules celles de la version publiée.
  const positions = new Map<string, { readonly lat: number; readonly lng: number }>();
  const retenir = (placeId: string, position: { readonly lat: number; readonly lng: number }) => {
    if (!positions.has(placeId)) positions.set(placeId, { lat: position.lat, lng: position.lng });
  };
  return {
    async logements(brief) {
      // L'étape passe le `BriefEssai` entier, forme structurelle de `Brief` (`src/prototype/brief.ts`), que ce pont n'importe pas.
      const issue = await ancrerLogementsDuSejour(brief as Parameters<typeof ancrerLogementsDuSejour>[0], { detailsLogement: ancrage.detailsLogement });
      zone = issue.zone;
      for (const logement of issue.logements) retenir(logement.placeId, logement.position);
      return issue.logements.map((logement) => logement.placeId);
    },
    async rediger(entree, sejour) {
      const reponse = await rediger(entree as Parameters<typeof rediger>[0]);
      const lecture = lireProgramme(reponse.texte, sejour);
      lu = lecture.valeur === null ? undefined : ordreEcrit(lecture.valeur);
      return {
        programme: lu === undefined ? null : { jours: lu.jours, bonsPlans: lu.bonsPlans },
        joursRetires: lecture.joursRetires,
        creneauxRetires: lecture.creneauxRetires,
        champsRetires: lecture.champsRetires,
        textesCoupes: lecture.textesCoupes,
        ...(reponse.fin === undefined ? {} : { fin: reponse.fin }),
        ...(reponse.tokens === undefined ? {} : { tokens: { entree: reponse.tokens.entree, sortie: reponse.tokens.sortie } }),
      };
    },
    lieux(destination) {
      if (lu === undefined) throw new RangeError("programme : aucun programme rédigé");
      const { lieux, cleDe } = lieuxDuProgramme(lu, destination);
      return {
        nombre: lieux.length,
        async verifier(controle) {
          if (zone === undefined) throw new RangeError("programme : logements non ancrés");
          const issue = await verifierLieuxDuProgramme(lieux, destination, { textSearch: ancrage.textSearch, places }, zone, controle);
          for (const fiche of issue.fiches.values()) retenir(fiche.placeId, fiche.position);
          return {
            placeIdDe: (jour, rang) => {
              const cle = cleDe(jour, rang);
              return cle === undefined ? undefined : issue.fiches.get(cle)?.placeId;
            },
            positions: {
              ecrire: (executeur, publies, obtenuesA, creerPort) =>
                ecrirePositionsAbsentes(
                  executeur,
                  positionsFraiches([...positions].filter(([placeId]) => publies.has(placeId)).map(([placeId, position]) => ({ issue: "chargee" as const, placeId, position }))),
                  obtenuesA,
                  creerPort,
                ),
            },
          };
        },
      };
    },
    sites,
  };
}

/** Vérificateur de sites de la variante simulée : barrière fermée, aucune adresse soumise, ni résolution ni connexion (0139 § 4.2). */
const SITES_SIMULES: VerificateurDesSites = { barriereFermee: true, verifier: async () => ({ ok: false }) };

// --- Variante simulée --------------------------------------------------------------------------------------------------

export type OptionsSimulee = {
  /** Doubles de test (journal de prompts, sentinelles, compteurs), neufs à chaque étape ; absents : fixtures d'Édimbourg (`fixtures-simulees.ts`, `import()` dynamique, décision 0105 § 2). */
  readonly doubles?: () => DoublesGeneration;
  /** Déclarations de déploiement (`VADROUILLE_ENV`, `VERCEL_ENV`) que le chargeur de fixtures vérifie ; requises sans `doubles`. */
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** Destination du voyage : choisit le jeu de fixtures (liste fermée de `fixtures-simulees.ts`, décision 0136 § 9) ; absente : Édimbourg. */
  readonly destination?: string;
  readonly traces?: TracesIa;
};

export async function composerSimulee(options: OptionsSimulee = {}): Promise<FabriqueGeneration> {
  // Seul point d'entrée vers le module de fixtures (`import()` dynamique d'un fichier de `src/`, décision 0105 § 2 point 1).
  const doubles = options.doubles ?? (await (await import("@/server/composition/fixtures-simulees")).chargerDoubles(options.env ?? {}, options.destination));
  return composerSimuleeAvec({ doubles, ...(options.traces === undefined ? {} : { traces: options.traces }) });
}

/** Composition simulée sur des doubles déjà construits (synchrone) ; `composerSimulee` y ajoute le chargement des fixtures. */
export function composerSimuleeAvec(options: { readonly doubles: () => DoublesGeneration; readonly traces?: TracesIa }): FabriqueGeneration {
  const doubles = options.doubles;
  const reglages = CONFIGURATION_IA.reglages;
  return {
    variante: "simulee",
    logement: (o) => capaciteLogement(googleSimule(doubles(), o).places),
    recherche: (o) => {
      const d = doubles();
      const modeles = modelesSousPlafond(d.modeles, o);
      return capaciteRecherche(modeles, rechercheWebSousPlafond(d.rechercheWeb, o), d.lecteur, o.horloge ?? horlogeSysteme, options.traces);
    },
    ancrage: (o) => capaciteAncrage(googleSimule(doubles(), o).places),
    notation: (o) => capaciteNotation(creerCoucheIa({ modeles: modelesSousPlafond(doubles().modeles, o), reglages, ...(options.traces === undefined ? {} : { traces: options.traces }) })),
    finale: (o) => {
      const d = doubles();
      const ia = creerCoucheIa({ modeles: modelesSousPlafond(d.modeles, o), reglages, ...(options.traces === undefined ? {} : { traces: options.traces }) });
      const google = googleSimule(d, o);
      return capaciteFinale(google.places, google.routes, ia, o.forfait);
    },
    programme: (o) => {
      const d = doubles();
      // Délai de la requête `programme` (300 s, 0116 § 2.3) ; coût estimé réservé avant l'appel, remplacé par le coût réel.
      return capaciteProgramme(googleSimule(d, o).places, modelesSousPlafond(d.modeles, o, DELAI_REQUETE_MS.openrouterProgramme), SITES_SIMULES);
    },
  };
}

// --- Variante réelle ---------------------------------------------------------------------------------------------------

export type OptionsReelle = { readonly traces?: TracesIa };

export function composerReelle(options: OptionsReelle = {}): FabriqueGeneration {
  const reglages = CONFIGURATION_IA.reglages;
  const clientsGoogle = (o: OptionsEtape) => {
    const horloge = o.horloge ?? horlogeSysteme;
    return googleAvecEcheance(creerClientsGoogle({ usage: o.usage, contexte: contexteDe(o, "google", horloge), plafonds: o.plafonds, horloge }), o);
  };
  const clientModeles = (o: OptionsEtape) => {
    const horloge = o.horloge ?? horlogeSysteme;
    return createOpenRouterClient({
      usage: o.usage,
      contexte: contexteDe(o, "modeles", horloge),
      plafonds: o.plafonds,
      coutEstimeMicros: COUTS_ESTIMES_MICROS.requeteModele,
      coutEstimeRechercheWebMicros: COUTS_ESTIMES_MICROS.rechercheWeb,
      horloge,
    });
  };
  const ia = (o: OptionsEtape) => {
    const client = clientModeles(o);
    return creerCoucheIa({ modeles: { envoyer: (requete) => client.envoyer(requete) }, reglages, ...(options.traces === undefined ? {} : { traces: options.traces }) });
  };
  return {
    variante: "reelle",
    logement: (o) => capaciteLogement(clientsGoogle(o).places),
    recherche: (o) => {
      const client = clientModeles(o);
      const { rechercheWeb } = CONFIGURATION_IA;
      const web = creerRechercheWebReelle(client.rechercherWeb, {
        modele: rechercheWeb.modele,
        moteur: rechercheWeb.moteur as Parameters<typeof creerRechercheWebReelle>[1]["moteur"],
        maxResultats: 10,
        routage: rechercheWeb.routage,
      });
      return capaciteRecherche({ envoyer: (requete) => client.envoyer(requete) }, web, creerLecteurPages(createUndiciTransport()), o.horloge ?? horlogeSysteme, options.traces);
    },
    ancrage: (o) => capaciteAncrage(clientsGoogle(o).places),
    notation: (o) => capaciteNotation(ia(o)),
    finale: (o) => {
      const google = clientsGoogle(o);
      return capaciteFinale(google.places, google.routes, ia(o), o.forfait);
    },
    // Variante réelle : jamais construite tant que la barrière est fermée et que la question 9 n'est pas répondue
    // (`ECRITURE_PROGRAMMES_REELS_AUTORISEE`) ; la vérification des sites part sur le transport réel, derrière sa barrière
    // de sortie (0122 § 1 condition 11, amendée par 0139 § 4.2).
    programme: (o) => {
      const client = clientModeles(o);
      return capaciteProgramme(clientsGoogle(o).places, { envoyer: (requete) => client.envoyer(requete) }, creerVerificateurStatut(createUndiciTransport()));
    },
  };
}

/** Âge maximal d'une source pour le classement de l'aperçu (celui du profil `apercu` de la configuration de l'IA). */
export const AGE_SOURCE_MAX_JOURS_APERCU: number = CONFIGURATION_IA.profils.apercu.ageSourceMaxJours;
