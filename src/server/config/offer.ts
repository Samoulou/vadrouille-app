import { OfferConfigSchema, type OfferConfig } from "@/contracts";

/**
 * Configuration de l'offre, lue côté serveur seulement (décision 0020 § 4) : seule source du prix.
 * Sous `src/server/`, son import est refusé par le lint dans `src/components`, `src/features`, `src/app`
 * et `src/lib` ; elle n'atteint donc jamais le navigateur.
 *
 * Ces valeurs sont des **reprises**, aucune n'est fixée par le studio :
 * - montant : 29 CHF, Q2 (Samuel, 2026-10-08), révisable ;
 * - inclusions et durée d'accès : cadrage § 4, en attente de Samuel (Q128, F9-Q3). `calendarAndSharing`
 *   promet des fonctions pas encore construites (F10) : à retirer ici avant toute démonstration publique
 *   si Samuel le demande, sans changer le code ;
 * - `replacementLimit` absent tant que Q88 n'est pas tranchée.
 */
export const OFFER_CONFIG: OfferConfig = OfferConfigSchema.parse({
  amount: 2900,
  currency: "CHF",
  priceVariant: "chf_29",
  methods: ["twint", "card"],
  includes: ["allDays", "mealsAndEvenings", "events", "replacements", "checklist", "calendarAndSharing", "access"],
  accessDaysAfterReturn: 30,
});
