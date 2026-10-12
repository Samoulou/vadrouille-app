Scripts du projet (serveur autonome pour les tests).

`e2e-port.mjs` : port du serveur Playwright (décision 0017 § 14) : `E2E_PORT` s'il est fourni, sinon 3100 en CI, sinon un port stable entre 3100 et 3899 tiré du chemin absolu du dépôt (FNV-1a), testé dans `tests/unit/e2e-port.test.ts`. Aucun serveur n'est réutilisé : si le port est pris, Playwright échoue ; fixe alors `E2E_PORT`.

`e2e-server-log.mjs` : fichier où `serve-standalone.mjs` recopie la sortie standard et la sortie d'erreur du serveur de test quand `E2E_SERVER_LOG` est posé (par `playwright.config.ts`) ; un fichier par port, dans le dossier temporaire du système, vidé à chaque démarrage, relu par le test `creation: aucune donnée persistée ni exposée` (spécification F8, « Aucune persistance locale »). Testé dans `tests/unit/e2e-server-log.test.ts`.

`ci/` : logique des workflows GitHub, en fonctions pures testées dans `tests/unit/ci/` (décision 0023) :
- `techlead-gate.mjs` : décision de la porte `techlead-gate` ;
- `release-note.mjs` : tag d'une note de version et message Slack du workflow `release`.
