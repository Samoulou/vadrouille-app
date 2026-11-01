import "server-only";

/**
 * Région de l'état des workflows (décision 0063 point 10 : `fra1`, UE), passée à chaque démarrage. Module feuille (seul
 * import : le marqueur `server-only`) : lu par l'interface `src/workflows/index.ts` et par le relais du workflow 7 (`src/workflows/rappels.ts`), qui
 * ne peut pas importer l'interface sans cycle (M6c, ticket 1021 ; revue de la PR 1024, mineur 1 du Tech Lead).
 */
export const REGION_WORKFLOWS = "fra1";
