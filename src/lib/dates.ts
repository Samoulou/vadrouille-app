import type { Trip } from "@/contracts";
import { format, messages } from "@/i18n";

const t = messages.ligne.dates;
const plaque = messages.debloquer.plaque;

/**
 * Date ISO « AAAA-MM-JJ » écrite en toutes lettres, comme une date dans une phrase (redaction.md) :
 * « 2026-08-15 » → « 15 août 2026 ». Lecture du texte seulement, sans fuseau horaire.
 */
export function formatDateLongue(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const name = month ? t.mois[month - 1] : undefined;
  if (!year || !name || !day) return iso;
  return format(t.longue, { day, month: name, year });
}

function parts(iso: string): { year: number; month: number; day: number } | null {
  const [year, month, day] = iso.split("-").map(Number);
  return year && month && day ? { year, month, day } : null;
}

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * « sam. 29.08 » : jour de la semaine calculé depuis la date ISO en UTC (`Date.UTC`), sans fuseau horaire ;
 * avec `withYear`, « mar. 11.05.2027 ».
 */
export function formatDateCourte(iso: string, withYear = false): string {
  const date = parts(iso);
  if (!date) return iso;
  const jour = plaque.jours[new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay()] ?? "";
  const values = { jour, date: `${pad(date.day)}.${pad(date.month)}`, annee: date.year };
  return format(withYear ? plaque.dateAnnee : plaque.date, values);
}

/** « 2 adultes », « 2 adultes, 1 enfant ». */
export function formatVoyageurs(travellers: Trip["travellers"]): string {
  const list = [travellers.adults === 1 ? plaque.adultes.un : format(plaque.adultes.plusieurs, { n: travellers.adults })];
  if (travellers.children > 0) {
    list.push(travellers.children === 1 ? plaque.enfants.un : format(plaque.enfants.plusieurs, { n: travellers.children }));
  }
  return list.join(plaque.separateur);
}

/**
 * Ligne « {début} – {fin} · {voyageurs} » d'un voyage (décision 0021 § 3), seule implémentation, pour la plaque
 * et les lignes de « Mes voyages » : « sam. 29.08 – jeu. 03.09 · 2 adultes ». Avec `currentYear`, l'année suit
 * la date de fin quand le voyage ne commence pas cette année-là : « sam. 08.05 – mar. 11.05.2027 · 2 adultes »
 * (forme provisoire, UX/UI, Q154). Sans `currentYear`, jamais d'année (Séjour, écran 9).
 */
export function formatTripDates(
  start: string,
  end: string,
  travellers: Trip["travellers"],
  { currentYear }: { currentYear?: number } = {},
): string {
  const startYear = parts(start)?.year;
  const withYear = currentYear !== undefined && startYear !== undefined && startYear !== currentYear;
  return format(plaque.ligne, {
    debut: formatDateCourte(start),
    fin: formatDateCourte(end, withYear),
    voyageurs: formatVoyageurs(travellers),
  });
}
