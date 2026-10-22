import "server-only";

import type { ClientModeles, ReponseModele } from "@/ai/client";
import { EntreeProgrammeSchema, type EntreeProgramme } from "@/ai/entrees";
import type { Routage } from "@/ai/reglages";
import { requeteProgramme } from "@/ai/requetes";

/**
 * Capacité de modèle de l'étape `etapeProgramme` de `p0Run` (décision 0115 § 3 étape 1 ; décision 0116 § 2 et § 3) :
 * **une** requête `programme` pour tout le séjour, sans outil ni recherche web (0117 § 1). Construite par la composition
 * à partir du client de modèles, comme `noterCandidats` et `redigerRaisons` : l'étape ne reçoit jamais le client brut.
 *
 * Entrée : `EntreeProgramme` (toutes les saisies du brief de P0), **validée** par son schéma strict avant tout envoi :
 * une clé en trop (une donnée Google glissée par erreur, par exemple) refuse l'entrée (`RangeError`), sans requête.
 * Aucun champ pour une donnée Google (0011).
 */
export type RedigerProgramme = (entree: EntreeProgramme) => Promise<ReponseModele>;

export function creerRedigerProgramme(modeles: ClientModeles, reglage: { readonly modele: string; readonly routage: Routage }): RedigerProgramme {
  return (entree) => {
    const lue = EntreeProgrammeSchema.safeParse(entree);
    if (!lue.success) return Promise.reject(new RangeError("programme : entrée refusée"));
    // Verdict S5 de 0117 et 0116 § 2.2 : `zdr: true` et `data_collection: "deny"` pour la requête `programme`, quel que
    // soit le réglage reçu ; un routage refusé par le fournisseur échoue fermé (code du client, comme 0096 § 4.1).
    return modeles.envoyer(requeteProgramme(lue.data, reglage.modele, { ...reglage.routage, data_collection: "deny", zdr: true }));
  };
}
