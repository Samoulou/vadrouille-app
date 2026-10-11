# F11 — Mes voyages (écran 17), Après le voyage (écran 16), états transverses (écran 18)

Rôle : frontend · Prérequis : code de F5 (F5a fusionnée, F5b et F5c à venir) ; voir « Prérequis vérifiables » · Ticket : #79 · Référence : `docs/handovers/frontend.md` (§ 0 règles 1 à 10, § 2, § 3 `src/features/compte` et `src/features/voyage`, § 5 `DestinationPlate`, `Counter`, `StatusBanner`, `Tag`, `UndoToast`, `Button`, `IconButton`, `SegmentedControl`, § 6 lignes « Mes voyages », « Après le voyage », « États » (W) et règles de navigation, § 7 « Annulation », § 8, § 9, § 10, § 11, § 12, § 13, § 14, § 15 F11 « Captures soumises à validation », § 16, § 17), `docs/produit/cadrage-v5.md` (§ 3.1 écrans 16, 17 et 18, § 3.2, § 3.3 « les préférences ne passent d'un voyage à l'autre qu'avec l'accord explicite de l'utilisateur (écran 16) », § 3.5 blocs « Après le voyage » et « Compte et paiement », § 3.6 « Souvenir partageable », § 4 « accès jusqu'à 30 jours après le retour », § 6.5 règles Google, § 6.7, § 6.8 `feedback`, `preference_signals`, `preferences`, § 9 « Collecte minimale »), `docs/CONTEXT.md` (phase 0, principes produit 2 à 5, principes techniques 2 et 3, « Qui décide quoi »), `docs/design-system/README.md`, `docs/design-system/redaction.md`, `docs/design-system/components/DestinationPlate/README.md` (« Une plaque par écran au maximum : […] dans « Mes voyages » »), `specs/F5-sejour-journee-fiche.md` (F5-PO-1, F5-PO-3, F5-PO-16, F5-PO-17, `tripRoutes.retour()`), `specs/F6-presentation.md` (F6-PO-10 catégories), `specs/F7-remplacer-ajouter-deplacer.md` (F7-PO-10 nom saisi), `specs/F8-creation-compte.md` (« Retour » de l'écran 1 vers `/voyages`, page de compte renvoyée à F11), `specs/F9-debloquer-programme-ajuste.md` (F9-PO-12, F9-PO-14, F9-TL-7, F9-TL-8, F9-Q8), `specs/D1-demo.md`, décisions `docs/decisions/0013` (§ 1.6, § 3.1, § 3.3, § 3.6), `0014`, `0015` (§ 6, § 7), `0016` (§ 3, § 4.5, § 10), `0018` (règles communes, « Actions de fin d'écran », « Attente »), `QUESTIONS.md` (Q12, Q13, Q14, Q27, Q37, Q48, Q56, Q59, Q63, Q100).

Documents en revue, non fusionnés au 2026-10-09, cités pour cohérence sans en dépendre : spécification F10 (PR #76 : `Trip.timeZone`, `today.ts`, `tripRoutes.aujourdhui()`, écran 15, F10-PO-7 « réouverture depuis Mes voyages laissée à F11 », Q137 à Q144) ; handover back-end (PR #27 : contrats `TripSummary`, `TripReview`, tables `feedback`, `preferences`) ; décision UX/UI 0012 (PR #26 : rendu de `StatusBanner`) ; F5b (PR #66). F11 ne modifie aucun de leurs fichiers dans cette PR de spécification.

Dossier UX : `docs/ux/dossier-ux.md` n'existe pas (Q59) et `docs/ux/maquettes/` est vide (Q12). Les écrans 16, 17 et 18 n'existent qu'en **wireframe** (handover § 6, « W ») : tout rendu et tout texte ci-dessous est « provisoire (UX/UI) », et le critère de la ligne F11 du handover (« Captures soumises à validation ») est tenu par les captures jointes à chaque PR et par la page de catalogue des états (F11-PO-17).

## Objectif
Fermer la boucle du voyage, sur données simulées :
1. **Mes voyages** (`/voyages`) : retrouver ses voyages (en cours, à venir avec les réservations qui restent, pas encore débloqués, passés), rouvrir un voyage au bon endroit (règles de navigation du handover § 6), et voir un état clair quand il n'y a aucun voyage.
2. **Après le voyage** (`/voyages/[id]/retour`) : un avis rapide par étape, les adresses découvertes sur place, et « Retenir mes goûts », facultatif et sur accord explicite (cadrage § 3.3) ; les goûts retenus sont visibles et retirables dans Mes voyages.
3. **États transverses** : page « introuvable » et page d'erreur de l'application en français et en Ligne, et une page de catalogue qui montre chaque état de l'écran 18 (information incertaine, conflit, aucune option compatible, erreur de calcul, événement non confirmé, aucun voyage) pour la validation des captures.

## Phase 0 : ce que F11 ne fait pas
- **Aucune persistance** : avis, adresses découvertes, goûts retenus et dernier onglet consulté vivent en mémoire de l'onglet (F11-PO-14, mécanisme F11-TL-4) ; rien n'est écrit dans le navigateur (`localStorage`, `sessionStorage`, IndexedDB, Cache Storage, cookies) ni sur le serveur.
- **Aucun usage des avis ni des goûts** : ni génération, ni mémoire automatique (cadrage § 6.7), ni modèle. Ce qu'ils deviendront relève de Samuel (Q162).
- **Aucune page de compte** (export, suppression des données, déconnexion) : hors F11 (F11-PO-19, Q164).
- **Aucun souvenir partageable** (cadrage § 3.6, handover § 16) : hors F11 (Q163).
- **Aucune restriction d'accès** liée à l'offre (voyage non débloqué, « 30 jours après le retour ») : F11 n'en applique aucune et pose la question (Q160).

## Prérequis vérifiables
| Élément | Livré par | Référence |
|---|---|---|
| `Trip`, `Stop`, `Day`, `ChecklistItem`, `CategorySchema`, adaptateur `mock`, `getRequestContext()`, voyages `mock_trip_edimbourg` (non débloqué) et `mock_trip_edimbourg_debloque` | F1 (#11), F6 (#44) | décision 0013 § 3.6 |
| `Button`, `IconButton`, `Tag`, `Counter`, `StatusBanner`, `UndoToast`, `SegmentedControl`, `Chip`, `/dev/composants`, `provisoire.css`, règle `react/jsx-no-literals` | F2 (#19), F6 (#44) | `specs/F2-composants-base.md` |
| `tripRoutes` (dont `retour()` = `/voyages`), `TripShell` (« Retour » du Séjour vers `/voyages`) | F5a (#54) | `src/features/sejour/routes.ts` |
| `DestinationPlate` | F5c (à venir) | `specs/F5-sejour-journee-fiche.md` ; si F5c n'est pas fusionnée au démarrage de F11a, F11a la crée selon les props et le rendu de F5, et F5c la réutilise (même règle que F9-PO-18) |
| Valeurs côté client sans Zod (`src/contracts/values.ts`), mesure en `zod/mini`, règle de lint 0016 § 3.1 règle 4, test `budget: JavaScript initial de la Journée` | T4 | décision 0016 § 3 ; F11 suit la forme en vigueur dans `main` au démarrage |
| `useOnline()` (`src/lib/online.ts`) | F7a ou F10a (à venir) | décision 0016 § 10 ; créé par F11b s'il n'existe pas, sous cette forme |
| `Trip.timeZone`, fonctions de date locale de `src/features/voyage/today.ts`, `tripRoutes.aujourdhui()`, écran 15 (`R15`) | F10a (à venir, spec #76 en revue) | facultatif : voir F11-PO-5 et F11-TL-3 |
| Écran 1 « Créer le voyage » (`/voyages/nouveau`) | F8a (à venir) | facultatif : voir F11-PO-4 |
| Fournisseur de l'onglet `src/app/voyages/[id]/layout.tsx` | F9a (à venir) | facultatif : voir F11-TL-4 |

## Périmètre
- Écran 17 « Mes voyages » : `/voyages` (F11a).
- Règle de réouverture d'un voyage depuis Mes voyages : écran 15 aux dates du voyage, sinon dernier onglet consulté (F11a).
- Deux voyages simulés supplémentaires, un passé et un à venir (F11a, F11-PO-15).
- Écran 16 « Après le voyage » : `/voyages/[id]/retour` (F11b) ; section « Tes goûts retenus » de Mes voyages (F11b).
- Pages « introuvable » et « erreur » de l'application ; page de catalogue des états `/dev/etats` (F11c).
- Contrats de phase 0 `TripSummary`, `TripReview` et valeurs associées ; lecture `listTrips`, `getTripReview` ; actions injectables de l'après-voyage (F11-TL-1, F11-TL-2, F11-TL-5).
- Événements `stop_reviewed`, `discovered_place_added`, `tastes_retained`, `taste_removed` (F11b, F11-PO-16).
- Entrée « Mes voyages » de la section « Démonstration » (F11a, F11-PO-18).

## Choix réservés au Tech Lead (signalés, non tranchés ici)
Propositions détaillées dans « Propositions au Tech Lead » ; le frontend les soumet dans sa PR et le Tech Lead les confirme à la revue ou par une décision dans `docs/decisions/`. Les critères qui en dépendent portent « sous réserve de F11-TL-x » ; si le Tech Lead retient une autre forme, le critère s'applique à la forme retenue sans autre changement.
- Contrats (F11-TL-1) ; lecture par l'adaptateur et jeux simulés (F11-TL-2).
- Calcul de la date locale et classement des voyages, dans le navigateur ou sur le serveur (F11-TL-3).
- Mémoire de l'onglet (dernier onglet, avis, adresses, goûts) : forme et emplacement du fournisseur (F11-TL-4).
- Actions de l'après-voyage injectables (F11-TL-5).
- Adresses : méthode de `tripRoutes` pour `R16` (F11-TL-6).
- Pages d'erreur et d'introuvable (F11-TL-7) ; page de catalogue (F11-TL-8).
- Schémas des événements (F11-TL-9) ; lint (F11-TL-10) ; niveau de titre de `DestinationPlate` (F11-TL-11).
- Emplacement et noms des fichiers ci-dessous.

### Routes de référence
| Nom | Route | Source |
|---|---|---|
| `R17` | `/voyages` | handover § 6 (« Mes voyages », W) |
| `R16` | `/voyages/[id]/retour` | handover § 6 (« Après le voyage », W) ; méthode de `tripRoutes` : F11-TL-6 |
| `R11` | `/voyages/[id]` | Séjour (F5) |
| `R12` | `/voyages/[id]/jour/[n]` | Journée (F5) |
| `R6` | `/voyages/[id]/presentation` | Présentation (F6) |
| `R15` | `/voyages/[id]/aujourdhui` | Pendant le voyage (F10a, à venir) |
| `R1` | `/voyages/nouveau` | Créer le voyage (F8a, à venir) |
| `R-etats` | proposée `/dev/etats` | **sous réserve de F11-TL-8** |

## Fichiers à créer ou modifier (proposition)
**F11a** (Mes voyages, réouverture, voyages simulés supplémentaires) :
- `src/contracts/trip-summary.ts` (`TripSummarySchema`, F11-TL-1) et son test ; réexport par `src/contracts/index.ts`.
- `src/adapters/types.ts` (`TripAdapter.listTrips`), `src/adapters/mock.ts` (dérivation des résumés, F11-TL-2) et leurs tests.
- `src/mocks/autres-voyages.ts` (voyages `mock_trip_lisbonne` et `mock_trip_porto`, F11-PO-15) et son test ; entrées ajoutées à `DEFAULT_ENTRIES` de `src/adapters/mock.ts`.
- `src/features/compte/` : `TripsScreen.tsx` (écran 17), `trips.ts` (fonctions pures `classifyTrips`, `featuredTrip`, `reopenTarget`, F11-TL-3) et leurs tests.
- Mémoire de l'onglet selon F11-TL-4 (dernier onglet consulté) ; enregistrement de l'onglet consulté par le Séjour et la Journée (`src/features/sejour/TripShell.tsx` ou le layout `(programme)`, selon F11-TL-4).
- Page `src/app/voyages/page.tsx` (`R17`).
- `src/features/accueil/DemoSection.tsx` et `src/app/page.tsx` : entrée « Mes voyages » (F11-PO-18).
- `src/components/ligne/DestinationPlate.tsx` et son test, seulement si F5c n'est pas fusionnée (voir « Prérequis vérifiables »).
- Textes `src/i18n/fr.json` sous `mesVoyages.*` ; `tests/e2e/mes-voyages.e2e.spec.ts`, `tests/e2e/mes-voyages.a11y.spec.ts`, `tests/visual/mes-voyages.visual.spec.ts` et leurs références.

**F11b** (Après le voyage, goûts retenus) :
- `src/contracts/review.ts` (`TripReviewSchema`, `StopRating`, `DiscoveredPlace`, `TasteCandidate`, F11-TL-1) et son test ; valeurs `STOP_RATINGS` dans `src/contracts/values.ts`.
- `src/adapters/types.ts` (`getTripReview`), `src/adapters/mock.ts`, `src/mocks/avis.ts` (candidats de goûts simulés, F11-TL-2) et leurs tests.
- `src/features/voyage/` : `ReviewScreen.tsx` (écran 16), `review.ts` (fonctions pures : étapes à évaluer, validation du nom d'adresse, résumé des goûts), `review-actions.ts` (interface `ReviewActions` et implémentation en mémoire, F11-TL-5) et leurs tests.
- `src/features/compte/RetainedTastes.tsx` (section « Tes goûts retenus » de `R17`) et son test.
- Page `src/app/voyages/[id]/retour/page.tsx` (`R16`) ; `src/features/sejour/routes.ts` (méthode de `R16`, F11-TL-6).
- `src/analytics/events.ts` : `stop_reviewed`, `discovered_place_added`, `tastes_retained`, `taste_removed`, et leurs tests.
- Si F10a est fusionnée : lien « Donner ton avis » dans l'état « Ton voyage est terminé » de l'écran 15 (F11-PO-9).
- Textes sous `apresVoyage.*` et `mesVoyages.gouts.*` ; `tests/e2e/apres-voyage.e2e.spec.ts`, `tests/e2e/apres-voyage.a11y.spec.ts`, `tests/visual/apres-voyage.visual.spec.ts`.

**F11c** (états transverses ; indépendante de F11a et F11b) :
- `src/app/not-found.tsx`, `src/app/error.tsx`, `src/app/global-error.tsx` (F11-TL-7) et leurs tests.
- `src/app/dev/etats/page.tsx` et `src/dev/EtatsShowcase.tsx` (F11-TL-8) ; ligne `curl` du job `docker` (404 sans `VADROUILLE_DEV_PAGES`).
- Textes sous `etats.*` ; `tests/e2e/etats.e2e.spec.ts`, `tests/e2e/etats.a11y.spec.ts`, `tests/visual/etats.visual.spec.ts`.

Toutes les sous-tâches : `eslint.config.mjs` (règles étendues aux nouveaux fichiers, F11-TL-10).

## Comportement

### Écran 17 — Mes voyages (`R17`) (F11-PO-1 à F11-PO-6) [a]
Composant serveur qui lit les résumés (`listTrips(getRequestContext())`, F11-TL-2) et les passe à un composant client qui classe et affiche (F11-TL-3). Aucune autre donnée n'est lue : ni jours, ni propositions, ni positions.

Dans cet ordre (textes provisoires, UX/UI) :
1. Titre de niveau 1 « Mes voyages ».
2. Lien « Créer un voyage » (`Button` `secondary` `sm`) vers `R1`, **seulement si `R1` existe** dans `main` au démarrage de F11a (F11-PO-4).
3. **Voyage mis en avant** (F11-PO-3) : `DestinationPlate` du premier voyage de la première section non vide parmi « En cours », « À venir », « Pas encore débloqués » ; la plaque est un lien vers la cible de réouverture du voyage (F11-PO-5). Aucune plaque si ces trois sections sont vides (règle du design system : une plaque par écran au plus).
4. Sections, chacune avec un titre de niveau 2, rendue seulement si elle n'est pas vide (F11-PO-2) :
   - **« En cours »** : voyages débloqués dont la date locale du jour (F11-PO-6) est comprise entre `start` et `end` inclus ;
   - **« À venir »** : voyages débloqués qui commencent après la date du jour, par `start` croissant ;
   - **« Pas encore débloqués »** : voyages non débloqués dont `end` n'est pas passé, par `start` croissant ; mention « Tes premières propositions » sur chaque ligne (« Aperçu » interdit, handover § 10) ;
   - **« Passés »** : voyages dont `end` est passé, débloqués ou non, par `end` décroissant ; un voyage non débloqué y porte la mention « Non débloqué ».
   - À dates égales, l'ordre suit l'identifiant du voyage (ordre lexicographique croissant), pour un rendu stable.
5. **Ligne de voyage** (tous les voyages, y compris celui de la plaque, qui reste aussi dans sa section) : un seul lien par voyage vers sa cible de réouverture, dont le nom accessible contient la destination, les dates et, s'il y a lieu, la mention et le nombre de réservations ; texte : destination (`arret` 700), « {début} – {fin} · {voyageurs} » au format de F5 (« sam. 29.08 – jeu. 03.09 · 2 adultes »), avec l'année après la date de fin quand le voyage ne commence pas l'année en cours (« sam. 08.05 – mar. 11.05.2027 », forme exacte : UX/UI) ; aucune couleur `dest-*` hors de la plaque (handover § 4.2, Q168).
6. **Réservations restantes** (F11-PO-2) : pour un voyage « En cours » ou « À venir » dont `toReserveCount` > 0, `Counter` (`quai`, action requise) avec « {n} réservations à faire » (singulier « 1 réservation à faire ») ; rien à 0, rien pour « Pas encore débloqués » ni « Passés ».
7. **Après le voyage** (F11-PO-9) [b] : pour un voyage dont la date du jour est le dernier jour ou après, un second lien distinct « Donner ton avis » (`Button` `text` `sm`) vers `R16`, à côté du lien du voyage (jamais imbriqué dans lui).
8. **Tes goûts retenus** [b] (F11-PO-13) : voir plus bas.

Avant que le classement soit calculé (F11-TL-3), un squelette immobile de trois lignes et « Chargement de tes voyages » (`role="status"`, décision 0018 « Attente ») ; jamais une liste classée à une autre date puis reclassée.

**Aucun voyage** (écran 18, « aucun voyage ») : titre « Mes voyages », puis « Tu n'as pas encore de voyage. » (`corps` `ink`) et, si `R1` existe, « Créer un voyage » en `primary` pleine largeur (décision 0018, « Actions de fin d'écran ») ; sinon le texte seul. Ce n'est pas un `StatusBanner` (ce n'est ni une erreur ni un état de réseau).

« Retour » : `R17` n'a pas de bouton « Retour » (c'est le niveau le plus haut d'un compte) ; le logo et le lien vers l'accueil n'y sont pas ajoutés en phase 0.

Titres du document (provisoires) : « Mes voyages · {nom du produit} ».

### Réouverture d'un voyage (handover § 6, règles de navigation ; F11-PO-5) [a]
La cible du lien d'un voyage (plaque et ligne) est calculée par une fonction pure `reopenTarget(summary, today, lastTab)` :
1. Date locale du jour comprise entre `start` et `end` inclus, **et** `R15` existe dans `main` (F10a) : `R15`.
2. Sinon, si un **dernier onglet consulté** est connu pour ce voyage dans l'onglet du navigateur (F11-PO-14) : cet onglet, `R11` (Séjour) ou `R12` du jour `n`.
3. Sinon : `R11` pour un voyage débloqué ; `R6` pour un voyage non débloqué dont la date de fin n'est pas passée (« Tes premières propositions », cadrage § 4) ; `R11` pour un voyage non débloqué passé.

« Dernier onglet consulté » : le Séjour ou une Journée, enregistré à chaque affichage de `R11` ou de `R12` (la fiche, `?etape=`, ne compte pas : on rouvre la Journée). La présentation, l'écran 9 et l'écran 10 ne sont pas des onglets. Un jour qui n'existe plus dans le voyage est ignoré (règle 3).

### Écran 16 — Après le voyage (`R16`) (F11-PO-7 à F11-PO-12) [b]
Composant serveur qui lit le voyage (`getTrip`) et la revue simulée (`getTripReview`, F11-TL-2) avec `getRequestContext()` ; voyage inconnu ou d'une autre organisation : 404. Composant client pour le contenu, qui lit la mémoire de l'onglet (F11-TL-4).

« Retour » (`IconButton`, en haut à gauche) : `R11` (niveau supérieur : le voyage). Titre du document : « {destination} · Après le voyage ».

**Avant le dernier jour du voyage** (date locale, F11-PO-6) : titre de niveau 1 « Après le voyage », puis « Ton voyage n'est pas terminé. Tu pourras donner ton avis à partir du {Day.title du dernier jour}. » et le lien « Voir le séjour » (`R11`). Rien d'autre (F11-PO-8).

**À partir du dernier jour**, dans cet ordre :
1. Titre de niveau 1 « Ton avis sur {destination} », puis « Quelques secondes par étape. Tout est facultatif. » (`corps-s` `ink-soft`).
2. Mention permanente « Démonstration : tes avis ne sont pas conservés après un rechargement de la page. » en `corps-s` `ink-soft` (F11-PO-14).
3. **« Tes étapes »** (titre de niveau 2) : pour chaque jour non `generating`, dans l'ordre, un titre de niveau 3 (`Day.title`), puis une ligne par étape à évaluer (F11-PO-10) : heure (`Stop.start`), nom (`Stop.name`), et un choix exclusif à trois valeurs « J'ai aimé », « Pas pour moi », « Pas fait » (groupe nommé « Ton avis sur {nom} » ; composant : UX/UI, par exemple `SegmentedControl` sans valeur initiale) ; aucune valeur au départ, le choix se change à tout moment, sans `UndoToast` (le choix s'annule lui-même, comme la case de F5-PO-4). Un jour sans étape à évaluer n'est pas rendu.
4. **« Adresses découvertes »** (titre de niveau 2) (F11-PO-11) : « Une adresse trouvée sur place, hors de ton programme ? Garde-la ici. » ; formulaire avec le champ « Nom de l'adresse » (obligatoire, 1 à 80 caractères après suppression des espaces de début et de fin, règles de champ de la décision 0018), le choix facultatif du jour (« Jour {n} » pour chaque jour du voyage, et « Je ne sais plus »), et le bouton « Ajouter l'adresse » (`secondary`). Nom vide : message « Indique le nom de l'adresse. » sous le champ, `aria-invalid`, focus sur le champ ; nom trop long : « 80 caractères au plus. ». Après l'ajout : l'adresse apparaît dans la liste au-dessus du formulaire (« {nom} · Jour {n} » ou « {nom} »), le champ est vidé, le focus reste sur le champ, « Adresse ajoutée. » est annoncé (`role="status"`). Chaque adresse a « Retirer » (`Button` `text` `sm`, nom accessible « Retirer : {nom} ») : `UndoToast` « Adresse retirée. » avec « Annuler » pendant 5 s (règles de F6-PO-6) ; après « Retirer », focus sur le « Retirer » suivant, sinon le précédent, sinon le champ. Au plus 20 adresses par voyage : au-delà, le formulaire est remplacé par « Tu as ajouté 20 adresses : retire-en une pour en ajouter une autre. ».
5. **« Retenir mes goûts »** (titre de niveau 2) (F11-PO-12) : « Facultatif. Si tu les retiens, on te les proposera quand tu prépareras ton prochain voyage, sans les appliquer d'office. Tu peux les retirer à tout moment dans Mes voyages. » ; une case à cocher par candidat de `TripReview.tasteCandidates`, **toutes décochées au départ**, libellées :
   - catégorie aimée : « Tu aimes {catégorie} » (libellés de F6-PO-10, `presentation.categories.*`) ;
   - catégorie évitée : « Tu préfères éviter {catégorie} » ;
   - distance : « Tu préfères rester près de ton hôtel » ;
   - avec, sous chaque libellé, son origine : « Confirmé par toi pendant la présentation » ou « Déduit de tes J'aime », en `legende` `ink-soft` ; un candidat déduit a un contour en pointillé comme `Chip` `inferred`, et son nom accessible contient « déduit ».
   Bouton « Retenir ces goûts » (`primary`, pleine largeur). Aucune case cochée : message « Coche au moins un goût à retenir. » (`role="alert"`), rien n'est retenu. Sinon : les goûts cochés sont retenus (F11-PO-13), la liste est remplacée par « Goûts retenus : » suivi de leurs libellés, et le lien « Voir dans Mes voyages » (`R17`) ; « {n} goûts retenus. » est annoncé. Un candidat déjà retenu (même sujet, même sens) s'affiche coché et désactivé, avec « Déjà retenu ». Aucun candidat : « Aucun goût à retenir pour ce voyage. ».
6. Actions de fin d'écran : « Voir le séjour » (`secondary`, `R11`).

Hors ligne (`useOnline()` faux) : `StatusBanner` `offline` « Tu es hors ligne. Ton avis sera possible dès le retour du réseau. » en tête du contenu ; les choix d'avis, « Ajouter l'adresse », « Retirer » et « Retenir ces goûts » passent en `aria-disabled="true"`, décrits par le bandeau (handover § 13 : ces actions demanderont le réseau avec le back-end). Les choix déjà faits restent affichés.

### Tes goûts retenus (section de `R17`) (F11-PO-13) [b]
- Section « Tes goûts retenus » (titre de niveau 2), après les sections de voyages, rendue seulement si au moins un goût est retenu dans l'onglet.
- Une ligne par goût, dans l'ordre où ils ont été retenus, au libellé de l'écran 16 et avec « Retenu après {destination} » ; chaque ligne a « Retirer » (`Button` `text` `sm`, nom accessible « Retirer : {libellé} »).
- « Retirer » : la ligne disparaît, `UndoToast` « Goût retiré. » avec « Annuler » pendant 5 s ; « Annuler » restaure l'état exact et place le focus sur le « Retirer » de la ligne restaurée ; après « Retirer », focus sur le « Retirer » suivant, sinon le précédent, sinon sur le titre « Mes voyages ». Le dernier goût retiré fait disparaître la section après l'expiration du délai.
- Pas de « Modifier » (vocabulaire « Retirer, Modifier » du handover § 10 : seul « Retirer » est offert dans F11).

### États transverses (écran 18) (F11-PO-17) [c]
| État du cadrage § 3.1 | Où il vit | Livré par |
|---|---|---|
| Information incertaine | `Tag` `toConfirm` (« À confirmer ») sur une étape, date de vérification dans la fiche | F3, F5 (existant) |
| Événement non confirmé | `Tag` `unconfirmed` (« Non confirmé ») dans « Pendant ton séjour » et la Journée | F3, F5 (existant) |
| Conflit | `StatusBanner` `conflict` (F7 : « Ton programme a changé depuis cet aperçu. Rien n'a été modifié. ») | F7 |
| Aucune option compatible | `StatusBanner` `noOption` (F7, F8) | F7, F8 |
| Erreur de calcul | `StatusBanner` `error`, texte de `redaction.md` : « Les temps de trajet n'ont pas pu être recalculés. Ton programme précédent est conservé. » | déclencheur réel : B-tâches ; rendu : F11c (catalogue) |
| Aucun voyage | état vide de `R17` | F11a |
| Page introuvable | `src/app/not-found.tsx` | F11c |
| Erreur inattendue | `src/app/error.tsx`, `src/app/global-error.tsx` | F11c |

**Page introuvable** (toute réponse 404 de l'application, y compris les `notFound()` des écrans et la vue partagée de F10) : `lang="fr"`, titre de niveau 1 « Page introuvable », « Cette page n'existe pas ou n'est plus disponible. », lien « Retour à l'accueil » (`/`). Aucune autre information : ni l'adresse demandée, ni la raison (voyage inconnu, autre organisation, jeton désactivé), pour ne rien révéler (F9-PO-20, F10-PO-15). Le code HTTP reste 404. Titre du document : « Page introuvable · {nom du produit} ».

**Erreur inattendue** (exception non gérée au rendu d'une page) : titre de niveau 1 « Cette page n'a pas pu s'afficher », « Réessaie dans un instant. Si le problème continue, reviens à l'accueil. », boutons « Réessayer » (`primary`, relance le rendu) et « Retour à l'accueil » (`text`). Aucun message technique, aucune pile, aucun identifiant interne affiché. `global-error.tsx` reprend les mêmes textes avec son propre `<html lang="fr">`. Le code HTTP reste 500.

**Catalogue des états** (`R-etats`, page de développement, F11-TL-8) : une section par ligne du tableau ci-dessus (sauf les deux pages, montrées par des liens vers une adresse inexistante et vers une page de développement qui lève une erreur), avec le texte réel de chaque écran (clés `fr.json` existantes, jamais recopiées) ; les six types de `StatusBanner` (`offline`, `conflict`, `noOption`, `error`, `generating`, `travel`) ; l'état vide de `R17` rendu par le même composant que `R17` avec une liste vide. Elle sert aux captures de validation (handover § 15, F11) ; elle n'est jamais servie sans `devPagesEnabled()` (404 dans l'image de production).

## Jeux simulés (proposition ; forme : F11-TL-2)

### Voyages supplémentaires [a] (F11-PO-15)
Contenu entre crochets, sans `placeId`, sans position (la carte affiche son état de remplacement, comme le voyage débloqué d'Édimbourg, Q100), organisation `mock_org_personnelle` :
| Identifiant | Destination | Couleur | Dates | Débloqué | Fuseau | Liste « À faire » |
|---|---|---|---|---|---|---|
| `mock_trip_lisbonne` | Lisbonne | `azulejo` | jeu. 2026-05-14 – dim. 2026-05-17 (4 jours) | oui | `Europe/Lisbon` | 1 ligne, faite |
| `mock_trip_porto` | Porto | `granit` | sam. 2027-05-08 – mar. 2027-05-11 (4 jours) | oui | `Europe/Lisbon` | 3 lignes, dont 2 non faites |

Chaque jour : terminus de départ et d'arrivée « [Hôtel] », deux ou trois étapes (une activité, un repas), segments à pied ; `travelMinutes` sous `travelBudgetMinutes` ; aucune proposition (`listProposals` vide). Les identifiants d'étapes sont préfixés par le voyage (`lis-`, `por-`) et disjoints de ceux d'Édimbourg (test). Le fuseau n'est ajouté que si `Trip.timeZone` existe (F10a) ; sinon F11-TL-3 s'applique.

Avec les deux voyages d'Édimbourg (qui apparaissent tous les deux : limite assumée de la phase 0, F11-PO-15), Mes voyages montre :
| Date du jour (heure de la destination) | En cours | À venir | Pas encore débloqués | Passés | Plaque |
|---|---|---|---|---|---|
| 2026-08-01 | — | Édimbourg (débloqué, « 4 réservations à faire »), Porto (« 2 réservations à faire ») | Édimbourg | Lisbonne | Édimbourg (débloqué) |
| 2026-08-30 | Édimbourg (débloqué, « 4 réservations à faire ») | Porto | Édimbourg | Lisbonne | Édimbourg (débloqué) |
| 2026-10-09 | — | Porto | — | Édimbourg (« Non débloqué »), Édimbourg, Lisbonne | Porto |

(Le 2026-10-09, les deux Édimbourg ont la même date de fin : `mock_trip_edimbourg` précède `mock_trip_edimbourg_debloque` par l'ordre des identifiants.)

### Revue simulée [b] (F11-TL-2)
- Étapes à évaluer : dérivées du voyage par une fonction pure (F11-PO-10), pas recopiées dans le jeu.
- Candidats de goûts (`tasteCandidates`), par voyage :
  - `mock_trip_lisbonne` : « Tu aimes les dégustations » (`tasting`, `more`, déduit) ; « Tu préfères éviter les musées et monuments » (`museum`, `less`, confirmé) ;
  - `mock_trip_edimbourg_debloque` : « Tu préfères éviter les musées et monuments » (`museum`, `less`, confirmé) ; « Tu préfères rester près de ton hôtel » (distance, confirmé) ;
  - autres voyages : aucun.
  En phase 0, ces candidats sont fixés par le jeu ; ils ne sont pas calculés à partir des avis (le calcul relève du back-end, sous les règles de cadrage § 6.6 : seules les préférences confirmées ou affichées comme déduites).

## Événements de mesure (handover § 12 ; F11-PO-16) [b]
| Événement | Quand | Propriétés |
|---|---|---|
| `stop_reviewed` (ajout) | Chaque choix d'avis sur une étape, y compris un changement | `rating: liked \| disliked \| not_done`, `kind: activity \| meal \| event` |
| `discovered_place_added` (ajout) | Ajout réussi d'une adresse découverte, quand le délai d'annulation d'un éventuel retrait ne la concerne pas | `with_day: boolean` |
| `tastes_retained` (ajout) | « Retenir ces goûts » réussi | `count` (entier ≥ 1), `inferred_count` (entier ≥ 0) |
| `taste_removed` (ajout) | « Retirer » sur un goût retenu, quand le délai d'annulation expire sans « Annuler » | `category` : `CategorySchema` ou `"distance"`, `origin: confirmed \| inferred` |

Aucune autre propriété : ni identifiant de voyage, d'étape ou d'adresse, ni nom d'étape ou d'adresse, ni destination, ni date. Aucun événement pour la consultation de `R17` ni de `R16`, ni pour les pages d'erreur. Ces quatre ajouts amendent le handover § 12 (à reporter dans la note de version).

## Règles Google et données personnelles
- **Aucune donnée Google dans un prompt** : F11 n'appelle aucun modèle ; les adresses découvertes et les avis ne sont envoyés à aucun modèle.
- **Seul l'identifiant de lieu est stockable** : F11 ne stocke rien (mémoire de l'onglet seulement) ; les avis portent sur un identifiant d'étape maison (`Stop.id`), jamais sur un `placeId`.
- **Pas de données Google affichées** : `R17` et `R16` n'ont pas de carte ; ils affichent des noms maison (`Stop.name`, décision 0016 § 4.5, Q14) et des noms saisis par la personne. Le nom d'une adresse découverte est **saisi**, jamais pré-rempli ni complété par une recherche de lieux (F7-PO-10, Q77, Q90) : aucune requête vers Google pendant la saisie.
- **Données personnelles** : avis, adresses découvertes et goûts retenus sont des données personnelles (cadrage § 6.8 `feedback`, `preferences`). Phase 0 : en mémoire de l'onglet seulement, perdus au rechargement, jamais écrits dans le navigateur ni sur le serveur, jamais dans l'adresse ni dans un journal. Collecte minimale (cadrage § 9) : pas de champ de texte libre pour l'avis, pas de commentaire sur l'adresse découverte (F11-PO-10, F11-PO-11). Consentement, durée de conservation et usage : Samuel (Q161, Q162, liées à Q27).
- **Opt-in** : aucun goût n'est retenu sans une case cochée et un appui sur « Retenir ces goûts » ; rien n'est coché d'office (cadrage § 3.3, principe produit 3).

## Tests

### Unitaires (Vitest, Testing Library, axe)
- `trips.ts` : `classifyTrips` aux trois dates du tableau ci-dessus (sections, ordre, plaque), bornes (`start` et `end` le jour même), voyage non débloqué en cours et passé, liste vide, égalité de dates (ordre des identifiants) ; date locale de la destination (appareil à `Europe/Zurich` à 00:30 le 2026-08-29, soit 23:30 le 28.08 à Édimbourg : le voyage d'Édimbourg n'est pas encore « En cours ») ; `reopenTarget` : aux dates (avec et sans `R15`), dernier onglet Séjour, Journée 3, jour inexistant, non débloqué à venir (`R6`) et passé (`R11`).
- Résumés : `listTrips` du jeu simulé (4 entrées, F11-PO-15 : exactement les voyages de l'organisation, `toReserveCount` = lignes non faites, aucun champ de jour) ; autre organisation : liste vide ; `TripSummarySchema` refuse un champ inconnu (`days`, `placeId`).
- `TripsScreen` : sections, plaque unique, compteur (singulier, pluriel, 0), année, état vide avec et sans `R1`, squelette avant le classement.
- [b] `review.ts` : étapes à évaluer (activités, repas, événements de la ligne du jour ; jamais terminus, segment, temps libre, repas non choisi, `Day.events`, jour `generating`) ; validation du nom (vide, espaces seuls, 80 et 81 caractères) ; limite de 20 adresses.
- [b] `ReviewScreen` : avant le dernier jour, choix d'avis, ajout et retrait d'adresse avec « Annuler » (égalité profonde), « Retenir ces goûts » sans case cochée, avec cases cochées, candidat déjà retenu, candidat déduit en pointillé (nom accessible avec « déduit »), hors ligne (`aria-disabled`) ; `RetainedTastes` : retrait, « Annuler », focus.
- [b] Schémas des événements : chaque ajout accepte ses propriétés et refuse un identifiant, un nom, une destination, un texte libre, une catégorie hors `CategorySchema`.
- [c] `not-found.tsx`, `error.tsx`, `global-error.tsx` : textes, `lang="fr"`, aucun texte de l'erreur reçue rendu (erreur injectée avec un message contenant un faux identifiant : absent du rendu).

### E2E, a11y et visuel (Playwright, 390 × 844, build de production, domaines Google bloqués)
Horloge du navigateur installée par `page.clock.install` (comme F10), fuseau du contexte précisé par critère.
- `tests/e2e/mes-voyages.e2e.spec.ts` [a], `tests/e2e/apres-voyage.e2e.spec.ts` [b], `tests/e2e/etats.e2e.spec.ts` [c].
- `tests/e2e/mes-voyages.a11y.spec.ts` [a] : `R17` aux trois dates et vide (via `R-etats` si F11c est fusionnée, sinon test unitaire axe) ; [b] `R17` avec goûts retenus et toast ; `tests/e2e/apres-voyage.a11y.spec.ts` [b] : `R16` avant le dernier jour, complet, avec avis, adresse ajoutée, message de champ, goûts retenus, toast, hors ligne ; `tests/e2e/etats.a11y.spec.ts` [c] : page introuvable, page d'erreur, `R-etats`.
- `tests/visual/*.visual.spec.ts` : mêmes états ; références régénérées selon la décision 0004.

## Décisions (Product Owner, définitives sans veto de Samuel sous 2 jours)
Une décision marquée « provisoire (UX/UI) » porte sur un rendu ou un texte non maquetté (wireframe seulement) et peut être changée par UX/UI sans nouvelle décision du Product Owner (Q165). Aucune ne fixe ce qu'un voyage non débloqué ou terminé depuis plus de 30 jours peut faire (offre, Q160), ni le consentement, la conservation ou l'usage des données de l'après-voyage (Q161, Q162). Les décisions décrivent des besoins fonctionnels ; quand un mécanisme est nécessaire, il est renvoyé au Tech Lead (« mécanisme : F11-TL-x »).

À reporter dans la note de version, en plus de la liste ci-dessous : **F11-PO-16 amende le handover § 12** (quatre événements ajoutés).

- **F11-PO-1 — Périmètre.** F11 couvre les trois lignes « W » du handover § 6 (Mes voyages, Après le voyage, États). N'y entrent pas : la page de compte (export, suppression, déconnexion : F11-PO-19, Q164), le souvenir partageable (cadrage § 3.5 « après le MVP », handover § 16 ; Q163), « Débloquer » depuis Mes voyages (F9-Q8, en attente de Samuel), le voyage en cours de génération (états de l'écran 5, F8).
- **F11-PO-2 — Sections de Mes voyages.** « En cours », « À venir » (débloqués), « Pas encore débloqués » (non débloqués dont la fin n'est pas passée), « Passés » (tous, avec « Non débloqué » s'il y a lieu) ; ordres du § « Écran 17 » ; section vide non rendue ; réservations restantes (`Counter` jaune, action requise) seulement pour « En cours » et « À venir ». Raison : cadrage § 3.1, écran 17 (« voyages à venir avec réservations restantes, aperçus non débloqués, voyages passés ») ; un voyage passé n'a plus de réservation à faire.
- **F11-PO-3 — Une seule plaque.** La `DestinationPlate` ne porte que le voyage mis en avant (premier de « En cours », sinon de « À venir », sinon de « Pas encore débloqués ») ; les autres voyages sont des lignes sans couleur de destination. Raison : le design system limite la plaque à une par écran et réserve `dest-*` à la plaque (handover § 4.2), alors que le handover § 6 parle de « cartes de voyage, plaque » : la contradiction est signalée à Samuel (Q168) sans changer Ligne.
- **F11-PO-4 — Créer un voyage.** Lien « Créer un voyage » en tête et dans l'état vide, **seulement si** l'écran 1 existe dans `main` ; sinon absent et ajouté par la première PR fusionnée après F8a qui touche `R17`, pour qu'aucun lien ne mène à une page 404 (règle de F9-PO-19).
- **F11-PO-5 — Réouverture.** Écran 15 aux dates du voyage (si F10a est fusionnée), sinon dernier onglet consulté dans l'onglet du navigateur (Séjour ou Journée n ; la fiche rouvre sa Journée), sinon Séjour pour un voyage débloqué ou passé et présentation pour un voyage non débloqué à venir. Raison : handover § 6, règles de navigation ; F5 et F10 (F10-PO-7) ont laissé cette règle à F11 ; pour un voyage non débloqué, « Tes premières propositions » sont le cœur de l'essai (cadrage § 4). Phase 0 : mémoire de l'onglet, perdue au rechargement (mécanisme : F11-TL-4) ; la persistance par personne viendra avec le back-end.
- **F11-PO-6 — Date de référence.** « En cours », « passé », « dernier jour » se jugent à la **date locale de la destination**, avec le même calcul que l'écran 15 (F10-PO-3), dans le navigateur, testé par l'horloge du navigateur ; aucune liste n'est rendue classée à une autre date puis reclassée (squelette en attendant) (mécanisme : F11-TL-3).
- **F11-PO-7 — Accès à l'écran 16.** `R16` est accessible depuis Mes voyages (lien « Donner ton avis » à partir du dernier jour) et depuis l'état « Ton voyage est terminé » de l'écran 15 si F10a est fusionnée ; « Retour » mène au Séjour. Aucune restriction liée au déblocage ni aux 30 jours après le retour en phase 0 (Q160).
- **F11-PO-8 — Avant la fin du voyage.** Avant le dernier jour, `R16` n'affiche que « Ton voyage n'est pas terminé… » et « Voir le séjour » : on ne note pas une étape pas encore vécue. Le dernier jour compte (départ le soir, avis dans le train).
- **F11-PO-9 — Liens vers l'après-voyage.** Un lien distinct « Donner ton avis », jamais imbriqué dans le lien du voyage ; pas de bandeau ni de rappel insistant (aucune notification, handover § 16).
- **F11-PO-10 — Avis rapide.** Une ligne par étape de la ligne du jour (activité, repas, événement placé dans le programme ; ni terminus, ni segment, ni temps libre, ni repas pas encore choisi, ni événement hors programme, ni jour en préparation) ; trois choix exclusifs « J'ai aimé », « Pas pour moi », « Pas fait » (provisoires, UX/UI), aucune valeur au départ, modifiables ; ni note chiffrée, ni texte libre, ni raison en phase 0. « Pas pour moi » reprend le vocabulaire de la présentation ; « J'ai aimé » est au passé parce que l'étape a été vécue (« J'aime » reste propre à la présentation). Raison : « avis rapide » (cadrage § 3.1) et collecte minimale (§ 9).
- **F11-PO-11 — Adresses découvertes.** Nom saisi (1 à 80 caractères), jour facultatif, sans commentaire ni recherche de lieu ; 20 au plus par voyage ; « Retirer » annulable 5 s ; les adresses ne s'ajoutent pas au programme (le programme passé ne change pas) et ne vont nulle part ailleurs en phase 0 (Q162).
- **F11-PO-12 — Retenir mes goûts.** Opt-in explicite : cases toutes décochées, bouton « Retenir ces goûts », rien sans case cochée ; libellés « Tu aimes… », « Tu préfères éviter… », « Tu préfères rester près de ton hôtel » avec leur origine (confirmé, déduit en pointillé) ; un goût déjà retenu n'est pas retenu deux fois ; le texte promet seulement une **proposition** lors du prochain voyage, jamais une application d'office. Raison : cadrage § 3.3 et § 6.8 `preferences` (« facultatives, modifiables, supprimables »), principe produit 3. Risque signalé : la reprise des goûts à la création d'un voyage (F8, B9) n'existe pas encore ; le texte est à confirmer avec Q161.
- **F11-PO-13 — Goûts retenus visibles et retirables.** Section « Tes goûts retenus » de Mes voyages, rendue s'il y en a, chaque goût avec « Retirer » annulable 5 s ; pas de « Modifier ». Raison : un goût retenu doit pouvoir être retiré là où l'on retrouve ses voyages, sans page de compte (F11-PO-19).
- **F11-PO-14 — Mémoire de l'onglet.** Dernier onglet consulté, avis, adresses et goûts retenus sont gardés pendant les navigations côté client de l'onglet et perdus au rechargement, comme la session de tri de F9 (F9-PO-14) ; mention permanente sur `R16` ; rien dans le navigateur, le serveur ni l'adresse (mécanisme : F11-TL-4).
- **F11-PO-15 — Voyages simulés.** Deux voyages ajoutés (Lisbonne passé, Porto à venir) pour montrer chaque section à toute date de démonstration ; les deux voyages d'Édimbourg (aperçu et débloqué) restent et apparaissent tous les deux dans Mes voyages (limite assumée de la phase 0, signalée par « Non débloqué » ou « Tes premières propositions ») ; les jeux de F5 à F9 et leurs tests ne changent pas.
- **F11-PO-16 — Événements.** Quatre ajouts (`stop_reviewed`, `discovered_place_added`, `tastes_retained`, `taste_removed`) pour mesurer l'engagement après le voyage et l'usage de la mémoire des goûts ; sans identifiant ni texte ; `taste_removed` envoyé à l'expiration du délai d'annulation (comme `preference_removed`, F9-PO-16) ; aucun événement de consultation. Amende le handover § 12.
- **F11-PO-17 — États transverses.** Chaque état de l'écran 18 a un endroit unique (tableau du § « États transverses ») ; F11 ne réécrit pas les messages des écrans qui les possèdent (F7, F8, F9, F10) ; elle ajoute la page introuvable et la page d'erreur, qui ne révèlent rien (ni adresse, ni raison, ni détail technique), et une page de catalogue de développement qui assemble tous les états avec leurs vrais textes, pour la validation des captures (handover § 15, F11).
- **F11-PO-18 — Démonstration.** La section « Démonstration » de la page d'accueil (D1) gagne une entrée « Mes voyages » (« Écran 17, voyages simulés ») vers `R17`, après les entrées existantes ; les entrées de D1 et de F9 ne changent pas.
- **F11-PO-19 — Page de compte hors F11.** Export et suppression des données, déconnexion : le handover § 6 ne prévoit pas cet écran, F8 le renvoyait à F11, et son contenu dépend de B3 (session), de Q27 et de Q48 (Samuel) ; F11 ne le livre pas et demande sa place au CEO (Q164).
- **F11-PO-20 — Découpage proposé au CEO.** Trois PR, chacune vérifiable par ses seuls critères (étiquetés [a], [b], [c]) :
  - **F11a** : Mes voyages (sections, plaque, compteur, état vide, réouverture, dernier onglet), `TripSummary`, `listTrips`, voyages simulés supplémentaires, entrée de démonstration. Après F5c (ou crée `DestinationPlate`) et T4.
  - **F11b** : Après le voyage, goûts retenus dans Mes voyages, `TripReview`, actions injectables, événements. Après F11a.
  - **F11c** : page introuvable, page d'erreur, catalogue des états. Indépendante : peut passer avant F11a.
  - F11a et F11b utilisent `Trip.timeZone` et le calcul de date locale de F10a s'ils sont fusionnés ; sinon F11-TL-3 s'applique et F10a reprend la même fonction. Le CEO ordonne les tâches pour qu'aucune paire ne modifie le même fichier en parallèle (`src/contracts`, `src/adapters`, `src/mocks`, `fr.json`, `eslint.config.mjs`, `DemoSection.tsx`, `TripShell.tsx`) (Q167).

## Propositions au Tech Lead (architecture et tests, à confirmer à la revue de la PR de code ou par une décision dans `docs/decisions/`)
Aucun de ces contrats n'existe dans `src/contracts` au 2026-10-09 ; le handover back-end en revue (#27) nomme `TripSummary` et `TripReview` sans être fusionné. Les formes ci-dessous décrivent le besoin.
- **F11-TL-1 — Contrats.**
  - `TripSummarySchema` (`z.strictObject`) : `{ id, organizationId, destination, destinationColor, start, end, timeZone?, travellers, unlocked, toReserveCount (entier ≥ 0) }`, champs repris de `TripSchema` par `.pick()` pour ne pas les recopier ; `timeZone` obligatoire dès que `Trip.timeZone` l'est (F10-TL-1). Aucun champ de jour, d'étape, de position ni de `placeId`.
  - `src/contracts/values.ts` : `STOP_RATINGS = ["liked", "disliked", "not_done"]`, `TASTE_DIRECTIONS = ["more", "less"]` (si F9b ne les a pas déjà créés sous un autre nom : reprendre le sien).
  - `TripReviewSchema` : `{ tripId, tasteCandidates: TasteCandidate[] }` ; `TasteCandidate` = `{ id, origin: "confirmed" | "inferred", subject: { kind: "category"; category: Category; direction: "more" | "less" } | { kind: "distance" } }`, **la même forme que `RetainedPreference` de F9-TL-7** (réutiliser le schéma s'il existe) ; les étapes à évaluer ne sont pas dans le contrat : elles se dérivent du `Trip`.
  - `StopReview` `{ stopId, rating }`, `DiscoveredPlace` `{ id, name (1 à 80), day? (entier ≥ 1) }`, `RetainedTaste` `{ id, subject, origin, fromTripId, retainedAt }` : formes de l'état en mémoire et du futur contrat serveur (table `feedback` et `preferences`, B-tâche).
  - Côté client, types par `import type`, valeurs par `@/contracts/values` (0016 § 3.1).
- **F11-TL-2 — Lecture et jeux simulés.** `TripAdapter.listTrips(ctx): Promise<TripSummary[]>` : l'adaptateur `mock` dérive les résumés de ses entrées (fonction pure, validée par `TripSummarySchema`), sans ordre garanti (le classement est dans `trips.ts`) ; autre organisation : liste vide. `getTripReview(ctx, tripId): Promise<TripReview | null>` (méthode de `TripAdapter` ou adaptateur séparé, au choix) : `null` hors organisation ; candidats lus dans `src/mocks/avis.ts`. Voyages supplémentaires dans `src/mocks/autres-voyages.ts`, ajoutés à `DEFAULT_ENTRIES` **après** les deux d'Édimbourg, pour que les tests existants qui lisent les entrées par identifiant ne changent pas.
- **F11-TL-3 — Date locale et classement.** Fonctions pures `classifyTrips(summaries, today)` et `reopenTarget(summary, today, lastTab, routes)` dans `src/features/compte/trips.ts`, où `today` est la date locale de chaque voyage, calculée par la fonction de F10 (`src/features/voyage/today.ts`) si elle existe, sinon par une fonction `localDate(now, timeZone)` créée ici sur `Intl.DateTimeFormat` et reprise par F10a sans la renommer ; sans `Trip.timeZone` (F10a non fusionnée), F11 utilise `Europe/London` pour Édimbourg et `Europe/Lisbon` pour les voyages portugais via une table du jeu simulé transmise par l'adaptateur, jamais une constante du code de l'écran. Calcul dans un composant client après le montage (horloge injectable, `Date.now` par défaut, recalcul à `visibilitychange`), squelette avant ; le serveur ne choisit pas la date.
- **F11-TL-4 — Mémoire de l'onglet.** Un fournisseur client unique pour l'onglet, monté dans `src/app/voyages/layout.tsx` (au-dessus de `R17`, `R16`, `R11`, `R12`), qui garde le dernier onglet par voyage, les avis, les adresses et les goûts retenus ; s'il existe déjà le fournisseur de F9 (`src/app/voyages/[id]/layout.tsx`, F9-TL-8), les deux sont fusionnés en un seul au niveau `/voyages` plutôt qu'empilés. Le layout ne monte que le fournisseur (ni lecture de données ni `TripShell`) ; son poids est mesuré par le test `budget: JavaScript initial de la Journée`, qui reste strictement sous 200 000 octets, et la PR F11a donne la mesure avant et après. L'enregistrement du dernier onglet se fait là où le Séjour et la Journée sont rendus (`TripShell` ou layout `(programme)`), sans changer leur rendu. Aucune écriture dans le stockage du navigateur (règle `noClientStorage`).
- **F11-TL-5 — Actions de l'après-voyage.** Interface `ReviewActions` asynchrone (`rateStop`, `addPlace`, `removePlace`, `restorePlace`, `retainTastes`, `removeTaste`, `restoreTaste`), injectable comme `ProgrammeActions` (0015 § 6) ; implémentation de phase 0 en mémoire du fournisseur (F11-TL-4) ; la future implémentation serveur revalidera chaque entrée par les schémas de `src/contracts` dans des actions situées hors des zones de 0016 § 3.1 règle 4 (comme F9-TL-11), avec l'organisation de `getRequestContext()`.
- **F11-TL-6 — Adresses.** `tripRoutes` gagne une méthode pour `R16` (nom proposé `apresVoyage()`, chemin `/voyages/[id]/retour` du handover). **Point d'attention** : la méthode existante `retour()` désigne « Mes voyages » (niveau supérieur du Séjour) ; le chemin `/retour` de l'écran 16 et cette méthode portent le même mot pour deux choses différentes. Le Tech Lead peut préférer renommer `retour()` en `mesVoyages()` (usage unique dans `TripShell`) ; le chemin de `R16` reste celui du handover. `R17` est construit par cette même méthode, jamais écrit en dur.
- **F11-TL-7 — Pages d'erreur.** `src/app/not-found.tsx` (composant serveur), `src/app/error.tsx` (composant client, `reset`), `src/app/global-error.tsx` (avec `<html lang="fr">` et la police) ; textes de `fr.json` ; aucune lecture de données ; `error.message` et `digest` jamais rendus ni envoyés à la mesure ; les codes 404 et 500 conservés (test). Point d'attention : les pages qui répondent par `notFound()` (F9, F10) affichent ce même rendu ; les critères qui exigent « exactement le même contenu » pour plusieurs cas de 404 restent vrais.
- **F11-TL-8 — Catalogue.** `/dev/etats` sous `devPagesEnabled()` (décision 0013 § 1.6, 0015 § 1), 404 sans le drapeau ; ligne `curl` du job `docker` ; une page de développement qui lève une erreur volontaire (`/dev/etats/erreur`) pour capturer `error.tsx`, servie seulement avec le même drapeau.
- **F11-TL-9 — Événements.** Variantes strictes en `zod/mini` (0016 § 3) ; `rating`, `kind`, `origin` en énumérations fermées tirées de `@/contracts/values` ; `category` en `CategorySchema | "distance"` comme `preference_prompt_answered`.
- **F11-TL-10 — Lint.** `noClientStorage`, `react/jsx-no-literals` et la règle de 0016 § 3.1 règle 4 couvrent `src/features/compte`, `src/features/voyage`, `src/app/voyages/page.tsx`, `src/app/voyages/[id]/retour`, `src/app/not-found.tsx`, `src/app/error.tsx`, `src/app/global-error.tsx` ; aucun de ces fichiers n'importe `src/mocks` ni la carte (simulée ou Google).
- **F11-TL-11 — `DestinationPlate` dans une liste.** Prop de niveau de titre (`as?: "h1" | "h2" | "p"`, F9-TL-10) : sur `R17`, le nom de la plaque n'est pas un titre de niveau 1 ; et une forme « lien » (prop `href` ou rendu dans un `Link`) dont le nom accessible reprend le nom et la ligne d'informations, avec le contour de focus de Ligne visible sur l'aplat (contraste à vérifier par test, comme le contour de « Annuler » sur `ink`, décision 0014 § 1.2).

## Critères d'acceptation
Chaque critère porte l'étiquette de la PR qui le vérifie (F11-PO-20) : [a] F11a, [b] F11b, [c] F11c ; [a][b][c] pour un critère que chaque PR vérifie sur ses propres fichiers et écrans. Les dates sont celles du navigateur (`page.clock.install`), contexte `timezoneId: "Europe/London"` sauf mention.

Transverses :
- [ ] **C1** [a][b][c] `pnpm verify` passe, sans clé ni service externe ; aucune requête vers un autre hôte que l'application pendant les specs de F11 (zéro requête interceptée).
- [ ] **C2** [a][b] **Aucune persistance locale** : après les parcours de la PR (consultation de `R17`, réouverture, Séjour et Journée ; [b] avis, adresses, goûts retenus et retirés), `localStorage` et `sessionStorage` sont vides, `indexedDB.databases()` et `caches.keys()` renvoient des listes vides, aucun cookie n'est posé par l'application, aucun paramètre d'adresse n'est ajouté (tests `mes-voyages: aucune donnée persistée côté client` et `apres-voyage: aucune donnée persistée côté client`).
- [ ] **C3** [a][b][c] axe sans violation sur chaque état listé dans « Tests » ; contour de focus 2 px `line` décalé de 2 px ; chaque élément interactif mesure au moins 44 × 44 px ; chaque page a un seul titre de niveau 1 ; `lang="fr"` sur chaque page, pages d'erreur comprises (Playwright).
- [ ] **C4** [a][b][c] Aucune couleur, taille ni valeur en `px` en dur hors `provisoire.css` ; tous les textes dans `fr.json` sous `mesVoyages.*` [a][b], `apresVoyage.*` [b], `etats.*` [c] ; aucun texte « Aperçu », « Supprimer », « OK », « Valider », « Vérifié », « Premium » ni point d'exclamation dans ces clés ni dans le rendu ; `react/jsx-no-literals` actif sur les nouveaux fichiers ; aucun fichier de F11 n'importe `src/mocks` ni une carte (règle de lint testée).
- [ ] **C5** [a][b][c] Les captures 390 × 844 de chaque écran et état de la PR sont jointes **pour validation** (handover § 15, F11 ; Q165) ; la PR liste les rendus provisoires, les choix soumis au Tech Lead et l'absence de wireframe exporté (Q12).

Mes voyages [a] :
- [ ] **C6** [a] Horloge au 2026-08-01T12:00:00+01:00, ouverture de `/voyages` : titre « Mes voyages » ; plaque « Édimbourg » (couleur `dest-bruyere`) avec « sam. 29.08 – jeu. 03.09 · 2 adultes », lien vers le voyage débloqué ; sections dans l'ordre « À venir » (Édimbourg avec « 4 réservations à faire », puis Porto avec « 2 réservations à faire » et l'année 2027), « Pas encore débloqués » (Édimbourg, « Tes premières propositions », sans compteur), « Passés » (Lisbonne, sans compteur) ; pas de section « En cours » ; une seule `DestinationPlate` dans la page (test `mes-voyages: sections avant le voyage`).
- [ ] **C7** [a] Horloge au 2026-08-30T10:40:00+01:00 : « En cours » contient Édimbourg (débloqué) ; Édimbourg non débloqué reste dans « Pas encore débloqués » ; horloge au 2026-10-09T12:00:00+01:00 : pas de « En cours » ni de « Pas encore débloqués », plaque Porto (`dest-granit`), « Passés » dans l'ordre Édimbourg (« Non débloqué »), Édimbourg, Lisbonne (test `mes-voyages: sections pendant et après`).
- [ ] **C8** [a] **Date de la destination** : contexte `timezoneId: "Europe/Zurich"`, horloge au 2026-08-29T00:30:00+02:00 (23:30 le 28.08 à Édimbourg) : Édimbourg débloqué est dans « À venir », pas dans « En cours » ; à 2026-08-29T01:30:00+02:00 : « En cours » (test unitaire de `classifyTrips` et e2e).
- [ ] **C9** [a] Avant le classement, la page montre le squelette et « Chargement de tes voyages » (`role="status"`), jamais une liste classée puis reclassée (test unitaire du composant avec horloge différée).
- [ ] **C10** [a] **Réouverture** (horloge au 2026-08-01) : le lien d'Édimbourg débloqué mène à `/voyages/mock_trip_edimbourg_debloque` ; après une visite de la Journée 3 de ce voyage puis « Retour » jusqu'à `/voyages` (navigations côté client), le même lien mène à `/voyages/mock_trip_edimbourg_debloque/jour/3` ; après un rechargement de `/voyages`, de nouveau au Séjour ; le lien d'Édimbourg non débloqué mène à `/voyages/mock_trip_edimbourg/presentation` ; Lisbonne mène à son Séjour (test `mes-voyages: réouverture`).
- [ ] **C11** [a] **Aux dates du voyage** (horloge au 2026-08-30T10:40:00+01:00) : si F10a est fusionnée, le lien d'Édimbourg débloqué mène à `/voyages/mock_trip_edimbourg_debloque/aujourdhui`, même après une visite de la Journée 3 ; sinon il suit le dernier onglet (la PR dit lequel des deux cas elle vérifie) (test `mes-voyages: réouverture aux dates du voyage`).
- [ ] **C12** [a] « Retour » du Séjour de chaque voyage mène à `/voyages`, qui répond 200 (fin de la 404 annoncée par F5 et F8) ; `R17` n'a pas de bouton « Retour » (test).
- [ ] **C13** [a] **Aucun voyage** : avec un adaptateur qui renvoie une liste vide (test unitaire de la page, ou `R-etats` si F11c est fusionnée), « Tu n'as pas encore de voyage. », aucune section, aucune plaque, et « Créer un voyage » en `primary` vers `/voyages/nouveau` si l'écran 1 existe, sinon aucun lien (tests).
- [ ] **C14** [a] « Créer un voyage » n'est rendu que si `/voyages/nouveau` répond 200 dans le build testé ; aucun lien de `R17` ne mène à une page 404 (test qui suit chaque lien de `R17` aux trois dates de C6 et C7 et vérifie une réponse 200).
- [ ] **C15** [a] `listTrips` : exactement les voyages de l'organisation, `toReserveCount` égal aux lignes non faites (4 pour les deux Édimbourg, 2 pour Porto, 0 pour Lisbonne) ; autre organisation : liste vide ; `TripSummarySchema` refuse `days` et `placeId` ; les identifiants d'étapes des quatre voyages simulés sont disjoints ; les tests existants de F5 à F9 sur l'adaptateur `mock` passent sans modification (tests unitaires, sous réserve de F11-TL-2).
- [ ] **C16** [a] Section « Démonstration » : une entrée « Mes voyages » mène à `/voyages` ; les entrées existantes ne changent pas (test).
- [ ] **C17** [a] Le test `budget: JavaScript initial de la Journée` reste strictement sous 200 000 octets ; la PR F11a donne la mesure avant et après l'ajout du fournisseur (sous réserve de F11-TL-4).

Après le voyage [b] :
- [ ] **C18** [b] Horloge au 2026-10-09T12:00:00+01:00, `/voyages/mock_trip_lisbonne/retour` : titre « Ton avis sur Lisbonne », mention de démonstration, « Tes étapes » avec un titre de niveau 3 par jour et une ligne par activité ou repas, chacune avec trois choix sans valeur initiale ; aucun terminus ni segment évalué ; « Adresses découvertes » et « Retenir mes goûts » avec deux cases décochées (« Tu aimes les dégustations », « Déduit de tes J'aime », en pointillé ; « Tu préfères éviter les musées et monuments », « Confirmé par toi pendant la présentation ») (test `apres-voyage: contenu`).
- [ ] **C19** [b] « J'ai aimé » sur une étape puis « Pas fait » sur la même : la dernière valeur est seule sélectionnée, deux `stop_reviewed` (`liked` puis `not_done`, `kind` de l'étape), sans autre propriété ; après « Retour » au Séjour puis retour sur `R16` par navigation côté client, le choix est toujours là ; après un rechargement, aucun choix (test `apres-voyage: avis`).
- [ ] **C20** [b] **Avant la fin** : horloge au 2026-10-09, `/voyages/mock_trip_porto/retour` montre « Ton voyage n'est pas terminé. Tu pourras donner ton avis à partir du {titre du dernier jour}. » et « Voir le séjour », sans choix d'avis, formulaire ni cases ; au dernier jour de Porto (2027-05-11T09:00:00+01:00), le contenu complet (test).
- [ ] **C21** [b] **Adresses** : « Ajouter l'adresse » avec un nom vide : « Indique le nom de l'adresse. », `aria-invalid="true"`, focus sur le champ, rien d'ajouté ; « [Pastelaria du coin] » avec « Jour 2 » : ligne « [Pastelaria du coin] · Jour 2 », champ vidé, « Adresse ajoutée. » annoncé, un `discovered_place_added` `{ with_day: true }` ; « Retirer » puis « Annuler » dans les 5 s : état identique (égalité profonde), focus sur « Retirer » ; 81 caractères : « 80 caractères au plus. » ; à 20 adresses, le formulaire est remplacé par le message de limite ; aucune requête réseau pendant la saisie (tests).
- [ ] **C22** [b] **Opt-in** : « Retenir ces goûts » sans case cochée : « Coche au moins un goût à retenir. » (`role="alert"`), rien retenu, aucun `tastes_retained` ; une case cochée : « Goûts retenus : » et le libellé, « Voir dans Mes voyages », un `tastes_retained` `{ count: 1, inferred_count: … }` ; revenir sur `R16` : le goût est coché, désactivé, « Déjà retenu » (test `apres-voyage: retenir mes goûts`).
- [ ] **C23** [b] **Goûts retenus dans Mes voyages** : après C22, `/voyages` (navigation côté client) montre « Tes goûts retenus » avec le libellé et « Retenu après Lisbonne » ; « Retirer » : ligne retirée, `UndoToast` « Goût retiré. » `role="status"` ; « Annuler » dans les 5 s restaure l'état exact et place le focus sur « Retirer » ; sans « Annuler », un `taste_removed` `{ category, origin }` à l'expiration et la section disparaît ; sans goût retenu, la section n'existe pas (test `mes-voyages: goûts retenus`).
- [ ] **C24** [b] Le même sujet retenu depuis deux voyages (« Tu préfères éviter les musées et monuments » depuis Lisbonne puis depuis Édimbourg débloqué) n'apparaît qu'une fois dans « Tes goûts retenus », et sur `R16` d'Édimbourg il est « Déjà retenu » (test).
- [ ] **C25** [b] Lien « Donner ton avis » sur `R17` pour Lisbonne (2026-10-09) et pour Édimbourg débloqué à partir du 2026-09-03 (dernier jour) ; absent pour Porto au 2026-10-09 ; jamais imbriqué dans le lien du voyage (aucun `a` dans un `a`) ; si F10a est fusionnée, l'état « Ton voyage est terminé » de l'écran 15 propose « Donner ton avis » vers `R16` (tests).
- [ ] **C26** [b] **Hors ligne** sur `R16` (`context.setOffline(true)`) : bandeau `offline` « Tu es hors ligne. Ton avis sera possible dès le retour du réseau. », choix d'avis, « Ajouter l'adresse », « Retirer » et « Retenir ces goûts » en `aria-disabled="true"` ; retour du réseau : bandeau retiré et contrôles réactivés sans rechargement (test).
- [ ] **C27** [b] `R16` d'un voyage inconnu ou d'une autre organisation : 404 ; « Retour » de `R16` mène au Séjour du voyage (tests).
- [ ] **C28** [b] Événements : chaque ajout est validé par son schéma strict ; une propriété `tripId`, `stopId`, `name`, `destination`, un texte libre ou une catégorie hors `CategorySchema` est refusé (test `analytics: événements de l'après-voyage sans donnée personnelle`).

États transverses [c] :
- [ ] **C29** [c] `/adresse-inexistante` et `/voyages/inconnu` : statut 404, `lang="fr"`, titre « Page introuvable », « Cette page n'existe pas ou n'est plus disponible. », lien « Retour à l'accueil » vers `/` ; le contenu ne contient ni l'adresse demandée ni l'identifiant (test `etats: page introuvable`).
- [ ] **C30** [c] Page de développement qui lève une erreur (avec `VADROUILLE_DEV_PAGES`) : statut 500, titre « Cette page n'a pas pu s'afficher », « Réessayer » relance le rendu, « Retour à l'accueil » mène à `/` ; le message de l'erreur levée (qui contient un identifiant factice) n'apparaît pas dans la page (test `etats: erreur inattendue`) ; `global-error.tsx` rend les mêmes textes avec `lang="fr"` (test unitaire).
- [ ] **C31** [c] `/dev/etats` (avec le drapeau) montre, chacun sous son titre : « À confirmer », « Non confirmé », les six types de `StatusBanner` avec un texte réel tiré de `fr.json`, le bandeau d'erreur de calcul de `redaction.md`, l'état vide de Mes voyages, et les liens vers les deux pages ; chaque texte est lu depuis `fr.json` (aucune chaîne recopiée : règle `react/jsx-no-literals`) (test `etats: catalogue`).
- [ ] **C32** [c] Sans `VADROUILLE_DEV_PAGES` en production, `/dev/etats` et la page d'erreur volontaire répondent 404 (test unitaire et `curl` du job `docker`, sous réserve de F11-TL-8).

## Hors périmètre
- Page de compte : export et suppression des données, déconnexion, gestion des goûts au-delà de « Retirer » (F11-PO-19, Q164 ; B3, B11 ; Q27, Q48).
- Souvenir partageable (cadrage § 3.5 « après le MVP », handover § 16 ; Q163).
- Persistance réelle des avis, adresses, goûts et du dernier onglet ; tables `feedback` et `preferences` ; usage des avis dans la mémoire automatique ou la génération ; reprise des goûts retenus à la création d'un voyage (F8, B9) (Q161, Q162).
- « Débloquer » depuis Mes voyages (F9-Q8) ; restriction de l'après-voyage ou des voyages passés selon l'offre (Q160).
- Voyage en cours de génération dans Mes voyages (écran 5, F8 ; B9) ; plusieurs organisations par personne ; voyages d'une agence.
- Déclenchement réel des états « erreur de calcul » et « conflit » hors F7 (B-tâches) ; rendu définitif de `StatusBanner` (décision 0012 en revue, Q13).
- Hors-ligne de `R17` et `R16` (aucune mise en cache : la page de repli de F10 liste les voyages enregistrés) ; grand écran (F12) ; thème sombre ; notifications.

## Questions ouvertes
Nouvelles questions de cette spécification (numéros provisoires à partir de Q160 ; numéros définitifs attribués par le CEO dans `QUESTIONS.md`) :
- **Q160 (Samuel, offre ; liée à Q63, Q138, F9-Q3)** : le cadrage (§ 4) range « l'accès jusqu'à 30 jours après le retour » dans le voyage complet payé. Après ces 30 jours, que voit-on d'un voyage dans Mes voyages (rien, la ligne seule, le programme en lecture) et peut-on encore donner son avis ? Un voyage non débloqué a-t-il un « Après le voyage » ? F11 n'applique aucune restriction en phase 0 (F11-PO-7) ; le voyage d'Édimbourg du jeu simulé est déjà à plus de 30 jours de son retour au 2026-10-09. Bloque : la règle d'accès (B-tâche, B9) ; pas F11.
- **Q161 (Samuel, juridique et données personnelles ; liée à Q27, Q56)** : texte du consentement de « Retenir mes goûts » (faut-il un consentement distinct au sens de la nLPD et du RGPD, et une mention de durée ?) ; durées de conservation des avis, des adresses découvertes et des goûts retenus ; ce que la suppression du compte efface. Bloque : la persistance réelle (B-tâches) et le texte définitif de l'écran 16 ; pas F11 sur données simulées.
- **Q162 (Samuel, produit et données)** : à quoi servent les avis et les adresses découvertes au-delà du voyage : seulement à la personne (historique), à ses prochains voyages dans la même ville, à la mémoire automatique sous forme agrégée et anonyme (cadrage § 6.7, « taux de garde et de refus »), ou à rien ? Bloque : la tâche back-end de l'après-voyage ; pas F11 (aucun usage en phase 0).
- **Q163 (Samuel, phases)** : le cadrage liste « souvenir à partager » dans l'écran 16 (§ 3.1) mais le range « après le MVP » (§ 3.5, § 3.6) et le handover l'exclut (§ 16). F11 l'exclut : confirmer. Bloque : rien.
- **Q164 (CEO, puis Samuel pour le contenu)** : la page de compte (export et suppression des données, déconnexion), prévue par le cadrage § 3.5 et renvoyée à F11 par la spécification F8, n'est pas dans le handover § 6 ; F11 ne la livre pas (F11-PO-19). Créer une tâche dédiée après B3, Q27 et Q48 ? Bloque : la création du ticket ; pas F11.
- **Q165 (UX/UI)** : rendus et textes des trois wireframes en Ligne (validation des captures exigée par le handover § 15, F11) : Mes voyages (plaque mise en avant, lignes sans couleur, compteur, mentions « Tes premières propositions » et « Non débloqué », forme de l'année, squelette, état vide), Après le voyage (choix d'avis à trois valeurs, formulaire d'adresse, cases de goûts confirmés et déduits, état « pas terminé », bandeau hors ligne), goûts retenus, page introuvable, page d'erreur, catalogue. Bloque : la validation visuelle de F11 ; pas le code.
- **Q166 (Tech Lead)** : propositions F11-TL-1 à F11-TL-11 (contrats `TripSummary`, `TripReview` et formes en mémoire, `listTrips` et `getTripReview`, voyages simulés ajoutés en fin de liste, date locale et classement dans le navigateur, fournisseur unique de l'onglet au niveau `/voyages` et fusion avec celui de F9, `ReviewActions`, méthode `tripRoutes` de `R16` et ambiguïté de `retour()`, pages d'erreur, catalogue `/dev/etats`, événements, lint, `DestinationPlate` en lien). Bloque : le démarrage du code si le Tech Lead veut trancher avant ; sinon confirmées à la revue.
- **Q167 (CEO)** : découpage F11a, F11b, F11c (F11-PO-20) et ordre avec F5c (`DestinationPlate`), T4, F8a (écran 1), F9a (fournisseur de l'onglet), F10a (`Trip.timeZone`, date locale, écran 15) et F7a ou F10a (`useOnline`), fichiers partagés (`src/contracts`, `src/adapters`, `src/mocks`, `fr.json`, `eslint.config.mjs`, `DemoSection.tsx`, `TripShell.tsx`). Bloque : la création des tickets de code.
- **Q168 (Samuel, règle de Ligne ; complète Q37)** : le design system limite la plaque à une par écran et réserve les couleurs `dest-*` à la plaque, alors que le handover § 6 annonce des « cartes de voyage » dans Mes voyages. F11 met une seule plaque (voyage mis en avant) et des lignes sans couleur (F11-PO-3). Faut-il autoriser un repère de couleur par voyage dans la liste (modification de Ligne) ? Bloque : rien ; la règle actuelle s'applique.

Questions existantes qui touchent F11 (reprises sans les trancher) :
- **Q12, Q59** (Samuel) : wireframes et Dossier UX absents ; les captures de F11 seront confrontées aux wireframes quand ils seront exportés.
- **Q13** (UX/UI) et décision 0012 en revue : rendu et rôle de `StatusBanner` ; le catalogue montre le rendu en vigueur.
- **Q14** (Tech Lead) : `Stop.name` peut provenir de Google ; F11 n'affiche que des noms maison du jeu simulé, sans carte.
- **Q27, Q48** (Samuel) : conservation et suppression ; voir Q161 et Q164.
- **Q56** (Samuel) : mesure et consentement ; les quatre événements restent locaux.
- **Q63** (Samuel) : contenu d'un voyage non débloqué ; voir Q160.
- **Q100** (Tech Lead) : voyages simulés sans positions ; les deux voyages ajoutés n'en ont pas non plus.
- **F9-Q8** (Samuel, question de la spécification F9) : « Débloquer » ailleurs que la fin de l'aperçu, dont Mes voyages ; F11 n'en ajoute pas.
- **Q137 à Q144** (spécification F10, #76 en revue) : F11 réutilise `Trip.timeZone`, la date locale et `R15` s'ils sont fusionnés (F11-TL-3).

Observation pour le CEO (sans décision) : `tripRoutes("/dev/voyages", id).retour()` renvoie `/dev/voyages`, qui n'existe pas ; le « Retour » du Séjour des pages de développement mène donc à une 404. F11 ne crée pas `/dev/voyages` ; à traiter avec F11-TL-6 si le Tech Lead le souhaite.
