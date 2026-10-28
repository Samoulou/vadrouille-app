# 813 — Formulaire de création guidé

Ticket : #813 · Rôle : UX/UI · Origine : demande de Samuel du 2026-10-28 (fil « Rendre l'app séduisante pour les nouveaux clients »). Audit UX, lot 3 : https://claude.ai/artifact/2gYGfXxf8XkmYeAajEGKLF. Décision : `docs/decisions/0134-formulaire-guide.md`.

## Comportement
1. Écrans 1, 2 et 3 : « Étape {n} sur {total} » à droite de « Retour » ; `total` = 3 si une ville peut encore passer par « Où loger », 2 sinon.
2. Écran 2, récit : exemple en texte indicatif ; groupe « Idées à ajouter » de huit chips qui ajoutent ou retirent une phrase du récit, sans dépasser 1 000 caractères.
3. Plus de « brief » dans les textes de la création ; « Engagements déjà pris » devient « Déjà réservé ».

## Écarts avec la maquette
Référence : `docs/ux/captures/F8a/` (`docs/ux/maquettes/` est vide).
- Ajout : la ligne « Étape {n} sur {total} » en haut à droite des écrans 1 à 3.
- Ajout : le groupe « Idées à ajouter » sous le compteur du récit.
- Textes changés (décision 0134 § 4 et § 5).

## Captures (390 × 844)
`docs/ux/captures/813/` : `ecran1-etape`, `ecran2-recit-vide`, `ecran2-recit-idees`, `ecran1-deja-reserve`.

## Question
- Product Owner : passer à 2 adultes par défaut (la plupart des voyages se font à deux) ?
