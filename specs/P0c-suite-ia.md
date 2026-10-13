# P0c-suite-ia — Retrait de l'écart A1 (option b), de l'écart A6 et de l'accès de l'écart A7

Rôle d'exécution : **ia** (`.claude/agents/ia-recherche.md`, propriétaire de P0a1 ; commits `[ia]`) · Revue : Tech Lead **et** Sécurité · Rédaction : Product Owner · Date : 2026-10-13 · Ticket : #221 · Origine : décision 0040 (PR #220), D1 « Échéance et tâche de suivi » et D2 (lignes A6 et A7) · Référence : `specs/P0c-confinement-capacites.md` (sections 2.3, 2.4, 2.6, 4, 5 et 8), décision 0038 (TL-1 point 4, TL-2, TL-5 point 7), décision 0040 (D1, D2, D5, M1, M2), code du régime fusionné par #217 (`tests/unit/confinement/**`), `specs/P0-prototype-recherche.md` (P0a1, #180)

**Vocabulaire.** Dans cette spécification, « A1 », « A6 » et « A7 » désignent les **écarts** de la décision 0040 (lignes d'exception des listes du régime de confinement), et non les critères de qualité A1 à A9 de la grille G0 (`specs/P0-suite-2.md`).

## Prérequis
- #217 (P0c1, code du régime) fusionnée : oui (2026-10-13, `7efefc8`).
- #220 (décision 0040) fusionnée : oui (2026-10-13, `f68772f`).
- Réponses du Tech Lead aux propositions P0cS-TL-1 à P0cS-TL-5 (« Propositions au Tech Lead et à la Sécurité »), données dans la revue de cette spécification ou au plus tard dans la première revue de la PR de code. Aucune ne demande de fichier dans `docs/decisions/`, sauf P0cS-TL-4 si le Tech Lead retient la suppression de tests (règle « Jamais » de `CLAUDE.md`).

## Échéance
La PR de code doit être **fusionnée avant l'ouverture de la PR de P0r2** (0040 D1, « Échéance »). Sinon, l'exception A1 n'est pas prolongée en silence : il faut une nouvelle décision avec verdict Sécurité (0040 D1). Cette tâche ne dépend pas de P0r1 et peut avancer en parallèle.

## Objectif
Retirer de `main` la seule exception à la section 2.4 du régime de confinement (ligne A1 de `tests/unit/p0/cli.test.ts` : `Proxy`, `Reflect`, écriture et alias de `process.env`, `vi.stubEnv` de noms secrets), en réécrivant ce test sans ces formes, **sans perdre** ce qu'il prouve sur la commande `pnpm p0` hors ce que 0040 D1 renvoie à d'autres preuves. Dans la même PR, retirer l'écart A6 (accès calculés de `src/research/fetch-page.test.ts`) et la partie « accès » de l'écart A7 (`tests/unit/p0/pipeline.test.ts`).

À la fin, aucune ligne des listes du régime n'admet `reflexion:Proxy` ni `reflexion:Reflect`, aucune ne cite `0040 D1`, et les lignes A6 et A7 (capacités) ont disparu. Le comportement de `pnpm p0` et du code de `src/` est inchangé : seuls des tests et les listes du régime changent.

## Ce que la tâche ne fait pas
- Aucun changement de code non-test : ni `scripts/p0/**`, ni `src/**` hors des deux fichiers de test nommés, ni `package.json`, `pnpm-lock.yaml`, configurations (`vitest.config.mts`, `eslint.config.mjs`, `tsconfig*.json`, `next.config.ts`), workflows.
- Aucune modification de `tests/unit/p0/imports.test.ts` (0038 TL-2 point 1 ; ligne A2 inchangée).
- Aucune nouvelle exception à la section 2.4, sous aucune forme (0040 D1, « Limite »). Une capacité qui resterait nécessaire reçoit une **ligne ordinaire** avec verdict Sécurité dans la PR (0040 D1), jamais une exception.
- L'écart A8 (`scripts/ci/techlead-gate.mjs`, étalement de `process.env`) : tâche `release` distincte (0040 D2).
- Les lignes de 0040 D6, dont `node:vm` de `tests/unit/sw-route.test.ts`.
- La ligne A7 de `tests/unit/confinement/donnees/lignes-textes.json` (textes d'hôtes sentinelles de `pipeline.test.ts`) : **permanente** (0040 D2), elle reste.
- P0c2 (contrôle des chemins gardés), P0c-Q2, P0-Q21.

## À livrer (une PR, branche `claude/221-p0c-suite-ia`)
1. **`tests/unit/p0/cli.test.ts` réécrit** selon 0040 D1, option (b) :
   - ni `Proxy`, ni `Reflect`, ni écriture, alias, déstructuration ou lecture calculée de `process.env` ;
   - aucun `vi.stubEnv` d'un nom secret, aucun texte de nom secret (section 5) ;
   - aucun import réel de module réseau (`node:dns`, `node:http`, `node:https`, `node:net`, `node:tls`) : la preuve « aucune connexion » passe par des doubles `vi.mock` à fabrique littérale sans paramètre (section 4, forme 2), plus le double du `fetch` global (`vi.stubGlobal("fetch", …)`, section 4, forme 1) ; forme exacte : P0cS-TL-1 ;
   - la preuve « aucune clé lue » ne passe plus par le test en processus : elle repose sur le contrôle par sous-processus à environnement sans variable de clé (déjà dans le fichier) et sur l'analyse statique de `tests/unit/p0/imports.test.ts` (0040 D1) ;
   - les lectures de l'environnement du sous-processus se font par propriété littérale (`process.env.PATH`…), avec les noms ajoutés à la ligne `LECTURES_ENV` de ce fichier (P0cS-TL-5).
2. **`src/research/fetch-page.test.ts`** : plus aucun accès calculé à clé non littérale (`table[hote]`, ``pages[`https://…`]``) ; forme : P0cS-TL-2.
3. **`tests/unit/p0/pipeline.test.ts`** : la lecture du champ du message simulé (l. 28) devient une lecture typée sans accès calculé sur un objet converti ; forme : P0cS-TL-3. Les textes d'hôtes sentinelles ne changent pas.
4. **Listes du régime** (`tests/unit/confinement/listes/*.ts`, `donnees/lignes-textes.json`) :
   - ligne A1 de `capacites.ts` retirée ; ce qui reste nécessaire à `cli.test.ts` (au moins `module:node:child_process` `spawnSync`, et `identifiant:fetch` si le double garde ce nom) devient une **ligne ordinaire**, sans `ecart` citant `0040 D1`, avec verdict Sécurité ;
   - ligne de `cli.test.ts` de `lignes-textes.json` (textes `OPENROUTER_API_KEY`, `GOOGLE_MAPS_SERVER_KEY`) retirée ;
   - ligne A6 de `capacites.ts` retirée ;
   - ligne A7 de `capacites.ts` (`acces-calcule:type`) retirée ; ligne A7 de `lignes-textes.json` conservée telle quelle ;
   - ligne `LECTURES_ENV` de `cli.test.ts` ajustée (P0cS-TL-5).
5. **Tests du régime propres à l'exception D1** (`tests/unit/confinement/depot.test.ts` : « seule exception : les vi.stubEnv de VARIABLES_DE_CLE… », « aucune autre ligne n'admet reflexion… », « textes de noms secrets de cli.test.ts… » ; `environnement.test.ts`, bloc « exception transitoire de 0040 D1 » ; `donnees/cas-exception-d1.json`) : **transformés** en tests d'absence de l'exception, sans suppression de test (P0cS-TL-4).
6. **Description de PR** : liste des capacités encore présentes dans `cli.test.ts` avec la ligne ordinaire proposée pour chacune ; tableau « avant / après » des preuves du test (voir critère 4) ; mention explicite des preuves déplacées (« aucune clé lue », variantes « avec variables de clé ») ; demande du verdict Sécurité au format de la section 8 de P0c.

## Critères d'acceptation (chacun vérifié par un test ou une commande)
1. **Aucune exception à 2.4.** Un test du régime vérifie qu'**aucune** ligne, dans aucune liste, n'admet `reflexion:Proxy` ou `reflexion:Reflect` (sans exception de fichier), et qu'aucun champ `ecart` ne cite `0040 D1`.
2. **`cli.test.ts` sans les formes de D1.** La suite du régime (`pnpm test`, `tests/unit/confinement/`) passe **sans** aucune ligne admettant pour ce fichier `reflexion:*`, `environnement:usage`, `environnement:ecriture`, `environnement:acces-calcule`, `regime-tests:stubEnv-non-litteral`, un texte de nom secret ou un import de `node:dns`, `node:http`, `node:https`, `node:net` ou `node:tls`. (La règle « ligne inutile » impose déjà le retrait de chaque forme devenue sans objet.)
3. **Aucun `vi.stubEnv` à nom secret ou non littéral admis par une ligne.** Le test « seule exception… » devient : aucun constat `stubEnv-non-litteral` n'est admis par une ligne de capacité, et aucun `vi.stubEnv` d'un nom secret n'est admis, où que ce soit.
4. **Preuves conservées sur `pnpm p0`** (P0cS-PO-2), chacune par au moins un cas nommé de `cli.test.ts` :
   - `--reel` sous les cinq formes actuelles (`--reel` ; `--reel --brief edimbourg-1` ; `--brief edimbourg-1 --reel` ; `--reel=1` ; `--reel --brief ../x`) : code `real_mode_unavailable`, sortie d'erreur `{"code":"real_mode_unavailable"}`, sortie standard vide, aucun fichier écrit, aucun double réseau appelé ;
   - `--reel` avec une configuration illisible : même erreur, configuration non lue ;
   - mode simulé (`--brief edimbourg-1`) : code de réussite, `programme_written`, exactement les deux fichiers de sortie attendus, aucun double réseau appelé (doubles `vi.mock` et `fetch`) ;
   - deux exécutions le même jour : deux numéros ;
   - les huit cas de `--brief` refusés (`brief_name_invalid`, `brief_not_found`), le fichier hors liste jamais ouvert, et les cinq cas d'usage ;
   - sous-processus `pnpm p0 --brief edimbourg-1` puis `pnpm p0 --reel`, environnement sans variable de clé : codes 0 et 2, sorties attendues, nettoyage des fichiers écrits.
   Seules disparaissent, avec mention dans la PR : l'assertion `lues = []` du test en processus et les variantes « avec variables de clé » (P0cS-Q1).
5. **A6 retiré.** `src/research/fetch-page.test.ts` n'a plus de ligne dans `capacites.ts` ; la suite du régime passe ; la liste des noms de cas (`it`) du fichier est identique avant et après (comparaison de `pnpm exec vitest list src/research/fetch-page.test.ts`, jointe à la PR).
6. **Accès de A7 retiré.** `tests/unit/p0/pipeline.test.ts` n'a plus de ligne dans `capacites.ts` ; sa ligne de `lignes-textes.json` est **inchangée** (comparaison du fichier) ; la liste des noms de cas du fichier est identique avant et après.
7. **Périmètre.** `git diff --name-only origin/main` ne liste que : `tests/unit/p0/cli.test.ts`, `src/research/fetch-page.test.ts`, `tests/unit/p0/pipeline.test.ts` et des fichiers sous `tests/unit/confinement/` (listes, données, tests du régime, et `analyse.ts` si P0cS-TL-4 le retient).
8. **Aucun test supprimé** sans décision écrite dans `docs/decisions/` : le nombre de cas de la suite unitaire ne baisse pas, hors des cas que P0cS-Q1 et P0cS-TL-4 auraient retirés **avec** décision écrite citée dans la PR.
9. `pnpm verify` au vert ; revue consolidée du head de la PR avec la ligne exacte `- securite : **approuvé**` (format de la section 8 de P0c), puisque la PR retire et ajoute des lignes et modifie des tests du régime.

## Décisions (Product Owner, définitives sans veto de Samuel avant le 2026-10-15)
Détails fonctionnels seulement ; les formes de test, de liste et d'analyse sont des propositions au Tech Lead et à la Sécurité.
- **P0cS-PO-1 — Une seule PR, trois retraits.** A1 (option b), A6 et l'accès de A7 sont livrés ensemble, comme le demande le ticket #221 et le permet 0040 D2 (A7 : « par la même tâche `ia` si elle touche ce fichier »). Motif : mêmes revues (Tech Lead, Sécurité), mêmes fichiers de liste, une seule mise à jour du régime.
- **P0cS-PO-2 — Comportements de `pnpm p0` à garder prouvés.** La liste du critère 4 est le contrat de P0a1 tel que `cli.test.ts` le prouve aujourd'hui ; seules en sortent les preuves que 0040 D1 renvoie au sous-processus et à `imports.test.ts`.
- **P0cS-PO-3 — Aucun changement de comportement.** La sortie de `pnpm p0` (codes, lignes JSON, fichiers écrits) est identique avant et après ; la PR ne touche aucun code non-test.

## Propositions au Tech Lead et à la Sécurité (à trancher par eux, pas par le Product Owner)
- **P0cS-TL-1 — Doubles réseau de `cli.test.ts`.** Le code de P0 (`scripts/p0/**` et ses imports `@/…`) n'importe de module réseau que `node:net` (`BlockList`, `isIP`, dans `src/research/ip-guard.ts`, ligne A4), que le mode simulé utilise par `creerLecteurPages`. Un `vi.mock("node:net", () => ({ … }))` à fabrique sans paramètre doit donc **fournir** `BlockList` et `isIP` (sans `importOriginal`, refusé pour un module à capacité), ou `node:net` n'est pas doublé et la preuve repose, pour lui, sur la ligne A4 (seuls `BlockList` et `isIP` admis) et sur `imports.test.ts`. À trancher aussi : comment le test vérifie qu'un double « n'a pas été appelé » sans importer le module réel (import du module doublé, admis ou non par la section 4 ; ou espions créés par `vi.hoisted` et référencés dans la fabrique). Proposition : doubler `node:dns`, `node:http`, `node:https`, `node:tls` (fonctions de connexion qui lèvent) et le `fetch` global ; ne pas doubler `node:net` et le noter dans la PR.
- **P0cS-TL-2 — Forme de A6.** Dans une zone sensible, la règle fermée de 2.6 refuse toute clé non littérale : `Object.hasOwn(table, hote)` suivi de `table[hote]` laisse l'accès en place. Proposition : `Map` (`new Map(Object.entries(table))` dans les fabriques `resolveur` et `http`, lecture par `.get(…)`), sans changer les appels des cas.
- **P0cS-TL-3 — Forme de A7.** La règle retire la conversion de l'objet avant de juger (2.6, « Reste du dépôt ») : `(x as { candidats?: Vue[]; lieux?: Vue[] })[champ]` resterait refusé. Proposition : lecture par propriété littérale selon `champ` (`champ === "candidats" ? d.candidats : d.lieux`), sans `zod` (un import de `zod` sous `tests/unit/**` demanderait une ligne nominative, 0040 D6).
- **P0cS-TL-4 — Tests du régime propres à D1.** Proposition : ne rien supprimer ; transformer « seule exception… » en « aucune exception » (critère 3), « aucune autre ligne n'admet reflexion… » en « aucune ligne… » (critère 1), le test des textes de noms secrets de `cli.test.ts` en « `cli.test.ts` ne contient aucun texte de nom secret », et garder `cas-exception-d1.json` (renommé si le Tech Lead le souhaite) avec ses cas négatifs, le cas positif `d1-surveiller-env-admis` passant à `refus` par la règle nommée. Le Tech Lead dit si le code d'analyse propre aux formes de D1 (`formeReflexion` de `analyse.ts`) reste ou est retiré ; un retrait de test exige une décision écrite (`CLAUDE.md`, « Jamais »).
- **P0cS-TL-5 — Environnement du sous-processus.** Proposition : remplacer la boucle `process.env[nom]` par six lectures littérales et porter la ligne `LECTURES_ENV` de `cli.test.ts` à `PATH`, `HOME`, `SystemRoot`, `TMPDIR`, `TEMP`, `TMP` (aucun n'est un nom secret).

## Hors périmètre
Voir « Ce que la tâche ne fait pas ». En plus : toute évolution de `pnpm p0`, de P0r1 ou de P0r2 ; toute modification de la décision 0040 (le retrait des lignes est ce que 0040 D1 et D2 prévoient, aucune nouvelle décision n'est nécessaire pour cela).

## Questions ouvertes
- **P0cS-Q1 — Pour la Sécurité (avec le Tech Lead)** : les variantes « avec variables de clé » de `cli.test.ts` (valeurs factices posées par `vi.stubEnv`, puis vérification que `principal()` ne les lit pas et qu'aucune n'apparaît dans les sorties) disparaissent avec l'option (b). Faut-il les remplacer ? Option a : accepter la perte, la preuve passant par le sous-processus sans clé, `imports.test.ts` (refus statique de toute lecture de nom secret dans les dossiers de P0) et l'absence de clé dans l'environnement des tests (section 4, « Clés ») ; option b : un sous-processus avec des valeurs factices sous les noms secrets, qui demanderait des textes de noms secrets dans un fichier de test, donc une ligne ordinaire hors de `src/server/env/`, contraire à la section 5 et à exiger par une nouvelle décision. **Recommandation du Product Owner : option a**, qui ne crée aucun écart. Bloque : la PR de code (critère 4).
- **P0cS-Q2 — Pour le Tech Lead** : réponses à P0cS-TL-1 à P0cS-TL-5. Bloque : la PR de code.
- **Pour Samuel** : aucune question. La tâche ne touche ni la stratégie, ni l'argent, ni un compte externe.
