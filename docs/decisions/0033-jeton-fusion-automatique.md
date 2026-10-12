# 0033 — Jeton dédié pour la fusion automatique

Statut : **proposée, à trancher par Samuel** (jeton à son nom, réglages du dépôt : « Qui décide quoi » de `docs/CONTEXT.md`) · Date : 2026-10-12 · Proposée par : fil de projet à la demande de Samuel · Ticket #176 · PR #177

Numérotation : 0029 est prise par #164, 0031 par #172, 0032 par #175. 0033 est le prochain numéro libre.

## Contexte
Samuel constate (2026-10-12) qu'après la fusion d'une PR, le ticket « Closes #n » reste ouvert et la branche n'est pas supprimée. Exemple : #156 vise `main`, GitHub la relie à #154, elle est fusionnée par `github-actions[bot]`, mais #154 reste ouvert et `claude/154-comptes-externes` existe encore. Même constat pour #27, #149, #152, #160 et #161. Le réglage « Automatically delete head branches » est déjà activé.

Cause : `auto-merge.yml` active la fusion automatique avec `GITHUB_TOKEN`. Une fusion faite avec ce jeton ne déclenche ni la fermeture des tickets par mot-clé, ni la suppression de la branche, ni les workflows sur `push` (0023 § 5.4).

## Décision proposée
1. **Jeton.** `auto-merge.yml` utilise le secret Actions `AUTOMERGE_TOKEN` : un jeton à portée fine de Samuel, limité au dépôt `vadrouille-app`, avec Contents, Pull requests et Issues en écriture, sans Workflows, Actions ni Administration. Expiration : 90 jours au plus. Samuel le renouvelle ; le CEO rappelle l'échéance dans `STATUS.md`.
2. **Fusion au nom de Samuel.** Les fusions apparaissent au nom de Samuel, et non plus au nom de `github-actions[bot]`. Elles restent soumises aux mêmes contrôles requis (`ci`, `techlead-gate`).
3. **Workflow de `main` seulement.** Le déclencheur passe de `pull_request` à `pull_request_target` : le workflow exécuté est celui de `main`, et non celui de la branche. Une branche `claude/…` ne peut donc pas modifier `auto-merge.yml` pour lire le secret. Le job ne fait aucun checkout et n'exécute aucun code de la PR.
4. **État transitoire.** Tant que le secret manque, le workflow se replie sur `github.token` (comportement actuel) et affiche un avertissement.
5. **`release.yml`.** La fusion déclenche désormais le `push` sur `main` ; le créneau horaire de 0023 § 5.4 reste, et l'idempotence évite les doublons.

## Textes modifiés
- 0023 § 5.4 : « activée avec `GITHUB_TOKEN` » devient « activée avec `AUTOMERGE_TOKEN`, ou `GITHUB_TOKEN` en repli ».
- 0019 § 3.3 et 0023 § 5.7 : inchangés sur le fond ; les retraits de libellés par `techlead-gate` restent faits avec `GITHUB_TOKEN`.

## Risques
- **Jeton expiré ou révoqué** : `||` ne teste que l'absence, donc `gh pr merge --auto` échoue pour toutes les PR (job rouge, visible). Remède : renouveler le secret.
- **Contournement de la porte** : une fusion au nom de Samuel, administrateur, pourrait contourner les règles de branche. À vérifier avant de créer le secret : `ci` et `techlead-gate` en contrôles requis sur `main`, et « Do not allow bypassing the above settings » coché.
- **`owner-approved` (Q245)** : tant que #163 n'a pas ajouté ce contrôle à `techlead-gate`, une PR qui touche `.github/workflows/` doit rester hors fusion automatique jusqu'au libellé de Samuel (pour #177 : fusion automatique désactivée à la main).

## Quand revoir cette décision
À l'expiration du jeton, ou si GitHub change le traitement des fusions faites avec `GITHUB_TOKEN`.
