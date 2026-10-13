# 0040 — Écarts acceptés de P0c1 (amendement de 0038)

Statut : décision déléguée, à lister dans la note de version suivante (rubrique « Décisions prises par le studio ») ; définitive sans veto de Samuel dans les 2 jours qui suivent cette publication · Date : 2026-10-13 · Décideur : Tech Lead (outillage et tests ; délégation « Qui décide quoi » de `docs/CONTEXT.md` ; propriétaire des listes, spécification P0c, « Rôles et garde des listes »), avec les verdicts Sécurité de la revue consolidée de #217 · Ticket #215 · PR #217 · Questions Q309, Q310, Q311 · Amende la décision 0038 et la spécification `specs/P0c-confinement-capacites.md`

Numérotation : `main` va de 0001 à 0039. Parmi les PR ouvertes le 2026-10-13 (#188, #212, #216 et #217), aucune n'ajoute de fichier `0040` (#188 modifie `0006` sans en ajouter). 0040 est le prochain numéro libre.

## Contexte
La PR de P0c1 (#217, head `eb7e3bf`) ne peut pas passer `pnpm verify` sans couvrir par des lignes d'**écart** des usages de `main` que la spécification refuse (description de #217, « Écarts avec la spécification et avec 0038 », A1 à A8 ; Q309). La revue consolidée du head `eb7e3bf` (https://github.com/Samoulou/vadrouille-app/pull/217#issuecomment-6140597575, 2026-10-13 07:30 UTC) rend les verdicts concordants du Tech Lead et de la Sécurité sur A1 à A8, B et C, et demande au bloquant 6 une décision écrite, parce que la ligne A1 (`tests/unit/p0/cli.test.ts`) admet `Proxy` et `Reflect`, que la section 2.4 refuse « sans exception possible ». Le bloquant 5 de la même revue fixe les formes exactes que cette ligne doit avoir.

Cette décision :
1. accepte la ligne A1 comme **exception transitoire unique** à la section 2.4, avec ses formes exactes, bornées en contexte et en nombre, et son échéance ;
2. consigne les verdicts sur A2 à A8, B et C, avec les échéances que la revue demande (mineurs 2, 11 et 12) ;
3. tranche Q310 (zone `src/prototype/**`) et consigne la réponse de la Sécurité à Q311 ;
4. **amende** la spécification et la décision 0038 sur les points nommés dans « Amendements » ; la spécification et 0038 prévalent pour tout le reste.

Elle ne modifie aucun code ni le texte de la spécification : la correction de #217 (bloquants 1 à 5, mineurs) est faite par le rôle backend dans #217.

**Argent, comptes, données hors UE** : rien. Aucun paquet ajouté, aucun compte, aucun service, aucune clé.

**Principe « l'agent cherche, l'ancrage vérifie, le moteur planifie »** : non concerné (outillage de tests et de CI ; aucun chemin d'exécution du produit).

**Hors de cette décision** : P0c-Q2 et P0-Q21 (Samuel) ; l'ordre de fusion de #216 et #217 (Q312, tranché par le CEO : #216 d'abord) ; l'échec e2e `mes-voyages.e2e.spec.ts:204` sur `main` (CEO) ; les bloquants 1 à 4 et les mineurs de la revue, qui sont des corrections de code sans décision à prendre.

## D1 — Ligne A1 : `tests/unit/p0/cli.test.ts`
**Retenu : ligne acceptée, à titre transitoire, sous les seules formes du tableau ci-dessous ; état final par l'option (b)** (réécriture du test par le rôle `ia`, puis retrait de la ligne). L'option (a) seule (ligne permanente) est écartée.

Motif : le test est de P0a1 (#180), revu par la Sécurité, et le critère 1 de P0c interdit à P0c1 de le modifier. Ses formes ne sont pas une porte : le `Proxy` sert à **prouver** qu'aucune clé n'est lue pendant `principal()`, les modules réseau sont importés pour être **remplacés** par des espions qui lèvent, et les valeurs posées sous des noms secrets sont factices. Mais `Reflect` et `Proxy` sont le chemin vers `Function` que 2.3 et 2.4 ferment ; une forme générique (`"toute forme"`) admettrait `Reflect.get(fn, "constructor")` dans ce fichier. L'exception n'est donc acceptable que bornée à ce que le fichier fait aujourd'hui, et limitée dans le temps.

### Formes exactes admises
Les formes sont **le texte source du nœud**, espaces normalisés (comme les autres lignes de #217). Chaque forme n'est admise que dans le **contexte** décrit et au **nombre** d'occurrences indiqué ; une occurrence de plus, même de texte identique, est une capacité refusée. Les numéros de ligne sont ceux de `main` (`ab683eb`) et ne sont donnés qu'à titre de repère (C, « formes plutôt que numéros de ligne »).

| Capacité (clé de #217) | Forme exacte | Contexte exigé | Nombre |
|---|---|---|---|
| `reflexion:Proxy` | `new Proxy(original, { … })` | membre droit de l'affectation `process.env = …` de la fonction `surveillerEnv` (l. 61) ; premier argument : l'identifiant `original` ; second argument : un littéral d'objet dont les **seuls** membres sont trois méthodes nommées `get`, `has` et `ownKeys` (aucune autre trappe : `apply`, `construct`, `getOwnPropertyDescriptor`, `getPrototypeOf`, `set`…) | 1 |
| `reflexion:Reflect` | `Reflect.get(cible, nom, recepteur)` | expression du `return` de la méthode `get` de ce littéral ; arguments : les trois paramètres de cette méthode, dans leur ordre | 1 |
| `reflexion:Reflect` | `Reflect.has(cible, nom)` | expression du `return` de la méthode `has` de ce littéral ; arguments : ses deux paramètres | 1 |
| `reflexion:Reflect` | `Reflect.ownKeys(cible)` | expression du `return` de la méthode `ownKeys` de ce littéral ; argument : son paramètre | 1 |
| `environnement:usage` | `const original = process.env` | déclaration dans `surveillerEnv` (l. 60) ; `original` n'est ensuite utilisé que comme premier argument du `Proxy` ci-dessus et comme membre droit de la restauration ci-dessous | 1 |
| `environnement:ecriture` | `process.env = new Proxy(original, { … })` | celle du `Proxy` ci-dessus (l. 61) | 1 |
| `environnement:ecriture` | `process.env = original` | dans le bloc `finally` du `try` de `surveillerEnv` (l. 78) | 1 |
| `environnement:acces-calcule` | `process.env[nom]` | lecture seule (l. 211), `nom` étant la variable d'un `for (const nom of [ … ])` dont le tableau est un littéral de textes exactement égal à `"PATH"`, `"HOME"`, `"SystemRoot"`, `"TMPDIR"`, `"TEMP"`, `"TMP"`, aucun n'étant un nom secret | 1 |
| `regime-tests:stubEnv-non-litteral` | ``vi.stubEnv(nom, `valeur-de-test-${nom}`)`` | `nom` est la variable d'un `for (const nom of VARIABLES_DE_CLE)` ; la valeur est ce gabarit exact (valeur factice) | 2 (l. 108 et 135) |
| texte de nom secret (section 5) | `"OPENROUTER_API_KEY"`, `"GOOGLE_MAPS_SERVER_KEY"` | seuls éléments du tableau littéral de la déclaration de module `const VARIABLES_DE_CLE = [ … ]` (l. 30) | 2 |
| `module:node:dns`, `module:node:http`, `module:node:https`, `module:node:net`, `module:node:tls` | `default` | import par défaut (l. 3 à 10), inchangé par rapport à #217 | 1 par module |
| `module:node:child_process` | `spawnSync` | import nommé (l. 2), inchangé par rapport à #217 | 1 |
| `identifiant:fetch` | `declaration`, `reference` | `const fetch = vi.fn(leve)` dans `interdireReseau` (l. 98) et ses références dans la même fonction, inchangé par rapport à #217 | inchangé |

Les lectures littérales `process.env.PATH` et `process.env.HOME` (l. 243) restent des lignes ordinaires de la section 5 (B de #217). `NODE_ENV` est admis partout.

**Toute autre forme reste refusée dans ce fichier**, en particulier : tout autre membre de `Reflect` (`apply`, `construct`, `defineProperty`, `getOwnPropertyDescriptor`, `getPrototypeOf`, `set`…) ; `Reflect.get`, `Reflect.has` ou `Reflect.ownKeys` hors de leur trappe ou avec d'autres arguments (`Reflect.get(fn, "constructor")`) ; `Reflect` ou `Proxy` comme valeur, alias, argument, opérande ou cible d'un accès calculé ; `Proxy` sans `new`, un second `new Proxy`, une trappe de plus ; toute autre écriture, déstructuration, énumération ou lecture calculée de `process.env` ; `vi.stubEnv` sur tout autre nom ou avec une autre valeur ; tout autre texte de nom secret.

**Risques résiduels acceptés jusqu'à l'échéance** : les imports par défaut des modules réseau permettraient un appel réel dans ce fichier sans que la ligne le distingue d'un espion (les formes `default` ne disent rien de l'usage) ; un `Proxy` sur `process.env` voit passer toutes les lectures pendant `principal()`. Les deux sont bornés par la revue Sécurité de #180, par l'absence de clé dans l'environnement des tests (section 4, « Clés ») et par l'échéance ci-dessous.

### Ce que #217 doit faire (bloquants 5 et 6)
1. L'analyseur émet pour ces capacités les formes exactes du tableau, contexte et nombre vérifiés ; la forme constante `"toute forme"` disparaît, pour `Proxy` et `Reflect` comme pour toute autre capacité.
2. Le champ `ecart` de la ligne cite cette décision (`0040 D1`).
3. Cas négatifs dans `tests/unit/confinement/donnees/`, joués sous le chemin simulé `tests/unit/p0/cli.test.ts` et refusés **par la règle nommée** (0038 TL-1 point 4) : `Reflect.get(fn, "constructor")` ; `const R = Reflect` ; `Reflect.apply(f, undefined, [])` ; `Reflect.get(cible, nom, recepteur)` hors de la trappe `get` ; un second `new Proxy(original, { get })` ; un `new Proxy(…)` avec une trappe `apply` ; `process.env = {}` ; `process.env[cle]` sur un autre tableau ; `vi.stubEnv` d'un nom secret absent de `VARIABLES_DE_CLE`. Plus un cas positif : le texte réel de `surveillerEnv`, admis.
4. Le contrôle du bloquant 3 (aucun nom de `LECTURES_ENV` ni de `vi.stubEnv` admis n'est un nom secret hors de `src/server/env/` et du module de connexion de B1) a **une seule** exception, nommée par fichier et par forme : les deux `vi.stubEnv` de `cli.test.ts` du tableau ci-dessus, par référence à `0040 D1`. Le test vérifie que cette exception est la seule.
5. Le test vérifie qu'aucune autre ligne, dans aucune liste, n'admet `reflexion:Proxy` ou `reflexion:Reflect` (voir « Limite »).

### Échéance et tâche de suivi
- **Option (b)**, confiée au rôle `ia` (propriétaire de P0a1) par une tâche de suivi que le CEO ouvre : réécrire `tests/unit/p0/cli.test.ts` **sans** `Proxy`, `Reflect`, écriture ni alias de `process.env`, ni `vi.stubEnv` de nom secret, ni import réel de module réseau. La preuve « aucune connexion » passe par des doubles `vi.mock` à fabrique littérale sans paramètre (section 4, forme 2) ; la preuve « aucune clé lue » ne passe **pas** par un double (le `Proxy` sur `process.env` n'est pas remplaçable par `vi.mock`) : elle repose sur le contrôle par sous-processus à environnement sans clé (déjà dans le fichier, l. 200 à 249) et sur l'analyse statique de `tests/unit/p0/imports.test.ts` (TL-2). Toute capacité qui resterait nécessaire reçoit une ligne ordinaire avec verdict Sécurité dans la PR de cette tâche, jamais une exception à 2.4. La PR retire la ligne A1 ; la règle « ligne inutile » l'y oblige.
- **Échéance** : la ligne A1 doit avoir disparu de `main` **avant l'ouverture de la PR de P0r2** (premières exécutions avec de vraies clés ; P0c est son exigence d'entrée 7). Si la tâche n'est pas fusionnée à ce moment, l'exception n'est pas prolongée en silence : il faut une nouvelle décision avec verdict Sécurité.

### Limite
**Aucune autre exception à la section 2.4.** Cette ligne est la seule, pour ce seul fichier, sous ces seules formes, jusqu'à l'échéance. Une autre ligne qui admettrait une forme de 2.4 (réflexion de 2.3, `.constructor` hors `.constructor.name`, `eval`, `Function`, `import()` non littéral, textes `/proc/` ou `.env`…) demande une nouvelle décision avec verdict Sécurité ; elle n'est pas admise par analogie avec celle-ci.

## D2 — Verdicts sur A2 à A8 (Tech Lead et Sécurité concordants)
Chaque ligne d'écart reste **nominative et exacte** (fichier, capacité, forme), avec un champ `ecart` qui cite `0040 Ax`. Les lignes de portée test ou outil qui ne sont pas permanentes portent leur échéance dans `ecart`.

| Écart | Verdict | Échéance |
|---|---|---|
| **A2** `tests/unit/p0/imports.test.ts` : paramètre local `module` (2.3, sans analyse de portée) et textes de ses cas négatifs | Accepté | Permanente tant que 0038 TL-2 point 1 interdit de modifier ce fichier. La ligne est ajustée par #217 à sa mise à jour avec `main` après la fusion de #216 (Q312), qui modifie ce fichier ; si `module` ou un texte disparaît, « ligne inutile » impose de le retirer. |
| **A3** zones sensibles : 15 imports `@/prototype/*` (`brief`, `candidat`, `config`, `ancrage`) dans `src/ai`, `src/grounding`, `src/research` ; `parse5` dans `src/research/extract-text.ts` ; `node:zlib` dans `src/research/fetch-page.test.ts` | Accepté **en lignes nominatives** par (fichier, spécificateur), chacune avec un champ `noms` (noms importés exacts ; mineur 1) | Permanente (architecture de P0). Voir D3 pour la zone `src/prototype/**`. |
| **A4** `src/research/ip-guard.ts` : `node:net` (`BlockList`, `isIP` seulement), portée application, en zone sensible | Accepté | Permanente. Justification côté serveur (section 3, portée application) : module pur de comparaison d'adresses, exécuté seulement côté serveur dans le pipeline de recherche ; `BlockList` et `isIP` n'ouvrent aucune connexion ni résolution ; `node:net` n'est pas disponible dans le navigateur. |
| **A5** `src/adapters/prototype-loader.ts` : `node:fs` (`constants`, `lstat`, `open`, `readdir`, `realpath`), `node:path` (`isAbsolute`, `join`, `resolve`), portée application, non-test de `src/` | Accepté (verdict Sécurité, réponse à **Q311**) : lecture bornée et gardée (`realpath`, `O_NOFOLLOW`, 2 Mo, identifiant validé par `TRIP_ID_PATTERN`, refus hors liste blanche `prototypeAdapterAllowed`, donc en production). **Pas de déplacement derrière une garde** de type `src/server/env/`. Ligne avec champ `noms` (mineur 1). | Permanente. Justification côté serveur : module chargé seulement par `prototype-instance.ts`, lui-même derrière `prototypeAdapterAllowed` ; serveur Next en développement, prévisualisation et CI ; jamais dans le navigateur (`node:fs` n'y existe pas). |
| **A6** `src/research/fetch-page.test.ts` : `table[hote]` et ``pages[`https://${…}`]`` (règle fermée de 2.6 en zone sensible) | Accepté | Transitoire : retrait par la tâche de suivi `ia` de D1 (accès par `Map` ou `Object.hasOwn`, mineur 12), qui retire la ligne. Pas d'échéance bloquante. |
| **A7** `tests/unit/p0/pipeline.test.ts` l. 28 : accès admis seulement par la conversion d'un `unknown` (0038 TL-5 point 7), et textes d'hôtes sentinelles | Accepté : choix du Tech Lead au titre de TL-5 point 7, **ligne nominative** dont la forme porte le motif `objet any/unknown` | Permanente pour les textes ; l'accès est corrigé (lecture typée) par la même tâche `ia` si elle touche ce fichier, sinon la ligne reste. |
| **A8** `scripts/ci/techlead-gate.mjs` (T18) : `node:child_process` (`execFileSync`), `{ ...process.env, … }` hors fichier de test, `files[files.length - 1]` (règle fermée, fichier hors programme), `process.cwd()` | Accepté | `execFileSync` et `process.cwd()` : permanentes (outil). **Étalement** `...process.env` : transitoire ; une tâche du rôle `release` (mineur 11, à ouvrir par le CEO) construit l'environnement de `git` (`PATH`, `HOME`, `GIT_LITERAL_PATHSPECS`) et retire la ligne `etalement` ; la même tâche peut remplacer `files[files.length - 1]` par `files.at(-1)` et retirer cette ligne. |

## D3 — Zone `src/prototype/**` (Q310)
**Retenu : pas de zone pour P0c1.** Les 15 imports `@/prototype/*` des zones sensibles restent des lignes nominatives (A3) ; la section 6 (« Zones sensibles ») n'est pas amendée sur ce point.

Motif : une zone par motif n'est sûre que si le régime vérifie que tout fichier non-test de `src/prototype/**` n'importe que `zod`, `@/contracts` et `src/prototype/**` (ce que la spécification constate sur `main` mais ne contrôle pas). Ajouter ce contrôle à P0c1, déjà en correction, l'alourdirait sans gain de sûreté immédiat. Les lignes nominatives sont plus strictes et « ligne inutile » les tient à jour.

Pour plus tard : si les lignes `@/prototype/*` deviennent une charge (P0r1 et suivantes), une PR pourra remplacer ces lignes par une entrée de zone `src/prototype/**` (non-test), **à la condition** de livrer dans la même PR ce contrôle d'imports de `src/prototype/**`, avec un verdict Sécurité. Cette PR n'a pas besoin d'une nouvelle décision : cette condition suffit.

## D4 — Lignes ordinaires (B) et choix de forme (C)
- **B** : acceptées. `src/adapters/prototype-instance.ts` est de **portée application** : sa justification (section 3, « Fermeture transitive ») est écrite dans la ligne, en remplacement de « même forme que `simulation.ts` » (revue, B), au moins en ces termes : alias de `globalThis` affecté à la constante `holder`, lu et écrit par la seule clé constante `INSTANCE_KEY` (`Symbol.for("vadrouille.prototype")`) ; côté serveur, il garde une instance du chargeur et du relecteur simulé entre les copies du module que Next charge par route ; il n'atteint aucune capacité (ni `fetch`, ni module à capacité, ni `process` autre que `env` en valeur par défaut) ; côté navigateur, s'il y était inclus, il ne ferait que cette même lecture et écriture d'une propriété à clé symbole. Les autres lignes ordinaires (sections 4, 5, 6 et 9) restent soumises à la revue de #217.
- **C** : choix de forme validés, tels que décrits dans la description de #217, avec les resserrements des bloquants 1 et 2 de la revue (alias de `vi` et `vitest`, fabrique littérale sans paramètre pour un module à capacité) et du bloquant 4 (cas de fermeture avec règle nommée), qui prévalent sur C là où ils diffèrent.

## D5 — Champ `ecart` (mineur 2)
- Toute ligne qui porte un champ `ecart` y cite une décision (`0040 Ax`, `0040 D1`…) ou une PR (`#180`, `#199`…) ; un test de `depot.test.ts` vérifie la présence d'une référence de la forme `\b0\d{3}\b` ou `#\d+`.
- Une ligne d'écart **transitoire** (A1, A6, l'étalement de A8) nomme dans `ecart` sa tâche de retrait ; une ligne **permanente** de portée application (A4, A5, `prototype-instance.ts`) nomme sa justification côté serveur ou navigateur et n'a pas d'échéance.

## Conséquences (récapitulatif)
- **#217 (backend)** : D1 points 1 à 5 ; champ `ecart` selon D5 ; champs `noms` de A3 et A5 ; justification de `prototype-instance.ts` (D4). Le verdict Sécurité sur la ligne A1 réécrite est rendu dans la revue suivante de #217, sous la forme de la section 8 de la spécification.
- **CEO** : ouvrir la tâche de suivi `ia` (D1, option (b), plus A6 et l'accès de A7) et la tâche `release` (A8, étalement), et les ordonner avant l'ouverture de la PR de P0r2.
- Aucun changement de `vitest.config.mts`, `eslint.config.mjs`, `tsconfig.json` ni des tests de `tests/unit/p0/` par P0c1.

## Amendements
Chacun relève de la délégation « outillage et tests » (le Tech Lead est propriétaire des listes) et a reçu le verdict Sécurité de la revue consolidée de #217. Ils s'ajoutent aux amendements A1 à A3 de 0038.
- **A4 — section 2.4 (« sans exception possible »).** Une seule exception, transitoire : la ligne de `tests/unit/p0/cli.test.ts` sous les formes exactes de D1, jusqu'à l'échéance de D1. La mention « sans exception possible » vaut pour tout le reste. Le même amendement couvre, pour cette seule ligne, la réflexion de 2.3 (`Proxy`, `Reflect` « refusés partout sous toute forme »).
- **A5 — section 5 (`process.env` et noms secrets) et section 4, point 3.** Pour la seule ligne de D1 : alias `const original = process.env`, deux écritures de `process.env`, une lecture calculée sur un tableau littéral de noms non secrets, deux `vi.stubEnv` sur les noms secrets de `VARIABLES_DE_CLE` à valeur factice, et les deux textes de ces noms, sous les formes de D1. Ailleurs, la règle « un nom secret ne figure dans la liste que pour `src/server/env/` ou le module de connexion de B1 » est inchangée.
- **A6 — section 5, forme 3 (étalement).** `scripts/ci/techlead-gate.mjs`, fichier hors test, est admis à étaler `process.env` dans l'environnement de `git`, sous sa seule forme actuelle, jusqu'à la tâche `release` de D2 (A8).
- **A7 — section 6 (« Zones sensibles » et non-test de `src/`).** Sont admis en lignes nominatives : les imports `@/prototype/*` de A3 (avec `noms`), `parse5` dans `src/research/extract-text.ts`, `node:zlib` dans `src/research/fetch-page.test.ts`, `node:net` (`BlockList`, `isIP`) dans `src/research/ip-guard.ts`, et `node:fs`, `node:fs/promises`, `node:path` (noms de A5) dans `src/adapters/prototype-loader.ts`. La phrase « dans les fichiers non-test de `src/`, aucun module de Node n'est admis hors `node:crypto` et des lignes nominatives » s'applique avec ces lignes.

## Questions ouvertes
- **Pour la Sécurité** : confirmer, dans la revue suivante de #217 (format de la section 8), le verdict sur la ligne A1 réécrite selon D1. Bloque : la fusion de #217.
- **Pour le CEO** : ouvrir et ordonner la tâche `ia` (D1, option (b) ; A6 ; accès de A7) et la tâche `release` (A8, étalement), toutes deux avant l'ouverture de la PR de P0r2. Bloque : P0r2 (échéance de D1), rien d'autre.
