# DayBadge

Pastille de jour (J1, J2…) qui sert de numéro de ligne et d'onglet de navigation entre l'aperçu du séjour et les journées.

## Anatomie

- Pastille : au moins 44 × 44 px, coins `radius-badge`, style `pastille` (15 px, 800).
- Inactive : fond `raised`, contour 1,5 px `outline-strong`, texte `ink`.
- Active : aplat `line`, texte `on-line`, `aria-current="true"`.
- Onglet « Aperçu » : texte seul, `ink-soft` en 600 ; actif, il passe en `ink` 800 avec un trait de 3 px en `line` dessous.

## Règles

- La rangée défile horizontalement ; la pastille active reste visible à l'ouverture.
- Les mêmes pastilles, en petit (26 px de haut, coins 6 px), étiquettent un arrêt dans la fiche étape et les lignes de l'aperçu du séjour.
- Pas de date dans la pastille : la date est dans le titre de la journée.

## Ce que fournit l'appelant

Le nombre de jours, le jour actif, l'action de navigation.
