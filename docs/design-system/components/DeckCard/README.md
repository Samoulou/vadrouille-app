# DeckCard

Carte de la présentation : une proposition à garder ou à écarter, d'un geste ou d'un bouton.

## Anatomie

- Progression en haut, dessinée comme une ligne : un arrêt par proposition, pleins jusqu'à la carte en cours ; à droite, « Passer » en bouton texte.
- Carte : coins `radius-plate`, contour 1 px `outline-strong`, photo du lieu en haut (placeholder `muted` tant qu'il n'y a pas de photo), puis le moment (pastille du jour + heure), le nom en 22 px 800, les métadonnées, la justification d'une ligne et au plus un tag.
- Deux boutons ronds de 68 px : « Pas pour moi » (contour 2 px `ink`, fond `raised`) et « J'aime » (plein `line`, cœur `on-line`), libellés dessous en 13 px.
- Pour un repas, les libellés deviennent « Option suivante » et « Je choisis », et la carte indique « option 1 sur 3 ».

## Règles

- Glisser à droite = J'aime, à gauche = Pas pour moi ; les boutons restent toujours visibles.
- Toucher la carte ouvre le détail ; la carte entière est un bouton avec un `aria-label` explicite.
- Les étapes verrouillées et les engagements ne sont jamais présentés.
- La carte part du côté choisi en suivant le doigt ; rien d'autre ne bouge.

## Ce que fournit l'appelant

La photo, le moment, le nom, les métadonnées, la justification, le tag éventuel, la position dans la présentation et les deux actions.
