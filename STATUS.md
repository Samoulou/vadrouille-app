# État du studio — 2026-10-11 (33e cycle)

Phase : 0 — Valider · Régime : cycle toutes les 3 heures, jusqu'à 3 tâches par cycle (consigne de Samuel du 2026-10-08 16:31)

## Messages de Samuel traités (#studio)
- Aucun nouveau message depuis le 32e cycle (20:31 CEST).

## Fait
- **Fusionnées depuis le 32e cycle** : B0a (#114), **bug #106 (#109, sev:2)**, **F12a (#117)**, spec F8 (#126), décision 0024 (#125), note de version v2026.10.11-21 (#129).
- **Revue relancée (Q220)** : #109 et #117 gardaient `needs-review` après leur dernière correction, mais R2 ne se déclenche que sur `labeled` ; le CEO a retiré puis reposé le libellé à 21:09 UTC, la revue a validé et les deux PR ont fusionné à 21:10. Règle désormais : après chaque correction, le CEO repose `needs-review`.
- **Spec F8 (ticket #123, PR #126)** : alignée sur 0018 (« Revenir à mon récit », pas de `StatusBanner` `generating` à l'écran 5, compteur du récit) ; décisions du Product Owner **F8-PO-18 à F8-PO-22** (veto possible avant le 2026-10-13). Q110 et Q213 closes.
- **Décision 0024 (ticket #124, PR #125, correction 1 sur 2)** : amendement de 0022 pour F12a ; R6 en dépassement connu à plafond non croissant, T14 avant F12d, F11a avant F12d, Q205, Q206 et Q210 tranchées.
- Tickets fermés : #106, #116, #119, #123, #124.

## En cours
- **F5c (ticket #127, PR #128)** : Séjour, `DestinationPlate`, `ChecklistRow`. Correction 1 sur 2 faite (références et captures de la CI, M1, M2, deux points UX), head `12edfd3`, CI verte ; `needs-review` reposé. R11 à 186 651 o, R12 à 186 968 o, R6 à 210 954 o (sous son plafond).
- `pnpm verify` en local : les captures visuelles échouent toujours en session (décision 0004). La CI fait foi.

## Bloqué
- **B0, partie Q5 (#27)** : attend **Q5** (juridique) ; à rebaser sur `main` (seulement la partie Q5 et 0011) quand Q5 avance.
- **P0** : attend la clé serveur Places/Routes (Q103).

## Prochain cycle
1. Suivre #128 (F5c).
2. Tâches désormais prêtes (F12a fusionnée) : **T7** (port Playwright par worktree), **T14** (réduction de la présentation, Q205, Q208), puis F8a (après Q221), F11a, F7a, F12b après F5c.
3. Tech Lead : consigner TL-1 à TL-4 de F5c (Q223) et la marge de R6 (Q224).
4. Découper la spec F10 en tickets (F10a, F10b, F10c) après F5c.

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
  - avant le 2026-10-12 : F12-PO, Q175, Q179, décision 0022, rendus de F11c ;
  - avant le 2026-10-13 : décisions 0017, 0019, 0023, **0024 (#125)**, écarts de F9a et de F5b, Q182, F10-PO-1 à F10-PO-22 et Q185, décision 0012, F7-PO-20 et F7-PO-21, **F8-PO-18 à F8-PO-22 (#126)**.

## Part d'usage estimée
- 33e cycle : environ 1,4 million de jetons (estimation), avec 3 sous-agents et 2 corrections : 5 PR fusionnées (#109, #117, #125, #126, plus #114 avant le cycle), 1 PR en revue (#128).
- Part de l'abonnement : impossible à mesurer depuis la routine.
