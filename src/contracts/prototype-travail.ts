/**
 * Table de travail et registre d'une exécution `p0Run` (décision 0046, D15 et D24, S1, S4 ; décision 0009 point 3 et
 * 0011 § 3 : l'état sérialisé du workflow ne porte que l'identifiant d'exécution, chaque étape relit ici ce dont elle a
 * besoin). Contrat implémenté par le seul module `src/adapters/prototype-travail.ts`, importé par
 * `src/workflows/p0-run.ts` seulement ; ni réexporté par `src/contracts/index.ts`, ni par `src/adapters/index.ts`.
 *
 * Aucun schéma ici : le contenu d'un candidat est validé par l'étape (`CandidatSchema` de `src/prototype/candidat.ts`,
 * que l'application n'atteint pas, 0048 § 1) ; la base n'en admet que les clés (`CHECK` de la table de travail).
 */

/** Modes d'une exécution écrite en base (`prototype.runs.mode`). */
export const MODES_EXECUTION = ["reel", "essai"] as const;
export type ModeExecution = (typeof MODES_EXECUTION)[number];

/** Exécution en cours, relue par une étape : jamais de donnée Google ni de texte libre. */
export type ExecutionEnCours = {
  readonly mode: ModeExecution;
  /** Nom de fichier de `prototype/briefs/` (`CHECK` de `prototype.runs.brief`). */
  readonly brief: string;
  readonly variante: "A" | "B";
  /** Coût des modèles déjà compté par les étapes précédentes, en micro-USD (arrondi au cent supérieur, D24). */
  readonly coutModelesMicros: number;
  /**
   * Jour de quota de l'exécution (`prototype.runs.quota_day`, posé par la base, S1), `AAAA-MM-JJ` : une seule exécution
   * par jour de quota (index unique), d'où un identifiant de voyage unique (P0r3c-5, étape finale).
   */
  readonly jourQuota: string;
  /**
   * Temps écoulé depuis le début de l'exécution, en millisecondes, mesuré par la base (`now() - started_at`) : borne
   * l'échéance de l'étape sous la durée maximale du mode (P0r3c-5, marge de durée). Lu en mémoire, jamais écrit.
   */
  readonly ecouleMs: number;
};

/** Ligne de la table de travail : clé `c_000`, contenu (clés de `CandidatSchema`), `place_id` éventuel. */
export type LigneCandidat = {
  readonly cle: string;
  readonly candidat: Readonly<Record<string, unknown>>;
  readonly placeId: string | null;
};

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
