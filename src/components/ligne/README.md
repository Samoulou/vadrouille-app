Composants du design system Ligne (handover § 5), démontrés sur /dev/composants.
- F2 : Button, IconButton, Tag, Counter, Chip, SegmentedControl, OtpInput, StatusBanner.
- F3 : DayBadge, DayTabs, DayLine (et DayLine.Terminus, .Stop, .Segment, .FreeTime), StopMarker ; durées formatées par `formatDuree` (`src/lib/duree.ts`).
- F6 : DeckCard, DeckProgress, UndoToast.
- F5a : Sheet (points d’arrêt dans `sheet-model.ts`), ReasonBlock, type `travel` de StatusBanner.
- F12b : `Sheet` en mode latéral à partir de 1024 px (`sideOnLargeScreen`, décision 0022 § 6) ; largeur `--ligne-panneau-large` dans `provisoire.css` (Q177).

Aucune chaîne en dur (`react/jsx-no-literals`) ; valeurs sans token dans `provisoire.css` uniquement, chacune avec le numéro de sa question (test `tests/unit/ligne-valeurs-en-dur.test.ts`).
