# B2 — Évolutions des contrats

Rôle : backend · Rédaction : Product Owner · Ticket : #196 · Revue : Tech Lead · Prérequis : B0 fusionnée (#27, décisions 0010 et 0011) ; F1, F5 et F6 fusionnées (composants à adapter livrés) ; décision 0029 (la mention « après G0 » ne bloque plus) ; Q42 tranchée ici (B2-PO-1) ; **le code de B2 démarre seulement après (1) les réponses du Tech Lead aux propositions B2-TL-1 à B2-TL-5 (section « Propositions au Tech Lead »), consignées dans `docs/decisions/`, et (2) la fusion de F10a (#186), ordre fixé par le CEO** ; aucun compte externe, aucune clé · Parallèle : B1 (#188), sur des fichiers distincts (roadmap, ligne 13) · Suite : B5 (moteur) attend B2 · Référence : `docs/handovers/backend.md` (§ 4 « Contrats à créer » et « Évolutions de contrats », § 5, § 10, § 12 « Adresses issues du web », « Partie Q5 », ligne B2 du « Backlog »), `specs/B0-handover-backend.md` (critère § 5, PO-2, PO-5, PO-6), décisions 0010, 0011 (point 5), 0015, 0016 (§ 4 et § 11), 0017 (`requestId`), 0029, `specs/B1-socle-base-de-donnees.md` (B1-PO-5), `docs/design-system/redaction.md`

## Objectif
Mettre `src/contracts` dans la forme que le back-end va stocker et servir, sans rien écrire en base :
- retirer des contrats les textes d'interface et les champs calculés que le handover § 5 ne veut pas stocker (`weekday`, `title`, `context`, `meta`, `when` en texte libre) et les remplacer par des données structurées ;
- créer les contrats communs du back-end : `TripPatch`, `PatchResult`, `TripSnapshot`, `ProposalRecord`, `ChecklistMoment`, `StopFacts`, `ProposalNeighbours`, `PreviewSlot` ;
- appliquer les évolutions E1 à E7, E9 et E10 du handover, le raffinement `https:` des adresses issues du web, et adapter les données simulées, l'adaptateur `mock` et les composants dans **une seule PR** (handover § 4).

Après B2, l'interface affiche le même programme qu'avant, mais elle compose elle-même jours de la semaine, titres, faits d'une étape, contexte d'une proposition et moment d'une réservation. B5 (moteur), B6 (lecture) et B1 (clés des JSONB) s'appuient sur ces formes.

## Ce que B2 ne fait pas
- Aucune base, aucune migration, aucune action serveur, aucun module d'écriture : B1, B5, B6. B2 fournit les schémas stricts que ces tâches appliqueront « avant toute écriture » (handover § 6).
- Aucun appel à Google ni à un fournisseur de modèles. Aucune donnée Google dans les contrats, les données simulées ou les tests, hormis l'identifiant de lieu (`placeId`) : `CLAUDE.md`, décisions 0010 et 0011.
- Aucun calcul du moteur (voisins réels, coûts, budget, application d'un patch) : B5. Les données simulées portent des valeurs fixes.
- Aucune modification d'un fichier de B1 (liste ci-dessous, « Fichiers touchés »).

## À livrer

### 1. Contrats nouveaux ou modifiés (`src/contracts`)
Tous les objets restent stricts (`z.strictObject`) : une clé inconnue est refusée, à tous les niveaux. Chaque nouveau contrat est exporté par `src/contracts/index.ts` (schéma et type).

**E1 — Dates calculées par l'interface.** `Day.weekday`, `Day.title` et `Proposal.weekday` sont retirés de `DaySchema` et `ProposalSchema`. L'interface les calcule depuis `Day.date` (jour de la proposition : `trip.days[proposal.day − 1].date`), avec les fonctions de `src/lib/dates.ts`, qui existent déjà pour « sam. 29.08 » et qu'on complète pour le titre de la Journée (« Samedi 29 août »). Les noms de jours et de mois de `fr.json` servent.
- **Premier du mois** : le titre écrit « 1er » pour le jour 1 (« Mardi 1er septembre », comme le jeu simulé actuel), et le nombre seul pour les autres jours. Le suffixe « er » est le seul texte ajouté à `fr.json` (clé de `ligne.dates`, par exemple `premier`) ; la nouvelle fonction de titre l'applique. `formatDateLongue` (« 15 août 2026 ») suit la même règle (« 1er septembre 2026 »), usage typographique français que `redaction.md` ne contredit pas (B2-PO-12).
- **`WeekdaySchema` et `Weekday`** : ils restent exportés par `src/contracts`, sans être un champ de `Day` ni de `Proposal`. Ils typent le jour abrégé que l'interface calcule (`DayBadge`, `DayTabs`) et la forme réduite du prototype (`src/prototype/programme-reduit.ts`, P0a1), qui garde son propre champ `weekday`. Ils sortent donc du tableau du § 5 avec les champs retirés, mais pas du code.

**E3 — `StopFacts` remplace `Stop.meta` et `SurpriseIdea.meta`.** Nouveau schéma, champ `facts` obligatoire sur `StopSchema` et `SurpriseIdeaSchema` :
| Clé | Type | Sens |
|---|---|---|
| `durationMinutes` | entier > 0, facultatif | Durée prévue de la visite ou du repas |
| `costPerPerson` | nombre ≥ 0, facultatif | Coût estimé par personne, en CHF (unité de `Day.budgetPerPerson`) ; 0 = gratuit |
| `area` | texte de 1 à 60 caractères, facultatif | Secteur (« Old Town »), **contenu maison** issu de notre recherche web ; jamais le secteur d'un résultat Google (`PlaceSearchResult.area`, décision 0016 § 4.3) |

Un objet vide (`{}`) est valide : la ligne de faits n'est alors pas affichée. Noms de clés identiques à `STOP_FACTS_KEYS` de B1 (`db/jsonb-keys.ts`, #188) : B2-PO-2.

**E2 — `ProposalNeighbours` remplace `Proposal.context`.** `Proposal.neighbours` (obligatoire) : `{ before?: ProposalNeighbour, after?: ProposalNeighbour }`, où `ProposalNeighbour` est une union discriminée par `type` :
- `{ type: "stop", stopId }` : étape (activité ou événement) du même jour, désignée par son identifiant ; l'interface lit son nom dans le voyage ;
- `{ type: "meal", meal }` (`lunch` ou `dinner`, `MealSchema`) : repas, choisi ou laissé vide ;
- `{ type: "free" }` : temps libre ;
- `{ type: "terminus", role }` (`start` ou `end`) : départ du logement ou retour au logement.

Aucun nom ni texte dans ces objets. Catégorie proposée : calculé (B2-TL-1). `neighbours: {}` est valide et attendu quand le jour de la proposition est encore en préparation (`generating`) : ses étapes ne sont pas connues, et l'interface n'affiche alors aucune ligne de contexte.

**E4 — `ChecklistMoment` remplace le texte de `ChecklistItem.when`.** Forme fixée par la décision 0010 (PO-2), union discriminée par `type` :
- `{ type: "deadline", date }` (date ISO) ;
- `{ type: "beforeDeparture" }` ;
- `{ type: "tripDay", day }` (entier ≥ 1 ; 1 = J1).

Raffinement de `TripSchema` : un `tripDay.day` ne dépasse pas `days.length`, seule source retenue pour le nombre de jours (c'est déjà celle de `TripSummary.dayCount`). Le champ garde son nom `when`.

**`TripBaseSchema` et `TripSchema`.** Les raffinements E4 et E9 portent sur le voyage entier. Zod 4 refuse `.pick()` et `.omit()` sur un objet raffiné, et `TripSummarySchema` est défini par `TripSchema.pick(…)` (décision 0021 § 1.2). B2 crée donc (demande de la revue du Tech Lead du 2026-10-12) :
- `TripBaseSchema` : l'objet strict non raffiné, exporté ;
- `TripSchema` : `TripBaseSchema` auquel on applique les raffinements, écrits une fois en fonctions nommées (par exemple `refineChecklistDays`, `refineChecklistStops`) ;
- `TripSummarySchema` : dérivé de `TripBaseSchema.pick(…)`, mêmes clés qu'avant. `src/contracts/trip-summary.ts` et son test sont modifiés en conséquence (« Fichiers touchés »).

**E9 — `ChecklistItem.stopId`.** Champ facultatif (décision 0016 § 11) : identifiant interne de l'étape concernée, jamais un `placeId`. Raffinement de `TripSchema` : un `stopId` désigne un élément `stop` (ou un événement de `Day.events`) d'un jour du voyage. B2 crée le champ, le raffinement et les liens du jeu simulé ; la variante `checklist` de `Change` et le comportement de F7-PO-19 restent à F7d (B2-PO-7).

**Raffinement `https:`.** `SourceSchema.url` et `ChecklistItemSchema.bookingUrl` n'acceptent qu'une adresse dont le protocole est `https:` (handover § 12). `http:`, `javascript:`, `data:` et toute autre forme sont refusées.

**E5 — `PreviewSlot`.** Forme fixée par la décision 0010 (PO-6), union discriminée par `type` :
- `{ type: "proposal", proposal }` (une `Proposal` complète) ;
- `{ type: "noOption", day, time, kind }` (`kind` : `activity` ou `meal`), sans lieu ni texte.

`PreviewSlotsSchema` : tableau ordonné de 8 cases au plus. Raffinement léger : deux cases n'ont pas le même couple (jour, heure) ; pour une case `proposal`, ce couple est `(proposal.day, proposal.time)`.

**E10 — `ApiError.currentVersion`.** Ajout du code `version_conflict` à `API_ERROR_CODES` (sans renommer les codes existants) et du champ facultatif `currentVersion` (entier ≥ 1) à `ApiErrorSchema`. Raffinements : `currentVersion` est présent si et seulement si `code` vaut `version_conflict` ; avec `version_conflict`, `retryable` vaut `true` (handover § 4, « Concurrence » : l'interface propose de rejouer le patch). B5 le remplit (handover § 4, « Concurrence ») ; B2 ne crée que le contrat (B2-PO-8).

**`TripPatch`** (stocké dans `trip_versions.patch`) : `{ requestId, baseVersion, operations }`. Forme **proposée au Tech Lead (B2-TL-3)** ; le code l'applique telle que le Tech Lead la tranche.
- `requestId` : UUID (forme de `TripRequest`, décision 0017) ;
- `baseVersion` : entier ≥ 1 (la version 1 n'a pas de patch) ;
- identifiants : `stopId` reprend le type de `Stop.id` (texte non vide) ; `candidateId` est un UUID (`candidates.id`, B1) ;
- `operations` : tableau non vide d'opérations, union discriminée par `op`, qui désignent les étapes **par identifiant** :
  | `op` | Champs | Sens |
  |---|---|---|
  | `replace` | `stopId`, `candidateId` | Remplacer l'étape par un candidat de la réserve |
  | `add` | `stopId`, `kind`, `day`, `time`, `name`, `placeId` facultatif | Ajouter une étape. `stopId` est attribué **par le serveur avant l'écriture du patch**, jamais par le client : le patch stocké est rejouable tel quel (R10). `kind` reprend `STOP_KINDS`, comme `StopSchema`, sans valeur par défaut. `name` est **le nom saisi par la personne** (1 à 80 caractères, espaces retirés aux extrémités), jamais un nom Google. `placeId` est présent quand le lieu en a un |
  | `move` | `stopId`, `day`, `time` | Déplacer l'étape vers ce jour et cette heure |
  | `lock`, `unlock` | `stopId` | Verrouiller ou déverrouiller |
  | `revert` | `toVersion` | Annuler (PO-5) : crée une version identique à `toVersion` ; aucune version n'est supprimée |
- Raffinements : une opération `revert` est seule dans `operations` ; `toVersion` est un entier ≥ 1 et `toVersion < baseVersion` ; `day` ≥ 1 ; `time` au format `TimeSchema`.
- Aucun champ pour un nom Google, une adresse, une coordonnée, un horaire, une note ou une durée : le schéma strict les refuse.

**`PatchResult`** (réponse, jamais stockée) : `{ version, touchedDays, changes }` : nouvelle version (entier ≥ 2), indices des jours touchés (entiers ≥ 1, distincts), liste de `Change`. Les `Change[segment]` y sont calculés à la réponse (décision 0011 point 5). Forme proposée au Tech Lead (B2-TL-4).

**Schémas de stockage dérivés** (décision 0010, principes 6 et 7 ; « Partie Q5 », « Comportement définitif de B2 »). Leur liste et leur contenu (`TripSnapshot` réduit à `days`, `neighbours` hors de `ProposalRecord`) sont **proposés au Tech Lead** (B2-TL-1, B2-TL-2). La méthode de dérivation ci-dessous est celle que la revue du Tech Lead du 2026-10-12 a demandé d'écrire dans la spécification.

*Méthode* :
- **Schémas de base non raffinés.** Chaque schéma source qui porte un raffinement, ou qui doit être dérivé, a une base exportée, objet strict sans raffinement : `StopBaseSchema`, `ProposalBaseSchema`, `TripBaseSchema` (ci-dessus). Le schéma public reste le nom actuel (`StopSchema`, `ProposalSchema`, `TripSchema`) et vaut « base + raffinements ».
- **Dérivation depuis les bases seulement**, par `.omit()` et `.pick()`. Le seul `.extend()` admis remplace un champ de **type objet ou tableau** par sa version de stockage, elle-même dérivée (par exemple `items: z.array(DayLineItemSnapshotSchema)`). Un champ scalaire n'est jamais redéclaré.
- **Raffinements écrits une fois**, en fonctions nommées exportées par `src/contracts/refinements.ts` (ou en tête de `trip.ts`), et réappliqués au schéma complet et à son dérivé :
  - `refineEventKind` : `kind === "event"` (événements de `Day.events`) ;
  - `refineNoCommitment` : `stop.commitment` absent (une proposition n'est jamais un engagement, décision 0015 § 9) ;
  - `refineDetour` : `detour` obligatoire au-delà de `DETOUR_THRESHOLD_MINUTES` (schéma public) ;
  - `refineChecklistDays` et `refineChecklistStops` (E4, E9) ;
  - `refineSnapshotExceptions` : `exceptions` sans `toConfirm`.

*Schémas* :
- `SegmentSnapshotSchema` : `SegmentSchema.omit({ minutes })`.
- `StopSnapshotSchema` : `StopBaseSchema.omit({ verifiedAt })` puis `refineSnapshotExceptions`. `exceptions` garde son type (au plus 2) ; le refus de `toConfirm` vient du raffinement, sans redéclarer le champ. `commitment` reste admis : une étape du programme peut être un engagement.
- `EventSnapshotSchema` : `StopSnapshotSchema` puis `refineEventKind`, comme `EventStopSchema` aujourd'hui.
- `SurpriseIdeaSnapshotSchema` : `SurpriseIdeaSchema.omit({ verifiedAt })`.
- `DayLineItemSnapshotSchema` : union discriminée par `type`, mêmes variantes que `DayLineItemSchema`. Les variantes `terminus`, `free` et `openMeal` sont reprises par référence aux objets de variante exportés depuis `trip.ts` (aucune copie). La variante `stop` porte `StopSnapshotSchema`, la variante `segment` porte `SegmentSnapshotSchema`. Un `terminus` garde son `label` (stocké ; la vue partagée le retire, Q50).
- `DaySnapshotSchema` : `DaySchema.omit({ budgetPerPerson, generating, travelMinutes })`, dont `items`, `events` et `surprise` sont remplacés par `DayLineItemSnapshotSchema`, `EventSnapshotSchema` et `SurpriseIdeaSnapshotSchema`.
- `TripSnapshotSchema` : `{ days: DaySnapshot[] }`, seul contenu de `trip_versions.snapshot` (B2-TL-2).
- `ProposalRecordSchema` : `ProposalBaseSchema.omit({ neighbours, option, photoUrl })`, dont `stop` devient `StopSnapshotSchema` et `travelFromPrevious` devient `SegmentSnapshotSchema`, `detour` étant **rendu obligatoire** (`.required({ detour: true })`, « Partie Q5 ») ; puis `refineNoCommitment`. Pour être sans ambiguïté : dans un `ProposalRecord`, `stop.commitment` est **refusé** (c'est une proposition) ; dans un `DaySnapshot`, `stop.commitment` est **admis** (c'est le programme). Clés de premier niveau égales à `PROPOSAL_RECORD_KEYS` de B1.

Le test `contrats: les schémas de stockage sont dérivés sans copie` vérifie ces dérivations (critères).

### 2. Adaptateurs (`src/adapters`)
- **E6** : `AdapterContext` gagne `userId` (texte) et `role` (`owner` ou `member`). `MOCK_REQUEST_CONTEXT` vaut `role: "owner"` avec un `userId` simulé ; `getRequestContext()` le renvoie (B3 le remplira depuis la session).
- **E7** : `TripAdapter.listPreviewSlots(ctx, tripId): Promise<PreviewSlot[]>`, implémentée par l'adaptateur `mock` : sortie validée par `PreviewSlotsSchema` ; voyage inconnu ou d'une autre organisation : liste vide, comme `listProposals`. `getSharedTrip` reste à B12 : la ligne E7 du handover est donc marquée « partiel (B2 : `listPreviewSlots` ; `getSharedTrip` : B12) », pas « fait ».
- Chaque sortie de l'adaptateur `mock` reste validée par son contrat (`TripSchema`, `ProposalSchema`, `PreviewSlotsSchema`).

### 3. Données simulées (`src/mocks`)
- `edimbourg.ts`, `autres-voyages.ts` : champs retirés supprimés ; `meta` converti en `facts` (« [Old Town, 2 h, billet] » → `{ area: "[Old Town]", durationMinutes: 120 }` ; « gratuit » → `costPerPerson: 0`). Seul `area`, texte, garde les crochets ; `durationMinutes` et `costPerPerson` sont des nombres et n'en portent pas. La ligne affichée passe donc de « [Old Town, 2 h, billet] » à « [Old Town], 2 h » : la capture change, et la PR de code le dit ; ce qui n'entre pas dans `StopFacts` (genre de cuisine, « billet ») n'est pas recopié : le badge `toReserve` et `reason` le portent déjà ; `context` converti en `neighbours` (voisins réels de la ligne du jour simulée) ; `when` converti selon E4 :
  | Texte actuel | `ChecklistMoment` |
  |---|---|
  | « [Déjà réservé] » | `beforeDeparture`, avec `done: true` (déjà le cas) |
  | « [Une semaine avant] » | `deadline` à la date du début du voyage moins 7 jours |
  | « [Avant le départ] » | `beforeDeparture` |
  | « [Au plus tôt] » | `beforeDeparture` (Q42, B2-PO-1) |
- Liens `stopId` (E9) : chaque ligne de réservation qui concerne une étape du jeu simulé (billets du Tattoo, excursion, château, distillerie) la désigne ; l'assurance n'en a pas.
- Aperçu Édimbourg (E5) : 8 cases, dont **au moins une `noOption`** et les autres `proposal`. La PR dit quelle case et pourquoi. `listProposals` garde ses propositions (suite du tri du voyage débloqué).
- Les valeurs **textuelles** restent entre crochets quand ce sont des contenus non vérifiés (handover front, règle 2) ; une valeur numérique (durée, coût, heure, version) n'en porte jamais.

### 4. Composants et écrans
Textes dans `src/i18n/fr.json`, vocabulaire et formats de `redaction.md`. Les libellés ci-dessous sont **provisoires** : UX/UI peut les reprendre sans changer les contrats (B2-PO-10).
- **Faits d'une étape** (ligne du jour `DayLine`, Fiche `StopSheet`, événements `EventLines`, idée `SurpriseBlock`, `DeckCard`, feuille de détail de la présentation) : une seule fonction pure compose « {secteur}, {durée}, {coût} » dans cet ordre, sans la partie absente. Durée avec `formatDuree`. Coût 0 : « gratuit ». Coût > 0 : « ≈ {n} CHF » (montant estimé, `redaction.md`).
- **Jour de la semaine et titre** (`DayBadge`, `DayTabs`, en-tête de la Journée, Séjour, Fiche, `TripShell`, feuille de détail) : calculés depuis la date (E1).
- **Contexte d'une proposition** (`DeckCard`) : une fonction pure de `src/features/presentation` compose le texte depuis `neighbours` et le jour du voyage. Les formes sont « Entre {a} et {b} », « Après {a} » et « Avant {b} », sans ligne si aucun voisin. {a} et {b} valent :
  - pour une étape, son nom ;
  - pour un repas, « ton déjeuner » ou « ton dîner » ;
  - pour le temps libre, « ton temps libre » ;
  - pour un terminus, « le départ du logement » ou « le retour au logement ».

  Un `stopId` introuvable dans le jour est traité comme un voisin absent : rien n'est inventé.
- **Données de la présentation** : `PresentationData` gagne, à côté de `proposals`, ce dont l'écran a besoin pour composer dates et contextes, et rien de plus :
  - `days` : pour chaque jour, `{ index, date, stops }`, où `stops` est la liste `{ id, name }` des étapes et événements du jour ;
  - aucun `placeId`, aucun `Trip` complet, aucune autre clé d'étape n'est transmis au composant client.
  `loadPresentation` construit cette projection côté serveur depuis `getTrip` ; un test vérifie que ses clés sont exactement celles-ci.
- **Moment d'une réservation** (`ChecklistRow`, Séjour, et rappels de l'écran 15 s'ils existent à la fusion) : `ChecklistRow` reçoit le `ChecklistMoment` et produit le libellé :
  - « Avant le {date courte} » pour une date limite ;
  - « Avant le départ » ;
  - « À l'arrivée » pour le J1 ;
  - « J{n} » pour un autre jour.
- **Aperçu incomplet** (écran 6, B2-PO-9) : pour un voyage non débloqué, `loadPresentation` lit `listPreviewSlots`. Les cases `proposal` deviennent les cartes, dans l'ordre des cases, et la progression compte ces seules cartes. Les cases `noOption` ne sont pas des cartes : l'écran affiche un `StatusBanner` `noOption` qui nomme les créneaux concernés (« J{n} {heure}, {activité|repas} »). Le voyage débloqué (6b) garde `listProposals`.
- `/dev/composants` et `/dev/etats` montrent les nouvelles formes (étape sans faits, proposition sans voisin, chaque moment, aperçu avec une case `noOption`).

### 5. Tableau des champs et test permanent
- **Handover § 5** : B2 retire les lignes des clés supprimées (`Day.weekday`, `Day.title`, `Proposal.weekday`, `Proposal.context`, `Stop.meta`, `SurpriseIdea.meta`). Il ajoute une ligne, avec une seule catégorie, pour chaque clé nouvelle :
  - `Stop.facts`, `SurpriseIdea.facts`, `StopFacts.*` ;
  - `Proposal.neighbours`, `ProposalNeighbours.*`, `ProposalNeighbour[*].*` ;
  - `ChecklistItem.stopId`, `ChecklistMoment[*].*` ;
  - `PreviewSlot[*].*`, `TripPatch.*`, `TripPatchOperation[*].*`, `PatchResult.*` ;
  - `ApiError.currentVersion` ;
  - `Trip.timeZone`, « clé à venir » du handover.

  Le paragraphe « Où vit l'aperçu » et les lignes des évolutions du § 4 sont marqués « fait (B2) », sauf E7, « partiel » (§ 2).
- **Test `contrats: chaque champ a une seule catégorie`** (`tests/unit/contracts/categories.test.ts`), qui rend permanent le script du critère § 5 de B0. Son principe (test permanent, liste d'exclusion) est **proposé au Tech Lead** (B2-TL-5) ; sa définition exécutable est la suivante.
  - **Côté code (ensemble A)** : il parcourt les formes Zod des schémas objet et union discriminée exportés par `src/contracts/index.ts` et produit une clé par champ, dans la notation de B0 : `Contrat.champ` pour un champ d'objet (`Trip.start`), `Contrat.champ.sous` pour un objet imbriqué (`Trip.travellers.adults`), `Contrat[*].champ` pour les éléments d'un tableau ou les variantes d'une union discriminée (`DayLineItem[*].type`), le nom du contrat étant celui du type exporté sans `Schema`.
  - **Côté document (ensemble B)** : il lit `docs/handovers/backend.md`, de la ligne `## § 5.` à la section `## ` suivante, seulement les lignes de tableau dont la première cellule commence par une clé entre accents graves ; la clé est le texte entre les premiers accents graves de cette cellule, la catégorie est la deuxième cellule, qui doit commencer par exactement une des trois catégories du § 5 (« stocké », « chargé à la demande », « calculé » ; une précision qui suit, comme « stocké, sans `toConfirm` », est admise). Il y ajoute les 7 clés du tableau du point 5 de la décision 0011 (« Partie Q5 »), lues de la même façon dans `docs/decisions/0011-*.md`. Une cellule ne porte qu'une clé (c'est le cas des 137 lignes actuelles, qui avec les 7 clés de 0011 donnent les 144 annoncées).
  - **Exclusions** : une liste `EXCLUDED_CONTRACTS` écrite dans le test, chaque entrée `{ contract, task, reason }` : `task` nomme la tâche de la ligne « Contrats à créer » du handover qui complète le contrat (par exemple `TripSummary` : B6 ; contrats de F8a : B3 ou B9) ; une entrée sans tâche fait échouer le test. Les schémas de stockage dérivés (§ 1) sont exclus de la même façon, avec `task: "B2"` et `reason` renvoyant au test `contrats: les schémas de stockage sont dérivés sans copie`. Toute clé dont le préfixe est un contrat exclu est retirée **des deux ensembles A et B** avant la comparaison : une ligne déjà présente dans le tableau pour un contrat exclu n'apparaît donc pas « en trop ».
  - **Comparaison** : A et B (après exclusions) sont égaux ; aucune clé n'apparaît deux fois dans B ; chaque clé de B a une seule catégorie parmi celles du § 5. En cas d'échec, le message liste séparément les clés manquantes dans le tableau (dans A, pas dans B), les clés en trop (dans B, pas dans A), les doublons et les clés à plusieurs catégories.

  La tâche qui complète un contrat exclu ajoute ses lignes au tableau et retire l'exclusion. La PR de code donne le nombre de clés comparées (le handover annonce 144 avant les ajouts de B2).
- Les mentions « après G0 » du handover (l. 10, l. 692, lignes B1 à B12 du « Backlog ») sont alignées sur la décision 0029, si aucune PR antérieure ne l'a fait (0029, « Précédence »).

## Critères d'acceptation
Chaque test nommé est un test Vitest de `pnpm test`, au nom exact ci-dessous, vert en CI.

**Tests nommés du handover (ligne B2, § 10, § 12) et de la décision 0010**
- [ ] `contrats: chaque champ a une seule catégorie` (§ 5 ci-dessus ; les 7 clés de la « Partie Q5 » comptées).
- [ ] `versions: l'instantané ne contient ni durée de trajet ni date de contrôle` : `TripSnapshotSchema` refuse un instantané qui contient `minutes` dans un trajet, `verifiedAt` dans une étape, un événement ou l'idée, `travelMinutes` dans un jour, ou `toConfirm` dans `exceptions`. Il accepte le même instantané sans ces clés. Même contrôle sur `ProposalRecordSchema` (`travelFromPrevious.minutes`, `stop.verifiedAt`, `stop.exceptions` avec `toConfirm`).
- [ ] `versions: une écriture d'instantané passe par le schéma strict` : un instantané dont une étape contient une clé imbriquée `displayName` est refusé par `TripSnapshotSchema`. Même refus pour `formattedAddress`, `location`, `rating` et `regularOpeningHours`.
- [ ] `contrats: aucune adresse autre que https` : `Source.url` et `ChecklistItem.bookingUrl` refusent `http:`, `javascript:`, `data:` et `ftp:`, et acceptent `https:`. Le test parcourt aussi les données simulées.
- [ ] `contrats: ChecklistMoment et PreviewSlot sans texte d'interface` :
  - `ChecklistItemSchema` refuse un texte libre dans `when` et accepte les trois formes de `ChecklistMoment` ;
  - une case `noOption` refuse toute clé `name`, `label`, `text`, `placeId` ou `message` ;
  - `ProposalNeighbour` refuse un champ `name` ou `label`.
- [ ] `aperçu: les créneaux sans proposition ancrée sont des cases noOption` : l'aperçu simulé d'Édimbourg compte 8 cases, au moins une `noOption`, et aucune case `noOption` n'a de lieu. `PreviewSlotsSchema` refuse 9 cases, et deux cases au même couple (jour, heure).
- [ ] `données simulées: aucun texte d'interface` : aucun objet des données simulées n'a de clé `weekday`, `title`, `context` ou `meta`, ni de `when` en texte.
- [ ] `schéma: les clés JSONB suivent les contrats`, **si B1 (#188) est fusionnée avant B2** (sinon B1 l'ajoute, B1-PO-5). Les listes de `db/jsonb-keys.ts` sont égales aux clés des schémas Zod :
  - `STOP_FACTS_KEYS` à celles de `StopFactsSchema` ;
  - `CHECKLIST_MOMENT_VARIANTS` aux variantes de `ChecklistMomentSchema` ;
  - `PROPOSAL_RECORD_KEYS` au premier niveau de `ProposalRecordSchema` ;
  - `SHARED_SNAPSHOT_KEYS` à un sous-ensemble des schémas d'instantané.

  Le fichier `db/jsonb-keys.ts` est lu, jamais modifié.

**Tests propres à cette spécification**
- [ ] `contrats: les schémas de stockage sont dérivés sans copie` : chaque clé de `TripSnapshotSchema`, `DaySnapshotSchema`, `DayLineItemSnapshotSchema` (par variante), `StopSnapshotSchema`, `EventSnapshotSchema`, `SegmentSnapshotSchema`, `SurpriseIdeaSnapshotSchema` et `ProposalRecordSchema` existe dans son schéma source. Les clés omises sont exactement celles du § 1. Un événement dont `kind` n'est pas `event` est refusé par `DaySnapshotSchema`, comme par `DaySchema`.
- [ ] `contrats: ProposalRecord exige detour et suit PROPOSAL_RECORD_KEYS` :
  - `ProposalRecordSchema` refuse un enregistrement sans `detour`, même avec un trajet court ;
  - il refuse `stop.commitment`, alors que `DaySnapshotSchema` accepte une étape avec `commitment` ;
  - ses clés de premier niveau sont exactement la liste écrite dans le test (et égales à `PROPOSAL_RECORD_KEYS` si B1 est fusionnée).
- [ ] `contrats: TripSummary reste dérivé du voyage` : `TripSummarySchema` est construit depuis `TripBaseSchema`, garde exactement ses clés actuelles et valide les résumés des données simulées ; les tests existants de `trip-summary.test.ts` restent verts.
- [ ] `contrats: TripPatch désigne les étapes par identifiant` :
  - chaque opération est acceptée sous sa forme ;
  - `add` sans `name` ou sans `kind` est refusé, comme `add` avec un `name` vide ou de plus de 80 caractères ;
  - un `candidateId` qui n'est pas un UUID est refusé ; `toVersion` 0 est refusé ;
  - une clé `displayName`, `formattedAddress` ou `location` est refusée dans une opération ;
  - `revert` accompagné d'une autre opération est refusé, comme `toVersion ≥ baseVersion` ;
  - un `requestId` qui n'est pas un UUID est refusé.
- [ ] `contrats: PatchResult` : forme acceptée ; refus d'une version < 2 et de jours touchés en double ou nuls.
- [ ] `contrats: StopFacts` : objet vide accepté ; refus d'une durée nulle ou non entière, d'un coût négatif et d'une clé inconnue (`rating`, `priceLevel`).
- [ ] `contrats: ChecklistItem.stopId désigne une étape du voyage` : `TripSchema` refuse un `stopId` absent du voyage. Il refuse aussi un `tripDay.day` qui dépasse la durée du voyage.
- [ ] `contrats: currentVersion seulement pour version_conflict` : `ApiErrorSchema` refuse `currentVersion` avec un autre code, `version_conflict` sans `currentVersion`, et `version_conflict` avec `retryable` absent ou `false`.
- [ ] `données simulées: voisins et liens cohérents` : chaque `neighbours.*.stopId` désigne une étape du jour de la proposition ; chaque `stopId` de la liste désigne une étape du voyage.
- [ ] `adaptateurs: listPreviewSlots` : l'adaptateur `mock` renvoie l'aperçu validé pour l'organisation simulée, et une liste vide pour une autre organisation ou un voyage inconnu.
- [ ] `adaptateurs: le contexte porte userId et role` : `getRequestContext()` renvoie `organizationId`, `userId` et `role: "owner"` avec l'adaptateur `mock`.
- [ ] Tests d'interface (Testing Library) :
  - `interface: faits d'une étape composés depuis StopFacts` (secteur, durée, gratuit, coût estimé, partie absente omise) ;
  - `interface: contexte d'une proposition composé depuis ses voisins` (quatre formes, `stopId` introuvable sans texte inventé) ;
  - `interface: moment d'une réservation composé depuis ChecklistMoment` (quatre libellés) ;
  - `interface: jour de la semaine et titre calculés depuis la date` (dont « Mardi 1er septembre » pour le 2026-09-01 et « Samedi 29 août ») ;
  - `presentation: les cases noOption ne sont pas des cartes` (bandeau `noOption`, progression sur les seules cartes) ;
  - `presentation: les données de l'écran ne transmettent ni placeId ni voyage complet` (clés exactes de `PresentationData` et de `days[*]`).

**Vérifications d'ensemble**
- [ ] `pnpm verify` vert. Si B1 est fusionnée, la PR dit si `pnpm verify` a été lancé avec ou sans base (`SKIP_DB_TESTS=1`, décision 0036, fusionnée depuis par #192 : à revérifier au démarrage du code) ; B2 ne touche pas `db/`.
- [ ] La revue de la PR de code inclut UX/UI (bandeau `noOption`, libellés provisoires B2-PO-10, rendu « 1er »).
- [ ] Captures visuelles mises à jour par le workflow `visual-update.yml` (libellé `update-snapshots`, décision 0004), jamais localement. La PR dit quelles captures changent et pourquoi (textes composés, aperçu avec une case `noOption`).
- [ ] axe sans violation sur les écrans touchés (`pnpm test:a11y`), en particulier le bandeau `noOption` de l'écran 6.
- [ ] Aucune nouvelle dépendance ; `package.json` et `pnpm-lock.yaml` inchangés.
- [ ] Aucun fichier de B1 modifié (liste ci-dessous) ; `git diff --name-only origin/main` le montre dans la PR.
- [ ] Aucune donnée Google dans le diff : aucun nom, adresse, note, horaire ni coordonnée de Google dans les contrats, les données simulées ou les tests, hormis des `placeId` simulés.

## Fichiers touchés
**Modifiés ou créés par B2** :
- `src/contracts/` : `trip.ts`, `trip-summary.ts`, `errors.ts`, `values.ts`, `index.ts`, `README.md`, et leurs tests (dont `trip-summary.test.ts`). Nouveaux fichiers : `patch.ts` (`TripPatch`, `PatchResult`), `preview.ts` (`PreviewSlot`), `snapshot.ts` (schémas de stockage dérivés), éventuellement `refinements.ts` (raffinements nommés), avec leurs tests.
- `src/adapters/` : `types.ts`, `context.ts`, `mock.ts`, `index.ts`, `README.md`, et leurs tests.
- `src/mocks/` : `edimbourg.ts`, `autres-voyages.ts`, `edimbourg-carte.ts` (seulement si les identifiants changent), `README.md`, et leurs tests.
- `src/lib/dates.ts`, et un module de formatage des faits (par exemple `src/lib/faits.ts`), avec leurs tests.
- `src/components/ligne/` : `DeckCard`, `DayLine`, `DayTabs`, `DayBadge`, `ChecklistRow`, `README.md`, et leurs tests.
- `src/features/presentation/` : `load.ts`, `PresentationScreen.tsx`, `ProposalDetailSheet.tsx`, la fonction de contexte, et leurs tests.
- `src/features/sejour/` : `JourneePanel`, `JourneeView`, `SejourPanel`, `StopSheet`, `EventLines`, `SurpriseBlock`, `fiche.ts`, `programme.ts`, `TripShell`, et leurs tests. Aussi les fichiers de F10a (#186), fusionnée avant le code de B2.
- `src/i18n/fr.json` ; `src/dev/ComposantsShowcase.tsx`, `src/dev/EtatsShowcase.tsx`.
- `tests/unit/contracts/` (nouveau dossier) : `categories.test.ts`, et `jsonb-keys.test.ts` selon l'ordre de fusion.
- Tests existants qui lisent un champ retiré, au moins : `src/adapters/list-trips.test.ts`, `src/lib/large-screen.test.tsx`, `src/mocks/edimbourg.test.ts`, `tests/unit/sejour-pages.test.tsx`, `tests/unit/etats.test.tsx`, `src/app/dev/carte/CarteDemo.tsx`, et dans `tests/e2e/` : `sejour.e2e.spec.ts` (l. 435 lit `day.title`), `budget.e2e.spec.ts`, `mes-voyages-helpers.ts`, `route-states.ts`.
- **Règle générale** : la liste ci-dessus n'est pas fermée. Tout fichier de `src/` ou `tests/` qui lit un champ retiré (`weekday`, `title`, `context`, `meta` de `Day`, `Proposal`, `Stop` ou `SurpriseIdea`, `when` en texte) est adapté dans la même PR, sauf les fichiers de B1 ci-dessous.
- **`src/prototype/programme-reduit.ts` et son test** (P0a1, rôle `ia`) : la forme réduite du prototype dérive des contrats (`StopSchema.omit`, `DaySchema.omit`, `TripSchema.omit`, `SurpriseIdeaSchema.omit`, et `WeekdaySchema`). B2 l'adapte au strict nécessaire : dérivation depuis `TripBaseSchema` et `StopBaseSchema` (sinon Zod 4 refuse `.omit()` sur le schéma raffiné), champs retirés et `facts` à la place de `meta`. La PR de code le signale au rôle `ia` ; tout autre changement de la forme réduite reste à P0. Contrôle : `pnpm typecheck` (qui couvre `tests/e2e/`) et `git grep -nE '\.(weekday|title|meta|context)\b' src tests` relu dans la PR, chaque occurrence restante justifiée.
- `tests/visual/__screenshots__/`, par le workflow seulement.
- `docs/handovers/backend.md` : § 4 (évolutions faites), § 5 (lignes), mentions « après G0 ».

**Jamais modifiés par B2** (fichiers de #188, liste relevée le 2026-10-12 par `gh api …/pulls/188/files`) :
- `.env.example`, `.github/workflows/ci.yml`, `docker-compose.yml`, `drizzle.config.ts` ;
- `db/**`, `docs/decisions/0006-stack-serveur.md` ;
- `eslint-rules/**`, `eslint.config.mjs` ;
- `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `vitest.config.mts`, `vitest.db.config.mts` ;
- `scripts/ci/db-setup.sh`, `scripts/test-db.mjs` ;
- `src/server/config/offer.ts`, `src/server/parse-input.ts` ;
- `tests/db/**`, `tests/stubs/server-only.ts`, `tests/unit/db/**`, `tests/unit/lint/server-only-lint.test.ts`.

Si B2 a besoin d'un changement dans l'un de ces fichiers, il le signale dans sa PR au lieu de le faire.

## Décisions (Product Owner, définitives sans veto de Samuel avant le 2026-10-15)
À lister dans la note de version suivante, rubrique « Décisions prises par le studio ». Seuls les détails fonctionnels sont tranchés ici (« Qui décide quoi »). Les formes de contrat, l'outillage de test et la méthode de dérivation relèvent du Tech Lead : elles sont dans la section suivante, comme propositions, **hors de ce compte à rebours**. Les anciens numéros B2-PO-3 à B2-PO-6 et B2-PO-11 de la première version sont devenus B2-TL-1 à B2-TL-5 ; les autres numéros ne changent pas.
- **B2-PO-1 — Q42 : « [Au plus tôt] » devient `beforeDeparture`.**
  - Raison : le jeu simulé n'a pas de date d'ouverture de billetterie, et en inventer une ferait une date limite fausse.
  - Une variante de plus (« dès que possible ») changerait la forme fixée par le Tech Lead dans la décision 0010 pour une nuance d'affichage.
  - Si la recherche réelle (B7) trouve une date d'ouverture, c'est une `deadline`.
- **B2-PO-2 — `StopFacts` aux noms de B1.**
  - Les clés sont `durationMinutes`, `costPerPerson` et `area`, toutes facultatives. Le coût est en CHF, unité de `Day.budgetPerPerson`.
  - Raison : B1 les a proposées (`db/jsonb-keys.ts`) ; reprendre ses noms évite une migration.
  - Le genre de cuisine et les mentions comme « billet » ne sont pas repris. Ce sont des textes libres : `reason`, `category` et les badges les portent déjà, et un champ texte libre de plus pourrait recevoir un contenu Google.
  - Seul `area` garde les crochets d'un contenu non vérifié ; les nombres n'en portent pas (« [Old Town], 2 h »).
- **B2-PO-7 — `ChecklistItem.stopId` entre avec B2.**
  - La décision 0016 § 11 le prévoit quand le schéma de base vient avant F7d, ce qui est le cas : `checklist_items.stop_id` est créé par B1.
  - F7d garde la variante `checklist` de `Change` et le comportement de F7-PO-19.
- **B2-PO-8 — E10 dans B2.**
  - Le « Backlog » attribue E10 à B2, le tableau des évolutions à B5. B2 crée le code `version_conflict`, `currentVersion` et la règle `retryable = true` ; B5 les remplit.
  - Raison : B5 dépend de B2, et le contrat doit exister avant le moteur.
- **B2-PO-9 — Cases `noOption` dans la présentation.**
  - Elles ne sont jamais des cartes : on ne peut pas aimer ou refuser un créneau vide, et on ne le remplit jamais par un lieu non ancré (R1).
  - Un bandeau `noOption` nomme les créneaux concernés. La progression ne compte que les cartes.
  - Deux cases de l'aperçu n'occupent pas le même créneau (jour, heure).
  - Le voyage débloqué garde la lecture `listProposals`.
  - Le rendu visuel du bandeau relève d'UX/UI.
- **B2-PO-10 — Libellés provisoires.** Les textes de la section « Composants et écrans » suivent `redaction.md`. Ils sont provisoires : UX/UI peut les remplacer dans `fr.json` sans toucher aux contrats.
- **B2-PO-12 — « 1er » pour le premier du mois.** Titre de la Journée et date en toutes lettres écrivent « 1er » (« Mardi 1er septembre »), comme le jeu simulé actuel, pour que l'interface affiche le même programme qu'avant. Le suffixe est un texte de `fr.json`.
- **B2-PO-13 — Voisins vides pendant la préparation.** `neighbours: {}` est la valeur attendue quand le jour de la proposition est encore « generating » : aucune ligne de contexte n'est affichée, rien n'est inventé.
- **B2-PO-14 — Données de la présentation.** L'écran reçoit, en plus des propositions, la date et les noms des étapes de chaque jour, sans `placeId` ni voyage complet : c'est le minimum pour composer dates et contextes.

## Propositions au Tech Lead (B2-TL-1 à B2-TL-5)
Ces points relèvent de l'architecture des contrats et des tests (« Qui décide quoi » : Tech Lead). Ils ne sont **pas** des décisions du Product Owner et ne courent pas sous le délai de veto de Samuel. Le Tech Lead les tranche et les consigne dans `docs/decisions/`, avec l'amendement de la décision 0010 (principe 6) si B2-TL-2 est retenu. **Le code de B2 attend ces réponses** ; il attend aussi la fusion de F10a (#186), selon l'ordre fixé par le CEO. La spécification décrit l'option recommandée ; si le Tech Lead en retient une autre, le code suit sa décision et la spécification est corrigée dans la même PR.

- **B2-TL-1 — Où vit `Proposal.neighbours` ?**
  - Option A (recommandée) : calculé à la lecture par le serveur depuis la version courante (éléments du jour qui encadrent la proposition), absent de `ProposalRecord` ; catégorie « calculé » au § 5.
  - Option B : stocké dans `ProposalRecord` à la génération de l'aperçu.
  - Raison de la recommandation : un voisin stocké est faux dès la première révision du jour ; `PROPOSAL_RECORD_KEYS` de B1 ne le contient déjà pas. Le calcul réel revient à B5 ou B6 ; les données simulées portent des voisins fixes, vérifiés par un test.
- **B2-TL-2 — Contenu de `TripSnapshot` et amendement de 0010 § 6.**
  - Option A (recommandée) : `{ days: DaySnapshot[] }` seulement. Les autres champs stockés de `Trip` vivent dans `trips` et `checklist_items`. Amendement de 0010 principe 6 : « dérivé des **jours** de `TripSchema` par omission des champs calculés ».
  - Option B : lettre de 0010, `TripSchema` entier moins les champs calculés et chargés à la demande ; les champs de `trips` et `checklist_items` seraient alors en double dans chaque version.
  - Raison : une version ne porte que ce qu'une révision change ; c'est la forme que lit `shared_snapshot` de B1 (#188).
- **B2-TL-3 — Forme de `TripPatch`.**
  - Option A (recommandée) : opérations désignant les étapes par `stopId` (tableau du § 1) ; `add` porte `kind`, le nom saisi et un `placeId` facultatif ; `stopId` d'un ajout attribué par le serveur avant l'écriture du patch ; `candidateId` UUID ; `move` porte un jour et une heure ; `revert` seule dans son patch.
  - Option B : `move` désigne un point d'insertion opaque (décision 0016 § 4.1), comme l'interface de révision. Rejet proposé : un patch stocké doit pouvoir être rejoué sur une autre version (R10), ce qu'un point d'insertion lié à une version ne permet pas.
  - Option C : patch par instantané complet du jour modifié. Rejet proposé : plus lourd et sans trace de l'intention.
- **B2-TL-4 — Forme de `PatchResult`.**
  - Option A (recommandée) : `{ version, touchedDays, changes }`, noms du handover ; `Change` tel qu'il est dans `main` à la fusion, sans anticiper les formes de F7a (décision 0016 § 4.5).
  - Option B : renvoyer aussi le `Trip` recomposé. Rejet proposé : la lecture (B6) le sert déjà, et la réponse grossirait à chaque révision.
- **B2-TL-5 — Test permanent de catégories.**
  - Option A (recommandée) : test Vitest permanent `contrats: chaque champ a une seule catégorie`, défini au § 5 (ensembles comparés, lecture du markdown, liste `EXCLUDED_CONTRACTS` dont chaque entrée nomme une tâche, exclusion des deux côtés, message d'échec détaillé).
  - Option B : script ponctuel, relancé à la main par chaque PR qui touche `src/contracts`. Rejet proposé : un tableau vérifié une seule fois dérive dès la PR suivante.
  - Option C : générer le tableau depuis les schémas (catégorie en métadonnée Zod). Plus robuste à terme, mais change la source de vérité du handover ; à considérer plus tard.

La méthode de dérivation des schémas de stockage (bases non raffinées, `.omit()`/`.pick()`, raffinements nommés, § 1) et `TripBaseSchema` pour `TripSummary` ne sont pas des propositions : ils reprennent la demande écrite de la revue du Tech Lead du 2026-10-12.

## Hors périmètre
- `getSharedTrip` et `SharedTrip` (B12) ; `GenerationStatus` et ses compteurs `expected` et `ready` (F8c, complété par B9) ; contrats de la révision `ReplacementRequest`, `RevisionPreview`, `MoveRequest`, `MoveOptions`, `AddRequest`, `AddMoment`, `PlaceSearchResult` et formes de `Change` de la décision 0016 § 4.5 (F7a à F7c) ; variante `checklist` de `Change` et comportement de F7-PO-19 (F7d).
- Les 7 clés de la « Partie Q5 » restent dans `TripSchema` sous leur forme actuelle (`Segment.minutes`, `Day.travelMinutes`, `Change[segment]`, `verifiedAt`, `exceptions`). B2 ne les omet que dans les schémas de stockage. Leur recomposition revient à B6 et B8 ; `verifiedAt` attend S5 (Samuel).
- Application d'un patch, calcul des voisins, des coûts et du budget, détection de conflit (B5) ; module d'écriture et lecture `api` (B6) ; clés des `CHECK` en base et migrations (B1, rôle `data`).
- Conversion de devise des coûts trouvés sur le web (B7 ou B9).
- Toute action dans les consoles Google, Neon, Vercel ou GitHub ; toute mise en production.

## Questions ouvertes
Listées dans la description de la PR de cette spécification ; le CEO les reporte et les numérote dans `QUESTIONS.md`.
1. **Tech Lead** : trancher B2-TL-1 à B2-TL-5 (section « Propositions au Tech Lead ») et les consigner dans `docs/decisions/`, avec l'amendement de 0010 § 6 si B2-TL-2 option A est retenue. Bloque le début du code de B2, donc B5.
2. **UX/UI** : libellés provisoires (B2-PO-10), rendu « 1er » (B2-PO-12) et rendu du bandeau des cases `noOption` dans la présentation (B2-PO-9), écran non maquetté. Bloque la validation visuelle, pas le code. La revue de la PR de code inclut UX/UI.
3. **Rôle `ia`** (information, pas de blocage) : B2 adaptera `src/prototype/programme-reduit.ts` au strict nécessaire (bases non raffinées, `facts`).

Question tranchée depuis la première version : **ordre des tâches (CEO)**. Le code de B2 démarre après la fusion de F10a (#186). F8a (#167) et la décision 0036 (#192) sont fusionnées depuis ; la liste des fichiers de #188 et la décision 0036 sont à revérifier au démarrage du code.

Questions existantes touchées :
- **Q42** (Product Owner) : tranchée par B2-PO-1. Le CEO peut la clore à la fusion de cette spécification.
- **Q50** (Product Owner) : l'étiquette de logement des `terminus` reste dans l'instantané. Elle est stockée, et la vue partagée de B1 la retire.
- **S5** (Samuel, « Partie Q5 ») : `verifiedAt` reste dans `TripSchema` et hors des instantanés. Elle ne bloque pas B2.
- **Q5, Q6** (Samuel) : inchangées. `Proposal.photoUrl` reste chargé à la demande, hors de `ProposalRecord`.
