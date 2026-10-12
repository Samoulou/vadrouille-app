Utilitaires partagés (cn() de shadcn/ui).
- F10a : `online.ts`, `useOnline()` (réseau disponible : `navigator.onLine` suivi par les événements `online` et `offline`, `true` au rendu serveur ; décision 0016 § 10). Seule source de l'état du réseau côté client : l'écran 15 (bandeau hors ligne, liens désactivés) et la carte (`DayMap`) l'importent ; aucun composant ne réécoute ces événements lui-même.
- F12b : `large-screen.ts` (seuil du grand écran, seule requête de largeur, décision 0022 § 5), `use-element-size.ts` (taille d'un conteneur par `ResizeObserver`, décision 0022 § 6).
