# État du studio — 2026-10-20 (113e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 2 heures (routine « Vadrouille - Cycle (projet) », 7 */2 * * * UTC), au plus 4 fils en parallèle (Samuel, 2026-10-19 21:40 UTC) · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (cycle 11 sur 20 de la nouvelle feuille, cycles 103 à 122) · Tableau de bord produit : https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v (republié à chaque fin de cycle).

## Messages de Samuel traités (projet)
- Aucun message nouveau depuis le 112e cycle (projet et #studio). Samuel a posé `owner-approved` sur #536 (migrations 0011 et 0012 approuvées dans `db-migrate`), fusionnée.

## Fait
- Fusionnées : **B8b** (#554, lecture réelle des journées et carte), **#536** (migrations 0011 et 0012 dans `db-migrate`, Q509), **0101** (#549), **spécification B9 alignée** (#556, B9-PO-19 : `activeTripId`, expiration), statut du 112e cycle (#555).
- PR ouverte : **0102** (#557, conception de la tâche A2 de 0093), changements demandés.
- Disque de la machine des agents libéré (caches de construction des branches fusionnées).

## En cours
- backend : **B9c** (#522, aperçu, workflows 1, 2 et 3), le maillon central de l'appli de bout en bout.
- tech-lead : **0102** (#557), correction 1 ; par défaut la variante prudente (plafonds Places gardés) tant que Samuel n'a pas répondu.
- securite : **0103**, verdict sur les questions 1 à 5 de 0094 (Q508).
- product-owner : **0104**, réponses aux questions 6, 8 et 10 de 0094 (Q508).

## Bloqué
- **B4a** (#531) : prêt, mais pas dans le cycle de B9c (`env/index.ts` et règles de lint, spécification B9 « Ordre ») ; au prochain cycle si B9c n'est plus en cours de code, sinon dès sa fusion.
- **B6b** (#532) : après la suite de B3b (#548, `owner-approved` de Samuel) ; il fait aussi le branchement de la lecture réelle de B8b (0100 § 5.4).
- **Q-L2a** : après 0103 (table `run_secteurs`) ; sa migration prend le numéro libre suivant.
- **Affichage des voyages sur `p0-reel`** : #536 fusionnée ; reste `db-migrate` lancé par Samuel → report `main` → `p0-reel`.
- **0093** : tâche C après Q518 et Q519 ; tâche A2 (#547) après 0102, la réponse de Samuel (Q525) et le verdict Sécurité ; A2-b après la décision UX/UI sur la colonne « relances ».
- **Purge du MVP et `coords-purge`** (#527) : Q438.

## Prochain cycle
1. B9c jusqu'à la PR ; puis B9d et B9e.
2. B4a ; B6b dès la fusion de #548 ; Q-L2a après 0103.
3. Samuel : `owner-approved` sur #548 ; lancer `db-migrate` (0011, 0012) ; Q506, Q518 à Q520, Q525.

## Décisions attendues de Samuel
- **Réponses demandées** : Q509 (lancer `db-migrate`, #536 étant fusionnée), `owner-approved` sur #548 (suite de B3b, approuvée par le Tech Lead, CI verte), Q525 (réserve Google et plafonds Places de la tâche A2), Q506 (fusible de 2 USD aussi en mode réel ?), Q518 et Q519 (tâche C de 0093), Q520 (plafonds de relecture de B8b).
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
- Q525 (tâche A2 de 0093, décision 0102) et Q526 (spécification B9, question 18).

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
