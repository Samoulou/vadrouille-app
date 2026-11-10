import "server-only";

import { createDatabase } from "../../../db/index.ts";
import { PreventeProvenanceSchema, type PreventeProvenance } from "@/contracts/prevente-mesure";

/**
 * Compteur de visites de la page de prévente sur Postgres (spécification `specs/C2-prevente-mesure.md`, § 2.2 points 5
 * et 6, § 4 et § 6.2 ; tâche C2b, ticket 1130 ; migration `0029_prevente_mesure`, décision 0172 § 1).
 *
 * - **Une seule requête, texte constant** : `SELECT public.prevente_compter_visite($1)`. Le rôle `vadrouille_app` n'a
 *   aucun droit sur la table des visites : la fonction `SECURITY DEFINER` écrit seule, sur le jour UTC posé par la base
 *   (critère A14). Ce module ne nomme aucune table et ne lit rien.
 * - **Ce qui part vers la base** : la provenance, une valeur de la liste fermée de `src/contracts/prevente-mesure.ts`
 *   (jamais `interne`), revalidée ici. Ni adresse IP, ni agent utilisateur, ni adresse de page, ni heure.
 * - **Disponible** (`disponible`, forme à confirmer par le Tech Lead, T4) : le pool gardé de `db/connection.ts` a pu
 *   être créé, c'est-à-dire que la garde de production (décision 0034) laisse passer et que la variable de connexion
 *   de `vadrouille_app` est posée. **Créer le pool n'ouvre aucune connexion** (`pg` connecte à la première requête) et
 *   n'écrit aucun journal ; aucune variable n'est lue ici (seul `db/connection.ts` les lit). Indisponible : la création
 *   est retentée à l'appel suivant, sans coût (une comparaison et une lecture de variable).
 * - **Pool propre** (modèle de `src/server/villes/compteurs.ts`) : 2 connexions, attente et requête bornées à 2 s. Une
 *   base trop lente ne retient donc rien au-delà ; la visite est perdue (C2-PO-6).
 * - **Branchement** : `visitesPrevente()` est branché au démarrage sur `src/adapters/prevente-mesure-instance.ts` par
 *   `src/instrumentation.ts` (`@/adapters` n'atteint pas `db/` statiquement).
 * - **Erreurs** : `compter` lève. L'appelant (`src/adapters/prevente-mesure.ts`) les avale et n'en journalise que le
 *   nom ; le message et le détail d'une erreur de la fonction d'écriture ne sont jamais journalisés (0172 § 6).
 */

/** Pool minimal (`pg.Pool`), injectable par les tests. */
export type PoolVisitesPrevente = { query(text: string, values?: unknown[]): Promise<unknown> };

export type VisitesPrevente = {
  /** Vrai si une écriture peut être tentée ; n'ouvre aucune connexion. */
  readonly disponible: () => boolean;
  /** + 1 pour le jour UTC de la base et la provenance ; lève en cas d'échec ou d'indisponibilité. */
  readonly compter: (src: PreventeProvenance) => Promise<void>;
};

export type VisitesPreventeOptions = {
  /** Tests seulement : fabrique du pool (sinon le pool propre de `vadrouille_app`) ; elle lève si la garde refuse. */
  readonly creerPool?: () => PoolVisitesPrevente;
};

/** Seule requête du compteur : la fonction d'écriture, jamais la table. */
export const REQUETE_COMPTER_VISITE = "SELECT public.prevente_compter_visite($1::text)";

const POOL_VISITES = { max: 2, connectionTimeoutMillis: 2_000, query_timeout: 2_000 } as const;

/** Indisponibilité : ne porte aucune valeur. */
export class CompteurPreventeIndisponibleError extends Error {
  override name = "CompteurPreventeIndisponibleError";

  constructor() {
    super("Compteur de visites de la prévente indisponible.");
  }
}

const poolParDefaut = (): PoolVisitesPrevente => createDatabase("vadrouille_app", undefined, POOL_VISITES).$client;

export function creerVisitesPrevente(options: VisitesPreventeOptions = {}): VisitesPrevente {
  const creerPool = options.creerPool ?? poolParDefaut;
  let pool: PoolVisitesPrevente | undefined;

  /** Pool créé au premier besoin et gardé ; `null` tant que la garde de connexion refuse (aucune connexion ouverte). */
  function poolOuNul(): PoolVisitesPrevente | null {
    if (pool !== undefined) return pool;
    try {
      pool = creerPool();
      return pool;
    } catch {
      return null;
    }
  }

  return Object.freeze({
    disponible: () => poolOuNul() !== null,
    async compter(src: PreventeProvenance): Promise<void> {
      const provenance = PreventeProvenanceSchema.parse(src);
      const actif = poolOuNul();
      if (actif === null) throw new CompteurPreventeIndisponibleError();
      await actif.query(REQUETE_COMPTER_VISITE, [provenance]);
    },
  });
}

let parDefaut: VisitesPrevente | undefined;

/** Compteur du serveur (pool propre de `vadrouille_app`, créé au premier appel). */
export function visitesPrevente(): VisitesPrevente {
  return (parDefaut ??= creerVisitesPrevente());
}
