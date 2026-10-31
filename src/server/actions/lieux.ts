"use server";

import { headers } from "next/headers";

import { ajoutDeLieu, isApiAdapter, lieuxSimules } from "@/adapters";
import { fail, type PatchResult, type PlaceSearchResult, type Result, type RevisionPreview } from "@/contracts";
import { contexteFacultatif } from "@/features/compte/session";
import { journaliserExceptionLieux, rechercherLieuxApiTerminal } from "@/server/composition/lieux-api";

/**
 * Actions serveur du lieu à soi (tâche M5d-1, ticket 939 ; décision 0147 § 3, § 4, § 11 et § 13 ; spécification
 * `specs/M5-retouches.md` § 6). Module distinct de `src/server/actions/retouches.ts` (contrainte de fichiers du ticket :
 * M5b y travaille). Le contexte vient de la session (`contexteFacultatif`), jamais de l'entrée ; l'entrée est reçue en
 * `unknown` et revalidée par le cas d'usage (objets stricts : aucun champ pour un nom Google, une adresse ou la requête
 * dans une demande d'ajout, critère 21).
 *
 * - `searchPlaces` (`PlaceSearchRequest` → `PlaceSearchResult[]`) : sur `api`, le terminal
 *   `src/server/composition/lieux-api.ts` (garde des seuils, barrière B9-TL-8 fermée, limiteur `lieu-recherche`, compteur
 *   du jour, un appel Text Search) ; une exception rend `provider_error` et écrit `lieu.recherche` motif `exception` (nom de
 *   classe seul). Sur `mock`, la recherche simulée. Erreurs : `unauthenticated`, `validation_failed`, `not_found`,
 *   `not_unlocked`, `rate_limited` (texte « Tu as fait beaucoup de recherches aujourd'hui pour ce voyage. Réessaie
 *   demain. »), `cost_cap_reached` et `provider_error` (« La recherche n'est pas disponible pour le moment. »), `internal`.
 * - `previewAddPlace` (`AddPlaceRequest` → `RevisionPreview`, `kind: "add"`) et `applyAddPlace` (`AddPlaceApply` →
 *   `PatchResult`) : patch `[add, lock]` ; erreurs `unauthenticated`, `validation_failed`, `not_found`, `not_unlocked`,
 *   `rate_limited` (règle `retouche`), `version_conflict`, `no_option` avec `cause` (`no_room` : « Pas de place ce
 *   jour-là » ; `place_not_found`, `place_closed` : fiche du lieu ajouté ; décision 0155 § 1), `provider_error` (dont la
 *   lecture des fiches en échec), `cost_cap_reached`, `generation_in_progress`, `internal` ; hors `mock` et `api`,
 *   `internal` sans rien lire.
 *
 * Aucun nom ni adresse Google n'est stocké, journalisé ni mis dans un prompt ; la requête saisie non plus.
 */

export async function searchPlaces(input: unknown): Promise<Result<PlaceSearchResult[]>> {
  if (isApiAdapter()) {
    try {
      return await rechercherLieuxApiTerminal(input, { contexte: contexteFacultatif, headers: new Headers(await headers()) });
    } catch (erreur) {
      journaliserExceptionLieux(erreur);
      return fail("provider_error");
    }
  }
  const lieux = await lieuxSimules();
  return lieux === null ? fail("internal") : lieux.searchPlaces(await contexteFacultatif(), input);
}

export async function previewAddPlace(input: unknown): Promise<Result<RevisionPreview>> {
  const lieux = await ajoutDeLieu();
  return lieux === null ? fail("internal") : lieux.previewAddPlace(await contexteFacultatif(), input);
}

export async function applyAddPlace(input: unknown): Promise<Result<PatchResult>> {
  const lieux = await ajoutDeLieu();
  return lieux === null ? fail("internal") : lieux.applyAddPlace(await contexteFacultatif(), input);
}
