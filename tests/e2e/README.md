Scénarios Playwright en 390 × 844 (*.e2e.spec.ts) et tests axe (*.a11y.spec.ts).

`budget.e2e.spec.ts` : JavaScript initial de la Journée strictement sous 200 000 octets gzip (décision 0016 § 3.1 règle 5).
La mesure (`measureInitialJavaScript` de `budget-helpers.ts`) est la seule implémentation ; F12a la réutilise (décision 0022 § 4).
Une PR qui fait échouer ce test le corrige ou demande un amendement de 0016 : le seuil ne se relève pas sans décision écrite.

## Inventaire des routes (`routes.ts`, décision 0022 § 3)
`routes.ts` est la liste unique des routes de l'application, partagée par la mesure (Lighthouse, JavaScript initial) et la
passe d'accessibilité. Données pures (aucun import de valeur de Playwright ni de l'application) ; les actions des états et
des préparations sont dans `route-states.ts`.

**Règle d'inscription (point de revue, F12-PO-15)** : toute PR qui ajoute une page sous `src/app` hors `/dev` l'inscrit dans
`ROUTES`, dans la même PR, avec :
- `id` : numéro d'écran du handover (`R15`, `R17`…), ou `R-…` pour une page sans numéro ;
- `path` : adresse avec les paramètres du jeu simulé (`mock_trip_edimbourg`) ; `prepare` si l'adresse n'existe qu'après une
  action côté serveur (paiement commencé…), avec son action dans `ROUTE_PREPARATIONS` ; `journey` si la page n'a de
  contenu qu'avec un état en mémoire de l'onglet (brouillon de création, F8a), avec son parcours dans `ROUTE_JOURNEYS` :
  la mesure du JavaScript part de l'adresse de départ du parcours et compte tout ce qui est chargé jusqu'à l'adresse de
  l'entrée ; Lighthouse ne mesure pas ces entrées (onglet neuf, sans brouillon ; question au Tech Lead, PR de F8a) ;
- `page` : chemin du fichier `page.tsx` sous `src/app`, groupes de routes compris ;
- `states` : états à vérifier en plus de l'état initial (feuille ouverte, toast, hors ligne…), chacun avec son action dans
  `ROUTE_STATES`, qui réutilise les aides des `*-helpers.ts` ;
- `budgets` : `lighthouse` et `javascript`, `seuil` ou `journal`. Seuils fixés par la spécification F12 : Lighthouse sur
  `R11` et `R12`, JavaScript sur `R11`, `R12`, `R6` et `R15`. Une entrée ne passe de `seuil` à `journal` que par décision
  écrite ; un dépassement constaté s'inscrit dans `knownExceedance`, avec sa mesure, et va au Tech Lead.

Contrôles : `tests/unit/routes-inventaire.test.ts` échoue si une page de `src/app` hors `/dev` manque à `ROUTES` ou si une
entrée nomme un fichier absent ; `routes.e2e.spec.ts` atteint chaque état ; `budget.e2e.spec.ts` (`budget: JavaScript
initial par route`) et `tests/perf/` mesurent chaque entrée. `DEV_ROUTES` (pages `/dev`, carte simulée) ne sont ni comparées
aux fichiers ni mesurées par Lighthouse.

## Mesure Lighthouse (`tests/perf/`, `pnpm test:perf`, décision 0022 § 1 et § 2)
Projet Playwright `perf`, hors de `pnpm verify` ; étape du job `verify` en CI, après `pnpm verify`, sur le même build.
Lighthouse 13.5.0 (Node) sur le Chromium de Playwright, profil mobile par défaut, domaines Google bloqués (`GOOGLE_HOSTS` de
`carte-helpers.ts`, seule liste). `perf: budgets du § 14` : `R11` et `R12`, 3 passages, médiane de la performance ≥ 90,
accessibilité = 100 à chaque passage. `perf: inventaire` : les autres entrées, 1 passage, accessibilité = 100, le reste
journalisé. Toute requête vers un autre hôte que l'application fait échouer la mesure. Rapports HTML et JSON, plus
`summary.json`, dans `lighthouse-report/` (ignoré par git), envoyés en artefact `lighthouse` de la CI (7 jours), jamais
ailleurs. En local : `pnpm build` puis `E2E_SKIP_BUILD=1 pnpm test:perf` (ou `pnpm test:perf`, qui reconstruit).

## Prototype (spécification P0, P0b1)
`prototype.e2e.spec.ts` et `prototype.a11y.spec.ts` visent un **second serveur** sur le même build (`playwright.config.ts`,
port du premier + 1 000, `PROTOTYPE_URL` de `prototype-helpers.ts`), lancé avec `DATA_ADAPTER=prototype`,
`VADROUILLE_PROTOTYPE=1`, `CI=true` et `VADROUILLE_PROTOTYPE_DIR` sur `prototype/programmes-test/` (programme fabriqué à la
main, valeurs sentinelles, relecteur simulé). Aucune requête vers Google.

## Service workers (F10b, F10-TL-6)
`playwright.config.ts` bloque les service workers par défaut (`use.serviceWorkers: "block"`) et pose
`PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1`, pour que les requêtes du service worker passent par `context.route` (blocage
des domaines Google) et `context.setOffline`. Seuls `hors-ligne.e2e.spec.ts`, le bloc « page de repli » de
`voyage.a11y.spec.ts` et de `tests/visual/voyage.visual.spec.ts`, et le contrôle de persistance de `carte.e2e.spec.ts` posent
`test.use({ serviceWorkers: "allow" })` (liste vérifiée par `tests/unit/hors-ligne-config.test.ts`). Pour couper le réseau du
service worker de façon fiable, ces tests passent par `controlNetwork` de `hors-ligne-helpers.ts` (`context.setOffline` et
interruption des requêtes vers l'application par `context.route`).
