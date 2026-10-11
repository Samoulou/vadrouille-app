import { z } from "zod";

/**
 * Catégorie d'une proposition (décision 0013, § 3.1 ; codes provisoires de F6-PO-10).
 *
 * Seule source du vocabulaire : `Brief` (B9), `candidates.category`, `preference_signals.category`
 * et `PreferencePrompt` l'importent au lieu de le recopier. Contenu maison (classement de l'agent ou
 * du moteur), jamais un type de lieu Google recopié. Les libellés sont dans `fr.json`
 * (`presentation.categories`), jamais dans les données.
 */
export const CategorySchema = z.enum(["museum", "walk", "nature", "tasting", "restaurant"]);
export type Category = z.infer<typeof CategorySchema>;
