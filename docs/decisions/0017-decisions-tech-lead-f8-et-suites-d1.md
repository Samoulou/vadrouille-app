# 0017 — Décisions du Tech Lead pour F8 (création du voyage et connexion) et suites de D1

Statut : décision déléguée, définitive sans veto de Samuel sous 2 jours (avant le 2026-10-11) · Date : 2026-10-09 · Décideur : Tech Lead (architecture, bibliothèques, outillage, tests ; délégation « Qui décide quoi » de `docs/CONTEXT.md`) · Ticket #62 · Correction 1 : revues Tech Lead et Sécurité de #65

## Contexte
Six questions déléguées au Tech Lead sont ouvertes dans `QUESTIONS.md` :
- **Q80** (F8-Q7) : propositions F8-TL-1 à F8-TL-8 de `specs/F8-creation-compte.md` (fusionnée par #49), à trancher avant le code de F8 ;
- **Q85** (F8-Q10) : proposition F8-TL-9, portée et horloge des simulations côté serveur ;
- **Q102** (F8-Q13) : proposition F8-TL-10, garde des environnements déployés, et codes d'erreur provisoires `invalid_input` et `unauthenticated` ;
- **Q99** (D1-Q2), **Q100** (D1-Q3) et **Q107** : suites de D1 (#59, fusionnée).

Le code de F8 est découpé en trois PR successives (F8-PO-16, découpage proposé au CEO, F8-Q8) : **F8a** (écrans 1 et 2), **F8b** (écrans 3 et 4) et **F8c** (lancement et écran 5). Pour chaque décision, la PR qui l'applique est indiquée. Chaque PR ne crée que ce qu'elle utilise.

Cette décision s'appuie sur les décisions 0013, 0015 et 0016. Elle les amende là où c'est dit : § 3 (0016 § 3.1, emplacement des actions serveur), § 8 (0013 § 3.1), § 11 (`devPagesEnabled`) et § 12 (0013 § 1.5). Elle renvoie au handover back-end (#27, en revue) et à la décision UX/UI 0012 (#26, en revue) sans les présupposer acceptés. Les numéros 0006 à 0012 restent réservés par des PR en revue.

**Coordination avec la décision 0018** (UX/UI, #64, fusionnée) : 0018 § 14 à § 20 fixent les rendus et les textes de F8, dont la marque « déduit » de `SegmentedControl` et des champs numériques (§ 16) et la section « Démonstration » (Q106). La présente décision ne fixe que l'architecture, les contrats et les tests. Quand elle dit « rendu provisoire », c'est le rendu de 0018 qui s'applique. Elle répond aussi à U2-Q2 de 0018 (§ 2.4).

Hors de cette décision :
- **Samuel** :
  - connexion simulée sur un déploiement et contrôle des variables de l'hébergeur (Q101, F8-Q12 : comptes et environnements) ;
  - fournisseur d'envoi des codes (Q25) ;
  - mentions légales du compte (F8-Q2) ;
  - durée maximale d'un voyage (F8-Q3) ;
  - plafond du récit (F8-Q9) ;
- **UX/UI** : rendus et textes (0018), dont l'avertissement du mode démonstration demandé au § 3 ;
- **Product Owner** : comportement fonctionnel ;
- **CEO** : ordre des tâches, dont la place des tâches T6 et T7 créées ici (§ 13 et § 14) et leur inscription dans `docs/roadmap.md` ;
- **Q86** (seuils réels de la connexion par code, B3, avec la Sécurité) : non traitée ici, elle ne bloque que B3. Le § 4 pose seulement les exigences que B3 reprend contre l'énumération de comptes.

**Aucune nouvelle dépendance** : `crypto.randomUUID`, `crypto.createHmac` (Node), `zod` 4.6.5 et `zod/mini` sont déjà disponibles. `docs/decisions/0003-versions.md` ne change pas. Aucune de ces décisions n'engage d'argent ni de compte externe.

**Données personnelles hors UE** : non évalué ici. La phase 0 n'envoie rien hors du processus. Mais B9 (fournisseur de modèle), B3 (fournisseur d'envoi, Q25) et l'hébergeur traiteront l'email et le récit. Le sujet est à soumettre à Samuel avec B9 et B3.

## Décisions — F8 (Q80, F8-TL-1 à F8-TL-8)

### 1. F8-TL-1 — Route de l'écran 3
**Retenue : `R3` = `/voyages/nouveau/logement`.**

- Aucun voyage n'existe avant la connexion (C6 du handover back-end en revue). `/voyages/[id]/logement` reste réservé au changement de logement après création, hors F8.
- **Ville courante** : il n'y a pas de paramètre d'adresse. La ville affichée à l'écran 3 est l'état du brouillon (§ 5), et non `?ville=…`. Le seul paramètre d'adresse de F8 reste `suite` (spécification, « Règles Google et données personnelles »).
- **Module d'adresses unique**, sur le modèle de `tripRoutes` (0015 § 1) : `src/features/creation/routes.ts` exporte `creationRoutes`. Chaque sous-tâche y ajoute ce qu'elle utilise :
  - **F8a** : `nouveau()`, `brief()` et `lancer()`. F8a crée l'adresse de `R-lancer` parce qu'elle sert de valeur de `suite` au « Continuer » de l'écran 2 ;
  - **F8b** : `logement()` ;
  - **F8c** : `preparation(tripId)`, avec l'identifiant encodé.
- **`R-lancer` avant F8c** : la page `R-lancer` n'existe qu'en F8c et répond 404 d'ici là, comme les cibles de l'écran 5 avant F5 et F6 (spécification, « Prérequis vérifiables »). Les critères [b] de F8b qui mènent au lancement (réussite de la connexion, garde) vérifient l'adresse atteinte (`R-lancer`), et non le contenu de la page. F8c ajoute les critères du contenu.
- **`suite.ts`** : l'écriture et la relecture de `suite` (`connexionRoute(suite)` et `normaliserSuite`) vivent ensemble dans `src/features/compte/suite.ts`. Le module qui écrit une adresse est celui qui la relit (0016 § 7). Il est créé par **F8a**, qui écrit la première adresse `R4(R-lancer)`.
  - **Validation d'identifiant avant reconstruction** : l'identifiant extrait d'une forme `/voyages/{id}…` doit correspondre entièrement à `^[A-Za-z0-9_-]{1,64}$` avant toute reconstruction. Sinon, la fonction renvoie `/voyages`.
  - **Reconstruction** : `normaliserSuite` reconstruit la valeur par `tripRoutes("/voyages", id).sejour()`, `presentationRoute(id)` (§ 12) et `creationRoutes.preparation(id)`. Avant F8c, elle reconstruit `/voyages/{id}/preparation` par `tripRoutes(...).sejour()` suivi de `/preparation`. F8c remplace cette ligne par l'appel à `creationRoutes`.
  - **Test hostile exigé de F8a**, en plus des cas de la spécification : `//evil.example`, `/\evil`, `%2e%2e`, `/voyages/%2e%2e/connexion`, `/voyages/..%2Fconnexion`, ainsi que des identifiants avec un caractère Unicode ou une espace insécable.
- **Point de revue** : aucune adresse de F8 n'est concaténée ailleurs.
- **Identifiant réservé** : le segment statique `nouveau` l'emporte sur `[id]`, donc aucun voyage ne peut s'appeler `nouveau`. Les identifiants simulés ne le sont pas, et B9 génère des identifiants qui ne peuvent pas l'être. `/voyages/nouveau` en `suite` mène à `R1`, sans risque.
- **`R3-dev`** = `/dev/voyages/nouveau/logement` (§ 7). Le segment statique `nouveau` l'emporte aussi sur `src/app/dev/voyages/[id]`.

### 2. F8-TL-2 — Contrats de phase 0
**Retenue, précisée.** Elle crée `src/contracts/creation.ts`, réexporté par `src/contracts/index.ts`. Tous les objets sont stricts (`z.strictObject`). Les noms suivent le handover back-end (#27, en revue), pour que B9 les complète sans les renommer. Aucun texte d'interface dans les données.

#### 2.1 Valeurs : une seule source, sans Zod côté client
Tout ce que l'interface lit des contrats vit dans `src/contracts/values.ts`, sans import de `zod` (0016 § 3.1). Les schémas en dérivent : il n'y a donc pas de seconde copie.
- **Bornes**, en constantes nommées :
  - `DESTINATION_LENGTH = { min: 2, max: 80 }` et `STORY_LENGTH = { min: 20, max: 1000 }` ;
  - `MAX_CITIES = 4` et `MAX_COMMITMENTS = 10` ;
  - `ADULTS = { min: 1, max: 9 }` et `MEAL_BUDGET_CHF = { min: 5, max: 500 }` ;
  - `EMAIL_MAX_LENGTH = 254` et `OTP_LENGTH = 6`.
- **Énumérations** lues par l'interface :
  - `PACES`, `MOBILITY_MODES`, `BRIEF_FIELDS` ;
  - `COMMITMENT_KINDS`, `LODGING_KINDS` ;
  - `CATEGORIES` (§ 8) ;
  - `API_ERROR_CODES` (§ 4).
- **Forme d'email** : `isEmailShape(value)`, fonction pure. Elle vérifie un seul `@`, une partie locale non vide, un domaine qui contient un point qui n'est ni au début ni à la fin, aucun espace et 254 caractères au plus. C'est la règle de l'écran 4 de la spécification. Le schéma serveur l'applique par `.refine(isEmailShape)`, et non par `z.email()`. L'interface et le serveur acceptent donc exactement les mêmes adresses. La seule garantie d'existence d'une adresse est la réception du code.
- **Côté navigateur, `validation.ts` n'importe pas les schémas** : il lit `@/contracts/values` et écrit des fonctions pures. Sinon, le Zod complet entrerait dans les pages de création.
- **Test de concordance** :
  - pour chaque borne, les valeurs limites (min − 1, min, max, max + 1) donnent le même verdict par `validation.ts` et par le schéma ;
  - `isEmailShape` et `CodeRequestSchema` donnent le même verdict sur un échantillon d'adresses valides et invalides.
- Si T4 n'est pas fusionnée avant F8a, F8a crée `src/contracts/values.ts` avec ses seules valeurs, et T4 le complète. Les deux tâches ne sont jamais dans le même cycle (0016 § 3.2).

#### 2.2 `TripDraft` (écran 1)
- `TripDraft = { destination, start, end, lodging, otherCities, commitments }`. C'est la forme du handover, où les « autres villes » sont distinctes de la destination :
  - `destination` : texte libre de 2 à 80 caractères, espaces retirés aux extrémités ;
  - `start` et `end` : `IsoDate`, avec `end` postérieure à `start` ;
  - `lodging` : le logement de la destination ;
  - `otherCities` : 0 à 3 éléments `{ name, arrival: IsoDate, lodging }`, soit 4 villes au plus en comptant la destination ;
  - `commitments` : 0 à 10 éléments `{ kind: "flight" | "booking" | "ticket"; label; date: IsoDate; start: Time; end?: Time }`.
- **Logement** : union discriminée sur `kind` :
  - `{ kind: "known"; label }` (2 à 120 caractères) et `{ kind: "area"; label }` (2 à 80 caractères) ;
  - `{ kind: "none" }` (« Pas encore » sans suggestion retenue, ou « Continuer sans logement ») ;
  - `{ kind: "suggestedLodging"; lodgingId; placeId? }` et `{ kind: "suggestedArea"; areaId }`.
  
  Deux variantes au lieu d'un `lodgingId | areaId` : le type dit alors lequel des deux est présent. Une suggestion retenue ne porte que des identifiants, jamais le nom affiché. `label` est un texte saisi par la personne, jamais un nom Google (F8-PO-14).
- **Raffinements** :
  - les arrivées des autres villes sont strictement croissantes, strictement après `start` et strictement avant `end` ;
  - la date d'un engagement est comprise entre `start` et `end` du voyage ;
  - quand un engagement a une heure de fin, elle est strictement postérieure à son heure de début, le même jour (comparaison de deux `Time`) ;
  - les dates de départ de chaque ville sont **déduites** par une fonction pure (`cityRanges(draft)` dans `validation.ts`) et ne sont pas stockées : une seconde copie pourrait se contredire.
- **« Arrivée au plus tôt aujourd'hui »** dépend de l'heure et du fuseau : ce n'est pas un raffinement du schéma. L'interface le vérifie à l'heure de l'appareil. Côté serveur, `createTrip` le vérifie sur l'horloge de la portée (§ 10), avec une tolérance d'un jour pour les fuseaux.

#### 2.3 Brief
- **`BriefRequest` = `{ story; trip: { destination; start; end; otherCities: { name; arrival }[] } }`**, où `story` a de 20 à 1 000 caractères. C'est le **minimum** que la structuration reçoit. Les logements saisis (`label`), les identifiants de logement et de lieu (`lodgingId`, `areaId`, `placeId`) et les engagements n'y figurent pas : ils ne servent pas à déduire le brief, et un `placeId` ne doit pas entrer dans un prompt. Le handover dit « `TripDraft` et récit libre ». L'écart est à répercuter dans B0 et B9 (Conséquences).
- `Brief`, complet, est ce que `TripRequest` porte :
  - `travellers: { adults: 1..9; children: 0..9 }` ;
  - `pace: "relaxed" | "balanced" | "intense"` ;
  - `wishes: Category[]` (au moins 1, sans doublon) et `limits: Category[]` (sans doublon, sans élément commun avec `wishes`) ;
  - `mobility: ("walk" | "transit" | "car")[]` (sans doublon) ;
  - `mealBudgetPerPerson?` (entier de 5 à 500) ;
  - `inferredFields: BriefField[]`.
- `BriefField = "travellers" | "pace" | "wishes" | "mobility" | "limits" | "mealBudget"`. Ce sont les 6 « champs » de F8-PO-15, et `brief_completed` les compte sur cette énumération.
- **Sortie de `structureBrief` : `InferredBriefSchema`**. Un brief déduit peut être incomplet : la spécification veut « aucun choix par défaut si le rythme n'est pas déduit ». Tous les champs y sont donc facultatifs, avec un raffinement : `inferredFields` est exactement l'ensemble des champs présents.
  - La règle de F8-PO-17 est inchangée : une sortie non conforme devient `provider_error`, et rien n'est rendu.
  - La spécification nomme `BriefSchema` à cet endroit, y compris dans le critère du test unitaire (« un adaptateur `structureBrief` qui renvoie un brief non conforme… donne `provider_error` »). **Seul le nom du schéma change dans ce critère** : le test vérifie la non-conformité à `InferredBriefSchema`, et rien d'autre ne change. La prochaine mise à jour de la spécification (Product Owner) renverra à ce paragraphe.

#### 2.4 Logement suggéré, demande de voyage, génération
- **`LodgingSuggestion`** :
  - `area: { areaId; name; reason; center: { lat; lng }; radiusM }` : nom, raison, centre et rayon sont des données maison ;
  - `lodgings` : 0 à 3 éléments `{ lodgingId; placeId?; name; meta }`, où `name` et `meta` sont maison (entre crochets dans le jeu simulé).
  
  Demande : `LodgingRequest = { draft: TripDraft; city: number }`, où `city` vaut 0 pour la destination et i pour `otherCities[i − 1]`. C'est le « `TripRequest` sans logement » du handover. Il est nommé à part parce qu'il ne porte ni `requestId` ni brief.
- **`TripRequest`** = `{ requestId: uuid; draft: TripDraft; brief: Brief }`. Les choix de logement sont dans `draft`. L'organisation **n'y figure pas** : elle vient de la session (F8-PO-17).
- **Réponse de `createTrip`** : `{ tripId }`. Le handover annonce `TripSummary`, qui contient aussi l'identifiant. F8 n'utilise que l'identifiant : l'écran 5 relit le voyage par `TripAdapter`. B9 peut renvoyer un `TripSummary` à condition d'y garder le champ `tripId` ; sinon B0 aligne le nom. L'écart est à répercuter dans B0 et B9 (Conséquences).
- **`GenerationStatus`** : union discriminée sur `phase` :
  - `preparing`, `ready` et `incomplete` : `{ tripId; days: { index; state: "preparing" | "ready"; readyStops }[]; expected; ready }`, avec un raffinement pour `incomplete` : `ready` < `expected` ;
  - `failed` : les mêmes champs, plus `reason` (`provider_error`, `cost_cap_reached` ou `quota_reached`, § 4) et `retryable: boolean`.
  
  Aucun nom de lieu ni identifiant d'étape n'y figure : l'écran 5 ne montre que des anneaux (F8-PO-12).
  - **Réponse à U2-Q2 (0018)** : oui. `days[].readyStops` donne le nombre de propositions prêtes par jour, et les anneaux d'un jour peuvent apparaître un à un. Le jeu simulé de F8c fait progresser `readyStops` d'une unité à la fois.
- `CodeRequest = { email }` (forme par `isEmailShape`, § 2.1) et `CodeVerification = { email; code }`, où `code` est fait d'exactement 6 chiffres ASCII (`/^[0-9]{6}$/`). Ils sont dans `src/contracts/auth.ts`, avec `Session = { sessionId; userId; organizationId }`.
- PR :
  - **F8a** : `TripDraft`, `BriefRequest`, `Brief`, `InferredBrief`, erreurs du § 4 ;
  - **F8b** : `LodgingRequest`, `LodgingSuggestion`, `auth.ts` ;
  - **F8c** : `TripRequest`, `GenerationStatus`.

### 3. F8-TL-3 — Adaptateurs et actions serveur (amende 0016 § 3.1)
**Retenue, précisée. Les actions serveur vivent dans `src/server/actions/`, pas dans `src/features/`.**

#### 3.1 Interfaces et choix de l'adaptateur
- **Interfaces** dans `src/adapters/types.ts` :
  - `CreationAdapter` : `structureBrief(request)`, `suggestLodging(request)`, `createTrip(ctx, request)` et `getGenerationStatus(ctx, tripId)` ;
  - `AuthAdapter` : `requestCode(request)`, `verifyCode(request)`, `getSession()`, `signOut()` et `config` en lecture (`codeTtlMs`, `maxAttempts`, `maxCodeRequests`, `codeRequestWindowMs`).
  
  Chaque méthode renvoie une `Promise<Result<T>>` (§ 4), sauf `getSession` (`Promise<Session | null>`) et `signOut` (`Promise<void>`).
- **Contexte d'organisation** :
  - `structureBrief`, `suggestLodging`, `requestCode` et `verifyCode` sont anonymes : ils ne prennent pas de contexte (handover, lignes des écrans 2 à 4) ;
  - pour `createTrip`, `ctx` est construit par l'action depuis la session, `{ organizationId: session.organizationId }`, avec la session lue par `getSession()`. Il n'est jamais reçu du navigateur ;
  - pour `getGenerationStatus`, `ctx` vient en phase 0 de `getRequestContext()`, comme la page de l'écran 5 (0013 § 3.6). B3 remplace les deux par la session.
- **Choix** : `getCreationAdapter(options?)` lit `DATA_ADAPTER` et `getAuthAdapter(options?)` lit `AUTH_ADAPTER`. Ce sont des variables serveur, sans préfixe `NEXT_PUBLIC_`. Les deux fonctions reprennent la normalisation `adapterChoice` de D1 (absente ou vide = `mock`) et lèvent une erreur pour une valeur inconnue, comme `getTripAdapter`. `options.scope` est la portée de simulation (§ 10), ignorée par les adaptateurs réels.

#### 3.2 Implémentations simulées
- `src/adapters/mock-creation.ts` et `src/adapters/mock-auth.ts`, construites par des fabriques (`createMockAuthAdapter({ now, store, config })`), sans réseau ni écriture disque.
- Le jeu simulé est dans `src/mocks/creation-edimbourg.ts`. Le code valable simulé est une constante de `src/mocks`, importée **seulement côté serveur** (adaptateurs) et par les tests. C'est la règle de lint de F1 sur `@/mocks`. Il n'atteint donc jamais le navigateur.
- Chaque sortie simulée est validée par son schéma dans l'adaptateur, comme `mockTripAdapter`.

#### 3.3 Actions serveur : emplacement (amende 0016 § 3.1)
- **Emplacement** : `src/server/actions/creation.ts` (`structureBrief`, `suggestLodging`, `createTrip`, `getGenerationStatus`) et `src/server/actions/compte.ts` (`requestCode`, `verifyCode`), chacun commençant par `"use server"`. Le parseur commun, `parseInput(schema, input)`, est dans `src/server/parse-input.ts`. C'est le dossier `src/server` du handover back-end (#27), où B6 et suivants placent leurs actions.
- **Raison** : la règle 4 de 0016 § 3.1 interdit `zod` et les imports de valeur de `@/contracts` dans `src/features/**`. Les actions en ont besoin pour revalider l'entrée. Une exemption par fichier dans `src/features` aurait mêlé, dans un même dossier, du code client et du code qui ne doit jamais l'être. Avec `src/server`, la frontière se voit au chemin.
- **Amendement de 0016 § 3.1, règle 4** :
  - la liste des dossiers de la règle ne change pas, et `src/server/**` n'y est pas soumis ;
  - une règle nouvelle s'ajoute : dans `src/components/**`, `src/features/**`, `src/app/**` et `src/lib/**`, un import de `@/server/*` n'est permis que vers `@/server/actions/*`. Ces modules commencent par `"use server"` : Next.js n'en envoie au navigateur que des références d'appel, pas le code ni Zod. Tout autre module de `src/server` (dont `parse-input.ts`) est refusé hors de `src/server` ;
  - `tests/unit/lint/` le teste : un import de `@/server/actions/creation` depuis `src/features/creation` passe ; un import de `@/server/parse-input` ou de `zod` depuis ce dossier est refusé ; les interdictions précédentes tiennent toujours (point d'attention de 0015 § 1 sur la configuration plate) ;
  - un test vérifie que chaque fichier de `src/server/actions/` commence par la directive `"use server"`.
- La spécification F8 propose `src/features/creation/actions.ts` et `src/features/compte/actions.ts`. Ce paragraphe remplace ces deux emplacements. Les tests des actions suivent dans `src/server/actions/`.

#### 3.4 Actions serveur : ordre des contrôles
- **Action authentifiée** (`createTrip`, puis `getGenerationStatus` en B3) :
  1. session (`getSession()`), qui renvoie `unauthenticated` sans session ;
  2. `parseInput` de l'entrée, reçue en `unknown` ;
  3. appel de l'adaptateur.
  
  Vérifier la session d'abord évite que `validation_failed` avec `field` serve d'oracle du schéma à un appelant non connecté.
- **Action anonyme** (`structureBrief`, `suggestLodging`, `requestCode`, `verifyCode`) :
  1. `parseInput` ;
  2. appel de l'adaptateur ;
  3. pour `structureBrief` et `suggestLodging`, validation de la sortie.
- `parseInput` traduit l'échec en `validation_failed` (§ 4), pour que la règle ne soit pas recopiée dans six actions.

#### 3.5 Session simulée partagée : mode démonstration
- En phase 0, toute session simulée (adresse connue ou inconnue) porte l'organisation simulée `MOCK_ORGANIZATION_ID`. Ainsi, l'écran 5, qui lit le voyage par `getRequestContext()`, trouve le voyage créé. « Compte existant » et « compte nouveau » ne diffèrent que par `userId`, jamais dans la réponse (F8-PO-9).
- Aucun cookie n'est posé (F8-TL-3 de la spécification) : la session vit dans la portée de simulation (§ 10).
- **Conséquence assumée** : dans la portée par défaut, une connexion réussie connecte tous les visiteurs de la même instance du serveur.
- **Où cela fonctionne** : la connexion simulée fonctionne en local et en CI. Son ouverture sur un déploiement est décidée par Samuel (Q101). Si elle est ouverte, c'est un **mode démonstration sans aucune donnée réelle** :
  - l'écran 4 affiche un avertissement visible tant que l'adaptateur `auth` est `mock`. Le texte relève de UX/UI. Il dit en substance que la connexion est simulée, partagée et qu'il ne faut pas saisir d'adresse réelle ;
  - l'avertissement est piloté par une valeur serveur (`authMode: "simulated"`), transmise à la page. Il n'est pas déduit côté client.
- **Minimisation du magasin de portée** :
  - l'adresse n'y est jamais gardée en clair. La clé des codes et des compteurs est un HMAC-SHA-256 de l'adresse normalisée, avec une clé aléatoire tirée au démarrage du processus (`crypto.randomBytes`, jamais écrite). Cela suffit à appliquer les limites par adresse ;
  - le magasin ne garde ni le récit, ni le brouillon, ni le brief. `createTrip` simulé ne garde que (organisation, `requestId`) → `tripId` et l'instant de lancement ;
  - le code simulé n'y est pas recopié : il est comparé à la constante.
- **Principe « l'agent cherche, l'ancrage vérifie, le moteur planifie »** : en phase 0, rien n'est cherché ni planifié. Les réponses sont précalculées.

#### 3.6 Exigences reprises par B9
- **`structureBrief`** est la seule étape IA des écrans 1 à 4 :
  - le modèle ne reçoit que `BriefRequest` (§ 2.3) ;
  - le récit y est transmis comme donnée, jamais comme instruction ;
  - la sortie n'est validée que par schéma (`InferredBriefSchema`) et n'est **jamais interprétée comme une action** : pas d'outil, pas de navigation, pas d'écriture déclenchée par son contenu.
- **`suggestLodging`** est calculé par le moteur, avec la distance comme coût (cadrage § 3.7), à partir de lieux ancrés, et non choisi par le modèle. Ses `name` et `meta` sont des données **maison**. Si une source Google les fournissait, ce serait une donnée Google :
  - seul le `placeId` est stocké ;
  - aucun nom ni attribut Google ne va dans un prompt ;
  - l'affichage suit les règles Google (carte Google ou mention « Données de lieux : Google »).
- **Contrôle d'appartenance (IDOR)**, repris par B3 et B9 :
  - `getGenerationStatus` et toute lecture par `tripId` vérifient que le voyage appartient à l'organisation de la session, et renvoient `not_found` sinon (handover : jamais `forbidden`) ;
  - l'idempotence de `createTrip` reste indexée par (organisation, `requestId`).
  
  En phase 0, l'organisation unique simulée rend ce contrôle sans objet. Il n'est pas simulé.

#### 3.7 `createTrip` simulé
- **Idempotence** : la clé est le couple (organisation, `requestId`).
- Pour l'organisation simulée, il renvoie `mock_trip_edimbourg` (F8-PO-13). Pour une autre organisation (tests unitaires seulement), il renvoie un identifiant propre à cette organisation et à la portée, jamais `mock_trip_edimbourg`.
- **`active_preview_exists`** : seulement si une génération de la même organisation n'est pas dans un état final et que le `requestId` est nouveau. Une fois la génération finie, un nouveau `requestId` relance la suite d'états. Sans cette limite, la portée par défaut serait bloquée après la première création.
- **Voyage jamais créé dans la portée** (ouverture directe de l'écran 5) : `getGenerationStatus` renvoie l'état final `ready`, puisque le voyage simulé est déjà complet.

- PR :
  - **F8a** : `src/server/actions/creation.ts` avec `structureBrief`, `parse-input.ts`, règle de lint et ses tests ;
  - **F8b** : `suggestLodging`, `AuthAdapter`, `src/server/actions/compte.ts`, minimisation du magasin, avertissement de l'écran 4 ;
  - **F8c** : `createTrip`, `getGenerationStatus`.

### 4. Q102, partie codes — Contrat d'erreur des actions
**Décision : le format d'erreur commun du handover back-end (#27, « Format d'erreur commun »), codes en `snake_case`. `invalid_input` est renommé `validation_failed` ; `unauthenticated` est confirmé.**

- **Codes** : `API_ERROR_CODES` (dans `values.ts`, § 2.1) est l'énumération fermée des codes que F8 utilise : `validation_failed`, `unauthenticated`, `rate_limited`, `cost_cap_reached`, `quota_reached`, `provider_error`, `no_option`, `invalid_code`, `code_expired`, `too_many_attempts` et `active_preview_exists`. B6 et suivants l'étendent sans renommer.
- **Types** : `src/contracts/errors.ts` en dérive `ApiErrorCodeSchema`, `ApiError = { code; field?; retryable? }` et `Result<T> = { ok: true; value: T } | { ok: false; error: ApiError }`.
- **Renommage** : `validation_failed` est le nom du handover, qui l'associe déjà à « erreur de champ du formulaire » avec `field`. Garder `invalid_input` créerait deux noms pour la même erreur entre F8 et B9. Comme le prévoit la spécification (« Codes d'erreur »), le renommage ne change ni les textes, ni les comportements, ni les critères. Les tests importent les codes depuis `src/contracts`.
- **`field`** : le chemin du premier champ refusé, en pointé (`otherCities.2.arrival`).
  - Il est construit **seulement à partir des clés connues du schéma** et des indices de tableau. Pour une clé inconnue (`unrecognized_keys` d'un objet strict), `field` est le chemin de l'objet parent, ou il est absent à la racine. Il ne contient jamais la clé envoyée par l'appelant.
  - Il ne contient **jamais** la valeur reçue, ni le message de Zod, qui peut décrire la valeur.
  - Un journal serveur ne porte que `code` et `field` (spécification, « Données personnelles »).
  - Un test envoie une clé inconnue au nom hostile (`"<script>"`, une adresse email) et vérifie qu'elle n'apparaît ni dans `field` ni dans la réponse.
- **`unauthenticated`** : l'interface y répond par `R4(R-lancer)`, comme le handover le prévoit.
- **Énumération de comptes, exigence pour B3** : pour une adresse inconnue et une adresse connue, `requestCode` et `verifyCode` donnent la même réponse, à l'octet près hors identifiant de session. Ils prennent aussi le même temps (même chemin de calcul, sans court-circuit pour une adresse inconnue) et tiennent les mêmes compteurs. Les valeurs simulées (§ 2 de la spécification, écran 4) ne sont pas reprises telles quelles en production : les seuils réels relèvent de Q86.
- **Lien avec 0016 § 4.4** : `RevisionError` de F7 garde ses codes d'écran en `camelCase`. L'adaptateur `api` de B11 convertit les codes du serveur dans une seule table, comme prévu. F8 n'a pas de type d'écran intermédiaire : ses actions sont déjà nos actions serveur et renvoient `ApiError` tel quel.
- PR : **F8a** (`errors.ts`, `validation_failed`, `provider_error`, `rate_limited`, `cost_cap_reached`, test de `field`), complété par F8b et F8c pour leurs codes.

### 5. F8-TL-5 — Brouillon et lancement (et Q79)
**Retenue.**

- **Brouillon en mémoire de l'onglet** : `DraftProvider`, fournisseur React client, autour d'un réducteur pur (`draft.ts`) testé sans React. Il porte :
  - le `TripDraft` en cours de saisie ;
  - l'état « Récit » ou « Vérification », le récit, le brief et sa provenance (déduit ou modifié) ;
  - la ville courante de l'écran 3 et le dernier écran 3 affiché (pour « Retour » depuis l'écran 4) ;
  - le `requestId`.
- **Montage** : groupe de routes `src/app/(creation)/layout.tsx`, qui contient `voyages/nouveau/**` (dont `lancer`) et `connexion`.
  - Pas dans `src/app/layout.tsx` : le fournisseur et son code entreraient dans toutes les pages, dont la Journée et son budget de 200 Ko (0016 § 3).
  - Jamais dans un layout limité à `/voyages/nouveau`.
  - L'écran 5 reste sous `src/app/voyages/[id]/preparation`, hors du groupe : le brouillon est démonté quand le voyage existe, ce qui suit la spécification (« L'écran 5 n'a pas de retour vers la création »).
- **`requestId`** : `crypto.randomUUID()`, créé au premier lancement et gardé dans le brouillon. Un second lancement du même brouillon le réutilise.
- **`R-lancer`** = `/voyages/nouveau/lancer`. C'est un composant client sans écran, livré par **F8c** (§ 1). Il garde l'accès (brouillon, session), appelle `createTrip` une fois, puis `router.replace(creationRoutes.preparation(id))`. Le double effet du mode strict de React en développement est couvert par l'idempotence.
- **Durée de `preview_ready`** : l'instant de l'appel à `createTrip` doit survivre à la navigation vers l'écran 5, hors du groupe.
  - Il est gardé dans un module client minuscule, `src/features/creation/launch-timing.ts` : `markLaunch(tripId, t)` et `takeLaunch(tripId)`, avec une horloge injectable, `performance.now` par défaut.
  - C'est une variable de module, en mémoire de l'onglet, perdue au rechargement : c'est exactement la règle de F8-PO-15 (propriété absente après un rechargement).
  - Aucun stockage navigateur n'est utilisé.
- **Q79** : la mémoire de l'onglet est retenue pour la phase 0 (F8-PO-1), avec l'avis favorable de la Sécurité (revue de #65). Le stockage navigateur de C6 est écarté : il garderait sur l'appareil un récit personnel. Revenir dessus demande un amendement écrit de cette décision et un nouvel avis de la Sécurité.
- PR : **F8a** (fournisseur, réducteur, groupe `(creation)`) ; **F8c** (`R-lancer`, `launch-timing.ts`).

### 6. F8-TL-4 — Marque « déduit » hors `Chip`
**Retenue, précisée.** Le rendu est celui de 0018 § 16.

- `SegmentedControl` gagne `inferredValue?: T`. L'option de cette valeur porte la marque tant qu'elle est choisie et que la personne n'a rien touché. Le nom accessible du groupe reçoit la mention « déduit de ton récit » par `aria-describedby`. Le pointillé n'est jamais la seule information. Sans la prop, rien ne change : les tests de F2 et de F7 restent inchangés.
- **`value: T | null`** : il est nécessaire à F8a (pas de rythme par défaut). La décision 0016 § 8 l'a déjà retenu pour F7a. La première des deux PR qui le livre l'ajoute, la seconde le réutilise. F7a et F8a ne sont jamais dans le même cycle, puisque les deux touchent `SegmentedControl.tsx`.
- **Champ numérique** : composant `NumberField` de `src/features/creation/`, pas de `src/components/ligne`, puisqu'il n'est pas dans le design system. Il a une prop `inferred?: boolean`. Il sert aux voyageurs (avec les deux `IconButton` de 44 px) et au budget par repas. `Counter` de F3 est un compteur d'actions requises, sans rapport : il n'est pas réutilisé.
- PR : **F8a**.

### 7. F8-TL-7 — Mini-carte de zone
**Retenue, précisée.** La mise en page est celle de 0018 § 17.

- `AreaMap` dans `src/components/carte/`, composant à part et non une variante de `DayMap`.
  - Props : `center` et `radiusM`, avec le nom du quartier pour le nom accessible.
  - Il réutilise `CarteProvider`, la configuration, le chargeur et l'état « configuration absente » (`MapFallback`) de F4.
  - Aucun marqueur de logement en phase 0.
- **Rendu** : la zone est un cercle, et la caméra est ajustée à ses bornes. Chaque rendu dessine le cercle dans sa propre projection, comme `offsetCamera` (0016 § 2) :
  - Google : un cercle de l'API chargée ;
  - carte simulée : un cercle SVG.
  
  L'extension minimale de l'interface `SimulatedRenderer` est proposée par F8b et vérifiée à la revue.
- **Carte simulée** seulement sur `R3-dev`, par un composant client propre à `/dev` qui enveloppe l'écran dans `CarteProvider`, comme `SimulatedCarte` (0015 § 1). `R3-dev` monte son propre `DraftProvider` avec un brouillon de démonstration exporté par `@/adapters` (`MOCK_DEMO_DRAFT`, réservé aux pages de développement et aux tests, comme `MOCK_DEMO_TRIP`). Il ne lit jamais `src/mocks`.
- La mini-carte n'est jamais la seule source d'information. Le centre et le rayon sont des données maison du quartier, jamais une géométrie Google.
- PR : **F8b**.

### 8. F8-TL-8 — Codes des envies (amende 0013 § 3.1)
**Retenue : `heritage`, `market`, `nightlife` s'ajoutent aux cinq codes de F6.**

- `CATEGORIES = ["museum", "walk", "nature", "tasting", "restaurant", "heritage", "market", "nightlife"]`, dans `src/contracts/values.ts` (0016 § 3.1), dont dérive `CategorySchema`. C'est l'alignement que prévoyait 0013 § 3.1 « quand F8 et B9 le fixeront ». B9 le reprend sans renommer.
- **Libellés** : deux formes existent, et ce n'est pas un doublon :
  - la phrase de la question de préférence de F6 (`presentation.categories`, « les musées et monuments ») ;
  - l'étiquette d'une `Chip` de F8 (`creation.envies`, retenues par 0018 § 16).
  
  Les deux tables sont typées `Record<Category, string>`, et un test vérifie qu'elles couvrent tout `CATEGORIES`. Ajouter un code oblige donc à écrire ses deux libellés.
- **Conséquence pour F6** : une proposition peut désormais être classée `heritage`, `market` ou `nightlife`. F8a ajoute donc les trois phrases de `presentation.categories`, provisoires jusqu'à la réponse de UX/UI (Questions liées). Les événements `deck_decision` et `preference_prompt_answered` suivent `CategorySchema` sans changement de code.
- PR : **F8a**.

### 9. F8-TL-6 — Suivi de la génération
**Retenue, précisée.**

- L'écran 5 rend l'état initial côté serveur (`getGenerationStatus` dans la page). Ensuite, le client interroge l'action toutes les `GENERATION_POLL_MS = 1000` ms (constante nommée de `src/features/creation/`). L'interrogation est une chaîne de `setTimeout` relancée à la réponse, et non un `setInterval` : deux appels ne se chevauchent jamais.
- Elle s'arrête dans un état final (`ready`, `incomplete`, `failed`) et au démontage. « Réessayer » la relance.
- Le flux `/api/v1/trips/[id]/generation` (handover) la remplacera par un crochet de même forme (`useGenerationStatus(tripId, initial)`), sans changer l'écran.
- Tests unitaires avec `vi.useFakeTimers` ; e2e avec `page.clock.runFor(1000)` (spécification, « Temps et état simulés »).
- PR : **F8c**.

## Décisions — Q85 (F8-TL-9) et Q102 (F8-TL-10)

### 10. F8-TL-9 — Portée et horloge des simulations
**Retenue : en-tête de requête vers l'origine de l'application seulement, pas de cookie.** Elle sert les tests en local et en CI. Son usage sur un déploiement suit la garde du § 11 et la décision de Samuel (Q101).

#### 10.1 Module serveur
- `src/adapters/simulation.ts` :
  - `Clock = { now(): number }` ;
  - la portée par défaut suit l'horloge réelle ;
  - une portée explicite a une horloge manuelle, fixée par `reset(now)` et avancée par `advanceClock(ms)`. Entre deux avances, le temps du serveur ne bouge pas, ce qui rend les tests déterministes.
- **État de chaque portée** (codes, compteurs, session, voyages créés, `requestId`, instant de lancement des générations, minimisés selon le § 3.5) : rangé dans une `Map` du processus, sur `globalThis` pour survivre au rechargement à chaud du développement.
- **Horloge injectée** : `mock-auth.ts` et `mock-creation.ts` reçoivent `now` à leur construction et n'appellent jamais `Date.now()`. Une règle de lint le vérifie sur ces deux fichiers (`no-restricted-syntax` sur `Date.now`), avec son test dans `tests/unit/lint/`.

#### 10.2 Lecture de la portée
- `getSimulationScope()` lit l'en-tête `x-vadrouille-simulation` (`headers()` de Next.js) seulement si `devPagesEnabled()` est vrai (§ 11, garde fermée par défaut).
- La valeur doit correspondre à `^[A-Za-z0-9_-]{1,64}$`, et n'être ni le nom réservé de la portée par défaut (`default`), ni `__proto__`, `constructor` ou `prototype`. Sinon, c'est la portée par défaut, sans erreur.
- En build de production sans pages de développement, l'en-tête n'a donc aucun effet.
- Les actions serveur et la page de l'écran 5 l'appellent, puis passent la portée à `getCreationAdapter` et `getAuthAdapter`. Les tests unitaires passent une portée directement, sans en-tête.

#### 10.3 Transmission par les tests
- La portée est posée par une interception limitée à l'origine de l'application : `context.route(`${baseURL}/**`, …)` qui ajoute l'en-tête par `route.continue({ headers })`. Ce n'est pas `extraHTTPHeaders`, qui l'enverrait aussi aux origines tierces.
- Les domaines tiers restent bloqués en test, et les actions serveur, qui sont des requêtes vers l'origine, reçoivent l'en-tête.
- **Pourquoi pas un cookie posé par le test** : le critère « aucun cookie » reste ainsi absolu, sans exception à expliquer.

#### 10.4 Bornes
- 1 000 portées explicites au plus. Au-delà, la plus anciennement utilisée est retirée.
- Par portée : 50 adresses (clés HMAC) et 20 voyages créés au plus. Au-delà, l'entrée la plus ancienne est retirée.
- Une portée explicite n'existe qu'avec les pages de développement.

#### 10.5 Contrôle `R-sim`
`R-sim` = `/dev/api/simulation`, gestionnaire de route `POST` dans `src/app/dev/api/simulation/route.ts`. Il répond :
- 404 si `devPagesEnabled()` est faux. C'est vérifié par `tests/unit/dev-creation.test.tsx` et par une ligne du job `docker` (`curl -X POST`, 404 attendu) ;
- 415 sans `Content-Type: application/json` ;
- 413 au-delà de 1 024 octets de corps ;
- 400 pour un corps hors du schéma strict, qui accepte `{ action: "reset"; now: string }` (date ISO avec fuseau, entre 2020 et 2100) ou `{ action: "advanceClock"; ms: number }` (entier de 0 à 604 800 000, soit 7 jours, par appel) ;
- 400 sans portée explicite valide : on ne remet jamais à zéro la portée par défaut.

#### 10.6 Génération et limites
- **Génération déterministe** : l'état de `getGenerationStatus` est calculé depuis l'instant de `createTrip` sur l'horloge de la portée, selon une suite d'états à décalages fixes du jeu simulé.
- **Limite assumée** : sur un hébergement à plusieurs instances, l'état en mémoire n'est pas partagé (décision 0002 : aucun stockage propre à Vercel). Elle ne concerne que la phase 0.

- PR : **F8b** (portée, horloge, `R-sim`, adaptateur `auth`) ; **F8c** (génération).

### 11. F8-TL-10 — Garde des environnements déployés
**Retenue, renforcée. Les deux gardes échouent fermées par défaut.**

#### 11.1 Pages de développement et portée (amende `devPagesEnabled` de `src/dev/flags.ts`, utilisé par 0013 § 1.6 et 0015 § 1)
- `devPagesEnabled(env)` devient vrai **seulement** si l'une de ces conditions est remplie :
  - `NODE_ENV` vaut `development` ou `test` ;
  - `VADROUILLE_DEV_PAGES` vaut exactement `1`.
- Elle reste fausse dans tous les cas si `VERCEL_ENV` vaut `production`.
- Aujourd'hui, toute valeur autre que `production` (absente, `staging`, faute de frappe) ouvre `/dev`, la portée et `R-sim`. Ce n'est plus le cas.
- `tests/unit/dev-flags.test.ts` couvre :
  - `NODE_ENV` absent, vide ou inconnu : faux ;
  - `development` et `test` : vrai ;
  - drapeau à `1` : vrai ;
  - drapeau à `true` ou à ` 1` : faux ;
  - `VERCEL_ENV=production` avec le drapeau : faux.

#### 11.2 Adaptateur `auth` simulé
- `getAuthAdapter()` lève une erreur à l'appel, et non à l'import ni au build, si l'adaptateur retenu est `mock` et que l'une de ces conditions est remplie :
  - `NODE_ENV` n'est ni `development` ni `test`, et `VADROUILLE_DEMO_AUTH` ne vaut pas exactement `1` ;
  - **`VERCEL_ENV` vaut `production`**, même avec le drapeau. Les prévisualisations et la production Vercel ont toutes deux `NODE_ENV=production` : un drapeau mal posé ne suffit donc pas à ouvrir la fausse connexion sur le déploiement de production.
- La garde ne se replie jamais vers un mode permissif. L'écran qui l'appelle affiche l'erreur générique.
- Test unitaire :
  - lève une erreur en production sans le drapeau, et avec `VERCEL_ENV=production` même avec le drapeau ;
  - ne lève pas avec le drapeau hors `VERCEL_ENV=production` ;
  - ne lève pas en `development` ou `test`.
- Si Samuel décide d'ouvrir la démonstration sur le déploiement de `main` (environnement que Vercel nomme « Production », D1-Q1), cette garde se lève par un amendement écrit de cette décision, après sa décision. Elle ne se lève pas par une variable.

#### 11.3 Playwright et configuration versionnée
- **Playwright** : `playwright.config.ts` pose `VADROUILLE_DEMO_AUTH: "1"` dans `webServer.env`, à côté de `VADROUILLE_DEV_PAGES`.
- **Configuration versionnée** : `tests/unit/dev-pages-env.test.ts` lit `Dockerfile`, `vercel.json` s'il existe et chaque fichier `.env*` suivi par Git (aujourd'hui `.env.example`). Il échoue si l'un d'eux pose `VADROUILLE_DEV_PAGES` ou `VADROUILLE_DEMO_AUTH`.
  - **Plus strict que la spécification**, qui ne visait que `VADROUILLE_DEV_PAGES` : poser la connexion simulée dans un fichier versionné reviendrait à l'ouvrir sur tout déploiement de l'image, ce qui relève de Samuel (Q101).
  - Aucun des deux drapeaux n'a de préfixe `NEXT_PUBLIC_`.
- Le 404 des pages de développement dans l'image de production reste vérifié par le job `docker` (0013 § 1.6), avec les lignes de `R3-dev` et de `R-sim`.

#### 11.4 Réservé à Samuel
- **Q101, F8-Q12** : poser ou non `VADROUILLE_DEMO_AUTH=1` sur un environnement Vercel, et vérifier hors dépôt que `VADROUILLE_DEV_PAGES` n'y est posé nulle part. Ce sont des réglages de compte externe, que le studio ne touche pas.
- La connexion simulée fonctionne en local et en CI. Son ouverture sur un déploiement est décidée par Samuel.
- **Limite à connaître pour cette décision** : une fois ouverte, la session simulée est partagée par tous les visiteurs d'une même instance (§ 3.5). Une connexion vaut pour tous. Le code est connu de tous et ne protège rien.

- PR : **F8b**.

## Décisions — suites de D1 (Q99, Q100, Q107)

### 12. Q99 (D1-Q2) — `presentationRoute` et emplacements
**Décision : confirmée telle que fusionnée par #59.**

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
- **Ordre** : D1 est fusionnée, T6 peut donc être prise. Jamais dans le même cycle qu'une tâche qui touche `src/adapters/mock.ts` ou `src/adapters/index.ts` (F8b, F8c, F7a). Le CEO inscrit T6 dans `docs/roadmap.md` et fixe sa place. Ne bloque rien.

### 14. Q107 — Serveur Playwright en sessions parallèles
**Décision : un port par worktree et aucune réutilisation de serveur, en local comme en CI.**

- **Constat** (#59) : avec `reuseExistingServer: !process.env.CI`, un `pnpm verify` local peut viser le serveur d'un autre worktree sur le port 3100. Même dans un seul worktree, un serveur resté ouvert sert l'ancien build en mémoire après un nouveau `pnpm build`. Un test vert peut donc porter sur un autre code. Changer de port ne suffit pas à régler ce risque.
- **Règles** pour `playwright.config.ts` :
  - **`reuseExistingServer: false`** partout. Si le port est occupé, Playwright échoue avec une erreur claire au lieu de tester un autre build ;
  - **port** : `E2E_PORT` s'il est fourni. Sinon, 3100 en CI. Sinon, en local, un port déterminé par le chemin absolu du dépôt : un hachage stable (par exemple FNV-1a) ramené entre 3100 et 3899. Le calcul est une fonction pure de `scripts/` avec son test unitaire (stabilité, bornes).
- **Coût** : Playwright démarre un seul `webServer` par exécution. `pnpm verify` lance trois exécutions (a11y, e2e, visual), donc trois démarrages du serveur en local. C'est déjà le cas en CI, qui ne réutilise pas de serveur.
- **T7 — « Serveur Playwright isolé par worktree (Q107) »** (rôle frontend, outillage) : porte ce changement. C'est une petite tâche, jamais dans le même cycle que F8b, qui modifie aussi `playwright.config.ts` (§ 11). Le CEO inscrit T7 dans `docs/roadmap.md` et fixe sa place.

## Conséquences
- **F8a** (écrans 1 et 2) :
  - `creationRoutes` (`nouveau`, `brief`, `lancer`) et `suite.ts` avec ses tests hostiles ;
  - groupe `(creation)` et `DraftProvider` ;
  - `src/contracts/creation.ts` (`TripDraft`, `BriefRequest` minimisé, `Brief`, `InferredBrief`) et `src/contracts/errors.ts` ;
  - valeurs, énumérations, `isEmailShape` et `CATEGORIES` dans `src/contracts/values.ts` ;
  - `CategorySchema` étendu et libellés des deux tables ;
  - `CreationAdapter.structureBrief`, son mock, `src/server/actions/creation.ts` et `src/server/parse-input.ts` ;
  - règle de lint sur `@/server/*` et son test ;
  - `SegmentedControl` (`inferredValue`, et `value: T | null` s'il n'est pas encore livré) et `NumberField` ;
  - tests de concordance et test de `field`.
- **F8b** (écrans 3 et 4) :
  - `creationRoutes.logement`, `LodgingRequest` et `LodgingSuggestion`, `suggestLodging` ;
  - `R3` et `R3-dev`, `AreaMap`, `MOCK_DEMO_DRAFT` ;
  - `src/contracts/auth.ts`, `AuthAdapter`, `mock-auth.ts` (magasin minimisé, HMAC) et `src/server/actions/compte.ts` ;
  - avertissement du mode simulé ;
  - `simulation.ts` et `R-sim` (bornes du § 10) ;
  - `devPagesEnabled` fermé par défaut et garde `VADROUILLE_DEMO_AUTH` avec `VERCEL_ENV` ;
  - `dev-pages-env.test.ts`, lignes `docker` de `R3-dev` et de `R-sim`, règle de lint sur `Date.now`.
- **F8c** (lancement et écran 5) :
  - `creationRoutes.preparation` ;
  - `TripRequest` et `GenerationStatus` (avec `readyStops`), `createTrip` et `getGenerationStatus` ;
  - `R-lancer` et `launch-timing.ts` ;
  - interrogation (`GENERATION_POLL_MS`) et `preview_ready`.
- **Toutes les PR de F8** :
  - pas de Zod complet côté navigateur (0016 § 3.1) ;
  - test de budget vert dès que T4 l'a créé ;
  - aucun `console.*` dans `src/features/creation`, `src/features/compte`, `src/server` et les adaptateurs simulés de F8 (`no-console`, avec son test), en plus du test « aucune donnée journalisée » de la spécification.
- **T6** (§ 13) et **T7** (§ 14), nouvelles : le CEO les inscrit dans `docs/roadmap.md` et les place.
- **Spécification F8** :
  - seul le nom du schéma change dans le critère de sortie de `structureBrief` (§ 2.3) ;
  - les autres critères ne changent pas.
  
  Sa prochaine mise à jour (Product Owner) pourra renvoyer à cette décision pour `validation_failed` (§ 4), `InferredBriefSchema` (§ 2.3), `BriefRequest` minimisé et `LodgingRequest` (§ 2.3 et § 2.4), l'emplacement des actions (§ 3.3) et la transmission de la portée (§ 10).
- **B0 (#27) et B9**, à répercuter :
  - `BriefRequest` minimisé (§ 2.3) ;
  - `LodgingRequest` et `InferredBrief` ;
  - réponse de `createTrip` (`{ tripId }` ou `TripSummary` avec `tripId`, § 2.4) ;
  - variantes de logement (§ 2.2) ;
  - organisation tirée de la session ;
  - exigences du § 3.6 (sortie du modèle, données Google de `suggestLodging`, IDOR) ;
  - emplacement `src/server/actions/`.
  
  Le relecteur de #27 le signale si #27 est fusionnée après celle-ci.
- **B3** : énumération de comptes (§ 4), contrôle d'appartenance (§ 3.6), seuils réels (Q86).
- **Revue** des PR F8a, F8b, F8c, T6 et T7 : le Tech Lead vérifie leur conformité à cette décision. Un écart demande un amendement écrit ici, pas une exception silencieuse.

## Questions liées
**Nouvelles questions** :
- **UX/UI** (2026-10-09) : avec le nouveau code `heritage` (« Patrimoine et monuments »), la phrase de F6 pour `museum` (« les musées et monuments ») recoupe celle de `heritage`. Faut-il la réduire à « les musées » ? Il faut aussi les trois phrases de `presentation.categories` pour `heritage`, `market` et `nightlife`. **Bloque** : rien. F8a livre des textes provisoires.
- **UX/UI** (2026-10-09) : texte et rendu de l'avertissement de l'écran 4 quand la connexion est simulée (§ 3.5). **Bloque** : rien en local et en CI. C'est nécessaire avant toute ouverture sur un déploiement (Q101).
- **CEO** (2026-10-09) : inscrire T6 (positions simulées du voyage débloqué) et T7 (serveur Playwright isolé par worktree) dans `docs/roadmap.md` et fixer leur place. T6 n'est pas dans le même cycle que F8b, F8c ou F7a ; T7 pas dans le même cycle que F8b. **Bloque** : rien pour F8a.

**Questions déjà ouvertes, rappelées** :
- **Q101** (Samuel, comptes et environnements) : connexion simulée sur un déploiement, et contrôle de `VADROUILLE_DEV_PAGES` hors dépôt (§ 11). **Limite à connaître** : la session simulée est partagée par tous les visiteurs d'une instance, une connexion vaut pour tous, et le code est connu de tous. La garde refuse en tout cas `VERCEL_ENV=production` tant que cette décision n'est pas amendée.
- **Données personnelles hors UE** (Samuel) : non évalué ici ; à soumettre à Samuel avec B9 et B3 (fournisseur de modèle, fournisseur d'envoi Q25, hébergeur).
- **Q86** (Tech Lead et Sécurité) : seuils réels de la connexion par code, pour B3.
- **Q25**, **F8-Q2**, **F8-Q3** et **F8-Q9** (Samuel) : aucune décision technique ici n'en préjuge.
