"use server";

import { cookies } from "next/headers";

import type { IssueChoixEssai, IssueSuggestionsEssai } from "@/contracts/villes";
import { choisirVilleEssai, journaliserException, suggererVillesEssai } from "@/server/composition/villes";
import { NOM_COOKIE_ACCES } from "@/server/p0/acces";

/**
 * Actions serveur de la recherche de ville de l'écran 1 du site d'essai (demande de Samuel du 23 octobre 2026) :
 * suggestions Google Places (Autocomplete (New)) puis fiche de la ville choisie, derrière la barrière du lancement
 * (garde du mode réel et cookie d'accès ; `src/server/composition/villes.ts`). Entrées non fiables, revalidées là ;
 * réponses fermées. La clé serveur ne quitte jamais le serveur.
 */

async function cookieAcces(): Promise<string | undefined> {
  return (await cookies()).get(NOM_COOKIE_ACCES)?.value;
}

/** Suggestions de villes pour la saisie de la destination. */
export async function suggererVilles(entree: { readonly saisie: string; readonly session: string }): Promise<IssueSuggestionsEssai> {
  try {
    return await suggererVillesEssai({ saisie: entree?.saisie, session: entree?.session }, { cookie: await cookieAcces() });
  } catch (erreur) {
    journaliserException("suggestions", erreur);
    return { statut: "indisponible" };
  }
}

/** Ville choisie dans les suggestions : pays et fuseau des tables maison, `placeId`. */
export async function choisirVille(entree: {
  readonly placeId: string;
  readonly session: string;
  readonly saisie: string;
  readonly principal: string;
}): Promise<IssueChoixEssai> {
  try {
    return await choisirVilleEssai(
      { placeId: entree?.placeId, session: entree?.session, saisie: entree?.saisie, principal: entree?.principal },
      { cookie: await cookieAcces() },
    );
  } catch (erreur) {
    journaliserException("choix", erreur);
    return { statut: "indisponible" };
  }
}
