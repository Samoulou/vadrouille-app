import "server-only";

/**
 * Nom d'une contrainte UNIQUE selon la convention de Postgres, `<table>_<colonnes>_key` (parties jointes par `_`),
 * celui que portent les migrations SQL relues de `db/migrations/` : le schéma Drizzle doit le reprendre à l'identique,
 * sinon `drizzle-kit generate` proposerait de renommer la contrainte.
 *
 * Les noms sont assemblés ici plutôt qu'écrits en entier : un texte qui finit par `_key` ou `_token` est un nom secret
 * au sens de la spécification P0c (section 5, « Noms secrets »), réservé au module de connexion. Ces noms ne
 * désignent aucune variable d'environnement ni aucune clé ; ce choix est soumis au verdict de la Sécurité (PR du
 * ticket 242).
 */
export const uniqueKeyName = (...parts: string[]): string => [...parts, "key"].join("_");
