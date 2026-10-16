import "server-only";

import type { TablePrixGoogle } from "@/server/usage/cout-google";
import type { CodeRefusUsage, Methode, Nature } from "@/server/usage/port";

/**
 * Forfait d'une exécution ou d'une relecture du prototype (décision 0046, D13 point 3, exigence Sécurité S4). Module
 * pur : aucune base, aucune horloge, aucune lecture d'environnement.
 *
 * Le forfait d'une exécution est **la somme de ses plafonds par méthode** de la configuration du mode, valorisée au
 * **prix catalogue plein** (sans tranche gratuite : le forfait surestime, jamais il ne sous-estime ; Q329), plus le
 * plafond de coût des modèles du mode ; celui d'une relecture, le plafond d'une relecture (Routes seulement, aucun
 * coût de modèle). **Démonstration de S4** : chaque champ est une fonction de (nature, configuration) seulement ; deux
 * exécutions du même mode ont des forfaits identiques, quel que soit leur ancrage.
 */

/** Plafonds par méthode d'une exécution (`prototype/config/plafonds.json` du mode, fixés par P0r3). */
export type PlafondsMethodes = {
  readonly placesTextSearch: number;
  readonly placesDetails: number;
  readonly routesRequetes: number;
  readonly routesElements: number;
};

/** Plafonds d'une relecture de Journée (Routes seulement). */
export type PlafondsRelecture = { readonly routesRequetes: number; readonly routesElements: number };

/** SKU facturés par méthode, ceux des clients réels (P0r1) ; leur prix vient de la table de prix. */
export type SkusForfait = { readonly textSearch: string; readonly details: string; readonly matrice: string };

export type Forfait = {
  readonly nature: Nature;
  readonly textSearchRequetes: number;
  readonly placeDetailsRequetes: number;
  readonly routesRequetes: number;
  readonly routesElements: number;
  readonly coutGoogleMicros: number;
  /** Plafond de coût des modèles du mode ; nul pour une relecture. */
  readonly coutModelesMicros: number | null;
};

/**
 * Unité du quota Routes de la console Google (P0-Q31), fixée par configuration. **Q330 tranchée par Samuel**
 * (2026-10-14 13:51 CEST) : `"elements"`, sans plafond par jour, 3 000 éléments par minute. `"requetes"` reste
 * l'hypothèse écartée, gardée pour les tests de 0055 § 6 point 2 (seuil du jour de 95 compté en requêtes).
 */
export type UniteQuotaRoutes = "requetes" | "elements";

/**
 * Quota Routes de la console en éléments par minute (Q330, captures de Samuel). Traduction du Tech Lead (revue de #318,
 * réponse à la question 3b) : aucun seuil journalier pour Routes en unité `"elements"` ; le plafond d'éléments d'un
 * forfait ne dépasse jamais ce quota, et l'étape finale cadence ses requêtes par fenêtre d'une minute
 * (`src/grounding/budget-routes.ts`, `creerCadence`).
 */
export const QUOTA_ROUTES_ELEMENTS_PAR_MINUTE = 3_000;

/**
 * Limites appliquées au lancement : **aucune** depuis la décision 0071 (Samuel, 2026-10-16 : « enlève les restrictions
 * je fais mes tests, avec mes dashboards et je gère les couts »). Ni quota du jour par méthode, ni plafond du mois, ni
 * enveloppe jusqu'à G0 ne refusent plus un lancement : Samuel fixe lui-même ses limites chez les fournisseurs (limite
 * de dépense OpenRouter, quotas par jour et par API de Google Cloud). Les valeurs levées étaient 95 par jour et par
 * méthode, Google 20 USD par mois et 40 USD jusqu'à G0, modèles 40 USD par mois et 80 USD jusqu'à G0 (0046 D13 point 3) ;
 * les rétablir est un changement de ces seules valeurs, par une nouvelle décision. Restent : le contrôle propre au
 * forfait (Routes en unité `"elements"`, quota d'une minute, `refusDuForfait`) et les plafonds **par exécution**
 * (`prototype/config/plafonds.json`, registre en mémoire), qui arrêtent une exécution qui s'emballe.
 */
export const LIMITES_PROTOTYPE = {
  quotaJourParMethode: Number.POSITIVE_INFINITY,
  moisGoogleMicros: Number.POSITIVE_INFINITY,
  enveloppeGoogleMicros: Number.POSITIVE_INFINITY,
  moisModelesMicros: Number.POSITIVE_INFINITY,
  enveloppeModelesMicros: Number.POSITIVE_INFINITY,
} as const;
export type LimitesForfait = { readonly [K in keyof typeof LIMITES_PROTOTYPE]: number };

export class ErreurForfait extends Error {
  override name = "ErreurForfait";
}

const entier = (valeur: number, nom: string) => {
  if (!Number.isSafeInteger(valeur) || valeur < 0) throw new ErreurForfait(`forfait: ${nom} invalide`);
  return valeur;
};

/** Prix plein d'une quantité d'un SKU, en micro-USD, arrondi à l'unité supérieure ; méthode et unité vérifiées. */
function prixPlein(table: TablePrixGoogle, sku: string, methode: Methode, unite: "requete" | "element", quantite: number): number {
  const ligne = table.skus[sku];
  if (ligne === undefined) throw new ErreurForfait("forfait: SKU inconnu de la table de prix");
  if (ligne.methode !== methode || ligne.unite !== unite) throw new ErreurForfait("forfait: SKU d'une autre méthode");
  // prixPour1000 USD pour 1 000 unités = prixPour1000 × 1 000 micro-USD par unité.
  return Math.ceil(quantite * ligne.prixPour1000 * 1_000);
}

/** Forfait d'une exécution : plafonds par méthode au prix plein, plus le plafond de coût des modèles du mode. */
export function forfaitExecution(table: TablePrixGoogle, skus: SkusForfait, plafonds: PlafondsMethodes, coutModelesMicros: number): Forfait {
  const textSearchRequetes = entier(plafonds.placesTextSearch, "placesTextSearch");
  const placeDetailsRequetes = entier(plafonds.placesDetails, "placesDetails");
  const routesRequetes = entier(plafonds.routesRequetes, "routesRequetes");
  const routesElements = entier(plafonds.routesElements, "routesElements");
  return {
    nature: "execution",
    textSearchRequetes,
    placeDetailsRequetes,
    routesRequetes,
    routesElements,
    coutGoogleMicros:
      prixPlein(table, skus.textSearch, "places_text_search", "requete", textSearchRequetes) +
      prixPlein(table, skus.details, "places_details", "requete", placeDetailsRequetes) +
      prixPlein(table, skus.matrice, "routes_matrix", "element", routesElements),
    coutModelesMicros: entier(coutModelesMicros, "coutModelesMicros"),
  };
}

/** Forfait d'une relecture : Routes seulement, aucun coût de modèle. */
export function forfaitRelecture(table: TablePrixGoogle, skus: Pick<SkusForfait, "matrice">, plafonds: PlafondsRelecture): Forfait {
  const routesRequetes = entier(plafonds.routesRequetes, "routesRequetes");
  const routesElements = entier(plafonds.routesElements, "routesElements");
  return {
    nature: "relecture",
    textSearchRequetes: 0,
    placeDetailsRequetes: 0,
    routesRequetes,
    routesElements,
    coutGoogleMicros: prixPlein(table, skus.matrice, "routes_matrix", "element", routesElements),
    coutModelesMicros: null,
  };
}

/** Sommes des forfaits déjà réservés, lues en base dans la transaction de réservation. */
export type SommesForfaits = {
  readonly jour: { readonly textSearchRequetes: number; readonly placeDetailsRequetes: number; readonly routesRequetes: number; readonly routesElements: number };
  readonly moisGoogleMicros: number;
  readonly enveloppeGoogleMicros: number;
  readonly moisModelesMicros: number;
  readonly enveloppeModelesMicros: number;
};

/**
 * Refus d'un forfait au vu des sommes déjà réservées, forfait à lancer compris (0046 D13 point 3), ou `null` s'il
 * tient. Routes : seuil du jour en unité `"requetes"` ; en unité `"elements"` (Q330), forfait au plus égal au quota
 * d'une minute, sans seuil du jour. Ordre : quota du jour (`daily_quota_insufficient`, sans consommer le jour), enveloppe jusqu'à G0
 * (`envelope_reached`), plafond du mois (`cap_reached`).
 */
export function refusDuForfait(sommes: SommesForfaits, forfait: Forfait, limites: LimitesForfait, uniteRoutes: UniteQuotaRoutes): CodeRefusUsage | null {
  const jour = sommes.jour;
  // Q330 : en éléments, aucun plafond par jour ; un forfait dont les éléments dépassent le quota d'une minute ne
  // pourrait pas tenir dans la cadence : refusé comme un quota insuffisant, sans consommer le jour.
  const routesRefusees =
    uniteRoutes === "requetes"
      ? jour.routesRequetes + forfait.routesRequetes > limites.quotaJourParMethode
      : forfait.routesElements > QUOTA_ROUTES_ELEMENTS_PAR_MINUTE;
  if (
    jour.textSearchRequetes + forfait.textSearchRequetes > limites.quotaJourParMethode ||
    jour.placeDetailsRequetes + forfait.placeDetailsRequetes > limites.quotaJourParMethode ||
    routesRefusees
  ) {
    return "daily_quota_insufficient";
  }
  const modeles = forfait.coutModelesMicros ?? 0;
  if (
    sommes.enveloppeGoogleMicros + forfait.coutGoogleMicros > limites.enveloppeGoogleMicros ||
    sommes.enveloppeModelesMicros + modeles > limites.enveloppeModelesMicros
  ) {
    return "envelope_reached";
  }
  if (sommes.moisGoogleMicros + forfait.coutGoogleMicros > limites.moisGoogleMicros || sommes.moisModelesMicros + modeles > limites.moisModelesMicros) {
    return "cap_reached";
  }
  return null;
}
