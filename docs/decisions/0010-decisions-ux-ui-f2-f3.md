# 0010 — Décisions UX/UI déléguées pour F2 et F3 (Q10, Q11, Q13, Q15 à Q19, Q30)

Statut : décidé · Date : 2026-10-08 · Décideur : UX/UI (écrans et composants non maquettés, dans les règles de Ligne : délégation « Qui décide quoi » de `docs/CONTEXT.md`) · Définitive sans veto de Samuel avant le 2026-10-10 · Ticket : #23

## Contexte
- F2 (composants de base, PR #19) et F3 (ligne du jour, `specs/F3-ligne-du-jour.md`) appliquent des valeurs provisoires là où le handover front-end (§ 4 et § 5) et le design system Ligne (`docs/design-system/`) se taisent ou se contredisent. Ces valeurs vivent dans `src/components/ligne/provisoire.css` et sont listées comme écarts dans les PR.
- Les maquettes ne sont pas exportées (Q12, Samuel) : la référence reste le design system (README, `tokens.json`, `preview.html`).
- Règles appliquées, par ordre de priorité : handover § 0 (règles d'or) et § 4.2 (usage des tokens, qui primeront sur les maquettes pour les valeurs : handover § 1), principes du design system (README, « Principes »), vocabulaire (handover § 10, `redaction.md`).
- Partie de Q17 hors de ce document : destination du lien « Idées », repas non choisi, affichage de `locked`, de `kind: "event"` et de `Stop.end` relèvent du Product Owner.

## Règle de nommage commune (tranche aussi la partie « noms » de Q19)
- Dans `tokens.json`, les noms restent sans préfixe (référence du design system).
- Dans le code, la correspondance est fixe :
  - couleurs : `--color-<nom>` ; rayons : `--radius-<nom>` ; styles de texte : `--text-<nom>` (avec `--line-height` et, si le style en a une, `--font-weight`), tous dans `@theme` ;
  - géométrie de la ligne (groupe `ligne`) et traits (nouveau groupe `trait`) : `--ligne-<nom>` dans `:root`, comme le handover § 4.1 ; seule exception déjà en place : `--touch-target`.
- Espacements : l'échelle `space-1` à `space-8` de `tokens.json` est l'échelle de 4 px par défaut de Tailwind (`space-n` = utilitaire `n`, par exemple `p-4` = `space-4` = 16 px). Aucune variable `--space-*` n'est ajoutée. Pas autorisés dans `src/components` : 0, 1, 2, 3, 4, 5, 6 et 8 (le pas 7 et les demi-pas n'existent pas dans Ligne). Les hauteurs de composant documentées (52 px du bouton `md`, 44 px de `--touch-target`) ne sont pas des espacements.

## Décisions

### Q10 — Correspondance shadcn/ui pour `card`, `popover`, `destructive`
**Décision.** Ajouter à la correspondance shadcn/ui (`:root`, puis `@theme inline` pour les utilitaires) :

| Variable shadcn | Valeur |
|---|---|
| `--card` / `--card-foreground` | `var(--color-raised)` / `var(--color-ink)` |
| `--popover` / `--popover-foreground` | `var(--color-raised)` / `var(--color-ink)` |
| `--destructive` / `--destructive-foreground` | `var(--color-ink)` / `var(--color-on-line)` |

Règles d'usage :
- Une surface `card` ou `popover` est toujours détachée par un contour `outline` (variable `--border`), jamais par une ombre : retirer les classes `shadow-*` des composants shadcn importés (Popover, Dialog, Drawer, DropdownMenu…).
- Les panneaux coulissants (`Sheet`, `Drawer`) et les feuilles modales gardent le fond `page` (`--background`), comme le dit `tokens.json` pour `page`.
- Ligne n'a pas de rouge. `destructive` vaut `ink` : un message d'erreur de formulaire (`text-destructive`) est en `ink`, et un champ invalide (`aria-invalid`) prend un contour `ink`, toujours avec le message en texte. La variante de bouton `destructive` de shadcn n'est pas utilisée : `Button` n'a que `primary`, `secondary` et `text` (handover § 5) ; une action comme « Retirer » est un bouton `secondary`.

**Justification.** `raised` est la surface posée sur une autre (`tokens.json`) ; « pas d'ombres : la profondeur vient des aplats et des contours fins » (README) ; « la destination colore, l'interface reste calme » et « les informations ne reposent jamais sur la seule couleur » (README) excluent un rouge réservé aux erreurs ; `ink` sur `page` : 17:1 ; `on-line` sur `ink` : 17:1.

**Effet.** F2 (#19) : aucun composant de #19 n'utilise ces variables ; le commentaire de `globals.css` qui renvoie à `QUESTIONS.md` est remplacé par la correspondance. Spec F3 : sans effet.

**Application.** Tâche frontend d'application de cette décision (voir « Application ») : `globals.css` et `tests/unit/tokens.test.ts`.

### Q11 — Tokens de `tokens.json` absents du handover § 4.1
**Décision.** Tous entrent dans `globals.css` :
- couleurs : `--color-on-quai: var(--color-ink)` et `--color-focus: var(--color-line)` (le focus du handover § 4.2 utilise alors `var(--color-focus)`, même rendu) ;
- rayon : `--radius-round: 999px` (utilitaire `rounded-round`, à préférer à `rounded-full` pour les arrêts, marqueurs et boutons ronds) ;
- styles de texte : `heure` (15/22, 700), `pastille` (15/20, 800), `bloc` (15/20, 800), avec leur graisse en `--text-<nom>--font-weight` ; `heure` et `pastille` en chiffres tabulaires, comme les autres styles de données ;
- espacements : pas de variable, voir « Règle de nommage commune ».

**Justification.** Ces valeurs sont déjà les règles de Ligne (`tokens.json`, README « Espacement et rayons », « Typographie ») ; la règle d'or n° 1 du handover interdit les valeurs en dur, il faut donc des tokens. Le handover § 4.1 en est une copie incomplète, pas une exclusion.

**Effet.** F2 (#19) : `rounded-full` du filet de `StatusBanner` devient `rounded-round`. Spec F3 : la mention « Si Q11 n'est pas tranchée, ces valeurs vont dans le fichier provisoire » tombe : `heure`, `pastille`, `space-2` et `radius-round` sont des tokens, aucune déclaration `/* Q11 */` dans `provisoire.css`.

**Application.** Tâche frontend d'application : `globals.css`, `src/styles/tokens.ts` (inventaire), `tests/unit/tokens.test.ts` (une valeur `{ink}` ou `{line}` de `tokens.json` se lit comme une référence), page `/dev/tokens`.

### Q13 — Rendu de `Chip`, `SegmentedControl`, `OtpInput`, `StatusBanner` ; rôles des bandeaux ; texte des boutons ; icônes
**`Chip` (choix multiple).**
- Hauteur au moins `--touch-target`, coins `radius-control`, marge intérieure horizontale `space-4`, style `corps` en 600 dans tous les états (pas de saut de largeur).
- Non choisie : fond `raised`, contour `--ligne-trait-controle` (1,5 px) `outline-strong`, texte `ink` (même traitement que la pastille de jour inactive : le libellé identifie le contrôle).
- Choisie : aplat `line`, contour `line`, texte `on-line`, précédée de l'icône coche (20 px, `on-line`).
- Déduite (`inferred`), choisie ou non : fond `raised`, contour pointillé `--ligne-trait-controle` `ink`, texte `ink` ; si elle est choisie, l'icône coche (20 px, `ink`) précède le libellé. Le pointillé `ink` est le même signe que le tag « À confirmer » : déduit, pas encore confirmé par la personne ; l'aplat `line` est réservé à ce que la personne a choisi elle-même.

**`SegmentedControl` (choix exclusif).** Rendu de #19 confirmé : rail `muted`, coins `radius-control`, marge intérieure et écart `space-1` ; option choisie en aplat `line`, texte `on-line` 700 ; autres options transparentes, texte `ink-2` 600 ; style `corps` ; chaque option au moins `--touch-target` de haut.

**`OtpInput` (code à 6 chiffres).** Rendu de #19 confirmé : une case par chiffre, 44 px de large (`--touch-target`) et 52 px de haut, coins `radius-control`, fond `raised`, contour `--ligne-trait-controle` `border-control` (le contour seul identifie le champ : 3,2:1), chiffre en style `section` (20/26, 800) tabulaire, écart `space-2`. Six cases et cinq écarts font 304 px, dans les 350 px utiles d'un écran de 390 px. Invalide (`aria-invalid`) : contour `ink`, message en texte fourni par l'écran (voir Q10). Textes : voir Q30.

**`StatusBanner` (états transverses).**
- Bloc `muted`, coins `radius-block`, marge intérieure `space-4`, texte `corps` `ink-2`, filet vertical à gauche d'épaisseur `--ligne-rail` (4 px), coins `radius-round`, décoratif (`aria-hidden`). Le message porte toute l'information.
- Couleur du filet : `ink` pour `error` et `conflict`, `ink-soft` pour `offline` et `noOption`, `line` pour `generating` (la ligne en construction, seul usage de `line` dans le bandeau).
- **Aucune animation**, y compris pour `generating` : la seule animation signature de Ligne est le tracé des lignes de chaque jour pendant la génération (écran 5, F8), et « ailleurs, le mouvement répond à un geste » (README « Mouvement »). La pulsation provisoire de #19 est retirée.
- Jamais de `quai` : le « bandeau d'action requise » `quai` des écrans 10 et 15 (handover § 4.2 et § 6) est un autre élément, dessiné avec ces écrans (F5, F10).
- Rôles : `role="alert"` pour `error` et `conflict` (la personne doit réagir avant de continuer : une action n'a pas abouti, ou deux versions du programme s'opposent) ; `role="status"` pour `offline`, `noOption` et `generating` (information, handover § 11 « états via `role="status"` »).

**Texte des boutons.** Nouveau style `bouton` : 16/20, sans graisse propre (800 pour `primary`, 700 pour `secondary`, comme le README de Button). La variante `text` reste en `corps` (15/22) 400 souligné, comme le `preview.html`.

**Icônes.** En attendant l'export SVG du jeu (fichiers du design system, détenus par Samuel), le frontend dessine les icônes manquantes (voiture, coche, cadenas, cœur, plus, fermer, repère) selon les règles de l'iconographie (grille 24, trait 2,2, extrémités et angles arrondis, sans remplissage, `aria-hidden`), dans le fichier d'icônes existant, et les montre sur `/dev/composants` pour revue UX/UI. Elles seront remplacées par l'export. Les icônes de ligne de texte s'affichent à 20 px, comme dans le `preview.html` de Button.

**Justification.** `line` = sélection et action principale (README, principe 1) ; pointillé = incertain (« À confirmer », README « Accessibilité ») ; présentation sans généralisation silencieuse des préférences (principe produit 3) ; contours décoratifs quand un libellé identifie le contrôle, `border-control` sinon (README « Couleurs ») ; une seule animation signature (README « Mouvement ») ; « les informations ne reposent jamais sur la seule couleur » : coche visible pour une chip choisie, texte du bandeau.

**Effet sur F2 (#19).** `Chip` : contour non choisi `border-control` → `outline-strong` ; ajout de la coche ; déduite choisie : plus d'aplat `line`. `StatusBanner` : `conflict` passe en `alert` ; `animate-pulse` retiré ; filet `w-1` → `--ligne-rail`. `SegmentedControl`, `OtpInput` : inchangés. Les critères de F2 « `role="alert"` pour `error` seulement (provisoire) » et « liste comme écarts le rendu de Chip… » sont remplacés par ces règles.

**Application.** #19 si elle n'est pas fusionnée quand cette décision l'est ; sinon la tâche frontend d'application. Icônes : F3 (voiture, à pied, bus, maison) et tâche d'application (coche) ; les autres avec leur premier écran.

### Q15 — Onglet de la rangée des jours : « Séjour »
**Décision.** L'onglet s'appelle « Séjour », partout. Le design system est corrigé dans ce même changement : `components/DayBadge/README.md` et le libellé de `components/DayBadge/preview.html` ; les mentions « aperçu du séjour » des README DayBadge, StopMarker et DestinationPlate deviennent « écran Séjour ». « Aperçu des effets » (README « Mouvement ») n'est pas concerné.

**Justification.** Vocabulaire fixe du handover § 10 (« Onglet du voyage : Séjour ; jamais Aperçu »), écran 11 « Séjour » (handover § 6) ; « Aperçu » est aussi interdit pour l'essai gratuit (« Tes premières propositions ») : un même mot pour deux choses contredirait la règle « une action garde le même nom de bout en bout » (`redaction.md`).

**Effet.** Spec F3 : le libellé provisoire « Séjour » devient définitif ; plus d'écart à lister. F2 : sans effet.

**Application.** Faite ici pour le design system. Samuel : la source du design system (hors dépôt) est à aligner au prochain export (voir « Nouvelles questions » de la PR).

### Q16 — Libellés et textures des segments de `DayLine`
**Décision.**

| `mode` | Libellé | Icône | Rail |
|---|---|---|---|
| `walk` | « À pied, 20 min » | à pied | pointillé (`rail-dash` / `rail-gap`) |
| `transit` | « Transports publics, 25 min » | bus (pictogramme générique des transports publics) | plein |
| `car` | « En voiture, 15 min » | voiture | plein |

- Si `estimated` vaut `true` : « environ » avant la durée et « (estimation) » après, ensemble (« Transports publics, environ 25 min (estimation) ») ; sinon ni l'un ni l'autre. C'est la forme du design system, qui annonce une estimation sans ambiguïté ; « environ » n'est jamais utilisé pour une date (`redaction.md`).
- Le libellé « Bus » n'apparaît pas tant que les données ne disent pas qu'il s'agit d'un bus : le contrat `Segment` ne connaît que `transit`. Si le contrat gagne un sous-mode (bus, tram, métro, train), le libellé devient « Bus », « Tram », « Métro » ou « Train » (nouvelle question au Tech Lead dans la PR).
- La texture distingue la marche des véhicules ; `transit` et `car` partagent le rail plein et se distinguent par le libellé et l'icône. Le rail ne change jamais de couleur (README DayLine).

**Justification.** Principe produit 2 : aucune information non vérifiée (« Bus » sur un trajet en tram serait faux) ; « transports publics » est le terme courant en Suisse romande, la cible du MVP ; la texture du rail ne porte que deux sens, et l'information ne repose jamais sur elle seule (libellé toujours présent).

**Effet.** Spec F3 : « Bus » → « Transports publics » ; « En voiture » et la règle « environ » deviennent définitifs ; l'icône voiture n'est plus omise (voir Q13, icônes). Le README DayLine est aligné ; le `preview.html` (exemple « Bus » sur données d'Édimbourg) reste une illustration.

**Application.** F3 (`fr.json`, `DayLine.Segment`, icône voiture).

### Q17 — Ligne du jour : couleurs et graisses (part UX/UI)
**Décision.**
- Lien « Idées » du temps libre : `line` en 700, cible d'au moins `--touch-target` × `--touch-target`. Contraste `line` sur `muted` : 5,7:1 (paire à ajouter au test de contraste).
- Heure de début du temps libre : style `legende` (13/18) en 600, `ink-soft`, chiffres tabulaires, alignée à droite. Le 600 compense la petite taille et le gris dans la colonne des heures en 700 ; le temps libre reste visiblement secondaire.
- Texte du bloc temps libre (« Temps libre jusqu'à 19:00 ») : style `corps-s` (14/20), `ink-2`, comme le `preview.html`.
- Si le Product Owner décide de montrer `locked` ou un repas non choisi sur la ligne, leur rendu suit ces règles : `locked` = icône cadenas 20 px `ink-soft` à côté du nom, avec un texte accessible « Verrouillée » ; repas non choisi = arrêt ordinaire avec un tag pointillé (signe de l'incertain), jamais de `quai` sauf action requise ; un événement (`kind: "event"`) est un arrêt comme les autres, sans couleur propre.

**Justification.** Handover § 4.2 : `line` pour les « liens d'action », et les tokens priment sur les maquettes pour les valeurs (handover § 1) ; même traitement que « Réserver » de ChecklistRow (`line`). Le reste reprend le `preview.html`.

**Effet.** Spec F3 : lien « Idées » `ink` → `line` ; heure du temps libre : provisoire confirmé ; style du texte du bloc précisé (`corps-s`). F2 : sans effet.

**Application.** F3 ; test de contraste de F2 (paire `line` sur `muted`) par F3.

### Q18 — `DayBadge` et `StopMarker`
**Décision.**
- **Jour abrégé (`weekday`).** Toujours dans le nom accessible (« Jour 2, lun. »). Jamais visible dans la rangée `DayTabs` (le titre de la journée porte la date, et le README dit « pas de date dans la pastille »). Visible, sous la pastille et hors d'elle, en `legende` `ink-soft`, dans les contextes où la personne choisit un jour (feuille « Déplacer », écran « Ajouter un lieu »), où le jour de la semaine aide à choisir (« avec jour abrégé », handover § 5).
- **Désactivée (« complet »).** Fond `muted`, texte `ink-soft` (7:1), sans contour, `aria-disabled="true"`, pas de lien ; « complet » est écrit sous la pastille (sous le jour abrégé s'il est affiché), en `legende` `ink-soft`, et inclus dans le nom accessible (« Jour 3, sam., complet »). La pastille garde sa taille : le mot n'entre pas dedans.
- **Réduite.** Prop `size: "md" | "sm"` (proposition de F3 acceptée). `sm` : non interactive, 26 px de haut (`--ligne-badge-s`), coins `radius-mini` (6 px), fond `raised`, contour `--ligne-trait-controle` `outline-strong`, texte `ink` en style `etiquette` à 800, chiffres tabulaires.
- **Nom accessible des deux tailles.** Le texte visible « J2 » est masqué aux lecteurs d'écran (`aria-hidden`) et doublé d'un texte réservé aux lecteurs d'écran « Jour 2 » (avec jour abrégé et « complet » selon les cas) : « J2 » n'est pas lu de façon fiable.
- **`StopMarker`.** Prop `variant: "ligne" | "carte"` (proposition de F3 acceptée, « carte » par défaut ; `DayLine` passe toujours `"ligne"`). `ligne` : arrêt anneau 20 px, terminus carré 20 px. `carte` : arrêt numéroté 26 px, sélectionné 38 px, terminus 24 px avec maison, vue d'ensemble 12 px (mesures : voir Q19).

**Justification.** Concilie le handover (« avec jour abrégé ») et le README (« pas de date dans la pastille ») ; cibles et contrastes (README « Accessibilité ») ; même traitement désactivé que `Button` (handover § 5) ; information jamais portée par la seule couleur (« complet » écrit).

**Effet.** Spec F3 : « complet » passe de « sous J{day} dans la pastille » à « sous la pastille » ; jour abrégé visible ajouté pour les contextes de choix (prop d'affichage à proposer par le frontend dans la PR de l'écran Déplacer, F7) ; nom accessible par texte masqué ; props `size` et `variant` confirmées côté UX/UI (le Tech Lead garde la main sur leur forme).

**Application.** F3 (`DayBadge`, `StopMarker`) ; affichage du jour abrégé : F7 (Déplacer) et écran Ajouter un lieu.

### Q19 — Mesures et styles sans token
**Décision.** Nouveaux tokens, ajoutés à `tokens.json` dans ce changement et à `globals.css` par la tâche d'application :

| Token (`tokens.json`) | Variable (code) | Valeur | Usage |
|---|---|---|---|
| `col-heure` | `--ligne-col-heure` | 52px | Colonne heure de la ligne du jour |
| `col-rail` | `--ligne-col-rail` | 28px | Colonne rail de la ligne du jour |
| `terminus-map` | `--ligne-terminus-map` | 24px | Terminus sur la carte (avec maison) |
| `stop-map-ring` | `--ligne-stop-map-ring` | 3px | Anneau des arrêts de carte, du sélectionné et de la vue d'ensemble |
| `stop-overview` | `--ligne-stop-overview` | 12px | Arrêt de la vue d'ensemble |
| `badge-s` | `--ligne-badge-s` | 26px | Hauteur de la pastille réduite |
| `trait-fin` | `--ligne-trait-fin` | 1px | Contour du bouton icône, de la carte de présentation |
| `trait-controle` | `--ligne-trait-controle` | 1.5px | Bouton secondaire, pastille inactive, tag pointillé, chip, case de code |
| `trait-fort` | `--ligne-trait-fort` | 2px | Case de ChecklistRow, bouton rond « Pas pour moi » |
| `trait-onglet` | `--ligne-trait-onglet` | 3px | Trait sous l'onglet « Séjour » actif |
| `radius-terminus` | `--radius-terminus` | 5px | Carré terminus de la ligne (20 px) |
| `radius-mini` | `--radius-mini` | 6px | Pastille réduite, terminus de carte |
| style `corps-fort` | `--text-corps-fort` | 15/22, 700 | Texte du terminus, nom d'une ligne de ChecklistRow |
| style `numero-carte` | `--text-numero-carte` | 12/16, 800, tabulaire | Numéro d'un arrêt de carte |
| style `bouton` | `--text-bouton` | 16/20 | Texte des boutons `primary` et `secondary` (Q13) |

- Numéro de l'arrêt sélectionné sur la carte : style `pastille` (15/20, 800), sans nouveau token.
- Bloc du temps libre : coins `radius-control` (12 px) au lieu de 10 px. Le bloc a la hauteur d'un contrôle et contient une cible tactile ; Ligne fait suivre les rayons à la taille de l'élément, et un rayon de plus n'apporte rien (écart de 2 px, invisible à l'usage).
- Tracé du temps libre : **trait plein fin** (`rail-free`, `track-free`), comme le README et `tokens.json`. Le pointillé est le signe de la marche (README « Accessibilité ») ; le réutiliser pour le temps libre donnerait deux sens à une texture. Le pointillé du `preview.html` de DayLine est un écart du `preview.html`, non retenu.
- Noms : voir « Règle de nommage commune » (`--ligne-*` dans le code, sans préfixe dans `tokens.json`).

**Justification.** Valeurs reprises du design system (README et `preview.html`), sans en changer aucune hormis le rayon du bloc temps libre ; règle d'or n° 1 du handover (aucune mesure en dur) ; un token par rôle réutilisé, un style nommé quand le couple taille-graisse sert à plusieurs endroits (`corps-fort`).

**Effet.** Spec F3 : `provisoire.css` ne contient plus aucune valeur `/* Q19 */` ; terminus en `corps-fort` (provisoire confirmé) ; tracé plein fin confirmé ; coins du bloc temps libre 10 → 12 px. F2 (#19) : `--ligne-trait-controle` garde son nom et devient un token.

**Application.** Tâche frontend d'application (`globals.css`, inventaire, tests de tokens) ; F3 consomme les tokens.

### Q30 — Textes d'`OtpInput` ; tokens du trait de 1,5 px et du texte des boutons
**Décision.**
- Textes validés : nom du groupe « Code à {length} chiffres » ; nom de chaque case « Chiffre {n} sur {length} ». Quand l'écran affiche un libellé visible au-dessus des cases, il le passe en `label` et ce libellé devient le nom du groupe (le texte par défaut reste la solution de repli).
- Trait de 1,5 px : token `trait-controle`, variable `--ligne-trait-controle` (voir Q19).
- Texte des boutons à 16 px : style `bouton`, variable `--text-bouton` (16/20) (voir Q13).

**Justification.** Textes courts, factuels, sans jargon, au format « {n} sur {total} » déjà employé par `DeckProgress` (« 4 sur 8 », handover § 5) ; un nom visible prime sur un nom caché (WCAG 2.5.3, « Label in Name »).

**Effet.** F2 (#19) : textes de `fr.json` inchangés ; `provisoire.css` se vide (`--ligne-trait-controle` et `--ligne-bouton-texte` deviennent `--ligne-trait-controle` et `--text-bouton` dans `globals.css`) et peut être retiré.

**Application.** Tâche frontend d'application ; validation d'`OtpInput` dans F8.

## Application
- **Design system** (ce changement) : `tokens.json` (nouveaux tokens et styles), README de DayBadge (« Séjour »), `preview.html` de DayBadge (libellé seulement), README de DayLine, StopMarker, DestinationPlate et Button, README général (iconographie, rayons).
- **Tâche frontend d'application** (à ouvrir par le CEO, ou intégrée à #19 si elle n'est pas fusionnée) : `globals.css` (Q10, Q11, Q19, Q30), `src/styles/tokens.ts`, `tests/unit/tokens.test.ts`, `/dev/tokens`, retrait de `provisoire.css`, corrections de `Chip` et de `StatusBanner` (Q13) et de leurs tests.
- **F3** : applique Q15 à Q19 sans fichier provisoire pour les points tranchés ici.
- **Spécifications** : `specs/F2-composants-base.md` et `specs/F3-ligne-du-jour.md` gardent leurs mentions « provisoire » ; cette décision les remplace pour les points listés. Leur mise à jour reste au Product Owner ou au CEO.

## Conséquences
- Plus aucune valeur sans token pour les composants de F2 et F3 : `provisoire.css` disparaît.
- Les `preview.html` du design system restent des illustrations ; quand ils divergent d'une décision ci-dessus (lien « Idées » en `ink`, « Bus », temps libre pointillé, coins 10 px), la décision prime.
- Un veto de Samuel avant le 2026-10-10 sur un point le rouvre seul ; les autres restent acquis.
