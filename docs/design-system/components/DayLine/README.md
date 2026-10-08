# DayLine

La ligne du jour : le programme d'une journée présenté comme une ligne de transport, du terminus de départ au terminus de retour.

## Anatomie

- Trois colonnes : heure (52 px, style `heure`, alignée à droite, chiffres tabulaires), rail (28 px), contenu ; écart `space-2`.
- **Terminus** : carré `terminus` en `ink`, au départ et au retour. Libellé « Départ de … » / « Retour à … » en 700.
- **Arrêt** : anneau `stop` en `line` ; nom en style `arret`, métadonnées en `corps-s` `ink-soft`, une ligne de justification en `corps-s` `ink`, tags éventuels. Toute la zone ouvre la fiche étape.
- **Segment à pied** : rail pointillé (`rail-dash`, `rail-gap`) et libellé `legende` « À pied, 20 min » avec l'icône marche.
- **Segment en transport** : rail plein et libellé « Bus, environ 25 min (estimation) ».
- **Temps libre** : rail fin `rail-free` en `track-free`, heure en `legende`, bloc `muted` « Temps libre jusqu'à 19:00 » avec un lien « Idées ».

## Règles

- Une journée commence et finit par un terminus ; le dernier segment rejoint le logement du soir.
- Un repas est un arrêt comme un autre ; s'il n'est pas encore choisi, il reste visible et signalé.
- Les estimations sont dites : « (estimation) » sur un temps de transport public non calculé.
- Le rail ne change jamais de couleur au fil de la journée ; seule sa texture dit le mode de déplacement.

## Ce que fournit l'appelant

La liste ordonnée des terminus, arrêts, segments et temps libres, avec heures, libellés, métadonnées, justification et tags.
