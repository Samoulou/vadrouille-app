# Offre de prévente — le voyage complet en une page

Rôle : `commercial` · Spécification : `specs/C1-prevente.md` (livrable 1) · Rédigé le 2026-10-13.

Statut : **proposition**. L'offre, le prix, les dates et les conditions sont réservés à Samuel (`docs/CONTEXT.md`, « Qui décide quoi »). Les valeurs entre crochets attendent sa réponse ; les questions sont dans la description de la PR.

## L'offre en une phrase
Précommande aujourd'hui le **voyage complet** Vadrouille pour ton voyage de printemps : **29 CHF**, paiement unique, utilisable dès l'ouverture du produit, remboursé intégralement s'il n'est pas prêt à temps.

## Ce que la personne achète
Le « Voyage complet » du produit en libre-service (cadrage § 4, « Produit en libre-service ») :

| Inclus | Source |
|---|---|
| Toutes les journées du voyage, repas et soirées compris | cadrage § 4 ; écran 9 (`src/i18n/fr.json`, `debloquer.offre.inclus`) |
| Les événements datés pendant le séjour | cadrage § 4 ; § 3.4 |
| Des ajustements : jusqu'à [N] remplacements | cadrage § 4 ; valeur de [N] ouverte (Q88) |
| La liste « À réserver » avant de partir | cadrage § 4 ; écran 11 (§ 3.1) |
| Le calendrier et le partage avec ses proches | cadrage § 4 |
| L'accès jusqu'à 30 jours après le retour | cadrage § 4 |

Avant de payer dans le produit, chacun découvre **8 propositions offertes** (cadrage § 3.1, écran 6 ; § 4). Pour la prévente, cette découverte est remplacée par la démonstration sur la page (`demo-avant-apres.md`) : le produit n'est pas encore ouvert.

Ce qui n'est **pas** inclus et ne doit jamais être promis : aucune aide humaine, aucun entretien, aucune vérification humaine du programme (décision 0043 § 4). Aucune réservation n'est faite à la place du voyageur : Vadrouille signale ce qui est « À réserver ».

## Prix
- **29 CHF** par voyage, paiement unique, sans abonnement (Q2, tranchée par Samuel le 2026-10-08, « révisable » ; cadrage § 4 : pas d'abonnement grand public).
- Moyens de paiement visés : TWINT ou carte (cadrage § 3.1, écran 9 ; § 4). Le paiement réel de l'application n'existe pas encore (Q26) : la manière d'encaisser une prévente est la question 2 de la PR.
- Prix de lancement éventuel : **question à Samuel**. Recommandation : garder 29 CHF sans remise, pour que les préventes de G0 mesurent le prix réellement visé ; option alternative dans la fourchette déjà prévue au cadrage (19 CHF, D9 et § 4 « Prix à tester : 19, 29 et 39 CHF »).

## Voyages visés
Voyages de printemps 2027, qui se préparent surtout de janvier à mars (cadrage § 5, « Saisonnalité ») :

| Fenêtre | Date | Source |
|---|---|---|
| Pâques | 28 mars 2027 | cadrage § 5 |
| Ascension | 6 mai 2027 | cadrage § 5 |
| Pentecôte | 16 mai 2027 | cadrage § 5 |

Cible : couples francophones de Suisse romande préparant 5 à 10 jours en Europe (`docs/CONTEXT.md`, « Le produit » ; cadrage § 1).

## Destinations mises en avant
D3 n'est pas tranchée : « toutes possibles techniquement ; communication et mesure concentrées sur 2–3 destinations choisies selon la demande », échéance G0 (cadrage § 1, D3).

Proposition (à confirmer par Samuel) :
- **Édimbourg** comme exemple principal : c'est le voyage de référence du benchmark (cadrage § 2), du prototype (`docs/roadmap.md`, G0) et des données de démonstration (`specs/D1-demo.md`).
- La page dit « villes et régions d'Europe » sans liste fermée, et la question 3 du questionnaire (`questionnaire.md`) mesure les destinations demandées pour choisir les 2 ou 3 suivantes (D3).

## Date d'utilisation et livraison
- Le voyage complet acheté en prévente est utilisable **à partir du [DATE D'OUVERTURE]**. Aucune date n'existe dans le dépôt : la phase 1 n'a pas d'échéance (`docs/roadmap.md` ; cadrage § 7).
- Les préventes sont « livrées pendant la bêta » (cadrage § 4, « Pilote assisté », dernier paragraphe, toujours valable pour la prévente).
- Recommandation (question 5) : fixer une date d'ouverture qui laisse au moins quelques semaines avant Pâques, puisque ces voyages se préparent de janvier à mars (cadrage § 5), et l'afficher sur la page.

## Remboursement si le produit n'est pas prêt
Proposition de règle (question 5, relecture juridique éventuelle) :
- si le voyage complet n'est pas utilisable au [DATE D'OUVERTURE], remboursement intégral des 29 CHF, sans démarche autre qu'un clic ou une réponse au reçu ;
- remboursement possible sur simple demande jusqu'à l'ouverture.

Le coût des remboursements est couvert par la réserve du budget (cadrage § 11 : « Réserve : frais de paiement, remboursements, juridique léger, imprévus », 350 CHF).

## Ce que la prévente doit prouver (G0)
Volet commercial de G0 (décision 0044 ; `docs/roadmap.md`) : 300 visites de la page de prévente, 10 réponses au questionnaire en ligne, au moins 5 achats ou préventes payés dont au moins 3 hors cercle proche. Suivi : `suivi.md`.

Si l'offre ne se vend pas : « modifier cible, promesse ou prix avant d'ajouter des fonctionnalités » (cadrage § 5).
