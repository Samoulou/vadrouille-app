# 0012 — Décisions UX/UI déléguées pour F2 et F3 (Q10, Q11, Q13, Q15 à Q19, Q30)

Statut : décidé · Date : 2026-10-08 · Décideur : UX/UI (écrans et composants non maquettés, dans les règles de Ligne : délégation « Qui décide quoi » de `docs/CONTEXT.md`) · Ticket : #23

Délai de veto : les décisions UX/UI ci-dessous sont définitives sans veto de Samuel avant le 2026-10-10. Le délai de 2 jours court à partir de la date de la décision (2026-10-08), pas de la fusion de la PR. Les deux rubriques « Propositions… » en fin de document ne sont **pas** décidées ici : elles attendent la réponse de leur destinataire.

## Contexte
- F2 (composants de base, PR #19) et F3 (ligne du jour, `specs/F3-ligne-du-jour.md`) appliquent des valeurs provisoires là où le handover front-end (§ 4 et § 5) et le design system Ligne (`docs/design-system/`) ne disent rien ou se contredisent. Ces valeurs sont dans `src/components/ligne/provisoire.css` et listées comme écarts dans les PR.
- Les maquettes ne sont pas exportées (Q12, Samuel) : la référence reste le design system (README, `tokens.json`, `preview.html`).
- Périmètre de cette décision (`.claude/agents/ux-ui.md`) :
  - UX/UI décide de la forme de ce qui n'est pas maquetté, dans les règles de Ligne, sans les modifier ;
  - dans `docs/design-system/`, ce changement nomme des valeurs déjà présentes dans les `preview.html` et applique le mot « Séjour » imposé par le handover § 10. Il contient aussi quatre nouveautés, signalées comme telles : les interlignes des styles `bouton` (20 px) et `numero-carte` (16 px), absents des `preview.html`, l'extension de l'`usage` de `pastille` et la précision « `space-1` à `space-6` et `space-8` ». La liste exacte des modifications est dans « Conséquences » ;
  - tout changement d'une règle de Ligne est une proposition à Samuel ;
  - toute convention de code ou d'outillage est une proposition au Tech Lead.
- La partie fonctionnelle de Q17 (destination du lien « Idées », repas non choisi, affichage de `locked`, de `kind: "event"` et de `Stop.end`) revient au Product Owner.

## Décisions UX/UI

### Q10 — Rendu des surfaces shadcn/ui `card`, `popover`, `destructive`
**Décision (valeurs visuelles).**

| Rôle shadcn | Fond / texte |
|---|---|
| `card` | `raised` / `ink` |
| `popover` | `raised` / `ink` |
| `destructive` | `ink` / `on-line` |

- Une surface `card` ou `popover` est détachée par un contour `outline`, jamais par une ombre.
- Les panneaux coulissants et les feuilles modales gardent le fond `page`.
- Pas de rouge : un message d'erreur de formulaire est en `ink`, un champ invalide prend un contour `ink`, et le message est toujours écrit. Pas de bouton « destructif » : `Button` n'a que `primary`, `secondary` et `text` (handover § 5) ; « Retirer » est un bouton `secondary`.

**Justification.** `raised` est la surface posée sur une autre (`tokens.json`) ; « pas d'ombres » (README) ; « la destination colore, l'interface reste calme » et « les informations ne reposent jamais sur la seule couleur » (README). `ink` sur `page` : 17:1 ; `on-line` sur `ink` : 17,2:1.

**Effet.** F2 (#19) : aucun composant de #19 n'utilise ces rôles. Spec F3 : sans effet. Mise en œuvre dans le code : proposition TL-1.

### Q11 — Tokens de `tokens.json` absents du handover § 4.1
**Décision.** Ils font partie de Ligne et doivent être utilisables par les composants :
- couleurs `on-quai` (= `ink`) et `focus` (= `line`) ;
- rayon `radius-round` (999 px) pour les arrêts, marqueurs et boutons ronds ;
- styles de texte `heure` (15/22, 700, tabulaire), `pastille` (15/20, 800, tabulaire) et `bloc` (15/20, 800) ;
- espacements : seuls `space-1` à `space-6` et `space-8` (4, 8, 12, 16, 20, 24 et 32 px) existent. Il n'y a ni `space-7` ni demi-pas. L'absence d'espacement (0) n'est pas un token et reste permise.

**Justification.** Ces valeurs sont déjà des règles de Ligne (`tokens.json`, README « Espacement et rayons », « Typographie ») ; la règle d'or n° 1 du handover interdit les valeurs en dur. Le handover § 4.1 en est une copie incomplète, pas une exclusion.

**Effet.** Spec F3 : `heure`, `pastille`, `space-2` et `radius-round` ne vont plus dans `provisoire.css` (aucune déclaration `/* Q11 */`). F2 (#19) : le filet de `StatusBanner` utilise `radius-round`. Noms et emplacement dans le code : propositions TL-1 et TL-2.

### Q13 — Rendu de `Chip`, `SegmentedControl`, `OtpInput`, `StatusBanner` ; rôles des bandeaux ; texte des boutons ; icônes
Ces quatre composants ne sont ni maquettés ni documentés : leur forme relève d'UX/UI.

**`Chip` (choix multiple).**
- Hauteur au moins `touch-target`, coins `radius-control`, marge intérieure horizontale `space-4`, style `corps` en 600 dans tous les états, pour que la largeur ne change pas.
- Non choisie : fond `raised`, contour `trait-controle` (1,5 px) `border-control`, texte `ink`. La chip est un contrôle (`aria-pressed`) : son contour doit atteindre 3:1 (handover § 11) et `border-control` fait 3,2:1. L'exception décorative de la pastille de jour inactive (`outline-strong`) ne s'étend pas à la chip. C'est le rendu de #19, inchangé.
- Choisie : aplat `line`, contour `line`, texte `on-line`, précédée d'une coche de 20 px en `on-line`. La coche fait partie du jeu d'icônes Ligne.
- Déduite (`inferred`), choisie ou non : fond `raised`, contour pointillé `trait-controle` en `ink`, texte `ink`. Si elle est choisie, une coche de 20 px en `ink` précède le libellé. L'aplat `line` est réservé à ce que la personne a choisi elle-même (principe produit 3 : aucune généralisation silencieuse).
- Sur un **contour**, le pointillé a dans Ligne un seul sens, « incertain, à confirmer » (tag « À confirmer », README « Accessibilité ») : la chip déduite reprend ce sens, elle n'en crée pas un nouveau. Le pointillé du **rail** (la marche) est un autre élément, sans risque de confusion.

**`SegmentedControl` (choix exclusif).** Le rendu de #19 est confirmé :
- rail `muted`, coins `radius-control`, marge intérieure et écart `space-1` ;
- option choisie : aplat `line`, texte `on-line` 700 ;
- autres options : transparentes, texte `ink-2` 600 ;
- style `corps`, chaque option au moins `touch-target` de haut ;
- rôles : `role="radiogroup"` nommé sur le rail, `role="radio"` et `aria-checked` sur chaque option, un seul arrêt de tabulation, les flèches changent d'option (handover § 5 « Rôle radiogroup », rendu de #19). Pas d'`aria-pressed`, réservé à `Chip`.

**`OtpInput` (code à 6 chiffres).** Le rendu de #19 est confirmé :
- une case par chiffre, 44 px de large (`touch-target`) et 52 px de haut, coins `radius-control`, fond `raised` ;
- contour `trait-controle` en `border-control` : le contour seul identifie le champ (3,2:1) ;
- chiffre en style `section` (20/26, 800), tabulaire, écart `space-2` ;
- six cases et cinq écarts font 304 px, dans les 350 px utiles d'un écran de 390 px ;
- invalide : contour `ink`, `aria-invalid="true"` sur chaque case, et message écrit fourni par l'écran (Q10), relié au groupe par `aria-describedby`. Textes : voir Q30.

**`StatusBanner` (états transverses).**
- Bloc `muted`, coins `radius-block`, marge intérieure `space-4`, texte `corps` `ink-2`. Filet vertical à gauche, épais de `rail` (4 px), coins `radius-round`, décoratif. Le message porte toute l'information.
- Couleur du filet : `ink` pour `error` et `conflict`, `ink-soft` pour `offline`, `noOption` et `generating`. Pas de `line` : dans Ligne, `line` n'est « jamais décoratif » (`tokens.json`), et ce filet l'est.
- **Aucune animation**, y compris pour `generating`. La seule animation signature de Ligne est le tracé des lignes pendant la génération (écran 5, F8), et ailleurs « le mouvement répond à un geste » (README « Mouvement »). La pulsation provisoire de #19 est retirée. Risque à suivre dans F2 et F8 : sans mouvement, rien ne montre que la génération avance, à part le texte (`role="status"`). L'écran appelant doit donc mettre le message à jour (« Jour 2 prêt », handover § 7).
- Jamais de `quai` : le « bandeau d'action requise » des écrans 10 et 15 (handover § 4.2 et § 6) est un autre élément, dessiné avec ces écrans (F5, F10).
- Rôles : `role="alert"` pour `error` et `conflict`, car la personne doit réagir avant de continuer ; `role="status"` pour `offline`, `noOption` et `generating` (handover § 11).

**Texte des boutons.** Style `bouton`, 16/20, valeur du `preview.html` de Button : 800 pour `primary`, 700 pour `secondary`. La variante `text` reste en `corps` (15/22) 400 souligné, comme le `preview.html`.

**Icônes des composants non maquettés.** La coche de `Chip` est dessinée par le frontend selon les règles de l'iconographie : grille 24, trait 2,2, extrémités et angles arrondis, sans remplissage, `aria-hidden`. Elle s'affiche à 20 px, comme les icônes du `preview.html` de Button, et sera remplacée par l'export SVG. Pour les icônes de la ligne du jour (voiture), voir la proposition S-7.

**Effet sur F2 (#19).**
- `Chip` : le contour non choisi reste `border-control` ; la coche est ajoutée, et une chip déduite choisie n'a plus d'aplat `line`.
- `StatusBanner` : `conflict` passe en `alert`, `animate-pulse` est retiré, le filet utilise `rail`, et celui de `generating` est en `ink-soft`.
- `SegmentedControl` est inchangé. `OtpInput` ajoute `aria-invalid` et `aria-describedby` à l'état invalide, si #19 ne les a pas.
- Les critères de F2 « `role="alert"` pour `error` seulement (provisoire) » et « liste comme écarts le rendu de Chip… » sont remplacés par ces règles.

### Q15 — Onglet de la rangée des jours : « Séjour »
**Décision.** L'onglet s'appelle « Séjour », partout. Ce n'est pas une nouvelle règle : c'est le vocabulaire fixé par Samuel dans le handover § 10 (« Onglet du voyage : Séjour ; jamais Aperçu ») et le nom de l'écran 11. Les README de DayBadge, StopMarker et DestinationPlate sont alignés sur ce vocabulaire. Le `preview.html` de DayBadge n'est pas modifié : son libellé « Aperçu » est un écart connu, et le handover prime. « Aperçu des effets » (README « Mouvement ») n'est pas concerné.

**Effet.** Spec F3 : le libellé « Séjour » est définitif. Samuel doit aligner la source du design system (question S-0).

### Q16 — Segments de `DayLine` : libellés provisoires
Le libellé d'un segment est une règle de Ligne (README DayLine). UX/UI ne tranche ici que ce que le design system ne dit pas, en restant au plus près du `preview.html` ; le reste est proposé à Samuel (S-1, S-2).

| `mode` | Libellé appliqué par F3 | Rail |
|---|---|---|
| `walk` | « À pied, 20 min » | pointillé (`rail-dash` / `rail-gap`) |
| `transit` | « Bus, environ 25 min (estimation) » (libellé du design system, temps estimé) ; « Bus, 25 min » pour un temps calculé | plein |
| `car` | « En voiture, 15 min » (absent du design system) | plein, comme tout trajet en véhicule |

- « environ » et « (estimation) » : F3 garde son choix provisoire, ensemble si et seulement si `estimated` vaut `true` (forme du `preview.html`). La règle écrite du README reste inchangée en attendant S-2.
- Icônes : à pied et bus, tracées d'après les `preview.html` ; pas d'icône pour `car` tant que S-7 n'est pas tranchée (le libellé suffit).

### Q17 — Ligne du jour : couleurs et graisses (part UX/UI)
**Décision.**
- Heure de début du temps libre : style `legende` (13/18) en 600, `ink-soft`, chiffres tabulaires, alignée à droite (valeurs du `preview.html`).
- Texte du bloc temps libre : style `corps-s` (14/20), `ink-2` (valeurs du `preview.html`).
- Lien « Idées » : **provisoire**, rendu du `preview.html` de DayLine (`ink` 700, sans soulignement), cible d'au moins `touch-target` × `touch-target`. Le lien est un élément maquetté : UX/UI n'en change pas le rendu. Écart d'accessibilité connu : sans soulignement, il ne se distingue du texte voisin `ink-2` que par la graisse (WCAG 1.4.1, règle d'or n° 8 du handover). Le soulignement est proposé à Samuel (S-3) ; F3 liste cet écart dans sa PR.
- Si le Product Owner décide d'afficher `locked` ou un repas non choisi, leur rendu passera par une proposition à Samuel, car ce sont des éléments de la ligne maquettée.

**Effet.** Spec F3 : l'heure du temps libre reste comme prévu (provisoire confirmé), le texte du bloc passe en `corps-s`, et le lien « Idées » garde le rendu du `preview.html` (provisoire, en attente de S-3).

### Q18 — `DayBadge` et `StopMarker`
**Décision (hors règles de Ligne).**
- **Nom accessible.** Il commence par le libellé visible « J2 », puis le complète (WCAG 2.5.3) : « J2, jour 2 », puis le jour de la semaine en toutes lettres quand `weekday` est fourni (« , lundi » pour `lun.` : les synthèses vocales lisent mal les abréviations), puis « , complet » quand la pastille est désactivée. Exemple : « J2, jour 2, lundi, complet ». Correspondance : `lun.` lundi, `mar.` mardi, `mer.` mercredi, `jeu.` jeudi, `ven.` vendredi, `sam.` samedi, `dim.` dimanche. Si le jour abrégé devient visible (S-4), le nom garde le libellé visible en tête et le jour en toutes lettres. Même règle pour la pastille réduite.
- **Variante réduite.** Prop `size: "md" | "sm"` (proposition de F3, acceptée côté UX/UI). En `sm`, la pastille n'est pas interactive. Elle reprend les valeurs du design system : hauteur `badge-s` (26 px), coins `radius-mini` (6 px), fond `raised`, contour `trait-controle` `outline-strong`, texte `ink`. Taille du texte : `etiquette` en 800, comme le provisoire de F3.
- **`StopMarker`.** Prop `variant: "ligne" | "carte"` (proposition de F3 acceptée, « carte » par défaut ; `DayLine` passe toujours `"ligne"`). En `ligne` : arrêt en anneau de 20 px, terminus carré de 20 px. En `carte` : arrêt numéroté 26 px, sélectionné 38 px, terminus 24 px avec maison, vue d'ensemble 12 px.
- **État désactivé et jour abrégé visible.** Le design system n'en dit rien et la pastille est un élément maquetté : proposition S-4. En attendant, F3 applique son provisoire : fond `muted`, texte `ink-soft` (6,97:1), sans contour, « complet » visible, jour abrégé seulement dans le nom accessible.

**Effet.** Spec F3 : le nom accessible change (« J2, jour 2, lundi » au lieu de « Jour 2, lun. ») ; les props `size` et `variant` sont confirmées côté UX/UI, leur forme reste au Tech Lead.

### Q19 — Mesures et styles sans token
**Décision.** Les mesures relevées dans les `preview.html` reçoivent un nom dans `tokens.json`. Les valeurs ne changent pas.

| Token (`tokens.json`) | Valeur | Source | Usage |
|---|---|---|---|
| `col-heure` | 52px | DayLine | Colonne heure de la ligne du jour |
| `col-rail` | 28px | DayLine | Colonne rail |
| `terminus-map` | 24px | StopMarker | Terminus sur la carte (avec maison) |
| `stop-map-ring` | 3px | StopMarker | Anneau des arrêts de carte, du sélectionné, de la vue d'ensemble |
| `stop-overview` | 12px | StopMarker | Arrêt de la vue d'ensemble |
| `badge-s` | 26px | README DayBadge | Hauteur de la pastille réduite |
| `trait-fin` | 1px | Button, DeckCard | Contour du bouton icône, de la carte de présentation |
| `trait-controle` | 1.5px | Button, Tag, DayBadge | Bouton secondaire, pastille inactive, tag pointillé ; chip et case de code (Q13) |
| `trait-fort` | 2px | ChecklistRow, DeckCard | Case de ChecklistRow, bouton rond « Pas pour moi » |
| `trait-onglet` | 3px | DayBadge | Trait sous l'onglet « Séjour » actif |
| `radius-terminus` | 5px | DayLine, StopMarker | Carré terminus de la ligne (20 px) |
| `radius-mini` | 6px | StopMarker, README DayBadge | Pastille réduite, terminus de carte |
| style `corps-fort` | 15/22, 700 | DayLine, ChecklistRow | Texte du terminus, nom d'une ligne de ChecklistRow |
| style `numero-carte` | 12/16, 800, tabulaire | StopMarker | Numéro d'un arrêt de carte. **Nouveauté** : interligne de 16 px, absent du `preview.html` |
| style `bouton` | 16/20, 800 (700 en secondaire) | Button | Texte des boutons `primary` et `secondary` (Q13, Q30). **Nouveauté** : interligne de 20 px, absent du `preview.html` (le texte est centré dans un bouton de 52 px : l'interligne ne change pas le rendu) |

- Le numéro de l'arrêt sélectionné sur la carte prend le style `pastille` (15/20, 800), sans nouveau token. **Nouveauté** : l'`usage` de `pastille` dans `tokens.json` est étendu à ce numéro (valeurs identiques au `preview.html` de StopMarker : 15 px, 800).
- Les trois points suivants touchent une règle ou une valeur de Ligne et passent en propositions à Samuel :
  - bloc du temps libre : coins de 10 px provisoires, valeur du `preview.html`, dans `provisoire.css` avec `/* Q19 */` (proposition S-5) ;
  - tracé du temps libre : provisoire en pointillé fin, au plus près du `preview.html`, avec des tokens existants : épaisseur et trait `rail-free` (2 px), vide `rail-gap` (5 px), couleur `track-free` (proposition S-6) ;
  - la description du tracé du temps libre (« fin » dans le README général, « tracé fin » dans `tokens.json`) n'est pas modifiée. Ces deux fichiers sont modifiés par ailleurs : voir « Conséquences ».

**Effet.**
- Spec F3 : `provisoire.css` ne garde que la déclaration `/* Q19 */` des coins de 10 px ; le terminus passe en `corps-fort` (provisoire confirmé).
- Le tracé du temps libre passe en pointillé fin : changement par rapport à la spec F3, qui prévoyait un trait plein.
- F2 (#19) : `--ligne-trait-controle` devient un token.

### Q30 — Textes d'`OtpInput` ; tokens du trait de 1,5 px et du texte des boutons
**Décision.**
- Textes validés : nom du groupe « Code à {length} chiffres » ; nom de chaque case « Chiffre {n} sur {length} ». Quand l'écran affiche un libellé visible au-dessus des cases, il le passe en `label`, et ce libellé devient le nom du groupe (le texte par défaut ne sert qu'en repli).
- Trait de 1,5 px : token `trait-controle` (Q19).
- Texte des boutons à 16 px : style `bouton` (Q13, Q19).

**Justification.** Textes courts et factuels, au format « {n} sur {total} » déjà employé par `DeckProgress` (« 4 sur 8 », handover § 5). Un nom visible prime sur un nom caché (WCAG 2.5.3).

**Effet.** F2 (#19) : les textes de `fr.json` sont inchangés ; les deux valeurs de `provisoire.css` deviennent des tokens, et le fichier peut être retiré de F2.

## Propositions au Tech Lead (conventions de code et d'outillage, non décidées ici)
- **TL-1. Correspondance des noms, par groupe de `tokens.json`.**
  - Couleurs : `page` → `--color-page`, dans `@theme`. Les références `{ink}` et `{line}` donnent `var(--color-ink)` et `var(--color-line)`.
  - Rayons : le nom porte déjà son préfixe, donc `radius-tag` → `--radius-tag` (et non `--radius-radius-tag`), dans `@theme`.
  - Styles de texte : `heure` → `--text-heure`, `--text-heure--line-height`, et `--text-heure--font-weight` quand le style a une graisse, dans `@theme`.
  - Groupe `ligne` : `rail` → `--ligne-rail` dans `:root`, comme le handover § 4.1. Exception déjà en place : `touch-target` → `--touch-target`.
  - Groupe `trait` : le nom porte déjà son préfixe, donc `trait-controle` → `--ligne-trait-controle` dans `:root` (nom déjà utilisé par #19).
  - Espacements : l'échelle de 4 px par défaut de Tailwind (`space-n` = utilitaire `n`), sans variable `--space-*`. Seuls utilitaires autorisés dans `src/components` : 0, 1, 2, 3, 4, 5, 6 et 8. Une règle de lint ou un test pourrait le vérifier.
- **TL-2. Mise en œuvre de Q10 et Q11.**
  - Correspondance shadcn : `--card`, `--card-foreground`, `--popover`, `--popover-foreground`, `--destructive`, `--destructive-foreground` dans `:root` et `@theme inline`.
  - `--color-on-quai`, `--color-focus` (le focus du handover § 4.2 passerait par `var(--color-focus)`) et `--radius-round` (utilitaire `rounded-round`, à préférer à `rounded-full`).
  - Retrait des classes `shadow-*` des composants shadcn importés.
  - Mise à jour de `src/styles/tokens.ts`, de `tests/unit/tokens.test.ts` (lecture des références `{…}` de `tokens.json`) et de `/dev/tokens`.
  - Retrait de `provisoire.css` hors déclarations `/* Q19 */` en attente.
- **TL-3. Forme des props** `size` de `DayBadge` et `variant` de `StopMarker`, et mise en œuvre du nom accessible de Q18, que ce soit par `aria-label` ou par un texte réservé aux lecteurs d'écran ajouté après « J2 ».

## Propositions de modification de Ligne, à valider par Samuel (non décidées ici)
Chaque proposition indique le choix provisoire que F3 applique en attendant. C'est le choix le plus proche du `preview.html` actuel.

| # | Proposition | Raison | Provisoire de F3 |
|---|---|---|---|
| S-0 | Aligner la source du design system (hors dépôt) sur « Séjour » et sur les noms de tokens ajoutés ici, avant le prochain export | Sinon l'export écrasera ces alignements | — |
| S-1 | Segment `transit` : libellé « Transports publics » tant que les données ne précisent pas le mode, sans icône (un pictogramme de bus serait aussi faux que le mot « Bus » sur un tram) ; « Bus », « Tram », « Métro » ou « Train », avec l'icône correspondante, quand le contrat le dit (question au Tech Lead) | Fiabilité (principe produit 2) ; « transports publics » est le terme courant en Suisse romande | « Bus », icône bus |
| S-2 | Règle des estimations : « environ » et « (estimation) » ensemble sur tout temps de trajet non calculé (pas seulement en transport public), jamais sur un temps calculé | Le README ne cite que les transports publics, alors que le contrat porte `estimated` sur tous les modes | Les deux mots si et seulement si `estimated` vaut `true` |
| S-3 | Lien « Idées » souligné (WCAG 1.4.1), en `line` 700 | Sans soulignement, le lien ne se distingue du texte voisin que par la graisse ; le soulignement est le signe des liens texte de Ligne (bouton `text`) ; handover § 4.2 : `line` pour les liens d'action, comme « Réserver » de ChecklistRow | `ink` 700 sans soulignement (rendu du `preview.html`), écart d'accessibilité listé dans la PR F3 |
| S-4 | `DayBadge` désactivé : fond `muted`, texte `ink-soft`, sans contour, « complet » écrit sous la pastille en `legende` `ink-soft`. Jour abrégé écrit sous la pastille seulement là où l'on choisit un jour (Déplacer, Ajouter un lieu) | Concilie « avec jour abrégé » (handover § 5) et « pas de date dans la pastille » (README) ; le mot « complet » n'entre pas dans 44 px | Provisoire de la spec F3 (« complet » sous « J{day} », jour abrégé dans le nom accessible seulement) |
| S-5 | Coins du bloc temps libre : `radius-control` (12 px) au lieu de 10 px | Un rayon de moins dans le système ; le bloc a la taille d'un contrôle | 10 px dans `provisoire.css` (`/* Q19 */`) |
| S-6 | Tracé du temps libre en trait plein fin, comme le README (« fin ») et `tokens.json` (« tracé fin ») | Sur le rail, le pointillé dit la marche ; un second sens brouillerait la lecture | Pointillé fin du `preview.html` (`rail-free` / `rail-gap`, `track-free`) |
| S-7 | Icônes manquantes de la ligne du jour (voiture) dessinées par le frontend selon les règles de l'iconographie, en attendant l'export SVG du jeu | Le README n'a pas d'icône voiture ; l'export SVG est attendu (Q13) | Pas d'icône pour `car` |

## Conséquences
- **Ce que cette PR modifie dans `docs/design-system/`** (objet du veto de Samuel, avec les décisions ci-dessus) :
  - `tokens.json` :
    - nouveau groupe de styles « Contrôles » avec le style `bouton` (16/20, 800 ; interligne nouveau) ;
    - nouveaux styles `corps-fort` (15/22, 700) dans « Texte » et `numero-carte` (12/16, 800 ; interligne nouveau) dans « Données » ;
    - `usage` de `pastille` étendu au numéro de l'arrêt sélectionné sur la carte ;
    - nouveaux rayons `radius-terminus` (5 px) et `radius-mini` (6 px) ;
    - groupe `ligne` : note réécrite avec `col-heure`, `col-rail` et `space-2` ; `usage` de `terminus` (« coins radius-terminus » au lieu de « coins 5 px ») ; nouveaux tokens `terminus-map` (24 px), `stop-map-ring` (3 px), `stop-overview` (12 px), `col-heure` (52 px), `col-rail` (28 px), `badge-s` (26 px) ;
    - nouveau groupe `trait` : `trait-fin` (1 px), `trait-controle` (1,5 px), `trait-fort` (2 px), `trait-onglet` (3 px).
  - `README.md` (général) :
    - « Typographie » : `corps-fort` ajouté à la ligne Texte, nouvelle ligne Contrôles (`bouton`), `numero-carte` ajouté à la ligne Données ;
    - « Espacement et rayons » : « `space-1` à `space-8` » devient « `space-1` à `space-6` et `space-8` » (il n'y a pas de `space-7`) ; ajout de `radius-terminus`, `radius-mini` et de l'échelle `trait-*` ;
    - « La ligne du jour » : noms `col-heure`, `col-rail`, `space-2`, `radius-terminus`, `stop-map-ring`, `terminus-map`, `stop-overview` et `badge-s` ajoutés à côté des valeurs existantes.
  - README de composants : Button (styles `bouton` et `corps`, `trait-controle`, `trait-fin`), DayBadge (« Séjour », `trait-onglet`, `badge-s`, `radius-mini`), DayLine (`col-heure`, `col-rail`, `corps-fort`), DestinationPlate (« écran Séjour »), StopMarker (`radius-terminus`, `terminus-map`, `radius-mini`, `stop-map-ring`, `numero-carte`, `pastille`, `stop-overview`, « écran Séjour »).
  - Aucune valeur de couleur, de taille ou de rayon existante ne change, et aucun `preview.html` n'est modifié.
- Une fois TL-1 et TL-2 appliquées, les composants de F2 et F3 n'ont plus de valeur sans token, à part les déclarations `/* Q19 */` liées à S-5.
- Les `preview.html` restent la référence visuelle de Ligne. Ce changement n'en modifie aucun.
- Un veto de Samuel avant le 2026-10-10 rouvre seulement le point visé, les autres restent acquis. Les propositions S-x et TL-x n'entrent en vigueur qu'avec l'accord de leur destinataire.
