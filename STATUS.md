# État du studio — 2026-10-22 (144e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 2 heures (routine « Vadrouille - Cycle (projet) », 7 */2 * * * UTC), au plus 4 fils en parallèle (Samuel, 2026-10-19 21:40 UTC) · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (feuille des 20 cycles terminée au 122e cycle ; on poursuit sa priorité, le parcours de bout en bout) · Tableau de bord produit : https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v (republié à chaque fin de cycle).

## Messages de Samuel traités (projet)
- 2026-10-22 19:45 UTC (fil) : « Comment ? » : réponse en clair : « Créer un voyage », écrans 1 à 3, tri et déblocage simulé sont prêts dans l'app ; mise à jour du site d'essai ce soir puis un lien ; le lancement de la vraie génération vient après le site web des activités.
- Aucun message de Samuel dans #studio depuis le 143e cycle.

## Fait
- **Amendement 3 de `specs/P0-programme-par-ia.md`** fusionné (#686, 18:37 UTC) : critère A2 du rapport sur les seuls `placeId`, page du rapport sans changement de `src/contracts`, test A2 remplacé sous 0122 § 2.3 et PPI-PO-12.
- **Statut du 143e cycle** (#698) fusionné.
- **#694** : suite de la correction 1 poussée (`5e90aac` : test de la borne raccourcie par l'échéance, A22, renvois aux décisions) ; relecture relancée après la fusion de #686.
- **#688** : bloquant tardif corrigé (`64ef212` : 0019 § 3.2 point 5 et étape 3 de R2 listés, requalification bornée hors CI rouge et contrats).

## En cours
- **#694 `[ia]` lot 2a** : en relecture sur `5e90aac` ; son seul bloquant était la fusion de #686.
- **#688 `[ceo]` décision 0123** : en relecture.
- Toujours en attente : #527 (Q438), #583 (Q538), #500 gelée, #534/#547 (Q518-Q519), #664 et B10c/B10d, densité (Q595).

## Bloqué
- **Lots 3 et 5** : après la fusion de #694 (mêmes fichiers `src/server/p0/` et `src/workflows/p0-run.ts`).
- **Lot 4** : après le lot 3.
- **Ancienne chaîne en préversion** : Q538, Q551, Q556 sans objet pour le test de bout en bout ; à revoir pour le MVP.
- **Badge « fermé ce jour-là »** : Q564. **Purge du MVP** (#527) : Q438.

## Prochain cycle
1. Dès la fusion de #694 : lot 3 (le formulaire lance `p0Run` sur le brief saisi ; migration `prototype` avec `owner-approved` de Samuel puis un run) et lot 5.
2. Mise à jour du site d'essai (`p0-reel`) par la routine Release de 21:52 UTC : lots 1 et 2 ; envoyer à Samuel un seul lien après sa fusion.
3. Point pour le Tech Lead : `next build` affiche une recommandation de mise à jour de sécurité de Next.js (signalée par #686 et #694 ; aucun agent n'a mis à jour).

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
