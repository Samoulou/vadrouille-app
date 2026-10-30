import "server-only";

/**
 * Configuration serveur des retouches liées aux lieux (décision 0147 § 6.4 point 5) : valeurs lues ici, jamais écrites dans
 * une action. M5c y pose le plafond des signalements ; M5d-1 (ticket 939) les seuils de la recherche d'un lieu à soi
 * (`SEUILS_LIEUX`, `SEUILS_LIEUX_VALIDES`, § 6.4 point 3).
 */

/**
 * Signalements d'erreur enregistrés au plus par voyage et par jour UTC (M5-PO-11 ; décision 0147 § 2 et § 6.4 point 2),
 * comptés dans `feedback` depuis minuit UTC du jour de la base. Proposition ; un doublon ou un rejeu n'est jamais compté.
 */
export const SIGNALEMENTS_PAR_VOYAGE_ET_PAR_JOUR = 20;

/**
 * Plafond global du jour de la recherche d'un lieu à soi (décision 0147 § 6.4 point 3 ; la facture, 0141 § 2) : recherches
 * Text Search (`places_text_search_pro`) admises au plus par jour UTC, tous voyages confondus, comptées dans la colonne
 * `lieux` de la table des compteurs quotidiens (migration 0022) par `src/server/villes/compteurs.ts`.
 *
 * **Proposition**, pas un plafond validé : 150 par jour tiennent dans les 5 000 recherches gratuites du mois (150 × 31 =
 * 4 650) ; pire cas au prix plein, sans tranche gratuite, 4,80 USD par jour, soit ≈ 148,8 USD par mois, au-delà du plafond
 * Google de 20 USD par mois de 0027 § 2. Valeur réelle : Samuel (Q682), à M1h, avec `SEUILS_LIEUX_VALIDES`.
 */
export const SEUILS_LIEUX: Readonly<{ recherches: number }> = Object.freeze({ recherches: 150 });

/**
 * Garde mécanique des seuils non validés (décision 0147 § 6.4 point 3, sur le modèle de `SEUILS_AUTOCOMPLETION_VALIDES`,
 * 0141 § 2.3) : lue **en premier** par le port `ouvrir` du terminal `src/server/composition/lieux-api.ts`, avant la
 * barrière. Tant qu'elle vaut `false`, la recherche d'un lieu à soi rend `provider_error` (motif `seuils_non_valides`),
 * sans clé, sans compteur, sans appel. Seule une PR qui cite la validation écrite de Samuel (M1h, Q682) peut la passer à
 * `true`. Seule déclaration du dépôt (`tests/unit/confinement/depot.test.ts`), annotée `: boolean` pour que le test qui la
 * lit ne soit pas jugé constant.
 */
export const SEUILS_LIEUX_VALIDES: boolean = false;
