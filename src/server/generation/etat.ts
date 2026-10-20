import "server-only";

import { z } from "zod";

import { CODES_ARRET } from "./raison-echec";

/**
 * État sérialisé de `generatePreview` (décision 0081 B9-TL-3 point 1 (4), handover § 8 « État persistant des workflows »,
 * spécification B9c, critère `workflows: aucune donnée Google dans l'état sérialisé`) : l'identifiant de l'exécution, celui
 * de son organisation, le rang de la dernière étape terminée et, si l'exécution s'est arrêtée, le **code fermé** de l'arrêt.
 * Rien d'autre : ni brouillon, ni brief, ni candidat, ni `placeId`, ni verdict, ni date de contrôle, ni compteur d'ancrage.
 *
 * Écart à 0081 (signalé dans la PR) : `organizationId` s'ajoute à `{ generationRunId, rang }`. Les politiques de sécurité par
 * ligne des tables de génération ne voient une ligne que sous `app.organization_id` (`withSystemOrg`) : une étape ne peut
 * pas lire son exécution sans connaître l'organisation. L'identifiant d'organisation n'est pas une donnée de lieu.
 */
export const EtatEtapeSchema = z.strictObject({
  generationRunId: z.uuid(),
  organizationId: z.uuid(),
  /** Rang de la dernière étape terminée : 0 au démarrage, puis le `step_seq` de l'étape (`RANG_ETAPE`). */
  rang: z.number().int().min(0).max(6),
  /** Code fermé de l'arrêt (`generation_runs.stop_reason`), présent seulement si l'exécution s'est arrêtée. */
  arret: z.enum(CODES_ARRET).optional(),
});
export type EtatEtape = z.infer<typeof EtatEtapeSchema>;

/** Entrée d'une étape : validée par son contrat strict (une clé en trop, ou absente, refuse l'étape sans rien lire). */
export function lireEtat(valeur: unknown): EtatEtape {
  return EtatEtapeSchema.parse(valeur);
}
