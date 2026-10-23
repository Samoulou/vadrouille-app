# État du studio — 2026-10-23 (149e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 2 heures (routine « Vadrouille - Cycle (projet) », 7 */2 * * * UTC), au plus 4 fils en parallèle (Samuel, 2026-10-19 21:40 UTC) · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (feuille des 20 cycles terminée au 122e cycle ; on poursuit sa priorité, le parcours de bout en bout) · Tableau de bord produit : https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v (republié à chaque fin de cycle).

## Messages de Samuel traités (projet)
- Aucun message de Samuel depuis le 148e cycle.

## Fait
- **Mineurs des lots 3 et 5 fusionnés** (#716, ticket #714, 04:46 UTC). Le mineur 3 de #712 (« à éviter » prime sur les incontournables) n'est pas appliqué : il change l'empreinte du prompt `programme` (Q615).
- **#707 approuvé** sur `4fb75a4` (0017 et 0018 ; Tech Lead et Sécurité) ; CI verte hors `gate`. `owner-approved` demandé à Samuel le 23 octobre à 06:15 UTC.
- **Lot 4 ouvert** (#717, ticket #713) : la révision après « Pas pour moi » est une nouvelle exécution liée (`p0Revision`, prompt `revision` v1, décision 0126 proposée, aucune migration).
- **Statut du 148e cycle** (#715) fusionné.

## En cours
- **#717 `[ia]` lot 4** : correction 1 (comptée ; 4 bloquants Tech Lead : jeu d'évaluation hors réseau, tests de base de la version servie, révision orpheline, chemin écran → serveur). Décision du CEO sur le mineur 9 : 0126 réduit les plafonds Google d'une révision au strict nécessaire et écrit le coût maximal d'un voyage.
- **#707 `[data]`** : attend `owner-approved` de Samuel, puis le run `db-migrate` (0017 et 0018).
- **#701 `[release]`** : attend la fusion de Samuel (demandée le 22 octobre à 22:12 UTC).
- Toujours en attente : #527 (Q438), #583 (Q538), #500 gelée, #534/#547 (Q518-Q519), #664 et B10c/B10d, densité (Q595).

## Bloqué
- **Saisie testable de bout en bout** : `owner-approved` sur #707 et run `db-migrate` par Samuel, fusion de #701. Usage réel avec un logement saisi : Q604 (Samuel, carte) et Q606 (Sécurité).
- **Ancienne chaîne en préversion** : Q538, Q551, Q556 sans objet pour le test de bout en bout ; à revoir pour le MVP.
- **Badge « fermé ce jour-là »** : Q564. **Purge du MVP** et `coords-purge` en échec (#527) : Q438.

## Prochain cycle
1. Après `owner-approved` sur #707 et sa fusion : demander à Samuel le run `db-migrate`.
2. Après la fusion de #701 : envoyer à Samuel un seul lien pour tester la saisie, le tri et le déblocage simulé.
3. Relire la correction 1 de #717.
4. Note de version suivante : lister 0125 et 0126, les textes non maquettés de #716 (0093), corriger v2026.10.22-21 (migration 0016 appliquée le 22 octobre à 11:48 UTC, run 39773388536).

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
- Q613 à Q617.

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
