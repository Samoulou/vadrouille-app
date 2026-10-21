# État du studio — 2026-10-21 (131e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 2 heures (routine « Vadrouille - Cycle (projet) », 7 */2 * * * UTC), au plus 4 fils en parallèle (Samuel, 2026-10-19 21:40 UTC) · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (feuille des 20 cycles terminée au 122e cycle ; on poursuit sa priorité, le parcours de bout en bout) · Tableau de bord produit : https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v (republié à chaque fin de cycle).

## Messages de Samuel traités (projet)
- 2026-10-21 16:31 UTC (fil « Routine cycle du studio ») : « 1 h pour relire ? » : réponse donnée (le signal de relecture de 13:59 UTC s'était perdu, relecture relancée à 16:13 UTC). À 18:15 UTC : Samuel prévenu que #632 est fusionnée et qu'une PR de report l'attend (#648).

## Fait
- **Premier lot fusionné** (#632, head `bd41c6a`, 16:20 UTC) : relecture de la correction 2 conforme (Tech Lead sans bloquant, Sécurité approuvée). L'IA écrit le programme complet, le code vérifie chaque lieu, badge « à confirmer » à la lecture, nombres d'étapes sur le rapport, mode simulé de `pnpm p0` sur la nouvelle chaîne. Mineurs restants : type `LieuProgramme` partagé reporté (Q574 répondue : report accepté, dette à lister dans la note de version), libellé du compteur (décision de forme 0093) à lister dans la note de version.
- **Report `main` → `p0-reel`** : PR #648 ouverte (23 commits, `main` à `0d910fd`, fusion sans conflit ; `.github/workflows/db-migrate.yml` seul fichier de workflow, approbations 0013/0014 déjà appliquées ; aucune migration). Samuel la fusionne lui-même (« Create a merge commit ») puis relance Rome.
- **Décision 0119** (#645) : correction 1 (`c304bca`) relue à 16:31 UTC : un bloquant introduit par la correction (« dernière exécution `preview` qui a écrit des cases » : faux, `SQL_EXECUTION_APERCU` prend la dernière `preview` sans condition) et trois mineurs. **Correction 2 (la dernière comptée)** lancée ; choix du CEO : même exécution que la lecture, « aucune case » traité comme « aperçu sans proposition ».
- Statut du 130e cycle (#647) fusionné.

## En cours
- Tech Lead : #645 correction 2 (0119) ; si encore bloquée, le CEO et le Tech Lead décident (troisième tentative ou découpage).
- ia-recherche : PR de remplissage de `tip`/`priceNote`/`hoursNote`/`theme` par le prompt `programme` (ticket à ouvrir par l'agent), puis #633 (réexportations `texte.ts`).
- Samuel : fusion de #648 puis essai de Rome sur la page d'essai ; le studio ne lance aucun essai.
- Après la fusion de 0119 : tickets de code B10b-migration, B10b-moteur, B10b-serveur (verdict Sécurité Q575 avant la fusion de la PR serveur).
- Aucune autre tâche prête : #527 attend Q438, #583 attend Q538, #500 gelée, #534/#547 attendent Q518-Q519 et la décision UX/UI.

## Bloqué
- **Badge « fermé ce jour-là »** (T8, future 0118) : Q564 à Samuel ; recommandation : juger d'abord le premier essai.
- **Essai réel sur préversion** (B9e) : Q538.
- **0093** : tâche C après Q518 et Q519 ; A2-b après la décision UX/UI ; A2-c seulement si Samuel le décide (Q525).
- **Purge du MVP et `coords-purge`** (#527) : Q438 ; `coords-purge` toujours en échec.
- Incohérence connue : 0117 dit Q557 « en attente » ; la Sécurité la reprend avec 0118.

## Prochain cycle
1. Lire le résultat de l'essai de Rome de Samuel s'il a eu lieu (journal de l'exécution, page d'essai) ; PR infos pratiques et #633 jusqu'à la fusion, puis second report `main` → `p0-reel`.
2. #645 (0119) jusqu'à la fusion ; puis tickets de code B10b (migration d'abord).
3. Samuel : fusionner #648 et relancer Rome ; Q564 (facultative) ; Q538, Q542, Q551, Q556 ; Q506, Q518 à Q520, Q525, Q527 (3), Q529 ; facultatives Q558 à Q561.

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
- Aucune. Q574 répondue par le Tech Lead (relecture de #632 du 16:19 UTC : report accepté, dette à noter).

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
