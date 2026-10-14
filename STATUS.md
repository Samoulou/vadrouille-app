# État du studio — 2026-10-14 (60e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle.

## Messages de Samuel traités (projet)
- 2026-10-14, 11:06 CEST : `owner-approved` sur B3a (#295), fusionnée.
- #studio et fil du projet : aucun nouveau message depuis le 59e cycle.

## Fait
- Fusionnées depuis le 59e cycle : statut du 59e cycle (#302), **décision 0055** (préalables de P0r3, #294), **B3a** (environnement du serveur et limiteur, #295).
- **P0r3a** (#305, ticket #303) : fusion automatique limitée à `main`, codée par le rôle Release (désigné pour Q268, Q414).
- **Décision 0056** (#300) : correction 2, la dernière, poussée (environnement `db-releve` distinct, texte de reverrouillage figé, lots 1 et 2 ; Q413).
- **Spec B8** (#301) : correction 1 poussée.
- **Spec B6** (#308, ticket #304) : écrite ; découpage proposé en B6a et B6b (Q415).

## En cours
- Aucun fil actif.
- En revue : P0r3a (#305, puis `owner-approved` de Samuel), 0056 (#300, dernière correction), spec B8 (#301), spec B6 (#308).

## Bloqué
- **P0r3b** (garde et accès) : fusion de P0r3a.
- **P0r3c** : P0r3b, et fin du délai de veto de Samuel sur 0055 (2026-10-16) ou sa réponse à Q407.
- **Premier essai réel** : P0r3a à P0r3d ; Q330 (unité du quota Routes) ; sur la base réelle, la fusion de 0056 et Q408.
- **Code de B7** : P0r3 fusionnée. **B8** : fusion de la spec, décision de découpage, puis B7a et B7c. **B6a** : B3b.
- **B3c** : Q401 (variables du limiteur dans Vercel).
- **Code de B4** : Q351, Q352, Q364 ; B4a après B3b.

## Prochain cycle
1. Après la fusion de P0r3a : ticket P0r3b (après B3a, fusionnée).
2. Après la fusion des specs B8 et B6 : décisions de découpage du CEO (Q415, Q416).
3. Si 0056 reste bloquée après sa dernière correction : troisième tentative ou découpage avec le Tech Lead.
4. Ticket B3b (comptes et organisations) : P0r3b à P0r3d passent avant B3b (0055, section 9).

## Décisions attendues de Samuel
- **Maintenant** : `owner-approved` sur P0r3a (#305) quand la revue est au vert ; Q330 (unité du quota Routes dans la console Google).
- **Nouvelles** : Q417 (préversion qui lit la base avant G0 ; reco : non).
- **Déjà posées** : Q407, Q408, Q409, Q410, Q401, Q402, Q397, Q394, Q387, Q378, Q367, Q368, Q263, Q353, Q354, Q345, Q332, Q323, Q325, Q317, Q296, Q297, Q288, P0c-Q2.
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
  - avant le 2026-10-16 : décision 0047 (découpage de `fr.json`, #269) ; décisions B7-PO de la spec B7 (#288) ; décision 0055 (#294, dont l'amendement de 0011 § 2 pour `p0Run` et Q407) ;
  - 2 jours après leur publication dans la note de version : 0011 (sauf S4 et S5), 0031, 0032 et ses amendements (#211, 0045), 0037, 0040, 0046, 0048, 0049, 0050, 0051, 0054, décisions B1-PO-1 à 6 (#185).

## Questions ajoutées
- Q413 (CEO, tranchée) : décision 0056.
- Q414 (CEO, tranchée) : P0r3a.
- Q415 (CEO), Q417 (Samuel) : spec B6.
- Q416 (CEO) : spec B8.

## Part d'usage estimée
- 60e cycle (comptés depuis le 59e) : 4 sous-agents terminés, 3 au plus en même temps :
  - spec B8 correction 1 (0,13 M) ; P0r3a (0,11 M) ; 0056 correction 2 (0,17 M) ; spec B6 (0,34 M).
