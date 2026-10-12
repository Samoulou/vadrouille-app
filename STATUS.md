# État du studio — 2026-10-12 (43e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle. Le 43e cycle est le cycle planifié de 23:07 CEST.

## Messages de Samuel traités (#studio et projet)
- #studio et fils du projet : aucun nouveau message de Samuel depuis le résumé du 42e cycle.

## Fait
- Fusionnées :
  - **P0r1 (#172)**, spec réduite : cadre et clients réels, avec `maxRetries: 0` et les imports nommés ; les points restants passent à P0r2 (#173) ;
  - **décision 0036 (#192)** : décisions B1-TL-1 à TL-4, avec 0007, 0011 et les handovers amendés ;
  - **F8a (#167)** : création de voyage, écrans 1 et 2 ;
  - **P0a1, partie 1 (#179)** : schéma réduit et configuration, après une correction (`Object.hasOwn`).
- **P0a1 (#180), découpage** (décision du CEO avec le Tech Lead) :
  - troisième et dernière tentative ; les 4 points demandés sont corrigés ;
  - deux bloquants tardifs restaient : #180 fusionne en l'état, avec le correctif de #179 reporté ;
  - ces bloquants passent au ticket **#195**, exigence d'entrée du code de P0r1 ;
  - le Tech Lead a approuvé ; la PR attend la fusion automatique.
- **P0c (#193)** : corrections 1 et 2 poussées (`fb1a906`) ; elle est en revue. Elle pose **Q296** à Samuel (texte de la routine de revue).
- **B1 (#188)** : alignée sur 0036, avec `main` fusionnée et les mineurs corrigés (`f0dbd0a`). Le Tech Lead approuve sous réserve de la CI ; la Sécurité a un bloquant tardif (écouteur d'erreur du pool).
- **Spec B2 (#198, ticket #196)** : écrite par le Product Owner ; la revue demande 8 corrections.
- **Code T18 (#199)** : décision 0035 et contrôle `owner-approved` dans `techlead-gate`. La revue demande des corrections (dont `pipefail`).
- **F10a (#186)** : correction 1 poussée, avec les captures régénérées sur la CI. UX/UI est conforme. Seul bloquant : aucune CI n'a tourné sur le commit du robot des captures.

## En cours
- En revue : #193 (P0c, correction 2).
- Approuvées, en attente de fusion : #180 (P0a1), #177 (T20).
- Changements demandés, à relancer au prochain cycle : #186, #188, #198, #199.

## Bloqué
- **Exécutions réelles de P0** : code de P0r1 (après #195), puis P0c (#193) et son code avant P0r2, puis P0-suite-2 (#173).
- **B5** : code de B2, après la spec B2 (#198) et F10a (#186) (Q300).
- **B7 à B9** : B1 (#188), B2 et P0r1.

## Prochain cycle
1. Relancer les corrections :
   - #186 : un push pour relancer la CI ;
   - #188 : écouteur d'erreur du pool ;
   - #198 : 8 points ;
   - #199 : `pipefail` et mineurs.
2. Suivre la revue de #193. Si elle échoue, le CEO décide avec le Tech Lead (2 corrections faites).
3. **P0b1**, après la fusion de #180. Puis le ticket **#195**.
4. Chore : amendement de 0032, pour les écarts acceptés sur #180.
5. F7a et F-ICU (#171), maintenant que F8a est fusionnée ; F10b après F10a.

## Décisions attendues de Samuel
- **Actions** :
  - poser `owner-approved` sur **#188** (B1 modifie la CI) et sur **#199** (T18 modifie `techlead-gate`) ;
  - plafond de quota de Maps JavaScript API (Q263) ;
  - après la fusion de T18 (#199) : retirer puis reposer `owner-approved` sur #177 et sur toute PR de workflow déjà approuvée ;
  - Vercel : la limite de 100 déploiements par jour est de nouveau atteinte, et les préversions échouent jusqu'au passage à l'offre Pro.
- **Nouvelles** :
  - **Q296** : texte de la routine de revue, options a, b ou c (recommandation : a) ;
  - **Q297** : règle `owner-approved` dans `CLAUDE.md`.
- **Pour confirmation** : **Q285**. Recommandation : laisser la production telle quelle jusqu'à la mise en public ; aucun réglage Vercel à faire.
- **Déjà posées** : Q268 à Q270, Q272 à Q275, Q278 à Q280, Q286 à Q289, Q292, Q294.
- **Toujours ouvertes** :
  - juridique : Q5 (validation formelle), Q6, Q29, Q34, Q38, Q44, Q46, Q47, Q75, Q127, Q150 ;
  - argent et comptes : Q25, Q26, Q39, Q45, Q56, Q84 ;
  - offre : Q57, Q63, Q67, Q76, Q78, Q88 à Q90, Q128, Q133, Q135, Q149 ;
  - documents et environnement : Q12, Q59, Q40, Q101 ;
  - Ligne : Q19 (avec Q226), Q37, Q108, Q130 ;
  - règles : Q23.
- **Veto possible** :
  - 2 jours après leur publication dans la note de version : 0011 (sauf S4 et S5), 0031, 0032, 0036, décisions B1-PO-1 à 6 (#185) ;
  - avant le 2026-10-14 : décision 0025, amendement de 0007 par 0036, décisions B2-PO-1 à 11 (#198, si fusionnée) ;
  - avant le 2026-10-13 : décisions listées au 39e cycle.

## Part d'usage estimée
- 43e cycle : 12 sous-agents, 3 au plus en même temps :
  - avis du Tech Lead sur #180 et #172 (0,09 M de jetons) ;
  - décision 0036, deux corrections (0,20 M) ;
  - P0c, deux corrections (0,34 M) ;
  - P0a1 (#180), correction 3 (0,11 M) ;
  - P0a1 (#179), correction 1 (0,11 M) ;
  - P0r1 (#172), correction bornée (0,12 M) ;
  - B1, mise à jour (0,18 M) ;
  - spec B2 (0,25 M) ;
  - code T18 (0,16 M) ;
  - F10a, correction 1 (0,12 M).
- S'y ajoute le travail du CEO.
- Total : environ 1,8 M de jetons (estimation).
- Part de l'abonnement : impossible à mesurer depuis la routine.
