# 0005 — Dépendances de F2 et typage du build

Statut : accepté · Date : 2026-10-08 · Décideur : Tech Lead (revue de la PR #19) · Définitif sans veto de Samuel avant le 2026-10-10

## Contexte
La tâche F2 (composants de base Ligne, page `/dev/composants`) ajoute deux dépendances, une vérification dans la CI et quelques choix d'API hors du texte de la spécification. La revue de la PR #19 les a examinés. Elle a aussi relevé un échec du job `docker` : `.dockerignore` exclut `tests/`, alors que `next build` vérifie les types de tout `src/**`, y compris les tests rangés à côté des composants (`src/components/ligne/*.test.tsx`), qui importent `tests/unit/axe.ts` et les types jest-dom de `tests/unit/setup.ts`.

## Décisions (toutes acceptées)

### `@radix-ui/react-slot` 1.4.0 (dépendance)
- Conforme à la règle de la décision 0003 (« dernière version stable vérifiée sur le registre npm ») : 1.4.0 est le `latest` ; 1.4.1 et 1.5.0 ne sont que des `rc`.
- Publiée depuis trois jours : aucune règle n'impose d'âge minimal, et la version est figée par le lockfile.
- Pair `react ^19` compatible. Unique dépendance : `@radix-ui/react-compose-refs` 1.1.5, du même éditeur.
- C'est le `Slot` de shadcn/ui ; pas d'alternative plus légère pour `asChild`.
- Non retenus pour l'instant : `@radix-ui/react-toggle`, `@radix-ui/react-radio-group`, `input-otp`. Les implémentations maison de `Chip`, `SegmentedControl` et `OtpInput` sont courtes et testées ; à revoir si Q13 complexifie ces rendus.

### `axe-core` 4.13.0 (dépendance de développement)
- Volontairement pas la dernière version (4.14.0) : 4.13.0 est celle qu'utilise `@axe-core/playwright` 4.13.0. Les règles sont ainsi identiques en jsdom (Vitest) et dans Playwright.
- `axe-core` et `@axe-core/playwright` montent ensemble.

### Typage du build : `tsconfig.build.json`
- `next build` vérifie les types avec `tsconfig.build.json`, déclaré dans `next.config.ts` par `typescript: { tsconfigPath: "tsconfig.build.json" }`.
- Ce fichier étend `tsconfig.json` et exclut `**/*.test.ts`, `**/*.test.tsx` et `tests/**`.
- `pnpm typecheck` garde le `tsconfig.json` complet : les tests (et leurs `@ts-expect-error`) restent vérifiés en CI.
- On ne retire pas `tests` de `.dockerignore` et on ne déplace pas les tests : la spécification F2 les veut à côté des composants.

### CI : 404 de `/dev/composants` dans le job `docker`
La ligne `curl` qui vérifie que `/dev/composants` répond 404 dans l'image de production est acceptée. Elle complète le test unitaire en vérifiant l'image réelle.

### `cn()` connaît les tokens Ligne
`extendTailwindMerge` reçoit les tokens Ligne (`src/lib/utils.ts`). La source unique reste `src/styles/tokens.ts`, et `tests/unit/cn.test.ts` couvre le cas. Tout nouveau composant Ligne passe par `cn()`.

### Props hors spécification, acceptées sans modification
- **`tone` sur `Button`** : la spécification veut une variante texte « `ink` ou `ink-soft` », d'où une prop ; le `compoundVariants` la limite à `variant="text"`.
- **`defaultValue` sur `OtpInput`** : sert à l'état « rempli » de `/dev/composants` ; lue seulement à l'initialisation, chiffres seuls conservés.
- **`Counter` en `role="img"` + `aria-label`** : ARIA 1.2 interdit `aria-label` sur un `span` générique ; `role="img"` fait de `label` le nom accessible. L'appelant inclut le nombre dans `label` (JSDoc).

## Conséquences
- Un test placé dans `src/` peut importer `tests/` sans casser l'image Docker ; le code applicatif, lui, ne doit jamais importer `tests/` (il serait absent du build).
- Une montée de `axe-core` se fait en même temps que celle de `@axe-core/playwright`.
- La décision 0003 renvoie ici pour ces deux dépendances.
