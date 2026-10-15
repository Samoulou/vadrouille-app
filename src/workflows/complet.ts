import "server-only";

/**
 * Interrupteur de démarrage de `p0Run` (décision 0063, points 7 et 10), seul dans son module pour que les tests
 * prouvent le chemin de démarrage (SDK simulé) sans le passer à vrai ici. Importé par `src/workflows/index.ts`
 * seulement, qui le réexporte.
 *
 * Vrai seulement quand les conditions du point 7 de l'amendement P0r3c-5 de 0063 sont remplies : (a) verdict Sécurité
 * sur l'amendement A3 (rendu, revue de #353) ; (b) action de lancement réelle et build qui la compile (P0r3d), avec
 * nouvelle revue Sécurité (rendue : approuvé, PR 357) ; (d) brief court de l'essai d'intégration (#355, PR 356
 * fusionnée). Passage à vrai : PR dédiée. La levée du verrou S8 (c) reste une condition d'exécution, contrôlée par
 * l'action de lancement à chaque lancement (`verrouS8Leve`), pas par ce module. Amendement P0r3d de 0063, point 2.
 */
export const P0RUN_COMPLET = false;
