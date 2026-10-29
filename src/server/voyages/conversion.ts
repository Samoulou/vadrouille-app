import "server-only";

import { ChecklistItemSchema, type ChecklistItem, type DaySnapshot, type TripSnapshot } from "@/contracts";
import { TRIP_ID_PATTERN } from "@/contracts/values";
import type { DateDeVerification, RefVerification } from "@/domain/recomposition";
import { ORDRE_MODES, type ModeTrajet } from "@/domain/relectures";

/**
 * Conversions des lignes lues en base vers les entrées du moteur (spécification B6, B6a ; décision 0086). Fonctions
 * pures, testées sans base : identifiant reçu (B6-PO-11), mobilité de `briefs` (B6-PO-4, réponse de data point 4),
 * logements par nuit (B6-PO-17, réponse de data point 5), `verifiedAt` depuis la chaîne des versions (B6-PO-6, Q259).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ligne de `checklist_items` (colonnes `id`, `label`, `moment`, `done`, `booking_url`, `sponsored`, `stop_id`) en
 * `ChecklistItem` validé, ou `null` si elle ne valide pas le contrat. Partagée par la lecture (`getTrip`) et l'action
 * `toggleChecklistItem` (B6b) : une seule conversion. Le contrôle de l'étape désignée (`checklist_orphan`) reste à la
 * lecture, qui a l'instantané.
 */
export function elementAFaire(ligne: Readonly<Record<string, unknown>>): ChecklistItem | null {
  const stopId = typeof ligne.stop_id === "string" ? ligne.stop_id : undefined;
  const item = ChecklistItemSchema.safeParse({
    id: ligne.id,
    // Sorte de la ligne (décision 0147 § 6.2) : colonne `kind`, fermée par `checklist_items_kind_check`.
    kind: ligne.kind,
    label: ligne.label,
    when: ligne.moment,
    done: ligne.done,
    sponsored: ligne.sponsored,
    ...(ligne.booking_url === null ? {} : { bookingUrl: ligne.booking_url }),
    ...(stopId === undefined ? {} : { stopId }),
  });
  return item.success ? item.data : null;
}

/** Identifiant lisible en base (B6-PO-11) : `TRIP_ID_PATTERN`, puis `uuid` ; sinon inconnu, sans requête. */
export function identifiantLisible(tripId: unknown): tripId is string {
  return typeof tripId === "string" && TRIP_ID_PATTERN.test(tripId) && UUID.test(tripId);
}

/**
 * `briefs.mobility` (colonne `text`, en attendant `text[]` de B9b, 0081 (e)) en modes, lecture **stricte** (réponse
 * de data, point 4) : `null` ou `''` donnent `[]` (les trois modes admis par `modesAdmis`) ; sinon des modes connus
 * séparés par `,`, sans espace, sans doublon, dans l'ordre de `ORDRE_MODES` (`walk,transit`). Toute autre valeur
 * (`walk,`, ` walk`, `walk,walk`, `transit,walk`, `walk,plane`) : `null` (`mobility_invalid`).
 */
export function mobiliteDepuisColonne(valeur: unknown): ModeTrajet[] | null {
  if (valeur === null || valeur === "") return [];
  if (typeof valeur !== "string") return null;
  const modes: ModeTrajet[] = [];
  let rangPrecedent = -1;
  for (const morceau of valeur.split(",")) {
    const rang = ORDRE_MODES.findIndex((mode) => mode === morceau);
    const mode = ORDRE_MODES[rang];
    if (mode === undefined || rang <= rangPrecedent) return null;
    modes.push(mode);
    rangPrecedent = rang;
  }
  return modes;
}

const JOUR_MS = 86_400_000;
const versInstant = (date: string) => Date.parse(`${date}T00:00:00Z`);
const versDate = (instant: number) => new Date(instant).toISOString().slice(0, 10);

/** Nombre de nuits du voyage (`end − start`, B6-PO-17). */
export function nombreDeNuits(start: string, end: string): number {
  return Math.round((versInstant(end) - versInstant(start)) / JOUR_MS);
}

/**
 * Séjour (ligne `stays`) de chaque nuit (B6-PO-17, 0100 § 6.2) : la nuit `n` est la date `start + n` ; elle appartient à la ligne `stays` telle
 * que `from_date ≤ D < to_date` (borne exclusive, 0081 (f), confirmée par data). Une nuit sans ligne ou couverte par
 * deux lignes : `null` (`stay_missing`). Une ligne qui ne couvre aucune nuit (`to_date = from_date`) n'est lue par
 * aucune nuit (réponse de data, point 5).
 */
export function sejoursParNuit<T extends { readonly from: string; readonly to: string }>(stays: readonly T[], start: string, end: string): T[] | null {
  const nuits = nombreDeNuits(start, end);
  const sejours: T[] = [];
  for (let n = 0; n < nuits; n += 1) {
    const nuit = versDate(versInstant(start) + n * JOUR_MS);
    const lignes = stays.filter((stay) => stay.from <= nuit && nuit < stay.to);
    const [ligne] = lignes;
    if (lignes.length !== 1 || ligne === undefined) return null;
    sejours.push(ligne);
  }
  return sejours;
}

/** `stays.place_id` de chaque nuit (B6-PO-17), `null` pour un séjour sans lieu ; mêmes règles que `sejoursParNuit`. */
export function logementsParNuit(
  stays: readonly { readonly placeId: string | null; readonly from: string; readonly to: string }[],
  start: string,
  end: string,
): (string | null)[] | null {
  const sejours = sejoursParNuit(stays, start, end);
  return sejours === null ? null : sejours.map((sejour) => sejour.placeId);
}

/** Date (AAAA-MM-JJ) d'un instant dans le fuseau du voyage (B6-PO-6). */
export function dateDansFuseau(instantMs: number, timeZone: string): string {
  const parties = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instantMs);
  const partie = (type: string) => parties.find((p) => p.type === type)?.value ?? "";
  return `${partie("year")}-${partie("month")}-${partie("day")}`;
}

/** Version de la chaîne des parents, de la courante à la plus ancienne. */
export type VersionDeChaine = { readonly version: number; readonly snapshot: TripSnapshot; readonly createdAtMs: number };

function trouver(jour: DaySnapshot | undefined, ref: RefVerification): { placeId?: string; start?: string; end?: string } | undefined {
  if (jour === undefined) return undefined;
  if (ref.genre === "surprise") return jour.surprise?.id === ref.id ? jour.surprise : undefined;
  const liste = ref.genre === "stop" ? jour.items.flatMap((item) => (item.type === "stop" ? [item.stop] : [])) : jour.events;
  return liste.find((stop) => stop.id === ref.id);
}

/**
 * `verifiedAt` (B6-PO-6, Q259) : date, dans le fuseau du voyage, de `created_at` de la plus ancienne version de la
 * chaîne des parents depuis laquelle l'élément est inchangé (même `id`, même `placeId`, même jour, mêmes `start` et
 * `end` ; l'idée « Surprends-moi » : même `id` et même `placeId`, même jour). `chaine[0]` est la version courante.
 */
export function datesDeVerification(chaine: readonly VersionDeChaine[], timeZone: string): DateDeVerification {
  return (jourIndex, ref) => {
    const courante = chaine[0];
    if (courante === undefined) return undefined;
    const reference = trouver(courante.snapshot.days.find((d) => d.index === jourIndex), ref);
    if (reference === undefined) return undefined;
    let verifiee = courante;
    for (const version of chaine.slice(1)) {
      const element = trouver(version.snapshot.days.find((d) => d.index === jourIndex), ref);
      const inchangee =
        element !== undefined && element.placeId === ref.placeId && element.start === reference.start && element.end === reference.end;
      if (!inchangee) break;
      verifiee = version;
    }
    return dateDansFuseau(verifiee.createdAtMs, timeZone);
  };
}
