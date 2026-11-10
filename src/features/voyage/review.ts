import type { DayLineItem, Stop, Trip } from "@/contracts";

/**
 * Projection du voyage pour l'écran 16 (M8a, ticket 1062 ; comme `projectTodayTrip` de l'écran 15) : recopie champ par
 * champ des seuls champs lus par l'écran, pour qu'aucun champ ajouté plus tard au contrat ne passe au navigateur sans être
 * nommé ici. **Sans `placeId`** : l'écran n'en a pas besoin (le serveur lit celui de la version courante, 0160 § 1.1
 * point 3), et aucune donnée Google n'est envoyée au navigateur par cet écran.
 */

/**
 * `addedBy` (M8b, ticket 1111) : marque maison d'un lieu ajouté par la personne (`person`, `discovered`), lue par la section
 * « Adresses découvertes » ; ce n'est pas une donnée Google. Le nom est celui saisi par la personne (M5-PO-10).
 */
export type ReviewStop = Pick<Stop, "id" | "kind" | "name" | "start" | "addedBy">;

export type ReviewItem = { type: "stop"; stop: ReviewStop } | { type: Exclude<DayLineItem["type"], "stop"> };

export interface ReviewDay {
  index: number;
  date: string;
  generating: boolean;
  items: ReviewItem[];
}

export interface ReviewTrip {
  id: string;
  destination: string;
  end: string;
  days: ReviewDay[];
}

function projectItem(item: DayLineItem): ReviewItem {
  if (item.type !== "stop") return { type: item.type };
  const { id, kind, name, start, addedBy } = item.stop;
  return { type: "stop", stop: { id, kind, name, start, ...(addedBy === undefined ? {} : { addedBy }) } };
}

export function projectReviewTrip(trip: Pick<Trip, "id" | "destination" | "end" | "days">): ReviewTrip {
  return {
    id: trip.id,
    destination: trip.destination,
    end: trip.end,
    days: trip.days.map((day) => ({ index: day.index, date: day.date, generating: day.generating, items: day.items.map(projectItem) })),
  };
}
