import type { DayLineItem, Stop } from "@/contracts";
import type { ReviewAccess } from "@/contracts/values";

/**
 * Écran 16 « Après le voyage » (tâche M8a, ticket 1062 ; décision 0160 § 1.5 point 4 ; spécification
 * la spécification M8 § 3.1 point 4 et § 3.2 point 1). Fonctions pures **uniques**, appelées par l'écran
 * (`ReviewScreen`), par le serveur (`src/server/avis/`, contrôle de `stopId` et filtre des avis lus) et par `mock`
 * (`getTripReview` de `@/adapters`). Module chargé par le navigateur (`CLIENT_DOMAIN_PATTERN` de `eslint.config.mjs`) :
 * il n'importe que des types de `@/contracts` et de `@/contracts/values`, ni `zod` ni `src/server`.
 */

/** Date « AAAA-MM-JJ » (l'ordre des chaînes est celui des dates). */
type IsoDate = string;

/** Étape lue dans une ligne du jour : `Stop` du voyage (`Trip`) ou de l'instantané (`StopSnapshot`), mêmes champs. */
type EtapeLue = Pick<Stop, "id" | "kind" | "placeId" | "name">;

/** Élément d'une ligne du jour, du voyage ou de l'instantané : seule la variante `stop` est lue. */
type ElementLu = { readonly type: "stop"; readonly stop: EtapeLue } | { readonly type: Exclude<DayLineItem["type"], "stop"> };

/**
 * Jour lu : `Day` du voyage (avec `generating`) ou `DaySnapshot` de la version courante (sans `generating` : une journée
 * en préparation n'y a aucune étape, prédicat de 0086 § 1.7). `events` (événements hors programme) n'est jamais lu.
 */
export type JourAEvaluer = { readonly index: number; readonly generating?: boolean; readonly items: readonly ElementLu[] };

/** Étape à évaluer : identifiant maison, lieu de la version courante (seule donnée Google, 0011), sorte, nom, jour. */
export type EtapeAEvaluer = {
  readonly stopId: string;
  readonly placeId: string | null;
  readonly kind: Stop["kind"];
  readonly name: string;
  readonly dayIndex: number;
};

/**
 * Étapes à évaluer de la version lue, jour par jour, dans l'ordre du programme (spécification § 3.2 point 1) : activité,
 * repas, événement placé dans la ligne du jour, lieu à soi et adresse découverte ; ni terminus, ni segment, ni temps libre,
 * ni repas pas encore choisi (`openMeal`), ni changement de ville, ni événement de `Day.events`, ni journée en préparation.
 * Un identifiant d'étape répété (jeu incohérent) n'est gardé qu'une fois, à sa première place.
 */
export function etapesAEvaluer(days: readonly JourAEvaluer[]): EtapeAEvaluer[] {
  const vus = new Set<string>();
  const etapes: EtapeAEvaluer[] = [];
  for (const day of days) {
    if (day.generating === true) continue;
    for (const item of day.items) {
      if (item.type !== "stop" || vus.has(item.stop.id)) continue;
      vus.add(item.stop.id);
      const { id, kind, placeId, name } = item.stop;
      etapes.push({ stopId: id, placeId: placeId ?? null, kind, name, dayIndex: day.index });
    }
  }
  return etapes;
}

/**
 * Accès à l'écran 16, à la date locale de la destination (spécification § 3.1 point 4 ; Q149) : avant le dernier jour,
 * `notEnded` ; du dernier jour à `finAcces` compris (`accessUntil(trip.end, accessDaysAfterReturn)`), `open` ; après,
 * `readOnly`. Calculé par le serveur seulement (0160 § 1.5 point 3), pour la lecture comme pour chaque écriture.
 */
export function accesApresVoyage(fin: IsoDate, finAcces: IsoDate, aujourdhui: IsoDate): ReviewAccess {
  if (aujourdhui < fin) return "notEnded";
  return aujourdhui <= finAcces ? "open" : "readOnly";
}
