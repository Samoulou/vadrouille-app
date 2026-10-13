Pendant et après le voyage.

- `today.ts` : fonctions pures de date et d'heure à l'heure de la destination (`Trip.timeZone`, décision 0021 § 3) :
  `localDateAt`, `localTimeAt`, `tripMoment` (avant, veille, pendant, après), `currentDayIndex`, `nowAt`,
  `nextUp`, `reminders`, et `projectTodayTrip`, projection transmise à l'écran 15 (ni raisons, ni sources, ni
  verrous, ni budget).
- `use-client-now.ts` : heure du navigateur après le montage (`null` au rendu serveur), relue au retour de l'onglet
  et, avec `tickEveryMinute`, au début de chaque minute.
- `TodayScreen.tsx` : écran 15 « Aujourd'hui » (`R15`, F10a) ; `load-today.ts` : lecture par `getTripReader()`.
- `itineraire.ts` : seul module qui construit l'adresse « Itinéraire » vers Google Maps (exception testée dans
  `tests/unit/google-regles.test.ts`).
- `plate.ts`, `trip-session.ts`, `TripSessionProvider.tsx` : plaque et mémoire d'onglet de « Mes voyages » (F11a).
