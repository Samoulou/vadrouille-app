import "server-only";

import { createHash } from "node:crypto";

import type { Day, Stop, Trip } from "@/contracts";
import { instantLocal } from "@/lib/dates";

/**
 * Fichier `.ics` du programme (spécification M6 § 4 ; décision 0157 § 1.6, T6, et § 2.5, S5 ; ticket 1005, M6b) :
 * fonction pure `(programme, origine, maintenant) → texte iCalendar` (RFC 5545), sans entrée-sortie. N'importe que des
 * types de `@/contracts`, `node:crypto` (`UID`) et la conversion d'heure `instantLocal` ; les textes (nom du calendrier,
 * « À réserver. ») viennent de l'appelant, qui les lit dans `src/i18n`.
 *
 * Contenu de chaque entrée, **et rien d'autre** (§ 4 point 4) : `SUMMARY` = `Stop.name` (nom maison, jamais le
 * `displayName` de Google, 0010 § 1), `DTSTART` et `DTEND` en UTC (`…Z`, sans `TZID` ni `VTIMEZONE`, 0157 § 1.6 point 4),
 * `DESCRIPTION` (« À réserver. » pour une étape `toReserve`, puis l'adresse de la Journée), `URL`, `UID`, `DTSTAMP`,
 * `SEQUENCE`. **Aucune donnée Google** (§ 4 point 5) : ni `LOCATION`, ni `GEO`, ni `placeId`, ni faits, ni source.
 */

/** Programme lu par la route : le voyage et sa version courante (`SEQUENCE`). */
export type ProgrammeCalendrier = {
  readonly trip: Pick<Trip, "id" | "timeZone" | "days">;
  readonly version: number;
};

/** Textes écrits dans le fichier, lus par l'appelant dans `src/i18n/fr/sejour.json` (spécification M6 § 7). */
export type TextesCalendrier = {
  /** « {destination} · Programme », déjà composé (`X-WR-CALNAME`). */
  readonly nomCalendrier: string;
  /** « À réserver. » (`DESCRIPTION` d'une étape `toReserve`). */
  readonly aReserver: string;
};

/** Une entrée du calendrier : l'étape et sa journée. */
export type EntreeCalendrier = { readonly day: Day; readonly stop: Stop };

// Identifiant technique en minuscules, comme le domaine des `UID` (le nom affiché du produit, provisoire, reste dans
// `src/config/site.ts`).
const PRODID = "-//vadrouille//programme v1//FR";
const DOMAINE_UID = "vadrouille.invalid";
const PREFIXE_UID = "vadrouille/calendrier/v1|";
const OCTETS_PAR_LIGNE = 75;

/**
 * Étapes qui deviennent des entrées (§ 4 point 3, M6-PO-4) : les éléments `stop` de `Day.items` des journées qui ne sont
 * pas en préparation, sauf les engagements saisis (`commitment` : billets, réservations, que la personne a déjà). Ne
 * sont jamais des entrées : terminus, trajets, temps libres, repas à choisir, changements de ville, « Surprends-moi »
 * (`Day.surprise`) et événements de « Pendant ton séjour » (`Day.events`). Même règle que l'écran (`AjouterAuCalendrier`).
 */
export function entreesDuCalendrier(trip: Pick<Trip, "days">): EntreeCalendrier[] {
  const entrees: EntreeCalendrier[] = [];
  for (const day of trip.days) {
    if (day.generating) continue;
    for (const item of day.items) {
      if (item.type === "stop" && item.stop.commitment === undefined) entrees.push({ day, stop: item.stop });
    }
  }
  return entrees;
}

/**
 * `UID` stable par voyage et par étape (0157 § 1.6 point 6) : `base64url(SHA-256("vadrouille/calendrier/v1|" + tripId +
 * "|" + stopId))`, 22 premiers caractères, sous le domaine réservé `.invalid` (RFC 2606, Q640 ouverte).
 */
export function uidEtape(tripId: string, stopId: string): string {
  const empreinte = createHash("sha256").update(`${PREFIXE_UID}${tripId}|${stopId}`, "utf8").digest("base64url");
  return `${empreinte.slice(0, 22)}@${DOMAINE_UID}`;
}

/**
 * Nettoyage, premier temps (0157 § 1.6 point 8.1) : retrait des caractères de contrôle (U+0000 à U+001F sauf la
 * tabulation et U+000A ; U+007F à U+009F, dont U+0085), de U+2028 et U+2029, des marques et contrôles de direction et des
 * caractères de largeur nulle ; U+000D U+000A devient U+000A, un U+000D seul est retiré.
 */
export function nettoyer(texte: string): string {
  return texte
    .replace(/\r\n/g, "\n")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u2028\u2029\u200E\u200F\u202A-\u202E\u2066-\u2069\u200B-\u200D\uFEFF]/g, "");
}

/** Échappement d'une valeur `TEXT` (RFC 5545 § 3.3.11) : `\`, `;`, `,`, puis U+000A en `\n`. */
export function echapper(texte: string): string {
  return texte.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/** Valeur `TEXT` écrite dans le fichier : nettoyée, puis échappée (0157 § 1.6 point 8, dans cet ordre). */
export function texteIcs(texte: string): string {
  return echapper(nettoyer(texte));
}

/**
 * Pliage d'une ligne de contenu (RFC 5545 § 3.1) : au plus 75 octets par ligne, la suite précédée d'une espace, sans
 * jamais couper un caractère UTF-8 ; lignes séparées par CRLF.
 */
export function plier(ligne: string): string {
  const lignes: string[] = [];
  let courante = "";
  let octets = 0;
  for (const caractere of ligne) {
    const taille = Buffer.byteLength(caractere, "utf8");
    if (octets + taille > OCTETS_PAR_LIGNE) {
      lignes.push(courante);
      courante = ` ${caractere}`;
      octets = 1 + taille;
    } else {
      courante += caractere;
      octets += taille;
    }
  }
  lignes.push(courante);
  return lignes.join("\r\n");
}

const deux = (n: number) => String(n).padStart(2, "0");

/** Instant en UTC, forme `AAAAMMJJTHHMMSSZ`. */
export function instantIcs(instant: Date): string {
  return (
    `${instant.getUTCFullYear()}${deux(instant.getUTCMonth() + 1)}${deux(instant.getUTCDate())}` +
    `T${deux(instant.getUTCHours())}${deux(instant.getUTCMinutes())}${deux(instant.getUTCSeconds())}Z`
  );
}

/** Lendemain d'une date « AAAA-MM-JJ », sur le calendrier (fin d'une étape après minuit). */
function lendemain(date: string): string {
  const [annee, mois, jour] = date.split("-").map(Number);
  return new Date(Date.UTC(annee ?? 0, (mois ?? 1) - 1, (jour ?? 1) + 1)).toISOString().slice(0, 10);
}

/** Adresse de la Journée dans l'application (`/voyages/[id]/jour/[n]`, forme de `tripRoutes`), ou `null` sans origine. */
function adresseJournee(origine: string | null, tripId: string, index: number): string | null {
  return origine === null ? null : `${origine}/voyages/${encodeURIComponent(tripId)}/jour/${index}`;
}

/**
 * Texte iCalendar du programme : en-tête (`VERSION:2.0`, `PRODID`, `CALSCALE:GREGORIAN`, `METHOD:PUBLISH`,
 * `X-WR-CALNAME`), puis un `VEVENT` par entrée (`entreesDuCalendrier`). `origine` : origine de `APP_URL` (sans barre
 * finale) ; nulle, ni `URL` ni lien dans `DESCRIPTION` (0157 § 1.6 point 9). `maintenant` : `DTSTAMP`.
 */
export function genererIcs(programme: ProgrammeCalendrier, origine: string | null, maintenant: Date, textes: TextesCalendrier): string {
  const { trip, version } = programme;
  const dtstamp = instantIcs(maintenant);
  const lignes = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:${PRODID}`, "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${texteIcs(textes.nomCalendrier)}`];
  for (const { day, stop } of entreesDuCalendrier(trip)) {
    const adresse = adresseJournee(origine, trip.id, day.index);
    const description = [stop.exceptions.includes("toReserve") ? textes.aReserver : null, adresse].filter((partie) => partie !== null);
    lignes.push("BEGIN:VEVENT", `UID:${uidEtape(trip.id, stop.id)}`, `DTSTAMP:${dtstamp}`, `SEQUENCE:${version}`);
    lignes.push(`DTSTART:${instantIcs(instantLocal(day.date, stop.start, trip.timeZone))}`);
    if (stop.end !== undefined) {
      const date = stop.end >= stop.start ? day.date : lendemain(day.date);
      lignes.push(`DTEND:${instantIcs(instantLocal(date, stop.end, trip.timeZone))}`);
    }
    lignes.push(`SUMMARY:${texteIcs(stop.name)}`);
    if (description.length > 0) lignes.push(`DESCRIPTION:${texteIcs(description.join("\n"))}`);
    if (adresse !== null) lignes.push(`URL:${adresse}`);
    lignes.push("END:VEVENT");
  }
  lignes.push("END:VCALENDAR");
  return `${lignes.map(plier).join("\r\n")}\r\n`;
}
