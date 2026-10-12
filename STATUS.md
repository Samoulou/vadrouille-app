# État du studio — 2026-10-12 (42e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle. Le 42e cycle est le cycle planifié de 20:07 CEST.

## Messages de Samuel traités (#studio et projet)
- #studio et fils du projet : aucun nouveau message de Samuel depuis le résumé du 41e cycle.

## Fait
- Fusionnées : **décision 0034 (#182)** et **chore: status du 41e cycle (#189)**.
- **Spec P0-suite (#172) découpée** (décision du CEO avec le Tech Lead : les bloquants ne convergeaient pas) :
  - #172 réduite au cadre, aux clients et à P0r1 (`335d925`), avec le refus du TLS affaibli et l'amendement de 0031 ; elle est en revue ;
  - le régime de confinement des capacités et de l'environnement devient la **spec P0c (#193, ticket #191)**, exigence d'entrée de P0r2 ; elle est en revue.
- **B1 (#188)** : correction 1 poussée (`99c30a9`) ; elle est en revue :
  - adresses de test sans mot de passe, `url` limitée à `https://` ;
  - garde `session_user = current_user` ;
  - `main` fusionnée.
- **Décision 0036 (#192, ticket #190)** : décisions B1-TL-1 à TL-4 du Tech Lead, qui débloquent #188 ; elle est en revue.
- **P0a1 (#180)** : correction 2, la dernière autorisée (`2eecd59`) ; elle est en revue. La garde des imports passe en liste d'autorisation, et 21 fichiers sont réécrits sans changer les sorties.
- **Spec T18 (#183)** : correction 2 (`c4845b2`), sur la concurrence ; elle est en revue. Libellé `docs-only` retiré, car inexact.

## En cours
- En revue : #167 (F8a), #172, #179 et #180 (P0a1), #183, #186 (F10a), #188, #192, #193.
- **T20 (#177)** : attend la fusion automatique.

## Bloqué
- **Exécutions réelles de P0** : P0r1 (#172), puis P0c (#193) et son code avant P0r2, puis P0-suite-2 (#173).
- **B7 à B9** : B1 (#188, après #192), B2 et P0r1.

## Prochain cycle
1. Suivre les revues : #172, #180, #183, #188, #192, #193.
2. Si la revue de #180 échoue encore, le CEO décide avec le Tech Lead (3 tentatives faites).
3. **B2** : spec d'abord (Product Owner). Après #179 et #180 : **P0b1**.
4. Chore : amendement de 0032, pour les écarts acceptés sur #180.
5. Après P0c : son code, découpé en P0c1 (back) et P0c2 (release).

## Décisions attendues de Samuel
- **Actions** :
  - poser `owner-approved` sur **#188** (B1 modifie la CI) ;
  - plafond de quota de Maps JavaScript API (Q263) ;
  - après la fusion de T18 (#183) : retirer puis reposer `owner-approved` sur #177 et sur toute PR de workflow déjà approuvée.
- **Nouvelles** :
  - **Q294** : migrations au staging, workflow GitHub plutôt que construction Vercel ;
  - **Q288 reformulée** : contrôle obligatoire et indépendance du verdict Sécurité, options a, b ou c.
- **Pour confirmation** : **Q285**. Recommandation : laisser la production telle quelle jusqu'à la mise en public, comme Samuel l'a dit à 13:49 CEST ; aucun réglage Vercel à faire.
- **Déjà posées** : Q268 à Q270, Q272 à Q275, Q278 à Q280, Q286, Q287, Q289, Q292.
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
- 42e cycle : 7 sous-agents, 3 au plus en même temps :
  - avis du Tech Lead sur #172 (0,08 M de jetons) ;
  - réduction de #172 (0,17 M) ;
  - correction de B1 (0,23 M) ;
  - correction de P0a1 (0,21 M) ;
  - spec P0c (0,22 M) ;
  - décision 0036 (0,11 M) ;
  - correction de T18 (0,12 M).
- S'y ajoute le travail du CEO.
- Total : environ 1,3 M de jetons (estimation).
- Part de l'abonnement : impossible à mesurer depuis la routine.
