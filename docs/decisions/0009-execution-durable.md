# 0009 — Exécution durable : Vercel Workflow isolé, état réduit aux identifiants, portabilité

Statut : proposé · Date : 2026-10-08, reprise le 2026-10-11 dans B0a (découpage de #27, Q43) sans ce qui dépend de Q5 · Décideur : Tech Lead (architecture, délégation « Qui décide quoi » ; le choix de Vercel Workflows est une décision de Samuel, cadrage D7) · Définitif sans veto de Samuel avant le 2026-10-13 ; à lister dans la note de version suivante, rubrique « Décisions prises par le studio »

## Contexte
Cadrage D7 (tranché) : Vercel Workflows. Décision 0002 : portabilité préservée, aucune API propre à Vercel dans le code métier. Spécification B0 : l'état sérialisé des étapes est un stockage durable ; il ne contient aucune donnée Google. Q28 : la région de cet état est à vérifier ; l'état contenait le brief (données personnelles).

## Décision
1. **Bibliothèque** : Workflow SDK, paquet `workflow` 5.1.0 (vérifié le 2026-10-08), directives `"use workflow"` et `"use step"`. Elles n'apparaissent que dans `src/workflows/` (règle ESLint). Les étapes appellent `src/domain`, `src/research`, `src/grounding` et `src/ai` ; aucune logique métier dans `src/workflows`.
2. **Interface stable** : le reste du code ne connaît que `src/workflows/index.ts` (`startWorkflow(nom, entrée)`, `getRun(runId)`), jamais le paquet `workflow` directement.
3. **État réduit aux identifiants** : l'entrée et la sortie de chaque étape ne contiennent que des identifiants internes (organisation, voyage, version, exécution, candidat), des `placeId`, des compteurs et des codes d'erreur. Le brief, le texte libre, les résumés, les sources et toute donnée Google sont lus et écrits en base **à l'intérieur** de l'étape. **Erreurs normalisées avant l'état durable** : une erreur de fournisseur, de base ou de réseau est convertie, dans l'étape, en un code d'une énumération fermée (`API_ERROR_CODES` ou codes d'étape typés) et en `retryable` ; jamais son message, sa pile ni le corps de la réponse (qui peuvent contenir un fragment de prompt, du brief ou une donnée Google). Le test `workflows: aucune donnée Google dans l'état sérialisé` le vérifie avec une erreur simulée dont le message contient un nom de lieu et une adresse. Conséquences : l'état ne contient ni donnée personnelle en clair, ni donnée Google, ni coordonnées, ni durée de trajet. Ce qu'une étape d'ancrage pourrait y ajouter (verdict, date de contrôle) attend Q5 (Q29, Q44 ; handover, « En attente de Q5 ») : d'ici là, rien.
4. **Monde d'exécution** : en staging, le monde Vercel (cadrage D7). En local et en CI, le monde local (`@workflow/world-local` 5.0.2), sans compte. Alternative portable documentée : `@workflow/world-postgres` 5.0.2, qui garde l'état dans notre base Postgres en région UE.
5. **Région de l'état (Q28)** : la région où le monde Vercel conserve l'état n'est pas documentée à ce jour. Grâce au point 3, l'état ne contient que des identifiants pseudonymes. La vérification de la région est un critère de la tâche B9 ; si l'état est conservé hors UE, la question remonte à Samuel (données pseudonymes hors UE), avec le monde Postgres comme solution de repli. Q28 reste ouverte pour cette partie.
6. **Relances et idempotence** : chaque étape a un nombre de relances borné et une clé d'idempotence `(runId, nom de l'étape, sous-clé)` ; ses écritures en base sont des insertions idempotentes (contrainte d'unicité) pour qu'une relance ne double rien.
7. **Plafonds** : chaque étape qui appelle un service payant vérifie `usage_ledger` avant l'appel (cadrage § 6.9) ; un plafond ou un quota atteint arrête le workflow, garde la dernière version valide et publie la phase `failed` de `GenerationStatus` avec la raison `cost_cap_reached` ou `quota_reached` (décision 0017 § 2.4 ; aucune version partielle).

Versions vérifiées sur le registre npm le 2026-10-08. Depuis, `workflow` 5.2.0 est publiée (constaté le 2026-10-11, revue Tech Lead de #114). La tâche B9 installe les versions ci-dessus telles quelles ou, si une version plus récente est sortie (5.2.0 ou suivante), la note dans un amendement de cette décision, mondes compris (même règle que les décisions 0003 et 0006).

## Portabilité (décision 0002)
| Question | Réponse |
|---|---|
| Où vit l'état des étapes ? | Dans le monde d'exécution choisi : Vercel en staging, fichiers locaux en développement, Postgres (schéma dédié `workflow`) en repli |
| Comment le remplacer hors Vercel ? | Changer de monde par configuration (variable d'environnement du Workflow SDK), sans toucher aux étapes ; le monde Postgres utilise `graphile-worker` pour la file |
| Région de l'état | À vérifier pour Vercel (B9, Q28) ; région UE de notre base pour le monde Postgres |
| Point à vérifier | Le monde Postgres dépend du paquet `@vercel/queue` : B9 vérifie qu'il fonctionne hors Vercel sans service Vercel |

## Tests
- `workflows: aucune donnée Google dans l'état sérialisé` (liste des clés interdites au handover § 8).
- `workflows: plafond ou quota atteint conserve le dernier programme valide`.
- `workflows: une erreur de fournisseur est visible et récupérable`.
- `workflows: une relance ne double aucune écriture`.

## Conséquences
- Les workflows s'exécutent en local et en CI sans compte, avec le monde local.
- Revoir cette décision si une limite de durée ou de coût des workflows Vercel est atteinte (décision 0002) ou si la région de l'état est hors UE.
