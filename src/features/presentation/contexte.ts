import type { ProposalNeighbour, ProposalNeighbours } from "@/contracts";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";

import type { NoOptionSlot } from "./load";

const t = messages.presentation.contexte;

/** Étape d'un jour, telle que l'écran la reçoit (`PresentationDay.stops`) : identifiant et nom seulement. */
export interface DayStopName {
  id: string;
  name: string;
}

/** Texte d'un voisin ; `null` pour une étape introuvable dans le jour (rien n'est inventé). */
function voisin(neighbour: ProposalNeighbour, stops: readonly DayStopName[]): string | null {
  switch (neighbour.type) {
    case "stop":
      return stops.find((stop) => stop.id === neighbour.stopId)?.name ?? null;
    case "meal":
      return t.repas[neighbour.meal];
    case "free":
      return t.tempsLibre;
    case "terminus":
      return t.terminus[neighbour.role];
  }
}

/**
 * Contexte d'une proposition (évolution E2 de B2), composé depuis ses voisins et les étapes de son jour :
 * « Entre {a} et {b} », « Après {a} », « Avant {b} » ; `null` sans voisin (aucune ligne affichée). Un `stopId`
 * introuvable dans le jour compte comme un voisin absent.
 */
export function formatContexte(neighbours: ProposalNeighbours, stops: readonly DayStopName[]): string | null {
  const a = neighbours.before ? voisin(neighbours.before, stops) : null;
  const b = neighbours.after ? voisin(neighbours.after, stops) : null;
  if (a !== null && b !== null) return format(t.entre, { a, b });
  if (a !== null) return format(t.apres, { a });
  if (b !== null) return format(t.avant, { b });
  return null;
}

/**
 * « Pas de proposition pour le jour 4, vers 16:00 (activité). Ton programme reste ouvert à cet endroit. »
 * (libellé provisoire, B2-PO-10 ; formulation proposée par UX/UI à la revue de la PR 219, mineur 12).
 */
export function noOptionMessage(slots: readonly NoOptionSlot[]): string {
  const s = messages.presentation.sansOption;
  const creneaux = slots
    .map((slot) => format(s.creneau, { n: slot.day, heure: slot.time, kind: s.kind[slot.kind] }))
    .join(s.separateur);
  return format(slots.length > 1 ? s.messagePlusieurs : s.message, { creneaux });
}
