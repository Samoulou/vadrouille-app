# État du studio — 2026-10-20 (112e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 2 heures (routine « Vadrouille - Cycle (projet) », 7 */2 * * * UTC), au plus 4 fils en parallèle (Samuel, 2026-10-19 21:40 UTC) · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (cycle 10 sur 20 de la nouvelle feuille, cycles 103 à 122) · Tableau de bord produit : https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v (republié à chaque fin de cycle).

## Messages de Samuel traités (projet)
- Aucun message nouveau depuis le 111e cycle (projet et #studio).

## Fait
- Fusionnées : **B7b** (#550, recherche réelle bornée, traces et configuration), **0097** (#540, préalables de B4a, à la troisième tentative bornée, Q523), **0099** (#542, verdict Sécurité sur la tâche C de 0093), statut du 111e cycle (#552).
- PR ouverte : **B8b** (#554, recomposition à la lecture et carte ; verdict Sécurité favorable, changements demandés par le Tech Lead).
- **Suite de B3b** (#548) : correction 1 poussée, approuvée par le Tech Lead, CI verte ; n'attend plus que le `owner-approved` de Samuel (`ci.yml`).
- Correction 1 poussée sur **0101** (#549).

## En cours
- ia-recherche : **B8b** (#554), correction 1.
- tech-lead : **0101** (#549), correction 2, la **dernière** ; **0102**, conception de la tâche A2 de 0093 (#547, Q521).
- product-owner : alignement de la spécification B9 sur 0081, 0087 et 0101 (`activeTripId`, expiration), avant B9c.

## Bloqué
- **B9c** (#522) et **B4a** (#531) : prêts, mais pas dans le cycle de B8b (règles de la spécification B9 et de 0100 : listes du confinement, `env/index.ts`) ; au prochain cycle, B9c d'abord (priorité de Samuel), B4a dès qu'aucune PR du cycle ne touche ces fichiers.
- **B6b** (#532) : après la suite de B3b (#548, `owner-approved` de Samuel) ; jamais dans le même cycle que B8b.
- **Q-L2a** : après le cycle de la fusion de B7b (Q516), donc au prochain cycle au plus tôt.
- **Affichage des voyages sur `p0-reel`** : #536 avec `owner-approved`, puis `db-migrate` lancé par Samuel → report `main` → `p0-reel`.
- **0093** : tâche C après les réponses de Samuel (Q518, Q519) ; tâche A2 (#547) après 0102 et le verdict Sécurité.
- **Lots 2 à 4 de l'amendement 3** : verdicts Sécurité (Q508).
- **Purge du MVP et `coords-purge`** (#527) : Q438.

## Prochain cycle
1. B9c ; B8b (#554) jusqu'à la fusion ; B6b dès la fusion de #548, pas dans le cycle de B8b.
2. B4a ; Q-L2a ; corrections éventuelles de #549 (dernière), de 0102 et de la spécification B9.
3. Samuel : `owner-approved` sur #548 et #536, puis `db-migrate` ; Q506, Q518 à Q520.

## Décisions attendues de Samuel
- **Réponses demandées** : Q509 (libellé `owner-approved` sur #536, puis `db-migrate`), `owner-approved` sur #548 (suite de B3b, approuvée par le Tech Lead, CI verte), Q506 (fusible de 2 USD aussi en mode réel ?), Q518 et Q519 (tâche C de 0093), Q520 (plafonds de relecture de B8b).
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
- Q523 (troisième tentative bornée de 0097) et Q524 (questions de B7b et de B8b).

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
