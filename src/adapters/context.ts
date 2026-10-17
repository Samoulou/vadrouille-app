import { cache } from "react";

import { PROTOTYPE_ORG_ID } from "@/prototype/programme-reduit";

import { assertAuthAdapter, authAdapterChoice } from "./auth-guard";
import { contexteDeSessionBranche } from "./better-auth";
import { MOCK_REQUEST_CONTEXT } from "./mock";
import { assertPrototypeAllowed } from "./prototype-instance";
import type { AdapterContext } from "./types";

/**
 * Utilisateur technique du prototype, seul propriétaire de `org_prototype` (évolution E6 de B2) : identifiant fixe de
 * type `uuid`, égal à celui que crée la migration `db/migrations/0003_prototype.sql` (décision 0046, D15 point 4), sans
 * compte ni session.
 */
export const PROTOTYPE_USER_ID = "5e1f0000-0000-4000-8000-000000000002";

/** Aucune session (connexion `better-auth`) : la page redirige vers l'écran 4, l'action rend `unauthenticated`. */
export class SessionRequiseError extends Error {
  override name = "SessionRequiseError";

  constructor() {
    super("Session requise.");
  }
}

/**
 * Contexte de la session (B3b, `getServerRequestContext`, branché au démarrage par `src/instrumentation.ts` : voir
 * `./better-auth.ts`), lu une fois par rendu de page (`cache` de React : la mise en page, la page et ses métadonnées
 * partagent la lecture ; sans effet dans une action). Non branché : erreur (page d'erreur), jamais une absence de session.
 */
const contexteDeSession = cache((): Promise<AdapterContext | null> => contexteDeSessionBranche());

/**
 * Contexte d'organisation d'une requête (décision 0013, § 3.6 ; spécification B3, B3c point 5 ; décision 0077 § 5.3,
 * B3-TL-4), ou `null` sans session.
 *
 * - `AUTH_ADAPTER=better-auth` : contexte **de la session**, quel que soit `DATA_ADAPTER` (B3-PO-10) : organisation
 *   active, personne et rôle lus par `getServerRequestContext()`, jamais une valeur du client ; `null` sans session,
 *   adhésion absente ou organisation en suppression. La garde de `getAuthAdapter()` s'applique d'abord (refus hors
 *   `local` et `ci`, B3-TL-2).
 * - Sinon, comportements de la phase 0, inchangés (jamais `null`) : l'organisation simulée avec l'adaptateur `mock` ;
 *   l'organisation fictive `org_prototype` avec l'adaptateur `prototype`, sous la même liste blanche que l'adaptateur
 *   (décision 0032 § A4.2 : erreur hors liste blanche). Toute autre valeur de `DATA_ADAPTER` lève une erreur.
 */
export async function getOptionalRequestContext(
  value: string | undefined = process.env.DATA_ADAPTER,
  env: NodeJS.ProcessEnv = process.env,
): Promise<AdapterContext | null> {
  if (authAdapterChoice(env) === "better-auth") {
    assertAuthAdapter(env);
    const ctx = await contexteDeSession();
    return ctx === null ? null : { ...ctx };
  }
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

/**
 * Contexte d'organisation d'une requête : **asynchrone** depuis B3c (B3-TL-4 ; « sans changer ce qu'elle renvoie »,
 * amendement de 0008 par 0077 § 5.3). Même contexte que `getOptionalRequestContext`, et `SessionRequiseError` sans
 * session (seulement avec `better-auth`). Les pages passent par `exigerSession` (`src/features/compte/session.ts`), qui
 * redirige vers `/connexion?suite=<chemin>`, la mise en page et les métadonnées par `contexteFacultatif` (même module) ;
 * les actions rendent `unauthenticated` (0017 § 4).
 */
export async function getRequestContext(
  value: string | undefined = process.env.DATA_ADAPTER,
  env: NodeJS.ProcessEnv = process.env,
): Promise<AdapterContext> {
  const ctx = await getOptionalRequestContext(value, env);
  if (ctx === null) throw new SessionRequiseError();
  return ctx;
}
