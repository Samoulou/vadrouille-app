# 0033 — Jeton dédié pour la fusion automatique

Statut : **proposée, à trancher par Samuel** (jeton à son nom, réglages du dépôt : « Qui décide quoi » de `docs/CONTEXT.md`). À l'approbation : statut « acceptée », date, décideur Samuel, et ligne dans la note de version suivante, rubrique « Décisions prises par le studio » · Date : 2026-10-12 · Proposée par : fil de projet à la demande de Samuel · Ticket #176 · PR #177

## Contexte
Samuel constate (2026-10-12) qu'après la fusion d'une PR, le ticket « Closes #n » reste ouvert et la branche n'est pas supprimée. Exemple : #156 vise `main`, GitHub la relie à #154, elle est fusionnée par `github-actions[bot]`, mais #154 reste ouvert et `claude/154-comptes-externes` existe encore. Même constat pour #27, #149, #152, #160 et #161. Le réglage « Automatically delete head branches » est déjà activé.

Cause : `auto-merge.yml` active la fusion automatique avec `GITHUB_TOKEN`. Une fusion faite avec ce jeton ne déclenche ni la fermeture des tickets par mot-clé, ni la suppression de la branche, ni les workflows sur `push` (0023 § 5.4).

## Décision proposée
1. **Jeton.** `auto-merge.yml` utilise `AUTOMERGE_TOKEN` : un jeton à portée fine de Samuel, limité au dépôt `vadrouille-app`, avec Contents, Pull requests et Issues en écriture, **sans** Workflows, Actions ni Administration. Sans la permission Workflows, GitHub devrait refuser la fusion d'une PR qui modifie `.github/workflows/` (comportement attendu, à vérifier à la première PR de ce type) : ces PR resteraient fusionnées à la main par Samuel, ce qui sert de garde-fou (Q245). Expiration : 90 jours au plus ; Samuel le renouvelle ; le CEO rappelle l'échéance dans `STATUS.md`.
2. **Environnement `automerge`.** Le jeton est un secret de l'environnement GitHub `automerge`, dont « Deployment branches » est limité à `main`, et non un secret du dépôt. Seul un job qui déclare `environment: automerge` et s'exécute pour la référence `main` peut le lire. Une branche `claude/…` qui ajoute ou modifie un workflow (`pull_request`, `push`) s'exécute pour sa propre référence : GitHub lui refuse l'environnement, donc le secret.
3. **Workflow de `main`, PR du dépôt.** Le déclencheur passe de `pull_request` à `pull_request_target`, dont la référence est `main` : c'est ce qui permet l'environnement. Le job ne fait aucun checkout et n'exécute aucun code de la PR ; il ne fait que `gh pr merge --auto`. Il ne s'exécute que pour une PR dont la branche est dans le dépôt (jamais pour un fork). Écart avec 0023 § 4.7, qui écarte `pull_request_target` pour `techlead-gate` : là, le risque était d'exécuter le code d'un fork avec un jeton en écriture ; ici, aucun code de la PR n'est exécuté et les forks sont exclus.
4. **Fusion au nom de Samuel.** Les fusions apparaissent au nom de Samuel, et non plus de `github-actions[bot]`. Elles restent soumises aux mêmes contrôles requis.
5. **État transitoire.** Tant que le secret manque, le workflow se replie sur `github.token` (comportement actuel) et affiche un avertissement dans le job.
6. **`release.yml`.** La fusion déclenche désormais le `push` sur `main` ; le créneau horaire de 0023 § 5.4 reste, et l'idempotence évite les doublons. Aucun autre workflow sur `push` n'utilise de secret.

## Prérequis (Samuel, avant de créer le secret)
- [ ] Environnement `automerge` créé (Settings › Environments), « Deployment branches and tags » : `main` seulement ; le secret `AUTOMERGE_TOKEN` y est enregistré, et non dans les secrets du dépôt.
- [ ] Jeton à portée fine : dépôt `vadrouille-app` seul ; Contents, Pull requests et Issues en écriture ; rien d'autre ; 90 jours au plus.
- [ ] Protection de `main` : `ci` et `techlead-gate` en contrôles requis, « Do not allow bypassing the above settings » coché (sinon une fusion au nom de Samuel, administrateur, pourrait contourner la porte).

## Textes modifiés
- 0023 § 5.4 : « activée avec `GITHUB_TOKEN` » devient « activée avec `AUTOMERGE_TOKEN`, ou `GITHUB_TOKEN` en repli ».
- 0019 § 3.3 et 0023 § 5.7 : inchangés sur le fond ; les retraits de libellés par `techlead-gate` restent faits avec `GITHUB_TOKEN`.

## Risques
- **Jeton expiré ou révoqué** : `||` ne teste que l'absence, donc l'étape `gh pr merge --auto` échoue pour toutes les PR. L'échec se voit sur la PR (exécution `auto-merge` rouge, fusion automatique non activée). Remède : renouveler le secret.
- **Workflow de `main` modifié** : seule une PR fusionnée peut changer `auto-merge.yml` sur `main` ; si le refus attendu au point 1 se vérifie, cette fusion reste manuelle (Samuel, après `owner-approved`).
- **Traces de déploiement** : chaque exécution crée un déploiement « automerge » visible sur la PR ; sans effet sur Vercel.

## Quand revoir cette décision
À l'expiration du jeton, ou si GitHub change le traitement des fusions faites avec `GITHUB_TOKEN`.
