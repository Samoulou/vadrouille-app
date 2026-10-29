import type { Day, DayLineItem, DaySnapshot, Proposal, ProposalRecord, Stop, StopSnapshot, SurpriseIdea } from "@/contracts";

import { avecBadgeSansLieu } from "@/domain/apercu";
import { aConfirmer, budgetParPersonne, minutesDeTrajet, optionDeRepas, pointsDuJour, voisins } from "@/domain/calculs";
import type { ConfigurationMoteur } from "@/domain/configuration";
import { etapesDuJour } from "@/domain/programme";
import {
  INCONNU,
  logementsDuJour,
  memePoint,
  type DemandeRelectures,
  type ModeTrajet,
  type Point,
  type Relectures,
} from "@/domain/relectures";
import { versMinutes } from "@/domain/temps";

/**
 * Assemblage d'un `Day` et d'une `Proposal` recomposés à la lecture (spécification B6, B6a point 2 ; décision 0086
 * § 1.2 points 1 et 2). Fonctions pures, écrites **une fois** ici : la lecture des voyages (`src/server/voyages/`, B6a),
 * puis B8b (relectures réelles), B11 et B12 les réutilisent. Elles reprennent les fonctions calculées de B5
 * (`calculs.ts`) sans les recopier, et ne rendent rien qui soit écrit : les durées, `toConfirm` et `verifiedAt` ne
 * vivent que dans la réponse.
 *
 * `demandeDeRelectures` calcule, avec les **mêmes** fonctions de points que l'assemblage, tout ce que l'assemblage
 * lira (lieux et dates, couples de points et modes) : la demande ne peut pas diverger de ce qui est lu.
 */

/** Raison d'un assemblage impossible (liste fermée de la lecture, B6a point 10). */
export type RaisonAssemblage = "travel_unknown" | "proposal_invalid";

export type Assemblage<T> = { readonly ok: true; readonly valeur: T } | { readonly ok: false; readonly raison: RaisonAssemblage };

/** Couple de points d'un trajet. */
export type Couple = { readonly depuis: Point; readonly vers: Point };

/**
 * Points d'un segment (B6-PO-4) : dernier point **avec lieu** qui le précède dans la ligne du jour (logement de départ
 * au début) et premier point avec lieu qui le suit (logement d'arrivée à la fin), comme `pointsDuJour`. Clé : rang de
 * l'élément `segment` dans `jour.items`.
 */
export function pointsDesSegments(jour: Pick<DaySnapshot, "index" | "items">, nombreDeNuits: number): ReadonlyMap<number, Couple> {
  const logements = logementsDuJour(jour.index - 1, nombreDeNuits);
  const couples = new Map<number, Couple>();
  let dernier: Point = { logement: logements.depart };
  let enAttente: number[] = [];
  const resoudre = (vers: Point) => {
    for (const rang of enAttente) couples.set(rang, { depuis: dernier, vers });
    enAttente = [];
  };
  jour.items.forEach((item, rang) => {
    if (item.type === "segment") {
      enAttente.push(rang);
      return;
    }
    if (item.type === "stop" && item.stop.placeId !== undefined) {
      // Un segment en attente part du point d'avant (`dernier`, inchangé depuis qu'il a été vu).
      const point: Point = { lieu: item.stop.placeId };
      resoudre(point);
      dernier = point;
    }
  });
  resoudre({ logement: logements.arrivee });
  return couples;
}

/**
 * Point de départ du trajet d'une proposition (B6-PO-4) : dernier point avec lieu du jour qui commence avant
 * `time`, l'étape de la proposition exclue (comme `voisins`) ; logement de départ du jour s'il n'y en a aucun.
 */
export function pointAvantProposition(jour: Pick<DaySnapshot, "index" | "items">, time: string, stopId: string, nombreDeNuits: number): Point {
  const instant = versMinutes(time);
  let point: Point = { logement: logementsDuJour(jour.index - 1, nombreDeNuits).depart };
  for (const stop of etapesDuJour(jour)) {
    if (stop.id === stopId || stop.placeId === undefined) continue;
    if (versMinutes(stop.start) < instant) point = { lieu: stop.placeId };
  }
  return point;
}

/** Jour d'une lecture, et s'il est mesuré (un jour en préparation ne l'est pas, B6-PO-8). */
export type JourALire = { readonly jour: DaySnapshot; readonly mesure: boolean };

/** Proposition d'une lecture, avec le jour de la version courante qu'elle vise. */
export type PropositionALire = { readonly proposition: ProposalRecord; readonly jour: DaySnapshot };

/**
 * Demande de relectures (0086 § 1.2 point 2) : lieux et dates des étapes, événements et propositions (plages, pour
 * `toConfirm`) ; couples de points avec le mode stocké de chaque `Segment` et de chaque `travelFromPrevious`, et ceux
 * de `minutesDeTrajet` avec les modes admis. Un jour non mesuré n'y entre pas. Doublons fusionnés (modes réunis).
 */
export function demandeDeRelectures(entree: {
  readonly jours: readonly JourALire[];
  readonly propositions?: readonly PropositionALire[];
  readonly nombreDeNuits: number;
  readonly modes: readonly ModeTrajet[];
}): DemandeRelectures {
  const lieux = new Map<string, Set<string>>();
  const ajouterLieu = (placeId: string | undefined, date: string) => {
    if (placeId === undefined) return;
    const dates = lieux.get(placeId) ?? new Set<string>();
    dates.add(date);
    lieux.set(placeId, dates);
  };
  const trajets: { depuis: Point; vers: Point; modes: ModeTrajet[] }[] = [];
  const ajouterTrajet = (depuis: Point, vers: Point, modes: readonly ModeTrajet[]) => {
    const existant = trajets.find((trajet) => memePoint(trajet.depuis, depuis) && memePoint(trajet.vers, vers));
    if (existant === undefined) trajets.push({ depuis, vers, modes: [...modes] });
    else for (const mode of modes) if (!existant.modes.includes(mode)) existant.modes.push(mode);
  };

  for (const { jour, mesure } of entree.jours) {
    if (!mesure) continue;
    for (const stop of [...etapesDuJour(jour), ...jour.events]) ajouterLieu(stop.placeId, jour.date);
    const couples = pointsDesSegments(jour, entree.nombreDeNuits);
    jour.items.forEach((item, rang) => {
      const couple = couples.get(rang);
      if (item.type === "segment" && couple !== undefined) ajouterTrajet(couple.depuis, couple.vers, [item.segment.mode]);
    });
    const points = pointsDuJour(jour, entree.nombreDeNuits);
    for (let rang = 1; rang < points.length; rang += 1) {
      const depuis = points.at(rang - 1);
      const vers = points.at(rang);
      if (depuis !== undefined && vers !== undefined) ajouterTrajet(depuis, vers, entree.modes);
    }
  }
  for (const { proposition, jour } of entree.propositions ?? []) {
    ajouterLieu(proposition.stop.placeId, jour.date);
    if (proposition.travelFromPrevious !== undefined && proposition.stop.placeId !== undefined) {
      const depuis = pointAvantProposition(jour, proposition.time, proposition.stop.id, entree.nombreDeNuits);
      ajouterTrajet(depuis, { lieu: proposition.stop.placeId }, [proposition.travelFromPrevious.mode]);
    }
  }
  return {
    lieux: [...lieux].map(([placeId, dates]) => ({ placeId, dates: [...dates] })),
    trajets,
  };
}

/**
 * `exceptions` stockées, puis `toConfirm` s'il reste une place (B6-PO-5, 0011 point 5 : 2 badges au plus).
 * **`aConfirmer` n'est appelé que pour un lieu relu** (décision 0100 § 4.2, B8-PO-9) : `validite` `inconnu` signifie
 * « non relu » (fiche en échec), jamais « introuvable » (`introuvable`, lui, reçoit `toConfirm`). Une étape sans
 * `placeId` n'est pas relue non plus (`aConfirmer` rend déjà faux).
 */
function exceptionsLues(stop: StopSnapshot, date: string, relectures: Relectures | undefined): Stop["exceptions"] {
  const exceptions: Stop["exceptions"] = [...stop.exceptions];
  if (relectures === undefined || exceptions.length >= 2 || stop.placeId === undefined) return exceptions;
  if (relectures.validite(stop.placeId) === INCONNU) return exceptions;
  if (aConfirmer(stop, date, relectures)) exceptions.push("toConfirm");
  return exceptions;
}

/** Référence d'un élément daté par `verifiedAt` (B6-PO-6) : étape du programme, événement ou idée « Surprends-moi ». */
export type RefVerification = { readonly genre: "stop" | "event" | "surprise"; readonly id: string; readonly placeId: string };

/** Date de contrôle d'un élément (AAAA-MM-JJ), reconstituée par le serveur depuis la chaîne des versions. */
export type DateDeVerification = (jourIndex: number, ref: RefVerification) => string | undefined;

function etapeLue(stop: StopSnapshot, genre: "stop" | "event", jour: DaySnapshot, relectures: Relectures | undefined, verification: DateDeVerification): Stop {
  const verifiedAt = stop.placeId === undefined ? undefined : verification(jour.index, { genre, id: stop.id, placeId: stop.placeId });
  return { ...stop, exceptions: exceptionsLues(stop, jour.date, relectures), ...(verifiedAt === undefined ? {} : { verifiedAt }) };
}

/**
 * `Day` recomposé depuis un jour stocké (B6-PO-4 à B6-PO-8) : `Segment.minutes` (mode stocké, points de
 * `pointsDesSegments`), `travelMinutes` (`minutesDeTrajet`, modes admis), `budgetPerPerson` (`budgetParPersonne`),
 * `toConfirm`, `verifiedAt`. Un jour en préparation (`generating`) n'est pas mesuré : `travelMinutes` 0, sans budget,
 * sans `toConfirm`, et un segment y est une incohérence (`travel_unknown`). Une durée inconnue : `travel_unknown`,
 * jamais de valeur inventée.
 *
 * `badgeSansLieu` (décision 0136 § 3.6, chaîne inversée seulement ; faux par défaut, donc sans effet sur l'ancienne chaîne) :
 * chaque ligne `stop` de la journée passe par `avecBadgeSansLieu` (`src/domain/apercu.ts`, la règle du site d'essai) : une
 * étape sans `placeId` reçoit `toConfirm` dans la limite de 2 badges ; rien n'est écrit, les événements ne sont pas badgés.
 */
export function recomposerJour(
  jour: DaySnapshot,
  contexte: {
    readonly nombreDeNuits: number;
    readonly generating: boolean;
    /** Absent pour un jour en préparation (le port n'est pas appelé pour lui). */
    readonly relectures?: Relectures;
    readonly modes: readonly ModeTrajet[];
    readonly verification: DateDeVerification;
    /** Badge « à confirmer » d'une étape sans `placeId` (chaîne inversée, 0136 § 3.6) ; absent : faux. */
    readonly badgeSansLieu?: boolean;
  },
): Assemblage<Day> {
  const relectures = contexte.generating ? undefined : contexte.relectures;
  if (!contexte.generating && relectures === undefined) return { ok: false, raison: "travel_unknown" };
  const couples = pointsDesSegments(jour, contexte.nombreDeNuits);
  const items: DayLineItem[] = [];
  for (const [rang, item] of jour.items.entries()) {
    if (item.type === "stop") {
      const ligne: DayLineItem = { type: "stop", stop: etapeLue(item.stop, "stop", jour, relectures, contexte.verification) };
      items.push(contexte.badgeSansLieu === true ? avecBadgeSansLieu(ligne) : ligne);
    } else if (item.type === "segment") {
      const couple = couples.get(rang);
      const duree = relectures === undefined || couple === undefined ? INCONNU : relectures.duree(couple.depuis, couple.vers, item.segment.mode);
      if (duree === INCONNU) return { ok: false, raison: "travel_unknown" };
      // `estimated` : vrai si la valeur stockée ou la relecture le dit (0100 § 6.1) ; une durée estimée n'est jamais présentée comme mesurée.
      items.push({ type: "segment", segment: { mode: item.segment.mode, minutes: duree.minutes, estimated: item.segment.estimated || duree.estimee } });
    } else {
      items.push(item);
    }
  }
  const events = jour.events.map((event) => etapeLue(event, "event", jour, relectures, contexte.verification));
  let surprise: SurpriseIdea | undefined;
  if (jour.surprise !== undefined) {
    const verifiedAt =
      jour.surprise.placeId === undefined ? undefined : contexte.verification(jour.index, { genre: "surprise", id: jour.surprise.id, placeId: jour.surprise.placeId });
    surprise = { ...jour.surprise, ...(verifiedAt === undefined ? {} : { verifiedAt }) };
  }
  let travelMinutes = 0;
  let budgetPerPerson: number | undefined;
  if (relectures !== undefined) {
    const minutes = minutesDeTrajet(jour, contexte.nombreDeNuits, relectures, contexte.modes);
    if (minutes === INCONNU) return { ok: false, raison: "travel_unknown" };
    travelMinutes = minutes;
    budgetPerPerson = budgetParPersonne(jour);
  }
  return {
    ok: true,
    valeur: {
      index: jour.index,
      date: jour.date,
      items,
      ...(budgetPerPerson === undefined ? {} : { budgetPerPerson }),
      events,
      generating: contexte.generating,
      travelMinutes,
      travelBudgetMinutes: jour.travelBudgetMinutes,
      ...(surprise === undefined ? {} : { surprise }),
      // Titre libre du jour (décision 0116 § 6) : porté par l'instantané, relu tel quel.
      ...(jour.theme === undefined ? {} : { theme: jour.theme }),
    },
  };
}

/**
 * Options des repas d'une liste de propositions (B6-PO-9, `optionDeRepas`) : les propositions `meal` d'un même
 * créneau (jour, heure) sont les options du créneau, classées dans l'ordre de la liste ; un créneau à une seule
 * proposition n'a pas d'option (« 1 sur 1 » n'est jamais affiché). Même ordre que l'entrée.
 */
export function optionsDesRepas(propositions: readonly Pick<ProposalRecord, "kind" | "day" | "time">[]): (Proposal["option"] | undefined)[] {
  const creneaux = new Map<string, number>();
  const cle = (p: Pick<ProposalRecord, "day" | "time">) => `${p.day}|${p.time}`;
  for (const proposition of propositions) if (proposition.kind === "meal") creneaux.set(cle(proposition), (creneaux.get(cle(proposition)) ?? 0) + 1);
  const rangs = new Map<string, number>();
  return propositions.map((proposition) => {
    if (proposition.kind !== "meal") return undefined;
    const total = creneaux.get(cle(proposition)) ?? 0;
    const rang = (rangs.get(cle(proposition)) ?? 0) + 1;
    rangs.set(cle(proposition), rang);
    return total > 1 ? optionDeRepas(rang, total) : undefined;
  });
}

/**
 * `Proposal` recomposée (B6-PO-4, B6-PO-9) depuis `proposals.content` et le jour `proposal.day` de la version
 * courante : `neighbours` (`voisins`), `option` (fournie par `optionsDesRepas`), `travelFromPrevious.minutes` (mode
 * stocké, depuis `pointAvantProposition`), `toConfirm` de l'étape. `travelFromPrevious` sans `placeId` :
 * `proposal_invalid` ; durée inconnue : `travel_unknown`.
 */
export function recomposerProposition(
  proposition: ProposalRecord,
  jour: DaySnapshot,
  contexte: {
    readonly nombreDeNuits: number;
    readonly generating: boolean;
    readonly relectures: Relectures;
    readonly configuration: ConfigurationMoteur;
    readonly option?: Proposal["option"];
  },
): Assemblage<Proposal> {
  const { travelFromPrevious, stop } = proposition;
  // Champs stockés repris tels quels (sans reste d'objet déstructuré, construction refusée par la liste de P0).
  const reste = Object.fromEntries(Object.entries(proposition).filter(([cle]) => cle !== "travelFromPrevious" && cle !== "stop")) as Omit<
    ProposalRecord,
    "travelFromPrevious" | "stop"
  >;
  if (travelFromPrevious !== undefined && stop.placeId === undefined) return { ok: false, raison: "proposal_invalid" };
  let trajet: Proposal["travelFromPrevious"];
  if (travelFromPrevious !== undefined && stop.placeId !== undefined) {
    const depuis = pointAvantProposition(jour, proposition.time, stop.id, contexte.nombreDeNuits);
    const duree = contexte.relectures.duree(depuis, { lieu: stop.placeId }, travelFromPrevious.mode);
    if (duree === INCONNU) return { ok: false, raison: "travel_unknown" };
    trajet = { mode: travelFromPrevious.mode, minutes: duree.minutes, estimated: travelFromPrevious.estimated || duree.estimee };
  }
  return {
    ok: true,
    valeur: {
      ...reste,
      neighbours: voisins({ items: jour.items, generating: contexte.generating }, { time: proposition.time, stopId: stop.id }, contexte.configuration),
      stop: { ...stop, exceptions: exceptionsLues(stop, jour.date, contexte.relectures) },
      ...(contexte.option === undefined ? {} : { option: contexte.option }),
      ...(trajet === undefined ? {} : { travelFromPrevious: trajet }),
    },
  };
}
