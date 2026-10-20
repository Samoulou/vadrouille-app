import "server-only";

import { getRun as runDuSdk, start } from "workflow/api";

import type { GardeOuverte } from "@/server/p0/garde";

import type { EtatEtape } from "@/server/generation/etat";

import { generatePreview } from "./apercu";
import { P0RUN_COMPLET } from "./complet";
import { p0Run } from "./p0-run";

export { P0RUN_COMPLET };
/** Pièces du lancement (P0r3d), lues dans le pont `p0-run.ts` : l'application n'importe pas `src/prototype` (0048 § 1). */
export { briefLancable, briefTientDansLeMode, cloreExecutionNonDemarree, lancementDuMode, NOMS_BRIEFS, relectureDuMode, verrouS8Leve, type LancementDuMode } from "./p0-run";

/**
 * Interface stable des workflows (décision 0009 point 2) : le reste du code ne connaît que ce module, jamais le paquet
 * `workflow`. Complété par B9 pour les workflows du MVP.
 *
 * - **Région** : chaque exécution est démarrée en `fra1` (`region`, décision 0063 point 5) ; sans cette option, le
 *   monde Vercel retombe sur `VERCEL_REGION` puis sur `iad1` (code de `@workflow/core` 5.1.0). État, files et flux de
 *   l'exécution restent dans cette région, sous la réserve de la documentation des files : en cas de panne régionale,
 *   des messages peuvent être stockés **temporairement dans une région voisine** (relevé 3 de la PR 326 ; Q28).
 * - **Garde exigée** : `p0Run` ne démarre que pour une exécution réservée par une garde ouverte (`GardeOuverte`) ; son
 *   entrée est l'identifiant d'exécution seul.
 * - **Interrupteur de `p0Run`** : si `P0RUN_COMPLET` (`./complet.ts`) est faux, `startWorkflow` refuse de le
 *   démarrer (`real_mode_unavailable`), sans appel au SDK. Il est vrai depuis la PR dédiée (conditions (a), (b) et (d)
 *   du point 7 de l'amendement P0r3c-5 de 0063 remplies) ; la levée du verrou S8 (c) reste contrôlée à chaque
 *   lancement par l'action de lancement.
 * - **Démarrage échoué** : une erreur du SDK rend `start_failed`, jamais son message ; l'appelant clôt l'exécution
 *   réservée (`cloreExecutionNonDemarree`).
 */

export const REGION_WORKFLOWS = "fra1";

/** Workflows démarrables par `startWorkflow` (garde de P0) ; `generatePreview` a son propre démarrage, `demarrerApercu`. */
export type NomWorkflow = "p0Run";

export type ResultatDemarrage =
  | { readonly ok: true; readonly workflowRunId: string }
  | { readonly ok: false; readonly code: "real_mode_unavailable" | "start_failed" };

/** Démarre un workflow pour l'exécution réservée par la garde ; rend l'identifiant de l'exécution du SDK. */
export async function startWorkflow(nom: NomWorkflow, garde: GardeOuverte): Promise<ResultatDemarrage> {
  if (nom !== "p0Run" || !P0RUN_COMPLET) return { ok: false, code: "real_mode_unavailable" };
  let workflowRunId: unknown;
  try {
    const run = await start(p0Run, [{ runId: garde.runId }], { region: REGION_WORKFLOWS });
    workflowRunId = run.runId;
  } catch {
    return { ok: false, code: "start_failed" };
  }
  return typeof workflowRunId === "string" ? { ok: true, workflowRunId } : { ok: false, code: "start_failed" };
}

/** États d'une exécution du SDK, sans autre donnée (aucune entrée ni sortie relue ici). */
export type StatutWorkflow = "pending" | "running" | "completed" | "failed" | "cancelled";

/** État d'une exécution du SDK, par son identifiant. */
export async function getRun(workflowRunId: string): Promise<{ readonly statut: StatutWorkflow }> {
  return { statut: await runDuSdk(workflowRunId).status };
}

/**
 * Démarre `generatePreview` pour l'exécution `preview` réservée (`queued`) par `createTrip` ou `retryGeneration` (B9c) :
 * entrée `{ generationRunId, organizationId, rang: 0 }` (`EtatEtapeSchema`), région `fra1`. Aucune garde de P0 : la barrière
 * de B9-TL-8 est vérifiée à l'entrée de chaque étape. Une erreur du SDK rend `start_failed`, jamais son message ; l'exécution
 * reste `queued` et expire (B9-TL-3 point 5).
 */
export async function demarrerApercu(generationRunId: string, organizationId: string): Promise<ResultatDemarrage> {
  const entree: EtatEtape = { generationRunId, organizationId, rang: 0 };
  let workflowRunId: unknown;
  try {
    const run = await start(generatePreview, [entree], { region: REGION_WORKFLOWS });
    workflowRunId = run.runId;
  } catch {
    return { ok: false, code: "start_failed" };
  }
  return typeof workflowRunId === "string" ? { ok: true, workflowRunId } : { ok: false, code: "start_failed" };
}
