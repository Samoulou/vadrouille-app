import "server-only";

import type { TripPatch } from "@/contracts";

/**
 * Reconnaissance d'un patch d'ajout d'une étape : exactement `[add, lock]` sur un même `stopId` (0147 § 11 ; 0155 § 4.1).
 * Fonction pure, partagée par `formeAdmise` (`retouches.ts`, formes admises d'un patch de la personne) et `estUnAjout`
 * (`src/server/lieux/annulation.ts`, qui exige en plus l'auteur `user` et le préfixe `ajout-`) ; dette relevée par la revue
 * de la PR 996 (Q810), ticket 998. Feuille du graphe d'imports : `server-only` et un import de type vers `@/contracts`.
 */

type Operation = TripPatch["operations"][number];
type OperationAjout = Extract<Operation, { op: "add" }>;

/** L'opération `add` si le patch est exactement `[add, lock]` sur un même `stopId` ; sinon `null`. */
export function ajoutVerrouille(patch: TripPatch): OperationAjout | null {
  if (patch.operations.length !== 2) return null;
  const [ajout, verrou] = patch.operations;
  return ajout?.op === "add" && verrou?.op === "lock" && verrou.stopId === ajout.stopId ? ajout : null;
}
