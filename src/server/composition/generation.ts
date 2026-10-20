import "server-only";

import type { ClientModeles, RequeteModele } from "@/ai/client";
import { usdEnMicros } from "@/ai/client";
import { creerCoucheIa, type CoucheIa } from "@/ai/couche";
import type { EntreeModeles } from "@/ai/entrees";
import { ErreurOpenRouter, createOpenRouterClient } from "@/ai/openrouter-client";
import type { ClientRechercheWeb } from "@/ai/recherche-web";
import { creerRechercheWebReelle } from "@/ai/recherche-web-reelle";
import { creerModelesSimules, FixturesModelesSchema } from "@/ai/modeles.simule";
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
import { creerPlacesSimule, FixturesPlacesSchema } from "@/grounding/places.simule";
import { creerRoutesSimule, FixturesRoutesSchema } from "@/grounding/routes.simule";
import { capturer, valeurOuEchec, type ResultatAncrage } from "@/grounding/resultat";
import { creerLecteurPages, type LecteurPages } from "@/research/fetch-page";
import { creerHttpSimule, creerResolveurSimule, FixturesPagesSchema } from "@/research/pages.simule";
import { creerRecherche, type ConfigurationRecherche } from "@/research/recherche";
import { creerRechercheSimulee, FixturesRechercheSchema } from "@/research/recherche-web.simule";
import { versLignes, type LignesCandidat } from "@/research/candidat-trouve";
import { classerSource } from "@/research/sources";
import { createUndiciTransport } from "@/research/undici-transport";
import { creerClientsGoogle } from "@/server/composition/clients-google";
import { CONFIGURATION_IA } from "@/server/config/ia";
import { COUTS_ESTIMES_MICROS, MARGE_FICHES } from "@/server/config/generation";
import { preparerPlanification } from "@/server/relecture/planification";
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

import fixturesModeles from "../../../prototype/fixtures/modeles/edimbourg.json";
import fixturesPages from "../../../prototype/fixtures/pages/edimbourg.json";
import fixturesPlaces from "../../../prototype/fixtures/places/edimbourg.json";
import fixturesRecherche from "../../../prototype/fixtures/recherche/edimbourg.json";
import fixturesRoutes from "../../../prototype/fixtures/routes/edimbourg.json";

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
 *   `simulee` (doubles sur les fixtures d'Édimbourg de `prototype/fixtures/`, les seules en local et en CI). Les doubles
 *   sont enveloppés dans la même réservation que les clients réels (`avecReservation`) : un plafond ou un quota agit de la
 *   même façon dans les deux variantes. Le choix de la variante est celui de la barrière (`generation/barriere.ts`).
 * - Aucun appel à `ecrire` (port d'écriture des positions) : condition (a) de 0060 non remplie, B8c absente
 *   (test `coordonnées: aucune écriture sans B8c`).
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

export type LieuARedige = CandidatANoter & { readonly sourceUrl: string };

export type EntreePlanifier = {
  readonly jours: readonly JourSquelette[];
  readonly nuitsVille: readonly number[];
  readonly villes: readonly { readonly rang: number; readonly nom: string; readonly logement: LogementVille }[];
  readonly candidats: readonly (CandidatMoteur & { readonly ville: number })[];
  readonly modes: readonly MobilityMode[];
  readonly classement: ParametresClassement;
  readonly configuration: ConfigurationMoteur;
};

export type SortiePlanifier = { readonly candidats: readonly CandidatMoteur[]; readonly relectures: Relectures };

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
  readonly skus: PlafondsUsage["skus"];
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

function domaine(url: string): string {
  return new URL(url).hostname;
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

/** Doubles sur les fixtures d'Édimbourg de `prototype/fixtures/` (valeurs sentinelles, aucune réponse réelle enregistrée). */
export function doublesEdimbourg(): DoublesGeneration {
  const pages = FixturesPagesSchema.parse(fixturesPages);
  return {
    modeles: creerModelesSimules(FixturesModelesSchema.parse(fixturesModeles)),
    rechercheWeb: creerRechercheSimulee(FixturesRechercheSchema.parse(fixturesRecherche)),
    lecteur: creerLecteurPages({ resoudre: creerResolveurSimule(pages.dns), http: creerHttpSimule(pages.pages) }),
    places: creerPlacesSimule(FixturesPlacesSchema.parse(fixturesPlaces)),
    routes: creerRoutesSimule(FixturesRoutesSchema.parse(fixturesRoutes)),
  };
}

/** SKU des fiches de position et d'identifiant (table de prix) : valeurs des clients réels, copiées (module de capacité non importé). */
const SKU_POSITION = "places_details_essentials";
const SKU_IDENTIFIANT = "places_details_essentials_ids_only";
const COUT_ESTIME_MICROS = { textSearch: 0, details: 20_000, position: 5_000, identifiant: 0, element: 5 } as const;

function contexteDe(options: OptionsEtape, fournisseur: Fournisseur, horloge: Horloge): () => ContexteAppel {
  return () => ({ nature: "execution", executionId: options.executionId, periodes: periodesDe(fournisseur, horloge) });
}

/**
 * Réservation d'un appel de double, comme celle d'un client réel : refus du port ou du registre → l'erreur fermée du
 * client (aucun appel du double), délai → `upstream_timeout`, erreur du double → `upstream_error`.
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
  if (options.echeance !== undefined && horloge.maintenant() + delai > options.echeance) throw erreur("cap_reached");
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

function placesSousPlafond(base: ClientPlacesMvp, options: OptionsEtape): ClientPlacesMvp {
  const unite = { requetes: 1, elements: 0 } as const;
  const sans = <T>(valeur: T) => ({ valeur, coutReelMicros: null });
  const google = <T>(methode: "places_text_search" | "places_details", sku: string, cout: number, operation: () => Promise<T>) =>
    sousReservation(options, "google", { fournisseur: "google", methode, sku, unites: unite, coutEstimeMicros: cout }, DELAI_REQUETE_MS.places, erreurGoogle, async () => sans(await operation()));
  return {
    textSearch: (requete) => google("places_text_search", options.skus.textSearch, COUT_ESTIME_MICROS.textSearch, () => base.textSearch(requete)),
    details: (placeId) => google("places_details", options.skus.details, COUT_ESTIME_MICROS.details, () => base.details(placeId)),
    position: (placeId) => google("places_details", SKU_POSITION, COUT_ESTIME_MICROS.position, () => base.position(placeId)),
    identifiant: (placeId) => google("places_details", SKU_IDENTIFIANT, COUT_ESTIME_MICROS.identifiant, () => base.identifiant(placeId)),
  };
}

function routesSousPlafond(base: ClientRoutes, options: OptionsEtape): ClientRoutes {
  return {
    matrice: (requete) => {
      const elements = requete.origines.length * requete.destinations.length;
      return sousReservation(
        options,
        "google",
        { fournisseur: "google", methode: "routes_matrix", sku: options.skus.matrice, unites: { requetes: 1, elements }, coutEstimeMicros: elements * COUT_ESTIME_MICROS.element },
        DELAI_REQUETE_MS.routes,
        erreurGoogle,
        async () => ({ valeur: await base.matrice(requete), coutReelMicros: null }),
      );
    },
  };
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
      return depuisAncrage(issue);
    },
    async rediger(brief, ville, lieux) {
      const issue = await ia.rediger({
        entree: entreeModelesDeVille(brief, ville),
        lieux: lieux.map((lieu, rang) => ({
          id: identifiantModele(rang),
          nom: lieu.nom,
          resume: lieu.resume,
          categorie: lieu.categorie,
          typeEtape: lieu.typeEtape,
          sourceDomaine: domaine(lieu.sourceUrl),
        })),
      });
      if (!issue.ok) return echecDeCode(issue.code, issue.retryable);
      const raisons = new Map<string, { raison: string; detour: string }>();
      lieux.forEach((lieu, rang) => {
        const lue = issue.valeur.raisons.get(identifiantModele(rang));
        if (lue !== undefined) raisons.set(lieu.id, { raison: lue.raison, detour: lue.detour });
      });
      return { ok: true, valeur: raisons };
    },
  };
}

// --- Variante simulée --------------------------------------------------------------------------------------------------

export type OptionsSimulee = {
  /** Doubles de test (journal de prompts, sentinelles, compteurs) ; les fixtures d'Édimbourg par défaut, neufs à chaque étape. */
  readonly doubles?: () => DoublesGeneration;
  readonly traces?: TracesIa;
};

export function composerSimulee(options: OptionsSimulee = {}): FabriqueGeneration {
  const doubles = options.doubles ?? doublesEdimbourg;
  const reglages = CONFIGURATION_IA.reglages;
  return {
    variante: "simulee",
    logement: (o) => capaciteLogement(placesSousPlafond(doubles().places, o)),
    recherche: (o) => {
      const d = doubles();
      const modeles = modelesSousPlafond(d.modeles, o);
      return capaciteRecherche(modeles, rechercheWebSousPlafond(d.rechercheWeb, o), d.lecteur, o.horloge ?? horlogeSysteme, options.traces);
    },
    ancrage: (o) => capaciteAncrage(placesSousPlafond(doubles().places, o)),
    notation: (o) => capaciteNotation(creerCoucheIa({ modeles: modelesSousPlafond(doubles().modeles, o), reglages, ...(options.traces === undefined ? {} : { traces: options.traces }) })),
    finale: (o) => {
      const d = doubles();
      const ia = creerCoucheIa({ modeles: modelesSousPlafond(d.modeles, o), reglages, ...(options.traces === undefined ? {} : { traces: options.traces }) });
      return capaciteFinale(placesSousPlafond(d.places, o), routesSousPlafond(d.routes, o), ia, o.forfait);
    },
  };
}

// --- Variante réelle ---------------------------------------------------------------------------------------------------

export type OptionsReelle = { readonly traces?: TracesIa };

export function composerReelle(options: OptionsReelle = {}): FabriqueGeneration {
  const reglages = CONFIGURATION_IA.reglages;
  const clientsGoogle = (o: OptionsEtape) => {
    const horloge = o.horloge ?? horlogeSysteme;
    return creerClientsGoogle({ usage: o.usage, contexte: contexteDe(o, "google", horloge), plafonds: o.plafonds, horloge });
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
