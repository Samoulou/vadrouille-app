# État du studio — 2026-10-11 (31e cycle)

Phase : 0 — Valider · Régime : cycle toutes les 3 heures, jusqu'à 3 tâches par cycle (consigne de Samuel du 2026-10-08 16:31)

## Messages de Samuel traités (#studio)
- Aucun nouveau message depuis le 30e cycle (14:37 CEST).

## Fait
- **Fusionnées depuis le 30e cycle** : T4 (#113) et l'état du 30e cycle (#115).
- **F12a** (ticket #116, créé ce cycle) : PR **#117**. Lighthouse en CI sur une étape du job `verify`, sans compte ni service externe : médiane de 99 sur le Séjour (R11) et de 97 sur la Journée (R12), pour un seuil de 90 ; accessibilité à 100 sur les 8 routes. Elle ajoute aussi l'inventaire des routes `tests/e2e/routes.ts`, avec un test qui échoue si une page manque, et un budget de JavaScript initial par route. Le JavaScript de la Journée ne change pas (183 012 o). Aucun fichier de `src/` n'est touché. CI `verify` verte ; elle a été relancée une fois après un échec d'un test instable sans lien avec la PR (Q208).
- **B0a (#114), correction 1** : les 3 remarques du Tech Lead et les 10 points de Sécurité sont traités dans le handover et les décisions 0007 à 0010. `Today` est retiré (conflit C15 noté au § 1). Le libellé `changes-requested` est retiré et `needs-review` est reposé.
- **Tickets fermés** (travail déjà fusionné, fermeture automatique non déclenchée) : #112 (T4), #107 (T10), #83 (F9a), #75 (spec F10), #71 (T8), #63 (U2), #62 (T5), #61 (F5b), #23 (U1).

## En cours
- **F12a (#117)** : `needs-review`. Le Tech Lead avait validé le premier commit ; le second commit (correction de la mesure de R9-retour) a retiré `techlead-approved`, et la porte `gate` attend une nouvelle validation.
- **B0a (#114)** : `needs-review`, documentation seulement, après la correction 1 sur 2.
- **Bug #106, PR #109** (sev:2) : `needs-review`, CI `verify` verte ; la porte `gate` attend `techlead-approved` depuis le 2026-10-11 10:15 UTC. Après la fusion et le déploiement de `main`, Samuel vérifie la carte sur la démonstration.
- `pnpm verify` en local : les captures visuelles échouent toujours en session (décision 0004), et le port 3100 est partagé entre sous-agents (Q202). La CI fait foi.

## Bloqué
- **B0, partie Q5 (#27)** : attend **Q5** (juridique).
- **P0** : attend la clé serveur Places/Routes (Q103).
- **F5c, F8a, F11a, F7a** : attendent la fusion de F12a (la spec F12 la place avant F5c à F11, et l'inventaire des routes doit exister avant les nouvelles pages). **T7** ne passe pas dans le même cycle que F12a (Q182).

## Prochain cycle
1. Suivre #117, #114 et #109 (sev:2).
2. Après la fusion de F12a : **F5c** et **T7** (fichiers distincts), puis F8a, F11a.
3. Créer la tâche **T14** (réduction du JavaScript de la présentation R6 sous 200 000 o, Q205) après la fusion de F12a, avant F12d.
4. Découper la spec F10 en tickets de code (F10a, F10b, F10c) après F5c ; Product Owner : spec F7 (Q110, Q104, 0019, Q203).

## Décisions attendues de Samuel
- **À faire à la main** (T10, #108) : coller le texte de 0023 § 1 dans la routine Revue (Q120) ; coller le prompt R3 (annexe B de `docs/studio/mise-en-place.md`) ; vérifier le secret `SLACK_WEBHOOK_STUDIO` ; créer les libellés `sev:1` et `sev:3` (Q184).
- **Rappelées par B0a (#114)** : Q48 (sort de `billing`, `usage_ledger` et de la ligne d'organisation d'un compte supprimé ; rien n'est supprimé d'ici là), Q27 (conservation du jeton `/p/[token]` dans les journaux de la plateforme et de `research_runs.queries`), Q129 (remboursement d'un paiement reçu pour une session inconnue).
- **Toujours ouvertes** :
  - F10 : Q186, Q187, Q188 (avec une recommandation du Product Owner pour chacune) ;
  - Ligne et juridique, nouvelles du 30e cycle : Q194, Q197 ;
  - juridique : Q5, Q6, Q29, Q34, Q38, Q44, Q46 à Q48, Q75, Q127, Q150 (durées) ;
  - argent et comptes : Q24 à Q26, Q39, Q45, Q56, Q84, Q103, Q129 ;
  - offre : Q57, Q63, Q67, Q76, Q78, Q88 à Q90, Q128, Q133, Q135, Q149 ;
  - documents et environnement : Q12, Q27, Q59, Q40, Q101 ;
  - Ligne : Q37, Q108, Q130 ;
  - règles : Q23.
- **Veto possible** :
  - avant le 2026-10-12 : F12-PO, Q175, Q179, décision 0022, rendus de F11c ;
  - avant le 2026-10-13 : décisions 0017 (#65), 0019 (#72), 0023 (#108), écarts de F9a (#86) et de F5b (#66), Q182, F10-PO-1 à F10-PO-22 et Q185 (#76), décision 0012 (#26 : Q157, Q177).

## Part d'usage estimée
- 31e cycle : environ 0,5 million de jetons (estimation), avec 2 sous-agents : 1 PR nouvelle (#117), 1 PR corrigée (#114).
- Part de l'abonnement : impossible à mesurer depuis la routine.
