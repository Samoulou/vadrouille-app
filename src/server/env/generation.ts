import "server-only";

/**
 * Module d'environnement étroit de la génération (`@/server/env/generation` ; décision 0081 B9-TL-8, B9c). Lecture
 * paresseuse, à l'appel et jamais à l'import ; l'environnement est un paramètre (par défaut `process.env`) que les tests
 * injectent. Importable depuis la barrière des appels réels (`src/server/generation/barriere.ts`) et `src/server/env/`
 * seulement (lint `ligne/server-env-imports`). Ne lit **aucune clé** ni aucun secret : seules les quatre déclarations de la
 * barrière, rendues telles quelles (jamais journalisées) :
 * - `VADROUILLE_ENV` et `VERCEL_ENV` : déploiement déclaré (la barrière retient la plus restrictive) ;
 * - `VERCEL_GIT_COMMIT_REF` : branche du déploiement (identifiant public posé par Vercel) ;
 * - `GENERATION_APPELS_REELS` : drapeau d'activation côté serveur, comparaison exacte à `1` par la barrière.
 */

type Env = Readonly<Record<string, string | undefined>>;

export type EnvGeneration = Readonly<{
  VADROUILLE_ENV: string | undefined;
  VERCEL_ENV: string | undefined;
  VERCEL_GIT_COMMIT_REF: string | undefined;
  GENERATION_APPELS_REELS: string | undefined;
}>;

export function lireEnvGeneration(env: Env = process.env): EnvGeneration {
  return {
    VADROUILLE_ENV: env.VADROUILLE_ENV,
    VERCEL_ENV: env.VERCEL_ENV,
    VERCEL_GIT_COMMIT_REF: env.VERCEL_GIT_COMMIT_REF,
    GENERATION_APPELS_REELS: env.GENERATION_APPELS_REELS,
  };
}
