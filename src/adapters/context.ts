import { MOCK_REQUEST_CONTEXT } from "./mock";
import type { AdapterContext } from "./types";

/**
 * Contexte d'organisation d'une requête de page (décision 0013, § 3.6).
 *
 * Phase 0, sans authentification : l'organisation simulée, **seulement** avec l'adaptateur `mock`.
 * Toute autre valeur de `DATA_ADAPTER` lève une erreur. B3 remplacera ce corps par la lecture de la
 * session (le contexte vient de la session, jamais du client), sans changer les pages qui l'appellent.
 */
export function getRequestContext(value: string | undefined = process.env.DATA_ADAPTER): AdapterContext {
  const choice = value?.trim() || "mock";
  if (choice !== "mock") {
    throw new Error(`contexte de requête indisponible avec DATA_ADAPTER « ${choice} » (authentification : B3)`);
  }
  return { ...MOCK_REQUEST_CONTEXT };
}
