import type { Weekday } from "@/contracts";
import { element } from "@/domain/tables";

/** Aides de calcul d'heures et de dates du moteur (minutes depuis minuit, dates ISO en UTC). */

export function versMinutes(heure: string): number {
  const [h, m] = heure.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** « HH:MM » ; refuse une heure hors de la journée (le moteur ne planifie pas après minuit). */
export function versHeure(minutes: number): string {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 23 * 60 + 59) {
    throw new RangeError("heure hors de la journée");
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Arrondi au multiple de 5 minutes supérieur. */
export function arrondi5(minutes: number): number {
  return Math.ceil(minutes / 5) * 5;
}

export function ajouterJours(date: string, jours: number): string {
  const instant = Date.parse(`${date}T00:00:00Z`) + jours * 86_400_000;
  return new Date(instant).toISOString().slice(0, 10);
}

export function joursEntre(debut: string, fin: string): number {
  return Math.round((Date.parse(`${fin}T00:00:00Z`) - Date.parse(`${debut}T00:00:00Z`)) / 86_400_000);
}

/** Jour de la semaine, 0 = dimanche (comme les plages d'ouverture de l'ancrage). */
export function jourSemaine(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

const LIBELLES_JOUR: readonly Weekday[] = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

export function libelleJour(date: string): Weekday {
  return element(LIBELLES_JOUR, jourSemaine(date)) ?? "lun.";
}
