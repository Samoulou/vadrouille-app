import "server-only";

/**
 * Recherche de ville de l'écran 1 de `api` (décision 0141 § 2, § 5.5 et § 7.3) : seuils quotidiens de la table des
 * compteurs (migration 0021), garde des seuils non validés et conservation des compteurs. Valeurs dans
 * le code, jamais dans la base ; lues par `src/server/villes/compteurs.ts` et `src/server/composition/villes-api.ts`.
 */

/**
 * Seuils quotidiens indépendants par colonne (0141 § 2.1), jour UTC à l'horloge de la base (§ 3).
 *
 * Proposition de 0141 § 2.3, à valider par Samuel à M1h ; maximum combiné avec le site d'essai : 38,72 USD par mois sans
 * tranche gratuite, au-delà des 20 USD de 0027 § 2. Ces valeurs ne servent qu'une fois la barrière ouverte par M1h et
 * `SEUILS_AUTOCOMPLETION_VALIDES` passé à `true` ; ce ne sont pas des plafonds validés par Samuel.
 */
export const SEUILS_AUTOCOMPLETION: Readonly<Record<"suggestions" | "choix", number>> = Object.freeze({
  suggestions: 150,
  choix: 40,
});

/**
 * Garde mécanique des seuils non validés (0141 § 2.3 ; Sécurité, bloquant 2 de la revue du head `d8b9f0b`) : lue **en
 * premier** par le port `ouvrir` de `api`, avant la barrière. Tant qu'elle vaut `false`, la recherche de `api` rend
 * `indisponible` (motif `seuils_non_valides`), sans clé, sans base, sans appel. Seule une PR qui cite la validation écrite
 * de Samuel des seuils (M1h, question 6 de #829) peut la passer à `true`. Seule déclaration du dépôt
 * (`tests/unit/confinement/depot.test.ts`), annotée `: boolean` pour que le test qui la lit ne soit pas jugé constant.
 */
export const SEUILS_AUTOCOMPLETION_VALIDES: boolean = false;

/**
 * Jours gardés avant la purge (0141 § 7.3) : un mois de 31 jours et 9 jours de marge pour lire le mois clos (coûts
 * dérivés des compteurs, option A). Une ligne `day < jour - 40` est supprimée après un appel Google.
 */
export const AUTOCOMPLETE_COUNTS_RETENTION_DAYS = 40;
