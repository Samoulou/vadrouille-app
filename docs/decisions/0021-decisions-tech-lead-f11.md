# 0021 — Décisions du Tech Lead pour F11 (Mes voyages, Après le voyage, états transverses)

Statut : décision déléguée, définitive sans veto de Samuel sous 2 jours (avant le 2026-10-11) ; à lister dans la note de version suivante, rubrique « Décisions prises par le studio » · Date : 2026-10-09 · Décideur : Tech Lead (architecture, bibliothèques, outillage, tests ; délégation « Qui décide quoi » de `docs/CONTEXT.md`) · Ticket #84

Numérotation : 0006 à 0012 sont réservés par #26 et #27, 0017 par #65 et 0019 par #72 (en revue). Aucun 0021 n'existe dans `main` ni dans une PR ouverte au 2026-10-09. Si l'une d'elles change de numéro, le CEO le signale avant de fusionner cette PR.

## Contexte
Une question déléguée au Tech Lead est ouverte :
- **Q155** (spécification F11, Q166 dans sa numérotation provisoire) : propositions F11-TL-1 à F11-TL-11 de `specs/F11-mes-voyages-apres-etats.md` (fusionnée par #81), à trancher avant le code de F11.

Correspondance des numéros : la spécification numérote ses questions à partir de Q160 ; `QUESTIONS.md` (PR « chore: status » #82) les a renumérotées. Cette décision utilise les numéros définitifs : Q149 (spec Q160), Q150 (Q161), Q151 (Q162), Q152 (Q163), Q153 (Q164), Q154 (Q165), Q155 (Q166), Q156 (Q167), Q157 (Q168).

Le code de F11 est découpé en trois PR (F11-PO-20 ; Q156, tranchée par le CEO) : **F11c** (page introuvable, page d'erreur, catalogue des états), indépendante, dès cette décision ; **F11a** (Mes voyages, réouverture, voyages simulés), après F9a et F10a ; **F11b** (Après le voyage, goûts retenus), après F11a. Pour chaque décision, la PR qui l'applique est indiquée. Chaque PR ne crée que ce qu'elle utilise.

Cette décision s'appuie sur les décisions 0013, 0015, 0016 et 0020, et amende **0020** là où c'est dit (§ 3, § 7 et § 8 de 0020 : décorateur `listTrips`, emplacement de `RetainedPreference`, emplacement du fournisseur). Elle est écrite pour rester cohérente, sans en dépendre, avec :
- **la spécification F10** (#76, en revue) et ses propositions F10-TL-1 à F10-TL-3 (`Trip.timeZone`, `today.ts`, `tripRoutes.aujourdhui()`), sur lesquelles le Tech Lead n'a pas encore rendu de décision (Q144). Les noms fixés ici (§ 3) s'imposent aux deux spécifications ; si la décision sur Q144 en retient d'autres, la décision fusionnée en second s'aligne sur l'autre par un amendement écrit, sur signalement du relecteur (même règle que 0020 avec 0017) ;
- **0017** (#65, F8) : format `Result<T>` et `API_ERROR_CODES` (§ 4 de 0017), repris par 0020 § 1.3 ;
- **le handover back-end** (#27, en revue : `TripSummary`, `TripReview`, tables `feedback` et `preferences`), sans le présupposer accepté.

Hors de cette décision (signalé, non tranché) :
- **Samuel** : accès après 30 jours et « Après le voyage » d'un voyage non débloqué (Q149) ; consentement, conservation et effacement des données de l'après-voyage (Q150) ; usage des avis et des adresses (Q151) ; souvenir partageable (Q152) ; une plaque par écran contre les « cartes de voyage » (Q157). Aucune décision ci-dessous ne fixe une règle d'accès, un texte de consentement, une durée de conservation ni un usage des données ;
- **UX/UI** : rendus et textes des trois wireframes (Q154), dont le composant du choix d'avis, la forme de l'année, le squelette et le rendu du catalogue ;
- **Product Owner** : comportement fonctionnel (les précisions du § 4 sur le dernier onglet lui sont soumises, voir « Questions liées ») ;
- **CEO** : ordre des tâches (Q156, tranchée) ; page de compte (Q153, tranchée).

**Aucune nouvelle dépendance** : `Intl.DateTimeFormat` (navigateur et Node), `zod` 4.6.5 et `zod/mini` sont déjà disponibles. `docs/decisions/0003-versions.md` ne change pas. Aucune de ces décisions n'engage d'argent, de compte externe ni de donnée personnelle hors UE : en phase 0, avis, adresses et goûts restent en mémoire de l'onglet et ne quittent pas le navigateur.

**Principe « l'agent cherche, l'ancrage vérifie, le moteur planifie »** : F11 ne cherche, ne vérifie et ne planifie rien. Le classement des voyages et la cible de réouverture sont des fonctions pures de lecture ; les candidats de goûts sont fixés par le jeu simulé et seront calculés par le back-end à partir des signaux (cadrage § 6.6), jamais par l'écran ni par un modèle.

**Règles Google** : F11 n'appelle aucun modèle et aucun service Google. Aucun contrat de F11 (`TripSummary`, `TripReview`, état en mémoire, événements) ne porte de `placeId`, de position ni de donnée de lieu Google (tests au § 1 et au § 9). `R17` et `R16` n'ont pas de carte et n'affichent que des noms maison et des noms saisis. Le nom d'une adresse découverte est saisi, jamais complété par une recherche de lieux. Quand `Stop.name` pourra provenir de Google (Q14, B-tâches), la tâche qui l'introduit traitera aussi ces deux écrans, qui l'affichent hors de la carte Google.

## Décisions

### 1. F11-TL-1 — Contrats
**Retenue, amendée** : `organizationId` retiré du résumé, `dayCount` ajouté, forme commune des préférences sortie dans un module à part.

#### 1.1 Valeurs (`src/contracts/values.ts`, sans `zod`, 0016 § 3.1 règle 1)
- `STOP_KINDS = ["activity", "meal", "event"] as const` : `StopSchema.kind` en dérive (`z.enum(STOP_KINDS)`), sans seconde copie ;
- `STOP_RATINGS = ["liked", "disliked", "not_done"] as const` ;
- `PREFERENCE_DIRECTIONS = ["more", "less"] as const` et `PREFERENCE_ORIGINS = ["confirmed", "inferred"] as const`. Ce sont les noms des valeurs de la forme commune du § 1.3, partagée avec F9b : il n'y a pas de `TASTE_DIRECTIONS` à côté. Si F9b les a déjà posés sous un autre nom, F11b reprend le sien sans seconde copie ;
- `DISCOVERED_PLACE_NAME_MAX = 80` et `DISCOVERED_PLACES_MAX = 20` ;
- `textLength(value: string): number`, nombre de points de code (`Array.from(value).length`) : la même mesure pour le message de l'écran et pour le schéma, un emoji compte pour un caractère ;
- `preferenceKey(subject): string`, clé stable d'un sujet (`category:museum:less`, `distance`), qui sert d'identifiant à `RetainedPreference` (0020 § 7) et décide « même sujet, même sens » (F11-PO-12, C24) ;
- `countToReserve(checklist: readonly { done: boolean }[]): number`, nombre de lignes non faites. `toReserveCount` du résumé (§ 1.2) et celui de `summarizeAdjustment` (0020 § 7, F9b) l'appellent tous les deux. **Point de revue** : aucun autre calcul de « réservations à faire ».

Si T4 n'est pas fusionnée au démarrage de la PR qui en a besoin, cette PR crée `values.ts` dans la forme de 0016 § 3.1 règle 1, avec ses seules valeurs ; T4 y ajoute les siennes.

#### 1.2 Résumé de voyage (`src/contracts/trip-summary.ts`)
- `TripSummarySchema = TripSchema.pick({ id, destination, destinationColor, start, end, timeZone, travellers, unlocked }).extend({ toReserveCount, dayCount })`, objet strict :
  - `toReserveCount` : entier ≥ 0 (`countToReserve(trip.checklist)`) ;
  - `dayCount` : entier ≥ 1 (`trip.days.length`). La réouverture en a besoin pour ignorer un jour qui n'existe plus (règle 3 de la spécification) sans transmettre les jours ;
  - `timeZone` : repris tel quel de `TripSchema` (§ 3), donc obligatoire dès que `Trip.timeZone` l'est.
- **`organizationId` n'est pas retenu** : la page l'enverrait au navigateur, qui n'en fait rien ; l'isolation est garantie par le contexte de la requête (`getRequestContext()`), jamais par une donnée du client.
- Le schéma est vérifié strict après `pick` et `extend` (test : `days`, `placeId`, `organizationId` et `checklist` refusés).
- PR : **F11a**.

#### 1.3 Forme commune des préférences (`src/contracts/preference.ts`) — amende 0020 § 7
- `PreferenceSubjectSchema` : `{ kind: "category"; category: Category; direction }` ou `{ kind: "distance" }`, `direction` en `z.enum(PREFERENCE_DIRECTIONS)` ;
- `RetainedPreferenceSchema = { id, origin, subject }`, `origin` en `z.enum(PREFERENCE_ORIGINS)`, avec le raffinement `id === preferenceKey(subject)` (testé).
- C'est la forme de 0020 § 7, **déplacée** de `src/contracts/adjustment.ts` vers ce module pour que F9b et F11b la partagent sans dépendre l'une de l'autre : `AdjustmentSummarySchema.retained` l'importe. La forme ne change pas. La première des deux PR (F9b ou F11b) crée le module ; la seconde le réutilise.

#### 1.4 Revue (`src/contracts/review.ts`)
- `TripReviewSchema = { tripId, tasteCandidates: RetainedPreference[] }`, sans doublon de `id` (raffinement testé). `TasteCandidate` est un alias de type de `RetainedPreference`, pas un second schéma.
- Les étapes à évaluer ne sont pas dans le contrat : elles se dérivent du `Trip` (§ 5, `review.ts`).
- Formes de l'état en mémoire et du futur contrat serveur, schémas stricts :
  - `StopReviewSchema = { stopId, rating }`, `rating` en `z.enum(STOP_RATINGS)` ;
  - `DiscoveredPlaceSchema = { id, name, day? }`, `name` passé par `trim()` puis contrôlé par `textLength` entre 1 et `DISCOVERED_PLACE_NAME_MAX`, `day` entier ≥ 1 ;
  - `RetainedTasteSchema = RetainedPreferenceSchema.extend({ fromTripId })`.
- **`retainedAt` n'est pas retenu en phase 0** : l'ordre de la liste suffit (« dans l'ordre où ils ont été retenus ») et un instant demanderait une horloge de plus. La tâche back-end de l'après-voyage l'ajoutera côté serveur, posé par le serveur.
- Ces schémas servent les tests et la future revalidation serveur (§ 5) ; le client n'en importe que les types (`import type`) et les valeurs de `@/contracts/values` (0016 § 3.1 règle 2).
- Tests : chaque schéma refuse un champ inconnu, un `placeId` et un nom de 0 ou de 81 caractères (espaces seuls compris) ; un nom de 80 points de code passe.
- PR : **F11b** (§ 1.3 si F9b ne l'a pas créé).

### 2. F11-TL-2 — Lecture et jeux simulés
**Retenue, précisée** : `listTrips` sur `TripAdapter` et dans le décorateur de 0020 § 3 ; `getTripReview` en fonction à part.

- **`TripAdapter.listTrips(ctx): Promise<TripSummary[]>`** (`src/adapters/types.ts`) :
  - l'adaptateur `mock` dérive les résumés de ses entrées par une fonction pure (`toTripSummary(trip)`, `src/adapters/mock.ts`), chaque sortie validée par `TripSummarySchema` ;
  - seulement les voyages de `ctx.organizationId` ; autre organisation : liste vide ;
  - **aucun ordre garanti** : le classement est dans `trips.ts` (§ 3). Le test vérifie l'ensemble, pas l'ordre.
- **Amendement de 0020 § 3** : `withSimulatedUnlock` implémente aussi `listTrips`. Pour un voyage non débloqué dans les données et débloqué par un droit de la portée, le résumé est celui de son pendant, réétiqueté (`id` payé, `unlocked: true`), donc `toReserveCount` et `dayCount` du pendant, et validé par `TripSummarySchema`. Les autres résumés ne changent pas. `R17` lit par `getTripReader()` (point de revue de 0020 § 3 : aucune page du voyage n'appelle `getTripAdapter()` directement). Test : après un droit simulé sur `mock_trip_edimbourg`, son résumé est débloqué, avec 4 réservations, et aucun `mock_trip_edimbourg_debloque` n'y apparaît sous l'identifiant payé.
- **`getTripReview(ctx, tripId): Promise<TripReview | null>`**, exportée par `src/adapters`, **pas** une méthode de `TripAdapter` (même raison que `getRevisionFixtures`, 0016 § 6, et `getAdjustmentFixtures`, 0020 § 7 : en phase 0, les candidats sont un jeu fixe, et la tâche back-end définira la lecture réelle avec la table `preferences`) :
  - `null` pour un voyage inconnu ou d'une autre organisation (vérifié sur les entrées de l'adaptateur de base) ;
  - `null` quand l'adaptateur configuré n'est pas `mock` ;
  - un voyage connu sans candidats renvoie `{ tripId, tasteCandidates: [] }` ;
  - sortie validée par `TripReviewSchema` ;
  - candidats dans `src/mocks/avis.ts`, lus seulement par `src/adapters` et les tests.
  
  La page `R16` lit le voyage par `getTripReader()` (404 s'il est `null`), puis `getTripReview(ctx, trip.id)` (404 s'il est `null`). Un voyage payé par la simulation garde ses propres candidats (aucun pour `mock_trip_edimbourg`) : ils ne sont pas réétiquetés depuis le pendant.
- **Voyages supplémentaires** : `src/mocks/autres-voyages.ts` (`mock_trip_lisbonne`, `mock_trip_porto`), ajoutés à `DEFAULT_ENTRIES` **après** les deux d'Édimbourg, sans `maps`. Même organisation simulée que les voyages d'Édimbourg (`MOCK_ORGANIZATION_ID`). Les jours sont construits par des fonctions du module (pas de recopie d'Édimbourg).
- **Tests** : `listTrips` renvoie exactement 4 résumés (C15), `toReserveCount` de 4, 4, 2 et 0, `dayCount` égal à l'écart entre `start` et `end` plus un ; identifiants d'étapes des quatre voyages disjoints ; aucun `placeId` ni position dans les deux voyages ajoutés ; les tests existants de l'adaptateur `mock` (F5 à F9) passent **sans modification** ; `getTripReview` : candidats de la spécification, `null` hors organisation et hors `mock`.
- PR : **F11a** (`listTrips`, voyages), **F11b** (`getTripReview`, `avis.ts`).

### 3. F11-TL-3 — Date locale et classement
**Retenue, amendée** : une seule fonction de date locale, partagée avec F10 ; la table de fuseaux du jeu simulé est **refusée**.

- **Date locale** : `localDateAt(now: number, timeZone: string): IsoDate` (« AAAA-MM-JJ »), dans `src/features/voyage/today.ts`, sur `Intl.DateTimeFormat` avec `timeZone` et `formatToParts` (jamais l'ordre d'un format régional). C'est le socle du calcul de F10-TL-2 (`currentDayIndex` s'écrit avec elle) : un seul calcul de la date de la destination dans l'application.
  - F10a précède F11a (Q156) : F11a réutilise `today.ts` et `Trip.timeZone` de F10a. Si `localDateAt` n'y est pas sous ce nom, F11a l'ajoute à `today.ts` et `currentDayIndex` l'appelle, sans seconde implémentation.
  - **Si F10a n'est pas fusionnée au démarrage de F11a** (changement d'ordre du CEO) : F11a crée `Trip.timeZone` dans la forme de F10-TL-1 (identifiant IANA obligatoire, valeurs du jeu simulé `Europe/London` et `Europe/Lisbon`) et `localDateAt` dans `today.ts` ; F10a les réutilise. La table de fuseaux « transmise par l'adaptateur » de la proposition n'est pas retenue : elle ferait une seconde source du fuseau, que `Trip.timeZone` remplacerait ensuite.
  - Tests : appareil à `Europe/Zurich` le 2026-08-29 à 00:30 (destination `Europe/London` : 2026-08-28) et à 01:30 (2026-08-29) ; changement d'heure d'été ; fuseau inconnu : erreur levée (le schéma l'a déjà refusé).
- **Fonctions pures** de `src/features/compte/trips.ts`, qui n'importent que des types de `@/contracts`, des valeurs de `@/contracts/values`, `today.ts` et le module d'adresses :
  - `classifyTrips(summaries: readonly TripSummary[], now: number): TripSections`, avec `TripSections = { current, upcoming, locked, past, featured }`. La date de référence est calculée **par voyage**, à son fuseau (`now` et non une date unique : deux voyages peuvent être dans deux fuseaux). Ordres et égalités de la spécification ;
  - `reopenTarget(summary: TripSummary, now: number, lastTab: LastTab | undefined): string`, avec `LastTab = { kind: "sejour" } | { kind: "jour"; n: number }`. Règle 1 par `tripRoutes(…).aujourdhui()` ; règle 3 par `presentationRoute()` pour un voyage non débloqué à venir. Un `n` hors de `1…dayCount` est ignoré.
- **Dates affichées** : la ligne « {début} – {fin} · {voyageurs} » est produite par une seule fonction pure, `formatTripDates(start, end, travellers, { currentYear })`, dans `src/lib/dates.ts`, que `DestinationPlate` (F5c) et la ligne de voyage appellent toutes deux. Le jour de la semaine se calcule depuis la date ISO en UTC (`Date.UTC`), sans fuseau ; `currentYear` est l'année de `localDateAt(now, summary.timeZone)`. La première PR qui en a besoin (F5c ou F11a) la crée ; la forme de l'année reste à UX/UI (Q154).
- **Calcul après le montage** : `useClientNow(options?)` (`src/features/voyage/use-client-now.ts`) renvoie `null` au rendu serveur et au premier rendu client, puis `now()` après le montage, relu à `visibilitychange` (page redevenue visible). Horloge injectable (`now: () => number`, `Date.now` par défaut). F10a l'utilise aussi, avec son minuteur aligné sur la minute (option `tickEveryMinute`) ; la première des deux PR le crée. Tant que la valeur est `null`, `TripsScreen` rend le squelette (C9) : le serveur ne choisit jamais la date et aucune liste n'est reclassée à l'hydratation.
- Tests : ceux de la spécification (« Unitaires », `trips.ts`), plus `useClientNow` (`null` puis valeur, relecture à `visibilitychange`, nettoyage au démontage).
- PR : **F11a** ; `R16` (dernier jour, F11-PO-8) réutilise `localDateAt` et `useClientNow` en **F11b**.

### 4. F11-TL-4 — Mémoire de l'onglet — amende 0020 § 8
**Retenue** : un seul fournisseur, au niveau `/voyages`.

- **Emplacement** : F11a **déplace** le montage de `TripSessionProvider` (0020 § 8) de `src/app/voyages/[id]/layout.tsx` vers `src/app/voyages/layout.tsx`, qui enveloppe `R17`, `R16`, `R6`, `R9` et ses sous-routes, `R10`, `R11`, la Journée et `R15`. Le layout `[id]` de F9a, qui ne montait que ce fournisseur, est supprimé. Raison : `R17` doit lire l'état de chaque voyage, ce qu'un layout `[id]` ne permet pas, et deux fournisseurs empilés feraient deux sources de vérité.
  - Le nouveau layout ne monte **que** le fournisseur : ni lecture de données, ni `TripShell`, ni carte. Il ne contredit pas 0016 § 1.1 : le groupe `(programme)` garde seul la carte et le panneau.
  - Le fournisseur garde son nom et son dossier (`src/features/voyage/TripSessionProvider.tsx`, réducteur pur `trip-session.ts`), pour ne pas renommer le code de F9a.
- **État** :
  - par voyage (`Map` rangée par `tripId`, comme 0020 § 8) : paiements (F9a), session de tri (F9b), **dernier onglet** (`LastTab`, F11a), **avis** (`Map<stopId, StopRating>`), **adresses** (liste ordonnée et compteur d'identifiants), **dernier retrait annulable** (F11b) ;
  - au niveau de l'onglet : **goûts retenus** (liste ordonnée de `RetainedTaste`, sans doublon de `id`) et dernier retrait annulable (F11b).
  - Le réducteur de l'après-voyage peut vivre dans un module pur à part (`review-state.ts`), composé par `trip-session.ts` ; chacun est testé sans React.
  - Identifiants d'adresses : compteur local par voyage (`place-1`, `place-2`…), jamais réutilisé après un retrait, pour qu'« Annuler » restaure le même identifiant. Le serveur attribuera les siens (B-tâche).
  - Un seul retrait annulable à la fois par liste : un nouveau retrait rend le précédent définitif (règle de `UndoToast`, F6-PO-6).
- **Enregistrement du dernier onglet** : dans `TripShell`, par un effet sur `trip.id` et le jour courant : `{ kind: "jour", n }` quand un jour est affiché (Journée, fiche `?etape=`, et les sous-pages `remplacer` et `ajouter` de F7, qui rouvrent la Journée), sinon `{ kind: "sejour" }`. Le rendu de `TripShell` ne change pas. Le crochet `useOptionalTripSession()` renvoie `null` hors du fournisseur : les pages de développement (`/dev/voyages`, qui n'ont pas le fournisseur) et les tests existants de `TripShell` n'enregistrent rien et ne changent pas. Point soumis au Product Owner : les sous-pages de F7 (voir « Questions liées »).
- **Aucun stockage** : ni `localStorage`, ni `sessionStorage`, ni IndexedDB, ni Cache Storage, ni cookie, ni paramètre d'adresse ; règle `noClientStorage` étendue (§ 10) ; test e2e C2.
- **Budget** : le fournisseur entre dans le JavaScript initial de la Journée. Le test `budget: JavaScript initial de la Journée` (0016 § 3.1 règle 5) reste strictement sous 200 000 octets ; F11a et F11b donnent chacune la mesure avant et après. La même mesure est journalisée sans seuil sur `R17` (F11a) et `R16` (F11b).
- Tests : réducteurs (dernier onglet, avis, ajout, retrait et restauration à l'égalité profonde, limite de 20, goûts sans doublon, retrait et restauration) ; `TripShell` enregistre Séjour, Journée 3 et fiche comme Journée ; navigation entre deux voyages sans mélange d'état ; e2e C10 et C19 (conservé en navigation côté client, perdu au rechargement).
- PR : **F11a** (déplacement, dernier onglet), **F11b** (avis, adresses, goûts).

### 5. F11-TL-5 — Actions de l'après-voyage
**Retenue, précisée** : résultats au format commun, aucune action serveur en phase 0.

- Interface `ReviewActions` dans `src/features/voyage/review-actions.ts`, toute asynchrone, au format `Result<T>` de 0017 § 4 et 0020 § 1.3 (`src/contracts/errors.ts`, type importé par `import type`) :
  - `rateStop(tripId, stopId, rating)` : `Promise<Result<StopReview>>` ;
  - `addPlace(tripId, { name, day? })` : `Promise<Result<DiscoveredPlace>>` ;
  - `removePlace(tripId, placeId)` et `restorePlace(tripId, placeId)` : `Promise<Result<void>>` ;
  - `retainTastes(tripId, candidateIds)` : `Promise<Result<RetainedTaste[]>>`, qui ne renvoie que les goûts **nouvellement** retenus (un sujet déjà retenu est ignoré, sa première origine et son premier voyage sont conservés : C24) ;
  - `removeTaste(tasteId)` et `restoreTaste(tasteId)` : `Promise<Result<void>>`.
- **Codes d'erreur** : `validation_failed` (nom vide ou trop long, jour hors du voyage, liste de candidats vide, candidat inconnu du voyage, étape qui n'est pas à évaluer), `not_found` (voyage, adresse ou goût inconnu, restauration sans retrait en attente) et **`limit_reached`** (21ᵉ adresse), ajouté à `API_ERROR_CODES` par F11b. L'écran valide d'abord avec les mêmes fonctions pures (`review.ts`) et n'affiche que ses propres messages ; aucune erreur technique n'est rendue.
- **Implémentation de phase 0** : `createMemoryReviewActions({ trip, review, dispatch, getState })`, sur le réducteur du fournisseur (§ 4), sans réseau ni stockage. Elle reçoit le voyage et la revue lus par la page, pour vérifier étapes et candidats. Comme 0015 § 6, l'écran envoie les événements quand l'action est résolue ; l'implémentation n'en envoie aucun.
- **Future implémentation serveur** (tâche back-end de l'après-voyage, après Q150 et Q151) : `src/server/actions/apres-voyage.ts` (0020 § 11), entrée reçue en `unknown`, `parseInput` par les schémas du § 1.4, organisation de `getRequestContext()`, jamais une valeur du navigateur. **F11 ne crée aucune action serveur** et n'écrit rien sur le serveur.
- Hors ligne : l'écran ne les appelle pas (`aria-disabled`, C26) ; `useOnline()` est celui de 0016 § 10 (`src/lib/online.ts`), créé par F11b sous cette forme s'il n'existe pas.
- Tests : chaque méthode (succès, chaque code), restauration à l'égalité profonde, goût déjà retenu, implémentation injectée dans `ReviewScreen` et `RetainedTastes` par des doubles.
- PR : **F11b**.

### 6. F11-TL-6 — Adresses
**Retenue, avec renommage de `retour()`.**

- `tripRoutes` (`src/features/sejour/routes.ts`) gagne `apresVoyage()` = `{base}/{id}/retour`, le chemin du handover.
- **`retour()` est renommé `mesVoyages()`** : le mot « retour » désignerait sinon deux écrans différents. Son seul appel (`TripShell`) change dans la même PR.
- **`mesVoyages()` renvoie toujours `/voyages`**, quelle que soit la base : `R17` n'a pas de pendant de développement. Cela corrige l'observation de la spécification (« Retour » du Séjour de `/dev/voyages` vers une 404) sans créer `/dev/voyages`. Le module exporte aussi `mesVoyagesRoute()` (même valeur), pour `R17` lui-même, la section « Démonstration » et le lien « Voir dans Mes voyages ». **Point de revue** : aucune adresse `/voyages` n'est écrite en dur ailleurs.
- `apresVoyage()` suit la base comme les autres méthodes ; aucun écran de développement ne le lie.
- Tests : `apresVoyage()` et `mesVoyages()` pour les deux bases, identifiant encodé ; le test existant de `retour()` est **renommé** avec la méthode, pas supprimé.
- PR : **F11a** (`mesVoyages`, `mesVoyagesRoute`), **F11b** (`apresVoyage`).

### 7. F11-TL-7 — Pages d'erreur et d'introuvable
**Retenue, précisée.**

- **`src/app/not-found.tsx`** : composant serveur, sans lecture de données ni de paramètre. Textes de `fr.json` (`etats.introuvable.*`). Titre du document par l'export `metadata` ; si Next 16.4 ne l'applique pas à cette page (le test e2e le dit), par l'élément `<title>` de React 19. Il sert toute 404 de l'application, y compris les `notFound()` des écrans et des layouts. Son contenu ne dépend ni de l'adresse ni de la raison : les critères « exactement le même contenu » de F9 et F10 restent vrais par construction.
- **`src/app/error.tsx`** : composant client. « Réessayer » appelle `startTransition(() => { router.refresh(); reset(); })` : `reset` seul ne relance pas un composant serveur. `error.message`, `error.digest` et la pile ne sont **ni rendus, ni journalisés (`console.*`), ni envoyés à la mesure** ; aucun événement n'est émis. Titre par l'élément `<title>`.
- **`src/app/global-error.tsx`** : mêmes textes et même rendu, avec son propre `<html lang="fr">` et `<body>`, la feuille `@/styles/globals.css` et la police. Pour ne pas recopier la configuration de la police, `Hanken_Grotesk` est déplacée de `src/app/layout.tsx` vers `src/app/fonts.ts`, importé par les deux.
- Les deux pages d'erreur partagent un composant de rendu (`src/features/etats/ErrorContent.tsx` ou équivalent) : un seul endroit pour les textes et les boutons.
- **Codes HTTP** : 404 conservé (`/adresse-inexistante`, `/voyages/inconnu`) ; 500 pour une erreur levée au rendu d'une page dynamique **sans `loading.tsx`** (sinon le statut part avant l'erreur). Vérifiés en e2e (C29, C30).
- Tests unitaires : textes, liens, absence du message d'une erreur injectée contenant un identifiant factice ; `global-error.tsx` rendu par `renderToStaticMarkup` (`react-dom/server`) pour vérifier `<html lang="fr">` sans avertissement d'imbrication.
- PR : **F11c**.

### 8. F11-TL-8 — Catalogue des états
**Retenue, précisée.**

- `src/app/dev/etats/page.tsx` (`R-etats`) et `src/app/dev/etats/erreur/page.tsx`, chacune avec `export const dynamic = "force-dynamic"`, `robots: { index: false, follow: false }` et `devPagesEnabled()` **en premier**, puis `notFound()` (0013 § 1.6, 0015 § 1). La page d'erreur lève son erreur **après** ce contrôle et seulement à la requête : rendue dynamiquement, elle ne casse pas `next build`.
- `src/dev/EtatsShowcase.tsx` assemble les états avec les composants réels.
- **Textes** : chaque texte vient d'une clé existante de `fr.json` par une table du catalogue (`état → clé`), jamais recopié. Pour un type de `StatusBanner` dont l'écran propriétaire n'est pas fusionné (`conflict` et `noOption` avant F7a et F8, par exemple), le catalogue utilise la clé d'exemple déjà présente pour `/dev/composants` (`dev.composants…`), sous la mention « texte d'exemple » ; **point de revue** : la PR qui crée la clé propriétaire met la table à jour. Le bandeau d'erreur de calcul (`redaction.md`) a sa clé propre, `etats.erreurCalcul`, créée par F11c.
- **État vide de `R17`** : F11c précède F11a. La section « Aucun voyage » est ajoutée au catalogue par **F11a**, qui y rend `TripsScreen` avec une liste vide (C13) ; d'ici là, elle n'est pas rendue.
- **Job `docker`** : deux lignes `curl` attendent 404 sur `/dev/etats` et `/dev/etats/erreur` sans `VADROUILLE_DEV_PAGES`.
- PR : **F11c** (section vide de `R17` : **F11a**).

### 9. F11-TL-9 — Événements
**Retenue.**

- Variantes strictes de `src/analytics/events.ts`, en `zod/mini` si T4 est fusionnée (0016 § 3.1 règle 3), sinon dans la forme en vigueur dans `main`, que T4 réécrit :
  - `stop_reviewed { rating, kind }`, `rating` de `STOP_RATINGS`, `kind` de `STOP_KINDS` ;
  - `discovered_place_added { with_day: boolean }` ;
  - `tastes_retained { count, inferred_count }`, entiers, `count` ≥ 1, `0 ≤ inferred_count ≤ count` (raffinement testé) ;
  - `taste_removed { category, origin }`, `category` en `CategorySchema` ou `"distance"` comme `preference_prompt_answered`, `origin` de `PREFERENCE_ORIGINS`.
- Envois : `discovered_place_added` à l'ajout réussi ; `taste_removed` à l'expiration du délai d'annulation, jamais à « Retirer » (comme `preference_removed`, 0020 § 9).
- Tests (C28) : refus de `tripId`, `stopId`, `placeId`, `name`, `destination`, d'un texte libre, d'une catégorie hors liste et de `inferred_count > count`.
- PR : **F11b**.

### 10. F11-TL-10 — Lint
**Retenue, précisée.**

- **`react/jsx-no-literals`** (`noStrings: true, ignoreProps: true`) sur : `src/features/compte/**`, `src/features/voyage/**`, `src/features/etats/**`, `src/app/voyages/**` (déjà couvert), `src/app/not-found.tsx`, `src/app/error.tsx`, `src/app/global-error.tsx`, `src/app/dev/etats/**` et `src/dev/EtatsShowcase.tsx`.
- **`noClientStorage`** sur les mêmes fichiers (`*.{js,jsx,ts,tsx}`), hors tests. `src/features/voyage/` est déjà couvert par 0020 § 8 ; F10 y garde son exception pour le seul module hors ligne qu'elle désigne (F10-TL-5).
- **Imports** : ni `src/mocks`, ni la carte simulée, ni la carte Google (`@/components/carte`) dans `src/features/compte`, `src/features/voyage/ReviewScreen.tsx` et ses modules, les pages `R17`, `R16`, et les trois pages d'erreur. La règle de 0016 § 3.1 règle 4 (pas de `zod`, pas d'import de valeur de `@/contracts`) et celle de 0020 § 11 (`@/server/*` limité à `@/server/actions/*`) s'appliquent à ces fichiers. Comme le rappelle 0015 § 1 (configuration plate : la dernière règle `no-restricted-imports` l'emporte), le bloc qui ajoute l'interdiction de la carte **reprend** tous les motifs précédents.
- Tests dans `tests/unit/lint/` : un texte en dur, un `localStorage`, un import de `@/mocks/avis`, de `@/components/carte` et de `zod` sont refusés dans `src/features/compte` et dans `src/app/not-found.tsx` ; un import de `@/contracts/values` passe ; les interdictions précédentes tiennent toujours.
- PR : **F11c** (pages d'erreur, catalogue), **F11a** (`compte`, `R17`), **F11b** (`R16`, après-voyage), chacune pour ses fichiers.

### 11. F11-TL-11 — `DestinationPlate` dans une liste
**Retenue, précisée.**

- Prop `as?: "h1" | "h2" | "p"` de 0020 § 10 ; sur `R17`, `as="p"` : le seul titre de niveau 1 reste « Mes voyages ».
- Prop **`href?: string`** : avec elle, la plaque est rendue dans un `Link` de Next ; sans elle, le rendu de F5 et de F9 ne change pas. Le nom accessible est celui du **contenu visible** (nom et ligne d'informations), sans `aria-label`, pour que le nom prononcé corresponde au texte vu (WCAG 2.5.3).
- **Contour de focus** : celui de Ligne (2 px `line`, décalé de 2 px), donc **à l'extérieur** de l'aplat, sur le fond de la page ; aucun parent n'a `overflow: hidden` qui le couperait. Tests : contraste du contour contre `page` ≥ 3:1 dans `tests/unit/contrast.test.ts` (déjà mesuré pour les autres contrôles, vérifié ici pour la plaque) ; capture de la plaque au focus ; e2e : la plaque est atteignable au clavier et mesure au moins 44 × 44 px.
- La PR qui crée `DestinationPlate` (F5c, F9a ou F11a) inclut `as` ; **F11a** ajoute `href`.

## Conséquences
- **F11c** : `not-found.tsx`, `error.tsx`, `global-error.tsx`, rendu partagé, `src/app/fonts.ts` ; `/dev/etats`, `/dev/etats/erreur`, `EtatsShowcase`, `etats.erreurCalcul` ; deux lignes `docker` ; lint et tests de ses fichiers.
- **F11a** : `values.ts` (`STOP_KINDS`, `countToReserve`, si absents), `trip-summary.ts`, `listTrips` (adaptateur `mock` et `withSimulatedUnlock`), `autres-voyages.ts` ; `localDateAt` et `useClientNow` s'ils n'existent pas (ou `Trip.timeZone` dans le cas du § 3) ; `trips.ts`, `TripsScreen`, `formatTripDates` si F5c ne l'a pas livré ; déplacement de `TripSessionProvider` dans `src/app/voyages/layout.tsx` et dernier onglet dans `TripShell` ; `mesVoyages()`, `mesVoyagesRoute()` ; `DestinationPlate` avec `href` ; section vide du catalogue ; mesure du budget.
- **F11b** : `preference.ts` si F9b ne l'a pas créé, `review.ts` (contrat), `getTripReview`, `avis.ts` ; `review.ts` (fonctions pures), `review-state.ts`, `review-actions.ts`, `ReviewScreen`, `RetainedTastes` ; `apresVoyage()` ; `limit_reached` ; quatre événements ; `useOnline()` s'il n'existe pas ; mesure du budget.
- **F9b** : importe `RetainedPreferenceSchema` de `src/contracts/preference.ts` (§ 1.3) et `countToReserve` (§ 1.1).
- **F10a** : `currentDayIndex` s'écrit sur `localDateAt` (§ 3) ; `useClientNow` partagé.
- **Spécification F11** : ses critères ne changent pas (règle de sa section « Choix réservés au Tech Lead » : un critère « sous réserve de F11-TL-x » s'applique à la forme retenue). Sa prochaine mise à jour (Product Owner) pourra renvoyer à cette décision pour : `organizationId` retiré et `dayCount` ajouté au résumé (§ 1.2), `RetainedPreference` dans `preference.ts` (§ 1.3), `getTripReview` hors de `TripAdapter` (§ 2), `localDateAt` et l'abandon de la table de fuseaux (§ 3), le fournisseur dans `src/app/voyages/layout.tsx` (§ 4), `mesVoyages()` (§ 6), `href` de `DestinationPlate` (§ 11) et la section vide du catalogue livrée par F11a (§ 8).
- **Spécification F10** (#76) : à aligner par son auteur ou par la décision sur Q144 sur `localDateAt` et `useClientNow` (§ 3).
- **B0 (#27)**, à répercuter par son relecteur si #27 est fusionnée après celle-ci, sinon par la tâche back-end de l'après-voyage : `TripSummary` sans `organizationId` et avec `dayCount` ; `RetainedPreference` commun ; `retainedAt` posé par le serveur ; actions dans `src/server/actions/apres-voyage.ts`.
- **Tâches induites** : aucune nouvelle tâche. Tout ce qui précède entre dans F11a, F11b et F11c, ou dans F9b et F10a déjà prévues.
- **Revue** des PR F11a, F11b et F11c : le Tech Lead vérifie leur conformité à cette décision. Un écart demande un amendement écrit ici, pas une exception silencieuse.

## Questions liées
**Nouvelles questions** (numéros provisoires ; le CEO attribue les numéros définitifs dans `QUESTIONS.md`) :
- **Q158 (Product Owner)** : aligner la spécification F11 sur cette décision à sa prochaine mise à jour (liste des points dans « Conséquences », « Spécification F11 »). **Bloque** : rien ; d'ici là, cette décision prime et les PR F11a, F11b et F11c la citent.
- **Q159 (Product Owner)** : les sous-pages de la Journée ajoutées par F7 (`remplacer`, `ajouter`) comptent comme « Journée n » pour le dernier onglet consulté (§ 4), comme la fiche ; confirmer ou dire qu'elles ne doivent rien enregistrer. **Bloque** : rien ; la règle du § 4 s'applique d'ici là.

**Questions déjà ouvertes, rappelées** (non tranchées ici) :
- **Q149, Q150, Q151, Q152, Q157** (Samuel) : aucune décision technique ici n'en préjuge. F11 n'applique aucune restriction d'accès, ne persiste rien et n'utilise aucun avis ; la future action serveur (§ 5) attend Q150 et Q151.
- **Q154** (UX/UI) : rendus et textes provisoires de F11, dont le composant du choix d'avis et la forme de l'année.
- **Q144** (Tech Lead, F10) : la décision qui la tranchera reprend `localDateAt` et `useClientNow` (§ 3), ou amende cette décision.
- **Q14** (Tech Lead) : `Stop.name` d'origine Google, à traiter aussi pour `R16` et `R17` (règles Google, ci-dessus).
- **Q13** (UX/UI) et décision 0012 en revue : le catalogue montre le rendu de `StatusBanner` en vigueur.
- **Q100** (Tech Lead) : les deux voyages ajoutés n'ont pas de positions.
