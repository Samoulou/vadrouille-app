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

## Amendement 1 — économies retenues et économies en réserve (Samuel, 2026-10-14 04:48 et 04:50 UTC, fil du projet)
Texte de Samuel : « Ok je suis ta reco, et on valide a la fin des tests les solutions. Aussi on demande les fiches de lieux que des retenus et par retenu j'entends retenu pour la première proposition de slider. » ; puis « Oui go, prend bien note de toutes les optimisations qu'on garde sous le coude. »

### Retenues, appliquées par P0r3 (et reprises par B8 et B9 pour le MVP), validées par Samuel à la fin de ses essais
1. **Fiches de lieux (Places Details) des seuls lieux retenus pour la première proposition de cartes à glisser** : aucun appel Places Details pour un candidat qui n'entre pas dans cette première série. Le champ demandé est le moins cher qui suffit (SKU Essentials quand les horaires ne servent pas ; le rôle ia-recherche documente le choix par champ dans la PR). Estimation du CEO, non mesurée : environ 0,50 USD par essai au lieu de 1,80.
2. **Réutilisation du cache de positions** (`place_coordinates`, 29 jours, décisions 0011 et 0027) : un lieu déjà connu ne déclenche aucun nouvel appel pour sa position.
3. **Profil d'IA « léger » pour les essais** : moins de recherches web et de pages lues, et un modèle moins cher pour le tri et la notation (dans les bornes de B7, `specs/B7-couche-ia-recherche.md` une fois fusionnée). Estimation du CEO, non mesurée : environ 1 USD par essai.
4. **Premier tri par distance à vol d'oiseau**, calculé en mémoire par notre code à partir des positions, sans appel de modèle et sans écriture (0011 § 1) ; Routes n'est appelé que pour l'ordre final des lieux retenus de chaque jour. Estimation du CEO, non mesurée : 30 à 40 éléments par jour au lieu d'environ 100.

La réserve d'un essai reste au prix plein, sans gratuité (Q329).

### En réserve (aucune n'est appliquée ; chacune revient à Samuel, à la fin de ses essais ou quand les volumes augmentent)
- **Compter la gratuité Google dans la réserve d'un essai** (10 000 éléments Routes et 1 000 fiches Enterprise par mois) : le plus gros levier, mais il revient sur Q329.
- **Relever le plafond Google** au-delà de 20 USD par mois (option 2 présentée le 2026-10-14 04:10 UTC).
- **Calcul de trajets open source** (OSRM, Valhalla, GraphHopper, OpenRouteService ; OpenTripPlanner pour les transports en commun) : étude du Tech Lead pour plus tard. Obstacles relevés : les positions viennent de Google et ne peuvent servir hors de Google (0011, 0027), donc il faudrait aussi une source de lieux non Google ; les transports en commun demandent un serveur à nous, ville par ville.
- **Recherche élargie après les « j'aime » et « j'aime pas »** : le recalcul par lot de B10 reste ciblé (jours touchés, lieux déjà trouvés, petite recherche si un type manque). Si les essais montrent qu'il n'affine pas assez, élargir la petite recherche ; une analyse complète est écartée (coût et attente doublés).

### Écartées
- **Faire estimer les temps de trajet par un modèle d'IA** : durées plausibles mais fausses, sans horaires ni travaux.
- **Garder les temps de trajet en base pour d'autres voyageurs** (même ville) : interdit par les conditions de Google et par 0011 § 1 (aucune durée de trajet en base) ; réutilisation possible seulement en mémoire, pendant une même session.

