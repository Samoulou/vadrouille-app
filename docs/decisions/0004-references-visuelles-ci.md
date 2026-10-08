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
