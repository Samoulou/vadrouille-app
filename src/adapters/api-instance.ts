import { creerRelecturesVoyages, tableDesRelectures, type DoubleRelectures, type TableRelectures } from "@/mocks/relectures-voyages";

import { assertApiAdapter } from "./api-guard";
import type { TripAdapter } from "./types";

/**
 * Adaptateur `api` de l'application (spécification B6, B6b point 1 ; décisions 0086 § 2.1 et 0100 § 5.4, amendée par 0108).
 *
 * **Branchement au démarrage** (sur le modèle de la connexion réelle de `better-auth.ts` et de `brancherLectureProgrammesReels`) : ce
 * module n'importe ni `./api.ts` (cas d'usage de `src/server/voyages/`, donc `withOrg` et la base), ni
 * `@/server/composition/lecture` (fabrique des clients Google, environnement serveur). Le régime de confinement l'exige :
 * les doubles de `@/adapters` chargent le module réel, qui ne doit atteindre aucun module à capacité, et aucun fichier de
 * `src/app`, `src/features` ou `src/components` ne doit atteindre `src/server/env` ni `src/server/composition`, même par
 * un `import()` (test « p0: clé côté serveur seulement »). `src/instrumentation.ts` branche, quand `DATA_ADAPTER` vaut
 * `api`, la fabrique `(double) => createApiTripAdapter({ relectures: choisirSourceRelectures(double) })`.
 *
 * À chaque appel de `getTripAdapter("api")` : garde (`assertApiAdapter`, fermée par défaut, sans repli vers `mock`),
 * puis un **double neuf** de `src/mocks/relectures-voyages.ts` (ses compteurs ne survivent pas à la requête ; sa table,
 * valeurs du jeu simulé seulement, est construite une fois), remis à la fabrique branchée, qui garde ce double ou choisit
 * la source réelle de B8b (`local` et `RELECTURES_SOURCE=google`, 0100 § 5.3). Non branchée (tests, `next build`, autre
 * runtime) : chaque méthode rejette, sans rien lire (échec fermé, page d'erreur).
 *
 * Garde-fou (comme le branchement de la connexion réelle) : la clé `Symbol.for` est devinable ; un second branchement lève
 * `LectureDejaBrancheeError` (aucun module chargé après le démarrage ne peut substituer sa fabrique), et hors de `tests/`
 * seuls ce module et `src/instrumentation.ts` nomment `brancherLectureVoyages` (`tests/unit/auth/points-injection.test.ts`).
 */

/** Fabrique branchée au démarrage : reçoit le double de relectures de la requête. */
export type FabriqueLectureVoyages = (double: DoubleRelectures) => TripAdapter;

// Sur `globalThis`, comme `prototype-instance.ts` et `better-auth.ts` : Next.js charge une copie du module par route.
const LECTURE_KEY = Symbol.for("vadrouille.lecture-voyages");
const holder = globalThis as typeof globalThis & { [LECTURE_KEY]?: FabriqueLectureVoyages };

/** Second branchement refusé ; ne porte aucune valeur. */
export class LectureDejaBrancheeError extends Error {
  override name = "LectureDejaBrancheeError";

  constructor() {
    super("Lecture des voyages déjà branchée.");
  }
}

/** Branche la fabrique de l'adaptateur `api` (appelé une fois, au démarrage, par `src/instrumentation.ts`). */
export function brancherLectureVoyages(fabrique: FabriqueLectureVoyages): void {
  if (holder[LECTURE_KEY] !== undefined) throw new LectureDejaBrancheeError();
  holder[LECTURE_KEY] = fabrique;
}

/** Tests seulement : retire la fabrique branchée. */
export function debrancherLectureVoyagesPourTests(): void {
  delete holder[LECTURE_KEY];
}

/** Table du double (valeurs du jeu simulé, aucune valeur relue), construite une fois à la demande. */
let table: TableRelectures | undefined;

const METHODES = ["listTrips", "getTrip", "getDay", "listProposals", "listPreviewSlots", "getDayMap", "getTripMap", "getDeckSession"] as const satisfies readonly (keyof TripAdapter)[];

/** Adaptateur non branché : chaque méthode rejette sans rien lire (jamais une lecture de `mock`). */
function adaptateurNonBranche(): TripAdapter {
  const refus = async (): Promise<never> => {
    throw new Error("adaptateur api non branché (src/instrumentation.ts)");
  };
  return Object.fromEntries(METHODES.map((m) => [m, refus])) as unknown as TripAdapter;
}

/** Adaptateur `api` d'une requête : garde, puis fabrique branchée sur un double neuf. */
export function apiTripAdapter(): TripAdapter {
  assertApiAdapter();
  const fabrique = holder[LECTURE_KEY];
  if (fabrique === undefined) return adaptateurNonBranche();
  table ??= tableDesRelectures();
  return fabrique(creerRelecturesVoyages({ table }));
}
