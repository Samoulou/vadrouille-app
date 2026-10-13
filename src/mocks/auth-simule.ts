/**
 * Connexion simulée (spécification F8, écran 4 ; décision 0017 § 3.2) : le code valable est une constante,
 * importée **seulement côté serveur** (adaptateur simulé) et par les tests (règle de lint de F1 sur `@/mocks`). Il
 * n'atteint jamais le navigateur et n'est jamais affiché par l'interface.
 */
export const MOCK_AUTH_CODE = "246810";

/** Un code faux du jeu simulé (tests) : six chiffres, différent du code valable. */
export const MOCK_WRONG_AUTH_CODE = "135791";

/**
 * Adresse « connue » du jeu simulé (compte simulé existant) : la réponse visible est la même que pour une adresse
 * inconnue (F8-PO-9), seul l'identifiant de personne de la session diffère.
 */
export const MOCK_KNOWN_EMAIL = "camille@exemple.ch";
