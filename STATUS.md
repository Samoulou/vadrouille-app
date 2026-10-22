# État du studio — 2026-10-22 (141e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 2 heures (routine « Vadrouille - Cycle (projet) », 7 */2 * * * UTC), au plus 4 fils en parallèle (Samuel, 2026-10-19 21:40 UTC) · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (feuille des 20 cycles terminée au 122e cycle ; on poursuit sa priorité, le parcours de bout en bout) · Tableau de bord produit : https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v (republié à chaque fin de cycle).

## Messages de Samuel traités (projet)
- 2026-10-22 12:52 UTC (fil) : « c'est bon? » : oui, migration 0016 appliquée, rien à faire.
- 12:57 UTC : « après les site web il va falloir qu'on se concentre vraiment sur l'objectif, brancher de bout en bout l'app […] du brief de mon voyage au résultat final » : ticket #687 (spécification du parcours de bout en bout), priorité absolue.
- 13:06 UTC : « vadrouille doit devenir 1 seul app qui part "Créer un voyage" […] tout doit se connecter » : une seule app ; la page `/prototype/executions` et les briefs figés sortent de son parcours ; la chaîne inversée tourne derrière le formulaire.
- 13:07 UTC : « on tourne en rond […] » : le CEO a reconnu l'excès de documents (lot 2a : quatre PR de documents, aucune ligne du code du site web) et proposé d'alléger les règles.
- 13:08 UTC (carte) : « Oui, alléger » : décision 0123 (#688).
- Carte posée à 13:25 UTC, sans réponse : les révisions après « Pas pour moi » comptent-elles dans le fusible de 2 USD (Q601, recommandation : oui) ? Ne bloque que le lot 4.

## Fait
- **Décision 0121** (Tech Lead, lot 2a) fusionnée (#683, `f6e9db8`, 12:32 UTC).
- **Statut du 140e cycle** (#685) fusionné.
- **Spécification du parcours de bout en bout** (#690, `specs/E2E-essai-bout-en-bout.md`) : une seule app sur le site d'essai, écrans servis par l'adaptateur `prototype`, génération par la chaîne inversée. Trous relevés : récit perdu au lancement, création qui lève sur `prototype`, briefs figés (`NOMS_BRIEFS`), écrans 2, 3 et 5 en erreur, pas d'aperçu ni de tri utile (voyage écrit déjà débloqué), déblocage simulé en 404. Cinq lots : 1 propositions, tri, déblocage simulé ; 2 saisie sans erreur ; 3 le formulaire lance `p0Run` (après #694) ; 4 « Pas pour moi » réécrit par l'IA ; 5 « à éviter » transmis à l'IA.
- **Code du lot 2a** (#694, ticket #689) ouvert : prompt `programme` v2, vérification des sites, `Stop.source`, compteurs, A2 sur le `placeId` seul.
- **Lot 2** (#693, ticket #692) ouvert : accueil sans section « Prototype », écrans 1 à 3 sans appel ni bandeau, code d'accès dans le parcours.
- Place disque de la machine de travail libérée (17 Go).

## En cours
- **#694 `[ia]` lot 2a** : en relecture (Sécurité consultée, 14 conditions de 0122 en critères d'acceptation).
- **#693 `[front]` lot 2** : correction 1 (comptée ; 5 bloquants Tech Lead : prérendu de l'écran 1, garde-fous `SANS_EXPORT` et manifeste, limite de 15 jours en double, appel à effet de bord ; Sécurité approuvée, UX/UI approuvée avec réserves).
- **Lot 1** (ticket #691, branche `claude/691-e2e-lot-1`) : en cours de code.
- **#690 `[po]` spécification bout en bout** : correction 1 poussée (`368b5ec`), en relecture.
- **#688 `[ceo]` décision 0123** : correction 1 poussée (`1643958`) ; en relecture.
- **#682 `[secu]` 0122** : correction 2 (dernière ; prémisse périmée après la fusion de 0121).
- **#686 `[po]` amendement 3** : correction 1 en cours (4 bloquants) ; ses points sont déjà des critères d'acceptation de #694 (0123 point 6).
- Toujours en attente : #527 (Q438), #583 (Q538), #500 gelée, #534/#547 (Q518-Q519), #664 et B10c/B10d, densité (Q595).

## Bloqué
- **Lot 4** : Q601 (Samuel, carte posée).
- **Ancienne chaîne en préversion** : Q538, Q551, Q556 sans objet pour le test de bout en bout (la chaîne inversée la remplace sur le site d'essai) ; à revoir pour le MVP.
- **Badge « fermé ce jour-là »** : Q564. **Purge du MVP** (#527) : Q438.

## Prochain cycle
1. Relire #694, #693 (corr. 1), #690 (corr. 1), #688 (corr. 1), #682 (corr. 2) ; relire #686 (corr. 1).
2. Dès la fusion de #694 : lot 3 (le formulaire lance `p0Run` sur le brief saisi ; migration `prototype` avec `owner-approved` de Samuel puis un run).
3. Lot 5 après #694 ; lot 4 après le lot 3 et Q601.
4. Dire à Samuel ce qu'il peut tester à chaque fusion.

## Décisions attendues de Samuel
- **Réponses demandées** : Q509 (fait : 0011 et 0012 appliquées le 2026-10-20), fusion de #580 (`main` → `p0-reel`), Q525 (réserve Google et plafonds Places de la tâche A2), Q527 (barrière des appels réels de l'aperçu), Q529 (option (a) de la question 4 de 0102, refusée par la Sécurité sans amendement de S4), Q506 (fusible de 2 USD aussi en mode réel ?), Q518 et Q519 (tâche C de 0093), Q520 (plafonds de relecture de B8b).
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
- Q601 (Samuel, fusible des révisions du lot 4). Sans objet pour le test de bout en bout : Q538, Q551, Q556 (restent ouvertes pour le MVP).

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
