# T18 — `owner-approved` exigé pour toute PR qui modifie `.github/workflows/`

Rôle : release (outillage CI), revue Tech Lead et sécurité · Prérequis : aucun pour cette spécification ; la PR de code est créée après la fusion de #177 (voir « Ordre de fusion ») · Ticket #163 (Q245) · Référence : décisions 0019 § 3.3 et 0023 § 4 (porte `techlead-gate`), 0033 (PR #177), `docs/studio/mise-en-place.md` (« Chaîne de fusion automatique », annexe du prompt R1)

## Objectif
Appliquer la décision de Samuel du 2026-10-12 (10:35 CEST, `#studio`) :

> « Q245 : oui ; toute PR qui modifie .github/workflows/ est signalée dans #studio et attend le libellé owner-approved, que je pose moi-même. Ajoute ce contrôle à techlead-gate. »

Trois volets : la décision écrite, le contrôle dans la porte `techlead-gate`, le signalement dans `#studio` par le CEO.

## État de départ (vérifié le 2026-10-12 sur `origin/main` `b38e6e1`)
- `.github/workflows/` : `auto-merge.yml`, `ci.yml`, `release.yml`, `techlead-gate.yml`, `visual-update.yml`. #177 (ouverte) ajoute `post-merge-cleanup.yml` : c'est une PR de workflow.
- `techlead-gate.yml` tourne sur `pull_request` (`opened`, `synchronize`, `reopened`, `labeled`, `unlabeled`), lit les libellés par l'API au moment de l'exécution et délègue la décision à la fonction pure `decideGate` de `scripts/ci/techlead-gate.mjs` (types dans `techlead-gate.d.mts`, tests dans `tests/unit/ci/techlead-gate.test.ts`).
- Aujourd'hui, l'exemption (`STATUS.md`, `QUESTIONS.md`, `docs/releases/`) est calculée **dans le YAML** : `git diff --name-only "origin/${BASE_REF}...HEAD"` (sans `-z`, avec détection des renommages) puis `grep -vqE`, et le résultat est passé au Node sous forme du booléen `code` (`jq -n --argjson code`). La sortie `remove` de l'étape « Décider » commande le retrait de `techlead-approved`.
- Le jeu de règles « main protect » exige les vérifications `verify`, `docker` et `gate` (GitHub Actions). Non revérifié pour cette correction (réglage du dépôt, hors accès de l'API utilisée).
- Le libellé `owner-approved` existe dans le dépôt. Constat du 2026-10-12 : #177 porte `owner-approved` et `techlead-approved`, et ne touche ni `techlead-gate.yml` ni `scripts/ci/techlead-gate.mjs`.
- Les agents du studio agissent sur GitHub sous le compte `Samoulou`, comme Samuel : la porte ne peut pas distinguer un libellé posé par Samuel d'un libellé posé par un agent.
- Numéros de décision : jusqu'à 0030 et 0032 sur `main` (0029, #165, est fusionnée) ; 0031 (#172), 0033 (#177) et 0034 (#182) sont dans des PR ouvertes. **Le prochain numéro libre est 0035.**

## À livrer

### 1. Décision `docs/decisions/0035-owner-approved-workflows.md`
Numéro 0035, à revérifier au moment d'écrire la PR de code (`origin/main` et branches des PR ouvertes) ; s'il est pris, prendre le suivant libre et corriger cette spécification dans la même PR.

Contenu attendu, au format des décisions existantes (statut, date, ticket, contexte, décision, conséquences, quand revoir) :
- **Statut et décideurs** : décision de Samuel (Q245, `#studio`, 2026-10-12 10:35 CEST), citée mot pour mot. Modalités : « Décideurs : Tech Lead (outillage : T1 à T5 ci-dessous), Product Owner (D1 à D4) », décisions déléguées définitives sans veto de Samuel sous 2 jours, à lister dans la note de version suivante.
- **Règle** :
  1. Une PR dont le diff ajoute, modifie, supprime ou renomme un fichier sous `.github/workflows/`, ou remplace ce dossier par un fichier ou un lien symbolique, est une « PR de workflow ».
  2. Une PR de workflow ne fusionne pas sans le libellé `owner-approved`, que **seul Samuel pose**. Aucun agent ne pose ni ne retire `owner-approved` à la main. Cette règle lie les agents par leurs consignes (`.claude/agents/ceo.md` et `.claude/agents/tech-lead.md`, volet 3) ; elle ne lie les autres rôles qu'une fois ajoutée par Samuel à `CLAUDE.md` (question 1).
  3. `owner-approved` s'ajoute aux autres conditions de la porte : il ne remplace ni `techlead-approved`, ni la revue consolidée.
  4. `owner-approved` vaut pour un contenu de `.github/workflows/`. La porte le retire quand ce contenu a pu changer depuis qu'il a été posé : push après lequel l'arbre `.github/workflows` de la branche diffère de celui d'avant (y compris une fusion de `main` qui apporte des workflows), ouverture ou réouverture de la PR, ancien commit illisible (D2, T1). Un push qui ne change pas cet arbre le laisse en place.
  5. Sur une PR qui n'est pas une PR de workflow, `owner-approved` n'a aucun effet sur le verdict.
  6. Le CEO signale chaque PR de workflow dans `#studio` (volet 3).
  7. Risques résiduels (rubrique ci-dessous), écrits tels quels.
- **Conséquences** : `docs/studio/mise-en-place.md` (étape 4 de la « Chaîne de fusion automatique ») et 0023 § 4.2 sont complétés par un renvoi à 0035 ; la règle s'applique aux PR ouvertes dès la fusion de la PR de code (voir « Ordre de fusion »).

### 2. Contrôle dans `techlead-gate`
Toute la logique est dans `scripts/ci/techlead-gate.mjs` (et ses types dans `techlead-gate.d.mts`) ; **le YAML ne filtre plus aucun chemin** et ne calcule ni `code`, ni `workflows`, ni `workflowsChanged`.

**Fonctions pures** (exportées, sans accès disque ni Git) :
- `touchesWorkflows(files: string[]): boolean` : vrai si un chemin vaut exactement `.github/workflows` (dossier remplacé par un fichier ou un lien symbolique) ou commence exactement par `.github/workflows/`. Comparaison sensible à la casse, préfixe ancré au début du chemin.
- `classifyFiles(files: string[]): { code: boolean; workflows: boolean; unreadable: string[] }` :
  - `unreadable` : les chemins qui commencent par `"` (forme citée de Git, signe d'une liste lue sans `-z`) ;
  - `workflows` : `touchesWorkflows(files)`, ou vrai si `unreadable` n'est pas vide ;
  - `code` : vrai si un chemin n'est pas exempté (exemption actuelle reprise à l'identique : `^(STATUS\.md|QUESTIONS\.md|docs/releases/)`), ou si `workflows` est vrai, ou si `unreadable` n'est pas vide ; faux pour une liste vide (comme aujourd'hui).
- `readFileList(bytes: Uint8Array): string[]` : décode en UTF-8 strict (`TextDecoder` avec `fatal: true`, qui lève une erreur sur un octet invalide), coupe sur le caractère NUL, retire le dernier élément vide. Aucun autre traitement (pas de `trim`, pas de déguillemetage).
- `decideGate` reçoit trois entrées optionnelles de plus : `workflows` (défaut `false`), `workflowsChanged` (défaut `false`) et `filesUnreadable` (défaut `false`). Les appels existants, sans ces champs, gardent exactement leur résultat. Elle renvoie en plus `removeOwnerApproval: boolean`.
  - `workflows: true` implique `code: true` (une PR de workflow n'est jamais exemptée), quel que soit `code` en entrée.
  - `removeOwnerApproval` vaut vrai si et seulement si `owner-approved` est présent et `workflowsChanged` est vrai. Message exact : « owner-approved est retiré : le contenu de .github/workflows/ a pu changer (push, ouverture ou réouverture de la PR). Samuel doit valider le contenu actuel. » Pour la suite de la décision, `owner-approved` est alors considéré comme absent.
  - Si `workflows` est vrai et que `owner-approved` manque (ou vient d'être retiré) : `pass: false`, avec le message exact « PR qui modifie .github/workflows/ : le libellé owner-approved, posé par Samuel, est nécessaire (décision 0035). » Ce message figure dans **toutes** les sorties en échec dans ce cas, y compris quand un autre motif d'échec existe (`techlead-approved` absent, `changes-requested`, `synchronize`, approbation périmée).
  - Si `filesUnreadable` est vrai : `pass: false`, avec le message exact « Liste des fichiers illisible (chemin cité ou encodage invalide) : la porte échoue par précaution (décision 0035). »
  - Si `workflows`, `workflowsChanged` et `filesUnreadable` sont faux : `pass`, `removeApproval`, `messages` et `warnings` sont identiques à ceux d'aujourd'hui pour toutes les entrées (aucune régression). Les règles de 0023 § 4 ne changent pas.

**Fonction Git** (exportée, testée dans des dépôts jetables) :
- `workflowsTreeChanged({ before, after, cwd }): boolean` : compare l'objet `<sha>:.github/workflows` (arbre, fichier, lien ou absence) entre `before` et `after`. Vrai s'ils diffèrent. Vrai aussi (échec fermé) si `before` est vide, vaut 40 zéros (branche nouvelle) ou ne désigne pas un commit présent dans le clone (poussée forcée dont l'ancien commit n'a pas été récupéré). Faux si les deux commits n'ont pas ce chemin. Les commandes Git sont lancées avec `execFileSync` (sans shell), les sha passés en arguments.

**Ligne de commande** : `node scripts/ci/techlead-gate.mjs <entrée.json> <fichiers.nul>`.
- `<fichiers.nul>` : la liste brute produite par `git diff -z`, lue en octets puis par `readFileList`. Fichier absent ou second argument manquant : erreur, code de sortie non nul (la porte échoue). Encodage invalide : `filesUnreadable: true`, `code` et `workflows` vrais.
- `code` et `workflows` viennent de `classifyFiles` ; les champs `code` et `workflows` éventuellement présents dans `<entrée.json>` sont ignorés.
- `workflowsChanged` selon l'action : `synchronize` → `workflowsTreeChanged({ before, after, cwd: process.cwd() })` ; `labeled` et `unlabeled` → faux ; `opened`, `reopened` et toute autre action → vrai (échec fermé : sur une PR fermée, on peut pousser un nouveau contenu sans `synchronize`, puis rouvrir).
- La décision écrite sur la sortie standard contient aussi `code`, `workflows` et `workflowsChanged`, pour le journal.

**Workflow `techlead-gate.yml`** :
- Étape « Lister les fichiers de la PR » (remplace « Détecter une PR exemptée ») : `git diff -z --name-only --no-renames "origin/${BASE_REF}...HEAD" > files.nul`, rien d'autre. `-z` imprime les chemins tels quels, séparés par NUL, sans guillemets ni échappement octal (`core.quotepath` est alors sans effet) ; `--no-renames` fait apparaître l'ancien chemin d'un renommage hors de `.github/workflows/`.
- `gate-input.json` (extension du `jq -n` actuel) : `action`, `headSha`, `labels`, `reviews` comme aujourd'hui, plus `before` et `after` (`github.event.before` et `github.event.after`, passés par `env` et `--arg`, chaînes vides hors `synchronize`) ; plus de `--argjson code`.
- Étape « Décider » : `node scripts/ci/techlead-gate.mjs gate-input.json files.nul > decision.json` ; sorties `remove` (inchangée, pour `techlead-approved`) et `removeOwner` (nouvelle, `jq -r .removeOwnerApproval`).
- Nouvelle étape « Retirer owner-approved », conditionnée par `removeOwner`, sur le modèle de « Retirer techlead-approved » : `DELETE` du libellé, 404 toléré sans commentaire, sinon un commentaire « techlead-gate : owner-approved retiré. » suivi des messages.
- Déclencheurs, droits, nom du job (`gate`), `concurrency`, `fetch-depth: 0` et actions épinglées inchangés. `labeled` et `unlabeled` sont déjà présents : la porte se relance quand Samuel pose ou retire `owner-approved`.
- L'en-tête de commentaire du fichier cite 0035.

**Fils de discussion des PR** : quand l'exécution échoue faute d'`owner-approved`, aucun commentaire n'est publié (le motif est dans le journal du job) ; seul le retrait du libellé produit un commentaire (D4).

### 3. Signalement dans `#studio` par le CEO, consignes des agents
Samuel colle lui-même le prompt d'une routine : le dépôt ne contient qu'une copie (0023 § 1). La PR de code livre donc :
- dans `.claude/agents/ceo.md`, la règle : « Toute PR ouverte d'une branche claude/… qui modifie .github/workflows/ et n'a pas owner-approved est signalée dans #studio. Tu ne poses ni ne retires owner-approved. » ;
- dans `.claude/agents/tech-lead.md`, la ligne : « Tu ne poses ni ne retires owner-approved (décision 0035) ; une PR de workflow n'est fusionnable qu'avec ce libellé, posé par Samuel. » ;
- dans `docs/studio/mise-en-place.md`, le texte à ajouter au prompt R1 (après l'étape 6 actuelle), proposé à Samuel :
  « 6 bis. Pour chaque PR ouverte d'une branche claude/… dont le diff touche .github/workflows/ et qui n'a pas le libellé owner-approved : cherche dans l'historique de #studio le dernier message « owner-approved attendu — PR #<n> ». S'il n'y en a pas, ou s'il est antérieur à la date du dernier commit de la PR, poste « owner-approved attendu — PR #<n> : <titre> ; fichiers : <liste sous .github/workflows/> ; revue Tech Lead : <techlead-approved, changes-requested ou en attente>. <lien> », signé « Studio ». Liste ces PR dans STATUS.md, rubrique « Décisions attendues ». Ne pose jamais owner-approved. »
- la même consigne dans la PR elle-même : toute PR de workflow écrit, dans « Nouvelles questions » de sa description, « Samuel : owner-approved attendu (décision 0035) ».

Le CEO publie au plus un message par PR et par commit de tête : il se fie à l'historique de `#studio` et à la date du dernier commit de la PR, sans chercher quel push a touché `.github/workflows/`.

## Tests (dans la PR de code)
Tous les tests lisent les fichiers comme du texte : **aucune nouvelle dépendance** (pas de `yaml` ni `js-yaml`). Aucun test existant n'est supprimé ni désactivé.

Dans `tests/unit/ci/techlead-gate.test.ts` (fonctions pures et ligne de commande) :
- **`touchesWorkflows`** : vrai pour `.github/workflows/ci.yml`, `.github/workflows/sous/dossier.yml`, `.github/workflows/é.yml`, `.github/workflows/a"b.yml` et `.github/workflows` seul ; faux pour `.github/ISSUE_TEMPLATE/bug.md`, `.github/workflowsx/a.yml`, `docs/.github/workflows/a.yml`, `.GitHub/Workflows/a.yml`, `scripts/ci/techlead-gate.mjs` et une liste vide.
- **`classifyFiles`** : `["STATUS.md"]` → `code` et `workflows` faux ; `[".github/workflows/ci.yml"]` → les deux vrais ; `["\".github/workflows/\\303\\251.yml\""]` (forme citée) → `unreadable` non vide, `code` et `workflows` vrais ; `[]` → tout faux.
- **`readFileList`** : octets de `.github/workflows/é.yml\0docs/a.md\0` → deux chemins exacts ; chemin contenant `"`, une tabulation ou un espace conservé tel quel ; octet `0xff` → erreur.
- **Matrice** : les cinq actions (`opened`, `synchronize`, `reopened`, `labeled`, `unlabeled`) × les jeux de libellés actuels, auxquels s'ajoutent `["owner-approved"]` et `["techlead-approved", "owner-approved"]`, × `workflows` vrai et faux, × `workflowsChanged` vrai et faux. Pour `workflows: false` et `workflowsChanged: false`, `pass` et `removeApproval` valent exactement l'attendu actuel. Pour `workflows: true`, `pass` vaut l'attendu actuel **et** (`owner-approved` présent **et** pas retiré).
- **Défauts** : chaque cas existant appelé sans `workflows`, `workflowsChanged` ni `filesUnreadable` donne un résultat identique (égalité profonde) à l'appel avec ces trois champs à `false`, et `removeOwnerApproval` faux.
- **`workflows: true, code: false`** : traité comme `code: true` (pas d'exemption).
- **Message** : présent mot pour mot dans chaque sortie en échec où `workflows` est vrai et `owner-approved` absent ou retiré ; absent dès que `owner-approved` est présent et non retiré.
- **Retrait** : `removeOwnerApproval` vrai seulement si `owner-approved` présent et `workflowsChanged` vrai, et alors `pass: false` pour `workflows: true`.
- **Indépendance** : `owner-approved` sans `techlead-approved` ne fait pas passer la porte ; `owner-approved` sur une PR sans workflow ne change pas le verdict.
- **Ligne de commande** (`node scripts/ci/techlead-gate.mjs <entrée.json> <fichiers.nul>`, lancée par `execFileSync`) :
  - liste `.github/workflows/é.yml\0` sans `owner-approved` → `pass: false`, message de 0035, `workflows: true` ;
  - liste contenant `".github/workflows/\303\251.yml"` (forme citée) → `pass: false` avec le message « liste illisible » ;
  - liste avec un octet invalide → `pass: false` avec le même message ;
  - `code: false` et `workflows: false` écrits dans l'entrée avec une liste qui touche `.github/workflows/` → ignorés, `workflows: true` ;
  - second argument manquant → code de sortie non nul ;
  - actions `opened` et `reopened` avec `owner-approved` → `removeOwnerApproval: true` ; `labeled` → faux.

Dans `tests/unit/ci/techlead-gate-workflow.test.ts` (dépôts Git jetables, sur le modèle de `tests/unit/ci/visual-update.test.ts`) :
- **Rejeu de l'étape « Lister les fichiers de la PR »** (script extrait du YAML, comme `runScript` de `visual-update.test.ts`), dans un dépôt avec une branche de base `origin/main`, puis passage de `files.nul` à la ligne de commande :
  - ajout de `.github/workflows/é.yml` → `workflows: true` (le cas qui échouait ouvert sans `-z`) ;
  - ajout de `.github/workflows/a"b.yml` (nom que Git cite sans `-z`) → `workflows: true` ;
  - renommage de `.github/workflows/a.yml` vers `docs/a.yml` → `workflows: true` ;
  - suppression de `.github/workflows/a.yml` → `workflows: true` ;
  - remplacement du dossier `.github/workflows` par un fichier → `workflows: true` ;
  - modification de `STATUS.md` seul → `code: false`, `workflows: false`.
- **`workflowsTreeChanged`** : push qui modifie un workflow → vrai ; push qui ne touche que `docs/` → faux ; push qui supprime un workflow → vrai ; push qui renomme un workflow hors du dossier → vrai ; fusion de `main` qui apporte un workflow → vrai ; fusion de `main` sans workflow → faux ; `before` vide, à 40 zéros ou absent du dépôt → vrai ; aucun des deux commits n'a le dossier → faux.
- **Lecture du YAML** (par chaîne) : `on.pull_request.types` contient `labeled` et `unlabeled` ; l'événement reste `pull_request` (pas `pull_request_target`) ; le job s'appelle toujours `gate` ; aucune étape ne contient `grep` sur la liste des fichiers ni `--argjson code` ; une étape conditionnée par `removeOwner` retire `owner-approved` ; l'en-tête cite 0035.

## Critères d'acceptation
- [ ] `docs/decisions/0035-owner-approved-workflows.md` existe (ou le numéro libre suivant, justifié dans la PR), cite Samuel mot pour mot, nomme les décideurs des modalités et contient les points 1 à 7 du volet 1 (test par chaîne : citation exacte présente).
- [ ] Une PR de workflow avec `techlead-approved` et une revue consolidée du head courant, sans `owner-approved`, a `pass: false` avec le message de 0035 (matrice et test de ligne de commande).
- [ ] Un fichier ajouté sous `.github/workflows/` avec un nom non ASCII ou un nom que Git cite fait de la PR une PR de workflow ; une entrée citée ou mal encodée fait échouer la porte (tests de rejeu et de ligne de commande).
- [ ] Une PR qui renomme un fichier de `.github/workflows/` vers un autre dossier, le supprime ou remplace le dossier par un fichier est une PR de workflow (tests de rejeu).
- [ ] Un push qui change l'arbre `.github/workflows` (y compris une fusion de `main`), une ouverture, une réouverture ou un `before` illisible retirent `owner-approved` ; un push qui ne change pas cet arbre et les événements `labeled` / `unlabeled` le laissent (tests `workflowsTreeChanged` et ligne de commande).
- [ ] Une PR qui ne touche pas `.github/workflows/` a exactement le même verdict qu'avant (matrice et test des défauts).
- [ ] Le YAML ne calcule plus `code` et lit la liste avec `git diff -z --name-only --no-renames` (test par chaîne et rejeu).
- [ ] 0023 § 4.2 renvoie à 0035 et l'en-tête de `techlead-gate.yml` cite 0035 (tests par chaîne).
- [ ] Le texte du prompt R1 (étape 6 bis) est dans `docs/studio/mise-en-place.md`, la règle dans `.claude/agents/ceo.md` et la ligne dans `.claude/agents/tech-lead.md` ; l'étape 4 de la « Chaîne de fusion automatique » mentionne `owner-approved` pour les PR de workflow (tests par chaîne).
- [ ] `pnpm verify` passe ; aucun test existant supprimé ni désactivé.
- [ ] La PR de code porte `Closes #163` et, dans « Nouvelles questions », « Samuel : owner-approved attendu (décision 0035) », ainsi que l'action attendue de Samuel pour le constat en conditions réelles : poser `owner-approved` sur la PR de code (la porte se relance par `labeled`), puis le retirer et le reposer ; l'agent ajoute ensuite à la description les liens vers ces exécutions. Ce constat n'est pas un critère bloquant de fusion de l'agent : il dépend de Samuel.

## Ordre de fusion
1. **Cette spécification** : un seul fichier nouveau sous `specs/`, indépendante de #177. Elle compte comme code pour la porte (seuls `STATUS.md`, `QUESTIONS.md` et `docs/releases/` sont exemptés) : elle passe par la revue Tech Lead.
2. **#177** (T20, `claude/project-thread-olngx3`, décision 0033). Elle a déjà `owner-approved` et `techlead-approved` ; Samuel la fusionne à la main. Elle ne touche ni `techlead-gate.yml` ni `scripts/ci/techlead-gate.mjs`. Fichier commun avec la PR de code : `docs/studio/mise-en-place.md`, où #177 ajoute une ligne sous l'étape 5 et où T18 modifie l'étape 4 (lignes voisines, conflit de texte possible).
3. **La PR de code T18**, créée depuis `main` après la fusion de #177 (ou rebasée dessus) : elle modifie l'étape 4 sans toucher la ligne ajoutée par #177. Elle modifie `techlead-gate.yml` : elle est elle-même une PR de workflow et attend `owner-approved`.

Si la PR de code est prête avant la fusion de #177, elle attend. Si elle fusionne d'abord malgré tout, #177 garde son `owner-approved` jusqu'à son prochain push ou sa prochaine réouverture, et seul `mise-en-place.md` est à rebaser.

## Risques résiduels (à écrire dans 0035)
- **Auteur du libellé non vérifiable.** Les agents utilisent le compte `Samoulou` ; la porte vérifie la présence d'`owner-approved`, pas l'identité de qui l'a posé. La règle « seul Samuel pose owner-approved » repose sur les consignes des agents (question 1).
- **Une PR qui modifie la porte se juge avec sa propre version.** Sur `pull_request`, GitHub exécute `techlead-gate.yml` et `scripts/ci/techlead-gate.mjs` tels qu'ils sont dans la PR (0023 § 4.7, pour ne jamais donner un jeton en écriture au code d'un fork). Une PR qui affaiblit la porte peut la faire passer sans `owner-approved`, ou **désactiver le retrait d'`owner-approved` et conserver un libellé posé sur un contenu antérieur**. Le filet : le signalement dans `#studio` (une modification de `techlead-gate.yml` est une PR de workflow) et la relecture par Samuel du contenu qu'il approuve (question 2).
- **Libellé posé pendant un push.** Si Samuel pose `owner-approved` après un push sans avoir vu le nouveau contenu, l'exécution `labeled` ne le retire pas. Le message `#studio` cite le dernier commit ; Samuel approuve le contenu affiché par la PR au moment où il pose le libellé.
- **Fichiers hors du dossier.** `scripts/ci/` est exécuté par les workflows mais n'est pas sous `.github/workflows/` : une PR qui ne modifie que `scripts/ci/techlead-gate.mjs` n'attend pas `owner-approved` (question 3).
- **Changement de branche de base** (`edited`) : il ne relance pas la porte (événement absent des déclencheurs, inchangés par T18). Le contenu de la branche ne change pas, mais la liste des fichiers comparés à la nouvelle base peut changer (question 5).

## Décisions
Définitives sans veto de Samuel sous 2 jours, à lister dans la note de version suivante.

**Product Owner (détails fonctionnels)**
- **D1 — Numéro 0035** pour la décision écrite, prochain libre au 2026-10-12 (voir « État de départ »).
- **D2 — `owner-approved` vaut pour un contenu de workflows.** Un contenu qui a pu changer n'est pas approuvé : push qui change l'arbre `.github/workflows` (y compris une fusion de `main`), ouverture, réouverture. Un push qui ne touche pas ce dossier (test, documentation) ne retire pas le libellé, pour ne pas le faire reposer à Samuel à chaque correction.
- **D3 — Périmètre strict `.github/workflows/`**, comme écrit par Samuel ; pas `.github/` en entier ni `scripts/ci/` (question 3).
- **D4 — Pas de commentaire à chaque échec** faute d'`owner-approved` : la porte se relance à chaque changement de libellé, un commentaire par exécution encombrerait la PR. Le signalement passe par `#studio`.

**Tech Lead (outillage) — proposées par cette spécification, adoptées par sa validation (`techlead-approved`) ou corrigées dans sa revue**
- **T1 — Mise en œuvre de D2** : comparaison de l'objet `.github/workflows` entre `before` et `after` sur `synchronize` ; vrai par défaut sur toute autre action que `labeled` / `unlabeled` et sur un `before` illisible (échec fermé), plutôt qu'un libellé lié à un sha (non vérifiable : la porte ne sait pas qui a posé le libellé ni sur quel head).
- **T2 — Liste des fichiers en `git diff -z`**, séparée par NUL, transmise au Node dans un fichier et décodée en UTF-8 strict ; toute entrée citée ou mal encodée fait échouer la porte.
- **T3 — La ligne de commande calcule `code`, `workflows` et `workflowsChanged`** ; le YAML ne filtre aucun chemin, pour que la règle testée soit celle qui tourne en production.
- **T4 — Pas de secret Slack dans la porte** : le signalement est fait par le CEO à son cycle R1, et non par `techlead-gate`, qui exécute le code de la PR et ne doit pas recevoir `SLACK_WEBHOOK_STUDIO`. Délai de signalement : au plus un cycle (3 h).
- **T5 — Tests sans nouvelle dépendance**, par chaîne et par rejeu dans des dépôts Git jetables.

## Hors périmètre
- Changer le jeu de règles « main protect », les déclencheurs ou l'événement de la porte (`pull_request_target`) : questions 2 et 5.
- Fermer #163 : la PR de code le ferme.
- Modifier `STATUS.md`, `QUESTIONS.md` ou `CLAUDE.md` : le CEO reporte les questions, `CLAUDE.md` est à Samuel.
- Coller le prompt R1 dans la routine : Samuel.

## Questions ouvertes
1. **Samuel, avant la fusion de la PR de code (bloque la règle « seul Samuel pose » pour les rôles autres que CEO et Tech Lead) :** faut-il ajouter à `CLAUDE.md`, rubrique « Jamais », la ligne « Poser ou retirer le libellé owner-approved » ? Modifier ces règles lui est réservé. À plus long terme, un compte GitHub distinct pour les agents rendrait l'auteur du libellé vérifiable par la porte (compte externe : Samuel).
2. **Tâche séparée, ne bloque pas T18 :** le Tech Lead recommande une seconde vérification obligatoire exécutée depuis `main` (`pull_request_target`, sans exécuter le code de la PR, liste des fichiers lue par l'API), pour qu'une PR qui modifie la porte ne puisse pas se juger elle-même. Le CEO peut l'ordonnancer ; son ajout au jeu de règles « main protect » est un réglage du dépôt, à faire par Samuel.
3. **Samuel (ne bloque pas T18) :** le contrôle doit-il couvrir aussi `scripts/ci/` (exécuté par les workflows) et le reste de `.github/` (par exemple de futures actions composites `.github/actions/`) ? Par défaut, le périmètre reste `.github/workflows/` (D3).
4. **Samuel (ne bloque pas T18) :** coller l'étape 6 bis dans le prompt de la routine R1 après la fusion de la PR de code ; d'ici là, le signalement reste manuel (le CEO l'applique depuis `.claude/agents/ceo.md`).
5. **Tech Lead (ne bloque pas T18) :** faut-il ajouter `edited` aux déclencheurs de la porte, pour qu'un changement de branche de base recalcule la liste des fichiers ? Le problème concerne aussi `techlead-approved` : il dépasse T18.
6. **Samuel (ne bloque pas T18) :** `CLAUDE.md` ne donne pas de préfixe de commit au Product Owner ; ses spécifications sont signées `[ceo]` par défaut. Faut-il un préfixe propre (par exemple `[po]`) ?
