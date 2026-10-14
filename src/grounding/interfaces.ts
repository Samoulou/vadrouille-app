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
  statut: (typeof STATUTS_GOOGLE)[number];
  position: Coordonnees;
  /** Plages d'ouverture (0 = dimanche, minutes depuis minuit) ; `null` si inconnues. */
  horaires: { jour: number; debut: number; fin: number }[] | null;
  nom?: string;
  adresse?: string;
  note?: number;
  niveauPrix?: string;
};

export interface ClientPlaces {
  textSearch(requete: RequeteTextSearch): Promise<ReponseTextSearch>;
  details(placeId: string): Promise<DetailsLieu>;
}

export const MODES_ROUTES = ["walk", "transit", "car"] as const;
export type ModeRoutes = (typeof MODES_ROUTES)[number];

export type RequeteMatrice = { origines: string[]; destinations: string[]; mode: ModeRoutes };

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
