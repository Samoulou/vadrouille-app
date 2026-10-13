# État du studio — 2026-10-13 (53e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle. Le 53e cycle a été lancé à la demande de Samuel (20:07 CEST) ; le cycle planifié de 20:07 CEST y a été fusionné.

## Messages de Samuel traités (projet)
- Fil du projet, 20:07 CEST : « Cycle suivant go » → 53e cycle lancé.
- Fil du projet, 20:10 CEST : priorité au parcours complet avec IA et Google intégrées → ordre du cycle : fusion de #238, code de #221 (garde-fous de l'IA, préalable de P0r2), puis moteur B5a ; la spec B4 (paiement) passe après.
- #studio : aucun nouveau message depuis le 52e cycle.

## Fait
- Fusionnées : statut du 52e cycle (#258), **#238** (code de #222, environnement de git réduit), **F7b** (#245), **décision 0045** (#257, décisions du Tech Lead pour B5, amende 0032). #238 et #245 attendaient `techlead-approved` depuis leur revue sans bloquant (posé par le Tech Lead une fois `verify` vert et Q340 tranchée).
- **Code de #221** (PR #263) : retrait de l'écart A1 (option b), de A6 et de l'accès de A7 ; 522 tests de confinement au vert ; en revue.
- **Spec B3 (#243)** : troisième tentative, bornée, décidée par le CEO (Q361) et poussée (98ade48) : garde `MIGRATOR` propre à `register()`, enveloppe calculée avant l'envoi, une seule règle pour une variable manquante.
- **Spec B4 (#248)** : correction 2, la dernière, poussée (c3d16bc) : régime de confinement cité, critère « lignes de confinement avec verdict Sécurité », question 6 à la Sécurité.
- **Prévente C1 (#256)** : correction 1 poussée (1468fc7) ; nouvelles questions à Samuel (Q362).
- Tickets ouverts : **B5a (#260)**, B5b (#261), B5c (#262), **F8b (#259)**, avec l'entrée « Créer un voyage » sur l'accueil.

## En cours
- En revue : #263 (code de #221), #243 (spec B3, 3e tentative), #248 (spec B4, correction 2), #256 (C1).
- Fils actifs : F8b (#259), B5a (#260).

## Bloqué
- **Exécutions réelles de P0 (P0r2)** : fusion de #263 ; Q330.
- **B5b, B5c** : fusion de B5a, puis de B5b ; B5c attend aussi B5-TL-5.
- **Code de B3** : fusion de #243 et décision de découpage (Q343) ; B3a jamais dans le même cycle que F8b.
- **Code de B4** : fusion de #248, Q351, Q352, question 6 (Q364) ; B4a après B3b.

## Prochain cycle
1. Corrections éventuelles de #263, #243 (sans quatrième tentative : découpage si la revue bloque encore), #248 (plus de correction : troisième tentative ou découpage avec le Tech Lead), #256, F8b, B5a.
2. Après la fusion de #263 : ticket P0r2 (premiers vrais appels à l'IA et à Google sur préversion protégée).
3. Vérifier à chaque cycle qu'aucune PR approuvée sans bloquant n'attend `techlead-approved` (Q365).

## Décisions attendues de Samuel
- **Prévente** : Q357 (encaissement, domaine, Instagram, conditions, prix ; recommandations dans #256) et Q362 (cercle proche, questionnaire anonyme, voyage offert aux créateurs, seuils d'alerte).
- **Action** : plafond de quota de Maps JavaScript API (Q263).
- **Déjà posées** : Q353, Q354, Q345, Q330, Q332, Q319, Q321, Q322, Q323, Q325, Q317, Q296, Q297, Q294, Q288, P0c-Q2.
- **Pour confirmation** : **Q285**. Recommandation : laisser la production telle quelle jusqu'à la mise en public ; aucun réglage Vercel à faire.
- **Toujours ouvertes** :
  - juridique : Q5 (validation formelle), Q6, Q29, Q34, Q38, Q44, Q46, Q47, Q75, Q127, Q150 ;
  - argent et comptes : Q25, Q26, Q39, Q45, Q56, Q84 ;
  - offre : Q57, Q63, Q67, Q76, Q78, Q88 à Q90, Q128, Q133, Q135, Q149 ;
  - documents et environnement : Q12, Q59, Q40, Q101 ;
  - Ligne : Q19 (avec Q226), Q37, Q108, Q130 ;
  - règles : Q23, Q274.
- **Veto possible** :
  - avant le 2026-10-15 : décisions B3-PO de la spec B3 (#243) et B4-PO de la spec B4 (#248), une fois fusionnées ; décisions B5-PO-1 à 16 de la spec B5 (#229) ; décisions B2-PO de la spec B2 (#198) ;
  - 2 jours après leur publication dans la note de version : 0011 (sauf S4 et S5), 0031, 0032 et ses amendements (#211, 0045), 0037, 0040, décisions B1-PO-1 à 6 (#185) ;
  - avant le 2026-10-14 : décision 0025.

## Questions ajoutées
- Q361 (CEO, Tech Lead) : troisième tentative de la spec B3.
- Q362 (Samuel) : questions nouvelles de la prévente.
- Q363 (Tech Lead, Sécurité) : #263.
- Q364 (Sécurité, Tech Lead) : lignes de confinement de B4.
- Q365 (CEO) : `techlead-approved` non posé quand `verify` tourne pendant la revue.
- Closes : Q333, Q337, Q338 (0045 fusionnée), Q341 (#238 fusionnée).

## Part d'usage estimée
- 53e cycle : 8 sous-agents, 4 au plus en même temps :
  - spec B3, 3e tentative (0,15 M de jetons) ; spec B4, correction 2 (0,19 M) ;
  - décision 0045, correction 1 (0,11 M) ; prévente, correction 1 (0,12 M) ;
  - code de #221 (0,18 M) ; libellés du Tech Lead (0,07 M) ;
  - F8b et B5a en cours (comptés au prochain cycle).
- S'y ajoute le travail du CEO (environ 0,1 M).
- Total : environ 0,9 M de jetons (estimation).
- Part de l'abonnement : impossible à mesurer depuis la routine.
