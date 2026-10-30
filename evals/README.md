# Jeu d'évaluation de la couche IA

Spécification `specs/B7-couche-ia-recherche.md`, B7c point 4 et décision de produit B7-PO-9 ; cadrage v5 § 8.

## Contenu

| Dossier | Contenu |
|---|---|
| `briefs/` | Briefs de référence : les trois briefs d'Édimbourg de Samuel (décision 0027 § 6, repris de `prototype/briefs/` sous la forme `BriefRequest` et `EntreeModeles`), avec ses dix incontournables comme attentes. Le brief de Zakynthos viendra quand Samuel l'aura fourni (question 8 de la spécification). |
| `cas-limites/` | Un cas par ligne du cadrage § 8 qui concerne la recherche ou la structuration : « pas de musée », voyage sans voiture, budget mixte, événement unique à horaire fixe, destination peu couverte, arrivée tardive. Les autres lignes (changement d'hôtel, bagages, fermeture hebdomadaire, aucune option compatible) relèvent du moteur (B5). |
| `simule/` | Doubles fabriqués à la main pour les cas qui n'ont pas de jeu dans `prototype/fixtures/` (destination peu couverte). |
| `qualite/` | Cas de qualité du programme (amendement 3 de la suite 2 de P0, P0S2-PO-28, partie recherche), type `qualite` : Rome et Naxos, avec leurs catégories et leurs incontournables attendus. |
| `simule/qualite-*` | Doubles des cas `qualite/` (modèles, recherche, pages) et leurs `bornes.json` (cibles par créneau, total de candidats, tours et âge maximal des sources). |
| `programme/` | Lot 1 du programme par l'IA (spécification P0-programme-par-ia § 5, décision 0116 § 8.4) : sorties simulées du prompt `programme` pour rome-1 et edimbourg-1, et `config.json`, seuils du Product Owner (A1 à A6) et incontournables attendus, mesurés par `tests/unit/evals/programme.test.ts`. Mesures de la sortie, jamais des règles du prompt ni du code. |
| `revision/` | Lot 4 de la spécification E2E-essai (décision 0126) : sorties simulées du prompt `revision` v1, écrites à la main, avec la version précédente (une sortie de `programme/`) et les choix du tri par nom ; mesurées par `tests/unit/evals/revision.test.ts` (aucune étape « Pas pour moi » ne revient, les étapes aimées restent, « à éviter » respecté, entrée sans donnée Google). |
| `programme-v5/` | M4a (ticket #920 ; spécification M4 § 14, décision 0148 § 5.1 point 4) : sorties simulées du prompt `programme` v5 (plusieurs villes), écrites à la main, avec l'entrée v5 que construira M4b : Rome puis Florence avec un billet saisi, Lisbonne puis Porto en départ estimé, Paris, Lyon, Marseille au rythme « intense », et un contrôle qui viole le cadre. `tests/unit/evals/programme-v5.test.ts` mesure l'adhésion au cadre des journées de changement de ville (activités, étape à réserver, étape pendant le trajet, titre, durée estimée), les villes par créneau et les incontournables de chaque ville sur ses jours ; mesures commitées dans `resultats/programme-v5.json`. Mesure, jamais un critère d'acceptation. |
| `revision-v3/` | M4a-2 (ticket #926 ; décision 0148 § 8 point 2) : sorties simulées du prompt `revision` v3 (plusieurs villes), écrites à la main ; la version précédente est une sortie de `programme-v5/`, les choix du tri sont donnés par nom. Rome puis Florence avec une étape remplacée dans la ville 2, Rome puis Florence révisé des deux côtés du trajet le jour du changement de ville, Lisbonne puis Porto (départ estimé) révisé ce jour-là, et un contrôle qui viole tout. `tests/unit/evals/revision-v3.test.ts` construit l'entrée v3 comme M4b (`entreeRevisionDepuisJours`, sans récit, champs Google en sentinelles) et mesure les étapes écartées (retour, remplacement, côté du trajet), les étapes aimées, le cadre du jour de changement de ville, les villes par créneau et les `transfer` écrits par le modèle ; mesures commitées dans `resultats/revision-v3.json`. Mesure, jamais un critère d'acceptation. |
| `resultats/` | Mesures commitées, pour comparer les versions de prompts et de modèles. `simule.json` : mesures du mode simulé, vérifiées par le test. |

Chaque cas a la forme de `CasEvaluationSchema` (`src/research/evaluation.ts`) : la demande de structuration, l'entrée des autres étapes, le jeu de doubles du mode simulé et les attentes maison (catégories, incontournables par nom maison).

## Harnais

`evaluerCas` (`src/research/evaluation.ts`) fait tourner la structuration, le plan, la recherche, la notation et les raisons, et rend par cas : taux de sorties valides par étape, candidats trouvés par type de créneau, part des sources officielles, indépendantes et génériques, couverture des catégories et des incontournables attendus, candidats dans une limite du brief, coût et durée par étape, versions des prompts et des modèles.

**Taux indicatifs** (revue de la PR #454, mineur 8). Deux taux de sorties valides sont des approximations, à lire comme des tendances et non comme des mesures exactes :
- `plan` est compté une fois par cas, même si le plan n'a pas été appelé (recherche sans plan) : il vaut alors 1 ;
- `recherche` est compté par **tour** de l'agent, et les tours en échec sont supposés être les premiers (le bilan de l'agent ne dit que leur nombre, pas leur rang).

- **Mode simulé par défaut** : doubles sur fixtures, sans réseau ni clé (`tests/unit/evals/evals.test.ts`). Après un changement voulu de prompt, de modèle ou de fixture : `pnpm vitest run tests/unit/evals -u`, puis relire le différentiel de `resultats/simule.json`.
- **Mode réel** : pas encore. Il attend la réponse de Samuel sur le budget et le plafond par exécution (question 6 de la spécification) ; il se lancera à la main, sur préversion, et n'appellera jamais Google.

## Règles

- **Aucune donnée Google** dans ce dossier : ni identifiant de lieu, ni coordonnées, ni clé de la liste interdite du handover back-end § 8, ni hôte Google. Le test `evals: aucune donnée Google dans les jeux d'évaluation` parcourt tout le dossier.
- **Aucune mesure d'ancrage** (taux d'ancrage, candidats écartés par Google : données dérivées de Google, décision 0011 § 2) et **aucun nom de lieu** dans les mesures. Les candidats eux-mêmes ne sont jamais commités.
- Le taux de « Pas pour moi » et la note de pertinence relèvent du jugement de Samuel (P0b2, B10), pas de ce harnais.
