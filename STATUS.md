# État du studio — 2026-10-08 (2e cycle)

Phase : 0 — Valider · Régime : Veille (2 cycles par jour)

## Fait
- Kit de démarrage déposé (2026-10-07).
- 1er cycle du 2026-10-08 : PR #3 (F0) et PR #2 (specs F1, F2) ouvertes.
- 2e cycle : PR #3 (F0) corrigée selon la revue et la consigne de Samuel (#studio, 13:37) : `ci.yml` envoie `test-results/` et `playwright-report/` en artefact si `verify` échoue ; `font-bold` au lieu de `font-semibold` ; `radius-round` ajouté à Q11 ; capture F0 pleine page ; texte de promesse dédupliqué dans `fr.json`. Commits `a66a6bc` (fusion de `main`) et `fddb917`. `docker` vert ; `pnpm verify` vert en local.
- 2e cycle : PR #5 « docs: spécification F3 » ouverte (`specs/F3-ligne-du-jour.md`, libellé `needs-review`), questions Q15 à Q20.
- 2e cycle : PR #2 mise à jour avec `main` (`cc2f756`), sans conflit.
- Q20 tranchée par le CEO (planification) : F3 a pour prérequis F1 et F2 ; à reporter dans `docs/roadmap.md` par une PR soumise au Tech Lead (la PR de statut reste limitée à `STATUS.md` et `QUESTIONS.md` pour passer la porte docs-only).

## En cours
- PR #3 (F0) : `verify` reste rouge sur la CI (test visuel, voir Bloqué). 1 tentative de correction sur 2 utilisée.
- PR #2 (specs F1, F2) : `techlead-approved`, mais `verify` et `docker` échouent car `ci.yml` traite `specs/` comme du code et `main` n'a pas encore de `package.json` (« No pnpm version is specified »). Se débloquera dès que F0 sera dans `main` (refusionner `main` dans la branche).
- PR #5 (spec F3) : même cause, même dénouement que #2 ; en attente de la revue du Tech Lead.
- Conflits attendus sur `QUESTIONS.md` entre #2, #3, #5 et cette PR : garder toutes les lignes (Q10 à Q12 pour #3, Q13–Q14 pour #2, Q15 à Q20 pour #5, Q21 pour cette PR).

## Bloqué
- **F0 (PR #3)** : l'artefact `test-results` du run 37772333554 existe (id 11548113551, expire le 2026-10-15), mais la politique de sortie de l'environnement refuse `productionresultssa5.blob.core.windows.net` (téléchargement des artefacts) et `results-receiver.actions.githubusercontent.com` (logs des jobs) : 403. Impossible de récupérer l'image « actual » ni de lire le log du test. Voir Q21.
- F1, F2, F3 : attendent F0 dans `main`.
- F4 et l'ancrage de P0 : attendent Q3. P0 : attend aussi Q9.
- B0 : attend Q14 (et Q5).

## Décisions attendues de Samuel
- **Q21 (nouvelle, bloque F0)** : autoriser les deux hôtes ci-dessus dans la politique réseau de l'environnement, ou télécharger soi-même l'artefact et commiter `*-actual.png` du test dev-tokens sur `tests/visual/__screenshots__/dev-tokens.png` (branche `claude/F0-socle`).
- Q15 à Q19 (spec F3) : nom de l'onglet « Séjour » ou « Aperçu », libellés des segments, comportements non documentés de la ligne du jour, variantes de `DayBadge` et `StopMarker`, mesures sans token.
- Toujours ouvertes : Q1 à Q14 (voir `QUESTIONS.md`), en particulier Q12 (maquettes non exportées) et Q14 (contrat `Stop`, bloque B0).

## Prochain cycle
- Si Q21 est levée : régénérer la référence visuelle F0 depuis la CI (2e et dernière tentative), puis revue du Tech Lead.
- Après fusion de F0 : refusionner `main` dans #2 et #5 ; puis F1 et F2 (fichiers distincts).

## Part d'usage estimée
- 2e cycle du 2026-10-08 : environ 200 000 jetons (F0 ≈ 70 000, spec F3 et PR #2 ≈ 100 000, pilotage ≈ 30 000). Cumul de la journée ≈ 460 000 jetons. Part de l'abonnement non mesurable depuis la routine.
