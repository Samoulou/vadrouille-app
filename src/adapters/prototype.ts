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
  type Trip,
  type TripSummary,
} from "@/contracts";
import {
  cleTrajet,
  minutesTrajetValides,
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
 * Aucune durée relue n'est gardée en mémoire : ni fichier, ni cache de module, ni cache partagé entre requêtes. Seule
 * exception (décision 0109) : les minutes d'une relecture **réussie** d'un programme réel sont rendues à la fonction
 * `conserver` que la source attache au programme lu (écriture côté serveur dans les temps conservés, sans écraser un
 * temps existant) ; l'adaptateur ne connaît ni la base ni l'identifiant du programme. Une relecture refusée ou en échec (quota
 * atteint, service indisponible, réponse invalide, relecteur qui lève) **n'empêche pas l'affichage** (0092 § 4) : les
 * temps conservés restent, un trajet non relu s'affiche sans durée (`minutes: null`), la journée sans total
 * (`travelMinutes: null`), une proposition sans trajet relu perd `travelFromPrevious` et `detour` ; jamais une durée
 * inventée. Un lieu manquant (programme hors forme) reste une erreur (`missing_place`, état d'erreur existant).
 * Programmes et relecteur sont **injectés** ; dans
 * P0b1, seul un relecteur simulé existe (`src/mocks/prototype-relecteur.ts`). Programmes réels lus en base, recomposés
 * avec leurs positions, et relecteur Routes réel (P0r4, décisions 0074 et 0079) : `createPrototypeAdapterReel`.
 */

/** Mode de déplacement d'un segment (égal à `Segment["mode"]`). */
export type ModeTrajet = ModeTrajetReduit;

/** Trajet à relire entre deux lieux, désignés par leur seul identifiant de lieu (`PaireTrajet` de la forme réduite). */
export type PaireRelecture = PaireTrajet;

/**
 * Temps de trajet conservés d'un programme (décision 0092 § 4), en minutes entières, par clé `cleTrajet` (mode,
 * origine, destination). Vide pour un programme écrit avant la migration et pour les programmes de test.
 */
export type TrajetsConserves = ReadonlyMap<string, number>;

/**
 * Conservation des temps relus d'un programme réel (décision 0109) : minutes entières par clé `cleTrajet`, des seules
 * paires relues avec succès. Attachée par la source au programme lu (absente : rien n'est conservé). Ne doit jamais
 * faire échouer la page : l'adaptateur ignore son échec.
 */
export type ConserverTrajets = (releves: ReadonlyMap<string, number>) => Promise<void>;

/** Raisons fermées d'une relecture refusée (aucun message de fournisseur n'est jamais repris). */
export const RAISONS_RELECTURE = ["quota_reached", "unavailable"] as const;
export type RaisonRelecture = (typeof RAISONS_RELECTURE)[number];

export type ReponseRelecture = { ok: true; minutes: number[] } | { ok: false; raison: RaisonRelecture };

/**
 * Réponse de la relecture des horaires d'une Journée (décision 0116 § 5.3, T8) : pour chaque `placeId` demandé, dans
 * l'ordre, `true` si l'étape doit porter le badge « à confirmer » (lieu fermé définitivement, ou fermé toute la journée
 * de la date). **Seul ce booléen sort** du relecteur : ni statut, ni horaire, ni plage (0011 § 5, 0117).
 */
export type ReponseHoraires = { ok: true; aConfirmer: boolean[] } | { ok: false; raison: RaisonRelecture };

/**
 * Relecteur des durées de trajet : une requête par journée affichée (matrice de Routes dans la spécification
 * suivante). `minutes` est rendu dans l'ordre des paires.
 *
 * `relireHoraires` (facultatif, décision 0116 § 5.3) : une fiche par `placeId` distinct des étapes du jour, sous la même
 * barrière et le même forfait de relecture que les trajets ; absent, refusé ou en échec : la page est rendue **sans
 * badge horaire** (jamais un badge inventé).
 */
export interface RelecteurTrajets {
  relireJournee(paires: readonly PaireRelecture[]): Promise<ReponseRelecture>;
  relireHoraires?(placeIds: readonly string[], date: string): Promise<ReponseHoraires>;
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
  /** Conservation des temps relus (décision 0109) ; absente : table absente, identifiant illisible ou double de test. */
  readonly conserver?: ConserverTrajets;
}

/**
 * Programme tel que l'adaptateur le sert : contenu écrit, table de positions (carte Google seulement) et temps conservés
 * (ligne du jour seulement, jamais sur une carte, 0092 § 1 point 3).
 */
interface ProgrammeServi {
  readonly programme: ProgrammeEcrit;
  readonly positions: ProgrammeReduit["positions"];
  readonly trajets: TrajetsConserves;
  readonly conserver?: ConserverTrajets;
}

const AUCUN_TRAJET: TrajetsConserves = new Map();

/**
 * Erreur fermée de la recomposition : son message ne contient que le code, jamais un identifiant de lieu. Seul code
 * levé : `missing_place` (programme hors forme). Un refus ou un échec de la relecture ne lève plus (0092 § 4 point 3) :
 * la page s'affiche sans les temps manquants.
 */
export class RelectureError extends Error {
  readonly code: "missing_place";
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
 * Temps relus avec succès rendus à `conserver` (décision 0109) : minutes entières entre 0 et 1 440 seulement (une
 * valeur hors bornes est affichée, jamais écrite) ; rien sans relecture réussie. Un échec n'empêche jamais l'affichage.
 */
async function conserverRelues(conserver: ConserverTrajets | undefined, manquantes: readonly PaireRelecture[], relues: readonly number[] | null): Promise<void> {
  if (conserver === undefined || relues === null) return;
  const releves = new Map<string, number>();
  manquantes.forEach((paire, rang) => {
    const minutes = relues[rang];
    if (minutesTrajetValides(minutes)) releves.set(cleTrajet(paire), minutes);
  });
  if (releves.size === 0) return;
  try {
    await conserver(releves);
  } catch {
    // Temps non conservé : la paire sera relue au prochain affichage ; la page est servie.
  }
}

/**
 * Durées des paires, dans leur ordre : la valeur conservée si elle existe, sinon la valeur relue ; le relecteur n'est
 * appelé que pour les paires absentes des temps conservés (aucun appel si toutes y sont). `null` : durée indisponible.
 * Les valeurs relues avec succès sont conservées (décision 0109) quand la source le permet.
 */
async function durees(paires: readonly PaireRelecture[], { trajets, conserver }: Pick<ProgrammeServi, "trajets" | "conserver">, relecteur: RelecteurTrajets): Promise<(number | null)[]> {
  const conservees = paires.map((paire) => trajets.get(cleTrajet(paire)));
  const manquantes = paires.filter((_, rang) => conservees[rang] === undefined);
  const relues = await relire(relecteur, manquantes);
  await conserverRelues(conserver, manquantes, relues);
  let suivante = 0;
  return conservees.map((valeur) => {
    if (valeur !== undefined) return valeur;
    const relue = relues?.[suivante];
    suivante += 1;
    return relue ?? null;
  });
}

/**
 * `placeId` des étapes du jour fermées d'après la relecture des horaires (décision 0116 § 5.3) : une demande par
 * Journée, `placeId` distincts, dans l'ordre des étapes. Vide si aucun relecteur d'horaires, refus, échec ou réponse
 * hors contrat (longueur, valeur) : aucun badge horaire, jamais un badge inventé. Rien n'est gardé entre deux requêtes.
 */
async function fermesDuJour(relecteur: RelecteurTrajets, jour: JourReduit): Promise<ReadonlySet<string>> {
  const placeIds = [...new Set(jour.items.flatMap((ligne) => (ligne.type === "stop" && ligne.stop.placeId !== undefined ? [ligne.stop.placeId] : [])))];
  if (placeIds.length === 0 || relecteur.relireHoraires === undefined) return new Set();
  let reponse: ReponseHoraires;
  try {
    reponse = await relecteur.relireHoraires(placeIds, jour.date);
  } catch {
    return new Set();
  }
  if (!reponse.ok || !Array.isArray(reponse.aConfirmer) || reponse.aConfirmer.length !== placeIds.length || reponse.aConfirmer.some((valeur) => typeof valeur !== "boolean")) {
    return new Set();
  }
  return new Set(placeIds.filter((_, rang) => reponse.ok && reponse.aConfirmer[rang] === true));
}

/**
 * Badge « à confirmer » calculé à la lecture (décision 0116 § 5.1 et § 5.3 ; 0011 § 5) : jamais écrit dans le
 * programme. Posé sur une étape sans `placeId`, ou dont le lieu est fermé d'après la relecture des horaires.
 */
function avecBadge(ligne: DayLineItem, fermes: ReadonlySet<string>): DayLineItem {
  if (ligne.type !== "stop") return ligne;
  const { stop } = ligne;
  const aConfirmer = stop.placeId === undefined || fermes.has(stop.placeId);
  if (!aConfirmer || stop.exceptions.includes("toConfirm")) return ligne;
  return { type: "stop", stop: { ...stop, exceptions: [...stop.exceptions, "toConfirm"] } };
}

/**
 * Recompose une journée : durées conservées ou relues (`estimated: false`), `null` pour une durée indisponible ;
 * `travelMinutes` = somme des segments, `null` s'il manque une durée (le total n'est pas affiché) ; badge
 * « à confirmer » calculé à la lecture (`avecBadge`, 0116 § 5.3).
 */
async function recomposerJour(servi: ProgrammeServi, jour: JourReduit, relecteur: RelecteurTrajets): Promise<Day> {
  const { programme } = servi;
  terminusDu(programme, jour.index);
  const paires = (pairesDuProgramme(programme).jours.get(jour.index) ?? []).map(exiger);
  const minutes = await durees(paires, servi, relecteur);
  let suivant = 0;
  const fermes = await fermesDuJour(relecteur, jour);
  const items: DayLineItem[] = jour.items.map((ligne) => {
    if (ligne.type !== "segment") return avecBadge(ligne, fermes);
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
async function recomposerPropositions(servi: ProgrammeServi, relecteur: RelecteurTrajets): Promise<Proposal[]> {
  const { programme } = servi;
  const paires = pairesDuProgramme(programme).propositions;
  const relues = new Map<number, number>();
  const jours = [...new Set(programme.proposals.filter((p) => p.travelFromPrevious).map((p) => p.day))];
  for (const jour of jours) {
    const concernees = programme.proposals
      .map((proposition, index) => ({ proposition, index }))
      .filter(({ proposition }) => proposition.day === jour && proposition.travelFromPrevious);
    const minutes = await durees(
      concernees.map(({ index }) => exiger(paires.get(index))),
      servi,
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
 * Adaptateur des programmes **réels** (P0r4, décisions 0074, 0079, 0092 et 0109) : programmes lus en base et recomposés
 * avec leurs positions (carte Google) et leurs temps conservés ; seules les paires sans temps conservé sont relues par le
 * relecteur injecté, puis conservées par la source après une relecture réussie (0109) (Routes réel, payant, réservé et plafonné : `src/server/p0/relecture.ts`). « Mes voyages » lit tous les programmes en une seule lecture (`lister`).
 */
export function createPrototypeAdapterReel({ programmes, relecteurs }: { programmes: SourceProgrammesReels; relecteurs: { trajets: RelecteurTrajets } }): TripAdapter {
  return creerAdapter({
    lister: async () => (await programmes.lister()).map(({ programme, trajets, conserver }) => ({ programme, positions: programme.positions, trajets, conserver })),
    async lire(tripId) {
      const lu = await programmes.lire(tripId);
      return lu ? { programme: lu.programme, positions: lu.programme.positions, trajets: lu.trajets, conserver: lu.conserver } : null;
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
    // Une requête par journée (paires manquantes seulement), dans l'ordre ; rien en mémoire entre deux requêtes (0109 : relues conservées par la source).
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
