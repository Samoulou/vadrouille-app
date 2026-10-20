import "server-only";

import { resolveServerEnvironment, type ServerEnvironment } from "@/server/env/resolve";

/**
 * Module d'environnement étroit de la lecture des voyages (`@/server/env/relectures` ; décision 0100 § 3.2 point 4 et
 * § 5.3, B8b). Lecture paresseuse, à l'appel et jamais à l'import ; l'environnement est un paramètre (par défaut
 * `process.env`) que les tests injectent. Importable depuis `src/server/composition/lecture.ts` et `src/server/env/`
 * seulement (lint `ligne/server-env-imports`). Ne lit **aucune clé** : la clé Google est lue par `lireCleGoogle`
 * (`@/server/env/grounding`), après la barrière de sortie, à la construction des clients.
 *
 * - `RELECTURES_SOURCE` (nom libre, serveur seulement) : `google` choisit la source réelle de relectures ; toute autre
 *   valeur ou son absence : le double.
 * - `POSITIONS_ECRITURE_SUSPENDUE` (nom fixé par 0060 § 1.3) : `1` suspend l'écriture des positions au cache
 *   `place_coordinates` ; les positions restent servies par la fiche. Comparaison exacte à `1`.
 */

type Env = Readonly<Record<string, string | undefined>>;

/** Vrai quand les écritures de positions au cache sont suspendues (0060 § 1.3, « Interrupteur d'écriture »). */
export function ecriturePositionsSuspendue(env: Env = process.env): boolean {
  return env.POSITIONS_ECRITURE_SUSPENDUE === "1";
}

/**
 * Vrai seulement si l'environnement résolu est `local` (`resolveServerEnvironment`, la valeur la plus restrictive de
 * `VADROUILLE_ENV` et `VERCEL_ENV`, `production` pour toute valeur inconnue) **et** que `RELECTURES_SOURCE` vaut
 * exactement `google` (0100 § 5.3). Une déclaration absente ou illisible de l'environnement : faux, jamais une levée.
 */
export function sourceReelleChoisie(env: Env = process.env): boolean {
  if (env.RELECTURES_SOURCE !== "google") return false;
  let environnement: ServerEnvironment;
  try {
    environnement = resolveServerEnvironment(env);
  } catch {
    return false;
  }
  return environnement === "local";
}

/**
 * Déclarations de déploiement (`VADROUILLE_ENV`, `VERCEL_ENV`) de la source simulée des voyages générés (spécification B9,
 * B9e point 3), rendues seulement si l'environnement résolu est `local` ou `ci` ; `null` partout ailleurs (préversion,
 * production, valeur absente ou illisible), jamais une levée. Le chargeur de fixtures les relit (0105 § 2 point 2).
 */
export function declarationsLectureSimulee(env: Env = process.env): Readonly<Record<string, string | undefined>> | null {
  let environnement: ServerEnvironment;
  try {
    environnement = resolveServerEnvironment(env);
  } catch {
    return null;
  }
  return environnement === "local" || environnement === "ci" ? { VADROUILLE_ENV: env.VADROUILLE_ENV, VERCEL_ENV: env.VERCEL_ENV } : null;
}
