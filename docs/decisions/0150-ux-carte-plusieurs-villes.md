# 0150 — Carte à plusieurs villes : étiquette de ville numérotée, repères et regroupement, moitiés de la Journée du changement de ville

Statut : **proposée, à confirmer par la revue** (forme de 0148 et 0151) · Date : 2026-10-30 · Décideur : UX/UI (écrans non maquettés, dans les règles de Ligne, « Qui décide quoi » de `docs/CONTEXT.md`) · Ticket : #927 · Définitive dès sa fusion, sans délai de veto (0093) ; Samuel peut la remettre en cause à tout moment par une nouvelle décision. À lister dans la prochaine note de version (« Décisions prises par le studio », UX/UI). Revue : Tech Lead (faisabilité de `route.ts`, `DayMap.tsx` et des deux rendus), Product Owner.

**Correction 1** (revue consolidée du head `a1fae8f`, Tech Lead et UX/UI ; arbitrages du CEO) :
- bloquant 1 : l'étiquette de ville n'est jamais coupée : côté choisi selon la place, marge haute du cadrage relevée (§ 4, critère 4) ;
- bloquant 2 : forme du choix « Afficher sur la carte » tranchée : `SegmentedControl` gagne une variante `wrap` (options sur plusieurs rangées), sans légende visible, vérifiée à 4 options à 390 px (§ 2 point 4, critère 6, tableau des fichiers) ;
- bloquant 3 : un seul terminus nommé par ville, les positions supplémentaires masquées (§ 2 point 1, § 5, critère 3) ;
- mineurs 4 à 14 : statut ; prérequis M4b et M4c ; règle « une position, zoom 15 » étendue à tout cadrage ; `fitBounds` puis recentrage après `idle` ; anneaux montrés ou cachés par `marker.map` ; événements de la bibliothèque simulée ; `src/features/sejour/map-layout.ts` ; vocabulaire ; largeur nommée ; « Toutes les villes » rechoisie ; sélection et regroupement ; comportements du choix exclusif (§ 2, § 3, § 4, § 6, critères, tableau).

## Contexte

La spécification `specs/M4-suite-changement-de-ville.md` (dite « M4-suite ») pose à l'UX/UI trois questions sur la carte d'un voyage à 2 ou 3 villes (§ 7, § 12) :
- **U-M4S-1** : numérotation de la carte d'ensemble de Séjour (écran 11), option (a) ou (c) du § 7.1 seulement ;
- **U-M4S-2** : repères par ville, groupes, terminus, regroupement et zoom minimal de cette carte (§ 7.1, besoins 1 à 6) ;
- **U-M4S-3** : cadrage et contenu de la carte de la Journée d'un changement de ville (écran 12), noms accessibles de ses deux terminus (§ 7.2, besoins 1 à 5).

Le § 7.3 fixe ce que doit contenir cette décision, et le critère 19 en attend les critères testables. La spécification `specs/M4-plusieurs-villes.md` (dite « spécification M4 ») renvoie ces points à M4-suite (§ 7.4, § 15 point 2), comme la décision 0148 (§ 7.2 point 3).

**Ce que dit Ligne** (`docs/design-system/carte.md`, non modifié) :
- vue d'ensemble du séjour : arrêts en petits anneaux de 12 px, **sans numéro** ;
- terminus : carré `ink` de 24 px, coins 6 px, maison `on-line`, **jamais de numéro** (vérifié par `src/components/ligne/StopMarker.test.tsx`) ;
- contrôles posés sur la carte : **en haut à gauche (retour) et en haut à droite (partager)** seulement.

**Ce que fait le code de `main`** (`e2a8838`) :
- `buildOverview` (`src/components/carte/route.ts`) rend un anneau par étape positionnée et un par position de terminus distincte : le logement est un anneau sur la carte d'ensemble ;
- `buildDayRoute` numérote les étapes dans l'ordre de `day.items` (le `transfer` n'est pas une étape, la numérotation est déjà continue) et rend deux terminus quand départ et retour diffèrent ; les terminus sont masqués aux technologies d'assistance (`aria-hidden`) dans les deux rendus ;
- `GoogleMapRenderer` et `SimulatedMapRenderer` recentrent sur l'étape sélectionnée **sans changer le zoom** ;
- le tracé à travers le `transfer` est encore relié : M4c le coupe (0148 § 7.2 point 2, 0151).

**Prérequis, absents de `main` aujourd'hui** : M4c (cadrage de toutes les villes, tracé coupé, ligne « Vers {ville} ») et `src/domain/villes-du-voyage.ts` (`villesDeLaDate`, M4b, 0148 § 6 point 3). Dans cette décision, « livré par M4c » ou « livré par M4b » désigne un prérequis de M4-suite-carte, pas un état de `main`.

## Décision

### 1. U-M4S-1 : option (a), étiquette de ville numérotée

**Retenue : (a).** Sur la carte d'ensemble d'un voyage à 2 ou 3 villes, chaque ville porte une **étiquette de ville** « {n} · {ville} » (« 1 · Rome », « 2 · Florence ») posée **à droite du terminus de son logement**.
- Les anneaux et le terminus restent **sans numéro** ; `StopMarker` et `StopMarker.test.tsx` ne changent pas. L'étiquette est un **élément nouveau**, décrit ici (§ 4), qui ne contredit aucune règle de `carte.md`.
- Raison : le besoin 1 (« l'ordre des villes est lisible sur la carte ») n'est pas couvert par (c), qui renvoie l'ordre à la liste. (a) le couvre sans toucher aux règles existantes.
- (c) est écartée. L'option (b) (numéro sur le terminus) n'est pas nécessaire : **la question conditionnelle à Samuel n'est pas déclenchée** (§ 8).

### 2. U-M4S-2 : repères par ville, regroupement, zoom minimal, passage « toutes les villes » / « une ville »

Tout ce paragraphe ne vaut qu'à partir de **2 villes** (`Trip.cities` présent). **Une seule ville : la carte ne change pas** (critère 25 de la spécification M4 ; `buildOverview` et ses tests restent tels quels).

1. **Repère de ville.** Pour chaque ville du voyage, un repère : le **terminus** de son logement (`StopMarker kind="terminus"`, inchangé, carré `ink` de 24 px avec la maison, sans numéro), et son étiquette de ville à droite (§ 4).
   - Le logement d'une ville n'est **plus dessiné en anneau** sur la carte d'ensemble à plusieurs villes : il devient ce terminus, comme sur la carte d'un jour.
   - Position : les positions de terminus des jours de cette ville, dans l'ordre des jours (positions de la relecture existante, jamais écrites). Le jour d'un changement de ville, le terminus `start` appartient à la ville quittée et `end` à la ville d'arrivée.
   - **Plusieurs positions distinctes pour une même ville** (cas non attendu, une ville n'ayant qu'un logement, mais possible si la relecture rend deux positions) : la **première** dans l'ordre des jours est le repère (terminus, étiquette, nom accessible) ; chaque autre position est un terminus **masqué** (`aria-hidden`), sans étiquette ni nom. Un seul repère nommé par ville : le lecteur d'écran n'entend pas deux fois « Rome, ville 1 », et la liste porte le logement.
   - **Même ville deux fois, non consécutives** (Rome, Florence, Rome ; la répétition consécutive est refusée, 0148 § 4 point 2) : si les deux séjours ont la même position de logement, **une seule étiquette** « 1 et 3 · Rome » ; sinon deux repères, « 1 · Rome » et « 3 · Rome ».
   - Le repère n'est **pas interactif** (§ 5) : il n'est ni bouton ni lien, et n'est pas un contrôle posé sur la carte.
2. **Groupes par ville.** Les étapes d'une ville sont ses anneaux `overview` (12 px, sans numéro, inchangés), autour de son repère. Une étape appartient à la ville du jour, et le jour d'un changement de ville, à la ville quittée si elle est avant le `transfer` dans `day.items`, à la ville d'arrivée sinon (même règle que la ville de vérification, 0148 § 6 point 3). Le groupe se lit par la **position** et par l'étiquette, **jamais par la couleur** : tous les anneaux restent `line` (handover § 11). Aucun `quai` (handover § 0, règle 6).
3. **Regroupement et zoom minimal.** Le « zoom minimal » de la spécification est ici le **seuil d'affichage des anneaux** : sur la vue « Toutes les villes », les anneaux d'une ville ne sont dessinés qu'à partir du **zoom 10** (constante `ZOOM_ANNEAUX_PAR_VILLE = 10`, `route.ts`). En dessous, ils sont **regroupés dans le repère de la ville** : seuls les repères sont dessinés.
   - À titre d'ordre de grandeur, au zoom 10 et à 42° de latitude, 5 km font environ 44 px : en dessous, les anneaux d'une ville se confondent. Paris puis Berlin (≈ 900 km) ou Rome puis Florence (≈ 230 km) s'ouvrent donc en repères seuls ; deux villes voisines peuvent s'ouvrir avec leurs anneaux.
   - Le seuil suit le **zoom courant** : rendu Google, au geste de zoom (pincer) ; carte simulée, le zoom de sa caméra (elle n'a pas de geste de zoom).
   - Sur la vue d'une ville (point 4), les anneaux de **cette ville** sont toujours dessinés, quel que soit le zoom.
   - Montrer ou cacher les anneaux ne reconstruit aucun marqueur : chaque anneau garde son marqueur avancé, attaché (`marker.map = map`) ou détaché (`marker.map = null`) au passage du seuil.
   - **Sélection** : Séjour n'a ni marqueur d'étape ni sélection (inchangé, `DayMap.test.tsx`, « aucun bouton ») ; un anneau caché ne cache donc aucune étape sélectionnée. La Journée n'applique pas ce regroupement.
4. **Passage « toutes les villes » / « une ville » (équivalent bouton, handover § 0, règle 7).** Un choix exclusif **hors de la carte**, dans l'**en-tête du panneau** (`Sheet`, sous `DayTabs`), sur Séjour seulement :
   - composant `SegmentedControl` horizontal (Ligne, rendu de 0012), avec une **variante nouvelle `wrap`** : les options gardent leur largeur naturelle (`flex-auto` au lieu de `flex-1`, au moins `--touch-target`), passent sur une **rangée suivante** quand elles ne tiennent pas (`flex-wrap`), et un libellé plus large que la rangée passe à la ligne (`overflow-wrap: anywhere`), jamais tronqué. Sans `wrap`, le composant ne change pas. Exemple à 390 px : « Toutes les villes », « Rome », « Florence » sur une rangée, « Saint-Jacques-de-Compostelle » sur la suivante ;
   - options, dans l'ordre : « Toutes les villes », puis **une option par ville distincte** dans l'ordre de première apparition (« Rome », « Florence » ; Rome, Florence, Rome donne deux options, et « Rome » cadre ses deux séjours) ;
   - **pas de légende visible**, pour que l'en-tête tienne au plus bas du panneau (poignée 44 px, `DayTabs` 52 px, deux rangées d'options 100 px : 196 px sur les 211 px du panneau au plus bas à 844 px de haut). Le rendu du `SegmentedControl` (rail `muted`, option choisie en aplat `line`) le distingue des pastilles de `DayTabs`, et ses libellés sont des noms de villes ; nom accessible du groupe « Afficher sur la carte ». Sur un écran moins haut, au plus bas, la dernière rangée peut sortir du panneau ; relever le panneau la montre (accepté : la hauteur au plus bas est transitoire) ;
   - à chaque affichage de Séjour : « Toutes les villes » choisie, la carte cadre **toutes les villes** (cadrage livré par M4c, prérequis, inchangé). **Assumé** : revenir sur Séjour (depuis une Journée ou une fiche) rechoisit « Toutes les villes » et oublie la ville choisie avant ; la vue est un état d'écran, et l'ouverture sur toutes les villes est le point de départ attendu ;
   - choisir une ville **recadre** la carte sur la boîte englobante de ses positions (logement et étapes), avec la marge de cadrage (`fitPadding`, § 4 pour la marge haute) ; choisir « Toutes les villes » recadre sur toutes. Le choix ne recadre que lorsqu'il **change** : rechoisir l'option déjà choisie ne fait rien (comportement de `SegmentedControl`) ;
   - **après un glissement ou un zoom à la main**, le choix ne suit pas la carte : il dit la dernière vue demandée, pas ce que montre la carte. Choisir une autre option, puis revenir, recadre. Raison : la carte n'est qu'un reflet, et un choix qui changerait seul au geste serait instable ;
   - aucun contrôle n'est ajouté **sur** la carte : « Retour » (haut gauche) et « Partager » (haut droite) restent les seuls.
5. **Pas de lien entre les villes** : aucun tracé sur la carte d'ensemble, aucune durée ni itinéraire Google (0011 ; spécification M4 § 7.4).
6. **La liste reste la source complète** : le jour par jour groupé par ville (spécification M4 § 7.5) ne change pas ; la carte n'en est que le reflet.

### 3. U-M4S-3 : carte de la Journée d'un changement de ville

Ce paragraphe ne vaut que pour la Journée (écran 12) d'un jour dont `day.items` contient un `transfer`. **Les autres journées ne changent pas.**

1. **Deux terminus distincts**, chacun avec son étiquette de ville **sans numéro** (« Rome » à droite du logement quitté, « Florence » à droite du nouveau logement ; même élément qu'au § 4, sans le « {n} · »). Ce jour-là seulement, les terminus ne sont plus masqués : chacun est une **image nommée** (`role="img"`), non interactive :
   - terminus `start` : « Logement quitté, {ville quittée} » (« Logement quitté, Rome ») ;
   - terminus `end` : « Nouveau logement, {ville d'arrivée} » (« Nouveau logement, Florence »).
   - Le nom commence par la proposition de M4-suite § 7.2 et y ajoute la ville, que l'étiquette visible porte déjà.
   - Si les deux terminus avaient la même position (cas non prévu), ils restent fusionnés comme aujourd'hui, masqués et sans étiquette.
2. **Numérotation continue** à travers la ligne « Vers {ville} », dans l'ordre de la ligne du jour (1 et 2 à Rome, puis 3 à Florence) : c'est le comportement actuel de `buildDayRoute`, confirmé et testé. Le `transfer` n'a ni marqueur ni numéro.
3. **Tracé coupé** au `transfer` (livré par M4c, 0148 § 7.2 point 2) : aucun segment entre la dernière étape avant la ligne et la première après.
4. **Deux moitiés.** La moitié « avant » : terminus `start` et étapes positionnées avant le `transfer`. La moitié « après » : étapes positionnées après le `transfer` et terminus `end`.
   - **Cadrage à l'ouverture** de la Journée (et à chaque changement de jour) : la moitié « avant », si elle a au moins une étape positionnée ; sinon la moitié « après », si elle en a une ; sinon (aucune étape positionnée) toute la journée, comme aujourd'hui. Si la Journée s'ouvre avec une étape déjà sélectionnée (fiche ouverte), la moitié de cette étape.
   - Cela suit la recommandation du Product Owner, avec un repli : un départ très matinal sans étape à Rome ouvre sur Florence, où la journée se passe.
   - **Passage d'une moitié à l'autre** : le même choix exclusif qu'au § 2 point 4, dans l'en-tête du panneau, avec deux options « {ville quittée} » et « {ville d'arrivée} » (« Rome », « Florence »), même variante `wrap`, sans légende visible, même nom « Afficher sur la carte ». Choisir une ville recadre sur sa moitié. Le geste reste disponible : on peut faire glisser la carte d'une ville à l'autre.
5. **Sélection.** Toucher une étape de la liste :
   - dans la moitié affichée : recentrage sans changer le zoom, comme aujourd'hui (décision 0015 § 4) ;
   - dans l'autre moitié : le choix exclusif passe à la ville de cette étape, la carte **recadre sur cette moitié**, puis place l'étape au milieu de la zone non couverte par le panneau (même calcul qu'aujourd'hui, au zoom du nouveau cadrage) ;
     - rendu Google : `offsetCenter` lit `map.getZoom()`, qui n'est sûr qu'une fois le cadrage appliqué. Le recentrage attend donc **un** événement `idle` après `fitBounds` (`map.addListener("idle", …)`, retiré aussitôt), puis fait le `panTo` (ou `setCenter` avec `prefers-reduced-motion`) actuel ;
     - carte simulée : caméra de la moitié par `fitCamera`, puis `offsetCamera(étape, visibleInsets, zoom de cette caméra)`, dans le même rendu ;
     - le choix exclusif change sans annonce : le focus reste sur l'étape de la liste, qui porte l'information, et la carte n'en est que le reflet ;
   - après un glissement d'une ville à l'autre, le choix ne suit pas la carte (même règle qu'au § 2 point 4).

### 3 bis. Cadrage sur une seule position

Tout cadrage de cette décision (une ville de Séjour réduite à son logement, une moitié de la Journée, toute la journée) dont la boîte se réduit à **une seule position** centre la carte sur elle au **zoom 15**, au lieu du zoom maximal d'un `fitBounds` sur un point (rendu Google : `setCenter` et `setZoom(15)` ; carte simulée : caméra au zoom 15). Constante `ZOOM_POSITION_SEULE = 15`, `route.ts`. Les cadrages existants d'un jour ordinaire ne changent pas.

### 4. Étiquette de ville : élément nouveau

| Propriété | Valeur (tokens Ligne) |
|---|---|
| Fond | `raised` |
| Contour | 1 px `outline` (décoratif) |
| Coins | `radius-tag` (4 px, « comme un panneau de quai ») |
| Texte | `corps-s` (14 px / 20 px), graisse 700, `ink`, chiffres tabulaires |
| Marges intérieures | `space-1` en haut et en bas, `space-2` à gauche et à droite |
| Position | à droite du terminus par défaut, écart `space-1`, centrée verticalement sur lui, en position absolue dans le même hôte : le terminus garde son ancrage actuel sur la carte. **À gauche** quand elle ne tient pas à droite (règle ci-dessous) |
| Largeur | au plus `--ligne-etiquette-ville-max`, variable nouvelle de `provisoire.css` valant `calc(4 * var(--touch-target))` (176 px) : **choix assumé** de l'UX/UI, sans token Ligne, comme les autres variables de ce fichier ; le nom passe à la ligne (après un trait d'union, sinon `overflow-wrap: anywhere`), jamais tronqué |
| Séparateur | « {n} · {ville} » avec des espaces insécables autour du point médian : le numéro ne se sépare jamais du nom |
| Accessibilité | `aria-hidden` : le nom accessible est porté par le repère (§ 5) |

**Jamais coupée par le bord.** L'étiquette est entière dans la zone de la carte, et jamais sous « Retour » ni « Partager » :
- **côté** : à droite si `x + space-1 + largeur ≤ largeurCarte − space-2` (`x` = bord droit du terminus, en pixels du conteneur ; `largeur` = largeur rendue de l'étiquette) ; sinon à gauche si elle y tient ; sinon du côté qui a le plus de place, avec une largeur maximale réduite à cette place (le nom passe à la ligne). Fonction pure de `route.ts` (par exemple `coteEtiquette(x, largeurTerminus, largeurEtiquette, largeurCarte)`), évaluée par la carte simulée à chaque rendu et par le rendu Google à chaque `idle` (après tout cadrage, glissement ou zoom) ;
- **marge haute du cadrage** : dès qu'une étiquette de ville est dessinée (Séjour à 2 villes ou plus, Journée d'un changement de ville), la marge haute de `fitPadding` passe de `--touch-target` à `2 × --touch-target` (88 px), pour qu'aucune étiquette cadrée ne passe sous « Retour » ou « Partager » (posés à `space-3` du haut, 44 px de haut). Les autres marges ne changent pas, et sans étiquette, `fitPadding` ne change pas ;
- un terminus que la personne a fait sortir de la carte par un geste peut emporter son étiquette avec lui : la règle porte sur les termini visibles.

Contraste : `ink` sur `raised` 17,2:1 (texte posé sur l'étiquette) et `ink` sur `map-land` 15,1:1 (critère de M4-suite § 7.3), tous deux au moins 4,5:1. Le fond `raised` garantit le contraste au-dessus des routes (`map-road`), de l'eau et des parcs. Aucun nouveau token : l'étiquette n'utilise que des tokens existants.

### 5. Noms accessibles et cibles

| Élément | Rôle | Nom |
|---|---|---|
| Repère de ville, Séjour (terminus et étiquette) | `img`, non interactif | « Rome, ville 1 » ; même logement deux fois : « Rome, villes 1 et 3 » |
| Terminus `start`, Journée du changement de ville | `img`, non interactif | « Logement quitté, Rome » |
| Terminus `end`, Journée du changement de ville | `img`, non interactif | « Nouveau logement, Florence » |
| Anneau `overview` | masqué (`aria-hidden`), inchangé | — |
| Marqueur d'étape | bouton, inchangé | « Étape {numéro} : {nom} », numéros continus |
| Choix exclusif de l'en-tête | `radiogroup` (`SegmentedControl wrap`) | « Afficher sur la carte » ; options « Toutes les villes », « Rome », « Florence » |

- Les repères sont dans l'ordre des villes, dans le DOM comme dans l'ordre de création des marqueurs Google.
- **Cibles** : seules les options du choix exclusif sont interactives parmi les éléments nouveaux ; chacune fait au moins 44 × 44 px (`min-h-(--touch-target)` de `SegmentedControl` ; avec `wrap`, largeur au moins `--touch-target` et largeur naturelle du libellé, vérifiées à 390 px avec 4 options dont « Saint-Jacques-de-Compostelle », critère 6).
- Le passage d'une vue à l'autre n'est pas annoncé : le focus reste sur l'option, et la carte est doublée par la liste.

### 6. Textes (français)

| Clé proposée | Texte |
|---|---|
| `carte.etiquetteVille` | « {n} · {ville} » (espaces insécables) |
| `carte.etiquetteVilles` | « {liste} · {ville} », `{liste}` = « 1 et 3 » |
| `carte.repereVille` | « {ville}, ville {n} » |
| `carte.repereVilles` | « {ville}, villes {liste} » |
| `carte.logementQuitte` | « Logement quitté, {ville} » |
| `carte.nouveauLogement` | « Nouveau logement, {ville} » |
| `sejour.carteCadrage.nom` | « Afficher sur la carte » |
| `sejour.carteCadrage.toutes` | « Toutes les villes » |

`{ville}` est toujours le **nom maison** de `Trip.cities`. Aucun mot technique, aucun point d'exclamation, et aucun mot que la spécification M4 réserve aux temps entre étapes (vocabulaire de M4-suite, en-tête).

### 7. Conformité

- Les noms de villes sont des noms maison (`Trip.cities`, lu depuis `stays`, 0148 § 6) : **aucune donnée de lieu Google** n'est ajoutée sur une carte, Google ou simulée. La carte simulée n'affiche toujours que les données simulées du dépôt.
- Les positions restent celles de la relecture existante (`DayMap`), jamais écrites ni mises en cache côté client (handover § 8 ; 0011 ; 0148 § 7.2 point 1). Aucun champ de contrat, aucune donnée stockée, aucun appel nouveau : seules les bibliothèques `maps` et `marker` restent chargées (`MAPS_LIBRARIES`).
- Le choix de la vue (toutes les villes, une ville, une moitié) est un état d'écran, ni dans l'adresse ni dans le stockage du navigateur.
- Rien d'argent, aucun compte, aucun coût.

### 8. Question conditionnelle à Samuel : non déclenchée

L'option (a) répond au besoin 1 sans numéro sur un terminus ni sur un anneau, et le passage entre les vues se fait par un choix exclusif dans le panneau, hors de la carte. Ni l'option (b), ni un contrôle posé sur la carte hors des deux places fixées ne sont nécessaires. `docs/design-system/carte.md` n'est pas modifié. M4-suite-carte n'attend donc aucune réponse de Samuel.

## Critères d'acceptation de M4-suite-carte (critère 19 de M4-suite)

Fixtures : Rome du 2027-05-04 au 2027-05-08, Florence à partir du 2027-05-06 (J3 = jour du changement de ville), sauf mention contraire ; un voyage Paris puis Berlin pour les villes éloignées ; Rome, Florence, Rome pour la répétition ; Édimbourg seul pour une ville. Composition simulée, carte simulée injectée (`CarteProvider`) et rendu Google sur la bibliothèque simulée des tests. Chaque point est vérifié par un test nommé dans la PR.

1. `M4-suite-carte: règles de Ligne inchangées` (minimums de la spécification).
   - `src/components/ligne/StopMarker.test.tsx` passe sans modification ; `StopMarker.tsx` et `docs/design-system/carte.md` ne changent pas.
   - Aucun tracé sur la carte d'ensemble ; le jour J3, aucun tronçon entre la dernière étape avant le `transfer` et la première après.
   - Aucun élément de la carte n'utilise `quai`.
2. `M4-suite-carte: une seule ville inchangée`. Le critère 25 de la spécification M4 est rejoué sans modification ; les tests existants de `DayMap.test.tsx`, `GoogleMapRenderer.test.tsx`, `SimulatedMapRenderer.test.tsx`, `route.test.ts` et `MarkerButton.test.tsx` passent sans modification. Pour Édimbourg seul : aucun choix « Afficher sur la carte », aucun repère de ville, logement en anneau sur Séjour, terminus masqués sur la Journée.
3. `M4-suite-carte: repères par ville`. Séjour, Rome puis Florence :
   - deux `img` nommées, dans l'ordre, « Rome, ville 1 » et « Florence, ville 2 » ; chacune contient un `StopMarker` `data-kind="terminus"` sans texte, et une étiquette `aria-hidden` au texte « 1 · Rome » (resp. « 2 · Florence »), avec des espaces insécables ;
   - aucun anneau à la position d'un logement ;
   - Rome avec deux positions de terminus distinctes (J1 et J2) : une seule `img` « Rome, ville 1 », à la position de J1 ; le terminus de J2 est `aria-hidden`, sans étiquette ni nom ; la liste des `img` reste « Rome, ville 1 », « Florence, ville 2 » ;
   - Rome, Florence, Rome, même logement à Rome : une `img` « Rome, villes 1 et 3 », étiquette « 1 et 3 · Rome » ; logements différents : « Rome, ville 1 » et « Rome, ville 3 ».
4. `M4-suite-carte: étiquette de ville`. Classes de tokens de l'étiquette (`bg-raised`, contour `outline`, `rounded-tag`, `text-corps-s`, graisse 700, `text-ink`) ; `tests/unit/contrast.test.ts` gagne la paire `["ink", "map-land"]` (au moins 4,5:1) et garde `["ink", "raised"]`. À 390 px, l'étiquette « 1 · Saint-Jacques-de-Compostelle » n'est ni tronquée ni plus large que `--ligne-etiquette-ville-max`.
   - Test pur de `coteEtiquette` : droite quand elle tient, gauche sinon, côté le plus large avec largeur réduite quand aucun ne tient.
   - **Visibilité complète** (E2E, 390 × 844, carte simulée) : après le cadrage « Toutes les villes » de Rome puis Florence, de Paris puis Berlin et de Rome, Florence, Venise, après le cadrage de chaque ville, et sur J3 pour chaque moitié, la boîte de chaque étiquette dessinée est entièrement dans celle de la région de la carte et ne recoupe ni celle de « Retour » ni celle de « Partager » ; `scrollWidth ≤ clientWidth` pour chaque étiquette. Rendu Google : même vérification de côté après un `idle` simulé.
   - **Marges** (`map-layout.ts`) : avec étiquettes, `fitPadding` vaut `{ top: 2 × touch-target, right: touch-target, bottom: 0,55 × hauteur, left: touch-target }` en mobile ; sans étiquette (Édimbourg seul, jours ordinaires), il est inchangé.
5. `M4-suite-carte: regroupement`.
   - Test pur : anneaux visibles sur la vue « Toutes les villes » au zoom 10, regroupés au zoom 9.
   - Paris puis Berlin, carte simulée : à l'ouverture, aucun `[data-part='anneau']`, deux repères ; vue « Paris » : un anneau par étape positionnée de Paris, et le repère de Paris.
   - Deux villes à positions de test rapprochées, cadrage au zoom 10 ou plus : anneaux visibles sur « Toutes les villes ».
   - Rendu Google : un zoom simulé de 9 à 10 (événement `zoom_changed` de la bibliothèque simulée) attache les marqueurs d'anneaux (`marker.map` non nul), sans en créer de nouveaux ni recadrer ; de 10 à 9, il les détache.
6. `M4-suite-carte: choix de la vue sur Séjour`.
   - Dans l'en-tête du panneau, un `radiogroup` « Afficher sur la carte », options « Toutes les villes », « Rome », « Florence », dans cet ordre ; « Toutes les villes » est choisie à l'ouverture et la carte cadre toutes les positions.
   - Choisir « Florence » : toutes les positions de Florence sont dans la zone visible de la carte simulée, et aucune de Rome ; rendu Google : `fitBounds` reçoit la boîte des seules positions de Florence. Choisir « Toutes les villes » recadre sur toutes.
   - Rome, Florence, Rome : trois options (« Toutes les villes », « Rome », « Florence ») ; « Rome » cadre les positions des deux séjours.
   - Rechoisir l'option déjà choisie ne recadre pas ; après un glissement, l'option choisie ne change pas.
   - Quitter Séjour pour une Journée puis revenir : « Toutes les villes » est choisie et la carte cadre toutes les villes.
   - `SegmentedControl` (test de composant) : avec `wrap`, conteneur `flex-wrap`, options `flex-auto` d'au moins `--touch-target`, libellé en `overflow-wrap: anywhere` ; sans `wrap`, classes et tests existants inchangés.
   - E2E à 390 × 844, **4 options** (« Toutes les villes », « Rome », « Saint-Jacques-de-Compostelle », « Florence ») : chaque option fait au moins 44 × 44 px et est entièrement dans le panneau ; aucun libellé tronqué (`scrollWidth ≤ clientWidth`) ; aucun débordement horizontal de la page ; panneau au plus bas (0,25), l'en-tête entier (poignée, `DayTabs`, toutes les options) est visible dans la fenêtre.
   - Aucun élément focalisable nouveau dans la région « Carte du séjour » ; ordre de tabulation : lien d'évitement s'il y a lieu, « Retour », « Partager » s'il y a lieu, puis le panneau.
7. `M4-suite-carte: terminus de la Journée du changement de ville`. Journée J3 : deux `img` « Logement quitté, Rome » et « Nouveau logement, Florence », non focalisables, chacune avec son étiquette `aria-hidden` « Rome » (resp. « Florence ») ; marqueurs « Étape 1 », « Étape 2 » à Rome et « Étape 3 » à Florence ; aucun marqueur pour le `transfer`. J2 : terminus masqués, comme aujourd'hui.
8. `M4-suite-carte: cadrage de la Journée du changement de ville`.
   - J3, étapes des deux côtés : à l'ouverture, le choix « Afficher sur la carte » vaut « Rome » ; les positions de la moitié « avant » sont dans la zone visible, le nouveau logement non.
   - Billet à 07:00, aucune étape avant le `transfer` : ouverture sur « Florence ».
   - Aucune étape positionnée : cadrage de toute la journée.
   - Moitié réduite à une position, et ville de Séjour réduite à son logement : centrées sur elle au zoom 15 (§ 3 bis), dans les deux rendus.
   - Choisir « Florence » recadre sur la moitié « après » ; rendu Google : `fitBounds` reçoit la boîte de cette moitié.
9. `M4-suite-carte: sélection dans l'autre moitié`.
   - J3 sur « Rome » : sélectionner l'étape 3 depuis la liste fait passer le choix à « Florence » (`aria-checked`), recadre sur la moitié « après » et place l'étape au milieu de la zone non couverte. Rendu Google : `fitBounds` avec la boîte de la moitié, **aucun** `panTo` avant l'événement `idle` simulé, puis un seul `panTo` vers `offsetCenter(étape, visibleInsets, getZoom())` lu après `idle`. Carte simulée : `data-center-*` égal à `offsetCamera(étape, visibleInsets, zoom de fitCamera(moitié))`.
   - Sélectionner l'étape 2 sur « Rome » : recentrage sans changer le zoom, comme `GoogleMapRenderer.test.tsx` (« … puis recentre sur la sélection sans changer le zoom ») et `SimulatedMapRenderer.test.tsx` l'attendent déjà.
   - Ouvrir J3 avec l'étape 3 déjà sélectionnée : ouverture sur « Florence ».
10. `M4-suite-carte: accessibilité`. Axe sans violation (`pnpm test:a11y` et tests de composants) sur Séjour à deux et à trois villes (« Toutes les villes » et une ville) et sur la Journée J3 (chaque moitié), carte simulée.
11. `M4-suite-carte: conformité`. Avec `Trip.cities` à des noms sentinelles (« [Ville A] », « [Ville B] »), les étiquettes et les noms des repères ne contiennent que ces noms, un numéro et les textes du § 6 ; aucun appel réseau nouveau ; `MAPS_LIBRARIES` vaut toujours `["maps", "marker"]` ; rien n'est écrit dans `localStorage` ni `sessionStorage`. La vue partagée (`SharedShell`) et « Pendant le voyage » ne changent pas (leurs tests passent sans modification).

### Tests existants modifiés (liste fermée)

- **Aucune attente des tests de `main` ne change** : les comportements à une ville et sur les journées ordinaires sont inchangés, et les champs nouveaux sont facultatifs, absents sans plusieurs villes ni `transfer`.
- `tests/unit/contrast.test.ts` : **ajout** de la paire `["ink", "map-land"]`, aucune attente changée.
- `src/components/carte/GoogleMapRenderer.test.tsx` : la bibliothèque simulée (`FakeMap`) gagne `addListener` et un moyen d'émettre `idle` et `zoom_changed` ; aucune attente existante ne change.
- `src/components/ligne/SegmentedControl.test.tsx` et `src/features/sejour/map-layout` : tests **ajoutés** seulement.
- Tests écrits par **M4c** sur le **rendu intermédiaire provisoire** à 2 villes ou plus : les attentes de **forme** (logement dessiné en anneau, anneaux dessinés à l'échelle de toutes les villes, terminus masqués le jour J3) sont remplacées par les critères 3, 5 et 7 ; le cadrage de toutes les villes à l'ouverture et le tracé coupé restent attendus tels quels. M4c n'est pas jugée sur cette forme (spécification M4 § 15). M4-suite-carte nomme chaque test touché dans sa PR, revue par le Tech Lead. Aucun test n'est supprimé ni désactivé.

## Ce que M4-suite-carte implémente, fichier par fichier

Noms de fonctions et de props **indicatifs** : leur forme exacte revient au Tech Lead, sous les comportements ci-dessus.

| Fichier | Changement |
|---|---|
| `src/components/carte/route.ts` | Fonction pure nouvelle des groupes par ville (par exemple `buildCityOverview(days, maps, villesParJour, villes)`) : par ville, son numéro (ou ses numéros), ses positions de logement (dédoublonnées), ses anneaux, la boîte de cadrage. `buildDayRoute` gagne, **seulement si** `day.items` contient un `transfer`, les deux moitiés (positions et moitié de chaque étape) et le rôle des terminus. Constante `ZOOM_ANNEAUX_PAR_VILLE = 10`. `buildOverview` ne change pas. |
| `src/components/carte/types.ts` | `MapView` : en mode `overview`, groupes par ville et vue choisie (toutes ou une ville) facultatifs ; en mode `day`, moitié cadrée et nom et étiquette des terminus facultatifs. La vue choisie entre dans `fitKey` (seul son changement recadre). |
| `src/components/carte/DayMap.tsx` | Props facultatives : villes, ville de chaque jour, vue choisie (Séjour) ; moitié choisie (Journée). Construit la vue ; sans ces props, rendu identique à aujourd'hui. |
| `src/components/carte/CityLabel.tsx` (nouveau, avec son test) | Étiquette de ville du § 4, partagée par les deux rendus ; `aria-hidden`. |
| `src/components/carte/GoogleMapRenderer.tsx` | Repères de ville : un marqueur avancé par logement (terminus et étiquette dans le même hôte, `role="img"` nommé pour le premier, `aria-hidden` pour les positions supplémentaires), créés dans l'ordre des villes. Anneaux attachés ou détachés par `marker.map` au passage du zoom 10 (`map.addListener("zoom_changed")`), sans reconstruction ni recadrage. Côté des étiquettes recalculé à chaque `idle`. Terminus nommés le jour J3. Cadrage d'une ville ou d'une moitié par `fitBounds` ; une position : `setCenter` et `setZoom(15)`. Sélection dans l'autre moitié : `fitBounds`, puis recentrage actuel après un `idle`. |
| `src/components/carte/GoogleMapRenderer.test.tsx` | `FakeMap` : `addListener`, émission de `idle` et `zoom_changed` ; tests nouveaux. |
| `src/components/carte/SimulatedMapRenderer.tsx` et `simulated-model.ts` | Mêmes repères, étiquettes (côté par `coteEtiquette` à chaque rendu), noms et règles d'anneaux (zoom de la caméra) ; cadrage sur une position au zoom 15 ; sélection dans l'autre moitié par `fitCamera` puis `offsetCamera`. |
| `src/components/carte/index.ts` | Exports nouveaux (`CityLabel`, fonction des groupes par ville). |
| `src/features/sejour/TripShell.tsx` | Ville de chaque jour par `villesDeLaDate` (`src/domain/villes-du-voyage.ts`, livré par M4b, prérequis, 0148 § 6 point 3), passée à `DayMap`. État de la vue (Séjour : « Toutes les villes » à chaque affichage ; Journée : moitié initiale du § 3 point 4, remise à chaque changement de jour, suivie par la sélection). Choix exclusif `SegmentedControl wrap` dans l'en-tête du `Sheet`, sous `DayTabs`, seulement à 2 villes ou plus (Séjour) ou le jour d'un `transfer` (Journée). L'en-tête du panneau est donc plus haut sur ces écrans. |
| `src/features/sejour/map-layout.ts` (et un test) | `layoutFitPadding` reçoit l'indication « étiquettes de ville dessinées » : marge haute `2 × --touch-target` dans ce cas, inchangée sinon (§ 4). `layoutVisibleInsets` ne change pas : le panneau couvre toujours `snap × hauteur`, en-tête compris. `SharedShell` n'est pas concerné. |
| `src/components/ligne/SegmentedControl.tsx` et son test | Prop facultative `wrap` (horizontal seulement) : `flex-wrap`, options `flex-auto` d'au moins `--touch-target`, libellé en `overflow-wrap: anywhere`. Sans elle, rendu identique. |
| `src/components/ligne/provisoire.css` | Variable `--ligne-etiquette-ville-max: calc(4 * var(--touch-target))`. |
| `src/i18n/fr/carte.json` | Clés `carte.*` du § 6. |
| `src/i18n/fr/sejour.json` | Clés `sejour.carteCadrage.*` du § 6 (à fusionner après M4-suite-front, M4-suite § 13). |
| `tests/unit/contrast.test.ts` | Paire `["ink", "map-land"]`. |
| Tests | Tests nouveaux du critère 19 dans `route.test.ts`, `DayMap.test.tsx`, `GoogleMapRenderer.test.tsx`, `SimulatedMapRenderer.test.tsx`, `CityLabel.test.tsx`, `TripShell` ou `screen-sejour`, et `tests/e2e/` (390 px, a11y). |
| `src/app/dev/carte/CarteDemo.tsx` | Facultatif : un exemple à deux villes, pour les captures 390 × 844 (décision 0004). |

**Ne changent pas** : `src/components/ligne/StopMarker.tsx` et son test, `MarkerButton.tsx`, `Sheet.tsx`, `docs/design-system/carte.md`, les contrats, `SharedShell`, « Pendant le voyage ».

## Rendu intermédiaire de M4c et échéance

Jusqu'à la fusion de M4-suite-carte, le **rendu intermédiaire provisoire** de M4c reste en place (spécification M4 § 7.4 et § 15) : carte d'ensemble cadrée sur toutes les villes, anneaux sans repère par ville, `StopMarker.test.tsx` inchangé. **Défaut connu**, à noter dans la note de version de M4c : pour deux villes éloignées, les anneaux de chaque ville se superposent à l'échelle de toutes les villes. M4c n'est pas jugée sur cette forme.

Échéance (M4-suite § 7 et § 12) : cette décision est fusionnée **au plus tard au cycle de M4c** ; M4-suite-carte suit, au cycle suivant (après M4c et M4-suite-front, pour `sejour.json`).

## Hors décision

- Toute modification de `docs/design-system/carte.md` ou de `StopMarker` : hors délégation, non demandée (§ 8).
- Un repère de ville interactif (toucher pour cadrer) : écarté, pour ne poser aucun contrôle sur la carte.
- Les étiquettes qui se chevauchent pour deux villes très proches : acceptées, les anneaux et la liste levant l'ambiguïté.
- La vue partagée, « Pendant le voyage », « Mes voyages » : inchangés (spécification M4 § 7.8).

## Conséquences

- U-M4S-1, U-M4S-2 et U-M4S-3 sont tranchées ; M4-suite-carte peut partir après M4c, sans attendre Samuel.
- Faisabilité à confirmer par le Tech Lead en revue : écoute de `zoom_changed` et `idle` dans `GoogleMapRenderer` et dans sa bibliothèque simulée de test, mesure de la largeur rendue des étiquettes pour `coteEtiquette`, marge haute de `src/features/sejour/map-layout.ts`, dépendance de `TripShell` à `villesDeLaDate` (M4b, prérequis).
- Captures 390 × 844 de Séjour (deux et trois villes, chaque vue) et de la Journée J3 (chaque moitié) dans la PR de M4-suite-carte.
