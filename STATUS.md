# État du studio — 2026-10-21 (127e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 2 heures (routine « Vadrouille - Cycle (projet) », 7 */2 * * * UTC), au plus 4 fils en parallèle (Samuel, 2026-10-19 21:40 UTC) · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (feuille des 20 cycles terminée au 122e cycle ; on poursuit sa priorité, le parcours de bout en bout) · Tableau de bord produit : https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v (republié à chaque fin de cycle).

## Messages de Samuel traités (projet)
- 2026-10-21, vers 09:30 UTC (GitHub) : Samuel a posé `owner-approved` sur #593 (fusionnée, migration 0013 approuvée dans `db-migrate`) et sur #620 (migration 0014). 09:41 UTC (fil « Routine cycle du studio ») : « je dois faire quoi ? » → réponse : poser ces deux libellés ; rien d'autre ; le studio lui dira quand lancer `db-migrate`, une seule fois.

## Fait
- Fusionnées : **#635** (jours vides du voyage complet → `cap_reached`, fiches de `e` par ville positionnée, Closes #609) ; **#593** (approbation de 0013) ; note de version v2026.10.21-09 (#636) ; **#638** amendement 1 de `specs/P0-programme-par-ia.md` (badge « à confirmer » calculé à la lecture au lot 1, badge « fermé ce jour-là » renvoyé à 0118) ; statut du 126e cycle (#634).
- **0116** (#628) : la troisième tentative (découpage T8) a reçu une 4e puis une 5e revue bloquante (07:51 et 10:22 UTC), toutes sur du texte lié au découpage ; décision du CEO avec le Tech Lead : achèvement du découpage en pushs bornés plutôt qu'un nouveau découpage (bloquant « module du badge » dû à une consigne du CEO, corrigée). Si encore bloquée : remontée à Samuel.
- **Premier lot** (#632) : badge « à confirmer » posé à la lecture (`src/adapters/prototype.ts` via `prototype-lecture.ts`), `pairesDuProgramme` saute les étapes sans `placeId`, test ajouté ; `needs-review` dès que 0116 est fusionnée.
- **Lot 1 bis** (#631) : correction 1 relue et approuvée par le Tech Lead, puis CI rouge (le titre du jour n'était pas relu depuis la base) corrigée sans migration (`recomposition.ts`, `patch.ts`) ; relecture relancée (le libellé `techlead-approved` tombe à chaque push).
- **B10a** (#621) : correction 2 approuvée par le Tech Lead ; un bloquant tardif UX/UI (« Tu as tout trié » faux après « Tout garder ») en correction.
- **#620** (migration 0014) : conflit avec `main` résolu par le CEO (fusion de `main`, approbations 0013 et 0014 réunies) ; relecture relancée, fusion automatique ensuite.
- Docs CEO : préfixes `[po]` et `[tl]` dans `CLAUDE.md`, renvoi vers 0115 dans `docs/CONTEXT.md` (#637, en revue).

## En cours
- tech-lead : #628 0116, correction de la 5e revue (module du badge, `pairesDuProgramme`, mineurs).
- backend : #621 B10a, bloquant tardif UX.
- En revue : #631 lot 1 bis, #620 migration 0014, #637 docs CEO. #632 attend 0116.
- Après la fusion de #628, #632 et #631 : PR ia #633 (réexportations `texte.ts`, écart de sévérité des sorties) et remplissage de `tip`/`priceNote`/`hoursNote`/`theme` ; puis **report `main` → `p0-reel`** pour que Samuel relance Rome.

## Bloqué
- **`db-migrate` sur la base d'essai** : dès que #620 est fusionnée, Samuel lance le workflow une seule fois (0013 et 0014) ; fusions gelées pendant le lancement. Puis retrait du repli de B10a (0112, amendement 1) à suivre ici.
- **Badge « fermé ce jour-là »** (T8, future 0118) : Q564 à Samuel ; recommandation : juger d'abord le premier essai.
- **Essai réel sur préversion** (B9e) : Q538.
- **0093** : tâche C après Q518 et Q519 ; A2-b après la décision UX/UI ; A2-c seulement si Samuel le décide (Q525).
- **Purge du MVP et `coords-purge`** (#527) : Q438 ; `coords-purge` toujours en échec (note de version).
- Incohérence connue : 0117 (fusionnée) dit Q557 « en attente » ; la Sécurité la reprend avec 0118.

## Prochain cycle
1. Fusionner 0116 (#628), puis #632 (poser `needs-review`) et #631 ; #633 ; report `main` → `p0-reel` ; prévenir Samuel pour relancer Rome.
2. #620 fusionnée → dire à Samuel de lancer `db-migrate` (un clic) ; finir B10a #621 ; B10b ensuite.
3. Samuel : `db-migrate` quand le studio le dit ; Q564 (facultative avant l'essai) ; Q538, Q542, Q551, Q556 ; Q506, Q518 à Q520, Q525, Q527 (3), Q529 ; facultatives Q558 à Q561.

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
- Q571. Q565 et Q566 restent ouvertes (#631 approuvée par le Tech Lead sous réserve de la CI) ; Q570 ouverte.

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
