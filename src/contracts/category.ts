import { z } from "zod";

import { CATEGORIES } from "./values";

/**
 * Catégorie d'une proposition et envie du brief (décision 0013, § 3.1 ; codes provisoires de F6-PO-10, étendus
 * par la décision 0017 § 8 : `heritage`, `market`, `nightlife`).
 *
 * Seule source du vocabulaire : `Brief` (B9), `candidates.category`, `preference_signals.category`
 * et `PreferencePrompt` l'importent au lieu de le recopier. Contenu maison (classement de l'agent ou
 * du moteur), jamais un type de lieu Google recopié. Les libellés sont dans `fr.json`
 * (`presentation.categories` pour la phrase de la question de préférence, `creation.envies` pour l'étiquette d'une
 * `Chip` du brief), jamais dans les données. Les codes vivent dans `values.ts` (`CATEGORIES`),
 * que le code client lit sans charger Zod (décision 0016 § 3.1).
 */
export const CategorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof CategorySchema>;
