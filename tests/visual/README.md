Tests de captures Playwright ; références dans __screenshots__ (pnpm test:visual:update).

Sur une PR `claude/…`, le libellé `update-snapshots` posé par `Samoulou` (Samuel ou les routines du studio) régénère toutes les références sur la CI : workflow `.github/workflows/visual-update.yml`, décision 0004, section « Évolution ». Il retire `techlead-approved`, committe les PNG modifiés, commente la PR et retire le libellé. Pousser ensuite un commit, même vide, pour relancer `ci` et `techlead-gate`.
