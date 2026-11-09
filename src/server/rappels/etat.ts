import "server-only";

import { z } from "zod";

/**
 * État sérialisé du workflow des rappels (M6c, ticket 1021 ; décision 0157 § 1.7 point 1 ; spécification M6 § 5.3 point 6 ;
 * handover back-end § 8, « État persistant des workflows ») : **identifiants seulement**, objets stricts. Ni adresse, ni nom
 * d'étape, ni destination, ni date, ni donnée Google : chaque réveil relit tout en base.
 */

const Uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

/** Numéro de génération d'une exécution dans la chaîne des relais d'un accord (décision 0162 § 2 point 1, `smallint`). */
export const RELAY_N_MAX = 32_767;

/**
 * Entrée d'une exécution (et de son relais) : organisation, voyage, personne, accord ; `relayN`, compteur de la génération
 * (décision 0162 § 3 point 1), **absent = génération 0** : `setTripReminders` démarre sans lui, et une exécution démarrée
 * par le code d'avant R-B relaie avec l'état à quatre clés, que ce schéma accepte toujours (arguments compatibles entre
 * les déploiements reliés, Workflow SDK 5.1.0, « Versioning »).
 */
export const EtatRappelSchema = z.strictObject({
  organizationId: Uuid,
  tripId: Uuid,
  userId: Uuid,
  consentId: Uuid,
  relayN: z.number().int().min(1).max(RELAY_N_MAX).optional(),
});
export type EtatRappel = z.infer<typeof EtatRappelSchema>;

/** Sortie d'un réveil : fin de l'exécution, ou attente en millisecondes avant le prochain réveil ; `echec` après une panne. */
export const SuiteRappelSchema = z.discriminatedUnion("suite", [
  z.strictObject({ suite: z.literal("fin") }),
  z.strictObject({
    suite: z.literal("attendre"),
    attenteMs: z.number().int().positive(),
    echec: z.literal(true).optional(),
  }),
]);
export type SuiteRappel = z.infer<typeof SuiteRappelSchema>;
