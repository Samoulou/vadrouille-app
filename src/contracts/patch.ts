import { z } from "zod";

import { texteMaison } from "./texte";
import { ChangeSchema, TimeSchema } from "./trip";
import { ADDED_STOP_NAME_MAX } from "./values";

/**
 * Patch d'une révision (décision 0037, B2-TL-3), stocké dans `trip_versions.patch`. **Contrat interne du
 * serveur** : jamais reçu du client. Le serveur le construit depuis les demandes de révision, attribue les
 * identifiants **avant** l'écriture (un patch stocké se rejoue tel quel, R10), le valide ici, puis l'écrit.
 *
 * Les opérations désignent les étapes par identifiant et s'appliquent dans l'ordre du tableau. Aucun champ pour un
 * nom Google, une adresse, une coordonnée, un horaire, une note ou une durée : les objets stricts les refusent.
 */

/** Identifiant d'étape : type de `Stop.id`. */
const StopIdSchema = z.string().min(1);
/** Jour du voyage (1 = J1). */
export const DayIndexSchema = z.number().int().positive();
/** Natures d'une étape ajoutée par la personne : jamais `event`. Source d'`add.kind` et d'`AddPlaceRequest.kind`. */
export const AddedStopKindSchema = z.enum(["activity", "meal"]);

/** Longueur maximale du nom saisi par la personne pour un ajout : définie dans `./values` (décision 0155 § 5.1), réexportée ici. */
export { ADDED_STOP_NAME_MAX };

export const TripPatchOperationSchema = z.discriminatedUnion("op", [
  /**
   * Remplacer l'étape par un candidat de la réserve (`candidates.id`, B1). `newStopId`, attribué par le serveur et
   * différent de `stopId`, est l'identifiant de l'étape créée : une étape remplacée n'est pas la même étape.
   */
  z.strictObject({ op: z.literal("replace"), stopId: StopIdSchema, candidateId: z.uuid(), newStopId: StopIdSchema }),
  /**
   * Ajouter une étape (`stopId` attribué par le serveur). `kind` sans valeur par défaut, jamais `event` ; `name` est
   * le nom saisi par la personne, jamais un nom Google ; `placeId` quand le lieu en a un.
   */
  z.strictObject({
    op: z.literal("add"),
    stopId: StopIdSchema,
    kind: AddedStopKindSchema,
    day: DayIndexSchema,
    time: TimeSchema,
    /** Nom saisi : texte maison (décision 0147 § 12 S4 : une ligne, sans caractère de contrôle, balise ni URL). */
    name: texteMaison(ADDED_STOP_NAME_MAX),
    placeId: z.string().min(1).optional(),
  }),
  /** Déplacer l'étape vers ce jour et cette heure (le point d'insertion est traduit avant l'écriture). */
  z.strictObject({ op: z.literal("move"), stopId: StopIdSchema, day: DayIndexSchema, time: TimeSchema }),
  z.strictObject({ op: z.literal("lock"), stopId: StopIdSchema }),
  z.strictObject({ op: z.literal("unlock"), stopId: StopIdSchema }),
  /** Annuler (PO-5) : crée une version identique à `toVersion`, seule dans le patch ; rien n'est supprimé. */
  z.strictObject({ op: z.literal("revert"), toVersion: z.number().int().positive() }),
]);
export type TripPatchOperation = z.infer<typeof TripPatchOperationSchema>;

export const TripPatchSchema = z
  .strictObject({
    /** UUID de la demande (forme de `TripRequest`, décision 0017). */
    requestId: z.uuid(),
    /** Version sur laquelle le patch s'applique ; la version 1 n'a pas de patch. */
    baseVersion: z.number().int().positive(),
    operations: z.array(TripPatchOperationSchema).min(1),
  })
  .superRefine((patch, ctx) => {
    const assigned = new Set<string>();
    const assign = (id: string, index: number, key: string) => {
      if (assigned.has(id)) {
        ctx.addIssue({
          code: "custom",
          message: "un identifiant attribué n'apparaît qu'une fois dans un patch",
          path: ["operations", index, key],
        });
      }
      assigned.add(id);
    };
    patch.operations.forEach((operation, index) => {
      switch (operation.op) {
        case "revert":
          if (patch.operations.length > 1) {
            ctx.addIssue({ code: "custom", message: "revert est seul dans operations", path: ["operations", index] });
          }
          if (operation.toVersion >= patch.baseVersion) {
            ctx.addIssue({
              code: "custom",
              message: "revert : 1 ≤ toVersion < baseVersion",
              path: ["operations", index, "toVersion"],
            });
          }
          break;
        case "replace":
          if (operation.newStopId === operation.stopId) {
            ctx.addIssue({
              code: "custom",
              message: "replace : newStopId diffère de stopId",
              path: ["operations", index, "newStopId"],
            });
          }
          assign(operation.newStopId, index, "newStopId");
          break;
        case "add":
          assign(operation.stopId, index, "stopId");
          break;
        default:
          break;
      }
    });
  });
export type TripPatch = z.infer<typeof TripPatchSchema>;

/**
 * Réponse d'une révision (décision 0037, B2-TL-4), jamais stockée : nouvelle version, jours touchés (distincts ;
 * l'ordre croissant est une règle du producteur, B5), changements calculés à la réponse (0011 point 5).
 */
export const PatchResultSchema = z.strictObject({
  version: z.number().int().min(2),
  touchedDays: z
    .array(DayIndexSchema)
    .refine((days) => new Set(days).size === days.length, { message: "touchedDays : jours distincts" }),
  changes: z.array(ChangeSchema),
});
export type PatchResult = z.infer<typeof PatchResultSchema>;
