import { WeekdaySchema, type Day, type DayLineItem, type Proposal, type Segment, type Stop, type SurpriseIdea, type Trip, type Weekday } from "@/contracts";
import type { Position } from "@/prototype/ancrage";
import {
  PROGRAMME_REDUIT_SCHEMA,
  ProgrammeReduitSchema,
  placeIdsDuProgramme,
  type JourReduit,
  type LigneReduite,
  type ProgrammeReduit,
  type PropositionReduite,
  type SegmentReduit,
  type StopReduit,
  type SurpriseReduite,
  type VoyageReduit,
} from "@/prototype/programme-reduit";

/**
 * Passage du programme complet, validé en mémoire par `TripSchema`, `ProposalSchema` et `DayMapSchema`, à la
 * forme réduite écrite sur disque (spécification P0, « Sortie 1 » ; décision 0032, A3.1).
 *
 * Retire les clés dérivées de Google (contrainte 3) : `verifiedAt`, `Segment.minutes`, `Day.travelMinutes`,
 * `travelFromPrevious.minutes`, `photoUrl`. Pose `detour` sur chaque proposition (justification maison). Ne garde
 * dans `positions` que les `placeId` du programme. **Refuse** un programme dont une étape porte `toConfirm`
 * (le prototype ne le calcule jamais, écart 3 bis). Valide le résultat par le schéma strict de la forme réduite.
 */

export class ReductionRefusee extends Error {
  readonly code = "reduction_refused";
  constructor() {
    super("reduction_refused");
  }
}

/** Copie d'un objet sans les clés données (retrait explicite des clés dérivées de Google). */
function sans<T extends object, K extends keyof T & string>(objet: T, ...cles: K[]): Omit<T, K> {
  // Sans accès calculé ni reste d'objet (revue Sécurité de #180) : seules les propriétés propres et énumérables
  // sont copiées.
  const retirees: ReadonlySet<string> = new Set(cles);
  return Object.fromEntries(Object.entries(objet).filter(([cle]) => !retirees.has(cle))) as Omit<T, K>;
}

function etape(stop: Stop): StopReduit {
  if (stop.exceptions.includes("toConfirm")) throw new ReductionRefusee();
  return { ...sans(stop, "verifiedAt", "exceptions"), exceptions: stop.exceptions as StopReduit["exceptions"] };
}

function segment(valeur: Segment): SegmentReduit {
  return sans(valeur, "minutes");
}

function idee(valeur: SurpriseIdea): SurpriseReduite {
  return sans(valeur, "verifiedAt");
}

function ligne(item: DayLineItem): LigneReduite {
  switch (item.type) {
    case "stop":
      return { type: "stop", stop: etape(item.stop) };
    case "segment":
      return { type: "segment", segment: segment(item.segment) };
    default:
      return item;
  }
}

/**
 * Jour abrégé de la forme réduite, calculé depuis la date ISO en UTC (`Day` ne porte plus `weekday`, B2 E1).
 * `WeekdaySchema.options` commence au lundi ; `getUTCDay()` au dimanche.
 */
function jourAbrege(date: string): Weekday {
  const rang = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return WeekdaySchema.options.at(rang) ?? "lun.";
}

function jour(valeur: Day): JourReduit {
  const { items, events, surprise } = valeur;
  return {
    ...sans(valeur, "travelMinutes", "items", "events", "surprise"),
    weekday: jourAbrege(valeur.date),
    items: items.map(ligne),
    events: events.map(etape),
    ...(surprise === undefined ? {} : { surprise: idee(surprise) }),
  };
}

function proposition(valeur: Proposal, justification: string): PropositionReduite {
  const { travelFromPrevious, stop } = valeur;
  return {
    ...sans(valeur, "travelFromPrevious", "photoUrl", "detour", "stop", "neighbours"),
    stop: etape(stop),
    ...(travelFromPrevious === undefined ? {} : { travelFromPrevious: segment(travelFromPrevious) }),
    detour: justification,
  };
}

export type TerminusDuJour = { jour: number; depart: string; arrivee: string };

export function reduireProgramme(
  complet: { trip: Trip; proposals: Proposal[] },
  options: {
    positions: ReadonlyMap<string, Position>;
    terminus: TerminusDuJour[];
    /** Justification maison de chaque proposition, par identifiant de proposition. */
    justifications: ReadonlyMap<string, string>;
  },
): ProgrammeReduit {
  const trip = { ...sans(complet.trip, "days"), days: complet.trip.days.map(jour) } as VoyageReduit;
  const proposals = complet.proposals.map((valeur) => {
    const justification = options.justifications.get(valeur.id);
    if (justification === undefined) throw new ReductionRefusee();
    return proposition(valeur, justification);
  });
  const ids = placeIdsDuProgramme({ trip, proposals, terminus: options.terminus });
  const positions: Record<string, Position> = Object.fromEntries(
    [...ids].sort().map((placeId) => {
      const position = options.positions.get(placeId);
      if (position === undefined) throw new ReductionRefusee();
      return [placeId, { lat: position.lat, lng: position.lng }];
    }),
  );
  const resultat = ProgrammeReduitSchema.safeParse({
    schema: PROGRAMME_REDUIT_SCHEMA,
    trip,
    proposals,
    positions,
    terminus: options.terminus,
  });
  if (!resultat.success) throw new ReductionRefusee();
  return resultat.data;
}
