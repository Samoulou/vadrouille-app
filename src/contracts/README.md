Types et schémas Zod partagés avec le back-end (handover § 9).

Côté client (`src/components`, `src/features`, `src/analytics`, `src/lib`, `src/i18n`), décision 0016 § 3.1 :
les valeurs se lisent depuis `@/contracts/values` (sans Zod), les types depuis `@/contracts` par `import type`.
Une valeur dont le client a besoin s'ajoute à `values.ts`, et le schéma en dérive.
