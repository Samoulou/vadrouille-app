# 0003 — Versions retenues pour le socle front (F0)

Statut : accepté · Date : 2026-10-08 · Décideur : agent frontend (tâche F0), validé par le Tech Lead lors de la revue de la PR #3

## Contexte
Le handover front-end (§ 2) demande la dernière version stable de chaque outil au démarrage, notée dans une décision (le handover cite `0001-versions.md`, numéro déjà pris : la spécification F0 fixe `0003-versions.md`). Versions vérifiées sur le registre npm le 2026-10-08.

## Décision

| Outil | Version | Note |
|---|---|---|
| Node.js | 22 (LTS) | Version de la CI (`actions/setup-node`, `node-version: 22`) et de l'image Docker (`node:22-bookworm-slim`) ; `engines.node >= 22.12` |
| pnpm | 10.28.0 | Champ `packageManager` |
| Next.js | 16.4.0 | App Router, `output: "standalone"` |
| React / React DOM | 19.3.0 | |
| TypeScript | 6.0.3 | **Pas 7.0.2** (dernière) : `typescript-eslint` 8.71 exige `< 6.1.0` ; TypeScript 7 (compilateur natif) n'est pas encore pris en charge par l'outillage ESLint |
| Tailwind CSS / `@tailwindcss/postcss` | 4.3.3 | |
| shadcn/ui | `components.json` (style new-york, variables CSS) | Aucun composant ajouté en F0 ; dépendances `clsx` 2.1.1, `tailwind-merge` 3.7.0, `class-variance-authority` 0.7.1 |
| ESLint | 9.39.5 | **Pas 10.12.0** (dernière) : `eslint-plugin-react`, `eslint-plugin-jsx-a11y` et `eslint-plugin-import`, chargés par `eslint-config-next`, ne déclarent pas ESLint 10 |
| `eslint-config-next` | 16.4.0 | Configuration plate `core-web-vitals` + `typescript` |
| Vitest | 5.0.3 | Environnement `jsdom` 30.1.2 |
| Testing Library | `@testing-library/react` 16.3.3, `dom` 10.4.2, `jest-dom` 7.0.1 | |
| Playwright | `@playwright/test` 1.56.1 | **Pas 1.64.0** (dernière) : version alignée sur le Chromium préinstallé des sessions d'agents (révision 1194), pour que les captures de référence soient produites et comparées avec le même navigateur en local et en CI |
| axe | `@axe-core/playwright` 4.13.0 | Règles WCAG 2.0/2.1/2.2 A et AA + bonnes pratiques |
| `@radix-ui/react-slot` | 1.4.0 | Ajouté en F2 (`asChild` des composants Ligne) : voir la décision 0005 |
| `axe-core` (dev) | 4.13.0 | Ajouté en F2 (axe dans Vitest) ; **pas 4.14.0**, aligné sur `@axe-core/playwright` : voir la décision 0005 |
| `@googlemaps/js-api-loader` | 2.1.3 | Ajouté en F4 (chargement de la carte Google) ; **remplace `@vis.gl/react-google-maps`** nommée par le handover : voir la décision 0013 |
| `@types/google.maps` (dev) | 3.66.4 | Ajouté en F4, déclaré dans `types` de `tsconfig.json` ; monte avec le chargeur : voir la décision 0013 |
| `@radix-ui/react-dialog` | 1.2.0 | Feuille modale de F6 (`Dialog` de shadcn/ui, `src/components/ui/dialog.tsx`) ; `vaul` (`Drawer`) non retenu : voir la décision 0013 |

## Conséquences
- Revoir TypeScript 7 et ESLint 10 quand `typescript-eslint` et `eslint-config-next` les prendront en charge.
- Toute montée de version de Playwright change le Chromium : régénérer les captures (`pnpm test:visual:update`) dans la même PR.
- Bibliothèques de geste : `motion` n'est pas installé ; F6 utilise les Pointer Events natifs (décision 0013, § 3.4).
- Image Docker : l'étiquette `node:22-bookworm-slim` suit les correctifs de Node 22 ; la figer par empreinte si la reproductibilité stricte devient nécessaire.
