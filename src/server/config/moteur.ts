import "server-only";

import { ConfigurationMoteurSchema, type ConfigurationMoteur } from "@/domain/configuration";

import valeurs from "./moteur.json";

/**
 * Configuration du moteur, lue côté serveur seulement (décisions 0045 § 4.2 et 0048 § 1.3), sur le modèle de
 * `offer.ts` : les valeurs de `moteur.json` (seule copie ; P0 lit le même fichier par `scripts/p0/fichiers.ts`),
 * validées au chargement par le schéma strict de `src/domain/configuration.ts`. Une valeur absente ou hors bornes
 * fait échouer le chargement du module. Le serveur la passe au moteur ; `src/domain` ne l'importe jamais.
 *
 * Frontière de 0048 § 1 : `src/domain` n'est atteint que par `src/server` ; l'interface n'importe jamais ce module
 * (`server-only`).
 */
export const CONFIGURATION_MOTEUR: ConfigurationMoteur = ConfigurationMoteurSchema.parse(valeurs);
