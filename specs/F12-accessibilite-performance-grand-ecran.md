# F12 — Passe accessibilité, performance et grand écran (≥ 1024 px)

Rôle : frontend · Prérequis : F5 à F11 et T4 (handover § 15, ligne F12) ; découpage en quatre PR, dont deux peuvent commencer avant la fin de F5 à F11 (voir « Découpage et prérequis ») · Ticket : #90 · Référence : `docs/handovers/frontend.md` (§ 0 règles 1, 7, 8 et 10, § 2, § 4.2 « Focus », § 5 `Sheet`, `DayTabs`, `UndoToast`, `StatusBanner`, § 6 « Mise en page grand écran (non maquettée) » et règles de navigation, § 7 « Durées », « Mouvement réduit », « Focus », § 8 « Conformité », § 11, § 14 « Budgets » et « Scénarios Playwright », § 15 F12, § 16, § 17 point 6), `docs/produit/cadrage-v5.md` (§ 3.1 « Reste à maquetter : […] vues bureau », § 3.2 « Mobile d'abord » et « Accessibilité », § 6.5 règles Google), `docs/CONTEXT.md` (phase 0, « Qui décide quoi »), `docs/design-system/README.md` (« Accessibilité », « Mouvement »), `docs/design-system/carte.md`, `specs/F4-carte.md`, `specs/F5-sejour-journee-fiche.md` (« Mise en page commune », « Panneau coulissant », « Synchronisation carte ↔ liste », « Écran 13 », F5-PO-2, F5-PO-7, F5-PO-8), `specs/F6-presentation.md` (F6-PO-4), `specs/F7-remplacer-ajouter-deplacer.md`, `specs/F8-creation-compte.md`, `specs/F9-debloquer-programme-ajuste.md`, `specs/F11-mes-voyages-apres-etats.md` (F11-PO-17 catalogue des états), `specs/D1-demo.md`, décisions `docs/decisions/0004` (références visuelles), `0013` (§ 1.6 pages de développement, § 3.4 geste), `0015` (§ 4 recentrage, § 5 `Sheet`), `0016` (§ 1.3 condition « grand écran, F12 », § 3 budget et T4), `0018` (règles communes, « Attente », « Actions de fin d'écran »), `0020` (budget du fournisseur de F9), `0021` (budget du fournisseur de F11, contour de focus de la plaque), `QUESTIONS.md` (Q7, Q12, Q13, Q37, Q56, Q59, Q95).

Documents en revue, non fusionnés au 2026-10-10, cités pour cohérence sans en dépendre : spécification F10 (PR #76 : écran 15, vue partagée `/p/[token]` sans carte, page de repli `/hors-ligne`) ; décision UX/UI 0012 (PR #26 : rendu de `StatusBanner`) ; F5b (PR #66) ; F9a (PR #86) ; T8 (PR #72 : `DayBadge` en groupe radio, marqueurs proches). F12 ne modifie aucun de leurs fichiers dans cette PR de spécification.

Dossier UX : `docs/ux/dossier-ux.md` n'existe pas (Q59) et `docs/ux/maquettes/` est vide (Q12). La mise en page grand écran n'est **pas maquettée** (handover § 6 et § 17 point 6 ; cadrage § 3.1 « vues bureau » à maquetter) : son rendu est délégué à UX/UI (Q7). Tout rendu grand écran ci-dessous est « provisoire (UX/UI) » ; les PR « implémentent, capturent et signalent » (handover § 6).

## Objectif
Fermer le front de phase 0 sur trois exigences du handover que chaque écran ne peut pas vérifier seul :
1. **Performance** : atteindre et garder les budgets du § 14 (Lighthouse mobile ≥ 90 en performance et 100 en accessibilité sur `/voyages/[id]` ; JavaScript initial de la Journée < 200 Ko compressé), mesurés en CI sur le build de production, sans service externe.
2. **Grand écran** : à partir de 1024 px de large, le voyage s'affiche carte à gauche et panneau de 420 px à droite, sans feuille coulissante (handover § 6) ; les autres écrans restent lisibles, en colonne centrée, sans rien étirer.
3. **Accessibilité** : une passe transversale WCAG 2.2 AA sur toutes les routes livrées par F5 à F11, en mobile et en grand écran, qui vérifie ce que les tests par écran ne couvrent pas (redimensionnement, espacement du texte, orientation, focus masqué, mouvement réduit, titres de page), et corrige ce qu'elle trouve.

## Phase 0 : ce que F12 ne fait pas
- **Aucun service externe ni compte** : Lighthouse tourne en local dans la CI contre le build de production ; aucun envoi de rapport vers un serveur tiers (ni stockage public temporaire, ni tableau de bord hébergé), aucune clé (F12-PO-3).
- **Aucune mesure réelle chez les personnes** (Web Vitals en production) : elle passerait par la mesure (PostHog, Q56, Samuel).
- **Aucune maquette ni règle de Ligne nouvelle tranchée** : les valeurs de mise en page grand écran vont dans `provisoire.css`, comme les autres valeurs sans token (Q177).
- **Aucune déclaration de conformité** ni audit humain avec lecteur d'écran : questions à Samuel (Q170, Q171).
- **Aucune vue bureau propre aux agences** (cadrage, phase ultérieure) ni mise en page tablette dédiée entre 768 et 1023 px (F12-PO-5).

## Prérequis vérifiables
| Élément | Livré par | Utilisé par |
|---|---|---|
| Test e2e `budget: JavaScript initial de la Journée`, `src/contracts/values.ts`, `zod/mini` côté client, règle de lint 0016 § 3.1 règle 4 | T4 (décision 0016 § 3.2, pas encore fusionnée au 2026-10-10) | F12a (étend la mesure), F12d |
| `TripShell`, layout `(programme)`, `Sheet`, `DayMap`, `visibleInsets`, `fitPadding`, lien d'évitement | F5a (#54, fusionnée) | F12b |
| Fiche étape dans le panneau, `DestinationPlate`, `ChecklistRow`, état final de `Sheet` | F5b (#66, en revue), F5c (à venir) | F12b |
| Pages du panneau Remplacer, Ajouter un lieu, Déplacer | F7a, F7b, F7c (à venir) | F12b (si fusionnées), F12d |
| Présentation, `PreferenceSheet` (feuille modale `Dialog`) | F6 (#44, fusionnée) | F12c, F12d |
| Écrans 1 à 5 et connexion | F8a à F8c (à venir) | F12c (si fusionnés), F12d |
| Écrans 9 et 10, paiement simulé, confirmation | F9a (#86, en revue), F9b (à venir) | F12c (si fusionnés), F12d |
| Écran 15, vue partagée, page de repli hors ligne | F10a, F10b (spec #76 en revue) | F12c (si fusionnés), F12d |
| Mes voyages, Après le voyage, pages introuvable et erreur, catalogue `/dev/etats` | F11a, F11b, F11c (à venir) | F12c (si fusionnés), F12d |
| Page d'accueil et section « Démonstration » | D1 (#59, fusionnée) | F12a, F12c |

## Périmètre
- Mesure Lighthouse en CI, budgets du § 14 et budgets étendus (F12a, F12d).
- Inventaire des routes de l'application, partagé par la mesure et la passe d'accessibilité (F12a).
- Mise en page grand écran du voyage : Séjour, Journée, Fiche, et tout ce qui s'affiche dans le panneau du voyage (F12b).
- Mise en page grand écran des autres écrans : colonne centrée (F12c).
- Passe d'accessibilité transversale et corrections (F12d).

## Découpage et prérequis (F12-PO-14 ; ordre : CEO, Q175)
| PR | Contenu | Prérequis | Peut commencer |
|---|---|---|---|
| **F12a** — Mesure | Lighthouse en CI (Séjour et Journée avec seuils, autres routes journalisées), budget de JavaScript initial étendu, inventaire des routes, règle « toute nouvelle route s'inscrit à l'inventaire » | T4 | **Avant F5c à F11**, dès T4 fusionnée : les écrans suivants sont mesurés dès leur arrivée |
| **F12b** — Grand écran du voyage | Carte à gauche, panneau de 420 px à droite, bascule au seuil sans perte d'état, recentrage tiré du conteneur (0016 § 1.3), projet de test « grand écran » | F5c (fiche et `Sheet` dans leur état final), F12a | **Avant F7 à F11**, après F5c ; les pages de F7 arrivées ensuite gardent ses tests verts (F12-PO-15) |
| **F12c** — Grand écran des autres écrans | Colonne centrée commune à tous les écrans hors voyage, présentation et feuilles modales en grand écran | F12a | **Avant F8 à F11** : couvre les écrans présents dans `main` à son démarrage ; les écrans livrés ensuite adoptent la colonne commune (F12-PO-15) |
| **F12d** — Passe d'accessibilité et clôture des budgets | Balayage de toutes les routes de l'inventaire (mobile, 320 px, paysage, grand écran), corrections, budgets du § 14 atteints sur l'état final | F5 à F11 fusionnées, F12a, F12b, F12c | Seulement à la fin : c'est la PR qui ferme la ligne F12 du handover |

Fichiers partagés à ne pas modifier en parallèle (pour l'ordre du CEO) : `package.json` et `pnpm-lock.yaml` (F12a), `.github/workflows/ci.yml` (F12a), `playwright.config.ts` (F12a, F12b), `src/features/sejour/TripShell.tsx`, `src/components/ligne/Sheet.tsx` et `DayMap` (F12b, comme F5c et F7), `src/components/ligne/provisoire.css` (F12b, F12c), `src/app/layout.tsx` (F12c), `src/components/ui/dialog.tsx` (F12c).

## Choix réservés au Tech Lead (signalés, non tranchés ici)
Propositions détaillées dans « Propositions au Tech Lead » ; le frontend les soumet dans sa PR et le Tech Lead les confirme à la revue ou par une décision dans `docs/decisions/`. Les critères qui en dépendent portent « sous réserve de F12-TL-x ».
- Outil de mesure Lighthouse, version, configuration, nombre de passages et statistique retenue, place dans la CI (F12-TL-1, F12-TL-2).
- Inventaire des routes : forme, emplacement, jeux de paramètres (F12-TL-3).
- Extension du test de JavaScript initial (F12-TL-4).
- Mécanisme de bascule au seuil de 1024 px : CSS seul ou mesure dans le navigateur ; mode « panneau latéral » de `Sheet` (F12-TL-5, F12-TL-6).
- Projet Playwright « grand écran » et ses scénarios (F12-TL-7).
- Outillage des vérifications de la passe d'accessibilité (F12-TL-8).
- Emplacement et noms des fichiers ci-dessous.

## Fichiers à créer ou modifier (proposition)
**F12a** : `tests/perf/` (configuration et script Lighthouse, F12-TL-1) ; `tests/e2e/routes.ts` (inventaire, F12-TL-3) et son test ; extension du test de budget de T4 (F12-TL-4) ; `package.json` (script `test:perf`, dépendance de développement si retenue, versions notées dans `docs/decisions/0003-versions.md`) ; `.github/workflows/ci.yml` (job ou étape de mesure, F12-TL-2) ; `tests/e2e/README.md` (règle d'inscription à l'inventaire).

**F12b** : `src/features/sejour/TripShell.tsx`, `src/components/ligne/Sheet.tsx` (mode latéral, F12-TL-6) et leurs tests ; `src/components/carte/*` si le recentrage doit lire le conteneur (0016 § 1.3) ; `src/components/ligne/provisoire.css` (`--ligne-panneau-large: 420px`, Q177) ; `playwright.config.ts` (projet « grand écran », F12-TL-7) ; `tests/e2e/grand-ecran-voyage.e2e.spec.ts`, `tests/e2e/grand-ecran-voyage.a11y.spec.ts`, `tests/visual/grand-ecran-voyage.visual.spec.ts` et leurs références.

**F12c** : composant de colonne commune (nom proposé `PageColumn`, `src/components/ligne/` ou `src/components/ui/`, F12-TL-5) et son test ; écrans hors voyage présents dans `main` (remplacement de leurs `max-w-md` locaux par la colonne commune) ; `src/components/ui/dialog.tsx` (feuille modale en grand écran) ; `provisoire.css` (`--ligne-colonne`, Q177) ; `tests/e2e/grand-ecran-ecrans.e2e.spec.ts`, `.a11y.spec.ts`, `tests/visual/grand-ecran-ecrans.visual.spec.ts`.

**F12d** : `tests/e2e/accessibilite-balayage.a11y.spec.ts` (balayage de l'inventaire, F12-TL-8) ; corrections dans les fichiers des écrans concernés (chacune listée dans la PR avec le critère WCAG et l'écran) ; références visuelles touchées ; `src/app/layout.tsx` si la balise `viewport` doit changer.

## Comportement

### Budgets de performance (F12-PO-1 à F12-PO-4) [a][d]
**Mesure Lighthouse** (F12-PO-1, F12-PO-3) :
- Profil **mobile** de Lighthouse (émulation d'un téléphone et ralentissement réseau et processeur simulés, réglages par défaut de l'outil), build de production servi comme l'image Docker (`scripts/serve-standalone.mjs`), adaptateur simulé, domaines Google bloqués comme dans tous les tests e2e : la carte est dans son état de remplacement, le JavaScript de Google n'est pas compté (handover § 14 « hors carte »).
- Catégories mesurées : performance et accessibilité (seuils ci-dessous) ; bonnes pratiques et référencement journalisés sans seuil.
- **Seuils bloquants** :
  - `R11` `/voyages/mock_trip_edimbourg` (Séjour, l'adresse du handover) : performance ≥ 90, accessibilité = 100 ;
  - `R12` `/voyages/mock_trip_edimbourg/jour/2` (Journée, la route du budget de JavaScript) : performance ≥ 90, accessibilité = 100 (F12-PO-2 : la Journée est l'écran le plus ouvert pendant le voyage).
- **Accessibilité = 100 sur toutes les routes de l'inventaire** (F12-PO-2) ; performance journalisée sans seuil sur les autres routes, pour voir les régressions.
- Chaque mesure est répétée et le score retenu est stable d'un passage à l'autre (statistique : F12-TL-1). Un dépassement fait échouer la CI ; le rapport de la mesure est un artefact de la CI, jamais publié ailleurs.
- Un score insuffisant ne se règle pas en changeant le profil, le ralentissement ou le seuil : la PR donne la mesure et le Tech Lead tranche par une décision écrite (même règle que 0016 § 3.1).

**JavaScript initial** (F12-PO-4) : la méthode du test de T4 (0016 § 3.1 règle 5 : scripts de l'origine jusqu'à l'inactivité du réseau, `gzipSync`, carte comprise) s'applique, **strictement sous 200 000 octets**, à `R12` (déjà), `R11`, `R6` (présentation, premier écran après la génération) et `R15` (pendant le voyage, si F10a est fusionnée) ; elle est journalisée sans seuil sur les autres routes de l'inventaire. Une route qui dépasse : la PR le dit avec sa mesure, le Tech Lead tranche (le seuil ne se relève pas sans décision écrite).

**Inventaire des routes** (F12-PO-13) [a] : une liste unique des routes de l'application présentes dans `main`, avec des paramètres du jeu simulé (voyage, jour, étape, état). Elle sert à la mesure et au balayage d'accessibilité. À partir de la fusion de F12a, toute PR qui ajoute une route l'inscrit dans l'inventaire (critère de revue ; un test échoue si une page de `src/app` hors `/dev` n'y figure pas, sous réserve de F12-TL-3).

### Grand écran : seuil et principe (F12-PO-5, F12-PO-6) [b][c]
- Seuil : **largeur de la fenêtre ≥ 1024 px CSS** (`min-width: 1024px`), quelle que soit la hauteur. En dessous (téléphones, téléphones en paysage, tablettes en portrait, fenêtre zoomée à 200 % sur un écran de 1280 px), la mise en page mobile s'applique sans changement.
- Le contenu, les textes, les actions, l'ordre de lecture et l'ordre du document sont **les mêmes** des deux côtés du seuil : seule la disposition change. Aucun contenu n'est propre au grand écran, aucun n'y est retiré. L'ordre visuel suit l'ordre du document (WCAG 1.3.2, 2.4.3) : pas de réordonnancement par CSS.
- Aucune valeur de mise en page en dur : la largeur du panneau et celle de la colonne sont des variables de `provisoire.css` (Q177).

### Grand écran du voyage : Séjour, Journée, Fiche et panneau (F12-PO-7 à F12-PO-10) [b]
Concerne toutes les pages sous `(programme)` (0016 § 1.1) et leur pendant `/dev/voyages`.
1. **Disposition** : carte à gauche, sur toute la hauteur, largeur flexible ; panneau à droite, **420 px**, sur toute la hauteur, fond `page`, séparé de la carte par un contour `hairline` (rendu : UX/UI). Le panneau ne chevauche pas la carte.
2. **Pas de feuille coulissante** : ni poignée, ni « Agrandir le panneau » / « Réduire le panneau », ni glisser vertical, ni points d'arrêt. Le panneau garde son nom de région (« Programme » ou « Fiche étape ») ; `DayTabs` reste en tête du panneau, toujours visible ; le contenu défile **dans** le panneau, la page elle-même ne défile pas.
3. **Carte** : « Retour » en haut à gauche de la carte, inchangé. La zone visible de la carte est toute la carte (aucune marge basse due au panneau) : le cadrage initial (`fitPadding`) et le recentrage sur une étape (`visibleInsets`) sont calculés à partir de la mesure de la **zone de la carte**, pas de la fenêtre (condition de 0016 § 1.3).
4. **Synchronisation** (F5) inchangée, sauf ce qui touche la hauteur : toucher un marqueur ferme une fiche ouverte, fait défiler la liste jusqu'à l'étape, laisse le focus sur le marqueur ; toucher une étape ouvre sa fiche dans le panneau, focus sur son titre, et recentre la carte sur l'étape au milieu de la zone de la carte ; déplacer ou zoomer la carte ne change ni la liste ni l'adresse.
5. **Fiche, Remplacer, Ajouter un lieu, Déplacer** : s'affichent dans le panneau comme sur mobile (mêmes adresses, même historique, même focus, même fermeture par Échap) ; leurs actions de fin d'écran restent dans le panneau.
6. **Bascule au seuil** (redimensionnement de la fenêtre, rotation d'une tablette) : sans rechargement ni nouvelle requête de page ; l'adresse, la fiche ouverte, le jour, le marqueur sélectionné et l'élément qui a le focus sont conservés ; en repassant sous le seuil, le panneau reprend la hauteur qu'il avait avant (rien n'est stocké hors de la mémoire de la page).
7. **Conformité Google** : le logo et les mentions de la carte Google restent dans la zone de la carte, jamais couverts par le panneau ; aucune donnée de lieu Google n'apparaît ailleurs que sur cette carte ou avec la mention « Données de lieux : Google » (handover § 8).
8. **Mouvement** : pas d'animation de bascule ; le recentrage de la carte suit les règles de F5 (`setCenter` sous `prefers-reduced-motion`).

### Grand écran des autres écrans (F12-PO-11, F12-PO-12) [c]
Concerne : accueil, présentation (6, 6b, 7, 8), création (1 à 5) et connexion, Débloquer, paiement simulé et confirmation, Programme ajusté, Pendant le voyage, vue partagée (sans carte, F10), Mes voyages, Après le voyage, pages introuvable et erreur, page de repli hors ligne.
- **Colonne centrée** commune, de la largeur de la colonne mobile actuelle (`max-w-md`, 28 rem, valeur par défaut provisoire, UX/UI), centrée horizontalement sur le fond `page` ; marges latérales `space-5` en dessous de cette largeur ; aucun texte ne s'étire sur toute la largeur de l'écran.
- Les actions de fin d'écran (décision 0018) gardent la largeur de la colonne ; une barre d'actions fixée en bas de l'écran sur mobile reste alignée sur la colonne.
- **Présentation** : la carte de proposition garde la largeur de la colonne ; geste à la souris par les mêmes Pointer Events et les mêmes seuils, mesurés sur la largeur **de la carte** (F6-PO-4), jamais de la fenêtre ; flèches gauche et droite et boutons inchangés.
- **Feuilles modales** (question de préférence de l'écran 7, et toute feuille construite sur `Dialog`) : restent modales (piège à focus, Échap, retour du focus, titre lié) ; en grand écran, centrées dans la colonne plutôt qu'en bas de l'écran (provisoire, UX/UI).
- Un écran livré après F12c utilise la colonne commune (F12-PO-15).

### Passe d'accessibilité transversale (F12-PO-16 à F12-PO-20) [d]
Sur **chaque route de l'inventaire et chaque état listé par sa spécification** (fiche ouverte, feuille ouverte, toast, bandeau hors ligne, message de champ, état vide), aux tailles suivantes : 390 × 844 (mobile, référence), 320 × 568 (équivalent d'un zoom à 400 % d'un écran de 1280 px), 844 × 390 (téléphone en paysage), 1280 × 800 (grand écran, souris, sans toucher).
- **axe** sans violation (règles WCAG 2.0, 2.1 et 2.2 A et AA de l'outil), et Lighthouse accessibilité = 100 (ci-dessus).
- **Redimensionnement (1.4.10)** : à 320 px de large, la page ne défile pas horizontalement ; seuls défilent horizontalement, dans leur propre conteneur, la rangée `DayTabs` et la carte. Aucun texte coupé ni chevauché.
- **Espacement du texte (1.4.12)** : avec l'interligne à 1,5, l'espacement des paragraphes à 2 fois la taille, des lettres à 0,12 et des mots à 0,16 fois la taille, aucun texte n'est coupé ni masqué (boutons de hauteur fixe compris : le texte passe à la ligne et le bouton grandit, ou le texte reste lisible en entier).
- **Agrandissement (1.4.4)** : au zoom 200 % du navigateur, tout le contenu et toutes les actions restent accessibles ; la balise `viewport` n'empêche pas le zoom (ni `maximum-scale` ni `user-scalable=no`).
- **Orientation (1.3.4)** : aucune page ne verrouille l'orientation ; en paysage (844 × 390), le panneau du voyage reste utilisable à ses trois hauteurs et son contenu atteignable.
- **Focus visible et non masqué (2.4.7, 2.4.11)** : en parcourant chaque page à la touche Tab, chaque élément qui reçoit le focus a le contour de Ligne (2 px `line`, décalé de 2 px) et n'est jamais entièrement caché par le panneau, un toast, un bandeau ou une barre fixée. Un marqueur de carte qui reçoit le focus alors qu'il est sous le panneau est amené par la carte dans la zone visible, sans être sélectionné et sans changer la liste (F12-PO-18).
- **Ordre du focus (2.4.3)** : il suit l'ordre de lecture, en mobile comme en grand écran ; un lien d'évitement mène à la liste du voyage (existant, F4/F5) et reste le premier élément atteignable de la carte.
- **Cibles (2.5.8)** : chaque élément interactif mesure au moins 44 × 44 px, à toutes les tailles (handover § 0 règle 8).
- **Gestes (2.5.7)** : chaque glisser a son équivalent bouton (présentation, panneau, Déplacer) ; en grand écran, sans panneau coulissant, le seul glisser restant est celui de la présentation.
- **Mouvement réduit** : sous `prefers-reduced-motion: reduce`, aucune rotation de carte de présentation, aucun tracé animé, aucune transition de hauteur du panneau, aucun `panTo` animé ; les fondus restent permis (handover § 7).
- **Titres de page (2.4.2)** : chaque route a un titre de document non vide, au format fixé par sa spécification, et deux routes différentes n'ont jamais le même titre (sauf pages d'erreur, qui ne révèlent rien, F11-PO-17).
- **Langue (3.1.1)** : `lang="fr"` sur chaque page.
- **Messages d'état (4.1.3)** : décisions de la présentation, remplacements, ajouts, retraits, attentes et bandeaux sont annoncés par `role="status"` (ou `alert` selon la décision UX/UI en vigueur, Q13) sans déplacer le focus.
- **Couleurs forcées** (mode contraste élevé de Windows, `forced-colors: active`) : le contour de focus reste visible et chaque contrôle reste identifiable par un contour ou un texte ; les tags gardent leur texte (« À réserver », « À confirmer », « Non confirmé »). Vérifié par capture, sans seuil automatique (F12-PO-19).
- **Corrections** : chaque écart trouvé est corrigé dans F12d s'il tient dans le périmètre d'un écran existant, sans changer son comportement ; un écart qui demande un changement de comportement ou de rendu est listé dans la PR et renvoyé au rôle concerné (Product Owner, UX/UI) au lieu d'être tranché dans F12d (F12-PO-20).

## Événements de mesure
Aucun ajout ni changement (handover § 12). La disposition (mobile ou grand écran) n'est pas mesurée en phase 0 (F12-PO-21).

## Règles Google et données personnelles
- Aucune donnée Google dans un prompt : F12 n'appelle aucun modèle.
- Rien n'est stocké côté client : la bascule au seuil et la hauteur du panneau vivent en mémoire de la page (aucun `localStorage`, `sessionStorage`, IndexedDB, cookie).
- Données de lieux Google affichées seulement sur la carte Google ou avec la mention d'attribution ; en grand écran, la carte et ses mentions ne sont jamais couvertes (F12-PO-9).
- La mesure Lighthouse n'envoie rien hors de la CI : pas de rapport public, pas de serveur de rapports tiers ; les pages mesurées ne contiennent que le jeu simulé.

## Tests

### Unitaires (Vitest, Testing Library, axe)
- [b] `Sheet` en mode latéral : pas de poignée, pas de point d'arrêt, région nommée, contenu défilant ; repasse en mode coulissant avec sa hauteur précédente.
- [b] Fonctions de cadrage et de recentrage avec une zone de carte qui n'est pas la fenêtre : le centre calculé place l'étape au milieu de la zone de la carte.
- [c] Colonne commune : largeur maximale, centrage, marges ; axe sans violation.
- [a] Inventaire des routes : chaque page de `src/app` hors `/dev` y figure (sous réserve de F12-TL-3).

### E2E, a11y, visuel et mesure (Playwright et Lighthouse, build de production, domaines Google bloqués)
- [a] `test:perf` (nom proposé) : Lighthouse sur l'inventaire, seuils de `R11` et `R12`, accessibilité = 100 partout ; budget de JavaScript étendu.
- [b] `tests/e2e/grand-ecran-voyage.*` à 1280 × 800 (souris, sans toucher) et à 1024 × 768 ; bascule 390 ↔ 1280.
- [c] `tests/e2e/grand-ecran-ecrans.*` à 1280 × 800 sur chaque écran hors voyage présent dans `main`.
- [d] `tests/e2e/accessibilite-balayage.a11y.spec.ts` : l'inventaire aux quatre tailles, avec les vérifications de la passe.
- Références visuelles grand écran régénérées selon la décision 0004.

## Décisions (Product Owner, définitives sans veto de Samuel sous 2 jours)
Une décision marquée « provisoire (UX/UI) » porte sur un rendu non maquetté (grand écran, Q7) et peut être changée par UX/UI sans nouvelle décision du Product Owner. Aucune ne modifie les règles de Ligne (Q177), la cible, l'offre ni les phases ; aucune n'engage de dépense ni de compte (Q171, Q172). Les décisions décrivent des besoins fonctionnels ; quand un mécanisme est nécessaire, il est renvoyé au Tech Lead (« mécanisme : F12-TL-x »).

À reporter dans la note de version, en plus de la liste ci-dessous : **F12-PO-2 et F12-PO-4 étendent les budgets du handover § 14** (performance de la Journée, accessibilité = 100 sur toutes les routes, JavaScript initial sur le Séjour, la présentation et l'écran 15).

- **F12-PO-1 — Conditions de mesure.** Profil mobile de Lighthouse, réglages par défaut, build de production servi comme l'image Docker, jeu simulé, domaines Google bloqués (carte de remplacement, JavaScript de Google non compté, comme « hors carte » du handover § 14). Raison : mesure reproductible en CI sans clé ni compte ; la mesure avec la vraie carte attend une clé de test (Q172) et sera journalisée sans seuil (mécanisme : F12-TL-1).
- **F12-PO-2 — Routes et seuils.** Seuils du handover sur le Séjour (`R11`, performance ≥ 90, accessibilité = 100) ; mêmes seuils sur la Journée (`R12`), l'écran le plus ouvert pendant le voyage et celui du budget de JavaScript ; accessibilité = 100 sur toutes les routes de l'inventaire, parce que les tests axe par écran le promettent déjà ; performance journalisée ailleurs.
- **F12-PO-3 — Rien hors de la CI.** Aucun envoi de rapport vers un service tiers, aucun tableau de bord hébergé ; le rapport est un artefact de la CI. Raison : phase 0, aucun compte ni service externe (CONTEXT).
- **F12-PO-4 — JavaScript initial.** Même méthode et même seuil (strictement sous 200 000 octets, carte comprise) que T4, étendus au Séjour, à la présentation et à l'écran 15 ; journalisé ailleurs. Raison : ce sont les écrans du parcours principal et du voyage, souvent ouverts en itinérance (réseau lent, forfait limité) ; la présentation conditionne la conversion (cadrage § 4). Un dépassement est tranché par le Tech Lead, jamais par un relèvement silencieux (mécanisme : F12-TL-4).
- **F12-PO-5 — Seuil de 1024 px.** Largeur de la fenêtre ≥ 1024 px CSS, sans condition de hauteur ; pas de troisième disposition pour les tablettes (768 à 1023 px restent en mobile). Raison : handover § 6 ; un zoom à 200 % sur un écran de 1280 px repasse en mobile, ce qui sert le redimensionnement (WCAG 1.4.10).
- **F12-PO-6 — Même contenu des deux côtés du seuil.** Seule la disposition change ; ordre du document identique, aucun contenu propre au grand écran. Raison : un seul parcours à tester et à documenter, ordre de lecture stable (WCAG 1.3.2, 2.4.3).
- **F12-PO-7 — Voyage en grand écran.** Carte à gauche flexible, panneau de 420 px à droite sur toute la hauteur, sans poignée ni points d'arrêt ni glisser, `DayTabs` toujours visible en tête, défilement dans le panneau (handover § 6). Rendu du séparateur et des marges : provisoire (UX/UI).
- **F12-PO-8 — Tout ce qui vit dans le panneau y reste.** Fiche, Remplacer, Ajouter un lieu, Déplacer s'affichent dans le panneau latéral, avec les mêmes adresses, le même historique et le même focus que sur mobile. Raison : un seul modèle de navigation (règles de navigation du handover § 6, F5-PO-8).
- **F12-PO-9 — Carte jamais couverte.** En grand écran, le panneau ne chevauche pas la carte ; cadrage et recentrage tirés de la zone de la carte (condition de 0016 § 1.3) ; logo et mentions Google toujours visibles. Raison : lisibilité et conformité Google (handover § 8).
- **F12-PO-10 — Bascule sans perte.** Passer le seuil dans un sens ou dans l'autre ne recharge rien et conserve l'adresse, la fiche, le jour, la sélection et le focus ; en revenant en mobile, le panneau reprend sa hauteur précédente. Raison : tablettes qui pivotent, fenêtres redimensionnées ; principe « rien ne change sans aperçu ».
- **F12-PO-11 — Colonne centrée ailleurs.** Les écrans hors voyage gardent la largeur de la colonne mobile, centrée ; aucun texte ni bouton étiré sur toute la largeur. Largeur : `max-w-md` actuel par défaut, provisoire (UX/UI). Raison : écrans conçus pour une colonne (maquettes mobiles), lignes de texte lisibles.
- **F12-PO-12 — Présentation et feuilles modales en grand écran.** Seuils du geste mesurés sur la carte, pas sur la fenêtre (F6-PO-4 inchangé) ; feuilles modales centrées dans la colonne, toujours modales. Rendu : provisoire (UX/UI).
- **F12-PO-13 — Inventaire des routes.** Une liste unique des routes, tenue à jour par chaque PR qui ajoute une page à partir de F12a, sert à la mesure et au balayage ; une page oubliée fait échouer un test. Raison : la passe finale ne doit pas dépendre de la mémoire des agents (mécanisme : F12-TL-3).
- **F12-PO-14 — Découpage proposé au CEO.** Quatre PR, chacune vérifiable par ses seuls critères (étiquetés [a], [b], [c], [d]) :
  - **F12a** (mesure) : après T4, avant F5c à F11 ;
  - **F12b** (grand écran du voyage) : après F5c et F12a, avant F7 de préférence ;
  - **F12c** (grand écran des autres écrans) : après F12a, à tout moment ensuite ;
  - **F12d** (passe d'accessibilité et clôture des budgets) : après F5 à F11, F12a, F12b et F12c ; c'est elle qui atteint « Budgets du § 14 » sur l'état final.
  Le CEO ordonne les tâches pour qu'aucune paire ne modifie le même fichier en parallèle (liste du § « Découpage et prérequis ») (Q175).
- **F12-PO-15 — Les écrans suivants s'y conforment.** Une fois F12a fusionnée, chaque PR d'écran inscrit ses routes à l'inventaire et garde les budgets verts ; une fois F12b (ou F12c) fusionnée, chaque PR qui touche le voyage (ou un écran hors voyage) garde les tests grand écran verts et joint une capture 1280 × 800 en plus de la capture 390 × 844. Raison : F12d ne doit pas tout reprendre à la fin.
- **F12-PO-16 — Tailles de la passe.** 390 × 844, 320 × 568, 844 × 390, 1280 × 800 (souris, sans toucher). Raison : référence du handover, zoom à 400 % (1.4.10), orientation (1.3.4), grand écran.
- **F12-PO-17 — Critères WCAG 2.2 vérifiés par la passe.** 1.3.2, 1.3.4, 1.4.4, 1.4.10, 1.4.12, 2.4.2, 2.4.3, 2.4.7, 2.4.11, 2.5.7, 2.5.8, 3.1.1, 4.1.3, en plus d'axe et de Lighthouse. Raison : ce sont les critères AA que les tests par écran (axe à 390 × 844) ne voient pas.
- **F12-PO-18 — Marqueur sous le panneau.** Un marqueur qui reçoit le focus au clavier alors qu'il est couvert par le panneau est ramené par la carte dans la zone visible, sans être sélectionné, sans changer la liste ni l'adresse. Raison : WCAG 2.4.11 (focus non masqué) sans changer la synchronisation de F5 (sélection = toucher, pas focus).
- **F12-PO-19 — Couleurs forcées.** Vérifiées par capture (contour de focus visible, contrôles identifiables, tags avec texte), sans seuil automatique. Raison : utile aux personnes malvoyantes, sans critère AA mesurable par un outil.
- **F12-PO-20 — Corrections de la passe.** Corrigées dans F12d sans changer de comportement ; tout changement de comportement ou de rendu est renvoyé au rôle qui en décide. Raison : F12 vérifie, elle ne réécrit pas les spécifications de F5 à F11.
- **F12-PO-21 — Pas de nouvel événement.** La disposition n'est pas mesurée en phase 0. Raison : collecte minimale ; la part du grand écran se mesurera avec la mesure réelle (Q56).

## Propositions au Tech Lead (architecture et tests, à confirmer à la revue de la PR de code ou par une décision dans `docs/decisions/`)
- **F12-TL-1 — Outil de mesure.** Paquet `lighthouse` (Node, sans compte) en dépendance de développement, version stable notée dans `docs/decisions/0003-versions.md`, lancé sur le Chromium de Playwright déjà installé (pas de second navigateur) ; profil mobile par défaut ; trois passages par route, **médiane** retenue ; domaines Google bloqués comme dans les tests e2e ; rapports HTML et JSON en artefact de la CI. `@lhci/cli` est possible à condition d'un dépôt de rapports en système de fichiers uniquement (jamais le stockage public temporaire). Point d'attention : la variance des machines de CI ; si la médiane de trois passages fluctue de plus de 5 points, augmenter le nombre de passages plutôt que baisser le seuil.
- **F12-TL-2 — Place dans la CI.** Un job séparé de `verify` (même build, image Docker ou `serve-standalone`), requis pour la fusion, pour ne pas allonger `pnpm verify` en local ; script `pnpm test:perf` pour la lancer à la main. `pnpm verify` reste sans réseau ni clé.
- **F12-TL-3 — Inventaire.** Un module TypeScript `tests/e2e/routes.ts` qui exporte, pour chaque route, son adresse avec paramètres du jeu simulé, ses états (paramètres ou actions Playwright pour les atteindre), le drapeau `VADROUILLE_DEV_PAGES` si besoin ; un test unitaire compare les `page.tsx` de `src/app` (hors `/dev`) à l'inventaire. Les routes de développement à carte simulée (`/dev/voyages`) servent aux critères de recentrage.
- **F12-TL-4 — JavaScript initial étendu.** Le test de T4 devient paramétré par l'inventaire : seuil sur `R11`, `R12`, `R6`, `R15` (si présente), mesure journalisée ailleurs ; même méthode (0016 § 3.1 règle 5).
- **F12-TL-5 — Bascule.** CSS d'abord (`@media (min-width: 1024px)`, variante Tailwind `lg:`) pour la disposition, sans différence de rendu serveur entre les deux dispositions (pas de saut de mise en page au chargement) ; mesure dans le navigateur (`matchMedia`) seulement là où le comportement change (`Sheet`, `visibleInsets`), lue après le montage. Colonne commune : un composant unique, sans valeur en dur (`--ligne-colonne`).
- **F12-TL-6 — `Sheet` latéral.** Prop ou mode déduit de la largeur : sans poignée ni gestionnaires de pointeur, hauteur 100 % du conteneur, largeur `--ligne-panneau-large` ; `snap` conservé dans l'état de `TripShell` mais ignoré ; `visibleInsets` et `fitPadding` tirés de la mesure du conteneur de la carte (`ResizeObserver`), qui n'est plus la fenêtre (0016 § 1.3).
- **F12-TL-7 — Projet « grand écran ».** Projet Playwright à 1280 × 800, `isMobile: false`, `hasTouch: false`, qui exécute les specs `grand-ecran-*` et les scénarios du handover § 14 déjà écrits (au clavier et à la souris) ; captures de référence suffixées par la taille.
- **F12-TL-8 — Outillage de la passe.** axe avec les étiquettes `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa` ; défilement horizontal mesuré par `scrollWidth` du document ; espacement du texte par une feuille injectée puis comparaison `scrollHeight`/`clientHeight` des éléments à hauteur fixe ; parcours Tab qui vérifie à chaque pas le contour calculé et l'intersection avec le panneau, le toast et les barres fixées ; `page.emulateMedia({ reducedMotion: "reduce" })` et `forcedColors: "active"` ; pour le zoom, `viewport` CSS équivalent.

## Critères d'acceptation
Chaque critère porte l'étiquette de la PR qui le vérifie (F12-PO-14) : [a] F12a, [b] F12b, [c] F12c, [d] F12d ; [a][b][c][d] pour un critère que chaque PR vérifie sur ses propres fichiers et écrans.

Transverses :
- [ ] **C1** [a][b][c][d] `pnpm verify` passe, sans clé ni service externe ; aucune requête vers un autre hôte que l'application pendant les tests de F12 (zéro requête interceptée), mesure Lighthouse comprise.
- [ ] **C2** [a][b][c][d] Aucune couleur, taille ni valeur en `px` en dur hors `provisoire.css` ; aucun texte hors `fr.json` ; aucune écriture dans le stockage du navigateur (règle `noClientStorage`).
- [ ] **C3** [b][c][d] Les captures 390 × 844 **et** 1280 × 800 de chaque écran touché sont jointes pour validation (handover § 6 « implémenter, capturer, signaler ») ; la PR liste les rendus provisoires (UX/UI, Q7, Q173), les choix soumis au Tech Lead et l'absence de maquette (Q12).
- [ ] **C4** [a][b][c][d] Le test `budget: JavaScript initial de la Journée` reste strictement sous 200 000 octets ; chaque PR donne la mesure avant et après.

Mesure [a] :
- [ ] **C5** [a] Lighthouse, profil mobile, sur le build de production avec domaines Google bloqués : `/voyages/mock_trip_edimbourg` et `/voyages/mock_trip_edimbourg/jour/2` ont performance ≥ 90 et accessibilité = 100 (médiane, sous réserve de F12-TL-1) ; un seuil manqué fait échouer le job ; le rapport est un artefact de la CI (test `perf: budgets du § 14`). Si un seuil n'est pas atteint au moment de F12a, la PR le dit avec la mesure et le seuil devient bloquant à F12d au plus tard (décision du Tech Lead à la revue).
- [ ] **C6** [a] Toutes les routes de l'inventaire sont mesurées ; accessibilité = 100 sur chacune ; performance, bonnes pratiques et référencement journalisés (test `perf: inventaire`).
- [ ] **C7** [a] JavaScript initial strictement sous 200 000 octets sur `R11`, `R12` et `R6`, et sur `R15` si F10a est fusionnée ; mesure journalisée sur les autres routes (test `budget: JavaScript initial par route`, sous réserve de F12-TL-4).
- [ ] **C8** [a] Un test échoue si une page de `src/app` hors `/dev` ne figure pas dans l'inventaire (test unitaire, sous réserve de F12-TL-3) ; `tests/e2e/README.md` décrit la règle d'inscription.
- [ ] **C9** [a] Aucune requête vers un serveur de rapports, un stockage public ou un hôte autre que l'application pendant la mesure (journal réseau du job) ; versions des outils ajoutés notées dans `docs/decisions/0003-versions.md`.

Grand écran du voyage [b] :
- [ ] **C10** [b] À 1280 × 800, `/voyages/mock_trip_edimbourg/jour/2` : la carte occupe la gauche, le panneau mesure 420 px de large et toute la hauteur, à droite ; leurs rectangles ne se chevauchent pas ; la page ne défile pas, le contenu du panneau défile ; aucune poignée ni bouton « Agrandir le panneau » / « Réduire le panneau » ; `DayTabs` visible en tête du panneau après un défilement du contenu (test `grand écran: disposition du voyage`).
- [ ] **C11** [b] À 1024 × 768, même disposition ; à 1023 × 768, mise en page mobile (panneau coulissant à 55 %, poignée présente) (test `grand écran: seuil`).
- [ ] **C12** [b] Sur la page de développement à carte simulée, à 1280 × 800 : toucher une étape ouvre sa fiche dans le panneau, focus sur son titre, et le marqueur de l'étape est au milieu de la zone de la carte à 1 px près ; toucher un marqueur fait défiler la liste jusqu'à l'étape et laisse le focus sur le marqueur ; déplacer la carte ne change ni la liste ni l'adresse (test `grand écran: synchronisation`).
- [ ] **C13** [b] Fiche ouverte depuis la liste à 1280 × 800 : « Fermer » et Échap la ferment et rendent le focus au lien d'origine ; le retour du navigateur ne la rouvre pas ; mêmes adresses qu'en mobile ; si F7 est fusionnée, Remplacer, Ajouter un lieu et Déplacer s'affichent dans le panneau latéral avec leurs actions (tests).
- [ ] **C14** [b] **Bascule** : fiche ouverte à 390 × 844 avec le panneau à 92 %, passage à 1280 × 800 puis retour à 390 × 844, sans rechargement (aucune nouvelle requête de document) : adresse identique, fiche toujours ouverte, élément focalisé identique, panneau de nouveau à 92 % (test `grand écran: bascule sans perte`).
- [ ] **C15** [b] À 1280 × 800, le conteneur de la carte (et donc ses mentions et son logo) n'est couvert par aucun élément (aucun élément du panneau ne l'intersecte) (test, avec la carte de remplacement et la carte simulée).
- [ ] **C16** [b] axe sans violation à 1280 × 800 sur le Séjour, la Journée, la fiche ouverte et, si fusionnées, les pages de F7 ; contour de focus visible ; cibles ≥ 44 × 44 px ; un seul titre de niveau 1 par état (test `grand-ecran-voyage.a11y`).
- [ ] **C17** [b] Sous `prefers-reduced-motion: reduce`, aucune transition lors de la bascule ni du recentrage (test).

Grand écran des autres écrans [c] :
- [ ] **C18** [c] À 1280 × 800, chaque écran hors voyage présent dans `main` au démarrage de F12c (au moins l'accueil et la présentation) a son contenu dans une colonne centrée de la largeur commune (écart gauche et droit égaux à 1 px près, largeur ≤ `--ligne-colonne`) ; aucun bouton ni texte ne dépasse la colonne (test `grand écran: colonne`).
- [ ] **C19** [c] Présentation à 1280 × 800, souris : glisser la carte de 31 % de **sa** largeur vers la droite décide « J'aime » ; 29 % lentement revient ; flèches gauche et droite et boutons inchangés ; `UndoToast` aligné sur la colonne et ne cache aucun bouton (test `grand écran: présentation`).
- [ ] **C20** [c] Question de préférence (écran 7) à 1280 × 800 : feuille modale centrée dans la colonne, focus sur son titre, piège à focus, Échap la ferme et rend le focus (test).
- [ ] **C21** [c] axe sans violation à 1280 × 800 sur chaque écran couvert ; cibles ≥ 44 × 44 px (test `grand-ecran-ecrans.a11y`).

Passe d'accessibilité et clôture [d] :
- [ ] **C22** [d] Toutes les routes de F5 à F11 sont dans l'inventaire ; chacune, avec les états listés par sa spécification, passe axe sans violation (étiquettes WCAG 2.2 A et AA) aux quatre tailles de F12-PO-16 (test `accessibilite: balayage`).
- [ ] **C23** [d] À 320 × 568, aucune route ne défile horizontalement (`scrollWidth` du document ≤ largeur de la fenêtre) ; seuls `DayTabs` et la carte défilent dans leur conteneur (test).
- [ ] **C24** [d] Avec la feuille d'espacement du texte (1.4.12) injectée, aucun élément de texte n'est coupé (aucun `scrollHeight` > `clientHeight` sur un élément à débordement masqué) sur chaque route à 390 × 844 (test).
- [ ] **C25** [d] La balise `viewport` ne contient ni `maximum-scale` ni `user-scalable=no` ; aucune page ne verrouille l'orientation ; à 844 × 390, les trois hauteurs du panneau sont atteignables par la poignée et le contenu défile (tests).
- [ ] **C26** [d] Parcours Tab complet de chaque route à 390 × 844 et à 1280 × 800 : chaque élément focalisé a le contour de Ligne, et aucun n'est entièrement couvert par le panneau, un toast, un bandeau ou une barre fixée ; un marqueur couvert par le panneau est ramené dans la zone visible au focus, sans `aria-pressed`/sélection ni changement d'adresse (test `accessibilite: focus non masqué`).
- [ ] **C27** [d] Sous `prefers-reduced-motion: reduce`, la présentation ne tourne pas, la ligne de génération ne se dessine pas, le panneau change de hauteur sans transition (durées de transition calculées nulles) (test).
- [ ] **C28** [d] Chaque route a un titre de document non vide au format de sa spécification ; deux routes différentes (hors pages d'erreur) n'ont jamais le même titre ; `lang="fr"` partout (test).
- [ ] **C29** [d] Captures en `forced-colors: active` de la Journée, de la présentation et d'un formulaire de F8 jointes à la PR (contour de focus visible, contrôles identifiables) ; sans seuil automatique.
- [ ] **C30** [d] **Budgets du § 14 atteints sur l'état final** : C5, C6 et C7 verts sur `main` après la fusion de F5 à F11 ; la PR donne le tableau des mesures par route (performance, accessibilité, JavaScript initial).
- [ ] **C31** [d] La PR liste chaque correction (critère WCAG, écran, fichier) et chaque écart renvoyé à un autre rôle sans correction (F12-PO-20).

## Hors périmètre
- Thème sombre ; mise en page tablette dédiée (768 à 1023 px) ; vues bureau des agences et espace agence (phase ultérieure, Q176).
- Mesure réelle des performances chez les personnes (Web Vitals, PostHog : Q56) ; mesure avec la vraie carte Google (Q172).
- Audit avec lecteurs d'écran (VoiceOver, TalkBack, NVDA) par des personnes, déclaration d'accessibilité, conformité à l'Acte européen sur l'accessibilité (Q170, Q171).
- Survol (états `hover`) et curseurs : aucun ajouté sans règle de Ligne (Q177).
- Optimisation des photos de lieux (Q6, pas de photos en phase 0) ; performance du back-end et des données réelles.
- Hors-ligne et service worker (F10) ; impression.

## Questions ouvertes
Nouvelles questions de cette spécification (numéros provisoires à partir de Q170 ; numéros définitifs attribués par le CEO dans `QUESTIONS.md`) :
- **Q170 (Samuel, juridique)** : faut-il publier une déclaration d'accessibilité, et l'Acte européen sur l'accessibilité (directive (UE) 2019/882, applicable depuis le 28 juin 2025 aux services de commerce électronique vendus à des consommateurs de l'UE) s'applique-t-il à Vadrouille, vendu depuis la Suisse à des personnes qui peuvent résider dans l'UE (exemption des microentreprises à vérifier) ? F12 vise WCAG 2.2 AA (handover § 11) sans rien déclarer. Bloque : la mise en production ; pas F12.
- **Q171 (Samuel, argent et tests utilisateurs)** : les agents ne peuvent pas utiliser VoiceOver, TalkBack ni NVDA. Un audit humain avec ces lecteurs d'écran est-il voulu avant la bêta (G2), par des testeurs internes ou par un prestataire payant ? Bloque : la vérification du rendu vocal et toute déclaration de conformité (Q170) ; pas le code de F12.
- **Q172 (Samuel, compte et clé ; liée à Q103)** : mesurer la performance avec la vraie carte Google demande une clé Maps JavaScript de test restreinte (et le Map ID) utilisable dans la CI ou sur un déploiement de prévisualisation. Faut-il en fournir une, avec quel plafond ? Bloque : la mesure de performance avec la carte réelle (journalisée sans seuil) ; pas les seuils de F12, mesurés sans carte (F12-PO-1).
- **Q173 (UX/UI ; suite de Q7)** : rendus grand écran : séparateur entre carte et panneau, marges du panneau latéral, largeur de la colonne commune (`max-w-md` par défaut), feuille modale centrée, alignement de `UndoToast` et des barres d'actions, captures de validation. Bloque : la validation visuelle de F12b et F12c ; pas le code.
- **Q174 (Tech Lead)** : propositions F12-TL-1 à F12-TL-8 (outil Lighthouse et médiane de trois passages, job séparé de `verify`, inventaire des routes et son test, budget de JavaScript paramétré, bascule CSS d'abord, `Sheet` latéral et mesure du conteneur de la carte, projet Playwright « grand écran », outillage de la passe). Bloque : le démarrage de F12a si le Tech Lead veut trancher avant ; sinon confirmées à la revue.
- **Q175 (CEO)** : découpage F12a, F12b, F12c, F12d (F12-PO-14), ordre avec T4, F5c, F7, F8, F9, F10, F11 et fichiers partagés (`package.json`, `ci.yml`, `playwright.config.ts`, `TripShell.tsx`, `Sheet.tsx`, `provisoire.css`, `dialog.tsx`, `layout.tsx`) ; règle F12-PO-15 à faire appliquer aux PR d'écran suivantes. Bloque : la création des tickets de code.
- **Q176 (Samuel, cible et phases)** : le cadrage (§ 3.1) range « vues bureau » parmi ce qui reste à maquetter, et les agences (phase ultérieure) travailleront surtout sur ordinateur. F12 livre une adaptation du parcours mobile à partir de 1024 px (handover § 6), sans vue bureau propre. Est-ce suffisant pour le MVP grand public, les vues bureau des agences restant hors du MVP ? Bloque : rien dans F12.
- **Q177 (Samuel, règle de Ligne ; complète Q37)** : Ligne n'a ni règle de mise en page au-delà du mobile, ni largeur de panneau latéral ou de colonne, ni état de survol. F12 met `--ligne-panneau-large` (420 px, handover § 6) et `--ligne-colonne` dans `provisoire.css` et n'ajoute aucun survol. Faut-il les intégrer à Ligne (tokens et règles « grand écran ») ? Bloque : rien ; les valeurs provisoires s'appliquent.

Questions existantes qui touchent F12 (reprises sans les trancher) :
- **Q7** (UX/UI, délégué) : mise en page grand écran ; F12 en fixe le besoin fonctionnel, UX/UI le rendu (Q173).
- **Q12, Q59** (Samuel) : maquettes et Dossier UX absents ; captures confrontées aux maquettes quand elles seront exportées.
- **Q13** (UX/UI) et décision 0012 en revue : rôle `status` ou `alert` des bandeaux, appliqué tel qu'en vigueur.
- **Q37** (Samuel) : modifications de Ligne ; voir Q177.
- **Q56** (Samuel) : mesure réelle et consentement ; aucune mesure de la disposition en phase 0 (F12-PO-21).
- **Q95** (Tech Lead) : budget de JavaScript de la Journée, remédié par T4 ; F12 l'étend (F12-PO-4).
- **Q5, Q14** (Samuel, juridique) : données de lieux Google ; F12 garde la carte et ses mentions visibles en grand écran (F12-PO-9).
