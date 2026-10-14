# État du studio — 2026-10-14 (59e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle.

## Messages de Samuel traités (projet)
- 2026-10-14, 10:25 CEST, fil du projet : « lance direct un cycle oui ». Ce 59e cycle est lancé à sa demande, avant la routine de 11:07 CEST.
- #studio : aucun nouveau message.

## Fait
- Fusionnées depuis le 58e cycle : statut du 58e cycle (#296), **décision 0052** réduite à l'écriture des positions (#283), **spec B7** (#288), **décision 0054** (découpage de B7, #298, corrigée par le CEO), **amendement 1 de 0053** (économies des essais, #290, après deux corrections).
- **Décision 0055** (#294, préalables de P0r3) : correction 2, la dernière, poussée. P0r3c porte la migration de remplacement de 0052 ; le rôle ia-recherche propose les plafonds de l'essai d'intégration au PO (Q405, Q406).
- **Décision 0056** (#300, workflow des migrations et déverrouillage) : correction 1 poussée. Toute charge de Samuel attend sa réponse écrite ; un workflow de reverrouillage d'urgence est lancé par le studio sans nouvelle PR.
- **Spec B8** (#301, ancrage Google des lieux) : écrite ; découpage proposé en B8a, B8b et B8c.

## En cours
- Fil actif : spec B8, correction 1 (#301, product owner).
- En revue : 0055 (#294, dernière correction), 0056 (#300), B3a (#295, approuvée par le Tech Lead et la Sécurité).

## Bloqué
- **B3a** (#295) : `owner-approved` de Samuel (`ci.yml`) ; tout le reste est vert.
- **Premier essai réel (P0r3)** : fusion de 0055, puis P0r3a à P0r3d ; Q330 (unité du quota Routes) ; sur la base réelle, la fusion de 0056 et Q408.
- **Code de B7** : P0r3 fusionnée (décision 0054).
- **B8** : fusion de la spec (#301), décision de découpage du CEO, puis B7a et B7c.
- **B3c** : Q401 (variables du limiteur dans Vercel).
- **Code de B4** : Q351, Q352, Q364 ; B4a après B3b.

## Prochain cycle
1. Après la fusion de 0055 : ticket P0r3a (fusion automatique limitée à `main`, `owner-approved`). Si 0055 reste bloquée après sa dernière correction : troisième tentative ou découpage avec le Tech Lead.
2. Après la fusion de B3a : P0r3b, puis P0r3c et P0r3d, avant B3b.
3. Après la fusion de la spec B8 : décision de découpage de B8 (CEO).
4. Corrections de 0056 (#300) si la revue en demande.

## Décisions attendues de Samuel
- **Maintenant** : `owner-approved` sur B3a (#295) ; Q330 (unité du quota Routes dans la console Google).
- **Nouvelles** : Q407 (fiches de remplacement, 0055), Q408 (approbation de chaque lot de migrations), Q409 (compte GitHub distinct pour les agents), Q410 (commande console de dernier recours).
- **Déjà posées** : Q401, Q402, Q397, Q394, Q387, Q378, Q367, Q368, Q263, Q353, Q354, Q345, Q332, Q323, Q325, Q317, Q296, Q297, Q288, P0c-Q2.
- **Prévente** : Q357 et Q362 ; les documents sont fusionnés (#256).
- **Pour confirmation** : **Q285**. Recommandation : laisser la production telle quelle jusqu'à la mise en public ; aucun réglage Vercel à faire.
- **Toujours ouvertes** :
  - juridique : Q5 (validation formelle), Q6, Q29, Q34, Q38, Q44, Q46, Q47, Q75, Q127, Q150 ;
  - argent et comptes : Q25, Q26, Q39, Q45, Q56, Q84 ;
  - offre : Q57, Q63, Q67, Q76, Q78, Q88 à Q90, Q128, Q133, Q135, Q149 ;
  - documents et environnement : Q12, Q59, Q40, Q101 ;
  - Ligne : Q19 (avec Q226), Q37, Q108, Q130 ;
  - règles : Q23, Q274.
- **Veto possible** :
  - avant le 2026-10-15 : décisions B3-PO de la spec B3 (#243) et B4-PO de la spec B4 (#248) ; décisions B5-PO-1 à 16 de la spec B5 (#229) ; décisions B2-PO de la spec B2 (#198) ;
  - avant le 2026-10-16 : décision 0047 (découpage de `fr.json`, #269) ; décisions B7-PO de la spec B7 (#288) ;
  - 2 jours après leur publication dans la note de version : 0011 (sauf S4 et S5), 0031, 0032 et ses amendements (#211, 0045), 0037, 0040, 0046, 0048, 0049, 0050, 0051, 0054, décisions B1-PO-1 à 6 (#185).

## Questions ajoutées
- Q405 (CEO, tranchée), Q406 (PO), Q407 (Samuel) : décision 0055.
- Q408, Q409, Q410 (Samuel), Q411 (Tech Lead), Q412 (CEO, tranchée) : décision 0056.
- Mises à jour : Q404 (tranchée, #290 fusionnée), Q379 (fondue dans Q402), Q389.

## Part d'usage estimée
- 59e cycle (comptés depuis le 58e) : 5 sous-agents terminés, 3 au plus en même temps :
  - terminés après le statut du 58e cycle : spec B8 (0,3 M), 0053 correction 1 (0,1 M) ;
  - 0055 correction 2 (0,17 M), 0053 correction 2 (0,11 M), 0056 correction 1 (0,17 M) ;
  - spec B8 correction 1 en cours (comptée au prochain cycle).
