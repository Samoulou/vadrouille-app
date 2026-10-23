# État du studio — 2026-10-23 (154e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 2 heures (routine « Vadrouille - Cycle (projet) », 7 */2 * * * UTC), au plus 4 fils en parallèle (Samuel, 2026-10-19 21:40 UTC) · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (feuille des 20 cycles terminée au 122e cycle ; on poursuit sa priorité, le parcours de bout en bout) · Tableau de bord produit : https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v (republié à chaque fin de cycle).

## Messages de Samuel traités (projet)
- 14:34 UTC « on est où ? » : réponse, il ne manquait que la fusion de #701.
- 14:35 UTC : Samuel a fusionné **#701** (`main` → `p0-reel`, déploiement prêt à 14:40 UTC) ; lien de test envoyé.
- 14:44 UTC « pourquoi je peux pas mettre n'importe quelle ville ? » (Valencia refusée) : en mode essai, l'écran 1 n'accepte que les 62 noms de la table `src/lib/fuseaux/villes.json` (`validation.ts:100`, `depuis-formulaire.ts:96`) ; liste des villes envoyée.
- 14:59 UTC : coûts de son premier essai réel depuis l'app (Lisbonne) : environ 2,46 USD au prix plein (fiches Enterprise 49, éléments Routes 288, IA 0,03 USD), environ 0,03 USD réel avec la part gratuite de Google.
- 15:17 UTC : choisir la destination par **l'autocomplétion de Google**. Règle gardée par le CEO : seul le `placeId` est gardé, le pays et le fuseau viennent de nos tables, l'IA reçoit le texte tapé, jamais le libellé de Google.
- 15:23 UTC, priorités des prochains cycles : (1) **photos sur les cartes « J'aime / J'aime pas »** ; (2) **toutes les villes du monde par l'autocomplétion de Google**. Les photos sont chargées à l'affichage (non stockables) : exception à sa règle « aucun appel Google à l'affichage », limitée au tri, signalée à Samuel.
- 15:33 UTC « comment saisir le code ? » : il est demandé à l'écran « Ton brouillon est prêt », au lancement.

## Fait
- **#701** fusionnée : les lots 1 à 5 du parcours de bout en bout, #722 et #725 sont sur le site d'essai. Premier essai réel de Samuel depuis l'app (Lisbonne).
- **Statut du 153e cycle** (#729) fusionné.

## En cours
- **Ville au choix par l'autocomplétion de Google** (`[front]`, branche `claude/e2e-ville-libre`) : en cours d'écriture, pas encore de PR.
- **Photos du tri** (`[front]`, branche `claude/e2e-photos-tri`) : en cours d'écriture, pas encore de PR ; décision 0128 possible (exception d'affichage).
- **#527 `[data]`** (`coords-purge`) : les secrets `COORDS_PURGE_PG*` sont vides, la purge n'a jamais tourné. Bloqué sur Q438 (Samuel).
- Toujours en attente : #583 (Q538), #500 gelée, #534/#547 (Q518-Q519), #664 et B10c/B10d, densité (Q595), Q618.

## Bloqué
- **Ancienne chaîne en préversion** : Q538, Q551, Q556 sans objet pour le test de bout en bout ; à revoir pour le MVP.
- **Badge « fermé ce jour-là »** : Q564. **Purge du MVP** : Q438.

## Prochain cycle
1. Relire les PR de l'autocomplétion et des photos (verdicts Sécurité et Tech Lead sur les conditions Google), puis préparer une PR de release `main` → `p0-reel` et envoyer à Samuel un seul lien.
2. #527 : rappeler Q438 à Samuel après ses tests.
3. Note de version suivante : corriger l'état des migrations 0016 à 0018 ; lister 0126, 0127, #716, #720.

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
- Aucune.

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
