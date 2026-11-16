"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { CHEMIN_QUESTIONNAIRE_PREVENTE_MERCI } from "@/config/prevente";
import type { PreventeEtatEnvoi } from "@/contracts/prevente-mesure";
import { envoyerQuestionnaire } from "@/server/prevente/questionnaire";

/**
 * Action serveur du formulaire `/precommande/questionnaire` (spécification `specs/C2-prevente-mesure.md`, § 3.3 ; tâche
 * C2c, ticket 1137 ; décision 0177 § 3 et § 5), sur le modèle de `saisirCodeAccesP0`. **Seule exportation** de ce
 * fichier, et aucune logique : elle transmet le formulaire et les en-têtes au cas d'usage
 * (`src/server/prevente/questionnaire.ts`), qui ne lève pas.
 *
 * Envoi accepté : `redirect()` vers l'état « Merci », adresse sans aucun paramètre, **hors de tout `try`** (la
 * redirection de Next.js est une exception : l'attraper l'annulerait). Sinon : l'état rendu au formulaire, un statut
 * fermé et, pour un refus du limiteur, du plafond ou de l'écriture, les réponses validées.
 */
export async function envoyerQuestionnairePrevente(_precedent: PreventeEtatEnvoi, donnees: FormData): Promise<PreventeEtatEnvoi> {
  const resultat = await envoyerQuestionnaire(donnees, new Headers(await headers()));
  if (resultat.statut === "envoyee") redirect(CHEMIN_QUESTIONNAIRE_PREVENTE_MERCI);
  return resultat;
}
