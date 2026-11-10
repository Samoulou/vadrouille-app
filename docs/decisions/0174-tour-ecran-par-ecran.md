# 0174 — Tour de l'application écran par écran : pages d'état et titre d'accueil

Statut : **forme décidée par l'UX/UI** pour des écrans au rendu provisoire (pages d'état, Q154 et F10-Q5 ; « Qui décide quoi »), à la demande de Samuel (Q890). Ne touche à aucune règle de Ligne ni à aucun écran maquetté. Les deux changements d'écrans maquettés que l'audit recommande sont **proposés à Samuel, non faits** (section « Proposé, non fait »).

Date : 2026-11-10 · Rédacteur : UX/UI · Ticket #1107.

## Demande

Samuel, fil du projet « Retirer le look IA du design », 2026-11-10 11:13 UTC : « Tubas fais le tour global ou juste de la landing page? » (Q890). Réponse du fil : le tour écran par écran de l'application suit le tour de la landing.

## Audit

26 écrans de l'application relus à 390 px avec la grille `docs/design-system/anti-generique.md` et la skill `unslop` (création, récit, vérification, logement, préparation, présentation, déblocage, séjour, jour, fiche étape, remplacer, déplacer, partage, « Aujourd'hui », connexion, « Mes voyages », accueil, pages d'état). La plupart tiennent leur identité par la ligne du jour, la plaque de destination et les étiquettes. Trois endroits pourraient appartenir à n'importe quel produit :

| Marque | Où | Suite |
|---|---|---|
| Titre, phrase et bouton flottant au milieu d'une page vide | pages introuvable, erreur, hors ligne (`EtatPage`) | corrigé ici |
| Point final sur un titre | accueil, promesse sous le nom | corrigé ici |
| Bloc gris « Photo du lieu » avec une icône d'image | carte du tri (`DeckCard`) quand le lieu n'a pas de photo | proposé |
| Champs de date du navigateur | écran 1 de la création | proposé |

## Décision

1. **Pages d'état.** `EtatPage` (introuvable, erreur, hors ligne) porte au-dessus du titre une **ligne interrompue** : terminus carré, rail plein, arrêt rond, puis pointillé qui s'arrête (`src/features/etats/LigneInterrompue.tsx`). Décorative (`aria-hidden`), aux tokens de la ligne du jour (`--ligne-terminus`, `--ligne-rail`, `--ligne-stop`, pointillé de la marche). Pas d'illustration, pas d'icône d'alerte, pas de couleur nouvelle. Écart assumé au principe 1 (« le bleu ne décore pas ») : ici le bleu est la ligne elle-même, comme sur le rail de la page de précommande (0170).
2. **Accueil.** La promesse perd son point final : « Chaque journée de ton voyage, prête avant de partir » (`accueil.json`, clé `accroche`). Aucun autre mot ne change.

## Proposé, non fait (écrans maquettés : à Samuel de dire)

- **Emplacement de photo vide** (`DeckCard`) : remplacer le bloc gris et son icône par un aplat de la couleur de la destination portant le nom du quartier, ou réduire la carte à son texte quand il n'y a pas de photo.
- **Dates de la création** : remplacer les deux champs de date du navigateur par un sélecteur de dates de Ligne (une plage arrivée / départ sur un calendrier). Travail plus lourd, avec accessibilité au clavier à retester.

## Suite

Références visuelles à régénérer (`update-snapshots`) : pages d'état, hors ligne, accueil.
