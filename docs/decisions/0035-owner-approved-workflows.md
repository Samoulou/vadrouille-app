# 0035 — `owner-approved` exigé pour toute PR qui modifie `.github/workflows/`

Statut : accepté (décision de Samuel, citée mot pour mot ci-dessous) ; modalités déléguées, définitives sans veto de Samuel sous 2 jours, à lister dans la note de version suivante, rubrique « Décisions prises par le studio » · Date : 2026-10-12 · Décideur : Samuel (Q245, `#studio`, 2026-10-12 10:35 CEST) · Décideurs des modalités : Tech Lead (outillage : T1 à T5 ci-dessous), Product Owner (D1 à D4) · Ticket #163 · Spécification `specs/T18-owner-approved-workflows.md` · Consigné par l'agent release (PR de code T18)

Numérotation : 0035 est le prochain numéro libre (D1). Revérifié le 2026-10-12 au moment d'écrire la PR de code : sur `origin/main`, 0001 à 0032, 0034 et 0036 ; sur les branches des PR ouvertes, seule 0033 (#177) ajoute une décision.

## Contexte
Décision de Samuel, `#studio`, 2026-10-12 10:35 CEST :

> « Q245 : oui ; toute PR qui modifie .github/workflows/ est signalée dans #studio et attend le libellé owner-approved, que je pose moi-même. Ajoute ce contrôle à techlead-gate. »

La porte `techlead-gate` (0019 § 3.3, 0023 § 4) exigeait seulement `techlead-approved`, l'absence de `changes-requested` et une revue consolidée du head courant. Les agents du studio agissent sur GitHub sous le compte `Samoulou`, comme Samuel : la porte ne peut pas distinguer un libellé posé par Samuel d'un libellé posé par un agent.

## Décision

### Règle
1. Une PR dont le diff ajoute, modifie, supprime ou renomme un fichier sous `.github/workflows/`, ou remplace ce dossier par un fichier ou un lien symbolique, est une « PR de workflow ».
2. Une PR de workflow ne fusionne pas sans le libellé `owner-approved`, que **seul Samuel pose**. Aucun agent ne pose ni ne retire `owner-approved` à la main. Cette règle lie les agents par leurs consignes (`.claude/agents/ceo.md` et `.claude/agents/tech-lead.md`) ; elle ne lie les autres rôles qu'une fois ajoutée par Samuel à `CLAUDE.md` (question 1).
3. `owner-approved` s'ajoute aux autres conditions de la porte : il ne remplace ni `techlead-approved`, ni la revue consolidée.
4. `owner-approved` vaut pour un contenu de `.github/workflows/` : celui de la tête de la PR au moment où le libellé est posé, que la porte enregistre. À chaque exécution, la porte compare ce contenu enregistré à celui de la tête de la PR ; s'il diffère (push, fusion de `main` qui apporte des workflows, contenu poussé pendant que la PR était fermée), elle retire le libellé ; sans enregistrement valide, elle échoue. Le verdict ne dépend ni de l'action qui a déclenché l'exécution, ni de l'ordre ou de la perte d'exécutions précédentes : seul l'enregistrement, écrit par l'exécution déclenchée par la pose, est relu (D2, T1). Un push qui ne change pas ce contenu laisse le libellé en place.
5. Sur une PR qui n'est pas une PR de workflow, `owner-approved` n'a aucun effet : ni sur le verdict, ni retrait, ni enregistrement, ni commentaire.
6. Le CEO signale chaque PR de workflow dans `#studio` (consigne de `.claude/agents/ceo.md` ; étape 6 bis du prompt R1, `docs/studio/mise-en-place.md`, à coller par Samuel).
7. Risques résiduels : rubrique ci-dessous, écrits tels quels.

### Mise en œuvre
- Toute la logique est dans `scripts/ci/techlead-gate.mjs` (types dans `techlead-gate.d.mts`) : `touchesWorkflows`, `classifyFiles`, `readFileList`, `evaluateOwnerApproval`, `workflowsTreeId` et `decideGate`. Le YAML ne filtre aucun chemin : il lit l'API et transmet les données brutes (`git diff -z --name-only --no-renames`, libellés, revues, événements et commentaires de la PR).
- Enregistrement : un commentaire de `github-actions[bot]` contenant la ligne `<!-- techlead-gate:owner-approved tree=<mode> <objet> sha=<sha> -->` (ou `tree=absent`), publié par l'exécution déclenchée par la pose. Seul un enregistrement postérieur ou égal à la dernière pose d'`owner-approved` est valide.
- Messages exacts de la porte :
  - « PR qui modifie .github/workflows/ : le libellé owner-approved, posé par Samuel, est nécessaire (décision 0035). »
  - « owner-approved est présent mais aucun enregistrement de la porte ne correspond à sa dernière pose : Samuel le retire puis le repose. »
  - « owner-approved est retiré : le contenu de .github/workflows/ a changé depuis qu'il a été posé. Samuel doit valider le contenu actuel. »
  - « Liste des fichiers illisible (chemin cité ou encodage invalide) : la porte échoue par précaution (décision 0035). »
- Tests : `tests/unit/ci/techlead-gate.test.ts` et `tests/unit/ci/techlead-gate-workflow.test.ts`.

### Modalités déléguées
**Product Owner (détails fonctionnels)**
- **D1 — Numéro 0035** pour la décision écrite, prochain libre au 2026-10-12.
- **D2 — `owner-approved` vaut pour un contenu de workflows** : celui de la tête au moment de la pose. Un contenu différent n'est pas approuvé, quel que soit le chemin pour y arriver (push, fusion de `main`, push pendant que la PR était fermée). Un push qui ne touche pas ce dossier (test, documentation) ne retire pas le libellé, pour ne pas le faire reposer à Samuel à chaque correction. Sur une PR qui n'est pas de workflow, le libellé est ignoré, sans retrait ni commentaire.
- **D3 — Périmètre strict `.github/workflows/`**, comme écrit par Samuel ; pas `.github/` en entier ni `scripts/ci/` (question 3).
- **D4 — Pas de commentaire à chaque échec** faute d'`owner-approved` : la porte se relance à chaque changement de libellé, un commentaire par exécution encombrerait la PR. Le signalement passe par `#studio`.

**Tech Lead (outillage)**
- **T1 — Mise en œuvre de D2, indépendante de l'ordonnancement** : l'exécution déclenchée par la pose enregistre, dans un commentaire à marqueur, l'identifiant du contenu `.github/workflows` de la tête ; chaque exécution compare le contenu de sa tête au dernier enregistrement postérieur à la dernière pose. Écartés : la comparaison `before` / `after` (un `synchronize` perdu en attente fait perdre un changement) ; une clé de concurrence par commit (deux exécutions en parallèle sur le même commit pourraient publier des verdicts contradictoires) ; la comparaison à la base de fusion (le libellé serait retiré à chaque exécution). Le groupe de concurrence reste inchangé.
- **T2 — Liste des fichiers en `git diff -z`**, séparée par NUL, transmise au Node dans un fichier et décodée en UTF-8 strict ; toute entrée citée ou mal encodée fait échouer la porte.
- **T3 — La ligne de commande calcule `code`, `workflows` et l'état d'`owner-approved`** ; le YAML ne filtre aucun chemin, pour que la règle testée soit celle qui tourne en production.
- **T4 — Pas de secret Slack dans la porte** : le signalement est fait par le CEO à son cycle R1, et non par `techlead-gate`, qui exécute le code de la PR et ne doit pas recevoir `SLACK_WEBHOOK_STUDIO`. Délai de signalement : au plus un cycle (3 h).
- **T5 — Tests sans nouvelle dépendance**, par chaîne et par rejeu dans des dépôts Git jetables.

## Risques résiduels
- **Auteur du libellé non vérifiable.** Les agents utilisent le compte `Samoulou` ; la porte vérifie la présence d'`owner-approved`, pas l'identité de qui l'a posé. La règle « seul Samuel pose owner-approved » repose sur les consignes des agents (question 1).
- **Une PR qui modifie la porte se juge avec sa propre version.** Sur `pull_request`, GitHub exécute `techlead-gate.yml` et `scripts/ci/techlead-gate.mjs` tels qu'ils sont dans la PR (0023 § 4.7, pour ne jamais donner un jeton en écriture au code d'un fork). Une PR qui affaiblit la porte peut la faire passer sans `owner-approved`, ou **désactiver le retrait d'`owner-approved` et conserver un libellé posé sur un contenu antérieur**. Le filet : le signalement dans `#studio` (une modification de `techlead-gate.yml` est une PR de workflow) et la relecture par Samuel du contenu qu'il approuve (question 2).
- **Libellé posé pendant un push.** Si Samuel pose `owner-approved` après un push sans avoir vu le nouveau contenu, l'enregistrement porte sur la tête au moment de la pose (charge utile de l'événement `labeled`), donc sur ce contenu non vu. Le message `#studio` cite le dernier commit, et le commentaire d'enregistrement cite le commit enregistré ; Samuel approuve le contenu affiché par la PR au moment où il pose le libellé.
- **Enregistrement perdu.** Si l'exécution déclenchée par la pose est perdue (remplacée en attente par une exécution plus récente) ou échoue, la porte échoue ensuite avec le motif `no-record` sans retirer le libellé : Samuel doit le retirer et le reposer. Échec fermé ; le motif n'est visible que dans le journal du job (D4).
- **Enregistrement forgé.** L'enregistrement est un commentaire de `github-actions[bot]`. Une PR d'une branche du dépôt exécute ses propres workflows avec un jeton en écriture : elle peut publier un faux marqueur. Une telle PR est une PR de workflow ; le filet reste la relecture de Samuel (risque précédent). Les PR de forks ont un jeton en lecture et ne peuvent pas commenter.
- **Fichiers hors du dossier.** `scripts/ci/` est exécuté par les workflows mais n'est pas sous `.github/workflows/` : une PR qui ne modifie que `scripts/ci/techlead-gate.mjs` n'attend pas `owner-approved` (question 3).
- **Changement de branche de base** (`edited`) : il ne relance pas la porte (événement absent des déclencheurs, inchangés par T18). Le contenu de la branche ne change pas, mais la liste des fichiers comparés à la nouvelle base peut changer (question 5).

## Conséquences
- `docs/studio/mise-en-place.md` (étape 4 de la « Chaîne de fusion automatique ») et 0023 § 4.2 sont complétés par un renvoi à 0035.
- La règle s'applique aux PR ouvertes dès la fusion de la PR de code T18. Une PR de workflow dont `owner-approved` a été posé avant cette fusion n'a pas d'enregistrement : la porte échoue (`no-record`) jusqu'à ce que Samuel retire et repose le libellé.
- Toute PR de workflow écrit, dans « Nouvelles questions » de sa description, « Samuel : owner-approved attendu (décision 0035) ».
- La note de version suivante liste D1 à D4 et T1 à T5 dans « Décisions prises par le studio ».

## Quand revoir
- Si les agents reçoivent un compte GitHub distinct de celui de Samuel : la porte pourra vérifier l'auteur de la pose (question 1).
- Si une seconde vérification exécutée depuis `main` (`pull_request_target`) est ajoutée au jeu de règles « main protect » (question 2).
- Si Samuel étend le périmètre à `scripts/ci/` ou au reste de `.github/` (question 3).

## Questions ouvertes (spécification T18)
1. **Samuel** : ajouter à `CLAUDE.md`, rubrique « Jamais », la ligne « Poser ou retirer le libellé owner-approved » ?
2. **Tâche séparée** : seconde vérification obligatoire exécutée depuis `main`, pour qu'une PR qui modifie la porte ne puisse pas se juger elle-même ; son ajout au jeu de règles « main protect » est à faire par Samuel.
3. **Samuel** : couvrir aussi `scripts/ci/` et le reste de `.github/` ?
4. **Samuel** : coller l'étape 6 bis dans le prompt de la routine R1.
5. **Tech Lead** : ajouter `edited` aux déclencheurs de la porte ?
