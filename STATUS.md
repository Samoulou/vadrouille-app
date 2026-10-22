# État du studio — 2026-10-22 (145e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 2 heures (routine « Vadrouille - Cycle (projet) », 7 */2 * * * UTC), au plus 4 fils en parallèle (Samuel, 2026-10-19 21:40 UTC) · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (feuille des 20 cycles terminée au 122e cycle ; on poursuit sa priorité, le parcours de bout en bout) · Tableau de bord produit : https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v (republié à chaque fin de cycle).

## Messages de Samuel traités (projet)
- Aucun message de Samuel depuis le 144e cycle (dernier : « Comment ? », 19:45 UTC, traité).

## Fait
- **Lot 2a fusionné** (#694, 20:14 UTC) : un nouvel essai remet le lien vers le site officiel de l'activité dans le détail de l'étape, après vérification que le site répond (0121, 0122, amendement 3).
- **Décision 0123** (règles allégées, décision de Samuel) fusionnée (#688, 20:13 UTC).
- **Note de version v2026.10.22-21** (#700) et statut du 144e cycle (#699) fusionnés.
- **Report vers le site d'essai ouvert** (#701, `main` à `d9df20c` vers `p0-reel`) : saisie (lot 2), premières propositions, tri et déblocage simulé (lot 1), site web de l'activité (lot 2a). Fusion par Samuel (« Create a merge commit ») ; migration 0016 déjà appliquée, aucun run `db-migrate`.
- **Lot 3 lancé** (ticket #702, branche `claude/702-e2e-lot-3`) : le formulaire de l'app lance `p0Run` sur le brief saisi et mène à l'écran 5. Décision 0125 réservée pour son contrat.

## En cours
- **Lot 3** (#702) : en cours de code ; migration du schéma `prototype`, puis `owner-approved` et run `db-migrate` par Samuel.
- **#701 `[release]`** : attend la fusion de Samuel, puis un lien de test lui sera envoyé.
- Toujours en attente : #527 (Q438), #583 (Q538), #500 gelée, #534/#547 (Q518-Q519), #664 et B10c/B10d, densité (Q595).

## Bloqué
- **Lot 5** (« à éviter » transmis à l'IA) : après le lot 3 (il étend sa conversion).
- **Lot 4** : après le lot 3.
- **Ancienne chaîne en préversion** : Q538, Q551, Q556 sans objet pour le test de bout en bout ; à revoir pour le MVP.
- **Badge « fermé ce jour-là »** : Q564. **Purge du MVP** (#527) : Q438.

## Prochain cycle
1. Après la fusion de #701 : envoyer à Samuel un seul lien pour tester « Créer un voyage », les écrans 1 à 3, le tri et le déblocage simulé, et relancer Rome pour voir le site web.
2. Relire la PR du lot 3 dès qu'elle est ouverte ; demander à Samuel l'`owner-approved` puis le run `db-migrate`.
3. Lots 4 et 5 après le lot 3.
4. Point pour le Tech Lead : `next build` affiche une recommandation de mise à jour de sécurité de Next.js.

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
- Aucune.

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
