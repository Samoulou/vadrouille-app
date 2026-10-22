# État du studio — 2026-10-22 (135e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 2 heures (routine « Vadrouille - Cycle (projet) », 7 */2 * * * UTC), au plus 4 fils en parallèle (Samuel, 2026-10-19 21:40 UTC) · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (feuille des 20 cycles terminée au 122e cycle ; on poursuit sa priorité, le parcours de bout en bout) · Tableau de bord produit : https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v (republié à chaque fin de cycle).

## Messages de Samuel traités (projet)
- Aucun message de Samuel depuis le 134e cycle. Deux gestes l'attendent : la fusion de #648 (« Create a merge commit », puis relancer Rome ; `p0-reel` toujours à `63cd2a7`) et le libellé `owner-approved` sur #666 (après vérification, sur la base d'essai, que `generation_runs` n'a aucune ligne `kind = 'batch'`). Demandés dans le fil le 2026-10-22 à 01:15 UTC.

## Fait
- **B10b-serveur** livrée : PR **#667** (ticket #662, head `cf001a4`, reprise après un redémarrage du conteneur qui a interrompu le premier agent sans rien perdre) : workflow 5 `batchRecompute`, `completeDeck`, suite du déblocage, verrous, workflow 4 filtré, profil `lot`, interrupteur fermé, journal en liste fermée, `SQL_EXECUTION_APERCU`, `SQL_CASES` et `SQL_DEBLOQUE` exportées une seule fois depuis `etat.ts`, 0119 « Quand revoir » (Q581, #664), `docs/handovers/backend.md` § 8. Mesure B10-PO-17 : 775 ms en simulé (six jours dont deux touchés). Première relecture : **Sécurité approuvée** (S1 à S9 tenues ; `tri.ts` admis comme importateur nommé de `@/server/generation/*`, canari dans `tests/db` admis), **Tech Lead : un bloquant** (critères 4 et 5 de la spécification B10 sans test serveur : repas choisi sur une autre option, repas refusé sur la dernière option, relecture refusée, comptage `option.total`) et douze mineurs. Correction 1 lancée (comptée). Réponses du Tech Lead : Q582 (le nombre de cases `proposals` suffit en phase 0, à revoir à B10d), départage de `classer` inchangé (ordre total par `id`), Q587 (la question ouverte est déjà masquée par `questionOuverte` dès que la carte est dans un tri clos). Fusion : `owner-approved` de Samuel (touche `src/workflows/`, 0035).
- **Approbation de 0015** : PR **#666** (ticket #663) `techlead-approved` ; attend `owner-approved` de Samuel.
- Statut du 134e cycle (#665) fusionné.

## En cours
- backend : #667 correction 1.
- Samuel : `owner-approved` sur #666 ; fusion de #648 puis essai de Rome ; le studio ne lance aucun essai.
- Aucune autre tâche prête : #527 attend Q438, #583 attend Q538, #500 gelée, #534/#547 attendent Q518-Q519 et la décision UX/UI. La migration de restriction de l'`UPDATE` (0120 S8, Q586) suivra la fusion de #666, hors de tout autre cycle de migration.

## Bloqué
- **Badge « fermé ce jour-là »** (T8, future 0118) : Q564 à Samuel ; recommandation : juger d'abord le premier essai.
- **Essai réel sur préversion** (B9e) : Q538.
- **0093** : tâche C après Q518 et Q519 ; A2-b après la décision UX/UI ; A2-c seulement si Samuel le décide (Q525).
- **Purge du MVP et `coords-purge`** (#527) : Q438 ; `coords-purge` toujours en échec.
- Incohérence connue : 0117 dit Q557 « en attente » ; la Sécurité la reprend avec 0118.

## Prochain cycle
1. Si #648 est fusionnée : lire le résultat de l'essai de Rome (journal de l'exécution, rapport).
2. #667 jusqu'à `techlead-approved` (au plus une correction 2), puis demander à Samuel `owner-approved` ; si #666 a reçu `owner-approved` et est fusionnée : dire à Samuel de lancer `db-migrate` une fois (`sha_attendu` = tête de `main`).
3. Après la fusion de #666 : ticket `[data]` de la migration de restriction de l'`UPDATE` (0120 S8, Q585, Q586).
4. Samuel : `owner-approved` sur #666 ; fusionner #648 et relancer Rome ; Q564 (facultative) ; Q538, Q542, Q551, Q556 ; Q506, Q518 à Q520, Q525, Q527 (3), Q529 ; facultatives Q558 à Q561.

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
- Q588 à Q592 (#667). Q582 et Q587 : répondues par le Tech Lead (relecture de #667). Q584 : couverte par le domaine et la lecture serveur (#667).

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
