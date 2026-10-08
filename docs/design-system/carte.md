# Carte

La carte est un fond, la ligne est le sujet. Le style de la carte s'efface pour que le tracé `line` et les arrêts se lisent d'abord.

## Style de base

À configurer comme style de carte dans Google Cloud (Map ID), puisque l'application utilise la carte Google.

| Élément | Token | Règle |
|---|---|---|
| Terre, fond | `map-land` | Aplat uniforme, pas de relief. |
| Eau | `map-water` | Aplat, sans libellé sauf grands plans d'eau. |
| Parcs | `map-park` | Aplat très léger. |
| Routes | `map-road` | Blanc pour toutes les catégories ; seule l'épaisseur hiérarchise. Pas de couleur par type de route. |
| Points d'intérêt Google | — | Masqués par défaut : seuls nos arrêts apparaissent. |
| Transports publics | — | Lignes masquées, stations visibles à fort zoom seulement, en gris. |
| Libellés | `ink-soft` | Rues et quartiers en gris, densité réduite. |

## Ce qu'on dessine dessus

- Le tracé du jour en `line`, épaisseur `rail`, extrémités arrondies ; le retour à pied vers l'hôtel en pointillé.
- Les arrêts numérotés : anneau `line` de 3 px, fond `raised`, numéro en `ink` 12 px 800, diamètre `stop-map`.
- L'arrêt sélectionné : plein `line`, numéro `on-line`, anneau `page` de 3 px, diamètre `stop-map-selected`.
- Le terminus : carré `ink` de 24 px, coins 6 px, maison `on-line`.
- Vue d'ensemble du séjour : arrêts en petits anneaux de 12 px, sans numéro.

## Contrôles posés sur la carte

Boutons de 44 px, fond `raised`, contour `outline`, coins `radius-control`, icône `ink`. Toujours en haut à gauche (retour) et en haut à droite (partager). Le panneau coulissant chevauche la carte de 22 px avec ses coins `radius-sheet`.
