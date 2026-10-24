# État du studio — 2026-10-24 (164e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 2 heures (routine « Vadrouille - Cycle (projet) », 7 */2 * * * UTC), au plus 4 fils en parallèle (Samuel, 2026-10-19 21:40 UTC) · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (feuille des 20 cycles terminée au 122e cycle ; on poursuit sa priorité, le parcours de bout en bout) · Tableau de bord produit : https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v (republié à chaque fin de cycle).

## Messages de Samuel traités (projet)
- Fil « Routine cycle du studio », 2026-10-24 : « Drop le voyages de Zakynthos » puis « En fait je veux le voir il n'apparaît pas dans mes voyages » (10:49 UTC) : enquête ouverte, capture de la page des lancements demandée à Samuel. « j'ai merge les photo etc, je peux refaire un test? » (10:54 UTC) : lien d'essai envoyé. « ça a planté, j'ai relancé » (11:06 UTC) et « pareil encore l'erreur » (11:10 UTC) : cause cherchée, correction #745 ouverte, Samuel prié de ne pas relancer.

## Fait
- **Statut du 163e cycle** (#744) fusionné.
- **#737 `[release]`** (`main` → `p0-reel`, photos du tri et ville au choix) fusionnée par Samuel le 2026-10-24 à 10:49 UTC (d6be442) ; déploiement prêt.

## En cours
- **Essais de Samuel du 2026-10-24 (11:05 et 11:08 UTC)** : les deux lancements depuis le formulaire se sont arrêtés à l'étape du programme (`pipeline_failed`) : un appel au modèle, réponse sans objet JSON lisible, aucune journée lue. La mise en ligne #737 ne touche ni `src/ai` ni la configuration des modèles. Cause supposée, non prouvée : le raisonnement du modèle consomme tout le plafond de 32 000 jetons de sortie.
- **#745 `[ia]`** (raisonnement borné à 8 000 jetons pour `programme` et la révision, raison de fin et jetons journalisés dans `p0.programme_written`) : revue comptée (correction 1) ; Sécurité favorable, Tech Lead demande la décision 0130 (réservée), un test du chemin de révision et des mineurs. Correction 1 en cours. Ensuite : mise en ligne `main` → `p0-reel`, un seul lien à Samuel.
- **Voyage de Zakynthos absent de « Mes voyages »** : enquête ; attend la capture de la page des lancements par Samuel.
- **#736 `[data]`** : attend `owner-approved` de Samuel (demandé après son essai, un seul clic à la fois), puis db-migrate lancé par lui. Sans elle, la recherche Google de ville reste fermée et l'écran 1 se rabat sur la table élargie.
- **#527 `[data]`** (`coords-purge`) : bloqué sur Q438 (Samuel).
- Toujours en attente : #583 (Q538), #500 gelée, #534/#547 (Q518-Q519), #664 et B10c/B10d, densité (Q595), Q618. Q261 et Q262 sont à réconcilier avec F13.

## Bloqué
- **Ancienne chaîne en préversion** : Q538, Q551, Q556 sans objet pour le test de bout en bout ; à revoir pour le MVP.
- **Badge « fermé ce jour-là »** : Q564. **Purge du MVP** : Q438.

## Prochain cycle
1. Après la fusion de #745 : PR de mise en ligne `main` → `p0-reel`, un seul lien à Samuel ; lire `finishReason` et `outputTokens` de son essai suivant (décision 0130, « Quand revoir »). Ensuite seulement : lui demander `owner-approved` sur #736 puis db-migrate.
2. Zakynthos : après la capture de Samuel, corriger la cause (par exemple afficher les voyages masqués avec leur raison).
3. #527 : rappeler Q438 à Samuel après ses tests.
4. Note de version suivante : corriger l'état des migrations 0016 à 0018 ; lister 0126 à 0129, #716, #720.

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
- Q628 et Q629 (Tech Lead, issues de #745).

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
