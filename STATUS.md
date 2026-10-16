# État du studio — 2026-10-16 (85e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle.

## Messages de Samuel traités (projet)
- Fil du cycle, 2026-10-16 : 09:20 à 20:57 UTC, rapports des essais réels 2 à 6 et choix associés (fusibles alignés, durée Vercel portée à 800 s, notation B par DeepSeek, carte et trajets) ; 21:02 UTC « On reprend » (reprise des cycles, priorité : brancher la vraie génération sur le parcours de l'app) et demande d'une feuille de route de 20 cycles ; 21:05 UTC Resend pour les e-mails (Q25), réglages Vercel posés par lui (Q401), question sur le coût par génération (Q39).

## Fait
- Cycles en pause de 11:17 à 21:02 UTC à la demande de Samuel, qui a piloté lui-même ses essais.
- Essais réels : essai 3 (edimbourg-court, B) puis **essai 6 (edimbourg-1, A) réussis** : programme de 6 jours écrit, A1 à A8 oui, lisible dans « Mes voyages » (#406, décision 0074).
- Correctifs fusionnés et publiés sur `p0-reel` : #392, #394, #401, #404 (0073), #409 (0075, fin propre de la recherche, 800 s), #412 (0076, notation B par DeepSeek) ; release vers `p0-reel` #410 et #413 (`37e735e`, déployé).
- Routine du cycle réactivée (21:04 UTC) ; feuille de route des 20 cycles : `/mnt/project-files/plans/roadmap-20-cycles.md`.

## En cours
- backend : P0r4 (#414), carte Google et temps de trajet des voyages réels (choix de Samuel « Oui, les deux »).
- tech-lead : décision 0077 (#415), préalables de B7a, B8c et B3b.
- CEO : décision 0078 (#416), découpage de B4 (Q351).

## Bloqué
- **B7a, B8c, B3b** : décision 0077. **B4a** : 0078, Q352, Q364, B3b. **B6a** : B3b. **B8a** : B7a, B7c. **B3c** : B3b (Q401 : Samuel posera les variables).
- **B9 réel** : Q39 et Q45 (plafonds, Samuel), Q135.

## Prochain cycle
1. Fusionner 0077 et 0078, puis ouvrir B7a (et B8c, B3b selon 0077), au plus 3 fils.
2. Suivre P0r4 jusqu'à sa PR et sa mise à jour de `p0-reel`.
3. Écrire à Samuel les cartes Q354 (plafond d'e-mails) et Q39 (3 USD par génération, recommandé), une à la fois.

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
- Q462, Q463.

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
