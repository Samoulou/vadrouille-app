# 0053 — Plafond de trajets Routes d'un essai réel du prototype

Statut : décision de Samuel (argent, budget des essais : « Qui décide quoi » de `docs/CONTEXT.md`), provisoire « dans un premier temps, pour faire les premiers tests » · Date : 2026-10-14 · Décideur : Samuel · Rédigée par le CEO · Liée à Q370 et Q389, à P0r2 (#287) et à P0r3

Numérotation (vérifiée le 2026-10-14) : `main` va de 0001 à 0051 ; la PR #283 ajoute 0052 ; aucune autre PR ouverte n'ajoute de fichier sous `docs/decisions/`. Cette PR ajoute `0053`.

## Contexte
Le port de consommation de P0r2 (#287, `src/server/usage/forfait.ts`) réserve avant chaque essai réel un forfait égal à la somme de ses plafonds par méthode, au prix catalogue plein et sans tranche gratuite (Q329). Avec la configuration de la branche de P0r2 (`prototype/config/plafonds.json` : `routesElements` 4 000, `placesDetails` 90, `placesTextSearch` 90), et les prix de `prototype/config/prix-google.json` (relevé du 2026-10-13), la réserve Google d'un essai vaut :

| Méthode | Plafond | Prix plein | Réserve |
|---|---|---|---|
| Routes, matrice (élément = un temps de trajet entre un départ et une arrivée) | 4 000 éléments | 5 USD pour 1 000 | 20,00 USD |
| Places Details (Enterprise) | 90 requêtes | 20 USD pour 1 000 | 1,80 USD |
| Places Text Search (identifiants seuls) | 90 requêtes | 0 USD | 0,00 USD |
| **Total** | | | **21,80 USD** |

Ce total dépasse le plafond Google de 20 USD par mois (0027 § 2) : aucun essai réel n'était accepté (`cap_reached`). Le CEO a présenté le calcul à Samuel le 2026-10-14 (fil du projet, 04:10 UTC) avec deux options : baisser le plafond de trajets (recommandé, 1 000) ou relever le plafond Google.

## Décision (Samuel, 2026-10-14 04:25 UTC, fil du projet)
Texte de Samuel : « Ok on pose la décision dans un premier temps pour faire les premiers test, Max 500 trajets par voyage (500 / par le nombre de jour). Seul mes essaie a moi compte dans le budget des 10000 et je reviens vers toi quand j'ai testé les perf et la fiabilité ».

1. **500 éléments Routes au plus par essai réel (un voyage)** : `routesElements` vaut 500 dans la configuration du mode réel de P0r3.
2. **Répartition par jour** : chaque jour du voyage dispose au plus de `floor(500 / nombre de jours)` éléments. Exemples : 4 jours, 125 éléments par jour (une matrice de 11 lieux sur 11) ; 7 jours, 71 par jour (8 sur 8). Un jour n'emprunte pas la part d'un autre.
3. **Gratuité Google réservée aux essais de Samuel** : les 10 000 éléments Routes gratuits par mois (prix Google relevé le 2026-10-13) ne servent qu'aux essais réels lancés par Samuel. Lecture du CEO, à confirmer par Samuel si elle est fausse : le studio (agents, CI, évaluations, tests) ne fait aucun appel Routes réel ; il utilise les clients simulés.
4. **Provisoire** : Samuel revient vers le studio après avoir testé les performances et la fiabilité. Toute hausse lui revient.

## Conséquences
- **Réserve Google d'un essai : 4,30 USD** (500 × 5 / 1 000 = 2,50 USD de Routes, plus 1,80 USD de Places Details), soit quatre essais par mois dans le plafond de 20 USD, et neuf dans l'enveloppe de 40 USD jusqu'à G0. La règle de Q329 (prix plein, sans gratuité) reste celle du forfait ; la facture réelle sera plus basse.
- **P0r3** fixe `routesElements` à 500 et applique la répartition par jour dans le plan de l'étape Routes ; un test vérifie qu'aucun jour ne dépasse sa part et que le total ne dépasse pas 500. P0r2 (#287) n'est pas modifiée : ses plafonds sont des paramètres, fixés par P0r3.
- **Non tranché ici** : le plafond d'une relecture Routes (P0r4), l'unité du quota Routes (P0-Q31), la répartition de `placesDetails` (Q389) et le plafond de coût des modèles (2 ou 3 USD, question 2 de #287). Si la répartition par jour gêne la qualité des programmes, le Tech Lead le signale à Samuel avec les mesures de ses essais.
- Q370 reste ouverte pour Places Details au-delà des essais ; le statut suivant reporte cette décision dans `QUESTIONS.md`.
