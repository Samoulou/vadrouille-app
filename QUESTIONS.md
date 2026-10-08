# Questions ouvertes

| ID | Question | Pour | Ouverte le | Bloque | Statut |
|---|---|---|---|---|---|
| Q1 | Nom de travail du produit et domaine (D1) | Samuel | 2026-10-07 | Page d'offre, en-têtes | Provisoire : **Vadrouille** ; marque et domaine à vérifier |
| Q2 | Prix affichés à la place de [PRIX] (D9) | Samuel | 2026-10-07 | Écran Débloquer | Ouverte |
| Q3 | Clé Google Maps restreinte au staging et Map ID avec le style de la section Carte | Samuel | 2026-10-07 | F4, ancrage de P0 | Ouverte |
| Q4 | Fournisseur d'authentification avec organisations (D8) | Samuel | 2026-10-07 | Compte | Ouverte |
| Q5 | Validation juridique des règles Google (IA, données dérivées) | Samuel | 2026-10-07 | Mise en production | Ouverte |
| Q6 | Source et règles des photos de lieux | Samuel | 2026-10-07 | Cartes de présentation | Ouverte |
| Q7 | Mise en page grand écran (non maquettée) | Samuel | 2026-10-07 | F12 | Ouverte |
| Q8 | Budget de trajet par rythme (D14), à calibrer | Samuel | 2026-10-07 | Moteur de planification | Ouverte |
| Q9 | Clé API Gemini pour la comparaison de P0 (dépense de quelques dollars) | Samuel | 2026-10-07 | P0 | Ouverte |
| Q15 | Onglet de la rangée des jours : le design system (`DayBadge`, README et `preview.html`) l'appelle « Aperçu », le handover l'appelle « Séjour » (§ 5 `DayTabs`) et interdit « Aperçu » (§ 10). F3 applique « Séjour » : confirmer et corriger le design system | Samuel (UX/UI) | 2026-10-08 | Validation visuelle de F3 | Ouverte |
| Q16 | Libellés des segments de `DayLine` : le contrat n'a que `mode: walk \| transit \| car` mais le design system affiche « Bus » ; aucun libellé ni texture de rail documentés pour `car` ; « environ » (« Bus, environ 25 min (estimation) ») accompagne-t-il toute durée en transport, ou seulement les estimations ? | Samuel (UX/UI) | 2026-10-08 | Libellés définitifs de `DayLine.Segment` (F3 provisoire, écart listé dans la PR) | Ouverte |
| Q17 | Ligne du jour, comportements non documentés : destination du lien « Idées » du temps libre ; signalement d'un repas « pas encore choisi » (aucun champ dans le contrat `Stop`) ; affichage de `locked` (cadenas ?) et de `kind: "event"` ; affichage de `Stop.end` sur la ligne | Samuel (UX/UI) | 2026-10-08 | Rendu complet de `DayLine.Stop` et `DayLine.FreeTime` ; F5 | Ouverte |
| Q18 | `DayBadge` et `StopMarker` : le handover prévoit un `weekday` (« pastille avec jour abrégé ») que le `preview.html` n'affiche pas ; rendu de l'état désactivé « complet » ; prop de la variante réduite (26 px) et nom accessible de la pastille ; prop qui distingue les variantes « ligne » et « carte » de `StopMarker` (absente du handover § 5) | Samuel (UX/UI) | 2026-10-08 | Validation visuelle de F3 (implémentation provisoire listée comme écart) | Ouverte |
| Q19 | Mesures du design system sans token (lié à Q11) : colonnes 52 et 28 px de la ligne, coins 5 et 6 px du terminus, terminus de carte 24 px, anneau 3 px et numéro 12 / 15 px des marqueurs, vue d'ensemble 12 px, trait 3 px de l'onglet actif, bloc temps libre (coins 10 px, `radius-*` sans équivalent), tracé du temps libre pointillé dans `preview.html` mais décrit « fin » dans le README, pastille réduite 26 px et coins 6 px. Faut-il créer des tokens ? | Samuel (UX/UI) | 2026-10-08 | Règle « aucune valeur en dur » pour F3 (valeurs isolées et listées en attendant) | Ouverte |
| Q20 | F3 a pour prérequis F2 (handover § 15, roadmap) mais ses composants reçoivent les types `DayLineItem`, `Stop`, `Segment` de `src/contracts`, livrés par F1 : ajouter F1 aux prérequis de F3 ? | CEO, Tech Lead | 2026-10-08 | Démarrage de F3 | Ouverte |
