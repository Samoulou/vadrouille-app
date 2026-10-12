import type { Trip } from "@/contracts";
import { format, messages } from "@/i18n";

const t = messages.debloquer.plaque;

/** « sam. 29.08 » : jour de la semaine calculé depuis la date ISO, sans fuseau horaire. */
export function formatDateCourte(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  const weekday = t.jours[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? "";
  return format(t.date, { jour: weekday, date: `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}` });
}

/** « 2 adultes », « 2 adultes, 1 enfant ». */
export function formatVoyageurs(travellers: Trip["travellers"]): string {
  const parts = [travellers.adults === 1 ? t.adultes.un : format(t.adultes.plusieurs, { n: travellers.adults })];
  if (travellers.children > 0) {
    parts.push(travellers.children === 1 ? t.enfants.un : format(t.enfants.plusieurs, { n: travellers.children }));
  }
  return parts.join(t.separateur);
}

/**
 * Ligne d'informations de la `DestinationPlate`, au format de F5 (F5, écran 11) :
 * « sam. 29.08 – jeu. 03.09 · 2 adultes ».
 */
export function plateMeta(trip: Pick<Trip, "start" | "end" | "travellers">): string {
  return format(t.ligne, {
    debut: formatDateCourte(trip.start),
    fin: formatDateCourte(trip.end),
    voyageurs: formatVoyageurs(trip.travellers),
  });
}
