import "server-only";

import { INCONNU, type Duree, type Inconnu, type ModeTrajet, type Plage, type Point, type Relectures, type Validite } from "@/domain/relectures";
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

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Jour de la semaine d'une date AAAA-MM-JJ (0 = dimanche), ou `null` si la date est invalide. */
function jourDeLaSemaine(date: string): number | null {
  const lu = DATE.exec(date);
  if (lu === null) return null;
  const [annee, mois, jour] = [Number(lu[1]), Number(lu[2]), Number(lu[3])];
  const instant = new Date(Date.UTC(annee, mois - 1, jour));
  if (instant.getUTCFullYear() !== annee || instant.getUTCMonth() !== mois - 1 || instant.getUTCDate() !== jour) return null;
  return instant.getUTCDay();
}

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
      const issue = issues.get(placeId);
      if (issue === undefined || issue.issue === "introuvable" || issue.statut === "CLOSED_PERMANENTLY") return INCONNU;
      if (issue.statut === "CLOSED_TEMPORARILY") return usage === "planification" ? [] : INCONNU;
      if (issue.horaires === null) return INCONNU;
      const jour = jourDeLaSemaine(date);
      if (jour === null) return INCONNU;
      return issue.horaires
        .filter((plage) => plage.jour === jour)
        .map((plage) => ({ debut: plage.debut, fin: plage.finLendemain === undefined ? plage.fin : Math.min(1440 + plage.finLendemain, 2880) }));
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
