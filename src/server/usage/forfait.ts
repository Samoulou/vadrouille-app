import "server-only";

import type { TablePrixGoogle } from "@/server/usage/cout-google";
import type { CodeRefusUsage, Fournisseur, Methode, Nature } from "@/server/usage/port";

/**
 * Forfait d'une exécution ou d'une relecture du prototype (décision 0046, D13 point 3, exigence Sécurité S4), repris
 * par le MVP (B7c, B7-TL-9 : génération, relecture et action sans compte ; lignes de `usage_ledger` en fin de module).
 * Module pur : aucune base, aucune horloge, aucune lecture d'environnement.
 *
 * Le forfait d'une exécution est **la somme de ses plafonds par méthode** de la configuration du mode, valorisée au
 * **prix catalogue plein** (sans tranche gratuite : le forfait surestime, jamais il ne sous-estime ; Q329), plus le
 * plafond de coût des modèles du mode ; celui d'une relecture, le plafond de son profil (Text Search, fiches et Routes,
 * décision 0100 § 1 ; aucun coût de modèle). **Démonstration de S4** : chaque champ est une fonction de (profil,
 * configuration) seulement ; deux
 * exécutions du même mode ont des forfaits identiques, quel que soit leur ancrage.
 */

/** Plafonds par méthode d'une exécution (`prototype/config/plafonds.json` du mode, fixés par P0r3). */
export type PlafondsMethodes = {
  readonly placesTextSearch: number;
  readonly placesDetails: number;
  readonly routesRequetes: number;
  readonly routesElements: number;
};

/**
 * Plafonds d'une relecture (décision 0100 § 1.1, B8-TL-4) : Text Search (villes), fiches (tous masques, comptés au SKU
 * de `details`) et Routes. Un profil par portée de lecture (`relecture` : un jour ; `relectureVoyage` : le voyage).
 */
export type PlafondsRelecture = {
  readonly placesTextSearch: number;
  readonly placesDetails: number;
  readonly routesRequetes: number;
  readonly routesElements: number;
};

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

/**
 * Forfait d'une relecture (décision 0100 § 1.1) : Text Search, fiches et Routes au prix plein, aucun coût de modèle.
 * Toutes les fiches de la lecture (masque de `details` des étapes, masque de position des logements) sont comptées au
 * SKU de `details` : un majorant, jamais une sous-estimation.
 */
export function forfaitRelecture(table: TablePrixGoogle, skus: Pick<SkusForfait, "textSearch" | "details" | "matrice">, plafonds: PlafondsRelecture): Forfait {
  const textSearchRequetes = entier(plafonds.placesTextSearch, "placesTextSearch");
  const placeDetailsRequetes = entier(plafonds.placesDetails, "placesDetails");
  const routesRequetes = entier(plafonds.routesRequetes, "routesRequetes");
  const routesElements = entier(plafonds.routesElements, "routesElements");
  return {
    nature: "relecture",
    textSearchRequetes,
    placeDetailsRequetes,
    routesRequetes,
    routesElements,
    coutGoogleMicros:
      prixPlein(table, skus.textSearch, "places_text_search", "requete", textSearchRequetes) +
      prixPlein(table, skus.details, "places_details", "requete", placeDetailsRequetes) +
      prixPlein(table, skus.matrice, "routes_matrix", "element", routesElements),
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

// --- MVP (B7c) : forfait d'une action sans compte, plafond par organisation et par jour, lignes de `usage_ledger` ---

/**
 * Plafonds d'une action sans compte (décision 0081, B9-TL-4 point 3 ; B7-TL-10) : coût de modèles et, pour
 * `suggestLodging`, requêtes Text Search de l'ancrage des logements suggérés (B8-PO-4). Aucune fiche, aucun Routes.
 */
export type PlafondsAction = { readonly coutModelesMicros: number; readonly placesTextSearch: number };

/**
 * Forfait d'une action sans compte : de nature `execution` (aucune nouvelle nature, `NATURES` du port reste fermé ;
 * 0081 B9-TL-4 point 3), construit par `forfaitExecution` avec des plafonds nuls hors Text Search : même calcul, même
 * prix plein.
 */
export function forfaitAction(table: TablePrixGoogle, skus: SkusForfait, plafonds: PlafondsAction): Forfait {
  return forfaitExecution(table, skus, { placesTextSearch: plafonds.placesTextSearch, placesDetails: 0, routesRequetes: 0, routesElements: 0 }, plafonds.coutModelesMicros);
}

/** Coût total d'un forfait (Google au prix plein, plus le plafond de coût des modèles), en micro-USD. */
export function coutTotalMicros(forfait: Forfait): number {
  return forfait.coutGoogleMicros + (forfait.coutModelesMicros ?? 0);
}

/**
 * Plafond **par organisation et par jour** (B7c point 3, spécification « Consommation et plafonds » point 2) :
 * comparaison ajoutée à côté de `refusDuForfait`, sans changer le port. `cap_reached` si la somme des forfaits de
 * l'organisation sur le jour, forfait à réserver compris, dépasse le plafond. Pour l'organisation des actions sans
 * compte, c'est le plafond global quotidien des actions sans compte (0081 B9-TL-4 point 3).
 */
export function refusParOrganisation(sommeJourMicros: number, forfait: Forfait, plafondJourMicros: number): CodeRefusUsage | null {
  return sommeJourMicros + coutTotalMicros(forfait) > plafondJourMicros ? "cap_reached" : null;
}

/** Valeur de `step` de **toute** ligne de `usage_ledger` du MVP (B7-TL-9 : seule correspondance, aucune ligne par appel). */
export const STEP_FORFAIT = "forfait";

/**
 * Ligne de `usage_ledger` d'un forfait (B7-TL-9) : une par méthode du forfait. Chaque valeur est une fonction du seul
 * forfait, donc du profil et de la configuration : deux générations du même profil écrivent les mêmes lignes, quel que
 * soit le nombre d'appels réels (0046 D13 point 7).
 */
export type LigneForfait = {
  readonly step: typeof STEP_FORFAIT;
  readonly provider: Fournisseur;
  readonly sku: string;
  /** Plafond de la méthode dans l'unité de son SKU (requêtes, ou éléments pour Routes) ; 0 pour les modèles. */
  readonly units: number;
  /** Prix plein du plafond de la méthode ; pour les modèles, le plafond de coût. */
  readonly costEstimateMicros: number;
};

/**
 * Lignes d'un forfait, dans un ordre fixe : modèles (si le forfait en porte un plafond, même nul), puis Text Search,
 * fiches et Routes, chacune seulement si son plafond est non nul. La somme des coûts Google des lignes est égale à
 * `coutGoogleMicros` (sinon le forfait a été calculé avec d'autres SKU : erreur).
 */
export function lignesDuForfait(table: TablePrixGoogle, skus: SkusForfait, skuModeles: string, forfait: Forfait): LigneForfait[] {
  if (table.skus[skuModeles] !== undefined) throw new ErreurForfait("forfait: SKU de modèles pris dans la table de prix Google");
  const lignes: LigneForfait[] = [];
  if (forfait.coutModelesMicros !== null) {
    lignes.push({ step: STEP_FORFAIT, provider: "modeles", sku: skuModeles, units: 0, costEstimateMicros: entier(forfait.coutModelesMicros, "coutModelesMicros") });
  }
  const google: readonly [string, Methode, "requete" | "element", number][] = [
    [skus.textSearch, "places_text_search", "requete", forfait.textSearchRequetes],
    [skus.details, "places_details", "requete", forfait.placeDetailsRequetes],
    [skus.matrice, "routes_matrix", "element", forfait.routesElements],
  ];
  let totalGoogle = 0;
  for (const [sku, methode, unite, quantite] of google) {
    if (entier(quantite, methode) === 0) continue;
    const cout = prixPlein(table, sku, methode, unite, quantite);
    totalGoogle += cout;
    lignes.push({ step: STEP_FORFAIT, provider: "google", sku, units: quantite, costEstimateMicros: cout });
  }
  if (totalGoogle !== forfait.coutGoogleMicros) throw new ErreurForfait("forfait: lignes Google différentes du forfait");
  return lignes;
}
