# État du studio — 2026-10-12 (34e cycle)

Phase : 0 — Valider · Régime : cycle toutes les 3 heures, jusqu'à 3 tâches par cycle (consigne de Samuel du 2026-10-08 16:31)

## Messages de Samuel traités (#studio)
- Aucun nouveau message depuis le 33e cycle (2026-10-12 00:52 CEST).

## Fait
- **Fusionnées depuis le 33e cycle** : **F5c (#128)**, décision 0025 (#134, T16 : TL-1 à TL-4 de F5c, marge de 2 % de R6 tant qu'un `knownExceedance` existe ; Q223 et Q224 tranchées).
- Tickets créés : #131 (T7), #132 (T14), #133 (T16). Tickets fermés : #127 (F5c), #133 (T16).
- **Q221 tranchée (CEO)** : la tâche des écarts de `main` à 0012 (`Chip`, `OtpInput` invalide) passe avant F8a, puis F8a, puis F8b.

## En cours
- **T7 (ticket #131, PR #135)** : port Playwright par worktree (`E2E_PORT`, sinon 3100 en CI, sinon port tiré du chemin du dépôt), plus de serveur réutilisé. `techlead-approved`, en attente de la CI.
- **T14 (ticket #132, PR #136)** : présentation R6 de 210 954 o à **180 958 o** (sous 200 000), `knownExceedance` retiré ; toutes les routes baissent (imports directs dans `not-found.tsx` et `ErrorContent.tsx`) ; Q208 fiabilisé (`waitFor` sur le retour du focus). En revue.
- `pnpm verify` en local : vert sauf les captures visuelles (polices, décision 0004). La CI fait foi.

## Bloqué
- **B0, partie Q5 (#27)** : attend **Q5** (juridique) ; à rebaser sur `main` (seulement la partie Q5 et 0011) quand Q5 avance.
- **P0** : attend la clé serveur Places/Routes (Q103).

## Prochain cycle
1. Suivre #135 (T7) et #136 (T14) ; reposer `needs-review` après toute correction (Q220).
2. Créer le ticket de la tâche des écarts à 0012 (`Chip`, `OtpInput`), puis F8a (Q221) ; F11a (crée `/voyages`, Q207) et F7a après #136 (`tests/e2e/routes.ts` partagé) ; F12b.
3. Découper la spec F10 en tickets (F10a, F10b, F10c).

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
- 34e cycle : environ 0,45 million de jetons (estimation), avec 3 sous-agents et aucune correction : 1 PR fusionnée (#134), 2 PR en revue (#135, #136).
- Part de l'abonnement : impossible à mesurer depuis la routine.
