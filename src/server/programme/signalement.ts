import "server-only";

/**
 * Règles du signalement d'une erreur sur une étape (tâche M5c, ticket 904 ; décision 0147 § 1 point 4) : **réexportation
 * seule** de `src/domain/signalement.ts`, pour l'adaptateur `mock` (`src/adapters/mock-reports.ts`), qui ne peut pas
 * atteindre `src/domain` (frontière de 0048 § 1), sur le modèle de `./apercu.ts`. `src/server` importe
 * `@/domain/signalement` directement. Aucune copie : les fonctions sont les mêmes objets.
 */
export { debutDuJourUtc, etapeSignalable, situerEtapeSignalee } from "@/domain/signalement";
