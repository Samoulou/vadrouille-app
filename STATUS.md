# État du studio — 2026-10-21 (132e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 2 heures (routine « Vadrouille - Cycle (projet) », 7 */2 * * * UTC), au plus 4 fils en parallèle (Samuel, 2026-10-19 21:40 UTC) · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (feuille des 20 cycles terminée au 122e cycle ; on poursuit sa priorité, le parcours de bout en bout) · Tableau de bord produit : https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v (republié à chaque fin de cycle).

## Messages de Samuel traités (projet)
- Aucun message de Samuel depuis le 131e cycle. Le report `main` → `p0-reel` (#648) attend sa fusion (« Create a merge commit ») ; `p0-reel` est toujours à `63cd2a7`.

## Fait
- Fusionnées : **décision 0119** (#645, B10-TL-5 à B10-TL-8 : workflow 5 `batchRecompute`, entrée `conservees` du moteur, voyage complet filtré par les signaux, profil de forfait `lot` sans montant, interrupteur « recalcul à la fin de l'aperçu » fermé ; approuvée à la correction 2), **#652** (`texteMaison`/`contientUrl` réexportés depuis `src/contracts/texte.ts`, `.trim()` accepté par le Tech Lead), statut du 131e cycle (#649).
- **Infos pratiques écrites par l'IA** (#651, head `8f36653`, ticket #650) : première relecture (18:40 UTC) : Sécurité approuvée (ligne de confinement inchangée, double application de la règle du contrat saine), Tech Lead un bloquant (un texte du test rangé à tort parmi les refusés) et cinq mineurs. Correction 1 lancée. Réponse du CEO : pas de compteur « infos complètes / incomplètes » au rapport avant le premier essai réel.
- **B10b** : tickets de code ouverts à la fusion de 0119 : **#653** B10b-migration (data : colonnes `base_version` et `deck_closure_id`, index uniques, purge, migration 0015) et **#654** B10b-domaine (backend : entrée `conservees`, `src/domain/recalcul.ts`), lancés ensemble (aucun fichier commun). B10b-serveur suivra leur fusion et le verdict Sécurité (Q575).
- Le corps de #648 est mis à jour : `main` a avancé à `dd0a52b` (#652, 0119, #649 embarqués ; toujours aucune migration).

## En cours
- ia-recherche : #651 correction 1.
- data : #653 B10b-migration. backend : #654 B10b-domaine.
- Samuel : fusion de #648 puis essai de Rome sur la page d'essai ; le studio ne lance aucun essai.
- Après la fusion de #651 : second report `main` → `p0-reel` (conseils, prix, horaires, titre du jour remplis par l'IA).
- Aucune autre tâche prête : #527 attend Q438, #583 attend Q538, #500 gelée, #534/#547 attendent Q518-Q519 et la décision UX/UI.

## Bloqué
- **Badge « fermé ce jour-là »** (T8, future 0118) : Q564 à Samuel ; recommandation : juger d'abord le premier essai.
- **Essai réel sur préversion** (B9e) : Q538.
- **0093** : tâche C après Q518 et Q519 ; A2-b après la décision UX/UI ; A2-c seulement si Samuel le décide (Q525).
- **Purge du MVP et `coords-purge`** (#527) : Q438 ; `coords-purge` toujours en échec.
- Incohérence connue : 0117 dit Q557 « en attente » ; la Sécurité la reprend avec 0118.

## Prochain cycle
1. Si #648 est fusionnée : lire le résultat de l'essai de Rome (journal de l'exécution, rapport) ; #651 jusqu'à la fusion puis second report.
2. #653 et #654 jusqu'à la fusion ; puis ticket B10b-serveur (après verdict Sécurité Q575).
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
- Q577, Q578 (#651, #652). Q576 (c) : 0119 ne met pas en œuvre la reprise d'un recalcul échoué en B10b.

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
