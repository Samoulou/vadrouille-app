import "server-only";

import { z } from "zod";

import { JOURS_VOYAGE_COMPLET_MAX } from "@/server/config/generation";

import { CODES_ARRET } from "./raison-echec";

/**
 * État sérialisé de `generatePreview` (décision 0081 B9-TL-3 point 1 (4), handover § 8 « État persistant des workflows »,
 * spécification B9c, critère `workflows: aucune donnée Google dans l'état sérialisé`) : l'identifiant de l'exécution, celui
 * de son organisation, le rang de la dernière étape terminée et, si l'exécution s'est arrêtée, le **code fermé** de l'arrêt.
 * Rien d'autre : ni brouillon, ni brief, ni candidat, ni `placeId`, ni verdict, ni date de contrôle, ni compteur d'ancrage.
 *
 * Règle de la décision 0105 § 1 (qui amende 0081 B9-TL-3 points 1 (4) et 3 : `{ generationRunId, rang }` en était le minimum, non une
 * liste fermée) : l'état contient au plus ces quatre champs, `z.strictObject` ; tout autre exige une décision écrite.
 * `organizationId` est une **indication de portée, jamais une preuve** : l'étape lit sa ligne `generation_runs` sous
 * `withSystemOrg(organizationId)` ; si la ligne n'est pas visible (organisation fausse), elle s'arrête sans écriture ni appel.
 * Le démarreur tire l'organisation de la ligne réservée en base, jamais d'une entrée de la personne.
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

/**
 * État sérialisé de `generateFullTrip` (workflow 4, spécification B9d ; décision 0105 § 1, même règle) : les mêmes quatre champs
 * au plus. Seule la borne du rang change : `a` = 1, `l` = 2, puis `2 + 4 × i + k` pour le jour de rang `i` (0087 § 1.3 point 4).
 */
export const EtatCompletSchema = EtatEtapeSchema.extend({
  rang: z.number().int().min(0).max(2 + 4 * JOURS_VOYAGE_COMPLET_MAX),
});
export type EtatComplet = z.infer<typeof EtatCompletSchema>;

/** Entrée d'une étape du voyage complet, validée par son contrat strict. */
export function lireEtatComplet(valeur: unknown): EtatComplet {
  return EtatCompletSchema.parse(valeur);
}
