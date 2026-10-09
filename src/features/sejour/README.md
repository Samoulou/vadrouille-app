Séjour, Journée, Fiche : écrans 11 à 14, ajouter, déplacer.

- F5a : `TripShell` (carte + panneau, monté par le layout du voyage), `JourneePanel`, `SurpriseBlock`, `EventLines`, `SejourPanel` (titre seul, le reste en F5c) ; modules purs `routes.ts` (adresses, décision 0015 § 1), `travel.ts`, `load.ts` ; `screens.tsx` partagé par `/voyages/…` et `/dev/voyages/…`.
- F5b : `JourneeView` (journée ou fiche selon `?etape=`, retour du focus), `StopSheet` (écran 13), modules purs `fiche.ts` et `programme.ts` (verrou annulable, décision 0015 § 6) ; programme, fiche et toast d'annulation dans le contexte de `TripShell`.
- Aucune persistance côté client ; la carte simulée ne s'importe jamais ici (règles ESLint et leurs tests).
