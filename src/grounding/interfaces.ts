/**
 * Interfaces Places et Routes du prototype (spécification P0, étapes 4 et 8). Aucun client réel dans P0a1 :
 * seuls les doubles à valeurs sentinelles (`places.simule.ts`, `routes.simule.ts`) les implémentent. Les clients
 * réels (hôtes figés, clé en en-tête `X-Goog-Api-Key`, module d'environnement étroit) arrivent avec la
 * spécification suivante.
 *
 * Tout ce qu'un client renvoie est une **donnée Google** : elle reste en mémoire, dans `src/grounding` et le
 * moteur, et n'atteint jamais un prompt (`src/ai` et `src/research` ne peuvent pas importer `src/grounding`).
 */

export type Coordonnees = { lat: number; lng: number };

/**
 * Rectangle de la zone du séjour, en degrés (coin sud-ouest, coin nord-est), pour `locationRestriction` (décision
 * 0055, section 6 point 3 : `p0Run` seulement). Calculé par `src/grounding/zone.ts` à partir des logements résolus.
 */
export type RectangleZone = { sudOuest: Coordonnees; nordEst: Coordonnees };

export type RequeteTextSearch = {
  /** Texte maison : nom maison du candidat et destination. */
  texte: string;
  /** Biais géographique sur la zone du séjour. */
  biais: (Coordonnees & { rayonMetres: number }) | null;
  /**
   * Restriction à la zone du séjour (0055 § 6 point 3, ancrage de `p0Run`) : seuls des lieux du rectangle sont
   * rendus. Exclusive du biais (le client réel refuse les deux ensemble, avant toute réservation). Absente : biais
   * seul, comportement du mode simulé et de `scripts/p0`, inchangé.
   */
  restriction?: RectangleZone;
};

/** Text Search « IDs only » : seulement des identifiants de lieu. */
export type ReponseTextSearch = { placeIds: string[] };

export const STATUTS_GOOGLE = ["OPERATIONAL", "CLOSED_TEMPORARILY", "CLOSED_PERMANENTLY"] as const;

/** Place Details : ce que le moteur lit, plus des champs que l'ancrage ignore (nom, adresse, note, prix). */
export type DetailsLieu = {
  placeId: string;
  /**
   * État d'établissement déclaré par Google ; absent pour un lieu qui n'est pas un établissement (quartier, parc, site
   * naturel), ce qui ne signifie pas une fermeture (Q460).
   */
  statut?: (typeof STATUTS_GOOGLE)[number];
  position: Coordonnees;
  /**
   * Plages d'ouverture (0 = dimanche, minutes depuis minuit) ; `null` si inconnues. Une plage qui passe minuit garde
   * `fin` = 1 440 (comportement de P0) et porte `finLendemain`, l'heure de fermeture du lendemain en minutes depuis
   * minuit (décision 0085 § 2 point d) : seul `versRelectures` le lit.
   */
  horaires: { jour: number; debut: number; fin: number; finLendemain?: number }[] | null;
  nom?: string;
  adresse?: string;
  note?: number;
  niveauPrix?: string;
};

export interface ClientPlaces {
  textSearch(requete: RequeteTextSearch): Promise<ReponseTextSearch>;
  details(placeId: string): Promise<DetailsLieu>;
}

/** Place Details au masque `id,location` (décision 0085 § 2) : la seule position du lieu. */
export type PositionLieu = { placeId: string; position: Coordonnees };

/**
 * Client Places du MVP (B8a, décision 0085 § 2, soumis au verdict de la Sécurité) : un masque fermé **par méthode**,
 * jamais passé en paramètre. `position` (`id,location`, SKU Essentials) : centre d'une ville, carte (B8b) ;
 * `identifiant` (`id`, SKU « IDs only ») : rafraîchissement d'un `placeId` de plus de 12 mois, qui peut rendre un autre
 * identifiant (seule méthode qui l'accepte). Une fiche introuvable lève `ErreurAncrage("place_not_found")` sur les
 * trois méthodes Place Details. `ClientPlaces` (P0) reste inchangé : la composition de P0 n'a pas ces méthodes.
 */
export interface ClientPlacesMvp extends ClientPlaces {
  position(placeId: string): Promise<PositionLieu>;
  identifiant(placeId: string): Promise<{ placeId: string }>;
}

export const MODES_ROUTES = ["walk", "transit", "car"] as const;
export type ModeRoutes = (typeof MODES_ROUTES)[number];

/**
 * Point d'une matrice Routes (décision 0087 § 3.2, amende 0085 § 1.6) : un `placeId`, ou un **centre maison enveloppé**
 * (`area.center` d'un logement `suggestedArea`, valeur du modèle, B7-PO-3 ; jamais une donnée Google). L'enveloppe
 * `centreMaison` empêche une position Google (`Coordonnees` nu) d'y passer par mégarde. P0 passe des chaînes seulement.
 */
export type PointRoutes = string | { readonly centreMaison: Coordonnees };

/**
 * Préfixe de la clé de trajet d'un centre maison (0087 § 3.2) : le caractère `:` est absent d'un identifiant de lieu
 * Google (`PLACE_ID_GOOGLE`, `enveloppe-google.ts`), donc une clé maison ne rencontre jamais un `placeId`.
 */
export const PREFIXE_CLE_MAISON = "maison:";

/**
 * **Seule** fonction qui produit la clé de trajet d'un centre maison (0087 § 3.2) : dérivée du centre seul, pour que
 * l'étape qui planifie et la lecture (B8b, depuis le centre stocké dans `stays`) obtiennent la même clé.
 */
export function cleMaison(centre: Coordonnees): string {
  return `${PREFIXE_CLE_MAISON}${String(centre.lat)},${String(centre.lng)}`;
}

/** Clé de trajet d'un point : le `placeId` lui-même, ou la clé maison de son centre. */
export function clePointRoutes(point: PointRoutes): string {
  return typeof point === "string" ? point : cleMaison(point.centreMaison);
}

export type RequeteMatrice = { origines: readonly PointRoutes[]; destinations: readonly PointRoutes[]; mode: ModeRoutes };

/** Durées en secondes, `null` si aucun itinéraire. */
export type ReponseMatrice = { secondes: (number | null)[][] };

export interface ClientRoutes {
  matrice(requete: RequeteMatrice): Promise<ReponseMatrice>;
}

/** Codes d'erreur fermés des clients Google (jamais un message ni un corps de réponse). */
export const CODES_ERREUR_ANCRAGE = ["place_not_found", "routes_unavailable", "lodging_unresolved"] as const;
export type CodeErreurAncrage = (typeof CODES_ERREUR_ANCRAGE)[number];

export class ErreurAncrage extends Error {
  readonly code: CodeErreurAncrage;
  constructor(code: CodeErreurAncrage) {
    super(code);
    this.code = code;
    this.name = "ErreurAncrage";
  }
}
