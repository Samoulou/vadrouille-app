import "server-only";

import type { DemarrerRappels } from "./accord";
import { EtatRappelSchema } from "./etat";

/**
 * Démarrage réel du workflow des rappels (M6c, ticket 1021 ; décision 0157 § 1.7 point 1) par l'interface des workflows :
 * import dynamique, comme `demarrerVoyageCompletReel` (`src/server/generation/demarrage.ts`) : le SDK n'est chargé qu'au
 * démarrage d'une exécution. Une entrée hors de `EtatRappelSchema` rend `{ ok: false }` sans charger le SDK. Rend `{ ok }` seulement, jamais un identifiant ni un message du SDK.
 */
export const demarrerRappelsReel: DemarrerRappels = async (entree) => {
  // Entrée réduite aux quatre identifiants (objet strict) : jamais une adresse, un texte ni un champ de plus.
  const lue = EtatRappelSchema.safeParse(entree);
  if (!lue.success) return { ok: false };
  const { demarrerRappels } = await import("@/workflows");
  const issue = await demarrerRappels(lue.data);
  return { ok: issue.ok };
};
