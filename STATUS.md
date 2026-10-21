# État du studio — 2026-10-21 (130e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 2 heures (routine « Vadrouille - Cycle (projet) », 7 */2 * * * UTC), au plus 4 fils en parallèle (Samuel, 2026-10-19 21:40 UTC) · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (feuille des 20 cycles terminée au 122e cycle ; on poursuit sa priorité, le parcours de bout en bout) · Tableau de bord produit : https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v (republié à chaque fin de cycle).

## Messages de Samuel traités (projet)
- Aucun message de Samuel depuis le 129e cycle (ni dans #studio, ni dans le fil « Routine cycle du studio »).

## Fait
- Fusionnées : **#646** retrait du repli de `getDeckSession` (0112 amendement 3 ; une table ou colonne absente rejette désormais comme toute erreur de base ; événement `presentation.deck_schema_missing` retiré ; approuvée Tech Lead et Sécurité sans bloquant), statut du 129e cycle (#644).
- **Décision 0119** (#645, B10-TL-5 à B10-TL-8, head `9a765fd`) : ouverte par le Tech Lead ; **le CEO accepte le découpage de B10b en trois PR** (migration, moteur, serveur ; la PR serveur jamais dans le même cycle que #632). Première relecture (14:44 UTC) : deux bloquants (amendement implicite de 0112 § 3.4 et définition de `deck_closures` ; expiration des actions du tri à restreindre à `kind = 'batch'`) et huit mineurs. Correction 1 lancée.
- **Premier lot** (#632, head `bd41c6a`, correction 2) : CI verte (`verify`, `db`, `docker`) ; la relecture de la correction 2 ne s'est jamais déclenchée après le libellé reposé à 13:59 UTC ; libellé `needs-review` retiré puis reposé à 16:13 UTC.

## En cours
- Tech Lead : #645 correction 1 (0119).
- ia-recherche : #632 en attente de la relecture de la correction 2 (dernière comptée) ; si encore bloquée, le CEO et le Tech Lead décident (troisième tentative ou fusion demandée à Samuel).
- Après la fusion de #632 : #633 (réexportations `texte.ts`), remplissage de `tip`/`priceNote`/`hoursNote`/`theme` par le prompt `programme`, puis **report `main` → `p0-reel`** et Samuel relance Rome.
- Après la fusion de 0119 : tickets de code B10b-migration, B10b-moteur, B10b-serveur (verdict Sécurité sur la composition du workflow 5 avant la fusion de la PR serveur, Q575).
- Aucune autre tâche prête : #527 attend Q438, #583 attend Q538, #500 gelée, #534/#547 attendent Q518-Q519 et la décision UX/UI.

## Bloqué
- **Badge « fermé ce jour-là »** (T8, future 0118) : Q564 à Samuel ; recommandation : juger d'abord le premier essai.
- **Essai réel sur préversion** (B9e) : Q538.
- **0093** : tâche C après Q518 et Q519 ; A2-b après la décision UX/UI ; A2-c seulement si Samuel le décide (Q525).
- **Purge du MVP et `coords-purge`** (#527) : Q438 ; `coords-purge` toujours en échec (run du 14:29 UTC).
- Incohérence connue : 0117 dit Q557 « en attente » ; la Sécurité la reprend avec 0118.

## Prochain cycle
1. #632 jusqu'à la fusion (vérifier que la relecture s'est bien déclenchée) ; #633 ; remplissage des infos pratiques ; report `main` → `p0-reel` ; prévenir Samuel.
2. #645 (0119) jusqu'à la fusion ; puis tickets de code B10b (migration d'abord).
3. Samuel : rien à cliquer ; Q564 (facultative) ; Q538, Q542, Q551, Q556 ; Q506, Q518 à Q520, Q525, Q527 (3), Q529 ; facultatives Q558 à Q561.

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
- Q575, Q576 (décision 0119, #645).

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
