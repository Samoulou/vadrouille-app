"use server";

import { revisionEnregistree, signalementsDuVoyage, versionsDuVoyage } from "@/adapters";
import { fail, type MoveDraft, type MoveOptions, type PatchResult, type Result, type RevertPreview, type TripVersionPage } from "@/contracts";
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

/**
 * Versions du programme et retour à une version (M5b, ticket 934 ; décision 0147 § 5.3 et § 8 ; spécification M5 § 4), sur
 * `mock` (historique simulé de la portée) et `api` (`trip_versions`) ; hors de ces deux adaptateurs, `internal` sans rien
 * lire (le site d'essai n'a ni lien ni page).
 *
 * - `listTripVersions` (`{ tripId, before? }` → `TripVersionPage`) : 20 par page, de la plus récente à la plus ancienne ;
 * - `previewRevert` (`{ tripId, baseVersion, toVersion }` → `RevertPreview`) : « Ce qui change », rien n'est écrit ;
 * - `applyRevert` (`{ tripId, requestId, baseVersion, toVersion }` → `PatchResult`) : version nouvelle, copie identique de
 *   la version visée ; « Annuler » du toast en est un aussi, vers la version d'avant le retour.
 *
 * Erreurs : `unauthenticated`, `validation_failed` (entrée ; version visée non proposée au retour : `field: "toVersion"` ;
 * plus de `VERSIONS_MAX_PAR_VOYAGE` versions : `field: "baseVersion"`), `not_found`, `not_unlocked`, `rate_limited` (règle
 * `retouche`, `api`), `version_conflict` (avec `currentVersion`), `generation_in_progress`, `internal`.
 */
export async function listTripVersions(input: unknown): Promise<Result<TripVersionPage>> {
  const versions = await versionsDuVoyage();
  return versions === null ? fail("internal") : versions.listTripVersions(await contexteFacultatif(), input);
}

export async function previewRevert(input: unknown): Promise<Result<RevertPreview>> {
  const versions = await versionsDuVoyage();
  return versions === null ? fail("internal") : versions.previewRevert(await contexteFacultatif(), input);
}

export async function applyRevert(input: unknown): Promise<Result<PatchResult>> {
  const versions = await versionsDuVoyage();
  return versions === null ? fail("internal") : versions.applyRevert(await contexteFacultatif(), input);
}

/**
 * Déplacer une étape (ticket 947 ; feuille « Déplacer » de F7b ; décision 0147 § 8 et § 11), sur `api` seulement (`mock`
 * garde son jeu simulé dans le navigateur ; hors `api`, `internal` sans rien lire). Aucun appel Google ni Routes.
 *
 * - `getMoveOptions` (`{ tripId, stopId }` → `MoveOptions`) : points d'insertion par jour (aucun : « complet ») ;
 * - `previewMove` (`{ tripId, stopId, pointId, baseVersion }` → `MoveDraft`) : « Ce qui change », jours touchés sans durée
 *   de trajet ; rien n'est écrit ;
 * - `applyMove` (`{ tripId, requestId, stopId, pointId, baseVersion }` → `PatchResult`) : version nouvelle, patch `[move]`.
 *
 * Erreurs : `unauthenticated`, `validation_failed` (entrée ; étape verrouillée, engagement ou événement : `field: "stopId"` ;
 * plus de `VERSIONS_MAX_PAR_VOYAGE` versions : `field: "baseVersion"`), `not_found`, `not_unlocked`, `no_option` (point
 * absent de la version courante), `rate_limited` (règle `retouche`, application), `version_conflict` (avec
 * `currentVersion`), `generation_in_progress`, `internal`.
 */
export async function getMoveOptions(input: unknown): Promise<Result<MoveOptions>> {
  const revision = revisionEnregistree();
  return revision === null ? fail("internal") : revision.getMoveOptions(await contexteFacultatif(), input);
}

export async function previewMove(input: unknown): Promise<Result<MoveDraft>> {
  const revision = revisionEnregistree();
  return revision === null ? fail("internal") : revision.previewMove(await contexteFacultatif(), input);
}

export async function applyMove(input: unknown): Promise<Result<PatchResult>> {
  const revision = revisionEnregistree();
  return revision === null ? fail("internal") : revision.applyMove(await contexteFacultatif(), input);
}
