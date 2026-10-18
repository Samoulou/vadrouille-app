import {
  DayMapSchema,
  DaySchema,
  DETOUR_THRESHOLD_MINUTES,
  ProposalSchema,
  TRIP_ID_PATTERN,
  TripSchema,
  TripSummarySchema,
  countToReserve,
  type Day,
  type DayLineItem,
  type DayMap,
  type MapPoint,
  type Proposal,
  type Segment,
  type Trip,
  type TripSummary,
} from "@/contracts";
import {
  cleTrajet,
  pairesDuProgramme,
  type JourReduit,
  type ModeTrajet as ModeTrajetReduit,
  type PaireTrajet,
  type ProgrammeEcrit,
  type ProgrammeReduit,
} from "@/prototype/programme-reduit";

import type { AdapterContext, TripAdapter } from "./types";

/**
 * Adaptateur `prototype` (spécification P0, « Comportement de P0b » ; décision 0032 § A4 et § A6).
 *
 * Il sert un programme de la **forme réduite** (`src/prototype/programme-reduit.ts`, propriété de P0a1) dans les
 * écrans existants : il lit les positions dans le programme (table `positions`), prend les **temps de trajet
 * conservés** du programme (décision 0092 § 4 : programmes réels écrits par `p0Run` après la migration), **relit** à
 * chaque appel les seules paires qui n'y sont pas (une requête par journée, aucune si toutes sont conservées),
 * recompose les clés absentes de la forme réduite (`Segment.minutes`, `Day.travelMinutes`, `travelFromPrevious.minutes`,
 * `detour` selon le seuil), puis valide chaque sortie par son contrat (`TripSchema`, `DaySchema`, `ProposalSchema`,
 * `DayMapSchema`). Les paires viennent toutes de `pairesDuProgramme` (aucune seconde liste).
 *
 * Aucune durée relue n'est gardée : ni fichier, ni cache de module, ni cache partagé entre requêtes, ni écriture en
 * base (seule l'étape finale de `p0Run` écrit les temps, 0092 § 1 point 6). Une relecture refusée ou en échec (quota
 * atteint, service indisponible, réponse invalide, relecteur qui lève) **n'empêche pas l'affichage** (0092 § 4) : les
 * temps conservés restent, un trajet non relu s'affiche sans durée (`minutes: null`), la journée sans total
 * (`travelMinutes: null`), une proposition sans trajet relu perd `travelFromPrevious` et `detour` ; jamais une durée
 * inventée. Un lieu manquant (programme hors forme) reste une erreur (`missing_place`, état d'erreur existant).
 * Programmes et relecteur sont **injectés** ; dans
 * P0b1, seul un relecteur simulé existe (`src/mocks/prototype-relecteur.ts`). Programmes réels lus en base, recomposés
 * avec leurs positions, et relecteur Routes réel (P0r4, décisions 0074 et 0079) : `createPrototypeAdapterReel`.
 */

/** Mode de déplacement d'un segment. */
export type ModeTrajet = Segment["mode"] & ModeTrajetReduit;

/** Trajet à relire entre deux lieux, désignés par leur seul identifiant de lieu (`PaireTrajet` de la forme réduite). */
export type PaireRelecture = PaireTrajet;

/**
 * Temps de trajet conservés d'un programme (décision 0092 § 4), en minutes entières, par clé `cleTrajet` (mode,
 * origine, destination). Vide pour un programme écrit avant la migration et pour les programmes de test.
 */
export type TrajetsConserves = ReadonlyMap<string, number>;

/** Raisons fermées d'une relecture refusée (aucun message de fournisseur n'est jamais repris). */
export const RAISONS_RELECTURE = ["quota_reached", "unavailable"] as const;
export type RaisonRelecture = (typeof RAISONS_RELECTURE)[number];

export type ReponseRelecture = { ok: true; minutes: number[] } | { ok: false; raison: RaisonRelecture };

/**
 * Relecteur des durées de trajet : une requête par journée affichée (matrice de Routes dans la spécification
 * suivante). `minutes` est rendu dans l'ordre des paires.
 */
export interface RelecteurTrajets {
  relireJournee(paires: readonly PaireRelecture[]): Promise<ReponseRelecture>;
}

/** Source des programmes : l'index du chargeur (`createProgrammeLoader`) ou un double de test. */
export interface SourceProgrammes {
  /** Identifiants indexés, triés. */
  ids(): Promise<string[]>;
  /** Programme validé par le schéma de la forme réduite, ou `null` (identifiant hors index, fichier refusé). */
  lire(tripId: string): Promise<ProgrammeReduit | null>;
}

export interface PrototypeAdapterOptions {
  programmes: SourceProgrammes;
  relecteurs: { trajets: RelecteurTrajets };
}

/**
 * Source des programmes **réels** : contenus lus en base et recomposés avec leurs positions (`ProgrammeReduitSchema`,
 * `src/adapters/prototype-lecture.ts`, décisions 0074 et 0079) ou double de test. « Mes voyages » lit tous les
 * programmes en une seule lecture (`lister`).
 */
export interface SourceProgrammesReels {
  /** Tous les programmes servables (positions comprises), en une lecture, triés par identifiant de voyage. */
  lister(): Promise<ProgrammeReelLu[]>;
  /**
   * Programme recomposé, ou `null` (identifiant inconnu, refusé ou en double) ; lève une erreur si une position manque
   * (programme non servi, état d'erreur existant).
   */
  lire(tripId: string): Promise<ProgrammeReelLu | null>;
}

/** Programme réel lu en base : recomposé avec ses positions, et ses temps conservés (0092 § 4). */
export interface ProgrammeReelLu {
  readonly programme: ProgrammeReduit;
  readonly trajets: TrajetsConserves;
}

/**
 * Programme tel que l'adaptateur le sert : contenu écrit, table de positions (carte Google seulement) et temps conservés
 * (ligne du jour seulement, jamais sur une carte, 0092 § 1 point 3).
 */
interface ProgrammeServi {
  readonly programme: ProgrammeEcrit;
  readonly positions: ProgrammeReduit["positions"];
  readonly trajets: TrajetsConserves;
}

const AUCUN_TRAJET: TrajetsConserves = new Map();

/** Erreur fermée d'une relecture : son message ne contient que le code, jamais un identifiant de lieu. */
export class RelectureError extends Error {
  readonly code: RaisonRelecture | "invalid_response" | "missing_place";
  constructor(code: RelectureError["code"]) {
    super(`relecture des trajets impossible : ${code}`);
    this.name = "RelectureError";
    this.code = code;
  }
}

function terminusDu(programme: ProgrammeEcrit, jour: number): ProgrammeEcrit["terminus"][number] {
  const terminus = programme.terminus.find((candidat) => candidat.jour === jour);
  // Le schéma de la forme réduite impose un terminus par jour (cas inatteignable avec un programme valide) : son
  // absence est un lieu manquant (état d'erreur et « Réessayer »).
  if (!terminus) throw new RelectureError("missing_place");
  return terminus;
}

/** Paire d'un trajet du programme ; lieu manquant : erreur fermée, jamais une paire devinée. */
function exiger(paire: PaireRelecture | null | undefined): PaireRelecture {
  if (!paire) throw new RelectureError("missing_place");
  return paire;
}

/**
 * Une requête de relecture, pour les seules paires demandées ; `null` si elle est refusée, échoue (le relecteur lève)
 * ou rend une réponse hors contrat (longueur, valeur) : aucune durée n'est alors rendue, jamais une durée corrigée ni
 * inventée (0092 § 4 point 3). Le journal `p0.read_unavailable` reste celui du relecteur réel.
 */
async function relire(relecteur: RelecteurTrajets, paires: readonly PaireRelecture[]): Promise<number[] | null> {
  if (paires.length === 0) return [];
  let reponse: ReponseRelecture;
  try {
    reponse = await relecteur.relireJournee(paires);
  } catch {
    return null;
  }
  if (!reponse.ok) return null;
  const { minutes } = reponse;
  if (
    !Array.isArray(minutes) ||
    minutes.length !== paires.length ||
    minutes.some((valeur) => typeof valeur !== "number" || !Number.isInteger(valeur) || valeur < 0)
  ) {
    return null;
  }
  return minutes;
}

/**
 * Durées des paires, dans leur ordre : la valeur conservée si elle existe, sinon la valeur relue ; le relecteur n'est
 * appelé que pour les paires absentes des temps conservés (aucun appel si toutes y sont). `null` : durée indisponible.
 */
async function durees(paires: readonly PaireRelecture[], trajets: TrajetsConserves, relecteur: RelecteurTrajets): Promise<(number | null)[]> {
  const conservees = paires.map((paire) => trajets.get(cleTrajet(paire)));
  const manquantes = paires.filter((_, rang) => conservees[rang] === undefined);
  const relues = await relire(relecteur, manquantes);
  let suivante = 0;
  return conservees.map((valeur) => {
    if (valeur !== undefined) return valeur;
    const relue = relues?.[suivante];
    suivante += 1;
    return relue ?? null;
  });
}

/**
 * Recompose une journée : durées conservées ou relues (`estimated: false`), `null` pour une durée indisponible ;
 * `travelMinutes` = somme des segments, `null` s'il manque une durée (le total n'est pas affiché).
 */
async function recomposerJour({ programme, trajets }: ProgrammeServi, jour: JourReduit, relecteur: RelecteurTrajets): Promise<Day> {
  terminusDu(programme, jour.index);
  const paires = (pairesDuProgramme(programme).jours.get(jour.index) ?? []).map(exiger);
  const minutes = await durees(paires, trajets, relecteur);
  let suivant = 0;
  const items: DayLineItem[] = jour.items.map((ligne) => {
    if (ligne.type !== "segment") return ligne;
    const valeur = minutes[suivant] ?? null;
    suivant += 1;
    return { type: "segment", segment: { mode: ligne.segment.mode, minutes: valeur, estimated: false } };
  });
  const travelMinutes = minutes.every((valeur) => valeur !== null) ? minutes.reduce<number>((total, valeur) => total + valeur, 0) : null;
  // `weekday` de la forme réduite n'est plus un champ de `Day` : l'interface le calcule depuis la date (B2, E1).
  const reste: Partial<typeof jour> = { ...jour };
  delete reste.weekday;
  return DaySchema.parse({ ...reste, items, travelMinutes });
}

/**
 * Recompose les propositions : durées conservées, sinon une requête de relecture par journée concernée pour les seules
 * paires manquantes ; `detour` gardé au-delà du seuil. Sans durée (indisponible), la proposition perd
 * `travelFromPrevious` et `detour`.
 */
async function recomposerPropositions({ programme, trajets }: ProgrammeServi, relecteur: RelecteurTrajets): Promise<Proposal[]> {
  const paires = pairesDuProgramme(programme).propositions;
  const relues = new Map<number, number>();
  const jours = [...new Set(programme.proposals.filter((p) => p.travelFromPrevious).map((p) => p.day))];
  for (const jour of jours) {
    const concernees = programme.proposals
      .map((proposition, index) => ({ proposition, index }))
      .filter(({ proposition }) => proposition.day === jour && proposition.travelFromPrevious);
    const minutes = await durees(
      concernees.map(({ index }) => exiger(paires.get(index))),
      trajets,
      relecteur,
    );
    concernees.forEach(({ index }, rang) => {
      const valeur = minutes[rang];
      if (typeof valeur === "number") relues.set(index, valeur);
    });
  }
  return programme.proposals.map((proposition, index) => {
    const { travelFromPrevious, detour, ...reste } = proposition;
    const minutes = relues.get(index);
    const recomposee = {
      ...reste,
      // Voisins calculés par le moteur à la lecture (B5, décision 0037 B2-TL-1) ; sans lui, aucun voisin : aucune
      // ligne de contexte n'est affichée, rien n'est inventé (B2, E2).
      neighbours: {},
      ...(travelFromPrevious && minutes !== undefined
        ? { travelFromPrevious: { mode: travelFromPrevious.mode, minutes, estimated: false } }
        : {}),
      // La justification n'est montrée que pour un trajet au-delà du seuil (spécification, « Proposal.detour »).
      ...(minutes !== undefined && minutes > DETOUR_THRESHOLD_MINUTES ? { detour } : {}),
    };
    return ProposalSchema.parse(recomposee);
  });
}

/** Positions d'un jour, lues dans la table `positions` du programme ; `null` sans aucune position. */
function carteDuJour({ programme, positions: table }: ProgrammeServi, jour: JourReduit): DayMap | null {
  const terminus = terminusDu(programme, jour.index);
  const position = (placeId: string | undefined) =>
    placeId !== undefined && Object.hasOwn(table, placeId) ? table[placeId] : undefined;
  const points: MapPoint[] = [];
  const vus = new Set<string>();
  for (const ligne of jour.items) {
    if (ligne.type === "terminus") {
      const cle = `terminus:${ligne.role}`;
      const coordonnees = position(ligne.role === "start" ? terminus.depart : terminus.arrivee);
      if (coordonnees && !vus.has(cle)) {
        vus.add(cle);
        points.push({ ref: { type: "terminus", role: ligne.role }, lat: coordonnees.lat, lng: coordonnees.lng });
      }
    } else if (ligne.type === "stop") {
      const cle = `stop:${ligne.stop.id}`;
      const coordonnees = position(ligne.stop.placeId);
      if (coordonnees && !vus.has(cle)) {
        vus.add(cle);
        points.push({ ref: { type: "stop", stopId: ligne.stop.id }, lat: coordonnees.lat, lng: coordonnees.lng });
      }
    }
  }
  if (points.length === 0) return null;
  return DayMapSchema.parse({ tripId: programme.trip.id, dayIndex: jour.index, points });
}

/** Résumé d'un voyage du prototype, sans relecture (aucune durée dans `TripSummary`). */
function resume(programme: ProgrammeEcrit): TripSummary {
  const { trip } = programme;
  return TripSummarySchema.parse({
    id: trip.id,
    destination: trip.destination,
    destinationColor: trip.destinationColor,
    start: trip.start,
    end: trip.end,
    timeZone: trip.timeZone,
    travellers: trip.travellers,
    unlocked: trip.unlocked,
    toReserveCount: countToReserve(trip.checklist),
    dayCount: trip.days.length,
  });
}

export function createPrototypeAdapter({ programmes, relecteurs }: PrototypeAdapterOptions): TripAdapter {
  return creerAdapter({
    async lister() {
      const servis: ProgrammeServi[] = [];
      for (const id of await programmes.ids()) {
        const programme = await programmes.lire(id);
        if (programme) servis.push({ programme, positions: programme.positions, trajets: AUCUN_TRAJET });
      }
      return servis;
    },
    async lire(tripId) {
      const programme = await programmes.lire(tripId);
      return programme ? { programme, positions: programme.positions, trajets: AUCUN_TRAJET } : null;
    },
    relecteur: relecteurs.trajets,
  });
}

/**
 * Adaptateur des programmes **réels** (P0r4, décisions 0074, 0079 et 0092) : programmes lus en base et recomposés avec
 * leurs positions (carte Google) et leurs temps conservés ; seules les paires sans temps conservé sont relues à chaque
 * affichage par le relecteur injecté (Routes réel, payant, réservé et plafonné : `src/server/p0/relecture.ts`). « Mes voyages » lit tous les programmes en une seule lecture (`lister`).
 */
export function createPrototypeAdapterReel({ programmes, relecteurs }: { programmes: SourceProgrammesReels; relecteurs: { trajets: RelecteurTrajets } }): TripAdapter {
  return creerAdapter({
    lister: async () => (await programmes.lister()).map(({ programme, trajets }) => ({ programme, positions: programme.positions, trajets })),
    async lire(tripId) {
      const lu = await programmes.lire(tripId);
      return lu ? { programme: lu.programme, positions: lu.programme.positions, trajets: lu.trajets } : null;
    },
    relecteur: relecteurs.trajets,
  });
}

interface SourceServie {
  lister(): Promise<ProgrammeServi[]>;
  lire(tripId: string): Promise<ProgrammeServi | null>;
  relecteur: RelecteurTrajets;
}

function creerAdapter({ lister, lire, relecteur }: SourceServie): TripAdapter {
  /** Programme de l'organisation du contexte ; `null` pour un identifiant mal formé, inconnu ou d'une autre organisation. */
  const trouver = async (ctx: AdapterContext, tripId: string): Promise<ProgrammeServi | null> => {
    if (typeof tripId !== "string" || !TRIP_ID_PATTERN.test(tripId)) return null;
    const servi = await lire(tripId);
    if (!servi || servi.programme.trip.organizationId !== ctx.organizationId) return null;
    return servi;
  };

  const voyage = async (servi: ProgrammeServi): Promise<Trip> => {
    const days: Day[] = [];
    // Une requête par journée (paires manquantes seulement), dans l'ordre : aucune durée relue n'est gardée.
    for (const jour of servi.programme.trip.days) days.push(await recomposerJour(servi, jour, relecteur));
    return TripSchema.parse({ ...servi.programme.trip, days });
  };

  return {
    async listTrips(ctx) {
      return (await lister())
        .filter(({ programme }) => programme.trip.organizationId === ctx.organizationId)
        .map(({ programme }) => resume(programme));
    },
    async getTrip(ctx, tripId) {
      const servi = await trouver(ctx, tripId);
      return servi ? voyage(servi) : null;
    },
    async getDay(ctx, tripId, index) {
      const servi = await trouver(ctx, tripId);
      const jour = servi?.programme.trip.days.find((candidat) => candidat.index === index);
      return servi && jour ? recomposerJour(servi, jour, relecteur) : null;
    },
    async listProposals(ctx, tripId) {
      const servi = await trouver(ctx, tripId);
      return servi ? recomposerPropositions(servi, relecteur) : [];
    },
    /**
     * Les voyages du prototype sont toujours débloqués (`unlocked: true`, forme réduite) : la présentation lit
     * `listProposals`, jamais l'aperçu. Liste vide (B2, évolution E7).
     */
    async listPreviewSlots() {
      return [];
    },
    async getDayMap(ctx, tripId, index) {
      const servi = await trouver(ctx, tripId);
      const jour = servi?.programme.trip.days.find((candidat) => candidat.index === index);
      return servi && jour ? carteDuJour(servi, jour) : null;
    },
    async getTripMap(ctx, tripId) {
      const servi = await trouver(ctx, tripId);
      if (!servi) return [];
      return servi.programme.trip.days.flatMap((jour) => {
        const carte = carteDuJour(servi, jour);
        return carte ? [carte] : [];
      });
    },
  };
}
