# 0053 — Plafond de trajets Routes d'un essai réel du prototype

**Concernée par 0093** (PR #512) : la limite de 840 éléments par voyage (0088) reste en vigueur jusqu'à la tâche B de 0093 (optimisation des trajets), qui l'amendera par une nouvelle décision.

Statut : décision de Samuel (argent, budget des essais : « Qui décide quoi » de `docs/CONTEXT.md`), provisoire « dans un premier temps, pour faire les premiers tests » ; amendement 1 du même jour (recommandation du CEO acceptée par Samuel, à valider à la fin de ses essais) · Date : 2026-10-14 · Décideur : Samuel · Rédigée par le CEO · Liée à Q370 et Q389, à P0r2 (#287) et à P0r3

**Amendée par 0088** (ticket #483, PR #490) : la limite passe de 500 à **840 éléments Routes par voyage** (décision de Samuel, 2026-10-18 11:42 UTC, 0088 § 13) ; la réserve d'un essai passe à 6,00 USD. **Amendement 1 point 4 précisé par 0088** (§ 6) : l'algorithme du regroupement par jour (second temps) est remplacé ; le choix de Samuel (tri en mémoire par notre code, sans modèle, deux temps) est inchangé.

Numérotation (relue le 2026-10-14 pour l'amendement 1) : `main` va de 0001 à 0053 (0052 fusionnée par #283, 0053 par #289) ; les PR ouvertes #298, #294 et #300 ajoutent 0054, 0055 et 0056. L'amendement 1 n'ajoute aucun fichier.

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

## Amendement 1 — économies des essais (Samuel, 2026-10-14, fil du projet)
Mots de Samuel (heures de Paris) :
- 06:42 : « Quand je peux faire l'essai réél? Comment réduire encore ces cours au delà du sabrage des trajet? »
- 06:45 : « On ne peut pas déléguer a l'ia la recherche des trajets ? Garder db les trajets pour un prochain? Plusieurs personnes vont a Rome par exemple ? Ou trop personnalisable a chaque session user? »
- 06:48 : « Ok je suis ta reco, et on valide a la fin des tests les solutions. Aussi on demande les fiches de lieux que des retenus et par retenu j'entends retenu pour la première proposition de slider. J'y pense apprès que la personne a dis les j'aime ou j'aime pas, on refait une analyse complète? Pour optimiser et affiner ? »
- 06:50 : « Oui go, prend bien note de toutes les optimisations qu'on garde sous le coude. On a un plan je pense »

La recommandation du CEO à laquelle il répond « je suis ta reco » contenait : fiches de lieux limitées, réutilisation du cache des positions, profil d'IA léger et modèle de tri moins cher, tri à vol d'oiseau dans notre code avant Routes ; refus des temps de trajet estimés par l'IA et du stockage des temps de trajet ; le reste en réserve. Ci-dessous : **recommandation du CEO acceptée par Samuel, à valider à la fin de ses essais**. Elle vaut pour les essais réels du prototype (P0r3) ; B8 et B9 pourront s'en inspirer, sur décision ultérieure.

### Retenues pour P0r3
1. **Fiches de lieux (Place Details) des seuls lieux retenus pour la première série de cartes à glisser** (mots de Samuel, 06:48), avec une petite marge pour remplacer un lieu refusé. Aucune fiche pour un autre candidat. Le masque reste celui de 0046 (point 8), horaires compris : rien d'autre sans nouvelle décision.
2. **Réutilisation du cache des positions** (`place_coordinates`, 30 jours au plus selon 0011 § 6 et 0027 point 4 ; 29 jours pour `org_prototype` selon 0046 point 8). **Sans effet tant qu'aucune position du prototype n'est écrite**, ce que la fusion de 0052 ne suffit pas à faire. Il faut trois livraisons : la migration de remplacement à quatre paramètres de `store_prototype_coordinates`, livrée par P0r3c (0052 § 1.7) ; la levée du verrou S8, que 0052 laisse en place (§ 1 et § 3 : `vadrouille_prototype` sans `EXECUTE` sur la fonction) et renvoie à la décision 0056 (PR #300, en revue) ; et l'étape finale de `p0Run` (P0r3c), qui n'écrit que les `placeId` du programme (0052 § 1.2). La migration est fusionnée avant toute PR de déverrouillage (0052 § 1.7). L'économie ne porte donc, au mieux, que sur les lieux des programmes d'essais précédents encore vivants (29 jours) : le premier essai réel trouve le cache vide. Une position lue dans le cache ne remplace jamais la fiche d'un lieu planifié (0052 § 1.3).
3. **Profil d'IA léger** : moins de recherches web et de pages lues, et un modèle moins cher pour le tri et la notation. Le choix du modèle et du profil revient au rôle ia-recherche dans sa PR, dans les plafonds fixés pour le mode réel.
4. **Tri à vol d'oiseau avant Routes**, calculé en mémoire par notre code, sans appel de modèle ni écriture (0011 § 1), en deux temps dans l'étape finale, comme le décrit 0055 § 6.4 (PR #294, non fusionnée ; ce renvoi vaut à sa fusion) :
   - **avant les fiches**, sur les seuls candidats dont le cache a déjà une position vivante (point 2) : un candidat trop loin des logements ou du groupe d'un jour peut être écarté sans fiche ; ce temps **évite des fiches**. Un candidat sans position en cache n'est jamais écarté pour la distance avant sa fiche ;
   - **après les fiches de la première série** (point 1), sur leurs positions : regroupement par jour et ordre provisoire ; ce temps **limite les paires envoyées à Routes**, qui ne sert qu'à l'ordre final.

   La position du cache ne sert qu'au premier temps, jamais à planifier, valider ou écrire un lieu.

La réserve d'un essai reste au prix plein, sans gratuité (Q329), et reste de **4,30 USD** : le forfait est calculé sur le plafond `placesDetails` (90), pas sur le nombre de fiches demandées ; moins de fiches baissent la facture, pas la réserve, tant que ce plafond n'est pas abaissé (Q389, proposition au Product Owner dans 0055 § 6). Q380 (forfait plus strict que Q329) est une question distincte, ouverte pour le Tech Lead.

### Refusées (recommandation du CEO acceptée par Samuel)
- **Temps de trajet estimés par un modèle d'IA** : durées plausibles mais fausses, sans horaires ni travaux.
- **Temps de trajet gardés en base pour d'autres voyageurs** (même ville) : exclu par la règle provisoire de Q5 (0011 § 1, aucune durée de trajet en base) ; réutilisation possible seulement en mémoire, pendant une même exécution.

### En réserve (rien n'est appliqué ; chaque point revient à Samuel, à la fin de ses essais ou quand les volumes augmentent)
- **Compter la gratuité Google dans la réserve d'un essai** (10 000 éléments Routes et 1 000 fiches Enterprise par mois) : le plus gros levier, mais il revient sur Q329.
- **Relever le plafond Google** au-delà de 20 USD par mois (option 2 présentée le 2026-10-14 à 04:10 UTC).
- **Autre forme de fiche** (autre masque, autre SKU, fiche sans horaires) : exige une décision nouvelle.
- **Calcul de trajets open source** (OSRM, Valhalla, GraphHopper, OpenRouteService ; OpenTripPlanner pour les transports en commun) : piste du CEO, à étudier plus tard par le Tech Lead. Obstacles : les positions viennent de Google et ne peuvent servir hors de Google (0011, 0027), il faudrait donc une source de lieux non Google ; les transports en commun demandent un serveur à nous, ville par ville.
- **Analyse complète après les « j'aime » et « j'aime pas »** (question de Samuel, 06:48) : proposition du CEO, garder le recalcul ciblé de B10 (jours touchés, lieux déjà trouvés, petite recherche si un type manque) ; si les essais montrent qu'il n'affine pas assez, élargir cette petite recherche plutôt que tout refaire (coût et attente doublés).
