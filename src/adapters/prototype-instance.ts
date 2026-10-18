import { prototypeAdapterAllowed } from "@/dev/flags";
import { createRelecteurSimule, type RelecteurSimule } from "@/mocks/prototype-relecteur";
import type { PoolSql } from "@/server/usage/neon";

import { createPrototypeAdapter, createPrototypeAdapterReel, type RelecteurTrajets } from "./prototype";
import { createSourceProgrammesReels } from "./prototype-lecture";
import { createProgrammeLoader } from "./prototype-loader";
import type { TripAdapter } from "./types";

/**
 * Adaptateur `prototype` de l'application (décision 0032 § A4 et § A6.6 ; décisions 0074 et 0079) :
 * - `VADROUILLE_PROTOTYPE_DIR` posée (lue une fois, à la création) : programmes lus dans ce dossier, relecteur
 *   **simulé** (P0b1 : aucun relecteur réel, aucune clé lue, aucun appel à Google ; `pnpm dev`, CI, e2e) ;
 * - sinon : programmes **réels** lus dans `prototype.programmes`, en lecture seule, **recomposés avec leurs positions**
 *   (`place_coordinates`, carte Google), derrière la barrière du mode réel (garde ouverte et cookie d'accès, vérifiée à
 *   chaque lecture ; fermée : aucun programme, comme avant), avec leurs temps de trajet conservés (0092) et le
 *   **relecteur Routes réel** pour les seules paires sans temps conservé (relues à chaque affichage, réservées et
 *   plafonnées, P0r4). La barrière (`src/server/p0/lecture-programmes.ts`) et le relecteur
 *   (`src/server/p0/relecture.ts`) sont **branchés au démarrage** par `src/instrumentation.ts`
 *   (`brancherLectureProgrammesReels`) : ce module n'importe ni la base, ni la garde, ni Routes (régime de confinement,
 *   doubles de `@/adapters`). Non branchés (tests, `next build`, autre runtime) : aucun programme, aucune relecture.
 *
 * L'instance (index du chargeur, compteur du relecteur simulé) n'existe que si la liste blanche
 * `prototypeAdapterAllowed` est vraie ; elle ne garde aucune durée relue. Elle vit sur `globalThis`, comme la
 * portée des simulations (`simulation.ts`) : Next.js charge une copie du module par route, et la route du
 * compteur (`/dev/api/prototype/relectures`) doit lire le relecteur des pages.
 */

/** Barrière de la lecture réelle : pool si elle est ouverte pour la requête courante, sinon `null`. */
export type BarriereLectureProgrammes = () => Promise<PoolSql | null>;

interface Instance {
  adapter: TripAdapter;
  relecteur: RelecteurSimule;
}

/** État du module sur `globalThis` : l'instance (créée à la demande) et la barrière branchée au démarrage. */
interface Etat {
  instance?: Instance;
  barriere?: BarriereLectureProgrammes;
  relecteur?: RelecteurTrajets;
}

const INSTANCE_KEY = Symbol.for("vadrouille.prototype");
const holder = globalThis as typeof globalThis & { [INSTANCE_KEY]?: Etat };

/**
 * Branche la barrière de la lecture réelle (appelé une fois, au démarrage, par `src/instrumentation.ts` ; décision
 * 0074). Sur `globalThis`, comme l'instance : Next.js charge une copie de ce module par route.
 */
export function brancherLectureProgrammesReels(barriere: BarriereLectureProgrammes, relecteur: RelecteurTrajets): void {
  holder[INSTANCE_KEY] = { ...holder[INSTANCE_KEY], barriere, relecteur };
}

/** Barrière lue à chaque lecture ; non branchée : `null` (aucune connexion, aucun programme). */
const poolLectureProgrammes: BarriereLectureProgrammes = async () => (await holder[INSTANCE_KEY]?.barriere?.()) ?? null;

/** Relecteur réel lu à chaque relecture ; non branché : refus (aucun appel ; page sans ces durées, 0092 § 4 ; jamais une durée inventée). */
const relecteurReel: RelecteurTrajets = {
  relireJournee: async (paires) => (await holder[INSTANCE_KEY]?.relecteur?.relireJournee(paires)) ?? { ok: false, raison: "unavailable" },
};

/** Lève une erreur explicite hors liste blanche : jamais de repli silencieux vers `mock`. */
export function assertPrototypeAllowed(env: NodeJS.ProcessEnv): void {
  if (!prototypeAdapterAllowed(env)) {
    throw new Error("adaptateur prototype refusé : environnement hors liste blanche (production ou non autorisé)");
  }
}

export function prototypeTripAdapter(env: NodeJS.ProcessEnv = process.env): TripAdapter {
  assertPrototypeAllowed(env);
  const etat = holder[INSTANCE_KEY] ?? {};
  if (!etat.instance) {
    const dossier = env.VADROUILLE_PROTOTYPE_DIR?.trim();
    const relecteur = createRelecteurSimule();
    const adapter = dossier
      ? createPrototypeAdapter({ programmes: createProgrammeLoader({ dossier }), relecteurs: { trajets: relecteur } })
      : createPrototypeAdapterReel({ programmes: createSourceProgrammesReels({ pool: poolLectureProgrammes }), relecteurs: { trajets: relecteurReel } });
    etat.instance = { adapter, relecteur };
    holder[INSTANCE_KEY] = etat;
  }
  return etat.instance.adapter;
}

/**
 * Nombre de relectures demandées au relecteur simulé (e2e « prototype sans cache », `GET
 * /dev/api/prototype/relectures`) ; `null` hors liste blanche.
 */
export function prototypeRelectures(env: NodeJS.ProcessEnv = process.env): number | null {
  if (!prototypeAdapterAllowed(env)) return null;
  return holder[INSTANCE_KEY]?.instance?.relecteur.appels() ?? 0;
}
