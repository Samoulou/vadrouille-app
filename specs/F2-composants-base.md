# F2 — Composants de base

Rôle : frontend · Prérequis : F0 · Référence : `docs/handovers/frontend.md` (§ 0, § 4, § 5, § 10, § 11, § 14, § 15 F2), `docs/design-system/README.md`, `docs/design-system/redaction.md`, `docs/design-system/components/Button/` et `docs/design-system/components/Tag/` (README et `preview.html`), `docs/design-system/tokens.json`

## Objectif
Construire dans `src/components/ligne` les huit composants de base du style Ligne, accessibles et testés, sur lesquels s'appuieront les composants de la ligne du jour (F3) et les écrans.

## À livrer
Un fichier par composant dans `src/components/ligne/`, avec son test (`*.test.tsx`, Testing Library et axe), tous les textes dans `src/i18n/fr.json`, uniquement les tokens Ligne de `src/styles/globals.css`. Partir de shadcn/ui (`src/components/ui`) quand un équivalent existe.

| Composant | Props (handover § 5) | Rendu (design system) |
|---|---|---|
| `Button` | `variant: primary \| secondary \| text`, `size: md \| sm`, `asChild`, `disabled` | Principal : aplat `line`, texte `on-line` 800. Secondaire : fond `raised`, contour 1,5 px `ink`, texte `ink` 700. Texte : souligné, `ink` ou `ink-soft`. `md` = 52 px, `sm` = 44 px ; coins `radius-control`. Désactivé : `muted` + `ink-soft`. |
| `IconButton` | `icon`, `label` (obligatoire), `shape: square \| round` | 44 × 44 px, fond `raised`, contour `outline`, icône `ink` au trait 2,2 sur grille 24 ; `square` = `radius-control`, `round` = cercle. `aria-label` = `label`. |
| `Tag` | `kind: toReserve \| toConfirm \| unconfirmed` | Hauteur 24 px, style `etiquette`, coins `radius-tag`. `toReserve` : aplat `quai`, texte `ink`, « À réserver ». `toConfirm` / `unconfirmed` : fond transparent, contour pointillé 1,5 px `ink`, « À confirmer » / « Non confirmé ». |
| `Counter` | `value`, `label` (nom accessible fourni par l'appelant) | Carré `quai` de 24 px minimum, coins `radius-tag`, nombre en 800, chiffres tabulaires, texte `ink`. |
| `Chip` | `selected`, `inferred`, libellé, action | Choix multiple ; `inferred` = contour pointillé ; au moins 44 px de haut. |
| `SegmentedControl` | `options`, `value`, `onChange`, `label` (nom du groupe) | Choix exclusif, rôle `radiogroup`. |
| `OtpInput` | `length = 6`, `onComplete` | Code à 6 chiffres, contour `border-control`. |
| `StatusBanner` | `kind: offline \| conflict \| noOption \| error \| generating`, message fourni par l'appelant | Bandeau d'état transverse ; texte toujours présent. |

- Page `/dev/composants` (désactivée en production, comme `/dev/tokens`) qui montre chaque composant dans chacun de ses états : variantes, tailles, désactivé, focus, sélectionné, déduit, compteur, chaque `kind` de `Tag` et de `StatusBanner`, `OtpInput` vide et rempli.
- Icônes : les deux icônes au trait présentes dans `docs/design-system/components/Button/preview.html` (retour, partager), en composants SVG `aria-hidden`. Le reste du jeu attend l'export du design system (Q13).
- Test de contraste sur les paires de tokens utilisées (handover § 11) : `on-line` sur `line`, `ink` sur `quai`, `ink` et `ink-soft` sur `page`, `ink-soft` sur `muted`, `border-control` sur `page`.
- Captures de référence 390 × 844 de `/dev/composants` dans `tests/visual/`.

## Critères d'acceptation
- [ ] `pnpm verify` passe.
- [ ] axe ne relève aucune violation sur `/dev/composants` (`pnpm test:a11y`) ni dans le test de chaque composant.
- [ ] Playwright en 390 × 844 : tout élément interactif de `/dev/composants` mesure au moins 44 × 44 px ; `Button` `md` mesure 52 px de haut.
- [ ] Playwright : au clavier, chaque élément interactif affiche un contour de 2 px en `line` décalé de 2 px.
- [ ] `Button` : `disabled` n'appelle pas l'action ; `asChild` rend un lien (`role="link"`) avec le style du bouton (tests).
- [ ] `IconButton` sans `label` ne compile pas (`ts-expect-error` dans un test de type) ; son `aria-label` vaut `label` (test).
- [ ] `Tag` affiche le texte de son type depuis `fr.json` ; seul `toReserve` utilise `quai` ; un `kind` hors des trois valeurs ne compile pas (tests).
- [ ] `Counter` expose `label` comme nom accessible et n'affiche rien quand `value` vaut 0 : pas de jaune sans action requise (tests).
- [ ] `Chip` : `aria-pressed` suit `selected` ; un clic bascule l'état ; `inferred` est rendu en pointillé (tests).
- [ ] `SegmentedControl` : rôles `radiogroup` et `radio`, `aria-checked` sur l'option choisie, un seul arrêt de tabulation, flèches gauche et droite pour changer d'option (tests).
- [ ] `OtpInput` : `autocomplete="one-time-code"`, saisie numérique ; coller « 123456 » remplit le code et appelle `onComplete("123456")` une seule fois ; un caractère non numérique est ignoré ; effacer revient au chiffre précédent ; chaque position a un nom accessible (tests).
- [ ] `StatusBanner` : `role="alert"` pour `error`, `role="status"` pour les autres types (provisoire, Q13) ; le message est lu sans dépendre de la couleur (tests).
- [ ] Le test de contraste vérifie au moins 4,5:1 pour le texte et 3:1 pour `border-control`.
- [ ] La règle `react/jsx-no-literals` (ou équivalent) est active sur `src/components/ligne` : aucune chaîne en dur ; tous les textes viennent de `fr.json` avec le vocabulaire du handover § 10.
- [ ] `/dev/composants` répond 404 dans un build de production (test).
- [ ] Capture Playwright de `/dev/composants` comparée à la référence (`pnpm test:visual`).
- [ ] Aucune animation sous `prefers-reduced-motion` (y compris `generating`).
- [ ] La PR joint la capture de `/dev/composants` à côté de `preview.html` de Button et Tag, et liste comme écarts à valider le rendu de `Chip`, `SegmentedControl`, `OtpInput` et `StatusBanner` (absents du design system).

## Hors périmètre
- `DayBadge`, `DayTabs`, `DayLine`, `StopMarker` (F3) ; `DestinationPlate`, `ChecklistRow`, `ReasonBlock`, `Sheet` (écrans F5) ; `DeckCard`, `DeckProgress`, `UndoToast` (F6) ; `ChangeSet` (F7).
- Textes métier des bandeaux d'état et des compteurs : fournis par les écrans.
- Export complet des icônes, thème sombre, écrans, données.

## Questions ouvertes
- Q12 : maquettes non exportées ; la référence visuelle se limite au design system.
- Q13 : rendu de `Chip`, `SegmentedControl`, `OtpInput`, `StatusBanner`, rôle `alert` ou `status` par type, taille du texte des boutons, jeu d'icônes.
