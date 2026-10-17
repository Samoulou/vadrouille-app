# État du studio — 2026-10-17 (86e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (cycle 2 sur 20).

## Messages de Samuel traités (projet)
- Fil du cycle, 2026-10-16 : 21:11 UTC rapport de l'essai 7 ; 21:14 à 21:27 UTC questions sur le coût (OpenRouter 0,17 USD pour l'essai 7) et les requêtes Google (console : environ 90 requêtes Places et 6 Routes par essai, dans la gratuité mensuelle), confirmation que lui seul lance les essais payants, test de la carte prévu le 2026-10-17. Aucun message dans #studio depuis le 85e cycle.

## Fait
- **Essai 7 réussi** (exécution comptée, edimbourg-1, variante B avec notation DeepSeek, commit `37e735e`) : programme écrit, A1 à A8 oui, A9 non relevé. Les deux variantes fonctionnent.
- Fusionnées : 0078 (#418, découpage de B4 en B4a, B4b, B4c ; Q351), **P0r4 (#419, décision 0079 : carte Google et temps de trajet des voyages réels)**, 0077 (#420, préalables de B7a, B8c et B3b, troisième tentative bornée), statut du 85e cycle (#417).
- Release `main` → `p0-reel` ouverte (#422) : à fusionner par Samuel après son accord écrit sur #419 (exigence 4) et la fin du veto de 0079 (2026-10-17 04:28 UTC). Les variables de la carte existent déjà sur Vercel (noms vérifiés).

## En cours
- ia-recherche : **B7a (#424, ticket #423)**, couche IA de production ; correction 1 (comptée) en cours : 3 bloquants (filtre des requêtes web fermé par défaut, règle de lint sur les chargements non littéraux, description). Pas de fusion avant 2026-10-17 04:40 UTC (veto de 0077).
- tech-lead : amendement de 0077 pour B7a (ticket #425, Q464), à fusionner avant B7a.
- product-owner : spécification B9 (ticket #426), création et vraie génération dans l'app.

## Bloqué
- **B3b, B8c** : fichiers communs avec B7a (`eslint.config.mjs`, `tests/unit/lint/**`) : après B7a, jamais dans le même cycle. **B7b, B7c** : B7a. **B4a** : B3b, Q352 (B4-TL-1 à 13), Sécurité sur B4-TL-3 et B4-TL-6. **B6a** : B3b. **B8a** : B7a, B7c. **B3c** : B3b (Q401 : Samuel posera les variables).
- **B9 réel** : Q39 et Q45 (plafonds, Samuel ; recommandation 3 USD par génération), Q135.

## Prochain cycle
1. Suivre B7a et l'amendement de 0077 jusqu'à la fusion ; puis ouvrir B3b ou B8c (un seul par cycle) et B7c.
2. Tickets à ouvrir : page de jugement de P0r4 (meilleur des deux, bilan) et son e2e sans barrière ; refus de lancement de P0r3 si la dernière purge a plus de 24 h (0046 D16 point 8) ; nombre d'appels Google dans le rapport d'essai (promis à Samuel) ; adaptateur Resend (revue Sécurité et données personnelles).
3. Écrire à Samuel les cartes Q354 (plafond d'e-mails) et Q39 (3 USD par génération, recommandé), une à la fois. Correctif CEO de 0059 (#304 et #299 dits ouverts à tort) et mineurs de 0078 et 0079.

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
- Q464.

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
