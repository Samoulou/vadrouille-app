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

## Ce qu'est une visite (proposition, à confirmer par Samuel, question 7)
Le seuil de 300 en dépend. Proposition : une visite est **un affichage de la page de prévente**, compté côté serveur **sans cookie ni identifiant personnel** ; sont exclus les robots déclarés (agent utilisateur de robot connu) et les visites de Samuel et du studio, faites par un lien de test `?src=interne` non compté. Sans cookie ni identifiant, aucun dédoublonnage par personne n'est possible : un rechargement ou un retour sur la page compte à nouveau. C'est une limite connue, qui surestime le nombre de personnes ; elle est acceptée pour ne collecter aucune donnée personnelle, et le seuil de 300 se lit donc en affichages. Outil et réglage exacts : tâche `frontend` ou `backend` ultérieure, avec l'accord de Samuel s'il engage un compte externe.

### Comment le compteur compte (spécification `specs/C2-prevente-mesure.md`, § 2 ; tâche C2b)
Le compteur de l'application code la proposition ci-dessus telle quelle ; si Samuel la change, une tâche l'aligne. Les points marqués « à confirmer » attendent le Tech Lead ou la Sécurité (questions T2, T3 et S4 de la spécification).

- **La page comptée** est la page d'accueil `/`, quand la précommande est ouverte. `/precommande`, `/precommande/merci` et le questionnaire ne sont pas des visites.
- **Un affichage** est une réponse de la page rendue par le serveur. Un préchargement (du navigateur ou du routeur) ne compte pas.
- **Robots déclarés** : reconnus par leur agent utilisateur, sur une liste tenue dans le code (`src/server/config/robots.ts`, à confirmer, T2). Un agent utilisateur absent ou vide n'est pas compté.
- **Ce qui est gardé** : un nombre par jour (UTC) et par provenance. Aucune ligne par visite : ni heure, ni adresse IP, ni agent utilisateur, ni adresse de page. Aucun pays n'est déduit.
- **Provenance** : `interne` n'écrit rien ; une valeur de la liste ci-dessous est gardée telle quelle ; une valeur de forme valide mais hors liste est comptée sous `autre` ; un `src` absent, répété ou de forme invalide est compté sous `direct`.

### Limites connues du compteur
- Le compte **surestime le nombre de personnes** : sans cookie ni identifiant, un rechargement ou un retour compte à nouveau.
- Le compte **sous-estime quand la base est indisponible** : une visite non écrite est perdue, sans nouvelle tentative. **Sans base, rien n'est compté** : c'est le cas de la production aujourd'hui (spécification C2, § 6.3).
- **Un robot non déclaré**, qui se présente comme un navigateur, est compté. Sans identifiant, aucune parade ; le risque d'un compteur gonflé par des requêtes fabriquées est signalé à la Sécurité (S4, à confirmer).
- **Une requête `HEAD`** (certains outils de vérification de lien) est comptée si son agent utilisateur est celui d'un navigateur : la page ne connaît pas la méthode de la requête. La spécification demande de l'exclure ; le moyen est à fixer par le Tech Lead (T3, à confirmer).
- **Le jour est en UTC** : une visite de 00:30, heure de Suisse, compte la veille. Sans effet sur le cumul ; une semaine du tableau va du lundi au dimanche en jours UTC.

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
| `direct` (sans `src`, ou `src` répété ou de forme invalide) | | | | 0 |
| `autre` (`src` de forme valide, hors de cette liste) | | | | 0 |
| `interne` (tests de Samuel et du studio) | exclu | exclu | exclu | exclu |

`direct` et `autre` sont les deux lignes que le compteur de visites et le questionnaire écrivent en plus de la liste (spécification C2, § 2.2 point 4). Une provenance nouvelle s'ajoute à la liste par une PR (et une migration) ; d'ici là ses visites sont sous `autre`. Pour les préventes, lues dans Stripe, un achat sans `src` reste « indéterminé » (règle ci-dessous).

`src=interne` est le lien de test de Samuel et du studio : ses visites, préventes et réponses sont exclues de tous les comptes (visites, préventes, hors cercle proche, réponses au questionnaire) ; la ligne reste vide.

## Questionnaire (cumul)
- Période de voyage (question 2 du questionnaire) : Pâques · Ascension · Pentecôte · autre printemps · plus tard · pas de date.
- Destinations citées (question 1 du questionnaire) : les 5 plus fréquentes, pour D3 (cadrage § 1).
- Ce qui a décidé et ce qui a retenu (question 4 du questionnaire) : les 3 réponses les plus fréquentes de chaque branche.

## Mesures du produit, quand il sera ouvert
Reprises du cadrage § 13 pour plus tard (hors G0 commercial) : taux de passage de la présentation, taux de « Pas pour moi », conversion de Tes premières propositions en paiement, remboursements et recommandations effectives. Événements déjà prévus : `docs/handovers/frontend.md` § 12.

## Comment compter « hors cercle proche » (proposition, à confirmer par Samuel)
**Proposition, non tranchée (question 7).** La décision 0044 ne définit pas « cercle proche » ; la définition et la règle de compte reviennent à Samuel (phases G0, « Qui décide quoi »). Proposition de définition : les personnes que Samuel connaît personnellement, et celles qui ont reçu le lien directement de lui ou de ses proches.

Règle proposée, sans aucune vérification humaine ni donnée personnelle dans le dépôt. Un achat n'est compté **hors cercle proche** que si sa provenance est connue et n'est pas proche ; dans le doute, il est **indéterminé**, jamais hors cercle par défaut :
0. **exclu** : un achat venu du lien de test `src=interne` (Samuel et le studio) n'entre dans aucun compte, ni proche, ni hors cercle, ni indéterminé ;
1. **cercle proche** : achat venu d'un lien `src=proches` ; ou, si le rattachement au paiement est accepté (question 8), réponse « Je connais personnellement la personne qui crée Vadrouille » ou « Par un ami ou une amie » à la question 5 du questionnaire ;
2. **hors cercle proche** : achat venu d'un lien `src` connu et non proche (`forum`, `groupe`, `reddit`, `instagram`, `instagram-pub`, `createur`), sans indice contraire (si le rattachement est accepté : aucune réponse « Je connais personnellement… » ni « Par un ami ou une amie ») ;
3. **indéterminé** : tout le reste, notamment un achat sans `src` (lien direct ou transmis), ou des indices contradictoires. La question 5 du questionnaire étant facultative, une réponse absente ne fait jamais passer un achat hors cercle ;
4. **Limite connue** : un lien `forum`, `groupe`, `reddit`, `instagram` ou `createur` peut être ouvert par un proche de Samuel ; sans rattachement au paiement (question 8), rien ne permet de le savoir. Dans le doute (par exemple un achat qui suit de près un message de Samuel à ses proches), l'achat est classé **indéterminé** ;
5. Samuel peut reclasser un achat indéterminé de son côté (il voit les paiements hors du dépôt) ; seuls les nombres entrent dans ce tableau.

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
