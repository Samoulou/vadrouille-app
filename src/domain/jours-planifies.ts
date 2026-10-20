import type { DaySnapshot, TripCommitment } from "@/contracts";

import type { CandidatEvenement, EntreeMoteur } from "@/domain/entrees";
import { logementsDuJour } from "@/domain/relectures";
import { ajouterJours, joursEntre } from "@/domain/temps";

/**
 * Moteur partiel (décision 0081 § B9-TL-13, amendement de la spécification B5) : jours à planifier, forme d'un
 * jour non planifié (B9-PO-6) et points datés des jours planifiés. Fonctions pures, sans relecture : la composition
 * (B9c) s'en sert pour ne précharger les relectures (`versRelectures`, B8a) que pour les points des jours qu'elle
 * fait planifier.
 */

/** Indices des jours du voyage (1 = J1), de l'arrivée au départ. */
export function indicesDuVoyage(voyage: { start: string; end: string }): number[] {
  return Array.from({ length: joursEntre(voyage.start, voyage.end) + 1 }, (_, rang) => rang + 1);
}

/**
 * Jours à planifier : `jours` absent, tout le voyage (comportement de B5) ; sinon ces indices, sans doublon. Un
 * indice hors du séjour est une erreur de l'appelant (`RangeError`, comme `replanifierJour`).
 */
export function joursAPlanifier(voyage: { start: string; end: string }, jours?: readonly number[]): ReadonlySet<number> {
  const tous = indicesDuVoyage(voyage);
  if (jours === undefined) return new Set(tous);
  for (const index of jours) {
    if (!Number.isInteger(index) || index < 1 || index > tous.length) throw new RangeError("moteur : jour hors du séjour");
  }
  return new Set(jours);
}

/**
 * Jour non planifié (B9-PO-6, lu « pas encore planifié » par B6-TL-9) : ses seuls termini de logement, sans
 * étape, sans trajet, sans événement ni idée.
 */
export function estJourNonPlanifie(jour: Pick<DaySnapshot, "items" | "events" | "surprise">): boolean {
  return jour.items.every((item) => item.type === "terminus") && jour.events.length === 0 && jour.surprise === undefined;
}

/**
 * Jour sans aucun élément de type `stop` (décision 0086 § 1.7) : prédicat unique du « jour pas encore planifié » pendant une
 * exécution `full` (B6a, lecture du voyage : `Day.generating`), réemployé par le voyage complet pour les jours qui manquent
 * (0087 § 1.3 point 3). Un jour planifié dont toutes les cases sont `noOption` y répond aussi vrai (conséquence acceptée).
 */
export function jourSansEtape(jour: Pick<DaySnapshot, "items">): boolean {
  return !jour.items.some((item) => item.type === "stop");
}

/** Points datés d'un jour : nuits de son logement de départ et d'arrivée, engagements et événements de sa date. */
export type PointsDuJour = {
  /** 1 = J1. */
  index: number;
  date: string;
  /** Index des nuits (0 = première nuit), départ puis arrivée, sans doublon (0045 § 2.2). */
  nuits: readonly number[];
  engagements: readonly TripCommitment[];
  evenements: readonly CandidatEvenement[];
};

/**
 * Points datés des jours `jours` (tous les jours si absent), dans l'ordre des jours : ce que le moteur peut lire
 * par les relectures pour planifier ces jours, en plus des candidats et des idées, qui ne sont pas datés. Un
 * engagement, un événement ou une nuit qui n'appartient qu'aux autres jours n'y figure pas.
 */
export function pointsDesJours(
  entree: Pick<EntreeMoteur, "voyage" | "nuits" | "engagements" | "evenements">,
  jours?: readonly number[],
): PointsDuJour[] {
  const planifies = joursAPlanifier(entree.voyage, jours);
  return indicesDuVoyage(entree.voyage)
    .filter((index) => planifies.has(index))
    .map((index) => {
      const date = ajouterJours(entree.voyage.start, index - 1);
      const logements = logementsDuJour(index - 1, entree.nuits.length);
      const nuits = entree.nuits.length === 0 ? [] : [...new Set([logements.depart, logements.arrivee])];
      return {
        index,
        date,
        nuits,
        engagements: entree.engagements.filter((engagement) => engagement.date === date),
        evenements: entree.evenements.filter((evenement) => evenement.evenement.date === date),
      };
    });
}
