# État du studio — 2026-10-18 (97e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle ; ce cycle lancé à la demande de Samuel (08:04 UTC) · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (cycle 13 sur 20) · Tableau de bord produit : https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v (republié à chaque fin de cycle).

## Messages de Samuel traités (projet)
- 06:33 UTC : `owner-approved` posé sur #460, fusionnée.
- 07:29 UTC : `roles.sql` rejoué, `count(*) = 0`, `db-migrate` lancé ; succès vérifié par le CEO (Q479 close).
- 07:33 UTC : plafonds de coût, « Ma reco » (Q39, Q45, Q465).
- 08:04 UTC : « lance un cycle » (ce cycle).
- 08:05 UTC : `pnpm p0` en mode simulé autorisé pour le studio (Q491).

## Fait
- Fusionnées : statut du 96e cycle (#475), **liste d'approbation des migrations 0008 à 0010** (#460) ; **migrations 0008 à 0010 appliquées à la vraie base** par Samuel.
- Revues reçues : B6a (#473) et décision 0087 (#476), changements demandés (tentative 1 comptée chacune) ; Sécurité **approuvée** sur B6a (0086 § 4 points 1 à 3).

## En cours
- backend : **correction 1 de B6a** (#473 : validation de la sortie de `getDay`, erreurs de base fermées, `pnpm p0` simulé).
- tech-lead : **correction 1 de 0087** (#476 : fiches des villes, commande de reprise du studio).

## Bloqué
- **B4a** et **B8b** : après B6a (B4a jamais dans le même cycle, 0078).
- **B3b-envoi, suite** (#435) : P5 de la Sécurité pour `SMTP_URL`.
- **B9** : B9b après B6a, 0087 et les noms de colonnes (data, Q492) ; B9c : 0087, puis la petite PR ia-recherche de B8-PO-13, B8-PO-15 et du remplacement de `ancrerLogement` (veto de #469 fini à 09:35 UTC) ; B9c réel : Q468 ; B9e : Q467.
- **Purge du MVP** : activation Q438 (Samuel).

## Prochain cycle
1. Relancer la revue de B6a et de 0087 après leurs corrections.
2. Après la fusion de 0087 : ticket de la petite PR ia-recherche (B8-PO-13, B8-PO-15, remplacement de `ancrerLogement`) et PR de contrat de B9d.
3. Après la fusion de B6a : B9b (backend), puis B4a dans un autre cycle.
4. Tickets à placer : police servie localement (Q484), mineurs de B8a, page de jugement de P0r4, refus de lancement si la purge a plus de 24 h, appels Google dans le rapport d'essai, adaptateur Resend, message « accès expiré », mineurs de B8c et erratum de 0060 (Q477), purge de rétention de `verifications.identifier`, PR de décision sur 0007.

## Décisions attendues de Samuel
- **Réponses demandées** : aucune pour l'instant (Q39, Q45, Q465 et Q491 répondues le 2026-10-18).
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
- Q491 et Q492 ; Q39, Q45, Q465, Q479 et Q490 mises à jour.

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
