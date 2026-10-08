# État du studio — 2026-10-08

Phase : 0 — Valider · Régime : Veille (2 cycles par jour)

## Fait
- Kit de démarrage déposé (2026-10-07).
- Cycle du 2026-10-08 : PR #3 « [front] F0 — Socle front » ouverte (libellé `needs-review`). `pnpm verify` vert en local sur installation propre (typecheck, lint, 30 tests, build, a11y 2/2, e2e 3/3, visuel 1/1). Versions notées dans `docs/decisions/0003-versions.md`.
- Cycle du 2026-10-08 : PR #2 « docs: spécifications F1 et F2 » ouverte (libellé `needs-review`) : `specs/F1-contrats-donnees-simulees.md`, `specs/F2-composants-base.md`.

## En cours
- PR #3 (F0) et PR #2 (specs F1, F2) : en attente de la revue R2 (Tech Lead, libellé `techlead-approved`) et de la CI.
- Point d'attention F0 : `docker build .` non testé dans le bac à sable (Docker Hub 429, miroir ECR 403) ; la CI sera la première vérification de l'image. La comparaison visuelle peut différer sur le runner Ubuntu (tolérance 1 %) : régénérer avec `pnpm test:visual:update` si besoin.
- Point d'attention F0 : la PR modifie `.github/workflows/ci.yml` (démarrage de l'image et contrôle du port 3000) ; à relire par le Tech Lead.
- Conflit attendu sur `QUESTIONS.md` entre #2 et #3 (ajouts au même endroit) : la seconde PR fusionnée devra intégrer `main`. Identifiants réservés : Q10 à Q12 pour #3, Q13 et Q14 pour #2.

## Bloqué
- F4 et l'ancrage de P0 : attendent Q3.
- P0 : attend aussi Q9.
- Slack : le canal `#studio` est introuvable avec le connecteur Slack de la routine (recherche et lecture sans résultat). Ni lecture des messages de Samuel ni résumé de cycle possibles ; à vérifier (connecteur, espace de travail, invitation de l'application dans le canal).

## Décisions attendues de Samuel
- Voir QUESTIONS.md (Q1 à Q9, plus Q10 à Q14 ajoutées par les PR #2 et #3).
- Nouvelles questions : correspondance shadcn manquante (Q10), tokens hors § 4.1 (Q11), maquettes et Dossier UX non exportés dans `docs/ux/` (Q12, bloque la fidélité visuelle de F1 à F3), composants non décrits par le design system (Q13), données Google et textes d'interface dans le contrat du handover § 9 (Q14, liée à Q5, bloque B0).

## Prochain cycle
- Après fusion de #2 et #3 : F1 et F2 (fichiers distincts : `src/contracts`, `src/adapters`, `src/mocks` d'un côté, `src/components` de l'autre).
- Résoudre le conflit `QUESTIONS.md` si la seconde PR n'a pas pu fusionner.

## Part d'usage estimée
- Cycle du 2026-10-08 : environ 260 000 jetons (F0 ≈ 130 000, spécifications ≈ 105 000, pilotage ≈ 25 000). Part de l'abonnement non mesurable depuis la routine ; estimation à confirmer par R4.
