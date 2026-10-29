import "server-only";

/**
 * Port de démarrage du workflow 1 (aperçu ; spécification B9, B9b et B9c). Reçoit **seulement** les identifiants internes de
 * l'exécution (`generation_runs.id`) et de son organisation : l'état sérialisé d'un workflow ne porte que des identifiants
 * (0011 § 3, B9-TL-3 point 1 (4)), jamais un brouillon, un brief ni une donnée Google. L'organisation s'ajoute à 0081 : les
 * étapes n'ont aucune session, et la sécurité par ligne exige le contexte de l'organisation (`withSystemOrg`). Rend
 * l'identifiant de l'exécution du workflow (`workflow_run_id`), ou `null` quand rien n'a été démarré.
 */
export type DemarrerApercu = (generationRunId: string, organizationId: string) => Promise<string | null>;

/**
 * Double sans appel (B9b) : ne démarre rien, n'appelle aucun fournisseur, ne lit ni n'écrit rien ; l'exécution reste
 * `queued` (puis expire au bout de N, B9-TL-3 point 5, tant que B9c n'a pas branché le workflow 1).
 */
export const demarrerApercuSansAppel: DemarrerApercu = async () => null;

/**
 * Démarrage réel (B9c) : `generatePreview` par l'interface des workflows. Import dynamique : le SDK n'est chargé qu'au
 * démarrage d'une exécution, pas à l'import du module (les tests des cas d'usage injectent leur propre port). Un refus ou une
 * erreur de démarrage rend `null` : l'exécution reste `queued` et expire (B9-TL-3 point 5).
 */
export const demarrerApercuReel: DemarrerApercu = async (generationRunId, organizationId) => {
  const { demarrerApercu } = await import("@/workflows");
  const issue = await demarrerApercu(generationRunId, organizationId);
  return issue.ok ? issue.workflowRunId : null;
};

/**
 * Démarrage réel de `generateProgramme` (chaîne inversée, décision 0136 § 4.3), même forme que `demarrerApercuReel` : choisi
 * par la dépendance `chaine` des cas d'usage, jamais par l'appelant.
 */
export const demarrerProgrammeReel: DemarrerApercu = async (generationRunId, organizationId) => {
  const { demarrerProgramme } = await import("@/workflows");
  const issue = await demarrerProgramme(generationRunId, organizationId);
  return issue.ok ? issue.workflowRunId : null;
};

/** Port et démarrages du workflow 4 (`generateFullTrip`, B9d) : ceux de `src/server/generation/`, partagés avec la suite du paiement. */
export type { DemarrerVoyageComplet } from "@/server/generation/reconciliation";
export { demarrerVoyageCompletReel, demarrerVoyageCompletSansAppel } from "@/server/generation/demarrage";
