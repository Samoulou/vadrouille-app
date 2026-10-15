import "server-only";

import type { ClientModeles, ReponseModele } from "@/ai/client";
import { requeteNotation } from "@/ai/requetes";
import type { Brief } from "@/prototype/brief";
import type { Candidat } from "@/prototype/candidat";
import type { Routage } from "@/prototype/config";

/**
 * Capacité de modèle de l'**étape finale** de `p0Run` pour la notation des candidats (réponse 1 du Tech Lead à la revue
 * du head `608ee99` de la PR 348, consignée dans 0063 ; amendement A3 de 0055 § 3 point 5). Construite par la
 * composition à partir du client de modèles, comme `redigerRaisons` : l'étape finale ne reçoit jamais le client brut,
 * ni la recherche web, ni les pages.
 *
 * Entrée : celle du constructeur de prompts typé `requeteNotation` (`src/ai/requetes.ts`) : le brief et **nos**
 * descriptions d'un lot de candidats (`Candidat`, trouvés par l'agent sur le web), identifiants internes compris.
 * **Aucun champ pour une donnée Google** : ni identifiant de lieu, ni position, ni statut, ni horaire, ni logement
 * résolu (test de type de `tests/unit/p0/composition.test.ts`). La notation précède les fiches de l'étape finale ; les
 * notes restent en mémoire, jamais persistées ni passées d'une étape à l'autre (0011 § 3).
 */
export type EntreeNotation = { readonly brief: Brief; readonly lot: readonly Candidat[] };

export type NoterCandidats = (entree: EntreeNotation) => Promise<ReponseModele>;

export function creerNoterCandidats(modeles: ClientModeles, reglage: { readonly modele: string; readonly routage: Routage }): NoterCandidats {
  return (entree) => modeles.envoyer(requeteNotation(entree.brief, entree.lot, reglage.modele, reglage.routage));
}
