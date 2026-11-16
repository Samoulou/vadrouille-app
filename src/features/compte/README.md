Mes voyages et compte.

- `TripsScreen.tsx` : écran 17 « Mes voyages » (`/voyages`, F11a), classé dans le navigateur après le montage.
- `trips.ts` : fonctions pures `classifyTrips` (sections, plaque) et `reopenTarget` (réouverture au dernier
  onglet consulté), à la date de chaque destination (`localDateAt`, décision 0021 § 3).
- `AccountScreen.tsx` : « Ton compte » (`/compte`, M9c ; spécification M9 § 6.4) : adresse de la session, « Exporter mes
  données », « Supprimer mon compte », « Se déconnecter ». Étapes à la même adresse : `ReauthStep.tsx` (« Confirme que
  c'est toi », code de moins de 10 minutes) et `DeleteAccountScreen.tsx` (explication, puis « Supprimer définitivement »).
- `export-client.ts` : côté navigateur de l'export (action `exportAccount` : mêmes contrôles que la route de M9a sur `api`,
  jeu simulé sur `mock`).
- `routes.ts` : adresses de « Ton compte » et de l'accueil après la suppression.
