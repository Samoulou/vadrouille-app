# État du studio — 2026-10-11 (32e cycle)

Phase : 0 — Valider · Régime : cycle toutes les 3 heures, jusqu'à 3 tâches par cycle (consigne de Samuel du 2026-10-08 16:31)

## Messages de Samuel traités (#studio)
- Aucun nouveau message depuis le 31e cycle (17:49 CEST). Les messages de 17:57 sont les notes de release postées par le workflow `release` (rattrapage de v2026.10.09-09, v2026.10.09-21 et v2026.10.11-09) : T10 fonctionne.

## Fait
- **Fusionnées depuis le 31e cycle** : l'état du 31e cycle (#118), la revue hebdomadaire de la semaine 41 (#120) et la **mise à jour de la spec F7 (#121)**.
- **Spec F7 (ticket #119, PR #121, fusionnée)** : alignée sur 0018 et 0019 (`DayBadgeGroup` en groupe radio, boutons « Retour à la fiche » et « Retour à la Journée », compteur, C16 en deux cas) ; Q203 devient le critère C28 ; nouveau critère C29 (pages inscrites dans `tests/e2e/routes.ts`) ; prérequis à jour (F12a avant F7a). Décisions du Product Owner : **F7-PO-20** (Q104 : la mise à jour de la liste « À faire » devient une quatrième PR **F7d**, après F7c et F5c) et **F7-PO-21** (changer de résultat de recherche retire l'aperçu ; le nom saisi est gardé).
- **B0a (#114), correction 2 sur 2** : les 12 points du Tech Lead, S1 à S6 et les mineurs de Sécurité sont traités (head `8d92cfb`, `main` fusionnée sans conflit). Entre autres : `UPDATE` par colonne sur `checkouts`, `trips.status` sans `unlocked`, dossier `src/server/routes/` pour les route handlers, table `proposals`, rôles en `INHERIT FALSE`, environnement le plus restrictif retenu, limiteur dans nos actions, préfixe IPv6 /64, `getPlaceDetails` limité aux lieux du voyage partagé, purge des sessions et vérifications expirées. Le libellé `changes-requested` est retiré et `needs-review` est reposé.

## En cours
- **B0a (#114)** : `needs-review`, documentation seulement, après la dernière correction autorisée. Si la revue demande encore des changements, le CEO décide avec le Tech Lead d'une 3e tentative ou d'un découpage (règle de Samuel du 2026-10-11 10:54).
- **F12a (#117)** : `needs-review`, CI `verify` verte ; la porte `gate` attend `techlead-approved` depuis 15:39 UTC.
- **Bug #106, PR #109** (sev:2) : `needs-review`, CI `verify` verte ; la porte `gate` attend `techlead-approved` depuis 10:15 UTC (plus de 6 h). Après la fusion et le déploiement de `main`, Samuel vérifie la carte sur la démonstration.
- `pnpm verify` en local : les captures visuelles échouent toujours en session (26 sur 33, décision 0004). La CI fait foi.

## Bloqué
- **B0, partie Q5 (#27)** : attend **Q5** (juridique).
- **P0** : attend la clé serveur Places/Routes (Q103).
- **F5c, F8a, F11a, F7a, T14** : attendent la fusion de F12a (la spec F12 la place avant F5c à F11, et l'inventaire des routes doit exister avant les nouvelles pages). **T7** ne passe pas dans le même cycle que F12a (Q182). Aucune tâche de code n'était donc prête ce cycle.

## Prochain cycle
1. Suivre #117, #114 et #109 (sev:2).
2. Après la fusion de F12a : **F5c** et **T7** (fichiers distincts), puis T14, F8a, F11a.
3. Product Owner : partie F8 de Q110 dans `specs/F8-creation-compte.md` (Q213).
4. Découper la spec F10 en tickets de code (F10a, F10b, F10c) après F5c ; ticket F7d quand F7c est fusionnée (Q212).
5. Sous-agents parallèles dans des worktrees isolés (Q217).

## Décisions attendues de Samuel
- **Nouvelle** : **Q214** (sous Q45) : le plafond global des écrans 2 et 3 peut être épuisé par environ 50 adresses (déni de service, dépense de modèle). Accepter le risque ou choisir une autre parade ? Ne bloque pas la phase 0.
- **À faire à la main** (T10, #108) : coller le texte de 0023 § 1 dans la routine Revue (Q120) ; coller le prompt R3 (annexe B de `docs/studio/mise-en-place.md`) ; vérifier le secret `SLACK_WEBHOOK_STUDIO` (le workflow `release` a posté dans #studio à 17:57 : il semble en place) ; créer les libellés `sev:1` et `sev:3` (Q184).
- **Rappelées par B0a (#114)** : Q48, Q27, Q129.
- **Toujours ouvertes** :
  - F10 : Q186, Q187, Q188 (avec une recommandation du Product Owner pour chacune) ;
  - Ligne et juridique : Q194, Q197 ;
  - juridique : Q5, Q6, Q29, Q34, Q38, Q44, Q46 à Q48, Q75, Q127, Q150 (durées) ;
  - argent et comptes : Q24 à Q26, Q39, Q45, Q56, Q84, Q103, Q129 ;
  - offre : Q57, Q63, Q67, Q76, Q78, Q88 à Q90, Q128, Q133, Q135, Q149 ;
  - documents et environnement : Q12, Q27, Q59, Q40, Q101 ;
  - Ligne : Q37, Q108, Q130 ;
  - règles : Q23.
- **Veto possible** :
  - avant le 2026-10-12 : F12-PO, Q175, Q179, décision 0022, rendus de F11c ;
  - avant le 2026-10-13 : décisions 0017 (#65), 0019 (#72), 0023 (#108), écarts de F9a (#86) et de F5b (#66), Q182, F10-PO-1 à F10-PO-22 et Q185 (#76), décision 0012 (#26 : Q157, Q177), **F7-PO-20 et F7-PO-21 (#121)**.

## Part d'usage estimée
- 32e cycle : environ 0,5 million de jetons (estimation), avec 2 sous-agents : 1 PR fusionnée (#121), 1 PR corrigée (#114).
- Part de l'abonnement : impossible à mesurer depuis la routine.
