# État du studio — 2026-10-13 (44e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle. Le 44e cycle est le cycle planifié de 02:07 CEST.

## Messages de Samuel traités (#studio et projet)
- #studio et fils du projet : aucun nouveau message de Samuel depuis le résumé du 43e cycle.

## Fait
- Fusionnées :
  - **P0c (#193)**, spécification du confinement des capacités ;
  - **T20 (#177)**, nettoyage après fusion, puis ses suites #202 et T22 (#206) ;
  - **P0a1 (#180)**, après une fusion de `main` par le CEO (`e1c9db6`) : la version de #180 est gardée sur les conflits, et `src/domain/textes.ts` reçoit les libellés des catégories ajoutées par F8a ;
  - **décision 0037 (#205)** : le Tech Lead tranche B2-TL-1 à 5 (Q298) et amende 0010 § 6 et § 7 ;
  - **F-ICU (#207, ticket #171)** : formatage des nombres partagé (`src/lib/nombre.ts`), sans changement visible.
- **P0b1 (#208, ticket #203)** : adaptateur `prototype` sur un programme de test, relecteur simulé seulement, liste blanche, aucun cache. Il est en revue ; la PR modifie le job `docker` de la CI.
- Corrections :
  - **F10a (#186)** : fusion de `main` (`4d2acaf`) pour relancer la CI, que le commit du robot des instantanés n'avait pas relancée ;
  - **B1 (#188)**, correction 2 (`9d5d093`) : écouteur d'erreur du pool, messages sans rôle reçu, `migrate.ts` et `db-setup.sh` durcis. Le Tech Lead l'approuve ;
  - **T18 (#199)**, correction 1 (`a060d2a`) : `set -o pipefail`, annexe D alignée et testée, `main` fusionnée après #177. Le Tech Lead l'approuve ;
  - **spec B2 (#198)**, correction 1 (`c48cd0a`) : les 8 bloquants sont corrigés, mais la revue en trouve 2 nouveaux sur le test de catégories (notation des clés).

## En cours
- En revue : #186 (F10a), #208 (P0b1).
- Approuvées par le Tech Lead, en attente de `owner-approved` : #188 (B1), #199 (T18).
- #198 (spec B2) : changements demandés ; c'est sa correction 2, la dernière autorisée.

## Bloqué
- **Exécutions réelles de P0** : #195 (exigence d'entrée du code de P0r1), décisions P0c-TL-1 à 5 (Q301) avant le code de P0c, puis P0-suite-2 (#173).
- **Code de B2** : spec #198, puis fusion de F10a (#186).

## Prochain cycle
1. Correction 2 de la spec B2 (#198) : notation `Schéma[variante].champ` du test de catégories.
2. Suivre les revues de #186 et #208.
3. **#195** (P0a1 bis, rôle `ia`) après la revue de #208, qui touche aussi la garde des imports.
4. Décisions du Tech Lead P0c-TL-1 à 5 (Q301), puis code de P0c.
5. Chore : amendement de 0032, pour les écarts acceptés sur #180 et, si le Tech Lead les valide, sur #208 (Q302).
6. F7a, puis F10b après F10a.

## Décisions attendues de Samuel
- **Actions** :
  - poser `owner-approved` sur **#188** (B1), **#199** (T18) et **#208** (P0b1) : toutes trois modifient `.github/workflows` ;
  - plafond de quota de Maps JavaScript API (Q263) ;
  - Vercel : la limite de 100 déploiements par jour est de nouveau atteinte (00:20 UTC) ; les préversions échouent jusqu'au passage en Pro.
- **Nouvelles** : aucune.
- **Déjà posées** : Q296 (texte de la routine de revue R2, recommandation a), Q297 (règle `owner-approved` dans `CLAUDE.md`), Q294, Q288.
- **Pour confirmation** : **Q285**. Recommandation : laisser la production telle quelle jusqu'à la mise en public, comme Samuel l'a dit à 13:49 CEST ; aucun réglage Vercel à faire.
- **Toujours ouvertes** :
  - juridique : Q5 (validation formelle), Q6, Q29, Q34, Q38, Q44, Q46, Q47, Q75, Q127, Q150 ;
  - argent et comptes : Q25, Q26, Q39, Q45, Q56, Q84 ;
  - offre : Q57, Q63, Q67, Q76, Q78, Q88 à Q90, Q128, Q133, Q135, Q149 ;
  - documents et environnement : Q12, Q59, Q40, Q101 ;
  - Ligne : Q19 (avec Q226), Q37, Q108, Q130 ;
  - règles : Q23.
- **Veto possible** :
  - 2 jours après leur publication dans la note de version : 0011 (sauf S4 et S5), 0031, 0032, 0037, décisions B1-PO-1 à 6 (#185) ;
  - avant le 2026-10-15 : décisions B2-PO de la spec B2 (#198) ;
  - avant le 2026-10-14 : décision 0025.

## Questions ajoutées
- Q302 (Tech Lead) : écarts de P0b1 à 0032 § A6.2 et § A6.6.
- Q303 (UX/UI) : libellés de la section « Prototype » et place de la mention d'attribution.
- Q304 (UX/UI) : rendu « 1er » des titres de journée de B2.
- Q298 tranchée par la décision 0037.

## Part d'usage estimée
- 44e cycle : 6 sous-agents, 3 au plus en même temps :
  - correction de B1 (0,11 M de jetons) ;
  - correction de la spec B2 (0,14 M) ;
  - correction de T18 (0,08 M) ;
  - décision 0037 (0,15 M) ;
  - F-ICU (0,10 M) ;
  - P0b1 (0,41 M).
- S'y ajoute le travail du CEO (deux fusions de `main`, environ 0,15 M).
- Total : environ 1,1 M de jetons (estimation).
- Part de l'abonnement : impossible à mesurer depuis la routine.
