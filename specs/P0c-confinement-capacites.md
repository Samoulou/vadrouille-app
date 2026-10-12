# P0c — Régime de confinement des capacités et de l'environnement

Rédaction : rôle **securite** (`.claude/agents/securite.md`) · Date : 2026-10-12 · Ticket : #191 · Origine : découpage de #172 décidé par le CEO avec le Tech Lead (issuecomment-6129943401, 42e cycle) · Reprend : bloquants 1, 2, 3, 4 et 6 et mineurs 8 et 11 de la revue consolidée du head `0190606` de #172 (issuecomment-6127551404), P0-Q21 (Q288)

Rôles d'exécution : **release** (contrôles de `package.json`, des workflows, du `Dockerfile`, `CODEOWNERS`, contrôle de chemins) et **backend** (test de capacité, confinement de l'environnement), au choix du CEO ; revue Tech Lead et Sécurité · Prérequis : aucun pour cette spécification ; pour le code, la décision du Tech Lead sur P0c-TL-1 à P0c-TL-4 (« Décisions attendues du Tech Lead »), écrite dans cette spécification ou dans `docs/decisions/` avant le code · Référence : `specs/P0-prototype-recherche.md` (#149, test d'imports de P0a1), `specs/P0-suite-executions-reelles.md` (version réduite de #172, head `335d925`, exigence d'entrée 7 de P0r2 ; version `0190606`, section « Aucun appel déclenchable », d'où vient ce régime), décisions 0002, 0017 § 3.3, 0026, 0031 (jointe à #172, non fusionnée), 0032 § A3.4, 0034, `specs/T18-owner-approved-workflows.md` (#183, ouverte), `docs/handovers/backend.md` § 2 et § 3

**Statut vis-à-vis de P0r2.** Cette spécification **et son code**, fusionnés, sont l'**exigence d'entrée 7 de P0r2** (version réduite de #172, « Renvoyé à la spécification suivante ») : ils doivent être sur `main` avant l'ouverture de la PR de P0r2. Ils avancent en parallèle de P0r1, qui n'en dépend pas.

**Nom du fichier.** La version réduite de #172 propose `specs/P0-regime-confinement.md` (« nom proposé »). Le ticket #191 fixe `specs/P0c-confinement-capacites.md`. La PR qui fusionnera la dernière (#172 ou celle-ci) aligne le renvoi de #172 sur ce nom.

## Objectif
Garantir, **par des tests qui tournent dans `pnpm verify`**, qu'aucun fichier du dépôt ne peut ouvrir une connexion réseau, lancer un processus, charger du code de façon dynamique ou lire une variable d'environnement en dehors d'une **liste d'autorisation écrite**, gardée par le Tech Lead avec un verdict Sécurité. Le but est que la clé OpenRouter et la clé serveur Google (puis l'identifiant de la base, B1) ne soient atteignables que depuis les modules étroits prévus par P0r1 et B3, et qu'un ajout de capacité ne passe jamais en silence.

Chaque règle de cette spécification est **satisfaisable sur `main`** : les listes ci-dessous ont été relevées sur `main` au commit `b2c181e` (2026-10-12) par une analyse syntaxique des 332 fichiers suivis (méthode de la section 2). Le test échoue si une exception devient inutile : une liste fausse se voit donc dès la première exécution.

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

## Ce qui est en place (relevé sur `main` à `b2c181e`)
- Aucun des dossiers `src/ai`, `src/research`, `src/grounding` n'existe sur `main` : le test d'imports de #149 arrive avec P0a1 (#180, ouverte) et les quatre modules de capacité avec le code de P0r1. Aucun appel à OpenRouter ou aux API serveur de Google n'existe dans le dépôt.
- Aucun fichier `CODEOWNERS`, `.npmrc` ou `pnpm-workspace.yaml`. Aucun script de cycle de vie (`preinstall`, `install`, `postinstall`, `prepare`…) dans `package.json`. `pnpm.onlyBuiltDependencies` vaut `["sharp", "unrs-resolver"]` ; pas de `pnpm.overrides`.
- Les workflows ne reçoivent aucune clé d'API : seuls `github.token` (auto-merge, release, techlead-gate, visual-update) et `secrets.SLACK_WEBHOOK_STUDIO` (release) y apparaissent.
- `techlead-gate.yml` tourne sur `pull_request` et exécute `scripts/ci/techlead-gate.mjs` **dans la version de la PR** : une PR peut donc modifier la porte qui la juge. Ce constat motive la garde de `scripts/ci/**` (section 8) ; T18 (#183) traite les workflows eux-mêmes.
- La version `0190606` de #172 nommait `src/adapters/context.ts` et `src/adapters/index.ts` parmi les fichiers qui passent `process.env` entier. C'est inexact : ils lisent `process.env.DATA_ADAPTER` et `process.env.PAYMENT_ADAPTER` par propriété littérale. Les fichiers qui passent `process.env` entier sont `src/adapters/payment-guard.ts`, `src/adapters/simulation.ts`, `src/dev/flags.ts`, `playwright.config.ts` et `tests/unit/ci/visual-update.test.ts` (section 5).

## Rôles et garde des listes
- **Propriétaire des listes** : le Tech Lead (outillage et tests, « Qui décide quoi »). Les listes sont des fichiers TypeScript commités à côté des tests, sous `tests/unit/confinement/` (nom proposé, P0c-TL-1).
- **Verdict Sécurité obligatoire** dans la revue consolidée de toute PR qui ajoute, retire ou élargit une ligne d'une liste, modifie un test du régime, ou touche un chemin gardé (section 8).
- **Aucun joker** dans les exceptions de capacité : chaque ligne nomme un fichier exact et une capacité exacte. Les zones par motif (`tests/**`) ne servent qu'aux modules **sans capacité** (section 6).
- **Exception inutile = échec** : le test échoue si une ligne ne correspond plus à rien (fichier absent, capacité disparue), pour que les listes ne s'élargissent pas en silence.

## 1. Fichiers analysés
- **Tous les fichiers suivis par Git** (`git ls-files`) d'extension `ts`, `tsx`, `js`, `jsx`, `mjs`, `cjs`, `mts`, `cts`, déclarations `.d.ts` et `.d.mts` comprises, où qu'ils soient : `src/`, `tests/` (`tests/e2e/`, `tests/visual/`, `tests/perf/` compris), `scripts/`, `eslint-rules/`, `prototype/`, `db/` (B1), fichiers de configuration à la racine, `middleware.*` et `instrumentation.*` s'ils apparaissent. Sur `main` : 332 fichiers.
- Plus, par des contrôles propres (section 7) : `package.json`, `.github/workflows/*.yml`, `Dockerfile`, et l'absence de `.npmrc`, `.yarnrc*` et `pnpm-workspace.yaml`.
- Un fichier suivi de ces extensions qui est un lien symbolique (mode Git `120000`) fait échouer le test (aucun sur `main`).

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
`import()` et `require()` à spécificateur non littéral ; `import.meta.resolve` ; `import.meta.env` ; `eval` ; `new Function` et `Function(…)` ; `.constructor` appelé (2.3) ; `process.binding`, `process._linkedBinding`, `process.dlopen`, `process.mainModule`, `process.getBuiltinModule` ; `module.require`, `module.createRequire` hors de la seule exception nominative de `src/lib/large-screen.test.tsx`.

### 2.5 Hôtes : normalisation, expressions régulières, gabarits
- **Textes examinés** : littéraux de chaîne, gabarits sans substitution, chaque segment (`quasi`) d'un gabarit, texte JSX et valeurs d'attributs JSX, corps des littéraux d'expression régulière, et le **résultat replié** des expressions constantes : concaténation `+` de littéraux, gabarit dont toutes les substitutions sont des littéraux (`` `${"openrouter"}.ai` `` donne `openrouter.ai`). Les spécificateurs de modules sont exclus (2.2 les traite).
- **Normalisation** de chaque texte, dans cet ordre : forme NFKC ; minuscules ; décodage de `%2e` en `.` ; dans un corps d'expression régulière et dans les arguments de `new RegExp(…)`, retrait des échappements (`\.` donne `.`, `\/` donne `/`) et remplacement de la classe `[.]` par `.` ; retrait d'un point final de nom pleinement qualifié.
- **Hôtes surveillés** : `openrouter.ai`, `googleapis.com` et `ai-gateway.vercel.sh` (chemin de l'AI Gateway, à fermer avec la règle de P0r1 sur l'AI SDK), chacun avec ses sous-domaines. Correspondance par **limite d'étiquette** : `(?<![a-z0-9-])(?:[a-z0-9-]+\.)*(openrouter\.ai|googleapis\.com|ai-gateway\.vercel\.sh)(?![a-z0-9-])`.
- **Fragments** : les étiquettes isolées `openrouter` et `googleapis`, `(?<![a-z0-9])(openrouter|googleapis)(?![a-z0-9])`, sont aussi relevées, pour attraper une concaténation faite à l'exécution (`base + ".ai"`).
- **Limite** : un hôte calculé autrement (codes de caractères, base64, chaîne venue d'un fichier) échappe à cette recherche. Ce risque est résiduel et accepté : le contrôle principal est celui des capacités (2.3), sans lesquelles aucune requête ne part.

Sur `main`, la méthode relève exactement :
- `tests/e2e/carte-helpers.ts` l. 9 : chaîne `"googleapis.com"`, hôte normalisé `googleapis.com` ;
- `tests/e2e/carte.e2e.spec.ts` l. 307 : littéral d'expression régulière `/places\.googleapis\.com|routes\.googleapis\.com/`, hôtes normalisés `places.googleapis.com` et `routes.googleapis.com`.

## 3. Capacités et exceptions nominatives
### Capacités
Une **capacité** est l'un de ces usages, détectés par la section 2 :
1. un spécificateur de **module à capacité** : `node:http`, `node:https`, `node:http2`, `node:tls`, `node:net`, `node:dgram`, `node:dns`, `node:child_process`, `node:vm`, `node:worker_threads`, `node:cluster`, `node:inspector`, `node:module`, `node:process`, et les paquets `undici`, `ai`, `@ai-sdk/*`, `@openrouter/ai-sdk-provider`, `pg`, `lighthouse`, `@googlemaps/js-api-loader` ;
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
| `src/lib/large-screen.test.tsx` | `node:module` (`createRequire(import.meta.url)`, puis `require.resolve` du seul littéral `tailwindcss/package.json`) | lecture du thème Tailwind | test |
| `src/adapters/simulation.ts` | alias de `globalThis` affecté à la constante `holder`, indexée par la seule constante `REGISTRY_KEY` | état simulé en mémoire (rechargement à chaud) | application |
| `src/components/carte/GoogleMapRenderer.tsx` | `@googlemaps/js-api-loader` ; alias de `window` affecté à la constante `authWindow`, lue et écrite par la seule propriété littérale `gm_authFailure` | carte Google du navigateur (F4), clé publique restreinte par référent | application |
| `tests/e2e/carte-helpers.ts` | hôte `googleapis.com` (chaîne) | liste des hôtes Google **bloqués** dans les e2e | test |
| `tests/e2e/carte.e2e.spec.ts` | hôtes `places.googleapis.com` et `routes.googleapis.com` (littéral d'expression régulière) | vérifie qu'aucune requête Google n'a lieu | test |

Ne figurent **pas** dans ce tableau, parce que le régime des tests (section 4) les admet sans exception : `src/analytics/events.test.ts` (`vi.spyOn(globalThis, "fetch")`) et `src/components/ligne/Sheet.test.tsx` (`fireEvent.pointerMove(window, …)`, `fireEvent.pointerUp(window, …)`). Ne sont pas non plus des capacités : `node:zlib` (`tests/e2e/budget-helpers.ts`), `node:crypto`, `node:fs`, `node:path`, `node:url`, `node:os` (modules neutres, section 6).

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
2. `vi.mock("<spécificateur>", <fabrique>)` et `vi.doMock(…)` d'un module à capacité (doubles de `node:http`, `node:https`, `node:net`, `node:dns`, `node:dns/promises`, `undici`…), à condition que le spécificateur soit littéral et que la fabrique n'appelle **ni** `importOriginal`, **ni** `vi.importActual`, **ni** `vi.importMock`. Le module réel n'est donc jamais chargé.
3. `vi.stubEnv("<NOM>", <valeur>)` et `vi.unstubAllEnvs()`, avec un nom littéral qui n'est pas un nom secret (section 5).
4. `fireEvent.<événement>(window, …)` et `fireEvent.<événement>(document, …)`.
5. `process.cwd()` et les modules neutres (section 6).

Restent **refusés** dans les tests, sauf ligne nominative : l'import réel d'un module à capacité, un appel au `fetch` réel, un hôte surveillé, un serveur ou une connexion réelle, `vi.importActual` d'un module à capacité, et toute écriture dans `process.env` autrement que par `vi.stubEnv`.

**Serveur local de test.** Un test qui a besoin d'un vrai serveur (par exemple la suite contre les requêtes détournées du transport `undici` de P0r1) passe par un utilitaire unique, `tests/support/serveur-local.ts` (nom proposé, P0c-TL-1), livré par le code de ce régime. C'est la seule ligne nominative prévue pour ce besoin : `node:http` (`createServer`), écoute sur `127.0.0.1` et le port `0` seulement, fermeture garantie en fin de test. Les tests qui l'importent n'ont pas de ligne propre. Les deux usages de `main` (`visual-update.test.ts`, `lighthouse-helpers.ts`) gardent leur ligne : les migrer n'est pas exigé.

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
| `playwright.config.ts` | lecture littérale ; `process.env` entier en argument `env` de `e2ePort` (`scripts/e2e-port.mjs`) | `CI`, `E2E_SKIP_BUILD` |
| `scripts/e2e-port.mjs` | paramètre `env` de `e2ePort`, lu par propriété littérale | `E2E_PORT`, `CI` |
| `src/adapters/context.ts` | lecture littérale | `DATA_ADAPTER` |
| `src/adapters/index.ts` | lecture littérale | `DATA_ADAPTER`, `PAYMENT_ADAPTER` |
| `src/adapters/payment-guard.ts` | valeur par défaut du paramètre `env` de `paymentDemoAllowed` et `paymentAvailable` ; passé à `isProductionDeployment` et `paymentDemoAllowed` | `VADROUILLE_DEMO_PAYMENT`, `PAYMENT_ADAPTER`, `DATA_ADAPTER` |
| `src/adapters/simulation.ts` | valeur par défaut du paramètre `env` de `simulationEnabled` ; passé à `devPagesEnabled` et `isProductionDeployment` | aucun en propre |
| `src/dev/flags.ts` | valeur par défaut du paramètre `env` de `devPagesEnabled` et `isProductionDeployment` | `VADROUILLE_DEV_PAGES`, `VADROUILLE_ENV`, `VERCEL_ENV` |
| `src/components/carte/config.tsx` | lecture littérale | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` |
| `tests/unit/ci/visual-update.test.ts` | étalement `...process.env` (deux fois) dans l'environnement d'un processus enfant | sans objet |
| `src/adapters/context.test.ts`, `src/adapters/index.test.ts` | `vi.stubEnv` (section 4) | `DATA_ADAPTER` |

**Noms secrets.** Sont secrets : `OPENROUTER_API_KEY`, `GOOGLE_MAPS_SERVER_KEY`, `AI_GATEWAY_API_KEY`, `VERCEL_OIDC_TOKEN`, et tout nom qui finit par `_KEY`, `_TOKEN`, `_SECRET` ou `PASSWORD`, ou qui contient `DATABASE_URL`, sauf `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (clé publique du navigateur, restreinte par référent, F4). Un nom secret ne peut figurer dans la liste que pour un module de `src/server/env/` ou le module de connexion de B1, avec un verdict Sécurité qui le cite. Hors de ces modules, toute chaîne ou tout gabarit qui contient un nom secret ou l'un des fragments `OPENROUTER_API`, `MAPS_SERVER_KEY`, `AI_GATEWAY` ou `OIDC_TOKEN` est refusé (aucun sur `main`).

## 6. Spécificateurs et dépendances tierces
### Liste d'autorisation des spécificateurs
Tout spécificateur qui n'est ni relatif, ni `@/…` doit figurer dans une liste `(spécificateur, zones)`. Pour les modules **sans capacité**, une zone peut être un motif ; les modules **à capacité** relèvent seulement des lignes nominatives (section 3).

| Spécificateur | Zones admises sur `main` |
|---|---|
| `react` | `src/**`, `tests/unit/**` |
| `react-dom` | `src/**`, `tests/unit/**` |
| `next` (sous-chemins compris) | `src/**`, `next.config.ts` |
| `zod` | `src/**` |
| `clsx`, `tailwind-merge` | `src/lib/**` |
| `class-variance-authority`, `@radix-ui/react-dialog`, `@radix-ui/react-slot` | `src/components/**` |
| `vitest` (sous-chemins compris) | fichiers de test, `vitest.config.mts` |
| `@testing-library/react` | fichiers de test |
| `@testing-library/jest-dom`, `axe-core` | `tests/unit/**` |
| `@playwright/test` | `tests/e2e/**`, `tests/visual/**`, `tests/perf/**`, `playwright.config.ts` |
| `@axe-core/playwright` | `tests/e2e/**` |
| `eslint` (sous-chemins compris), `eslint-config-next` | `eslint.config.mjs`, `eslint-rules/**`, `tests/unit/**` |
| `node:fs`, `node:fs/promises`, `node:path`, `node:url`, `node:os`, `node:zlib`, `node:util` | partout **sauf** les fichiers non-test de `src/` |
| `node:crypto` | partout |

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

Un script absent de la liste, ou une entrée de la liste absente de `package.json`, fait échouer le test. Aucune entrée ne peut contenir, même avec un verdict : `node -e`, `--eval`, `-p`, `--print`, `--use-env-proxy`, `--inspect`, `--inspect-brk`, `--require`, `-r`, `--loader`, `--experimental-loader`, `--openssl-*`, `--tls-*`, `--use-openssl-ca`, `--use-system-ca`, `--insecure-http-parser`, `tsx`, `npx`, `pnpm dlx`, `curl`, `wget`. `node --import` n'est admis que sous la forme exacte du script `p0` de P0a1 (section 9).

### `node` dans les workflows
- Dans chaque fichier de `.github/workflows/`, lignes de commentaire exclues (premier caractère non blanc `#`), **chaque** occurrence du mot `node` (non précédé de `[A-Za-z0-9_./-]`, non suivi de `[A-Za-z0-9_.@:-]`) doit être suivie d'espaces puis d'un chemin de la liste : `scripts/ci/release-note.mjs`, `scripts/ci/techlead-gate.mjs`. Une option avant le chemin (`node -e`, `node --import`) est refusée. Relevé sur `main` : `release.yml` (deux appels à `release-note.mjs`), `techlead-gate.yml` (un appel à `techlead-gate.mjs`) ; `setup-node@…` et `node-version` ne sont pas des occurrences.
- `pnpm` n'est admis dans un `run:` que sous ces formes : `pnpm install --frozen-lockfile`, `pnpm exec playwright …`, `pnpm <script>` avec un script de la liste. `npx`, `pnpm dlx`, `npm` et `NODE_OPTIONS` sont refusés dans les workflows.
- Aucune référence à un nom secret (section 5) dans les workflows. Références admises : `github.token` ; `secrets.SLACK_WEBHOOK_STUDIO` dans `release.yml` seulement.

### Configuration et image
- `playwright.config.ts` : la commande du serveur web est `node scripts/serve-standalone.mjs`, précédée de `pnpm build && ` quand `E2E_SKIP_BUILD` est absente. Le test vérifie ces deux chaînes exactes.
- `Dockerfile` : les instructions `RUN`, `CMD` et `ENTRYPOINT` sont identiques à la liste : `RUN corepack enable` (deux fois), `RUN pnpm install --frozen-lockfile`, `RUN pnpm build && mkdir -p public`, `CMD ["node", "server.js"]` ; aucune instruction `ENV` ne pose `NODE_OPTIONS` ni un nom secret.

## 8. Garde des chemins : `CODEOWNERS` et contrôle de chemins
### Chemins gardés
Les tests et listes du régime (`tests/unit/confinement/**`), `tests/support/serveur-local.ts`, les fichiers nommés dans une ligne de capacité (lus dans la liste), les modules de capacité de P0r1 et `src/research/ip-guard.ts`, `src/research/fetch-page.ts`, `src/server/env/**`, `src/server/composition/**`, `package.json`, `pnpm-lock.yaml`, `.npmrc`, `pnpm-workspace.yaml`, `.github/workflows/**`, `.github/CODEOWNERS`, `scripts/ci/**`, `Dockerfile`, `playwright.config.ts`, `vitest.config.mts` (et toute autre configuration de Vitest), `next.config.ts`, `eslint.config.mjs`, `eslint-rules/**`, `middleware.*`, `instrumentation.*`.

### Mécanisme
1. **`CODEOWNERS`** (`.github/CODEOWNERS`) sur ces chemins, propriétaire `@Samoulou`. Il rend les chemins visibles dans chaque PR ; il ne bloque rien sans réglage de la protection de `main` (P0-Q21).
2. **Contrôle de chemins** exécuté par un workflow `pull_request_target` : version du workflow et du script prise sur `main`, **sans extraction du code de la PR**, permissions `contents: read` et `pull-requests: read`, aucun secret. La liste des fichiers modifiés est lue par l'API (`GET /pulls/{n}/files`, paginée) ; au-delà de la limite de l'API (3 000 fichiers) ou en cas d'erreur, le contrôle échoue. Il échoue si un chemin gardé change et que la dernière revue consolidée **du head courant** ne porte pas la ligne « securite : **approuvé** ». Sa forme exacte est une décision du Tech Lead (P0c-TL-3). C'est une PR de workflow : elle attend `owner-approved`, posé par Samuel (Q245, T18).

### Indépendance (mineur 11)
Tous les rôles du studio agissent sous le compte `Samoulou`, comme Samuel (constat de T18). Le verdict Sécurité que lit le contrôle est donc un commentaire posté **par le même compte que le rôle qui pousse** : le contrôle garantit qu'une revue Sécurité a été écrite sur le head, **pas** qu'elle vient d'un tiers indépendant. De même, `CODEOWNERS` avec « revue du propriétaire exigée » ne peut pas être satisfait par l'auteur de la PR, qui est ce même compte. Une garde indépendante supposerait une action que seul Samuel peut faire (libellé posé par lui, comme `owner-approved` de T18, ou second compte GitHub pour les agents). Ce choix est à Samuel : **P0-Q21**.

## 9. Lignes à ajouter selon l'ordre de fusion
Les tableaux ci-dessus décrivent `main` à `b2c181e`. **La PR de code de ce régime relève de nouveau `main` à sa base** et ajoute les lignes de tout ce qui a fusionné entre-temps, chacune avec un verdict Sécurité. Une PR qui fusionne **après** le régime ajoute elle-même ses lignes. Lignes attendues, à vérifier au moment voulu (aucune n'est admise par cette spécification) :
- **P0a1 (#180)** : script `p0` = `node --import ./scripts/p0/enregistrer.mjs scripts/p0/main.ts` (0032 § A3.4), seule forme admise de `node --import` ; `scripts/p0/enregistrer.mjs` avec `import { registerHooks } from "node:module"` sous cette seule forme ; `typecheck` modifié (`tsc --noEmit && tsc -p tsconfig.p0.json --noEmit`) ; paquet `parse5` ; `node:util` et `node:fs` dans `scripts/p0/**` ; usages de `process` des scripts `p0`.
- **B1 (#188)** : paquets `pg` (module à capacité, `db/connection.ts` et `db/migrate.ts`), `drizzle-orm`, `server-only`, `drizzle-kit`, `@types/pg` ; scripts `test:db`, `db:generate` (`NODE_OPTIONS=--conditions=react-server`), `db:migrate` (`node --conditions=react-server …`) et `verify` modifié ; `scripts/test-db.mjs` (`node:child_process`, noms `SKIP_DB_TESTS`, `CI`, `GITHUB_ACTIONS`) ; `process.env` entier en valeur par défaut dans `db/index.ts` et en argument dans `db/migrate.ts` ; nom secret de la base dans le module de connexion ; modification de `.github/workflows/ci.yml` (PR de workflow, T18).
- **P0r1 (code)** : les quatre modules de capacité avec les capacités que leur donne la spécification de P0r1 ; `src/server/env/egress.ts` (`process.execArgv`, variables de déploiement, de proxy et TLS) ; `src/server/env/ai.ts` et `src/server/env/grounding.ts` (un nom secret chacun) ; leurs tests, par le régime des tests ou par `tests/support/serveur-local.ts`.

## Découpage et ordre
- **P0c1** (backend) : test de capacité, fermeture transitive, régime des tests, confinement de l'environnement, listes des spécificateurs et des paquets, utilitaire de serveur local. Tests unitaires seulement.
- **P0c2** (release) : contrôles de `package.json`, des workflows, de `playwright.config.ts` et du `Dockerfile` ; `CODEOWNERS` ; workflow de contrôle de chemins (PR de workflow : `owner-approved` de Samuel, T18).
- P0c1 et P0c2 touchent des fichiers distincts et peuvent avancer en parallèle. Les deux sont fusionnées avant la PR de P0r2 (exigence d'entrée 7).

## Tests attendus (noms proposés)
- `confinement: méthode de détection`, avec un cas négatif par forme, sur des textes sources de test présentés comme un fichier non-test de `src/` : chaque spécificateur de module à capacité (avec et sans `node:`, sous-chemin, `import type`, `export * from`, `import x = require`, `import()` littéral) ; `fetch`, `{ fetch }`, `globalThis.fetch`, `globalThis["fetch"]`, `window.fetch`, `self.fetch`, `global.fetch` ; `const g = globalThis`, `Reflect.get(globalThis, "fetch")`, `Object.getOwnPropertyDescriptor(globalThis, "fetch")`, `const { fetch } = globalThis`, `globalThis[k]` ; `(() => {}).constructor("…")` ; `process.getBuiltinModule("http")` ; `import(k)`, `require(k)`, `import.meta.resolve` ; `WebSocket`, `navigator.sendBeacon`. Cas positifs : `window.matchMedia`, `typeof window`, `(window as T).x = y`, `x.constructor.name`.
- `confinement: hôtes normalisés` : `"openrouter.ai"`, `"OpenRouter.AI"`, `"https://places.googleapis.com/v1"`, `/places\.googleapis\.com/`, `new RegExp("routes\\.googleapis\\.com")`, `/googleapis[.]com/`, `"openrouter" + ".ai"`, `` `${"openrouter"}.ai` ``, `"openrouter%2Eai"`, fragment `"googleapis"`, `"ai-gateway.vercel.sh"` : refusés. `"notgoogleapis.community"`, `"gstatic.com"` : admis.
- `confinement: aucune capacité hors des lignes nominatives` (dépôt entier) et `confinement: aucune ligne inutile` (chaque ligne de `main` correspond à au moins une détection, et à la seule capacité qu'elle déclare).
- `confinement: fermeture transitive` : aucun fichier de portée test ou outil atteint depuis un fichier non-test de `src/` ou `db/` ; un fichier non-test qui importe un fichier de test est refusé (cas négatif) ; un module de capacité importé par un barrel est refusé (cas négatif) ; spécificateur relatif non résolu : échec.
- `confinement: régime des tests` : `vi.spyOn(globalThis, "fetch")`, `vi.stubGlobal("fetch", double)`, `vi.mock("node:http", () => ({…}))` admis dans un test ; `vi.mock("node:http", async (importOriginal) => …)`, `vi.importActual("undici")`, `import http from "node:http"` dans un test sans ligne, `vi.stubEnv("OPENROUTER_API_KEY", "x")` refusés.
- `confinement: environnement` : chaque contournement du bloquant 4 refusé (`import process from "node:process"`, `import { env } from "node:process"`, `const e = process.env; e[k]`, `process["env"]`, `globalThis.process.env`, `f(process.env)` hors ligne, `{ ...process.env }` hors ligne, `const { A } = process.env`, `Object.keys(process.env)`, `Reflect.get(process.env, k)`, `process.env.A = "x"`, `import.meta.env`) ; nom non listé refusé ; paramètre `env` d'un fichier listé lu par `env[k]` refusé ; fragment de nom secret refusé ; les lignes de `main` passent.
- `confinement: spécificateurs et paquets` : spécificateur tiers non listé refusé (`axios`, `got`, `node-fetch`, `ws`) ; module intégré sans préfixe refusé ; `node:fs` dans un fichier non-test de `src/` refusé ; paquet de `package.json` absent de la liste refusé ; version non exacte refusée ; `pnpm.overrides` ou script `postinstall` ajouté refusé.
- `confinement: lancements` : les 12 scripts de `main` passent ; un script modifié ou ajouté sans ligne échoue ; `node -e` et `tsx` refusés même listés ; `node` des workflows de `main` admis ; `node -e "…"`, `node scripts/autre.mjs`, `npx x`, `NODE_OPTIONS` et une référence à `secrets.OPENROUTER_API_KEY` dans un workflow refusés ; commande de `playwright.config.ts` et instructions du `Dockerfile` vérifiées.
- `confinement: garde des chemins` (P0c2) : fonction pure de décision testée (chemin gardé sans verdict : échec ; avec verdict sur un autre head : échec ; avec verdict sur le head : succès ; liste tronquée ou erreur de l'API : échec ; aucun chemin gardé : succès).

## Critères d'acceptation
1. `pnpm verify` passe sur `main` avec le régime, sans modifier ni désactiver un test existant.
2. Chaque ligne nominative, chaque entrée de la liste des scripts et des `node` des workflows correspond à `main` à la base de la PR de code ; le test `aucune ligne inutile` le prouve.
3. Chaque contournement cité par les bloquants 2, 3, 4 et 6 et le mineur 8 a un cas négatif qui échoue comme attendu.
4. Les listes sont des fichiers commités, sans joker dans les lignes de capacité, propriété du Tech Lead ; le verdict Sécurité est exigé pour toute modification (vérifié par le contrôle de chemins de P0c2).
5. Aucun paquet n'est ajouté par le régime (analyse par `typescript`, déjà présent).
6. Le contrôle de chemins n'exécute aucun code de la PR et ne reçoit aucun secret.

## Décisions attendues du Tech Lead
| N° | Sujet | Proposition |
|---|---|---|
| P0c-TL-1 | Emplacement et forme | Une suite Vitest `tests/unit/confinement/*.test.ts`, listes dans `tests/unit/confinement/listes/*.ts`, utilitaire `tests/support/serveur-local.ts` ; ou une règle ESLint pour la partie par fichier, la fermeture transitive restant en Vitest |
| P0c-TL-2 | Relation avec le test d'imports de #149 | Il reste tel quel, plus strict dans `src/ai`, `src/research`, `src/grounding` ; le régime ne le remplace pas |
| P0c-TL-3 | Contrôle de chemins | Script pur `scripts/ci/garde-chemins.mjs` (testé) et workflow `pull_request_target` lancé depuis `main` ; ou extension de `techlead-gate` après T18 |
| P0c-TL-4 | Lecture des workflows | Sans analyseur YAML (aucun paquet ajouté) : règles par ligne de la section 7 ; ou paquet `yaml`, avec verdict Sécurité |

## Hors périmètre
- Le contenu des modules de capacité, d'`egress.ts` et des modules d'environnement étroits (P0r1, #172).
- L'épinglage des actions GitHub par empreinte (`ci.yml` utilise des étiquettes `@v4`) : à traiter par T18 ou une tâche release dédiée.
- Les chargements du navigateur par le DOM (images, scripts) : aucune variable serveur n'atteint le navigateur (test « clé côté serveur » de P0r1).
- Le contenu de `node_modules` : couvert par la liste des paquets, le lockfile et le verdict Sécurité, pas par l'analyse syntaxique.

## Questions ouvertes
- **P0-Q21 (Samuel, reprise de #172, Q288)** : rendre le contrôle de chemins (section 8) **obligatoire** dans la protection de `main` (vérification exigée). Précision apportée par cette spécification (mineur 11) : le contrôle vérifie qu'un verdict Sécurité est écrit sur le head, pas qu'il vient d'un tiers, car tous les rôles et Samuel partagent le compte `Samoulou`. Options : (a) vérification obligatoire telle quelle ; (b) en plus, un libellé que seul Samuel pose sur les PR qui touchent un chemin gardé, sur le modèle d'`owner-approved` (T18) ; (c) un second compte GitHub pour les agents, qui rendrait possible une revue de propriétaire exigée (compte externe). Recommandation de Sécurité : (a) tout de suite, (b) pour `package.json`, le lockfile et `src/server/env/**`. **Bloque** : P0r3 (premier appel réel déployable), comme dans #172 ; ne bloque ni cette spécification, ni P0c1, ni P0c2.
- **P0c-Q1 (CEO)** : alignement du nom du fichier entre la version réduite de #172 (`specs/P0-regime-confinement.md`, nom proposé) et celui-ci. Bloque : rien.
