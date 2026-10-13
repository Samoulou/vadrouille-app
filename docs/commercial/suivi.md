# Suivi hebdomadaire du volet commercial de G0

Rôle : `commercial` · Spécification : `specs/C1-prevente.md` (livrable 7) · Rédigé le 2026-10-13.

Reprend le tableau de bord du cadrage § 13 pour la partie commerciale, **sans les lignes de temps humain par dossier** (décision 0043 § 4 : aucune intervention humaine pour les particuliers). Rempli chaque semaine à partir des mesures de la page et du paiement, sans aucune donnée personnelle (ni nom, ni e-mail, ni numéro) : seulement des nombres.

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

| Semaine | Visites (sem.) | Visites (cumul) / 300 | Préventes payées (sem.) | Préventes (cumul) / 5 | dont hors cercle proche (cumul) / 3 | Remboursements (cumul) | Réponses au questionnaire (cumul) / 10 | Dépenses d'acquisition (cumul) / 100 CHF | Note |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| S1 | | | | | | | | | |
| S2 | | | | | | | | | |
| S3 | | | | | | | | | |
| S4 | | | | | | | | | |

Plafond des dépenses d'acquisition : 100 CHF, « Tests d'acquisition et contenus » (cadrage § 11). Le domaine (30 CHF, cadrage § 11) n'entre pas dans cette colonne.

## Provenance (cumul)

Valeur du paramètre `src` du lien (`page-prevente.md`, « Mesure »), recoupée avec la question 5 du questionnaire (`questionnaire.md`).

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
- Période de voyage (question 1) : Pâques · Ascension · Pentecôte · autre printemps · plus tard · pas de date.
- Destinations citées (question 1) : les 5 plus fréquentes, pour D3 (cadrage § 1).
- Ce qui a décidé (question 4) et ce qui a retenu (question 4) : les 3 réponses les plus fréquentes de chaque branche.

## Mesures du produit, quand il sera ouvert
Reprises du cadrage § 13 pour plus tard (hors G0 commercial) : taux de passage de la présentation, taux de « Pas pour moi », conversion de Tes premières propositions en paiement, remboursements et recommandations effectives. Événements déjà prévus : `docs/handovers/frontend.md` § 12.

## Comment compter « hors cercle proche »
Sans aucune vérification humaine ni donnée personnelle dans le dépôt :
1. un achat venu d'un lien `src=proches`, ou dont la réponse à la question 5 est « Je connais personnellement la personne qui crée Vadrouille », compte comme **cercle proche** ;
2. sinon, il compte comme **hors cercle proche** ;
3. Samuel peut corriger le chiffre de son côté (il voit les paiements hors du dépôt) ; seul le nombre corrigé entre dans ce tableau.

## Signaux d'alerte (proposés, à confirmer par Samuel)
Adaptés du cadrage § 12 (« Moins de 3 achats après 30 contacts ») aux mesures en ligne de la décision 0044 :
- moins de 3 préventes payées après 300 visites : revoir cible, promesse ou prix avant d'ajouter des fonctionnalités (cadrage § 5) ;
- « Le prix » ou « Un assistant gratuit me suffit » en tête des freins (question 4) : signal pour Q2 et pour le risque critique du cadrage § 12 ;
- dépenses d'acquisition proches de 100 CHF sans prévente venue du canal payé : arrêter le test (cadrage § 11).

## Qui remplit
- Mesures de la page et du questionnaire : lecture des compteurs de l'application (tâche `frontend` ou `backend` ultérieure).
- Préventes, remboursements, dépenses : chiffres fournis par Samuel (comptes externes, réservés à Samuel).
- Report hebdomadaire : le rôle `commercial`, dans une PR de documentation de `docs/commercial/suivi.md`.
