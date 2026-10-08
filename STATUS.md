# État du studio — 2026-10-08 (3e cycle)

Phase : 0 — Valider · Régime : Veille (2 cycles par jour)

## Fait
- Kit de démarrage déposé (2026-10-07) ; cycles 1 et 2 du 2026-10-08 : PR #3 (F0), #2 (specs F1, F2), #5 (spec F3) ouvertes.
- 3e cycle — **F0 (PR #3) débloquée** : Samuel a commité l'image de référence produite par la CI (`f14ad74`, à la racine) ; le frontend l'a placée sur `tests/visual/__screenshots__/dev-tokens.png` (`27c6dcc`, 2e et dernière tentative), tolérance inchangée, aucun test désactivé. CI : `verify` (test visuel compris) et `docker` verts. Revue Tech Lead : **approuvée** (`techlead-approved`). Q21 levée.
- 3e cycle — **Spec F3 (PR #5)** : les trois revues traitées par le product-owner (`397ec36`, 1re tentative) : renvois à Q10–Q14 explicités, ordre de fusion, `DayTabs` typé, rail, `Terminus`, `DayBadge`, `StopMarker` décoratif, critères testables, roadmap (F3 : prérequis F1, F2). Revue Tech Lead : **approuvée**. Arbitrage `aria-current` : prop `currentValue`, `"true"` par défaut, `"page"` dans `DayTabs`.

## En cours
- Ordre de fusion automatique attendu : **#3 → #2 → #5**. #2 et #5 ont `techlead-approved` mais leur `verify` échoue tant que `main` n'a pas de `package.json` : refusionner `main` dans leurs branches après la fusion de #3. Conflits attendus sur `QUESTIONS.md` : garder Q10 à Q21.

## Bloqué
- F1, F2 (implémentation) : attendent la fusion de F0 puis des specs (#2). F3 : attend F1 et F2.
- F4 et l'ancrage de P0 : attendent Q3. P0 : attend aussi Q9.
- B0 : attend Q14 (et Q5).

## Décisions attendues de Samuel
- Q15 à Q19 (spec F3) : nom de l'onglet, libellés des segments, comportements de la ligne du jour, `DayBadge`/`StopMarker`, mesures sans token. Q17 et Q19 complétées ce cycle (couleur du lien « Idées », graisse de l'heure du temps libre, style du terminus, préfixes `--ligne-*`, rail du temps libre fin ou pointillé).
- Toujours ouvertes : Q1 à Q14, en particulier Q12 (maquettes non exportées) et Q14 (contrat `Stop`, bloque B0).

## Consignes de Samuel (#studio, 14:44) à appliquer après la fusion de F0
1. `ci.yml` : traiter `specs/`, `.claude/`, `CLAUDE.md`, `README*.md`, `LICENSE.md` comme de la documentation, en gardant les ajouts de F0.
2. Seule la PR « chore: status » modifie `STATUS.md` et `QUESTIONS.md` ; les autres PR listent leurs questions dans leur description, le CEO les reporte.
3. `CLAUDE.md` : ne jamais commiter `.next/` ni `node_modules/` ; vérifier `git status` avant chaque push.
4. Proposer un ADR pour régénérer les images de référence directement sur la CI, sans téléchargement d'artefact.

## Prochain cycle
- Si #3 est fusionnée : refusionner `main` dans #2 puis #5 ; tâche « consignes 1 à 3 » (ci.yml, CLAUDE.md) et ADR 0004 (consigne 4), sur des fichiers distincts ; `docs/decisions/0003-versions.md` encore « à valider par le Tech Lead » (à corriger avec la consigne 1).
- Puis F1 et F2 dès #2 fusionnée.

## Part d'usage estimée
- 3e cycle du 2026-10-08 : environ 300 000 jetons (F0 ≈ 55 000, spec F3 ≈ 100 000, revue Tech Lead ≈ 95 000, pilotage ≈ 50 000). Cumul de la journée ≈ 760 000 jetons. Part de l'abonnement non mesurable depuis la routine.
