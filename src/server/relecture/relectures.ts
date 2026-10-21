import "server-only";

import { INCONNU, type Duree, type Inconnu, type ModeTrajet, type Plage, type Point, type Relectures, type Validite } from "@/domain/relectures";
import { plagesDeFiche } from "@/domain/plages-fiche";
import type { IssueFiche } from "@/grounding/fiches";
import type { TableTrajets } from "@/grounding/trajets";

/**
 * Tables de relecture conformes à l'interface du moteur (B8a ; spécification B8, B8-PO-6 à B8-PO-8 ; décision 0085
 * § 1.7). N'importe de `@/grounding` **que des types** : aucun appel Google, aucune estimation (faite par
 * `chargerTrajets` et `chargerTrajetsParCouples`). Importable seulement par les compositions
 * `src/server/composition/generation.ts` (B9c) et `src/server/composition/lecture.ts` (B8b), par la source de la lecture
 * (`source.ts`) et les tests (0100 § 5.2, règle `ligne/relecture-imports`).
 *
 * Correspondance des issues (B8-PO-6) :
 * - `chargee` + `OPERATIONAL` ou statut absent (Q460) → `valide`, plages des horaires réguliers ;
 * - `chargee` + `CLOSED_TEMPORARILY` → `valide`, plages **vides** en `planification` (R4 l'écarte), **inconnues** en
 *   `lecture` (`aConfirmer` pose `toConfirm`) ;
 * - `chargee` + `CLOSED_PERMANENTLY` → `ferme_definitivement`, plages inconnues dans les deux usages ;
 * - `introuvable` → `introuvable`, plages inconnues dans les deux usages ;
 * - `placeId` sans issue (non relu) → `inconnu` (`exceptionsLues` ne le passe pas à `aConfirmer`, 0100 § 4.2).
 * Horaires (B8-PO-7) : plages du jour de la semaine de la date ; une plage qui passe minuit finit à
 * `1 440 + finLendemain` (≤ 2 880) ; horaires absents : `inconnu`. Les valeurs ne sortent jamais de la mémoire.
 */

export type UsageRelectures = "planification" | "lecture";

export type EntreeRelectures = {
  readonly usage: UsageRelectures;
  readonly fiches: readonly IssueFiche[];
  readonly trajets: TableTrajets;
  /**
   * **Clé de trajet** du point de départ de chaque nuit, index 0 = première nuit (décision 0087 § 3.2) : `placeId` du
   * logement, ou de la ville pour `area`, `none` ; clé maison (`cleMaison`) du centre d'un `suggestedArea`. Le moteur
   * garde `Point = { logement: index }`. `null` : nuit dont le point n'a pu être résolu (0100 § 6.2) : tout trajet qui
   * en part ou y arrive est `inconnu`.
   */
  readonly logementsParNuit: readonly (string | null)[];
};

export function versRelectures(entree: EntreeRelectures): Relectures {
  const issues = new Map<string, IssueFiche>();
  for (const fiche of entree.fiches) if (!issues.has(fiche.placeId)) issues.set(fiche.placeId, fiche);
  const { usage, trajets, logementsParNuit } = entree;

  const placeIdDe = (point: Point): string | undefined => ("lieu" in point ? point.lieu : (logementsParNuit[point.logement] ?? undefined));

  return {
    validite(placeId: string): Validite {
      const issue = issues.get(placeId);
      if (issue === undefined) return INCONNU;
      if (issue.issue === "introuvable") return "introuvable";
      return issue.statut === "CLOSED_PERMANENTLY" ? "ferme_definitivement" : "valide";
    },
    plages(placeId: string, date: string): readonly Plage[] | Inconnu {
      // Calcul extrait sans changement dans `@/domain/plages-fiche` (partagé avec la relecture des horaires, 0116 § 5.3).
      return plagesDeFiche(issues.get(placeId), date, usage);
    },
    duree(depuis: Point, vers: Point, mode: ModeTrajet): Duree | Inconnu {
      const de = placeIdDe(depuis);
      const a = placeIdDe(vers);
      if (de === undefined || a === undefined) return INCONNU;
      const duree = trajets.duree(de, a, mode);
      return duree === undefined ? INCONNU : { minutes: duree.minutes, estimee: duree.estimee };
    },
  };
}
