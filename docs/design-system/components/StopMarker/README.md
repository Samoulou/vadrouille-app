# StopMarker

Marqueur d'arrêt et de terminus, sur la ligne du jour et sur la carte, avec la même forme aux deux endroits.

## Variantes

- **Arrêt (ligne)** : anneau `stop` (20 px), épaisseur `stop-ring`, fond `raised`, anneau `line`.
- **Terminus** : carré `terminus` (20 px) en `ink`, coins `radius-terminus` ; sur la carte, `terminus-map` (24 px), coins `radius-mini`, avec une maison `on-line`.
- **Arrêt numéroté (carte)** : `stop-map` (26 px), anneau `stop-map-ring` (3 px) `line`, numéro `ink` en style `numero-carte`.
- **Arrêt sélectionné (carte)** : `stop-map-selected` (38 px), plein `line`, numéro `on-line` en style `pastille`, anneau `stop-map-ring` `page` pour le détacher du fond.
- **Vue d'ensemble** : anneau `stop-overview` (12 px) sans numéro, pour l'écran Séjour.

## Règles

- Le numéro sur la carte suit l'ordre de la journée, comme sur la ligne.
- Un seul arrêt sélectionné à la fois ; il correspond à la fiche ouverte.
- Le terminus n'est jamais numéroté.

## Ce que fournit l'appelant

La position, le numéro, l'état (normal, sélectionné) et le type (arrêt ou terminus).
