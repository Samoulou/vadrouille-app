# 0133 — Bandeau des créneaux sans proposition : en fin de tri, sous le titre

Statut : **acceptée** · Date : 2026-10-28 · Décideur : UX/UI (rendu du bandeau `noOption` délégué à UX/UI par B2-PO-9 et `specs/B2-evolutions-contrats.md`, question 1 ; écran non maquetté) · Ticket : #804 · Définitive à sa fusion (0093). À lister dans la prochaine note de version (« Décisions prises par le studio »).

## Contexte
Audit UX du 2026-10-28 demandé par Samuel (fil « Rendre l'app séduisante pour les nouveaux clients ») : sur l'aperçu, le tri s'ouvrait sur « Pas de proposition pour le jour 4… » au-dessus de la première carte. La première chose lue était un manque, avant toute proposition.

## Décision
1. Le bandeau `noOption` (`StatusBanner`, B2-PO-9) n'est plus rendu au-dessus du paquet. Il apparaît à la fin du paquet seulement, dans l'écran de fin (`DeckEnd`, propriété `notice`), juste après le titre `h2`.
2. Le focus est posé sur ce titre en fin de paquet (F6-PO-5) ; le bandeau est donc lu juste après lui. Il est rendu sans rôle propre (`announce={false}`), pour qu'il n'y ait qu'une voie de lecture et pas d'annonce en double.
3. « Annuler » sur la dernière carte rouvre le paquet : l'écran de fin, et donc le bandeau, disparaissent.
4. Texte inchangé (`presentation.sansOption`, libellés provisoires B2-PO-10).

## Conséquences
- Les captures de référence de la présentation qui montraient le bandeau au-dessus de la première carte sont régénérées (décision 0004).
- Une personne qui quitte le tri avant la fin (« Passer ») ne voit pas le bandeau ; le créneau reste vide dans le programme. Si l'écran du programme ne le nomme pas, question au Product Owner (description de la PR).
