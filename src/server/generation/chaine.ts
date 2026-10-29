import "server-only";

import { CHAINE_APERCU, type ChaineApercu } from "@/server/config/generation";

/**
 * Chaîne de l'aperçu d'un jeu de dépendances (décision 0136 § 4.2), module feuille partagé par `src/server/generation` et
 * `src/server/creation` : `CHAINE_APERCU` **lue à l'appel** quand aucun jeu n'est injecté (composition de l'app) ; sinon celle
 * qu'il nomme, `"ancienne"` par défaut (les tests existants de l'ancienne chaîne passent sans modification).
 */
export function chaineDe(dependances: { readonly chaine?: ChaineApercu } | undefined): ChaineApercu {
  return dependances === undefined ? CHAINE_APERCU : (dependances.chaine ?? "ancienne");
}
