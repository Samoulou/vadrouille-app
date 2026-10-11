# StopMarker

Marqueur d'arrêt et de terminus, sur la ligne du jour et sur la carte, avec la même forme aux deux endroits.

## Variantes

- **Arrêt (ligne)** : anneau `stop` (20 px), épaisseur `stop-ring`, fond `raised`, anneau `line`.
- **Terminus** : carré `terminus` (20 px) en `ink`, coins 5 px ; sur la carte, 24 px avec une maison `on-line`.
- **Arrêt numéroté (carte)** : `stop-map` (26 px), anneau 3 px `line`, numéro `ink` 12 px 800.
- **Arrêt sélectionné (carte)** : `stop-map-selected` (38 px), plein `line`, numéro `on-line`, anneau 3 px `page` pour le détacher du fond.
- **Vue d'ensemble** : anneau de 12 px sans numéro, pour l'aperçu du séjour.

## Règles

- Le numéro sur la carte suit l'ordre de la journée, comme sur la ligne.
- Un seul arrêt sélectionné à la fois ; il correspond à la fiche ouverte.
- Le terminus n'est jamais numéroté.

## Ce que fournit l'appelant

La position, le numéro, l'état (normal, sélectionné) et le type (arrêt ou terminus).
