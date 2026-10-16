Accès aux données, simulé ou réel : seul point d'entrée des données pour l'interface.

Adaptateur `prototype` (spécification P0, P0b1 ; décision 0032 § A4 et § A6) : `prototype.ts` (recomposition et validation, relecteur injecté), `prototype-loader.ts` (chargeur de programmes à index en mémoire), `prototype-instance.ts` (liste blanche, relecteur simulé), `prototype-lecture.ts` (programmes réels de `prototype.programmes`, lecture seule derrière la barrière du mode réel, recomposés avec leurs positions de `place_coordinates` ; durées relues par le relecteur Routes réel branché au démarrage, `src/server/p0/relecture.ts` : décisions 0074 et 0076). Jamais en production : voir `docs/deploiement/variables-environnement.md`.

`AdapterContext` porte `organizationId`, `userId` et `role` (`owner` ou `member`, E6) ; `TripAdapter.listPreviewSlots` lit l'aperçu en cases `PreviewSlot` (E7, B2), validé par `PreviewSlotsSchema`.
