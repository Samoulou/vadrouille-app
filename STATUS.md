# État du studio — 2026-10-17 (87e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (cycle 3 sur 20).

## Messages de Samuel traités (projet)
- Aucun nouveau message depuis le 86e cycle (fil du cycle ni #studio).

## Fait
- Fusionnées : statut du 86e cycle (#427), **décision 0080** (#428, amendement de 0077 pour B7a ; définitive à 06:21 UTC).
- **B7a (#424)** : correction 1 approuvée (Tech Lead et Sécurité, `techlead-approved`, head `dab3259`). Fusion automatique suspendue par le CEO jusqu'à la fin du veto de 0080 (2026-10-17 06:21 UTC), puis réactivée.
- Spécification B9 (#429) écrite : découpage B9a à B9e ; CEO : ordre accepté, F8c ouverte (Q469).

## En cours
- product-owner : spécification B9 (#429), correction 1 (comptée) : 6 bloquants du Tech Lead.
- frontend : **F8c** (#430), lancement de la génération et écran 5, sur l'adaptateur simulé.
- En attente de Samuel : release `main` → `p0-reel` (#422, carte et temps de trajet) après son accord écrit sur #419.

## Bloqué
- **B3b, B8c, B7c** : après la fusion de B7a (fichiers communs ; B3b et B8c jamais dans le même cycle). **B4a** : B3b, Q352, Sécurité sur B4-TL-3 et B4-TL-6. **B6a** : B3b. **B8a** : B7a, B7c. **B3c** : B3b.
- **B9** : spec en correction ; B9e : Q465 (plafonds), Q467 ; B9c réel : Q468.

## Prochain cycle
1. Réactiver la fusion automatique de B7a après 06:21 UTC ; puis ouvrir B7c et B3b (ou B8c), un seul des deux derniers par cycle.
2. Suivre la correction de B9 et F8c.
3. Tickets : page de jugement de P0r4 et son e2e ; refus de lancement si la purge a plus de 24 h ; nombre d'appels Google dans le rapport d'essai ; adaptateur Resend. Cartes à Samuel : Q354, puis Q39/Q465.

## Décisions attendues de Samuel
- **Réponses demandées** : aucune pour l'instant (Q325, Q456 et Q457 closes).
- **Rappel** : Q438 (extension de Q321 et Q322 à la purge du MVP, avec les actions à 18 h ajoutées par la correction 1 de 0060).
- **Rappel aussi** : Q420 (coller les étapes 7, 7 bis et 8 dans la routine R1, #307).
- **Déjà posées** : Q410, Q401, Q397, Q394, Q378, Q263, Q353, Q354, Q345, Q332, Q323, Q317, Q296, Q297, Q288, P0c-Q2.
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
- Q465 à Q469.

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
