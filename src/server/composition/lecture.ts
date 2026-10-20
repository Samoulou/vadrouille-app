import "server-only";

import type { SourceRelectures } from "@/domain/relectures";
import { creerClientsGoogle } from "@/server/composition/clients-google";
import type { PlafondsUsage } from "@/server/config/usage";
import { ecriturePositionsSuspendue, sourceReelleChoisie } from "@/server/env/relectures";
import { reglesDeLecture } from "@/server/relecture/regles";
import { creerSourceRelectures, type DependancesSource } from "@/server/relecture/source";
import { horlogeSysteme, type Horloge } from "@/server/usage/port";
import { executeurSql, withOrg } from "@/server/with-org";

/**
 * Composition de la lecture des voyages (B8b ; décision 0100 § 5, Q430) : câble la source réelle de relectures
 * (`src/server/relecture/source.ts`) à la fabrique commune des clients Google (`clients-google.ts`), au forfait de
 * relecture (`PLAFONDS_USAGE` et la table de prix), à `withOrg` et à l'interrupteur des écritures de positions. **Câble
 * seulement** : aucune logique de lecture, aucune lecture de clé ici (chaque client la lit à sa construction, après la barrière de sortie).
 *
 * - **Seconde composition** après celle de la génération (`generation.ts`, B9c, future) : un chemin vers `src/grounding`
 *   n'est admis que par la fabrique commune, importée par ce module (règle `ligne/relecture-imports`, test du graphe).
 *   Importé par `src/adapters/index.ts` (branchement de `getTripAdapter("api")`, B6b ou B8b selon l'ordre de fusion,
 *   0100 § 5.4) et les tests seulement.
 * - **Sélection** (0100 § 5.3) : la source réelle n'est choisie que si l'environnement résolu est `local` et que
 *   `RELECTURES_SOURCE` vaut `google` ; sinon l'appelant garde le double de `src/mocks/relectures-voyages.ts` (`ci`).
 *   Tout autre environnement lève dans la garde de `getTripAdapter("api")`, inchangée (0086 § 2.1).
 * - **Plafonds** : `PLAFONDS_USAGE` vaut `null` (question 8.1 de 0100, argent : Samuel), donc la source réelle rend
 *   `unavailable` (échec fermé) tant que des plafonds n'y sont pas posés : aucune lecture réelle sans eux.
 */

export type OptionsLecture = {
  /** Plafonds du forfait (défaut : `PLAFONDS_USAGE`, `null` en production). */
  readonly plafonds?: PlafondsUsage | null;
  readonly horloge?: Horloge;
  /** Remplacements de test : transaction, clients, interrupteur des positions. */
  readonly transaction?: DependancesSource["transaction"];
  readonly clients?: DependancesSource["clients"];
  readonly positionsSuspendues?: DependancesSource["positionsSuspendues"];
  /** Environnement lu par la sélection (défaut : `process.env`) ; les tests l'injectent. */
  readonly env?: Readonly<Record<string, string | undefined>>;
};

/**
 * Source réelle de relectures, câblée sur `withOrg` et la fabrique des clients Google. **Refuse hors `local` avec
 * `RELECTURES_SOURCE=google`** (0100 § 5.3) : la règle ne dépend pas du seul appelant `choisirSourceRelectures` ; elle
 * lève sans message ni valeur, avant toute construction.
 */
export function creerSourceLecture(options: OptionsLecture = {}): SourceRelectures {
  if (!sourceReelleChoisie(options.env)) throw new Error("lecture: source réelle non choisie");
  const horloge = options.horloge ?? horlogeSysteme;
  return creerSourceRelectures({
    regles: reglesDeLecture(horloge, options.plafonds),
    transaction: options.transaction ?? ((contexte) => (fn) => withOrg(contexte, (tx) => fn(executeurSql(tx)))),
    clients: options.clients ?? creerClientsGoogle,
    positionsSuspendues: options.positionsSuspendues ?? (() => ecriturePositionsSuspendue()),
    horloge,
  });
}

/**
 * Source de relectures de l'adaptateur `api` : la source réelle si `sourceReelleChoisie(env)` (environnement `local` et
 * `RELECTURES_SOURCE=google`, 0100 § 5.3), sinon `repli` (le double). La source réelle n'est construite que dans le
 * premier cas.
 */
export function choisirSourceRelectures(repli: SourceRelectures, env?: Readonly<Record<string, string | undefined>>): SourceRelectures {
  return sourceReelleChoisie(env) ? creerSourceLecture({ env }) : repli;
}
