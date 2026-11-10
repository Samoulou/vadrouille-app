import "server-only";

import { assertApiAdapter } from "@/adapters/api-guard";

/**
 * Crochet d'accès réel de `api` (décision 0141 § 6.2 point 1 ; barrière B9-TL-8, `evaluerBarriere`, option
 * `cookieValide`) : **fermé** dans M1f, il rend toujours `false`, donc la barrière de `api` reste `simulee` (ou
 * `production`) et aucun appel Google n'est possible sur les recherches de `api`. **Laissé fermé par M1h** (décision 0169
 * § 5) : les seuils de ses deux terminaux ne sont pas validés (Q669, Q682), et l'écran 1 est anonyme.
 *
 * **Propriétaire : M1h** (Tech Lead et Sécurité, T-859-1) : seule une PR de M1h, ou une décision qui la remplace, peut
 * changer son corps ; l'écran 1 étant anonyme, le corps devra porter un vrai contrôle d'accès à la préversion. Appelé par
 * `src/server/composition/villes-api.ts` seul (`tests/unit/confinement/depot.test.ts`), jamais par la page de l'écran 1.
 */
export async function accesReelApi(): Promise<boolean> {
  return false;
}

/**
 * Crochet d'accès de la **génération** de `api` (décision 0169 § 5 ; 0141 § 6.2 point 1 : « elle y branchera aussi la
 * génération »). Une étape de workflow n'a ni requête ni cookie : l'accès a été contrôlé **avant** elle, par la session
 * `better-auth` qui a créé le voyage (`createTrip` sous `withOrg`, organisation de la session, RLS). Le crochet vérifie donc
 * que le processus sert bien la vraie app sous ses gardes : `assertApiAdapter()` (connexion `better-auth` admise, donc
 * `local`, `ci` ou la préversion `mvp-essai`, et `AUTH_ADAPTER=better-auth`). Toute levée ferme. La barrière garde ses
 * autres conditions (préversion, branche, drapeau, plafonds) : en `local` et en `ci`, elle reste simulée quel que soit ce
 * crochet. Lu par `src/server/generation/dependances.ts` seul.
 */
export async function accesGenerationReelle(): Promise<boolean> {
  try {
    assertApiAdapter();
    return true;
  } catch {
    return false;
  }
}
