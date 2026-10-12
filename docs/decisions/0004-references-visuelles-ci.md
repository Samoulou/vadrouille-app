# 0004 — Régénérer les images de référence visuelles sur la CI

Statut : proposé · Date : 2026-10-08 · Décideur : Tech Lead (outillage et tests, délégation « Qui décide quoi ») · Définitif sans veto de Samuel avant le 2026-10-10

## Contexte
- Le test visuel (`pnpm test:visual`, projet Playwright `visual`) compare des captures 390 × 844 du build de production aux images de `tests/visual/__screenshots__/`, avec une tolérance `maxDiffPixelRatio: 0.01` fixée dans `playwright.config.ts`. Les références sont partagées entre machines (pas de suffixe de plateforme).
- Quand une modification d'interface est voulue, les références doivent être régénérées avec `pnpm test:visual:update`. Produites dans une session d'agent, elles peuvent différer de celles de la CI (polices, rendu) ; il faut alors télécharger l'artefact `test-results` de la CI et recommiter les images à la main. C'est lent et source d'erreurs.
- Le dépôt est public : un workflow qui écrit dans le dépôt ne doit jamais exécuter le code d'un fork.

## Options
| Option | Pour | Contre |
|---|---|---|
| A. Statu quo : artefact téléchargé puis recommité | Rien à construire | Manuel, lent, erreurs de fichiers |
| B. Workflow `workflow_dispatch` (entrée : branche) | Déclenchement explicite, réservé aux personnes ayant l'accès en écriture | Détaché de la PR ; branche saisie à la main |
| C. Workflow `pull_request` déclenché par le libellé `update-snapshots` | Lié à la PR, visible dans son historique ; poser un libellé exige des droits sur le dépôt ; un fork n'obtient qu'un jeton en lecture | Libellé à retirer après usage |
| D. Commande en commentaire (`/update-snapshots`) | Simple à utiliser | `issue_comment` s'exécute avec un jeton en écriture pour n'importe quel commentateur : rejeté |

## Décision proposée
Option C, implémentée dans une tâche dédiée (`.github/workflows/visual-update.yml`) :
1. Déclencheur : `pull_request` de type `labeled`, libellé `update-snapshots`. Jamais `pull_request_target`.
2. Garde-fous : le job ne s'exécute que si `github.event.pull_request.head.repo.full_name == github.repository` et si la branche commence par `claude/`. Sinon il s'arrête sans rien faire.
3. Étapes : extraction de la branche de la PR, `pnpm install --frozen-lockfile`, installation du Chromium de la version de Playwright figée (décision 0003), `pnpm test:visual:update`, puis commit et push avec le `GITHUB_TOKEN` (`permissions: contents: write`), message `[qa] chore: images de référence régénérées sur la CI`. Le libellé est retiré à la fin.
4. Le commit ne contient que des fichiers de `tests/visual/__screenshots__/` : si autre chose a changé, le job échoue sans pousser.
5. Jamais de changement de tolérance : `playwright.config.ts` et les fichiers `*.visual.spec.ts` ne sont pas modifiés par ce workflow, et une PR qui régénère des références ne touche pas `maxDiffPixelRatio`.
6. Revue : le Tech Lead examine les images modifiées (diff d'images GitHub) avant `techlead-approved` ; la description de la PR dit quelles captures changent et pourquoi.

## Conséquences
- Plus de téléchargement d'artefact ; les références viennent du même environnement que la comparaison.
- Un push fait avec le `GITHUB_TOKEN` ne relance pas les workflows : après le commit des images, l'agent pousse un nouveau commit (même vide) pour relancer `ci` et `techlead-gate` sur la dernière révision. Un jeton d'application GitHub éviterait cette étape, mais c'est un compte externe : décision de Samuel.
- L'artefact `test-results` reste produit en cas d'échec, pour diagnostiquer.

## Évolution — 2026-10-12, mise en œuvre (T17, ticket #146)
Statut : décision déléguée, définitive sans veto de Samuel sous 2 jours (avant le 2026-10-14) ; à lister dans la note de version suivante, rubrique « Décisions prises par le studio » · Décideur : Tech Lead (outillage et tests) · Origine : Q232.

`.github/workflows/visual-update.yml` met en œuvre l'option C. Il précise la décision proposée sur les points suivants :
1. **Garde-fous** (point 2) : en plus du dépôt de tête et du préfixe `claude/`, la PR doit être ouverte. Une PR qui ne remplit pas ces conditions ne lance rien, et son libellé reste posé (un fork n'a de toute façon qu'un jeton en lecture).
2. **Révision figée** : le job extrait `head.sha`, la révision de la PR au moment du libellé, et pousse sur `refs/heads/<branche>`. Si la branche a avancé pendant le job, le push est refusé (non fast-forward) : on repose le libellé.
3. **Jeton isolé du code de la PR** : `persist-credentials: false`. L'installation, le build et les tests s'exécutent sans jeton en écriture ; le jeton n'est passé qu'aux étapes de commit, de push et de libellés, écrites dans le workflow.
4. **Même environnement que `verify`** : `ubuntu-latest`, Node 22, pnpm du champ `packageManager`, Chromium et polices système par `pnpm exec playwright install --with-deps chromium` à la version de `pnpm-lock.yaml`. Actions épinglées par SHA (0023 § 4.9), aux versions que résolvent les étiquettes `v4` de `ci.yml`.
5. **Toutes les captures réécrites** (point 3) : `playwright test --project=visual --update-snapshots=all`, et non `pnpm test:visual:update` (mode `changed`, qui ne réécrit que les captures au-delà de la tolérance). Une référence dont l'écart reste sous 1 % est ainsi aussi régénérée (Q232, F2c-Q4). Le script local `test:visual:update` est inchangé : en session, des références réécrites en entier différeraient de la CI. Tolérance et fichiers `*.visual.spec.ts` inchangés (point 5).
6. **Commit** (points 3 et 4) : un seul commit `[qa] chore: références visuelles régénérées (0004)`, auteur `github-actions[bot]`, limité aux PNG de `tests/visual/__screenshots__/`. Aucun commit si rien ne change. Tout autre fichier modifié fait échouer le job sans push.
7. **Libellé** : `update-snapshots` est retiré à la fin, que le job réussisse ou échoue ; le reposer relance le job. En cas d'échec, l'artefact `test-results` est produit, comme dans `ci.yml`.
8. **Relance de la CI** (précise « Conséquences ») : le push fait avec `GITHUB_TOKEN` ne déclenche ni `ci` ni `techlead-gate`. Après un commit, le workflow :
   - retire lui-même `techlead-approved`, comme la porte le ferait à un push (0023 § 4.4), puisqu'elle ne s'exécute pas ;
   - publie un commentaire qui liste les captures modifiées et rappelle l'étape suivante.

   L'agent de la PR pousse ensuite un commit, même vide (`git commit --allow-empty`), pour relancer `ci` et `techlead-gate` sur la dernière révision ; la revue reprend ensuite comme après tout push. Le workflow ne touche ni `needs-review` ni les autres libellés.
9. **Droits** : `contents: write` (push) et `pull-requests: write` (libellés et commentaire de la PR). Aucun autre droit ; aucune action en dehors de celles que `ci.yml` utilise déjà.
