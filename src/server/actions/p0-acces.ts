"use server";

import { cookies } from "next/headers";

import { etatPageAcces, NOM_COOKIE_ACCES, OPTIONS_COOKIE_ACCES, saisirCodeAcces, type EtatPageAcces } from "@/server/p0/acces";
import { poolPrototype } from "@/server/p0/base";

/**
 * Actions serveur de la page de saisie du code d'accès du mode réel (`/prototype/executions` ; décision 0055,
 * section 2, D19 ; avis de la Sécurité S-2). La saisie ne passe que par `saisirCodeAccesP0`, appelée par le
 * formulaire (`POST`) : jamais dans une adresse, jamais renvoyée, jamais journalisée. L'état rendu au formulaire ne
 * porte qu'un statut fermé.
 */

/** État du formulaire de saisie : statut seulement, jamais la saisie. */
export type EtatSaisieCodeP0 = { readonly statut: "attente" | "accepte" | "invalid_code" | "too_many_attempts" | "erreur" };

/** État de la page : `fermee` (404 : garde fermée), `saisie`, ou `ouverte` (cookie valide). */
export async function etatPageExecutionsP0(): Promise<EtatPageAcces> {
  const cookie = (await cookies()).get(NOM_COOKIE_ACCES)?.value;
  return etatPageAcces(cookie);
}

/** Saisie du code : essai compté (5 par heure glissante) ; accepté, le cookie d'accès de 12 heures est posé. */
export async function saisirCodeAccesP0(_precedent: EtatSaisieCodeP0, donnees: FormData): Promise<EtatSaisieCodeP0> {
  const saisie = donnees.get("code");
  const resultat = await saisirCodeAcces(typeof saisie === "string" ? saisie : null, poolPrototype);
  if (resultat.ok) {
    (await cookies()).set(NOM_COOKIE_ACCES, resultat.cookie, OPTIONS_COOKIE_ACCES);
    return { statut: "accepte" };
  }
  if (resultat.code === "invalid_code" || resultat.code === "too_many_attempts") return { statut: resultat.code };
  return { statut: "erreur" };
}
