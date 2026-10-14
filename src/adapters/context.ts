import { PROTOTYPE_ORG_ID } from "@/prototype/programme-reduit";

import { MOCK_REQUEST_CONTEXT } from "./mock";
import { assertPrototypeAllowed } from "./prototype-instance";
import type { AdapterContext } from "./types";

/**
 * Utilisateur technique du prototype, seul propriétaire de `org_prototype` (évolution E6 de B2) : identifiant fixe de
 * type `uuid`, égal à celui que crée la migration `db/migrations/0003_prototype.sql` (décision 0046, D15 point 4), sans
 * compte ni session.
 */
export const PROTOTYPE_USER_ID = "5e1f0000-0000-4000-8000-000000000002";

/**
 * Contexte d'organisation d'une requête de page (décision 0013, § 3.6).
 *
 * Phase 0, sans authentification : l'organisation simulée avec l'adaptateur `mock` ; l'organisation fictive
 * `org_prototype` avec l'adaptateur `prototype`, sous la même liste blanche que l'adaptateur (décision 0032
 * § A4.2 : erreur hors liste blanche). Toute autre valeur de `DATA_ADAPTER` lève une erreur. B3 remplacera ce
 * corps par la lecture de la session (le contexte vient de la session, jamais du client), sans changer les
 * pages qui l'appellent.
 */
export function getRequestContext(
  value: string | undefined = process.env.DATA_ADAPTER,
  env: NodeJS.ProcessEnv = process.env,
): AdapterContext {
  const choice = value?.trim() || "mock";
  if (choice === "prototype") {
    assertPrototypeAllowed(env);
    return { organizationId: PROTOTYPE_ORG_ID, userId: PROTOTYPE_USER_ID, role: "owner" };
  }
  if (choice !== "mock") {
    throw new Error(`contexte de requête indisponible avec DATA_ADAPTER « ${choice} » (authentification : B3)`);
  }
  return { ...MOCK_REQUEST_CONTEXT };
}
