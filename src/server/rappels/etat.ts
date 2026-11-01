import "server-only";

import { z } from "zod";

/**
 * État sérialisé du workflow des rappels (M6c, ticket 1021 ; décision 0157 § 1.7 point 1 ; spécification M6 § 5.3 point 6 ;
 * handover back-end § 8, « État persistant des workflows ») : **identifiants seulement**, objets stricts. Ni adresse, ni nom
 * d'étape, ni destination, ni date, ni donnée Google : chaque réveil relit tout en base.
 */

const Uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

/** Entrée d'une exécution (et de son relais) : organisation, voyage, personne, accord. */
export const EtatRappelSchema = z.strictObject({
  organizationId: Uuid,
  tripId: Uuid,
  userId: Uuid,
  consentId: Uuid,
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
