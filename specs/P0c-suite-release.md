# P0c-suite-release — Environnement de `git` construit dans `techlead-gate.mjs` (écart A8)

Rôle : **release** (outillage CI), revue Tech Lead et Sécurité · Rédaction : Product Owner · Date : 2026-10-13 · Ticket : #222 · Prérequis : #217 (P0c1, fusionnée, `7efefc8`) et #220 (décision 0040, fusionnée, `f68772f`), vérifiés le 2026-10-13 · Échéance : fusion **avant l'ouverture de la PR de P0r2** (0040, « Questions ouvertes », tâche du CEO) · Référence : décisions 0040 (D2, écart A8 ; D5 ; amendement M3), 0038, 0035 (`owner-approved`), 0023 § 4 et 0019 § 3.3 (porte `techlead-gate`), `specs/P0c-confinement-capacites.md` (sections 5, 8 et « Rôles et garde des listes »), `specs/T18-owner-approved-workflows.md`

## Objectif
Retirer de `main` le dernier étalement de `process.env` hors fichier de test : `workflowsTreeId` de `scripts/ci/techlead-gate.mjs` passe aujourd'hui à `git` une copie de **tout** l'environnement du processus (`{ ...process.env, GIT_LITERAL_PATHSPECS: "1" }`, l. 126). La décision 0040 (D2, A8) n'admet cet étalement qu'à titre transitoire (amendement M3) et confie à une tâche `release` de construire l'environnement de `git` à partir des seules variables utiles, `PATH`, `HOME` et `GIT_LITERAL_PATHSPECS`, puis de retirer la ligne `etalement` de la liste des capacités. La même tâche remplace `files[files.length - 1]` par `files.at(-1)` et retire la seconde ligne transitoire.

Effet attendu : une variable `GIT_*` présente dans l'environnement du job (par exemple `GIT_DIR`, `GIT_INDEX_FILE`, `GIT_CONFIG_PARAMETERS`) ne change plus le contenu que la porte lit pour juger `owner-approved` ; et le régime de confinement de P0c ne contient plus d'étalement hors des tests.

## État de départ (relevé sur `origin/main` `894ac8a`, 2026-10-13)
- `scripts/ci/techlead-gate.mjs` :
  - l. 57 : `if (files[files.length - 1] === "") files.pop();` dans `readFileList` ;
  - l. 126 : `const env = { ...process.env, GIT_LITERAL_PATHSPECS: "1" };` dans `workflowsTreeId`, passé aux deux `execFileSync("git", …)` (l. 131 et 135) ;
  - l. 311 : `process.cwd()` (ligne permanente, inchangée).
- `tests/unit/confinement/listes/capacites.ts`, ligne de `scripts/ci/techlead-gate.mjs` (portée `outil`) : capacités `module:node:child_process` (`execFileSync`), `environnement:entier` (`etalement`) et `acces-calcule:cle-non-litterale` (`files[files.length - 1]`) ; `ecart` : « script de CI (T18, PR 199) : 0040 D2, A8 (amendement M3) ; `execFileSync` permanent ; étalement de `process.env` et `files[files.length - 1]` transitoires, retrait par la tâche `release` de 0040 D2 (A8) ».
- `tests/unit/confinement/listes/process.ts` : `PROPRIETES_PROCESS` contient `argv`, `stdout` et `cwd` pour ce fichier ; `LECTURES_ENV` n'a **aucune** ligne pour ce fichier ; `ENV_ENTIER` non plus (l'étalement est porté par la ligne de capacité).
- Tests de la porte : `tests/unit/ci/techlead-gate.test.ts` (fonctions pures, dont `readFileList`) et `tests/unit/ci/techlead-gate-workflow.test.ts` (rejeu des étapes YAML et de `workflowsTreeId` dans des dépôts Git jetables ; son assistant `git` hérite de l'environnement du processus de test).
- `.github/workflows/techlead-gate.yml` appelle `node scripts/ci/techlead-gate.mjs gate-input.json files.nul` sans variable propre à `git` ; il n'a pas à changer.

## À livrer (PR de code, branche proposée `claude/222-p0c-suite-release`)
1. **`scripts/ci/techlead-gate.mjs`**
   - `workflowsTreeId` construit l'environnement de `git` par un **littéral d'objet** dont les seules clés sont `PATH`, `HOME` et `GIT_LITERAL_PATHSPECS` : `PATH` et `HOME` lus par propriété littérale (`process.env.PATH`, `process.env.HOME`, forme 1 de la section 5 de P0c), `GIT_LITERAL_PATHSPECS` égal au texte `"1"`. Aucun étalement, aucune autre lecture de `process.env`, aucun alias. Une variable absente (`undefined`) n'est pas transmise (comportement de `child_process`, qui ignore les valeurs `undefined`) ; aucun code de filtrage n'est ajouté.
   - `readFileList` : `files.at(-1)` à la place de `files[files.length - 1]`, comportement inchangé.
   - Commentaire d'en-tête de `workflowsTreeId` : une phrase qui dit que l'environnement de `git` est restreint à ces trois variables (0040 D2, A8).
   - `techlead-gate.d.mts` : inchangé (aucune signature ne change).
2. **`tests/unit/confinement/listes/capacites.ts`**, ligne de `scripts/ci/techlead-gate.mjs` :
   - retirer les capacités `environnement:entier` (`etalement`) et `acces-calcule:cle-non-litterale` (`files[files.length - 1]`) ;
   - garder `module:node:child_process` (`execFileSync`), permanente ;
   - `usage` : « porte techlead-gate (0035) : `git cat-file` et `git ls-tree` sur le clone, environnement restreint à `PATH`, `HOME` et `GIT_LITERAL_PATHSPECS` » ;
   - `ecart` : ligne **permanente** (0040 D5) citant sa décision, au moins « script de CI (T18, PR 199) : 0040 D2, A8 ; `execFileSync` permanent (outil) ; étalement et accès calculé retirés par P0c-suite-release (#222) ». Elle ne nomme plus de tâche de retrait.
3. **`tests/unit/confinement/listes/process.ts`**, `LECTURES_ENV` : nouvelle ligne `{ fichier: "scripts/ci/techlead-gate.mjs", noms: ["PATH", "HOME"] }`, précédée d'un commentaire « 0040 D2, A8 : environnement de `git` construit (P0c-suite-release, #222) ». Aucun nom secret (section 5) ; verdict Sécurité exigé (en-tête de `process.ts`).
4. **`tests/unit/ci/techlead-gate-workflow.test.ts`**, bloc `describe("workflowsTreeId")` : un test « ignore les variables Git de l'environnement du processus (0040 A8) » (critère 4).
5. Aucun autre fichier. En particulier : ni `.github/workflows/**`, ni `specs/P0c-confinement-capacites.md`, ni les décisions 0038 et 0040, ni `STATUS.md`, ni `QUESTIONS.md`.

## Critères d'acceptation
Chaque critère est vérifié par un test exécuté par `pnpm verify` (ou par une recherche textuelle citée).

1. **Plus d'étalement.** `scripts/ci/techlead-gate.mjs` ne contient plus `...process.env` ; la suite `tests/unit/confinement/` passe avec la ligne de capacité réduite (critère 3). Si l'étalement restait dans le code sans sa ligne, le régime le refuserait (section 5, forme 3) ; si la ligne restait sans l'étalement, la règle « ligne inutile » échouerait. Les deux sens sont donc couverts par les tests existants, sans test nouveau.
2. **Environnement exact.** Le seul littéral passé en `env` aux deux `execFileSync` de `workflowsTreeId` a exactement les clés `PATH`, `HOME`, `GIT_LITERAL_PATHSPECS` ; les seules lectures de `process.env` du fichier sont `process.env.PATH` et `process.env.HOME`. Vérifié par le régime : la ligne `LECTURES_ENV` (`PATH`, `HOME`) est la seule ligne `process.env` du fichier, toute autre lecture est refusée, et « ligne inutile » échoue si l'une des deux disparaît.
3. **Listes.** La ligne de capacité de `scripts/ci/techlead-gate.mjs` ne contient plus que `module:node:child_process` (`execFileSync`) ; son `ecart` cite `0040` (test de `depot.test.ts`, 0040 D5) et ne nomme plus de tâche de retrait. Aucune autre ligne d'aucune liste n'est ajoutée, retirée ou élargie que celles de « À livrer » 2 et 3 (diff des deux fichiers de listes relu dans la revue).
4. **Environnement du processus ignoré (test nouveau).** Dans un dépôt jetable (assistant `setup` existant), après les commits faits par l'assistant `git`, on pose par `vi.stubEnv` un `GIT_DIR` qui désigne un dossier vide créé pour le test, puis on appelle `workflowsTreeId({ sha, cwd })` : le résultat est **identique** à celui obtenu sans cette variable, et l'appel ne lève pas. `vi.unstubAllEnvs()` est appelé dans un `finally` ou un `afterEach`, pour que l'assistant `git` du test (qui hérite de l'environnement) ne soit pas touché. Ce test **échoue** sur la version actuelle du script (l'étalement transmet `GIT_DIR` et `git cat-file` lève « commit … absent du clone ») ; la PR le montre (sortie du test sur la version d'origine, collée dans la description). `GIT_DIR` est un nom littéral non secret : `vi.stubEnv` est admis sans ligne (P0c, section 4, point 3).
5. **Comportement inchangé.** Tous les tests existants de `tests/unit/ci/techlead-gate.test.ts` (dont `readFileList` : dernier élément vide retiré, liste sans NUL final conservée, UTF-8 invalide refusé) et de `tests/unit/ci/techlead-gate-workflow.test.ts` (rejeux et scénarios d'ordonnancement) passent sans modification de leurs attentes.
6. **Aucun fichier hors périmètre.** Le diff de la PR ne contient que les quatre fichiers de « À livrer » (`git diff --name-only origin/main...HEAD`, cité dans la description).
7. **En conditions réelles.** La porte `techlead-gate` de la PR de code elle-même s'exécute avec le nouveau script (0035, « Une PR qui modifie la porte se juge avec sa propre version ») ; le job ne doit pas échouer sur une erreur `git` (`dubious ownership`, commande introuvable). Si le relevé d'un job de la PR montre une telle erreur, la correction passe par une variable de plus avec ligne et verdict Sécurité (question 2), **jamais** par le retour de l'étalement.
8. `pnpm verify` au vert (hors tests visuels et `test:db` dans le bac à sable, connus) ; aucun test supprimé ni désactivé.
9. La description de la PR porte `Closes #222`, la liste des lignes retirées et ajoutée, la mention « amendement M3 de 0040 sans objet après fusion », et la question 1 ci-dessous si elle n'est pas tranchée.

## Revue et libellés
- **Verdict Sécurité** dans la revue consolidée, sous la forme de la section 8 de P0c (« Verdict lu ») : la PR ajoute une ligne `LECTURES_ENV`, retire deux capacités et touche `scripts/ci/**` et `tests/unit/confinement/**`, chemins gardés (P0c, section 8). Le contrôle de chemins de P0c2 n'étant pas encore sur `main`, ce verdict est exigé par la règle « Rôles et garde des listes », pas par un contrôle automatique.
- **`owner-approved`** : le ticket #222 indique « Touche .github : owner-approved requis ». En l'état de la porte (0035, règle 1 et risque « Fichiers hors du dossier » ; Q274, ouverte, par défaut non), une PR qui ne modifie que `scripts/ci/` et des tests **n'est pas** une PR de workflow : la porte ne l'exigera pas et la fusion automatique ne l'attendra pas. Cette spécification ne tranche pas ce point (question 1) : tant qu'il n'est pas tranché, la PR de code suit la consigne du ticket, écrit dans « Nouvelles questions » « Samuel : owner-approved attendu (ticket #222) », et le CEO la signale dans `#studio` comme une PR de workflow. Aucun agent ne pose ni ne retire `owner-approved` (0035, règle 2). Si la PR de code devait finalement modifier un fichier de `.github/workflows/`, elle deviendrait une PR de workflow et la porte exigerait le libellé d'elle-même.

## Décisions
Product Owner (détails fonctionnels), définitives sans veto de Samuel sous 2 jours, à lister dans la note de version suivante (rubrique « Décisions prises par le studio »).
- **PO-1 — Nom du fichier** `specs/P0c-suite-release.md`, sur le modèle de `P0-suite-2.md` et de l'intitulé du ticket.
- **PO-2 — Périmètre fermé** : exactement les quatre fichiers de « À livrer » ; le YAML de la porte n'est pas modifié, faute de besoin. Toute variable de plus que `PATH`, `HOME` et `GIT_LITERAL_PATHSPECS` sort du périmètre et revient au Tech Lead et à la Sécurité (question 2).
- **PO-3 — Preuve par le comportement** : le test nouveau (critère 4) montre que l'environnement du processus n'atteint plus `git`, avec une variable qui change réellement le résultat sur la version actuelle (`GIT_DIR`) ; la forme exacte du code est vérifiée par le régime existant (critères 1 à 3), sans test par chaîne de plus.
- **PO-4 — `files.at(-1)` dans la même PR**, comme le permet 0040 (A8) : même fichier, même ligne de liste, et l'accès calculé disparaîtrait sinon dans une seconde PR sur un chemin gardé.

Propositions au Tech Lead (outillage et tests), adoptées par sa validation (`techlead-approved`) ou corrigées dans sa revue :
- **TL-a — Pas de fonction exportée** pour construire l'environnement (un `gitEnv(process.env)` demanderait une ligne `ENV_ENTIER` `argument:gitEnv`, soit une capacité de plus à garder) : le littéral reste dans `workflowsTreeId`.
- **TL-b — Test placé dans `techlead-gate-workflow.test.ts`**, à côté des autres tests de `workflowsTreeId`, plutôt que dans un nouveau fichier.

## Hors périmètre
- Les autres parties de A8, permanentes : `execFileSync` et `process.cwd()` (0040 D2).
- La tâche `ia` de 0040 D1 (réécriture de `tests/unit/p0/cli.test.ts`, A6, accès de A7) : ticket séparé.
- L'étalement de `tests/unit/ci/visual-update.test.ts` et de `tests/unit/ci/techlead-gate-workflow.test.ts` : fichiers de test, admis par la section 5, forme 3.
- Étendre `owner-approved` à `scripts/ci/` (Q274, Samuel) ; seconde vérification depuis `main` (0035, question 2) ; P0c2 (contrôle de chemins, `CODEOWNERS`).
- Modifier le texte de 0040 ou de la spécification P0c : l'amendement M3 devient sans objet par la fusion de la PR de code, ce que sa description constate.
- `STATUS.md`, `QUESTIONS.md` : le CEO reporte les questions.

## Questions ouvertes
1. **Samuel, avec le CEO (bloque : la fusion de la PR de code, seulement si la réponse est « oui »)** : le ticket #222 dit « Touche .github : owner-approved requis », alors que la PR de code ne touchera pas `.github/` (« À livrer ») et que la porte ne l'exige que pour `.github/workflows/` (0035 ; Q274, ouverte, par défaut non). Faut-il attendre la pose d'`owner-approved` par Samuel sur cette PR ? Si oui, comment l'empêcher de fusionner avant, puisque la porte ne le vérifie pas ? Proposition : le Tech Lead ne pose `techlead-approved` qu'après la pose d'`owner-approved` par Samuel, et le CEO signale la PR dans `#studio` dès son ouverture. Recommandation : répondre à Q274 (couvrir `scripts/ci/`) plutôt que de traiter cette PR à part, puisqu'elle modifie le code que la porte exécute.
2. **Tech Lead et Sécurité (bloque : rien avant la PR de code ; la revue de celle-ci)** : confirmer que `PATH`, `HOME` et `GIT_LITERAL_PATHSPECS` suffisent sur `ubuntu-latest` après `actions/checkout` (aucune autre variable, pas de `safe.directory` à passer), et que garder `HOME` (donc `~/.gitconfig` du runner) est voulu. Proposition : oui aux trois, rien d'autre ; une variable de plus ne s'ajoute qu'avec une ligne `LECTURES_ENV` et un verdict Sécurité.
3. **Sécurité (bloque : la fusion de la PR de code)** : verdict sur la nouvelle ligne `LECTURES_ENV` (`scripts/ci/techlead-gate.mjs` : `PATH`, `HOME`) et sur le retrait des deux capacités, dans la revue consolidée de la PR de code.
