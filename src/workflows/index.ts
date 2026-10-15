import "server-only";

import { getRun as runDuSdk, start } from "workflow/api";

import type { GardeOuverte } from "@/server/p0/garde";

import { p0Run } from "./p0-run";

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
 * - **`p0Run` non démarrable** : tant que `P0RUN_COMPLET` est faux, `startWorkflow` refuse de le démarrer
 *   (`real_mode_unavailable`), sans appel au SDK. L'étape finale est livrée (P0r3c-5) ; restent les conditions du point 7
 *   de l'amendement P0r3c-5 de 0063 (verdict Sécurité, action de lancement de P0r3d, levée du verrou S8, brief d'essai).
 */

export const REGION_WORKFLOWS = "fra1";

/** Workflows démarrables ; B9 ajoute les siens. */
export type NomWorkflow = "p0Run";

/** Vrai seulement quand les conditions du point 7 de l'amendement P0r3c-5 de 0063 sont remplies ; jusque-là, aucun démarrage. */
export const P0RUN_COMPLET = false;

export type ResultatDemarrage = { readonly ok: true; readonly workflowRunId: string } | { readonly ok: false; readonly code: "real_mode_unavailable" };

/** Démarre un workflow pour l'exécution réservée par la garde ; rend l'identifiant de l'exécution du SDK. */
export async function startWorkflow(nom: NomWorkflow, garde: GardeOuverte): Promise<ResultatDemarrage> {
  if (nom !== "p0Run" || !P0RUN_COMPLET) return { ok: false, code: "real_mode_unavailable" };
  const run = await start(p0Run, [{ runId: garde.runId }], { region: REGION_WORKFLOWS });
  return { ok: true, workflowRunId: run.runId };
}

/** États d'une exécution du SDK, sans autre donnée (aucune entrée ni sortie relue ici). */
export type StatutWorkflow = "pending" | "running" | "completed" | "failed" | "cancelled";

/** État d'une exécution du SDK, par son identifiant. */
export async function getRun(workflowRunId: string): Promise<{ readonly statut: StatutWorkflow }> {
  return { statut: await runDuSdk(workflowRunId).status };
}
