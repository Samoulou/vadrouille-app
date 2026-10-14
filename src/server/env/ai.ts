import "server-only";

import { CODE_CLE_ABSENTE, verifierSortie, type CodeCleAbsente, type CodeRefusSortie, type EnvSortie } from "@/server/env/egress";

/**
 * Module d'environnement étroit du client de modèles (`@/server/env/ai`, spécification
 * `specs/P0-suite-executions-reelles.md`, « Modules d'environnement étroits » ; décision 0031 § 2 et § 6). Lit et
 * valide **seulement** la clé OpenRouter, **après** la barrière de sortie (`@/server/env/egress`), à l'appel et jamais
 * à l'import. Importable depuis `src/ai` seulement (lint `ligne/server-env-imports`). Autonome : ne dépend pas de
 * `src/server/env.ts` (B3), qui le reprendra sans le changer.
 */

export type ResultatCle =
  | { readonly ok: true; readonly cle: string }
  | { readonly ok: false; readonly code: CodeRefusSortie | CodeCleAbsente };

export function lireCleOpenRouter(env: EnvSortie = process.env, execArgv?: readonly string[]): ResultatCle {
  const sortie = verifierSortie(env, execArgv);
  if (!sortie.ok) return sortie;
  const cle = env.OPENROUTER_API_KEY;
  if (cle === undefined || cle === "") return { ok: false, code: CODE_CLE_ABSENTE };
  return { ok: true, cle };
}
