import "server-only";

import { cookies } from "next/headers";

import { etatPageAcces, NOM_COOKIE_ACCES, type EtatPageAcces } from "@/server/p0/acces";

/**
 * État de la page de saisie du code d'accès du mode réel (`/prototype/executions` ; décision 0055, section 2), lu par
 * le composant serveur de la page seulement. Module ordinaire, **pas** une action serveur : un export d'un fichier
 * `"use server"` serait appelable par n'importe quel client et rendrait l'état de la garde (revue du head 6be9299,
 * mineur 7). La saisie reste la seule action (`src/server/actions/p0-acces.ts`).
 */
export async function etatPageExecutionsP0(): Promise<EtatPageAcces> {
  const cookie = (await cookies()).get(NOM_COOKIE_ACCES)?.value;
  return etatPageAcces(cookie);
}
