# État du studio — 2026-10-21 (133e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 2 heures (routine « Vadrouille - Cycle (projet) », 7 */2 * * * UTC), au plus 4 fils en parallèle (Samuel, 2026-10-19 21:40 UTC) · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (feuille des 20 cycles terminée au 122e cycle ; on poursuit sa priorité, le parcours de bout en bout) · Tableau de bord produit : https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v (republié à chaque fin de cycle).

## Messages de Samuel traités (projet)
- Aucun message de Samuel depuis le 132e cycle. Le report `main` → `p0-reel` (#648) attend toujours sa fusion (« Create a merge commit ») ; `p0-reel` est à `63cd2a7`. Son corps est mis à jour (22:15 UTC) : `main` à `fd45254` embarque désormais aussi les infos pratiques (#651) et B10b-domaine (#656) ; une seule fusion couvre les deux lots.

## Fait
- Fusionnées : **infos pratiques écrites par l'IA** (#651, ticket #650 ; correction 1 approuvée : conseil, prix, horaires et titre du jour remplis depuis le programme de l'IA, via `texteMaison` ; prix des fixtures indicatifs), **B10b-domaine** (#656, ticket #654 ; approuvée à la première relecture : entrée `conservees` de `replanifierJour`, `src/domain/recalcul.ts`, 17 tests ; aucun contrat ni serveur touché), note de version v2026.10.21-21 (#658, routine Release), statut du 132e cycle (#655).
- **B10b-migration** (#657, ticket #653, head `e80346c`) : approuvée à la première relecture par le Tech Lead et la Sécurité (migration 0015 : `base_version`, `deck_closure_id`, `CHECK`, clé étrangère composée, deux index uniques partiels, purge réordonnée, `SELECT (kind)` à la purge ; migration inverse partielle ; trois tests adaptés, aucun désactivé) mais **CI rouge** : le test de confinement prend le nom de contrainte `deck_closures_organization_id_id_key` pour un nom de secret. Correction de CI en cours (renommage sans suffixe `_key`, mineurs 1 à 3 de la relecture traités dans le même push). L'application de 0015 à la base d'essai passera par une PR `MIGRATIONS_APPROUVEES` séparée (`owner-approved` de Samuel), après vérification qu'aucune ligne `kind = 'batch'` n'existe sur la base d'essai (mineur 5).
- **Décision 0120** (ticket #659, Sécurité) lancée : verdict Sécurité sur le workflow 5 (0119 § 1.9, Q575), restriction de l'`UPDATE` sur les nouvelles colonnes (Q583), confinement de B10b-serveur. Elle bloque la fusion de B10b-serveur, pas son démarrage.

## En cours
- data : correction de CI de #657. Sécurité : décision 0120 (#659).
- Samuel : fusion de #648 puis essai de Rome sur la page d'essai ; le studio ne lance aucun essai.
- Prochaine tâche de code : **B10b-serveur** (backend) dès la fusion de #657 ; sa fusion attend 0120 (Q575) et la réponse à Q582 (nombre réel d'options d'un créneau).
- Aucune autre tâche prête : #527 attend Q438, #583 attend Q538, #500 gelée, #534/#547 attendent Q518-Q519 et la décision UX/UI.

## Bloqué
- **Badge « fermé ce jour-là »** (T8, future 0118) : Q564 à Samuel ; recommandation : juger d'abord le premier essai.
- **Essai réel sur préversion** (B9e) : Q538.
- **0093** : tâche C après Q518 et Q519 ; A2-b après la décision UX/UI ; A2-c seulement si Samuel le décide (Q525).
- **Purge du MVP et `coords-purge`** (#527) : Q438 ; `coords-purge` toujours en échec.
- Incohérence connue : 0117 dit Q557 « en attente » ; la Sécurité la reprend avec 0118.

## Prochain cycle
1. Si #648 est fusionnée : lire le résultat de l'essai de Rome (journal de l'exécution, rapport).
2. #657 jusqu'à la fusion (relecture relancée après la correction de CI) ; puis ticket et fil **B10b-serveur** (backend ; jamais dans le même cycle qu'une PR touchant `src/workflows/index.ts`, `src/server/composition/generation.ts`, les listes de confinement, `imports.test.ts`, `etapes-complet.ts`, `usage.ts`) et PR `[data]` d'approbation de 0015 (`MIGRATIONS_APPROUVEES`, `owner-approved` de Samuel).
3. 0120 (#659) jusqu'à la fusion ; ticket « créneau imposé pour un candidat » (condition 3 de la relecture de #656).
4. Samuel : fusionner #648 et relancer Rome ; Q564 (facultative) ; Q538, Q542, Q551, Q556 ; Q506, Q518 à Q520, Q525, Q527 (3), Q529 ; facultatives Q558 à Q561.

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
- Q579 à Q582 (#656, Tech Lead ; Q579 à Q581 répondues à la relecture), Q583 (#657, Sécurité et Tech Lead, portée par 0120), Q584 (#656 mineur 5, Tech Lead et Product Owner). Q575 : en cours d'écriture (0120, #659).

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
