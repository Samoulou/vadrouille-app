/**
 * Suivi des exécutions du prototype pour la page de lancement (décision 0055, section 8, ligne P0r3d ; décision 0046,
 * D24 et S4 ; spécification `specs/P0-suite-2.md`, « Page de lancement ») : contrat implémenté par le seul module
 * `src/adapters/prototype-suivi.ts` ; ni réexporté par `src/contracts/index.ts`, ni par `src/adapters/index.ts`.
 *
 * Champs de `prototype.runs` admis par D24, rien d'autre : aucune donnée Google, aucun compteur, aucun texte libre. Le
 * coût des modèles et le temps écoulé n'existent que **pendant** l'exécution (S4 : la base remet le coût à nul à la fin,
 * et aucune heure de fin n'est conservée).
 */

import type { ModeExecution, PhaseTravail } from "@/contracts/prototype-travail";

/** Statuts d'une exécution (`prototype.runs.status`). */
export const STATUTS_EXECUTION = ["en_cours", "programme_ecrit", "arretee"] as const;
export type StatutExecution = (typeof STATUTS_EXECUTION)[number];

/** Une exécution, telle que la page la suit et la décompte. */
export type ExecutionSuivie = {
  /** Identifiant d'exécution (uuid posé par la base). */
  readonly id: string;
  readonly mode: ModeExecution;
  /** Nom de fichier de `prototype/briefs/`. */
  readonly brief: string;
  readonly variante: "A" | "B";
  readonly statut: StatutExecution;
  /** Phase en cours ; nulle dès que l'exécution est finie (S4). */
  readonly phase: PhaseTravail | null;
  /** Code d'arrêt de S4 ; présent si et seulement si l'exécution est arrêtée. */
  readonly codeArret: string | null;
  /** Coût des modèles déjà compté, en micro-USD ; pendant l'exécution seulement (S4). */
  readonly coutModelesMicros: number | null;
  /** Temps écoulé depuis le début, mesuré par la base ; pendant l'exécution seulement (S4). */
  readonly ecouleMs: number | null;
  /** Jour de quota Google (`AAAA-MM-JJ`, posé par la base, S1). */
  readonly jourQuota: string;
  /** A9, test canari (`prototype.runs.canary_ok`) ; nul s'il n'est pas relevé. */
  readonly canaryOk: boolean | null;
  /** Commit du déploiement qui a lancé l'exécution (40 caractères hexadécimaux). */
  readonly commitSha: string;
};

/** Suivi complet : exécutions, de la plus récente à la plus ancienne, et date de la dernière purge réussie. */
export type SuiviPrototype = {
  readonly executions: readonly ExecutionSuivie[];
  /** Instant ISO 8601 (UTC) de la dernière purge réussie (`prototype.purges`, D16 point 6), ou nul. */
  readonly dernierePurge: string | null;
};

/**
 * Codes d'échec, liste fermée, sans valeur : `entree_refusee` (contrôle du module, aucune requête envoyée) ; `base`
 * (erreur de la base ou ligne illisible).
 */
export const CODES_ECHEC_SUIVI = ["entree_refusee", "base"] as const;
export type CodeEchecSuivi = (typeof CODES_ECHEC_SUIVI)[number];

/** Critères de la grille G0 rapportés en oui ou non (spécification P0-suite-2, « Rapport sans donnée Google »). */
export const CRITERES = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9"] as const;
export type Critere = (typeof CRITERES)[number];
/**
 * `non_releve` : A9 sans canari écrit ; A1, A2 et A6 d'un programme écrit qui n'est plus lisible ; A7 et A8 d'une
 * exécution arrêtée sans code de plafond.
 */
export type ValeurCritere = "oui" | "non" | "non_releve";
export type CriteresRapport = { readonly [C in Critere]: ValeurCritere };

/** Ligne du décompte : exécutions comptées et relances d'un brief et d'une variante (P0S2-PO-13). */
export type LigneDecompte = {
  readonly brief: string;
  readonly variante: "A" | "B";
  readonly comptees: number;
  readonly compteesMax: number;
  readonly relances: number;
  readonly relancesMax: number;
};

/**
 * Étapes du programme stocké avec et sans `placeId` (décision 0116 § 4.4 ; 0117 § 4 point 2 ; spécification
 * P0-programme-par-ia § 6, A12) : deux nombres entiers positifs ou nuls, calculés à chaque affichage depuis le
 * programme stocké, jamais écrits ni journalisés. Ni nom, ni `placeId`, ni motif.
 */
export type EtapesRapport = { readonly avecPlaceId: number; readonly sansPlaceId: number };

/**
 * Rapport de la dernière exécution finie (D24, S4) : critères et texte à copier, sans donnée Google.
 * `etapes` : affiché sur la page seulement, **jamais** dans `texte` (« Copier le rapport », 0117 § 4) ; `null` : non
 * relevé (exécution sans programme écrit, ou programme absent ou illisible).
 */
export type RapportPage = {
  readonly execution: ExecutionSuivie;
  readonly criteres: CriteresRapport;
  readonly texte: string;
  readonly etapes: EtapesRapport | null;
};

/** Modèle de la page de lancement, lu par le serveur page ouverte seulement. */
export type ModeleLancementP0 = {
  /** Briefs admis par le pont `p0Run` (fichiers de `prototype/briefs/`). */
  readonly briefs: readonly string[];
  /** Suivi ; `null` si la base ne répond pas (seul le formulaire reste affiché). */
  readonly suivi: SuiviPrototype | null;
  readonly decompte: readonly LigneDecompte[];
  readonly rapport: RapportPage | null;
};
