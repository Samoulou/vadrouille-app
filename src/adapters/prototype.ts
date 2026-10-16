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
import type { JourReduit, ProgrammeReduit, PropositionReduite } from "@/prototype/programme-reduit";

import type { AdapterContext, TripAdapter } from "./types";

/**
 * Adaptateur `prototype` (spécification P0, « Comportement de P0b » ; décision 0032 § A4 et § A6).
 *
 * Il sert un programme de la **forme réduite** (`src/prototype/programme-reduit.ts`, propriété de P0a1) dans les
 * écrans existants : il lit les positions dans le programme (table `positions`), **relit** les durées de trajet à
 * chaque appel (une requête par journée), recompose les clés absentes de la forme réduite (`Segment.minutes`,
 * `Day.travelMinutes`, `travelFromPrevious.minutes`, `detour` selon le seuil), puis valide chaque sortie par son
 * contrat (`TripSchema`, `DaySchema`, `ProposalSchema`, `DayMapSchema`).
 *
 * Aucune durée relue n'est gardée : ni fichier, ni cache de module, ni cache partagé entre requêtes. Une relecture
 * en échec (quota atteint, service indisponible, réponse invalide) lève une erreur : la page affiche l'état
 * d'erreur existant (« Réessayer »), jamais une durée inventée. Programmes et relecteur sont **injectés** ; dans
 * P0b1, seul un relecteur simulé existe (`src/mocks/prototype-relecteur.ts`). Sans relecteur (programmes réels lus en
 * base, décision 0074), aucune durée n'est servie : voir `PrototypeAdapterOptions`.
 */

/** Mode de déplacement d'un segment. */
export type ModeTrajet = Segment["mode"];

/** Trajet à relire entre deux lieux, désignés par leur seul identifiant de lieu. */
export interface PaireRelecture {
  origine: string;
  destination: string;
  mode: ModeTrajet;
}

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
  /**
   * `trajets: null` : **aucune relecture** (programmes réels lus en base sur la préversion de `p0-reel`, décision 0074).
   * Aucune durée n'est alors servie, ni inventée : les lignes de trajet sont retirées de la journée, `travelMinutes`
   * vaut 0 (l'interface n'affiche aucune durée pour une journée sans ligne de trajet), et les propositions n'ont ni
   * `travelFromPrevious` ni `detour`.
   */
  relecteurs: { trajets: RelecteurTrajets | null };
}

/** Erreur fermée d'une relecture : son message ne contient que le code, jamais un identifiant de lieu. */
export class RelectureError extends Error {
  readonly code: RaisonRelecture | "invalid_response" | "missing_place";
  constructor(code: RelectureError["code"]) {
    super(`relecture des trajets impossible : ${code}`);
    this.name = "RelectureError";
    this.code = code;
  }
}

type Ligne = JourReduit["items"][number];

/** Identifiant de lieu d'une ligne qui a une position (terminus, étape), `null` pour les autres lignes. */
function lieuDe(ligne: Ligne, terminus: ProgrammeReduit["terminus"][number]): string | undefined | null {
  if (ligne.type === "terminus") return ligne.role === "start" ? terminus.depart : terminus.arrivee;
  if (ligne.type === "stop") return ligne.stop.placeId;
  return null;
}

/** Lieu qui précède la ligne `index` (terminus ou étape), en remontant la journée ; `null` s'il n'y en a pas. */
function lieuAvant(jour: JourReduit, terminus: ProgrammeReduit["terminus"][number], index: number): string | undefined | null {
  for (let i = index - 1; i >= 0; i -= 1) {
    const lieu = lieuDe(jour.items[i]!, terminus);
    if (lieu !== null) return lieu;
  }
  return null;
}

function lieuApres(jour: JourReduit, terminus: ProgrammeReduit["terminus"][number], index: number): string | undefined | null {
  for (let i = index + 1; i < jour.items.length; i += 1) {
    const lieu = lieuDe(jour.items[i]!, terminus);
    if (lieu !== null) return lieu;
  }
  return null;
}

function paire(origine: string | undefined | null, destination: string | undefined | null, mode: ModeTrajet): PaireRelecture {
  if (!origine || !destination) throw new RelectureError("missing_place");
  return { origine, destination, mode };
}

function terminusDu(programme: ProgrammeReduit, jour: number): ProgrammeReduit["terminus"][number] {
  const terminus = programme.terminus.find((candidat) => candidat.jour === jour);
  // Le schéma de la forme réduite impose un terminus par jour (cas inatteignable avec un programme valide) : son
  // absence est un lieu manquant, traité comme toute relecture impossible (état d'erreur et « Réessayer »).
  if (!terminus) throw new RelectureError("missing_place");
  return terminus;
}

/** Une requête de relecture ; toute réponse hors contrat (longueur, valeur) est une erreur, jamais corrigée. */
async function relire(relecteur: RelecteurTrajets, paires: PaireRelecture[]): Promise<number[]> {
  if (paires.length === 0) return [];
  const reponse = await relecteur.relireJournee(paires);
  if (!reponse.ok) throw new RelectureError(reponse.raison);
  const { minutes } = reponse;
  if (
    !Array.isArray(minutes) ||
    minutes.length !== paires.length ||
    minutes.some((valeur) => typeof valeur !== "number" || !Number.isInteger(valeur) || valeur < 0)
  ) {
    throw new RelectureError("invalid_response");
  }
  return minutes;
}

/** Journée sans relecture (décision 0074) : lignes de trajet retirées, aucune durée, `travelMinutes` à 0. */
function jourSansTrajets(jour: JourReduit): Day {
  const items = jour.items.filter((ligne): ligne is Exclude<Ligne, { type: "segment" }> => ligne.type !== "segment");
  const reste: Partial<typeof jour> = { ...jour };
  delete reste.weekday;
  return DaySchema.parse({ ...reste, items, travelMinutes: 0 });
}

/** Recompose une journée : durées relues (`estimated: false`), `travelMinutes` = somme des segments relus. */
async function recomposerJour(programme: ProgrammeReduit, jour: JourReduit, relecteur: RelecteurTrajets | null): Promise<Day> {
  if (relecteur === null) return jourSansTrajets(jour);
  const terminus = terminusDu(programme, jour.index);
  const paires: PaireRelecture[] = [];
  jour.items.forEach((ligne, index) => {
    if (ligne.type === "segment") {
      paires.push(paire(lieuAvant(jour, terminus, index), lieuApres(jour, terminus, index), ligne.segment.mode));
    }
  });
  const minutes = await relire(relecteur, paires);
  let suivant = 0;
  const items: DayLineItem[] = jour.items.map((ligne) => {
    if (ligne.type !== "segment") return ligne;
    const relu = minutes[suivant]!;
    suivant += 1;
    return { type: "segment", segment: { mode: ligne.segment.mode, minutes: relu, estimated: false } };
  });
  const travelMinutes = minutes.reduce((total, valeur) => total + valeur, 0);
  // `weekday` de la forme réduite n'est plus un champ de `Day` : l'interface le calcule depuis la date (B2, E1).
  const reste: Partial<typeof jour> = { ...jour };
  delete reste.weekday;
  return DaySchema.parse({ ...reste, items, travelMinutes });
}

/**
 * Lieu de départ du trajet d'une proposition : le lieu qui précède son étape dans la journée, ou le logement de
 * départ du jour si l'étape n'est pas dans la ligne du jour (« depuis l'étape précédente (ou l'hôtel) »).
 */
function origineProposition(programme: ProgrammeReduit, proposition: PropositionReduite): string | undefined | null {
  const terminus = terminusDu(programme, proposition.day);
  const jour = programme.trip.days.find((candidat) => candidat.index === proposition.day);
  const index = jour?.items.findIndex((ligne) => ligne.type === "stop" && ligne.stop.id === proposition.stop.id) ?? -1;
  if (!jour || index < 0) return terminus.depart;
  return lieuAvant(jour, terminus, index);
}

/** Recompose les propositions : une requête de relecture par journée concernée, `detour` gardé au-delà du seuil. */
async function recomposerPropositions(programme: ProgrammeReduit, relecteur: RelecteurTrajets | null): Promise<Proposal[]> {
  const relues = new Map<number, number>();
  // Sans relecteur (décision 0074) : aucune durée relue, donc ni `travelFromPrevious` ni `detour` (seuil inconnu).
  if (relecteur !== null) {
    const jours = [...new Set(programme.proposals.filter((p) => p.travelFromPrevious).map((p) => p.day))];
    for (const jour of jours) {
      const concernees = programme.proposals
        .map((proposition, index) => ({ proposition, index }))
        .filter(({ proposition }) => proposition.day === jour && proposition.travelFromPrevious);
      const minutes = await relire(
        relecteur,
        concernees.map(({ proposition }) =>
          paire(origineProposition(programme, proposition), proposition.stop.placeId, proposition.travelFromPrevious!.mode),
        ),
      );
      concernees.forEach(({ index }, rang) => relues.set(index, minutes[rang]!));
    }
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
function carteDuJour(programme: ProgrammeReduit, jour: JourReduit): DayMap | null {
  const terminus = terminusDu(programme, jour.index);
  const position = (placeId: string | undefined) =>
    placeId !== undefined && Object.hasOwn(programme.positions, placeId) ? programme.positions[placeId] : undefined;
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
function resume(programme: ProgrammeReduit): TripSummary {
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
  const relecteur = relecteurs.trajets;

  /** Programme de l'organisation du contexte ; `null` pour un identifiant mal formé, inconnu ou d'une autre organisation. */
  const trouver = async (ctx: AdapterContext, tripId: string): Promise<ProgrammeReduit | null> => {
    if (typeof tripId !== "string" || !TRIP_ID_PATTERN.test(tripId)) return null;
    const programme = await programmes.lire(tripId);
    if (!programme || programme.trip.organizationId !== ctx.organizationId) return null;
    return programme;
  };

  const voyage = async (programme: ProgrammeReduit): Promise<Trip> => {
    const days: Day[] = [];
    // Une requête par journée, dans l'ordre : aucune durée n'est gardée d'un appel à l'autre.
    for (const jour of programme.trip.days) days.push(await recomposerJour(programme, jour, relecteur));
    return TripSchema.parse({ ...programme.trip, days });
  };

  return {
    async listTrips(ctx) {
      const resumes: TripSummary[] = [];
      for (const id of await programmes.ids()) {
        const programme = await trouver(ctx, id);
        if (programme) resumes.push(resume(programme));
      }
      return resumes;
    },
    async getTrip(ctx, tripId) {
      const programme = await trouver(ctx, tripId);
      return programme ? voyage(programme) : null;
    },
    async getDay(ctx, tripId, index) {
      const programme = await trouver(ctx, tripId);
      const jour = programme?.trip.days.find((candidat) => candidat.index === index);
      return programme && jour ? recomposerJour(programme, jour, relecteur) : null;
    },
    async listProposals(ctx, tripId) {
      const programme = await trouver(ctx, tripId);
      return programme ? recomposerPropositions(programme, relecteur) : [];
    },
    /**
     * Les voyages du prototype sont toujours débloqués (`unlocked: true`, forme réduite) : la présentation lit
     * `listProposals`, jamais l'aperçu. Liste vide (B2, évolution E7).
     */
    async listPreviewSlots() {
      return [];
    },
    async getDayMap(ctx, tripId, index) {
      const programme = await trouver(ctx, tripId);
      const jour = programme?.trip.days.find((candidat) => candidat.index === index);
      return programme && jour ? carteDuJour(programme, jour) : null;
    },
    async getTripMap(ctx, tripId) {
      const programme = await trouver(ctx, tripId);
      if (!programme) return [];
      return programme.trip.days.flatMap((jour) => {
        const carte = carteDuJour(programme, jour);
        return carte ? [carte] : [];
      });
    },
  };
}
