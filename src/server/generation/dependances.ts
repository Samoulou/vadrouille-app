import "server-only";

import { composerReelle, composerSimulee, reglesDeGeneration, type FabriqueGeneration } from "@/server/composition/generation";
import { PLAFONDS_USAGE, type PlafondsUsage } from "@/server/config/usage";
import { horlogeSysteme, type Horloge } from "@/server/usage/port";
import type { ReglesUsage } from "@/server/usage/reservation";
import { withSystemOrg } from "@/server/with-system-org";
import type { OrgTransaction } from "@/server/with-org";

import { ArretEtape } from "./codes";
import { evaluerBarriere, type EtatBarriere } from "./barriere";

/**
 * Dépendances des étapes de génération. **Tests seulement** : tout est remplaçable (base, composition, horloge, plafonds,
 * barrière) ; les valeurs par défaut sont celles de la production (contexte système sur `vadrouille_app`, plafonds de la
 * configuration, barrière de B9-TL-8, composition choisie par la barrière). Les workflows n'en passent aucune : elles ne
 * traversent jamais la frontière sérialisée, chaque étape les construit elle-même.
 */

export type TransactionSysteme = <T>(organizationId: string, fn: (tx: OrgTransaction) => Promise<T>) => Promise<T>;

export interface DependancesGeneration {
  readonly transaction?: TransactionSysteme;
  readonly horloge?: Horloge;
  /** Plafonds du forfait ; `PLAFONDS_USAGE` (`null` en production) par défaut. */
  readonly plafonds?: PlafondsUsage | null;
  /** Composition choisie par la barrière ; défaut : `reelle`, `simulee` ou aucune (production). */
  readonly composition?: (etat: EtatBarriere) => FabriqueGeneration;
  readonly barriere?: { readonly env?: Readonly<Record<string, string | undefined>>; readonly branche?: string | null; readonly cookieValide?: () => Promise<boolean> };
}

export type DependancesResolues = {
  readonly transaction: TransactionSysteme;
  readonly horloge: Horloge;
  readonly plafonds: PlafondsUsage | null;
  readonly regles: ReglesUsage | null;
  readonly maintenant: () => number;
  /** Barrière de B9-TL-8, évaluée à l'entrée de l'étape ; la composition qu'elle autorise, ou un arrêt `production_refused`. */
  composer(): Promise<FabriqueGeneration>;
};

export function resoudre(dependances: DependancesGeneration = {}): DependancesResolues {
  const horloge = dependances.horloge ?? horlogeSysteme;
  const plafonds = dependances.plafonds === undefined ? PLAFONDS_USAGE : dependances.plafonds;
  const regles = reglesDeGeneration(horloge, plafonds);
  const composition =
    dependances.composition ??
    ((etat: EtatBarriere): FabriqueGeneration => {
      if (etat === "production") throw new ArretEtape("production_refused");
      return etat === "reelle" ? composerReelle() : composerSimulee();
    });
  return {
    transaction: dependances.transaction ?? withSystemOrg,
    horloge,
    plafonds,
    regles,
    maintenant: () => horloge.maintenant(),
    async composer() {
      const etat = await evaluerBarriere({ ...dependances.barriere, plafondsNonNuls: plafonds !== null });
      if (etat === "production") throw new ArretEtape("production_refused");
      return composition(etat);
    },
  };
}
