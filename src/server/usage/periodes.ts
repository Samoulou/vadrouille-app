import "server-only";

import type { Fournisseur, Periode } from "./port";

/**
 * Périodes du port de consommation (décision 0046, D20) : **une seule fonction pure** côté code, à horloge injectée,
 * pour le registre en mémoire et l'affichage. Le port reçoit des bornes (`Periode`, millisecondes depuis l'époque Unix,
 * `du` inclus, `au` exclu) ; il ne calcule aucun fuseau.
 *
 * - **Google** : jour de quota et mois du plafond de 20 USD à minuit **heure du Pacifique** (`America/Los_Angeles`,
 *   #172, D20 point 1).
 * - **Modèles** (OpenRouter) : jour et mois en **UTC** (D20 point 2 ; Q325 reste à Samuel).
 *
 * En base, le jour de quota Google est posé par la base (`prototype.quota_day_at`, S1), seule source des lignes écrites
 * et des sommes comparées ; `jourDeQuotaGoogle` en est l'équivalent pur, et un test de la base vérifie que les deux
 * calculs concordent (`base: quota_day_at égal à periodes.ts`). L'enveloppe jusqu'à G0 n'a aucune période (Q329).
 *
 * Module pur : aucune lecture d'environnement, aucune horloge implicite.
 */

export const FUSEAU_GOOGLE = "America/Los_Angeles";

const MINUTE_MS = 60_000;
const HEURE_MS = 60 * MINUTE_MS;

/** Date civile (année, mois de 1 à 12, jour). */
type DateCivile = { readonly annee: number; readonly mois: number; readonly jour: number };

const formateurPacifique = new Intl.DateTimeFormat("en-US", {
  timeZone: FUSEAU_GOOGLE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function verifierInstant(instant: number): void {
  if (!Number.isFinite(instant)) throw new RangeError("periodes: instant invalide");
}

/** Date civile et heure, minute d'un instant à l'heure du Pacifique. */
function lirePacifique(instant: number): DateCivile & { readonly heure: number; readonly minute: number } {
  const parties = Object.fromEntries(formateurPacifique.formatToParts(new Date(instant)).map((p) => [p.type, p.value]));
  return {
    annee: Number(parties.year),
    mois: Number(parties.month),
    jour: Number(parties.day),
    heure: Number(parties.hour),
    minute: Number(parties.minute),
  };
}

/**
 * Instant de minuit, heure du Pacifique, d'une date civile. Le décalage vaut 7 h (PDT) ou 8 h (PST) ; les changements
 * d'heure des États-Unis ont lieu à 2 h du matin, jamais à minuit : un seul des deux candidats tombe à 00:00.
 */
function minuitPacifique(date: DateCivile): number {
  const base = Date.UTC(date.annee, date.mois - 1, date.jour);
  for (const decalage of [7, 8]) {
    const candidat = base + decalage * HEURE_MS;
    const lu = lirePacifique(candidat);
    if (lu.annee === date.annee && lu.mois === date.mois && lu.jour === date.jour && lu.heure === 0 && lu.minute === 0) return candidat;
  }
  throw new RangeError("periodes: minuit introuvable à l'heure du Pacifique");
}

/** Date civile suivante (calendrier grégorien, sans fuseau). */
function lendemain(date: DateCivile): DateCivile {
  const suivant = new Date(Date.UTC(date.annee, date.mois - 1, date.jour + 1));
  return { annee: suivant.getUTCFullYear(), mois: suivant.getUTCMonth() + 1, jour: suivant.getUTCDate() };
}

/** Premier jour du mois suivant. */
function moisSuivant(date: DateCivile): DateCivile {
  return date.mois === 12 ? { annee: date.annee + 1, mois: 1, jour: 1 } : { annee: date.annee, mois: date.mois + 1, jour: 1 };
}

const enTexte = (date: DateCivile) =>
  `${String(date.annee).padStart(4, "0")}-${String(date.mois).padStart(2, "0")}-${String(date.jour).padStart(2, "0")}`;

/** Jour de quota Google d'un instant, au format `AAAA-MM-JJ` : égal à `prototype.quota_day_at` de la base (S1). */
export function jourDeQuotaGoogle(instant: number): string {
  verifierInstant(instant);
  return enTexte(lirePacifique(instant));
}

/** Jour de quota Google (minuit à minuit, heure du Pacifique) contenant l'instant. */
export function jourGoogle(instant: number): Periode {
  verifierInstant(instant);
  const date = lirePacifique(instant);
  return { du: minuitPacifique(date), au: minuitPacifique(lendemain(date)) };
}

/** Mois du plafond Google (premier jour à minuit, heure du Pacifique) contenant l'instant. */
export function moisGoogle(instant: number): Periode {
  verifierInstant(instant);
  const date = lirePacifique(instant);
  const premier = { annee: date.annee, mois: date.mois, jour: 1 };
  return { du: minuitPacifique(premier), au: minuitPacifique(moisSuivant(premier)) };
}

/** Jour UTC des modèles contenant l'instant. */
export function jourModeles(instant: number): Periode {
  verifierInstant(instant);
  const d = new Date(instant);
  const du = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return { du, au: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) };
}

/** Mois UTC des modèles contenant l'instant. */
export function moisModeles(instant: number): Periode {
  verifierInstant(instant);
  const d = new Date(instant);
  return { du: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1), au: Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) };
}

/** Périodes d'un appel pour un fournisseur (champ `periodes` de `ContexteAppel`), à l'instant de l'horloge injectée. */
export function periodesDe(fournisseur: Fournisseur, horloge: { maintenant(): number }): { readonly jour: Periode; readonly mois: Periode } {
  const instant = horloge.maintenant();
  return fournisseur === "google" ? { jour: jourGoogle(instant), mois: moisGoogle(instant) } : { jour: jourModeles(instant), mois: moisModeles(instant) };
}
