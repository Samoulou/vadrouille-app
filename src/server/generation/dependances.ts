import "server-only";

import { composerReelle, composerSimulee, reglesDeGeneration, type FabriqueGeneration, type FabriquePortPositions } from "@/server/composition/generation";
import { ECRITURE_PROGRAMMES_REELS_AUTORISEE, IDEES_PAR_JOUR } from "@/server/config/generation";
import { PLAFONDS_USAGE, PLAFONDS_VARIANTE_SIMULEE, type PlafondsUsage } from "@/server/config/usage";
import { horlogeSysteme, type Horloge } from "@/server/usage/port";
import type { ReglesUsage } from "@/server/usage/reservation";
import { withSystemOrg } from "@/server/with-system-org";
import type { OrgTransaction } from "@/server/with-org";

import { ArretEtape } from "./codes";
import { declarationsDeploiement, ecriturePositionsPermise, evaluerBarriere, plafondsDeGenerationPoses, type EtatBarriere } from "./barriere";

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
  /**
   * Plafonds du forfait, pour les deux variantes (tests). Par défaut : `PLAFONDS_USAGE` (`null` tant que Samuel ne les a pas
   * fixés) pour la barrière et la variante réelle, `PLAFONDS_VARIANTE_SIMULEE` (valeurs de test) pour la variante simulée.
   */
  readonly plafonds?: PlafondsUsage | null;
  /** Composition choisie par la barrière ; défaut : `reelle` (si la réponse de Samuel à la question 9 l'autorise), sinon `simulee`. */
  readonly composition?: (etat: EtatBarriere) => FabriqueGeneration | Promise<FabriqueGeneration>;
  readonly barriere?: { readonly env?: Readonly<Record<string, string | undefined>>; readonly branche?: string | null; readonly cookieValide?: () => Promise<boolean> };
  /** Écriture de programmes réels autorisée (question 9) ; `ECRITURE_PROGRAMMES_REELS_AUTORISEE` (`false`) par défaut. */
  readonly programmesReelsAutorises?: boolean;
  /**
   * Écriture des positions de la version publiée au cache : `true` ou `false` pour la forcer (tests) ; par défaut, la variante
   * réelle seulement, si la configuration l'autorise et si l'interrupteur de suspension n'est pas posé.
   */
  readonly ecriturePositions?: boolean;
  /** Port d'écriture des positions de la composition (tests : double qui compte ses appels). */
  readonly portPositions?: FabriquePortPositions;
  /** Candidats d'idée « Surprends-moi » gardés par jour (tests : 0 donne l'aperçu sans idées) ; `IDEES_PAR_JOUR` par défaut. */
  readonly ideesParJour?: number;
  /**
   * Réserve aussi le forfait de la variante **simulée** dans `usage_ledger` (`true` : bancs de la base, qui éprouvent la
   * séquence de réservation sans appel réel). Par défaut `false` : la variante simulée borne ses doubles par un forfait en
   * mémoire et n'écrit aucune ligne, qui s'ajouterait aux cumuls lus par la variante réelle (décision 0110 § 3). La variante
   * réelle réserve toujours.
   */
  readonly reserverEnSimulee?: boolean;
}

export type DependancesResolues = {
  readonly transaction: TransactionSysteme;
  readonly horloge: Horloge;
  /** Plafonds lus par la barrière et la variante réelle : `PLAFONDS_USAGE` en production (jamais ceux de la variante simulée). */
  readonly plafonds: PlafondsUsage | null;
  /**
   * Règles du forfait de l'étape, selon l'état de la barrière (B9e point 2, B9-PO-10) : `reelle`, celles de `PLAFONDS_USAGE`
   * (aucune tant que Samuel n'a pas fixé les plafonds) ; `simulee`, celles des valeurs de test de la variante simulée ;
   * `production`, aucune.
   */
  reglesPour(etat: EtatBarriere): ReglesUsage | null;
  /** Forfait de la variante simulée réservé dans `usage_ledger` (bancs de la base) ; sinon en mémoire seulement (0110 § 3). */
  readonly reserverEnSimulee: boolean;
  readonly maintenant: () => number;
  /** Barrière de B9-TL-8, évaluée **à l'entrée de chaque étape**, avant tout forfait, toute composition et tout appel. */
  barriere(): Promise<EtatBarriere>;
  /** Composition qu'autorise l'état de la barrière (jamais `production` : l'étape s'est déjà arrêtée sur `production_refused`). */
  composer(etat: EtatBarriere): Promise<FabriqueGeneration>;
  /** Vrai si l'étape `e` écrit les positions de la version publiée au cache avec cette composition. */
  ecriturePositions(fabrique: FabriqueGeneration): boolean;
  readonly portPositions: FabriquePortPositions | undefined;
  readonly ideesParJour: number;
};

export function resoudre(dependances: DependancesGeneration = {}): DependancesResolues {
  const horloge = dependances.horloge ?? horlogeSysteme;
  const plafonds = dependances.plafonds === undefined ? PLAFONDS_USAGE : dependances.plafonds;
  const plafondsSimules = dependances.plafonds === undefined ? PLAFONDS_VARIANTE_SIMULEE : dependances.plafonds;
  const regles = reglesDeGeneration(horloge, plafonds);
  const reglesSimulees = reglesDeGeneration(horloge, plafondsSimules);
  const programmesReels = dependances.programmesReelsAutorises ?? ECRITURE_PROGRAMMES_REELS_AUTORISEE;
  const composition =
    dependances.composition ??
    (async (etat: EtatBarriere): Promise<FabriqueGeneration> => {
      if (etat === "production") throw new ArretEtape("production_refused");
      // La variante réelle écrirait des programmes réels : tant que Samuel n'a pas répondu à la question 9, la composition
      // reste simulée même si la barrière est ouverte (0011 l. 77 ; spécification B9, question 9).
      if (etat === "reelle" && programmesReels) return composerReelle();
      return composerSimulee({ env: declarationsDeploiement(dependances.barriere?.env) });
    });
  return {
    transaction: dependances.transaction ?? withSystemOrg,
    horloge,
    plafonds,
    reglesPour: (etat) => (etat === "reelle" ? regles : etat === "simulee" ? reglesSimulees : null),
    reserverEnSimulee: dependances.reserverEnSimulee === true,
    maintenant: () => horloge.maintenant(),
    barriere: () => evaluerBarriere({ ...dependances.barriere, plafondsNonNuls: plafondsDeGenerationPoses(plafonds) }),
    async composer(etat) {
      if (etat === "production") throw new ArretEtape("production_refused");
      return composition(etat);
    },
    ecriturePositions: (fabrique) => dependances.ecriturePositions ?? (fabrique.variante === "reelle" && ecriturePositionsPermise({ env: dependances.barriere?.env })),
    portPositions: dependances.portPositions,
    ideesParJour: dependances.ideesParJour ?? IDEES_PAR_JOUR,
  };
}
