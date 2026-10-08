# ChecklistRow

Ligne de la liste « À faire avant de partir » : une réservation à faire, son moment, et le lien pour la faire.

## Anatomie

- Case de 22 px (contour 2 px `ink`, coins 5 px) dans une zone touchable de 44 px ; cochée, elle devient un aplat `ink` avec une coche `on-line`.
- Nom en 15 px 700 ; moment en `legende` `ink-soft`, chiffres tabulaires (« J2, 15:00, 2 personnes »).
- Lien « Réserver » en `line` 800, au moins 44 px de haut.
- Séparateur `hairline` entre les lignes.

## Règles

- Faite, la ligne passe en `ink-soft`, le nom barré, et perd son lien ; elle reste dans la liste.
- Le titre de la liste porte un compteur `quai` du nombre de réservations restantes.
- Un lien de réservation rémunéré est signalé comme tel.

## Ce que fournit l'appelant

Le nom, le moment, l'état (à faire ou fait), le lien de réservation.
