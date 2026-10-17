# État du studio — 2026-10-17 (93e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (cycle 9 sur 20) · Tableau de bord produit : https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v (republié à chaque fin de cycle).

## Messages de Samuel traités (projet)
- Fil du cycle, 20:02 UTC : « Alors? » ; point donné (test `db` de #452 rouge, puis vert après relance : panne passagère de Google Fonts au build).
- Fil du cycle, 20:38 UTC : « Fait » ; `owner-approved` reposé sur #452 (la porte demandait une nouvelle pose après le changement de head) ; `gate` vert, #452 fusionnée.
- #studio : aucun nouveau message depuis le 92e cycle.

## Fait
- Fusionnées : statut du 92e cycle (#461), décision **0085** (#459, préalables de B8a ; correction 1), **B3c de B3** (#452 : adaptateur `better-auth` et branchement). Tickets #447 et #457 à fermer.

## En cours
- ia-recherche : **B8a** (ticket #462 : ancrage, fiches et trajets en mémoire), branche `claude/462-b8a-ancrage`. Seule tâche de code du cycle (0060 : jamais avec B6a ni une PR qui touche `eslint.config.mjs` ou les tests de confinement). Fusion après la fin du veto de 0085 (6 h après sa fusion, 0068) ou la réponse de Samuel, et le verdict Sécurité sur 0085 § 2.
- data : **migrations 0008 à 0010 dans `MIGRATIONS_APPROUVEES`** (#460) : correction 1 (description, verdict Sécurité G1 à G6 accordé) en revue ; `owner-approved` de Samuel ensuite.

## Bloqué
- **B6a** : pas dans le même cycle que B8a (0060) ; ticket au 94e cycle. **B4a** : après B6a, jamais dans le même cycle (0078).
- **B3b-envoi, suite** (#435) : P5 de la Sécurité pour `SMTP_URL`. **B8b** : B8a, B6a.
- **B9** : B9b après B6a et la forme de la reprise (Q482) ; B9c : B8a ; B9c réel : Q468 ; B9e : Q465, Q467.
- **Activation de la purge du MVP** (`coords-purge`) : Q438 (Samuel).
- **Migrations 0008 à 0010 sur la vraie base** : #460, puis `roles.sql` rejoué par Samuel avant le lot (Q479).

## Prochain cycle
1. Ticket de **B6a** (backend) si B8a est fusionnée ou si son fil est terminé ; sinon tâches documentaires.
2. Suivre B8a (#462) et #460 (`owner-approved`, puis étapes exactes à Samuel pour le lot de migrations).
3. Tickets à placer : police servie localement au lieu de `next/font/google` (panne du job `db`, Sécurité pour l'exception de `src/app/fonts.ts`, Q484), page de jugement de P0r4, refus de lancement si la purge a plus de 24 h, appels Google dans le rapport d'essai, adaptateur Resend, message « accès expiré », mineurs de B8c et erratum de 0060 (Q477), purge de rétention de `verifications.identifier`, note de version listant 0082 à 0085. Carte à Samuel : Q39/Q465.

## Décisions attendues de Samuel
- **Réponses demandées** : aucune pour l'instant (Q325, Q456 et Q457 closes).
- **Rappel** : Q438 (extension de Q321 et Q322 à la purge du MVP, avec les actions à 18 h ajoutées par la correction 1 de 0060) ; B8c est fusionnée, la purge attend cette réponse pour être activée.
- **Rappel aussi** : Q420 (coller les étapes 7, 7 bis et 8 dans la routine R1, #307).
- **Déjà posées** : Q410, Q401, Q397, Q394, Q378, Q263, Q353, Q345, Q332, Q323, Q317, Q296, Q297, Q288, P0c-Q2.
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
- Q484.

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
