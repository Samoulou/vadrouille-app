# 0032 — Décisions du Tech Lead pour P0a1 et P0b1 : A2, A3, A4, A6 et A7

Statut : décision déléguée, à lister dans la note de version suivante (rubrique « Décisions prises par le studio ») ; définitive sans veto de Samuel dans les 2 jours qui suivent cette publication · Date : 2026-10-12 · Décideur : Tech Lead (architecture, bibliothèques, outillage, tests ; délégation « Qui décide quoi » de `docs/CONTEXT.md`) · Ticket #174 (T19) · Amendée le 2026-10-13 (section « Amendements » : écarts acceptés en revue de P0a1, #179 et #180)

**Amendée par 0046** (#266, D15 point 4) : `PROTOTYPE_ORG_ID` (lignes 43 et 212) devient un uuid fixe, celui d'`org_prototype` créée par migration ; § A3.1 (ligne 56, décorateurs de plafonds) inchangé.

Numérotation : 0029 est prise par la PR #165 (ticket #164 ; la décision 0030 cite le ticket), 0030 par la PR #149, 0031 par la PR #172 (vérifié le 2026-10-12 : chacune de ces PR ajoute le fichier correspondant). Aucune PR ouverte n'utilise 0032 (vérifié le 2026-10-12). 0032 est le prochain numéro libre.

## Contexte
La spécification P0 (`specs/P0-prototype-recherche.md`, #149, fusionnée le 2026-10-12) attend du Tech Lead cinq décisions d'architecture (section « Décisions d'architecture attendues ») :
- A2, A3 et A7 avant P0a1 (script en mode simulé) ;
- A4 et A6 avant P0b1 (adaptateur `prototype` sur un programme de test).

La décision 0030 confirme cet ordre. A1 (client de modèles, amendement de 0006) et A5 (programmes réels hors du dépôt) restent à la spécification suivante.

Cette décision ne modifie aucun code. Elle n'ajoute aucune dépendance. Elle fixe les contraintes que les PR de P0a1 et de P0b1 appliquent.

Contraintes reprises de la spécification, non négociables ici :
- `programme-reduit.ts` est importable par l'application et n'importe rien du script ;
- `ip-guard.ts` est le seul fichier qui importe `node:net`, sous la seule forme `import { BlockList, isIP } from "node:net"` ;
- aucun chemin réel n'existe dans P0a1 ni dans P0b1 (décision 0030) ;
- les exigences de sécurité de la spécification (garde SSRF, épinglage, redaction, schémas stricts, aucun cache, index du chargeur) ne sont pas des options.

**Argent, comptes, données hors UE** : rien. Aucune dépendance n'engage un compte ni un service. Aucune clé n'est lue.

**Principe « l'agent cherche, l'ancrage vérifie, le moteur planifie »** : c'est le découpage en dossiers de A3. La recherche vit dans `src/research` et `src/ai`, l'ancrage dans `src/grounding`, le moteur dans `src/domain`. Seul l'orchestrateur du script voit les trois. Les types qui passent d'une étape à l'autre vivent dans deux modules purs de `src/prototype/` : `candidat.ts` (candidat et notes) et `ancrage.ts` (résultat d'ancrage). `src/ai` et `src/research` n'ont pas le droit d'importer `ancrage.ts`, ni directement ni par transitivité (A3.2). C'est ce qui rend le principe vérifiable : un résultat d'ancrage ne peut pas atteindre un prompt par un import.

**Règles Google** : celles de `CLAUDE.md` (« Jamais ») et de la réponse de Samuel à Q241 (0028 : « aucune donnée Google (horaires compris) dans le dépôt public ; [...] seuls les identifiants de lieu peuvent y figurer »). Cette décision ne les modifie pas. Elle les applique ainsi :
- **Dans le dépôt** : seulement des identifiants de lieu et des valeurs sentinelles (fixtures, programme de test). Aucune position réelle, aucun horaire Google, aucune durée de Routes.
- **Positions** (table `positions`) : seulement dans un programme réel **hors du dépôt**, 30 jours au plus (P0-Q8 b, 0028). Aucun programme réel n'existe dans P0a1 ni dans P0b1 (0030).
- **Horaires** : aucun horaire d'ouverture Google ni aucune durée de Routes n'est gardé, nulle part. Ils vivent en mémoire pendant l'exécution, puis disparaissent (spécification, contrainte 3). Les heures planifiées d'un programme réel en dérivent indirectement et suivent le régime du programme hors du dépôt ; ce point est porté à Q5 par la spécification.

## A3 — Emplacements, règles d'import, commande `pnpm p0`

### A3.1 Le code vit dans les dossiers de l'application
**Retenu : les dossiers du handover back-end § 3**, plus un petit dossier partagé `src/prototype/`. Pas de dossier isolé `scripts/p0/` pour le pipeline.

Raisons :
- Le handover § 8 demande que P0 alimente B7 et B8 « sans être recopié ». La spécification suivante (#172, décision D3) prévoit le même alignement.
- Les règles d'import par dossier séparent ce que voit chaque étape. C'est le principe technique 1 rendu vérifiable.
- `programme-reduit.ts` doit être importable par `src/adapters` : il ne peut pas vivre dans le dossier du script.

| Emplacement | Contenu |
|---|---|
| `src/prototype/` | Code **pur** partagé par le script et l'application. `programme-reduit.ts` : schéma strict de la forme réduite, type, constante `PROTOTYPE_ORG_ID = "org_prototype"`. `config.ts` : schémas Zod des fichiers de A2. `brief.ts` : schéma strict du brief (P0-PO-2). `candidat.ts` : schéma et type du candidat trouvé par la recherche et de ses notes (`matchesWishes`, `notForMeRisk`, `mustSee`, `slotFit`). `ancrage.ts` : schéma et type du résultat d'ancrage (`placeId`, position, horaires et durées en mémoire, statut). `reduction.ts` : passage du programme complet validé à la forme réduite. |
| `src/domain/` | Moteur pur. Squelette, classement (formule lue dans la configuration, A2), planification, validateurs R1, R2, R4 à R8. Identifiant `proto_<slug>_<AAAAMMJJ>_<n>`. Gabarits de `Day.title` et de `Proposal.context`. |
| `src/ai/` | Interface du client de modèles (requête, réponse, réglage `data_collection`). Garde `data_collection: "deny"` avant chaque requête. Client simulé. Constructeurs de requêtes. Schémas stricts des sorties de modèles. Prompts versionnés dans `src/ai/prompts/`, un module TypeScript par étape qui exporte `{ id, version, texte }` (aucune lecture de fichier). |
| `src/research/` | Agent borné. Politique de sources. Validation des URL de source. `fetch-page.ts` : seul module de lecture des pages, résolveur DNS et couche HTTP **injectés**. `ip-guard.ts` : contrôle des adresses. `extract-text.ts` : extraction du texte HTML (A7). Énumération fermée des raisons `pages_refused`. |
| `src/grounding/` | Interfaces Places et Routes. Clients simulés à valeurs sentinelles. Ancrage déterministe en mémoire. |
| `scripts/p0/` | **Enveloppe mince** du script. `main.ts` : lecture des arguments, validation du nom de brief, mode `--reel` en erreur fermée constante `real_mode_unavailable`. `pipeline.ts` : orchestrateur, seul fichier qui compose recherche, ancrage, moteur et modèles. Lecture des briefs, de la configuration et des fixtures, injectés ensuite dans les modules. Décorateurs de plafonds autour des clients injectés. Journal à codes fermés et filtre de redaction. Écriture du programme réduit et du rapport (schéma du rapport : `scripts/p0/rapport.ts`). `enregistrer.mjs` : point d'accroche de résolution (A3.4). |
| `prototype/briefs/` | `edimbourg-1.json` à `edimbourg-3.json`, commités, sans donnée Google. |
| `prototype/config/` | Fichiers de configuration de A2, commités. |
| `prototype/fixtures/` | Fixtures du mode simulé, fabriquées à la main (contrainte 8) : `modeles/`, `recherche/`, `pages/`, `places/`, `routes/`. Lues **par `scripts/p0/` seulement**, puis injectées. |
| `prototype/sorties/` | Programmes et rapports du mode simulé. Ignoré par git (`.gitignore`). |
| `prototype/programmes-test/` | Programme de test de P0b1, fabriqué à la main, à valeurs sentinelles (A4). |
| `tests/unit/p0/` | Tests transverses : liste d'autorisation des imports, aucun secret dans les fichiers suivis, canaris. Les tests propres à un module restent à côté de lui (`*.test.ts`), comme `src/contracts`. |

Les plafonds sont appliqués par des **décorateurs** posés par l'orchestrateur autour des clients injectés (modèles, recherche web, pages, Places, Routes). `src/ai`, `src/research` et `src/grounding` ne connaissent pas les plafonds. Le registre de coût vit au même endroit. Un seul mécanisme, vérifié avant chaque appel.

Les valeurs de la garde de lecture des pages (2 Mo après décompression, 10 s par page, 3 redirections, `https` et port 443 seuls) sont des **constantes de `fetch-page.ts`**, pas des valeurs de configuration. Une garde de sécurité ne doit pas pouvoir s'assouplir par un fichier de configuration.

### A3.2 Liste d'autorisation des imports
Contrôle par un test Vitest unique, `tests/unit/p0/imports.test.ts`. Il lit l'arbre syntaxique de chaque fichier avec l'API du compilateur TypeScript (`typescript`, déjà en devDependency ; aucune dépendance nouvelle). Il couvre `import`, `import type`, `export … from`, `import x = require()` et toutes les constructions refusées de la spécification (test `p0: aucun client réel ni accès réseau dans le code de P0a1`).

Hors des imports permis ci-dessous, sont refusés : tout paquet npm, tout module intégré de Node (avec ou sans préfixe `node:`, sous-chemins compris), `undici`, et toutes les constructions listées par la spécification.

| Fichiers | Seuls imports permis |
|---|---|
| `src/prototype/brief.ts`, `config.ts`, `candidat.ts`, `ancrage.ts`, `programme-reduit.ts` | `@/contracts`, `zod` seulement (modules feuilles, aucun import entre eux) |
| `src/prototype/reduction.ts` | `@/contracts`, `zod`, `@/prototype/ancrage`, `@/prototype/programme-reduit` |
| `src/domain/**` | `@/contracts`, `zod`, `@/domain/*`, `@/prototype/brief`, `@/prototype/config`, `@/prototype/candidat`, `@/prototype/ancrage` |
| `src/ai/**` | `@/contracts`, `zod`, `@/ai/*`, `@/prototype/brief`, `@/prototype/config`, `@/prototype/candidat` |
| `src/research/**` | `@/contracts`, `zod`, `@/ai/*`, `@/research/*`, `@/prototype/brief`, `@/prototype/config`, `@/prototype/candidat`. En plus : `node:net` dans `ip-guard.ts` seulement, sous la seule forme `import { BlockList, isIP } from "node:net"` ; `parse5` (A7.2) dans `extract-text.ts` seulement. `ip-guard.ts` n'est importé que par `fetch-page.ts` (et par son test). |
| `src/grounding/**` | `@/contracts`, `zod`, `@/grounding/*`, `@/prototype/brief`, `@/prototype/config`, `@/prototype/candidat`, `@/prototype/ancrage` |
| `scripts/p0/**/*.ts` | `@/contracts`, `zod`, `@/prototype/*`, `@/domain/*`, `@/ai/*`, `@/research/*`, `@/grounding/*`, fichiers de `scripts/p0/`, `node:fs`, `node:fs/promises`, `node:path`, `node:util` (pour `parseArgs`) |
| `scripts/p0/enregistrer.mjs` | `import { registerHooks } from "node:module"` seulement, sous cette forme exacte. C'est le seul fichier `.mjs` du dossier. **Écart à la spécification**, déclaré et justifié en A3.4 ; contenu figé par empreinte. |

Règles complémentaires :
- `src/ai` et `src/research` n'importent jamais `@/grounding`, `@/prototype/ancrage`, `@/prototype/reduction`, `@/prototype/programme-reduit`, `@/domain`, ni rien de `scripts/`. Test dédié sur le **graphe transitif** : depuis chaque fichier de `src/ai` et de `src/research`, aucun chemin d'import n'atteint `src/prototype/ancrage.ts` ni `src/grounding`. Aucune donnée Google ne peut atteindre un prompt par un import.
- Les types partagés entre étapes ne sont définis qu'une fois, dans `src/prototype/candidat.ts` et `src/prototype/ancrage.ts`. Aucune étape ne les recopie. `src/contracts` ne change pas.
- Les modules de `src/prototype` n'importent que `@/contracts` et `zod` (sauf `reduction.ts`, ci-dessus) : `programme-reduit.ts` reste importable par l'application, sans rien tirer du script. Test dédié : le graphe transitif de `src/prototype/programme-reduit.ts` ne contient que lui-même, des fichiers de `src/contracts` et `zod`.
- Graphe de l'application : aucun fichier de `src/app`, `src/features`, `src/components`, `src/lib`, `src/adapters`, `src/mocks` ni de configuration de Next.js n'importe `@/ai`, `@/research`, `@/grounding`, `@/domain` ou un fichier de `scripts/`. De `src/prototype`, `src/adapters` n'importe que `@/prototype/programme-reduit`. Même test.
- **Écart à la spécification (plus strict)** : les clients simulés (`*.simule.ts`) **ne sont pas exclus** de la liste d'autorisation. Ils servent le mode simulé, pas seulement les tests, et n'ont besoin de rien d'autre. Seuls les fichiers `*.test.ts` sont exclus, sauf pour la règle `node:net`.
- `process.env` est refusé partout dans ces fichiers, `scripts/p0/` compris. Le mode simulé ne lit aucune variable d'environnement.
- Le paquet `server-only` n'est pas ajouté par P0a1 (décision 0020) ; il arrive avec B1.

Le handover back-end § 3 reste la cible de B7 et B8 (règles ESLint par dossier, `node:dns`, client HTTP, modules d'environnement). Pendant P0a1, la liste ci-dessus, plus étroite, s'applique. La spécification suivante l'élargit (P0r1 : `undici` dans `fetch-page.ts`, `@/server/env/ai`, `@/server/env/grounding`, `@/server/usage`).

### A3.3 Écart 3 bis sur `Stop.exceptions`
**Accepté.** La forme réduite type `exceptions` comme un tableau de `"toReserve" | "unconfirmed"` (au plus 2) et refuse `toConfirm`. Le prototype ne calcule jamais `toConfirm`, donc son absence ne révèle rien d'un horaire Google. L'écart est signalé pour Q44, comme le demande la spécification.

### A3.4 Commande `pnpm p0`
**Retenu : le support natif de TypeScript de Node, sans dépendance.**
- Script : `"p0": "node --import ./scripts/p0/enregistrer.mjs scripts/p0/main.ts"`.
- Node retire les types nativement depuis 22.18 (moteur du dépôt : `>=22.19.0`).
- `enregistrer.mjs` enregistre, par `registerHooks` (synchrone, dans le même fil ; disponible depuis Node 22.15), un seul point d'accroche `resolve` (forme ci-dessous).
- Fichier `tsconfig.p0.json` : il étend `tsconfig.json`, couvre `scripts/p0`, `src/prototype`, `src/domain`, `src/ai`, `src/research`, `src/grounding` et `src/contracts`, et active `erasableSyntaxOnly` et `verbatimModuleSyntax` (syntaxe que Node sait retirer, imports de types explicites). `pnpm typecheck` devient `tsc --noEmit && tsc -p tsconfig.p0.json --noEmit`.
- Les fichiers JSON sont lus par `node:fs` dans `scripts/p0/`, jamais importés.
- `vitest.config.mts` inclut `scripts/**/*.test.ts` si P0a1 y place des tests.
- Preuve que la commande tourne : un test lance `pnpm p0 --brief edimbourg-1` dans un sous-processus, avec un environnement sans variable de clé. Il vérifie le code de sortie et la présence du programme réduit et du rapport. Il fait partie de `pnpm verify`.

**Faisabilité à prouver par la PR de P0a1** (non prouvée ici) :
- `package.json` n'a pas de champ `"type"` (vérifié le 2026-10-12) : la PR montre que Node détecte les fichiers `.ts` comme modules ES (détection de syntaxe) sans erreur ni changement de `package.json` ;
- l'avertissement expérimental du retrait des types, s'il apparaît, est noté dans la PR. Il peut être tu par `--disable-warning=ExperimentalWarning`, et par rien d'autre ;
- `src/contracts` passe `tsc -p tsconfig.p0.json --noEmit` avec `erasableSyntaxOnly` et `verbatimModuleSyntax` (aucun `enum`, aucun `namespace`, imports de types marqués `type`). `src/contracts` ne se modifie pas dans P0 : en cas d'échec, c'est le repli `jiti` ;
- `registerHooks` existe sur la version de Node de la CI.

#### Écart à la spécification : `node:module` dans `enregistrer.mjs`
La spécification (test `p0: aucun client réel ni accès réseau dans le code de P0a1`) refuse `module` dans le dossier du script et n'admet que `node:net` dans `ip-guard.ts`. `enregistrer.mjs` importe `node:module`. **C'est un assouplissement**, déclaré ici comme écart.

Justification. Node sait retirer les types, mais pas résoudre ce que le code du dépôt écrit :
- les alias `@/` (convention du dépôt, `tsconfig.json`, `paths`) ;
- les imports relatifs sans extension de `src/contracts` (`./index`, `./values`…), que P0 ne peut pas modifier.

Variantes étudiées sans point d'accroche :
1. **Imports relatifs avec extension `.ts`** et `allowImportingTsExtensions` : possible pour le code neuf, mais `src/contracts` resterait sans extension. Refusée : elle oblige à modifier les contrats.
2. **Alias par le champ `imports` de `package.json`** (`#src/*`, résolu nativement par Node, TypeScript et Next.js) : règle l'alias, pas les imports sans extension de `src/contracts`. Elle change aussi la convention `@/` du dépôt pour une partie du code seulement. Refusée.
3. **Compiler avant d'exécuter** (`tsc` vers un dossier temporaire) : `tsc` ne réécrit ni les alias ni les extensions. Refusée.
4. **`jiti`** : pas de point d'accroche de Node, mais il charge, transforme et évalue lui-même tout le code du processus. Surface plus grande qu'un `resolve` de quelques lignes. Gardée comme repli.
5. **`tsx`** : refusé (`esbuild`, script d'installation).

**Retenu : un point d'accroche `resolve` minimal**, parce qu'il est la seule variante sans dépendance qui laisse `src/contracts` intact, et la plus petite surface. Il s'applique à tous les modules du processus, mais ce processus n'exécute que `pnpm p0` : aucun autre programme ne charge `enregistrer.mjs` (ni Next.js, ni Vitest, ni l'application ; test statique sur `package.json`, `next.config.ts` et `vitest.config.mts`).

Forme imposée :
- un seul import, `import { registerHooks } from "node:module"` ; aucun autre module, ni `node:fs`, ni `process`, ni `fetch` ;
- un seul appel `registerHooks({ resolve })` ; **pas de `load`**, pas d'`initialize`, pas de `module.register` ;
- `resolve` ne touche qu'aux spécificateurs `@/…` et aux spécificateurs relatifs **dont le module parent est sous `src/` ou `scripts/p0/`**. Il traduit `@/x` vers l'URL de `src/x` (calculée par `new URL(…, import.meta.url)`, sans import), puis essaie, par `nextResolve`, le chemin tel quel, puis `.ts`, puis `/index.ts`. Une URL obtenue hors de `src/` ou `scripts/p0/` est refusée par une erreur. Tout autre spécificateur passe à `nextResolve` sans changement ;
- aucun accès au réseau, au système de fichiers ni à l'environnement.

Gel : le test `p0: enregistrer.mjs est figé` compare l'empreinte SHA-256 du fichier à une constante écrite dans le test, et vérifie par l'arbre syntaxique la forme ci-dessus (un import, un appel, aucun `load`). Changer le fichier oblige à changer la constante, ce qui se voit dans la PR et exige une nouvelle revue Sécurité.

**Revue Sécurité demandée** : la PR de P0a1 la demande sur `enregistrer.mjs` et son test, en plus de la revue de la garde SSRF.

**Repli, seulement si P0a1 montre que le support natif ne suffit pas** (par exemple une syntaxe de `src/contracts` que Node ne sait pas retirer : `src/contracts` ne se modifie pas dans P0) : `jiti` 2.7.0 en devDependency. Il est déjà dans le lockfile par transitivité. Licence MIT, aucune dépendance, aucun script d'installation, publié le 2026-05-05. La PR de P0a1 justifie le repli. `tsx` est refusé : il dépend d'`esbuild`, qui exige un script d'installation.

### A3.5 Sorties et garde de CI
- `.gitignore` : `prototype/sorties/`.
- `ci.yml` (propriétaire P0a1) : une étape `ci: aucune sortie suivie par git` échoue si `git ls-files prototype/sorties` renvoie quoi que ce soit.
- `prototype/fixtures/` et `prototype/programmes-test/` ne contiennent que des valeurs sentinelles. Ce sont les seuls dossiers exemptés par la future garde « motifs `placeId` et coordonnées » de la spécification suivante.

## A2 — Configuration commitée

**Retenu : un fichier JSON par sujet dans `prototype/config/`, validé par un schéma Zod strict de `src/prototype/config.ts`.** Le script les lit par `node:fs`, les valide, puis injecte les valeurs. Aucun identifiant de modèle, aucun hôte, aucune URL ni aucun nom de variable d'environnement n'est écrit en dur dans le code.

| Fichier | Contenu | Contraintes du schéma |
|---|---|---|
| `modeles.json` | `etapes` : `recherche`, `notation`, `raisons` (identifiants OpenRouter de la variante B). `variantes.a` : **seulement** `notation` (variante A). `routage` : `data_collection`, et `zdr` facultatif. | `.strict()` à chaque niveau. `variantes.a` n'accepte que la clé `notation` : la variante A ne peut changer que le modèle de notation, et c'est garanti par la forme. `data_collection` est `z.literal("deny")`. Identifiant de modèle : `^[a-z0-9-]+/[a-z0-9._:-]+$`, 100 caractères au plus. Valeurs de Samuel (0027) : `deepseek/deepseek-v4.1-flash`, `perplexity/pplx-decider-v1.1-27b`, `deepseek/deepseek-v4.1-flash` ; variante A : `deepseek/deepseek-v4.1-flash`. |
| `recherche.json` | Bornes de l'agent : cibles de candidats **trouvés** par type de créneau (`activity`, `meal`, `evening`), total de candidats visé, taille des lots de notation, nombre maximal de tours de l'agent. | Entiers positifs bornés. Le total visé reste sous le plafond `candidatsTrouves` de `plafonds.json` (contrôle croisé au chargement). |
| `classement.json` | Formule de classement proposée par ia-recherche : poids des notes, traitement de `matchesWishes` à « non », priorité des `mustSee`, poids du coût de trajet par type d'étape. | Nombres finis et bornés, énumérations fermées, **aucune chaîne libre**. La formule est appliquée par `src/domain`, jamais écrite dans un prompt. |
| `plafonds.json` | Un plafond par compteur de la spécification : `coutUsd`, `recherchesWeb`, `pagesLues`, `candidatsTrouves`, `placesTextSearch`, `placesDetails`, `routesRequetes`, `routesElements`, `dureeMs`. | Valeurs du fichier choisies par ia-recherche, provisoires. Bornes du schéma : garde-fous **provisoires et non décisionnels** du mode simulé, posés par le Tech Lead (détail sous le tableau). |

Bornes du schéma de `plafonds.json`. Elles sont **provisoires et non décisionnelles** : elles empêchent une valeur absurde dans le mode simulé et ne fixent aucun plafond d'exécution réelle. Les plafonds définitifs sont fixés par la spécification suivante (0030 § 3), qui tient compte de la réponse de Samuel à Q256 (P0-Q14, 2026-10-12, QUESTIONS.md) : le quota de 100 requêtes par jour de Q252 s'entend **par méthode** (Text Search et Place Details comptés séparément). Elles sont revues à ce moment-là.
- `coutUsd` : nombre fini, > 0 et ≤ 3. Le chiffre de 3 USD est une **proposition du studio** (P0-Q2), non citée par Samuel (0027 § 2) ; P0-Q18 lui est posée. Il n'est pas attribué à Samuel.
- `placesTextSearch`, `placesDetails`, `routesRequetes` : **requêtes par exécution**, entiers > 0 et ≤ 100 chacun. Une exécution ne peut donc pas dépasser à elle seule le quota journalier d'une méthode. Ce n'est pas le quota journalier : la somme des exécutions d'une journée, marge et ancrage des logements compris, relève de la spécification suivante.
- `routesElements` : **éléments de matrice**, compteur distinct des requêtes, entier > 0 et ≤ 5 000. La valeur du fichier est choisie par P0a1 de sorte qu'un séjour de 7 jours passe en mode simulé (test). Savoir si la console Google compte les éléments ou les requêtes de Routes relève de la spécification suivante.
- `recherchesWeb`, `pagesLues`, `candidatsTrouves`, `dureeMs` : entiers > 0, bornés par le schéma à des valeurs choisies par P0a1 et notées dans sa PR.

Relever une borne du schéma demande un amendement écrit de cette décision. Changer une valeur sous la borne relève d'ia-recherche.

Règles communes :
- Chaque fichier porte un champ `schema: 1`. Le rapport note la version des fichiers et les identifiants de modèle effectifs.
- **Aucun champ ne peut ouvrir un chemin réel.** Les schémas sont stricts : une clé inconnue (`mode`, `reel`, `host`, `url`…) fait refuser le fichier. Test `p0: aucun champ de configuration ne peut ouvrir un chemin réel`.
- Le client de modèles vérifie `data_collection: "deny"` **avant chaque requête**, en plus du schéma. C'est une défense en profondeur, pas un doublon : la requête construite est contrôlée, pas seulement le fichier.
- La variante est choisie par `--variante a|b` (défaut `b`). Le script applique `variantes.a` sur `etapes` : aucune branche de code propre à la variante A.
- **L'adaptateur `prototype` ne lit aucune configuration dans P0b1.** Il n'a rien à plafonner (relecteur simulé seulement) ; le paramètre `plafonds` de `createPrototypeAdapter` est absent. La lecture des plafonds de relecture par l'application arrive avec le relecteur réel (spécification suivante). `src/prototype/config.ts` reste importable par l'application pour ce moment-là.

## A7 — Extraction du HTML, plages d'adresses, proxy de sortie

### A7.1 Plages d'adresses : `net.BlockList`, aucune bibliothèque
- `ip-guard.ts` construit, au chargement du module, une `BlockList` des plages interdites de la spécification (IPv4 et IPv6), et une seconde `BlockList` d'**autorisation** IPv6 réduite à `2000::/3`.
- Une adresse IPv6 est acceptée seulement si elle est dans la liste d'autorisation **et** hors de la liste des plages interdites.
- `isIP` sert à classer l'adresse et à refuser une IP littérale dans l'URL. Les formes décimale, octale et hexadécimale sont refusées avant, par la normalisation de l'hôte (classe `URL` de WHATWG, globale, sans import).
- Aucune comparaison de chaînes écrite à la main, aucune bibliothèque de CIDR. Un test par plage.

### A7.2 Parseur HTML : contraintes, et choix retenu
Contraintes pour toute dépendance que P0a1 ajoute (spécification, « Dépendances nouvelles ») :
1. **Version exacte** dans `package.json` (ni `^` ni `~`), installée par `pnpm install --frozen-lockfile` en CI.
2. Version **publiée depuis au moins 2 semaines** à la date de la PR. Date vérifiée sur le registre et notée dans la PR.
3. **Licence permissive** : MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause ou ISC, pour le paquet et chacune de ses dépendances de production. Licences notées dans la PR.
4. **Aucun script d'installation** (`preinstall`, `install`, `postinstall`) dans le paquet ni dans ses dépendances. **Aucun ajout** à `pnpm.onlyBuiltDependencies`.
5. `pnpm audit` sans vulnérabilité haute ni critique.
6. Le parseur **n'exécute aucun script** et ne charge aucune ressource : ni réseau, ni fichier, ni `eval`. C'est un analyseur pur, qui reçoit une chaîne et rend un arbre ou du texte.
7. Importé **seulement** par `src/research/extract-text.ts` (A3.2). Ce module rend du texte brut borné. Le contenu reste une donnée, jamais une instruction.
8. Revue Sécurité de la PR.

**Retenu : `parse5` 8.0.1**, en `dependencies` (code de `src/research`, futur B8). Vérifié sur le registre le 2026-10-12 :
- publié le 2026-04-19, licence MIT ;
- une seule dépendance, `entities` 8.1.0 (BSD-2-Clause) ;
- aucun script d'installation dans l'un ni l'autre ;
- les deux paquets sont déjà dans le lockfile par `jsdom`, donc aucun paquet nouveau dans l'arbre ;
- analyseur conforme à la norme HTML, sans DOM vivant ni exécution de script.

Le test de liste d'autorisation (A3.2) nomme le paquet : `parse5`, dans `src/research/extract-text.ts` seulement. La PR de P0a1 revérifie les conditions 2 à 5 à sa date. Un autre parseur demande un amendement de cette décision, aux mêmes conditions.

Aucune autre dépendance n'est prévue dans P0a1. `jiti` (repli de A3.4) suit les mêmes conditions.

### A7.3 Proxy de sortie
- `fetch-page.ts` **ne lit aucune variable d'environnement** : la règle d'import lui interdit `process.env`. Les variables de proxy (`HTTPS_PROXY`, `HTTP_PROXY`, `NO_PROXY`, `ALL_PROXY`) sont donc ignorées par construction. La connexion est demandée à la couche HTTP injectée, vers l'adresse vérifiée, avec le nom d'hôte pour TLS et SNI.
- La raison fermée `pages_refused: proxy_required` existe dès P0a1 dans l'énumération, testée avec un double. Le choix de l'activer relève de la spécification suivante.
- **Point signalé** : les sessions de routine du studio sortent par un proxy (`HTTPS_PROXY`). Avec la règle de la spécification, la lecture des pages y sera désactivée tant qu'aucune décision du Tech Lead, revue par la Sécurité, n'établit que ce proxy refuse lui-même les plages interdites. Cette décision n'est **pas** prise ici.

## A4 — Adaptateur `prototype`, contexte, liste blanche

### A4.1 Noms
| Élément | Nom | Emplacement |
|---|---|---|
| Valeur de l'adaptateur | `DATA_ADAPTER=prototype` | `getTripAdapter`, `src/adapters/index.ts` ; message d'erreur « valeurs : mock, api, prototype » |
| Garde de liste blanche | `prototypeAdapterAllowed(env = process.env): boolean` | `src/dev/flags.ts`, à côté d'`isProductionDeployment` |
| Drapeau de CI | `VADROUILLE_PROTOTYPE=1`, pris en compte seulement si `CI` vaut exactement `true` | — |
| Dossier des programmes | `VADROUILLE_PROTOTYPE_DIR` : chemin **absolu et canonique**, lu une fois au démarrage | `docs/deploiement/variables-environnement.md` (P0b1) |
| Adaptateur | `createPrototypeAdapter({ programmes, relecteurs })` | `src/adapters/prototype.ts` |
| Chargeur | `createProgrammeLoader({ dossier, fs })` (`fs` injectable pour les tests) | `src/adapters/prototype-loader.ts` |
| Relecteur simulé | durées sentinelles, refus simulé « quota atteint », compteur d'appels | `src/mocks/prototype-relecteur.ts` (règle F1 : importé par `src/adapters` et les tests seulement) |
| Organisation | `PROTOTYPE_ORG_ID = "org_prototype"` | `src/prototype/programme-reduit.ts`, importé par l'adaptateur et le contexte |
| Contexte | branche `prototype` de `getRequestContext()` | `src/adapters/context.ts` |
| Programme de test | `prototype/programmes-test/proto_test_20261012_1.json` | fabriqué à la main, valeurs sentinelles |

### A4.2 Règle de la liste blanche (stricte, sans normalisation)
`prototypeAdapterAllowed(env)` est vraie seulement si **toutes** les conditions suivantes sont vraies :
1. `isProductionDeployment(env)` est fausse. Elle est évaluée en premier et l'emporte toujours.
2. Ni `VADROUILLE_ENV` ni `VERCEL_ENV`, après `trim().toLowerCase()`, ne vaut `production`. Cela ferme `Production` ou ` production`, qu'`isProductionDeployment` ne reconnaît pas.
3. `VADROUILLE_ENV` est absente, ou vaut exactement `local` ou `ci`. Toute autre valeur ferme (B3 pourra élargir par amendement).
4. Et l'un des trois cas de la spécification, comparé **exactement** :
   - `VERCEL_ENV` vaut `preview` ou `development` ;
   - `VERCEL_ENV` est absente et `NODE_ENV` vaut `development` ou `test` ;
   - `VERCEL_ENV` est absente, `VADROUILLE_PROTOTYPE` vaut `1` et `CI` vaut `true`.

Toute autre combinaison ferme. Les conditions 2 et 3 sont plus strictes que la spécification : elles ne font que fermer.

**Signatures.** Aujourd'hui, `getTripAdapter(value = process.env.DATA_ADAPTER)` et `getRequestContext(value = process.env.DATA_ADAPTER)` ne prennent que la valeur de l'adaptateur. P0b1 leur ajoute un second paramètre facultatif : `getTripAdapter(value = process.env.DATA_ADAPTER, env = process.env)`, de même pour `getRequestContext`. `env` est passé à `prototypeAdapterAllowed(env)`. Les appelants actuels (pages, chargeurs de `src/features`, `src/server/actions`) gardent la valeur par défaut ; les tests passent `env` explicitement. Appelants et tests suivent dans la même PR.

`getTripAdapter("prototype")` et `getRequestContext()` en mode prototype **lèvent une erreur** quand la garde est fausse. Jamais de repli silencieux vers `mock`. Le relecteur simulé et son compteur ne sont atteignables que si la garde est vraie.

### A4.3 Dossier des programmes
- Pas de valeur par défaut. `VADROUILLE_PROTOTYPE_DIR` absente ou vide : la section « Prototype » est absente, sans erreur. Le développeur la pose dans `.env.local`, l'e2e dans la configuration de Playwright.
- Le chemin est donné par l'opérateur, jamais par une requête. Le chargeur applique les contrôles de la spécification (`realpath` égal au chemin donné, `lstat`, `O_NOFOLLOW | O_NONBLOCK`, `fstat`, 2 Mo lus au plus, index en mémoire, `TRIP_ID_PATTERN` avant tout accès).
- Une variable plutôt qu'un chemin relatif fixe : le serveur autonome tourne dans `.next/standalone` (`scripts/serve-standalone.mjs`), où un chemin relatif au dossier courant ne trouverait pas le programme de test.
- A5 (spécification suivante) dira si la même variable sert aux programmes réels.

### A4.4 Job `docker` : forme attendue
L'image pose `VADROUILLE_ENV=production`. Deux lancements de plus :
- `-e DATA_ADAPTER=prototype` ;
- `-e DATA_ADAPTER=prototype -e VADROUILLE_PROTOTYPE=1 -e CI=true`.

Pour chacun, `GET /` doit renvoyer le statut **500** (erreur explicite de la garde), et le corps ne doit contenir ni le titre « Prototype » ni la chaîne `proto_`. L'image ne contient d'ailleurs aucun dossier de programmes.

Ce 500 suppose que la page ne commence pas un flux avec le statut 200 avant de lever l'erreur. P0b1 le **prouve sur l'image** : `test "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:<port>/)" = "500"`. L'attente de démarrage de ces conteneurs ne peut pas reprendre la boucle actuelle de `ci.yml` (`curl -fsS` sur `/`, qui échoue sur un 500) : elle attend un code HTTP quelconque, autre que `000`. Si l'image renvoie 200 avec un corps d'erreur, P0b1 ne change pas le test : il le signale dans sa PR et le Tech Lead amende cette décision.

## A6 — Relecture, aucun cache, rendu dynamique, lecture de `DATA_ADAPTER`

### A6.1 Relecture côté serveur
Les relectures (matrice de Routes entre `placeId`, une requête par journée affichée) sont faites **côté serveur**, par l'adaptateur appelé dans les composants serveur. Le navigateur ne reçoit que le résultat validé par les contrats. La clé navigateur reste limitée à Maps JavaScript (F4). Dans P0b1, seul le relecteur simulé existe.

### A6.2 Rendu dynamique : rien à ajouter, à garder
Dans `main` (vérifié le 2026-10-12), **tous** les fichiers `page.tsx` et `route.ts` de `src/app` exportent déjà, sans condition, `export const dynamic = "force-dynamic"` : l'accueil, la Présentation, le groupe `(programme)` et sa Journée, « Mes voyages », `debloquer` et ses sous-routes, `src/app/dev/carte/page.tsx` (qui appelle `getTripAdapter`) et les autres pages et routes de `src/app/dev/`. Parmi les `layout.tsx`, seuls deux ne l'exportent pas : `src/app/layout.tsx` et `src/app/voyages/layout.tsx`. Aucun des deux ne lit de données (ni `@/adapters`, ni chargeur de `src/features`).

Le mode `mock` rend donc déjà dynamique tout ce que l'adaptateur peut servir. **Aucun mécanisme conditionnel n'est ajouté**, et le manifeste de build du mode `mock` ne change pas par construction.

P0b1 :
- ne retire ni n'affaiblit ces exports ;
- n'ajoute aucune route au prototype sans le même export ;
- n'active ni `cacheComponents` ni le prérendu partiel dans `next.config.ts`.

Tests :
- test statique sur l'arbre `src/app/**` (pas une liste écrite à la main) : chaque `page.tsx` et chaque `route.ts` exporte `dynamic = "force-dynamic"` ; chaque `layout.tsx` aussi, sauf les deux cités, pour lesquels le test vérifie qu'ils n'importent ni `@/adapters` ni un chargeur de `src/features`. Une nouvelle page sans l'export fait échouer le test ;
- test du manifeste de build : ces routes ne sont pas prérendues ; le manifeste du mode `mock` est identique avant et après P0b1.

### A6.3 `DATA_ADAPTER` est lu à la requête : un seul build
`DATA_ADAPTER` n'a pas de préfixe `NEXT_PUBLIC_` : Next.js ne l'insère pas dans le build. `getTripAdapter` le lit dans `process.env` à chaque appel, sur des routes dynamiques. Donc :
- **un seul build**, testé dans les deux modes ;
- l'e2e du prototype lance un second serveur sur le même build, avec `DATA_ADAPTER=prototype`, `VADROUILLE_PROTOTYPE=1`, `CI=true`, `VADROUILLE_PROTOTYPE_DIR` et `VADROUILLE_DEV_PAGES=1` (sans ce dernier, `/dev/api/prototype/relectures` répond 404 sur le build de production, A6.6 ; `playwright.config.ts` le pose déjà pour le serveur existant). Projet Playwright et port distincts, forme fixée par P0b1 ;
- l'image Docker est construite une fois. Le mode prototype y est refusé par la garde (A4.4).

### A6.4 En-têtes
Pour une route dynamique, Next.js envoie par défaut `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`. L'en-tête porte `private` et `no-store`, sans `public`, `s-maxage` ni `stale-while-revalidate` : il remplit l'exigence `private, no-store`. Aucun réglage n'est ajouté ; l'e2e sur le build de production le vérifie.

Si l'e2e montre un autre en-tête, P0b1 ajoute une règle `headers()` **sans condition** dans `next.config.ts` pour ces routes, et le signale dans sa PR. Aucun autre mécanisme sans amendement de cette décision.

### A6.5 Ce qui est interdit, et comment c'est testé
- Dans `src/adapters/prototype*.ts`, `src/mocks/prototype-relecteur.ts`, `src/prototype/**` et les fichiers de `src/app` couverts par A6.2 : aucun `unstable_cache`, `"use cache"`, `cacheLife`, `cacheTag`, `revalidate` positif (export ou option `next` de `fetch`). Recherche statique.
- Aucun cache de module qui garde une durée relue entre deux requêtes. La fonction `cache` de React, limitée à une requête, reste permise. L'index du chargeur (identifiant vers fichier) n'est pas un cache de données Google : il ne contient ni durée ni position, et le fichier est relu et revalidé à chaque lecture.
- `cache: "no-store"` sur chaque `fetch` vers Google : exigence du relecteur réel (spécification suivante). Dans P0b1, aucun `fetch` n'existe.

### A6.6 Compteur du relecteur simulé pour l'e2e
`GET /dev/api/prototype/relectures` renvoie `{ "relectures": n }`, avec `force-dynamic`. La route répond 404 sauf si `devPagesEnabled()` **et** `prototypeAdapterAllowed()` sont vraies. Elle suit le modèle de `src/app/dev/api/simulation/route.ts` et lit le compteur par une fonction exportée de `@/adapters` (jamais d'import de `src/mocks` depuis `src/app`, règle F1).

L'e2e « prototype sans cache » charge deux fois la Journée et vérifie que le compteur augmente de deux relectures.

## Conséquences
- P0a1 peut démarrer : A2, A3 et A7 sont fixées. P0b1 démarre après la fusion de P0a1 (ou de sa PR intermédiaire du schéma, décision 0030) : A4 et A6 sont fixées.
- Aucune dépendance n'est ajoutée par cette PR. P0a1 en ajoutera une seule (parseur HTML, A7.2), plus `jiti` seulement en repli (A3.4).
- Le handover back-end § 3 n'est pas modifié. La liste plus étroite de A3.2 s'applique pendant P0 ; P0r1 (#172) l'élargit.
- Écart à la spécification déclaré : `node:module` dans `scripts/p0/enregistrer.mjs` (A3.4), sous revue Sécurité dans la PR de P0a1. Écart plus strict : clients simulés soumis à la liste d'autorisation (A3.2).
- Les bornes de `plafonds.json` (A2) sont provisoires et non décisionnelles ; aucun plafond d'exécution réelle n'est fixé ici.
- Variables nouvelles à documenter par P0b1 dans `docs/deploiement/variables-environnement.md` : `VADROUILLE_PROTOTYPE`, `VADROUILLE_PROTOTYPE_DIR`. P0a1 n'en ajoute aucune.

## Amendements

### Amendement du 2026-10-13 — écarts acceptés en revue de P0a1 (#179 et #180)
Décision du **Tech Lead**, datée du **2026-10-13**, ticket #178. Elle consigne les écarts à cette décision et à la spécification P0 que la revue a acceptés pendant P0a1 : #179 (schéma et configuration, fusionnée au head `460a0b1`) et #180 (script en mode simulé, fusionnée au head `e1c9db6`). Les revues de #180 demandaient cet amendement en chore séparée (issuecomment-6124519111, mineur 7 de issuecomment-6127401145, mineur 8 de issuecomment-6130596687). Il ne change aucun code : il décrit ce qui est fusionné.

Décision déléguée, à lister dans la note de version suivante (rubrique « Décisions prises par le studio ») : définitive sans veto de Samuel dans les 2 jours qui suivent sa publication. Le délai ne repart pas pour le reste de 0032.

Seules sources retenues : les revues consolidées et les décisions publiées sur #179 et #180 par Samoulou (routines du studio). Un point n'est consigné que si une revue l'a dit accepté ou confirmé corrigé.

#### Écarts 1 à 8 de la description de #180
Acceptés tous les huit par le Tech Lead dans la revue du head `5c92cbe` (issuecomment-6124519111). Numérotation de la section « Écarts avec la maquette » de la description de #180.

1. **Garde « aucune sortie suivie » (amende A3.5).** Elle est un test Vitest, `tests/unit/p0/depot.test.ts` (`git ls-files prototype/sorties` vide, dossier ignoré par git), et non une étape de `ci.yml`. Le test tourne dans `pnpm test`, donc en CI. `.github/workflows/` n'est pas touché, et le libellé `owner-approved` (Q245) n'est pas requis. Une étape YAML, si elle est voulue un jour, passe par une PR à part avec `owner-approved` posé par Samuel.
2. **Clé `terminus` dans la forme réduite** (`[{ jour, depart, arrivee }]`, introduite par #179 et listée dans ses écarts). Elle relie chaque jour aux `placeId` du logement de départ et d'arrivée, ce qu'aucun champ de `Trip` ne fait. Elle ne contient que des `placeId`.
3. **`photoUrl` refusée dans une proposition réduite.** C'est plus strict que le contrat : le prototype ne recopie aucune photo Google.
4. **`ageSourceMaxJours` dans `recherche.json`** (1 095 jours, entier borné, aucune chaîne libre ; ajout au tableau de A2). Il sert à pénaliser une source ancienne. Son déplacement vers `classement.json` est une exigence d'entrée de la spécification de #173 (mineur 8 de issuecomment-6124519111).
5. **Test « clé Google en en-tête `X-Goog-Api-Key`, jamais dans l'URL » renvoyé à la spécification suivante.** P0a1 n'a aucun client Places réel. La partie « erreur de fournisseur contenant la clé, un `placeId` et une URL Places » est couverte. Ce renvoi figure dans les exigences d'entrée de #173 (mineur 6 de issuecomment-6127401145).
6. **Avertissement `MODULE_TYPELESS_PACKAGE_JSON` sur `pnpm p0` (précise A3.4, « Faisabilité »).** `package.json` reste sans champ `type` : pas de `"type": "module"`, question tranchée par la même revue. Node détecte la syntaxe ES sans erreur, mais émet cet avertissement. Il n'est pas tu : A3.4 n'autorise que `--disable-warning=ExperimentalWarning`, et cette règle ne change pas. Le test du sous-processus (`tests/unit/p0/cli.test.ts`) le tolère explicitement.
7. **Bornes du temps libre arrondies à 5 min**, et terminus de fin arrondi aux 5 min supérieures. Le programme ne recopie pas une durée de trajet à la minute près.
8. **User-Agent fixe et neutre, `PrototypeRecherche/1.0`** (constante de `src/research/fetch-page.ts`). Le nom du produit ne vit que dans `src/config/site.ts` (test existant), que `src/research` ne peut pas importer (A3.2).

#### Autres écarts acceptés en revue
9. **`placeId` et `source` facultatifs dans `StopReduitSchema`**, comme dans le contrat `Stop`. Le schéma ne distingue pas seul une étape de lieu (terminus, temps libre, repas ouvert). La règle R1 est appliquée par le validateur du moteur (`src/domain/validation.ts`), livré par #180. Dans le même point, `urlSourceValide` (`src/prototype/programme-reduit.ts`) admet encore `https://localhost` et une IP littérale. La lecture des pages reste gardée par `fetch-page.ts` et `ip-guard.ts`, et `tests/unit/p0/copies.test.ts` vérifie que le lecteur n'est jamais plus permissif que la validation de source. Source : mineur 4 de la revue du head `8a3466e` de #179 (issuecomment-6132737831), « accepté » dans la revue du head `460a0b1` (issuecomment-6133126440).
10. **Copies tenues égales par un test (amende A3.2, « Les types partagés […] ne sont définis qu'une fois »).** Trois définitions existent en plusieurs exemplaires, parce que les règles d'import de A3.2 interdisent de les partager :
    - la validation d'URL de source : `src/prototype/programme-reduit.ts`, `src/domain/validation.ts` et `analyserUrl` de `src/research/fetch-page.ts` ;
    - `PositionSchema` : `src/prototype/ancrage.ts` et `src/prototype/programme-reduit.ts` ;
    - `MODES_ROUTES` (`src/grounding/interfaces.ts`) et `MODES_DEPLACEMENT` (`src/prototype/brief.ts`).

    Le test à table `tests/unit/p0/copies.test.ts` les compare. Toute nouvelle copie de ce genre doit y entrer. Source : mineur 4 de issuecomment-6124519111 (head `5c92cbe`), correction confirmée dans la revue du head `e0074ab` (issuecomment-6127401145).
11. **`tests/unit/p0/cli.test.ts` importe `node:net`** (et `node:http`, `node:https`, `node:tls`, `node:dns`), alors que la spécification réserve `node:net` à `ip-guard.ts`. Ces imports ne servent qu'à `vi.spyOn`, pour prouver qu'aucune connexion n'est ouverte. Le fichier est hors des dossiers contrôlés par `imports.test.ts`, et l'exemption est documentée en tête du fichier. Aucun fichier de production ne peut importer un fichier de test (point 12). Source : mineur 8 de issuecomment-6124519111, correction confirmée dans issuecomment-6127401145.
12. **Règles plus strictes que A3.2 et A7.1**, ajoutées par les corrections de #180. Elles ne font que fermer.
    - **`node:fs` et `node:fs/promises` sont réservés à `scripts/p0/fichiers.ts`.** Cela amende la ligne `scripts/p0/**/*.ts` du tableau de A3.2. Pour les autres fichiers de `scripts/p0/`, les modules externes permis sont `zod`, `node:path` et `node:util`. Source : point 4 de la décision du CEO avec le Tech Lead (issuecomment-6132707686), confirmé dans la revue du head `49837e5` (issuecomment-6132952347).
    - **`process` est refusé partout**, alias compris. Seule exception : `scripts/p0/main.ts`, pour `process.argv`, `process.exitCode`, `process.stdout.write(…)` et `process.stderr.write(…)`, en accès littéral. A3.2 ne refusait que `process.env`. Sont aussi refusés partout : l'accès `x[expr]` non littéral, les noms calculés en déstructuration, le reste d'objet déstructuré et la réflexion sur les prototypes. Source : revue du head `2eecd59` (issuecomment-6130596687).
    - **Clés calculées** : seulement chaîne, nombre, et `Symbol.iterator`, `Symbol.asyncIterator`, `Symbol.toStringTag`, `Symbol.hasInstance` ; tout identifiant `Symbol` lié est refusé. **Un fichier non test ne peut pas importer un fichier de test.** **Sélection des fichiers fermée** : dans les six dossiers contrôlés, seuls sont admis les `.ts`, `scripts/p0/enregistrer.mjs` et les JSON de données (hors `package.json`, `tsconfig*.json`, `jsconfig*.json`) ; tout autre fichier fait échouer le test. Source : points 1 à 3 de issuecomment-6132707686, confirmés dans issuecomment-6132952347.
    - **Fichiers `*.test.ts` de `src/ai` et `src/research`** : ils refusent les modules réseau (`http`, `https`, `http2`, `tls`, `dgram`, `dns`, `child_process`, `worker_threads`, `undici`) et des constructions comme `fetch`, `getBuiltinModule`, `eval`, `Function` ou `import()`. A3.2 les excluait entièrement, hors règle `node:net`. Source : mineur 2 de issuecomment-6127401145, confirmé dans issuecomment-6130596687.
    - **Plages refusées par `ip-guard.ts` en plus de celles de la spécification** (A7.1) : `2001::/23` (couvre Teredo), `2001:30::/28` (DRIP, RFC 9374), AS112 IPv4 (`192.31.196.0/24`, `192.52.193.0/24`, `192.175.48.0/24`) et AS112 IPv6 (`2620:4f:8000::/48`), un cas de test chacune. Source : mineur 7 de issuecomment-6124519111 et mineur 4 de issuecomment-6127401145, confirmés dans issuecomment-6127401145 et issuecomment-6130596687.

#### Hors de cet amendement
- Les points de la revue du head `49837e5` de #180 (2 bloquants tardifs, mineurs 3 à 7) : ticket #195, exigence d'entrée du code de P0r1 (issuecomment-6132967090). Ce ne sont pas des écarts acceptés.
- Les mineurs 4 (régime des fichiers de test en liste d'autorisation) et 6 (`src/contracts` non contrôlé) de la revue du head `2eecd59` : renvoyés à P0c (#193) par issuecomment-6132707686.
- Les 7 exigences d'entrée de la spécification de #173 (description de #180) : le Tech Lead vérifie leur reprise à la revue de cette spécification.
- Les mineurs non bloquants restés ouverts sur #179 et #180 (commentaires, découpage d'un test, libellés de `src/domain/textes.ts`) : ce ne sont pas des écarts.

## Quand revoir cette décision
- À la spécification suivante : A1, A5, élargissement de A3.2, conduite face au proxy des routines (A7.3), plafonds définitifs (bornes de A2 revues selon Q256, quota par méthode).
- À la réponse de Samuel à P0-Q18 (plafond de coût par exécution) : borne `coutUsd` de A2.
- Si `enregistrer.mjs` doit changer (nouvelle empreinte, nouvelle revue Sécurité, A3.4).
- Si le support natif de TypeScript de Node ne suffit pas pour `pnpm p0` (repli de A3.4).
- Si une route servie par le prototype devait cesser d'être dynamique en mode `mock` (A6.2).
- À B3, pour aligner la garde de A4.2 sur `resolveServerEnvironment` (0006).
