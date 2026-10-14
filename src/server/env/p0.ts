import "server-only";

import { CODES_REFUS_SORTIE, verifierSortie, type EnvSortie } from "@/server/env/egress";
import { decodeSecret } from "@/server/env/index";
import { resolveServerEnvironment } from "@/server/env/resolve";

/**
 * Module d'environnement étroit du mode réel du prototype (`@/server/env/p0` ; décision 0055, section 1 point 2,
 * D19 ; avis de la Sécurité S-1). Lecture paresseuse, à l'appel et jamais à l'import, sur le modèle de `ai.ts` et
 * `grounding.ts`. Importable seulement depuis `src/server/p0/garde.ts`, `src/server/p0/acces.ts` et les modules de
 * `src/server/env/` (lint `ligne/server-env-imports`).
 *
 * `lireEnvP0` contrôle, dans cet ordre (le premier refus l'emporte, et rien n'est lu au-delà) :
 * 1. la barrière de sortie de P0r1 (`verifierSortie`, avec D21 : l'environnement injecté ne peut que resserrer) ;
 * 2. l'environnement du serveur, par le **seul calcul** de B3a (`resolveServerEnvironment`) : `staging` seulement ;
 * 3. `CI` absente ou vide (Vercel la pose au build, jamais à l'exécution d'une fonction) ;
 * 4. `VERCEL_GIT_COMMIT_REF` égale à `p0-reel` (comparaison exacte) ;
 * 5. `P0_REAL_RUNS` égale à `enabled` (comparaison exacte) ;
 * 6. la variable de connexion de `vadrouille_prototype` posée (présence seulement : sa valeur n'est lue que par
 *    `db/connection.ts`) ;
 * 7. le code d'accès, décodé par `decodeSecret` (B3a) : seul endroit où sa chaîne est lue, et seulement pour être
 *    décodée.
 * Rend les **octets** du code d'accès (jamais la chaîne) ou un code fermé, jamais une valeur. Aucune clé de service
 * n'est lue ici (ni `lireCleOpenRouter`, ni `lireCleGoogle`).
 */

/** Codes de refus de `lireEnvP0` (union fermée ; noms : P0r3b). Internes : tests et journal seulement. */
export const CODES_ENV_P0 = [
  ...CODES_REFUS_SORTIE,
  "environment_refused",
  "ci_refused",
  "branch_refused",
  "real_runs_disabled",
  "database_missing",
  "access_code_missing",
  "access_code_invalid",
] as const;
export type CodeEnvP0 = (typeof CODES_ENV_P0)[number];

export type ResultatEnvP0 = { readonly ok: true; readonly jeton: Buffer } | { readonly ok: false; readonly code: CodeEnvP0 };

/** Branche d'essais du mode réel (décision 0055, section 5 ; Q268). */
export const BRANCHE_P0_REEL = "p0-reel";

/**
 * Nom de la variable du code d'accès, écrit en clé d'objet (régime de confinement P0c, section 5, « Noms secrets ») :
 * libellé de `decodeSecret`, jamais un texte.
 */
const [NOM_CODE_ACCES] = Object.keys({ P0_RUN_TOKEN: 0 }) as ["P0_RUN_TOKEN"];

const posee = (valeur: string | undefined): valeur is string => valeur !== undefined && valeur !== "";

/** Conditions (1) à (7) de la décision 0055, section 1 point 2. */
export function lireEnvP0(env: EnvSortie = process.env, execArgv?: readonly string[]): ResultatEnvP0 {
  const sortie = verifierSortie(env, execArgv);
  if (!sortie.ok) return sortie;
  let environnement: string;
  try {
    environnement = resolveServerEnvironment(env);
  } catch {
    return { ok: false, code: "environment_refused" };
  }
  if (environnement !== "staging") return { ok: false, code: "environment_refused" };
  if (posee(env.CI)) return { ok: false, code: "ci_refused" };
  if (env.VERCEL_GIT_COMMIT_REF !== BRANCHE_P0_REEL) return { ok: false, code: "branch_refused" };
  if (env.P0_REAL_RUNS !== "enabled") return { ok: false, code: "real_runs_disabled" };
  if (!posee(env.P0_DATABASE_URL)) return { ok: false, code: "database_missing" };
  const code = env.P0_RUN_TOKEN;
  if (!posee(code)) return { ok: false, code: "access_code_missing" };
  try {
    return { ok: true, jeton: decodeSecret(NOM_CODE_ACCES, code) };
  } catch {
    return { ok: false, code: "access_code_invalid" };
  }
}

/**
 * Décode une saisie du code d'accès par **la même fonction** `decodeSecret` que la variable (mêmes formes admises,
 * mêmes règles, aucune normalisation ni `trim()`) : octets, ou `null` sur tout refus, sans valeur ni motif.
 */
export function decoderJetonSaisi(saisie: string): Buffer | null {
  try {
    return decodeSecret(NOM_CODE_ACCES, saisie);
  } catch {
    return null;
  }
}
