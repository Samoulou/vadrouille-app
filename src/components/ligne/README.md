Composants du design system Ligne (handover § 5), démontrés sur /dev/composants.
- F2 : Button, IconButton, Tag, Counter, Chip, SegmentedControl, OtpInput, StatusBanner.
- F3 : DayBadge, DayTabs, DayLine (et DayLine.Terminus, .Stop, .Segment, .FreeTime), StopMarker ; durées formatées par `formatDuree` (`src/lib/duree.ts`).
- F6 : DeckCard, DeckProgress, UndoToast.
- F5a : Sheet (points d’arrêt dans `sheet-model.ts`), ReasonBlock, type `travel` de StatusBanner.
- F12b : `Sheet` en mode latéral à partir de 1024 px (`sideOnLargeScreen`, décision 0022 § 6) ; largeur `--ligne-panneau-large` dans `provisoire.css` (Q177).
- F10a (F10-TL-12) : `ActionBanner` (bandeau d'action requise, aplat `quai`, texte `ink`, titre au niveau choisi, sans zone vivante) ; `DayLine` en lecture seule sur des types réduits (`DayLineViewItem` : terminus sans libellé « Début de journée » / « Fin de journée », étape sans `id` ni `reason`, `getStopHref` facultatif) et props de l'écran 15 (`compact`, `currentKey` avec `aria-current="step"` et « En cours », `isPast` avec « Terminée » et sans `Tag`). Sans ces props, rendu inchangé.
- F2c : rendus de la décision 0012 (Q13) pour StatusBanner (`alert` pour `conflict`, filet `generating` fixe en `ink-soft`), Chip (coche de 20 px, déduite sans aplat `line`, indisponible sans contour) et OtpInput (`invalid`, `describedBy`).

Aucune chaîne en dur (`react/jsx-no-literals`) ; valeurs sans token dans `provisoire.css` uniquement, chacune avec le numéro de sa question (test `tests/unit/ligne-valeurs-en-dur.test.ts`).
