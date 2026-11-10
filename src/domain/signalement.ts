import type { Stop } from "@/contracts";

/**
 * Règles pures du signalement d'une erreur sur une étape (tâche M5c, ticket 904 ; décision 0147 § 1 point 4 ;
 * spécification M5, § 5) : quelles étapes se signalent, et où se trouve l'étape visée. Aucune donnée
 * Google autre que le `placeId` de l'étape ; aucune lecture ni écriture : le cas d'usage de `api`
 * (`src/server/voyages/signalement.ts`) l'importe directement, l'adaptateur `mock` par la réexportation
 * `src/server/programme/signalement.ts` (frontière de 0048 § 1) ; la fiche refait `etapeSignalable` (0112 § 2).
 */

/** Ce qu'une règle de signalement lit d'une étape. */
export type EtapeSignalable = Pick<Stop, "id" | "placeId" | "commitment" | "addedBy">;

/** Ligne d'un jour (`Day` lu ou `DaySnapshot` stocké) : seule une ligne `stop` porte une étape. */
type LigneDeJour = { readonly type: string; readonly stop?: EtapeSignalable };

/** Jour lu (`Day`) ou stocké (`DaySnapshot`) : ses lignes et ses événements (`Day.events`). */
export type JourSignalable = { readonly items: readonly LigneDeJour[]; readonly events: readonly { readonly id: string }[] };

/**
 * Une étape du programme se signale, sauf un engagement (`commitment`) et un lieu à soi (`addedBy: "person"`) : la personne
 * les a saisis (spécification § 5, « Où »). Un événement de `Day.events` ne se signale jamais (il n'est pas une étape).
 */
export function etapeSignalable(stop: EtapeSignalable): boolean {
  return stop.commitment === undefined && stop.addedBy !== "person";
}

/** Situation de l'étape visée dans les jours lisibles du voyage. */
export type SituationSignalement =
  | { readonly type: "absente" }
  | { readonly type: "non_signalable" }
  | { readonly type: "signalable"; readonly placeId: string | null };

/**
 * Situe `stopId` dans `jours` (les jours **lisibles** : avant le déblocage, les seules journées servies) : `absente` (rendue
 * `not_found`), `non_signalable` (événement, engagement ou lieu à soi : `validation_failed`, `field: "stopId"`), ou
 * `signalable` avec le `placeId` de l'étape (seule donnée Google stockable, `null` sans lieu).
 */
export function situerEtapeSignalee(jours: readonly JourSignalable[], stopId: string): SituationSignalement {
  for (const jour of jours) {
    if (jour.events.some((evenement) => evenement.id === stopId)) return { type: "non_signalable" };
    for (const ligne of jour.items) {
      const stop = ligne.type === "stop" ? ligne.stop : undefined;
      if (stop === undefined || stop.id !== stopId) continue;
      return etapeSignalable(stop) ? { type: "signalable", placeId: stop.placeId ?? null } : { type: "non_signalable" };
    }
  }
  return { type: "absente" };
}

/**
 * Début du jour UTC de l'instant `ms` (millisecondes depuis l'époque), borne du plafond par voyage et par jour UTC (décision
 * 0147 § 2 : minuit UTC, jamais le jour du fuseau local) ; même borne que la requête de `api`.
 */
export function debutDuJourUtc(ms: number): number {
  const instant = new Date(ms);
  return Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate());
}
