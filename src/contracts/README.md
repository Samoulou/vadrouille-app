Types et schémas Zod partagés avec le back-end (handover § 9).

Côté client (`src/components`, `src/features`, `src/analytics`, `src/lib`, `src/i18n`), décision 0016 § 3.1 :
les valeurs se lisent depuis `@/contracts/values` (sans Zod), les types depuis `@/contracts` par `import type`.
Une valeur dont le client a besoin s'ajoute à `values.ts`, et le schéma en dérive.

B2 (évolutions E1 à E7, E9, E10) : `refinements.ts` (raffinements nommés, écrits une fois), `snapshot.ts` (schémas de
stockage dérivés des bases non raffinées `TripBaseSchema` et `ProposalBaseSchema`, jamais recopiés), `preview.ts`
(`PreviewSlot`), `patch.ts` (`TripPatch`, `PatchResult`). Chaque champ a une seule catégorie au handover back-end § 5 :
test `contrats: chaque champ a une seule catégorie` (`tests/unit/contracts/categories.test.ts`).
