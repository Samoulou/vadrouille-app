# État du studio — 2026-10-15 (76e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle.

## Messages de Samuel traités (projet)
- Fil du cycle, 2026-10-15 : 11:37 UTC, `owner-approved` sur #374 → fusionnée. 11:50 UTC, résultat de la requête en lecture demandée dans l'éditeur SQL de Neon pour `vadrouille_migrator` : `rolsuper` faux, `rolbypassrls` faux, `ssl` faux → les attributs du rôle sont corrects ; cause retenue : le contrôle `pg_stat_ssl` du workflow derrière le proxy Neon.
- #studio : aucun nouveau message.

## Fait
- Fusionnés depuis le 75e cycle : #374 (A12, lot 1 des migrations approuvé), #375 (état du 75e cycle).
- **A13 lancé puis refusé** : `db-migrate` sur main 585b09c (run 38728887188), échec dans le contrôle de session (SQLSTATE P0001), **aucune migration appliquée**, consigné sur #374. Pas de nouveau lancement avant l'analyse (0056 § 2.6.4).

## En cours
- Sécurité, avec le data : analyse de l'échec d'A13 et PR de workflow qui remplace le contrôle `pg_stat_ssl` (faux derrière le proxy Neon) sans affaiblir S9. Si `tests/unit/ci/db-migrate.test.ts` doit changer, la nouvelle version est préparée pour Samuel (garde-fou des agents, comme Q452).

## Bloqué
- **Premier essai réel** (lancé par Samuel seul) : correction du contrôle de chiffrement de `db-migrate` (PR de workflow, `owner-approved` de Samuel), puis A13 relancé, lot 2 (0005) ; relevés `db-releve` après 0057 définitive ; limites de dépense OpenRouter et Google (Q325) ; accord écrit de Samuel (0055).
- **Purge `p0-purge`** : premier lancement manuel après les migrations du lot 1 (A15).
- **B8c** : Q445. **B6a** : B3b. **B8a** : B7a, B7c. **B3c** : Q401. **Code de B4** : Q351, Q352, Q364.

## Prochain cycle
1. Seulement le chemin de l'essai réel.
2. Revue de la PR du contrôle de chiffrement, puis `owner-approved` de Samuel ; relancer A13, puis A15 et A14.

## Décisions attendues de Samuel
- **Bientôt** : `owner-approved` sur la PR qui corrige le contrôle de chiffrement de `db-migrate` (lien envoyé quand la revue l'aura approuvée).
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
