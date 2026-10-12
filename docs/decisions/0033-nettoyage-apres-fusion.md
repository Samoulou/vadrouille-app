# 0033 — Nettoyage après fusion : tickets et branches

Statut : décision déléguée (outillage de CI, « Qui décide quoi » de `docs/CONTEXT.md`), à confirmer par la revue du Tech Lead ; la PR touche `.github/workflows/` et attend `owner-approved` de Samuel (Q245). À lister dans la note de version suivante, rubrique « Décisions prises par le studio » · Date : 2026-10-12 · Ticket #176 · PR #177

## Contexte
Samuel constate (2026-10-12) qu'après la fusion d'une PR, le ticket « Closes #n » reste ouvert et la branche n'est pas supprimée. Exemple : #156 vise `main`, GitHub la relie à #154, elle est fusionnée par `github-actions[bot]`, mais #154 reste ouvert et `claude/154-comptes-externes` existe encore. Même constat pour #27, #149, #152, #160 et #161. Le réglage « Automatically delete head branches » est déjà activé.

Cause : `auto-merge.yml` active la fusion automatique avec `GITHUB_TOKEN`. Une fusion faite avec ce jeton ne déclenche ni la fermeture des tickets par mot-clé, ni la suppression de la branche, ni aucun workflow (0023 § 5.4).

Une première version de #177 faisait faire la fusion avec un jeton personnel de Samuel. Trois revues ont montré que ce jeton, au nom de Samuel et en écriture, demandait une chaîne de garde-fous fragile (environnement limité à `main`, exclusion des PR touchant `.github/` ou `scripts/ci/`, courses entre événements) tant que #163 n'existe pas. Elle est abandonnée.

## Décision
1. **Fusion inchangée.** `auto-merge.yml` reste tel quel (`GITHUB_TOKEN`). Aucun jeton personnel, aucun secret nouveau, aucun réglage du dépôt à changer.
2. **Créneau de rattrapage.** Le workflow `post-merge-cleanup.yml` s'exécute à HH:17 et HH:47 (et à la main). Il lit, par GraphQL, les PR fusionnées des 7 derniers jours et :
   - ferme (raison « completed », avec un commentaire qui cite la PR) chaque ticket encore ouvert que **GitHub lui-même** relie à une PR fusionnée dans la branche par défaut (`closingIssuesReferences` : mots-clés « Closes », « Fixes », « Resolves », ou lien manuel) ;
   - supprime la branche de la PR si elle commence par `claude/`, si elle pointe toujours sur le commit fusionné (aucun push après la fusion), si elle n'est la tête d'aucune PR ouverte et si la PR ne vient pas d'un fork.
3. **Sécurité.** Code de `main` seulement (`schedule`, `workflow_dispatch`, garde `github.ref == 'refs/heads/main'`), `GITHUB_TOKEN` seulement (`contents: write`, `issues: write`), aucun secret, aucun code de PR exécuté. Le plan est calculé par la fonction pure `planCleanup` de `scripts/ci/post-merge-cleanup.mjs`, testée dans `tests/unit/ci/post-merge-cleanup.test.ts` ; les noms de branche sont filtrés par un motif strict avant d'atteindre le shell.
4. **Délai.** Un ticket ou une branche est traité dans les 30 minutes qui suivent la fusion, et non à l'instant de la fusion.

## Conséquences
- À sa première exécution, le créneau ferme les tickets et supprime les branches des PR fusionnées depuis 7 jours : #154, #147, #151, #158, #159 et leurs branches, notamment. Les PR plus anciennes (#12, #27 et leurs tickets) sont hors fenêtre : à fermer à la main sur décision de Samuel.
- `docs/studio/mise-en-place.md`, « Chaîne de fusion automatique », gagne une étape.

## Quand revoir cette décision
Si la fusion automatique cesse d'utiliser `GITHUB_TOKEN`, le créneau devient inutile : le supprimer.
