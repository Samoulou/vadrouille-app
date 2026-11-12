# Ne pas faire « généré »

Grille de l'agent UX/UI (`.claude/agents/ux-ui.md`), demandée par Samuel le 2026-11-10. Elle complète Ligne (`README.md`) et ne le remplace pas. Une page réussie ne pourrait pas servir à un autre produit en changeant le logo.

## Les marques à retirer

| Marque | Pourquoi elle trahit | À la place |
|---|---|---|
| Halos flous, dégradés d'ambiance, lueurs derrière un titre | Décor sans sens, présent sur toutes les pages générées | Aplats (`ink`, `page`, `muted`) et le rail de la ligne |
| Un mot du titre en couleur ou en italique | Tic de titre le plus répandu ; interdit par Ligne (« Typographie ») | Un titre d'une seule voix, grand, coupé là où la phrase respire |
| Sérif de titrage posée sur une interface sans sérif | Costume emprunté : deux identités sur une page | Une grotesque de titrage, parente de la police de Ligne |
| Tout en pilule (`rounded-full`) | Forme par défaut | Les rayons de Ligne : `radius-control` pour ce qui se touche, `radius-tag` pour ce qui informe |
| Maquette de téléphone inclinée, pastille collée de travers | Mise en scène de banque d'images | Le vrai composant, droit, dans le panneau de l'application (`Sheet`) |
| Cartes de couleur vides, inclinées en éventail | Remplissage : une couleur et un nom, rien à lire | Un tableau, une liste, de la donnée |
| Grille de trois ou quatre cartes « titre, deux lignes » avec icône ou barrette | Gabarit le plus reconnaissable | Une légende, une liste à filets, le vrai fragment d'interface |
| Trois ronds numérotés reliés par un trait | Gabarit « comment ça marche » | Des arrêts sur le rail de la page, avec l'écran correspondant à côté |
| Rangée de coches « avantages » | Liste de confiance générique | Une ligne de texte, séparée par des filets |
| Ombres portées (`shadow-*`) | Ligne n'a pas d'ombres | Contours et aplats |
| Tout centré, sections blanc / gris / blanc sans lien | Rythme de gabarit | Un axe à gauche tenu par le rail, d'un terminus à l'autre |
| Capitales espacées en sur-titre, emoji, pastille « Nouveau » | Tics | Rien, ou une étiquette de quai (`radius-tag`) |
| Textes creux : « simplement », « sans effort », « réinventé », superlatifs, promesses sans preuve | Sonne faux, et engage le produit | La phrase concrète de `redaction.md`, vocabulaire du handover § 10 |

## Ce qui donne l'identité

1. **La ligne.** Rail, anneaux, terminus carré. Sur une page longue, le rail la traverse et chaque section est un arrêt.
2. **Le jaune `quai` veut dire « agis ».** Sur une page de vente : le bouton d'achat, rien d'autre (un `Tag` de l'application montré dans un fragment d'exemple est un écart à écrire dans la décision).
3. **Les plaques de destination** portent la couleur. L'interface reste `ink` et `page`.
4. **Les vrais morceaux de l'application** (ligne du jour, étiquettes, boutons de tri) plutôt qu'une illustration.
5. **Des chiffres tabulaires et des filets** : horaire, tableau des départs, billet.

## Contrôle avant d'ouvrir une PR

- Capture ordinateur (1440) et téléphone (390), avant et après.
- Chercher dans le diff : `blur-`, `shadow-`, `rotate-`, `italic`, `rounded-full` hors arrêts, `uppercase`, `opacity-` sur du texte. Chaque occurrence se justifie ou part.
- Cacher le logo : reconnaît-on encore le produit ?
