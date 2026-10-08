# DayBadge

Pastille de jour (J1, J2…) qui sert de numéro de ligne et d'onglet de navigation entre l'écran Séjour et les journées.

## Anatomie

- Pastille : au moins 44 × 44 px, coins `radius-badge`, style `pastille` (15 px, 800).
- Inactive : fond `raised`, contour 1,5 px `outline-strong`, texte `ink`.
- Active : aplat `line`, texte `on-line`, `aria-current="true"`.
- Onglet « Séjour » (jamais « Aperçu », handover § 10) : texte seul, `ink-soft` en 600 ; actif, il passe en `ink` 800 avec un trait `trait-onglet` (3 px) en `line` dessous.
- Désactivée (jour complet) : fond `muted`, texte `ink-soft`, sans contour, `aria-disabled` ; « complet » écrit sous la pastille en `legende` `ink-soft` (décision 0010, Q18).

## Règles

- La rangée défile horizontalement ; la pastille active reste visible à l'ouverture.
- Les mêmes pastilles, en petit (`badge-s`, 26 px de haut, coins `radius-mini`), étiquettent un arrêt dans la fiche étape et les lignes de l'écran Séjour.
- Pas de date dans la pastille : la date est dans le titre de la journée. Le jour abrégé est toujours dans le nom accessible (« Jour 2, lun. ») ; il n'est écrit, sous la pastille, que là où la personne choisit un jour (Déplacer, Ajouter un lieu) (décision 0010, Q18).

## Ce que fournit l'appelant

Le nombre de jours, le jour actif, l'action de navigation.
