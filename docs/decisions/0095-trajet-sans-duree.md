# 0095 — Trajet sans durée et journée sans total : textes et accessibilité

Statut : décision déléguée du rôle UX/UI (écrans non maquettés, dans les règles de Ligne ; « Qui décide quoi » de `docs/CONTEXT.md`), définitive dès sa fusion, sans délai de veto (décision 0093) ; à lister dans la note de version suivante, rubrique « Décisions prises par le studio ». Samuel peut la remettre en cause à tout moment par une nouvelle décision.

Date : 2026-10-19 · Décideur : UX/UI · Décisions liées : 0092 (§ 4 point 3, § 4 « Contrat », § 6), 0018, 0093 · PR liée : #509 (bloquants 3 et 4 de la revue consolidée du 2026-10-19 à 04:03 UTC)

Numérotation : 0092 est portée par la PR #507 et 0094 par la PR #516, toutes deux ouvertes ; 0095 est le premier numéro libre.

## Contexte

La décision 0092 rend `Segment.minutes` et `Day.travelMinutes` nullables (`null` : temps indisponible). Seul le prototype (`p0Run`) peut produire `null`, quand Google refuse ou échoue à la relecture d'une paire non conservée ; le MVP n'en produit jamais. 0092 § 4 et § 6 réservent au rôle UX le libellé et l'accessibilité du trajet sans durée et de la journée sans total.

`docs/ux/maquettes/` est vide : aucun de ces états n'est maquetté. Règles appliquées : `docs/design-system/redaction.md` (« L'incertitude est dite simplement : « Horaire à confirmer », jamais cachée » ; le produit « ne promet jamais ce qu'il n'a pas vérifié » ; vocabulaire fixe « Incertitude : À confirmer ») et `docs/handovers/frontend.md` § 10 (tutoiement, phrases courtes, pas de « ! », pas d'emoji) et § 11 (accessibilité).

Le texte proposé par #509 (« durée indisponible ») est remplacé : « indisponible » parle de notre système, pas du voyage, et le vocabulaire de Ligne impose « à confirmer » pour une incertitude. C'est aussi vrai : la durée manquante est redemandée au prochain affichage (0092 § 4 point 2).

Ni les maquettes, ni les règles de Ligne, ni le handover ne sont modifiés. Aucun code n'est modifié ici : le rôle qui porte #509 applique ces textes.

### Portée
- **Tranché ici :** les textes visibles, ce qui est affiché ou non, et ce que lit un lecteur d'écran.
- **Laissé au rôle qui code :** les noms des clés, des fonctions et des fichiers. Les noms de clés ci-dessous sont des préconisations ; une autre forme est acceptée si les textes rendus sont exactement ceux-ci.

## Décision

### 1. Règle générale

Une durée inconnue s'écrit **« durée à confirmer »** (« Durée à confirmer » en début de phrase). Jamais « 0 min », jamais un tiret, jamais « environ » (même si `estimated` vaut `true`), jamais une durée partielle. Tout consommateur que le compilateur signale et qui n'est pas listé ci-dessous suit cette règle à la place de la durée.

### 2. Trajet sans durée, par contexte

| Contexte | Avec durée (inchangé sauf Aujourd'hui) | Sans durée (`minutes: null`) |
|---|---|---|
| Ligne du jour, `DayLine` `SegmentRow` (`ligne.json` `segment`) | « À pied, 20 min » | « À pied, durée à confirmer » · « Bus, durée à confirmer » · « En voiture, durée à confirmer » |
| Fiche étape, « Pour y aller », avec origine (`sejour.json` `fiche`) | « À pied, 20 min depuis Royal Mile » | « À pied depuis Royal Mile, durée à confirmer » |
| Fiche étape, « Pour y aller », sans origine | « À pied, 20 min » | « À pied, durée à confirmer » |
| Aujourd'hui, « Prochaine étape » (`voyage.json` `prochaine`) | « Pour y aller : à pied, 20 min » | « Pour y aller : à pied, durée à confirmer » |

Clés préconisées :
- `ligne.json` `segment.libelleSansDuree` : `"{mode}, durée à confirmer"` (remplace `"{mode}, durée indisponible"` de #509).
- `sejour.json` `fiche.pourYAllerDepuisSansDuree` : `"{mode} depuis {origin}, durée à confirmer"`. Raison : « À pied, durée indisponible depuis Royal Mile » rattache « depuis Royal Mile » à la durée. L'origine suit donc le mode, et la durée à confirmer vient en fin de phrase. `pathToLabel` sans origine rend le libellé de la ligne du jour.
- `voyage.json` `prochaine` : après « : », le mode est en minuscule (règle typographique française), **dans les trois cas**, pour qu'une même ligne ne change pas de casse selon que la durée est connue ou non :
  - modes : `"à pied"`, `"bus"`, `"en voiture"` ;
  - `pourYAller` : `"Pour y aller : {mode}, {duree}"` ;
  - `pourYAllerEstime` : `"Pour y aller : {mode}, environ {duree} (estimation)"` ;
  - `pourYAllerSansDuree` : `"Pour y aller : {mode}, durée à confirmer"`.

  Le lien « Itinéraire » reste affiché (il donne le temps de trajet dans Google Maps). F10 C7 (« Pour y aller : » suivi du segment à pied de 20 min au format de F3) reste satisfait par « Pour y aller : à pied, 20 min ». Pour la casse, cette décision prime sur la spécification F10 (précédent : 0018, « Portée »). Le Product Owner peut l'y reporter (question 1).

### 3. Journée sans total (`travelMinutes: null`)

La journée n'est **pas** traitée comme une journée sans trajet. « 3 étapes » seul est déjà le rendu d'un jour sans aucun trajet (`withoutTravel`) : le réutiliser ferait croire qu'il n'y a rien à parcourir. Le total est remplacé par une mention, jamais par un nombre :

| Contexte | Avec total (inchangé) | Sans total |
|---|---|---|
| Journée, ligne sous le titre, sans budget (`sejour.json` `journee`) | « 1 h 10 de trajet » | « Temps de trajet à confirmer » |
| Journée, ligne sous le titre, avec budget | « 1 h 10 de trajet · environ 35 CHF par personne » | « Temps de trajet à confirmer · environ 35 CHF par personne » |
| Séjour, « Jour par jour », résumé (`sejour.json` `sejour.jourParJour`) | « 3 étapes · 1 h 10 de trajet » | « 3 étapes · temps de trajet à confirmer » |
| Bandeau de trajet (`StatusBanner kind="travel"`, Journée et `RevisionPreview`) | affiché si dépassement | **absent** (comportement de #509, conservé) |

Clés préconisées : `journee.trajetAConfirmer` : `"Temps de trajet à confirmer"` ; `journee.trajetAConfirmerBudget` : `"Temps de trajet à confirmer · environ {montant} CHF par personne"` ; `sejour.jourParJour.resumeTrajetAConfirmer` : `"{etapes} · temps de trajet à confirmer"` (`{etapes}` : « 1 étape », « 3 étapes », comme aujourd'hui).

Les trajets connus de la journée restent affichés avec leur durée. Seul le total disparaît.

### 4. Carte de la Présentation (`DeckCard`) sans trajet ni détour

Une proposition sans trajet relu perd `travelFromPrevious` et `detour` (0092 § 4 point 3). Avec `minutes: null`, la carte se comporte de la même façon. Dans les deux cas, **la carte n'affiche ni ligne de trajet ni détour, et rien ne les remplace**. Raison : la carte ne montre le trajet que s'il dépasse `DETOUR_THRESHOLD_MINUTES`, avec son détour. Sans trajet, elle a donc déjà l'aspect d'une proposition proche. Ajouter « durée à confirmer » sur chaque carte d'un programme dégradé chargerait la décision « J'aime / Pas pour moi » d'une information qui ne la sert pas. Une fois l'étape gardée, sa ligne du jour dit « durée à confirmer » (§ 2). Pas de nouvelle chaîne.

### 5. Accessibilité

Aucun `aria-label` nouveau. Le nom accessible ou le texte lu est le texte visible, sans abréviation à expliquer (« min » n'apparaît pas) :

- **Ligne du jour** : l'élément de liste du segment est lu « À pied, durée à confirmer ». La texture du rail (pointillé à pied, plein sinon) reste décorative et inchangée.
- **Fiche étape** : région « Pour y aller » (nommée par son titre), texte lu « À pied depuis Royal Mile, durée à confirmer ».
- **Aujourd'hui** : paragraphe lu « Pour y aller : à pied, durée à confirmer ». Le lien garde son nom « Itinéraire vers {name} (nouvelle fenêtre) ».
- **Journée** : la ligne sous le titre de niveau 1 est lue « Temps de trajet à confirmer » (ou avec le budget). Elle n'est **pas** une région live : c'est un état, pas un événement, et rien ne l'annonce.
- **Séjour** : le nom du lien d'un jour est « {titre du jour} 3 étapes · temps de trajet à confirmer », dans le même ordre et avec le même séparateur qu'aujourd'hui.
- **DeckCard** : `aria-describedby` ne référence ni `trajet` ni `detour` (comportement de #509, conservé). La description lue est celle d'une carte sans trajet.
- Contraste : textes existants (`ink-soft`, `ink`, `ink-2` sur `page` ou `raised`), sans nouveau token.

### 6. La dégradation n'est pas silencieuse, mais elle n'alerte pas

Le contrôle du budget de trajet (`isOverTravelBudget`) n'a pas pu avoir lieu. Le produit le dit **par la mention elle-même**, aux endroits où le temps manque : « durée à confirmer » sur le trajet, « Temps de trajet à confirmer » à la place du total. La personne sait donc que ce temps n'a pas été vérifié (redaction.md : l'incertitude n'est jamais cachée).

Le produit **n'ajoute ni bandeau, ni message d'erreur, ni annonce**. Le bandeau de trajet signale un dépassement constaté : l'afficher pour un total inconnu promettrait un contrôle qui n'a pas eu lieu, ou alerterait sans fait. L'état d'erreur est écarté par 0092 § 4 point 3. Aucune phrase sur le rythme (« au-delà des … prévues pour ton rythme ») n'est donc écrite sans total.

### 7. Captures

Aucune capture n'est jointe à cette PR. Une capture de l'état actuel montrerait les textes de #509, que cette décision remplace. Les captures 390 × 844 des contextes du § 2 et du § 3 (ligne du jour, fiche étape, Aujourd'hui, Journée, Séjour), rangées sous `docs/ux/captures/`, viennent avec le push de #509 qui applique ces textes. La revue UX de #509 les compare à cette décision.

### 8. Tests attendus dans #509 (rendu)

Textes exacts du § 2 et du § 3, au caractère près, dans les tests de `segmentLabel`, `pathToLabel` (avec et sans origine), `TodayScreen` (avec, estimé, sans durée), `dayTravelLine` (avec et sans budget), `daySummary` et `SegmentRow` ; absence du bandeau de trajet et de tout chiffre suivi de « min » quand le total est `null` ; `DeckCard` avec `minutes: null` sans `trajet` ni `detour` dans `aria-describedby`.

## Questions ouvertes

1. **Product Owner** : reporter dans `specs/F10-pendant-le-voyage.md` la casse de « Pour y aller : à pied, 20 min » (§ 2). Rien ne bloque : la décision prime d'ici là.

## Conséquences

- #509 remplace « durée indisponible » par les textes ci-dessus et ajoute les clés du § 2 et du § 3.
- Sur Aujourd'hui, le mode passe en minuscule après « Pour y aller : » dans tous les cas, MVP compris. C'est le seul changement visible pour un voyage dont toutes les durées sont connues.
- Rien n'engage d'argent, de compte externe ni de donnée personnelle.

## Quand revoir cette décision

- Une maquette de ces états arrive dans `docs/ux/maquettes/` ;
- Samuel décide que le MVP peut produire `null` (0092, question 1) : la mention devrait alors peut-être dire quoi faire ;
- un test d'usage montre que « à confirmer » est lu comme une action attendue de la personne.
