# 0032 — Décisions du Tech Lead pour P0a1 et P0b1 : A2, A3, A4, A6 et A7

Statut : décision déléguée, à lister dans la note de version suivante (rubrique « Décisions prises par le studio ») ; définitive sans veto de Samuel dans les 2 jours qui suivent cette publication · Date : 2026-10-12 · Décideur : Tech Lead (architecture, bibliothèques, outillage, tests ; délégation « Qui décide quoi » de `docs/CONTEXT.md`) · Ticket #174 (T19)

Numérotation : 0029 est prise par #165, 0030 par #149, 0031 par #172. Aucune PR ouverte n'utilise 0032 (vérifié le 2026-10-12). 0032 est le prochain numéro libre.

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

**Principe « l'agent cherche, l'ancrage vérifie, le moteur planifie »** : c'est le découpage en dossiers de A3. La recherche vit dans `src/research` et `src/ai`, l'ancrage dans `src/grounding`, le moteur dans `src/domain`. Seul l'orchestrateur du script voit les trois. Les règles d'import empêchent un résultat d'ancrage d'atteindre un prompt.

**Règles Google** : inchangées. Les seules données Google gardées sont celles que Samuel a décidées (0027 § 4, 0028) : `placeId`, table `positions`, horaires planifiés. Dans ce périmètre, elles n'existent que sous forme de valeurs sentinelles.

## A3 — Emplacements, règles d'import, commande `pnpm p0`

### A3.1 Le code vit dans les dossiers de l'application
**Retenu : les dossiers du handover back-end § 3**, plus un petit dossier partagé `src/prototype/`. Pas de dossier isolé `scripts/p0/` pour le pipeline.

Raisons :
- Le handover § 8 demande que P0 alimente B7 et B8 « sans être recopié ». La spécification suivante (#172, décision D3) prévoit le même alignement.
- Les règles d'import par dossier séparent ce que voit chaque étape. C'est le principe technique 1 rendu vérifiable.
- `programme-reduit.ts` doit être importable par `src/adapters` : il ne peut pas vivre dans le dossier du script.

| Emplacement | Contenu |
|---|---|
| `src/prototype/` | Code **pur** partagé par le script et l'application. `programme-reduit.ts` : schéma strict de la forme réduite, type, constante `PROTOTYPE_ORG_ID = "org_prototype"`. `config.ts` : schémas Zod des fichiers de A2. `brief.ts` : schéma strict du brief (P0-PO-2). `reduction.ts` : passage du programme complet validé à la forme réduite. |
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
| `src/prototype/**` | `@/contracts`, `zod`, `@/prototype/*` (relatifs compris) |
| `src/domain/**` | `@/contracts`, `zod`, `@/domain/*`, `@/prototype/brief`, `@/prototype/config` |
| `src/ai/**` | `@/contracts`, `zod`, `@/ai/*`, `@/prototype/brief`, `@/prototype/config` |
| `src/research/**` | `@/contracts`, `zod`, `@/ai/*`, `@/research/*`, `@/prototype/brief`, `@/prototype/config`. En plus : `node:net` dans `ip-guard.ts` seulement, sous la seule forme `import { BlockList, isIP } from "node:net"` ; le parseur HTML de A7 dans `extract-text.ts` seulement. `ip-guard.ts` n'est importé que par `fetch-page.ts` (et par son test). |
| `src/grounding/**` | `@/contracts`, `zod`, `@/grounding/*`, `@/prototype/brief`, `@/prototype/config` |
| `scripts/p0/**/*.ts` | `@/contracts`, `zod`, `@/prototype/*`, `@/domain/*`, `@/ai/*`, `@/research/*`, `@/grounding/*`, fichiers de `scripts/p0/`, `node:fs`, `node:fs/promises`, `node:path`, `node:util` (pour `parseArgs`) |
| `scripts/p0/enregistrer.mjs` | `node:module` et `node:url` seulement. C'est le seul fichier `.mjs` du dossier. Le test fige son contenu (A3.4). |

Règles complémentaires :
- `src/ai` et `src/research` n'importent jamais `@/grounding`, ni rien de `scripts/`. Aucune donnée Google ne peut atteindre un prompt par un import.
- `src/prototype` n'importe rien d'autre que `@/contracts` et `zod` : `programme-reduit.ts` reste importable par l'application, sans rien tirer du script. Test dédié : le graphe transitif de `src/prototype/programme-reduit.ts` ne contient que des fichiers de `src/prototype`, de `src/contracts` et `zod`.
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
- `enregistrer.mjs` enregistre, par `module.register`, un seul point d'accroche `resolve`. Il traduit `@/` vers `src/` et résout les imports relatifs sans extension vers `.ts` ou `/index.ts`. Il ne fait rien d'autre : pas de `load`, pas de réseau, pas de lecture d'environnement.
- Fichier `tsconfig.p0.json` : il étend `tsconfig.json`, couvre `scripts/p0`, `src/prototype`, `src/domain`, `src/ai`, `src/research`, `src/grounding` et `src/contracts`, et active `erasableSyntaxOnly` et `verbatimModuleSyntax` (syntaxe que Node sait retirer, imports de types explicites). `pnpm typecheck` devient `tsc --noEmit && tsc -p tsconfig.p0.json --noEmit`.
- Les fichiers JSON sont lus par `node:fs` dans `scripts/p0/`, jamais importés.
- `vitest.config.mts` inclut `scripts/**/*.test.ts` si P0a1 y place des tests.
- Preuve que la commande tourne : un test lance `pnpm p0 --brief edimbourg-1` dans un sous-processus, avec un environnement sans variable de clé. Il vérifie le code de sortie et la présence du programme réduit et du rapport. Il fait partie de `pnpm verify`.

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
| `plafonds.json` | Un plafond par compteur de la spécification : `coutUsd`, `recherchesWeb`, `pagesLues`, `candidatsTrouves`, `placesTextSearch`, `placesDetails`, `routesRequetes`, `routesElements`, `dureeMs`. | Valeurs provisoires choisies par ia-recherche. Bornes dures du schéma, en garde-fou : `coutUsd` ≤ 3 (proposition P0-Q2), chaque compteur Google ≤ 100 (quota quotidien de Q252). Relever une borne demande une décision écrite. |

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

### A7.2 Parseur HTML : contraintes, et choix proposé
Contraintes pour toute dépendance que P0a1 ajoute (spécification, « Dépendances nouvelles ») :
1. **Version exacte** dans `package.json` (ni `^` ni `~`), installée par `pnpm install --frozen-lockfile` en CI.
2. Version **publiée depuis au moins 2 semaines** à la date de la PR. Date vérifiée sur le registre et notée dans la PR.
3. **Licence permissive** : MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause ou ISC, pour le paquet et chacune de ses dépendances de production. Licences notées dans la PR.
4. **Aucun script d'installation** (`preinstall`, `install`, `postinstall`) dans le paquet ni dans ses dépendances. **Aucun ajout** à `pnpm.onlyBuiltDependencies`.
5. `pnpm audit` sans vulnérabilité haute ni critique.
6. Le parseur **n'exécute aucun script** et ne charge aucune ressource : ni réseau, ni fichier, ni `eval`. C'est un analyseur pur, qui reçoit une chaîne et rend un arbre ou du texte.
7. Importé **seulement** par `src/research/extract-text.ts` (A3.2). Ce module rend du texte brut borné. Le contenu reste une donnée, jamais une instruction.
8. Revue Sécurité de la PR.

**Choix proposé : `parse5` 8.0.1**, en `dependencies` (code de `src/research`, futur B8). Vérifié sur le registre le 2026-10-12 :
- publié le 2026-04-19, licence MIT ;
- une seule dépendance, `entities` 8.1.0 (BSD-2-Clause) ;
- aucun script d'installation dans l'un ni l'autre ;
- les deux paquets sont déjà dans le lockfile par `jsdom`, donc aucun paquet nouveau dans l'arbre ;
- analyseur conforme à la norme HTML, sans DOM vivant ni exécution de script.

La PR de P0a1 confirme le nom et la version exacts. Un autre parseur reste possible, aux mêmes conditions, avec sa justification.

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

## A6 — Relecture, aucun cache, rendu dynamique, lecture de `DATA_ADAPTER`

### A6.1 Relecture côté serveur
Les relectures (matrice de Routes entre `placeId`, une requête par journée affichée) sont faites **côté serveur**, par l'adaptateur appelé dans les composants serveur. Le navigateur ne reçoit que le résultat validé par les contrats. La clé navigateur reste limitée à Maps JavaScript (F4). Dans P0b1, seul le relecteur simulé existe.

### A6.2 Rendu dynamique : rien à ajouter, à garder
Toutes les routes que sert l'adaptateur `prototype` exportent **déjà, sans condition**, `export const dynamic = "force-dynamic"` dans `main` :
- `src/app/page.tsx` ;
- `src/app/voyages/[id]/presentation/page.tsx` ;
- `src/app/voyages/[id]/(programme)/layout.tsx`, `page.tsx` et `jour/[n]/page.tsx` ;
- `src/app/voyages/page.tsx`.

Le mode `mock` les rend donc déjà dynamiques. **Aucun mécanisme conditionnel n'est ajouté**, et le manifeste de build du mode `mock` ne change pas par construction.

P0b1 :
- ne retire ni n'affaiblit ces exports ;
- n'ajoute aucune route au prototype sans le même export ;
- n'active ni `cacheComponents` ni le prérendu partiel dans `next.config.ts`.

Tests :
- recherche statique de l'export dans chacune de ces routes ;
- test du manifeste de build : ces routes ne sont pas prérendues ; le manifeste du mode `mock` est identique avant et après P0b1.

### A6.3 `DATA_ADAPTER` est lu à la requête : un seul build
`DATA_ADAPTER` n'a pas de préfixe `NEXT_PUBLIC_` : Next.js ne l'insère pas dans le build. `getTripAdapter` le lit dans `process.env` à chaque appel, sur des routes dynamiques. Donc :
- **un seul build**, testé dans les deux modes ;
- l'e2e du prototype lance un second serveur sur le même build, avec `DATA_ADAPTER=prototype`, `VADROUILLE_PROTOTYPE=1`, `CI=true` et `VADROUILLE_PROTOTYPE_DIR`. Projet Playwright et port distincts, forme fixée par P0b1 ;
- l'image Docker est construite une fois. Le mode prototype y est refusé par la garde (A4.4).

### A6.4 En-têtes
Pour une route dynamique, Next.js envoie par défaut `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`. L'en-tête porte `private` et `no-store`, sans `public`, `s-maxage` ni `stale-while-revalidate` : il remplit l'exigence `private, no-store`. Aucun réglage n'est ajouté ; l'e2e sur le build de production le vérifie.

Si l'e2e montre un autre en-tête, P0b1 ajoute une règle `headers()` **sans condition** dans `next.config.ts` pour ces routes, et le signale dans sa PR. Aucun autre mécanisme sans amendement de cette décision.

### A6.5 Ce qui est interdit, et comment c'est testé
- Dans `src/adapters/prototype*.ts`, `src/mocks/prototype-relecteur.ts`, `src/prototype/**` et les routes de A6.2 : aucun `unstable_cache`, `"use cache"`, `cacheLife`, `cacheTag`, `revalidate` positif (export ou option `next` de `fetch`). Recherche statique.
- Aucun cache de module qui garde une durée relue entre deux requêtes. La fonction `cache` de React, limitée à une requête, reste permise. L'index du chargeur (identifiant vers fichier) n'est pas un cache de données Google : il ne contient ni durée ni position, et le fichier est relu et revalidé à chaque lecture.
- `cache: "no-store"` sur chaque `fetch` vers Google : exigence du relecteur réel (spécification suivante). Dans P0b1, aucun `fetch` n'existe.

### A6.6 Compteur du relecteur simulé pour l'e2e
`GET /dev/api/prototype/relectures` renvoie `{ "relectures": n }`, avec `force-dynamic`. La route répond 404 sauf si `devPagesEnabled()` **et** `prototypeAdapterAllowed()` sont vraies. Elle suit le modèle de `src/app/dev/api/simulation/route.ts` et lit le compteur par une fonction exportée de `@/adapters` (jamais d'import de `src/mocks` depuis `src/app`, règle F1).

L'e2e « prototype sans cache » charge deux fois la Journée et vérifie que le compteur augmente de deux relectures.

## Conséquences
- P0a1 peut démarrer : A2, A3 et A7 sont fixées. P0b1 démarre après la fusion de P0a1 (ou de sa PR intermédiaire du schéma, décision 0030) : A4 et A6 sont fixées.
- Aucune dépendance n'est ajoutée par cette PR. P0a1 en ajoutera une seule (parseur HTML, A7.2), plus `jiti` seulement en repli (A3.4).
- Le handover back-end § 3 n'est pas modifié. La liste plus étroite de A3.2 s'applique pendant P0 ; P0r1 (#172) l'élargit.
- Variables nouvelles à documenter par P0b1 dans `docs/deploiement/variables-environnement.md` : `VADROUILLE_PROTOTYPE`, `VADROUILLE_PROTOTYPE_DIR`. P0a1 n'en ajoute aucune.

## Quand revoir cette décision
- À la spécification suivante : A1, A5, élargissement de A3.2, conduite face au proxy des routines (A7.3).
- Si le support natif de TypeScript de Node ne suffit pas pour `pnpm p0` (repli de A3.4).
- Si une route servie par le prototype devait cesser d'être dynamique en mode `mock` (A6.2).
- À B3, pour aligner la garde de A4.2 sur `resolveServerEnvironment` (0006).
