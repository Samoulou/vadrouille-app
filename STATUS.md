# État du studio — 2026-10-13 (45e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle. Le 45e cycle est le cycle planifié de 05:07 CEST.

## Messages de Samuel traités (#studio et projet)
- #studio et fils du projet : aucun nouveau message de Samuel depuis le résumé du 44e cycle.

## Fait
- Fusionnées :
  - **F10a (#186)**, écran « Aujourd'hui » en ligne et bandeau hors ligne ;
  - **spec B2 (#198)**, après sa correction 2 (la dernière autorisée) ;
  - **amendement de la décision 0032 (#211)** : écarts acceptés sur P0a1 ;
  - **P0b1 (#208, ticket #203)**, après sa correction 1 : test sans cache (`pnpm test:prototype-cache`), lien de la feuille de détail vérifié, mention « Données de lieux : Google » sur les écrans 6, 13 et 15 en mode prototype, captures dans `docs/ux/captures/P0b1/`.
- **Décision 0038 (#210)** : le Tech Lead tranche P0c-TL-1 à 5 (Q301). La revue demande 2 corrections (périmètre du vérificateur de types, zone de la ligne `typescript`) ; la correction 1 est en cours.
- **F10b (#212, ticket #141)** : manifeste, service worker écrit à la main, page de repli `/hors-ligne`. `pnpm verify` au vert hors étape visuelle (mêmes 53 échecs de polices que sur `main`). La fusion attend la décision écrite du Tech Lead sur Q146.

## En cours
- En revue : #212 (F10b), #210 (décision 0038, correction 1).
- Approuvées par le Tech Lead, en attente de `owner-approved` : #188 (B1), #199 (T18).

## Bloqué
- **Exécutions réelles de P0** : #195 (exigence d'entrée du code de P0r1), décision 0038 avant le code de P0c, puis P0-suite-2 (#173). P0c2 attend aussi P0c-Q2 (Samuel).
- **Fusion de F10b (#212)** : décision écrite du Tech Lead sur Q146 (et Q144).

## Prochain cycle
1. Suivre les revues de #210 (0038) et de #212 (F10b) ; décision du Tech Lead sur Q146 et Q144.
2. **Code de B2** : spec, 0037, F10a et P0b1 sont fusionnées.
3. **#195** (P0a1 bis, rôle `ia`), maintenant que #208 est fusionnée.
4. F7a (adaptateurs et `fr.json` libres depuis la fusion de #208).
5. Code de P0c1 après la fusion de 0038.
6. F10c après F10b.

## Décisions attendues de Samuel
- **Actions** :
  - poser `owner-approved` sur **#188** (B1) et **#199** (T18) : toutes deux modifient `.github/workflows`. #208 a été fusionnée sans ce libellé, car la règle T18 (#199) n'est pas encore en place ;
  - plafond de quota de Maps JavaScript API (Q263) ;
  - Vercel : les préversions se construisent de nouveau depuis 03:44 UTC (nouvelle journée de quota). Le passage en Pro reste conseillé : le studio dépasse 100 déploiements par jour.
- **Nouvelles** : aucune.
- **Déjà posées** : Q296 (texte de la routine de revue R2, recommandation a), Q297 (règle `owner-approved` dans `CLAUDE.md`), Q294, Q288, P0c-Q2.
- **Pour confirmation** : **Q285**. Recommandation : laisser la production telle quelle jusqu'à la mise en public ; aucun réglage Vercel à faire.
- **Toujours ouvertes** :
  - juridique : Q5 (validation formelle), Q6, Q29, Q34, Q38, Q44, Q46, Q47, Q75, Q127, Q150 ;
  - argent et comptes : Q25, Q26, Q39, Q45, Q56, Q84 ;
  - offre : Q57, Q63, Q67, Q76, Q78, Q88 à Q90, Q128, Q133, Q135, Q149 ;
  - documents et environnement : Q12, Q59, Q40, Q101 ;
  - Ligne : Q19 (avec Q226), Q37, Q108, Q130 ;
  - règles : Q23.
- **Veto possible** :
  - 2 jours après leur publication dans la note de version : 0011 (sauf S4 et S5), 0031, 0032 et son amendement (#211), 0037, décisions B1-PO-1 à 6 (#185) ;
  - avant le 2026-10-15 : décisions B2-PO de la spec B2 (#198) ;
  - avant le 2026-10-14 : décision 0025.

## Questions ajoutées
- Q305 (UX/UI) : icônes définitives et couleurs du manifeste de F10b.
- Q306 (Tech Lead) : identifiant de build pour versionner le service worker.
- Q307 (UX/UI) : annoncer « nouvel onglet » aux lecteurs d'écran sur les liens externes.

## Part d'usage estimée
- 45e cycle : 6 sous-agents, 3 au plus en même temps :
  - correction 2 de la spec B2 (0,17 M de jetons) ;
  - décision 0038 (0,17 M) ;
  - amendement de 0032 (0,15 M) ;
  - correction 1 de P0b1 (0,19 M) ;
  - F10b (0,34 M) ;
  - correction 1 de 0038 (en cours, environ 0,15 M).
- S'y ajoute le travail du CEO (environ 0,1 M).
- Total : environ 1,3 M de jetons (estimation).
- Part de l'abonnement : impossible à mesurer depuis la routine.
