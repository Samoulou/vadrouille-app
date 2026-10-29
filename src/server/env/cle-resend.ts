import "server-only";

import { verifierSortie, type EnvSortie } from "@/server/env/egress";
import { cleResendBienFormee, resendAdmis } from "@/server/env/index";

/**
 * Module d'environnement étroit de l'envoi réel par Resend (`@/server/env/cle-resend`, spécification B3d, point 2 ;
 * décision 0138 § 2.4 et § 4). Lit la clé de l'API de Resend **à chaque envoi**, jamais à l'import, **après** la
 * barrière de sortie (`@/server/env/egress`) puis le prédicat du cas admis (`resendAdmis`), et refait le contrôle de
 * forme de `parseServerEnv`. Importable par `src/server/mail/resend.ts` seulement (lint `ligne/server-env-imports`) ;
 * son test injecte des objets d'environnement, jamais `process.env`.
 *
 * Un refus rend un résultat fermé, sans valeur et sans exception : `egress_refused` (barrière de sortie), `not_admitted`
 * (hors du cas admis de 0138 § 3), `key_invalid` (clé absente ou de forme invalide). L'appelant ne réserve rien, n'appelle
 * rien et écrit `email.transport_refused` avec cette raison (0138 § 4 point 2). La clé n'est jamais gardée ici.
 */

export const RAISONS_REFUS_TRANSPORT = ["egress_refused", "not_admitted", "key_invalid"] as const;
export type RaisonRefusTransport = (typeof RAISONS_REFUS_TRANSPORT)[number];

export type ResultatCleResend =
  | { readonly ok: true; readonly cle: string }
  | { readonly ok: false; readonly code: RaisonRefusTransport };

export function cleResend(env: EnvSortie = process.env, execArgv?: readonly string[]): ResultatCleResend {
  if (!verifierSortie(env, execArgv).ok) return { ok: false, code: "egress_refused" };
  if (!resendAdmis(env)) return { ok: false, code: "not_admitted" };
  const cle = env.RESEND_API_KEY;
  if (typeof cle !== "string" || !cleResendBienFormee(cle)) return { ok: false, code: "key_invalid" };
  return { ok: true, cle };
}
