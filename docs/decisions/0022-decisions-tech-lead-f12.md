# 0022 — Décisions du Tech Lead pour F12 (accessibilité, performance, grand écran)

Statut : décision déléguée, définitive sans veto de Samuel sous 2 jours (avant le 2026-10-12) ; à lister dans la note de version suivante, rubrique « Décisions prises par le studio » · Date : 2026-10-10 · Décideur : Tech Lead (architecture, bibliothèques, outillage, tests ; délégation « Qui décide quoi » de `docs/CONTEXT.md`) · Ticket #94

Numérotation : 0006 à 0012 sont réservés par #26 et #27, 0017 par #65 et 0019 par #72 (en revue). Aucun 0022 n'existe dans `main` ni dans une PR ouverte au 2026-10-10. Si l'une d'elles change de numéro, le CEO le signale avant de fusionner cette PR.

## Contexte
Une question déléguée au Tech Lead est ouverte :
- **Q174** (spécification F12, fusionnée) : propositions F12-TL-1 à F12-TL-8 de `specs/F12-accessibilite-performance-grand-ecran.md`, à trancher avant le code de F12a.

Le code de F12 est découpé en quatre PR (F12-PO-14 ; ordre : CEO, Q175) : **F12a** (mesure), **F12b** (grand écran du voyage), **F12c** (grand écran des autres écrans), **F12d** (passe d'accessibilité et clôture des budgets). Pour chaque décision, la PR qui l'applique est indiquée. Chaque PR ne crée que ce qu'elle utilise.

**État de `main` au 2026-10-10, sur lequel cette décision est écrite** (vérifié, pas supposé) :
- `playwright.config.ts` : trois projets (`e2e`, `a11y`, `visual`), tous à 390 × 844, `isMobile: true`, `hasTouch: true`, `retries: 1` en CI, un seul `webServer` (`scripts/serve-standalone.mjs`, `VADROUILLE_DEV_PAGES=1`, port 3100), références sans suffixe de plateforme (`{testDir}/__screenshots__/{arg}{ext}`).
- `.github/workflows/ci.yml` : jobs `verify` (`pnpm verify`, artefact `test-results` seulement en cas d'échec) et `docker` ; détection des PR de documentation seule.
- `package.json` : Playwright 1.56.1 (Chromium 1194, figé par 0003), `@axe-core/playwright` 4.13.0, `engines.node >= 22.12.0` ; aucun outil Lighthouse.
- **T4 n'est pas fusionnée et n'a pas de PR ouverte** : ni `src/contracts/values.ts`, ni test `budget: JavaScript initial de la Journée` dans `tests/`. Le tableau des prérequis de la spécification le dit déjà ; F12a reste après T4 (Q179).
- Pages hors `/dev` : `/`, `/voyages/[id]` et `/voyages/[id]/jour/[n]` (groupe `(programme)`), `/voyages/[id]/presentation` ; plus `not-found.tsx`, `error.tsx`, `global-error.tsx` (F11c, #92).
- Tests axe : les six specs `*.a11y.spec.ts` et `tests/unit/axe.ts` répètent la même liste d'étiquettes ; `tests/e2e/etats-helpers.ts` contient déjà `blockExternal`, `expectTouchTargets`, `expectFocusOutlines` et `expectPageBasics` ; `tests/e2e/carte-helpers.ts` contient `blockGoogle`.
- `TripShell` lit `window.innerHeight` (`useViewportHeight`, `initialFitPadding`) ; `Sheet` pose sa hauteur en style en ligne (`style={{ height: "55%" }}`).
- Le workflow `visual-update.yml` de 0004 n'existe pas encore : les références se régénèrent avec `pnpm test:visual:update` sur le Chromium 1194 des sessions, identique à celui de la CI (0003).

Cette décision s'appuie sur 0003, 0004, 0013 (§ 1.6 pages de développement), 0015 (§ 4 recentrage, § 5 `Sheet`), 0016 (§ 1.3 condition « grand écran », § 3 budget et T4), 0020 et 0021 (budgets des fournisseurs, contour de focus de la plaque). Elle amende **0016 § 1.3** là où c'est dit (§ 6) et n'amende rien d'autre.

Hors de cette décision (signalé, non tranché) :
- **Samuel** : déclaration d'accessibilité et Acte européen (Q170), audit humain avec lecteurs d'écran (Q171), clé Maps de test pour mesurer avec la vraie carte (Q172), vues bureau des agences (Q176), règles de Ligne au-delà du mobile (Q177). Aucune décision ci-dessous ne fixe de règle de Ligne : les largeurs restent dans `provisoire.css` ;
- **UX/UI** : rendus grand écran (Q7, Q173) ;
- **Product Owner** : comportement fonctionnel ; un point lui est soumis (Q178) ;
- **CEO** : ordre des tâches (Q175, Q179).

**Argent, comptes, données** : aucune de ces décisions n'engage d'argent ni de compte externe. Lighthouse tourne dans la CI, contre le build de production, sans rapport envoyé ailleurs : ni `@lhci/cli` avec stockage public temporaire, ni serveur de rapports, ni tableau de bord hébergé. Les rapports sont des artefacts GitHub Actions du dépôt (déjà utilisés par le job `verify`), conservés 7 jours. Les pages mesurées ne contiennent que le jeu simulé ; aucune donnée personnelle.

**Une dépendance de développement nouvelle** : `lighthouse` (§ 1). Sa version est vérifiée sur le registre au démarrage de F12a et notée dans `docs/decisions/0003-versions.md` par F12a.

**Principe « l'agent cherche, l'ancrage vérifie, le moteur planifie »** : F12 ne cherche, ne vérifie et ne planifie rien. Elle change la disposition et mesure ; aucune donnée de voyage n'est calculée par l'écran.

**Règles Google** : F12 n'appelle aucun modèle. La mesure bloque les domaines Google comme les tests e2e ; sans clé dans la CI, la carte est dans son état de remplacement. En grand écran, la carte n'est jamais couverte par le panneau (§ 6, C15). Rien n'est stocké côté client.

## Décisions

### 1. F12-TL-1 — Outil de mesure
**Retenue avec modification** : `lighthouse` en Node, lancé depuis un projet Playwright ; médiane de trois passages pour la performance seulement ; `@lhci/cli` refusé.

- **Paquet** : `lighthouse` (Apache 2.0, sans compte), dépendance de développement, version exacte (sans `^`). Au 2026-10-10, la dernière est la 13.5.0, qui exige **Node ≥ 22.19** : F12a relève `engines.node` à `>=22.19.0` si la version retenue l'exige (la CI et l'image Docker suivent déjà la dernière Node 22 ; les sessions d'agents ont 22.22). Elle vérifie que la version fonctionne avec le Chromium 1194 de Playwright 1.56.1 ; sinon elle prend la plus récente qui fonctionne et note la raison dans 0003. **Playwright ne monte pas pour Lighthouse** (0003 : captures alignées sur le Chromium des sessions).
- **`@lhci/cli` n'est pas retenu** : une seconde dépendance, un serveur ou un dépôt de rapports à configurer, et le stockage public temporaire à un réglage près. Le module `lighthouse` suffit.
- **Navigateur** : le Chromium installé par Playwright (`chromium.executablePath()` de `@playwright/test`), jamais un second navigateur téléchargé. Lancé par Playwright avec `--remote-debugging-port`, puis `lighthouse(url, { port, … })` ; mode sans fenêtre récent (`--headless=new`), pas le `chromium_headless_shell`.
- **Réglages** : configuration par défaut de Lighthouse (profil mobile, émulation et ralentissement simulés), seules modifications permises :
  - `onlyCategories: ["performance", "accessibility", "best-practices", "seo"]` ;
  - `blockedUrlPatterns` tirés de la **même liste d'hôtes Google** que `blockGoogle` (`tests/e2e/carte-helpers.ts`) : F12a sort cette liste en une constante exportée et en dérive les deux formes (motifs Playwright, motifs Lighthouse), sans seconde copie ;
  - **`enableErrorReporting: false` explicite** : `lighthouse` dépend de `@sentry/node` ; le rapport d'erreurs est désactivé par défaut dans l'API Node, mais la valeur est écrite pour qu'un changement de défaut ne fasse rien partir.
  - Changer le profil, le ralentissement, l'émulation ou un seuil demande un amendement de cette décision (spécification, « Budgets de performance » ; même règle que 0016 § 3.1).
- **Passages et statistique** :
  - `R11` et `R12` (seuils) : **3 passages**, **médiane** du score de performance ; l'accessibilité doit valoir 100 **à chaque passage** (le score est déterministe ; une médiane cacherait un passage en échec) ;
  - autres routes de l'inventaire : **1 passage** (accessibilité = 100 bloquant, le reste journalisé) ;
  - le test journalise pour `R11` et `R12` les trois scores et leur écart. **Si l'écart dépasse 5 points**, la PR qui l'observe peut porter le nombre de passages à 5 (constante unique du module, jamais par route) en donnant les mesures ; au-delà de 5, ou pour toute autre réponse, amendement. Le seuil ne baisse jamais pour absorber la variance.
- **Rapports** : HTML et JSON par route et par passage dans `lighthouse-report/` à la racine (ajouté à `.gitignore`), plus `lighthouse-report/summary.json` (route, passage, quatre scores, octets de JavaScript initial si mesurés). Pas dans `test-results/` : Playwright vide ce dossier au début de chaque lancement.
- **Journal réseau (C1, C9)** : le test lit l'audit `network-requests` de chaque rapport JSON et échoue si une requête vise un autre hôte que l'application. Une requête Google bloquée est un échec aussi (attendu : zéro, comme `blockGoogle` dans les specs e2e).
- PR : **F12a**.

### 2. F12-TL-2 — Place dans la CI
**Retenue avec modification** : une **étape** du job `verify`, pas un job séparé.

- **Projet Playwright `perf`** dans `playwright.config.ts` : `testDir: "tests/perf"`, `testMatch: /.*\.perf\.spec\.ts$/`, **`retries: 0`** (une nouvelle tentative cacherait un score instable), même `webServer` que les autres projets (le drapeau des pages de développement ne change pas les pages mesurées, qui sont toutes hors `/dev`). Le spec se déclare en série (`test.describe.configure({ mode: "serial" })`) et le script passe `--workers=1` : deux mesures simultanées se ralentissent l'une l'autre.
  - Raison du projet Playwright plutôt qu'un script Node : l'inventaire (§ 3) est en TypeScript, que le lanceur de Playwright compile ; le serveur, le rapport `list` et l'arrêt sur échec existent déjà. Pas de `tsx` ni de second lanceur.
- **Scripts** : `"test:perf": "playwright test --project=perf --workers=1"`. **`pnpm verify` ne le contient pas** : il reste sans réseau ni clé, et sa durée locale ne change pas.
- **CI** : dans le job `verify`, après l'étape `pnpm verify` et sous la même condition `steps.diff.outputs.code == 'true'` :
  1. `E2E_SKIP_BUILD=1 pnpm test:perf` (réutilise le build de `pnpm verify`, aucun second `next build`) ;
  2. envoi de `lighthouse-report/` en artefact `lighthouse` avec `if: always() && steps.diff.outputs.code == 'true'`, `retention-days: 7` : le rapport existe aussi quand tout est vert (C5).
- **Raison de l'étape plutôt qu'un job** : un job nouveau devrait être ajouté aux vérifications requises de la branche `main`, réglage du dépôt sur GitHub, hors du dépôt et hors de ce que le studio peut modifier ; une étape de `verify` est requise dès qu'il l'est, sans rien changer aux réglages. Elle réutilise aussi l'installation et le build. Coût estimé : une vingtaine de passages Lighthouse, quelques minutes.
- Les PR de documentation seule ne lancent pas la mesure (même détection que `verify`).
- PR : **F12a** (seule PR de F12 à toucher `ci.yml`, `package.json` et `pnpm-lock.yaml`).

### 3. F12-TL-3 — Inventaire des routes
**Retenue avec modification** : données et actions séparées, pour que Vitest lise l'inventaire sans Playwright.

- **`tests/e2e/routes.ts`**, données pures, sans import de valeur de `@playwright/test` ni de l'application :
  - `ROUTES: readonly RouteEntry[]`, avec pour chaque route : `id` (identifiant du handover : `R11`, `R12`, `R6`…, ou `R-introuvable` pour les pages sans fichier `page.tsx`), `path` (adresse avec les paramètres du jeu simulé), `page` (chemin du fichier `page.tsx` sous `src/app`, groupes de routes compris, par exemple `voyages/[id]/(programme)/jour/[n]/page.tsx` ; absent pour la page introuvable), `states` (noms d'états, voir ci-dessous), `budgets` (`{ lighthouse: "seuil" | "journal"; javascript: "seuil" | "journal" }`) ;
  - `DEV_ROUTES` à part (`/dev/voyages/…`, carte simulée) : servent aux critères de recentrage et au balayage avec carte (F12b, F12d) ; **jamais mesurés par Lighthouse** ni comptés dans la comparaison aux fichiers.
- **États** : `tests/e2e/route-states.ts` associe à chaque nom d'état une action Playwright (`(page: Page) => Promise<void>`, fiche ouverte, feuille ouverte, toast, hors ligne…), en réutilisant les fonctions des `*-helpers.ts` existants, sans recopier leurs étapes. `routes.ts` n'en importe que le type des noms.
- **Test unitaire** `tests/unit/routes-inventaire.test.ts` (Vitest, inclus par `vitest.config.ts`) : la liste des `src/app/**/page.tsx` hors `src/app/dev/**` est **égale** à l'ensemble des `page` de `ROUTES` (une page manquante et une entrée sans fichier échouent toutes deux, message qui nomme le fichier) ; `id` uniques ; chaque nom d'état a son action (test de type par `satisfies Record<…>`).
- `tests/e2e/README.md` décrit la règle : toute PR qui ajoute une page l'inscrit dans `ROUTES` avec ses états et ses budgets (C8, F12-PO-15). **Point de revue**.
- PR : **F12a** (inventaire des routes présentes dans `main` à son démarrage), puis chaque PR d'écran.

### 4. F12-TL-4 — JavaScript initial étendu
**Retenue**, avec une seule implémentation de la mesure.

- La mesure de T4 (0016 § 3.1 règle 5 : scripts de l'origine jusqu'à l'inactivité du réseau, `gzipSync` niveau par défaut, carte comprise) est **sortie en une fonction** (`measureInitialJavaScript(page, path)` dans `tests/e2e/budget-helpers.ts`), appelée par un test paramétré par l'inventaire : seuil **strictement sous 200 000 octets** sur les entrées `budgets.javascript === "seuil"` (`R12`, `R11`, `R6`, et `R15` quand F10a l'inscrit), mesure journalisée sur les autres. Le test de T4 garde son nom (`budget: JavaScript initial de la Journée`) et sa route : il est **réécrit sur la fonction**, ni supprimé ni affaibli ; le nouveau test s'appelle `budget: JavaScript initial par route` (C7).
- Reste dans le projet `e2e`, donc dans `pnpm verify` : la mesure en octets est déterministe, à l'inverse du score Lighthouse.
- Un dépassement sur une route nouvellement soumise au seuil (`R11`, `R6`) : F12a le dit avec la mesure ; le Tech Lead tranche par amendement. Le seuil ne se relève pas et l'entrée ne repasse pas en « journal » sans décision écrite.
- PR : **F12a**, après T4. Si T4 n'est pas fusionnée au démarrage de F12a, F12a ne commence pas (Q179) : elle ne réécrit pas T4.

### 5. F12-TL-5 — Bascule au seuil et colonne commune
**Retenue avec précisions.**

- **Disposition en CSS seul**, variante Tailwind `lg:` (point d'arrêt par défaut de Tailwind 4, `64rem`, soit 1024 px à la taille de texte par défaut ; aucun point d'arrêt redéfini). Le rendu serveur est le même pour les deux dispositions : aucun saut au chargement, rien ne dépend d'une mesure pour s'afficher. Une taille de texte par défaut agrandie dans le navigateur relève le seuil en proportion et renvoie plus tôt à la disposition mobile : point soumis au Product Owner (Q178), la spécification disant « 1024 px CSS ».
- **Mesure dans le navigateur, seulement pour le comportement** : `src/lib/large-screen.ts` exporte `LARGE_SCREEN_QUERY = "(min-width: 64rem)"` et `useLargeScreen()` (`useSyncExternalStore` sur `matchMedia`, `false` au rendu serveur et à l'hydratation, valeur réelle après). Un test vérifie que la requête correspond au point d'arrêt `lg` de Tailwind. **Point de revue** : aucune autre requête de largeur dans le code (ni `innerWidth`, ni second `matchMedia` de largeur).
- **Même arbre de composants des deux côtés du seuil** : aucun rendu conditionnel d'un autre arbre selon `useLargeScreen()` (sinon le passage du seuil démonte la fiche, perd le focus et la hauteur, C14). Seules changent les classes et la logique du § 6. Ordre du document inchangé, aucun `order` ni placement de grille qui réordonne (F12-PO-6).
- **Colonne commune** : un seul composant, `PageColumn` (`src/components/ligne/PageColumn.tsx`, exporté par l'index de `ligne`, marqué « mise en page provisoire, Q177 » dans son commentaire), largeur `max-w-(--ligne-colonne)`, centré, marges `space-5` ; `--ligne-colonne` dans `provisoire.css` (valeur initiale égale au `max-w-md` actuel, 28 rem). Les `max-w-md` locaux des écrans hors voyage sont remplacés par lui ; **point de revue** : plus aucun `max-w-md` d'écran après F12c. Les barres d'actions fixées se posent dans la même largeur par la même variable, pas par une seconde valeur.
- PR : **F12b** (`large-screen.ts`), **F12c** (`PageColumn`, `--ligne-colonne`) ; la première des deux qui en a besoin crée `large-screen.ts`.

### 6. F12-TL-6 — `Sheet` latéral, recentrage tiré du conteneur — amende 0016 § 1.3
**Retenue avec modification** : la disposition latérale est du CSS, le mode n'est pas déduit au rendu.

- **`Sheet`** gagne une prop `sideOnLargeScreen?: boolean` (faux par défaut : `/dev/composants` et tout autre usage ne changent pas). Avec elle :
  - la hauteur au repos passe du style en ligne à une variable (`style={{ "--sheet-height": "55%" }}`, classe `h-(--sheet-height)`), pour que `lg:h-full` puisse l'emporter ; à partir de `lg` : statique, pleine hauteur, largeur `--ligne-panneau-large` (420 px, `provisoire.css`), contour `hairline` à gauche (rendu provisoire, UX/UI) ;
  - la poignée et ses deux boutons sont masqués par `lg:hidden` (retirés de l'arbre d'accessibilité, aucun gestionnaire de pointeur atteignable) ; transition de hauteur désactivée en `lg` ;
  - `useLargeScreen()` lu après le montage : en grand écran, `onSnapChange` n'est jamais appelé et le glisser ne démarre pas. **`snap` reste dans l'état de `TripShell`**, intouché, et redevient la hauteur visible au retour sous le seuil (C14).
- **`TripShell`** :
  - `main` devient, à partir de `lg`, une rangée : conteneur de la carte (`flex-1`, relatif) puis `Sheet` ; ordre du document inchangé (carte puis panneau) ;
  - `useViewportHeight()` (fenêtre) est **remplacé** par la mesure du conteneur par `ResizeObserver` : la hauteur de `main` (base des pourcentages du panneau) et la taille du conteneur de la carte. Un crochet unique, `useElementSize(ref)` (`src/lib/use-element-size.ts`) ; `SimulatedMapRenderer`, qui a son propre `ResizeObserver` pour la même mesure, passe sur ce crochet dans la même PR (pas de troisième implémentation) ;
  - `visibleInsets` : `{ bottom: snap × hauteur de main }` en mobile, **zéro partout** en grand écran (le panneau ne couvre pas la carte) ;
  - `fitPadding` : calculé à partir du conteneur de la carte et du mode ; il change **seulement au passage du seuil** (pas à chaque redimensionnement), ce qui recadre la carte une fois, sans animation ;
  - `onMarkerPress`, `onSkipToList` et `scrollStopIntoPanel` : en grand écran, ne changent pas `snap` et prennent la hauteur du corps du panneau comme hauteur visible.
- **Marqueur couvert par le panneau au focus (F12-PO-18, mobile)** : le renderer amène la position dans la zone visible par le **même calcul que le recentrage** (`visibleInsets` et `offsetCenter`, 0015 § 4), sans sélection, sans changer la liste ni l'adresse, `setCenter` sous `prefers-reduced-motion`. Pas de second calcul de centre. PR : **F12d** (critère C26), ou **F12b** si elle le trouve en écrivant ses tests.
- **Amendement de 0016 § 1.3** : « `fitPadding` et `visibleInsets` lisent `window.innerHeight` » est remplacé par « lisent la mesure du conteneur (`main` pour le panneau, conteneur de la carte pour le cadrage) ». La condition « même mesure pour le panneau et `visibleInsets` » est remplie et vérifiée par C12 (marqueur au milieu de la zone de la carte à 1 px près).
- Tests : unitaires de la spécification ([b]) ; `Sheet` sans `sideOnLargeScreen` : rendu et tests actuels inchangés.
- PR : **F12b**.

### 7. F12-TL-7 — Projet « grand écran »
**Retenue avec modification** : pas de nouveau projet Playwright ; les specs grand écran se placent elles-mêmes à 1280 × 800.

- **Pas de projet `grand-ecran`** : un projet qui rejouerait toutes les specs mobiles à 1280 × 800 les ferait échouer (poignée, hauteurs, toucher), et un projet limité aux fichiers `grand-ecran-*` exigerait d'exclure ces fichiers des projets `e2e`, `a11y` et `visual`, qui les prennent par leur suffixe. À la place :
  - `tests/e2e/grand-ecran-helpers.ts` exporte `LARGE_SCREEN = { viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false }` ;
  - chaque fichier `grand-ecran-*.{e2e,a11y,visual}.spec.ts` commence par `test.use(LARGE_SCREEN)` et reste dans le projet de son suffixe : `pnpm verify` les exécute sans script nouveau ;
  - les cas 1024 × 768, 1023 × 768 et la bascule 390 ↔ 1280 utilisent `page.setViewportSize` dans le test.
- **`playwright.config.ts` n'est pas modifié par F12b ni F12c** : seule F12a le touche (projet `perf`, § 2). Cela retire un fichier partagé de la liste du CEO (Q175).
- **Scénarios du handover § 14** : ceux qui touchent le voyage et existent dans `main` au démarrage de F12b sont rejoués à 1280 × 800, au clavier et à la souris, **en appelant les mêmes fonctions d'étapes** que leurs specs mobiles (déplacées dans les `*-helpers.ts` si elles sont dans un spec), sans recopier les étapes. Les scénarios arrivés ensuite suivent F12-PO-15.
- **Références visuelles** : noms suffixés par la taille (`grand-ecran-voyage-jour-2-1280x800.png`), modèle de chemin inchangé, tolérance inchangée (`maxDiffPixelRatio: 0.01`, 0004 point 5). Régénérées par `pnpm test:visual:update` sur le Chromium 1194 (0003), ou par le workflow de 0004 quand il existera.
- PR : **F12b** (voyage), **F12c** (autres écrans).

### 8. F12-TL-8 — Outillage de la passe d'accessibilité
**Retenue avec modification** : étiquettes axe alignées sur l'existant, aides partagées au lieu de copiées.

- **Étiquettes axe** : `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa` **et `best-practice`**, la liste de toutes les specs a11y actuelles et de `tests/unit/axe.ts` (la proposition omettait `best-practice` ; la retirer affaiblirait les tests existants). F12d la sort en une constante `AXE_TAGS` (`tests/e2e/a11y-helpers.ts`) et les specs `*.a11y.spec.ts` existantes l'importent, sans changer d'attente.
- **Aides partagées** : `expectTouchTargets`, `expectFocusOutlines`, `expectPageBasics` et `blockExternal` (aujourd'hui dans `etats-helpers.ts`) sont **déplacées** dans `tests/e2e/a11y-helpers.ts` et étendues là (intersection du focus avec le panneau, le toast, les bandeaux et les barres fixées, C26) ; `etats-helpers.ts` les réexporte ou ses specs changent d'import. **Point de revue** : aucune seconde version de ces vérifications.
- **Vérifications** :
  - défilement horizontal (C23) : `scrollWidth` du document ≤ largeur de la fenêtre ; les conteneurs autorisés à défiler (`DayTabs`, carte) sont désignés par un attribut de données existant ou ajouté, pas par une liste de sélecteurs CSS de mise en forme ;
  - espacement du texte (C24) : feuille injectée par `page.addStyleTag` (valeurs de 1.4.12), puis échec pour tout élément dont le débordement calculé est `hidden` ou `clip` et dont `scrollHeight > clientHeight` ou `scrollWidth > clientWidth` (1 px de tolérance d'arrondi) ;
  - focus (C26) : parcours Tab jusqu'au retour au premier élément, contour calculé (2 px, `line`, décalé de 2 px) et rectangle de l'élément non entièrement couvert (`elementsFromPoint` sur ses points de contrôle) ;
  - mouvement réduit (C27) : `page.emulateMedia({ reducedMotion: "reduce" })`, puis durées de transition et d'animation calculées nulles sur le panneau, la carte de présentation et la ligne de génération ;
  - couleurs forcées (C29) : `page.emulateMedia({ forcedColors: "active" })`, captures jointes au rapport du test par `testInfo.attach`, **sans `toHaveScreenshot`** ni fichier de référence (F12-PO-19 : sans seuil) ;
  - agrandissement (C25) : la balise `viewport` lue dans le DOM (ni `maximum-scale` ni `user-scalable=no`) ; le zoom à 200 % et 400 % est approché par les fenêtres CSS équivalentes (640 × 400, 320 × 568), Playwright ne zoomant pas le navigateur ;
  - titres (C28) : `document.title` de chaque entrée de l'inventaire, non vide et unique hors pages d'erreur.
- **Un spec unique** `tests/e2e/accessibilite-balayage.a11y.spec.ts`, boucle sur `ROUTES` × états × quatre tailles (F12-PO-16), `test.use` par taille ; à 1280 × 800, `LARGE_SCREEN` du § 7. Les tests de focus et de titres peuvent vivre dans un `accessibilite-balayage.e2e.spec.ts` voisin.
- PR : **F12d**.

## Conséquences
- **F12a** (après T4) : `lighthouse` en dépendance de développement, version dans 0003, `engines.node` relevé si nécessaire ; projet `perf`, `tests/perf/*.perf.spec.ts` (`perf: budgets du § 14`, `perf: inventaire`), `test:perf` ; étape et artefact `lighthouse` dans `ci.yml` ; `lighthouse-report/` dans `.gitignore` ; constante des hôtes Google partagée ; `routes.ts`, `route-states.ts`, test unitaire, règle du README ; `measureInitialJavaScript` et `budget: JavaScript initial par route`. Si un seuil de `R11` ou `R12` n'est pas atteint à F12a, l'entrée est marquée comme telle dans `routes.ts`, la mesure est donnée dans la PR et le Tech Lead décide à la revue ; ce seuil devient bloquant au plus tard à F12d (C5). L'accessibilité = 100 est bloquante dès F12a.
- **F12b** (après F5c et F12a) : `large-screen.ts`, `use-element-size.ts`, `Sheet` (`sideOnLargeScreen`, variable de hauteur), `TripShell` (mesure du conteneur), `--ligne-panneau-large` ; specs `grand-ecran-voyage.*` avec `test.use(LARGE_SCREEN)` ; pas de modification de `playwright.config.ts`.
- **F12c** (après F12a) : `PageColumn`, `--ligne-colonne`, `dialog.tsx`, écrans hors voyage ; specs `grand-ecran-ecrans.*`.
- **F12d** (en dernier) : `a11y-helpers.ts` (aides déplacées, `AXE_TAGS`), balayage, marqueur au focus si F12b ne l'a pas fait, corrections, tableau des mesures (C30).
- **Fichiers partagés pour l'ordre du CEO** (Q175) : `playwright.config.ts` n'est plus touché que par F12a ; `ci.yml`, `package.json`, `pnpm-lock.yaml` par F12a seule ; `tests/e2e/etats-helpers.ts` et les specs `*.a11y.spec.ts` existantes par F12d (changement d'import seulement).
- **Spécification F12** : ses critères ne changent pas (règle de sa section « Choix réservés au Tech Lead »). Sa prochaine mise à jour pourra renvoyer à cette décision pour l'absence de projet « grand écran » (§ 7), le projet `perf` et l'étape de `verify` (§ 2), la séparation `routes.ts` / `route-states.ts` (§ 3), `best-practice` dans les étiquettes axe (§ 8) et le seuil en `rem` (§ 5, Q178) — Q180.
- **0016 § 1.3** : amendée par le § 6.
- **Tâches induites** : aucune. Tout entre dans F12a à F12d.
- **Revue** des PR F12a à F12d : le Tech Lead vérifie leur conformité à cette décision. Un écart demande un amendement écrit ici, pas une exception silencieuse.

## Questions liées
**Nouvelles questions** (numéros provisoires ; le CEO attribue les numéros définitifs dans `QUESTIONS.md`) :
- **Q178 (Product Owner)** : le seuil de bascule est le point d'arrêt `lg` de Tailwind, `64rem` : 1024 px à la taille de texte par défaut, davantage si la personne agrandit la taille de texte par défaut de son navigateur (elle reste alors plus longtemps en disposition mobile). La spécification dit « 1024 px CSS ». Confirmer ce comportement, ou demander un seuil en pixels indépendant de la taille de texte. **Bloque** : rien ; le § 5 s'applique d'ici là, et les critères C10 et C11 (taille de texte par défaut) sont vrais dans les deux cas.
- **Q179 (CEO)** : T4 (0016 § 3.2) n'est ni fusionnée ni en PR au 2026-10-10, alors que F12a en dépend (F12-TL-4) et que T4 devait précéder F5c. Placer T4 avant F12a et F5c. **Bloque** : le démarrage de F12a.
- **Q180 (Product Owner)** : aligner la spécification F12 sur cette décision à sa prochaine mise à jour (points listés dans « Conséquences », « Spécification F12 »). **Bloque** : rien ; cette décision prime d'ici là.

**Questions déjà ouvertes, rappelées** (non tranchées ici) :
- **Q170, Q171** (Samuel) : F12 ne déclare aucune conformité ; aucun audit humain n'est prévu.
- **Q172** (Samuel) : sans clé de test, la mesure se fait sur la carte de remplacement ; la mesure avec la vraie carte (journalisée sans seuil) attend sa réponse et ne demande alors qu'un projet ou une option de plus, pas une nouvelle décision d'outil.
- **Q176, Q177** (Samuel) : aucune vue bureau propre aux agences ; `--ligne-panneau-large` et `--ligne-colonne` restent dans `provisoire.css`.
- **Q7, Q173** (UX/UI) : rendus grand écran provisoires.
- **Q175** (CEO) : ordre de F12a à F12d ; voir « Fichiers partagés » ci-dessus.
