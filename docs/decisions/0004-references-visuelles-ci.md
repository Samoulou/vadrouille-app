# 0004 — Régénérer les images de référence visuelles sur la CI

Statut : proposé le 2026-10-08, définitif depuis le 2026-10-10 faute de veto de Samuel (aucun veto consigné dans `QUESTIONS.md` ni `STATUS.md`) · Date : 2026-10-08 · Décideur : Tech Lead (outillage et tests, délégation « Qui décide quoi »)

La « Décision proposée » ci-dessous fait foi pour le principe. Pour la mise en œuvre, c'est la section « Évolution — 2026-10-12 » qui fait foi : elle a son propre délai de veto (2026-10-14).

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
Statut : décision déléguée, définitive sans veto de Samuel sous 2 jours (avant le 2026-10-14) ; à lister dans la note de version suivante, rubrique « Décisions prises par le studio » · Décideur : Tech Lead (outillage et tests) · Origine : Q232 · Révisée après la revue Tech Lead + Sécurité de la PR #148 (correction 1).

`.github/workflows/visual-update.yml` met en œuvre l'option C. Il précise la décision proposée sur les points suivants :
1. **Garde-fous** (point 2) : en plus du dépôt de tête et du préfixe `claude/`, la PR doit être ouverte et le libellé doit avoir été posé par `Samoulou`, le compte de Samuel, avec lequel les routines du studio posent aussi les libellés. Une PR qui ne remplit pas ces conditions ne lance rien, et son libellé reste posé.
2. **Révision figée** : les deux jobs extraient `head.sha`, la révision de la PR au moment du libellé, et le push vise `refs/heads/<branche>`. Si la branche a avancé pendant l'exécution, le push est refusé (non fast-forward). Il faut alors reposer le libellé.
3. **Jeton isolé du code de la PR** : le workflow a trois jobs, et chacun déclare ses propres `permissions` (`permissions: {}` au niveau du workflow).
   - `regenerate` : `contents: read` seulement, `persist-credentials: false`, sans cache pnpm. C'est le seul job qui exécute du code de la PR (installation et scripts de cycle de vie, build, Playwright). Il envoie en artefact les seuls PNG de `tests/visual/__screenshots__/`, à plat, pour un jour. Aucun jeton en écriture n'existe sur sa machine.
   - `publish` (`needs: regenerate`) : `contents: write` et `pull-requests: write`. Il n'exécute **aucun** code de la PR : ni `pnpm`, ni `node`, ni script du dépôt, seulement `git`, `curl`, `gh` et les outils du système. Les jobs tournent sur des machines distinctes : ni `$GITHUB_ENV`, ni `$GITHUB_PATH`, ni `.git/` ne passent de l'un à l'autre. Le job extrait proprement `head.sha` et télécharge l'artefact dans `$RUNNER_TEMP`, hors de l'arbre. Il traite comme non fiable cet artefact produit par du code de la PR, et refuse tout si l'une de ces conditions n'est pas remplie :
     - l'artefact ne contient que des fichiers réguliers, sans lien symbolique ni sous-répertoire, et 500 fichiers au plus ;
     - chaque nom respecte `^[A-Za-z0-9_-][A-Za-z0-9._-]*\.png$` ;
     - chaque fichier commence par l'en-tête PNG et pèse entre 1 octet et 5 Mio ;
     - la destination est le vrai répertoire `tests/visual/__screenshots__/`, sans lien symbolique sur le chemin ni dans le répertoire.

     Les fichiers sont ensuite copiés. `git status` est contrôlé, puis l'index : seuls des PNG ordinaires ajoutés ou modifiés sont acceptés, sans renommage, changement de type ni suppression. Le commit et le push se font avec `core.hooksPath=/dev/null` et `--no-verify`.
   - `label` (`needs: [regenerate, publish]`, `if: always()` dès que `regenerate` a été lancé) : `pull-requests: write` ; il retire `update-snapshots`.
4. **Même environnement que `verify`** : `ubuntu-latest`, Node 22, pnpm du champ `packageManager`, Chromium et polices système par `pnpm exec playwright install --with-deps chromium` à la version de `pnpm-lock.yaml`. Seule différence : pas de `cache: pnpm`, qui n'a pas d'effet sur le rendu.
   - Actions épinglées par SHA, à des versions précises : `actions/checkout` v4.2.2, `pnpm/action-setup` v4.3.0, `actions/setup-node` v4.4.0, `actions/upload-artifact` v4.6.2, `actions/download-artifact` v4.3.0. La correspondance SHA ↔ étiquette a été vérifiée par `git ls-remote` le 2026-10-12.
   - Ces versions ne sont pas forcément celles de l'étiquette flottante `v4` de `ci.yml`.
   - **Rapport à 0023 § 4.9** (« aucune action tierce ») : cette règle porte sur `techlead-gate`, et sur `release.yml` par renvoi au § 5.8. Ici, la seule action tierce est `pnpm/action-setup`, déjà utilisée par `ci.yml`. Elle ne tourne que dans `regenerate`, sans jeton en écriture. `publish` et `label` n'utilisent que des actions `actions/*` de GitHub. À confirmer par le Tech Lead.
5. **Toutes les captures réécrites** (point 3) : `playwright test --project=visual --update-snapshots=all`, et non `pnpm test:visual:update`. Ce script est en mode `changed` et ne réécrit que les captures au-delà de la tolérance. Une référence dont l'écart reste sous 1 % est ainsi aussi régénérée (Q232, F2c-Q4).
   - Le script local `test:visual:update` est inchangé : en session, des références réécrites en entier différeraient de la CI.
   - Tolérance et fichiers `*.visual.spec.ts` inchangés (point 5).
   - Les captures e2e ne sont pas concernées : 0004 ne couvre que le projet `visual`.
6. **Commit** (points 3 et 4) : un seul commit `[qa] chore: références visuelles régénérées (0004)`, auteur `github-actions[bot]`, limité aux PNG de `tests/visual/__screenshots__/`. Aucun commit si rien ne change. Tout autre changement fait échouer le job sans push.
7. **Libellé** : `update-snapshots` est retiré à la fin, que les jobs réussissent ou échouent. Le reposer relance le workflow. En cas d'échec de `regenerate`, l'artefact `test-results` est produit, comme dans `ci.yml`.
8. **Approbation retirée avant le push** (précise « Conséquences ») : le push fait avec `GITHUB_TOKEN` ne déclenche ni `ci` ni `techlead-gate`. Quand des références changent, `publish` procède ainsi :
   - il retire `techlead-approved` **avant** le push, comme la porte le ferait à un push (0023 § 4.4), puisqu'elle ne s'exécute pas ;
   - pour ce retrait, comme pour celui de `update-snapshots`, seuls les codes HTTP 200 et 404 (libellé absent) sont acceptés : tout autre code fait échouer le job, et rien n'est poussé ;
   - si le push échoue ensuite, l'approbation reste retirée ; c'est le sens prudent ;
   - après le push, il publie un commentaire qui liste les captures modifiées et rappelle l'étape suivante.

   L'agent de la PR pousse ensuite un commit, même vide (`git commit --allow-empty`), pour relancer `ci` et `techlead-gate` sur la dernière révision. La revue reprend ensuite comme après tout push. Le workflow ne touche ni `needs-review` ni les autres libellés.
9. **Concurrence** : le groupe `visual-update-publish-<PR>`, sans annulation, est déclaré au niveau du job `publish`. Un événement `labeled` écarté par le `if` n'entre donc pas dans le groupe et ne peut pas remplacer une exécution en attente.
10. **Limite connue** : un workflow `pull_request` s'exécute dans la version du fichier présente sur la branche de la PR. Une branche `claude/…` qui modifierait `visual-update.yml` changerait donc ce qui s'exécute. Une protection de `.github/workflows/` (CODEOWNERS avec revue obligatoire, ou règle de branche) relève des réglages du dépôt : question posée à Samuel (T17-Q2).
