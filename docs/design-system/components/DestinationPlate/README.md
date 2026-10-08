# DestinationPlate

Plaque qui porte le nom de la destination dans sa couleur : le seul endroit où l'interface prend de la couleur.

## Anatomie

- Aplat dans une couleur de la palette fermée : `dest-bruyere`, `dest-azulejo`, `dest-ocre` ou `dest-granit`.
- Nom en style `destination` (36 px, 800), ligne de dates et de voyageurs en 15 px, chiffres tabulaires, tout en `on-line`.
- Coins `radius-plate`, marge intérieure 20 px, marges latérales `space-4`.

## Règles

- Une plaque par écran au maximum : en tête de l'aperçu du séjour, dans « Mes voyages » et sur le souvenir partageable.
- La couleur est attribuée à la destination une fois pour toutes, à partir de la palette fermée ; on n'invente pas de nouvelle couleur sans vérifier un contraste d'au moins 4,5:1 avec `on-line`.
- La couleur de destination ne remplace jamais `line` : le tracé et les actions restent bleus.

## Ce que fournit l'appelant

Le nom de la destination, la ligne d'informations, la couleur de destination choisie.
