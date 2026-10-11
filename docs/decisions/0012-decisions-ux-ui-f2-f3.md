# 0012 — Décisions UX/UI déléguées pour F2 et F3 (Q10, Q11, Q13, Q15 à Q19, Q30), plus Q157 et Q177

Statut : décision déléguée, définitive sans veto de Samuel sous 2 jours (avant le 2026-10-13) ; à lister dans la note de version suivante, rubrique « Décisions prises par le studio » · Date : 2026-10-08, révisée le 2026-10-11 (correction 3 de la PR #26) · Décideur : UX/UI (écrans et composants non maquettés, dans les règles de Ligne ; délégation « Qui décide quoi » de `docs/CONTEXT.md`) · Ticket : #23 · PR : #26

Délai de veto : la PR #26 n'a pas été fusionnée avant le 2026-10-10 et son contenu change avec cette révision. Le délai de 2 jours repart donc de la date de révision (2026-10-11), pour toutes les décisions ci-dessous. Les rubriques « Propositions… » en fin de document ne sont **pas** décidées ici : elles attendent leur destinataire. Un veto rouvre seulement le point visé.

## Contexte
- F2 (#19), F3 (#30), F5a, F5b, F6 et D1 sont fusionnées. Elles appliquent des valeurs provisoires, rangées dans `src/components/ligne/provisoire.css`, là où le handover front-end (§ 4 et § 5) et Ligne (`docs/design-system/`) ne disent rien ou se contredisent.
- Les maquettes ne sont pas exportées (Q12) : la référence reste le design system (README, `tokens.json`, `preview.html`).
- Depuis la première version de cette décision, deux décisions UX/UI ont été fusionnées : 0014 (F6) et 0018 (F5a, F7, F8, D1). Elles posent une règle que cette révision reprend : **UX/UI ne crée aucun token et ne modifie pas `docs/design-system/`**. Créer un token, ajouter une icône au jeu ou changer une règle de Ligne relève de Samuel (Q37, Q108). Les valeurs sans token restent dans `provisoire.css`, chacune avec sa question (0014 § 2.5, 0018 « Valeurs à déclarer dans `provisoire.css` »).
- En conséquence, cette PR **ne modifie plus aucun fichier de `docs/design-system/`** : `tokens.json`, le README général, les README de composants et les `preview.html` restent ceux de `main`. Les noms de tokens que les versions précédentes ajoutaient à `tokens.json` deviennent la proposition S-8 à Samuel.
- Périmètre :
  - UX/UI décide de la forme de ce qui n'est pas maquetté, dans les règles de Ligne, sans les modifier ;
  - tout changement d'une règle ou d'une valeur de Ligne est une proposition à Samuel ;
  - toute convention de code ou d'outillage est une proposition au Tech Lead.
- La partie fonctionnelle de Q17 (destination du lien « Idées », repas non choisi, `locked`, `kind: "event"`, `Stop.end`) revient au Product Owner. Elle a été tranchée dans la spécification F5 (F5-PO-12 à F5-PO-15).
- Rien ici n'engage d'argent, de compte externe ni de donnée personnelle.

Gravité des écarts de code listés en fin de document : 3 majeur, 2 mineur, 1 cosmétique (`.claude/agents/ux-ui.md`).

## Décisions UX/UI

### Q10 — Surfaces shadcn/ui `card`, `popover`, `destructive` ; feuilles et voile
**Décision (valeurs visuelles).**

| Rôle shadcn | Fond / texte |
|---|---|
| `card` | `raised` / `ink` |
| `popover` | `raised` / `ink` |
| `destructive` | `ink` / `on-line` |

- Une surface `card` ou `popover` est détachée par un contour `outline`, jamais par une ombre.
- **Panneau coulissant** du voyage (`Sheet`) : fond `page` (rendu de F5a). **Feuille modale** (`Dialog` : question de préférence, détail, Déplacer) : fond `raised`, coins supérieurs `radius-sheet`, sur un voile `ink` à 40 %. Ce sont les rendus de 0014 § 4 et 0018 § 11, confirmés : le voile `--ligne-voile` et la hauteur maximale `--ligne-feuille-hauteur-max` restent dans `provisoire.css`, et la mention « en attendant Q10 » tombe.
- Pas de rouge : un message d'erreur de formulaire est en `ink`, un champ invalide prend un contour `ink`, et le message est toujours écrit (même règle que 0018, « Message d'erreur »). Pas de bouton « destructif » : `Button` n'a que `primary`, `secondary` et `text` (handover § 5) ; « Retirer » est un bouton `secondary`.

**Justification.** README Ligne : `page` pour les panneaux, `raised` pour ce qui est posé dessus, « pas d'ombres », « la destination colore, l'interface reste calme », « les informations ne reposent jamais sur la seule couleur ». Contrastes : `ink` sur `raised` et sur `page` au moins 17:1 ; `on-line` sur `ink` 17,2:1.

**Effet.** Aucun composant livré n'utilise `card`, `popover` ni `destructive`. Correspondance des variables dans le code : proposition TL-1.

### Q11 — Tokens de `tokens.json` absents du handover § 4.1
**Décision.** Ils font partie de Ligne et sont utilisables par les composants :
- couleurs `on-quai` (= `ink`) et `focus` (= `line`) ;
- rayon `radius-round` (999 px) pour les arrêts, marqueurs et boutons ronds ;
- styles de texte `heure` (15/22, 700, tabulaire), `pastille` (15/20, 800, tabulaire) et `bloc` (15/20, 800) ;
- espacements : `tokens.json` ne définit que `space-1` à `space-6` et `space-8` (4, 8, 12, 16, 20, 24 et 32 px). Il n'y a ni `space-7` ni demi-pas. L'absence d'espacement (0) n'est pas un token et reste permise. Le README général écrit « `space-1` à `space-8` » : c'est une imprécision de Ligne, signalée à Samuel (S-0), que cette PR ne corrige pas.

**Justification.** Ces valeurs sont déjà des règles de Ligne (`tokens.json`) ; la règle d'or n° 1 du handover interdit les valeurs en dur. Le handover § 4.1 en est une copie incomplète, pas une exclusion.

**Effet.** Les copies de ces valeurs dans `provisoire.css` (`--ligne-espace-2`, `--ligne-rayon-rond`, `--ligne-texte-heure*`, `--ligne-texte-pastille*`, `--ligne-texte-bloc*`, approches `--ligne-titre-jour-approche` et `--ligne-destination-approche`) peuvent devenir des variables de thème dérivées de `tokens.json` (proposition TL-2). Pour les classes d'espacement de Tailwind acceptées à titre provisoire par 0013 § 2 : une classe dont la valeur est sur l'échelle (`1` à `6` et `8`) est conforme ; une autre (par exemple `px-1.5`, 6 px, de la pastille réduite) est un écart de gravité 1, à remplacer par la tâche d'application.

### Q13 — `Chip`, `SegmentedControl`, `OtpInput`, `StatusBanner` ; texte des boutons ; icônes
Ces quatre composants ne sont ni maquettés ni documentés : leur forme relève d'UX/UI. 0018 les réutilise et renvoie à cette décision (« rendu en vigueur ») ; les points communs sont alignés ci-dessous.

**`Chip` (choix multiple).**
- Hauteur au moins `touch-target`, coins `radius-control`, marge intérieure horizontale `space-4`, style `corps` en 600 dans tous les états, pour que la largeur ne change pas d'un état à l'autre.
- Non choisie : fond `raised`, contour 1,5 px (`--ligne-trait-controle`) en `border-control`, texte `ink`. La chip est un contrôle (`aria-pressed`) : son contour doit atteindre 3:1 (handover § 11) et `border-control` fait 3,2:1 sur `page`. C'est le rendu de F2.
- Choisie : aplat `line`, contour `line`, texte `on-line`, précédée d'une coche de 20 px en `on-line`. La coche `on-line` sur aplat `line` est l'exception provisoire déclarée par 0018 § 6 et soumise à Samuel (Q108).
- Déduite (`inferred`), choisie ou non : fond `raised`, contour pointillé 1,5 px en `ink`, texte `ink`. Choisie, une coche de 20 px en `ink` précède le libellé. L'aplat `line` est réservé à ce que la personne a choisi elle-même (principe produit 3). C'est le rendu « avec 0012 fusionnée » de 0018 § 16, à une précision près : le texte reste en 600, et non en 700, pour la raison de largeur donnée plus haut. Cette décision prime sur ce mot de 0018 § 16.
- Indisponible (0018 § 16, « À limiter ») : rendu désactivé du handover (`muted`, `ink-soft`), `aria-disabled="true"`. Sur `muted`, `border-control` tombe à 2,96:1 : une chip indisponible n'a donc pas de contour ; le fond et le texte écrit l'identifient.
- Sur un **contour**, le pointillé a dans Ligne un seul sens, « incertain, à confirmer » (tag « À confirmer », README « Accessibilité ») : la chip déduite reprend ce sens. Le pointillé du **rail** (la marche) est un autre élément.

**`SegmentedControl` (choix exclusif).** Rendu de F2 confirmé :
- rail `muted`, coins `radius-control`, marge intérieure et écart `space-1` ;
- option choisie : aplat `line`, texte `on-line` 700 ; autres options : transparentes, texte `ink-2` 600 ;
- style `corps`, chaque option au moins `touch-target` de haut ;
- rôles : `role="radiogroup"` nommé, `role="radio"` et `aria-checked` sur chaque option, un seul arrêt de tabulation, flèches (handover § 5). Pas d'`aria-pressed`, réservé aux bascules indépendantes (même règle que 0018 « Choix exclusif et action » et 0019 § 1). La version verticale est celle de 0018 § 6.

**`OtpInput` (code à 6 chiffres).** Rendu de F2 confirmé :
- une case par chiffre, 44 px de large (`touch-target`) et 52 px de haut, coins `radius-control`, fond `raised` ;
- contour 1,5 px en `border-control` : le contour seul identifie le champ (3,2:1) ;
- chiffre en style `section` (20/26, 800), tabulaire, écart `space-2` ; six cases et cinq écarts font 304 px, dans les 350 px utiles d'un écran de 390 px ;
- invalide : contour `ink`, `aria-invalid="true"` sur chaque case, message écrit fourni par l'écran (Q10), relié au groupe par `aria-describedby`. Textes : voir Q30.

**`StatusBanner` (états transverses).**
- Bloc `muted`, coins `radius-block`, marge intérieure `space-4`, texte `corps` `ink-2`. Filet vertical à gauche, épais de `rail` (4 px), coins `radius-round`, décoratif : le message porte toute l'information.
- Couleur du filet : `ink` pour `error` et `conflict` ; `ink-soft` pour `offline`, `noOption`, `generating` et `travel` (0018 § 2). Pas de `line` : dans Ligne, `line` « ne sert qu'à la ligne, à la sélection et à l'action principale : jamais à décorer » (README, principe 1), et ce filet est décoratif.
- **Aucune animation**, y compris pour `generating`. La seule animation signature de Ligne est le tracé des lignes pendant la génération, et ailleurs « le mouvement répond à un geste » (README « Mouvement »). Sans mouvement, seul le texte (`role="status"`) dit que la génération avance : l'écran appelant met le message à jour (« Jour 2 prêt », handover § 7). Sur l'écran 5, il n'y a pas de bandeau `generating` du tout (0018 § 19) ; sur l'écran 6b, le bandeau de 0014 § 6 suit cette règle.
- Jamais de `quai` : le « bandeau d'action requise » des écrans 10 et 15 est un autre élément, dessiné avec ces écrans.
- Rôles : `role="alert"` pour `error` et `conflict` (la personne doit réagir avant de continuer) ; `role="status"` pour `offline`, `noOption`, `generating` et `travel` (handover § 11).

**Texte des boutons.** Valeurs du `preview.html` de Button : 16 px, 800 pour `primary`, 700 pour `secondary`, sans interligne fixé (le texte est centré dans un bouton de 52 px). La taille reste `--ligne-bouton-texte` dans `provisoire.css` ; un style nommé est proposé à Samuel (S-8). La variante `text` reste en `corps` (15/22) 400 souligné, comme le `preview.html`.

**Icônes des composants non maquettés.** La coche de `Chip` appartient au jeu Ligne (README « Iconographie »). En attendant l'export SVG, le frontend la trace selon les règles de l'iconographie : grille 24, trait 2,2, extrémités et angles arrondis, sans remplissage, `aria-hidden`, affichée à 20 px comme les icônes du `preview.html` de Button. Icône voiture : proposition S-7.

### Q15 — Onglet de la rangée des jours : « Séjour »
**Décision.** L'onglet s'appelle « Séjour », partout. Ce n'est pas une nouvelle règle : c'est le vocabulaire fixé par Samuel dans le handover § 10 (« Onglet du voyage : Séjour ; jamais Aperçu ») et le nom de l'écran 11. F3 l'applique déjà. Le README et le `preview.html` de DayBadge disent encore « Aperçu » : écart connu, le handover prime, et l'alignement de la source du design system est demandé à Samuel (S-0). « Aperçu des effets » (README « Mouvement ») n'est pas concerné.

### Q16 — Segments de `DayLine` : libellés provisoires
Le libellé d'un segment est une règle de Ligne (README DayLine). UX/UI ne tranche que ce que le design system ne dit pas, au plus près du `preview.html` ; le reste est proposé à Samuel (S-1, S-2, déjà dans Q37).

| `mode` | Libellé (F3, puis F6 par `segmentLabel`, 0014 § 2.4) | Rail |
|---|---|---|
| `walk` | « À pied, 20 min » | pointillé (`rail-dash` / `rail-gap`) |
| `transit` | « Bus, environ 25 min (estimation) » si `estimated` ; « Bus, 25 min » pour un temps calculé | plein |
| `car` | « En voiture, 15 min » (absent du design system) | plein, comme tout trajet en véhicule |

- « environ » et « (estimation) » vont ensemble, si et seulement si `estimated` vaut `true` (forme du `preview.html`). La règle écrite du README reste inchangée en attendant S-2.
- Icônes : à pied et bus d'après les `preview.html` ; pas d'icône pour `car` tant que S-7 n'est pas tranchée (le libellé suffit). Le tracé des icônes manquantes est la question Q51.
- Le Tech Lead a reporté le sous-mode de transport public dans le contrat (0013 § 4, « pas de sous-mode maintenant ») : « Bus » reste donc un provisoire inexact pour un tram, et S-1 (« Transports publics », sans icône) reste la proposition. Le formulaire de création emploie déjà « Transports publics » pour le choix des déplacements (0018 § 16) ; ce n'est pas un libellé de segment.
- Le format des durées longues (« 1 h 05 ») est la question Q53, hors de cette décision.

### Q17 — Ligne du jour : couleurs et graisses (part UX/UI)
**Décision.**
- Heure de début du temps libre : style `legende` (13/18) en 600, `ink-soft`, chiffres tabulaires, alignée à droite (valeurs du `preview.html`, rendu de F3).
- Texte du bloc temps libre : style `corps-s` (14/20), `ink-2` (valeurs du `preview.html`, rendu de F3).
- Lien « Idées », cible d'au moins `touch-target` × `touch-target` :
  - **Rendu du `preview.html` (`ink` 700, sans soulignement) : non conforme WCAG 2.2 AA.** Le lien est dans un texte `ink-2` : `ink` contre `ink-2` ne fait que 1,17:1, donc seule la graisse le distingue du texte voisin (critère 1.4.1, « Utilisation de la couleur » ; règle d'or n° 8 du handover). Ce rendu ne doit pas être rétabli.
  - **Rendu en vigueur dans `main`** : `ink` 700 **souligné**, appliqué par F3 (#30) et accepté à la revue (0013 § 2, « Hors de cette décision »). Il est conforme au critère 1.4.1, mais il s'écarte du `preview.html`, élément maquetté : UX/UI ne le décide pas. Il reste provisoire, déclaré comme écart, jusqu'à la réponse de Samuel à S-3 (Q37).
  - Toute PR qui touche le lien « Idées » (F5, F7 « Idées » par plage, F12) liste cet écart dans sa description, avec le renvoi à S-3, tant que Q37 est ouverte.
  - Si Samuel refuse le soulignement, le lien doit être distingué autrement que par la couleur ou la graisse (par exemple une icône, ou un bouton `text`), sinon l'écart AA revient : c'est à préciser avec sa réponse.
- Le rendu de `locked` et du repas non choisi suit les décisions F5 (F5-PO-12 à F5-PO-15) et 0018 ; ils ne sont pas traités ici.

### Q18 — `DayBadge` et `StopMarker`
**Décision.**
- **Nom accessible.** Il commence par le libellé visible « J2 » (WCAG 2.5.3), puis le complète : « J2, jour 2 », puis le jour de la semaine en toutes lettres quand `weekday` est fourni (« , lundi » : les synthèses vocales lisent mal « lun. »), puis « , complet » quand la pastille est désactivée. Exemple : « J2, jour 2, lundi, complet ». Correspondance : `lun.` lundi, `mar.` mardi, `mer.` mercredi, `jeu.` jeudi, `ven.` vendredi, `sam.` samedi, `dim.` dimanche. « jour 2 » n'est pas redondant : « J2 » seul est lu « J deux ». Même règle pour la pastille réduite et pour le rendu radio de `DayBadgeGroup` (0019 § 1.2).
  - **Écart dans `main`** : `dayBadgeName` (F3) donne « Jour 2 », « Jour 2, lun. » et « Jour 2, complet », sans le libellé visible. 0019 cite ces noms (« Jour 4 », « Jour 3, complet ») pour ses tests de F7b. Changer les textes de `fr.json` et ces attentes de tests est une tâche front ; la forme technique reste au Tech Lead (TL-3, question Q193).
- **Variante réduite** (prop `size: "md" | "sm"`, acceptée par 0013 § 2). En `sm`, la pastille n'est pas interactive : hauteur 26 px (`--ligne-pastille-reduite`, README DayBadge), coins 6 px (`--ligne-rayon-mini`), fond `raised`, contour 1,5 px `outline-strong`, texte `etiquette` en 800, `ink`.
- **`StopMarker`** (prop `variant: "ligne" | "carte"`, acceptée par 0013 § 2). En `ligne` : arrêt en anneau de 20 px, terminus carré de 20 px. En `carte` : arrêt numéroté 26 px, sélectionné 38 px, terminus 24 px avec maison, vue d'ensemble 12 px. Le numéro de l'arrêt sélectionné est en 15 px 800 et celui d'un arrêt de carte en 12 px 800 (valeurs du `preview.html`, dans `provisoire.css`).
- **État désactivé et jour abrégé visible** : la pastille est un élément maquetté, donc proposition S-4. En attendant, le provisoire de F3 s'applique : fond `muted`, texte `ink-soft` (6,97:1), sans contour, « complet » visible, jour abrégé seulement dans le nom accessible.

### Q19 — Mesures et styles sans token
**Décision.** UX/UI ne crée pas de token (même règle que 0014 § 2.5 et 0018). Les mesures relevées dans les `preview.html` restent dans `provisoire.css`, avec leur question, aux valeurs du `preview.html` : elles y sont toutes déjà (colonnes 52 et 28 px, coins 5 et 6 px, terminus de carte 24 px, anneau 3 px, numéros 12 et 15 px, vue d'ensemble 12 px, trait d'onglet 3 px, coins 10 px du temps libre, pastille réduite 26 px, contour 1,5 px, texte des boutons 16 px). Les noms à créer dans Ligne sont proposés à Samuel (S-8) ; les doublons de `provisoire.css` (6 px, 12 px et 3 px, 0014 § 2.5) disparaîtront avec ces tokens.
- **Texte du terminus** : `corps` (15/22) en 700, rendu de F3, confirmé. Ce n'est pas un style nouveau : c'est `corps` avec une graisse. Le nom d'une ligne de `ChecklistRow` est en 15/20 700 dans son `preview.html` : c'est une autre mesure, qui n'est pas rattachée au terminus.
- **Tracé du temps libre** : pointillé fin du `preview.html` (rail-free, `rail-gap`, `track-free`), rendu de F3. Le README le dit « fin » sans parler de pointillé ; le trait plein est proposé à Samuel (S-6).
- **Coins du bloc temps libre** : 10 px (`--ligne-rayon-temps-libre`), valeur du `preview.html`. 12 px (`radius-control`) est proposé à Samuel (S-5).
- **Noms de la géométrie** : les noms du handover (`--ligne-*`) sont gardés dans le code ; la correspondance avec `tokens.json` est la proposition TL-1.

### Q30 — Textes d'`OtpInput` ; trait de 1,5 px et texte des boutons
**Décision.**
- Textes validés : nom du groupe « Code à {length} chiffres » ; nom de chaque case « Chiffre {n} sur {length} ». Quand l'écran affiche un libellé visible au-dessus des cases, il le passe en `label`, et ce libellé devient le nom du groupe (le texte par défaut ne sert qu'en repli).
- Trait de 1,5 px et texte des boutons à 16 px : valeurs du `preview.html`, gardées dans `provisoire.css` (`--ligne-trait-controle`, `--ligne-bouton-texte`) ; noms proposés à Samuel (S-8).

**Justification.** Textes courts et factuels, au format « {n} sur {total} » de `DeckProgress` (« 4 sur 8 », handover § 5, 0014 § 3). Un nom visible prime sur un nom caché (WCAG 2.5.3).

### Q157 — Une plaque par écran et « cartes de voyage » (Mes voyages)
Déléguée à UX/UI par Samuel le 2026-10-11, dans les règles de Ligne (Q168 dans la spécification F11).

**Décision.** Ligne n'est pas modifiée : **une seule plaque par écran**, et les couleurs `dest-*` seulement sur la plaque (README, principe 5 ; README DestinationPlate ; handover § 4.2). Les « cartes de voyage » du handover § 6 (écran W) se lisent comme les éléments de la liste des voyages, sans couleur de destination, et non comme plusieurs plaques.
- **Plaque** : le voyage mis en avant, selon F11-PO-3 (premier de « En cours », sinon de « À venir », sinon de « Pas encore débloqués »), aucune plaque si ces sections sont vides. Forme : `DestinationPlate` en lien (0021, prop `href`), rendu de F5.
- **Carte de voyage** (chaque voyage, y compris celui de la plaque, dans sa section) : surface `card` de Q10, c'est-à-dire fond `raised`, contour `outline`, sans ombre, coins `radius-block`, marge intérieure `space-4`, écart `space-3` entre deux cartes. La carte entière est un seul lien d'au moins `touch-target` de haut. Destination en `arret` 700 `ink`, ligne d'informations en `corps-s` `ink-soft`, mentions et compteurs avec les composants existants (`Tag`, `Counter`). Aucun repère de couleur, aucune pastille `dest-*`, aucune vignette colorée.
- Le reste de l'écran (sections, compteur, année, squelette, état vide) relève de Q165 (UX/UI), traitée avec les captures de F11.

**Justification.** La couleur de destination identifie le voyage qu'on ouvre ; répétée sur chaque carte, elle ne distinguerait plus rien et ferait de la liste un écran coloré, contre « l'interface reste calme ». La liste reste lisible sans couleur : la destination et les dates sont écrites. Ce choix est celui de F11-PO-3 ; il ne change aucune spécification.

**Effet.** Aucun code existant (F11 n'est pas codée). F11a applique cette forme.

### Q177 — Largeurs grand écran et survol
Déléguée à UX/UI par Samuel le 2026-10-11, dans les règles de Ligne.

**Décision.**
- **Pas d'intégration à Ligne.** `--ligne-panneau-large` et `--ligne-colonne` sont des mesures de mise en page d'écrans non maquettés (handover § 6, « Mise en page grand écran (non maquettée) »), pas des règles du système : elles restent dans `provisoire.css`, avec le renvoi « 0012, Q177 », comme le prévoient la spécification F12 et 0022. Les inscrire dans `tokens.json` serait modifier Ligne, ce que le rôle UX/UI ne fait pas. Si les vues bureau sont un jour maquettées (cadrage § 3.1), la maquette prime et Samuel décidera de leur place dans Ligne.
- **Valeurs** :
  - `--ligne-panneau-large` : 420 px, valeur du handover § 6 ;
  - `--ligne-colonne` : 28 rem (448 px), valeur de départ de 0022 (le `max-w-md` actuel), sur l'échelle de 4 px. Les rendus autour (séparateur, marges, feuille centrée) relèvent de Q173 et des captures de F12.
- **Survol** (souris, grand écran) :
  - aucun état de survol propre : pas de changement de couleur, de contour, d'ombre ni de mouvement au survol. La profondeur vient des aplats, sans ombre, et le mouvement répond à un geste (README « Mouvement ») : un survol n'est pas un geste ;
  - curseur « pointeur » sur ce qui s'active (comme le `preview.html` de Button), curseur par défaut ailleurs ;
  - aucune information ni action seulement au survol : pas d'info-bulle, pas de bouton qui n'apparaît qu'au survol (WCAG 1.4.13 et 2.5.7 ; le même contenu des deux côtés du seuil, F12-PO-6) ;
  - le focus clavier garde son contour de Ligne, indépendant du survol ;
  - les comportements existants qui écoutent le survol sans changer le rendu restent permis (pause du compte à rebours de `UndoToast`).

**Justification.** Ligne est un système « mobile d'abord », sans règle de survol : n'en ajouter aucune garde l'interface calme et identique pour le toucher et la souris, et ne crée pas de règle nouvelle.

**Effet.** Aucun code existant. F12b et F12c appliquent ces valeurs ; une PR qui ajoute un `hover:` visible est un écart de gravité 2.

## Points devenus sans objet ou tranchés ailleurs
- **Modifications de `docs/design-system/`** des versions précédentes (tokens `col-heure`, `col-rail`, `terminus-map`, `stop-map-ring`, `stop-overview`, `badge-s`, `trait-*`, `radius-terminus`, `radius-mini`, styles `corps-fort`, `numero-carte` et `bouton`, extension de l'`usage` de `pastille`, README alignés sur « Séjour ») : **retirées** de la PR, pour suivre la règle de 0014 § 2.5 et de 0018. Elles deviennent S-0 et S-8. Les trois points de la revue du 2026-10-08 (head accdc47) sur les interlignes de `bouton` et de `numero-carte`, l'`usage` de `pastille` et `corps-fort` sont donc sans objet dans Ligne : ils sont repris dans S-8, avec les mesures exactes du `preview.html`.
- **Sémantique radio du choix d'un jour** : tranchée par le Tech Lead (0019 § 1, Q111). Cette décision s'y aligne (Q13, Q18).
- **Rendu de la chip déduite dans la création** : 0018 § 16 renvoie ici ; précisé en Q13 (graisse 600).
- **Filet de `travel`** : 0018 § 2, aligné en Q13.
- **Format des trajets dans la présentation** : 0014 § 2.4 reprend le libellé de Q16.
- **Feuilles modales et voile** : 0014 § 4 et 0018 § 11, confirmés en Q10.
- **Effets sur F2 et F3 décrits par les versions précédentes** : F2, F3 et F5a sont fusionnées. Les écarts qui restent entre le code de `main` et cette décision sont listés ci-dessous ; les spécifications F2 et F3, achevées, ne sont pas réécrites.

## Écarts du code de `main` avec cette décision (tâche front à créer)
1. **Gravité 2** : nom accessible de `DayBadge` (« J2, jour 2, lundi, complet ») ; textes de `fr.json` et attentes des tests de F3 et de 0019 (TL-3, Q193).
2. **Gravité 2** : `StatusBanner` : `role="alert"` pour `conflict` ; filet de `generating` en `ink-soft` sans `animate-pulse` ; commentaires « Provisoire (Q13) » retirés.
3. **Gravité 2** : `Chip` : coche de 20 px (choisie : `on-line` ; déduite choisie : `ink`) ; une chip déduite choisie n'a plus d'aplat `line` ; chip indisponible sans contour.
4. **Gravité 2** : `OtpInput` invalide : `aria-invalid="true"` sur chaque case et `aria-describedby` vers le message, si ce n'est pas déjà fait.
5. **Gravité 1** : classes d'espacement hors de l'échelle (Q11), et renvois de commentaire de `provisoire.css` vers cette décision (Q10, Q11, Q13, Q19, Q30).

## Propositions au Tech Lead (conventions de code et d'outillage, non décidées ici)
- **TL-1. Correspondance des noms de `tokens.json` et de `provisoire.css`.** Couleurs `page` → `--color-page` dans `@theme` ; rayons `radius-tag` → `--radius-tag` ; styles `heure` → `--text-heure` et `--text-heure--line-height` ; géométrie `rail` → `--ligne-rail` ; espacements : échelle de 4 px de Tailwind, seuls utilitaires `0` à `6` et `8` dans `src/components`, vérifiables par un test.
- **TL-2. Mise en œuvre de Q10 et Q11.** Variables shadcn `--card`, `--popover`, `--destructive` et leurs `-foreground` ; `--color-on-quai`, `--color-focus`, `--radius-round` ; retrait des classes `shadow-*` des composants shadcn ; copies de `tokens.json` retirées de `provisoire.css`.
- **TL-3. Nom accessible de Q18** : par `aria-label` ou par un texte réservé aux lecteurs d'écran après « J2 », pour `DayBadge`, la pastille réduite et `DayBadgeGroup` (0019).

## Propositions de modification de Ligne, à valider par Samuel (non décidées ici)
Chaque proposition indique le provisoire en vigueur, le plus proche du `preview.html`. S-0 à S-7 sont déjà dans Q37 ; S-8 la complète, avec Q108 (U2-Q1) et la proposition de 0014 § 2.5.

| # | Proposition | Raison | Provisoire en vigueur |
|---|---|---|---|
| S-0 | Aligner la source du design system sur « Séjour » (README et `preview.html` de DayBadge), corriger « `space-1` à `space-8` » en « `space-1` à `space-6` et `space-8` », exporter les icônes en SVG | Vocabulaire du handover § 10 ; il n'y a pas de `space-7` | « Séjour » dans le code ; Ligne inchangée |
| S-1 | Segment `transit` : « Transports publics », sans icône, tant que le mode n'est pas connu | Fiabilité (principe produit 2) ; pas de sous-mode dans le contrat (0013 § 4) | « Bus », icône bus |
| S-2 | « environ » et « (estimation) » ensemble sur tout temps de trajet non calculé, jamais sur un temps calculé | Le contrat porte `estimated` sur tous les modes | Les deux mots si et seulement si `estimated` vaut `true` |
| S-3 | Lien « Idées » souligné (WCAG 1.4.1), en `ink` 700 ou en `line` 700 | Sans soulignement, seule la graisse le distingue (1,17:1 entre `ink` et `ink-2`) : non conforme AA | `ink` 700 souligné (F3), écart au `preview.html` déclaré |
| S-4 | `DayBadge` désactivé : fond `muted`, texte `ink-soft`, sans contour, « complet » sous la pastille ; jour abrégé visible seulement là où l'on choisit un jour | Concilie le handover § 5 et le README | Provisoire de F3 |
| S-5 | Coins du bloc temps libre à 12 px (`radius-control`) au lieu de 10 px | Un rayon de moins dans le système | 10 px (`provisoire.css`) |
| S-6 | Tracé du temps libre en trait plein fin | Sur le rail, le pointillé dit la marche | Pointillé fin du `preview.html` |
| S-7 | Icône voiture dessinée par le frontend selon les règles de l'iconographie, en attendant l'export SVG | Le jeu n'a pas d'icône voiture | Pas d'icône pour `car` |
| S-8 | Créer les tokens et styles des mesures relevées dans les `preview.html` : `col-heure` (52), `col-rail` (28), `terminus-map` (24), `stop-map-ring` (3), `stop-overview` (12), `badge-s` (26), `radius-terminus` (5), `radius-mini` (6), `trait-fin` (1), `trait-controle` (1,5), `trait-fort` (2), `trait-onglet` (3) ; styles `bouton` (16 px, 800 ; 700 en secondaire), `numero-carte` (12 px, 800, tabulaire), `corps-fort` (15/22, 700, terminus) ; usage de `pastille` étendu au numéro de l'arrêt sélectionné (15 px, 800). Les interlignes de `bouton` et de `numero-carte` ne figurent pas dans les `preview.html` : à fixer par Samuel (20 et 16 px suggérés) | Retirer les valeurs en dur de `provisoire.css` et ses doublons | Valeurs dans `provisoire.css` |

## Conséquences
- Cette PR ne modifie que ce fichier. Aucun fichier de `docs/design-system/`, aucune maquette, aucun `preview.html`, aucune spécification ni aucun handover n'est modifié.
- À lister dans la note de version suivante, rubrique « Décisions prises par le studio » (`docs/CONTEXT.md`) : « Décisions UX/UI pour F2 et F3, Q157 et Q177 — UX/UI — docs/decisions/0012-decisions-ux-ui-f2-f3.md ».
- Les propositions S-x et TL-x n'entrent en vigueur qu'avec l'accord de leur destinataire.
- Si une maquette exportée (Q12) contredit cette décision, la maquette prime et la décision est amendée.

## Questions liées
- **Q37, Q108** (Samuel, Ligne) : S-0 à S-8.
- **Q51, Q53, Q165, Q173** (UX/UI) : hors de cette décision.
- **Q193** (Tech Lead, nouvelle) : forme du nom accessible de Q18 (TL-3) et mise à jour des attentes de tests de 0019 § 1 ; propositions TL-1 et TL-2. Bloque : la tâche front des écarts ci-dessus.
