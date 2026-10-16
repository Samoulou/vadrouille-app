/**
 * Copies tenues égales de `src/prototype/config.ts` (décision 0077 § 1 point 3, B7-TL-1 : liste fermée) : routage
 * OpenRouter, motif d'identifiant de modèle et moteurs du greffon de recherche web. `src/ai` n'importe plus rien de
 * `src/prototype` ; l'original reste pour P0, et `tests/unit/p0/copies.test.ts` vérifie l'égalité des deux côtés
 * (listes et motifs, types `Routage` et `MoteurRechercheWeb`).
 *
 * Chargé par `pnpm p0` sous Node nu (par `client.ts`) : exception nominative de `ligne/require-server-only`
 * (spécification B7a, point 6). Aucun import.
 */

/** Identifiant de modèle OpenRouter (`fournisseur/modele`), toujours lu dans la configuration. */
export const MODELE_ID_PATTERN = /^[a-z0-9-]+\/[a-z0-9._:-]+$/;

/** Réglage de routage OpenRouter : `data_collection: "deny"` obligatoire (décision 0026). */
export type Routage = { data_collection: "deny"; zdr?: boolean };

/** Moteurs admis du greffon de recherche web d'OpenRouter (bloquant 1c de la PR 326). */
export const MOTEURS_RECHERCHE_WEB = ["native", "exa"] as const;
export type MoteurRechercheWeb = (typeof MOTEURS_RECHERCHE_WEB)[number];
