# T18 — `owner-approved` exigé pour toute PR qui modifie `.github/workflows/`

Rôle : release (outillage CI), revue Tech Lead et sécurité · Prérequis : aucun ; à fusionner après #177 (voir « Ordre de fusion ») · Ticket #163 (Q245) · Référence : décisions 0019 § 3.3 et 0023 § 4 (porte `techlead-gate`), 0033 (PR #177), `docs/studio/mise-en-place.md` (« Chaîne de fusion automatique », annexe du prompt R1)

## Objectif
Appliquer la décision de Samuel du 2026-10-12 (10:35 CEST, `#studio`) :

> « Q245 : oui ; toute PR qui modifie .github/workflows/ est signalée dans #studio et attend le libellé owner-approved, que je pose moi-même. Ajoute ce contrôle à techlead-gate. »

Trois volets : la décision écrite, le contrôle dans la porte `techlead-gate`, le signalement dans `#studio` par le CEO.

## État de départ (vérifié le 2026-10-12 sur `origin/main` `557acca`)
- `.github/workflows/` : `auto-merge.yml`, `ci.yml`, `release.yml`, `techlead-gate.yml`, `visual-update.yml`.
- `techlead-gate.yml` tourne sur `pull_request` (`opened`, `synchronize`, `reopened`, `labeled`, `unlabeled`), lit les libellés par l'API au moment de l'exécution et délègue la décision à la fonction pure `decideGate` de `scripts/ci/techlead-gate.mjs` (types dans `techlead-gate.d.mts`, tests dans `tests/unit/ci/techlead-gate.test.ts`). La liste des fichiers vient de `git diff --name-only origin/<base>...HEAD`, **avec** détection des renommages.
- Le jeu de règles « main protect » exige les vérifications `verify`, `docker` et `gate` (GitHub Actions). Aucun acteur ne contourne ces règles.
- Le libellé `owner-approved` existe déjà dans le dépôt. Samuel l'a posé à la main sur #177 le 2026-10-12 à 12:12 UTC.
- Les agents du studio agissent sur GitHub sous le compte `Samoulou`. Une partie de leurs actions est marquée `performed_via_github_app: claude` dans les événements du ticket, une autre ne l'est pas : rien ne distingue donc de façon fiable un libellé posé par Samuel d'un libellé posé par un agent.
- Numéros de décision pris : jusqu'à 0028, puis 0030 et 0032 sur `main` ; 0029 (#165), 0031 (#172), 0033 (#177) et 0034 (#182) dans des PR ouvertes. **Le prochain numéro libre est 0035.**

## À livrer

### 1. Décision `docs/decisions/0035-owner-approved-workflows.md`
Numéro 0035, à revérifier au moment d'écrire la PR de code (`origin/main` et branches des PR ouvertes) ; s'il est pris, prendre le suivant libre et corriger cette spécification dans la même PR.

Contenu attendu, au format des décisions existantes (statut, date, ticket, contexte, décision, conséquences, quand revoir) :
- **Statut** : décision de Samuel (Q245, `#studio`, 2026-10-12 10:35 CEST), citée mot pour mot ; les modalités (points 3 à 7 ci-dessous) sont des décisions déléguées (outillage : Tech Lead ; détails fonctionnels : Product Owner), définitives sans veto de Samuel sous 2 jours, à lister dans la note de version suivante.
- **Règle** :
  1. Une PR dont le diff ajoute, modifie, supprime ou renomme un fichier sous `.github/workflows/` est une « PR de workflow ».
  2. Une PR de workflow ne fusionne pas sans le libellé `owner-approved`, que **seul Samuel pose**. Aucun agent ne pose `owner-approved` ; aucun agent ne le retire à la main.
  3. `owner-approved` s'ajoute aux autres conditions de la porte : il ne remplace ni `techlead-approved`, ni la revue consolidée.
  4. Un nouveau push qui **change le contenu** de `.github/workflows/` dans la PR retire `owner-approved` (voir Décisions, D2). Un push qui ne touche pas ce dossier le laisse en place.
  5. Sur une PR qui n'est pas une PR de workflow, `owner-approved` n'a aucun effet.
  6. Le CEO signale chaque PR de workflow dans `#studio` (volet 3).
  7. Limites connues (volet « Risques résiduels » ci-dessous), écrites telles quelles.
- **Conséquences** : `docs/studio/mise-en-place.md` (étape 4 de la « Chaîne de fusion automatique ») et 0023 § 4.2 sont complétés par un renvoi à 0035 ; la règle s'applique aux PR ouvertes dès la fusion de la PR de code (voir « Ordre de fusion »).

### 2. Contrôle dans `techlead-gate`
- **Fonction pure** `touchesWorkflows(files: string[]): boolean` dans `scripts/ci/techlead-gate.mjs` (et son type dans `techlead-gate.d.mts`) : vrai si un chemin commence exactement par `.github/workflows/`. Comparaison sensible à la casse ; préfixe ancré au début du chemin.
- **`decideGate`** reçoit deux entrées de plus : `workflows: boolean` (la PR est une PR de workflow) et `workflowsChanged: boolean` (sur `synchronize` seulement : le push a changé le contenu de `.github/workflows/`). Elle renvoie en plus `removeOwnerApproval: boolean`.
  - Si `workflows` est vrai et que `owner-approved` manque : `pass: false`, avec le message exact « PR qui modifie .github/workflows/ : le libellé owner-approved, posé par Samuel, est nécessaire (décision 0035). »
  - Ce message figure dans **toutes** les sorties en échec d'une PR de workflow sans `owner-approved`, y compris quand un autre motif d'échec existe déjà (`techlead-approved` absent, `changes-requested`, `synchronize`, approbation périmée) : Samuel et le CEO voient dans le journal tout ce qui manque.
  - Sur `synchronize`, si `workflowsChanged` est vrai et `owner-approved` présent : `removeOwnerApproval: true`, avec le message « Nouveau push qui modifie .github/workflows/ : owner-approved est retiré, Samuel doit valider le nouveau contenu. »
  - Si `workflows` est faux : le résultat est identique à celui d'aujourd'hui pour toutes les entrées (aucune régression).
  - Les règles existantes (0023 § 4) ne changent pas.
- **Workflow `techlead-gate.yml`** :
  - Liste des fichiers avec `git diff --name-only --no-renames origin/<base>...HEAD`, pour qu'un renommage hors de `.github/workflows/` liste aussi l'ancien chemin. La même liste sert à l'exemption existante et à `touchesWorkflows`.
  - Calcul de `workflowsChanged` sur `synchronize` : vrai si l'arbre `.github/workflows` diffère entre `github.event.before` et `github.event.after`. Si `before` est illisible (poussée forcée dont l'ancien commit n'est plus récupérable, par exemple) : vrai (échec fermé).
  - Nouvelle étape « Retirer owner-approved », sur le modèle de « Retirer techlead-approved » : `DELETE` du libellé, 404 toléré, un commentaire qui reprend les messages.
  - Déclencheurs, droits, nom du job (`gate`), `concurrency` et actions épinglées inchangés. `labeled` et `unlabeled` sont déjà présents : la porte se relance quand Samuel pose ou retire `owner-approved`.
  - L'en-tête de commentaire du fichier cite 0035.
- **Fils de discussion des PR** : quand l'exécution échoue faute d'`owner-approved`, aucun commentaire n'est publié (le motif est dans le journal du job) ; seul le retrait du libellé produit un commentaire.

### 3. Signalement dans `#studio` par le CEO
Samuel colle lui-même le prompt d'une routine : le dépôt ne contient qu'une copie (0023 § 1). La PR de code livre donc :
- dans `.claude/agents/ceo.md`, la règle : « Toute PR ouverte d'une branche claude/… qui modifie .github/workflows/ et n'a pas owner-approved est signalée dans #studio. » ;
- dans `docs/studio/mise-en-place.md`, le texte à ajouter au prompt R1 (étape 6 actuelle), proposé à Samuel :
  « 6 bis. Pour chaque PR ouverte d'une branche claude/… dont le diff touche .github/workflows/ et qui n'a pas le libellé owner-approved : si aucun message « owner-approved attendu — PR #<n> » n'a été posté dans #studio depuis son dernier push touchant .github/workflows/, poste « owner-approved attendu — PR #<n> : <titre> ; fichiers : <liste sous .github/workflows/> ; revue Tech Lead : <techlead-approved, changes-requested ou en attente>. <lien> », signé « Studio ». Liste ces PR dans STATUS.md, rubrique « Décisions attendues ». Ne pose jamais owner-approved. »
- la même consigne dans la PR elle-même : toute PR de workflow écrit, dans « Nouvelles questions » de sa description, « Samuel : owner-approved attendu (décision 0035) ».

Le CEO ne publie qu'un message par PR et par contenu de workflow : il se fie à l'historique de `#studio` (recherche du texte « owner-approved attendu — PR #<n> »).

## Tests (dans la PR de code)
Dans `tests/unit/ci/techlead-gate.test.ts`, sans supprimer aucun test existant :
- **`touchesWorkflows`** : vrai pour `.github/workflows/ci.yml`, `.github/workflows/sous/dossier.yml` et un fichier supprimé de ce dossier ; faux pour `.github/ISSUE_TEMPLATE/bug.md`, `.github/workflowsx/a.yml`, `docs/.github/workflows/a.yml`, `.GitHub/Workflows/a.yml`, `scripts/ci/techlead-gate.mjs` et une liste vide.
- **Matrice** : les quatre actions × les jeux de libellés actuels, auxquels s'ajoutent `["owner-approved"]` et `["techlead-approved", "owner-approved"]`, × `workflows` vrai et faux. Pour `workflows: true`, `pass` vaut l'attendu actuel **et** `owner-approved` présent. Pour `workflows: false`, `pass` et `removeApproval` valent exactement l'attendu actuel.
- **Message** : présent mot pour mot dans chaque sortie en échec où `workflows` est vrai et `owner-approved` absent ; absent dès que `owner-approved` est présent.
- **Retrait** : `removeOwnerApproval` vaut vrai seulement pour `synchronize` + `workflowsChanged` + `owner-approved` présent ; faux pour `labeled`, `unlabeled`, `opened`, et pour `synchronize` sans changement de `.github/workflows/`.
- **Indépendance** : poser `owner-approved` sans `techlead-approved` ne fait pas passer la porte ; `owner-approved` sur une PR sans workflow ne change rien.
- **Lecture du workflow** (test statique du fichier YAML, comme `tests/unit/ci/visual-update.test.ts`) : `on.pull_request.types` contient `labeled` et `unlabeled` ; la commande de diff contient `--no-renames` ; une étape retire `owner-approved` ; le job s'appelle toujours `gate` ; l'événement reste `pull_request` (pas `pull_request_target`).
- **Ligne de commande** : `node scripts/ci/techlead-gate.mjs <entrée.json>` avec `workflows: true` et sans `owner-approved` écrit une décision `pass: false` contenant le message.

## Critères d'acceptation
- [ ] `docs/decisions/0035-owner-approved-workflows.md` existe (ou le numéro libre suivant, justifié dans la PR), cite Samuel mot pour mot et contient les points 1 à 7 du volet 1.
- [ ] Une PR qui modifie un fichier de `.github/workflows/`, avec `techlead-approved` et une revue consolidée du head courant mais sans `owner-approved`, a la vérification `gate` en échec avec le message de la décision 0035 (test unitaire et constat sur la PR de code elle-même, qui modifie `techlead-gate.yml`).
- [ ] Quand Samuel pose `owner-approved` sur cette PR, la porte se relance (événement `labeled`) et passe si les autres conditions sont réunies ; quand il le retire, elle se relance et échoue (constat sur la PR de code, lien vers les deux exécutions dans sa description).
- [ ] Une PR qui renomme un fichier de `.github/workflows/` vers un autre dossier, ou le supprime, est traitée comme une PR de workflow (test).
- [ ] Un push qui modifie `.github/workflows/` retire `owner-approved` et publie un commentaire ; un push qui ne le modifie pas le laisse (tests de la fonction ; le calcul de `workflowsChanged` est vérifié par relecture et décrit dans la PR).
- [ ] Une PR qui ne touche pas `.github/workflows/` a exactement le même verdict qu'avant (matrice `workflows: false`).
- [ ] Le texte du prompt R1 (étape 6 bis) est dans `docs/studio/mise-en-place.md` et la règle dans `.claude/agents/ceo.md`.
- [ ] `docs/studio/mise-en-place.md`, étape 4 de la « Chaîne de fusion automatique », mentionne `owner-approved` pour les PR de workflow.
- [ ] `pnpm verify` passe ; aucun test existant supprimé ni désactivé.
- [ ] La PR de code porte `Closes #163` et, dans « Nouvelles questions », « Samuel : owner-approved attendu (décision 0035) ».

## Ordre de fusion
1. **#177** (T20, `claude/project-thread-olngx3`, décision 0033) d'abord. Elle a déjà `owner-approved` et `techlead-approved`, Samuel la fusionne à la main. Elle ne touche ni `techlead-gate.yml` ni `scripts/ci/techlead-gate.mjs` : aucun conflit de code. Le seul fichier commun prévu est `docs/studio/mise-en-place.md` (« Chaîne de fusion automatique »), d'où cet ordre.
2. **Cette spécification** (docs seulement, un fichier nouveau) : indépendante, aucun conflit.
3. **La PR de code T18**, créée depuis `main` après la fusion de #177 (ou rebasée dessus). Elle modifie `techlead-gate.yml` : elle est elle-même une PR de workflow et attend `owner-approved`.

Si #177 n'est pas fusionnée quand la PR de code est prête, la PR de code reste en attente ; si elle fusionne d'abord malgré tout, #177 garde son `owner-approved` (aucun push ne l'a retiré) et seul `mise-en-place.md` est à rebaser.

## Risques résiduels (à écrire dans 0035)
- **Auteur du libellé non vérifiable.** Les agents utilisent le compte `Samoulou` ; la porte vérifie la présence d'`owner-approved`, pas l'identité de qui l'a posé. La règle « seul Samuel pose owner-approved » repose sur les consignes des agents (question 1).
- **Une PR qui modifie la porte se juge avec sa propre version.** Sur `pull_request`, GitHub exécute `techlead-gate.yml` et `scripts/ci/techlead-gate.mjs` tels qu'ils sont dans la PR (choix de 0023 § 4.7, pour ne jamais donner un jeton en écriture au code d'un fork). Une PR qui affaiblit la porte peut donc la faire passer sans `owner-approved`. Le signalement dans `#studio` est le filet : Samuel voit toute PR de workflow, et une modification de `techlead-gate.yml` en est une (question 2).
- **Fichiers hors du dossier.** `scripts/ci/` est exécuté par les workflows mais n'est pas sous `.github/workflows/` : une PR qui ne modifie que `scripts/ci/techlead-gate.mjs` n'attend pas `owner-approved` (question 3).

## Décisions (Product Owner, définitives sans veto de Samuel sous 2 jours)
- **D1 — Numéro 0035** pour la décision écrite, prochain libre au 2026-10-12 (voir « État de départ »).
- **D2 — Retrait d'`owner-approved` par un push qui change `.github/workflows/`.** L'approbation de Samuel porte sur un contenu de workflow ; un contenu différent n'est pas approuvé. Un push qui ne touche pas ce dossier (correction de test, de documentation) ne la retire pas, pour ne pas faire reposer le libellé à Samuel à chaque correction. Une fusion de `main` qui apporte des changements de workflows retire aussi le libellé (échec fermé, cas rare).
- **D3 — Périmètre strict `.github/workflows/`**, comme écrit par Samuel ; pas `.github/` en entier ni `scripts/ci/` (question 3).
- **D4 — Pas de commentaire à chaque échec** faute d'`owner-approved` : la porte se relance à chaque changement de libellé, un commentaire par exécution encombrerait la PR. Le signalement passe par `#studio`.
- **D5 — Signalement par le CEO à son cycle R1**, et non par un message Slack envoyé depuis `techlead-gate` : ce workflow exécute le code de la PR et ne doit pas recevoir le secret `SLACK_WEBHOOK_STUDIO`. Le délai de signalement est donc d'au plus un cycle (3 h).

## Hors périmètre
- Changer le jeu de règles « main protect » ou l'événement de la porte (`pull_request_target`) : question 2.
- Fermer #163 : la PR de code le ferme.
- Modifier `STATUS.md` ou `QUESTIONS.md` : le CEO reporte les questions.
- Coller le prompt R1 dans la routine : Samuel.

## Questions ouvertes
1. **Samuel, avant la fusion de la PR de code (bloque le critère « seul Samuel pose ») :** faut-il ajouter à `CLAUDE.md`, rubrique « Jamais », la ligne « Poser ou retirer le libellé owner-approved » ? Modifier ces règles lui est réservé. À plus long terme, un compte GitHub distinct pour les agents rendrait l'auteur du libellé vérifiable par la porte (compte externe : Samuel).
2. **Tech Lead, puis Samuel pour le jeu de règles (ne bloque pas T18) :** faut-il une seconde vérification obligatoire, exécutée depuis `main` (`pull_request_target`, sans exécuter le code de la PR, liste des fichiers lue par l'API), pour qu'une PR qui modifie la porte ne puisse pas se juger elle-même ? L'ajout d'une vérification obligatoire au jeu de règles « main protect » est un réglage du dépôt, donc à faire par Samuel.
3. **Samuel (ne bloque pas T18) :** le contrôle doit-il couvrir aussi `scripts/ci/` (exécuté par les workflows) et le reste de `.github/` (par exemple de futures actions composites `.github/actions/`) ? Par défaut, le périmètre reste `.github/workflows/` (D3).
4. **Samuel (ne bloque pas T18) :** coller l'étape 6 bis dans le prompt de la routine R1 après la fusion de la PR de code ; d'ici là, le signalement reste manuel (le CEO l'applique depuis `.claude/agents/ceo.md`).
