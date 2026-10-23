# État du studio — 2026-10-23 (150e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 2 heures (routine « Vadrouille - Cycle (projet) », 7 */2 * * * UTC), au plus 4 fils en parallèle (Samuel, 2026-10-19 21:40 UTC) · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (feuille des 20 cycles terminée au 122e cycle ; on poursuit sa priorité, le parcours de bout en bout) · Tableau de bord produit : https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v (republié à chaque fin de cycle).

## Messages de Samuel traités (projet)
- 2026-10-23 06:37 UTC, carte : « Oui, envoyer » (Q604 : le nom du logement saisi part à Google Text Search). Appliqué par #720 (texte d'aide, 0125 § 6).
- 2026-10-23 ~06:38 UTC : `owner-approved` posé sur #707 ; 06:53 UTC : run `db-migrate` 39914241178 lancé par Samuel, **réussi** (0017 et 0018), consigné sur #706.
- 2026-10-23 07:21 UTC, carte : « Une seule » révision par voyage, part Google comprise (Q613 : 13,75 USD au plus par voyage). Appliqué par #722.

## Fait
- **#707** fusionné (06:37 UTC) puis migrations 0017 et 0018 appliquées par Samuel : le formulaire de l'app peut lancer le programme sur le site d'essai dès que #701 est fusionnée.
- **Lot 4 fusionné** (#717, ticket #713, 07:29 UTC) : « Pas pour moi » déclenche une révision écrite par l'IA (décision 0126). Fusionné avec deux révisions, juste avant la correction ; la limite à une révision passe par #722.
- **#720** fusionné (ticket #719) : l'aide du logement dit qu'il part aussi à Google ; « nous conservons 29 jours ».
- **Statut du 149e cycle** (#718) fusionné.

## En cours
- **#722 `[ia]`** (ticket #721) : une seule révision par voyage ; correction 1 poussée par le CEO (`6e3386d` : 0126 cite la carte de Q613, qui donnait la part Google) ; relecture relancée.
- **Ticket #723 `[tl]`** : avis de sécurité Next.js qui arrête `next build` en local (Q612) ; le Tech Lead le vérifie par une source indépendante et décide.
- **#701 `[release]`** : attend la fusion de Samuel (demandée de nouveau le 23 octobre à 06:58 UTC) ; description à jour (lots 1 à 5, migrations appliquées).
- Toujours en attente : #527 (Q438), #583 (Q538), #500 gelée, #534/#547 (Q518-Q519), #664 et B10c/B10d, densité (Q595).

## Bloqué
- **Test de bout en bout par Samuel** : fusion de #701 seulement.
- **Ancienne chaîne en préversion** : Q538, Q551, Q556 sans objet pour le test de bout en bout ; à revoir pour le MVP.
- **Badge « fermé ce jour-là »** : Q564. **Purge du MVP** et `coords-purge` en échec (#527) : Q438.

## Prochain cycle
1. Après la fusion de #701 et le redéploiement : envoyer à Samuel un seul lien pour tester « Créer un voyage » jusqu'au programme.
2. Relire #722 et la PR du ticket #723.
3. Note de version suivante : lister 0125, 0126, les textes non maquettés (#716, #720) ; corriger v2026.10.22-21 (migration 0016 appliquée le 22 octobre à 11:48 UTC, run 39773388536).

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
- Aucune ; Q604 et Q613 répondues.

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
