# État du studio — 2026-10-12 (41e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle. Le 41e cycle est le cycle planifié de 17:07 CEST.

## Messages de Samuel traités (#studio et projet)
- #studio et fils du projet : aucun nouveau message de Samuel depuis le résumé du 40e cycle.

## Fait
- Fusionnée : **chore: status du 40e cycle (#187)**.
- **Spec P0-suite (#172)** : la 3e tentative ayant échoué, la rédaction est passée au rôle Sécurité (décision du CEO annoncée au 40e cycle). Les bloquants 1 à 8 sont corrigés sur le fond (`0190606`). La nouvelle revue (Tech Lead et Sécurité) demande encore des changements.
- **P0a1 (#180)** : correction 1 poussée (`e0074ab`), approuvée par le Tech Lead. La Sécurité garde 1 bloquant, corrigé en partie seulement (cas négatifs de `imports.test.ts`).
- **Décision 0034 (#182)** :
  - correction 2 (`b87d3ca`) refusée sur 3 points de texte ;
  - le CEO choisit une 3e tentative plutôt qu'un découpage, car les points sont localisés et décrits par le Tech Lead ;
  - correction 3 poussée (`647cb1d`) : tension avec `CONTEXT.md` reconnue, heure de vérification corrigée.
- **Spec T18 (#183)** : correction 1 poussée (`02c46af`) : lecture `git diff -z`, retrait d'`owner-approved` sur `opened`, `reopened` et tout push qui change les workflows, calculs faits dans la CLI.
- **B1 (#188, ticket #184)** : socle base de données ouvert. `verify` local vert avec Postgres (158 tests de base), hors captures visuelles (écart de polices connu). La PR modifie `.github/workflows/ci.yml`, donc **Samuel doit poser `owner-approved`**.

## En cours
- En revue : #167 (F8a), #179 et #180 (P0a1), #172 (P0-suite), #182 (0034), #183 (T18), #186 (F10a), #188 (B1).
- **T20 (#177)** : `techlead-approved` et `owner-approved` posés ; attend la fusion automatique.
- Contrainte du jour : pas de préversion Vercel jusqu'au passage en Pro ; les contrôles qui en dépendent sont notés bloqués, sans relance.

## Bloqué
- **Exécutions réelles de P0** : après P0r1 (#172), puis P0-suite-2 (#173) et ses exigences d'entrée 1 à 4.
- **B7 à B9** : il faut encore B1 (#188), B2 et P0r1.

## Prochain cycle
1. **#172** : correction suivante décidée avec le Tech Lead (on est au-delà de deux corrections ; tentative de plus ou découpage).
2. **#180** : correction 2 (bloquant Sécurité). **#182** et **#183** : suivre la revue. Après toute correction, retirer puis reposer `needs-review`.
3. Chore séparée : amendement de 0032 pour consigner les écarts acceptés par le Tech Lead sur #180.
4. **B2** (backend, spec d'abord), puis B5. Après #179 et #180 : **P0b1**.
5. F7a et #171 après F8a ; F10b après F10a.

## Décisions attendues de Samuel
- **Actions** :
  - passer Vercel en Pro (annoncé pour ce soir) ;
  - poser `owner-approved` sur **#188** (B1 touche la CI) ;
  - plafond de quota de Maps JavaScript API (Q263).
- **Nouvelles** :
  - **Q285** : faut-il couper le déploiement automatique de la production ? Aujourd'hui, chaque fusion est publiée sur un domaine public.
  - Q286 : confirmer la lecture de « on laisse » ;
  - Q287 et Q288 (#172) ;
  - Q289 : job `db` obligatoire ;
  - Q292 : préfixe de commit du Product Owner.
- **Déjà posées** : Q268 à Q270, Q272 à Q275, Q278 à Q280.
- **Toujours ouvertes** :
  - juridique : Q5 (validation formelle), Q6, Q29, Q34, Q38, Q44, Q46, Q47, Q75, Q127, Q150 ;
  - argent et comptes : Q25, Q26, Q39, Q45, Q56, Q84 ;
  - offre : Q57, Q63, Q67, Q76, Q78, Q88 à Q90, Q128, Q133, Q135, Q149 ;
  - documents et environnement : Q12, Q59, Q40, Q101 ;
  - Ligne : Q19 (avec Q226), Q37, Q108, Q130 ;
  - règles : Q23.
- **Veto possible** :
  - 2 jours après leur publication dans la note de version : 0011 (sauf S4 et S5), 0031, 0032, décisions B1-PO-1 à 6 (#185) ;
  - avant le 2026-10-14 : décision 0025 ;
  - avant le 2026-10-13 : décisions listées au 39e cycle.

## Part d'usage estimée
- 41e cycle : 4 sous-agents, 3 au plus en même temps :
  - Sécurité sur #172 (0,21 M de jetons) ;
  - correction de P0a1 (0,14 M) ;
  - code de B1, lancé au 40e cycle (0,14 M) ;
  - correction de la spec T18 (0,13 M).
- S'y ajoute le travail du CEO : correction 3 de 0034, suivi des PR, ce statut.
- Total : environ 1 M de jetons (estimation).
- Part de l'abonnement : impossible à mesurer depuis la routine.
