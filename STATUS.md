# État du studio — 2026-10-15 (77e cycle, à la demande de Samuel)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle.

## Messages de Samuel traités (projet)
- Fil du cycle, 2026-10-15 : 12:45 UTC, « les trois fichier sont commit » → tests protégés de #376 déposés par Samuel (426b08f, identiques aux versions préparées), revue relancée. 13:20 UTC, « c'est quoi l'état ? » → réponse. 13:36 UTC, `owner-approved` sur #376 et « c'est fait » ; question « on avance ou on stagne ? » → liste des étapes restantes. 13:38 UTC, délai de veto ramené à 6 heures → décision 0068 (#378) ; confirmation et portée demandées par carte (13:46 UTC). 13:44 UTC, « go lance un cycle » → ce 77e cycle.
- #studio : aucun nouveau message.

## Fait
- Fusionnés depuis le 76e cycle : #376 (contrôle de chiffrement côté client, décision 0067, avec `owner-approved` ; Samuel accepte par ce clic le risque résiduel proxy→compute de Neon), #377 (état du 76e cycle).
- **A13 fait** : `db-migrate` sur main (run 38744422089, 13:38 UTC) : **lot 1 appliqué à la vraie base** (0000_socle, 0001_securite, 0002_place_coordinates, 0003_prototype, 0004_rate_limit_expires_at).
- **A15 fait** : premier lancement manuel de `p0-purge` réussi (run 38744737862, 13:40 UTC).

## En cours
- data : A14, PR d'approbation du lot 2 (`0005_prototype_coordinates_run`), verdict Sécurité à la revue, puis `owner-approved` de Samuel.
- #378 (décision 0068) : changements demandés par le Tech Lead (gabarit de note de version, renvois aux spécifications, portée rétroactive) ; correction après la réponse de Samuel à la carte.

## Bloqué
- **Premier essai réel** (lancé par Samuel seul) : lot 2 (A14, `owner-approved`), relevés `db-releve` par la Sécurité (A16 ; 0057 définitive selon la portée de 0068), PR de déverrouillage (A17), limites de dépense OpenRouter et Google (Q325) ; accord écrit de Samuel (0055).
- **B8c** : Q445. **B6a** : B3b. **B8a** : B7a, B7c. **B3c** : Q401. **Code de B4** : Q351, Q352, Q364.

## Prochain cycle
1. Seulement le chemin de l'essai réel.
2. Lot 2 (A14) puis A16 (`db-releve`) et A17 (déverrouillage) ; correction de #378 selon la carte.

## Décisions attendues de Samuel
- **Réponse demandée** : carte « Appliquer le délai de 6 heures aussi aux décisions déjà en attente ? » (fil du cycle, 13:46 UTC). Bientôt : `owner-approved` sur le lot 2.
- **Rappel** : Q438 (extension de Q321 et Q322 à la purge du MVP, avec les actions à 18 h ajoutées par la correction 1 de 0060).
- **Rappel aussi** : Q420 (coller les étapes 7, 7 bis et 8 dans la routine R1, #307).
- **Déjà posées** : Q410, Q401, Q397, Q394, Q378, Q263, Q353, Q354, Q345, Q332, Q323, Q325, Q317, Q296, Q297, Q288, P0c-Q2.
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
