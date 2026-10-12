# B2 — Évolutions des contrats

Rôle : backend · Rédaction : Product Owner · Ticket : #196 · Revue : Tech Lead · Prérequis : B0 fusionnée (#27, décisions 0010 et 0011) ; F1, F5 et F6 fusionnées (composants à adapter livrés) ; décision 0029 (la mention « après G0 » ne bloque plus) ; Q42 tranchée ici (B2-PO-1) ; aucun compte externe, aucune clé · Parallèle : B1 (#188), sur des fichiers distincts (roadmap, ligne 13) · Suite : B5 (moteur) attend B2 · Référence : `docs/handovers/backend.md` (§ 4 « Contrats à créer » et « Évolutions de contrats », § 5, § 10, § 12 « Adresses issues du web », « Partie Q5 », ligne B2 du « Backlog »), `specs/B0-handover-backend.md` (critère § 5, PO-2, PO-5, PO-6), décisions 0010, 0011 (point 5), 0015, 0016 (§ 4 et § 11), 0017 (`requestId`), 0029, `specs/B1-socle-base-de-donnees.md` (B1-PO-5), `docs/design-system/redaction.md`

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

**E1 — Dates calculées par l'interface.** `Day.weekday`, `Day.title` et `Proposal.weekday` sont retirés de `DaySchema` et `ProposalSchema`. L'interface les calcule depuis `Day.date` (jour de la proposition : `trip.days[proposal.day − 1].date`), avec les fonctions de `src/lib/dates.ts`, qui existent déjà pour « sam. 29.08 » et qu'on complète pour le titre de la Journée (« Samedi 29 août »). Aucun nouveau texte : les noms de jours et de mois de `fr.json` servent.

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

Aucun nom ni texte dans ces objets. Catégorie : calculé (B2-PO-3).

**E4 — `ChecklistMoment` remplace le texte de `ChecklistItem.when`.** Forme fixée par la décision 0010 (PO-2), union discriminée par `type` :
- `{ type: "deadline", date }` (date ISO) ;
- `{ type: "beforeDeparture" }` ;
- `{ type: "tripDay", day }` (entier ≥ 1 ; 1 = J1).

Raffinement de `TripSchema` : un `tripDay.day` ne dépasse pas le nombre de jours du voyage (`end − start + 1`). Le champ garde son nom `when`.

**E9 — `ChecklistItem.stopId`.** Champ facultatif (décision 0016 § 11) : identifiant interne de l'étape concernée, jamais un `placeId`. Raffinement de `TripSchema` : un `stopId` désigne un élément `stop` (ou un événement de `Day.events`) d'un jour du voyage. B2 crée le champ, le raffinement et les liens du jeu simulé ; la variante `checklist` de `Change` et le comportement de F7-PO-19 restent à F7d (B2-PO-7).

**Raffinement `https:`.** `SourceSchema.url` et `ChecklistItemSchema.bookingUrl` n'acceptent qu'une adresse dont le protocole est `https:` (handover § 12). `http:`, `javascript:`, `data:` et toute autre forme sont refusées.

**E5 — `PreviewSlot`.** Forme fixée par la décision 0010 (PO-6), union discriminée par `type` :
- `{ type: "proposal", proposal }` (une `Proposal` complète) ;
- `{ type: "noOption", day, time, kind }` (`kind` : `activity` ou `meal`), sans lieu ni texte.

`PreviewSlotsSchema` : tableau ordonné de 8 cases au plus.

**E10 — `ApiError.currentVersion`.** Ajout du code `version_conflict` à `API_ERROR_CODES` (sans renommer les codes existants) et du champ facultatif `currentVersion` (entier ≥ 1) à `ApiErrorSchema`. Raffinement : `currentVersion` est présent si et seulement si `code` vaut `version_conflict`. B5 le remplit (handover § 4, « Concurrence ») ; B2 ne crée que le contrat (B2-PO-8).

**`TripPatch`** (stocké dans `trip_versions.patch`) : `{ requestId, baseVersion, operations }`.
- `requestId` : UUID (forme de `TripRequest`, décision 0017) ;
- `baseVersion` : entier ≥ 1 (la version 1 n'a pas de patch) ;
- `operations` : tableau non vide d'opérations, union discriminée par `op`, qui désignent les étapes **par identifiant** :
  | `op` | Champs | Sens |
  |---|---|---|
  | `replace` | `stopId`, `candidateId` | Remplacer l'étape par un candidat de la réserve (identifiant interne `candidates.id`) |
  | `add` | `stopId`, `day`, `time`, `name`, `placeId` facultatif | Ajouter une étape : `stopId` est l'identifiant attribué à la nouvelle étape ; `name` est **le nom saisi par la personne** (1 à 80 caractères, espaces retirés aux extrémités), jamais un nom Google ; `placeId` quand le lieu en a un |
  | `move` | `stopId`, `day`, `time` | Déplacer l'étape vers ce jour et cette heure |
  | `lock`, `unlock` | `stopId` | Verrouiller ou déverrouiller |
  | `revert` | `toVersion` | Annuler (PO-5) : crée une version identique à `toVersion` ; aucune version n'est supprimée |
- Raffinements : une opération `revert` est seule dans `operations` et `toVersion < baseVersion` ; `day` ≥ 1 ; `time` au format `TimeSchema`.
- Aucun champ pour un nom Google, une adresse, une coordonnée, un horaire, une note ou une durée : le schéma strict les refuse (B2-PO-5).

**`PatchResult`** (réponse, jamais stockée) : `{ version, touchedDays, changes }` : nouvelle version (entier ≥ 2), indices des jours touchés (entiers ≥ 1, distincts), liste de `Change`. Les `Change[segment]` y sont calculés à la réponse (décision 0011 point 5) (B2-PO-6).

**Schémas de stockage dérivés** (décision 0010, principes 6 et 7 ; « Partie Q5 », « Comportement définitif de B2 »), tous obtenus par `.omit()` ou `.pick()` des schémas source, **sans recopier un champ** :
- `SegmentSnapshotSchema` : `SegmentSchema` sans `minutes` ;
- `StopSnapshotSchema` : `StopSchema` sans `verifiedAt`, avec `exceptions` restreint à `toReserve` et `unconfirmed` (au plus 2 ; `toConfirm` refusé) ;
- `SurpriseIdeaSnapshotSchema` : `SurpriseIdeaSchema` sans `verifiedAt` ;
- `DaySnapshotSchema` : `DaySchema` sans `budgetPerPerson`, `generating` ni `travelMinutes` ; ses étapes, événements, trajets et idée utilisent les schémas ci-dessus ; un `terminus` garde son `label` (stocké ; la vue partagée le retire, Q50) ;
- `TripSnapshotSchema` : `{ days: DaySnapshot[] }`, seul contenu de `trip_versions.snapshot` (B2-PO-4) ;
- `ProposalRecordSchema` : `ProposalSchema` sans `neighbours`, `option` ni `photoUrl`, avec `stop` en `StopSnapshot` (`commitment` refusé, comme pour une proposition), `travelFromPrevious` en `SegmentSnapshot` et `detour` **obligatoire** (« Partie Q5 ») ; clés de premier niveau égales à `PROPOSAL_RECORD_KEYS` de B1.

Note d'implémentation : `ProposalSchema` porte un `superRefine`, et Zod 4 refuse `.omit()` sur un objet raffiné. On dérive donc depuis l'objet de base, puis on applique le raffinement au schéma complet. Le choix est laissé au Tech Lead en revue. La règle « aucune copie de champ » reste.

### 2. Adaptateurs (`src/adapters`)
- **E6** : `AdapterContext` gagne `userId` (texte) et `role` (`owner` ou `member`). `MOCK_REQUEST_CONTEXT` vaut `role: "owner"` avec un `userId` simulé ; `getRequestContext()` le renvoie (B3 le remplira depuis la session).
- **E7** : `TripAdapter.listPreviewSlots(ctx, tripId): Promise<PreviewSlot[]>`, implémentée par l'adaptateur `mock` : sortie validée par `PreviewSlotsSchema` ; voyage inconnu ou d'une autre organisation : liste vide, comme `listProposals`. `getSharedTrip` reste à B12.
- Chaque sortie de l'adaptateur `mock` reste validée par son contrat (`TripSchema`, `ProposalSchema`, `PreviewSlotsSchema`).

### 3. Données simulées (`src/mocks`)
- `edimbourg.ts`, `autres-voyages.ts` : champs retirés supprimés ; `meta` converti en `facts` (« [Old Town, 2 h, billet] » → `{ area: "[Old Town]", durationMinutes: 120 }` ; « gratuit » → `costPerPerson: 0`) ; ce qui n'entre pas dans `StopFacts` (genre de cuisine, « billet ») n'est pas recopié : le badge `toReserve` et `reason` le portent déjà ; `context` converti en `neighbours` (voisins réels de la ligne du jour simulée) ; `when` converti selon E4 :
  | Texte actuel | `ChecklistMoment` |
  |---|---|
  | « [Déjà réservé] » | `beforeDeparture`, avec `done: true` (déjà le cas) |
  | « [Une semaine avant] » | `deadline` à la date du début du voyage moins 7 jours |
  | « [Avant le départ] » | `beforeDeparture` |
  | « [Au plus tôt] » | `beforeDeparture` (Q42, B2-PO-1) |
- Liens `stopId` (E9) : chaque ligne de réservation qui concerne une étape du jeu simulé (billets du Tattoo, excursion, château, distillerie) la désigne ; l'assurance n'en a pas.
- Aperçu Édimbourg (E5) : 8 cases, dont **au moins une `noOption`** et les autres `proposal`. La PR dit quelle case et pourquoi. `listProposals` garde ses propositions (suite du tri du voyage débloqué).
- Les valeurs restent entre crochets quand ce sont des contenus non vérifiés (handover front, règle 2).

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

  Le paragraphe « Où vit l'aperçu » et les lignes des évolutions du § 4 sont marqués « fait (B2) ».
- **Test `contrats: chaque champ a une seule catégorie`** (`tests/unit/contracts/categories.test.ts`), qui rend permanent le script du critère § 5 de B0 :
  - il parcourt les formes Zod des schémas objet et union discriminée exportés par `src/contracts/index.ts`, avec la notation de B0 ;
  - il compare la liste obtenue, à l'identique, à l'union de la première colonne du tableau du § 5 et du tableau de la décision 0011, point 5 (les 7 clés de la « Partie Q5 ») ;
  - aucune clé ne manque, aucune n'est en trop ni en double ; une clé n'a qu'une catégorie.

  Deux exclusions, écrites dans le test :
  - les schémas de stockage dérivés (§ 1) : un test les vérifie à part, `contrats: les schémas de stockage sont dérivés sans copie` ;
  - les contrats dont la ligne « Contrats à créer » nomme une autre tâche pour les compléter (par exemple `TripSummary` par B6, les contrats de F8a par B9 ou B3). Chacun figure dans une liste d'exclusion nommée, avec sa tâche (B2-PO-11).

  La PR donne le nombre de clés obtenu (le handover annonce 144 avant les ajouts de B2).
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
- [ ] `aperçu: les créneaux sans proposition ancrée sont des cases noOption` : l'aperçu simulé d'Édimbourg compte 8 cases, au moins une `noOption`, et aucune case `noOption` n'a de lieu. `PreviewSlotsSchema` refuse 9 cases.
- [ ] `données simulées: aucun texte d'interface` : aucun objet des données simulées n'a de clé `weekday`, `title`, `context` ou `meta`, ni de `when` en texte.
- [ ] `schéma: les clés JSONB suivent les contrats`, **si B1 (#188) est fusionnée avant B2** (sinon B1 l'ajoute, B1-PO-5). Les listes de `db/jsonb-keys.ts` sont égales aux clés des schémas Zod :
  - `STOP_FACTS_KEYS` à celles de `StopFactsSchema` ;
  - `CHECKLIST_MOMENT_VARIANTS` aux variantes de `ChecklistMomentSchema` ;
  - `PROPOSAL_RECORD_KEYS` au premier niveau de `ProposalRecordSchema` ;
  - `SHARED_SNAPSHOT_KEYS` à un sous-ensemble des schémas d'instantané.

  Le fichier `db/jsonb-keys.ts` est lu, jamais modifié.

**Tests propres à cette spécification**
- [ ] `contrats: les schémas de stockage sont dérivés sans copie` : chaque clé de `TripSnapshotSchema`, `DaySnapshotSchema`, `StopSnapshotSchema`, `SegmentSnapshotSchema`, `SurpriseIdeaSnapshotSchema` et `ProposalRecordSchema` existe dans son schéma source. Les clés omises sont exactement celles du § 1.
- [ ] `contrats: TripPatch désigne les étapes par identifiant` :
  - chaque opération est acceptée sous sa forme ;
  - `add` sans `name` est refusé, comme `add` avec un `name` vide ou de plus de 80 caractères ;
  - une clé `displayName`, `formattedAddress` ou `location` est refusée dans une opération ;
  - `revert` accompagné d'une autre opération est refusé, comme `toVersion ≥ baseVersion` ;
  - un `requestId` qui n'est pas un UUID est refusé.
- [ ] `contrats: PatchResult` : forme acceptée ; refus d'une version < 2 et de jours touchés en double ou nuls.
- [ ] `contrats: StopFacts` : objet vide accepté ; refus d'une durée nulle ou non entière, d'un coût négatif et d'une clé inconnue (`rating`, `priceLevel`).
- [ ] `contrats: ChecklistItem.stopId désigne une étape du voyage` : `TripSchema` refuse un `stopId` absent du voyage. Il refuse aussi un `tripDay.day` qui dépasse la durée du voyage.
- [ ] `contrats: currentVersion seulement pour version_conflict` : `ApiErrorSchema` refuse `currentVersion` avec un autre code et `version_conflict` sans `currentVersion`.
- [ ] `données simulées: voisins et liens cohérents` : chaque `neighbours.*.stopId` désigne une étape du jour de la proposition ; chaque `stopId` de la liste désigne une étape du voyage.
- [ ] `adaptateurs: listPreviewSlots` : l'adaptateur `mock` renvoie l'aperçu validé pour l'organisation simulée, et une liste vide pour une autre organisation ou un voyage inconnu.
- [ ] `adaptateurs: le contexte porte userId et role` : `getRequestContext()` renvoie `organizationId`, `userId` et `role: "owner"` avec l'adaptateur `mock`.
- [ ] Tests d'interface (Testing Library) :
  - `interface: faits d'une étape composés depuis StopFacts` (secteur, durée, gratuit, coût estimé, partie absente omise) ;
  - `interface: contexte d'une proposition composé depuis ses voisins` (quatre formes, `stopId` introuvable sans texte inventé) ;
  - `interface: moment d'une réservation composé depuis ChecklistMoment` (quatre libellés) ;
  - `interface: jour de la semaine et titre calculés depuis la date` ;
  - `presentation: les cases noOption ne sont pas des cartes` (bandeau `noOption`, progression sur les seules cartes).

**Vérifications d'ensemble**
- [ ] `pnpm verify` vert. Si B1 est fusionnée, la PR dit si `pnpm verify` a été lancé avec ou sans base (`SKIP_DB_TESTS=1`, décision 0036 en revue dans #192) ; B2 ne touche pas `db/`.
- [ ] Captures visuelles mises à jour par le workflow `visual-update.yml` (libellé `update-snapshots`, décision 0004), jamais localement. La PR dit quelles captures changent et pourquoi (textes composés, aperçu avec une case `noOption`).
- [ ] axe sans violation sur les écrans touchés (`pnpm test:a11y`), en particulier le bandeau `noOption` de l'écran 6.
- [ ] Aucune nouvelle dépendance ; `package.json` et `pnpm-lock.yaml` inchangés.
- [ ] Aucun fichier de B1 modifié (liste ci-dessous) ; `git diff --name-only origin/main` le montre dans la PR.
- [ ] Aucune donnée Google dans le diff : aucun nom, adresse, note, horaire ni coordonnée de Google dans les contrats, les données simulées ou les tests, hormis des `placeId` simulés.

## Fichiers touchés
**Modifiés ou créés par B2** :
- `src/contracts/` : `trip.ts`, `errors.ts`, `values.ts`, `index.ts`, `README.md`, et leurs tests. Nouveaux fichiers : `patch.ts` (`TripPatch`, `PatchResult`), `preview.ts` (`PreviewSlot`), `snapshot.ts` (schémas de stockage dérivés), avec leurs tests.
- `src/adapters/` : `types.ts`, `context.ts`, `mock.ts`, `index.ts`, `README.md`, et leurs tests.
- `src/mocks/` : `edimbourg.ts`, `autres-voyages.ts`, `edimbourg-carte.ts` (seulement si les identifiants changent), `README.md`, et leurs tests.
- `src/lib/dates.ts`, et un module de formatage des faits (par exemple `src/lib/faits.ts`), avec leurs tests.
- `src/components/ligne/` : `DeckCard`, `DayLine`, `DayTabs`, `DayBadge`, `ChecklistRow`, `README.md`, et leurs tests.
- `src/features/presentation/` : `load.ts`, `PresentationScreen.tsx`, `ProposalDetailSheet.tsx`, la fonction de contexte, et leurs tests.
- `src/features/sejour/` : `JourneePanel`, `SejourPanel`, `StopSheet`, `EventLines`, `SurpriseBlock`, `fiche.ts`, `TripShell`, et leurs tests. Aussi `src/features/voyage/` si F10a (#186) est fusionnée avant B2.
- `src/i18n/fr.json` ; `src/dev/ComposantsShowcase.tsx`, `src/dev/EtatsShowcase.tsx`.
- `tests/unit/contracts/` (nouveau dossier) : `categories.test.ts`, et `jsonb-keys.test.ts` selon l'ordre de fusion.
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

## Décisions (Product Owner, définitives sans veto de Samuel avant le 2026-10-14)
À lister dans la note de version suivante, rubrique « Décisions prises par le studio ». Les formes de contrat ci-dessous restent soumises à la revue du Tech Lead (architecture, « Qui décide quoi »).
- **B2-PO-1 — Q42 : « [Au plus tôt] » devient `beforeDeparture`.**
  - Raison : le jeu simulé n'a pas de date d'ouverture de billetterie, et en inventer une ferait une date limite fausse.
  - Une variante de plus (« dès que possible ») changerait la forme fixée par le Tech Lead dans la décision 0010 pour une nuance d'affichage.
  - Si la recherche réelle (B7) trouve une date d'ouverture, c'est une `deadline`.
- **B2-PO-2 — `StopFacts` aux noms de B1.**
  - Les clés sont `durationMinutes`, `costPerPerson` et `area`, toutes facultatives. Le coût est en CHF, unité de `Day.budgetPerPerson`.
  - Raison : B1 les a proposées (`db/jsonb-keys.ts`) ; reprendre ses noms évite une migration.
  - Le genre de cuisine et les mentions comme « billet » ne sont pas repris. Ce sont des textes libres : `reason`, `category` et les badges les portent déjà, et un champ texte libre de plus pourrait recevoir un contenu Google.
- **B2-PO-3 — `Proposal.neighbours` est calculé, hors de `ProposalRecord`.**
  - Le serveur le compose à la lecture, depuis la version courante (éléments du jour qui encadrent la proposition).
  - Raison : un voisin stocké serait faux après une révision du jour. `PROPOSAL_RECORD_KEYS` de B1 ne le contient déjà pas.
  - Le calcul réel revient à B5 ou B6 ; les données simulées portent des voisins fixes, vérifiés par un test.
- **B2-PO-4 — `TripSnapshot` ne contient que `days`.**
  - Les autres champs stockés de `Trip` vivent dans `trips` et `checklist_items`, et les champs calculés n'y entrent pas (décision 0010).
  - Raison : une version ne porte que ce qu'une révision change. C'est aussi la forme que lit `shared_snapshot` de B1.
  - Écart avec la lettre de 0010 (« dérivé de `TripSchema` par omission des champs calculés ») : signalé au Tech Lead.
- **B2-PO-5 — Forme de `TripPatch`.**
  - Opérations par `stopId`, dans la forme du tableau du § 1. `add` porte le nom saisi et le `placeId` facultatif, parce qu'une idée « Surprends-moi » peut ne pas en avoir.
  - `move` porte un jour et une heure, et non l'identifiant opaque d'un point d'insertion (décision 0016 § 4.1) : un patch stocké doit pouvoir être rejoué sur une autre version (R10).
  - `revert` est seule dans son patch.
- **B2-PO-6 — Forme de `PatchResult`.** `{ version, touchedDays, changes }`, avec les noms du handover (« nouvelle version, jours touchés, `Change` »). `Change` est pris tel qu'il est dans `main` à la fusion : les formes de F7a (décision 0016 § 4.5) ne sont pas anticipées.
- **B2-PO-7 — `ChecklistItem.stopId` entre avec B2.**
  - La décision 0016 § 11 le prévoit quand le schéma de base vient avant F7d, ce qui est le cas : `checklist_items.stop_id` est créé par B1.
  - F7d garde la variante `checklist` de `Change` et le comportement de F7-PO-19.
- **B2-PO-8 — E10 dans B2.**
  - Le « Backlog » attribue E10 à B2, le tableau des évolutions à B5. B2 crée le code `version_conflict` et `currentVersion` ; B5 les remplit.
  - Raison : B5 dépend de B2, et le contrat doit exister avant le moteur.
- **B2-PO-9 — Cases `noOption` dans la présentation.**
  - Elles ne sont jamais des cartes : on ne peut pas aimer ou refuser un créneau vide, et on ne le remplit jamais par un lieu non ancré (R1).
  - Un bandeau `noOption` nomme les créneaux concernés. La progression ne compte que les cartes.
  - Le voyage débloqué garde la lecture `listProposals`.
  - Le rendu visuel du bandeau relève d'UX/UI.
- **B2-PO-10 — Libellés provisoires.** Les textes de la section « Composants et écrans » suivent `redaction.md`. Ils sont provisoires : UX/UI peut les remplacer dans `fr.json` sans toucher aux contrats.
- **B2-PO-11 — Test de catégories permanent.**
  - Le script du critère § 5 de B0 devient le test `contrats: chaque champ a une seule catégorie`.
  - Il exclut nommément les contrats qu'une autre tâche doit compléter, chacun avec sa tâche ; cette tâche ajoute ses lignes et retire l'exclusion.
  - Raison : un tableau vérifié une seule fois dérive dès la PR suivante.

## Hors périmètre
- `getSharedTrip` et `SharedTrip` (B12) ; `GenerationStatus` et ses compteurs `expected` et `ready` (F8c, complété par B9) ; contrats de la révision `ReplacementRequest`, `RevisionPreview`, `MoveRequest`, `MoveOptions`, `AddRequest`, `AddMoment`, `PlaceSearchResult` et formes de `Change` de la décision 0016 § 4.5 (F7a à F7c) ; variante `checklist` de `Change` et comportement de F7-PO-19 (F7d).
- Les 7 clés de la « Partie Q5 » restent dans `TripSchema` sous leur forme actuelle (`Segment.minutes`, `Day.travelMinutes`, `Change[segment]`, `verifiedAt`, `exceptions`). B2 ne les omet que dans les schémas de stockage. Leur recomposition revient à B6 et B8 ; `verifiedAt` attend S5 (Samuel).
- Application d'un patch, calcul des voisins, des coûts et du budget, détection de conflit (B5) ; module d'écriture et lecture `api` (B6) ; clés des `CHECK` en base et migrations (B1, rôle `data`).
- Conversion de devise des coûts trouvés sur le web (B7 ou B9).
- Toute action dans les consoles Google, Neon, Vercel ou GitHub ; toute mise en production.

## Questions ouvertes
Listées dans la description de la PR de cette spécification ; le CEO les reporte et les numérote dans `QUESTIONS.md`.
1. **Tech Lead** : confirmer les formes de B2-PO-3 à B2-PO-6 (`ProposalNeighbours` calculé, `TripSnapshot` réduit à `days`, `TripPatch`, `PatchResult`). Ces formes relèvent de l'architecture des contrats. Bloque le début du code de B2, et donc B5.
2. **Tech Lead** : confirmer le test permanent de catégories et sa liste d'exclusion (B2-PO-11, outillage de test). Bloque la forme finale du test, pas le reste de B2.
3. **CEO** : ordre des tâches. Le code de B2 touche des fichiers de PR ouvertes :
   - #167 (F8a) : `src/contracts/index.ts`, `values.ts`, `trip.test.ts`, `src/adapters/types.ts`, `fr.json` ;
   - #186 (F10a) : `DayLine`, `SejourPanel`, `fr.json` ;
   - #192 (décision 0036) : `docs/handovers/backend.md`.

   Recommandation : lancer le code de B2 après leur fusion, pour éviter trois rebasages. Bloque le démarrage du code, pas la spécification.
4. **UX/UI** : libellés provisoires (B2-PO-10) et rendu du bandeau des cases `noOption` dans la présentation (B2-PO-9), écran non maquetté. Bloque la validation visuelle, pas le code.

Questions existantes touchées :
- **Q42** (Product Owner) : tranchée par B2-PO-1. Le CEO peut la clore à la fusion de cette spécification.
- **Q50** (Product Owner) : l'étiquette de logement des `terminus` reste dans l'instantané. Elle est stockée, et la vue partagée de B1 la retire.
- **S5** (Samuel, « Partie Q5 ») : `verifiedAt` reste dans `TripSchema` et hors des instantanés. Elle ne bloque pas B2.
- **Q5, Q6** (Samuel) : inchangées. `Proposal.photoUrl` reste chargé à la demande, hors de `ProposalRecord`.
