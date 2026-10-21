import type { MobilityMode } from "@/contracts";

/**
 * Interfaces injectées des données dérivées de Google (décision 0045, B5-TL-2) : **synchrones et en mémoire**. Le
 * serveur (B8) fait ses relectures Places et Routes avant d'appeler le moteur, puis lui passe ces fonctions, qui
 * lisent une table en mémoire. Dans B5, ce sont des doubles de test à valeurs sentinelles.
 *
 * Aucun champ de forme Google. Le moteur n'appelle ces fonctions que pendant un calcul et ne renvoie jamais leurs
 * valeurs dans une sortie d'écriture ni dans le rapport de validation (décision 0011, points 2, 4 et 5).
 */

export const INCONNU = "inconnu";
export type Inconnu = typeof INCONNU;

/** Un lieu (`placeId`) ou le logement d'une nuit (index de la nuit, 0 = première nuit). */
export type Point = { readonly lieu: string } | { readonly logement: number };

export type Validite = "valide" | "ferme_definitivement" | "introuvable" | Inconnu;

/** Plage d'ouverture d'une date, en minutes depuis minuit du jour ; `fin` ≤ 2 880 (ouverture après minuit). */
export type Plage = { readonly debut: number; readonly fin: number };

export type ModeTrajet = MobilityMode;

/**
 * Durée d'un trajet (décision 0048 § 3) : minutes et indication « estimée » (B8 estime à partir des coordonnées
 * quand Routes ne répond pas, 0011 point 5). Le moteur n'estime jamais lui-même ; une durée estimée est une durée
 * connue (seul `inconnu` rend un trajet non planifiable).
 */
export type Duree = { readonly minutes: number; readonly estimee: boolean };

export type Relectures = {
  validite(placeId: string): Validite;
  /** Plages demandées **par date** (AAAA-MM-JJ) : B8 peut y refléter une fermeture temporaire. */
  plages(placeId: string, date: string): readonly Plage[] | Inconnu;
  duree(depuis: Point, vers: Point, mode: ModeTrajet): Duree | Inconnu;
};

/** Ordre de départage des modes à durée égale (B5-PO-6) : marche, puis transports publics, puis voiture. */
export const ORDRE_MODES: readonly ModeTrajet[] = ["walk", "transit", "car"];

/** Deux points désignent-ils le même endroit ? (même lieu, ou même nuit). */
export function memePoint(a: Point, b: Point): boolean {
  if ("lieu" in a && "lieu" in b) return a.lieu === b.lieu;
  if ("logement" in a && "logement" in b) return a.logement === b.logement;
  return false;
}

/**
 * Trajet le plus rapide parmi les modes admis dont l'interface donne une durée (B5-PO-6) ; à égalité, l'ordre de
 * `ORDRE_MODES`. Le choix se fait sur `minutes` seules ; `estimee` est celle du mode retenu (0048 § 3.2). Aucun mode
 * admis avec une durée connue : `inconnu` (jamais estimé par le moteur).
 */
export function trajetLePlusRapide(
  relectures: Relectures,
  depuis: Point,
  vers: Point,
  modes: readonly ModeTrajet[],
): { mode: ModeTrajet; minutes: number; estimee: boolean } | Inconnu {
  let meilleur: { mode: ModeTrajet; minutes: number; estimee: boolean } | undefined;
  for (const mode of ORDRE_MODES) {
    if (!modes.includes(mode)) continue;
    const duree = relectures.duree(depuis, vers, mode);
    if (duree === INCONNU) continue;
    if (meilleur === undefined || duree.minutes < meilleur.minutes) meilleur = { mode, minutes: duree.minutes, estimee: duree.estimee };
  }
  return meilleur ?? INCONNU;
}

/** Vrai si `[debut, fin]` tient dans une plage connue ; plages inconnues : `inconnu` (aucune contrainte, B5-PO-5). */
export function dansLesPlages(plages: readonly Plage[] | Inconnu, debut: number, fin: number): boolean | Inconnu {
  if (plages === INCONNU) return INCONNU;
  return plages.some((plage) => plage.debut <= debut && fin <= plage.fin);
}

/** Logements d'un jour (0045 § 2.2) : jour `j` de 0 à `N`, départ `max(j − 1, 0)`, arrivée `min(j, N − 1)`. */
export function logementsDuJour(jour: number, nombreDeNuits: number): { depart: number; arrivee: number } {
  const derniere = Math.max(nombreDeNuits - 1, 0);
  return { depart: Math.min(Math.max(jour - 1, 0), derniere), arrivee: Math.min(Math.max(jour, 0), derniere) };
}

/**
 * Rang de ville d'un jour : celle de sa nuit d'arrivée (`logementArrivee` du squelette, `logementsDuJour`), à défaut celle de
 * la première nuit, à défaut le rang 0. Règle unique de la planification (`preparerPlanification`) et de la réserve Text
 * Search de l'étape `e` (décision 0113 § 3 bis), qui doivent compter les mêmes villes.
 */
export function villeDeLArrivee(nuitArrivee: number, nuitsVille: readonly number[]): number {
  return nuitsVille.at(nuitArrivee) ?? nuitsVille.at(0) ?? 0;
}

// --- Port de relectures de la lecture des voyages (décision 0086 § 1.2 point 3 ; spécification B6, B6-TL-2 (c)) ---
//
// Déclarations de type seules, sans entrée-sortie : le port est implémenté côté serveur (B8b, Places et Routes) ou par
// le double `src/mocks/relectures-voyages.ts` (qui n'importe ce module qu'en `import type`, arête admise de 0086), et
// injecté dans la lecture des voyages (`src/server/voyages/`) par la fabrique de l'adaptateur `api`.

/**
 * Séjour qui couvre une nuit (ligne `stays`), tel que le lit la lecture : de quoi résoudre le point de départ d'un trajet
 * quand `stays.place_id` est nul (décision 0100 § 6.2). Données maison seulement (le centre est celui d'une zone du
 * modèle, jamais une coordonnée Google).
 */
export type SejourDeNuit = {
  /** `stays.place_id` ; `null` : séjour sans lieu. */
  readonly placeId: string | null;
  /** `stays.city` ; `null` pour une ligne antérieure à B9b. */
  readonly ville: string | null;
  /** `stays.area_center_lat` et `area_center_lng` d'une zone maison (`suggestedArea`) ; `null` sinon. */
  readonly centre: { readonly lat: number; readonly lng: number } | null;
  /** `stays.kind`. */
  readonly type: "lodging" | "neighbourhood" | "none";
  /** `stays.lodging_kind` ; `null` pour une ligne antérieure à B9b. */
  readonly logement: "known" | "area" | "none" | "suggestedLodging" | "suggestedArea" | null;
};

/**
 * Portée d'une lecture (décision 0100 § 1.3) : `voyage` pour `getTrip`, `jour` pour `getDay`, `listProposals` et
 * `listPreviewSlots`. Elle vient du **cas d'usage** appelé, jamais de la demande ni du navigateur ; elle choisit le
 * profil du forfait de relecture.
 */
export type PorteeLecture = "jour" | "voyage";

/**
 * Voyage passé au port : logements par nuit (B6-PO-17), et, depuis la décision 0100 (§ 3.2 point 1 et § 6.2),
 * le contexte de la session, la portée de la lecture et les séjours de chaque nuit. Le contexte est celui de la session
 * (organisation, utilisateur et voyage lus avec elle), posé par le cas d'usage ; aucun jeton, aucune entrée du navigateur.
 */
export type VoyageARelire = {
  /** `stays.place_id` de chaque nuit (B6-PO-17), index 0 = première nuit ; `null` : logement sans lieu. */
  readonly logementsParNuit: readonly (string | null)[];
  /** Organisation, utilisateur et voyage de la session : la source ouvre ses transactions `withOrg` avec eux (0100 § 3.2). */
  readonly contexte: { readonly organizationId: string; readonly userId: string; readonly tripId: string };
  readonly portee: PorteeLecture;
  /** Séjour de chaque nuit, même index que `logementsParNuit` (0100 § 6.2). */
  readonly sejoursParNuit: readonly SejourDeNuit[];
};

/**
 * Ce que l'assemblage lira, calculé par le moteur (`demandeDeRelectures`, `src/domain/recomposition.ts`) : lieux et
 * dates (`validite`, `plages`), couples de points et modes (`duree`).
 */
export type DemandeRelectures = {
  readonly lieux: readonly { readonly placeId: string; readonly dates: readonly string[] }[];
  readonly trajets: readonly { readonly depuis: Point; readonly vers: Point; readonly modes: readonly ModeTrajet[] }[];
};

/** Refus fermé du port : rendu, jamais levé (une exception levée par le port est lue comme `unavailable`). */
export type RefusRelectures = "quota_reached" | "unavailable";

/** Port de relectures : un appel par lecture, aucune valeur gardée entre deux appels. */
export type SourceRelectures = {
  pour(
    voyage: VoyageARelire,
    demande: DemandeRelectures,
  ): Promise<{ readonly ok: true; readonly relectures: Relectures } | { readonly ok: false; readonly refus: RefusRelectures }>;
};
