# 0014 — Rendus et textes non maquettés de la présentation (F6)

Statut : décision déléguée, définitive sans veto de Samuel sous 2 jours (avant le 2026-10-11) ; à lister dans la note de version suivante, rubrique « Décisions prises par le studio » · Date : 2026-10-09 · Décideur : UX/UI (écrans non maquettés, dans les règles de Ligne ; délégation « Qui décide quoi » de `docs/CONTEXT.md`) · Ticket #42, PR #44

## Contexte
`docs/ux/maquettes/` est vide (Q12) : la seule référence visuelle de F6 est `docs/design-system/components/DeckCard/` (README et `preview.html`, carte activité « Proposition 4 sur 8 »). Tout le reste de la présentation n'est pas maquetté. La revue de la PR #44 demande que ces formes soient consignées. Les questions déléguées à UX/UI sont F6-Q1 (Q54, complétée par Q68 et Q69) et F6-Q2 (Q55), plus le texte visible de `DeckProgress`, soulevé par la revue.

Cette décision tranche d'après le code livré sur `claude/42-f6-presentation` (head ba73950) et les captures de `docs/ux/captures/F6/`. Elle ne modifie ni le design system Ligne, ni les maquettes, ni le handover. Les valeurs qui supposeraient un nouveau token restent dans `provisoire.css` ; créer ces tokens est une modification de Ligne, donc réservée à Samuel (Q37).

Rien ici n'engage d'argent, de compte externe ni de donnée personnelle.

Gravité des changements imposés : 3 majeur, 2 mineur, 1 cosmétique.

## Décisions

### 1. Toast d'annulation (`UndoToast`) — F6-Q1, Q68

#### 1.1 Place : sous « Tout garder pour le jour {n} »
- **Décision.** Le rendu livré est retenu. Sur l'écran de présentation, la région `role="status"` du toast suit « Tout garder pour le jour {n} », dans le flux. En fin de paquet, elle est en bas de l'écran, sous le titre et les boutons de fin. Elle réserve la hauteur d'une cible tactile (44 px). Le rendu provisoire de F6-Q1, au-dessus des boutons, est abandonné.
- **Raisons.**
  - Au-dessus des boutons, le toast recouvrait la justification et le tag de la carte. C'est l'information qui sert à décider, et l'incertitude doit rester visible (principe produit 2).
  - Sous les commandes, il reste près des boutons qui l'ont déclenché, dans la zone du pouce.
  - L'ordre visuel suit l'ordre de tabulation : boutons, puis « Tout garder », puis « Annuler » (F6-PO-5, handover § 11).
  - La place réservée évite que la carte ou le titre de fin bougent quand le toast apparaît.
- **Condition à garder.** En 390 × 844, le toast et toutes les commandes restent visibles sans défilement. Si la place manque, la photo se réduit (§ 2.2). Le test e2e « commandes visibles » couvre ce point.
- **Conséquence.** Aucun changement de code.

#### 1.2 Contour de focus de « Annuler » sur l'aplat `ink` : non conforme, correctif imposé
- **Constat.** Le focus de « Annuler » utilise le contour standard : 2 px `line`, décalé de 2 px. Sur l'aplat `ink` du toast, `line` (#2a55d4) contre `ink` (#0e1b30) donne **2,75:1**. WCAG 2.2 AA demande au moins 3:1 (critère 1.4.11, contraste du non-texte, appliqué à l'indicateur de focus). Le handover § 11 et Ligne posent la même exigence (« contours de contrôle ≥ 3:1 »). Le contour ne passe que là où il dépasse sur `page`. Il est sous le seuil partout où il borde l'aplat.
- **Décision.** Le contour standard est conservé, parce que la règle de Ligne (§ 4.2) n'est pas modifiée. On y ajoute un changement d'état du bouton lui-même : au focus clavier (`:focus-visible`), « Annuler » prend un **aplat `page` et un texte `ink`**, avec le même soulignement en 700.
  - L'indicateur de focus est alors le bouton entier en `page` sur l'aplat `ink`, soit 16,9:1, bien au-delà de 3:1.
  - Le contour `line` reste autour : 6,2:1 contre l'aplat `page` du bouton.
  - Seuls des tokens existants sont utilisés. On retrouve aussi l'anneau décrit par Ligne (« 2 px d'écart en `page`, puis 2 px en `line` »).
- **Conséquence : changement de code, gravité 3 (accessibilité, critère WCAG AA).**
  - Dans `src/components/ligne/UndoToast.tsx`, le bouton « Annuler » reçoit `focus-visible:bg-page focus-visible:text-ink`. On ne touche pas au contour global de `src/styles/globals.css`.
  - Ajouter un test, unitaire ou a11y, qui vérifie l'aplat `page` au focus clavier.
  - Les captures ne changent pas, puisqu'elles sont prises sans focus.

#### 1.3 Aplat et messages
- **Décision.** Les rendus provisoires de F6-Q1 et F6-PO-6 sont retenus :
  - aplat `ink`, coins `radius-control`, texte `page` en `corps-s` ;
  - « Annuler » souligné en 700 (contraste 16,9:1) ;
  - messages « {name} écarté. », « {name} gardé. », « {name} choisi. », « Jour {n} gardé. » ;
  - annonce « {nombre} propositions retirées » ou « 1 proposition retirée ».

  Ce sont la forme et le vocabulaire du handover § 5 (« [X] écarté. Annuler »). Il n'y a pas de jaune `quai`, parce qu'annuler est une possibilité, pas une action requise.
- **Conséquence.** Aucun changement de code.

### 2. Carte (`DeckCard`) — F6-Q1

#### 2.1 Étiquette pendant le glisser
- **Décision.** Le rendu livré est retenu : étiquette décorative (`aria-hidden`) en haut de la carte, du côté opposé au sens du glisser, pour qu'elle reste visible pendant que la carte part.
  - Vers la droite : « J'aime », contour 2 px et texte `line`, en haut à gauche.
  - Vers la gauche : « Pas pour moi », contour 2 px et texte `ink`, en haut à droite.
  - Fond `raised`, `corps` en 800, coins `radius-control`, sans rotation propre.
  - Pour un repas : « Je choisis » et « Option suivante », ou « Pas pour moi » sur la dernière option.
- **Raisons.** `line` marque l'action principale et `ink` l'autre, comme les deux boutons ronds du `preview.html`. Pas d'icône seule, pas de couleur seule. L'information est portée par les boutons et l'annonce (WCAG 2.5.7).
- **Conséquence.** Aucun changement de code.

#### 2.2 Photo réduite, « option {index} sur {total} », « Tout garder »
- **Décision.**
  - La photo fait 220 px. Elle peut se réduire jusqu'à 72 px pour que progression, carte, boutons, « Tout garder » et toast tiennent sans défilement.
  - « option {index} sur {total} » est aligné à droite sur la ligne du moment, en `corps-s` `ink-soft`, chiffres tabulaires.
  - « Tout garder pour le jour {n} » est un `Button` `text` `sm`, centré sous les boutons ronds.
- **Raison.** Les commandes doivent toujours être visibles (handover § 6, écran 6) et c'est la photo qui a le moins de valeur pour décider : elle n'est qu'un bloc « Photo du lieu » (Q6).
- **Conséquence.** Aucun changement de code.

#### 2.3 Libellé « Pas pour moi » sur la dernière option d'un repas
- **Décision.** Le libellé « Pas pour moi » (F6-PO-7) est retenu.
- **Raisons.** Sur la dernière option, il n'y a plus d'« Option suivante ». L'action refuse la proposition, et le vocabulaire fixe (handover § 10, `redaction.md`) donne un seul nom à ce refus. L'icône (croix) et la place à gauche ne changent pas.
- **Conséquence.** Aucun changement de code.

#### 2.4 Ligne de trajet — Q69
- **Décision.** Le format livré est retenu : « {mode}, {durée} », ou « {mode}, environ {durée} (estimation) » si `estimated`, en `corps-s` 600, suivi du texte `detour` sur la ligne suivante. Exemple : « Bus, environ 50 min (estimation) ». F6 réutilise `segmentLabel` et les clés `ligne.segment.*` de F3. L'exemple de la spécification, « À 50 min en bus (estimation) », est écarté.
- **Raisons.** Un même trajet doit se lire de la même façon dans la présentation et dans la ligne du jour (vocabulaire fixe). Ce format couvre le critère du handover (§ 6, écran 6) : temps de trajet, puis justification du détour.
- **À suivre.** Le libellé du mode (« Bus » ou « Transports publics ») et la règle « environ / (estimation) » relèvent de Q37, réservée à Samuel. Quand elle sera tranchée, F3 changera ses clés et F6 suivra sans modification.
- **Conséquence.** Aucun changement de code.

#### 2.5 Mesures sans token — F6-Q2, Q55
- **Décision.** Les valeurs du `preview.html` de DeckCard sont les mesures de référence et sont retenues : nom 22/28 en 800 à −0,01 em, photo 220 px, boutons ronds 68 px, écart 56 px, pastille du jour 24 px de haut (au moins 30 px de large) aux coins de 6 px, arrêts de progression 12 px à anneau de 3 px, icônes 26 px et 30 px. Elles **restent provisoirement dans `src/components/ligne/provisoire.css`**, chacune avec sa question, comme aujourd'hui. UX/UI ne crée aucun token : ce serait modifier Ligne, ce qui relève de Samuel.
- **Proposition transmise à Samuel avec Q37, pour la source du design system** :
  - un style de texte `nom-carte` (22/28, 800, −0,01 em) ;
  - `deck-photo` (220) et `deck-action` (68) ;
  - l'écart de 56 px sur l'échelle de 4 px.
  
  Les doublons actuels de `provisoire.css` seraient alors regroupés :
  - 6 px (`--ligne-deck-pastille-rayon` et `--ligne-rayon-mini`) ;
  - 12 px (`--ligne-deck-arret` et `--ligne-stop-ensemble`) ;
  - 3 px (`--ligne-deck-anneau` et `--ligne-anneau-carte`).
  
  Si Samuel crée ces tokens, une tâche front les substituera.
- **Rendus F6-Q1 dans `provisoire.css`, retenus** : photo réduite à 72 px au minimum, voile des feuilles en `ink` à 40 % (en attendant Q10), hauteur maximale des feuilles à 92 % de la fenêtre.
- **Conséquence.** Aucun changement de code. F6-Q2 n'empêche plus la validation visuelle de F6. Le retrait de ces valeurs de `provisoire.css` attend Q37.

### 3. Progression (`DeckProgress`) : texte visible « {current} sur {total} »
- **Arbitrage.** Le handover § 5 (Samuel) exige « Texte "4 sur 8" lisible ». F6-PO-16 et le `preview.html` n'affichent rien. F6-PO-16 classe ce point comme rendu provisoire relevant d'UX/UI : il s'agit donc d'un rendu, pas d'un point fonctionnel, et il n'est pas renvoyé au Product Owner.
- **Décision.** Un texte visible est ajouté : **« {current} sur {total} »** (exemple : « 4 sur 8 »).
  - Style : `legende` (13/18), `ink-soft`, chiffres tabulaires.
  - Place : sous la ligne des arrêts, aligné à gauche, **dans la hauteur actuelle de la rangée** (44 px, imposée par la cible de « Passer ») : 12 px d'arrêts plus 18 px de texte tiennent sans agrandir la rangée.
  - Accessibilité : le texte est `aria-hidden="true"`. Le nom accessible reste « Proposition {current} sur {total} » sur `role="progressbar"`, pour ne pas l'annoncer deux fois.
- **Raisons.**
  - Le handover prime, et la Ligne est lisible dehors (README, principe 6).
  - Au-delà de huit arrêts (6b, jusqu'à 15 à 20 cartes), compter les points devient impossible.
  - Le texte n'est pas mis à droite de la ligne : avec 20 cartes, il ne laisserait que 204 px environ pour 240 px d'arrêts.
  - L'écart avec le `preview.html` est un ajout, sans changement de forme de la ligne, et il est déclaré ici.
- **Conséquence : changement de code, gravité 2.**
  - `DeckProgress` reçoit une prop pour le texte visible, fournie par l'appelant depuis `fr.json` (nouvelle clé, par exemple `presentation.progressionVisible` : « {current} sur {total} »), et l'affiche comme décrit ci-dessus.
  - Tests : texte visible juste au fil du paquet et après un retrait, nom accessible inchangé.
  - Mettre à jour `/dev/composants` et régénérer les références visuelles sur la CI (décision 0004).
  - Le test e2e « commandes visibles » doit rester vert en 390 × 844.

### 4. Feuille de question (écran 7) — F6-Q1
- **Décision.** Le rendu livré est retenu :
  - feuille ancrée en bas, fond `raised`, coins supérieurs `radius-sheet`, sur le voile ;
  - titre en `section` 800 (« On arrête {catégorie} pour ce voyage ? » ou « On reste plus près de ton hôtel ? »), qui reçoit le focus ;
  - « Pourquoi ? (facultatif) » en `corps-s` `ink-soft` ;
  - `Chip` des raisons dans l'ordre du handover (Pas mon style, Trop chargé, Trop cher, Trop loin, Autre raison), une seule sélectionnée, en plein `line` ;
  - « Oui » (`primary`) et « Non » (`secondary`) côte à côte, de même largeur ;
  - « Fermer » en `Button` `text` `sm` `ink`, centré dessous.
- **Raisons.** La question suit deux refus explicites. « Oui » est la réponse attendue, mais « Non » a la même taille, juste à côté. Fermer n'enregistre rien. Il n'y a donc pas de généralisation silencieuse (principe produit 3).
- **Conséquence.** Aucun changement de code.

### 5. Feuille de détail — F6-Q1, F6-PO-12
- **Décision.** Le rendu livré est retenu. Feuille en lecture seule, dans cet ordre :
  - moment (« Jour 2, sam., vers 14:00 », `corps-s` `ink-soft`) ;
  - nom en `section` 800, qui reçoit le focus ;
  - métadonnées ;
  - justification sur un bloc `muted` (`ink-2`) ;
  - « Source : » suivi d'un lien `ink` souligné ;
  - date de vérification en `legende` `ink-soft` ;
  - « Fermer » en `secondary` pleine largeur.

  Aucune décision ne se prend dans le détail.
- **Complément imposé.** Le détail affiche aussi le tag de la carte (« Non confirmé », « À confirmer » ou « À réserver ») et la ligne de trajet avec le détour, au même format que la carte (§ 2.4). Le détail ne doit pas montrer moins d'incertitude que la carte (principe produit 2).
- **Conséquence : changement de code, gravité 1.**
  - Ajouter le tag et la ligne de trajet dans `ProposalDetailSheet.tsx`, en réutilisant la logique de la carte.
  - Ce point ne bloque pas #44. Il est à faire au plus tard quand le détail adoptera `Sheet` et `ReasonBlock` (F5).

### 6. Fins de paquet, paquet vide, écran 6b — F6-Q1, F6-PO-13
- **Décision.** Le rendu livré est retenu :
  - le titre de fin est en `titre-jour` 800 (−0,015 em), aligné à gauche et centré verticalement, et reçoit le focus ;
  - les boutons de fin sont en pleine largeur, à 12 px d'écart ;
  - fin de l'écran 6 : « Tu as vu tes premières propositions », « Débloquer » (`primary`), « Voir le programme » (`secondary`), sans prix ;
  - fin de l'écran 6b : « Tu as tout trié », « Voir le programme » (`primary`) ;
  - paquet vide : « Aucune proposition à trier », « Voir le programme » (`primary`) ;
  - écran 6b : un `StatusBanner` `generating` « Jour {n} en préparation » au-dessus de la progression et sur l'écran de fin ;
  - titres de niveau 1 masqués visuellement : « Tes premières propositions » et « Suite du tri ».
- **Raisons.**
  - Une seule action principale par écran.
  - Vocabulaire imposé (« Tes premières propositions », « Débloquer », jamais « Aperçu »).
  - Aucun écran ne bloque le retour au programme (handover § 6, écran 9).
- **Conséquence.** Aucun changement de code.

### 7. Textes — F6-Q1, Q69
- **« Informations vérifiées le 15 août 2026 » (détail)** : retenu.
  - C'est une phrase datée en `legende` `ink-soft`, dans le détail seulement. Ce n'est pas un badge : la règle « jamais "Vérifié" » vise les badges (handover § 0, règle 5, et Ligne, principe 3). Le principe produit 2 demande au contraire des informations sourcées et datées.
  - La date est écrite en toutes lettres (« 15 août 2026 »), comme une date dans une phrase (`redaction.md`).
  - Aucun changement de code.
- **« les restaurants » (catégorie `restaurant`)** : retenu.
  - Les refus de repas ne déclenchent jamais de question (F6-PO-8). Le libellé n'est donc pas affiché dans F6 : il sert seulement à ce que chaque code ait un libellé.
  - Le jour où une question sur les repas existera, sa formulation relèvera du Product Owner.
  - Aucun changement de code.

## Changements de code imposés (à faire par le rôle frontend sur la PR #44)
1. **Gravité 3** : focus de « Annuler » dans `UndoToast`, aplat `page` et texte `ink` au `:focus-visible`, plus un test (§ 1.2).
2. **Gravité 2** : texte visible « {current} sur {total} » dans `DeckProgress`, sous la ligne, `aria-hidden`, nouvelle clé `fr.json`, tests, `/dev/composants`, références visuelles de la CI (§ 3).
3. **Gravité 1** : tag et ligne de trajet dans la feuille de détail. Ne bloque pas #44 : au plus tard avec F5 (§ 5).

## Questions liées (aucune nouvelle pour Samuel)
- **Q37** (Samuel, modification de Ligne) : « Transports publics », règle « environ / (estimation) », et maintenant les tokens proposés au § 2.5.
- **Q12** (Samuel) : maquettes non exportées. Si une maquette exportée contredit cette décision, la maquette prime et la décision est amendée.
- **Q10** (UX/UI, décision 0012 en revue dans #26) : surfaces et voile des feuilles.
