"use server";

import { headers } from "next/headers";

import type { IssueChoixApi, IssueSuggestionsApi } from "@/contracts/villes";
import { choisirVilleApiTerminal, journaliserExceptionApi, suggererVillesApiTerminal } from "@/server/composition/villes-api";

/**
 * Actions serveur de la recherche de ville de l'écran 1 de `api` (décision 0141 § 6.1 point 4 ; plan du MVP, ligne
 * M1f) : suggestions Google Places (Autocomplete (New)) puis fiche de la ville choisie, derrière la garde des seuils, la
 * barrière B9-TL-8 et son crochet d'accès de `api` (fermé jusqu'à M1h), le limiteur `ville-recherche` et les compteurs du
 * jour (`src/server/composition/villes-api.ts`). Entrée distincte de celle du site d'essai
 * (`src/server/actions/villes-essai.ts`) : rien du chemin d'essai n'entre dans la vraie app. Entrées non fiables,
 * revalidées par le cœur ; réponses fermées ; une exception rend `indisponible` et écrit `ville.refusee` motif
 * `exception` (nom de classe seul). La clé serveur ne quitte jamais le serveur.
 */

/** Suggestions de villes pour la saisie de la destination. */
export async function suggererVillesApi(entree: { readonly saisie: string; readonly session: string }): Promise<IssueSuggestionsApi> {
  try {
    return await suggererVillesApiTerminal({ saisie: entree?.saisie, session: entree?.session }, { headers: new Headers(await headers()) });
  } catch (erreur) {
    journaliserExceptionApi("suggestions", erreur);
    return { statut: "indisponible" };
  }
}

/** Ville choisie dans les suggestions : une des 62 villes du MVP, pays et fuseau des tables maison, `placeId`. */
export async function choisirVilleApi(entree: {
  readonly placeId: string;
  readonly session: string;
  readonly saisie: string;
  readonly principal: string;
}): Promise<IssueChoixApi> {
  try {
    return await choisirVilleApiTerminal(
      { placeId: entree?.placeId, session: entree?.session, saisie: entree?.saisie, principal: entree?.principal },
      { headers: new Headers(await headers()) },
    );
  } catch (erreur) {
    journaliserExceptionApi("choix", erreur);
    return { statut: "indisponible" };
  }
}
