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
  { contract: "TripSummary", task: "B6", reason: "résumé de « Mes voyages », complété par B6" },
  { contract: "TripDraft", task: "B9", reason: "brouillon de l'écran 1, complété par B9" },
  { contract: "Brief", task: "B9", reason: "brief structuré, complété par B9" },
  { contract: "BriefRequest", task: "B9", reason: "structuration côté serveur par B9 (structureBrief)" },
  { contract: "InferredBrief", task: "B9", reason: "structuration côté serveur par B9 (structureBrief)" },
  { contract: "Lodging", task: "B9", reason: "sous-contrat de TripDraft et Brief, complété par B9" },
  { contract: "OtherCity", task: "B9", reason: "sous-contrat de TripDraft et Brief, complété par B9" },
  { contract: "TripCommitment", task: "B9", reason: "sous-contrat de TripDraft et Brief, complété par B9" },
  { contract: "Travellers", task: "B9", reason: "sous-contrat de TripDraft et Brief, complété par B9" },
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
