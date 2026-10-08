# Ligne

Ligne est le système de design du planificateur de voyages IA. Chaque journée s'y lit comme une ligne de transport : l'hôtel est le terminus, les étapes sont des arrêts, les trajets sont les segments entre eux. L'interface promet ce que le produit promet : un programme fiable, lisible d'un coup d'œil, dehors, sur un téléphone. La couleur et l'émotion viennent de la destination, pas de l'interface.

Le produit n'a pas encore de nom ni de logo. En attendant, le nom s'écrit en Hanken Grotesk 800, en ink.

## Principes

1. **La ligne est la signature.** Le tracé, les arrêts et le terminus portent l'identité. Le bleu `line` ne sert qu'à la ligne, à la sélection et à l'action principale : jamais à décorer.
2. **Le jaune veut dire « agis ».** `quai` marque uniquement ce qui demande une action de la personne : réserver, compléter. Un écran sans action requise n'a pas de jaune.
3. **Seules les exceptions ont un badge.** Pas de badge « vérifié » : l'absence de badge vaut vérification. On signale « À réserver », « À confirmer », « Non confirmé ».
4. **Les chiffres s'alignent.** Heures, dates, durées et montants sont en chiffres tabulaires, alignés à droite dans leur colonne.
5. **La destination colore, l'interface reste calme.** Une seule plaque par voyage, dans une couleur de la palette fermée `dest-*`. Tout le reste est neutre.
6. **Lisible dehors.** Contrastes forts, cibles de 44 px minimum, texte jamais plus clair que `ink-soft`.

## Couleurs

Thème clair uniquement pour l'instant.

| Rôle | Token | Règle |
|---|---|---|
| Fond | `page` | Fond de page et panneaux. `raised` pour ce qui est posé sur la carte. `muted` pour les blocs secondaires. |
| Texte | `ink`, `ink-2`, `ink-soft` | `ink` pour le texte principal, `ink-2` sur `muted`, `ink-soft` pour le secondaire. Pas de noir pur, pas de gris plus clair. |
| Ligne | `line`, `on-line` | Tracé, arrêts, pastille active, bouton principal, liens d'action. Texte blanc dessus. |
| Action requise | `quai`, `on-quai` | Tags « À réserver » et compteurs. Toujours avec du texte `ink`. |
| Contours | `hairline`, `outline`, `outline-strong`, `border-control` | Les trois premiers sont décoratifs. Un contour qui seul identifie un contrôle (champ de saisie) utilise `border-control` (3,2:1). |
| Destination | `dest-bruyere`, `dest-azulejo`, `dest-ocre`, `dest-granit` | Plaque destination uniquement, texte `on-line`. Palette fermée : on n'en génère pas d'autres sans vérifier le contraste. |
| Carte | `map-land`, `map-water`, `map-park`, `map-road` | Style de la carte Google : voir la section Carte. |

Exemple : un tag « À réserver » est un aplat `quai` avec du texte `ink` en style `etiquette`, coins `radius-tag`.

## Typographie

Une seule famille, **Hanken Grotesk**, servie par Google Fonts en 400, 600, 700 et 800. Elle est nette, lisible en petit et dehors, sans effet. La personnalité vient de la graisse 800 des titres, légèrement resserrés, et de l'alignement des chiffres.

- Titres : `destination`, `titre-fiche`, `titre-jour` en 800 ; `section`, `arret`, `bloc` pour structurer un écran.
- Texte : `corps` pour expliquer, `corps-fort` (même taille en 700) pour le terminus et les noms de liste, `corps-s` pour les métadonnées, `legende` pour les trajets et les aides.
- Contrôles : `bouton` pour le texte des boutons principal (800) et secondaire (700).
- Données : `heure`, `heure-l`, `montant`, `pastille`, `numero-carte`, `etiquette`, toujours en chiffres tabulaires.
- Ni capitales pour les libellés, ni italique, ni mot isolé mis en couleur dans un titre.

## Espacement et rayons

Échelle de 4 px (`space-1` à `space-8`). Marge latérale des écrans : `space-5`. Les rayons suivent la taille de l'élément : petits et presque carrés pour ce qui informe (`radius-tag`, `radius-badge`), plus doux pour ce qui se touche (`radius-control`), plus amples pour ce qui contient (`radius-block`, `radius-plate`, `radius-sheet`). Les arrêts sont ronds (`radius-round`), le terminus est carré (`radius-terminus`, `radius-mini` pour les petits éléments de 24 à 26 px). Les contours suivent l'échelle `trait-*` (1, 1,5, 2 et 3 px).

Pas d'ombres : la profondeur vient des aplats (`page`, `raised`, `muted`) et des contours fins.

## La ligne du jour

La ligne du jour est l'élément central du système (composant DayLine) :

- Trois colonnes : heure (`col-heure`, 52 px, alignée à droite), rail (`col-rail`, 28 px), contenu ; écart `space-2` (8 px).
- Le rail fait `rail` (4 px) en `line`. Il est plein pour un trajet en transport, pointillé (`rail-dash` / `rail-gap`) pour la marche, fin (`rail-free`) en `track-free` pendant le temps libre.
- Un arrêt est un anneau `stop` (20 px) d'épaisseur `stop-ring`, fond `raised`. Le terminus (hôtel) est un carré `terminus` en `ink`, coins `radius-terminus` (5 px), au départ comme au retour.
- Sur la carte, les mêmes arrêts sont numérotés (`stop-map`, 26 px, anneau `stop-map-ring`) ; l'arrêt sélectionné grossit (`stop-map-selected`) et passe en plein `line`. Le terminus de carte fait `terminus-map` (24 px) ; la vue d'ensemble utilise des anneaux `stop-overview` (12 px).
- Les pastilles de jour réduites font `badge-s` (26 px de haut).
- Une journée commence et finit toujours par un terminus.

## Iconographie

Icônes au trait, sur une grille de 24 px, trait de 2,2 px, extrémités et angles arrondis, sans remplissage, en `ink` ou en `ink-soft`. Seul le terminus utilise une icône blanche sur aplat (maison). Jeu actuel : retour, partager, fermer, à pied, bus, maison, cadenas, cœur, itinéraire (repère), coche, plus. Pas d'emoji, nulle part. Les fichiers d'icônes restent à extraire en SVG.

## Mouvement

Une seule animation signature : pendant la génération, la ligne de chaque journée se dessine d'un terminus à l'autre, puis les arrêts apparaissent. Ailleurs, le mouvement répond à un geste et montre ce qui change : la carte de présentation part du côté choisi, l'aperçu des effets met en évidence les arrêts déplacés. Respecter `prefers-reduced-motion`.

## Accessibilité

- Contrastes de texte : `ink` 17:1, `ink-soft` 7,5:1 sur `page` ; `on-line` 6,3:1 sur `line` ; `ink` 10,8:1 sur `quai` ; chaque `dest-*` au moins 5,8:1 avec `on-line`.
- Focus clavier : 2 px d'écart en `page`, puis anneau de 2 px en `focus`.
- Cibles : `touch-target` (44 px) minimum ; les gestes de la présentation sont toujours doublés de boutons.
- Les informations ne reposent jamais sur la seule couleur : « À réserver » est un aplat avec texte, « À confirmer » un contour pointillé avec texte, la marche un pointillé avec libellé.

## Reste à faire

Thème sombre (usage le soir pendant le voyage), logo et icône d'application une fois le nom choisi, export des icônes en SVG, règles pour les photos des lieux, style de carte à configurer dans Google Cloud, composants restants (champs de saisie, panneau coulissant, aperçu des effets, états).
