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

/**
 * Suggestion de ville d'Autocomplete (New) (écran 1 du site d'essai, demande de Samuel du 23 octobre 2026) : **donnée
 * Google**, affichée à la personne avec l'attribution « Google Maps », jamais stockée (seul `placeId` l'est) ni envoyée
 * à un modèle.
 */
export type SuggestionVille = { readonly placeId: string; readonly principal: string; readonly secondaire: string | null };

/**
 * Fiche d'une ville au masque `id,addressComponents,location` (Place Details Essentials, même session que les
 * suggestions) : code ISO 3166-1 alpha-2 du pays (composante `country`, `null` si absente) et position. Données Google,
 * lues en mémoire pour retrouver le pays et le fuseau dans les tables maison ; ni stockées ni envoyées à un modèle.
 */
export type FicheVille = { readonly placeId: string; readonly pays: string | null; readonly position: Coordonnees };

/** Recherche de la ville de l'écran 1 (site d'essai) : suggestions puis fiche, dans une même session Google. */
export interface ClientVilles {
  suggererVilles(saisie: string, session: string): Promise<readonly SuggestionVille[]>;
  ficheVille(placeId: string, session: string): Promise<FicheVille>;
}

/**
 * Photo d'un lieu pour le tri d'un voyage d'essai (décision 0128, demande de Samuel du 2026-10-23) : **donnée Google
 * chargée à la demande**, jamais stockée (ni l'adresse, ni le nom de ressource, ni l'image) ni mise dans un prompt ou un
 * journal. `uri` : adresse courte de l'image (`photoUri` de Place Photos (New), hôte `googleusercontent.com`) ; auteurs
 * (`authorAttributions`) et lien de la photo sur Google Maps (`googleMapsUri`), à afficher avec elle (conditions de
 * Places API, « Display author attributions »). Les liens ne sont gardés que s'ils sont en `https` sur un hôte Google.
 */
export type AuteurPhotoLieu = { readonly nom: string; readonly lien?: string };
export type PhotoLieu = { readonly uri: string; readonly auteurs: readonly AuteurPhotoLieu[]; readonly lienGoogleMaps?: string };

/**
 * Client des photos de lieu (décision 0128) : une fiche au masque `photos` (SKU « Place Details Essentials (IDs Only) »),
 * puis le média de la **première** photo (`skipHttpRedirect`, SKU « Place Details Photos »). Aucune photo : `null`, sans
 * second appel. Rien d'autre de Places : ni position, ni horaires, ni Text Search.
 */
export interface ClientPhotosLieu {
  photo(placeId: string, largeurMaxPx: number): Promise<PhotoLieu | null>;
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
