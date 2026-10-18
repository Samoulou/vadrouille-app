import type { ProgrammeReduit } from "@/prototype/programme-reduit";

import type { Segment } from "./trip";

/**
 * Écriture d'un programme du prototype (décision 0052 § 1.10 ; 0055, section 8, ligne P0r3c) : contrat de l'étape
 * finale de `p0Run`, implémenté par le seul module `src/adapters/prototype-ecriture.ts` (aucune autre implémentation,
 * aucune injection). Ce fichier n'est pas réexporté par `src/contracts/index.ts` (l'interface ne l'importe jamais)
 * et ne déclare aucun schéma Zod.
 *
 * - `programme` : contenu **sans** `positions` (Q324, option a ; clés de `CLES_CONTENU`) ;
 * - `positions` : pour **chaque** `placeId` de `placeIdsDuProgramme(programme)`, et aucun autre (0052 § 1.2), le
 *   champ `position` de la fiche Place Details obtenue **dans l'étape finale de cette exécution**, celle sur laquelle le
 *   plan validé a été calculé (§ 1.3) ; jamais une position du cache, de l'ancrage ou de Text Search.
 *
 * - `mode` (décision 0092 § 1 point 5) : le mode unique de l'exécution, `modeDeTrajet(brief)`, celui de toutes les
 *   matrices du moteur ;
 * - `trajets` (décision 0092 § 4, exception à 0011 pour le prototype seulement) : temps de trajet en minutes entières,
 *   par clé `cleTrajet` (mode, origine, destination ; `src/prototype/programme-reduit.ts`), ceux sur lesquels le moteur
 *   a planifié **dans l'étape finale de cette exécution** (`trajetsAConserver`). `ecrireProgramme` n'écrit, parmi eux,
 *   que les paires de `pairesAConserver(programme, mode)` dont les minutes sont un entier entre 0 et 1 440 ; toute
 *   autre entrée est **écartée avant la transaction**, sans refus (`entree_refusee` ne s'y applique pas) : une paire
 *   écartée est relue à l'affichage et ne fait jamais perdre le programme. Jamais dans un prompt, un journal, une trace
 *   ni un état de workflow.
 *
 * Aucune autre donnée d'une réponse Place Details ou Routes n'a de place dans ce contrat (§ 1.4) : ni distance, ni
 * condition, ni autre champ de Routes.
 */
/** Contenu écrit en base : le programme réduit sans `positions` (égal à `ContenuProgramme` de `src/prototype/decoupage.ts`). */
export type ContenuProgrammePrototype = Omit<ProgrammeReduit, "positions">;
/** Position d'un lieu du programme (égale à `PositionLieu` de `src/prototype/decoupage.ts`). */
export type PositionProgrammePrototype = { readonly lat: number; readonly lng: number };

export type EcritureProgrammePrototype = {
  /** Identifiant de l'exécution `en_cours` (rendu par la réservation du lancement). */
  readonly runId: string;
  readonly programme: ContenuProgrammePrototype;
  readonly positions: ReadonlyMap<string, PositionProgrammePrototype>;
  readonly mode: Segment["mode"];
  readonly trajets: ReadonlyMap<string, number>;
};

/** Résultat d'une écriture réussie : l'identifiant du programme écrit, rien d'autre. */
export type ProgrammeEcrit = { readonly programmeId: string };

/**
 * Codes d'échec, liste fermée, sans valeur : `entree_refusee` (contrôle du module, aucune requête envoyée) ;
 * `execution_close` (l'exécution n'était plus `en_cours` au passage de statut) ; `base` (erreur de la base,
 * transaction annulée : aucune position ni programme écrit).
 */
export const CODES_ECHEC_ECRITURE = ["entree_refusee", "execution_close", "base"] as const;
export type CodeEchecEcriture = (typeof CODES_ECHEC_ECRITURE)[number];
