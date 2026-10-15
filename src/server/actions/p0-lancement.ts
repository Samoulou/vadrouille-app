"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { NOM_COOKIE_ACCES } from "@/server/p0/acces";
import { poolPrototype } from "@/server/p0/base";
import { lancerExecutionP0, type StatutLancement } from "@/server/p0/lancement";

/**
 * Action serveur du lancement d'une exécution du mode réel (`/prototype/executions` ; décision 0055, section 8, ligne
 * P0r3d) : réservation, puis démarrage de `p0Run` (`src/server/p0/lancement.ts`). Appelée par le formulaire (`POST`)
 * seulement ; seuls les champs `brief`, `variante` et `mode` sont lus. L'état rendu au formulaire ne porte qu'un statut
 * fermé, jamais une valeur, un identifiant ni un message d'erreur. Seule action de ce fichier.
 */

/** État du formulaire de lancement : statut seulement. */
export type EtatLancementP0 = { readonly statut: "attente" | StatutLancement };

/** Lance une exécution ; la page est relue ensuite (suivi et décompte à jour). */
export async function lancerExecutionP0Action(_precedent: EtatLancementP0, donnees: FormData): Promise<EtatLancementP0> {
  let statut: StatutLancement;
  try {
    const cookie = (await cookies()).get(NOM_COOKIE_ACCES)?.value;
    statut = await lancerExecutionP0({ brief: donnees.get("brief"), variante: donnees.get("variante"), mode: donnees.get("mode") }, { cookie, pool: poolPrototype });
  } catch {
    statut = "erreur";
  }
  if (statut === "lancee" || statut === "demarrage_impossible") revalidatePath("/prototype/executions");
  return { statut };
}
