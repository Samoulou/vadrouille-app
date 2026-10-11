# 0018 — Rendus et textes non maquettés de F5a, F7, F8 et D1

Statut : décision déléguée, définitive sans veto de Samuel sous 2 jours (avant le 2026-10-11) ; à lister dans la note de version suivante, rubrique « Décisions prises par le studio » · Date : 2026-10-09 · Décideur : UX/UI (écrans non maquettés, dans les règles de Ligne ; délégation « Qui décide quoi » de `docs/CONTEXT.md`) · Ticket #63 · PR #64, fusionnée avant la fin de sa revue, puis PR #67 : correction 1 (revue « tech-lead + ux-ui » du head 8bea560) et correction 2 sur 2 (revue Tech Lead du head b9c26c0)

Numérotation : le numéro 0017 est pris par la décision de la PR #65.

## Contexte
`docs/ux/maquettes/` est vide (Q12) et le Dossier UX n'est pas dans le dépôt (Q59). Quatre questions déléguées à UX/UI restaient ouvertes dans `QUESTIONS.md` :
- **Q97** : rendus provisoires de F5a (#54, fusionnée) : poignée du panneau, bandeau `travel`, lignes d'événements, « Surprends-moi » ;
- **Q106** : section « Démonstration » de la page d'accueil (D1, #59, fusionnée) ;
- **Q87** (F7-Q1) : rendus et textes de Remplacer (écran 14, maquetté mais sans PNG), Ajouter un lieu et Déplacer, dont la partie UX/UI de **Q49** ;
- **Q74** (F8-Q1) : rendus et textes de la création (écrans 1 à 5) et de la connexion.

Sources :
- le code de F5a et de D1 dans `main` : `Sheet.tsx`, `StatusBanner.tsx`, `EventLines.tsx`, `SurpriseBlock.tsx`, `JourneePanel.tsx`, `DemoSection.tsx` ;
- les captures `docs/ux/captures/F5/` et `docs/ux/captures/D1/accueil-390x844.png` ;
- les spécifications F5, F7 et F8 ;
- les décisions 0014, 0015 et 0016.

Hors périmètre : Q32, Q51, Q53 et Q62, liées à la décision 0012 (en revue dans #26). Cette décision ne contredit pas 0012. Là où F7 ou F8 réutilisent un composant que 0012 redessine (`Chip`, `OtpInput`, `StatusBanner`), elles suivent le rendu en vigueur : celui de F2 tant que 0012 n'est pas fusionnée, celui de 0012 ensuite.

Ni le design system Ligne, ni les maquettes, ni le handover ne sont modifiés. Toute valeur sans token va dans `src/components/ligne/provisoire.css`, avec le numéro de sa question (tableau en fin de document). Ajouter une icône au jeu Ligne ou créer un token relève de Samuel (Q37) : la proposition lui est transmise (U2-Q1).

Rien ici n'engage d'argent, de compte externe ni de donnée personnelle.

### Portée
- **Ce qui est tranché ici :** l'apparence, les textes visibles et les exigences d'accessibilité.
- **Ce qui reste au Tech Lead :** les noms de props, de composants et de fichiers, les mécanismes (minuteurs, régions live, `Intl.NumberFormat`, `aspect-video`, durées exactes) et l'affectation des tâches. Ces détails sont des **préconisations de rendu**. Une forme technique différente est acceptée si le rendu et l'accessibilité décrits sont obtenus.
- **Décision et spécifications F7 et F8 :** pour les rendus et les textes provisoires (UX/UI), cette décision prime. C'est le cas de « Récit » (§ 16), de l'aide du récit (§ 16) et du bandeau `generating` de l'écran 5 (§ 19). Le Product Owner met les spécifications à jour (U2-Q3). D'ici là, les PR de code citent cette décision pour justifier l'écart.
- **« Aperçu » :** le mot sert ici, comme dans les spécifications, de vocabulaire interne pour l'aperçu des effets. Il n'apparaît jamais dans l'interface (handover § 10) : les textes visibles sont « Ce qui change », « Voir l'effet », « Voir une proposition ».

### Gravité
- **Code déjà livré :** 3 majeur, 2 mineur, 1 cosmétique.
- **Code à venir (F7, F8) :** un écart à cette décision relevé en revue compte 2, ou 3 s'il touche l'accessibilité, le vocabulaire fixe ou les règles Google.
- **Exception :** une PR F7b conforme à la décision 0016 § 8 (`DayBadge` en mode bouton avec `aria-pressed`) n'est pas un écart à cette décision tant que U2-Q4 est ouverte (§ 10).

### Maquettes
Si Samuel exporte une maquette qui contredit cette décision, la maquette prime et la décision est amendée. C'est surtout vrai pour l'écran 14, déjà maquetté.

## Règles communes aux écrans de F7 et F8
F7 et F8 introduisent les premiers formulaires. Ligne n'a ni champ de saisie ni message d'erreur documenté (README, « Reste à faire »). Ces règles s'appliquent aux deux tâches.

### Champ de saisie
Concerne les champs texte, email, recherche, nombre, date, heure et les zones de texte.
- **Libellé :** visible au-dessus du champ, en `corps` 700 `ink`.
- **Aide éventuelle :** entre le libellé et le champ, en `corps-s` `ink-soft`.
- **Champ :**
  - fond `raised` ;
  - contour `trait-controle` (1,5 px, `--ligne-trait-controle`) en `border-control`, à 3,2:1 (handover § 4.2) ;
  - coins `radius-control` ;
  - 52 px de haut : `h-13`, la hauteur de `Button` `md` et des cases d'`OtpInput` ;
  - marge intérieure horizontale `space-4` ;
  - texte `corps` `ink`.
- **Zone de texte :** au moins 6 lignes de `corps`.
- **Texte indicatif :** jamais à la place du libellé, et jamais pour recopier un nom de lieu.
- **Dates et heures :** `<input type="date">` et `<input type="time">` natifs, avec le même habillage.
- **Champs côte à côte** (dates, heures, recherche et bouton) :
  - chacun garde au moins `--ligne-champ-min` (160 px, `provisoire.css`) ;
  - sinon ils passent l'un sous l'autre (`flex-wrap`), ce qui vaut à 320 px de large comme avec un texte agrandi à 200 % (WCAG 1.4.10).
  - Même règle pour les rangées « voyageurs » et « budget » (§ 16).

### Message d'erreur et annonces (WCAG 3.3.1, 4.1.3 ; handover § 11)
- **Champ invalide :**
  - contour en `ink` au lieu de `border-control`, et `aria-invalid="true"` ;
  - message sous le champ, en `corps-s` 600 `ink`.

  Ligne n'a pas de couleur d'erreur et n'en reçoit pas : le message porte l'information, jamais la couleur. C'est le rendu prévu par 0012 pour `OtpInput` invalide.
- **`aria-describedby` du champ :** l'aide, puis le message d'erreur s'il y en a un, puis le compteur s'il y en a un, dans cet ordre.
- **Erreur à l'envoi d'un formulaire :** le focus va sur le **premier champ invalide**, ou sur le groupe (`radiogroup`, groupe de `Chip`) quand l'erreur porte sur un choix. Le lecteur d'écran lit alors le nom, l'état invalide et le message.
- **Erreur sans changement de focus** (réponse du serveur, code faux, erreur de calcul) : elle s'écrit dans une région `role="alert"` **présente dans la page dès le chargement**, vide au départ. Un élément `role="alert"` inséré déjà rempli n'est pas annoncé de façon fiable.
- **États d'attente et confirmations** (« Recherche d'une proposition. », « Vérification du code… », « Nouveau code envoyé. », « Jour {n} prêt ») : même principe, dans une région `role="status"` présente dès le chargement.
- **Messages d'erreur reliés à une région live et à un champ :** le texte est rendu une seule fois. La région live est le conteneur du message, et le champ pointe vers lui par `aria-describedby`.

### Compteur de caractères
- Format **unique** : « {n} sur {max} caractères » (« 12 sur 200 caractères », « 940 sur 1 000 caractères »).
- `legende` `ink-soft`, chiffres tabulaires, aligné à droite sous le champ.
- Annoncé poliment (`aria-live="polite"`) seulement à 90 % du maximum et au maximum : 180 et 200 pour le souhait, 900 et 1 000 pour le récit (F8).

### Sections
- Titre de niveau 2 en `section` 800 `ink`.
- Écarts : `space-6` entre deux sections, `space-3` à l'intérieur d'une section.

### Texte sur `muted`
- Tout texte posé sur un aplat `muted` (blocs, squelette, lignes d'événements, bandeaux) est en `ink-2`, secondaire compris (README, « Couleurs »). Le secondaire se distingue alors par la taille et la graisse.
- Deux exceptions :
  - l'état désactivé (`muted` et `ink-soft`), règle du handover § 5 ;
  - le texte d'une étape pendant son surlignage de 2 s, qui reste en `ink` (§ 9).

### Attente
- Squelette en blocs `muted`, coins `radius-block`, de la forme du contenu attendu, **immobile**. Ligne n'a qu'une animation signature (le tracé de génération), et un scintillement n'en fait pas partie. Le squelette est `aria-hidden="true"`.
- Le texte d'attente est visible, en `corps-s` `ink-soft`, et passe par la région `role="status"`.

### Actions de fin d'écran
- Disposition :
  - `Button` `primary` `md` en pleine largeur ;
  - dessous, l'action secondaire, en pleine largeur (`secondary`) ou centrée (`text`), à `space-3` ;
  - au moins `space-8` au-dessus du premier bouton.
- Les boutons restent dans le flux, en fin de contenu, sans barre fixe : l'aperçu des effets doit se lire avant « Appliquer » (principe produit 5).

### Choix exclusif et action
- **Choisir une valeur parmi plusieurs** (raison, moment, résultat de recherche) : sémantique radio (`role="radiogroup"`, `role="radio"`, `aria-checked`), jamais `aria-pressed`.
- **Bouton qui déclenche une action** (« Placer ici… ») : un bouton simple. La dernière cible choisie porte `aria-current="true"`.
- `aria-pressed` reste réservé aux bascules indépendantes (`Chip`, case de la liste).
- Pour `DayBadge` en mode bouton, que la décision 0016 § 8 prévoit avec `aria-pressed`, voir § 10 et U2-Q4. Tant que U2-Q4 est ouverte, `aria-pressed` y est conforme.

### Position de « Retour »
- **Sur une page pleine sans carte** (écrans 1 à 5) : `IconButton` « Retour » en haut à gauche, à la place qu'il occupe sur la carte (`carte.md`).
- **Dans le panneau d'un voyage** (écran 14, « Ajouter un lieu ») : le « Retour » de la carte reste en haut à gauche et mène au niveau supérieur. Le bouton qui referme le contenu du panneau se place en haut à droite du panneau, comme « Fermer » de la fiche (F5, F7-PO-2). Il porte l'icône « fermer » et un nom qui dit où il mène, jamais « Retour » seul :
  - « Retour à la fiche » à l'écran 14 ;
  - « Retour à la Journée » sur « Ajouter un lieu ».

  Ainsi, aucun écran n'a deux boutons qui portent le même nom accessible pour deux destinations différentes.

  Ce sont deux niveaux différents : les mettre au même endroit les confondrait.

## Q97 — Rendus provisoires de F5a

### 1. Poignée du panneau : retenue
- **Décision.** Le rendu livré est retenu :
  - barre de 40 × 4 px en `border-control`, coins ronds ;
  - centrée dans un bouton d'au moins 88 × 44 px, coins `radius-control` ;
  - noms « Agrandir le panneau » et « Réduire le panneau » ;
  - focus standard ;
  - panneau en `page`, contour `outline` sur les côtés et le haut, coins `radius-sheet`.
- **Raisons.**
  - La barre est la seule marque visible d'un contrôle sans libellé visible. Elle prend donc `border-control`, à 3,2:1 (handover § 4.2 et § 11), et non `outline`, qui est décoratif.
  - La zone de 88 px facilite la prise au pouce.
  - Le contour `outline` du panneau est décoratif, conforme à `carte.md`.
- **Conséquence.** Aucun changement de code. Les valeurs `--ligne-poignee-*` restent dans `provisoire.css` (F5-Q1).

### 2. Bandeau `travel` : retenu
- **Décision.** Le rendu livré est retenu :
  - `StatusBanner` `travel` : bloc `muted`, texte `ink-2`, filet `ink-soft` de 4 px ;
  - placé sous la ligne « trajet · budget », au-dessus de la `DayLine` ;
  - texte de F5-PO-6.
- **Annonce.**
  - Le bandeau fait partie du contenu du jour. Il est rendu avec lui, à sa place dans l'ordre de lecture, et n'est pas inséré après coup pour être annoncé.
  - Le `role="status"` exigé par la spécification F5 est conservé.
  - En changeant de jour, le bandeau n'est pas réannoncé hors de la lecture normale : il n'y a pas de région live en plus.
- **Raisons.**
  - Pas de `quai` : un dépassement informe, il n'est pas une action requise au sens de Ligne (principe 2).
  - Filet `ink-soft` : même niveau que `offline` et `noOption` (0012, en revue).
  - Le texte explique le dépassement par le plus long trajet (handover § 6, écran 12 ; cadrage § 3.7).
- **Conséquence.** Aucun changement de code. F7 réutilise ce bandeau dans ses aperçus.

### 3. Lignes d'événements : retenues, une correction
- **Décision.** Le rendu livré est retenu :
  - bloc `muted`, coins `radius-block`, marge `space-3`, au moins 44 px de haut ;
  - la ligne entière est un lien ;
  - plage en `corps-s` 700 tabulaire, nom en `arret` 700, métadonnées en `corps-s`, `Tag` des exceptions.
- **Écart corrigé.**
  - La plage est déjà en `ink-2`.
  - Le **nom** (`text-ink`) et les **métadonnées** (`text-ink-soft`) passent en `ink-2`, comme tout texte sur `muted` (règles communes).
- **Conséquence : changement de code, gravité 1.**
  - Dans `src/features/sejour/EventLines.tsx`, le nom et les métadonnées passent en `text-ink-2`.
  - Préconisation : le faire dans **F5c**, qui réutilise `EventLines` pour « Pendant ton séjour ».
  - F5c peut devoir régénérer les références visuelles de F5 et les captures de `docs/ux/captures/F5/` (décision 0004).

### 4. « Surprends-moi » : retenu, une mention ajoutée
- **Décision.**
  - Bouton : `Button` `secondary` `sm`, aligné à gauche, libellé fixe « Surprends-moi », `aria-expanded`.
  - Idée dévoilée, dans cet ordre :
    1. **nouveau** : « Une idée pour ta journée, pas encore dans ton programme. » en `corps-s` `ink-soft` ;
    2. le nom, en `arret` 700 (niveau 3) ;
    3. le `meta`, en `corps-s` `ink-soft` ;
    4. le `ReasonBlock` ;
    5. avec F7c, « Ajouter à ma journée » (`Button` `secondary` `sm`).
- **Raisons.** L'idée dévoilée a la forme d'une étape. Rien ne disait qu'elle n'est pas ajoutée (principe produit 5). La fiche d'un événement le dit déjà (F5-PO-11).
- **Conséquence : changement de code, gravité 2.**
  - La mention est ajoutée dans `SurpriseBlock.tsx`, avec une nouvelle clé `fr.json`.
  - Un test vérifie qu'elle est visible quand l'idée est dévoilée.
  - Préconisation : le faire dans **F5c**, avec le § 3. F5b (PR #66, ticket #61) n'est pas rouverte.

## Q106 — Section « Démonstration » de la page d'accueil (D1, #59) : retenue
- **Décision.** Le rendu fusionné dans `main` (capture `docs/ux/captures/D1/accueil-390x844.png`) est retenu tel quel :
  - filet `hairline` au-dessus de la section ;
  - titre « Démonstration » en `section` 800 ;
  - mention « Données simulées. Les lieux entre crochets ne sont pas vérifiés. » en `corps-s` `ink-soft` ;
  - « Voyage d'exemple : Édimbourg » en `corps` `ink` ;
  - quatre liens, chacun d'au moins 44 px, séparés par des filets `hairline`, avec le libellé en `corps` 600 `line` et la précision en `corps-s` `ink-soft`.
- **Raisons.**
  - `line` marque les liens d'action (handover § 4.2).
  - Chaque lien occupe toute une rangée, séparée des autres : il ne se distingue pas d'un texte voisin par la seule couleur.
  - La mention est une phrase, pas un badge (même lecture que 0014 § 7).
- **Conséquence.** Aucun changement de code. Cette capture vaut validation visuelle de D1.

## Q87 — Rendus et textes de F7 (dont la partie UX/UI de Q49)
Préconisation d'affectation :
- **F7a** : écran 14, `ChangeSet`, `SegmentedControl` vertical, surlignage, toast ;
- **F7b** : Déplacer, `DayBadge` en mode bouton ;
- **F7c** : Ajouter un lieu, « Choisir », « Ajouter à ma journée ».

Ces rendus complètent les décisions 0016 § 8 et § 9.

### 5. Mise en page de l'écran 14 et d'« Ajouter un lieu »
- Contenu du panneau, comme la fiche (F5-PO-8), en marges `space-5`.
- En tête :
  - en haut à droite du panneau, un `IconButton` carré avec l'icône « fermer » : « Retour à la fiche » à l'écran 14, « Retour à la Journée » sur « Ajouter un lieu » (règles communes, « Position de « Retour » ») ;
  - titre de niveau 1 en `titre-fiche` 800 ;
  - moment en `corps-s` `ink-soft` tabulaire.
- Les blocs suivent l'ordre de la spécification, à `space-6` d'écart.
- **Écran 14, retour à la fiche (F7-PO-2).** « Retour à la fiche » (en haut à droite, toujours présent) et « Annuler » (sous l'aperçu, présent seulement quand une proposition est affichée) ont le même effet. Ils reviennent à la fiche de l'étape, focus sur son titre, programme inchangé. Le critère C16 de la spécification F7 se lit comme deux cas, un par bouton (U2-Q3).
- **« Ajouter un lieu ».** « Retour à la Journée » et « Annuler » reviennent tous deux à la Journée, focus sur l'élément d'origine.
- Étape verrouillée :
  - le titre ;
  - le message en `corps` `ink-2` ;
  - « Retour à la fiche » en `Button` `secondary` `md` pleine largeur.

### 6. Choix de la raison et du moment : `SegmentedControl` vertical (0016 § 8)
- **Rail :** `muted`, coins `radius-control`, marge intérieure et écart `space-1`.
- **Options :** une par rangée, pleine largeur, au moins 44 px de haut, libellé aligné à gauche, marge horizontale `space-4`.
- **Option choisie : indice non coloré obligatoire** (README, « Accessibilité » : l'information ne repose jamais sur la seule couleur). Elle porte à la fois :
  - l'aplat `line` ;
  - le texte `on-line` 700 ;
  - une **coche de 20 px** en `on-line` avant le libellé.
- **Options non choisies :** transparentes, texte `ink-2` 600, avec une place de 20 px réservée à gauche pour que les libellés restent alignés.
- **Sans option choisie** (`value: null`) : aucune rangée n'est en aplat.
- La coche est une icône du jeu Ligne. En `on-line` sur aplat `line`, elle s'écarte du README (« Iconographie » : icônes en `ink` ou `ink-soft`, seul le terminus est blanc sur aplat). C'est une **exception provisoire**, déclarée ici et soumise à Samuel avec U2-Q1. Elle vaut pour toutes les coches sur aplat `line` de cette décision (§ 6, § 11, § 12) et suit la `Chip` choisie de 0012.
- La version horizontale (`SegmentedControl` de F2) suit 0012.
- Sémantique radio (règles communes). « Choisis une raison. » suit la règle des erreurs : focus sur le groupe.
- Moments : « Temps libre 15:00 – 18:30 », « Déjeuner pas encore choisi », « Dîner pas encore choisi », chiffres tabulaires.

### 7. Souhait, attente et proposition (écran 14)
- **Souhait.**
  - Libellé « Ce que tu préfères (facultatif) », aide « Par exemple : une dégustation, quelque chose à l'abri. ».
  - Compteur « {n} sur 200 caractères » (règles communes).
- **Attente.**
  - Squelette commun : barre de nom, barre de métadonnées, trois barres de `ChangeSet`.
  - « Recherche d'une proposition. » dans la région `role="status"`.
  - À 5 s : « On cherche autour de {nom}. » en `corps` `ink-2`, dans la même région, puis « Arrêter » en `Button` `secondary` `sm`, sous le squelette.
- **Proposition.** Elle est proposée, pas encore appliquée. Bloc `raised` à contour `outline`, coins `radius-block`, marge `space-4`, pour la distinguer du programme :
  - nom en `section` 800 (niveau 2, focus dessus) ;
  - moment et `meta` en `corps-s` `ink-soft` ;
  - `Tag` des exceptions ;
  - `ReasonBlock`.
  - « Proposition prête. » passe par la région `role="status"`.
- **« Ce qui change » et « Ce qui ne bouge pas » :**
  - titres de niveau 3 en style `bloc` (15/20, 800, `--ligne-texte-bloc`, Q11) ;
  - « Ce qui ne bouge pas » : heure en 700 tabulaire, nom en `corps` `ink`, `Tag` ;
  - une étape verrouillée garde la marque de verrou de F5b.
- **Bandeau de trajet** (`travel`, § 2) : au-dessus de « Ce qui change ».
- **Actions :**
  - « Appliquer » (`primary` `md`), puis « Annuler » (`secondary` `md`), en pleine largeur ;
  - à `space-8` sous « Ce qui ne bouge pas ».
- **Bandeaux :**
  - `offline` en tête du contenu, sous le moment ;
  - `conflict`, `noOption` et `error` à la place de la zone de proposition ;
  - le focus va sur le bandeau quand la spécification le demande (`noOption`).

### 8. `ChangeSet`
- **Liste :** sans puces, une ligne par changement, `corps` `ink`, `space-2` entre les lignes.
- **Heure :** en 700 tabulaire, en tête de ligne.
- **Valeur remplacée** (`replaced`) : `<del>` en `ink-soft`, barré, après le texte écrit « à la place de », qui suffit. Pas de « avant : » masqué : il ferait doublon.
- **Formats à flèche** (`moved`, `segment`) : l'ancienne valeur est un `<del>` précédé de « avant : » masqué visuellement. Le barré ne porte jamais seul l'information.
- **Flèche « → » :** `aria-hidden="true"`, suivie de « après : » masqué visuellement. Un lecteur d'écran lit « avant : J2 13:25 après : J4 15:45 », pas « flèche droite ».
- **Trajet estimé :** la nouvelle durée prend le format de F3, « environ {durée} (estimation) ». Exemple : « Trajet vers [Café de Stockbridge] : 15 min → environ 10 min (estimation) ». Sans `estimated`, ni « environ » ni « (estimation) ». La règle « environ / (estimation) » suit Q37.
- **Budget :** signe « + » ou « − » (U+2212). Montant formaté à la mode suisse (`fr-CH`, préconisation : `Intl.NumberFormat`).
- **Formats retenus :**
  - « {heure} {après} à la place de {avant} » ;
  - « {heure} {nom} ajouté » ;
  - « {nom} : J{a} {heure} → J{b} {heure} » ;
  - « Trajet vers {nom} : {avant} → {après} » ;
  - « Budget du jour : environ +{n} CHF par personne ».

### 9. Surlignage de 2 s sur la `DayLine` (0016 § 9)
- **Marques.** Une étape surlignée porte deux marques :
  - un fond `muted` derrière toute sa ligne, coins `radius-control` ;
  - un arrêt **plein `line`** au lieu de l'anneau, comme l'arrêt sélectionné de la carte (`carte.md`). C'est un changement de forme, pas seulement de couleur.
- **Pendant le surlignage**, le texte de l'étape reste en `ink` sur `muted`, à plus de 15:1. L'exception à la règle « `ink-2` sur `muted` » est voulue : la ligne garde son apparence de programme.
- **Fin du surlignage.** Les marques disparaissent par un fondu bref, dans la plage de 150 à 250 ms du handover § 7. Sous `prefers-reduced-motion: reduce`, elles disparaissent sans transition.
- **Pour les lecteurs d'écran**, le toast « Modifié. » et le focus sur l'étape portent l'information.

### 10. `DayBadge` en mode bouton (0016 § 8)
- **Rendu.**
  - Choisie : rendu de la pastille active de F3, plein `line`, texte `on-line`. La différence de forme (aplat plein contre contour) n'est pas portée par la seule couleur.
  - Non choisie : pastille inactive de F3.
  - « Complet » : état désactivé de F3, avec « complet » visible en `legende`.
  - Les pastilles **passent à la ligne** (écart `space-2`) au lieu de défiler.
  - Titres « Quel jour ? », « Vers quel jour ? », « Quel moment ? » : niveau 3, en `bloc`.
- **Sémantique.** Choisir un jour est un choix exclusif.
  - UX/UI préconise une sémantique radio : groupe `role="radiogroup"` nommé par le titre, chaque pastille en `role="radio"` avec `aria-checked` ; une pastille « complet » reste atteignable avec `aria-disabled="true"`.
  - La décision 0016 § 8 retient `aria-pressed`. Changer cette forme relève du Tech Lead (U2-Q4). D'ici là, 0016 s'applique, et une PR F7b qui la suit n'est pas un écart à cette décision (échelle de gravité, en tête).

### 11. Feuille « Déplacer » (F7b)
- **Feuille.** Feuille modale de F6 : fond `raised`, coins supérieurs `radius-sheet`, voile et hauteur maximale de `provisoire.css`.
  - Titre « Déplacer {nom} » en `section` 800, focus dessus.
  - « Fermer » (`IconButton`, icône « fermer ») en haut à droite.
- **Points d'insertion.** Sous les pastilles, la `DayLine` compacte du jour choisi, en lecture seule.
  - À chaque point d'insertion : un `Button` `secondary` `sm` sur toute la largeur de la colonne de contenu.
  - Le bouton porte l'icône « plus » (20 px) et le libellé **visible** « Placer ici, vers 15:45 », qui est aussi son nom accessible tout entier (WCAG 2.5.3).
- **Point choisi.** Le bouton qui déclenche l'aperçu porte ensuite `aria-current="true"`, l'aplat `line` et la coche de 20 px. Il n'a pas `aria-pressed` (règles communes).
  - L'aperçu s'affiche sous la `DayLine` compacte, focus sur « Ce qui change ».
  - Choisir un autre point remplace l'aperçu.
- **Actions.** Comme à l'écran 14.

### 12. « Ajouter un lieu » (F7c) et partie UX/UI de Q49
- **Recherche.**
  - Le champ « Lieu à ajouter » et « Rechercher » (`primary` `md`) sont sur une même rangée, qui passe à la ligne selon les règles communes.
  - Les résultats forment un **groupe radio** nommé « Résultats » : une option par résultat, pleine largeur, au moins 44 px, séparée par des filets `hairline`. Nom en `corps` 700 `ink`, secteur en `corps-s` `ink-soft` dessous.
  - Le résultat choisi porte `aria-checked="true"`, l'aplat `line` (texte `on-line`) et la coche de 20 px.
  - « {n} résultats. » passe par la région `role="status"`.
- **Attribution Google** (handover § 0 règle 3, § 8).
  - Quand un résultat vient de Google (`fromGoogle`), « Données de lieux : Google » (`PlacesAttribution`) reste visible **tant qu'un nom venu de Google est à l'écran** : sous la liste, puis sous le résultat choisi, jusqu'à l'aperçu compris si celui-ci reprend ce nom.
  - Un nom venu de Google n'apparaît jamais sans cette mention.
- **« Nom dans ton programme » (Q49, UX/UI).**
  - Champ selon les règles communes, avec l'aide « C'est le nom qui apparaîtra dans ton programme. » entre le libellé et le champ.
  - **Préremplissage.** Le champ n'est prérempli que par un nom **maison** :
    - `suggestedName`, issu de notre recherche web ;
    - ou `SurpriseIdea.name`.

    **Jamais par un nom venu de Google** (F7-PO-10). L'écran ne peut pas savoir d'où vient un nom : c'est le **contrat** qui le garantit. Par contrat (F7-TL-1, décision 0016), `suggestedName` et `SurpriseIdea.name` sont des noms maison, jamais dérivés d'un `displayName` Google. L'adaptateur `api` de B11 et ses tests font respecter cette garantie ; l'écran préremplit sans autre contrôle. Une source qui ne peut pas tenir cette garantie ne fournit pas de `suggestedName`, et le champ reste vide.
  - Le champ n'a **jamais** de texte indicatif. Aucun bouton « Reprendre ce nom » ou équivalent n'existe.
  - Un nom prérempli n'a **pas** de marque « déduit » : ce n'est pas une déduction du récit (0012).
- **« Choisir » d'un repas pas encore choisi.**
  - Même rendu que le lien « Idées » (F3, Q37), à droite de « Déjeuner pas encore choisi ».
  - Nom accessible : « Choisir le déjeuner » ou « Choisir le dîner » (`aria-label`). Il commence par le libellé visible (WCAG 2.5.3).
- **« Ajouter un lieu »** sous la `DayLine` : `Button` `secondary` `sm`, icône « plus ».

### 13. Textes de F7
- **Retenus sans changement :** les textes provisoires de la spécification :
  - « Modifié. », « Lieu ajouté. », « Étape déplacée. », « Modification annulée. » ;
  - hors ligne, conflit, erreur, aucune option compatible, étape verrouillée ;
  - « Recherche d'une proposition. », « Proposition prête. », « On cherche autour de {nom}. » ;
  - « Écris au moins 2 lettres. », « {n} résultats. » (« 1 résultat. »), « Aucun lieu trouvé. Essaie un autre nom. » ;
  - « Donne un nom à ce lieu. ».
- **Changé :** le compteur du souhait devient « {n} sur 200 caractères » au lieu de « {n} caractères restants » (U2-Q3).

## Q74 — Rendus et textes de F8
Préconisation d'affectation :
- **F8a** : écrans 1 et 2 ;
- **F8b** : écrans 3 et 4 ;
- **F8c** : lancement, écran 5.

### 14. Cadre commun des écrans 1 à 5
- **Mise en page :** fond `page`, une colonne, marges `space-5`, largeur bornée comme l'accueil.
- **« Retour » :** `IconButton` carré en haut à gauche (règles communes), absent de l'écran 5 tant que « Mes voyages » n'existe pas.
- **Titre de niveau 1 :** `titre-jour` 800 (approche `--ligne-titre-jour-approche`).
- **Pas d'indicateur « étape {n} sur {total} » :** le nombre d'écrans varie.
- **Titres du document :** ceux de la spécification, retenus.
- **Brouillon perdu.** « Ton brouillon n'a pas été conservé. Recommence à partir de la destination. »
  - Visible en tête de l'écran 1 : bloc `muted`, coins `radius-block`, marge `space-4`, `corps-s` `ink-2`.
  - Le texte est écrit **après le premier rendu** dans une région `role="status"` déjà présente, pour être annoncé.
  - Le bloc n'a pas de filet : ce n'est pas un type de `StatusBanner`.

### 15. Écran 1 — Créer le voyage
- **Champs :** selon les règles communes, dans l'ordre de la spécification.
- **Dates :** « Arrivée » et « Départ » côte à côte, empilées sous 2 × 160 px utiles ou en texte agrandi.
- **« As-tu déjà un logement ? » :** `SegmentedControl` horizontal, « Oui » / « Un quartier » / « Pas encore ». Le champ qui en dépend apparaît juste dessous.
- **Autres villes, Engagements déjà pris :** deux sections (niveau 2), chacune avec son aide et un bouton « Ajouter une ville » ou « Ajouter un engagement » (`secondary` `sm`, icône « plus »).
  - Chaque élément ajouté est un bloc `raised` à contour `outline`, coins `radius-block`, marge `space-4`.
  - Titre du bloc en `arret` 700 : le nom saisi, ou « Ville {n} » / « Engagement {n} ».
  - « Retirer » en `Button` `text` `sm`, en haut à droite. Nom accessible « Retirer {nom} », qui commence par le libellé visible.
  - À l'ajout, le focus va sur le premier champ du bloc. Au retrait, il va sur le bouton « Ajouter… » de la section.
- **Récapitulatifs des dates :** « Édimbourg : sam. 29.08 – mar. 01.09 », en `corps-s` `ink-soft` tabulaire.
- **Engagement :**
  - type en `SegmentedControl` « Vol » / « Réservation » / « Billet » ;
  - date en pleine largeur ;
  - heures de début et de fin côte à côte, empilées selon les règles communes.
- **Aide** « Ils seront gardés tels quels dans ton programme. » : retenue.
- **« Continuer » :** `primary` `md`, pleine largeur, `space-8` au-dessus.

### 16. Écran 2 — Récit et vérification
- **Récit.**
  - Zone de texte nommée par le titre.
  - Aide **au tutoiement** (handover § 10) : « Qui part, ce qui te fait envie, ce que tu préfères éviter, ton budget pour les repas. ». Elle remplace le texte provisoire de la spécification, qui vouvoyait.
  - Compteur « {n} sur 1 000 caractères ».
  - « Préparer mon brief » (`primary` `md`), puis « Remplir moi-même » (`text`).
  - Bandeau d'erreur au-dessus de ces boutons.
  - « On prépare ton brief… » passe par la région `role="status"`.
- **Vérification.**
  - Aide sous le titre : « En pointillé : ce qu'on a compris de ton récit. Touche pour corriger. ».
  - **Voyageurs** : une rangée par type :
    1. libellé en `corps` 700 ;
    2. `IconButton` « Retirer un adulte » ;
    3. champ numérique de 44 × 52 px (`touch-target` × `h-13`, `section` 800 tabulaire, centré) ;
    4. `IconButton` « Ajouter un adulte ».

    La rangée passe à la ligne si la place manque.
  - **Icône « moins »** : absente du jeu Ligne. F8a la trace comme **icône provisoire isolée**, hors du jeu commun des icônes Ligne, en suivant les règles de l'iconographie (grille 24, trait 2,2, extrémités arrondies, `aria-hidden`). Elle est marquée « provisoire (U2-Q1) » et remplacée si Samuel l'ajoute au jeu.
  - **Sections facultatives repliées :**
    - en-tête en bouton pleine largeur, au moins 44 px, `aria-expanded` ;
    - titre en `section` 800 ;
    - « Facultatif » ou le résumé en `corps-s` `ink-soft` ;
    - à droite, un chevron de 20 px, `ink-soft`, décoratif : en attendant U2-Q1, c'est l'icône « retour » tournée vers le bas ou vers le haut. Si Samuel ajoute un chevron au jeu Ligne, il remplace cette icône tournée ;
    - filet `hairline` entre deux sections.
  - **Envies, déplacements, à limiter :** `Chip` qui passent à la ligne, écart `space-2`.
  - **« À limiter » :**
    - une `Chip` indisponible porte `aria-disabled="true"`, **pas** l'attribut `disabled`. Elle reste atteignable au clavier, avec son explication, et l'activer n'a pas d'effet ;
    - elle a le rendu désactivé du handover (`muted`, `ink-soft`) ;
    - chaque `Chip` indisponible est décrite par « Déjà dans tes envies » ou « Déjà à limiter » (`aria-describedby`) ;
    - sous le groupe, une ligne visible en `legende` `ink-soft` : « Les envies déjà choisies ne peuvent pas être limitées. » (dans « Envies » : « Les éléments à limiter ne peuvent pas être choisis. »).
  - **Budget par repas :** sur une rangée qui passe à la ligne au besoin, « Environ », puis un champ numérique (largeur `--ligne-champ-montant`), puis « CHF par personne et par repas ». Le champ est nommé par ces textes (`aria-labelledby`).
- **Marque « déduit »** (F8-TL-4) : elle suit la règle de `Chip` en vigueur.
  - **Avec 0012 fusionnée :**
    - option déduite choisie : fond `raised`, contour pointillé `trait-controle` `ink`, texte `ink` 700 ;
    - coche de 20 px en `ink` avant le libellé.
  - **Sans 0012 :** aplat `line` et contour pointillé `ink`, comme la `Chip` de F2.
  - **Champs numériques déduits :** contour pointillé `ink`.
  - « déduit de ton récit » reste dans le nom accessible.
- **Retour au récit.** « Récit » devient « **Revenir à mon récit** » (`text`, centré sous « Continuer »). « Retour » est réservé au niveau supérieur. Cette décision prime sur la spécification F8 (l. 142) ; mise à jour par le Product Owner (U2-Q3).
- **Libellés retenus :**
  - envies (F8-PO-6) : « Musées », « Balades en ville », « Nature », « Dégustations », « Restaurants », « Patrimoine et monuments », « Marchés », « Bars et soirées » ;
  - déplacements : « À pied », « Transports publics », « Voiture » (Q37).

### 17. Écran 3 — Où loger
- **Quartier conseillé.**
  - Nom en `section` 800 (niveau 2).
  - Raison en `corps` `ink-2`, en texte simple : ce n'est pas un `ReasonBlock`, qui exige une source.
  - Mini-carte en pleine largeur au format 16:9, coins `radius-block`, contour `outline`. Préconisation : `AreaMap` avec `aspect-video`.
- **Logements.** Un bloc `raised` à contour `outline` par logement, coins `radius-block`, marge `space-4`.
  - Nom en `arret` 700, `meta` en `corps-s` `ink-soft`.
  - « Choisir ce logement » en `secondary` `sm`, pleine largeur.
  - Nom accessible : « Choisir ce logement : {nom} » (`aria-label`). Il commence par le libellé visible (WCAG 2.5.3) et distingue les trois boutons.
- **« Partir du quartier, choisir plus tard » :** `primary` `md`, pleine largeur, `space-8` au-dessus.
- **Attente :** squelette commun. « On cherche le quartier le mieux placé… » visible et passé par la région `role="status"`.
- **`no_option` et erreurs :** textes de la spécification. « Continuer sans logement » en `secondary` `md`.

### 18. Écran 4 — Connexion
- **Aide :** « Pas de mot de passe : on t'envoie un code à 6 chiffres. », en `corps` `ink-soft`.
- **Étape email :** champ selon les règles communes, puis « Recevoir un code » (`primary` `md`).
  - Une adresse mal formée : message sous le champ, focus sur le champ.
  - `rate_limited` : région `role="alert"`.
- **Étape code.**
  - « Code envoyé à {email}. Il est valable 10 minutes. » en `corps` `ink-2`. L'adresse est en 700, coupée au besoin.
  - Le focus va sur la première case (spécification).
  - Libellé visible « Code reçu par email », en `corps` 700 `ink`, au-dessus des cases.
  - « **Vérification du code…** » : visible sous les cases en `corps-s` `ink-soft`, et passé par une région `role="status"` présente dès l'affichage de l'étape code.
  - « Nouveau code envoyé. » : même région.
  - **Erreurs** (`invalid_code`, `code_expired`, `too_many_attempts`) :
    - le message s'écrit dans une région `role="alert"` présente dès l'affichage de l'étape code, sous les cases ;
    - le groupe de cases pointe vers elle par `aria-describedby` ;
    - chaque case porte `aria-invalid="true"` ;
    - après `invalid_code`, le focus va sur la première case vidée.
    - Style : `corps-s` 600 `ink`.
  - « Renvoyer le code » et « Changer d'adresse » : `Button` `text` `sm` sur une rangée qui passe à la ligne.
- **`active_preview_exists` :** `StatusBanner` `conflict` « Tu as déjà des propositions en préparation. », avec le lien « **Voir ces propositions** ».

### 19. Écran 5 — Propositions prêtes
- **Ordre :** titre, compteur (`corps` `ink-2` tabulaire), une rangée par jour, bandeaux, actions.
- **Compteur :** « {ready} propositions prêtes sur {expected} », « 1 proposition prête sur 8 », « 0 proposition prête sur 8 ». Il n'est pas une région live : seuls les passages de jour sont annoncés.
- **Rangée d'un jour :**
  - `DayBadge` réduite « J{n} » ;
  - la mini-ligne ;
  - l'état : « En préparation » (`corps-s` `ink-soft`) ou « Jour {n} prêt » (`corps-s` 700 `ink`).
- **Mini-ligne : `aria-hidden="true"`.** Le texte d'état porte l'information.
  - Aux extrémités, un carré terminus `ink` de `--ligne-mini-terminus` (12 px), coins `radius-tag`.
  - Entre eux, un tracé fin (`rail-free`, `track-free`) tant que le jour n'est pas prêt.
  - Les arrêts apparaissent en anneaux de 12 px (`--ligne-stop-ensemble`), anneau de 3 px `line` (`--ligne-anneau-carte`), fond `raised`, sans numéro ni nom.
  - À « Jour {n} prêt », le tracé `rail` plein `line` se dessine de gauche à droite (durée dans la plage de 150 à 250 ms). Sous `prefers-reduced-motion: reduce`, il apparaît par fondu.
  - Sans compte par jour (U2-Q2), les anneaux d'un jour apparaissent ensemble.
- **Annonces :**
  - chaque passage à « Jour {n} prêt » est annoncé **une fois** par une région `role="status"` présente dès le chargement, sans déplacer le focus ;
  - « Tes premières propositions sont prêtes » est annoncé de la même façon.
- **Actions :** « Voir mes propositions » (`primary` `md`), puis « Passer, voir le programme » (`text`), à l'état prêt ou incomplet.
- **Aperçu incomplet :** singulier « 1 proposition n'a pas trouvé de lieu compatible. ».
- **Erreurs :** textes retenus.
- **Pas de `StatusBanner` `generating`** sur cet écran : la mini-ligne et l'état de chaque jour portent l'avancement. Cette décision prime sur la spécification F8 (l. 189), qui citait le bandeau immobile de 0012. Le Product Owner valide ce retrait au regard de F8-PO-12 et met la spécification à jour (U2-Q3).

### 20. Textes de F8
Les textes provisoires de la spécification sont retenus, sauf :

| Texte de la spécification | Décision |
|---|---|
| « Récit » | « Revenir à mon récit » (§ 16) |
| « Qui part, ce qui vous fait envie, ce que vous préférez éviter, votre budget pour les repas. » | « Qui part, ce qui te fait envie, ce que tu préfères éviter, ton budget pour les repas. » (§ 16) |
| — | ajout : « Les envies déjà choisies ne peuvent pas être limitées. » et « Les éléments à limiter ne peuvent pas être choisis. » (§ 16) |
| — | ajout : « Ville {n} », « Engagement {n} » (§ 15) |
| — | ajout : « Voir ces propositions » (§ 18) |
| — | ajout : singuliers du compteur et de l'aperçu incomplet (§ 19) |

## Valeurs à déclarer dans `provisoire.css`

| Variable | Valeur | Question | Usage |
|---|---|---|---|
| `--ligne-champ-min` | 160px | F8-Q1, F7-Q1 | largeur minimale d'un champ côte à côte avant empilement |
| `--ligne-champ-montant` | 6rem | F8-Q1 | champ du budget par repas, quatre chiffres et marges |
| `--ligne-icone-petite` | 20px | U2-Q1 | coche, « plus », « moins », chevron des sections (icône « retour » tournée) |
| `--ligne-mini-terminus` | 12px | U2-Q1 | terminus de la mini-ligne de l'écran 5 |

Valeurs déjà présentes, réutilisées :
- `--ligne-stop-ensemble` (12 px) et `--ligne-anneau-carte` (3 px) : anneaux de la mini-ligne ;
- `--ligne-texte-bloc` : titres de niveau 3.

Valeurs qui ont déjà un token ou une classe :
- `touch-target` (44 px) ;
- `h-13` (52 px, `Button` `md`) ;
- `radius-tag`, `radius-control`, `radius-block`.

## Changements de code imposés

| Gravité | Changement | Tâche (préconisation) | Section |
|---|---|---|---|
| 2 | Mention « Une idée pour ta journée, pas encore dans ton programme. » dans `SurpriseBlock`, avec sa clé `fr.json` et un test | F5c | § 4 |
| 1 | Nom et métadonnées des lignes d'événements en `ink-2` ; régénérer au besoin les références de F5 (décision 0004) | F5c | § 3 |

- D1 (#59) : aucun changement.
- F7 et F8 : rendus à appliquer par F7a, F7b et F7c, puis F8a, F8b et F8c. Chaque PR liste tout écart à cette décision.

## Nouvelles questions
- **U2-Q1 (Samuel, complète Q37, modification de Ligne).**
  - Demande :
    - ajouter au jeu d'icônes « moins » et un chevron, qui remplacerait l'icône « retour » tournée des sections repliées (§ 16) ;
    - admettre la coche en `on-line` sur aplat `line` comme exception au README, « Iconographie » (§ 6) ;
    - créer des tokens pour les valeurs du tableau `provisoire.css` ci-dessus (icône 20 px, terminus de 12 px de la mini-ligne, champs).
  - Bloque : rien. Les tracés et valeurs provisoires s'appliquent en attendant.
- **U2-Q2 (Tech Lead).**
  - Demande : `GenerationStatus` (F8-TL-2) peut-il donner le nombre de propositions prêtes par jour ?
  - Bloque : rien. Sans ce champ, les anneaux d'un jour apparaissent ensemble.
- **U2-Q3 (Product Owner).**
  - Demande : mettre les spécifications à jour d'après cette décision.
    - F8 : « Récit » devient « Revenir à mon récit » (l. 142) ; aide du récit au tutoiement ; pas de `StatusBanner` `generating` sur l'écran 5 (l. 189) ; régions live et focus des erreurs.
    - F7 : compteur du souhait au format « {n} sur 200 caractères » ; résultats de recherche en groupe radio ; point d'insertion en `aria-current` ; noms « Retour à la fiche » et « Retour à la Journée » ; C16 lu comme deux cas.
  - Bloque : rien. La décision prime, et les PR de F7 et F8 la citent.
- **U2-Q4 (Tech Lead).**
  - Demande : `DayBadge` en mode bouton passe-t-il de `aria-pressed` (0016 § 8) à une sémantique radio (`radiogroup`, `aria-checked`, `aria-disabled` pour « complet »), comme UX/UI le préconise pour un choix exclusif (§ 10) ?
  - Bloque : rien. 0016 s'applique d'ici là ; à trancher avant F7b.

## Questions liées
- **Q12, Q59** (Samuel) : maquettes et Dossier UX absents. Une maquette exportée prime.
- **Q37** (Samuel) : libellés de segments, « Transports publics », lien « Idées ». U2-Q1 la complète.
- **Q10, Q13, Q30** (UX/UI, 0012 en revue dans #26) : `Chip`, `OtpInput`, `StatusBanner`. F7 et F8 suivent le rendu en vigueur.
- **Q49** : partie UX/UI tranchée au § 12.
