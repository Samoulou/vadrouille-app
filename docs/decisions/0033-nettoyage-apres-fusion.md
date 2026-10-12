# 0033 — Nettoyage après fusion : tickets et branches

Statut : décision déléguée (outillage de CI, « Qui décide quoi » de `docs/CONTEXT.md`), à confirmer par la revue du Tech Lead ; la PR touche `.github/workflows/` et attend `owner-approved` de Samuel (Q245). À lister dans la note de version suivante, rubrique « Décisions prises par le studio » · Date : 2026-10-12 · Ticket #176 · PR #177

## Contexte
Samuel constate (2026-10-12) qu'après la fusion d'une PR, le ticket « Closes #n » reste ouvert et la branche n'est pas supprimée. Exemple : #156 vise `main`, GitHub la relie à #154, elle est fusionnée par `github-actions[bot]`, mais #154 reste ouvert et `claude/154-comptes-externes` existe encore. Même constat pour #27, #149, #152, #160 et #161. Le réglage « Automatically delete head branches » est déjà activé.

Cause : `auto-merge.yml` active la fusion automatique avec `GITHUB_TOKEN`. Une fusion faite avec ce jeton ne déclenche ni la fermeture des tickets par mot-clé, ni la suppression de la branche, ni aucun workflow (0023 § 5.4).

Une première version de #177 faisait faire la fusion avec un jeton personnel de Samuel. Quatre revues (heads `d16b7f4` à `5dae99e`) ont montré que ce jeton, au nom de Samuel et en écriture, demandait une chaîne de garde-fous fragile (environnement limité à `main`, exclusion des PR touchant `.github/` ou `scripts/ci/`, courses entre événements) tant que #163 n'existe pas. Elle est abandonnée.

## Décision
1. **Fusion inchangée.** `auto-merge.yml` reste tel quel (`GITHUB_TOKEN`). Aucun jeton personnel, aucun secret nouveau, aucun réglage du dépôt à changer.
2. **Créneau de rattrapage.** Le workflow `post-merge-cleanup.yml` s'exécute à HH:17 et HH:47 (et à la main). Il lit, par GraphQL, les 50 PR fusionnées mises à jour le plus récemment, garde celles des 7 derniers jours, et :
   - ferme (raison « completed », avec un commentaire qui cite la PR) chaque ticket **de ce dépôt**, encore ouvert, que **GitHub lui-même** relie à une PR fusionnée dans la branche par défaut (`closingIssuesReferences` : « Closes », « Fixes », « Resolves », ou lien manuel). Un ticket d'un autre dépôt (« Closes autre/depot#5 ») est ignoré. Un ticket **rouvert après la fusion** n'est jamais refermé : la réouverture par Samuel l'emporte ;
   - supprime la branche de la PR si elle commence par `claude/`, si elle pointe toujours sur le commit fusionné (aucun push après la fusion), si elle n'est ni la tête ni la base d'une PR ouverte (PR empilée) et si la PR ne vient pas d'un fork. Le commit de la branche est relu juste avant la suppression ; s'il a changé depuis le plan, la branche est gardée.
3. **Sécurité.** Code de `main` seulement (`schedule`, `workflow_dispatch`, gardes `github.ref == 'refs/heads/main'` et `github.repository == 'Samoulou/vadrouille-app'`, qui écarte les forks), `GITHUB_TOKEN` seulement (`contents: write`, `issues: write`), aucun secret, `persist-credentials: false`, aucun code de PR exécuté. Le plan est calculé par la fonction pure `planCleanup` de `scripts/ci/post-merge-cleanup.mjs`, testée dans `tests/unit/ci/post-merge-cleanup.test.ts` ; noms de branche et commits sont filtrés par des motifs stricts avant d'atteindre le shell.
   - **Échec fermé** : si la liste des PR ouvertes est tronquée (plus de 100), rien n'est nettoyé, car une branche encore utile pourrait être supprimée. Un ticket dont l'historique de réouverture est illisible est ignoré.
   - **Troncatures signalées** : si 50 PR fusionnées sont renvoyées (la fenêtre de 7 jours peut alors être incomplète, par exemple parce que des commentaires ont repoussé une PR), ou s'il existe plus de 100 branches `claude/…`, le reste du plan s'exécute, puis le workflow échoue avec un avertissement : le nettoyage manquant se fait à la main.
   - **Risques résiduels** : la boucle d'exécution dure quelques secondes après le calcul du plan. Pour une branche, seul le commit est relu avant la suppression, pas les PR ouvertes : une PR ouverte sur cette branche pendant la boucle serait fermée ; un push pendant la boucle serait supprimé avec la branche (un commit ainsi perdu est souvent récupérable par son SHA, sans garantie). Pour un ticket, l'état n'est pas relu : fermer un ticket déjà fermé ne change rien, mais une réouverture pendant la boucle serait annulée (à rouvrir à la main ; le créneau suivant ne le refermera pas).
   - **Dépôt codé en dur** : la garde `github.repository == 'Samoulou/vadrouille-app'` rend le job silencieux après un renommage ou un transfert du dépôt ; à mettre à jour dans ce cas. GitHub désactive aussi un `schedule` après 60 jours sans activité sur le dépôt.
4. **Délai.** Un ticket ou une branche est traité dans les 30 minutes qui suivent la fusion, et non à l'instant de la fusion.

## Conséquences
- À sa première exécution, le créneau ferme les tickets et supprime les branches des PR fusionnées depuis 7 jours : #154, #147, #151, #158, #159 et leurs branches, notamment. Les PR plus anciennes (#12, #27 et leurs tickets) sont hors fenêtre : à fermer à la main sur décision de Samuel.
- `docs/studio/mise-en-place.md`, « Chaîne de fusion automatique », gagne une étape.

## Quand revoir cette décision
Si la fusion automatique cesse d'utiliser `GITHUB_TOKEN`, le créneau devient inutile : le supprimer.
