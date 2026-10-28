# 801 — Calendriers bornés et durée du séjour (écran 1)

Ticket : #801 · Rôle : UX/UI · Origine : demande de Samuel du 2026-10-28 (fil « Rendre l'app séduisante pour les nouveaux clients ») : « quand je saisis la date d'arrivée, ne proposer que des dates dès le jour d'arrivée pour le départ ». Audit UX : https://claude.ai/artifact/2gYGfXxf8XkmYeAajEGKLF (lot 1).

## Comportement
1. Les calendriers ne proposent que les dates que `validateTrip` accepte (`tripDateBounds`, `src/features/creation/validation.ts`) :
   - arrivée : dès aujourd'hui (date de l'appareil, lue après l'hydratation) ;
   - départ : dès le lendemain de l'arrivée ; sur le site d'essai, au plus `PROTOTYPE_STAY_DAYS_MAX` jours d'arrivée à départ inclus ;
   - autre ville : dès le lendemain de l'arrivée ; au plus la veille du départ quand il est saisi ;
   - engagement : dès l'arrivée ; au plus le départ quand il est saisi.
2. Une date déjà saisie qui sort des bornes (arrivée déplacée après le départ, par exemple) n'est jamais effacée : « Continuer » la refuse avec le message habituel, comme toute date saisie au clavier.
3. Sous les dates, quand elles sont cohérentes : « 1 nuit » ou « {n} nuits » (`creation.ecran1.duree`), dans une région `aria-live="polite"` toujours rendue (0018 § 14), annoncée à chaque changement.

## Écarts avec la maquette
Référence : `docs/ux/captures/F8a/creation-ecran1.png` (`docs/ux/maquettes/` est vide).
- Ajout non maquetté : la ligne de durée sous les dates (`corps-s`, `ink-soft`, chiffres tabulaires), 8 px sous les champs.
- Aucun autre changement visible : les bornes ne changent que le contenu du calendrier natif.

À lister dans la prochaine note de version (« Décisions prises par le studio »).

## Captures (390 × 844)
`docs/ux/captures/801/` : `ecran1-1-vide`, `ecran1-2-duree`, `ecran1-3-erreur` (arrivée déplacée après le départ, puis « Continuer »).
