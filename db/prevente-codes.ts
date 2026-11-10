import "server-only";

/**
 * Listes fermées de la mesure de la prévente (spécification `specs/C2-prevente-mesure.md`, § 2.2 point 4, § 3.1 et
 * § 3.2 ; tâche C2a, ticket 1117).
 *
 * Seul fichier de `db/` qui porte ces listes : les contraintes `CHECK` du schéma Drizzle (`db/schema/prevente.ts`) en
 * sont générées, donc la migration `0029_prevente_mesure` aussi, et les tests de base les reprennent. Écrites d'après
 * la spécification, **sans importer `src/contracts`** (les contrats de la mesure arrivent avec C2b, qui ajoute le test
 * comparant ses schémas à ces listes, sur le modèle de `db/jsonb-keys.ts`). Ajouter un code demande une migration : les
 * `CHECK` des tables et le domaine `public.prevente_code` portent la liste dans la base.
 */

/**
 * Provenances stockées : la liste de `docs/commercial/suivi.md`, plus `direct` (sans `src`, ou `src` invalide) et
 * `autre` (valeur valide hors liste). `interne` n'y est **jamais** : le lien de test n'écrit rien (C2-PO-11).
 */
export const PREVENTE_PROVENANCES = [
  "proches",
  "forum",
  "groupe",
  "reddit",
  "instagram",
  "instagram-pub",
  "createur",
  "direct",
  "autre",
] as const;

/** Parcours d'une réponse : branche de la question 4 (§ 3.2 point 2). */
export const PREVENTE_PARCOURS = ["precommande", "visite"] as const;

/** Question 2, « Quand pars-tu ? » (choix unique). */
export const PREVENTE_PERIODES = ["paques", "ascension", "pentecote", "printemps", "plus-tard", "sans-date"] as const;

/** Question 3, « Comment as-tu préparé ton dernier voyage ? » (plusieurs choix). */
export const PREVENTE_PREPARATIONS = [
  "guides-blogs",
  "avis-cartes",
  "assistant",
  "application",
  "agence",
  "presque-rien",
  "autre",
] as const;

/** Question 4, une liste par parcours : « Qu'est-ce qui t'a décidé ? » et « Qu'est-ce qui t'a retenu ? ». */
export const PREVENTE_MOTIFS = {
  precommande: ["adresses-sourcees", "evenements", "remplacer", "prix", "gain-de-temps", "demonstration", "autre"],
  visite: ["prix", "pas-de-voyage", "attendre", "assistant-gratuit", "fiabilite", "destination", "autre"],
} as const;

/** Question 5, « Comment as-tu découvert Vadrouille ? » (choix unique). */
export const PREVENTE_DECOUVERTES = ["connait-createur", "ami", "forum-groupe", "instagram", "createur-contenu", "autre"] as const;

/** Question 1 : longueur maximale du texte libre (C2-PO-9). */
export const PREVENTE_DESTINATION_MAX = 80;

/** Plafond global des réponses stockées par jour UTC (§ 3.4 point 3 ; proposition, seuil réel : Sécurité, S2). */
export const PREVENTE_PLAFOND_REPONSES_JOUR = 200;

/**
 * Rubriques rendues par `public.prevente_releve_reponses()` : une ligne `total`, puis une répartition par rubrique.
 * Elles entrent dans le domaine `public.prevente_code` avec les codes, pour que le relevé ne rende que des valeurs de
 * listes fermées (critère B7).
 */
export const PREVENTE_RUBRIQUES = [
  "total",
  "src",
  "parcours",
  "periode",
  "preparation",
  "motifs-precommande",
  "motifs-visite",
  "decouverte",
] as const;

/** Valeurs du domaine `public.prevente_code` : tous les codes des listes fermées et les rubriques, sans doublon. */
export const PREVENTE_CODES: readonly string[] = [
  ...new Set<string>([
    ...PREVENTE_PROVENANCES,
    ...PREVENTE_PARCOURS,
    ...PREVENTE_PERIODES,
    ...PREVENTE_PREPARATIONS,
    ...PREVENTE_MOTIFS.precommande,
    ...PREVENTE_MOTIFS.visite,
    ...PREVENTE_DECOUVERTES,
    ...PREVENTE_RUBRIQUES,
  ]),
];
