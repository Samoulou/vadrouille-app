# État du studio — 2026-10-21 (128e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 2 heures (routine « Vadrouille - Cycle (projet) », 7 */2 * * * UTC), au plus 4 fils en parallèle (Samuel, 2026-10-19 21:40 UTC) · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (feuille des 20 cycles terminée au 122e cycle ; on poursuit sa priorité, le parcours de bout en bout) · Tableau de bord produit : https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v (republié à chaque fin de cycle).

## Messages de Samuel traités (projet)
- 2026-10-21 11:11 à 12:05 UTC (fil « Routine cycle du studio ») : « on est où ? », demande du code hexadécimal du workflow, « le workflow est run », « c'est en arrêt sur quoi ? », « toujours bloqué ? ». Réponses données à chaque fois. **Samuel a lancé `db-migrate`** (run 39590555572, commit `ff6735c`, 11:15 UTC) : succès, migrations **0013 et 0014 appliquées** sur la base d'essai (consigné sur #620).

## Fait
- **0116** (#628) fusionnée après sept relectures (les quatre dernières sur le texte des paires de trajets et du module du badge, réécrit mot pour mot depuis le code de #632 ; décision CEO et Tech Lead : achever le découpage plutôt que redécouper). Le badge « à confirmer » est posé à la lecture par `recomposerJour` (`src/adapters/prototype.ts`) via `avecBadgeALaLecture` (`prototype-lecture.ts`) ; une étape qui porte déjà deux badges garde les siens (Q571 répondue).
- Fusionnées aussi : **#631** lot 1 bis (conseil, prix, horaires, titre du jour ; CI corrigée sans migration), **#620** (approbation de 0014), **#637** (préfixes `[po]`/`[tl]`, renvoi 0115 dans CONTEXT.md), statut du 127e cycle (#639).
- **Premier lot** (#632, head `eff976f`) : première relecture consolidée (12:01 UTC) : cinq bloquants du Tech Lead, un de la Sécurité (`unverifiedForCap` dépend du temps), ligne de confinement approuvée. Correction 1 lancée ; décision CEO : le compte des étapes avec et sans `placeId` sur la page de rapport passe par une petite PR de contrat séparée puis le câblage dans #632.
- **B10a** (#621, head `08212ef`) : deux bloquants tardifs UX corrigés (« Tu as fini ce tri. » dès qu'un jour est gardé ou que des cartes sont retirées par une réponse) ; approuvée par le Tech Lead, fusion automatique dès la CI.

## En cours
- ia-recherche : #632 correction 1 (mode simulé de `pnpm p0` sur la nouvelle chaîne + sortie simulée `programme` de rome-1, `unverifiedForCap` avant la boucle, réutilisation de `joursEntre`/`logementsDuJour`/`rythmeVersPace`, tests 0116 § 8.3, clé `zdr` propre à `programme`, plafond de jetons de sortie) et PR de contrat du rapport.
- Après la fusion de #632 : #633 (réexportations `texte.ts`), remplissage de `tip`/`priceNote`/`hoursNote`/`theme` par le prompt `programme`, puis **report `main` → `p0-reel`** et Samuel relance Rome.
- Après la fusion de #621 : ticket B10b ; ticket de retrait du repli de B10a (0112 amendement 1, 0014 appliquée).
- Aucune autre tâche prête : #527 attend Q438, #583 attend Q538, #500 gelée, #534/#547 attendent Q518-Q519 et la décision UX/UI.

## Bloqué
- **Badge « fermé ce jour-là »** (T8, future 0118) : Q564 à Samuel ; recommandation : juger d'abord le premier essai.
- **Essai réel sur préversion** (B9e) : Q538.
- **0093** : tâche C après Q518 et Q519 ; A2-b après la décision UX/UI ; A2-c seulement si Samuel le décide (Q525).
- **Purge du MVP et `coords-purge`** (#527) : Q438 ; `coords-purge` toujours en échec.
- Incohérence connue : 0117 dit Q557 « en attente » ; la Sécurité la reprend avec 0118.

## Prochain cycle
1. #632 correction 1 et PR de contrat jusqu'à la fusion ; #633 ; remplissage des infos pratiques ; report `main` → `p0-reel` ; prévenir Samuel.
2. #621 fusionnée → tickets B10b et retrait du repli.
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
- Q572, Q573. Q571 répondue par le Tech Lead (0116 § 5.1 : les badges déjà écrits l'emportent).

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
