import type { InferredBrief } from "@/contracts";

/**
 * Création simulée du voyage d'Édimbourg (spécification F8, F8-PO-13) : brief préparé que `structureBrief`
 * simulé renvoie quel que soit le récit (il ne l'analyse pas). D'après le voyage du cadrage § 2 : 2 adultes,
 * rythme « Équilibré », envies « Nature », « Dégustations », « Restaurants », déplacements « À pied » et
 * « Transports publics », tous déduits ; ni limite ni budget par repas.
 *
 * Importé seulement par les adaptateurs simulés et les tests (règle de lint de F1).
 */
export const MOCK_INFERRED_BRIEF: InferredBrief = {
  travellers: { adults: 2, children: 0 },
  pace: "balanced",
  wishes: ["nature", "tasting", "restaurant"],
  mobility: ["walk", "transit"],
  inferredFields: ["travellers", "pace", "wishes", "mobility"],
};
