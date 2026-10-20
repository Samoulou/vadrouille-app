# État du studio — 2026-10-20 (118e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 2 heures (routine « Vadrouille - Cycle (projet) », 7 */2 * * * UTC), au plus 4 fils en parallèle (Samuel, 2026-10-19 21:40 UTC) · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (cycle 16 sur 20 de la nouvelle feuille, cycles 103 à 122) · Tableau de bord produit : https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v (republié à chaque fin de cycle).

## Messages de Samuel traités (projet)
- Aucun nouveau depuis le 117e cycle.

## Fait
- Fusionnées : **#572** (#561, suppression des candidats d'un essai à l'écriture de son programme, décision 0107), statut du 117e cycle (#575).
- **B9c** (#563) : approuvée par le Tech Lead ; un seul test du job CI `db` échoue (`tests/db/apercu-idees.test.ts`, invariant « étapes identiques avec et sans idées »).
- **B6b** (#576) : PR ouverte ; revue avec un bloquant (écart à 0100 § 5.2 et § 5.4 à consigner, tests de frontière à aligner), Sécurité d'accord.

## En cours
- backend : **B9c** (#563), cause racine et correction du test `db` en échec (sans le désactiver).
- backend : **B6b** (#576), correction 1 : amendement de 0100 (branchement par `src/instrumentation.ts`, validé par le Tech Lead), tests de frontière, mineurs.
- ia-recherche : **Q-L2a** (#562), reprise : vérification, PR.

## Bloqué
- **B4a** (#531) : après la fusion de B9c.
- **B9c-suite** (#573), **B9c-graphe** (#574), puis **B9d, B9e** : après B9c.
- **Affichage des voyages sur `p0-reel`** : reste `db-migrate` lancé par Samuel → report `main` → `p0-reel`.
- **0093** : tâche C après Q518 et Q519 ; A2-b après la décision UX/UI sur la colonne « relances » ; A2-c (plafonds Places) seulement si Samuel le décide (Q525).
- **Purge du MVP et `coords-purge`** (#527) : Q438.

## Prochain cycle
1. B9c jusqu'à la fusion ; puis B9c-suite, B9c-graphe, B4a, B9d.
2. B6b jusqu'à la fusion ; Q-L2a en revue.
3. Samuel : lancer `db-migrate` (0011, 0012) ; Q506, Q518 à Q520, Q525, Q527 (3), Q529.

## Décisions attendues de Samuel
- **Réponses demandées** : Q509 (lancer `db-migrate`, #536 étant fusionnée), Q525 (réserve Google et plafonds Places de la tâche A2), Q527 (barrière des appels réels de l'aperçu), Q529 (option (a) de la question 4 de 0102, refusée par la Sécurité sans amendement de S4), Q506 (fusible de 2 USD aussi en mode réel ?), Q518 et Q519 (tâche C de 0093), Q520 (plafonds de relecture de B8b).
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
- Aucune ; Q531 et Q533 mises à jour.

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
