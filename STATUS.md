# État du studio — 2026-10-20 (115e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 2 heures (routine « Vadrouille - Cycle (projet) », 7 */2 * * * UTC), au plus 4 fils en parallèle (Samuel, 2026-10-19 21:40 UTC) · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (cycle 13 sur 20 de la nouvelle feuille, cycles 103 à 122) · Tableau de bord produit : https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v (republié à chaque fin de cycle).

## Messages de Samuel traités (projet)
- Aucun message nouveau depuis le 114e cycle (projet et #studio).

## Fait
- Fusionnées : **0104** (#559, réponses du Product Owner aux questions 6, 8 et 10 de 0094), statut du 114e cycle (#564), note de version du 20 octobre, 09 h (#567).
- PR ouvertes : **tâche A2 de 0093** (#565, variante prudente de 0102) et **avis de la Sécurité sur 0102** (#566) ; changements demandés sur les deux.
- **B9c** (#563) : correction 1 poussée, deuxième revue comptée avec changements demandés (build Docker, réessai sur panne de base, tests manquants ou vides, écarts sans décision écrite).
- **#561** : correctif prêt mais bloqué par le test de garde qui interdit de nommer `run_candidates` hors de `src/adapters/prototype-travail.ts` ; choix du CEO : déplacer la suppression dans une fonction exportée de ce module, après la fusion de A2 (#565).

## En cours
- backend : **B9c** (#563), correction 2 (dernière) : fixtures chargées hors du graphe de production, réessai sur panne de base, tests demandés par la revue.
- tech-lead : **0105**, décisions Tech Lead de B9c (`organizationId` dans l'état, chargement des fixtures, Q-B9c-4 et Q-B9c-6).
- product-owner : **0106**, écarts produit de B9c (« Surprends-moi », événements sans heure, villes, repas, réutilisation des candidats) : implémenter ou reporter à une tâche nommée.
- ia-recherche : **tâche A2** (#565), correction 1 (contrôle `totalCandidats + 5` testé avant toute réservation, spécification P0-suite-2 alignée).

## Bloqué
- **Avis de la Sécurité sur 0102** (#566) : correction 1 (deux références inexactes) au prochain cycle, faute de fil libre.
- **Q-L2a** (#562) : prêt depuis la fusion de 0104 ; au prochain fil libre, après B9c.
- **#561** : après la fusion de A2 (#565).
- **B4a** (#531) : après la fusion de B9c (#563 touche `src/server/env/` et les listes du confinement).
- **B6b** (#532) : après la suite de B3b (#548, `owner-approved` de Samuel) ; il fait aussi le branchement de la lecture réelle de B8b (0100 § 5.4).
- **B9d, B9e** : après B9c, 0105 et 0106.
- **Affichage des voyages sur `p0-reel`** : reste `db-migrate` lancé par Samuel → report `main` → `p0-reel`.
- **0093** : tâche C après Q518 et Q519 ; A2-b après la décision UX/UI sur la colonne « relances » ; A2-c (plafonds Places) seulement si Samuel le décide (Q525).
- **Purge du MVP et `coords-purge`** (#527) : Q438.

## Prochain cycle
1. B9c jusqu'à la fusion (0105 et 0106 d'abord) ; puis B4a, B9d.
2. Correction 1 de #566 ; Q-L2a ; #561 après A2 ; B6b dès la fusion de #548.
3. Samuel : `owner-approved` sur #548 ; lancer `db-migrate` (0011, 0012) ; Q506, Q518 à Q520, Q525, Q527 (3), Q529.

## Décisions attendues de Samuel
- **Réponses demandées** : Q509 (lancer `db-migrate`, #536 étant fusionnée), `owner-approved` sur #548 (suite de B3b, approuvée par le Tech Lead, CI verte), Q525 (réserve Google et plafonds Places de la tâche A2), Q527 (barrière des appels réels de l'aperçu), Q529 (option (a) de la question 4 de 0102, refusée par la Sécurité sans amendement de S4), Q506 (fusible de 2 USD aussi en mode réel ?), Q518 et Q519 (tâche C de 0093), Q520 (plafonds de relecture de B8b).
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
- Q529 (avis de la Sécurité sur 0102), Q530 (suite de B9c), Q531 (#561) ; Q508, Q525 et Q527 mises à jour.

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
