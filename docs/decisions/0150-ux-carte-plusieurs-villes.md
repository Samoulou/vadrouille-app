# 0150 — Carte à plusieurs villes : étiquette de ville numérotée, repères et regroupement, moitiés de la Journée du changement de ville

Statut : **acceptée** · Date : 2026-10-30 · Décideur : UX/UI (écrans non maquettés, dans les règles de Ligne, « Qui décide quoi » de `docs/CONTEXT.md`) · Ticket : #927 · Définitive à sa fusion (0093). À lister dans la prochaine note de version (« Décisions prises par le studio », UX/UI). Revue : Tech Lead (faisabilité de `route.ts`, `DayMap.tsx` et des deux rendus), Product Owner.

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
   - Position : les positions de terminus des jours de cette ville, dans l'ordre des jours (positions de la relecture existante, jamais écrites). Le jour d'un changement de ville, le terminus `start` appartient à la ville quittée et `end` à la ville d'arrivée. Plusieurs positions distinctes pour une même ville : un terminus par position, l'étiquette sur la première.
   - **Même ville deux fois, non consécutives** (Rome, Florence, Rome ; la répétition consécutive est refusée, 0148 § 4 point 2) : si les deux séjours ont la même position de logement, **une seule étiquette** « 1 et 3 · Rome » ; sinon deux repères, « 1 · Rome » et « 3 · Rome ».
   - Le repère n'est **pas interactif** (§ 5) : il n'est ni bouton ni lien, et n'est pas un contrôle posé sur la carte.
2. **Groupes par ville.** Les étapes d'une ville sont ses anneaux `overview` (12 px, sans numéro, inchangés), autour de son repère. Une étape appartient à la ville du jour, et le jour d'un changement de ville, à la ville quittée si elle est avant le `transfer` dans `day.items`, à la ville d'arrivée sinon (même règle que la ville de vérification, 0148 § 6 point 3). Le groupe se lit par la **position** et par l'étiquette, **jamais par la couleur** : tous les anneaux restent `line` (handover § 11). Aucun `quai` (handover § 0, règle 6).
3. **Regroupement et zoom minimal.** Le « zoom minimal » de la spécification est ici le **seuil d'affichage des anneaux** : sur la vue « Toutes les villes », les anneaux d'une ville ne sont dessinés qu'à partir du **zoom 10** (constante `ZOOM_ANNEAUX_PAR_VILLE = 10`, `route.ts`). En dessous, ils sont **regroupés dans le repère de la ville** : seuls les repères sont dessinés.
   - À titre d'ordre de grandeur, au zoom 10 et à 42° de latitude, 5 km font environ 44 px : en dessous, les anneaux d'une ville se confondent. Paris puis Berlin (≈ 900 km) ou Rome puis Florence (≈ 230 km) s'ouvrent donc en repères seuls ; deux villes voisines peuvent s'ouvrir avec leurs anneaux.
   - Le seuil suit le **zoom courant** : rendu Google, au geste de zoom (pincer) ; carte simulée, le zoom de sa caméra (elle n'a pas de geste de zoom).
   - Sur la vue d'une ville (point 4), les anneaux de **cette ville** sont toujours dessinés, quel que soit le zoom.
4. **Passage « toutes les villes » / « une ville » (équivalent bouton, handover § 0, règle 7).** Un choix exclusif **hors de la carte**, dans l'**en-tête du panneau** (`Sheet`, sous `DayTabs`), sur Séjour seulement :
   - composant `SegmentedControl` horizontal existant (Ligne, rendu de 0012), sans modification ;
   - options, dans l'ordre : « Toutes les villes », puis **une option par ville distincte** dans l'ordre de première apparition (« Rome », « Florence » ; Rome, Florence, Rome donne deux options, et « Rome » cadre ses deux séjours) ;
   - à gauche du groupe, la légende visible « Carte » (`legende`, `ink-soft`, `aria-hidden`) ; nom accessible du groupe « Afficher sur la carte » ;
   - à chaque affichage de Séjour : « Toutes les villes » choisie, la carte cadre **toutes les villes** (rendu déjà livré par M4c, inchangé) ;
   - choisir une ville **recadre** la carte sur la boîte englobante de ses positions (logement et étapes), avec la marge de cadrage actuelle (`fitPadding`) ; choisir « Toutes les villes » recadre sur toutes ;
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
   - Une moitié réduite à **une seule position** est centrée sur elle au **zoom 15** (au lieu du zoom maximal d'un cadrage sur un point).
   - **Passage d'une moitié à l'autre** : le même choix exclusif qu'au § 2 point 4, dans l'en-tête du panneau, avec deux options « {ville quittée} » et « {ville d'arrivée} » (« Rome », « Florence »), même légende « Carte », même nom « Afficher sur la carte ». Choisir une ville recadre sur sa moitié. Le geste reste disponible : on peut faire glisser la carte d'une ville à l'autre.
5. **Sélection.** Toucher une étape de la liste :
   - dans la moitié affichée : recentrage sans changer le zoom, comme aujourd'hui (décision 0015 § 4) ;
   - dans l'autre moitié : le choix exclusif passe à la ville de cette étape, la carte **recadre sur cette moitié**, puis place l'étape au milieu de la zone non couverte par le panneau (même calcul qu'aujourd'hui, au zoom du nouveau cadrage).

### 4. Étiquette de ville : élément nouveau

| Propriété | Valeur (tokens Ligne) |
|---|---|
| Fond | `raised` |
| Contour | 1 px `outline` (décoratif) |
| Coins | `radius-tag` (4 px, « comme un panneau de quai ») |
| Texte | `corps-s` (14 px / 20 px), graisse 700, `ink`, chiffres tabulaires |
| Marges intérieures | `space-1` en haut et en bas, `space-2` à gauche et à droite |
| Position | à droite du terminus, écart `space-1`, centrée verticalement sur lui, en position absolue dans le même hôte : le terminus garde son ancrage actuel sur la carte |
| Largeur | au plus `4 × --touch-target` (176 px) ; le nom passe à la ligne (après un trait d'union, sinon `overflow-wrap: anywhere`), jamais tronqué |
| Séparateur | « {n} · {ville} » avec des espaces insécables autour du point médian : le numéro ne se sépare jamais du nom |
| Accessibilité | `aria-hidden` : le nom accessible est porté par le repère (§ 5) |

Contraste : `ink` sur `raised` 17,2:1 (texte posé sur l'étiquette) et `ink` sur `map-land` 15,1:1 (critère de M4-suite § 7.3), tous deux au moins 4,5:1. Le fond `raised` garantit le contraste au-dessus des routes (`map-road`), de l'eau et des parcs. Aucun nouveau token : l'étiquette n'utilise que des tokens existants.

### 5. Noms accessibles et cibles

| Élément | Rôle | Nom |
|---|---|---|
| Repère de ville, Séjour (terminus et étiquette) | `img`, non interactif | « Rome, ville 1 » ; même logement deux fois : « Rome, villes 1 et 3 » |
| Terminus `start`, Journée du changement de ville | `img`, non interactif | « Logement quitté, Rome » |
| Terminus `end`, Journée du changement de ville | `img`, non interactif | « Nouveau logement, Florence » |
| Anneau `overview` | masqué (`aria-hidden`), inchangé | — |
| Marqueur d'étape | bouton, inchangé | « Étape {numéro} : {nom} », numéros continus |
| Choix exclusif de l'en-tête | `radiogroup` (`SegmentedControl`) | « Afficher sur la carte » ; options « Toutes les villes », « Rome », « Florence » |

- Les repères sont dans l'ordre des villes, dans le DOM comme dans l'ordre de création des marqueurs Google.
- **Cibles** : seules les options du choix exclusif sont interactives parmi les éléments nouveaux ; chacune fait au moins 44 × 44 px (`min-h-(--touch-target)` de `SegmentedControl`, largeur au moins 44 px à 390 px avec 3 villes et « Saint-Jacques-de-Compostelle »).
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
| `sejour.carteCadrage.legende` | « Carte » |
| `sejour.carteCadrage.toutes` | « Toutes les villes » |

`{ville}` est toujours le **nom maison** de `Trip.cities`. Aucun mot technique, aucun point d'exclamation, et le mot « trajet » n'apparaît pas.

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
   - Rome, Florence, Rome, même logement à Rome : une `img` « Rome, villes 1 et 3 », étiquette « 1 et 3 · Rome » ; logements différents : « Rome, ville 1 » et « Rome, ville 3 ».
4. `M4-suite-carte: étiquette de ville`. Classes de tokens de l'étiquette (`bg-raised`, contour `outline`, `rounded-tag`, `text-corps-s`, graisse 700, `text-ink`) ; `tests/unit/contrast.test.ts` gagne la paire `["ink", "map-land"]` (au moins 4,5:1) et garde `["ink", "raised"]`. À 390 px, l'étiquette « 1 · Saint-Jacques-de-Compostelle » n'est ni tronquée ni plus large que `4 × --touch-target`.
5. `M4-suite-carte: regroupement`.
   - Test pur : anneaux visibles sur la vue « Toutes les villes » au zoom 10, regroupés au zoom 9.
   - Paris puis Berlin, carte simulée : à l'ouverture, aucun `[data-part='anneau']`, deux repères ; vue « Paris » : un anneau par étape positionnée de Paris, et le repère de Paris.
   - Deux villes à positions de test rapprochées, cadrage au zoom 10 ou plus : anneaux visibles sur « Toutes les villes ».
   - Rendu Google : un zoom simulé de 9 à 10 (événement de zoom de la bibliothèque simulée) fait apparaître les anneaux, sans recadrer.
6. `M4-suite-carte: choix de la vue sur Séjour`.
   - Dans l'en-tête du panneau, un `radiogroup` « Afficher sur la carte », options « Toutes les villes », « Rome », « Florence », dans cet ordre ; « Toutes les villes » est choisie à l'ouverture et la carte cadre toutes les positions.
   - Choisir « Florence » : toutes les positions de Florence sont dans la zone visible de la carte simulée, et aucune de Rome ; rendu Google : `fitBounds` reçoit la boîte des seules positions de Florence. Choisir « Toutes les villes » recadre sur toutes.
   - Rome, Florence, Rome : trois options (« Toutes les villes », « Rome », « Florence ») ; « Rome » cadre les positions des deux séjours.
   - E2E à 390 px, 3 villes dont « Saint-Jacques-de-Compostelle » : chaque option fait au moins 44 × 44 px ; aucun débordement horizontal de la page ; aucun texte tronqué.
   - Aucun élément focalisable nouveau dans la région « Carte du séjour » ; ordre de tabulation : lien d'évitement s'il y a lieu, « Retour », « Partager » s'il y a lieu, puis le panneau.
7. `M4-suite-carte: terminus de la Journée du changement de ville`. Journée J3 : deux `img` « Logement quitté, Rome » et « Nouveau logement, Florence », non focalisables, chacune avec son étiquette `aria-hidden` « Rome » (resp. « Florence ») ; marqueurs « Étape 1 », « Étape 2 » à Rome et « Étape 3 » à Florence ; aucun marqueur pour le `transfer`. J2 : terminus masqués, comme aujourd'hui.
8. `M4-suite-carte: cadrage de la Journée du changement de ville`.
   - J3, étapes des deux côtés : à l'ouverture, le choix « Afficher sur la carte » vaut « Rome » ; les positions de la moitié « avant » sont dans la zone visible, le nouveau logement non.
   - Billet à 07:00, aucune étape avant le `transfer` : ouverture sur « Florence ».
   - Aucune étape positionnée : cadrage de toute la journée.
   - Moitié réduite à une position : centrée sur elle au zoom 15.
   - Choisir « Florence » recadre sur la moitié « après » ; rendu Google : `fitBounds` reçoit la boîte de cette moitié.
9. `M4-suite-carte: sélection dans l'autre moitié`.
   - J3 sur « Rome » : sélectionner l'étape 3 depuis la liste fait passer le choix à « Florence » (`aria-checked`), recadre sur la moitié « après » et place l'étape au milieu de la zone non couverte (rendu Google : `fitBounds` puis un seul `panTo` ; carte simulée : centre attendu au zoom du nouveau cadrage).
   - Sélectionner l'étape 2 sur « Rome » : recentrage sans changer le zoom, comme `GoogleMapRenderer.test.tsx` (« … puis recentre sur la sélection sans changer le zoom ») et `SimulatedMapRenderer.test.tsx` l'attendent déjà.
   - Ouvrir J3 avec l'étape 3 déjà sélectionnée : ouverture sur « Florence ».
10. `M4-suite-carte: accessibilité`. Axe sans violation (`pnpm test:a11y` et tests de composants) sur Séjour à deux et à trois villes (« Toutes les villes » et une ville) et sur la Journée J3 (chaque moitié), carte simulée.
11. `M4-suite-carte: conformité`. Avec `Trip.cities` à des noms sentinelles (« [Ville A] », « [Ville B] »), les étiquettes et les noms des repères ne contiennent que ces noms, un numéro et les textes du § 6 ; aucun appel réseau nouveau ; `MAPS_LIBRARIES` vaut toujours `["maps", "marker"]` ; rien n'est écrit dans `localStorage` ni `sessionStorage`. La vue partagée (`SharedShell`) et « Pendant le voyage » ne changent pas (leurs tests passent sans modification).

### Tests existants modifiés (liste fermée)

- **Aucune attente des tests de `main` ne change** : les comportements à une ville et sur les journées ordinaires sont inchangés, et les champs nouveaux sont facultatifs, absents sans plusieurs villes ni `transfer`.
- `tests/unit/contrast.test.ts` : **ajout** de la paire `["ink", "map-land"]`, aucune attente changée.
- Tests écrits par **M4c** sur le **rendu intermédiaire provisoire** à 2 villes ou plus : les attentes de **forme** (logement dessiné en anneau, anneaux dessinés à l'échelle de toutes les villes, terminus masqués le jour J3) sont remplacées par les critères 3, 5 et 7 ; le cadrage de toutes les villes à l'ouverture et le tracé coupé restent attendus tels quels. M4c n'est pas jugée sur cette forme (spécification M4 § 15). M4-suite-carte nomme chaque test touché dans sa PR, revue par le Tech Lead. Aucun test n'est supprimé ni désactivé.

## Ce que M4-suite-carte implémente, fichier par fichier

Noms de fonctions et de props **indicatifs** : leur forme exacte revient au Tech Lead, sous les comportements ci-dessus.

| Fichier | Changement |
|---|---|
| `src/components/carte/route.ts` | Fonction pure nouvelle des groupes par ville (par exemple `buildCityOverview(days, maps, villesParJour, villes)`) : par ville, son numéro (ou ses numéros), ses positions de logement (dédoublonnées), ses anneaux, la boîte de cadrage. `buildDayRoute` gagne, **seulement si** `day.items` contient un `transfer`, les deux moitiés (positions et moitié de chaque étape) et le rôle des terminus. Constante `ZOOM_ANNEAUX_PAR_VILLE = 10`. `buildOverview` ne change pas. |
| `src/components/carte/types.ts` | `MapView` : en mode `overview`, groupes par ville et vue choisie (toutes ou une ville) facultatifs ; en mode `day`, moitié cadrée et nom et étiquette des terminus facultatifs. La vue choisie entre dans `fitKey` (seul son changement recadre). |
| `src/components/carte/DayMap.tsx` | Props facultatives : villes, ville de chaque jour, vue choisie (Séjour) ; moitié choisie (Journée). Construit la vue ; sans ces props, rendu identique à aujourd'hui. |
| `src/components/carte/CityLabel.tsx` (nouveau, avec son test) | Étiquette de ville du § 4, partagée par les deux rendus ; `aria-hidden`. |
| `src/components/carte/GoogleMapRenderer.tsx` | Repères de ville : un marqueur avancé par logement (terminus et étiquette dans le même hôte, `role="img"` nommé), créés dans l'ordre des villes. Anneaux selon le zoom courant (écoute du changement de zoom de la carte, sans recadrer). Terminus nommés le jour J3. Cadrage d'une ville ou d'une moitié par `fitBounds` ; moitié à une position : centre et zoom 15. Sélection dans l'autre moitié : recadrage puis le recentrage actuel. |
| `src/components/carte/SimulatedMapRenderer.tsx` et `simulated-model.ts` | Mêmes repères, étiquettes, noms et règles d'anneaux (zoom de la caméra) ; cadrage d'une moitié à une position au zoom 15. |
| `src/components/carte/index.ts` | Exports nouveaux (`CityLabel`, fonction des groupes par ville). |
| `src/features/sejour/TripShell.tsx` | Ville de chaque jour par `villesDeLaDate` (`src/domain/villes-du-voyage.ts`, livré par M4b, 0148 § 6 point 3), passée à `DayMap`. État de la vue (Séjour : « Toutes les villes » à chaque affichage ; Journée : moitié initiale du § 3 point 4, remise à chaque changement de jour, suivie par la sélection). Choix exclusif `SegmentedControl` dans l'en-tête du `Sheet`, sous `DayTabs`, seulement à 2 villes ou plus (Séjour) ou le jour d'un `transfer` (Journée). |
| `src/i18n/fr/carte.json` | Clés `carte.*` du § 6. |
| `src/i18n/fr/sejour.json` | Clés `sejour.carteCadrage.*` du § 6 (à fusionner après M4-suite-front, M4-suite § 13). |
| `tests/unit/contrast.test.ts` | Paire `["ink", "map-land"]`. |
| Tests | Tests nouveaux du critère 19 dans `route.test.ts`, `DayMap.test.tsx`, `GoogleMapRenderer.test.tsx`, `SimulatedMapRenderer.test.tsx`, `CityLabel.test.tsx`, `TripShell` ou `screen-sejour`, et `tests/e2e/` (390 px, a11y). |
| `src/app/dev/carte/CarteDemo.tsx` | Facultatif : un exemple à deux villes, pour les captures 390 × 844 (décision 0004). |

**Ne changent pas** : `src/components/ligne/StopMarker.tsx` et son test, `MarkerButton.tsx`, `SegmentedControl.tsx`, `Sheet.tsx`, `docs/design-system/carte.md`, les contrats, `SharedShell`, « Pendant le voyage ».

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
- Faisabilité à confirmer par le Tech Lead en revue : écoute du zoom dans `GoogleMapRenderer` et sa bibliothèque simulée de test, hauteur de l'en-tête du panneau avec le choix exclusif (`map-layout.ts`, marges de cadrage), dépendance de `TripShell` à `villesDeLaDate` (M4b).
- Captures 390 × 844 de Séjour (deux et trois villes, chaque vue) et de la Journée J3 (chaque moitié) dans la PR de M4-suite-carte.
