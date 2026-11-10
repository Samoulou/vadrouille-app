import "server-only";

/**
 * Crochet d'accès réel de `api` (décision 0141 § 6.2 point 1 ; barrière B9-TL-8, `evaluerBarriere`, option
 * `cookieValide`) : **fermé** dans M1f, il rend toujours `false`, donc la barrière de `api` reste `simulee` (ou
 * `production`) et aucun appel Google n'est possible sur `api`.
 *
 * **Propriétaire : M1h** (Tech Lead et Sécurité, T-859-1) : seule une PR de M1h, ou une décision qui la remplace, peut
 * changer son corps ; l'écran 1 étant anonyme, le corps devra porter un vrai contrôle d'accès à la préversion. Appelé par
 * `src/server/composition/villes-api.ts` seul (`tests/unit/confinement/depot.test.ts`), jamais par la page de l'écran 1.
 */
export async function accesReelApi(): Promise<boolean> {
  return false;
}
