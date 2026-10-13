# 0049 — Décisions du Tech Lead pour P0r1 : D1 (client de modèles), D12 (client HTTP de la lecture des pages), règles de confinement et écarts de #272

Statut : décision déléguée (architecture, bibliothèques, outillage et tests : « Qui décide quoi » de `docs/CONTEXT.md`), à lister dans la note de version suivante (rubrique « Décisions prises par le studio ») ; définitive sans veto de Samuel dans les 2 jours qui suivent cette publication · Date : 2026-10-13 · Rédaction : Tech Lead (commit `[ceo]`) · Décideur : Tech Lead ; la section T consigne une décision du **CEO** (ordre des tâches), telle qu'il l'a donnée · Ticket #273 · Spécification `specs/P0-suite-executions-reelles.md` (#172, fusionnée), tableau « Décisions d'architecture attendues (Tech Lead) », lignes D1 et D12 · PR de code concernée : #272 (branche `claude/267-p0r1-clients-reels`, head `a2175d0`)

**Amende, sans les réécrire** :
- **0006** (tableau, ligne « `stripe`, SDK de modèles ») : versions de `ai`, `@openrouter/ai-sdk-provider` et `undici` (D1, D12) ;
- **0032** (§ « Règles d'import », phrase « P0r1 : `undici` dans `fetch-page.ts` ») : `undici` vit dans `src/research/undici-transport.ts` (D12) ;
- **0031 § 5** (liste des exceptions nominatives) : `node:zlib` retiré, `server-only` et `src/grounding/enveloppe-google.ts` ajoutés (C1, E1) ;
- **la spécification `specs/P0-suite-executions-reelles.md`** sur les points nommés en E1 à E4, sur lesquels cette décision prévaut.

Numérotation (vérifiée le 2026-10-13, de nouveau juste avant le commit) : `main` va de 0001 à 0045 ; 0046 est réservé par #266, 0047 par #269, 0048 par #274 (décisions B5, suite) ; aucune autre PR ouverte (#243, #256, #272) ni branche `claude/…` n'ajoute de fichier `0049`. Cette PR l'ajoute.

## Contexte
La spécification de P0r1 exige D1 et D12 écrites dans `docs/decisions/` avant la PR de code (« Prérequis de P0r1 », point 3). D13 (port de consommation) est tranchée par 0046 (#266, en revue). La PR de code #272 suit les propositions de la spécification pour D1 et D12, mais ne peut pas fusionner sans elles (description de #272, « Questions », Tech Lead). Elle change aussi des règles du régime de confinement (0038, 0040) et s'écarte de la spécification sur quatre points. Cette décision tranche D1 et D12, accepte ou refuse chaque changement de règle et chaque écart, et dit ce que #272 doit corriger.

**Argent, comptes, données hors UE** : rien de nouveau. Trois paquets libres (licences Apache-2.0 et MIT), aucun compte, aucun service. OpenRouter, intermédiaire hors UE, est déjà accepté par Samuel pour la phase 0 avec des briefs de test seulement (0026, P0-Q5) ; D1 n'y change rien.

**Principe « l'agent cherche, l'ancrage vérifie, le moteur planifie »** : respecté. D1 sert l'agent (`src/ai`), D12 la lecture des pages de l'agent (`src/research`) ; l'ancrage reste dans `src/grounding`, derrière ses propres clients ; aucun module de capacité ne franchit cette séparation (test d'imports de #149 et fermeture du régime).

**`CLAUDE.md` et 0002** : l'AI SDK (`ai`) est une bibliothèque libre éditée par Vercel, pas un stockage ni une API propres à Vercel. L'AI Gateway de Vercel (`@ai-sdk/gateway`, tiré par `ai`), qui en serait une, n'est jamais empruntée (D1, point 4).

**Hors de cette décision** : D13 (0046) ; le mineur 3 de la revue du head `335d925` (clés `ca`, `key`, `cert` trop génériques, `dispatcher` dans `undici-transport.ts`), tranché par le Tech Lead dans la revue de #272 ; les verdicts Sécurité (C5) ; le coût de Place Details au quota plein (42 USD par mois, au-dessus du plafond de 20 USD de 0027 § 2), question pour Samuel avant P0r3 (description de #272).

## Versions vérifiées
Relevé du Tech Lead le 2026-10-13 sur le registre npm (`npm view <paquet>@<version> time license engines peerDependencies`), identique au `package.json` et au lockfile de #272 :

| Paquet | Version exacte | Publication | Licence | Node | Dépendances de pair |
|---|---|---|---|---|---|
| `ai` | 7.0.122 | 2026-09-28 | Apache-2.0 | ≥ 22 | `zod` ^3.25.76 ou ^4.1.8 (dépôt : 4.6.5) |
| `@openrouter/ai-sdk-provider` | 3.1.0 | 2026-09-19 | Apache-2.0 | ≥ 22 | `ai` ^7.0.0, `zod` (idem) |
| `undici` | 8.11.2 | 2026-09-24 | MIT | ≥ 22.19.0 (`engines` du dépôt : ≥ 22.19.0) | aucune |

Chacun est publié depuis au moins deux semaines au 2026-10-13. Les paquets transitifs ajoutés à l'arbre (dont `@ai-sdk/gateway` 4.0.100, `@ai-sdk/provider` 4.0.19, `@ai-sdk/provider-utils` 5.0.51, `@vercel/oidc` 3.2.0 et une seconde copie d'`undici`, 7.30.0, tirée par `@ai-sdk/provider-utils`) sont listés dans la description de #272 ; leur examen (scripts d'installation, provenance, lockfile) relève du verdict Sécurité (C5).

## D1 — Client de modèles : AI SDK et fournisseur OpenRouter, retenus
**Retenu** : `ai` 7.0.122 et `@openrouter/ai-sdk-provider` 3.1.0, en version exacte dans `dependencies`, confinés au seul module de capacité `src/ai/openrouter-client.ts`.

Options étudiées :
- **Appel direct de l'API d'OpenRouter par `fetch`, sans SDK** : aucune dépendance et aucun chemin vers l'AI Gateway, mais contraire à la consigne de Samuel citée par 0026 (« via l'AI SDK, pour pouvoir changer de modèle par configuration »). Écartée.
- **AI SDK avec `@ai-sdk/openai-compatible`** (fournisseur officiel générique) : les options de routage d'OpenRouter (`provider.data_collection`) et le coût réel de la réponse ne passent que par des champs libres, sans types. Écartée.
- **AI SDK avec `@openrouter/ai-sdk-provider`** (fournisseur communautaire publié par OpenRouter) : options de routage typées, coût réel dans `providerMetadata` (utilisé pour confirmer la réservation, 0046 D13), `fetch` injectable. **Retenue**, comme le proposait la spécification.

Règles (celles de la spécification, « Clients réels », confirmées ; le code de #272 les tient) :
1. **Formes d'import exactes** : `import { generateText } from "ai";` et `import { createOpenRouter } from "@openrouter/ai-sdk-provider";`, dans `openrouter-client.ts` seulement. Aucun autre membre (`streamText`, `generateObject`, `gateway`…) et aucun import de `@ai-sdk/*` dans `src/ai`, `src/research` et `src/grounding` ; le resserrement du tableau de `docs/handovers/backend.md` § 3 par #272 (retrait de `@ai-sdk/*` de la ligne `src/ai`) est accepté. Ajouter un membre demande de modifier l'exception nominative du test d'imports, donc une revue Tech Lead et un verdict Sécurité.
2. **Fournisseur explicite** : une seule instance par `createOpenRouter({ apiKey, baseURL, fetch: enveloppe })`, clé passée par le client (lue par `@/server/env/ai`), `baseURL` figée, `fetch` égal à l'enveloppe.
3. **Par appel** : objet modèle (jamais une chaîne), `provider: { data_collection: "deny" }`, `maxRetries: 0`, `experimental_telemetry: { isEnabled: false }`.
4. **AI Gateway jamais empruntée** : le modèle est toujours un objet issu de l'instance explicite (l'AI SDK ne résout par la passerelle qu'un identifiant en chaîne ou un fournisseur global par défaut) ; l'hôte `ai-gateway.vercel.sh` et les noms `AI_GATEWAY_API_KEY` et `VERCEL_OIDC_TOKEN` sont refusés partout par le régime (`refus.json`) ; `globalThis` est refusé dans `src/ai` (test de #149), ce qui ferme `AI_SDK_DEFAULT_PROVIDER`. Voir aussi E3.
5. **Montée de version** : une PR dédiée, avec provenance, version publiée depuis deux semaines au moins, `pnpm audit`, verdict Sécurité sur le lockfile, et une ligne ajoutée à l'amendement de 0006.

## D12 — Client HTTP de la lecture des pages : `undici`, retenu ; amende 0032
**Retenu** : `undici` 8.11.2, en version exacte dans `dependencies`, confiné au seul module de capacité `src/research/undici-transport.ts`, injecté dans `fetch-page.ts` par `createUndiciTransport`.

**Amendement de 0032** : la phrase de 0032 (« Règles d'import ») « La spécification suivante l'élargit (P0r1 : `undici` dans `fetch-page.ts`, … » est remplacée par : « P0r1 : `undici` et `node:dns/promises` dans `src/research/undici-transport.ts` seulement, jamais dans `fetch-page.ts` ». `fetch-page.ts` garde toute la garde (validation des URL, redirections, limites, décompression, E1) et n'importe aucun module à capacité ; le test négatif de #272 (`undici` importé dans `fetch-page.ts` : refus) le vérifie.

Options étudiées :
- **`fetch` global** : ne permet pas d'épingler l'adresse vérifiée par la garde (seconde résolution possible, rebinding DNS). Écartée, comme dans 0032.
- **`node:https` (`request` avec l'option `lookup`)** : possible, mais flux de réponse et annulation à réécrire à la main, et deux modules de Node à admettre (`node:https`, `node:tls`) au lieu d'un paquet. Écartée.
- **`undici`, `Agent` avec `connect.lookup` épinglé** : corps en flux (`AsyncIterable`), annulation par `AbortSignal`, épinglage et SNI par deux options d'un objet littéral. **Retenue**.

Règles (spécification, « Lecture des pages », confirmées ; le code de #272 les tient) :
1. **Forme d'import exacte** : `import { Agent } from "undici";` seulement ; requêtes par `agent.request`. Refusés dans `src/research` : `fetch` d'`undici`, `EnvHttpProxyAgent`, `ProxyAgent`, `setGlobalDispatcher`, `getGlobalDispatcher` (ajoutés aux identifiants interdits par #272 : accepté).
2. **Un `Agent` par saut**, options en objet littéral sans étalement, `connect` aux seules clés `lookup` et `servername` ; `lookup` rend l'adresse déjà vérifiée par la garde, refuse tout autre nom d'hôte et n'appelle jamais `node:dns` ; `Agent` détruit à la fin du saut, succès ou échec.
3. **Résolveur réel** : `lookup` de `node:dns/promises` avec `all: true`, dans le même fichier ; la garde vérifie toutes les adresses.
4. **En-têtes sortants** : `user-agent`, `accept` et `accept-encoding` seulement (aucun cookie, `Authorization` ni clé).
5. La copie d'`undici` 7.30.0 tirée par `@ai-sdk/provider-utils` n'est importée par aucun fichier du dépôt ; le spécificateur `undici` se résout vers la dépendance directe 8.11.2.
6. **Montée de version** : même règle que D1, point 5. Une montée de version majeure d'`undici` exige en plus le test de contrat de E4.

## C — Règles de confinement changées par #272

### C1 — Exceptions nominatives fichier par fichier : acceptées ; amende 0031 § 5
Le test d'imports de #149 garde sa liste d'autorisation et reçoit, dans #272, une table d'exceptions fichier par fichier avec la **forme exacte** de chaque import externe (`EXCEPTIONS_P0R1`), et une règle étroite pour le `fetch` global (`fetchAdmis` : valeur par défaut du paramètre `transport` de la fabrique exportée de chacun des trois clients, plus le nom de l'option `fetch: enveloppe` de l'appel `createOpenRouter({ … })`). C'est plus strict que 0031 § 5, qui nommait des modules sans forme : **accepté**. Écarts à la liste de 0031 § 5, chacun accepté :
1. **`node:zlib` retiré** de l'exception de `undici-transport.ts` : il n'y sert plus (E1). Le test de #272 refuse `node:zlib` dans ce fichier.
2. **`server-only`**, sous la seule forme `import "server-only";`, dans les nouveaux fichiers non test de P0r1 des trois dossiers (`openrouter-client.ts`, `places-client.ts`, `routes-client.ts`, `enveloppe-google.ts`, `undici-transport.ts`). Marqueur sans capacité, exigé par `ligne/require-server-only` depuis B1 (0006, amendement B1) ; la spécification l'annonçait (« dès que B1 aura ajouté ce paquet »). Ces fichiers ne sont chargés par aucun point d'entrée, donc pas par `pnpm p0` hors Next.js.
3. **`src/grounding/enveloppe-google.ts`**, fichier non nommé par la spécification : il importe `server-only` et `@/server/env/egress` (code `CODE_CLE_ABSENTE`), ce que 0031 § 5 et § 6 permettent à tout `src/grounding`. Ce **n'est pas** un module de capacité : il ne nomme aucun hôte, n'importe aucun module de clé et ne référence pas le `fetch` global (le transport lui est passé) ; le test « aucun hôte réel » de #272 le vérifie. Il ne doit pas entrer dans `modulesCapaciteP0r1`.
4. **`@/prototype/config` (`MODELE_ID_PATTERN`) dans `openrouter-client.ts`** : ligne nominative au sens de 0040 D2 (A3) et M4, même import que `src/ai/client.ts`.
5. **Imports du port** : `openrouter-client.ts`, `places-client.ts` et `routes-client.ts` importent de `@/server/usage/port` des types et trois valeurs (`avecReservation`, `horlogeSysteme`, `DELAI_REQUETE_MS`). Accepté comme « le port, jamais une implémentation » : `port.ts` porte le contrat de 0046 D13 et l'enveloppe de réservation, sans stockage et sans autre import que `server-only` ; l'implémentation en mémoire reste dans `tests/support/port-consommation-memoire.ts`. Le contrôle des imports atteints depuis `port.ts` reste le mineur 4 de la revue du head `335d925`, renvoyé à P0r3.

### C2 — Fichier de données `donnees/lignes-textes-specificateurs.json` : accepté, avec deux corrections
Les lignes de spécificateurs et de paquets dont le chemin ou le nom contient un fragment surveillé (`openrouter`) ne peuvent pas s'écrire dans `listes/specificateurs.ts` ou `listes/paquets.ts`, qui sont analysés ; elles vont dans un fichier JSON, non analysé (spécification P0c, section 1, « Données du régime »), sur le modèle de `lignes-textes.json`. **Mécanisme accepté.** Mais #272 lit ce fichier par simple conversion de type, alors que `lignes-textes.json` et `lectures-env-secretes.json` ont un contrôle de forme à l'exécution (revue du head `a89d9a5`, PR 244, mineur 2). **#272 doit** :
1. **Contrôle de forme** dans `depot.test.ts`, aussi strict que celui de `lignes-textes.json` : chaque entrée de `nominatifs` a exactement les clés `fichier`, `specificateur`, `noms`, `motif` (textes non vides ; `noms` liste non vide de textes distincts) ; chaque entrée de `paquets` a exactement `paquet`, `usage`, `verdict` ; aucune autre clé au premier niveau que `_`, `nominatifs` et `paquets`.
2. **Contrôle d'admission** : chaque entrée doit contenir un hôte ou un fragment de `refus.json` dans `fichier`, `specificateur` ou `paquet` ; sinon elle doit vivre dans la liste TypeScript. Le JSON ne devient pas une seconde liste ordinaire, moins lisible.
Le fichier est sous `tests/unit/confinement/**`, chemin gardé (spécification P0c, section 8) ; P0c2 le couvre par `chemins-gardes.json`, sans action de #272.

### C3 — Forme élargie de `lignes-textes.json` (`module:` et `identifiant:`) : acceptée, avec un cas négatif
Une ligne de `lignes-textes.json` peut porter une capacité `module:` ou `identifiant:` seulement si son fichier est dans `modulesCapaciteP0r1` de `refus.json` (quatre fichiers, liste déjà sur `main`). Accepté : c'est la même nécessité que C2 (chemin du client de modèles), bornée aux quatre modules de capacité. **#272 doit** ajouter un cas négatif : une ligne `module:` (ou `identifiant:`) sur un fichier hors de `modulesCapaciteP0r1` est refusée par le contrôle de forme (le prédicat est extrait en fonction pour être joué sur un cas). L'extension de la ligne A2 (`tests/unit/p0/imports.test.ts`) aux textes des nouveaux cas négatifs du client de modèles est acceptée, dans le régime permanent de A2 (0040 D2).

### C4 — Fournisseur `modeles` dans le port : accepté ; correspondance fixée
Le port nomme ses fournisseurs `modeles` et `google`, et non `openrouter`, fragment surveillé. Accepté : le port décrit des familles de capacité, pas des marques, et la phase 0 n'a qu'un fournisseur de modèles (0026). La correspondance vers `prototype.run_calls.provider` (P0r2) et `usage_ledger.provider` (B7, B9) est l'**identité** de 0046 D13 point 7 (`modeles`, `google`) : il n'y a plus rien « à fixer avec P0r2 ». Un second fournisseur de modèles (Gemini, Q9) demandera un libellé distinct, par une nouvelle décision. La clé `openrouter` de `DELAI_REQUETE_MS` est un identifiant, pas un texte, et ne demande pas de ligne.

### C5 — Lignes à verdict Sécurité (non rendu ici)
Le Tech Lead les juge conformes à la spécification de P0r1 et à 0031 ; **chacune ne vaut qu'avec le verdict Sécurité** dans la revue de #272 (format de la section 8 de la spécification P0c). Toutes portent dans #272 la mention « verdict Sécurité à rendre » :
- `listes/capacites.ts` : `undici-transport.ts` (`module:undici` `Agent`, `module:node:dns` `lookup`), `places-client.ts` et `routes-client.ts` (`identifiant:fetch`) ;
- `donnees/lignes-textes.json` : `openrouter-client.ts` (modules, `identifiant:fetch`, hôte), hôtes de `places-client.ts` et `routes-client.ts`, `secret:MISSING_KEY` de `egress.ts`, `fragment:openrouter` de `tests/unit/p0/clients-reels.test.ts`, extension de la ligne A2 ;
- `donnees/lignes-textes-specificateurs.json` (C2) : les trois lignes de `openrouter-client.ts` et la ligne de paquet `@openrouter/ai-sdk-provider` ;
- `listes/specificateurs.ts` : `server-only` et `@/server/usage/port` des fichiers de P0r1 ;
- `listes/paquets.ts` : `ai`, `undici` ; et le **lockfile** (paquets directs et transitifs, scripts, provenance) ;
- `listes/process.ts` : `execArgv`, lectures de `egress.ts` (déploiement, proxy, TLS, `NODE_OPTIONS`), lignes `ENV_ENTIER` de `egress.ts`, `ai.ts`, `grounding.ts`, `garde-cles.ts` ;
- `donnees/lectures-env-secretes.json` : `ai.ts`, `grounding.ts`, `garde-cles.ts` (quatre noms, présence seulement) ;
- `eslint.config.mjs` : `src/server/env/garde-cles.ts` exempté de `ligne/require-server-only` (chargé par la configuration de Playwright hors de Next.js ; ne rend que des noms courts, jamais une valeur). Côté Tech Lead : accepté.

Les champs `ecart` et `motif` des lignes acceptées en C1 à C4 citent aussi cette décision (`0049 C1` à `0049 C4`), en plus de 0031 ; **#272 doit** l'ajouter (0040 D5 : la référence est déjà là par 0031, l'ajout dit où le Tech Lead a tranché).

## E — Écarts de #272 à la spécification

### E1 — Décompression dans `fetch-page.ts`, `gzip` et `deflate` seulement : accepté
La spécification plaçait la décompression dans le transport (`node:zlib`, `gzip`, `deflate`, `br`). #272 la garde dans `fetch-page.ts`, telle que #149 l'a livrée et testée (`DecompressionStream`, en flux, 2 Mo au plus avant **et** après décompression, codage inconnu ou liste de codages refusés, 10 s par page). Accepté :
- une seule implémentation, déjà revue par la Sécurité (#180), au lieu de deux ;
- le transport reste minimal, sans `node:zlib` (une capacité et une ligne de moins) ;
- `fetch-page.ts` envoie `accept-encoding: gzip, deflate, identity` : `br` n'est jamais demandé ; une réponse `br` non sollicitée est refusée (`content_encoding`) et la page est sautée, échec fermé déjà prévu.
La spécification (« Décompression ») et le tableau des modules de capacité (ligne `undici-transport.ts`, colonne `node:zlib`) sont amendés en ce sens ; 0031 § 5 aussi (C1, point 1). Les valeurs restent des constantes de `fetch-page.ts` (0032).

### E2 — Table de prix dans `prototype/config/prix-google.json` : accepté, avec une correction
La spécification proposait `config/p0/prix-google.json` (« nom proposé »). `prototype/config/` est l'emplacement de la configuration commitée de P0 (0032 A2 : un fichier JSON par sujet, validé par un schéma Zod strict) ; la table est validée par `TablePrixGoogleSchema` (`z.strictObject`). Accepté.
Mais les prix sont écrits deux fois : `COUT_ESTIME_MICROS` (`places-client.ts`) et `COUT_ELEMENT_MICROS` (`routes-client.ts`) recopient les prix de la table, que `src/grounding` ne peut pas lire (aucun `node:fs`). **#272 doit** ajouter un test qui lit la table et vérifie que chaque constante est égale au prix de son SKU (`SKU_TEXT_SEARCH`, `SKU_DETAILS`, `SKU_MATRICE` : `prixPour1000` × 1 000 micro-USD par unité) : une table mise à jour sans les constantes fait alors échouer le test.

### E3 — Pas de test avec `VERCEL_OIDC_TOKEN` et `AI_GATEWAY_API_KEY` posées : accepté
La spécification demandait un test d'exécution avec ces deux variables posées. Le régime refuse `vi.stubEnv` sur un nom secret, avec une seule exception, celle de 0040 D1, en cours de retrait (0042) ; en ouvrir une seconde demanderait une nouvelle décision avec verdict Sécurité, pour un test qui n'ajoute pas de garde. Et la garde de #272 empêche Vitest et Playwright de démarrer si l'une de ces variables est posée. Le chemin de l'AI Gateway est fermé sans dépendre de l'environnement :
1. statique : modèle toujours objet, jamais chaîne, sur chaque appel (test de #272) ;
2. statique, sur tout le dépôt : `ai-gateway.vercel.sh`, `AI_GATEWAY_API_KEY` et `VERCEL_OIDC_TOKEN` refusés hors lignes (`refus.json`), `@ai-sdk/*` refusé dans `src/ai` (D1, point 1), `globalThis` refusé dans `src/ai` ;
3. exécution : `fetch` global remplacé par un double qui échoue, chaque méthode ne passe que par l'enveloppe, vers `openrouter.ai` seulement, et les cas positifs aboutissent par cette enveloppe (un appel détourné vers la passerelle n'aboutirait pas).
Risque résiduel accepté : sur une préversion Vercel (P0r3), `VERCEL_OIDC_TOKEN` est posée ; seul un identifiant de modèle en chaîne ou un fournisseur global par défaut pourrait l'utiliser, et les points 1 et 2 les refusent. Le verdict Sécurité de P0r3 (composition `p0-reel.ts`) le revérifie.

### E4 — Transport testé avec `vi.mock("undici")` : accepté pour P0r1, test de contrat dû avant P0r3
Point relevé dans la description de #272 (« Tests de la spécification »), hors des trois écarts déclarés. La spécification demandait la suite SSRF « sur la couche `undici` réelle face à un serveur local de test » ; le transport fixe le port 443 et n'accepte ni hôte ni options TLS injectés (règles de la spécification), ce qui rend ce test impossible sans affaiblir le module. Accepté pour P0r1 : la suite SSRF de #149 tourne sur `fetch-page.ts` avec une couche injectée, et `lookupEpingle` est testé directement (`all: true`, `all: false`, autre nom d'hôte refusé). Reste non prouvé : qu'`undici` appelle bien `connect.lookup` et se connecte à l'adresse rendue. **Condition avant la fusion de la PR qui compose le transport (P0r3)** : un test de contrat d'`undici`, avec l'`Agent` réel et `lookupEpingle` (exporté), contre un serveur local en clair sur un port libre, qui vérifie que `lookup` est appelé avec le nom d'hôte et que la connexion arrive à l'adresse épinglée. Il demande ses propres lignes de régime (verdict Sécurité). Il peut entrer dans #272 si son auteur le souhaite ; il n'est pas exigé pour sa fusion.

## T — Corrections tardives de P0r1 non faites par #272 (décision du CEO, consignée telle quelle)
Décision du **CEO** (ordre des tâches), 2026-10-13 : les corrections tardives de P0r1 que #272 n'a pas faites restent à **P0r2**, comme le dit déjà `specs/P0-suite-2.md` (tableau des corrections tardives, lignes « Bloquant 3 » et « Bloquant 4 », et décisions D20 et D21) :
- **D21** (bloquant 4 de la revue du head `335d925`, `env` injecté ; forme fixée par 0046 § 6) ;
- les formes **`--no-…`** du bloquant 3 (`NODE_OPTIONS`) ;
- les **périodes de D20** (`src/server/usage/periodes.ts`, 0046 § 5).
#272 **garde** celles qu'il a déjà faites : délais par requête (mineur 2 ; 120 s, 10 s, 10 s, 0046 D13 point 5) et, pour le bloquant 3, découpage de `NODE_OPTIONS` en jetons, normalisation de `_` en `-`, option entière, guillemets et `=valeur`. La PR de P0r2 ne les refait pas ; elle complète le bloquant 3 par les formes `--no-…` et leur test. Cela répond, pour sa part, à la question 1 de 0046.

## Conséquences
- **#272 peut fusionner** (fusion automatique) quand : cette décision et 0046 sont sur `main` ; les corrections ci-dessous sont faites ; le verdict Sécurité couvre chaque ligne de C5 et le lockfile ; la CI est verte et le Tech Lead a approuvé.
- **Ce que #272 doit changer** :
  1. paragraphe « Amendement P0r1 » de `docs/decisions/0006-stack-serveur.md` : remplacer « Constat, sans nouveau choix » par une référence à cette décision (« décision 0049, D1 et D12 ») ; versions inchangées ;
  2. C2 : contrôle de forme et contrôle d'admission de `donnees/lignes-textes-specificateurs.json` ;
  3. C3 : cas négatif de la forme élargie de `lignes-textes.json` ;
  4. C5 : références `0049 C1` à `0049 C4` dans les champs `ecart` et `motif` concernés ;
  5. E2 : test d'égalité entre les constantes de coût des clients Google et la table de prix ;
  6. description : la question D1 et D12 est close par cette décision ; la correspondance de `modeles` est fixée par C4.
- **P0r3** : test de contrat d'`undici` (E4) ; revérification Sécurité du chemin de l'AI Gateway sur la composition (E3).
- **P0r2** : corrections tardives de T.
- **CEO** : liste cette décision dans la note de version suivante.

## Quand revoir cette décision
À toute montée de version de `ai`, `@openrouter/ai-sdk-provider` ou `undici` ; à l'ajout d'un second fournisseur de modèles (C4) ; si un serveur des sources de P0 ne sert que `br` à une requête qui ne le demande pas (E1).
