import "server-only";

/**
 * Écriture du `placeId` vérifié d'un séjour (`stays.place_id`), commune aux deux chaînes : étape `l` et voyage complet de
 * l'ancienne chaîne, étape `e` de `generateProgramme` (décision 0136 § 3.2). Module neutre (revue du head 3536d13 de la
 * PR #854, mineur 3) : la chaîne inversée ne dépend pas de `etapes.ts`, qui sera retiré avec l'ancienne chaîne (T7).
 */
export const SQL_PLACE_SEJOUR = `UPDATE public.stays SET place_id = $5
  WHERE organization_id = $1 AND trip_id = $2 AND city = $3 AND from_date = $4::date`;
