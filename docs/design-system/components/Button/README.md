# Button

Bouton d'action en quatre variantes : principal, secondaire, texte et icône.

## Variantes

- **Principal** : aplat `line`, texte `on-line` en style `bouton` (16/20) et 800, hauteur 52 px, coins `radius-control`. Une seule action principale par zone d'écran (« Garder », « Appliquer », « Débloquer »).
- **Secondaire** : fond `raised`, contour `trait-controle` (1,5 px) `ink`, texte `ink` en style `bouton` et 700. Pour l'alternative directe (« Remplacer », « Annuler », « Ajouter »).
- **Texte** : style `corps`, souligné, `ink` ou `ink-soft`, au moins 44 px de haut. Pour les sorties discrètes (« Passer », « Plus tard »).
- **Icône** : carré de 44 px, fond `raised`, contour `trait-fin` `outline`, icône `ink`, `aria-label` obligatoire. Pour les contrôles posés sur la carte.

## Règles

- Le libellé est le verbe exact de l'action, identique partout (voir Rédaction).
- Hauteur minimale `touch-target` (44 px) ; 52 px pour les boutons pleine largeur en bas d'écran.
- Focus : 2 px d'écart en `page`, puis anneau 2 px en `focus`.
- Pas d'icône décorative dans un bouton à libellé, sauf « Itinéraire » (repère) et « Ajouter » (plus).

## Ce que fournit l'appelant

Le libellé, la variante, l'action ; pour la variante icône, l'icône et son `aria-label`.
