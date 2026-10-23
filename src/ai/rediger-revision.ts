import "server-only";

import type { ClientModeles, ReponseModele } from "@/ai/client";
import { EntreeRevisionSchema, type EntreeRevision } from "@/ai/entree-revision";
import type { Routage } from "@/ai/reglages";
import { requeteRevision } from "@/ai/requetes";

/**
 * Capacité de modèle de l'étape `etapeRevision` (spécification E2E-essai, lot 4 ; décision 0126) : **une** requête de
 * révision pour tout le séjour, sans outil ni recherche web, comme `redigerProgramme`.
 *
 * Entrée : `EntreeRevision`, **validée** par son schéma strict avant tout envoi : une clé en trop (un identifiant de lieu,
 * une position ou un temps glissés par erreur) refuse l'entrée (`RangeError`), sans requête. Routage : `zdr: true` et
 * `data_collection: "deny"` quel que soit le réglage reçu (verdict S5 de 0117, comme la requête `programme`).
 */
export type RedigerRevision = (entree: EntreeRevision) => Promise<ReponseModele>;

export function creerRedigerRevision(modeles: ClientModeles, reglage: { readonly modele: string; readonly routage: Routage }): RedigerRevision {
  return (entree) => {
    const lue = EntreeRevisionSchema.safeParse(entree);
    if (!lue.success) return Promise.reject(new RangeError("revision : entrée refusée"));
    return modeles.envoyer(requeteRevision(lue.data, reglage.modele, { ...reglage.routage, data_collection: "deny", zdr: true }));
  };
}
