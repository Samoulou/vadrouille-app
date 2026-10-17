import "server-only";

import type { ClientModeles, ReponseModele } from "@/ai/client";
import type { CandidatPourModele, EntreeModeles } from "@/ai/entrees";
import type { Routage } from "@/ai/reglages";
import { requeteNotation } from "@/ai/requetes";

/**
 * Capacité de modèle de l'**étape finale** de `p0Run` pour la notation des candidats (réponse 1 du Tech Lead à la revue
 * du head `608ee99` de la PR 348, consignée dans 0063 ; amendement A3 de 0055 § 3 point 5). Construite par la
 * composition à partir du client de modèles, comme `redigerRaisons` : l'étape finale ne reçoit jamais le client brut,
 * ni la recherche web, ni les pages. **Seul chemin d'envoi** de la notation, composé aussi par `creerCoucheIa`
 * (`noter`, décision 0077 § 2 point 3).
 *
 * Entrée : celle du constructeur de prompts typé `requeteNotation` (`src/ai/requetes.ts`), sur les types de production
 * (B7a, 0077 § 1 point 6) : le voyage (`EntreeModeles`) et **nos** descriptions d'un lot de candidats
 * (`CandidatPourModele`, trouvés par l'agent sur le web), identifiants internes compris. **Aucun champ pour une donnée
 * Google** : ni identifiant de lieu, ni position, ni statut, ni horaire, ni logement résolu (test de type de
 * `tests/unit/p0/composition.test.ts`). `complement` : récit et logements de P0 (`ComplementP0`), passés seulement par
 * `p0Run` (0077 § 1 point 5) ; son type est celui du dernier paramètre de `requeteNotation`. La notation précède les
 * fiches de l'étape finale ; les notes restent en mémoire, jamais persistées ni passées d'une étape à l'autre (0011 § 3).
 */
export type EntreeNotation = {
  readonly entree: EntreeModeles;
  readonly lot: readonly CandidatPourModele[];
  readonly complement?: Parameters<typeof requeteNotation>[4];
};

export type NoterCandidats = (entree: EntreeNotation) => Promise<ReponseModele>;

export function creerNoterCandidats(modeles: ClientModeles, reglage: { readonly modele: string; readonly routage: Routage }): NoterCandidats {
  return (entree) => modeles.envoyer(requeteNotation(entree.entree, entree.lot, reglage.modele, reglage.routage, entree.complement));
}
