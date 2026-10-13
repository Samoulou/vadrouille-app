import {
  DETOUR_THRESHOLD_MINUTES,
  DayMapSchema,
  ProposalSchema,
  TripSchema,
  validateDayMap,
  type Day,
  type DayLineItem,
  type DayMap,
  type Proposal,
  type Segment,
  type Stop,
  type StopFacts,
  type Trip,
} from "@/contracts";
import type { JourPlanifie } from "@/domain/planification";
import { MARGE_MINUTES } from "@/domain/squelette";
import { arrondi5, versHeure } from "@/domain/temps";
import type { Position } from "@/prototype/ancrage";
import type { Brief } from "@/prototype/brief";
import type { Candidat } from "@/prototype/candidat";
import { element } from "@/domain/tables";

/**
 * Assemblage du programme complet, en mémoire (spécification P0, « Sortie 1 »), puis validation par
 * `TripSchema`, `ProposalSchema` et un `DayMapSchema` par jour **avant** la réduction.
 *
 * Le programme complet contient les durées de trajet (`Segment.minutes`, `Day.travelMinutes`) : il ne vit qu'en
 * mémoire. Seule sa forme réduite est écrite (`@/prototype/reduction`).
 */

/** Écart minimal, en minutes, pour écrire un temps libre (en deçà, il compte comme marge). */
export const TEMPS_LIBRE_AFFICHE = 30;

/** Nombre de propositions de la présentation (cadrage § 4). */
export const NOMBRE_PROPOSITIONS = 8;

export type Raison = { raison?: string; detour?: string };

export type EntreeAssemblage = {
  tripId: string;
  brief: Brief;
  jours: readonly JourPlanifie[];
  candidats: ReadonlyMap<string, Candidat>;
  raisons: ReadonlyMap<string, Raison>;
  mode: Segment["mode"];
  positions: ReadonlyMap<string, Position>;
};

export type ProgrammeComplet = {
  trip: Trip;
  proposals: Proposal[];
  /** Justification maison de chaque proposition (écrite sur chacune dans la forme réduite). */
  justifications: Map<string, string>;
  terminus: { jour: number; depart: string; arrivee: string }[];
  cartes: DayMap[];
};

const COULEURS = ["bruyere", "azulejo", "ocre", "granit"] as const;

function couleur(destination: string): Trip["destinationColor"] {
  let somme = 0;
  for (const caractere of destination) somme = (somme + (caractere.codePointAt(0) ?? 0)) % 997;
  return COULEURS.at(somme % COULEURS.length) ?? "granit";
}

function domaine(url: string): string {
  return new URL(url).hostname;
}

/**
 * Faits de l'étape (spécification B2, E3) : durée prévue et gratuité, comme l'ancien texte `meta` (« 1 h 30,
 * gratuit »). Le coût n'est repris que s'il est nul : la devise des prix trouvés sur le web n'est pas convertie
 * (hors périmètre de B2, B7 ou B9).
 */
function faits(candidat: Candidat, minutes: number | undefined): StopFacts {
  // `StopFacts.durationMinutes` est un entier strictement positif : une durée nulle ou non entière est omise.
  const duree = minutes !== undefined && Number.isInteger(minutes) && minutes > 0 ? minutes : undefined;
  return {
    ...(duree === undefined ? {} : { durationMinutes: duree }),
    ...(candidat.prixParPersonne === 0 ? { costPerPerson: 0 } : {}),
  };
}

function stopDe(
  id: string,
  candidat: Candidat,
  kind: Stop["kind"],
  placeId: string | undefined,
  debut: number,
  fin: number | undefined,
  raison: string | undefined,
): Stop {
  const exceptions: Stop["exceptions"] = [];
  if (candidat.aReserver) exceptions.push("toReserve");
  if (kind === "event" && candidat.evenement?.dateConfirmee !== true) exceptions.push("unconfirmed");
  return {
    id,
    kind,
    ...(placeId === undefined ? {} : { placeId }),
    name: candidat.nom,
    start: versHeure(debut),
    ...(fin === undefined ? {} : { end: versHeure(fin) }),
    facts: fin === undefined ? {} : faits(candidat, fin - debut),
    ...(raison === undefined ? {} : { reason: raison }),
    source: { label: domaine(candidat.source.url), url: candidat.source.url },
    exceptions,
    locked: false,
  };
}

export function assembler(entree: EntreeAssemblage): ProgrammeComplet {
  const { brief } = entree;
  const proposals: Proposal[] = [];
  const justifications = new Map<string, string>();
  const terminus: ProgrammeComplet["terminus"] = [];
  const logementTexte = (index: number) => element(brief.logements, index)?.texte ?? brief.logements[0]?.texte ?? "Logement";

  const days: Day[] = entree.jours.map((jour) => {
    const s = jour.squelette;
    const items: DayLineItem[] = [{ type: "terminus", role: "start", time: versHeure(s.debut), label: logementTexte(s.logementDepart) }];
    let fin = s.debut;
    let travelMinutes = 0;
    let budget = 0;
    let budgetComplet = jour.etapes.length > 0;

    jour.etapes.forEach((etape, rang) => {
      const candidat = entree.candidats.get(etape.candidatId);
      if (candidat === undefined) throw new Error("assemblage : candidat inconnu");
      // Bornes du temps libre arrondies à 5 min : elles ne recopient pas une durée de trajet à la minute près.
      const depart = Math.floor((etape.debut - etape.trajetAvant - MARGE_MINUTES) / 5) * 5;
      if (depart - fin >= TEMPS_LIBRE_AFFICHE) items.push({ type: "free", from: versHeure(fin), to: versHeure(depart) });
      const segment: Segment = { mode: entree.mode, minutes: etape.trajetAvant, estimated: false };
      items.push({ type: "segment", segment });
      travelMinutes += etape.trajetAvant;
      const kind = etape.creneau === "meal" ? "meal" : "activity";
      const raison = entree.raisons.get(candidat.id);
      const stop = stopDe(`j${s.index}-${rang + 1}`, candidat, kind, etape.placeId, etape.debut, etape.fin, raison?.raison);
      items.push({ type: "stop", stop });
      if (candidat.prixParPersonne === undefined) budgetComplet = false;
      else budget += candidat.prixParPersonne;
      fin = etape.fin;

      if (s.index <= 2 && proposals.length < NOMBRE_PROPOSITIONS && raison?.detour !== undefined) {
        const id = `p${proposals.length + 1}`;
        const proposition: Proposal = {
          id,
          kind,
          day: s.index,
          time: stop.start,
          // Voisins : calculés à la lecture par le moteur (B5, décision 0037 B2-TL-1), jamais écrits ici.
          neighbours: {},
          stop,
          category: candidat.categorie,
          ...(kind === "meal" ? { option: { index: 1, total: Math.max(1, etape.options) } } : {}),
          travelFromPrevious: segment,
          // En mémoire, `detour` suit la règle du contrat ; la forme réduite le porte sur chaque proposition.
          ...(etape.trajetAvant > DETOUR_THRESHOLD_MINUTES ? { detour: raison.detour } : {}),
        };
        proposals.push(proposition);
        justifications.set(id, raison.detour);
      }
    });

    const retourDepart = fin;
    items.push({ type: "segment", segment: { mode: entree.mode, minutes: jour.retour, estimated: false } });
    travelMinutes += jour.retour;
    const arrivee = Math.min(23 * 60 + 55, arrondi5(retourDepart + jour.retour));
    items.push({ type: "terminus", role: "end", time: versHeure(arrivee), label: logementTexte(s.logementArrivee) });
    terminus.push({ jour: s.index, depart: jour.logementDepart, arrivee: jour.logementArrivee });

    const events: Stop[] = jour.evenements.flatMap((evenement, rang) => {
      const candidat = entree.candidats.get(evenement.candidatId);
      if (candidat === undefined) return [];
      return [
        stopDe(`j${s.index}-e${rang + 1}`, candidat, "event", evenement.placeId, evenement.debut, undefined, entree.raisons.get(candidat.id)?.raison),
      ];
    });
    for (const [rang, engagement] of (brief.engagements ?? []).filter((e) => e.date === s.date).entries()) {
      events.push({
        id: `j${s.index}-c${rang + 1}`,
        kind: "event",
        name: engagement.libelle,
        start: engagement.heure,
        facts: {},
        exceptions: [],
        locked: true,
        commitment: engagement.type,
      });
    }

    let surprise: Day["surprise"];
    if (jour.idee !== undefined) {
      const candidat = entree.candidats.get(jour.idee.candidatId);
      const raison = candidat === undefined ? undefined : entree.raisons.get(candidat.id)?.raison;
      if (candidat !== undefined && raison !== undefined) {
        surprise = {
          id: `j${s.index}-idee`,
          placeId: jour.idee.placeId,
          name: candidat.nom,
          facts: faits(candidat, candidat.dureeMinutes),
          reason: raison,
          source: { label: domaine(candidat.source.url), url: candidat.source.url },
        };
      }
    }

    return {
      index: s.index,
      date: s.date,
      items,
      ...(budgetComplet ? { budgetPerPerson: budget } : {}),
      events,
      generating: false,
      travelMinutes,
      travelBudgetMinutes: s.budgetTrajet,
      ...(surprise === undefined ? {} : { surprise }),
    };
  });

  const trip: Trip = {
    id: entree.tripId,
    organizationId: "org_prototype",
    destination: brief.destination,
    destinationColor: couleur(brief.destination),
    start: brief.arrivee,
    end: brief.depart,
    timeZone: brief.fuseau,
    travellers: { adults: brief.voyageurs.adultes, children: brief.voyageurs.enfants },
    days,
    checklist: [],
    unlocked: true,
  };

  // Validation complète en mémoire, avant toute réduction (spécification P0, « Sortie 1 »).
  TripSchema.parse(trip);
  for (const proposition of proposals) ProposalSchema.parse(proposition);
  const cartes = days.map((day) => carteDuJour(trip.id, day, terminus, entree.positions));
  return { trip, proposals, justifications, terminus, cartes };
}

function carteDuJour(
  tripId: string,
  day: Day,
  terminus: ProgrammeComplet["terminus"],
  positions: ReadonlyMap<string, Position>,
): DayMap {
  const points: DayMap["points"] = [];
  const t = terminus.find((entree) => entree.jour === day.index);
  const ajouterTerminus = (role: "start" | "end", placeId: string | undefined) => {
    const position = placeId === undefined ? undefined : positions.get(placeId);
    if (position) points.push({ ref: { type: "terminus", role }, lat: position.lat, lng: position.lng });
  };
  ajouterTerminus("start", t?.depart);
  for (const item of day.items) {
    if (item.type !== "stop" || item.stop.placeId === undefined) continue;
    const position = positions.get(item.stop.placeId);
    if (position) points.push({ ref: { type: "stop", stopId: item.stop.id }, lat: position.lat, lng: position.lng });
  }
  ajouterTerminus("end", t?.arrivee);
  const carte = DayMapSchema.parse({ tripId, dayIndex: day.index, points });
  if (validateDayMap(day, carte, tripId).length > 0) throw new Error("assemblage : carte du jour incohérente");
  return carte;
}
