# État du studio — 2026-10-22 (139e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 2 heures (routine « Vadrouille - Cycle (projet) », 7 */2 * * * UTC), au plus 4 fils en parallèle (Samuel, 2026-10-19 21:40 UTC) · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (feuille des 20 cycles terminée au 122e cycle ; on poursuit sa priorité, le parcours de bout en bout) · Tableau de bord produit : https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v (republié à chaque fin de cycle).

## Messages de Samuel traités (projet)
- Aucun nouveau message depuis le 138e cycle (dernier : 2026-10-22 07:59 UTC, densité et site web). Son analyse de la densité (Q595) est attendue sans urgence.

## Fait
- **Migration 0016** (#675, restriction de l'`UPDATE` de `vadrouille_app` sur `generation_runs`, 0120 S8) **fusionnée** à 08:56 UTC : Tech Lead approuvé, Sécurité accordé (G1 à G6), CI `db` verte. Dix colonnes accordées (celles des 26 `UPDATE` de `src/`), huit figées dont `base_version` et `deck_closure_id`. Q585 répondue oui par le Tech Lead (exclusion étendue, `id` compris). Garde-fou : `tests/support/releve-generation-runs.ts` fait échouer toute PR qui écrirait une colonne non accordée sans migration de droits.
- **Note de version v2026.10.22-09** (#676, routine Release) fusionnée à 09:55 UTC : couvre B10b-serveur (#667), l'approbation 0015 (#666) et le report #648.
- **Spécification du lot 2a** (site web de l'activité, #674) : première relecture, Tech Lead `changes-requested` (2 bloquants : relations entre compteurs, description de `ProposalDetailSheet` ; 8 mineurs) ; correction 1 lancée.
- Statut du 138e cycle (#673) fusionné.

## En cours
- **#674 `[po]` lot 2a** : correction 1 (comptée) en cours.
- **#677 `[data]` approbation de 0016** dans `db-migrate` (branche `claude/677-approbation-0016`) : PR de workflow, `owner-approved` de Samuel après `techlead-approved` ; puis un run `db-migrate`.
- **#678 `[tl]` décision 0121** : réponses T9 à T11 du lot 2a et consignation de Q585 (branche `claude/678-decision-0121`).
- **#679 `[secu]` décision 0122** : verdict S6 (requête sortante bornée depuis `p0Run`) et S7 (compteurs `sites*`, adresse de l'IA dans `Stop.source`) (branche `claude/679-decision-0122`). Le code `[ia]` du lot 2a attend #674, 0121 et 0122 fusionnées.
- Quatre fils en parallèle (plafond atteint). Toujours en attente : #527 (Q438), #583 (Q538), #500 gelée, #534/#547 (Q518-Q519, UX/UI), #664 et B10c/B10d (premier essai du tri réel), densité (Q595).

## Bloqué
- **Badge « fermé ce jour-là »** (T8, future 0118) : Q564 à Samuel ; recommandation : juger d'abord le premier essai.
- **Essai réel sur préversion** (B9e) : Q538.
- **0093** : tâche C après Q518 et Q519 ; A2-b après la décision UX/UI ; A2-c seulement si Samuel le décide (Q525).
- **Purge du MVP et `coords-purge`** (#527) : Q438 ; `coords-purge` toujours en échec.
- Incohérence connue : 0117 dit Q557 « en attente » ; la Sécurité la reprend avec 0118.

## Prochain cycle
1. Relire #674 (corr. 1), #677, #678, #679 ; corrections si demandées (max deux par tâche). Quand #677 est `techlead-approved` : demander à Samuel l'`owner-approved`, puis le run `db-migrate` (`sha_attendu` = tête de `main`).
2. Quand #674, 0121 et 0122 sont fusionnées : ticket `[ia]` du code du lot 2a (prompt `programme` v2, vérification des adresses, `Stop.source`), hors du cycle d'une autre PR touchant `src/ai/prompts/programme.ts` ou `src/server/p0/`.
3. Densité du programme : attendre l'analyse de Samuel (Q595).
4. Samuel : Q595 (densité, à son rythme) ; `owner-approved` sur #677 quand demandé ; Q564 (facultative) ; Q538, Q542, Q551, Q556 ; Q506, Q518 à Q520, Q525, Q527 (3), Q529 ; facultatives Q558 (reste prix/horaires) à Q561.

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
- Q596 (Tech Lead, garde-fou du relevé des `UPDATE`), Q597 (CEO, ligne « étapes avec site » dans le texte copié : avis Sécurité via 0122). Répondues : Q585 (oui, Tech Lead, relecture de #675 ; décision 0121 à consigner).

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
