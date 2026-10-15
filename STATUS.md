# État du studio — 2026-10-15 (75e cycle, à la demande de Samuel)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle.

## Messages de Samuel traités (projet)
- Fil du cycle, 2026-10-15 : 10:24 UTC, « Je le fais » sur la carte de Q452 → fichier et différence préparés pour lui. 11:06 UTC, « c'est fait » : Samuel a poussé lui-même la correction de `tests/unit/ci/db-migrate.test.ts` sur #374 (d5ed663) → revue lancée. 11:14 et 11:15 UTC, questions sur l'avancement → réponses dans le fil. 11:31 UTC, « lance un cycle » → ce 75e cycle.
- #studio : aucun nouveau message.

## Fait
- Fusionnés depuis le 74e cycle : #365 (`db-reverrouillage`, 0056, avec `owner-approved` de Samuel), #369 (mise à jour de `p0-reel` depuis `main`, par Samuel), #372 (suites mineures de #367, ticket #370), #371 (état du 74e cycle).
- Ouverte : #374, A12, lot 1 des migrations approuvé dans `db-migrate` (0000 à 0004 ; la 0005 reste pour le lot 2). Revue consolidée sur d5ed663 : Tech Lead approuvé, Sécurité G1 à G6 accordé, aucun bloquant ; `verify` vert ; `techlead-approved`. Mineurs notés pour plus tard (mutations supplémentaires, trou antérieur de `tests/support/workflows.ts:116`, commentaire d'en-tête de 0004).

## En cours
- Aucun agent : seul #374 est sur le chemin de l'essai réel, et il n'attend plus que Samuel.

## Bloqué
- **Premier essai réel** (lancé par Samuel seul) : `owner-approved` de Samuel sur #374 (PR de workflow, 0035), puis A13 (premier passage de `db-migrate` sur la vraie base ; Samuel vérifie l'environnement et les secrets, que le studio ne peut pas lire), lot 2 (0005) ; relevés `db-releve` après 0057 définitive ; limites de dépense OpenRouter et Google (Q325) ; accord écrit de Samuel (0055).
- **Purge `p0-purge`** : premier lancement manuel après les migrations du lot 1 (A15).
- **B8c** : Q445. **B6a** : B3b. **B8a** : B7a, B7c. **B3c** : Q401. **Code de B4** : Q351, Q352, Q364.

## Prochain cycle
1. Seulement le chemin de l'essai réel.
2. Après `owner-approved` et la fusion de #374 : A13 (premier passage de `db-migrate`), puis lot 2 (0005) et premier lancement de `p0-purge`.

## Décisions attendues de Samuel
- **Réponse demandée** : `owner-approved` sur #374 (lot 1 des migrations, revue approuvée sans bloquant).
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
