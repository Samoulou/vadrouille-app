import "server-only";

import { TripSnapshotSchema, type Day, type DayLineItem, type Stop, type Trip, type TripSnapshot } from "@/contracts";
import { urlSourceValide } from "@/domain/validation";

import { LONGUEUR_LIBELLE_SOURCE } from "./assemblage";

/**
 * Instantané d'un programme de la chaîne inversée pour `trip_versions.snapshot` (décision 0136 § 1.8 et § 3.1 ; M1a-2) :
 * fonction pure `Trip` → `TripSnapshot`, **les journées seulement** (`{ days }` : l'en-tête vit dans `trips`, les lignes
 * « À faire » dans `checklist_items`, aucune position, terminus recomposé depuis `stays`). Ce n'est pas `reduireProgramme`
 * (`src/prototype/reduction.ts`, forme du site d'essai) : les deux retirent les mêmes clés dérivées de Google, mais chacune
 * est tenue par le schéma strict de sa cible (test de parité `instantane: mêmes clés retirées que reduireProgramme`).
 *
 * Retirés (les `omit` de `SegmentSnapshotSchema`, `StopSnapshotSchema`, `SurpriseIdeaSnapshotSchema` et `DaySnapshotSchema`) :
 * `Segment.minutes`, `Day.travelMinutes`, `Day.generating`, `Day.budgetPerPerson`, `Stop.verifiedAt`,
 * `SurpriseIdea.verifiedAt`. Gardés tels quels : terminus (`label` maison), étapes (nom, heures, `reason`, faits, conseil,
 * prix, horaires, `source` du site vérifié, `toReserve`), lignes `free`, segments (mode, `estimated`), engagements en
 * `events`, `theme`. `toConfirm` n'est jamais écrit : `refineSnapshotExceptions` le refuse (`TripSnapshotSchema.parse` lève).
 *
 * **Condition S4-1** (verdict 0139 § 4.3) : `SourceSchema` ne borne ni le libellé ni l'adresse ; une `source` n'est gardée
 * que si son `url` passe la règle de `urlSourceValide` (`https`, sans identifiants, nom d'hôte non vide, 2 048 au plus) et a
 * au plus `URL_SOURCE_REDUITE_MAX` caractères (adresse réduite, 0122 § 1 condition 3), et si son `label` a au plus
 * `LONGUEUR_LIBELLE_SOURCE` caractères ; sinon la `source` est retirée et l'étape gardée. La règle d'URL est celle de
 * `@/domain/validation` (copie de `src/prototype/programme-reduit.ts` tenue égale par `tests/unit/p0/copies.test.ts`),
 * aucune copie nouvelle.
 *
 * Module pur : n'importe que `@/contracts`, `src/domain` et `assemblage.ts` (règles du dossier, 0136 § 1.2).
 */

/** Longueur maximale de l'adresse réduite d'un site gardée dans `Stop.source.url` (0122 § 1 condition 3 ; 0139 S4-1). */
export const URL_SOURCE_REDUITE_MAX = 300;

/** Source gardée selon S4-1, ou `undefined`. */
export function sourceAdmise(source: Stop["source"]): Stop["source"] {
  if (source === undefined) return undefined;
  if (source.label.length > LONGUEUR_LIBELLE_SOURCE || source.url.length > URL_SOURCE_REDUITE_MAX || !urlSourceValide(source.url)) return undefined;
  return source;
}

/** Copie de `valeur` sans les clés nommées (les `omit` des schémas de l'instantané). */
function sans<T extends object>(valeur: T, cles: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(valeur).filter(([cle]) => !cles.includes(cle)));
}

function etape(stop: Stop): Record<string, unknown> {
  const reste = sans(stop, ["verifiedAt", "source"]);
  const gardee = sourceAdmise(stop.source);
  return gardee === undefined ? reste : { ...reste, source: gardee };
}

function ligne(item: DayLineItem): Record<string, unknown> {
  switch (item.type) {
    case "stop":
      return { type: "stop", stop: etape(item.stop) };
    case "segment":
      return { type: "segment", segment: sans(item.segment, ["minutes"]) };
    default:
      return item;
  }
}

function jour(valeur: Day): Record<string, unknown> {
  return {
    ...sans(valeur, ["travelMinutes", "generating", "budgetPerPerson", "items", "events", "surprise"]),
    items: valeur.items.map(ligne),
    events: valeur.events.map(etape),
    ...(valeur.surprise === undefined ? {} : { surprise: sans(valeur.surprise, ["verifiedAt"]) }),
  };
}

/** Instantané validé des journées du voyage assemblé ; lève (`ZodError`) si le schéma strict refuse (`toConfirm`, clé de trop). */
export function instantaneDuProgramme(trip: Pick<Trip, "days">): TripSnapshot {
  return TripSnapshotSchema.parse({ days: trip.days.map(jour) });
}
