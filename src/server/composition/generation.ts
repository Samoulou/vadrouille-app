import "server-only";

import type { ClientModeles, RequeteModele } from "@/ai/client";
import { usdEnMicros } from "@/ai/client";
import { creerCoucheIa, type CoucheIa } from "@/ai/couche";
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
import { capturer, valeurOuEchec, type ResultatAncrage } from "@/grounding/resultat";
import { creerLecteurPages, type LecteurPages } from "@/research/fetch-page";
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
 *   rédaction des raisons : jamais la recherche web ni les pages).
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
  rechercher(brief: Brief, ville: VilleApercu, dejaTrouves: readonly string[], fuseau: string): Promise<ResultatCapacite<{ readonly lignes: readonly LignesRecherche[]; readonly bilan: BilanRecherche }>>;
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

function modelesSousPlafond(base: ClientModeles, options: OptionsEtape): ClientModeles {
  return {
    envoyer: (requete: RequeteModele) =>
      sousReservation(
        options,
        "modeles",
        { fournisseur: "modeles", methode: "chat", sku: requete.modele, unites: { requetes: 1, elements: 0 }, coutEstimeMicros: COUTS_ESTIMES_MICROS.requeteModele },
        DELAI_REQUETE_MS.openrouter,
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
    async rechercher(brief, ville, dejaTrouves, fuseau) {
      const issue = await recherche.rechercher({ entree: entreeModelesDeVille(brief, ville), ...(dejaTrouves.length === 0 ? {} : { dejaTrouves: [...dejaTrouves] }) }, "apercu");
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
            fiches: Math.max(0, forfait.placeDetailsRequetes - entree.villes.length),
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
              ecrirePositionsAbsentes(executeur, new Map([...positions].filter(([placeId]) => publies.has(placeId))), obtenuesA, creerPort),
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

// --- Variante simulée --------------------------------------------------------------------------------------------------

export type OptionsSimulee = {
  /** Doubles de test (journal de prompts, sentinelles, compteurs), neufs à chaque étape ; absents : fixtures d'Édimbourg (`fixtures-simulees.ts`, `import()` dynamique, décision 0105 § 2). */
  readonly doubles?: () => DoublesGeneration;
  /** Déclarations de déploiement (`VADROUILLE_ENV`, `VERCEL_ENV`) que le chargeur de fixtures vérifie ; requises sans `doubles`. */
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly traces?: TracesIa;
};

export async function composerSimulee(options: OptionsSimulee = {}): Promise<FabriqueGeneration> {
  // Seul point d'entrée vers le module de fixtures (`import()` dynamique d'un fichier de `src/`, décision 0105 § 2 point 1).
  const doubles = options.doubles ?? (await (await import("@/server/composition/fixtures-simulees")).chargerDoublesEdimbourg(options.env ?? {}));
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
  };
}

/** Âge maximal d'une source pour le classement de l'aperçu (celui du profil `apercu` de la configuration de l'IA). */
export const AGE_SOURCE_MAX_JOURS_APERCU: number = CONFIGURATION_IA.profils.apercu.ageSourceMaxJours;
