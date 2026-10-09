# 0017 — Décisions du Tech Lead pour F8 (création du voyage et connexion) et suites de D1

Statut : décision déléguée, définitive sans veto de Samuel sous 2 jours (avant le 2026-10-11) · Date : 2026-10-09 · Décideur : Tech Lead (architecture, bibliothèques, outillage, tests ; délégation « Qui décide quoi » de `docs/CONTEXT.md`) · Ticket #62

## Contexte
Six questions déléguées au Tech Lead sont ouvertes dans `QUESTIONS.md` :
- **Q80** (F8-Q7) : propositions F8-TL-1 à F8-TL-8 de `specs/F8-creation-compte.md` (fusionnée par #49), à trancher avant le code de F8 ;
- **Q85** (F8-Q10) : proposition F8-TL-9, portée et horloge des simulations côté serveur ;
- **Q102** (F8-Q13) : proposition F8-TL-10, garde des environnements déployés, et codes d'erreur provisoires `invalid_input` et `unauthenticated` ;
- **Q99** (D1-Q2), **Q100** (D1-Q3) et **Q107** : suites de D1 (#59, en revue, approuvée par le Tech Lead sur `bee4bd2`).

Le code de F8 est découpé en trois PR successives (F8-PO-16, découpage proposé au CEO, F8-Q8) : **F8a** (écrans 1 et 2), **F8b** (écrans 3 et 4) et **F8c** (lancement et écran 5). Pour chaque décision, la PR qui l'applique est indiquée. Chaque PR ne crée que ce qu'elle utilise.

Cette décision s'appuie sur les décisions 0013, 0015 et 0016 et les amende là où c'est dit (§ 8 et § 12). Elle renvoie au handover back-end (#27, en revue) et à la décision UX/UI 0012 (#26, en revue) sans les présupposer acceptés. Les numéros 0006 à 0012 restent réservés par des PR en revue.

Hors de cette décision :
- **Samuel** : connexion simulée sur les prévisualisations Vercel et contrôle des variables de l'hébergeur (Q101, F8-Q12 : comptes et environnements) ; fournisseur d'envoi des codes (Q25) ; mentions légales du compte (F8-Q2) ; durée maximale d'un voyage (F8-Q3) ; plafond du récit (F8-Q9) ;
- **UX/UI** : rendus et textes non maquettés (F8-Q1), dont la marque « déduit » de `SegmentedControl` et du champ numérique, et la mise en page de la section « Démonstration » (Q106) ;
- **Product Owner** : comportement fonctionnel ;
- **CEO** : ordre des tâches, dont la place des tâches T6 et T7 créées ici (§ 13 et § 14) ;
- **Q79** (brouillon en mémoire ou dans le navigateur) et **Q86** (seuils réels de la connexion par code, B3) sont partagées avec la Sécurité. Le § 5 fixe le choix technique de la phase 0 pour Q79, sans clore la part de la Sécurité. Q86 n'est pas traitée ici : elle ne bloque que B3.

**Aucune nouvelle dépendance** : `crypto.randomUUID`, `zod` 4.6.5 et `zod/mini` sont déjà disponibles. `docs/decisions/0003-versions.md` ne change pas. Aucune de ces décisions n'engage d'argent, de compte externe ni de donnée personnelle hors UE.

## Décisions — F8 (Q80, F8-TL-1 à F8-TL-8)

### 1. F8-TL-1 — Route de l'écran 3
**Retenue : `R3` = `/voyages/nouveau/logement`.**

- Aucun voyage n'existe avant la connexion (C6 du handover back-end en revue). `/voyages/[id]/logement` reste réservé au changement de logement après création, hors F8.
- **Ville courante** : il n'y a pas de paramètre d'adresse. La ville affichée à l'écran 3 est l'état du brouillon (§ 5), et non `?ville=…`. Le seul paramètre d'adresse de F8 reste `suite` (spécification, « Règles Google et données personnelles »).
- **Module d'adresses unique**, sur le modèle de `tripRoutes` (0015 § 1) : `src/features/creation/routes.ts` exporte `creationRoutes`, avec `nouveau()`, `brief()`, `logement()`, `lancer()` et `preparation(tripId)` (identifiant encodé). L'écriture et la relecture de `suite` (`connexionRoute(suite)` et `normaliserSuite`) vivent ensemble dans `src/features/compte/suite.ts` : le module qui écrit une adresse est celui qui la relit (0016 § 7). **Point de revue** : aucune adresse de F8 n'est concaténée ailleurs. Pour `/voyages/{id}`, `/voyages/{id}/presentation` et `/voyages/{id}/preparation`, `normaliserSuite` reconstruit la valeur par `tripRoutes("/voyages", id).sejour()`, `presentationRoute(id)` (§ 12) et `creationRoutes.preparation(id)`.
- **Identifiant réservé** : le segment statique `nouveau` l'emporte sur `[id]`, donc aucun voyage ne peut s'appeler `nouveau`. Les identifiants simulés ne le sont pas, et B9 génère des identifiants qui ne peuvent pas l'être. `normaliserSuite` n'a pas à le traiter : `/voyages/nouveau` mène à `R1`, sans risque.
- **`R3-dev`** = `/dev/voyages/nouveau/logement` (§ 7). Le segment statique `nouveau` l'emporte aussi sur `src/app/dev/voyages/[id]`.
- PR : **F8a** (module d'adresses, `R1`, `R2`) ; **F8b** (`R3`, `R3-dev`, `suite.ts`).

### 2. F8-TL-2 — Contrats de phase 0
**Retenue, précisée.** Elle crée `src/contracts/creation.ts`, réexporté par `src/contracts/index.ts`. Tous les objets sont stricts (`z.strictObject`). Les noms suivent le handover back-end (#27, en revue), pour que B9 les complète sans les renommer. Aucun texte d'interface dans les données.

#### 2.1 Bornes : une seule source, sans Zod côté client
- Les bornes de saisie sont des constantes nommées sans Zod, dans `src/contracts/values.ts` (0016 § 3.1) : par exemple `DESTINATION_LENGTH = { min: 2, max: 80 }`, `STORY_LENGTH = { min: 20, max: 1000 }`, `MAX_CITIES = 4`, `MAX_COMMITMENTS = 10`, `ADULTS = { min: 1, max: 9 }`, `MEAL_BUDGET_CHF = { min: 5, max: 500 }`, `EMAIL_MAX_LENGTH = 254`, `OTP_LENGTH = 6`. Les schémas en dérivent.
- **Côté navigateur, `validation.ts` n'importe pas les schémas** : il lit ces constantes depuis `@/contracts/values` et écrit des fonctions pures. Sinon, le Zod complet entrerait dans les pages de création, contre la règle de 0016 § 3.1. Il n'y a pas de seconde copie d'une valeur, ce qui respecte la « source unique » de F8-PO-17.
- **Test de concordance** : pour chaque borne, les valeurs limites (min − 1, min, max, max + 1) donnent le même verdict par `validation.ts` et par le schéma.
- Si T4 n'est pas fusionnée avant F8a, F8a crée `src/contracts/values.ts` avec ses seules constantes, et T4 le complète. Les deux tâches ne sont jamais dans le même cycle (0016 § 3.2).

#### 2.2 `TripDraft` (écran 1)
- `TripDraft = { destination, start, end, lodging, otherCities, commitments }`. C'est la forme du handover, où les « autres villes » sont distinctes de la destination :
  - `destination` : texte libre de 2 à 80 caractères, espaces retirés aux extrémités ;
  - `start` et `end` : `IsoDate`, avec `end` > `start` ;
  - `lodging` : le logement de la destination ;
  - `otherCities` : 0 à 3 éléments `{ name, arrival: IsoDate, lodging }`, soit 4 villes au plus en comptant la destination ;
  - `commitments` : 0 à 10 éléments `{ kind: "flight" | "booking" | "ticket"; label; date: IsoDate; start: Time; end?: Time }`.
- **Logement** : union discriminée sur `kind` :
  - `{ kind: "known"; label }` (2 à 120 caractères) et `{ kind: "area"; label }` (2 à 80 caractères) ;
  - `{ kind: "none" }` (« Pas encore » sans suggestion retenue, ou « Continuer sans logement ») ;
  - `{ kind: "suggestedLodging"; lodgingId; placeId? }` et `{ kind: "suggestedArea"; areaId }`.
  
  Deux variantes au lieu d'un `lodgingId | areaId` : le type dit alors lequel des deux est présent. Une suggestion retenue ne porte que des identifiants, jamais le nom affiché (spécification, écran 3). `label` est un texte saisi par la personne, jamais un nom Google (F8-PO-14).
- **Raffinements** : les arrivées des autres villes sont strictement croissantes, strictement après `start` et strictement avant `end`. La date d'un engagement est comprise entre `start` et `end`, et `end` > `start` pour un engagement. Les dates de départ de chaque ville sont **déduites** par une fonction pure (`cityRanges(draft)` dans `validation.ts`) et ne sont pas stockées : une seconde copie pourrait se contredire.
- **« Arrivée au plus tôt aujourd'hui »** dépend de l'heure et du fuseau : ce n'est pas un raffinement du schéma. L'interface le vérifie à l'heure de l'appareil. Côté serveur, `createTrip` le vérifie sur l'horloge de la portée (§ 10), avec une tolérance d'un jour pour les fuseaux.

#### 2.3 Brief
- `BriefRequest = { draft: TripDraft; story }`, où `story` a de 20 à 1 000 caractères.
- `Brief`, complet, est ce que `TripRequest` porte :
  - `travellers: { adults: 1..9; children: 0..9 }` ;
  - `pace: "relaxed" | "balanced" | "intense"` ;
  - `wishes: Category[]` (au moins 1, sans doublon) et `limits: Category[]` (sans doublon, sans élément commun avec `wishes`) ;
  - `mobility: ("walk" | "transit" | "car")[]` (sans doublon) ;
  - `mealBudgetPerPerson?` (entier de 5 à 500) ;
  - `inferredFields: BriefField[]`.
- `BriefField = "travellers" | "pace" | "wishes" | "mobility" | "limits" | "mealBudget"`. Ce sont les 6 « champs » de F8-PO-15, et `brief_completed` les compte sur cette énumération.
- **Sortie de `structureBrief` : `InferredBriefSchema`**, et non `BriefSchema`. Un brief déduit peut être incomplet : la spécification veut « aucun choix par défaut si le rythme n'est pas déduit ». Tous les champs y sont donc facultatifs, avec un raffinement : `inferredFields` est exactement l'ensemble des champs présents. La règle de F8-PO-17 est inchangée sur le fond. L'action valide la sortie par ce schéma avant de la renvoyer, et une sortie non conforme devient `provider_error`. La spécification dit `BriefSchema` à cet endroit. Sa prochaine mise à jour (Product Owner) renverra à ce paragraphe ; aucun critère ne change.

#### 2.4 Logement suggéré, demande de voyage, génération
- **`LodgingSuggestion`** :
  - `area: { areaId; name; reason; center: { lat; lng }; radiusM }` : nom, raison, centre et rayon sont des données maison ;
  - `lodgings` : 0 à 3 éléments `{ lodgingId; placeId?; name; meta }`, où `name` et `meta` sont maison (entre crochets dans le jeu simulé).
  
  Demande : `LodgingRequest = { draft: TripDraft; city: number }`, où `city` vaut 0 pour la destination et i pour `otherCities[i − 1]`. C'est le « `TripRequest` sans logement » du handover. Il est nommé à part parce qu'il ne porte ni `requestId` ni brief.
- **`TripRequest`** = `{ requestId: uuid; draft: TripDraft; brief: Brief }`. Les choix de logement sont dans `draft`. L'organisation **n'y figure pas** : elle vient de la session (F8-PO-17). `createTrip` renvoie `{ tripId }`.
- **`GenerationStatus`** : union discriminée sur `phase` :
  - `preparing`, `ready` et `incomplete` : `{ tripId; days: { index; state: "preparing" | "ready"; readyStops }[]; expected; ready }`, avec un raffinement pour `incomplete` : `ready` < `expected` ;
  - `failed` : les mêmes champs, plus `reason` (`provider_error`, `cost_cap_reached` ou `quota_reached`, § 4) et `retryable: boolean`.
  
  Aucun nom de lieu ni identifiant d'étape n'y figure : l'écran 5 ne montre que des anneaux (F8-PO-12).
- `CodeRequest = { email }` et `CodeVerification = { email; code }`. `email` a 254 caractères au plus et est valide selon `z.email()`. `code` est fait d'exactement 6 chiffres ASCII (`/^[0-9]{6}$/`). Ils sont dans `src/contracts/auth.ts`, avec `Session = { sessionId; userId; organizationId }`.
- PR : **F8a** (`TripDraft`, `BriefRequest`, `Brief`, `InferredBrief`, erreurs du § 4) ; **F8b** (`LodgingRequest`, `LodgingSuggestion`, `auth.ts`) ; **F8c** (`TripRequest`, `GenerationStatus`).

### 3. F8-TL-3 — Adaptateurs et actions serveur
**Retenue, précisée.**

- **Interfaces** dans `src/adapters/types.ts` :
  - `CreationAdapter` : `structureBrief(request)`, `suggestLodging(request)`, `createTrip(ctx, request)` et `getGenerationStatus(ctx, tripId)` ;
  - `AuthAdapter` : `requestCode(request)`, `verifyCode(request)`, `getSession()`, `signOut()` et `config` en lecture (`codeTtlMs`, `maxAttempts`, `maxCodeRequests`, `codeRequestWindowMs`).
  
  Chaque méthode renvoie une `Promise<Result<T>>` (§ 4), sauf `getSession` (`Promise<Session | null>`) et `signOut` (`Promise<void>`). `structureBrief`, `suggestLodging`, `requestCode` et `verifyCode` sont anonymes : ils ne prennent pas de contexte d'organisation (handover, lignes des écrans 2 à 4).
- **Choix** : `getCreationAdapter(options?)` lit `DATA_ADAPTER` et `getAuthAdapter(options?)` lit `AUTH_ADAPTER`. Ce sont des variables serveur, sans préfixe `NEXT_PUBLIC_`. Les deux fonctions reprennent la normalisation `adapterChoice` de D1 (absente ou vide = `mock`) et lèvent une erreur pour une valeur inconnue, comme `getTripAdapter`. `options.scope` est la portée de simulation (§ 10), ignorée par les adaptateurs réels.
- **Implémentations simulées** : `src/adapters/mock-creation.ts` et `src/adapters/mock-auth.ts`, construites par des fabriques (`createMockAuthAdapter({ now, store, config })`), sans réseau ni écriture disque. Le jeu simulé est dans `src/mocks/creation-edimbourg.ts`, et le code valable simulé est une constante de `src/mocks` (tests seulement). Chaque sortie simulée est validée par son schéma dans l'adaptateur, comme `mockTripAdapter`.
- **Actions serveur** (`"use server"`) : `src/features/creation/actions.ts` et `src/features/compte/actions.ts`. Chaque action suit le même ordre :
  1. `safeParse` de l'entrée (reçue en `unknown`) par le schéma strict ;
  2. pour `createTrip`, `getSession()` ;
  3. appel de l'adaptateur ;
  4. pour `structureBrief` et `suggestLodging`, validation de la sortie.
  
  Une fonction commune (`parseInput(schema, input)`) traduit l'échec en `validation_failed` (§ 4), pour que la règle ne soit pas recopiée dans six actions. `getGenerationStatus` prend, en phase 0, le contexte de `getRequestContext()`, comme la page de l'écran 5 (0013 § 3.6). B3 remplace les deux par la session.
- **Session simulée et organisation** : en phase 0, toute session simulée (adresse connue ou inconnue) porte l'organisation simulée `MOCK_ORGANIZATION_ID`. Ainsi, l'écran 5, qui lit le voyage par `getRequestContext()`, trouve le voyage créé. « Compte existant » et « compte nouveau » ne diffèrent que par `userId`, jamais dans la réponse (F8-PO-9). Aucun cookie n'est posé (F8-TL-3 de la spécification) : la session vit dans la portée de simulation (§ 10).
- **`createTrip` simulé** :
  - **idempotence** : la clé est le couple (organisation, `requestId`) ;
  - pour l'organisation simulée, il renvoie `mock_trip_edimbourg` (F8-PO-13) ;
  - pour une autre organisation (tests unitaires seulement), il renvoie un identifiant propre à cette organisation et à la portée, jamais `mock_trip_edimbourg` ;
  - **`active_preview_exists`** : seulement si une génération de la même organisation n'est pas dans un état final et que le `requestId` est nouveau. Une fois la génération finie, un nouveau `requestId` relance la suite d'états. Sans cette limite, la démonstration, où tous les visiteurs partagent la portée par défaut, serait bloquée après la première création ;
  - **voyage jamais créé dans la portée** (ouverture directe de l'écran 5) : `getGenerationStatus` renvoie l'état final `ready`, puisque le voyage simulé est déjà complet.
- **Principe « l'agent cherche, l'ancrage vérifie, le moteur planifie »** : en phase 0, rien n'est cherché ni planifié. Les réponses sont précalculées. Pour B9 :
  - `structureBrief` est la seule étape IA du parcours. Le récit y est transmis comme donnée, jamais comme instruction, et sa sortie n'est rendue qu'après validation par `InferredBriefSchema` ;
  - `suggestLodging` est calculé par le moteur, avec la distance comme coût (cadrage § 3.7), à partir de lieux ancrés, et non choisi par le modèle.
  
  La spécification de B9 reprend ces deux exigences.
- PR : **F8a** (`CreationAdapter` avec `structureBrief`, action et mock) ; **F8b** (`suggestLodging`, `AuthAdapter`, actions de connexion) ; **F8c** (`createTrip`, `getGenerationStatus`).

### 4. Q102, partie codes — Contrat d'erreur des actions
**Décision : le format d'erreur commun du handover back-end (#27, « Format d'erreur commun »), codes en `snake_case`. `invalid_input` est renommé `validation_failed` ; `unauthenticated` est confirmé.**

- `src/contracts/errors.ts` :
  - `ApiErrorCodeSchema`, énumération fermée des codes que F8 utilise : `validation_failed`, `unauthenticated`, `rate_limited`, `cost_cap_reached`, `quota_reached`, `provider_error`, `no_option`, `invalid_code`, `code_expired`, `too_many_attempts` et `active_preview_exists`. B6 et suivants l'étendent sans renommer ;
  - `ApiError = { code; field?; retryable? }` ;
  - `Result<T> = { ok: true; value: T } | { ok: false; error: ApiError }`.
- **Renommage** : `validation_failed` est le nom du handover, qui l'associe déjà à « erreur de champ du formulaire » avec `field`. Garder `invalid_input` créerait deux noms pour la même erreur entre F8 et B9. Comme le prévoit la spécification (« Codes d'erreur »), le renommage ne change ni les textes, ni les comportements, ni les critères. Les tests importent les codes depuis `src/contracts`.
- **`field`** : le chemin du premier champ refusé, en pointé (`otherCities.2.arrival`). **Jamais** la valeur reçue, ni le message de Zod, qui peut décrire la valeur. Un journal serveur ne porte que `code` et `field` (spécification, « Données personnelles »).
- **`unauthenticated`** : l'interface y répond par `R4(R-lancer)`, comme le handover le prévoit.
- **Lien avec 0016 § 4.4** : `RevisionError` de F7 garde ses codes d'écran en `camelCase`. L'adaptateur `api` de B11 convertit les codes du serveur dans une seule table, comme prévu. F8 n'a pas de type d'écran intermédiaire : ses actions sont déjà nos actions serveur et renvoient `ApiError` tel quel.
- PR : **F8a** (`errors.ts`, `validation_failed`, `provider_error`, `rate_limited`, `cost_cap_reached`), complété par F8b et F8c pour leurs codes.

### 5. F8-TL-5 — Brouillon et lancement (et Q79, partie technique)
**Retenue.**

- **Brouillon en mémoire de l'onglet** : `DraftProvider`, fournisseur React client, autour d'un réducteur pur (`draft.ts`) testé sans React. Il porte `TripDraft` en cours de saisie, l'état « Récit » ou « Vérification », le récit, le brief et sa provenance (déduit ou modifié), la ville courante de l'écran 3, le dernier écran 3 affiché (pour « Retour » depuis l'écran 4) et le `requestId`.
- **Montage** : groupe de routes `src/app/(creation)/layout.tsx`, qui contient `voyages/nouveau/**` (dont `lancer`) et `connexion`. Pas dans `src/app/layout.tsx` : le fournisseur et son code entreraient dans toutes les pages, dont la Journée et son budget de 200 Ko (0016 § 3). Jamais dans un layout limité à `/voyages/nouveau`. L'écran 5 reste sous `src/app/voyages/[id]/preparation`, hors du groupe : le brouillon est démonté quand le voyage existe, ce qui suit la spécification (« L'écran 5 n'a pas de retour vers la création »).
- **`requestId`** : `crypto.randomUUID()`, créé au premier lancement et gardé dans le brouillon. Un second lancement du même brouillon le réutilise.
- **`R-lancer`** = `/voyages/nouveau/lancer` : composant client sans écran, qui garde, appelle `createTrip` une fois, puis `router.replace(creationRoutes.preparation(id))`. Le double effet du mode strict de React en développement est couvert par l'idempotence.
- **Durée de `preview_ready`** : l'instant de l'appel à `createTrip` doit survivre à la navigation vers l'écran 5, hors du groupe. Il est gardé dans un module client minuscule, `src/features/creation/launch-timing.ts` (`markLaunch(tripId, t)` et `takeLaunch(tripId)`, horloge injectable, `performance.now` par défaut). C'est une variable de module, en mémoire de l'onglet, perdue au rechargement : c'est exactement la règle de F8-PO-15 (propriété absente après un rechargement). Aucun stockage navigateur n'est utilisé.
- **Q79** : le choix technique de la phase 0 est la mémoire de l'onglet (F8-PO-1). Le stockage navigateur de C6 est écarté pour la phase 0, parce qu'il garderait sur l'appareil un récit personnel. Revenir dessus demande un amendement écrit de cette décision, après l'avis de la Sécurité, qui garde sa part de Q79.
- PR : **F8a** (fournisseur, réducteur, groupe `(creation)`) ; **F8c** (`R-lancer`, `launch-timing.ts`).

### 6. F8-TL-4 — Marque « déduit » hors `Chip`
**Retenue, précisée.**

- `SegmentedControl` gagne `inferredValue?: T`. L'option de cette valeur porte la marque tant qu'elle est choisie et que la personne n'a rien touché. Le nom accessible du groupe reçoit la mention « déduit de ton récit » par `aria-describedby`. Le pointillé n'est jamais la seule information. Sans la prop, rien ne change : les tests de F2 et de F7 restent inchangés.
- **`value: T | null`** : il est nécessaire à F8a (pas de rythme par défaut). La décision 0016 § 8 l'a déjà retenu pour F7a. La première des deux PR qui le livre l'ajoute, la seconde le réutilise. F7a et F8a ne sont jamais dans le même cycle, puisque les deux touchent `SegmentedControl.tsx`.
- **Champ numérique** : composant `NumberField` de `src/features/creation/` (pas de `src/components/ligne` : il n'est pas dans le design system), avec `inferred?: boolean`. Il sert aux voyageurs, avec les deux `IconButton` de 44 px, et au budget par repas. `Counter` de F3 est un compteur d'actions requises, sans rapport : il n'est pas réutilisé.
- Rendu provisoire dans `provisoire.css`, à fixer par UX/UI (F8-Q1).
- PR : **F8a**.

### 7. F8-TL-7 — Mini-carte de zone
**Retenue, précisée.**

- `AreaMap` dans `src/components/carte/`, composant à part et non une variante de `DayMap`. Props : `center` et `radiusM`, avec le nom du quartier pour le nom accessible. Il réutilise `CarteProvider`, la configuration, le chargeur et l'état « configuration absente » (`MapFallback`) de F4. Aucun marqueur de logement en phase 0.
- **Rendu** : la zone est un cercle, et la caméra est ajustée à ses bornes. Le cercle est dessiné par chaque rendu dans sa propre projection, comme `offsetCamera` (0016 § 2) :
  - Google : un cercle de l'API chargée ;
  - carte simulée : un cercle SVG.
  
  L'extension minimale de l'interface `SimulatedRenderer` est proposée par F8b et vérifiée à la revue.
- **Carte simulée** seulement sur `R3-dev`, par un composant client propre à `/dev` qui enveloppe l'écran dans `CarteProvider`, comme `SimulatedCarte` (0015 § 1). `R3-dev` monte son propre `DraftProvider` avec un brouillon de démonstration exporté par `@/adapters` (`MOCK_DEMO_DRAFT`, réservé aux pages de développement et aux tests, comme `MOCK_DEMO_TRIP`). Il ne lit jamais `src/mocks`.
- La mini-carte n'est jamais la seule source d'information (spécification, écran 3). Le centre et le rayon sont des données maison du quartier, jamais une géométrie Google.
- PR : **F8b**.

### 8. F8-TL-8 — Codes des envies (amende 0013 § 3.1)
**Retenue : `heritage`, `market`, `nightlife` s'ajoutent aux cinq codes de F6.**

- `CATEGORIES = ["museum", "walk", "nature", "tasting", "restaurant", "heritage", "market", "nightlife"]`, dans `src/contracts/values.ts` (0016 § 3.1), dont dérive `CategorySchema`. C'est l'alignement que prévoyait 0013 § 3.1 « quand F8 et B9 le fixeront ». B9 le reprend sans renommer.
- **Libellés** : deux formes existent, et ce n'est pas un doublon :
  - la phrase de la question de préférence de F6 (`presentation.categories`, « les musées et monuments ») ;
  - l'étiquette d'une `Chip` de F8 (`creation.envies`, « Musées »).
  
  Les deux tables sont typées `Record<Category, string>`, et un test vérifie qu'elles couvrent tout `CATEGORIES`. Ajouter un code oblige donc à écrire ses deux libellés.
- **Conséquence pour F6** : une proposition peut désormais être classée `heritage`, `market` ou `nightlife`. F8a ajoute donc les trois phrases de `presentation.categories` (provisoires, UX/UI). Les événements `deck_decision` et `preference_prompt_answered` suivent `CategorySchema` sans changement de code.
- PR : **F8a**.

### 9. F8-TL-6 — Suivi de la génération
**Retenue, précisée.**

- L'écran 5 rend l'état initial côté serveur (`getGenerationStatus` dans la page), puis le client interroge l'action toutes les `GENERATION_POLL_MS = 1000` ms (constante nommée de `src/features/creation/`). L'interrogation est une chaîne de `setTimeout` relancée à la réponse, et non un `setInterval` : deux appels ne se chevauchent jamais.
- Elle s'arrête dans un état final (`ready`, `incomplete`, `failed`) et au démontage. « Réessayer » la relance.
- Le flux `/api/v1/trips/[id]/generation` (handover) la remplacera par un crochet de même forme (`useGenerationStatus(tripId, initial)`), sans changer l'écran.
- Les tests unitaires utilisent `vi.useFakeTimers` ; les tests e2e utilisent `page.clock.runFor(1000)` (spécification, « Temps et état simulés »).
- PR : **F8c**.

## Décisions — Q85 (F8-TL-9) et Q102 (F8-TL-10)

### 10. F8-TL-9 — Portée et horloge des simulations
**Retenue : en-tête de requête, pas de cookie.**

- **Module serveur** `src/adapters/simulation.ts` :
  - `Clock = { now(): number }` ;
  - la portée par défaut suit l'horloge réelle ;
  - une portée explicite a une horloge manuelle, fixée par `reset(now)` et avancée par `advanceClock(ms)`. Entre deux avances, le temps du serveur ne bouge pas, ce qui rend les tests déterministes ;
  - l'état de chaque portée (codes, compteurs, session, voyages créés, `requestId`, instant de lancement des générations) est rangé dans une `Map` du processus, sur `globalThis` pour survivre au rechargement à chaud du développement.
- **Horloge injectée** : `mock-auth.ts` et `mock-creation.ts` reçoivent `now` à leur construction et n'appellent jamais `Date.now()`. Une règle de lint le vérifie sur ces deux fichiers (`no-restricted-syntax` sur `Date.now`), avec son test dans `tests/unit/lint/`.
- **Lecture de la portée** : `getSimulationScope()` lit l'en-tête `x-vadrouille-simulation` (`headers()` de Next.js) seulement si `devPagesEnabled()` est vrai, et seulement si la valeur correspond à `[A-Za-z0-9_-]{1,64}`. Sinon, c'est la portée par défaut, sans erreur. En build de production sans `VADROUILLE_DEV_PAGES=1`, l'en-tête n'a donc aucun effet. Les actions serveur et la page de l'écran 5 l'appellent, puis passent la portée à `getCreationAdapter` et `getAuthAdapter`. Les tests unitaires passent une portée directement, sans en-tête.
- **Pourquoi un en-tête et pas un cookie posé par le test** : Playwright l'ajoute à toutes les requêtes du contexte par `extraHTTPHeaders`, actions serveur comprises. Le critère « aucun cookie » reste alors absolu, sans exception à expliquer.
- **Borne mémoire** : 1 000 portées explicites au plus. Au-delà, la plus anciennement utilisée est retirée. Une portée explicite n'existe qu'avec les pages de développement.
- **Contrôle `R-sim`** = `/dev/api/simulation`, gestionnaire de route `POST` dans `src/app/dev/api/simulation/route.ts` :
  - le corps est `{ action: "reset"; now: string }` (date ISO avec fuseau) ou `{ action: "advanceClock"; ms: number }` (entier ≥ 0), validé par un schéma strict ;
  - il exige une portée explicite, sinon il répond 400 : on ne remet jamais à zéro la portée par défaut ;
  - il répond 404 si `devPagesEnabled()` est faux, vérifié par `tests/unit/dev-creation.test.tsx` et par une ligne du job `docker` (`curl -X POST`, 404 attendu).
- **Génération déterministe** : l'état de `getGenerationStatus` est calculé depuis l'instant de `createTrip` sur l'horloge de la portée, selon une suite d'états à décalages fixes du jeu simulé.
- **Limite assumée** : sur un hébergement à plusieurs instances, l'état en mémoire n'est pas partagé (décision 0002 : aucun stockage propre à Vercel). Elle ne concerne que la phase 0. Dans la portée par défaut, tous les visiteurs d'une instance partagent codes et session (spécification, « Parcours »).
- PR : **F8b** (portée, horloge, `R-sim`, adaptateur `auth`) ; **F8c** (génération).

### 11. F8-TL-10 — Garde des environnements déployés
**Retenue.**

- **Adaptateur `auth` simulé** : `getAuthAdapter()` lève une erreur à l'appel, et non à l'import ni au build, si les trois conditions suivantes sont réunies :
  - l'adaptateur retenu est `mock` ;
  - `NODE_ENV` vaut `production` ;
  - `VADROUILLE_DEMO_AUTH` ne vaut pas exactement `1`.
  
  La garde échoue fermée : aucun repli vers un mode permissif. L'écran qui l'appelle affiche l'erreur générique. Test unitaire de la spécification : lève une erreur en production sans le drapeau, pas avec le drapeau, pas hors production.
- **Playwright** : `playwright.config.ts` pose `VADROUILLE_DEMO_AUTH: "1"` dans `webServer.env`, à côté de `VADROUILLE_DEV_PAGES`.
- **Configuration versionnée** : `tests/unit/dev-pages-env.test.ts` lit `Dockerfile`, `vercel.json` s'il existe et chaque fichier `.env*` suivi par Git (aujourd'hui `.env.example`). Il échoue si l'un d'eux pose `VADROUILLE_DEV_PAGES` ou `VADROUILLE_DEMO_AUTH`. Aucun des deux drapeaux n'a de préfixe `NEXT_PUBLIC_`.
- Le 404 des pages de développement dans l'image de production reste vérifié par le job `docker` (0013 § 1.6), avec les lignes de `R3-dev` et de `R-sim`.
- **Réservé à Samuel (Q101, F8-Q12)** : poser ou non `VADROUILLE_DEMO_AUTH=1` sur les environnements Vercel, et vérifier hors dépôt que `VADROUILLE_DEV_PAGES` n'y est posé nulle part. Ce sont des réglages de compte externe. Le studio ne les touche pas. Sans réponse, les écrans 4 et 5 ne fonctionnent qu'en local et en CI.
- PR : **F8b**.

## Décisions — suites de D1 (Q99, Q100, Q107)

### 12. Q99 (D1-Q2) — `presentationRoute` et emplacements
**Décision : confirmée telle que livrée par #59 et approuvée à sa revue.**

- `presentationRoute(tripId)` reste une fonction séparée, dans `src/features/presentation/routes.ts`, et n'est pas une méthode de `tripRoutes`. `tripRoutes` accepte la base `/dev/voyages`, qui n'a pas de présentation. Une méthode `presentation()` y produirait une adresse sans page.
- **Règle des adresses** (complète 0015 § 1 et 0016 § 1.2) : chaque adresse produit est construite par l'un de ces modules, et seulement par lui :
  - `tripRoutes` pour le Séjour, la Journée et leurs sous-écrans ;
  - `presentationRoute` pour les écrans 6 et 6b ;
  - `creationRoutes` (§ 1) pour la création et l'écran 5 ;
  - `suite.ts` pour la connexion.
  
  **Point de revue** : aucune concaténation d'adresse ailleurs.
- `isMockAdapter` reste dans `src/adapters/index.ts`, et sa normalisation (`adapterChoice`) sert aussi `getCreationAdapter` et `getAuthAdapter` (§ 3).
- `MOCK_DEMO_UNLOCKED_TRIP` reste défini dans `src/adapters/mock.ts` et réexporté par `src/adapters/index.ts`.
- **Amendement de 0013 § 1.5** : 0013 réservait `MOCK_DEMO_TRIP` aux pages de développement et aux tests. La page d'accueil (`src/app/page.tsx`, D1) l'utilise, avec `MOCK_DEMO_UNLOCKED_TRIP`, pour lire la destination et construire les liens de démonstration. Exception acceptée, **et seulement celle-ci** : la page d'accueil peut les utiliser, uniquement sous `isMockAdapter()` vrai. Aucune autre route produit ne les utilise. Les pages du voyage gardent `getRequestContext()` (0013 § 3.6).

### 13. Q100 (D1-Q3) — Positions du voyage débloqué
**Décision : oui, dans une tâche à part, T6.**

- **T6 — « Positions simulées du voyage débloqué »** (rôle frontend) :
  - `src/mocks/edimbourg-carte.ts` exporte une fonction qui dérive les positions pour un identifiant de voyage. C'est une dérivation, pas une copie, comme le voyage débloqué lui-même (0013 § 3.6) ;
  - `src/adapters/mock.ts` donne `maps` à l'entrée du voyage débloqué ;
  - les jours dont le contenu diffère du voyage d'origine (J6 `generating`, sans étape) n'ont pas de position. `getDayMap` y renvoie `null` et l'écran garde l'état de remplacement, au lieu de faire échouer `validateDayMap` ;
  - tests du mock : chaque jour positionné passe `validateDayMap`, J6 renvoie `null`, l'isolation par organisation tient.
- **Effet visible** : sur les déploiements qui ont une clé Google Maps, la carte du Séjour et du Jour 1 du voyage débloqué s'affiche. En CI, sans clé, les routes produit montrent l'état « configuration absente » avant comme après. T6 vérifie qu'aucune référence visuelle ne change. Si l'une change, elle suit la décision 0004.
- **Ordre** : après la fusion de D1 (#59). Jamais dans le même cycle qu'une tâche qui touche `src/adapters/mock.ts` ou `src/adapters/index.ts` (F8b, F8c, F7a). La place exacte relève du CEO, et la tâche est à ajouter à `docs/roadmap.md` par la PR « chore: status ». Ne bloque rien.

### 14. Q107 — Serveur Playwright en sessions parallèles
**Décision : un port par worktree et aucune réutilisation de serveur, en local comme en CI.**

- **Constat** (#59) : avec `reuseExistingServer: !process.env.CI`, un `pnpm verify` local peut viser le serveur d'un autre worktree sur le port 3100. Même dans un seul worktree, un serveur resté ouvert sert l'ancien build en mémoire après un nouveau `pnpm build`. Un test vert peut donc porter sur un autre code. Ce risque ne se règle pas par le seul port.
- **Règles** pour `playwright.config.ts` :
  - **`reuseExistingServer: false`** partout. Si le port est occupé, Playwright échoue avec une erreur claire au lieu de tester un autre build ;
  - **port** : `E2E_PORT` s'il est fourni. Sinon, 3100 en CI. Sinon, en local, un port déterminé par le chemin absolu du dépôt : un hachage stable (par exemple FNV-1a) ramené entre 3100 et 3899. Le calcul est une fonction pure de `scripts/` avec son test unitaire (stabilité, bornes) ;
  - le prix est le temps d'un démarrage du serveur par projet Playwright en local, déjà payé par la CI.
- **T7 — « Serveur Playwright isolé par worktree (Q107) »** (rôle frontend, outillage) : porte ce changement. C'est une petite tâche, jamais dans le même cycle que F8b, qui modifie aussi `playwright.config.ts` (§ 11). La place exacte relève du CEO, et la tâche est à ajouter à `docs/roadmap.md` par la PR « chore: status ».

## Conséquences
- **F8a** (écrans 1 et 2) :
  - module `creationRoutes` ;
  - groupe `(creation)` et `DraftProvider` ;
  - `src/contracts/creation.ts` (`TripDraft`, `BriefRequest`, `Brief`, `InferredBrief`) ;
  - `src/contracts/errors.ts` ;
  - constantes de bornes et `CATEGORIES` dans `src/contracts/values.ts` ;
  - `CategorySchema` étendu et libellés des deux tables ;
  - `CreationAdapter.structureBrief`, son action et son mock ;
  - `SegmentedControl` (`inferredValue`, et `value: T | null` s'il n'est pas encore livré) ;
  - `NumberField` ;
  - test de concordance des bornes.
- **F8b** (écrans 3 et 4) :
  - `LodgingRequest` et `LodgingSuggestion`, `suggestLodging` ;
  - `R3` et `R3-dev`, `AreaMap`, `MOCK_DEMO_DRAFT` ;
  - `src/contracts/auth.ts`, `AuthAdapter` et `mock-auth.ts` ;
  - actions de connexion et `suite.ts` ;
  - `simulation.ts` et `R-sim` ;
  - garde `VADROUILLE_DEMO_AUTH`, `dev-pages-env.test.ts` ;
  - lignes `docker` de `R3-dev` et de `R-sim` ;
  - règle de lint sur `Date.now`.
- **F8c** (lancement et écran 5) :
  - `TripRequest` et `GenerationStatus`, `createTrip` et `getGenerationStatus` ;
  - `R-lancer` et `launch-timing.ts` ;
  - interrogation (`GENERATION_POLL_MS`) et `preview_ready`.
- **Toutes les PR de F8** :
  - pas de Zod complet côté navigateur (0016 § 3.1) ;
  - test de budget vert dès que T4 l'a créé ;
  - aucun `console.*` dans `src/features/creation`, `src/features/compte` et les adaptateurs simulés de F8 (`no-console`, avec son test), en plus du test « aucune donnée journalisée » de la spécification.
- **T6** (nouvelle) : positions du voyage débloqué (§ 13). **T7** (nouvelle) : serveur Playwright isolé (§ 14). Le CEO les place.
- **Spécification F8** : aucun critère ne change. Sa prochaine mise à jour (Product Owner) pourra renvoyer à cette décision pour `validation_failed` (§ 4), `InferredBriefSchema` (§ 2.3), `LodgingRequest` (§ 2.4) et l'en-tête de portée (§ 10).
- **B0 (#27) et B9** : `LodgingRequest`, `InferredBrief`, les variantes de logement (§ 2.2), l'organisation tirée de la session et les deux exigences de B9 (§ 3). Le relecteur de #27 le signale si #27 est fusionnée après celle-ci.
- **Revue** des PR F8a, F8b, F8c, T6 et T7 : le Tech Lead vérifie leur conformité à cette décision. Un écart demande un amendement écrit ici, pas une exception silencieuse.

## Questions liées
**Nouvelle question** :
- **UX/UI** (2026-10-09) : avec le nouveau code `heritage` (« Patrimoine et monuments »), la phrase de F6 pour `museum` (« les musées et monuments ») recoupe celle de `heritage`. Faut-il la réduire à « les musées » ? Bloque : rien. C'est un texte provisoire, que F8a peut livrer tel quel.

**Questions déjà ouvertes, rappelées** :
- **Q101** (Samuel, comptes et environnements) : connexion simulée sur les prévisualisations Vercel, et contrôle de `VADROUILLE_DEV_PAGES` hors dépôt (§ 11).
- **Q79** (Tech Lead et Sécurité) : la partie technique est fixée pour la phase 0 au § 5, et l'avis de la Sécurité reste attendu.
- **Q86** (Tech Lead et Sécurité) : seuils réels de la connexion par code, pour B3. Non traitée ici.
- **Q25**, **F8-Q2**, **F8-Q3** et **F8-Q9** (Samuel) : aucune décision technique ici n'en préjuge.
