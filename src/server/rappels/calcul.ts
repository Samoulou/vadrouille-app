import "server-only";

import { accessUntil, instantLocal } from "@/lib/dates";
import { ATTENTE_MIN_MS, HEURE_ENVOI_RAPPEL, REVEIL_MAX_HEURES } from "@/server/config/rappels";

/**
 * Calcul des envois de rappel (M6c, ticket 1021 ; spécification M6 § 5.3 points 2 et 3 ; décision 0157 § 1.7 point 2) :
 * fonctions pures, horloge passée en paramètre, aucune base. L'heure locale passe par `instantLocal` (`src/lib/dates.ts`,
 * M6b, seule conversion heure locale → instant) ; les dates par `accessUntil` (seul calcul de date + n jours, en UTC).
 *
 * - Envoi de la journée `n` (1 = J1) : la veille de sa date, à `HEURE_ENVOI_RAPPEL` (18:00) à l'heure de la destination ; de
 *   la veille de J1 à la veille du dernier jour ; aucun envoi le dernier jour ni après (M6-PO-8).
 * - Fenêtre d'un envoi : de son instant au premier instant de la journée (minuit de la destination). Un réveil en retard
 *   au-delà de minuit n'envoie rien (« au plus une fois », 0157 § 1.7 point 9).
 * - Aucun rattrapage après un accord tardif (spécification M6 § 5.2 point 3) : seuls comptent les envois dont l'instant
 *   n'est pas antérieur à l'instant de l'accord.
 */

/** Plus long voyage lu (borne de sécurité, forme d'une adresse `/jour/{n}` : trois chiffres au plus). */
export const JOURS_MAX = 999;

const HEURE_MS = 3_600_000;

export type VoyageDuRappel = {
  readonly start: string;
  readonly end: string;
  readonly timeZone: string;
};

/** Envoi d'une journée : son numéro, l'instant de l'envoi (la veille, 18:00) et la fin de sa fenêtre (minuit), en ms. */
export type EnvoiDeJournee = {
  readonly dayIndex: number;
  readonly instant: number;
  readonly finFenetre: number;
};

/** Envois du voyage, dans l'ordre des journées ; vide si les dates sont incohérentes ou le fuseau illisible. */
export function envoisDuVoyage(voyage: VoyageDuRappel): EnvoiDeJournee[] {
  if (voyage.end < voyage.start) return [];
  const envois: EnvoiDeJournee[] = [];
  try {
    for (let dayIndex = 1; dayIndex <= JOURS_MAX; dayIndex += 1) {
      const date = accessUntil(voyage.start, dayIndex - 1);
      if (date > voyage.end) break;
      const veille = accessUntil(voyage.start, dayIndex - 2);
      envois.push({
        dayIndex,
        instant: instantLocal(veille, HEURE_ENVOI_RAPPEL, voyage.timeZone).getTime(),
        finFenetre: instantLocal(date, "00:00", voyage.timeZone).getTime(),
      });
    }
  } catch {
    return [];
  }
  return envois;
}

/** Ce que décide un réveil : la journée à envoyer maintenant (ou aucune) et l'instant du prochain envoi (ou aucun). */
export type PlanDuReveil = {
  readonly aEnvoyer: number | null;
  readonly prochainEnvoi: number | null;
};

/**
 * Plan d'un réveil : `aEnvoyer` est la journée dont la fenêtre contient `maintenant`, si son envoi n'est pas antérieur à
 * l'accord et si elle n'est pas déjà réclamée ; `prochainEnvoi` est le plus proche instant d'envoi encore à venir (strictement
 * après `maintenant`, et pas avant l'accord).
 */
export function planDuReveil(entree: {
  readonly maintenant: number;
  readonly consentiA: number;
  readonly voyage: VoyageDuRappel;
  readonly reclames: ReadonlySet<number>;
}): PlanDuReveil {
  const admis = envoisDuVoyage(entree.voyage).filter((envoi) => envoi.instant >= entree.consentiA);
  const courant = admis.find((envoi) => envoi.instant <= entree.maintenant && entree.maintenant < envoi.finFenetre && !entree.reclames.has(envoi.dayIndex));
  const prochain = admis.find((envoi) => envoi.instant > entree.maintenant);
  return {
    aEnvoyer: courant?.dayIndex ?? null,
    prochainEnvoi: prochain?.instant ?? null,
  };
}

/** Attente jusqu'au prochain envoi, bornée à `REVEIL_MAX_HEURES` et à `ATTENTE_MIN_MS` au moins. */
export function attenteJusqua(prochainEnvoi: number, maintenant: number): number {
  return Math.min(Math.max(prochainEnvoi - maintenant, ATTENTE_MIN_MS), REVEIL_MAX_HEURES * HEURE_MS);
}

/**
 * Horloge accélérée, **`local` et `ci` seulement** (`RAPPELS_ACCELERATION`, `src/server/env/index.ts` ; revue de la PR
 * 1024, bloquant 2 du Tech Lead) : l'instant de l'accord devient le premier envoi du voyage, et le temps réel écoulé depuis
 * l'accord avance `facteur` fois plus vite. Facteur 1 (partout ailleurs) : l'horloge réelle, inchangée.
 */
export type HorlogeRappel = {
  /** Instant virtuel d'un instant réel. */
  readonly virtuel: (reel: number) => number;
  /** Instant de l'accord sur l'horloge virtuelle. */
  readonly consentiA: number;
  /** Attente réelle d'une attente virtuelle (divisée par le facteur, au moins `ATTENTE_MIN_MS`). */
  readonly reelle: (attenteVirtuelle: number) => number;
};

export function horlogeRappel(facteur: number, consentiReel: number, voyage: VoyageDuRappel): HorlogeRappel | null {
  if (facteur === 1) return { virtuel: (reel) => reel, consentiA: consentiReel, reelle: (attente) => attente };
  if (!Number.isSafeInteger(facteur) || facteur < 1) return null;
  const premier = envoisDuVoyage(voyage)[0];
  if (premier === undefined) return null;
  return {
    virtuel: (reel) => premier.instant + Math.max(reel - consentiReel, 0) * facteur,
    consentiA: premier.instant,
    reelle: (attente) => Math.max(Math.ceil(attente / facteur), ATTENTE_MIN_MS),
  };
}
