Scripts du projet (serveur autonome pour les tests).

`ci/` : logique des workflows GitHub, en fonctions pures testées dans `tests/unit/ci/` (décision 0023) :
- `techlead-gate.mjs` : décision de la porte `techlead-gate` ;
- `release-note.mjs` : tag d'une note de version et message Slack du workflow `release`.
