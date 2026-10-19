import "server-only";

/**
 * Port de démarrage du workflow 1 (aperçu ; spécification B9, B9b : « démarrage du workflow 1 par un double sans
 * appel », le vrai workflow arrive avec B9c). Reçoit **seulement** l'identifiant interne de l'exécution
 * (`generation_runs.id`) : l'état sérialisé d'un workflow ne porte que des identifiants (0011 § 3, B9-TL-3 point 1 (4)),
 * jamais un brouillon, un brief ni une donnée Google. Rend l'identifiant de l'exécution du workflow
 * (`workflow_run_id`), ou `null` quand rien n'a été démarré.
 */
export type DemarrerApercu = (generationRunId: string) => Promise<string | null>;

/**
 * Double sans appel (B9b) : ne démarre rien, n'appelle aucun fournisseur, ne lit ni n'écrit rien ; l'exécution reste
 * `queued` (puis expire au bout de N, B9-TL-3 point 5, tant que B9c n'a pas branché le workflow 1).
 */
export const demarrerApercuSansAppel: DemarrerApercu = async () => null;
