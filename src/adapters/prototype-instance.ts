import { prototypeAdapterAllowed } from "@/dev/flags";
import { createRelecteurSimule, type RelecteurSimule } from "@/mocks/prototype-relecteur";

import { createPrototypeAdapter, type SourceProgrammes } from "./prototype";
import { createProgrammeLoader } from "./prototype-loader";
import type { TripAdapter } from "./types";

/**
 * Adaptateur `prototype` de l'application (décision 0032 § A4 et § A6.6) : programmes lus dans le dossier
 * `VADROUILLE_PROTOTYPE_DIR` (lu une fois, à la création), relecteur **simulé** dans tous les cas (P0b1 : aucun
 * relecteur réel, aucune clé lue, aucun appel à Google, sous `pnpm dev` comme en préversion ou en CI).
 *
 * L'instance (index du chargeur, compteur du relecteur simulé) n'existe que si la liste blanche
 * `prototypeAdapterAllowed` est vraie ; elle ne garde aucune durée relue. Elle vit sur `globalThis`, comme la
 * portée des simulations (`simulation.ts`) : Next.js charge une copie du module par route, et la route du
 * compteur (`/dev/api/prototype/relectures`) doit lire le relecteur des pages.
 */

const AUCUN_PROGRAMME: SourceProgrammes = { ids: async () => [], lire: async () => null };

interface Instance {
  adapter: TripAdapter;
  relecteur: RelecteurSimule;
}

const INSTANCE_KEY = Symbol.for("vadrouille.prototype");
const holder = globalThis as typeof globalThis & { [INSTANCE_KEY]?: Instance };

/** Lève une erreur explicite hors liste blanche : jamais de repli silencieux vers `mock`. */
export function assertPrototypeAllowed(env: NodeJS.ProcessEnv): void {
  if (!prototypeAdapterAllowed(env)) {
    throw new Error("adaptateur prototype refusé : environnement hors liste blanche (production ou non autorisé)");
  }
}

export function prototypeTripAdapter(env: NodeJS.ProcessEnv = process.env): TripAdapter {
  assertPrototypeAllowed(env);
  if (!holder[INSTANCE_KEY]) {
    const dossier = env.VADROUILLE_PROTOTYPE_DIR?.trim();
    const programmes = dossier ? createProgrammeLoader({ dossier }) : AUCUN_PROGRAMME;
    const relecteur = createRelecteurSimule();
    holder[INSTANCE_KEY] = { adapter: createPrototypeAdapter({ programmes, relecteurs: { trajets: relecteur } }), relecteur };
  }
  return holder[INSTANCE_KEY].adapter;
}

/**
 * Nombre de relectures demandées au relecteur simulé (e2e « prototype sans cache », `GET
 * /dev/api/prototype/relectures`) ; `null` hors liste blanche.
 */
export function prototypeRelectures(env: NodeJS.ProcessEnv = process.env): number | null {
  if (!prototypeAdapterAllowed(env)) return null;
  return holder[INSTANCE_KEY]?.relecteur.appels() ?? 0;
}
