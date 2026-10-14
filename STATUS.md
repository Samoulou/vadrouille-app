# État du studio — 2026-10-14 (63e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle.

## Messages de Samuel traités (projet)
- 2026-10-14, 15:13 à 15:41 CEST (fil du projet) : règle de la branche `p0-reel` créée par Samuel (Settings, Rules), puis activée avec la cible `p0-reel` (« done »).
- 2026-10-14, 15:53 CEST (carte de décision) : « Garder » ; le code d'accès de l'essai réel (`P0_RUN_TOKEN`) reste tel quel, malgré son passage dans la trace d'un agent.
- 2026-10-14, 16:13 CEST (carte de décision) : « Francfort » ; les fonctions de Vercel tournent en `fra1` (amendement de la décision 0002, #322).
- #studio : aucun nouveau message depuis le 62e cycle.

## Fait
- Fusionnées depuis le 62e cycle : **spec B8** (#301), **P0r3c-1** (workflow `p0Run` et composition, #318), **décision 0058** (barrière de sortie sur le runtime de Vercel, exception étroite TLS, #320), **P0r3c-2** (ancrage restreint, fiches et budgets Routes, #323), statut du 62e cycle (#317).
- **P0r3c** découpée en trois PR par le CEO (P0r3c-1, -2, -3) ; les deux premières sont fusionnées.
- **Branche `p0-reel`** : créée, protégée par la règle de Samuel ; `P0_REAL_RUNS` et `P0_RUN_TOKEN` posés par le connecteur Vercel (D22, Q402).
- **Région `fra1`** (#322, ticket #321) : `vercel.json` et son test écrits ; description de la PR réécrite selon la revue.

## En cours
- **P0r3c-3** (ia-recherche) : suite de la composition du workflow `p0Run`.
- **Décision 0057** (#315) : correction 1 (Sécurité) ; trou du contrôle « fail-closed » et alignement du § 7.2 sur 0056 § 4.4.
- **Plafonds de l'essai** (#324, amendement 1 de `specs/P0-suite-2.md`) : correction 1 (Product Owner) ; le seuil de 95 par jour ne vaut plus pour Routes (Q330).
- En revue : région `fra1` (#322).

## Bloqué
- **Spec B6** (#308) : deux corrections utilisées, deux bloquants restants (J5 `Segment.estimated`, J6 jour `generating` de `edimbourgDebloque`) ; troisième tentative bornée (Q423), lancée au prochain créneau libre.
- **Relevé de la Sécurité sur `p0-reel`** (0055 § 1 point 3) : après #322, PR de `main` vers `p0-reel` ouverte par la Release et fusionnée par Samuel seul (D23 point 4).
- **Premier essai réel** : P0r3c-3 puis P0r3d ; P0r4 ; sur la base réelle, la PR du workflow des migrations et l'`owner-approved` de Samuel par lot (Q408).
- **PR du workflow des migrations** (`db-migrate.yml` et `db-releve.yml`, Q422) : Q419 (Tech Lead), fusion de 0057, `owner-approved` de Samuel.
- **Purge `p0-purge`** : en échec toutes les 6 heures tant que ses secrets sont vides (attendu, Q387).
- **B8** : décision de découpage (Q416), puis B7a et B7c. **B6a** : B3b. **B3c** : Q401. **Code de B4** : Q351, Q352, Q364.

## Prochain cycle
1. Après la fusion de #322 : la Release ouvre la PR `main` vers `p0-reel` pour Samuel, puis relevé de la Sécurité (CI absente, `VERCEL_GIT_COMMIT_REF`, région, condition 6).
2. Revue de P0r3c-3 ; P0r3d après sa fusion.
3. Spec B6 : troisième tentative bornée (Q423).
4. Décision de découpage de B8 (Q416).

## Décisions attendues de Samuel
- **Après la fusion de #322** : fusionner toi-même la PR de `main` vers `p0-reel` que la Release ouvrira (D23).
- **Rappel** : Q420 (coller les étapes 7, 7 bis et 8 dans la routine R1, #307) ; Q387 (a) et (b).
- **Déjà posées** : Q409, Q410, Q401, Q397, Q394, Q378, Q367, Q368, Q263, Q353, Q354, Q345, Q332, Q323, Q325, Q317, Q296, Q297, Q288, P0c-Q2.
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
  - 2 jours après leur publication dans la note de version : 0011 (sauf S4 et S5), 0031, 0032 et ses amendements (#211, 0045), 0037, 0040, 0046, 0048, 0049, 0050, 0051, 0054, 0058, décisions B1-PO-1 à 6 (#185).

## Questions ajoutées
- Q423 (CEO, tranchée) : spec B6.
- Q424 et Q425 (Tech Lead) : version du paquet `workflow` ; trace écrite de Q330 dans le port de consommation.
- Q426 (Sécurité) : lieu de traitement des données avant le passage en `fra1`.

## Part d'usage estimée
- 63e cycle (comptés depuis le 62e) : sous-agents terminés : spec B8 (bloquant tardif), réglages de `p0-reel` (Release), P0r3c-1 et P0r3c-2, décision 0058 ; 3 au plus en même temps.
- En cours, comptés au 64e cycle : P0r3c-3, 0057 correction 1, plafonds correction 1.
