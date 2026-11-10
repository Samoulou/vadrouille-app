# Captures de M4c (ticket 941) : écrans d'un voyage à plusieurs villes

Captures mobiles 390 × 844 de la PR #945 (handover frontend, « Une tâche est terminée quand », point 4), prises par
Playwright le 2026-10-30 sur le build de production (`scripts/serve-standalone.mjs`), adaptateur `mock`, voyages
`mock_trip_rome_florence` (Rome puis Florence, changement de ville à J3) et `mock_trip_compostelle_florence`
(« Saint-Jacques-de-Compostelle », hors des 62 villes, puis Florence, changement de ville à J2). Ces deux voyages sont
servis à leur adresse seulement : « Mes voyages » ne change pas. Sans configuration Google, la carte montre son repli.

| Fichier | État |
|---|---|
| `m4c-1-ecran1-aide-billet-390.png` | Écran 1, Rome puis Florence, un engagement : aide du billet de trajet sous « Autres villes » (reliée au « Type de réservation ») |
| `m4c-2-ecran1-trois-villes-erreur-390.png` | Écran 1, 3 villes, « Continuer » : erreur de ville (arrivée manquante) reliée à son champ, « Ajouter une ville » désactivé |
| `m4c-3-ecran5-compostelle-390.png` | Écran 5 : légendes « Saint-Jacques-de-Compostelle » et « De Saint-Jacques-de-Compostelle à Florence » (deux lignes) au-dessus de la mini-ligne ; pastille, mini-ligne et état alignés (UX-M4S-B) |
| `m4c-4-ecran6-carte-ville-390.png` | Écran 6b : « Jour 1 · Rome » sous le moment de la carte |
| `m4c-5-sejour-villes-390.png` | Séjour : « Rome · Florence » sous la plaque |
| `m4c-6-sejour-jour-par-jour-390.png` | Séjour : « Jour par jour » groupé par ville (« Rome · 2 nuits », « Florence · 2 nuits »), J3 « Vers Florence » |
| `m4c-7-journee-vers-florence-390.png` | Journée J3 : ligne « Vers Florence », « [Train Rome–Florence], 12:00 – 13:40 », sans numéro ni lien |
| `m4c-8-sejour-compostelle-390.png` | Séjour au nom long : titres de ville qui passent à la ligne, aucun débordement |

Références visuelles de la CI : une seule change, `tests/visual/__screenshots__/creation-ecran1-ville-engagement.png`
(écran 1 avec une autre ville et un engagement : l'aide du billet de trajet s'affiche sous « Autres villes », hauteur de
1910 à 2022 px), régénérée par l'automate `update-snapshots` (commit `0a78444`). Les six autres références que ce
passage avait aussi régénérées (`connexion-code-faux`, `connexion-code`, `dev-composants-jours-focus-complet`,
`lancement-conflit`, `lancement-erreur`, `revision-deplacer-jours` : quelques pixels, sans lien avec M4c) sont remises à
leur état précédent. Les autres écrans à une ville ne changent pas.
