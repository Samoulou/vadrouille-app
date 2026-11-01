import { OFFER_CONFIG } from "@/server/config/offer";

import { assertApiAdapter } from "./api-guard";
import { createApiShareAdapter, type PartageApi } from "./api-share";
import type { ShareAdapter } from "./types";

/**
 * Partage sur l'adaptateur `api` (spécification M6 § 3 ; décision 0157 § 1.2 et § 1.4 point 8 ; ticket 1013, M6a ; même
 * modèle que `api-instance.ts` et `api-creation-instance.ts`, décisions 0101 § 1 et 0108).
 *
 * **Branchement au démarrage** : ce module n'importe rien de `src/server/partage` (base, limiteur, environnement du
 * serveur). Le régime de confinement l'exige : aucun fichier de `src/app`, `src/features` ou `src/components` ne doit
 * atteindre `src/server/env` ni `src/server/composition`, même par un `import()` (test « p0: clé côté serveur
 * seulement »). `src/instrumentation.ts` branche, quand `DATA_ADAPTER` vaut `api`, les cas d'usage de
 * `src/server/partage/liens.ts` et `vue.ts`.
 *
 * À chaque appel : garde (`assertApiAdapter`, fermée par défaut, sans repli vers `mock`), puis l'adaptateur sur les cas
 * d'usage branchés. Non branchés (tests, `next build`, autre runtime) : chaque méthode rejette, sans rien lire ni écrire
 * (échec fermé : page d'erreur, ou action en erreur).
 *
 * Garde-fou : un second branchement lève `PartageDejaBrancheError`, et hors de `tests/` seuls ce module et
 * `src/instrumentation.ts` nomment `brancherPartageApi` (`tests/unit/auth/points-injection.test.ts`).
 */

// Sur `globalThis`, comme `api-instance.ts` : Next.js charge une copie du module par route.
const PARTAGE_KEY = Symbol.for("vadrouille.partage-api");
const holder = globalThis as typeof globalThis & { [PARTAGE_KEY]?: PartageApi };

/** Second branchement refusé ; ne porte aucune valeur. */
export class PartageDejaBrancheError extends Error {
  override name = "PartageDejaBrancheError";

  constructor() {
    super("Partage api déjà branché.");
  }
}

/** Branche les cas d'usage du partage `api` (appelé une fois, au démarrage, par `src/instrumentation.ts`). */
export function brancherPartageApi(partage: PartageApi): void {
  if (holder[PARTAGE_KEY] !== undefined) throw new PartageDejaBrancheError();
  holder[PARTAGE_KEY] = partage;
}

/** Tests seulement : retire les cas d'usage branchés. */
export function debrancherPartageApiPourTests(): void {
  delete holder[PARTAGE_KEY];
}

const refus = async (): Promise<never> => {
  throw new Error("partage api non branché (src/instrumentation.ts)");
};

/** Cas d'usage non branchés : chaque méthode rejette sans rien lire (jamais un partage de `mock`). */
const NON_BRANCHE: PartageApi = { creer: refus, desactiver: refus, etat: refus, lireVue: refus };

/** Partage `api` d'une requête : garde, puis cas d'usage branchés, horloge de la portée. */
export function apiShareAdapter(now: () => number): ShareAdapter {
  assertApiAdapter();
  return createApiShareAdapter(holder[PARTAGE_KEY] ?? NON_BRANCHE, { now, accessDaysAfterReturn: OFFER_CONFIG.accessDaysAfterReturn });
}
