# 0176 — Carte du tri sans photo en panneau de destination ; calendrier de Ligne pour les dates

Statut : **décidée par Samuel** (carte de décision du fil du projet, reportée dans `QUESTIONS.md`, Q892), appliquée par l'UX/UI. Modifie deux écrans maquettés : la carte du tri (`DeckCard`) et l'écran 1 de la création. Suite de 0174 (« Proposé, non fait »).

Date : 2026-11-10 · Rédacteur : UX/UI · Ticket #1107.

## Choix de Samuel

Fil du projet « Retirer le look IA du design ». Question posée le 2026-11-10 à 11:27 UTC, après le tour de l'application (0174) : « Refaire le bloc photo vide et les champs de date de l'app ? », options « Oui, les deux » (« Je redessine le bloc photo vide aux couleurs de la destination et un calendrier maison pour les dates, puis je te montre les captures. »), « Seulement le bloc photo », « Non, on garde ». Réponse de Samuel à 11:29 UTC : **« Oui, les deux »**. Choix reporté dans `QUESTIONS.md` (Q892).

## Décision

1. **Carte du tri sans photo.** Le bloc gris avec l'icône d'image et « Photo du lieu » est remplacé par un **panneau** : aplat de la couleur de la destination (`dest-*`, `Trip.destinationColor` ; `ink` si elle manque), un bout de ligne (arrêt rond, rail `on-line`) et le secteur du lieu (`facts.area`) en police de titrage, comme un nom de station. Décoratif (`aria-hidden`) : le secteur est déjà dans la ligne de faits. Même boîte que la photo : aucun saut de mise en page. Photo demandée et pas encore arrivée : la boîte reste neutre (`muted`) et vide, comme avant.
   - L'écran reçoit une donnée de plus, `destinationColor` (une des quatre valeurs de la palette, déjà exposée par « Mes voyages » et la vue partagée) : `loadPresentation`, `PresentationScreen`, `DeckCard` (`couleur`).
   - Écart assumé au principe 5 (« une seule plaque par voyage ») : cet écran n'a pas de plaque de destination ; le panneau n'apparaît que faute de photo.
   - Le libellé « Photo du lieu » (`presentation.json`, `carte.photo`) et `IconPhoto` ne sont plus employés par la carte ; ils restent en place, à retirer par leur propriétaire si rien d'autre ne les reprend.
2. **Dates de la création.** Les quatre champs de date de l'écran 1 (arrivée, départ, arrivée dans une ville, date d'un engagement) gardent leur champ (`input type="date"` : saisie au clavier, bornes `min` et `max` du ticket 801, validation inchangée), mais le calendrier du navigateur est remplacé par le **calendrier de Ligne** (`src/features/creation/Calendrier.tsx`) :
   - un bouton « {champ} : choisir dans le calendrier » dans le champ ouvre une feuille (`DialogSheet`) ; au doigt, l'appui sur le champ ouvre cette feuille et non le calendrier du téléphone (`touchend` annulé) ;
   - un mois à la fois, semaine du lundi au dimanche, un bouton par jour nommé en toutes lettres (« 13 mai 2027 ») ; jour choisi en aplat `line` (code de sélection), jours du séjour teintés `muted`, jours hors bornes désactivés et barrés, aujourd'hui `aria-current="date"` ;
   - clavier : flèches (jour, semaine) dans le mois affiché, Page précédente et Page suivante pour changer de mois, Échap ferme (Radix) ;
   - aucun calcul dans le fuseau du navigateur (dates ISO, UTC).
3. **Limite connue.** Le remplacement du calendrier du téléphone est vérifié en émulation tactile (Chromium, 390 px), pas sur de vrais téléphones : à contrôler sur iOS Safari et Android Chrome au prochain essai réel. Le texte du champ (« 13.05.2027 ») reste écrit par le navigateur, dans la langue de l'appareil.

## Tests

`Calendrier.test.tsx` (grille, bornes, changement de mois et d'année, année bissextile, clavier, séjour, champ et feuille, appui au doigt, axe) ; `DeckCard.test.tsx` (panneau, couleur, secteur, axe). Attentes mises à jour sans test retiré : les tests qui lisaient le texte « Photo du lieu » lisent l'état `data-etat="sans-photo"` de l'emplacement ; `load.test.tsx` liste `destinationColor` parmi les données de l'écran.

## Suite

Références visuelles à régénérer (`update-snapshots`) : création, présentation.
