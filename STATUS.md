# État du studio — 2026-10-17 (90e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (cycle 6 sur 20).

## Messages de Samuel traités (projet)
- Fil du cycle : `owner-approved` posé par Samuel sur #442 (B8c), 11:33 UTC.
- #studio : aucun nouveau message depuis le 89e cycle.

## Fait
- Fusionnées : statut du 89e cycle (#443), **B8c** (#442 : port du cache de positions, migration 0008 à 29 jours, rôle et workflow `coords-purge.yml`, approuvée par le Tech Lead et la Sécurité ; purge pas encore activée, Q438), **amendement 1 de la spec B9** (#441 : reprise d'un voyage complet échoué, au plus 3 reprises ; refus des voyages à plusieurs fuseaux ; deux corrections).
- Q476 13 (c) tranchée par le CEO : la tâche frontend de l'amendement 1 part après la PR de contrat qui fixe la source d'état des bandeaux.

## En cours
- backend : **B3b de B3** (ticket #444 : Better Auth 1.7.7, organisations, `withOrg`, contexte de requête), branche `claude/444-b3b-better-auth`.

## Bloqué
- **B3c**, **B6a**, **B4a** : B3b (#444). **B3b-envoi, suite** (#435) : B3b et P5 de la Sécurité pour `SMTP_URL`.
- **B7c** et **PR de moteur (B9-TL-13)** : fin du veto de 0081 (15:48 UTC) ; B7c ajoute une migration : jamais dans le même cycle qu'une autre PR qui en ajoute (0059 § 4), donc après B3b ou avec une numérotation fixée par le CEO. **B8a** : B7c. **B8b** : B8a.
- **B9** : B9b après sa PR de contrat (Q476 14 (a), (d)) ; B9e : Q465, Q467 ; B9c réel : Q468.
- **Activation de la purge du MVP** (`coords-purge`) : Q438 (Samuel).

## Prochain cycle
1. Suivre B3b (#444) : revue, puis `owner-approved` de Samuel si la PR touche `.github/`.
2. Après 15:48 UTC : ticket PR de moteur (B9-TL-13, `jours` dans `generer`) ; B7c dès que la règle des migrations le permet ; puis B9b et sa PR de contrat.
3. Tickets à placer : page de jugement de P0r4, refus de lancement si la purge a plus de 24 h, appels Google dans le rapport d'essai, adaptateur Resend, message « accès expiré » dans « Mes voyages », mineurs de B8c et erratum de 0060 (Q477). Carte à Samuel : Q39/Q465.

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
- Q476 et Q477.

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
