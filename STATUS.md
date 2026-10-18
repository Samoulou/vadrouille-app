# État du studio — 2026-10-18 (95e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (cycle 11 sur 20) · Tableau de bord produit : https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v (republié à chaque fin de cycle).

## Messages de Samuel traités (projet)
- Aucun nouveau message de Samuel depuis le 94e cycle (fil du cycle et #studio).

## Fait
- Fusionnées : statut du 94e cycle (#468), **décision 0086** (#470, 2026-10-18 00:23 UTC : B6-TL-1 à B6-TL-11, préalables de B6a ; délai de veto jusqu'à 06:23 UTC). Ticket #466 à fermer.
- Ticket **#471 B6a** ouvert (backend), selon 0086.
- **`coords-purge`** : le deuxième run planifié (2026-10-17 23:08 UTC) échoue comme le premier, faute d'environnement et de secrets (variables de connexion vides) ; attendu tant que Q438 n'est pas répondue (Q486).

## En cours
- backend : **B6a** (#471 : lecture serveur et adaptateur `api`), branche `claude/471-b6a-lecture` ; `needs-review` posé seulement après la fin du veto de 0086 (Q485).
- data : réponses de 0086 § 5 (points 3, 4 et 6) en commentaire sur #471.
- product-owner : **correction 1** de #469 (amendement 1 de B8 : critère du départ des trajets d'un quartier en deux variantes, coût des fiches, période qui couvre deux minuits).

## Bloqué
- **Fusion de B6a** : veto de 0086 (06:23 UTC), verdicts Sécurité 0086 § 4 points 1 à 3, réponses data (Q488). **B4a** et **B8b** : après B6a (B4a jamais dans le même cycle, 0078).
- **B3b-envoi, suite** (#435) : P5 de la Sécurité pour `SMTP_URL`.
- **B9** : B9b après B6a et Q482 ; B9c : #469 puis la petite PR de B8-PO-13 et B8-PO-15 (Q487) ; B9c réel : Q468 ; B9e : Q465, Q467.
- **Purge du MVP** : activation Q438 (Samuel).
- **Migrations 0008 à 0010 sur la vraie base** : `owner-approved` de Samuel sur #460 (demandé le 2026-10-18 00:20 UTC), puis `roles.sql` rejoué et `count(*) = 0` sur `usage_ledger` avant le lot (Q479).

## Prochain cycle
1. Après 06:23 UTC : `needs-review` sur la PR de B6a, réponses data reportées dans sa description.
2. Suivre #469 (revue de la correction 1), puis petite PR ia-recherche de B8-PO-13 et B8-PO-15 après la fin de son veto.
3. Suivre #460 (`owner-approved`), puis envoyer à Samuel les étapes exactes du lot de migrations.
4. Tickets à placer : police servie localement (Q484), mineurs de B8a (validation de la clé serveur, `jourDeLaSemaine` dupliqué, isolement de P0 par types), page de jugement de P0r4, refus de lancement si la purge a plus de 24 h, appels Google dans le rapport d'essai, adaptateur Resend, message « accès expiré », mineurs de B8c et erratum de 0060 (Q477), purge de rétention de `verifications.identifier`, PR de décision sur 0007. Carte à Samuel : Q39/Q465.

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
- Q487 et Q488 ; Q486 complétée.

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
