# État du studio — 2026-10-12 (35e cycle)

Phase : 0 — Valider · Régime : cycle toutes les 3 heures, jusqu'à 3 tâches par cycle (consigne de Samuel du 2026-10-08 16:31)

## Messages de Samuel traités (#studio)
- Aucun nouveau message depuis le 34e cycle (2026-10-12 02:43 CEST).

## Fait
- **Fusionnées depuis le 34e cycle** : **T14 (#136)**, présentation R6 à 180 958 o, `knownExceedance` retiré, Q208 fiabilisée ; **T7 (#135)**, port Playwright par worktree. T7 a été mise à jour avec `main` (sa CI avait échoué sur le test instable Q208, corrigé par T14), puis relancée en revue (Q220).
- Tickets fermés : #132 (T14), #133 (T16). Tickets créés : #138 (F2c), #139 (F12b), #140 à #142 (F10a, F10b, F10c : découpage de la spec F10).
- **Ordre (CEO)** : F12b passe avant F7a et F11a, comme le prévoit la spec F12 (« avant F7 à F11 »). Ces deux tâches partagent `TripShell.tsx`, `fr.json` et `tests/e2e/routes.ts` avec F12b ou entre elles, et attendent donc sa fusion.

## En cours
- **F2c (ticket #138, PR #143)** : écarts à 0012, points 2 à 4 (`StatusBanner` `conflict` en `role="alert"`, filet `generating` sans animation ; `Chip` coche de 20 px, chip déduite sans aplat, chip indisponible sans contour ; `OtpInput` invalide avec `aria-invalid` et `aria-describedby`). Correction 1 faite : une seule capture changée (`presentation-question.png`, reprise de la CI, Q232), CI verte, de nouveau en revue.
- **F12b (ticket #139, PR #144)** : grand écran du voyage (carte à gauche, panneau de 420 px dès 1024 px, bascule sans perte d'état, recentrage tiré du conteneur). Correction 1 faite (références 1280 × 800, toast sous le contenu du panneau), CI verte, de nouveau en revue. Budgets : R11 185 177 o, R12 185 447 o, R6 inchangée (seuil 200 000 o).
- `pnpm verify` en local : vert sauf les captures visuelles (polices, décision 0004). La CI fait foi.

## Bloqué
- **B0, partie Q5 (#27)** : attend **Q5** (juridique) ; à rebaser sur `main` (seulement la partie Q5 et 0011) quand Q5 avance.
- **P0** : attend la clé serveur Places/Routes (Q103).

## Prochain cycle
1. Suivre #143 (F2c) et #144 (F12b) ; reposer `needs-review` après toute correction (Q220).
2. T17 : workflow `visual-update.yml` de la décision 0004 (Q232).
3. Après la fusion de F12b : F11a (crée `/voyages`, Q207), puis F7a ; F8a après F2c (Q221). F10a (#140) après F12b. Tâche des points 1 et 5 de 0012 (`DayBadge`, échelle d'espacement, avec Q230).

## Décisions attendues de Samuel
- **Q214** (sous Q45) : plafond global des écrans 2 et 3 épuisable par environ 50 adresses. Ne bloque pas la phase 0.
- **Après le déploiement de `main`** : vérifier la carte du jour 1 sur https://vadrouille-app-ten.vercel.app/voyages/mock_trip_edimbourg_debloque/jour/1 (bug #106 corrigé).
- **À faire à la main** (T10, #108) : coller le texte de 0023 § 1 dans la routine Revue (Q120) ; coller le prompt R3 ; créer les libellés `sev:1` et `sev:3` (Q184) ; accès Vercel des routines (liste des déploiements en 403).
- **Rappelées** : Q48, Q27, Q129 (B0a).
- **Toujours ouvertes** :
  - F10 : Q186, Q187, Q188 ;
  - Ligne et juridique : Q194, Q197 ;
  - juridique : Q5, Q6, Q29, Q34, Q38, Q44, Q46 à Q48, Q75, Q127, Q150 (durées) ;
  - argent et comptes : Q24 à Q26, Q39, Q45, Q56, Q84, Q103, Q129 ;
  - offre : Q57, Q63, Q67, Q76, Q78, Q88 à Q90, Q128, Q133, Q135, Q149 ;
  - documents et environnement : Q12, Q27, Q59, Q40, Q101 ;
  - Ligne : Q19 (avec Q226), Q37, Q108, Q130 ;
  - règles : Q23.
- **Veto possible** :
  - avant le 2026-10-14 : **décision 0025 (#134)** (Q223, Q224) ;
  - avant le 2026-10-13 : décisions 0017, 0019, 0023, **0024 (#125)**, écarts de F9a et de F5b, Q182, F10-PO-1 à F10-PO-22 et Q185, décision 0012, F7-PO-20 et F7-PO-21, **F8-PO-18 à F8-PO-22 (#126)**.

## Part d'usage estimée
- 35e cycle : environ 0,8 million de jetons (estimation), avec 2 sous-agents et 2 corrections : 1 PR fusionnée (#135), 2 PR ouvertes (#143, #144).
- Part de l'abonnement : impossible à mesurer depuis la routine.
