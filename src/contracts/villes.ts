/**
 * Recherche de ville de l'écran 1 (décisions 0129 et 0141 § 6.1 point 5) : types seulement, effacés à la compilation,
 * partagés par les deux terminaux (site d'essai, `src/server/composition/villes.ts` ; adaptateur `api`,
 * `src/server/composition/villes-api.ts`), leurs actions serveur et le composant `DestinationVille`.
 *
 * Unions **par adaptateur**, pour qu'aucun statut impossible ne soit typé : le site d'essai a `acces` (cookie d'accès),
 * jamais `hors_table` ; `api` a `hors_table` (ville hors des 62 villes du MVP, 0141 § 8), jamais `acces`.
 */

/**
 * Suggestion de ville d'Autocomplete (New) : **donnée Google**, affichée avec l'attribution « Google Maps », jamais
 * stockée (seul `placeId` l'est), journalisée ni envoyée à un modèle.
 */
export type SuggestionVille = { readonly placeId: string; readonly principal: string; readonly secondaire: string | null };

/** Ville choisie : valeurs maison seulement, et le `placeId`. */
export type VilleChoisie = {
  readonly placeId: string;
  /** Code ISO 3166-1 alpha-2 de la table maison des pays. */
  readonly country: string;
  /** Fuseau IANA de la table maison (ville de la table, seul fuseau du pays, ou repère maison le plus proche). */
  readonly timeZone: string;
  /** Nom français du pays, table maison. */
  readonly nomPays: string;
  /**
   * Nom maison de la ville (table des villes, dans ce pays), ou `null` : la destination reste le texte tapé (site
   * d'essai seulement ; sur `api`, jamais `null` : une ville hors des 62 rend `hors_table`).
   */
  readonly nomMaison: string | null;
};

/** Refus communs aux deux adaptateurs. */
type RefusCommun = "indisponible" | "limite" | "limite_jour" | "entree_invalide";

/** Suggestions du site d'essai. */
export type IssueSuggestionsEssai =
  | { readonly statut: "ok"; readonly suggestions: readonly SuggestionVille[] }
  | { readonly statut: RefusCommun | "acces" };

/** Choix du site d'essai. */
export type IssueChoixEssai = { readonly statut: "ok"; readonly ville: VilleChoisie } | { readonly statut: RefusCommun | "acces" | "pays_inconnu" };

/** Suggestions de `api` (aucun cookie d'accès : jamais `acces`). */
export type IssueSuggestionsApi = { readonly statut: "ok"; readonly suggestions: readonly SuggestionVille[] } | { readonly statut: RefusCommun };

/** Choix de `api` : `hors_table` pour une ville hors des 62 villes du MVP (0141 § 8.2). */
export type IssueChoixApi = { readonly statut: "ok"; readonly ville: VilleChoisie } | { readonly statut: RefusCommun | "pays_inconnu" | "hors_table" };

/** Union des deux adaptateurs, reçue par le composant (`DestinationVille`, prop d'actions). */
export type IssueSuggestions = IssueSuggestionsEssai | IssueSuggestionsApi;
export type IssueChoix = IssueChoixEssai | IssueChoixApi;
