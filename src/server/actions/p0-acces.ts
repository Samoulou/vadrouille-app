"use server";

import { cookies } from "next/headers";

import { NOM_COOKIE_ACCES, OPTIONS_COOKIE_ACCES, saisirCodeAcces } from "@/server/p0/acces";
import { poolPrototype } from "@/server/p0/base";

/**
 * Action serveur de la page de saisie du code d'accès du mode réel (`/prototype/executions` ; décision 0055,
 * section 2, D19 ; avis de la Sécurité S-2). La saisie ne passe que par `saisirCodeAccesP0`, appelée par le
 * formulaire (`POST`) : jamais dans une adresse, jamais renvoyée, jamais journalisée. L'état rendu au formulaire ne
 * porte qu'un statut fermé. Seule action de ce fichier : l'état de la page est lu par `src/server/p0/page-acces.ts`,
 * module ordinaire, jamais appelable par un client.
 */

/** État du formulaire de saisie : statut seulement, jamais la saisie. */
export type EtatSaisieCodeP0 = { readonly statut: "attente" | "accepte" | "invalid_code" | "too_many_attempts" | "erreur" };

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
