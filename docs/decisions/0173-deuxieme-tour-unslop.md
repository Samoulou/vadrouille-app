# 0173 — Deuxième tour de design avec la skill « unslop »

Statut : **demandé par Samuel**, appliqué par l'UX/UI. Complète 0170 (page de précommande) et 0171 (titrage et bouton principal). Ne change ni le prix, ni les conditions, ni le paiement.

Date : 2026-11-10 · Rédacteur : UX/UI · Ticket #1107.

## Demande

Samuel, fil du projet « Retirer le look IA du design », 2026-11-10 10:30 UTC (`cmsg_0174CRqum9q8GNfZHmNHcYvR5j3xiakjZ1NqfXnZySRZ3T`) : « tu vas refaire un tour du design UX et UI, pour ce faire install https://github.com/heydamir/unslop ». Message reporté dans `QUESTIONS.md` (Q890).

## Installation

La skill est copiée telle quelle dans `.claude/skills/unslop/` (révision `97daa3e` du dépôt `heydamir/unslop`, licence CC BY 4.0, auteur Damir Sokolovsky, crédit et licence conservés). Contenu tiers lu avant installation : des consignes de design et des images de référence. Seule différence avec la source : ses deux scripts Node facultatifs (`scripts/snapshot.mjs`, capture d'une page en ligne ; `scripts/story.mjs`, vidéo) ne sont **pas** copiés dans le dépôt, parce que le contrôle de confinement (`tests/unit/confinement`) refuse leurs accès (processus, fichiers) et qu'aucun des deux ne sert ici : les deux passages de `SKILL.md` qui les citent ne s'appliquent donc pas. Aucun code exécutable ajouté. Aucune dépendance ajoutée. Verdict de la Sécurité attendu à la revue.

## Direction (les cinq lignes de la skill)

- **Produit.** Un programme de voyage jour par jour, de l'hôtel à la soirée, pour des couples romands qui partent 5 à 10 jours en Europe.
- **Caractère.** Ponctuel, direct, un peu joueur.
- **Monde.** La gare et le quai : horaires, plaques, tableau des départs, billet.
- **Moments.** La ligne du jour dans le panneau de l'application ; les plaques de destination.
- **Signature.** Le rail, ses arrêts ronds et son terminus carré. Rien d'autre.

## Audit et corrections

Mode « finition » de la skill (peu de marques restantes) : on corrige ce que l'audit trouve, on garde palette, mise en page et visuel.

| Marque trouvée | Où | Correction |
|---|---|---|
| Titres en graisse 800 | toute l'application, landing | Graisse 600 pour le titrage ; la taille fait la hiérarchie (`globals.css`, règle hors couche) |
| Boutons en 800 et 700 | `Button` | 600 |
| Titre d'affiche démesuré (112 px) | landing | 80 px au plus sur ordinateur, 44 px sur téléphone |
| Pastille au-dessus du titre | landing, étiquette jaune d'ouverture | Texte discret, sans aplat (retire aussi l'écart `quai` de 0170) |
| Éléments empilés sous les boutons | landing, liste « Paiement unique… » | Retirée de l'affiche ; les trois mentions restent dans le billet |
| Coin vide dans l'affiche | landing, colonne de texte | Texte centré en hauteur face au panneau |
| Filets et contours à fort contraste (2 px `ink`) | landing : tableau, légende, billet, questions | Filets fins `outline-strong` |
| Boutons de 56 px | landing | 48 px, marges latérales de 20 px |
| Point final sur un titre | landing, `h1` | Retiré (« Ton voyage, de l'hôtel à la soirée ») |
| Interlettrage négatif sur les titres étroits | titrage | 0 |

## Ce que la skill demande et qui n'est pas fait, et pourquoi

- **Deux graisses seulement (400, 500).** Les noms d'arrêt, heures et étiquettes de Ligne restent en 700 et 800 : « lisible dehors » (`README.md`, principe 6). À revoir écran par écran.
- **Une scène générée derrière l'affiche.** Aucun outil d'image n'est branché, et une génération est payante : proposée à Samuel, non faite.
- **Contenus entre crochets et cadre « Photo du lieu ».** Ce sont les données simulées de la démonstration (handover § 0, règle 2) ; la vraie application affiche les lieux et les photos.
- **Icônes à trait de 1,5.** Ligne fixe 2,2 px ; jeu unique, gardé.

## Suite

Les références visuelles sont à régénérer (`update-snapshots`).
