"use server";

import { revisionEnregistree, signalementsDuVoyage } from "@/adapters";
import { fail, type PatchResult, type Result } from "@/contracts";
import { contexteFacultatif } from "@/features/compte/session";

/**
 * Actions serveur des retouches du programme (spécification `specs/M5-retouches.md` ; décision 0147, § 1 et § 14). Le
 * contexte vient de la session (`contexteFacultatif`), jamais de l'entrée ; l'entrée est reçue en `unknown` et revalidée par
 * l'adaptateur (`mock`) ou par le cas d'usage (`api`, `src/server/voyages/signalement.ts`, cadre commun des actions sur un
 * voyage). Créé par M5c (ticket 904) ; M5a (ticket 919 : `lockStop`, `unlockStop`) et M5b y ajoutent les leurs.
 *
 * `reportStop` (`StopReport` → `null`) : signaler une erreur sur une étape, avant comme après le déblocage (M5-PO-1).
 * Erreurs : `unauthenticated`, `validation_failed` (entrée, ou événement, engagement, lieu à soi : `field: "stopId"`),
 * `not_found` (voyage hors de l'organisation, étape inconnue ou d'une journée non servie), `rate_limited` (débit ou plafond du
 * jour), `internal` (et hors `mock` et `api`, sans rien lire : la fiche du site d'essai n'a pas le bouton).
 */
export async function reportStop(input: unknown): Promise<Result<null>> {
  const signalements = await signalementsDuVoyage();
  return signalements === null ? fail("internal") : signalements.reportStop(await contexteFacultatif(), input);
}

/**
 * `lockStop` et `unlockStop` (M5a, ticket 919 ; décision 0147 § 8 et § 9 ; spécification M5 § 3) : `{ tripId, requestId,
 * stopId, baseVersion }` → `PatchResult`, une version nouvelle (auteur `user`, patch `[lock]` ou `[unlock]`), sans aucun
 * appel Google ni Routes. Erreurs : `unauthenticated`, `validation_failed` (entrée ; événement ou engagement : `field:
 * "stopId"` ; plus de `VERSIONS_MAX_PAR_VOYAGE` versions : `field: "baseVersion"` ; verrou sans effet), `not_found`,
 * `not_unlocked` (voyage non débloqué), `rate_limited` (règle `retouche`), `version_conflict` (avec `currentVersion`),
 * `generation_in_progress`, `internal` ; hors adaptateur `api`, `internal` sans rien lire (la fiche garde alors son verrou
 * en mémoire).
 */
export async function lockStop(input: unknown): Promise<Result<PatchResult>> {
  const revision = revisionEnregistree();
  return revision === null ? fail("internal") : revision.lockStop(await contexteFacultatif(), input);
}

export async function unlockStop(input: unknown): Promise<Result<PatchResult>> {
  const revision = revisionEnregistree();
  return revision === null ? fail("internal") : revision.unlockStop(await contexteFacultatif(), input);
}
