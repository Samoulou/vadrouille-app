# P0c — Régime de confinement des capacités et de l'environnement

Rédaction : rôle **securite** (`.claude/agents/securite.md`) · Date : 2026-10-12 · Ticket : #191 · Origine : découpage de #172 décidé par le CEO avec le Tech Lead (issuecomment-6129943401, 42e cycle) · Reprend : bloquants 1, 2, 3, 4 et 6 et mineurs 8 et 11 de la revue consolidée du head `0190606` de #172 (issuecomment-6127551404), P0-Q21 (Q288)

Rôles d'exécution : **release** (contrôles de `package.json`, des workflows, du `Dockerfile`, `CODEOWNERS`, contrôle de chemins) et **backend** (test de capacité, confinement de l'environnement), au choix du CEO ; revue Tech Lead et Sécurité · Prérequis : aucun pour cette spécification ; pour le code, les décisions du Tech Lead sur P0c-TL-1 à P0c-TL-5 (« Décisions attendues du Tech Lead »), **écrites dans `docs/decisions/` avant l'ouverture de la PR de P0c1 ou de P0c2** ; pour P0c2 en plus, la réponse de Samuel à P0c-Q2 (section 8) · Référence : `specs/P0-prototype-recherche.md` (#149, test d'imports de P0a1), `specs/P0-suite-executions-reelles.md` (version réduite de #172, head `335d925`, exigence d'entrée 7 de P0r2 ; version `0190606`, section « Aucun appel déclenchable », d'où vient ce régime), décisions 0002, 0017 § 3.3, 0026, 0031 (jointe à #172, non fusionnée), 0032 § A3.4, 0034, `specs/T18-owner-approved-workflows.md` (#183, ouverte), `docs/handovers/backend.md` § 2 et § 3

**Statut vis-à-vis de P0r2.** Cette spécification **et son code**, fusionnés, sont l'**exigence d'entrée 7 de P0r2** (version réduite de #172, « Renvoyé à la spécification suivante ») : ils doivent être sur `main` avant l'ouverture de la PR de P0r2. Ils avancent en parallèle de P0r1, qui n'en dépend pas.

**Nom du fichier.** La version réduite de #172 propose `specs/P0-regime-confinement.md` (« nom proposé »). Le ticket #191 fixe `specs/P0c-confinement-capacites.md`. La PR qui fusionnera la dernière (#172 ou celle-ci) aligne le renvoi de #172 sur ce nom.

## Objectif
Garantir, **par des tests qui tournent dans `pnpm verify`**, qu'aucun fichier du dépôt ne peut ouvrir une connexion réseau, lancer un processus, charger du code de façon dynamique ou lire une variable d'environnement en dehors d'une **liste d'autorisation écrite**, gardée par le Tech Lead avec un verdict Sécurité. Le but est que la clé OpenRouter et la clé serveur Google (puis l'identifiant de la base, B1) ne soient atteignables que depuis les modules étroits prévus par P0r1 et B3, et qu'un ajout de capacité ne passe jamais en silence.

Chaque règle de cette spécification est **satisfaisable sur `main` augmenté du code du régime** : les listes ci-dessous ont été relevées sur `main` au commit `b2c181e` (2026-10-12) par une analyse des 332 fichiers suivis avec le compilateur TypeScript (méthode de la section 2, accès calculés compris, section 2.6), puis revérifiées à la correction 1 sur le même commit ; `main` est depuis passé à `611aff7`, qui ne change que `QUESTIONS.md`, `STATUS.md` et `specs/T18-owner-approved-workflows.md`, donc aucun fichier analysé. « Augmenté du code du régime » veut dire : les fichiers du régime lui-même (`tests/unit/confinement/**`, `tests/support/serveur-local.ts`) sont analysés comme les autres, sans exemption, et leurs propres lignes sont écrites dans cette spécification (section 3, « Lignes du régime lui-même » ; section 6, `typescript`) ; les cas refusés qu'ils testent vivent dans des fichiers de données non analysés (section 1, « Données du régime »). Le test échoue si une exception devient inutile (« Rôles et garde des listes ») : une liste fausse se voit donc dès la première exécution.

La revérification de la correction 1 a corrigé quatre relevés de la version `fc54aae` : `vi.stubEnv(name, …)` à nom non littéral dans `tests/unit/accueil.test.tsx` (section 4), `next/font/google` dans `src/app/fonts.ts` (section 3), l'identifiant `require` dans `src/lib/large-screen.test.tsx` (section 3), `node:util` inutilisé (section 6).

## Points de la revue du head `0190606` réglés ici
| Point | Objet | Où |
|---|---|---|
| Bloquant 1 | `node <chemin>` limité à `scripts/ci/*.mjs`, alors que `start` lance `scripts/serve-standalone.mjs` | Section 7 (liste exacte des scripts, des `node` des workflows, de la configuration et du `Dockerfile`, vérifiée contre `main`) |
| Bloquant 2 | Exception de `carte.e2e.spec.ts` écrite en chaînes, alors que le fichier contient une expression régulière échappée | Section 2.5 (normalisation des hôtes) et tableau de la section 3 |
| Bloquant 3 | Tests imposés par P0r1 qui utilisent des capacités non listées | Section 4 (régime des tests) |
| Bloquant 4 | Contournements du lint de `process.env` (`node:process`, alias, `process["env"]`, `globalThis.process`, passage en argument) | Section 5 (liste d'autorisation) |
| Bloquant 6 | Dépendance tierce ajoutée sans contrôle | Section 6 (liste d'autorisation des spécificateurs et des paquets) et section 8 (`CODEOWNERS`, contrôle de chemins) |
| Mineur 8 | `globalThis` passé en valeur ou en argument (`Reflect.get`, `Object.getOwnPropertyDescriptor`) | Section 2.3 |
| Mineur 11 | Verdict Sécurité lu dans un commentaire posté sous le compte unique du studio | Section 8 (« Indépendance ») et P0-Q21 |

## Points de la revue du head `fc54aae` et renvois réglés ici (correction 1)
| Point | Objet | Où |
|---|---|---|
| Bloquant 1 | Le régime ne s'appliquait pas à ses propres tests | Section 1 (« Données du régime »), section 3 (« Lignes du régime lui-même »), section 4 (« Tests du régime »), section 6 (`typescript`), « satisfaisable » ci-dessus, critère 1 |
| Bloquant 2 | Verdict Sécurité sur le head ni défini ni satisfiable | Section 8 (« Verdict lu », format exact) ; modification du prompt R2 posée à Samuel : **P0c-Q2** ; P0c2 en dépend (« Découpage et ordre ») |
| Bloquant 3 | Tableau `process.env` contraire à la section 4 | Section 4, point 3, et section 5 (ligne `vi.stubEnv` retirée, relevé informatif) |
| Mineurs | Jetons des options, `require` de `large-screen`, `importOriginal`, chaînes et clés, `next/font/google`, `Dockerfile`, P0c-TL, `node:util` | Sections 7, 3, 4, 5, 3 et 6, 7, « Décisions attendues du Tech Lead », 6 |
| Ajout du CEO 1 | Options interdites comparées par jeton, `_` normalisé en `-`, `--no-…` | Section 7 (« Comparaison des options interdites ») |
| Ajout du CEO 2 (#180, décision issuecomment-6132707686, mineurs 4 et 6 de la revue du head `2eecd59`) | Tests de `src/ai`, `src/research` en liste d'autorisation ; `src/contracts` couvert | Section 4 (« Zones sensibles »), section 6 (« Zones sensibles », `src/contracts`), section 1 |
| Ajout du CEO 3 | Accès calculés au-delà de l'objet global et de la forme littérale de `.constructor` | Section 2.6 |

## Ce qui est en place (relevé sur `main` à `b2c181e`)
- Aucun des dossiers `src/ai`, `src/research`, `src/grounding` n'existe sur `main` : le test d'imports de #149 arrive avec P0a1 (#180, ouverte) et les quatre modules de capacité avec le code de P0r1. Aucun appel à OpenRouter ou aux API serveur de Google n'existe dans le dépôt.
- Aucun fichier `CODEOWNERS`, `.npmrc` ou `pnpm-workspace.yaml`. Aucun script de cycle de vie (`preinstall`, `install`, `postinstall`, `prepare`…) dans `package.json`. `pnpm.onlyBuiltDependencies` vaut `["sharp", "unrs-resolver"]` ; pas de `pnpm.overrides`.
- Les workflows ne reçoivent aucune clé d'API : seuls `github.token` (auto-merge, release, techlead-gate, visual-update) et `secrets.SLACK_WEBHOOK_STUDIO` (release) y apparaissent.
- `techlead-gate.yml` tourne sur `pull_request` et exécute `scripts/ci/techlead-gate.mjs` **dans la version de la PR** : une PR peut donc modifier la porte qui la juge. Ce constat motive la garde de `scripts/ci/**` (section 8) ; T18 (#183) traite les workflows eux-mêmes.
- La version `0190606` de #172 nommait `src/adapters/context.ts` et `src/adapters/index.ts` parmi les fichiers qui passent `process.env` entier. C'est inexact : ils lisent `process.env.DATA_ADAPTER` et `process.env.PAYMENT_ADAPTER` par propriété littérale. Les fichiers qui passent `process.env` entier sont `src/adapters/payment-guard.ts`, `src/adapters/simulation.ts`, `src/dev/flags.ts`, `playwright.config.ts` et `tests/unit/ci/visual-update.test.ts` (section 5).

## Rôles et garde des listes
- **Propriétaire des listes** : le Tech Lead (outillage et tests, « Qui décide quoi »). Les listes sont des fichiers TypeScript commités à côté des tests, sous `tests/unit/confinement/` (nom proposé, P0c-TL-1).
- **Verdict Sécurité obligatoire** dans la revue consolidée de toute PR qui ajoute, retire ou élargit une ligne d'une liste, modifie un test du régime, ou touche un chemin gardé (section 8), sous la forme exacte de la section 8 (« Verdict lu »). Tant que le prompt de la routine R2 n'appelle pas `securite` sur ces chemins (P0c-Q2), ce verdict n'est produit que si l'orchestrateur le demande de lui-même : c'est pourquoi P0c2, qui le rend bloquant, attend la réponse de Samuel.
- **Aucun joker** dans les exceptions de capacité : chaque ligne nomme un fichier exact et une capacité exacte. Les zones par motif (`tests/**`) ne servent qu'aux modules **sans capacité** (section 6).
- **Exception inutile = échec** : le test échoue si une ligne ne correspond plus à rien (fichier absent, capacité disparue), pour que les listes ne s'élargissent pas en silence. Sont des **lignes** au sens de cette règle : les exceptions de capacité (section 3), les formes nominatives du régime des tests (section 4), les lignes `process` et `process.env` (section 5), chaque spécificateur de la liste des spécificateurs et chaque paquet (section 6), chaque script et chaque chemin `node` des workflows (section 7). Ne sont **pas** des lignes : les formes admises sans ligne par la section 4 (dont `vi.stubEnv` à nom littéral), les règles générales et les listes de refus (modules à capacité, hôtes, noms secrets, options interdites), qui peuvent ne rien détecter sur `main`.

## 1. Fichiers analysés
- **Tous les fichiers suivis par Git** (`git ls-files`) d'extension `ts`, `tsx`, `js`, `jsx`, `mjs`, `cjs`, `mts`, `cts`, déclarations `.d.ts` et `.d.mts` comprises, où qu'ils soient : `src/`, `tests/` (`tests/e2e/`, `tests/visual/`, `tests/perf/` compris), `scripts/`, `eslint-rules/`, `prototype/`, `db/` (B1), fichiers de configuration à la racine, `middleware.*` et `instrumentation.*` s'ils apparaissent. Sur `main` : 332 fichiers.
- Plus, par des contrôles propres (section 7) : `package.json`, `.github/workflows/*.yml`, `Dockerfile`, et l'absence de `.npmrc`, `.yarnrc*` et `pnpm-workspace.yaml`.
- Un fichier suivi de ces extensions qui est un lien symbolique (mode Git `120000`) fait échouer le test (aucun sur `main`).
- **Énumération** : par `git ls-files -z -s` (chemins et modes), lancé par le seul utilitaire `tests/unit/confinement/fichiers.ts` (ligne nominative `node:child_process`, section 3, « Lignes du régime lui-même »). Une erreur de `git` ou une liste vide fait échouer le test.
- `src/contracts/**` est analysé comme le reste du dépôt (mineur 6 de la revue du head `2eecd59` de #180) ; il a en plus une liste de spécificateurs restreinte (section 6, « Zones sensibles »).
- **Données du régime.** Les textes que le régime doit refuser (cas négatifs : hôtes surveillés, noms secrets, `vi.stubEnv("OPENROUTER_API_KEY", …)`, `import http from "node:http"`, `vi.importActual("undici")`, références à `secrets.…` dans un workflow…) et les listes qui contiennent des valeurs refusées (hôtes surveillés, fragments, noms secrets, options interdites) ne sont **jamais** écrits dans un fichier analysé : ils vivent dans des fichiers **`.json`** sous `tests/unit/confinement/donnees/`, extension que la section 1 n'analyse pas. Les tests les lisent par `node:fs` (module neutre, admis dans les tests) et passent chaque cas à l'analyseur avec un **chemin simulé** (par exemple `src/x.ts` pour un fichier non-test de `src/`). Les fichiers `.ts` du régime ne contiennent donc ni hôte surveillé, ni nom secret, ni import réel d'un module à capacité hors de leurs deux lignes nominatives, et passent la même analyse que tout fichier ; ils ne sont nommés dans aucune exclusion. Les fichiers `.json` de `tests/unit/confinement/donnees/` sont des chemins gardés (section 8). Un `.json` est une feuille du graphe d'imports (2.2) : un fichier qui en importerait un pour en tirer un hôte relève de la limite écrite en 2.5.

## 2. Méthode de détection
### 2.1 Analyse syntaxique
- Chaque fichier est lu par le **compilateur TypeScript** (`typescript`, déjà en `devDependencies` : aucun paquet ajouté), en mode TSX pour `tsx` et `jsx`. Aucune recherche de chaînes sur le texte brut, sauf pour les hôtes (2.5), qui portent sur les nœuds de chaîne de l'arbre.
- Les **commentaires** ne comptent pas. Les **positions de type** (annotations, `typeof X` dans un type, `import("…")` de type, déclarations `declare`) ne comptent pas comme usage d'une capacité, sauf les spécificateurs de module (2.2), qui comptent toujours, `import type` compris.
- Les **conversions de type sont transparentes** : `(window as T).x`, `globalThis!`, `(globalThis)` et `satisfies` sont analysés comme l'expression qu'ils enveloppent.

### 2.2 Spécificateurs de modules
- Sont relevés : `import … from`, `import type`, `export … from`, `export * from`, `import x = require("…")`, `import("…")` à spécificateur littéral, `require("…")` à spécificateur littéral (fichiers CommonJS), et `import("…")` en position de type.
- Normalisation : un module intégré de Node doit être écrit **avec le préfixe `node:`** ; un nom intégré sans préfixe (`fs`, `http`) est traité comme un paquet tiers inconnu, donc refusé. Les sous-chemins comptent pour leur module (`node:dns/promises` relève de `node:dns` ; `drizzle-orm/pg-core` de `drizzle-orm`).
- Un spécificateur relatif ou `@/…` qui ne résout vers **aucun fichier suivi** fait échouer le test (échec fermé). Résolution : extension exacte, puis `.ts`, `.tsx`, `.mts`, `.mjs`, `.js`, `.d.mts`, `.d.ts`, puis `/index.*` ; `@/` vaut `src/`. Les fichiers `.css` et `.json` suivis sont des feuilles.

### 2.3 Identifiants et objet global
Sont relevés, en position de valeur (pas comme nom de propriété après `.`, pas comme clé d'objet littéral non abrégée) :
- `fetch` (y compris en propriété abrégée `{ fetch }`), `WebSocket`, `XMLHttpRequest`, `EventSource`, `Worker`, `SharedWorker`, `importScripts`, `eval`, `Function`, `require` (sauf `require("<littéral>")` dans un fichier `.cjs`, traité comme un spécificateur en 2.2), `module` (CommonJS) ;
- les propriétés `.sendBeacon`, `.getBuiltinModule`, `.binding`, `._linkedBinding`, `.dlopen` et `.mainModule`, sur n'importe quel objet ;
- les **noms de l'objet global** `globalThis`, `global`, `self`, `window`. Leur usage est **admis** seulement sous ces formes : lecture ou écriture d'une propriété à nom littéral (`window.matchMedia`, `window["x"]`), sauf les propriétés `fetch`, `process`, `require` et `eval` qui restent des capacités ; opérande de `typeof`. **Tout autre usage est une capacité** : accès calculé à clé non littérale (`globalThis[expr]`), **affectation à une variable ou à une propriété (alias)**, **passage en argument** (`Reflect.get(globalThis, …)`, `Object.getOwnPropertyDescriptor(globalThis, …)`, `Object.assign(…, window)`), retour de fonction, étalement, déstructuration (`const { fetch } = globalThis`), valeur par défaut (mineur 8) ;
- `.constructor` dont le résultat est appelé, construit (`new`), affecté ou passé en argument (accès à `Function`). La lecture `x.constructor.name` reste admise (`tests/unit/sejour-pages.test.tsx`).

Le contrôle ne fait **aucune analyse de portée** : une variable locale nommée `fetch` est refusée comme le `fetch` global. C'est voulu (plus simple, sans faux négatif) ; aucun fichier de `main` n'en souffre.

### 2.4 Contournements refusés partout (sans exception possible)
`import()` et `require()` à spécificateur non littéral ; `import.meta.resolve` ; `import.meta.env` ; `eval` ; `new Function` et `Function(…)` ; `.constructor` appelé (2.3) ; `process.binding`, `process._linkedBinding`, `process.dlopen`, `process.mainModule`, `process.getBuiltinModule` ; `module.require`, `module.createRequire` hors de la seule exception nominative de `src/lib/large-screen.test.tsx` ; un accès calculé refusé par la section 2.6 ; tout texte (2.5, après normalisation) qui contient `/proc/` (lecture de `/proc/self/environ` : mineur 4 de la revue du head `2eecd59` de #180) ; tout texte qui désigne un fichier d'environnement, `(^|/)\.env(\.[a-z0-9.-]+)?$`, sauf `.env.example` (lu par `tests/unit/google-regles.test.ts` et cité par `tests/unit/debloquer-regles.test.ts` sur `main`). Le mot français « environ », fréquent sur `main`, n'est pas visé. Sur `main` : aucun texte refusé par ces deux règles.

### 2.5 Hôtes : normalisation, expressions régulières, gabarits
- **Textes examinés** : littéraux de chaîne, gabarits sans substitution, chaque segment (`quasi`) d'un gabarit, texte JSX et valeurs d'attributs JSX, corps des littéraux d'expression régulière, et le **résultat replié** des expressions constantes : concaténation `+` de littéraux, gabarit dont toutes les substitutions sont des littéraux (`` `${"openrouter"}.ai` `` donne `openrouter.ai`). Les spécificateurs de modules sont exclus (2.2 les traite).
- **Normalisation** de chaque texte, dans cet ordre : forme NFKC ; minuscules ; décodage de `%2e` en `.` ; dans un corps d'expression régulière et dans les arguments de `new RegExp(…)`, retrait des échappements (`\.` donne `.`, `\/` donne `/`) et remplacement de la classe `[.]` par `.` ; retrait d'un point final de nom pleinement qualifié.
- **Hôtes surveillés** : `openrouter.ai`, `googleapis.com` et `ai-gateway.vercel.sh` (chemin de l'AI Gateway, à fermer avec la règle de P0r1 sur l'AI SDK), chacun avec ses sous-domaines. Correspondance par **limite d'étiquette** : `(?<![a-z0-9-])(?:[a-z0-9-]+\.)*(openrouter\.ai|googleapis\.com|ai-gateway\.vercel\.sh)(?![a-z0-9-])`.
- **Fragments** : les étiquettes isolées `openrouter` et `googleapis`, `(?<![a-z0-9])(openrouter|googleapis)(?![a-z0-9])`, sont aussi relevées, pour attraper une concaténation faite à l'exécution (`base + ".ai"`).
- **Limite** : un hôte calculé autrement (codes de caractères, base64, chaîne venue d'un fichier) échappe à cette recherche. Ce risque est résiduel et accepté : le contrôle principal est celui des capacités (2.3), sans lesquelles aucune requête ne part.

Sur `main`, la méthode relève exactement :
- `tests/e2e/carte-helpers.ts` l. 9 : chaîne `"googleapis.com"`, hôte normalisé `googleapis.com` ;
- `tests/e2e/carte.e2e.spec.ts` l. 307 : littéral d'expression régulière `/places\.googleapis\.com|routes\.googleapis\.com/`, hôtes normalisés `places.googleapis.com` et `routes.googleapis.com`.

### 2.6 Accès calculés (ajout du CEO 3)
La règle ne se limite ni à l'objet global, ni à la forme littérale `.constructor` : `(() => {})[k]` avec `k` qui vaut `"constructor"` donne `Function`, quel que soit le nom de `k` et même si `Symbol` est redéclaré (`const Symbol = { c: "constructor" }`, puis `(() => {})[Symbol.c]`, cas du bloquant 1 de la revue du head `2eecd59` de #180). Sont des **accès calculés** : `o[k]` (lecture, écriture, appel), le nom calculé d'une déstructuration (`const { [k]: v } = o`) et l'étalement en reste d'une déstructuration (`const { a, ...r } = o`). Le nom calculé d'un **littéral d'objet** en création (`{ [k]: v }`) n'est pas un accès : il écrit sur un objet neuf et ne lit rien.

**Zones sensibles** (`src/ai/**`, `src/research/**`, `src/grounding/**`, `src/server/env/**`, `src/server/composition/**`, `scripts/p0/**`, fichiers de test compris) et **fichiers hors du programme TypeScript** (ceux que `tsconfig.json` n'inclut pas : `*.mjs`, `*.cjs`, `*.js` à la racine, sous `scripts/` et `eslint-rules/`) : règle fermée de #180 (décision issuecomment-6132707686, point 1). Une clé n'est admise que si elle est un littéral de chaîne ou de nombre, ou `Symbol.iterator`, `Symbol.asyncIterator`, `Symbol.toStringTag`, `Symbol.hasInstance` **et** qu'aucun identifiant `Symbol` n'est lié dans le fichier (variable, paramètre, import, classe, fonction). Le nom calculé et le reste en déstructuration sont refusés. Sur `main` : aucune de ces zones n'existe, et les fichiers hors programme ne contiennent aucun accès calculé (vérifié).

**Reste du dépôt** : la clé est jugée par son **type statique**, donné par le vérificateur de types de `typescript` sur le programme de `tsconfig.json` (P0c-TL-5), conversions de type retirées de la clé **et** de l'objet avant de demander le type (2.1). Une clé non littérale est admise si son type est :
1. numérique ;
2. une union de littéraux de chaîne et de nombres dont aucun n'est un **nom interdit** : `constructor`, `prototype`, `__proto__`, `__defineGetter__`, `__defineSetter__`, `__lookupGetter__`, `__lookupSetter__`, `caller`, `callee`, `arguments`, `call`, `apply`, `bind`, `process`, `env`, `fetch`, `require`, `eval`, `Function`, `globalThis`, `getBuiltinModule`, `binding`, `_linkedBinding`, `dlopen`, `mainModule` ;
3. `string`, **seulement** si l'objet a une signature d'index de chaîne (`Record<string, T>`, `{ [k: string]: T }`) et aucune signature d'appel ni de construction ;
4. un `unique symbol` déclaré dans le même fichier par `const X = Symbol.for("<littéral>")` ou `Symbol("<littéral>")`, `Symbol` n'étant lié nulle part dans le fichier ; ou l'un des quatre symboles bien connus ci-dessus aux mêmes conditions.

Tout autre type est refusé, en particulier `any`, `unknown`, `string` sur un objet sans signature d'index ou appelable (fonction, classe), et un littéral interdit. L'étalement en reste est admis hors des zones sensibles (il ne copie que des propriétés propres énumérables ; `main` l'utilise pour les composants). Un `Symbol` lié dans un fichier fait refuser tout accès dont la clé passe par lui.

Relevé sur `main` (`b2c181e`, vérificateur de types sur `tsconfig.json`) : 115 accès ou noms calculés à clé non littérale, tous dans le programme TypeScript. 82 accès à clé numérique ou à union de littéraux sans nom interdit (cas 1 et 2) ; 13 accès à clé `string` sur un `Record<string, …>` non appelable (cas 3, dont `src/features/sejour/programme.ts`, `src/adapters/mock.ts`, `src/i18n/index.ts`) ; 2 accès à `unique symbol` (cas 4, `holder[REGISTRY_KEY]` de `src/adapters/simulation.ts`, `REGISTRY_KEY = Symbol.for(…)`) ; 17 noms calculés de littéraux d'objet en création ; 1 nom calculé en position de type (`src/adapters/simulation.ts` l. 97, hors analyse, 2.1). Aucune déstructuration à nom calculé. **Tous admis**, sans ligne.

**Limite assumée.** Hors des zones sensibles, un type peut mentir par une valeur `any` affectée à une variable annotée (`const r: Record<string, unknown> = f as unknown as Record<string, unknown>`, puis `r[k]`). La règle ESLint `@typescript-eslint/no-explicit-any` du dépôt réduit ce cas sans le fermer. Il reste acceptable parce que les zones sensibles, où vivent les clés et les modules de capacité, appliquent la règle fermée, et parce que la section 5 interdit hors de `src/server/env/` toute lecture d'un nom secret.

## 3. Capacités et exceptions nominatives
### Capacités
Une **capacité** est l'un de ces usages, détectés par la section 2 :
1. un spécificateur de **module à capacité** : `node:http`, `node:https`, `node:http2`, `node:tls`, `node:net`, `node:dgram`, `node:dns`, `node:child_process`, `node:vm`, `node:worker_threads`, `node:cluster`, `node:inspector`, `node:module`, `node:process`, et les paquets `undici`, `ai`, `@ai-sdk/*`, `@openrouter/ai-sdk-provider`, `pg`, `lighthouse`, `@googlemaps/js-api-loader`, `next/font/google` ;
2. un identifiant ou une propriété de la section 2.3, ou un usage de l'objet global hors des formes admises ;
3. un hôte ou un fragment de la section 2.5.

Hors des exceptions nominatives ci-dessous, du régime des tests (section 4) et des capacités des modules de P0r1 (lignes ajoutées par le code de P0r1, section 9), **toute capacité fait échouer le test**, quel que soit le nom de la fonction qui l'utilise.

### Exceptions nominatives sur `main` (`b2c181e`)
Chaque ligne est un couple **(fichier, capacité)** exact, avec sa **portée** (fermeture transitive ci-dessous). Toute autre capacité reste refusée dans ce fichier.

| Fichier | Seule capacité admise | Usage | Portée |
|---|---|---|---|
| `scripts/serve-standalone.mjs` | `node:child_process` (`spawn` seulement) | lance le serveur Next autonome (`pnpm start`, e2e) | outil |
| `tests/perf/lighthouse-helpers.ts` | `node:net` (`createServer` seulement) ; `import("lighthouse")` à spécificateur littéral | port libre et mesure Lighthouse (0022) | test |
| `tests/unit/ci/visual-update.test.ts` | `node:child_process` (`execFileSync`, `spawn`, `spawnSync`) ; `node:http` (`createServer`) ; `node:net` (`import type { AddressInfo }` seulement) | test du workflow de mise à jour visuelle | test |
| `tests/unit/debloquer-regles.test.ts` | `node:child_process` (`execFileSync` seulement) | test des règles de déblocage | test |
| `src/lib/large-screen.test.tsx` | `node:module` (`createRequire` seulement) **et** l'identifiant `require` (2.3), sous la seule forme `const require = createRequire(import.meta.url)` puis `require.resolve("tailwindcss/package.json")` (l. 47 et 48) ; aucun appel `require(…)` | lecture du thème Tailwind | test |
| `src/adapters/simulation.ts` | alias de `globalThis` affecté à la constante `holder`, indexée par la seule constante `REGISTRY_KEY` | état simulé en mémoire (rechargement à chaud) | application |
| `src/components/carte/GoogleMapRenderer.tsx` | `@googlemaps/js-api-loader` ; alias de `window` affecté à la constante `authWindow`, lue et écrite par la seule propriété littérale `gm_authFailure` | carte Google du navigateur (F4), clé publique restreinte par référent | application |
| `src/app/fonts.ts` | `next/font/google` (import de `Hanken_Grotesk` seulement) | police de l'application : Next la télécharge chez Google Fonts **au build** et la sert ensuite depuis le site ; aucune requête du navigateur vers Google, aucune clé, aucune donnée de lieu Google | application (build) |
| `tests/e2e/carte-helpers.ts` | hôte `googleapis.com` (chaîne) | liste des hôtes Google **bloqués** dans les e2e | test |
| `tests/e2e/carte.e2e.spec.ts` | hôtes `places.googleapis.com` et `routes.googleapis.com` (littéral d'expression régulière) | vérifie qu'aucune requête Google n'a lieu | test |

Ne figurent **pas** dans ce tableau, parce que le régime des tests (section 4) les admet sans exception : `src/analytics/events.test.ts` (`vi.spyOn(globalThis, "fetch")`) et `src/components/ligne/Sheet.test.tsx` (`fireEvent.pointerMove(window, …)`, `fireEvent.pointerUp(window, …)`). Ne sont pas non plus des capacités : `node:zlib` (`tests/e2e/budget-helpers.ts`), `node:crypto`, `node:fs`, `node:path`, `node:url`, `node:os` (modules neutres, section 6).

**`next/font/google`.** Le spécificateur `next` est admis « sous-chemins compris » (section 6), **sauf** `next/font/google`, traité comme un module à capacité : c'est un téléchargement réseau au build, et il n'est admis que par la ligne de `src/app/fonts.ts` (une seule occurrence sur `main`). Un second fichier qui charge une police Google demande une ligne et un verdict Sécurité.

### Lignes du régime lui-même (livrées par le code de P0c1)
Ces lignes n'existent pas sur `main` à `b2c181e` ; elles arrivent avec les fichiers qu'elles nomment, dans la même PR, et la règle « ligne inutile » s'applique dès cette PR.

| Fichier | Seule capacité admise | Usage | Portée |
|---|---|---|---|
| `tests/unit/confinement/fichiers.ts` | `node:child_process` (`execFileSync` seulement, commande littérale `git`, arguments littéraux `ls-files`, `-z`, `-s`, sans `shell`) | énumération des fichiers suivis et de leurs modes (section 1) | test |
| `tests/support/serveur-local.ts` | `node:http` (`createServer` seulement), écoute sur `127.0.0.1`, port `0` | serveur local de test (section 4) | test |

Le spécificateur `typescript` (analyse et vérificateur de types) est admis dans `tests/unit/confinement/**` par la liste de la section 6 : ce n'est pas un module à capacité. Les autres fichiers du régime (`tests/unit/confinement/*.test.ts`, `tests/unit/confinement/listes/*.ts`) n'ont aucune ligne de capacité.

Par rapport à la version `0190606`, la liste change ainsi : `GoogleMapRenderer.tsx` est ajouté (alias de `window` et chargeur Google, relevés par la règle de l'objet global étendue à `window`) ; `events.test.ts` sort vers le régime des tests ; l'exception de `carte.e2e.spec.ts` est écrite en hôtes normalisés ; `scripts/p0/enregistrer.mjs` n'est pas sur `main` et passe à la section 9.

### Fermeture transitive
- Le test construit le **graphe d'imports complet** des fichiers analysés (arêtes : imports, ré-exports `export … from` et `export *`, `import()` littéraux, imports de types).
- Un fichier **non-test** qui importe un fichier de test ou un fichier de `tests/` est refusé.
- Une ligne de portée **test** ou **outil** ne doit être atteinte depuis **aucun** fichier non-test de `src/` ou de `db/`. Vérifié sur `main` : aucun ne l'est.
- Une ligne de portée **application** est atteignable depuis l'application ; sa capacité est alors limitée à la forme exacte écrite dans la ligne, et toute ligne nouvelle de cette portée exige, en plus du verdict Sécurité, la justification écrite de son usage côté serveur ou navigateur.
- **Modules de capacité de P0r1** (`src/ai/openrouter-client.ts`, `src/grounding/places-client.ts`, `src/grounding/routes-client.ts`, `src/research/undici-transport.ts`) : importables seulement par des fichiers de test et par le module de composition `src/server/composition/p0-reel.ts`, créé par P0r3 avec un verdict Sécurité. La fermeture s'applique à travers les intermédiaires (barrels, ré-exports).

## 4. Régime des tests
**Fichiers de test** : `*.test.ts`, `*.test.tsx`, `*.spec.ts` et tout fichier sous `tests/` (utilitaires compris). Un fichier de test ne reçoit **aucune** capacité par principe ; il reçoit seulement les formes suivantes, sans ligne nominative, parce qu'elles **remplacent** une capacité par un double ou n'en ouvrent aucune :
1. `vi.spyOn(globalThis, "<littéral>")`, `vi.spyOn(window, "<littéral>")`, `vi.stubGlobal("<littéral>", <expr>)` et `vi.unstubAllGlobals()` : c'est ainsi qu'un test remplace le `fetch` global par un double. Le premier argument de `vi.spyOn` et le nom de `vi.stubGlobal` sont des littéraux.
2. `vi.mock("<spécificateur>", <fabrique>)` et `vi.doMock(…)` d'un module à capacité (doubles de `node:http`, `node:https`, `node:net`, `node:dns`, `node:dns/promises`, `undici`…), à condition que le spécificateur soit littéral et que la fabrique n'appelle **ni** `importOriginal`, **ni** `vi.importActual`, **ni** `vi.importMock`. Le module réel n'est donc jamais chargé. **Cette restriction ne vise que les modules à capacité** (section 3) et les fichiers qui en importent un, directement ou par fermeture transitive : `vi.mock` d'un module sans capacité avec `importOriginal`, et `vi.importActual` d'un tel module, sont admis sans ligne. Sur `main` : `vi.mock("@/adapters", async (importOriginal) => …)` dans `src/features/presentation/load.test.tsx`, `src/server/actions/paiement.test.ts`, `tests/unit/accueil.test.tsx`, `tests/unit/debloquer-pages.test.tsx` et `tests/unit/payment-guard.test.ts`, et `vi.importActual("@/adapters")` dans `tests/unit/payment-guard.test.ts` ; `@/adapters` n'atteint aucun module à capacité (sa seule ligne, `src/adapters/simulation.ts`, est un alias de `globalThis`, pas un module).
3. `vi.stubEnv("<NOM>", <valeur>)` et `vi.unstubAllEnvs()`, avec un nom **littéral** qui n'est pas un nom secret (section 5). Cette forme suit **la seule section 4** : elle n'a pas de ligne dans le tableau `process.env` de la section 5 et n'est pas soumise à la règle « ligne inutile ». Une seule forme nominative, soumise à cette règle : `tests/unit/accueil.test.tsx`, `vi.stubEnv(name, "production")` (l. 97), où `name` est le paramètre du rappel de `it.each([["VERCEL_ENV"], ["VADROUILLE_ENV"]])` ; le test vérifie que la table est un littéral qui ne contient que ces deux noms. Tout autre `vi.stubEnv` à nom non littéral est refusé.
4. `fireEvent.<événement>(window, …)` et `fireEvent.<événement>(document, …)`.
5. `process.cwd()` et les modules neutres (section 6).

Restent **refusés** dans les tests, sauf ligne nominative : l'import réel d'un module à capacité, un appel au `fetch` réel, un hôte surveillé, un serveur ou une connexion réelle, `vi.importActual` d'un module à capacité, et toute écriture dans `process.env` autrement que par `vi.stubEnv`.

**Serveur local de test.** Un test qui a besoin d'un vrai serveur (par exemple la suite contre les requêtes détournées du transport `undici` de P0r1) passe par un utilitaire unique, `tests/support/serveur-local.ts` (nom proposé, P0c-TL-1), livré par le code de ce régime. C'est la seule ligne nominative prévue pour ce besoin : `node:http` (`createServer`), écoute sur `127.0.0.1` et le port `0` seulement, fermeture garantie en fin de test. Les tests qui l'importent n'ont pas de ligne propre. Les deux usages de `main` (`visual-update.test.ts`, `lighthouse-helpers.ts`) gardent leur ligne : les migrer n'est pas exigé.

**Zones sensibles : tests en liste d'autorisation** (mineur 4 de la revue du head `2eecd59` de #180, renvoyé ici par la décision issuecomment-6132707686). Les fichiers de test de `src/ai/**`, `src/research/**`, `src/grounding/**`, `src/server/env/**` et `src/server/composition/**` ne suivent pas une liste de refus : ils reçoivent les formes 1 à 5 ci-dessus et rien d'autre. En plus des règles des sections 2 à 5, qui s'appliquent à eux comme à tout fichier (aucune exemption de test pour `process`, `.constructor`, l'objet global, les accès calculés de 2.6 en règle fermée), leurs spécificateurs sont limités par la section 6 (« Zones sensibles ») à `vitest`, `zod`, `node:fs`, `node:path`, aux chemins relatifs et `@/…` qui résolvent vers ces mêmes zones, `src/contracts/**` ou `tests/support/**`. Les cas de la revue de #180 sont donc refusés : `ws`, `axios`, `node-fetch` (spécificateurs non listés), `node:vm`, `node:cluster`, `node:inspector`, `node:module` (modules à capacité), `process.binding("tcp_wrap")` (2.4), alias de `process` avec clé calculée (2.6 et section 5), `(() => {}).constructor("return fetch")()` (2.3 et 2.4), `process.env.OPENROUTER_API_KEY` (section 5), `readFileSync("/proc/self/environ")` (2.4). Le test d'imports de #149 (P0a1) reste en place, plus strict pour le code non-test de ces dossiers (P0c-TL-2) ; ce régime couvre leurs tests et tout le reste du dépôt. Aucune de ces zones n'existe sur `main`.

**Tests du régime.** Les tests de `tests/unit/confinement/**` sont des fichiers de test comme les autres : ils ne reçoivent que les formes 1 à 5 et leurs deux lignes nominatives (section 3). Leurs cas négatifs (import réel de `node:http`, `vi.importActual("undici")`, `vi.stubEnv("OPENROUTER_API_KEY", …)`, hôtes, noms secrets) sont des **textes** lus dans `tests/unit/confinement/donnees/*.json` et passés à l'analyseur sous un chemin simulé (section 1, « Données du régime ») ; aucun de ces textes n'est écrit dans un fichier `.ts` du régime.

**Clés.** Ni Vitest, ni Playwright, ni les workflows ne reçoivent `OPENROUTER_API_KEY`, `GOOGLE_MAPS_SERVER_KEY`, `AI_GATEWAY_API_KEY` ou `VERCEL_OIDC_TOKEN` (mineur 11). P0r1 livre l'échec de la mise en place de Vitest et de Playwright quand l'une d'elles est posée ; ce régime ajoute le contrôle des workflows (section 7) et refuse `vi.stubEnv` sur un nom secret.

## 5. Confinement de l'environnement (`process.env`, `node:process`)
La règle est une **liste d'autorisation** : ce qui n'y est pas est refusé.

### `node:process` et l'objet `process`
- `node:process` est un module à capacité (section 3) ; **aucune** ligne ne l'admet sur `main`. `import process from "node:process"` et `import { env } from "node:process"` sont donc refusés partout.
- L'identifiant `process` n'est admis que comme objet d'un accès à propriété **non calculé** (`process.x`), avec une propriété de la liste suivante. `process["env"]`, `process[expr]`, `const p = process`, `process` passé en argument, `globalThis.process`, `global.process`, `window.process` et `self.process` sont refusés.

| Propriété | Fichiers admis sur `main` |
|---|---|
| `env` | selon le tableau suivant |
| `cwd()` | fichiers de test (section 4) ; `scripts/serve-standalone.mjs` |
| `argv` | `scripts/ci/release-note.mjs`, `scripts/ci/techlead-gate.mjs` |
| `stdout.write` | `scripts/ci/release-note.mjs`, `scripts/ci/techlead-gate.mjs` |
| `stderr.write`, `exitCode` | `scripts/ci/release-note.mjs` |
| `exit`, `execPath`, `on` | `scripts/serve-standalone.mjs` |

### `process.env`
Seules trois formes sont admises :
1. **Lecture d'une propriété littérale** : `process.env.NOM` ou `process.env["NOM"]`, en lecture seulement (ni affectation, ni `delete`, ni opérande de `in`), avec un couple (fichier, `NOM`) de la liste. `NODE_ENV` est admis dans tout fichier.
2. **`process.env` entier comme valeur par défaut d'un paramètre** nommé (`env: NodeJS.ProcessEnv = process.env`) ou **comme argument d'une fonction nommée**, seulement dans les couples (fichier, fonction) de la liste. Le paramètre ou l'argument ne peut ensuite être que lu par propriété littérale, avec un nom admis pour ce fichier, ou passé entier à une fonction de la liste.
3. **Étalement** `...process.env` dans l'environnement d'un processus enfant, seulement dans les fichiers de test listés.

Tout le reste est refusé hors de `src/server/env/` (modules étroits de P0r1 et de B3, qui ont leurs propres règles) : déstructuration (`const { A } = process.env`), accès calculé à clé non littérale, alias (`const e = process.env`, puis `e[expr]`), étalement hors des lignes listées, `Object.keys`, `Object.entries`, `Object.values`, `Object.assign`, `Object.getOwnPropertyDescriptor(s)`, `Reflect.get`, `Reflect.ownKeys`, `JSON.stringify` appliqués à `process.env`, passage en argument hors des lignes listées, `import.meta.env`.

| Fichier | Forme | Noms lus |
|---|---|---|
| tout fichier | lecture littérale | `NODE_ENV` |
| `playwright.config.ts` | lecture littérale ; `process.env` entier comme valeur de la propriété `env` de l'objet littéral passé à `e2ePort` (`scripts/e2e-port.mjs`, l. 8) | `CI`, `E2E_SKIP_BUILD` |
| `scripts/e2e-port.mjs` | paramètre `env` de `e2ePort`, lu par propriété littérale | `E2E_PORT`, `CI` |
| `src/adapters/context.ts` | lecture littérale | `DATA_ADAPTER` |
| `src/adapters/index.ts` | lecture littérale | `DATA_ADAPTER`, `PAYMENT_ADAPTER` |
| `src/adapters/payment-guard.ts` | valeur par défaut du paramètre `env` de `paymentDemoAllowed` et `paymentAvailable` ; passé à `isProductionDeployment` et `paymentDemoAllowed` | `VADROUILLE_DEMO_PAYMENT`, `PAYMENT_ADAPTER`, `DATA_ADAPTER` |
| `src/adapters/simulation.ts` | valeur par défaut du paramètre `env` de `simulationEnabled` ; passé à `devPagesEnabled` et `isProductionDeployment` | aucun en propre |
| `src/dev/flags.ts` | valeur par défaut du paramètre `env` de `devPagesEnabled` et `isProductionDeployment` | `VADROUILLE_DEV_PAGES`, `VADROUILLE_ENV`, `VERCEL_ENV` |
| `src/components/carte/config.tsx` | lecture littérale | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` |
| `tests/unit/ci/visual-update.test.ts` | étalement `...process.env` (deux fois) dans l'environnement d'un processus enfant | sans objet |

`vi.stubEnv` n'a **pas** de ligne dans ce tableau : il suit la seule section 4, point 3 (nom littéral non secret, plus la forme nominative de `tests/unit/accueil.test.tsx`). Pour information, et sans valeur de liste, `main` le fait dans 14 fichiers, avec les noms `NODE_ENV`, `DATA_ADAPTER`, `PAYMENT_ADAPTER`, `VADROUILLE_DEV_PAGES`, `VADROUILLE_ENV`, `VADROUILLE_DEMO_PAYMENT`, `VERCEL_ENV`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` et `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` (dont `src/adapters/index.test.ts` : `DATA_ADAPTER`, `NODE_ENV`, `VADROUILLE_DEV_PAGES` ; `src/adapters/mock-unlock.test.ts` : `VERCEL_ENV`, `VADROUILLE_DEMO_PAYMENT` ; `src/adapters/simulation.test.ts` : `VADROUILLE_ENV`, `VADROUILLE_DEV_PAGES` ; `src/components/carte/DayMap.test.tsx` et `config.test.tsx` : `NEXT_PUBLIC_GOOGLE_MAPS_*`) ; aucun n'est secret.

Les lectures par le paramètre `env` ont été revérifiées : `payment-guard.ts` lit `NODE_ENV`, `VADROUILLE_DEMO_PAYMENT`, `PAYMENT_ADAPTER`, `DATA_ADAPTER` (l. 22 et 31) ; `flags.ts` lit `NODE_ENV`, `VADROUILLE_DEV_PAGES`, `VADROUILLE_ENV`, `VERCEL_ENV` (l. 7 et 16) ; `e2e-port.mjs` lit `E2E_PORT` et `CI` (l. 34 à 42) ; `simulation.ts` ne lit aucun nom (l. 150 et 151). `NODE_ENV`, admis partout, n'est pas répété dans la colonne.

**Noms secrets.** Sont secrets : `OPENROUTER_API_KEY`, `GOOGLE_MAPS_SERVER_KEY`, `AI_GATEWAY_API_KEY`, `VERCEL_OIDC_TOKEN`, et tout nom qui finit par `_KEY`, `_TOKEN`, `_SECRET` ou `PASSWORD`, ou qui contient `DATABASE_URL`, sauf `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (clé publique du navigateur, restreinte par référent, F4). Un nom secret ne peut figurer dans la liste que pour un module de `src/server/env/` ou le module de connexion de B1, avec un verdict Sécurité qui le cite. Hors de ces modules, toute chaîne ou tout gabarit qui contient un nom secret ou l'un des fragments `OPENROUTER_API`, `MAPS_SERVER_KEY`, `AI_GATEWAY` ou `OIDC_TOKEN` est refusé (aucun sur `main`). Le contrôle porte sur les **textes** de la section 2.5 (chaînes, gabarits, texte JSX), y compris l'argument de `process.env["…"]` et de `vi.stubEnv("…")`, **pas** sur les noms de propriété ni les clés d'objet (identifiant ou chaîne en position de clé) : `tests/unit/ci/visual-update.test.ts` l. 104 et 297 ont une clé `GH_TOKEN` (valeur `"jeton-factice"`) dans l'environnement d'un processus enfant, ce qui est admis. Une valeur secrète réelle ne peut de toute façon venir que de `process.env`, dont la lecture d'un nom secret reste refusée.

## 6. Spécificateurs et dépendances tierces
### Liste d'autorisation des spécificateurs
Tout spécificateur qui n'est ni relatif, ni `@/…` doit figurer dans une liste `(spécificateur, zones)`. Pour les modules **sans capacité**, une zone peut être un motif ; les modules **à capacité** relèvent seulement des lignes nominatives (section 3).

| Spécificateur | Zones admises sur `main` |
|---|---|
| `react` | `src/**`, `tests/unit/**` |
| `react-dom` | `src/**`, `tests/unit/**` |
| `next` (sous-chemins compris, **sauf `next/font/google`**, module à capacité : section 3) | `src/**`, `next.config.ts` |
| `zod` | `src/**` |
| `clsx`, `tailwind-merge` | `src/lib/**` |
| `class-variance-authority`, `@radix-ui/react-dialog`, `@radix-ui/react-slot` | `src/components/**` |
| `vitest` (sous-chemins compris) | fichiers de test, `vitest.config.mts` |
| `@testing-library/react` | fichiers de test |
| `@testing-library/jest-dom`, `axe-core` | `tests/unit/**` |
| `@playwright/test` | `tests/e2e/**`, `tests/visual/**`, `tests/perf/**`, `playwright.config.ts` |
| `@axe-core/playwright` | `tests/e2e/**` |
| `eslint` (sous-chemins compris), `eslint-config-next` | `eslint.config.mjs`, `eslint-rules/**`, `tests/unit/**` |
| `node:fs`, `node:fs/promises`, `node:path`, `node:url`, `node:os`, `node:zlib` | partout **sauf** les fichiers non-test de `src/` et les zones sensibles (ci-dessous) |
| `node:crypto` | partout sauf les zones sensibles |
| `typescript` | `tests/unit/confinement/**` (ligne du régime lui-même, livrée par P0c1 ; aucun fichier de `main` ne l'importe) |

Chaque spécificateur de ce tableau est une **ligne** au sens de « ligne inutile » : il doit être importé au moins une fois. Les zones sont des motifs et ne sont pas vérifiées une à une. `node:util`, listé par la version `fc54aae` mais importé par aucun fichier de `main`, est retiré : il revient avec P0a1 (section 9, `scripts/p0/**`), qui l'ajoute avec sa ligne ; il n'y a pas d'entrée « de réserve ». Le tableau a été revérifié contre `main` : chaque spécificateur tiers ou intégré importé à `b2c181e` y figure dans une de ses zones, et chaque ligne est utilisée.

### Zones sensibles et `src/contracts`
Pour ces zones, la liste ci-dessous **remplace** le tableau précédent (elle n'y ajoute rien). Les modules de capacité de P0r1 ont en plus leurs lignes nominatives (section 9), et le test d'imports de #149 reste plus strict pour le code non-test de `src/ai`, `src/research`, `src/grounding` (P0c-TL-2).

| Zone | Fichiers | Spécificateurs non relatifs admis |
|---|---|---|
| `src/ai/**`, `src/research/**`, `src/grounding/**`, `src/server/env/**`, `src/server/composition/**` | non-test | `zod` ; `@/…` vers ces zones ou `src/contracts/**` (le reste : règles de #149 et lignes de P0r1) |
| mêmes zones | test | `vitest`, `zod`, `node:fs`, `node:path` ; relatifs et `@/…` vers ces zones, `src/contracts/**` ou `tests/support/**` (section 4, « Zones sensibles ») |
| `src/contracts/**` (mineur 6 de #180) | non-test | `zod` seulement ; relatifs vers `src/contracts/**` seulement. Vérifié sur `main` : les fichiers non-test de `src/contracts` n'importent que `zod` et des fichiers de `src/contracts`. |
| `src/contracts/**` | test | tableau général (sur `main` : `vitest`, `zod`, `node:fs`, `node:path` dans `values.test.ts`) |

Avec cette ligne, un `src/contracts/sonde.ts` qui appelle `fetch(…)` est refusé deux fois : par la capacité `fetch` (section 3), quel que soit le dossier, et parce que `src/contracts` est analysé comme tout le dépôt (section 1).

`@playwright/test` et `@axe-core/playwright` sont traités comme outils de test sans capacité au sens de ce régime : ils pilotent le navigateur vers la `baseURL` locale, les hôtes surveillés restent refusés dans les e2e (hors des deux lignes de la section 3) et aucune clé n'est posée dans leur environnement (section 4). `lighthouse` et `@googlemaps/js-api-loader`, eux, sont des modules à capacité : ils n'apparaissent que dans leurs lignes nominatives.

Dans les fichiers non-test de `src/`, aucun module de Node n'est admis hors `node:crypto` (`src/adapters/mock-payment.ts`) et des lignes nominatives : lire un fichier (`.env*`, clés) contournerait le confinement de la section 5. Vérifié sur `main` et sur la branche de #180 : aucun fichier non-test de `src/` n'importe `node:fs`.

### Liste des paquets déclarés
- Chaque nom de `dependencies` et de `devDependencies` figure dans une liste `(paquet, usage, verdict)`, où `verdict` renvoie à la revue consolidée qui l'a admis. Les 28 paquets de `main` y sont repris avec le verdict « existant au 2026-10-12 (`b2c181e`) ». Un paquet absent de la liste fait échouer le test ; un paquet listé mais absent de `package.json` aussi.
- Chaque spécificateur tiers importé appartient à un paquet déclaré dans `package.json` (pas de dépendance fantôme).
- `pnpm.onlyBuiltDependencies` vaut exactement la liste commitée (`sharp`, `unrs-resolver`). `pnpm.overrides`, `pnpm.patchedDependencies`, `resolutions` et tout script de cycle de vie sont absents, sauf ligne commitée avec verdict.
- **Version** : chaque version de `package.json` est exacte (pas de `^`, `~`, `*`, `latest`, URL, `git+`, `file:` ni `link:`), ce qui est le cas sur `main`.
- Ajouter une dépendance demande, dans la même PR : la ligne de la liste des paquets, les lignes de spécificateurs (ou de capacité, pour un paquet à capacité), et un verdict Sécurité qui cite le lockfile (dépendances transitives, scripts d'installation, date de publication de deux semaines au moins, critères repris de #172 « Dépendances nouvelles »).
- `package.json`, `pnpm-lock.yaml`, `.npmrc` et `pnpm-workspace.yaml` sont des chemins gardés (section 8).

## 7. Lancements : `package.json`, workflows, configuration, `Dockerfile`
### Scripts de `package.json`
Chaque script doit être **identique, octet pour octet,** à une entrée de la liste commitée `(nom, commande)`. Liste sur `main` (12 scripts) :

| Nom | Commande |
|---|---|
| `dev` | `next dev` |
| `build` | `next build` |
| `start` | `node scripts/serve-standalone.mjs` |
| `typecheck` | `tsc --noEmit` |
| `lint` | `eslint . --max-warnings=0` |
| `test` | `vitest run` |
| `test:a11y` | `playwright test --project=a11y` |
| `test:e2e` | `playwright test --project=e2e` |
| `test:visual` | `playwright test --project=visual` |
| `test:visual:update` | `playwright test --project=visual --update-snapshots` |
| `test:perf` | `playwright test --project=perf --workers=1` |
| `verify` | `pnpm typecheck && pnpm lint && pnpm test && pnpm build && E2E_SKIP_BUILD=1 pnpm test:a11y && E2E_SKIP_BUILD=1 pnpm test:e2e && E2E_SKIP_BUILD=1 pnpm test:visual` |

Un script absent de la liste, ou une entrée de la liste absente de `package.json`, fait échouer le test. Aucune entrée ne peut contenir, même avec un verdict :
- **options de Node interdites** : `-e`, `--eval`, `-p`, `--print`, `-r`, `--require`, `--import` (sauf la forme exacte du script `p0` de P0a1, section 9), `--loader`, `--experimental-loader`, `--inspect*`, `--env-file*`, `--use-env-proxy`, `--openssl-*`, `--tls-*`, `--use-openssl-ca`, `--use-system-ca`, `--use-bundled-ca`, `--insecure-http-parser` ;
- **mots interdits** : `tsx`, `npx`, `pnpm dlx`, `npm exec`, `curl`, `wget`.

### Comparaison des options interdites (mineur de la revue `fc54aae` et ajout du CEO 1)
La même procédure s'applique aux scripts de `package.json`, aux lignes `run:` des workflows, aux instructions `RUN`, `CMD`, `ENTRYPOINT` et `ENV` du `Dockerfile`, à toute valeur de `NODE_OPTIONS` où qu'elle soit posée (préfixe d'un script, `env:` d'un workflow, `ENV` du `Dockerfile`), et à `process.execArgv` et `NODE_OPTIONS` lus à l'exécution par `src/server/env/egress.ts` de P0r1, qui reprend la liste commitée du régime (`tests/unit/confinement/donnees/options-interdites.json`, nom proposé) :
1. **Découpage en jetons** : séparation sur les blancs ; `&&`, `||`, `;` et `|` sont aussi des séparateurs ; guillemets simples et doubles retirés. Aucune comparaison par sous-chaîne : `-p` ne correspond pas à `--project`, ni à `mkdir -p` (ci-dessous).
2. **Jetons examinés comme options de Node** : ceux qui suivent un jeton `node` jusqu'au premier jeton qui ne commence pas par `-` (le chemin du script), et chaque jeton de la valeur de `NODE_OPTIONS`. Les options des autres commandes (`playwright test --project=…`, `mkdir -p`) ne sont pas des options de Node.
3. **Normalisation** de chaque option de Node, dans cet ordre : (a) on garde la partie avant le premier `=` (`--require=x` donne `--require`) ; (b) on remplace chaque `_` par `-` (Node accepte `--tls_cipher_list` pour `--tls-cipher-list`, `--use_openssl_ca`, `--insecure_http_parser`) ; (c) un préfixe `--no-` est retiré (`--no-insecure-http-parser` est comparé comme `--insecure-http-parser`, et refusé : une option interdite l'est dans ses deux sens).
4. **Comparaison de l'option entière** à la liste ; une entrée terminée par `*` (`--tls-*`, `--openssl-*`, `--inspect*`, `--env-file*`) est un préfixe de l'option normalisée (`--inspect-brk`, `--inspect-port`, `--inspect-wait`, `--env-file-if-exists` compris).
5. **Mots interdits** : comparés par jeton entier sur **tous** les jetons, `pnpm dlx` et `npm exec` comme deux jetons consécutifs.

Sur `main`, aucun jeton n'est refusé : les seuls `node` des scripts (`start`) et des workflows sont suivis directement de leur chemin, et `NODE_OPTIONS` n'apparaît nulle part. B1 (#188) ajoutera `--conditions=react-server`, qui n'est pas interdit.

### `node` dans les workflows
- Dans chaque fichier de `.github/workflows/`, lignes de commentaire exclues (premier caractère non blanc `#`), **chaque** occurrence du mot `node` (non précédé de `[A-Za-z0-9_./-]`, non suivi de `[A-Za-z0-9_.@:-]`) doit être suivie d'espaces puis d'un chemin de la liste : `scripts/ci/release-note.mjs`, `scripts/ci/techlead-gate.mjs`. Une option avant le chemin (`node -e`, `node --import`) est refusée. Relevé sur `main` : `release.yml` (deux appels à `release-note.mjs`), `techlead-gate.yml` (un appel à `techlead-gate.mjs`) ; `setup-node@…` et `node-version` ne sont pas des occurrences.
- `pnpm` n'est admis dans un `run:` que sous ces formes : `pnpm install --frozen-lockfile`, `pnpm exec playwright …`, `pnpm <script>` avec un script de la liste. `npx`, `pnpm dlx`, `npm` et `NODE_OPTIONS` sont refusés dans les workflows.
- Aucune référence à un nom secret (section 5) dans les workflows. Références admises : `github.token` ; `secrets.SLACK_WEBHOOK_STUDIO` dans `release.yml` seulement.

### Configuration et image
- `playwright.config.ts` : la commande du serveur web est `node scripts/serve-standalone.mjs`, précédée de `pnpm build && ` quand `E2E_SKIP_BUILD` est absente. Le test vérifie ces deux chaînes exactes.
- `Dockerfile` : les instructions `RUN`, `CMD` et `ENTRYPOINT` sont identiques à la liste : `RUN corepack enable` (deux fois), `RUN pnpm install --frozen-lockfile`, `RUN pnpm build && mkdir -p public`, `CMD ["node", "server.js"]` ; aucune instruction `ENV` ne pose `NODE_OPTIONS` ni un nom secret ; les instructions `SHELL`, `ONBUILD` et `HEALTHCHECK`, qui exécutent ou modifient l'exécution de commandes, sont absentes (aucune sur `main`).
- **Choix assumé** : `FROM`, `ARG` (dont `ARG NODE_IMAGE=node:22-bookworm-slim`), `COPY`, `WORKDIR`, `USER`, `EXPOSE` et `LABEL` ne sont **pas** contrôlés par le test. Ils ne lancent aucun code et ne posent aucune variable lue par Node ; le choix de l'image de base (`FROM ${NODE_IMAGE}`) est un risque de chaîne d'approvisionnement, couvert par la garde du chemin `Dockerfile` (section 8, verdict Sécurité à chaque modification) et par l'épinglage des images, hors périmètre comme celui des actions GitHub. Le `Dockerfile` ne sert pas au déploiement Vercel ; 0002 prévoit qu'il soit construit à chaque PR par la CI, ce qu'aucun workflow de `main` ne fait à `b2c181e`.

## 8. Garde des chemins : `CODEOWNERS` et contrôle de chemins
### Chemins gardés
Les tests, listes et données du régime (`tests/unit/confinement/**`, dont `donnees/*.json`), `tests/support/**`, les fichiers nommés dans une ligne de capacité (lus dans la liste), les modules de capacité de P0r1 et `src/research/ip-guard.ts`, `src/research/fetch-page.ts`, `src/server/env/**`, `src/server/composition/**`, `package.json`, `pnpm-lock.yaml`, `.npmrc`, `pnpm-workspace.yaml`, `.github/workflows/**`, `.github/CODEOWNERS`, `scripts/ci/**`, `Dockerfile`, `playwright.config.ts`, `vitest.config.mts` (et toute autre configuration de Vitest), `next.config.ts`, `eslint.config.mjs`, `eslint-rules/**`, `middleware.*`, `instrumentation.*`. La liste est commitée dans `tests/unit/confinement/donnees/chemins-gardes.json` (nom proposé), lue par le contrôle de chemins dans sa version de `main`.

### Mécanisme
1. **`CODEOWNERS`** (`.github/CODEOWNERS`) sur ces chemins, propriétaire `@Samoulou`. Il rend les chemins visibles dans chaque PR ; il ne bloque rien sans réglage de la protection de `main` (P0-Q21).
2. **Contrôle de chemins** exécuté par un workflow `pull_request_target` : version du workflow et du script prise sur `main`, **sans extraction du code de la PR**, permissions `contents: read` et `pull-requests: read`, aucun secret. La liste des fichiers modifiés est lue par l'API (`GET /pulls/{n}/files`, paginée) ; au-delà de la limite de l'API (3 000 fichiers) ou en cas d'erreur, le contrôle échoue. Il échoue si un chemin gardé change et que le verdict lu (ci-dessous) manque. La forme du script et du workflow est une décision du Tech Lead (P0c-TL-3). C'est une PR de workflow : elle attend `owner-approved`, posé par Samuel (Q245, T18).

### Verdict lu : format exact (bloquant 2 de la revue `fc54aae`)
Le contrôle lit les commentaires de la PR (`GET /issues/{n}/comments`, paginé) et ses revues (`GET /pulls/{n}/reviews`, paginé), comme `techlead-gate` (0023 § 4.3), et ne retient que :
1. les corps dont l'**auteur** a le login `Samoulou` (dépôt public : un commentaire d'un tiers qui imite le format est ignoré) ;
2. dont la **première ligne** est exactement `## Revue consolidée — head ` suivi du sha court entre accents graves, soit l'expression `` ^## Revue consolidée — head `([0-9a-f]{7})`$ `` (tiret cadratin U+2014, espaces simples) ;
3. dont ce sha est égal aux 7 premiers caractères du **head courant** de la PR.

Parmi eux, le **plus récent** (date de création) fait foi. Il porte le verdict si l'une de ses lignes, fins de ligne `\r` retirées et blancs de fin retirés, est **exactement** :

```
- securite : **approuvé**
```

soit `^- securite : \*\*approuvé\*\*$` (tiret et espace en début de ligne, nom de rôle `securite` sans accent, une espace de chaque côté du deux-points, `approuvé` en minuscules avec `é` U+00E9, en gras). Une précision du rôle va **à la ligne suivante**, jamais sur cette ligne. Toute autre forme (`**Sécurité** : approuvé`, `securite — **approuvé**`, « Rôles consultés : … securite — **approuvé** ») ne compte pas. Si la revue la plus récente du head ne porte pas cette ligne (changements demandés, `securite : non consulté`), le contrôle échoue, même si une revue plus ancienne du même head la portait.

**Constat.** Ce format n'existe pas encore : 0019 § 3.2 et 0023 § 1 ne fixent aucune ligne de verdict par rôle, et les revues consolidées de `main` en emploient plusieurs (« - securite : non consulté (…) » dans la revue du head `fc54aae` de #193, « **Rôles consultés** : tech-lead — **approuvé** » dans #182, « - **Sécurité** : changements demandés » dans #180). Surtout, l'étape 2 du prompt de la routine R2 (0023 § 1) n'appelle `securite` que si la PR touche `db/`, `src/ai/`, `src/research/`, l'authentification ou des secrets : sur `package.json`, un workflow, `scripts/ci/**`, le `Dockerfile`, une configuration, `tests/unit/confinement/**` ou `src/server/composition/**`, aucune ligne ne serait produite et le contrôle échouerait toujours. Le prompt d'une routine se règle hors du dépôt et relève de Samuel (0023 § 1, « Samuel le colle dans la routine Revue ») : cette spécification **ne le modifie pas**. Elle pose la modification comme question, **P0c-Q2** (« Questions ouvertes »), avec le texte proposé, et rend P0c2 dépendante de la réponse (« Découpage et ordre »).

**Déclencheur indépendant de R2 : examiné, non retenu.** Aucun déclencheur réaliste ne se passe de Samuel : un workflow ne peut pas lancer un agent `securite` sans clé d'API (compte et dépense externes, réservés à Samuel) ; les prompts de R1 et R3 se règlent aussi hors du dépôt ; une revue Sécurité faite par le rôle qui pousse, dans sa propre session, ne serait pas une revue distincte et ne serait pas la revue consolidée qu'exigent 0019 et 0023. Le studio retient donc la question à Samuel.

### Indépendance (mineur 11)
Tous les rôles du studio agissent sous le compte `Samoulou`, comme Samuel (constat de T18). Le verdict Sécurité que lit le contrôle est donc un commentaire posté **par le même compte que le rôle qui pousse** : le contrôle garantit qu'une revue Sécurité a été écrite sur le head, **pas** qu'elle vient d'un tiers indépendant. De même, `CODEOWNERS` avec « revue du propriétaire exigée » ne peut pas être satisfait par l'auteur de la PR, qui est ce même compte. Une garde indépendante supposerait une action que seul Samuel peut faire (libellé posé par lui, comme `owner-approved` de T18, ou second compte GitHub pour les agents). Ce choix est à Samuel : **P0-Q21**.

## 9. Lignes à ajouter selon l'ordre de fusion
Les tableaux ci-dessus décrivent `main` à `b2c181e`. **La PR de code de ce régime relève de nouveau `main` à sa base** et ajoute les lignes de tout ce qui a fusionné entre-temps, chacune avec un verdict Sécurité. Une PR qui fusionne **après** le régime ajoute elle-même ses lignes. Lignes attendues, à vérifier au moment voulu (aucune n'est admise par cette spécification) :
- **P0a1 (#180)** : script `p0` = `node --import ./scripts/p0/enregistrer.mjs scripts/p0/main.ts` (0032 § A3.4), seule forme admise de `node --import` ; `scripts/p0/enregistrer.mjs` avec `import { registerHooks } from "node:module"` sous cette seule forme ; `typecheck` modifié (`tsc --noEmit && tsc -p tsconfig.p0.json --noEmit`) ; paquet `parse5` ; `node:util` et `node:fs` dans `scripts/p0/**` ; usages de `process` des scripts `p0`.
- **B1 (#188)** : paquets `pg` (module à capacité, `db/connection.ts` et `db/migrate.ts`), `drizzle-orm`, `server-only`, `drizzle-kit`, `@types/pg` ; scripts `test:db`, `db:generate` (`NODE_OPTIONS=--conditions=react-server`), `db:migrate` (`node --conditions=react-server …`) et `verify` modifié ; `scripts/test-db.mjs` (`node:child_process`, noms `SKIP_DB_TESTS`, `CI`, `GITHUB_ACTIONS`) ; `process.env` entier en valeur par défaut dans `db/index.ts` et en argument dans `db/migrate.ts` ; nom secret de la base dans le module de connexion ; modification de `.github/workflows/ci.yml` (PR de workflow, T18).
- **P0r1 (code)** : les quatre modules de capacité avec les capacités que leur donne la spécification de P0r1 ; `src/server/env/egress.ts` (`process.execArgv`, variables de déploiement, de proxy et TLS) ; `src/server/env/ai.ts` et `src/server/env/grounding.ts` (un nom secret chacun) ; leurs tests, par le régime des tests ou par `tests/support/serveur-local.ts`.

## Découpage et ordre
- **P0c1** (backend) : test de capacité, accès calculés (2.6), fermeture transitive, régime des tests (zones sensibles comprises), confinement de l'environnement, listes des spécificateurs et des paquets, utilitaire d'énumération et utilitaire de serveur local, données du régime. Tests unitaires seulement. Prérequis : P0c-TL-1, TL-2, TL-4 et TL-5 écrites dans `docs/decisions/`.
- **P0c2** (release) : contrôles de `package.json`, des workflows, de `playwright.config.ts` et du `Dockerfile` (comparaison des options, section 7) ; `CODEOWNERS` ; workflow de contrôle de chemins (PR de workflow : `owner-approved` de Samuel, T18). Prérequis : P0c-TL-3 écrite dans `docs/decisions/`, **et la réponse de Samuel à P0c-Q2**. La PR de P0c2 ne s'ouvre pas avant cette réponse : sans le texte collé dans R2, le contrôle de chemins échouerait sur toute PR qui touche un chemin gardé. Si Samuel refuse ou modifie le texte, le CEO revoit la section 8 avec la Sécurité avant P0c2.
- P0c1 et P0c2 touchent des fichiers distincts et peuvent avancer en parallèle. Les deux sont fusionnées avant la PR de P0r2 (exigence d'entrée 7) : **P0c-Q2 bloque donc aussi, par P0c2, l'exigence d'entrée 7 de P0r2**.

## Tests attendus (noms proposés)
Tous les cas négatifs et les textes sources de test ci-dessous sont des **données** dans `tests/unit/confinement/donnees/*.json` (section 1), passées à l'analyseur sous un chemin simulé ; aucun n'est écrit dans un fichier `.ts`.
- `confinement: le régime s'applique à lui-même` : les fichiers `.ts` de `tests/unit/confinement/**` et `tests/support/**` sont dans la liste analysée, sans exclusion nominative ; ils ne contiennent ni hôte surveillé, ni nom secret ; leurs seules capacités sont les deux lignes de la section 3 (« Lignes du régime lui-même ») ; `typescript` n'est importé que sous `tests/unit/confinement/**`.
- `confinement: méthode de détection`, avec un cas négatif par forme, sur des textes sources de test présentés comme un fichier non-test de `src/` : chaque spécificateur de module à capacité (avec et sans `node:`, sous-chemin, `import type`, `export * from`, `import x = require`, `import()` littéral) ; `fetch`, `{ fetch }`, `globalThis.fetch`, `globalThis["fetch"]`, `window.fetch`, `self.fetch`, `global.fetch` ; `const g = globalThis`, `Reflect.get(globalThis, "fetch")`, `Object.getOwnPropertyDescriptor(globalThis, "fetch")`, `const { fetch } = globalThis`, `globalThis[k]` ; `(() => {}).constructor("…")` ; `process.getBuiltinModule("http")` ; `import(k)`, `require(k)`, `import.meta.resolve` ; `WebSocket`, `navigator.sendBeacon`. Cas positifs : `window.matchMedia`, `typeof window`, `(window as T).x = y`, `x.constructor.name`.
- `confinement: accès calculés` : en zone sensible, `const Symbol = { c: "constructor" }; (() => {})[Symbol.c]`, la variante `Symbol.e = "env"`, la variante par paramètre `function f(Symbol) { return (() => {})[Symbol.k]; }`, `o[k]` à clé non littérale, `const { [k]: v } = o`, `const { ...r } = process` : refusés ; `a[Symbol.iterator]` sans `Symbol` lié : admis. Hors zone sensible : `(() => {})[k]` avec `k: string`, avec `k: any`, avec `k: "constructor"`, `(f as unknown as Record<string, unknown>)[k]` (conversion retirée : `f` est une fonction) : refusés ; `tableau[i]` (`i: number`), `record[id]` (`Record<string, T>`, `id: string`), `labels[kind]` (union de littéraux), `holder[REGISTRY_KEY]` (`Symbol.for`) : admis. Les 115 accès de `main` passent.
- `confinement: hôtes normalisés` : `"openrouter.ai"`, `"OpenRouter.AI"`, `"https://places.googleapis.com/v1"`, `/places\.googleapis\.com/`, `new RegExp("routes\\.googleapis\\.com")`, `/googleapis[.]com/`, `"openrouter" + ".ai"`, `` `${"openrouter"}.ai` ``, `"openrouter%2Eai"`, fragment `"googleapis"`, `"ai-gateway.vercel.sh"` : refusés. `"notgoogleapis.community"`, `"gstatic.com"` : admis.
- `confinement: aucune capacité hors des lignes nominatives` (dépôt entier) et `confinement: aucune ligne inutile` (chaque ligne de `main` correspond à au moins une détection, et à la seule capacité qu'elle déclare).
- `confinement: fermeture transitive` : aucun fichier de portée test ou outil atteint depuis un fichier non-test de `src/` ou `db/` ; un fichier non-test qui importe un fichier de test est refusé (cas négatif) ; un module de capacité importé par un barrel est refusé (cas négatif) ; spécificateur relatif non résolu : échec.
- `confinement: régime des tests` : `vi.spyOn(globalThis, "fetch")`, `vi.stubGlobal("fetch", double)`, `vi.mock("node:http", () => ({…}))` admis dans un test ; `vi.mock("node:http", async (importOriginal) => …)`, `vi.importActual("undici")`, `import http from "node:http"` dans un test sans ligne, `vi.stubEnv("OPENROUTER_API_KEY", "x")`, `vi.stubEnv(nom, "x")` hors de la forme nominative de `accueil.test.tsx` refusés ; `vi.mock("@/adapters", async (importOriginal) => …)` et `vi.importActual("@/adapters")` admis (module sans capacité). Zones sensibles : dans un fichier de test de `src/ai/`, `import ws from "ws"`, `axios`, `node-fetch`, `node:vm`, `node:cluster`, `node:inspector`, `node:module`, `process.binding("tcp_wrap")`, `const p = process; p["get" + "BuiltinModule"]`, `(() => {}).constructor("return fetch")()`, `process.env.OPENROUTER_API_KEY`, `readFileSync("/proc/self/environ")`, `import "@testing-library/react"` refusés ; `vitest`, `zod`, `node:fs`, `@/contracts/…` admis. Un `src/contracts/sonde.ts` qui importe `node:https` ou appelle `fetch` : refusé.
- `confinement: environnement` : chaque contournement du bloquant 4 refusé (`import process from "node:process"`, `import { env } from "node:process"`, `const e = process.env; e[k]`, `process["env"]`, `globalThis.process.env`, `f(process.env)` hors ligne, `{ ...process.env }` hors ligne, `const { A } = process.env`, `Object.keys(process.env)`, `Reflect.get(process.env, k)`, `process.env.A = "x"`, `import.meta.env`) ; nom non listé refusé ; paramètre `env` d'un fichier listé lu par `env[k]` refusé ; fragment de nom secret refusé ; clé d'objet `GH_TOKEN` admise, chaîne `"GH_TOKEN"` refusée ; `".env.local"` et `"/proc/self/environ"` refusés, `".env.example"` et le mot « environ » admis ; les lignes de `main` passent.
- `confinement: spécificateurs et paquets` : spécificateur tiers non listé refusé (`axios`, `got`, `node-fetch`, `ws`) ; module intégré sans préfixe refusé ; `node:fs` dans un fichier non-test de `src/` refusé ; paquet de `package.json` absent de la liste refusé ; version non exacte refusée ; `pnpm.overrides` ou script `postinstall` ajouté refusé.
- `confinement: lancements` : les 12 scripts de `main` passent (dont `playwright test --project=…` et `mkdir -p`, qui ne sont pas des options de Node) ; un script modifié ou ajouté sans ligne échoue ; `node -e` et `tsx` refusés même listés ; `node --tls_cipher_list=x s.mjs`, `node --no-insecure_http_parser s.mjs`, `node --require=./x s.mjs`, `node --inspect-port=0 s.mjs`, `node --env-file=.env s.mjs`, `NODE_OPTIONS="--use_openssl_ca" node s.mjs` refusés ; `node --conditions=react-server s.mjs` admis ; `node` des workflows de `main` admis ; `node -e "…"`, `node scripts/autre.mjs`, `npx x`, `NODE_OPTIONS` et une référence à `secrets.OPENROUTER_API_KEY` dans un workflow refusés ; commande de `playwright.config.ts` et instructions du `Dockerfile` vérifiées.
- `confinement: garde des chemins` (P0c2) : fonction pure de décision testée (chemin gardé sans verdict : échec ; avec verdict sur un autre head : échec ; avec verdict sur le head : succès ; verdict posté par un autre auteur que `Samoulou` : échec ; ligne voisine du format (`- Sécurité : **approuvé**`, `- securite : approuvé`, `- securite : **approuvé** (…)`) : échec ; revue la plus récente du head sans la ligne alors qu'une plus ancienne l'a : échec ; liste tronquée ou erreur de l'API : échec ; aucun chemin gardé : succès).

## Critères d'acceptation
1. `pnpm verify` passe sur `main` avec le régime, sans modifier ni désactiver un test existant, **le régime s'appliquant à ses propres fichiers** sans exclusion nominative : ses cas refusés sont des données `.json` non analysées, et ses capacités sont les lignes écrites dans cette spécification (section 3, « Lignes du régime lui-même » ; section 6, `typescript`). Vérifié pour cette spécification contre `main` à `b2c181e` : chaque relevé des sections 2.5, 2.6, 3, 4, 5 et 6 a été recalculé par une analyse au compilateur et au vérificateur de types TypeScript ; avec les corrections de la correction 1, aucune détection de `main` n'est hors liste et aucune ligne n'est inutile.
2. Chaque ligne nominative, chaque entrée de la liste des scripts et des `node` des workflows correspond à `main` à la base de la PR de code ; le test `aucune ligne inutile` le prouve.
3. Chaque contournement cité par les bloquants 2, 3, 4 et 6 et le mineur 8 a un cas négatif qui échoue comme attendu.
4. Les listes sont des fichiers commités, sans joker dans les lignes de capacité, propriété du Tech Lead ; le verdict Sécurité est exigé pour toute modification, sous le format exact de la section 8 (vérifié par le contrôle de chemins de P0c2, après la réponse de Samuel à P0c-Q2).
5. Aucun paquet n'est ajouté par le régime (analyse par `typescript`, déjà présent).
6. Le contrôle de chemins n'exécute aucun code de la PR et ne reçoit aucun secret.

## Décisions attendues du Tech Lead
Ces décisions restent **ouvertes** dans cette spécification (outillage et tests : domaine délégué au Tech Lead). Elles se tranchent dans `docs/decisions/` (une décision du Tech Lead, éventuellement unique pour les cinq), **avant l'ouverture de la PR de code concernée** : P0c-TL-1, TL-2, TL-4 et TL-5 avant P0c1, TL-3 avant P0c2. Une PR de code ouverte sans elles est en écart avec le prérequis de l'en-tête.

| N° | Sujet | Proposition |
|---|---|---|
| P0c-TL-1 | Emplacement et forme | Une suite Vitest `tests/unit/confinement/*.test.ts`, listes sans valeur refusée dans `tests/unit/confinement/listes/*.ts`, données (cas négatifs, hôtes, noms secrets, options interdites, chemins gardés) dans `tests/unit/confinement/donnees/*.json`, utilitaires `tests/unit/confinement/fichiers.ts` et `tests/support/serveur-local.ts` ; ou une règle ESLint pour la partie par fichier, la fermeture transitive restant en Vitest |
| P0c-TL-2 | Relation avec le test d'imports de #149 | Il reste tel quel, plus strict dans `src/ai`, `src/research`, `src/grounding` ; le régime ne le remplace pas |
| P0c-TL-3 | Contrôle de chemins | Script pur `scripts/ci/garde-chemins.mjs` (testé) et workflow `pull_request_target` lancé depuis `main` ; ou extension de `techlead-gate` après T18 |
| P0c-TL-4 | Lecture des workflows | Sans analyseur YAML (aucun paquet ajouté) : règles par ligne de la section 7 ; ou paquet `yaml`, avec verdict Sécurité |
| P0c-TL-5 | Vérificateur de types pour 2.6 | Programme TypeScript construit une fois par exécution sur `tsconfig.json` (comme `pnpm typecheck`), réutilisé par tous les tests du régime ; règle fermée de #180 pour les fichiers hors programme. Alternative : règle fermée partout, avec une ligne nominative par accès calculé de `main` (115 lignes), refusée par la Sécurité comme trop coûteuse à tenir |

## Hors périmètre
- Le contenu des modules de capacité, d'`egress.ts` et des modules d'environnement étroits (P0r1, #172).
- L'épinglage des actions GitHub par empreinte (`ci.yml` utilise des étiquettes `@v4`) : à traiter par T18 ou une tâche release dédiée.
- Les chargements du navigateur par le DOM (images, scripts) : aucune variable serveur n'atteint le navigateur (test « clé côté serveur » de P0r1).
- Le contenu de `node_modules` : couvert par la liste des paquets, le lockfile et le verdict Sécurité, pas par l'analyse syntaxique.

## Questions ouvertes
- **P0-Q21 (Samuel, reprise de #172, Q288)** : rendre le contrôle de chemins (section 8) **obligatoire** dans la protection de `main` (vérification exigée). Précision apportée par cette spécification (mineur 11) : le contrôle vérifie qu'un verdict Sécurité est écrit sur le head, pas qu'il vient d'un tiers, car tous les rôles et Samuel partagent le compte `Samoulou`. Options : (a) vérification obligatoire telle quelle ; (b) en plus, un libellé que seul Samuel pose sur les PR qui touchent un chemin gardé, sur le modèle d'`owner-approved` (T18) ; (c) un second compte GitHub pour les agents, qui rendrait possible une revue de propriétaire exigée (compte externe). Recommandation de Sécurité : (a) tout de suite, (b) pour `package.json`, le lockfile et `src/server/env/**`. **Bloque** : P0r3 (premier appel réel déployable), comme dans #172 ; ne bloque ni cette spécification, ni P0c1, ni P0c2.
- **P0c-Q1 (CEO)** : alignement du nom du fichier entre la version réduite de #172 (`specs/P0-regime-confinement.md`, nom proposé) et celui-ci. Bloque : rien. Reportée dans la description de la PR.
- **P0c-Q2 (Samuel, 2026-10-12)** : modifier le prompt de la routine R2 (Revue), réglé hors du dépôt, pour que la Sécurité soit consultée sur les chemins gardés et que chaque verdict ait une ligne au format exact lu par le contrôle de chemins (section 8). Texte proposé, en remplacement des étapes 2 et 5 du prompt de 0023 § 1 :
  - Étape 2 : « Fais la revue avec le sous-agent tech-lead, selon docs/decisions/0019 § 3.2 et 0023. Ajoute le sous-agent securite si la PR touche db/, src/ai/, src/research/, src/grounding/, src/server/, l'authentification, des secrets, ou un chemin gardé de la section 8 de specs/P0c-confinement-capacites.md (dont package.json, pnpm-lock.yaml, .npmrc, pnpm-workspace.yaml, .github/, scripts/ci/, Dockerfile, les fichiers de configuration à la racine, eslint-rules/, tests/unit/confinement/, tests/support/), et le sous-agent ux-ui si elle touche l'interface. Les sous-agents ne publient rien : attends tous leurs verdicts. »
  - Étape 5 : « Publie un seul commentaire, titré « Revue consolidée — head `<sha court>` ». Sous une ligne « **Verdicts** », écris une ligne par rôle, exactement « - <rôle> : **approuvé** », « - <rôle> : **changements demandés** » ou « - <rôle> : non consulté », avec <rôle> parmi tech-lead, securite, ux-ui ; une précision va à la ligne suivante, jamais sur la ligne du verdict. Puis la liste unique des points (bloquants puis mineurs), et la ligne « Tentative : comptée » ou « Tentative : non comptée (bloquants tardifs seulement) » si tu demandes des changements. »
  Options : (a) coller ce texte ; (b) le coller modifié (le CEO revoit alors la section 8 avec la Sécurité) ; (c) refuser (le contrôle de chemins de P0c2 est alors à redéfinir). Recommandation de Sécurité : (a). **Bloque** : P0c2 (son ouverture), et donc l'exigence d'entrée 7 de P0r2 ; ne bloque ni cette spécification, ni P0c1. Après collage, la copie de l'annexe B de `docs/studio/mise-en-place.md` est alignée par une PR de suivi, comme le prévoit 0023 § 1.
