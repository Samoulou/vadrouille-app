# État du studio — 2026-10-17 (89e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (cycle 5 sur 20).

## Messages de Samuel traités (projet)
- Fil du cycle, 08:24 à 09:18 UTC : release #422 fusionnée par Samuel (carte et temps de trajet sur `p0-reel`, déploiement prêt, testée : « ça marche bien ») ; « Mes voyages » vide = cookie d'accès de 12 h expiré (aucune purge) ; **idée de Samuel ajoutée au plan de la vraie app** (Q472) ; **Q354 tranchée : 100 e-mails de connexion par jour** ; **« Plan actuel »** : les trois fils restent sur le branchement de la vraie génération (pas de fil réservé au front) ; objectif des 20 cycles rappelé et validé (« Top »).
- #studio : aucun nouveau message depuis le 88e cycle.

## Fait
- Fusionnées : release #422 (par Samuel), **F8c** (#432), statut du 88e cycle (#436), **décision 0081** (#434, B9-TL-1 à B9-TL-14, après une 3e tentative bornée du CEO ; veto de Samuel jusqu'au 2026-10-17 15:48 UTC), **B3b-envoi, première partie** (#437 : `nodemailer` en lignes exactes, contrôle de l'enveloppe en liste blanche, Mailpit ; « Refs #435 », la suite reste à faire).
- Écart du CEO : le ticket #435 a lancé B3b-envoi au lieu de la sous-tâche B3b de B3 (Better Auth) ; rattrapé : la sous-tâche B3b part au prochain cycle.

## En cours
- data : **B8c** (#442, ticket #438) : port du cache de positions, migration 0008 (29 jours), rôle et workflow `coords-purge.yml` ; en revue ; demande `owner-approved` de Samuel (0035) après la revue.
- product-owner : **amendement 1 de la spec B9** (#441, ticket #439 : B9-PO-17 reprise d'un voyage complet échoué, B9-PO-18 fuseaux) ; en revue.

## Bloqué
- **B3c**, **B6a**, **B4a** : sous-tâche B3b (Better Auth). **B3b-envoi, suite** (#435) : sous-tâche B3b et P5 de la Sécurité pour `SMTP_URL`.
- **B7c** et **PR de moteur (B9-TL-13)** : fin du veto de 0081 (15:48 UTC). **B8a** : B7c. **B8b** : B8a et B8c.
- **B9** : B9b après sa PR de contrat et l'amendement #441 ; B9e : Q465, Q467 ; B9c réel : Q468.

## Prochain cycle
1. Ouvrir la sous-tâche **B3b de B3** (Better Auth, backend) ; jamais dans le même cycle que B8c (#442 doit être fusionnée avant).
2. Après 15:48 UTC : tickets B7c et PR de moteur (B9-TL-13), puis B9b.
3. Suivre #442 et #441 ; tickets : page de jugement de P0r4, refus de lancement si la purge a plus de 24 h, appels Google dans le rapport d'essai, adaptateur Resend, message « accès expiré » dans « Mes voyages ». Carte à Samuel : Q39/Q465.

## Décisions attendues de Samuel
- **Réponses demandées** : aucune pour l'instant (Q325, Q456 et Q457 closes).
- **Rappel** : Q438 (extension de Q321 et Q322 à la purge du MVP, avec les actions à 18 h ajoutées par la correction 1 de 0060).
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
- Q472 à Q475.

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
