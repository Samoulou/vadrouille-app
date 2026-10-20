import "server-only";

import { ConfigClassementSchema, type ConfigClassement } from "@/domain/classement";

import valeurs from "../../../prototype/config/classement.json";

/**
 * Formule de classement du moteur (décision 0045 § 4.4 : elle reste dans `prototype/config/classement.json` tant que P0
 * tourne, et le serveur la lit par le même fichier, sans second exemplaire), validée au chargement par
 * `ConfigClassementSchema` (le même schéma que celui de P0). Une valeur absente ou hors bornes fait échouer le chargement
 * du module. Jamais écrite dans un prompt.
 */
export const CONFIGURATION_CLASSEMENT: ConfigClassement = ConfigClassementSchema.parse(valeurs);
