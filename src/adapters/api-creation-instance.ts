import { assertApiAdapter } from "./api-guard";
import type { CreationAdapter } from "./types";

/**
 * Création du voyage sur l'adaptateur `api` (spécification B9, B9e points 1 et 3 ; décision 0081 B9-TL-1 et B9-TL-2 ;
 * même modèle que `api-instance.ts`, décision 0108).
 *
 * **Branchement au démarrage** : ce module n'importe ni `./api-creation.ts` (cas d'usage de `src/server/creation/`, donc
 * `withOrg`, la base et la composition de la génération), ni rien de `src/server`. Le régime de confinement l'exige :
 * aucun fichier de `src/app`, `src/features` ou `src/components` ne doit atteindre `src/server/env` ni
 * `src/server/composition`, même par un `import()` (test « p0: clé côté serveur seulement »). `src/instrumentation.ts`
 * branche, quand `DATA_ADAPTER` vaut `api`, la fabrique `() => createApiCreationAdapter()`.
 *
 * À chaque appel de `getCreationAdapter("api")` : garde (`assertApiAdapter`, fermée par défaut, sans repli vers `mock`),
 * puis la fabrique branchée. Non branchée (tests, `next build`, autre runtime) : chaque méthode rejette, sans rien lire
 * ni écrire (échec fermé : l'action rend `provider_error`).
 *
 * Garde-fou : un second branchement lève `CreationDejaBrancheeError`, et hors de `tests/` seuls ce module et
 * `src/instrumentation.ts` nomment `brancherCreationVoyages` (`tests/unit/auth/points-injection.test.ts`).
 */

/** Fabrique branchée au démarrage. */
export type FabriqueCreationVoyages = () => CreationAdapter;

// Sur `globalThis`, comme `api-instance.ts` : Next.js charge une copie du module par route.
const CREATION_KEY = Symbol.for("vadrouille.creation-voyages");
const holder = globalThis as typeof globalThis & { [CREATION_KEY]?: FabriqueCreationVoyages };

/** Second branchement refusé ; ne porte aucune valeur. */
export class CreationDejaBrancheeError extends Error {
  override name = "CreationDejaBrancheeError";

  constructor() {
    super("Création des voyages déjà branchée.");
  }
}

/** Branche la fabrique de la création `api` (appelé une fois, au démarrage, par `src/instrumentation.ts`). */
export function brancherCreationVoyages(fabrique: FabriqueCreationVoyages): void {
  if (holder[CREATION_KEY] !== undefined) throw new CreationDejaBrancheeError();
  holder[CREATION_KEY] = fabrique;
}

/** Tests seulement : retire la fabrique branchée. */
export function debrancherCreationVoyagesPourTests(): void {
  delete holder[CREATION_KEY];
}

const METHODES = [
  "structureBrief",
  "suggestLodging",
  "createTrip",
  "retryGeneration",
  "getGenerationStatus",
  "getFullTripStatus",
] as const satisfies readonly (keyof CreationAdapter)[];

/** Adaptateur non branché : chaque méthode rejette sans rien lire (jamais une création de `mock`). */
function adaptateurNonBranche(): CreationAdapter {
  const refus = async (): Promise<never> => {
    throw new Error("création api non branchée (src/instrumentation.ts)");
  };
  return Object.fromEntries(METHODES.map((m) => [m, refus])) as unknown as CreationAdapter;
}

/** Création `api` d'une requête : garde, puis fabrique branchée. */
export function apiCreationAdapter(): CreationAdapter {
  assertApiAdapter();
  const fabrique = holder[CREATION_KEY];
  return fabrique === undefined ? adaptateurNonBranche() : fabrique();
}
