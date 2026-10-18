/*
 * Listes d'exclusions du test `contrats: chaque champ a une seule catégorie` (décision 0037, B2-TL-5 ; spécification
 * B2, § 5). Toute clé dont le préfixe est un contrat de l'une de ces listes est retirée des deux ensembles comparés.
 */

export interface ExcludedContract {
  contract: string;
  task: string;
  reason: string;
}

/**
 * Exclusions **temporaires** : contrats exportés sans ligne au § 5, complétés par une tâche ultérieure. La tâche
 * qui complète un contrat ajoute ses lignes au tableau et retire son entrée.
 */
export const EXCLUDED_CONTRACTS: ExcludedContract[] = [
  // Contrats de création : ceux de l'écran 1 et du lancement (`TripDraft`, `Brief`, `Lodging`, `OtherCity`,
  // `TripCommitment`, `Travellers`, `TripRequest`, `GenerationStatus`, `GenerationDay`) ont leurs lignes au § 5 depuis
  // la PR de contrat de B9b (0081 § B9-TL-14 ; spécification B9, B9b point 7). Restent ceux des actions sans compte (B9a).
  { contract: "BriefRequest", task: "B9", reason: "structuration côté serveur par B9 (structureBrief)" },
  { contract: "InferredBrief", task: "B9", reason: "structuration côté serveur par B9 (structureBrief)" },
  // F8b (décision 0017 § 2.4) : contrats de phase 0 jamais stockés ; « Contrats à créer » du handover back-end les
  // attribue à F8b sans ligne au § 5, que le Tech Lead écrit (question de la PR F8b) avant de retirer ces entrées.
  { contract: "LodgingRequest", task: "F8b", reason: "demande de suggestion de logement (0017 § 2.4), jamais stockée ; reprise par B9" },
  { contract: "LodgingSuggestion", task: "F8b", reason: "suggestion simulée de quartier (0017 § 2.4), jamais stockée ; reprise par B9" },
  { contract: "CodeRequest", task: "F8b", reason: "demande de code de connexion (0017 § 2.4), jamais stockée ; reprise par B3" },
  { contract: "CodeVerification", task: "F8b", reason: "vérification du code (0017 § 2.4), jamais stockée ; reprise par B3" },
  { contract: "Session", task: "B3", reason: "session lue par l'interface (0017 § 2.4), complétée par B3" },
  // F7a (décision 0016 § 4 et § 6) : contrats de phase 0 de la révision, jamais stockés ; B11 les reprend derrière
  // les Server Actions (`previewReplacement`, `applyPatch`) et en écrit les lignes.
  { contract: "ReplacementRequest", task: "B11", reason: "demande de remplacement (0016 § 4.1), action serveur de B11" },
  { contract: "RevisionPreview", task: "B11", reason: "aperçu d'une révision (0016 § 4.2), complété par B11" },
  { contract: "ReplacementDraft", task: "B11", reason: "brouillon simulé de remplacement (0016 § 6), remplacé par le moteur en B11" },
  { contract: "ReplacementFixture", task: "B11", reason: "jeu simulé de révision (0016 § 6), remplacé par B11" },
  { contract: "RevisionFixtures", task: "B11", reason: "jeu simulé de révision (0016 § 6), remplacé par B11" },
  // F7b (décision 0016 § 4 et § 6) : déplacement, mêmes raisons ; B11 les reprend (`getMoveOptions`, `applyPatch`).
  { contract: "MoveRequest", task: "B11", reason: "demande de déplacement (0016 § 4.1), action serveur de B11" },
  { contract: "MoveOptions", task: "B11", reason: "points d'insertion (0016 § 4.3), action serveur de B11" },
  { contract: "MoveDraft", task: "B11", reason: "brouillon simulé de déplacement (0016 § 6), remplacé par le moteur en B11" },
  { contract: "MoveFixture", task: "B11", reason: "jeu simulé de révision (0016 § 6), remplacé par B11" },
];

/**
 * Exclusions **permanentes** : schémas de stockage dérivés (spécification B2, § 1), contrôlés par le test
 * `contrats: les schémas de stockage sont dérivés sans copie`.
 */
export const DERIVED_STORAGE_SCHEMAS: { contract: string; source: string }[] = [
  { contract: "TripSnapshot", source: "TripBase" },
  { contract: "DaySnapshot", source: "Day" },
  { contract: "DayLineItemSnapshot", source: "DayLineItem" },
  { contract: "StopSnapshot", source: "Stop" },
  { contract: "EventSnapshot", source: "StopSnapshot" },
  { contract: "SegmentSnapshot", source: "Segment" },
  { contract: "SurpriseIdeaSnapshot", source: "SurpriseIdea" },
  { contract: "ProposalRecord", source: "ProposalBase" },
];
