# Jeu d'évaluation de la couche IA

Spécification `specs/B7-couche-ia-recherche.md`, B7c point 4 et décision de produit B7-PO-9 ; cadrage v5 § 8.

## Contenu

| Dossier | Contenu |
|---|---|
| `briefs/` | Briefs de référence : les trois briefs d'Édimbourg de Samuel (décision 0027 § 6, repris de `prototype/briefs/` sous la forme `BriefRequest` et `EntreeModeles`), avec ses dix incontournables comme attentes. Le brief de Zakynthos viendra quand Samuel l'aura fourni (question 8 de la spécification). |
| `cas-limites/` | Un cas par ligne du cadrage § 8 qui concerne la recherche ou la structuration : « pas de musée », voyage sans voiture, budget mixte, événement unique à horaire fixe, destination peu couverte, arrivée tardive. Les autres lignes (changement d'hôtel, bagages, fermeture hebdomadaire, aucune option compatible) relèvent du moteur (B5). |
| `simule/` | Doubles fabriqués à la main pour les cas qui n'ont pas de jeu dans `prototype/fixtures/` (destination peu couverte). |
| `resultats/` | Mesures commitées, pour comparer les versions de prompts et de modèles. `simule.json` : mesures du mode simulé, vérifiées par le test. |

Chaque cas a la forme de `CasEvaluationSchema` (`src/research/evaluation.ts`) : la demande de structuration, l'entrée des autres étapes, le jeu de doubles du mode simulé et les attentes maison (catégories, incontournables par nom maison).

## Harnais

`evaluerCas` (`src/research/evaluation.ts`) fait tourner la structuration, le plan, la recherche, la notation et les raisons, et rend par cas : taux de sorties valides par étape, candidats trouvés par type de créneau, part des sources officielles, indépendantes et génériques, couverture des catégories et des incontournables attendus, candidats dans une limite du brief, coût et durée par étape, versions des prompts et des modèles.

- **Mode simulé par défaut** : doubles sur fixtures, sans réseau ni clé (`tests/unit/evals/evals.test.ts`). Après un changement voulu de prompt, de modèle ou de fixture : `pnpm vitest run tests/unit/evals -u`, puis relire le différentiel de `resultats/simule.json`.
- **Mode réel** : pas encore. Il attend la réponse de Samuel sur le budget et le plafond par exécution (question 6 de la spécification) ; il se lancera à la main, sur préversion, et n'appellera jamais Google.

## Règles

- **Aucune donnée Google** dans ce dossier : ni identifiant de lieu, ni coordonnées, ni clé de la liste interdite du handover back-end § 8, ni hôte Google. Le test `evals: aucune donnée Google dans les jeux d'évaluation` parcourt tout le dossier.
- **Aucune mesure d'ancrage** (taux d'ancrage, candidats écartés par Google : données dérivées de Google, décision 0011 § 2) et **aucun nom de lieu** dans les mesures. Les candidats eux-mêmes ne sont jamais commités.
- Le taux de « Pas pour moi » et la note de pertinence relèvent du jugement de Samuel (P0b2, B10), pas de ce harnais.
