import "server-only";

/**
 * Interrupteur « recalcul à la fin de l'aperçu » (spécification B10, B10b point 6 ; décision 0119 § 4.4, B10-TL-8). Constante
 * booléenne seule dans son module, sur le modèle de `P0RUN_COMPLET` (`src/workflows/complet.ts`) : sa valeur est dans le dépôt,
 * visible à la revue et aux tests (jamais une variable d'environnement).
 *
 * **Fermé** (`false`) jusqu'à la réponse de Samuel à la question 4 de la spécification (recalcul avant paiement) ; le passage à
 * `true` se fait par une PR dédiée qui cite sa décision. Fermé, `completeDeck` sur un voyage non débloqué clôt le tri et n'écrit
 * ni exécution ni version. Ouvert, il recalcule les jours de l'aperçu touchés, une fois par aperçu (index par tri clos). Même
 * ouvert, aucun recalcul réel n'est possible tant que `PLAFONDS_USAGE` vaut `null` (0119 § 4.2).
 */
export const RECALCUL_FIN_APERCU: boolean = false;
