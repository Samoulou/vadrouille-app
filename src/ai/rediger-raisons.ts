import "server-only";

import type { ClientModeles, ReponseModele } from "@/ai/client";
import type { EntreeModeles, LieuRetenu } from "@/ai/entrees";
import type { Routage } from "@/ai/reglages";
import { requeteRaisons } from "@/ai/requetes";

/**
 * Capacité de modèle de l'**étape finale** de `p0Run`, réduite à la rédaction des raisons (décision 0055, section 3
 * point 5 ; 0052 § 1.4 ; 0011 § 4 et § 7). Construite par la composition à partir du client de modèles : l'étape finale
 * ne reçoit jamais le client brut, ni la recherche web, ni les pages. **Seul chemin d'envoi** des raisons, composé aussi
 * par `creerCoucheIa` (`rediger`, décision 0077 § 2 point 3).
 *
 * Entrée : celle du constructeur de prompts typé `requeteRaisons` (`src/ai/requetes.ts`), sur les types de production
 * (B7a, 0077 § 1 point 6) : le voyage (`EntreeModeles`) et **nos** descriptions des seuls lieux retenus (`LieuRetenu` :
 * `CandidatPourModele` et domaine de la source), identifiants internes compris. **Aucun champ pour une donnée Google** :
 * ni identifiant de lieu, ni position, ni statut, ni horaire, ni durée de trajet (test de type `p0: étape finale sans
 * donnée Google dans la rédaction des raisons`). `complement` : récit et logements de P0, passés seulement par `p0Run`.
 * Le classement et la réparation restent faits par le code, sans appel de modèle.
 */
export type EntreeRaisons = {
  readonly entree: EntreeModeles;
  readonly retenus: readonly LieuRetenu[];
  readonly complement?: Parameters<typeof requeteRaisons>[4];
};

export type RedigerRaisons = (entree: EntreeRaisons) => Promise<ReponseModele>;

export function creerRedigerRaisons(modeles: ClientModeles, reglage: { readonly modele: string; readonly routage: Routage }): RedigerRaisons {
  return (entree) => modeles.envoyer(requeteRaisons(entree.entree, entree.retenus, reglage.modele, reglage.routage, entree.complement));
}
