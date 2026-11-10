import { z } from "zod";

import { TripIdSchema } from "./billing";

/**
 * Rappels par e-mail la veille de chaque journée (M6c, ticket 1021 ; spécification M6 § 5.2 ; décision 0157 § 1.7 point 5).
 * Entrées des actions `setTripReminders` et `getTripReminders` : l'identifiant du voyage seul (et l'état voulu pour
 * l'interrupteur) ; l'organisation et la personne viennent de la session, jamais du navigateur. Aucun identifiant d'accord
 * n'est exposé.
 */
export const TripRemindersRequestSchema = z.strictObject({
  tripId: TripIdSchema,
});
export type TripRemindersRequest = z.infer<typeof TripRemindersRequestSchema>;

/** Interrupteur « Rappel par e-mail la veille » : `enabled` vrai donne l'accord, faux le retire. */
export const TripRemindersUpdateSchema = z.strictObject({
  tripId: TripIdSchema,
  enabled: z.boolean(),
});
export type TripRemindersUpdate = z.infer<typeof TripRemindersUpdateSchema>;

/** État de l'accord de la personne pour ce voyage : `active` vrai tant qu'un accord n'est pas retiré. */
export type TripRemindersStatus = { readonly active: boolean };
