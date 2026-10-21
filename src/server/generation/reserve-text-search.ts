import "server-only";

import { logementsDuJour } from "@/domain/relectures";

/**
 * Réserve Text Search de l'étape `e` (décision 0113 § 3 bis) : **une requête par ville `area` ou `none` que l'étape
 * positionne**, c'est-à-dire chaque ville `area` ou `none` d'un jour qu'elle planifie (zone et départ par un Text Search du
 * nom de la ville, 0087 § 2.3 et § 2.7). Fonction pure, **une seule** pour l'étape qui réserve le forfait et pour `c` et `e`,
 * qui la recalculent à l'identique (§ 3 bis point 3).
 *
 * Ville d'un jour : celle de sa nuit d'arrivée (`logementsDuJour`, `logementArrivee` du squelette), à défaut celle de la
 * première nuit, la règle même de `preparerPlanification` (`src/server/relecture/planification.ts`), dont le budget
 * `textSearch` reste la garde (§ 3 bis point 4). Le type d'origine du logement fait foi : après l'étape `l`, un logement
 * `known` ou `suggestedLodging` a son `placeId` (sinon `lodging_unresolved`) et ne demande aucun Text Search.
 */

export type VillePourReserve = { readonly rang: number; readonly logement: { readonly kind: string } };

export type EntreeReserve = {
  /** Jours planifiés par l'étape (1 = J1). */
  readonly jours: readonly number[];
  /** Rang de ville de chaque nuit, index 0 = première nuit (`nuitsDuVoyage`). */
  readonly nuitsVille: readonly number[];
  readonly villes: readonly VillePourReserve[];
};

const DEMANDE_TEXT_SEARCH: ReadonlySet<string> = new Set(["area", "none"]);

/** Ville d'un jour, comme `preparerPlanification` : nuit d'arrivée, à défaut la première nuit, à défaut le rang 0. */
export function villeDuJour(jour: number, nuitsVille: readonly number[]): number {
  const { arrivee } = logementsDuJour(jour - 1, nuitsVille.length);
  return nuitsVille.at(arrivee) ?? nuitsVille.at(0) ?? 0;
}

/** Nombre de requêtes Text Search de l'étape `e` qui planifie `jours` : une par ville `area` ou `none` de ces jours. */
export function reserveTextSearchE(entree: EntreeReserve): number {
  const rangs = new Set(entree.jours.map((jour) => villeDuJour(jour, entree.nuitsVille)));
  return entree.villes.filter((ville) => DEMANDE_TEXT_SEARCH.has(ville.logement.kind) && rangs.has(ville.rang)).length;
}

/**
 * Réserve d'une exécution : `total` est retiré de la part Text Search de `c` **avant** sa répartition ; `ici` est la part
 * Text Search exacte de l'étape `e` en cours (aperçu : `total` ; voyage complet : la réserve de son jour, hors découpage
 * cumulatif, § 3 bis point 1).
 */
export type ReserveTextSearch = { readonly total: number; readonly ici: number };

/** Réserve du voyage complet : somme des réserves des jours du passage ; `ici` pour le jour `jour` (étape `e`), sinon 0. */
export function reserveDuPassage(entree: EntreeReserve, jour: number | null): ReserveTextSearch {
  const parJour = (j: number) => reserveTextSearchE({ ...entree, jours: [j] });
  return { total: entree.jours.reduce((somme, j) => somme + parJour(j), 0), ici: jour === null ? 0 : parJour(jour) };
}
