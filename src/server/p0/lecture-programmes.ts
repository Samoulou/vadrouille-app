import "server-only";

import { cookies } from "next/headers";

import { cookieAccesValide, NOM_COOKIE_ACCES, ouvertureP0, type DependancesAcces } from "@/server/p0/acces";
import { poolPrototype } from "@/server/p0/base";
import type { PoolSql } from "@/server/usage/neon";

/**
 * Barrière de la lecture des programmes réels par « Mes voyages » et les pages du voyage (décision 0074 ; exigence 4 de
 * `specs/P0-suite-executions-reelles.md`, « même barrière que le lancement ») : le pool `vadrouille_prototype` si la
 * garde du mode réel est ouverte (conditions (1) à (7) de `lireEnvP0`, déploiement autre que la production) **et** si la
 * requête porte un cookie d'accès valide (`__Host-p0_acces`, posé par la saisie du code sur `/prototype/executions`) ;
 * sinon `null`, sans connexion à la base.
 *
 * Branchée au démarrage du serveur par `src/instrumentation.ts` sur la source des programmes réels de l'adaptateur
 * `prototype` (`brancherLectureProgrammesReels`), puis appelée à **chaque** lecture : jamais d'état gardé entre deux
 * requêtes. Garde fermée : rien n'est journalisé (`p0.guard_closed` reste le relevé de la page des exécutions).
 */
export async function poolLectureProgrammes(dependances: DependancesAcces & { readonly cookie?: () => Promise<string | undefined> } = {}): Promise<PoolSql | null> {
  const ouverture = ouvertureP0(dependances, false);
  if (!ouverture.ok) return null;
  const cookie = await (dependances.cookie ?? (async () => (await cookies()).get(NOM_COOKIE_ACCES)?.value))();
  if (!cookieAccesValide(cookie, ouverture.attendu, (dependances.maintenant ?? Date.now)())) return null;
  return poolPrototype();
}
