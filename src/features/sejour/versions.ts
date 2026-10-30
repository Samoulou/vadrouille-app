import type { TripVersionSummary } from "@/contracts";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";

const t = messages.sejour.versions;

/**
 * Libellés de « Versions du programme » (tâche M5b ; spécification M5 § 4 et § 9) : composés à l'affichage depuis la sorte
 * et les noms **du programme** (`Stop.name` : nom de l'IA ou nom saisi, jamais un nom Google), jamais stockés.
 */

/**
 * Date et heure d'une version **à l'heure de l'appareil** : « mar. 28.10, 14:05 ». Lue après le montage seulement (le
 * serveur ne connaît pas le fuseau de l'appareil) ; `timeZone` : tests seulement.
 */
export function formatMomentVersion(iso: string, timeZone?: string): string {
  return formatMoment(t.moment, iso, timeZone);
}

/** Même instant **dans une phrase** (« Retour à la version du mer. 28.10 à 14:05 ») : sans virgule (revue de la PR 938, mineur 4). */
export function formatMomentPhrase(iso: string, timeZone?: string): string {
  return formatMoment(t.momentPhrase, iso, timeZone);
}

function formatMoment(gabarit: string, iso: string, timeZone?: string): string {
  const date = new Date(iso);
  const options = timeZone === undefined ? {} : { timeZone };
  return format(gabarit, {
    jour: new Intl.DateTimeFormat("fr-CH", { weekday: "short", ...options }).format(date),
    date: new Intl.DateTimeFormat("fr-CH", { day: "2-digit", month: "2-digit", ...options }).format(date),
    heure: new Intl.DateTimeFormat("fr-CH", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", ...options }).format(date),
  });
}

/** Libellé d'une version (« Programme préparé », « {nom} verrouillé », « Retour à la version du {date} »…). */
export function libelleVersion(version: TripVersionSummary, timeZone?: string): string {
  const l = t.libelles;
  const nom = version.subject ?? "";
  switch (version.kind) {
    case "prepared":
    case "adjusted":
    case "complete":
      return l[version.kind];
    case "replaced":
      return format(l.replaced, { ancien: version.previous ?? "", nouveau: nom });
    case "added":
      return format(l.added, { nom });
    case "moved":
      return format(l.moved, { nom, n: version.day ?? "" });
    case "locked":
      return format(l.locked, { nom });
    case "unlocked":
      return format(l.unlocked, { nom });
    case "reverted":
      return format(l.reverted, { date: version.revertedTo ? formatMomentPhrase(version.revertedTo.createdAt, timeZone) : "" });
  }
}

/** Version proposée au retour ou version actuelle : liste principale ; les autres, sous « Avant le déblocage ». */
export function avantLeDeblocage(version: TripVersionSummary): boolean {
  return !version.current && !version.revertible;
}
