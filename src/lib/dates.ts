import type { Trip } from "@/contracts";
import { weekdayOf } from "@/contracts/values";
import { format, messages } from "@/i18n";

const t = messages.ligne.dates;
const plaque = messages.debloquer.plaque;

function parts(iso: string): { year: number; month: number; day: number } | null {
  const [year, month, day] = iso.split("-").map(Number);
  return year && month && day ? { year, month, day } : null;
}

/** Jour du mois : « 1er » pour le premier (B2-PO-12, suffixe de `fr.json`), le nombre seul sinon. */
function jourDuMois(day: number): string {
  return day === 1 ? `${day}${t.premier}` : String(day);
}

/** Rang du jour de la semaine (0 = dimanche), calculé en UTC (`Date.UTC`), sans fuseau horaire. */
function rangSemaine(date: { year: number; month: number; day: number }): number {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}

/**
 * Date ISO « AAAA-MM-JJ » écrite en toutes lettres, comme une date dans une phrase (redaction.md) :
 * « 2026-08-15 » → « 15 août 2026 », « 2026-09-01 » → « 1er septembre 2026 ». Lecture du texte seulement, sans
 * fuseau horaire.
 */
export function formatDateLongue(iso: string): string {
  const date = parts(iso);
  const name = date ? t.mois[date.month - 1] : undefined;
  if (!date || !name) return iso;
  return format(t.longue, { day: jourDuMois(date.day), month: name, year: date.year });
}

/**
 * Titre d'une Journée, calculé depuis `Day.date` (évolution E1 de B2) : « Samedi 29 août »,
 * « Mardi 1er septembre ».
 */
export function formatTitreJour(iso: string): string {
  const date = parts(iso);
  const month = date ? t.mois[date.month - 1] : undefined;
  const jour = date ? t.joursTitre[rangSemaine(date)] : undefined;
  if (!date || !month || !jour) return iso;
  return format(t.titre, { jour, day: jourDuMois(date.day), month });
}

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * « sam. 29.08 » : jour de la semaine par `weekdayOf` (`@/contracts/values`, seul calcul, en UTC) ;
 * avec `withYear`, « mar. 11.05.2027 ».
 */
export function formatDateCourte(iso: string, withYear = false): string {
  const date = parts(iso);
  if (!date) return iso;
  const jour = weekdayOf(iso) ?? "";
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

/**
 * Fin de l'accès et du partage : date ISO de fin du voyage + `days` jours (cadrage § 4), en ISO « AAAA-MM-JJ ».
 * Seule implémentation (décision 0039, F10-TL-7 point 1), partagée par l'écran 9 et le partage (F10-PO-21) ;
 * calcul sur le calendrier, en UTC, sans fuseau horaire.
 */
export function accessUntil(end: string, days: number): string {
  const [year, month, day] = end.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + days));
  return date.toISOString().slice(0, 10);
}
