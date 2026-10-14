import "server-only";

import type { ClientModeles, ReponseModele } from "@/ai/client";
import { requeteRaisons } from "@/ai/requetes";
import type { Brief } from "@/prototype/brief";
import type { Candidat } from "@/prototype/candidat";
import type { Routage } from "@/prototype/config";

/**
 * Capacité de modèle de l'**étape finale** de `p0Run`, réduite à la rédaction des raisons (décision 0055, section 3
 * point 5 ; 0052 § 1.4 ; 0011 § 4 et § 7). Construite par la composition à partir du client de modèles : l'étape finale
 * ne reçoit jamais le client brut, ni la recherche web, ni les pages.
 *
 * Entrée : celle du constructeur de prompts typé `requeteRaisons` (`src/ai/requetes.ts`) : le brief et **nos**
 * descriptions des seuls lieux retenus (`Candidat`, trouvés par l'agent sur le web), identifiants internes compris.
 * **Aucun champ pour une donnée Google** : ni identifiant de lieu, ni position, ni statut, ni horaire, ni durée de
 * trajet (test de type `p0: étape finale sans donnée Google dans la rédaction des raisons`). Le classement et la
 * réparation restent faits par le code, sans appel de modèle.
 */
export type EntreeRaisons = { readonly brief: Brief; readonly retenus: readonly Candidat[] };

export type RedigerRaisons = (entree: EntreeRaisons) => Promise<ReponseModele>;

export function creerRedigerRaisons(modeles: ClientModeles, reglage: { readonly modele: string; readonly routage: Routage }): RedigerRaisons {
  return (entree) => modeles.envoyer(requeteRaisons(entree.brief, entree.retenus, reglage.modele, reglage.routage));
}
