/**
 * Table de travail et registre d'une exécution `p0Run` (décision 0046, D15 et D24, S1, S4 ; décision 0009 point 3 et
 * 0011 § 3 : l'état sérialisé du workflow ne porte que l'identifiant d'exécution, chaque étape relit ici ce dont elle a
 * besoin). Contrat implémenté par le seul module `src/adapters/prototype-travail.ts`, importé hors tests par
 * `src/workflows/p0-run.ts` et `src/adapters/prototype-ecriture.ts` seulement (décision 0107) ; ni réexporté par `src/contracts/index.ts`, ni par `src/adapters/index.ts`.
 *
 * Aucun schéma ici : le contenu d'un candidat (ou du plan de secteurs) est validé par l'étape (`CandidatSchema` de `src/prototype/candidat.ts`,
 * que l'application n'atteint pas, 0048 § 1) ; la base n'en admet que les clés (`CHECK` de la table de travail).
 */

/** Modes d'une exécution écrite en base (`prototype.runs.mode`). */
export const MODES_EXECUTION = ["reel", "essai"] as const;
export type ModeExecution = (typeof MODES_EXECUTION)[number];

/**
 * Marqueur d'une exécution lancée depuis l'app sur un brief saisi (spécification E2E-essai, lot 3 ; décision 0125 § 1) :
 * valeur de `prototype.runs.brief` à la place d'un nom de fichier (`runs_brief_check`) ; le brief lui-même est dans
 * `prototype.run_briefs`, relu par l'étape (`lireBriefSaisi`).
 */
export const BRIEF_SAISI = "saisi";

/** Exécution en cours, relue par une étape : jamais de donnée Google ni de texte libre. */
export type ExecutionEnCours = {
  readonly mode: ModeExecution;
  /** Nom de fichier de `prototype/briefs/`, ou `BRIEF_SAISI` (`CHECK` de `prototype.runs.brief`, décision 0125 § 1). */
  readonly brief: string;
  readonly variante: "A" | "B";
  /** Coût des modèles déjà compté par les étapes précédentes, en micro-USD (arrondi au cent supérieur, D24). */
  readonly coutModelesMicros: number;
  /**
   * Forfait de coût des modèles réservé au lancement (`prototype.forfaits.models_cost_micros`, micro-USD), relu en base :
   * plafond de l'étape sous le fusible du mode (décision 0126 § 2). Absent si la ligne n'en porte pas.
   */
  readonly forfaitModelesMicros?: number;
  /**
   * Plafonds Google réservés au lancement (`prototype.forfaits`, requêtes et éléments Routes), relus en base : l'étape ne
   * les dépasse jamais (décision 0126 § 2, plafonds d'une révision). Absent si la ligne n'en porte pas.
   */
  readonly forfaitGoogle?: { readonly textSearch: number; readonly details: number; readonly routesRequetes: number; readonly routesElements: number };
  /** Jour de quota de l'exécution (`prototype.runs.quota_day`, posé par la base, S1), `AAAA-MM-JJ`. */
  readonly jourQuota: string;
  /**
   * Rang de l'exécution dans son jour de quota, à partir de 1 (exécutions `reel` et `essai` du même jour, ordonnées par
   * début puis identifiant ; lu en base). Plusieurs exécutions par jour depuis la décision 0071 : le couple (jour, rang)
   * rend l'identifiant de voyage unique (P0r3c-5, étape finale).
   */
  readonly numeroDuJour: number;
};

/** Ligne de la table de travail : clé `c_000`, contenu (clés de `CandidatSchema`), `place_id` éventuel. */
export type LigneCandidat = {
  readonly cle: string;
  readonly candidat: Readonly<Record<string, unknown>>;
  readonly placeId: string | null;
};

/**
 * Plan de secteurs d'une exécution (table du plan de secteurs du schéma `prototype`, décision 0094 § 2 point 1 ; verdict de la Sécurité 0103,
 * question 1) : `{ secteurs: [{ nom, voisins, incontournables }] }`, 9 secteurs au plus, noms maison du plan seulement ;
 * ni raison, ni requête, ni jour, rang, ordre, position ou compteur. Contenu validé par l'étape
 * (`PlanSecteursStockeSchema` de `src/ai/sorties.ts`) ; la base en ferme les clés à chaque niveau (`CHECK`).
 */
export type ContenuSecteurs = Readonly<Record<string, unknown>>;

/** Phases écrites dans `prototype.runs.phase` par les étapes livrées (égales à `PHASES` de `src/prototype/arret.ts`). */
export type PhaseTravail = "recherche" | "ancrage" | "notation" | "planification" | "raisons" | "validation" | "ecriture";

/**
 * Codes d'échec, liste fermée, sans valeur : `execution_absente` (aucune exécution `en_cours` de cet identifiant) ;
 * `entree_refusee` (contrôle du module, aucune requête envoyée) ; `base` (erreur de la base, transaction annulée) ;
 * `phase_deja_passee` (la phase précédente en base n'est pas celle qu'attend la phase écrite : étape rejouée ou hors
 * d'ordre, garde d'idempotence de P0r3c-5, mineur 6 de la revue du head `608ee99`, PR 348).
 */
export const CODES_ECHEC_TRAVAIL = ["execution_absente", "entree_refusee", "base", "phase_deja_passee"] as const;
export type CodeEchecTravail = (typeof CODES_ECHEC_TRAVAIL)[number];
