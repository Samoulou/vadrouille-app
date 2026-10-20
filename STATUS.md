# État du studio — 2026-10-20 (114e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 2 heures (routine « Vadrouille - Cycle (projet) », 7 */2 * * * UTC), au plus 4 fils en parallèle (Samuel, 2026-10-19 21:40 UTC) · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (cycle 12 sur 20 de la nouvelle feuille, cycles 103 à 122) · Tableau de bord produit : https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v (republié à chaque fin de cycle).

## Messages de Samuel traités (projet)
- Aucun message nouveau depuis le 113e cycle (projet et #studio).

## Fait
- Fusionnées : **0102** (#557, conception de la tâche A2 de 0093, variante prudente : plafonds Places gardés), **0103** (#560, verdict Sécurité sur les questions 1 à 5 de 0094 : table `run_secteurs` admise sous conditions), statut du 113e cycle (#558).
- PR ouvertes : **B9c** (#563, aperçu, workflows 1, 2 et 3), **0104** (#559, réponses du Product Owner aux questions 6, 8 et 10 de 0094) ; changements demandés sur les deux.
- Tickets ouverts : **#561** (`run_candidates` gardée 24 h après l'écriture du programme, constat de 0103) ; **#562** (Q-L2a, après 0104).

## En cours
- backend : **B9c** (#563), correction 1 (barrière des appels réels avant tout forfait, modules partagés au lieu de copies, critères de la spécification).
- product-owner : **0104** (#559), correction 1.
- ia-recherche : **tâche A2 de 0093** (#547), variante prudente de 0102.
- data : **#561**, suppression de `run_candidates` à l'écriture du programme.

## Bloqué
- **B4a** (#531) : après la fusion de B9c (#563 touche `src/server/env/` et les listes du confinement).
- **B6b** (#532) : après la suite de B3b (#548, `owner-approved` de Samuel) ; il fait aussi le branchement de la lecture réelle de B8b (0100 § 5.4).
- **Q-L2a** (#562) : après 0104 (#559).
- **B9d, B9e** : après B9c.
- **Affichage des voyages sur `p0-reel`** : reste `db-migrate` lancé par Samuel → report `main` → `p0-reel`.
- **0093** : tâche C après Q518 et Q519 ; A2-b après la décision UX/UI sur la colonne « relances » ; A2-c (plafonds Places) seulement si Samuel le décide (Q525).
- **Purge du MVP et `coords-purge`** (#527) : Q438.

## Prochain cycle
1. B9c jusqu'à la fusion ; puis B4a, B9d.
2. Q-L2a dès la fusion de 0104 ; B6b dès la fusion de #548.
3. Samuel : `owner-approved` sur #548 ; lancer `db-migrate` (0011, 0012) ; Q506, Q518 à Q520, Q525, Q527.

## Décisions attendues de Samuel
- **Réponses demandées** : Q509 (lancer `db-migrate`, #536 étant fusionnée), `owner-approved` sur #548 (suite de B3b, approuvée par le Tech Lead, CI verte), Q525 (réserve Google et plafonds Places de la tâche A2), Q527 (barrière des appels réels de l'aperçu), Q506 (fusible de 2 USD aussi en mode réel ?), Q518 et Q519 (tâche C de 0093), Q520 (plafonds de relecture de B8b).
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
- Q527 (questions de B9c) et Q528 (questions de 0103) ; Q508 et Q525 mises à jour.

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
