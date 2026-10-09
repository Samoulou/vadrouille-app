# 0018 — Rendus et textes non maquettés de F5a, F7, F8 et D1

Statut : décision déléguée, définitive sans veto de Samuel sous 2 jours (avant le 2026-10-11) ; à lister dans la note de version suivante, rubrique « Décisions prises par le studio » · Date : 2026-10-09 · Décideur : UX/UI (écrans non maquettés, dans les règles de Ligne ; délégation « Qui décide quoi » de `docs/CONTEXT.md`) · Ticket #63

## Contexte
`docs/ux/maquettes/` est vide (Q12) et le Dossier UX n'est pas dans le dépôt (Q59). Quatre questions déléguées à UX/UI restent ouvertes dans `QUESTIONS.md` :
- **Q97** : rendus provisoires de F5a (#54, fusionnée) : poignée du panneau, bandeau `travel`, lignes d'événements, « Surprends-moi » ;
- **Q106** : section « Démonstration » de la page d'accueil (D1, PR #59, en revue) ;
- **Q87** (F7-Q1) : rendus et textes de Remplacer (écran 14, maquetté mais sans PNG), Ajouter un lieu et Déplacer, dont la partie UX/UI de **Q49** ;
- **Q74** (F8-Q1) : rendus et textes de la création (écrans 1 à 5) et de la connexion.

Sources : le code de F5a dans `main` (`Sheet.tsx`, `StatusBanner.tsx`, `EventLines.tsx`, `SurpriseBlock.tsx`, `JourneePanel.tsx`) et les captures de `docs/ux/captures/F5/` ; la branche `claude/56-d1-demo` (head bee4bd2) et `docs/ux/captures/D1/accueil-390x844.png` ; les spécifications F5, F7 et F8 ; les décisions 0014, 0015 et 0016.

Hors périmètre : Q32, Q51, Q53 et Q62, liées à la décision 0012 (en revue dans #26). Cette décision ne contredit pas 0012. Là où F7 ou F8 réutilisent un composant que 0012 redessine (`Chip`, `OtpInput`, `StatusBanner`), elles suivent le rendu en vigueur : celui de F2 tant que 0012 n'est pas fusionnée, celui de 0012 ensuite.

Ni le design system Ligne, ni les maquettes, ni le handover ne sont modifiés. Toute valeur sans token va dans `src/components/ligne/provisoire.css`, avec le numéro de sa question. Ajouter une icône au jeu Ligne ou créer un token relève de Samuel (Q37) : la proposition lui est transmise (question U2-Q1).

Rien ici n'engage d'argent, de compte externe ni de donnée personnelle.

**Gravité.**
- Pour un code déjà livré : 3 majeur, 2 mineur, 1 cosmétique.
- Pour un code à venir (F7, F8) : un écart à cette décision relevé en revue compte 2, ou 3 s'il touche l'accessibilité, le vocabulaire fixe ou les règles Google.

**Priorité des maquettes.** Si Samuel exporte une maquette qui contredit cette décision (en particulier l'écran 14), la maquette prime et la décision est amendée.

## Règles communes aux écrans de F7 et F8 (champs, messages, attente)
F7 et F8 introduisent les premiers formulaires. Ligne n'a ni champ de saisie ni message d'erreur documenté (README, « Reste à faire »). Ces règles s'appliquent aux deux tâches.

**Champ de saisie** (texte, email, recherche, nombre, date, zone de texte) :
- libellé visible au-dessus, en `corps` 700 `ink` ;
- aide éventuelle entre le libellé et le champ, en `corps-s` `ink-soft`, reliée par `aria-describedby` ;
- champ : fond `raised`, contour `trait-controle` (1,5 px, `--ligne-trait-controle`) en `border-control` (3,2:1, handover § 4.2), coins `radius-control`, 52 px de haut (hauteur de `Button` `md` et des cases d'`OtpInput`), marge intérieure horizontale `space-4`, texte `corps` `ink` ;
- zone de texte : au moins 6 lignes de `corps` ;
- jamais de texte indicatif à la place du libellé, et aucun texte indicatif qui recopie un nom de lieu ;
- dates : `<input type="date">` natif, avec le même habillage.

**Champ invalide :**
- contour en `ink` au lieu de `border-control`, et `aria-invalid="true"` ;
- message sous le champ, en `corps-s` 600 `ink`, relié par `aria-describedby`.

  Ligne n'a pas de couleur d'erreur et n'en reçoit pas : c'est le message qui porte l'information, jamais la couleur. Le rendu est celui que 0012 prévoit pour `OtpInput` invalide.

**Compteur de caractères :** `legende` `ink-soft`, chiffres tabulaires, aligné à droite sous le champ.

**Sections d'un formulaire :**
- titre de niveau 2 en `section` 800 `ink` ;
- écart de `space-6` entre deux sections et de `space-3` à l'intérieur d'une section.

**Attente :**
- squelette en blocs `muted`, coins `radius-block`, de la forme du contenu attendu, **immobile** : Ligne n'a qu'une animation signature (le tracé de génération), et un scintillement n'en fait pas partie ;
- le texte d'attente est rendu visible en `corps-s` `ink-soft` et annoncé par `role="status"`.

**Actions de fin d'écran :**
- `Button` `primary` `md` en pleine largeur, puis l'action secondaire sous lui, en pleine largeur (`secondary`) ou centrée (`text`), à `space-3` d'écart ;
- les boutons restent dans le flux, en fin de contenu, sans barre fixe : l'aperçu des effets doit se lire avant « Appliquer » (principe produit 5).

## Q97 — Rendus provisoires de F5a

### 1. Poignée du panneau : retenue
- **Décision.** Le rendu livré est retenu :
  - barre de 40 × 4 px en `border-control`, coins ronds ;
  - centrée dans un bouton de 88 × 44 px au moins, aux coins `radius-control` ;
  - noms « Agrandir le panneau » et « Réduire le panneau » ;
  - focus standard ;
  - panneau en `page`, contour `outline` sur les côtés et le haut, coins `radius-sheet`.
- **Raisons.**
  - La barre est la seule marque visible d'un contrôle sans libellé visible. Elle prend donc `border-control`, à 3,2:1 (handover § 4.2 et § 11), et pas `outline`, qui est décoratif.
  - La zone de 88 px, plus large que la cible, facilite la prise au pouce sans gêner les onglets.
  - Le contour `outline` du panneau est décoratif et conforme à `carte.md`.
- **Conséquence.** Aucun changement de code. Les trois valeurs `--ligne-poignee-*` restent dans `provisoire.css` (F5-Q1).

### 2. Bandeau `travel` : retenu
- **Décision.** Le rendu livré est retenu :
  - `StatusBanner` `travel`, `role="status"` ;
  - bloc `muted`, filet `ink-soft` de 4 px ;
  - placé sous la ligne « trajet · budget » et au-dessus de la `DayLine` ;
  - texte de F5-PO-6, par exemple « 2 h 45 de trajet ce jour, au-delà des 1 h 30 prévues pour ton rythme. Le plus long : Bus, environ 50 min (estimation), vers [Distillerie accessible en bus]. »
- **Raisons.**
  - Pas de `quai` : un dépassement informe, il ne demande pas d'action requise au sens de Ligne (principe 2).
  - Filet `ink-soft` : même niveau que `offline` et `noOption` dans la décision 0012, en revue.
  - Le texte explique le dépassement par le plus long trajet, comme le demandent le handover (§ 6, écran 12) et le cadrage (§ 3.7).
  - Le libellé du segment suit Q37.
- **Conséquence.** Aucun changement de code. F7 réutilise ce bandeau dans ses aperçus.

### 3. Lignes d'événements : retenues, une correction
- **Décision.** Le rendu livré est retenu :
  - une ligne par événement : bloc `muted`, coins `radius-block`, marge `space-3`, au moins 44 px de haut, la ligne entière étant le lien ;
  - plage en `corps-s` 700, tabulaire ;
  - nom en `arret` 700 ;
  - métadonnées en `corps-s` `ink-soft` ;
  - `Tag` des exceptions.
- **Écart corrigé.** Le nom et la plage sont en `ink`. Ligne demande `ink-2` sur `muted` (README, « Couleurs »). Le nom passe en `ink-2` ; la plage y est déjà.
- **Conséquence : changement de code, gravité 1.** Dans `src/features/sejour/EventLines.tsx`, le nom passe de `text-ink` à `text-ink-2`. À faire par **F5c**, qui réutilise `EventLines` pour « Pendant ton séjour ». Aucune capture de référence ne change de façon perceptible.

### 4. « Surprends-moi » : retenu, une mention ajoutée
- **Décision.** Le bouton est retenu : `Button` `secondary` `sm`, aligné à gauche, libellé fixe « Surprends-moi », avec `aria-expanded`. Une fois dévoilée, l'idée s'affiche dans cet ordre :
  1. **nouveau** : la mention « Une idée pour ta journée, pas encore dans ton programme. », en `corps-s` `ink-soft` ;
  2. le nom, en `arret` 700 (niveau 3) ;
  3. le `meta`, en `corps-s` `ink-soft` ;
  4. le `ReasonBlock` ;
  5. avec F7c, « Ajouter à ma journée » (`Button` `secondary` `sm`), sous le `ReasonBlock`.
- **Raisons.**
  - L'idée dévoilée a la même forme qu'une étape : nom, métadonnées, justification. Rien ne disait qu'elle n'est pas ajoutée.
  - Principe produit 5 : rien ne change sans qu'on le voie. La fiche d'un événement le dit déjà (« Proposé pendant ton séjour, pas dans ton programme. », F5-PO-11). L'idée doit le dire de la même façon.
- **Conséquence : changement de code, gravité 2.**
  - Ajouter la mention dans `src/features/sejour/SurpriseBlock.tsx`, avec une nouvelle clé `sejour.surprise.mention` dans `fr.json`.
  - Test : la mention est visible quand l'idée est dévoilée.
  - À faire par **F5c**, en même temps que le point 3. F5b (#61, en cours) n'est pas rouverte.

## Q106 — Section « Démonstration » de la page d'accueil (D1, #59) : retenue
- **Décision.** Le rendu de `claude/56-d1-demo` (capture `accueil-390x844.png`) est retenu tel quel :
  - filet `hairline` au-dessus de la section ;
  - titre « Démonstration » en `section` 800 ;
  - mention « Données simulées. Les lieux entre crochets ne sont pas vérifiés. » en `corps-s` `ink-soft` ;
  - « Voyage d'exemple : Édimbourg » en `corps` `ink` ;
  - quatre liens en liste, séparés par des filets `hairline`. Chaque lien fait au moins 44 px de haut, avec le libellé en `corps` 600 `line` et la précision dessous en `corps-s` `ink-soft`.
- **Raisons.**
  - `line` marque les liens d'action (handover § 4.2).
  - Chaque lien occupe toute une rangée, séparée des autres : il ne se distingue pas d'un texte voisin par la seule couleur. Le soulignement, réservé aux liens pris dans un texte (« Idées », Q37), n'est donc pas requis.
  - La mention est une phrase, pas un badge : la règle « jamais Vérifié » ne s'applique pas (même lecture que la décision 0014, § 7). Elle explique les crochets (règle d'or 2).
  - Une seule action par rangée, et l'ordre du parcours se lit de haut en bas.
- **Conséquence.** Aucun changement de code. La capture de #59 vaut validation visuelle de D1.

## Q87 — Rendus et textes de F7 (dont la partie UX/UI de Q49)
Ces rendus s'appliquent au code à venir : **F7a** (écran 14, `ChangeSet`, `SegmentedControl` vertical, surlignage, toast), **F7b** (Déplacer, `DayBadge` en mode bouton), **F7c** (Ajouter un lieu, « Choisir », « Ajouter à ma journée »). Ils complètent les décisions 0016 § 8 et § 9, sans les changer.

### 5. Mise en page de l'écran 14 et d'« Ajouter un lieu »
- Contenu du panneau, comme la fiche (F5-PO-8), en marges `space-5`. En tête :
  - « Retour » (`IconButton` carré, icône « retour ») en haut à droite ;
  - le titre de niveau 1 en `titre-fiche` 800 ;
  - le moment (« J2 · Dimanche 30 août · 10:50 – 11:50 ») en `corps-s` `ink-soft`, tabulaire.
- Les blocs suivent l'ordre de la spécification, à `space-6` d'écart.
- Étape verrouillée :
  - le titre ;
  - le message en `corps` `ink-2` ;
  - « Retour à la fiche » en `Button` `secondary` `md` pleine largeur (lien).

### 6. Choix de la raison et du moment : `SegmentedControl` vertical (0016 § 8)
- Rail `muted`, coins `radius-control`, marge intérieure et écart `space-1`, comme l'horizontal.
- Une option par rangée, en pleine largeur, au moins 44 px de haut, libellé aligné à gauche, marge horizontale `space-4`.
- Option choisie en aplat `line`, texte `on-line` 700. Les autres sont transparentes, texte `ink-2` 600.
- Sans option choisie (`value: null`), aucune rangée n'est en aplat.
- Raisons dans l'ordre du handover. Moments au format « Temps libre 15:00 – 18:30 », « Déjeuner pas encore choisi », « Dîner pas encore choisi », chiffres tabulaires.
- « Choisis une raison. » suit la règle commune des messages, sous le rail.

### 7. Souhait, attente et proposition (écran 14)
- **Souhait.** Le libellé « Ce que tu préfères (facultatif) » et l'aide « Par exemple : une dégustation, quelque chose à l'abri. » suivent la règle commune des champs.
  - Compteur visible : « {n} caractères restants » (« 1 caractère restant »).
  - Il est annoncé poliment à 20 caractères restants, puis à 0.
- **Attente.**
  - Le squelette commun prend la forme de la proposition : une barre de nom, une barre de métadonnées, trois barres de `ChangeSet`.
  - À 5 s : « On cherche autour de {nom}. » en `corps` `ink-2`, puis « Arrêter » en `Button` `secondary` `sm`, sous le squelette.
- **Proposition** (proposée, pas encore appliquée). Elle est posée dans un bloc `raised` à contour `outline`, coins `radius-block`, marge `space-4`, pour la distinguer du programme :
  - nom en `section` 800 (niveau 2) ;
  - moment en `corps-s` `ink-soft`, tabulaire ;
  - `meta` en `corps-s` `ink-soft` ;
  - `Tag` des exceptions ;
  - `ReasonBlock`.
- **« Ce qui change » et « Ce qui ne bouge pas »** : titres de niveau 3 en style `bloc` (15/20, 800, `--ligne-texte-bloc` de `provisoire.css`, Q11).
  - « Ce qui ne bouge pas » : une ligne par étape, heure en 700 tabulaire, nom en `corps` `ink`, puis les `Tag`.
  - Une étape verrouillée y garde la marque de verrou que F5b lui donne sur la `DayLine`.
- **Bandeau de trajet** (`travel`, § 2) : au-dessus de « Ce qui change ».
- **Actions** : « Appliquer » (`primary` `md`), puis « Annuler » (`secondary` `md`), en pleine largeur, dans le flux, après « Ce qui ne bouge pas » (règle commune).
- **Bandeaux** `offline`, `conflict`, `noOption` et `error` :
  - `offline` en tête du contenu, sous le moment ;
  - les autres à la place de la zone de proposition.

### 8. `ChangeSet`
- Liste sans puces, une ligne par changement, `corps` `ink`, `space-2` entre les lignes, sans filet.
- Heure en 700 tabulaire, en tête de ligne.
- Valeur remplacée : `<del>` en `ink-soft`, barré, précédé de « avant : » masqué visuellement (lu par les lecteurs d'écran). Le barré ne porte jamais seul l'information : « à la place de » est écrit.
- Flèche « → » en texte, pas en icône.
- Montant négatif avec le signe moins typographique « − » (U+2212), positif avec « + », formaté par `Intl.NumberFormat("fr-CH")`.
- Formats et textes de la spécification retenus : « {heure} {après} à la place de {avant} », « {heure} {nom} ajouté », « {nom} : J{a} {heure} → J{b} {heure} », « Trajet vers {nom} : {avant} → {après} », « Budget du jour : environ +{n} CHF par personne ».

### 9. Surlignage de 2 s sur la `DayLine` (0016 § 9)
- **Décision.** Une étape surlignée (`data-highlighted="true"`) porte deux marques visibles :
  - un fond `muted` derrière toute sa ligne (heure, rail, contenu), aux coins `radius-control` ;
  - un arrêt **plein `line`** au lieu de l'anneau, comme l'arrêt sélectionné de la carte (`carte.md`).
  
  À 2 000 ms, les deux marques disparaissent par un fondu de 200 ms. Sous `prefers-reduced-motion: reduce`, elles disparaissent sans transition.
- **Raisons.**
  - L'arrêt plein change de forme, pas seulement de couleur : l'information ne repose pas sur la couleur seule (README, « Accessibilité »).
  - `line` sert ici à la sélection, un usage permis.
  - Le toast « Modifié. » et le focus sur l'étape portent la même information pour les lecteurs d'écran.

### 10. `DayBadge` en mode bouton (0016 § 8)
- **Décision.**
  - Choisie (`aria-pressed="true"`) : rendu de la pastille active de F3, plein `line`, texte `on-line`.
  - Non choisie : rendu de la pastille inactive de F3.
  - « Complet » : rendu de l'état désactivé de F3, avec « complet » visible en `legende`.
  - Les pastilles **passent à la ligne** (écart `space-2`) au lieu de défiler : tous les jours se voient d'un coup d'œil, et six pastilles tiennent sur deux rangées au plus à 390 px.
  - Titres « Quel jour ? », « Vers quel jour ? » et « Quel moment ? » : niveau 3, en `bloc`.

### 11. Feuille « Déplacer » (F7b)
- Feuille modale de F6 : fond `raised`, coins supérieurs `radius-sheet`, voile et hauteur maximale de `provisoire.css`.
  - Titre « Déplacer {nom} » en `section` 800, focus dessus.
  - « Fermer » (`IconButton`, icône « fermer ») en haut à droite.
- Sous les pastilles, la `DayLine` compacte du jour choisi, en lecture seule. À chaque point d'insertion, un `Button` `secondary` `sm` sur toute la largeur de la colonne de contenu, avec l'icône « plus » (20 px) et le libellé **visible** « Placer ici, vers 15:45 ». Le texte visible est le nom accessible tout entier (WCAG 2.5.3).
- Le point choisi garde `aria-pressed="true"` et prend l'aplat `line`. L'aperçu s'affiche **sous** la `DayLine` compacte, focus sur son titre « Ce qui change ». Choisir un autre point remplace l'aperçu. Aucun texte nouveau n'est ajouté.
- Actions de l'aperçu : comme à l'écran 14.

### 12. « Ajouter un lieu » (F7c) et partie UX/UI de Q49
- **Recherche.**
  - Le champ « Lieu à ajouter » (règle commune) et « Rechercher » (`primary` `md`, largeur de son texte) sont sur une même rangée, le champ flexible.
  - Résultats : liste de boutons en pleine largeur, au moins 44 px, séparés par des filets `hairline`. Nom en `corps` 700 `ink`, secteur en `corps-s` `ink-soft` dessous.
  - Le résultat choisi porte `aria-pressed="true"`, l'aplat `line` (texte `on-line`) et la coche de 20 px, comme une `Chip` choisie. La liste reste visible pour changer de choix.
  - « Données de lieux : Google » (`PlacesAttribution`) se place sous la liste quand un résultat vient de Google.
- **« Nom dans ton programme » (Q49, UX/UI).**
  - Le champ suit la règle commune.
  - L'aide « C'est le nom qui apparaîtra dans ton programme. » est retenue. Elle se place entre le libellé et le champ, pour être lue avant la saisie.
  - Le champ n'a **jamais** de texte indicatif. Aucun bouton « Reprendre ce nom » ou équivalent n'existe : sans `suggestedName`, le champ est vide, et le seul nom Google visible est celui de la liste, avec son attribution (F7-PO-10, handover back-end § 5).
  - Un nom prérempli par `suggestedName` ou par l'idée « Surprends-moi » n'a **pas** de marque « déduit ». Ce n'est pas une déduction du récit, et la marque pointillée garde son seul sens (0012).
- **« Choisir » d'un repas pas encore choisi** : même rendu que le lien « Idées » de la `DayLine` (F3, Q37), à droite du texte « Déjeuner pas encore choisi ».
- **« Ajouter un lieu »** sous la `DayLine` : `Button` `secondary` `sm`, avec l'icône « plus ».

### 13. Textes de F7
Les textes provisoires de la spécification sont retenus sans changement, dont :
- « Modifié. », « Lieu ajouté. », « Étape déplacée. » et « Modification annulée. » ;
- les messages hors ligne, conflit, erreur, « aucune option compatible » et étape verrouillée ;
- « Recherche d'une proposition. », « Proposition prête. » et « On cherche autour de {nom}. » ;
- « Écris au moins 2 lettres. », « {n} résultats. » (« 1 résultat. »), « Aucun lieu trouvé. Essaie un autre nom. » et « Donne un nom à ce lieu. ».

Un seul ajout : le compteur du souhait, au § 7.

## Q74 — Rendus et textes de F8
Ces rendus s'appliquent au code à venir : **F8a** (écrans 1 et 2, marque « déduit » de `SegmentedControl` et des nombres), **F8b** (écrans 3 et 4, `OtpInput` invalide et à libellé visible), **F8c** (lancement, écran 5).

### 14. Cadre commun des écrans 1 à 5
- Page `page`, une colonne, marges `space-5`, largeur bornée comme l'accueil.
- « Retour » (`IconButton` carré) en haut à gauche, hors écran 5 tant que « Mes voyages » n'existe pas.
- Titre de niveau 1 en `titre-jour` 800 (approche `--ligne-titre-jour-approche`).
- Pas d'indicateur « étape {n} sur {total} » : le nombre d'écrans varie (écran 3 facultatif, écran 4 sauté avec une session), et un total faux tromperait.
- Titres du document de la spécification retenus.
- **Brouillon perdu.** L'annonce « Ton brouillon n'a pas été conservé. Recommence à partir de la destination. » est rendue visible en tête de l'écran 1 :
  - bloc `muted`, coins `radius-block`, marge `space-4`, `corps-s` `ink-2`, `role="status"` ;
  - sans filet, parce que ce n'est pas un des types de `StatusBanner`.

### 15. Écran 1 — Créer le voyage
- Les champs suivent la règle commune, dans l'ordre de la spécification.
- Dates : « Arrivée » et « Départ » côte à côte, à moitié de largeur chacun.
- « As-tu déjà un logement ? » : `SegmentedControl` horizontal, « Oui » / « Un quartier » / « Pas encore ». Le champ ouvert par « Oui » ou « Un quartier » apparaît juste dessous.
- **Autres villes** et **Engagements déjà pris** : deux sections (titres de niveau 2) toujours visibles, chacune avec son aide et un bouton « Ajouter une ville » ou « Ajouter un engagement » (`secondary` `sm`, icône « plus »).
  - Chaque ville ou engagement ajouté est un bloc `raised` à contour `outline`, coins `radius-block`, marge `space-4`.
  - Titre du bloc en `arret` 700 : le nom saisi, ou « Ville {n} » / « Engagement {n} » tant qu'il est vide.
  - « Retirer » en `Button` `text` `sm`, en haut à droite du bloc, nom accessible « Retirer {nom} ».
- **Récapitulatif des dates** de chaque ville (« Édimbourg : sam. 29.08 – mar. 01.09 ») en `corps-s` `ink-soft` tabulaire. Celui de la destination s'affiche en tête de la section « Autres villes » dès qu'une ville est ajoutée.
- Type d'engagement : `SegmentedControl` « Vol » / « Réservation » / « Billet ». Date en pleine largeur, puis heures de début et de fin côte à côte.
- L'aide « Ils seront gardés tels quels dans ton programme. » est retenue.
- « Continuer » : `primary` `md`, pleine largeur, en fin de formulaire.

### 16. Écran 2 — Récit et vérification
- **Récit.**
  - Zone de texte selon la règle commune, nommée par le titre.
  - L'aide « Qui part, ce qui vous fait envie, ce que vous préférez éviter, votre budget pour les repas. » est retenue.
  - Compteur « {n} sur 1 000 caractères » (`legende`), retenu.
  - « Préparer mon brief » (`primary` `md`, pleine largeur), puis « Remplir moi-même » (`text`, centré).
  - Le bandeau d'erreur se place au-dessus de ces deux boutons. Son texte est retenu.
- **Vérification.**
  - L'aide « En pointillé : ce qu'on a compris de ton récit. Touche pour corriger. » est retenue. Elle se place sous le titre.
  - Sections toujours ouvertes : titre de niveau 2 en `section` 800.
  - Voyageurs : une rangée par type. Le libellé (« Adultes », « Enfants ») en `corps` 700, puis `IconButton` « Retirer un adulte », un champ numérique de 44 × 52 px (rendu d'une case d'`OtpInput` : `section` 800 tabulaire, centré), puis `IconButton` « Ajouter un adulte ».
    - Icônes « moins » et « plus ». « Moins » n'est pas dans le jeu Ligne : le front la dessine selon les règles de l'iconographie (grille 24, trait 2,2, extrémités arrondies), comme la coche de 0012. Son ajout au jeu est proposé à Samuel (U2-Q1).
  - Sections facultatives repliées :
    - en-tête en bouton pleine largeur, au moins 44 px, `aria-expanded` ;
    - titre en `section` 800 ;
    - dessous, « Facultatif » ou le résumé, en `corps-s` `ink-soft` ;
    - à droite, l'icône « retour » tournée vers le bas (repliée) ou vers le haut (ouverte), 20 px, `ink-soft`, décorative ;
    - un filet `hairline` sépare deux sections.
  - Envies, déplacements, à limiter : `Chip` qui passent à la ligne, écart `space-2`.
  - « À limiter » : une `Chip` désactivée prend le rendu désactivé de `Button` (`muted`, `ink-soft`). Sous le groupe, une seule ligne visible en `legende` `ink-soft` : « Les envies déjà choisies ne peuvent pas être limitées. » (et, dans « Envies », « Les éléments à limiter ne peuvent pas être choisis. »). Chaque `Chip` désactivée garde sa propre explication, « Déjà dans tes envies » ou « Déjà à limiter », reliée par `aria-describedby`.
  - Budget par repas : sur une rangée, « Environ », un champ numérique de 4 chiffres, puis « CHF par personne et par repas ». Le champ est nommé par ces textes (`aria-labelledby`). Sa largeur va dans `provisoire.css` (`--ligne-champ-montant`, F8-Q1).
- **Marque « déduit »** (F8-TL-4).
  - **Principe** : elle suit la règle de `Chip` en vigueur.
  - **Avec 0012 fusionnée** :
    - option déduite choisie : fond `raised`, contour pointillé `trait-controle` en `ink`, texte `ink` 700, précédé de la coche de 20 px en `ink` ;
    - l'aplat `line` est réservé au choix de la personne ;
    - dès que la personne touche le contrôle, l'option choisie reprend l'aplat `line`.
  - **Sans 0012** : l'option garde l'aplat `line` et prend en plus le contour pointillé `ink`, comme la `Chip` de F2.
  - **Champs numériques déduits** : contour pointillé `trait-controle` en `ink` au lieu de `border-control`.
  - Dans tous les cas, « déduit de ton récit » reste dans le nom accessible (F8-PO-5).
- **Bouton de retour au récit.** Le libellé « Récit » devient « **Revenir à mon récit** » (`text`, centré sous « Continuer »). Un nom seul ne dit pas ce que fait le bouton, et « Retour » est réservé à la navigation vers le niveau supérieur (handover § 6).
- **Libellés des envies** (F8-PO-6) : « Musées », « Balades en ville », « Nature », « Dégustations », « Restaurants », « Patrimoine et monuments », « Marchés », « Bars et soirées », retenus. Déplacements : « À pied », « Transports publics », « Voiture », retenus en attendant Q37.

### 17. Écran 3 — Où loger
- Quartier conseillé :
  - nom en `section` 800 (niveau 2) ;
  - raison en `corps` `ink-2`, texte simple. Ce n'est pas un `ReasonBlock`, qui exige une source.
  - mini-carte (`AreaMap`) en pleine largeur au format 16:9 (`aspect-video`), coins `radius-block`, contour `outline`.
- Logements : un bloc `raised` à contour `outline` par logement, coins `radius-block`, marge `space-4`.
  - Nom en `arret` 700, `meta` en `corps-s` `ink-soft`.
  - « Choisir ce logement » en `secondary` `sm`, pleine largeur, décrit par le nom du logement (`aria-describedby`).
- « Partir du quartier, choisir plus tard » : `primary` `md`, pleine largeur, en fin d'écran.
- Attente : squelette commun (bloc de nom, bloc de carte 16:9, trois blocs de logement), avec « On cherche le quartier le mieux placé… » visible.
- `no_option` et erreurs : `StatusBanner`, textes de la spécification retenus. « Continuer sans logement » est en `secondary` `md`.

### 18. Écran 4 — Connexion
- L'aide « Pas de mot de passe : on t'envoie un code à 6 chiffres. » est retenue, en `corps` `ink-soft` sous le titre.
- Étape email : le champ suit la règle commune, puis « Recevoir un code » (`primary` `md`, pleine largeur).
- Étape code :
  - « Code envoyé à {email}. Il est valable 10 minutes. » en `corps` `ink-2`, l'adresse en 700, coupée au besoin (`overflow-wrap: anywhere`) ;
  - libellé visible « Code reçu par email » en `corps` 700 `ink` au-dessus des cases ;
  - message d'erreur ou « Vérification du code… » sous les cases, selon la règle commune (`corps-s` 600 `ink` pour l'erreur, `corps-s` `ink-soft` pour l'attente) ;
  - « Renvoyer le code » et « Changer d'adresse » en `Button` `text` `sm` sur une rangée qui passe à la ligne au besoin, alignés à gauche.
- Les textes d'erreur et « Nouveau code envoyé. » sont retenus.
- `active_preview_exists` : `StatusBanner` `conflict` « Tu as déjà des propositions en préparation. », avec le lien « **Voir ces propositions** » (`Button` `text`) vers ce voyage.

### 19. Écran 5 — Propositions prêtes
- Ordre :
  1. titre ;
  2. compteur en `corps` `ink-2` tabulaire ;
  3. une rangée par jour ;
  4. bandeaux ;
  5. actions.
- **Compteur** : « {ready} propositions prêtes sur {expected} », avec le singulier « 1 proposition prête sur 8 » et « 0 proposition prête sur 8 ».
- **Rangée d'un jour** :
  - `DayBadge` réduite « J{n} » à gauche ;
  - à droite, l'état : « En préparation » en `corps-s` `ink-soft`, ou « Jour {n} prêt » en `corps-s` 700 `ink` ;
  - entre les deux, la **mini-ligne horizontale**.
- **Mini-ligne** :
  - Un carré terminus `ink` de 12 px (coins `radius-tag`) à chaque extrémité : une journée commence et finit par un terminus (README).
  - Entre les deux, un tracé fin (`rail-free`, `track-free`) tant que le jour n'est pas prêt.
  - Les arrêts apparaissent un à un, en anneaux de 12 px à anneau de 3 px `line` sur fond `raised`, sans numéro ni nom. Les valeurs 12 px et 3 px existent déjà dans `provisoire.css` (`--ligne-stop-ensemble`, `--ligne-anneau-carte`).
  - À « Jour {n} prêt », le tracé `rail` plein en `line` se dessine de gauche à droite en 250 ms, courbe standard.
  - Sous `prefers-reduced-motion: reduce`, il apparaît par fondu.
  - Si les données ne donnent pas le nombre de propositions prêtes par jour (U2-Q2), tous les anneaux du jour apparaissent ensemble à « Jour {n} prêt ».
- **Actions** : « Voir mes propositions » (`primary` `md`, pleine largeur), puis « Passer, voir le programme » (`text`, centré), affichées seulement à l'état prêt ou incomplet.
- **Aperçu incomplet** : texte retenu, avec le singulier « 1 proposition n'a pas trouvé de lieu compatible. ».
- **Erreurs** : textes retenus (« La préparation s'est interrompue. », « Réessayer », « Voir mes voyages »).
- **Pas de `StatusBanner` `generating`** sur cet écran : la mini-ligne et le texte de chaque jour portent l'avancement. Le bandeau ferait doublon.

### 20. Textes de F8
Les textes provisoires de la spécification sont retenus, sauf ces changements et ajouts :

| Texte | Décision | Section |
|---|---|---|
| « Récit » | devient « Revenir à mon récit » | § 16 |
| « Les envies déjà choisies ne peuvent pas être limitées. » | ajouté | § 16 |
| « Les éléments à limiter ne peuvent pas être choisis. » | ajouté | § 16 |
| « Ville {n} » et « Engagement {n} » | ajoutés | § 15 |
| « Voir ces propositions » | ajouté | § 18 |
| singuliers du compteur et de l'aperçu incomplet | ajoutés | § 19 |

## Changements de code imposés

| Gravité | Changement | Tâche | Section |
|---|---|---|---|
| 2 | Mention « Une idée pour ta journée, pas encore dans ton programme. » dans `SurpriseBlock`, avec sa clé `fr.json` et un test | F5c | § 4 |
| 1 | Nom des lignes d'événements en `ink-2` | F5c | § 3 |

D1 (#59) : aucun changement. F7 et F8 : rendus à appliquer par F7a, F7b et F7c, puis F8a, F8b et F8c, qui listent dans leur PR tout écart à cette décision.

## Nouvelles questions
- **U2-Q1 (Samuel, complète Q37, modification de Ligne)** : ajouter au jeu d'icônes « moins » (§ 16) et un chevron, aujourd'hui l'icône « retour » tournée (§ 16) ; nommer en tokens les mesures provisoires de la mini-ligne de l'écran 5 (terminus et anneaux de 12 px, § 19) et la largeur du champ de montant (§ 16). **Bloque** : rien ; les rendus provisoires s'appliquent en attendant.
- **U2-Q2 (Tech Lead)** : `GenerationStatus` (F8-TL-2) peut-il donner le nombre de propositions prêtes par jour, pour que les anneaux de l'écran 5 apparaissent un à un (handover § 7) ? **Bloque** : rien ; sans ce champ, les anneaux d'un jour apparaissent ensemble (§ 19).

## Questions liées
- **Q12, Q59** (Samuel) : maquettes et Dossier UX absents. Une maquette exportée prime sur cette décision.
- **Q37** (Samuel) : libellés de segments, « Transports publics », lien « Idées » ; U2-Q1 la complète.
- **Q10, Q13, Q30** (UX/UI, 0012 en revue dans #26) : `Chip`, `OtpInput`, `StatusBanner`. F7 et F8 suivent le rendu en vigueur.
- **Q49** : partie UX/UI tranchée au § 12.
