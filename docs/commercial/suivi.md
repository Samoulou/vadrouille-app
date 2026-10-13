# Suivi hebdomadaire du volet commercial de G0

Rôle : `commercial` · Spécification : `specs/C1-prevente.md` (livrable 7) · Rédigé le 2026-10-13.

Reprend le tableau de bord du cadrage § 13 pour la partie commerciale, **sans les lignes de temps humain par dossier** (décision 0043 § 4 : aucune intervention humaine pour les particuliers). Rempli chaque semaine à partir des mesures de la page et du paiement, sans aucune donnée personnelle (ni nom, ni e-mail, ni numéro) : seulement des nombres.

Numérotation : « question N » renvoie à la question Q-C1-N à Samuel de la description de la PR #256 ; une question du questionnaire en ligne est toujours dite « question N du questionnaire ».

## Seuils G0 (décision 0044 ; `docs/roadmap.md`)

| Mesure | Seuil G0 |
|---|---:|
| Visites de la page de prévente | 300 |
| Réponses au questionnaire en ligne | 10 |
| Achats ou préventes payés | 5 |
| dont hors cercle proche | 3 |

Les autres conditions de G0 (prototype exploitable sur Édimbourg, présentation comprise par 4 testeurs sur 5) sont suivies ailleurs (`docs/roadmap.md`).

## Tableau hebdomadaire

Une ligne par semaine (du lundi au dimanche), cumul en fin de semaine.

| Semaine | Visites (sem.) | Visites (cumul) / 300 | Préventes payées (sem.) | Préventes (cumul) / 5 | dont hors cercle proche (cumul) / 3 | dont indéterminé (cumul) | Remboursements (cumul) | Réponses au questionnaire (cumul) / 10 | Dépenses d'acquisition (cumul) / 100 CHF | Note |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| S1 | | | | | | | | | | |
| S2 | | | | | | | | | | |
| S3 | | | | | | | | | | |
| S4 | | | | | | | | | | |

Plafond des dépenses d'acquisition : 100 CHF, « Tests d'acquisition et contenus » (cadrage § 11). Le domaine (30 CHF, cadrage § 11) n'entre pas dans cette colonne.

## Provenance (cumul)

Valeur du paramètre `src` du lien (`page-prevente.md`, « Mesure »). La question 5 du questionnaire (`questionnaire.md`) donne une lecture agrégée ; elle ne recoupe un achat que si Samuel accepte le rattachement des réponses au paiement (question 8).

| Provenance (`src`) | Visites | Préventes | Réponses | Dépense (CHF) |
|---|---:|---:|---:|---:|
| `proches` (réseau personnel) | | | | 0 |
| `forum` | | | | 0 |
| `groupe` (groupes romands) | | | | 0 |
| `reddit` | | | | 0 |
| `instagram` | | | | 0 |
| `instagram-pub` (si test payé) | | | | |
| `createur` | | | | |
| sans `src` (direct ou inconnu) | | | | 0 |

## Questionnaire (cumul)
- Période de voyage (question 2 du questionnaire) : Pâques · Ascension · Pentecôte · autre printemps · plus tard · pas de date.
- Destinations citées (question 1 du questionnaire) : les 5 plus fréquentes, pour D3 (cadrage § 1).
- Ce qui a décidé et ce qui a retenu (question 4 du questionnaire) : les 3 réponses les plus fréquentes de chaque branche.

## Mesures du produit, quand il sera ouvert
Reprises du cadrage § 13 pour plus tard (hors G0 commercial) : taux de passage de la présentation, taux de « Pas pour moi », conversion de Tes premières propositions en paiement, remboursements et recommandations effectives. Événements déjà prévus : `docs/handovers/frontend.md` § 12.

## Comment compter « hors cercle proche » (proposition, à confirmer par Samuel)
**Proposition, non tranchée (question 7).** La décision 0044 ne définit pas « cercle proche » ; la définition et la règle de compte reviennent à Samuel (phases G0, « Qui décide quoi »). Proposition de définition : les personnes que Samuel connaît personnellement, et celles qui ont reçu le lien directement de lui ou de ses proches.

Règle proposée, sans aucune vérification humaine ni donnée personnelle dans le dépôt. Un achat n'est compté **hors cercle proche** que si sa provenance est connue et n'est pas proche ; dans le doute, il est **indéterminé**, jamais hors cercle par défaut :
1. **cercle proche** : achat venu d'un lien `src=proches` ; ou, si le rattachement au paiement est accepté (question 8), réponse « Je connais personnellement la personne qui crée Vadrouille » ou « Par un ami ou une amie » à la question 5 du questionnaire ;
2. **hors cercle proche** : achat venu d'un lien `src` connu et non proche (`forum`, `groupe`, `reddit`, `instagram`, `instagram-pub`, `createur`), sans indice contraire (si le rattachement est accepté : aucune réponse « Je connais personnellement… » ni « Par un ami ou une amie ») ;
3. **indéterminé** : tout le reste, notamment un achat sans `src` (lien direct ou transmis), ou des indices contradictoires. La question 5 du questionnaire étant facultative, une réponse absente ne fait jamais passer un achat hors cercle ;
4. Samuel peut reclasser un achat indéterminé de son côté (il voit les paiements hors du dépôt) ; seuls les nombres entrent dans ce tableau.

Seuls les achats **hors cercle proche** comptent pour le seuil de 3 (décision 0044).

## Signaux d'alerte (proposés, à confirmer par Samuel)
Adaptation proposée par le rôle `commercial` du signal d'alerte du cadrage § 12 (« Moins de 3 achats après 30 contacts ») aux mesures en ligne de la décision 0044. Les seuils ci-dessous ne figurent nulle part dans le dépôt : ce sont des propositions, à fixer par Samuel (question 10).
- proposition : moins de 3 préventes payées après 300 visites : revoir cible, promesse ou prix avant d'ajouter des fonctionnalités (règle du cadrage § 5) ;
- « Le prix » ou « Un assistant gratuit me suffit » en tête des freins (question 4) : signal pour Q2 et pour le risque critique du cadrage § 12 ;
- proposition : dépenses d'acquisition proches de 100 CHF sans prévente venue du canal payé : proposer à Samuel d'arrêter le test (le plafond de 100 CHF vient du cadrage § 11 ; la règle d'arrêt est une proposition).

## Qui remplit
- Mesures de la page et du questionnaire : lecture des compteurs de l'application (tâche `frontend` ou `backend` ultérieure).
- Préventes, remboursements, dépenses : chiffres fournis par Samuel (comptes externes, réservés à Samuel).
- Report hebdomadaire : le rôle `commercial`, dans une PR de documentation de `docs/commercial/suivi.md`.
