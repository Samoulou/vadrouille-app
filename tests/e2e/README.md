Scénarios Playwright en 390 × 844 (*.e2e.spec.ts) et tests axe (*.a11y.spec.ts).

`budget.e2e.spec.ts` : JavaScript initial de la Journée strictement sous 200 000 octets gzip (décision 0016 § 3.1 règle 5).
La mesure (`measureInitialJavaScript` de `budget-helpers.ts`) est la seule implémentation ; F12a la réutilise (décision 0022 § 4).
Une PR qui fait échouer ce test le corrige ou demande un amendement de 0016 : le seuil ne se relève pas sans décision écrite.
