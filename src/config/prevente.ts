/**
 * Adresses du questionnaire de la prévente (spécification `specs/C2-prevente-mesure.md`, § 3.2 point 1 et § 3.3 point 5 ;
 * décision 0177 § 3). Module neutre, sans dépendance : lu par l'action serveur de l'envoi (C2c) et, en C2d, par les
 * routes de l'accueil. L'état « Merci » est une adresse à part, **sans aucun paramètre** : la recharger est un `GET`
 * qui n'écrit rien.
 */
export const CHEMIN_QUESTIONNAIRE_PREVENTE = "/precommande/questionnaire";
export const CHEMIN_QUESTIONNAIRE_PREVENTE_MERCI = "/precommande/questionnaire/merci";
