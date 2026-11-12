# 0171 — Toute l'application : titrage en grotesque étroite, bouton principal en `ink`

Statut : **décidée par Samuel** (carte de décision du fil du projet, reportée dans `QUESTIONS.md`, Q871), appliquée par l'UX/UI. Modifie deux règles de Ligne (`docs/design-system/README.md`, « Typographie » et « Couleurs »). La graisse du titrage est ramenée à 600 par 0173.

Date : 2026-11-10 · Rédacteur : UX/UI · Ticket #1107.

## Choix de Samuel

Fil du projet « Retirer le look IA du design ». Question posée le 2026-11-10 à 07:33 UTC, avec deux planches (l'application telle quelle, et la même avec le style de la page de précommande de 0170) : « Donner à toute l'app le style de la nouvelle landing ? ». Réponse de Samuel à 07:36 UTC (`cmsg_0174CRqum9q8GNfZHmNHcYvRUd4q8AEAJuTsDUUJPwj2uX`) : « Oui, comme la proposition » (option décrite : « Tous les écrans prennent les titres à caractère et les boutons sombres »). Contexte : son jugement du 2026-11-10 06:30 UTC sur la première page d'accueil, « des font standard sur un fond blanc avec des bouton bleu » (cité dans 0168). Choix reporté dans `QUESTIONS.md` (Q871).

## Décision

1. **Titrage.** Les titres d'écran et de section (`h1`, `h2`) et les styles `destination`, `titre-fiche`, `titre-jour` passent en Bricolage Grotesque, largeur 85 %, graisse 800 puis 600 (0173) (`--font-titrage`, `src/styles/globals.css`). Un petit intertitre (`h2` de la taille du texte) garde Hanken Grotesk par la classe `font-sans`. Tout le reste (noms d'arrêt, texte, données, boutons) reste en Hanken Grotesk : la lecture dehors ne change pas.
2. **Tailles.** La grotesque étroite paraît plus petite à corps égal : `destination` 44/44 (était 36/40), `titre-fiche` 34/36 (30/34), `titre-jour` 34/36 (28/32), `section` 22/26 (20/26). `tokens.json` et `globals.css` suivent.
3. **Bouton principal.** `Button` `primary` : aplat `ink`, texte `on-line` (17:1). Le bleu `line` reste à la ligne, aux arrêts, à la sélection (pastille de jour active, option choisie, « J'aime ») et aux liens d'action.
4. **Inchangés.** Couleurs, rayons, géométrie de la ligne, étiquettes, vocabulaire, absence d'ombres.
5. **Sources de vérité.** `docs/design-system/` (README, `tokens.json`, fiches `Button` et `DestinationPlate`) est aligné dans la même PR. `docs/handovers/frontend.md` garde ses valeurs d'origine (§ 2, § 4) sous une note en tête de section : en cas d'écart, cette décision et `docs/design-system/` priment.
6. **Coût de la police.** Une police variable à deux axes (`opsz`, `wdth`), préchargée sur tous les écrans, sous-ensemble latin : coût non mesuré ici (LCP sur téléphone et réseau lent). À mesurer avant l'ouverture publique ; si c'est trop lourd, retirer l'axe `opsz`.
7. **Captures de référence.** Tous les écrans changent : les références de la régression visuelle sont à régénérer par le libellé `update-snapshots` sur la PR. Les PR ouvertes avant celle-ci régénèrent les leurs après sa fusion.

## Suite

Écran par écran, avec la grille `anti-generique.md` : champs de date du navigateur, emplacement de photo vide, premier écran sans destination. Tickets séparés.
