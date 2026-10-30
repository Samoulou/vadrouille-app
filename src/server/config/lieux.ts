import "server-only";

/**
 * Configuration serveur des retouches liées aux lieux (décision 0147 § 6.4 point 5) : valeurs lues ici, jamais écrites dans
 * une action. M5c y pose le plafond des signalements ; M5d-1 y ajoutera les seuils de la recherche d'un lieu à soi
 * (`SEUILS_LIEUX`, `SEUILS_LIEUX_VALIDES`, § 6.4 point 3).
 */

/**
 * Signalements d'erreur enregistrés au plus par voyage et par jour UTC (M5-PO-11 ; décision 0147 § 2 et § 6.4 point 2),
 * comptés dans `feedback` depuis minuit UTC du jour de la base. Proposition ; un doublon ou un rejeu n'est jamais compté.
 */
export const SIGNALEMENTS_PAR_VOYAGE_ET_PAR_JOUR = 20;
