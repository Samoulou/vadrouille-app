Scripts du projet (serveur autonome pour les tests).

`e2e-port.mjs` : port du serveur Playwright (décision 0017 § 14) : `E2E_PORT` s'il est fourni, sinon 3100 en CI, sinon un port stable entre 3100 et 3899 tiré du chemin absolu du dépôt (FNV-1a), testé dans `tests/unit/e2e-port.test.ts`. Aucun serveur n'est réutilisé : si le port est pris, Playwright échoue ; fixe alors `E2E_PORT`.

`ci/` : logique des workflows GitHub, en fonctions pures testées dans `tests/unit/ci/` (décision 0023) :
- `techlead-gate.mjs` : décision de la porte `techlead-gate` ;
- `release-note.mjs` : tag d'une note de version et message Slack du workflow `release`.
