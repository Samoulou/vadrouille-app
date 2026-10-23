# État du studio — 2026-10-23 (147e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 2 heures (routine « Vadrouille - Cycle (projet) », 7 */2 * * * UTC), au plus 4 fils en parallèle (Samuel, 2026-10-19 21:40 UTC) · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (feuille des 20 cycles terminée au 122e cycle ; on poursuit sa priorité, le parcours de bout en bout) · Tableau de bord produit : https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v (republié à chaque fin de cycle).

## Messages de Samuel traités (projet)
- Aucun message de Samuel depuis le 146e cycle.

## Fait
- **Lot 3 fusionné** (#704, ticket #702, 23 octobre 01:20 UTC) : le formulaire de l'app lance `p0Run` sur le brief saisi et mène à l'écran 5 ; migration `0017_brief_saisi_prototype` ; décision 0125 définitive. Revue finale : Tech Lead conforme, Sécurité acceptable, UX/UI approuvé, 9 mineurs.
- **Statut du 146e cycle** (#705) fusionné.
- **Report #701** mis à jour : il porte aussi le lot 3 ; la description dit que le lancement depuis le formulaire ne marche qu'après la migration 0017, et que la fusion peut se faire avant.

## En cours
- **#707 `[data]`** (ticket #706) : ajoute `0017_brief_saisi_prototype` à `MIGRATIONS_APPROUVEES` (empreinte `72a428bf…`). Après le Tech Lead : `owner-approved` de Samuel, puis run `db-migrate` par Samuel.
- **Ticket #708 `[ia]` lot 5** : « à éviter » transmis à l'IA (lancé).
- **Ticket #709 `[front]`** : mineurs 1, 2 et 4 à 8 de la revue finale de #704 (lancé ; le mineur 3 attend Q604).
- **#701 `[release]`** : attend la fusion de Samuel (demandée le 22 octobre à 22:12 UTC).
- Toujours en attente : #527 (Q438), #583 (Q538), #500 gelée, #534/#547 (Q518-Q519), #664 et B10c/B10d, densité (Q595).

## Bloqué
- **Lot 3 testable** : fusion de #707 (`owner-approved`), run `db-migrate`, fusion de #701. Usage réel avec un logement saisi : Q604 (Samuel, carte du 23 octobre 00:56 UTC) et Q606 (Sécurité).
- **Lot 4** : après le lot 5 (mêmes fichiers de la chaîne).
- **Ancienne chaîne en préversion** : Q538, Q551, Q556 sans objet pour le test de bout en bout ; à revoir pour le MVP.
- **Badge « fermé ce jour-là »** : Q564. **Purge du MVP** et `coords-purge` en échec (#527) : Q438.

## Prochain cycle
1. Après l'approbation du Tech Lead sur #707 : demander à Samuel `owner-approved`, puis le run `db-migrate`.
2. Après la fusion de #701 : envoyer à Samuel un seul lien pour tester la saisie, le tri et le déblocage simulé.
3. Relire les PR des tickets #708 et #709 ; lancer le lot 4 après le lot 5.
4. Note de version suivante : lister la décision 0125 (mineur 6 de #704) et corriger v2026.10.22-21 (elle dit la migration 0016 non appliquée, alors que Samuel l'a appliquée le 22 octobre à 11:48 UTC, run 39773388536).

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
- Q604 à Q610 (questions de #704).

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
