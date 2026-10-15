# État du studio — 2026-10-15 (80e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle.

## Messages de Samuel traités (projet)
- Aucun nouveau message depuis le 79e cycle (fil du cycle et #studio).

## Fait
- Fusionnés depuis le 79e cycle : #383 (A5, P0r4 après l'essai d'intégration ; correction 1, Tech Lead et Sécurité approuvés, la Sécurité confirme la précision de la l. 204), #385 (état du 79e cycle).
- Demandé à Samuel dans le fil du cycle (18:30 UTC) : écrire sur #374 la levée du délai (Q455) et sur #383 la confirmation de l'amendement du verrou (Q459).

## En cours
- Aucun agent. data : A17, #381 en brouillon, attend les tests de `tests/db/` posés par Samuel (Q457).

## Bloqué
- **Premier essai réel** (lancé par Samuel seul) : levée écrite sur #374 (Q455), relevé S7 dans la console Neon (Q456), tests de `tests/db/` (Q457), confirmation du verrou sur #383 (Q459, sinon l'essai attend P0r4), revue de #381 puis `owner-approved`, application (A18) et relevé (A19) ; limites de dépense (Q325) ; accord écrit de Samuel (0055).
- **B8c** : Q445. **B6a** : B3b. **B8a** : B7a, B7c. **B3c** : Q401. **Code de B4** : Q351, Q352, Q364.

## Prochain cycle
1. Seulement le chemin de l'essai réel.
2. Dès les gestes de Samuel : condition 4 sur #374, S7 consigné, #381 en revue.
3. Avant A18 : `p0-purge` réussi depuis moins de 12 heures (dernier : 17:01 UTC).
4. Ticket P0r4 à ouvrir avant P0a2 ; mineurs 12 et 13 de #384 dans un chore.

## Décisions attendues de Samuel
- **Réponses demandées** : Q455 (écrire sur #374 la levée choisie sur la carte), Q459 (confirmer sur #383 l'amendement du verrou), Q456 (relevé S7 dans la console Neon), Q457 (tests de `tests/db/` pour #381). Bientôt : Q325 (limites de dépense).
- **Rappel** : Q438 (extension de Q321 et Q322 à la purge du MVP, avec les actions à 18 h ajoutées par la correction 1 de 0060).
- **Rappel aussi** : Q420 (coller les étapes 7, 7 bis et 8 dans la routine R1, #307).
- **Déjà posées** : Q410, Q401, Q397, Q394, Q378, Q263, Q353, Q354, Q345, Q332, Q323, Q325, Q317, Q296, Q297, Q288, P0c-Q2.
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
  - 2 jours après leur publication dans la note de version : 0011 (sauf S4 et S5), 0031, 0032 et ses amendements (#211, 0045), 0037, 0040, 0046, 0048, 0049, 0050, 0051, 0054, 0057, 0058, décisions B1-PO-1 à 6 (#185).

## Questions ajoutées
- Q459.

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
