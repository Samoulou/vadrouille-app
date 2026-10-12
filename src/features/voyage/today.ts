/**
 * Date de la destination (décision 0021 § 3) : seul calcul de « aujourd'hui » dans l'application, partagé par
 * « Mes voyages » (F11a) et l'écran 15 (F10a, qui y ajoute le jour courant et la prochaine étape).
 * Fonctions pures, horloge injectée (`now` en millisecondes), sans bibliothèque de dates.
 */

/** Date ISO « AAAA-MM-JJ ». */
export type IsoDate = string;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    // Lève une RangeError pour un fuseau inconnu (le schéma `Trip.timeZone` l'a déjà refusé).
    formatter = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/**
 * Date du calendrier à l'instant `now` dans le fuseau `timeZone` (identifiant IANA), « AAAA-MM-JJ ». Lue par
 * `formatToParts`, jamais dans l'ordre d'un format régional.
 */
export function localDateAt(now: number, timeZone: string): IsoDate {
  const parts = formatterFor(timeZone).formatToParts(new Date(now));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year").padStart(4, "0")}-${part("month")}-${part("day")}`;
}

/** Année d'une date ISO. */
export function yearOf(date: IsoDate): number {
  return Number(date.slice(0, 4));
}
