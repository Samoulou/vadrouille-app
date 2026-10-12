# 0016 — Décisions du Tech Lead pour F7 (Remplacer, Ajouter un lieu, Déplacer) et suites de F5a

Statut : décision déléguée, définitive sans veto de Samuel sous 2 jours (avant le 2026-10-11) · Date : 2026-10-09 · Décideur : Tech Lead (architecture, bibliothèques, outillage, tests ; délégation « Qui décide quoi » de `docs/CONTEXT.md`) · Ticket #57

## Contexte
Sept questions déléguées au Tech Lead sont ouvertes dans `QUESTIONS.md` :
- **Q92** (F7-Q6) : propositions F7-TL-1 à F7-TL-9 de `specs/F7-remplacer-ajouter-deplacer.md` (fusionnée par #53), à trancher avant le code de F7 ;
- **Q91** (F7-Q5) : relier une ligne de `ChecklistItem` à son étape ;
- **Q90** (F7-Q4), partie Tech Lead : source réelle de la recherche « Ajouter un lieu » et coût par requête. La partie Google (affichage du `displayName`, Q5) reste à Samuel ;
- **Q94**, **Q95** et **Q96** : écarts de F5a (#54, fusionnée) à la décision 0015, budget de JavaScript initial de la Journée, et recentrage de la carte simulée.

Le code de F7 est découpé en trois PR successives, F7a (Remplacer), F7b (Déplacer) et F7c (Ajouter un lieu), après la fusion de F5c (Q93, tranchée par le CEO). Pour chaque décision, la PR qui l'applique est indiquée.

Cette décision s'appuie sur les décisions 0013 et 0015 et les amende là où c'est dit (§ 1 à § 3 et § 13). Elle renvoie au handover back-end (#27, en revue) sans le présupposer accepté. Les numéros 0006 à 0012 restent réservés par des PR en revue.

Hors de cette décision :
- **Samuel** : affichage du nom Google d'un résultat de recherche (Q90, partie Google ; Q5), compte et clé serveur Google Places, budget de dépense (§ 12) ; plafond de remplacements (F7-Q2) ;
- **UX/UI** : rendus et textes non maquettés (F7-Q1), dont celui du choix de la raison et de `DayBadge` en mode bouton ;
- **Product Owner** : comportement fonctionnel, dont l'application de F7-PO-19 (§ 11) ;
- **CEO** : place de la tâche de remédiation T4 (§ 15) dans l'ordre des travaux.

**Aucune nouvelle dépendance** : `zod/mini` (§ 15) est un point d'entrée du paquet `zod` 4.6.5 déjà installé. `docs/decisions/0003-versions.md` ne change pas. Aucune de ces décisions n'engage d'argent, de compte externe ni de donnée personnelle hors UE : ce qui en dépend (§ 12) est posé à Samuel.

## Décisions — suites de F5a

### 1. Q94 — Écarts de F5a à la décision 0015
Les cinq écarts signalés par #54 sont **acceptés**. Ils amendent la décision 0015 comme suit. Aucune correction n'est demandée à F5b à ce titre.

#### 1.1 Groupe de routes `(programme)` (amende 0015 § 5.3)
- Le layout du voyage est `src/app/voyages/[id]/(programme)/layout.tsx`, et non `src/app/voyages/[id]/layout.tsx`. À ce dernier emplacement, il envelopperait aussi `/voyages/[id]/presentation` (F6) dans la carte et le panneau, ce que la spécification F5 ne veut pas.
- Les adresses ne changent pas : un groupe entre parenthèses n'apparaît pas dans l'URL.
- **Règle pour la suite** : toute page qui s'affiche dans le panneau du voyage se place sous `(programme)`. C'est le cas des pages de F7 (§ 7). Le pendant de développement reste `src/app/dev/voyages/[id]/layout.tsx`, qui n'a pas de présentation à exclure.

#### 1.2 `tripRoutes` construit côté client (amende 0015 § 1)
- La décision 0015 disait « construit une fois dans le layout et transmis par le contexte ». Un objet de fonctions ne traverse pas la frontière serveur/client : le layout transmet `base` (une chaîne), et `TripShell` construit l'objet par `tripRoutes(base, trip.id)` sous `useMemo`. Les pages serveur l'appellent elles-mêmes avec les mêmes arguments.
- Ce qui compte est conservé : un seul module, `src/features/sejour/routes.ts`, connaît le schéma des routes. **Point de revue** : aucune adresse du voyage n'est concaténée ailleurs.

#### 1.3 Hauteurs du panneau en pourcentage du conteneur (amende 0015 § 5.2)
- Au repos, la hauteur du `Sheet` est une part de la hauteur de son conteneur, en pourcentage CSS, et non une valeur en pixels lue sur `window.innerHeight`. Le navigateur la recalcule au redimensionnement, sans `vh`, et le même composant fonctionne dans un cadre de `/dev/composants`.
- Le conteneur de l'écran du voyage est `main` en `fixed inset-0`, donc la fenêtre. `fitPadding` et `visibleInsets` lisent `window.innerHeight` et restent donc cohérents avec le panneau.
- **Condition** : si le conteneur cesse d'être la fenêtre (grand écran, F12), le panneau et `visibleInsets` doivent être tirés de la même mesure, celle du conteneur. F12 le vérifie.

#### 1.4 Glisser suivi sur `window` (amende 0015 § 5.1)
- Le `Sheet` ajoute `pointermove`, `pointerup` et `pointercancel` sur `window` à l'appui, et les retire au relâchement et au démontage, au lieu de `setPointerCapture`. En Chromium, une capture posée au premier mouvement perdait le `pointerup` d'un geste rapide.
- Ce sont toujours des Pointer Events natifs, sans dépendance. Le code filtre `pointerId` et traite `pointercancel` : ces deux garanties sont la condition de l'acceptation.
- Le geste de F6 (décision 0013 § 3.4) n'est pas concerné et garde `setPointerCapture`.

#### 1.5 Marge asymétrique de la carte simulée
- `fitCamera` (`simulated-model.ts`) centre désormais la boîte dans la zone hors marge, comme `fitBounds` de Google. Accepté : sans cela, le tracé du jour passait sous le panneau. Les marges symétriques donnent le même résultat qu'avant.

### 2. Q96 — Recentrage de la carte simulée (amende 0015 § 4)
**Décision : la carte simulée a sa propre conversion, équirectangulaire ; `offsetCenter` reste en Web Mercator pour Google.**

- La décision 0015 § 4 demandait « le même centre » pour les deux rendus. C'était une erreur : la carte simulée projette en équirectangulaire (`scaleAt(zoom)` pixels par degré, en latitude comme en longitude), alors que Google projette en Web Mercator. À la latitude d'Édimbourg (56° N), un degré de latitude occupe environ 1,8 fois plus de pixels en Mercator. Avec le centre de Mercator, l'étape de la carte simulée n'est décalée que d'environ 56 % du décalage voulu : au-dessus du panneau à 55 %, mais pas au milieu de la zone visible, et sous le bord du panneau à 92 %.
- Chaque rendu calcule donc le centre dans **sa** projection :
  - Google : `offsetCenter(target, insets, zoom)` de `route.ts`, inchangé ;
  - carte simulée : une fonction pure de `simulated-model.ts`, par exemple `offsetCamera(target, insets, zoom)`, qui renvoie `lat = target.lat − (bottom − top) / 2 / scaleAt(zoom)` et `lng = target.lng + (right − left) / 2 / scaleAt(zoom)`. `fitCamera` appelle cette fonction pour sa marge asymétrique (§ 1.5), au lieu de garder sa propre copie de la formule.
- **Sens du décalage** : le texte de 0015 § 4 écrit `((left − right) / 2, (bottom − top) / 2)`, ce qui est la position de la cible vue du centre. Le centre de carte est décalé depuis la cible de `((right − left) / 2, (bottom − top) / 2)`, y vers le bas : c'est ce que fait le code de F5a, qui est juste.
- **Tests** :
  - le test de `SimulatedMapRenderer` qui compare le centre à `offsetCenter` est réécrit (il n'est ni désactivé ni supprimé) : `project(target, camera)` doit tomber au milieu de la zone non couverte, à 10⁻⁶ px près, à 25, 55 et 92 % ;
  - tests unitaires de la nouvelle fonction, et test de `fitCamera` inchangé ;
  - le critère e2e de F5b (« centre du marqueur au-dessus du bord supérieur du panneau ») peut alors vérifier le milieu de la zone visible à 1 px près.
- **SimulatedMapRenderer n'importe plus `offsetCenter`.**
- PR : **F5b**, qui écrit le critère concerné.

### 3. Q95 — JavaScript initial de la Journée au-dessus du budget
**Constat** (mesure de #54, build de production, `/voyages/mock_trip_edimbourg/jour/2`) : 228,2 Ko gzip, carte comprise (environ 6 Ko), pour un budget de 200 Ko hors carte (handover front § 14). Un fichier de 51 Ko contient Zod et `fr.json`. Il entre dans la Journée parce que `src/components/carte/route.ts` importe la **valeur** `mapPointKey` depuis `@/contracts`, dont l'index charge tous les schémas Zod. La présentation (243,7 Ko) est touchée de la même façon par `DeckCard` (`DETOUR_THRESHOLD_MINUTES`), `PreferenceSheet` (`PreferenceReasonSchema.options`) et `src/analytics/events.ts`.

**Le dépassement n'est pas accepté. La règle retenue : aucun code chargé par le navigateur n'embarque le Zod complet (`zod`).**

Raison pour laquelle la règle doit être générale : corriger le seul `route.ts` ne suffit pas. F5c envoie `checklist_item_done` depuis la Journée (0015 § 6), et `track` valide l'événement par `AnalyticsEventSchema` (0013 § 3.3), qui est écrit en Zod complet. Zod reviendrait donc dans la Journée avec F5c, puis avec chaque événement de F7.

#### 3.1 Règles
1. **Valeurs des contrats sans Zod.** Les constantes et fonctions pures des contrats dont le client a besoin vivent dans un module sans import de `zod`, `src/contracts/values.ts` : `mapPointKey`, `DETOUR_THRESHOLD_MINUTES`, la liste des catégories (`CATEGORIES`), celle des raisons (`PREFERENCE_REASONS`) et celles qui suivront. Les schémas en dérivent (`CategorySchema = z.enum(CATEGORIES)`), il n'y a donc pas de seconde copie. `src/contracts/index.ts` continue de les réexporter : le code serveur ne change pas.
2. **Côté client**, les composants et les modules qu'ils importent lisent les valeurs depuis `@/contracts/values`, et les types depuis `@/contracts` par `import type` seulement.
3. **Mesure validée par `zod/mini`.** `src/analytics/events.ts` est réécrit avec `zod/mini`, le point d'entrée léger du paquet `zod` 4.6.5 déjà installé. Il n'y a ni dépendance ni version nouvelle, et la décision 0003 ne change pas. Les schémas restent des objets stricts en union discriminée, et les tests existants de `events.test.ts` gardent leurs attentes. La décision 0013 § 3.3 est inchangée sur le fond : un événement invalide fait échouer les tests et n'est jamais envoyé en production. Les variantes de F5c et de F7 (§ 10) s'écrivent avec `zod/mini`.
4. **Lint.** Dans `src/components/**`, `src/features/**`, `src/analytics/**`, `src/lib/**` et `src/i18n/**`, la règle `@typescript-eslint/no-restricted-imports` interdit `zod` (et non `zod/mini`), ainsi que les imports de valeur depuis `@/contracts` (`allowTypeImports: true`). Elle reprend dans le même bloc les motifs `@/mocks` et ceux de la carte simulée, à cause du point d'attention de 0015 § 1 sur la configuration plate. Elle est testée dans `tests/unit/lint/` : un import de `@/contracts/values` passe, un import de valeur de `@/contracts` est refusé, et les interdictions précédentes tiennent toujours.
5. **Budget mesuré en CI.** Un test e2e `budget: JavaScript initial de la Journée` (Playwright, build de production, domaines Google bloqués) ouvre `/voyages/mock_trip_edimbourg/jour/2`, attend `load` puis l'inactivité du réseau, et prend chaque script de l'origine de l'application chargé jusque-là. Il compresse le corps de chacun par `zlib.gzipSync` (niveau par défaut), ce qui rend la mesure indépendante de la compression du serveur, et vérifie que la somme est **strictement inférieure à 200 000 octets**. La carte est comptée : c'est plus strict que le handover (« hors carte »), et plus simple qu'isoler son fichier. Le test journalise la mesure ; la PR qui le crée donne aussi celle de `/voyages/mock_trip_edimbourg/presentation`, sans seuil (le handover n'en fixe pas).
6. **`fr.json`** reste chargé par le client (environ 11 Ko non compressés) : les textes de l'interface y sont nécessaires. Il n'est pas découpé.

Si, une fois ces règles appliquées, la Journée dépasse encore 200 000 octets, la PR le dit avec sa mesure et le Tech Lead tranche par un amendement. Le seuil ne se relève pas sans décision écrite.

#### 3.2 Plan de remédiation
- **Tâche T4 — « JavaScript initial de la Journée sous le budget (Q95) »**, rôle frontend, ajoutée à `docs/roadmap.md` par cette PR. Elle couvre les règles 1 à 5 : `values.ts`, imports côté client (`route.ts`, `DeckCard`, `PreferenceSheet`, `events.ts`), `zod/mini`, règle de lint et son test, test de budget.
- **Quand** : après la fusion de F5b, qui modifie `route.ts` et `src/contracts` (`openMeal`, `Stop.commitment`), et **avant le début de F5c**, qui ferait entrer la mesure dans la Journée. La place exacte relève du CEO. Jamais dans le même cycle qu'une sous-tâche de F5, de F7 ou de F8 qui touche `src/contracts`, `src/analytics` ou `eslint.config.mjs`.
- Si le CEO préfère, T4 peut ouvrir F5c, dans la même PR, à condition que le test de budget y soit vert.
- Ensuite, chaque PR de F5c, F7 et F8 garde le test vert. Une PR qui le rougit le corrige, ou demande un amendement de cette décision.

## Décisions — F7 (Q92, F7-TL-1 à F7-TL-9)

### 4. F7-TL-1 — Contrats de phase 0 de la révision
**Retenue, précisée.** Elle crée `src/contracts/revision.ts`, réexporté par `src/contracts/index.ts`. Tous les objets sont stricts (`z.strictObject`). Les noms suivent le handover back-end (#27, en revue), pour que B2 et B11 les étendent sans les renommer. Les types sont importés par `import type` côté client (§ 3.1).

#### 4.1 Demandes
- `ReplacementRequest = { stopId, reason: PreferenceReason, wish?: string, baseVersion: number }`. `wish` a 200 caractères au plus, espaces retirés aux extrémités, et il est absent s'il est vide. `baseVersion` est un entier ≥ 0.
- `AddRequest = { source, name, moment, baseVersion }`, avec :
  - `source` égal à `{ type: "result"; resultId }` ou à `{ type: "idea"; ideaId }` ;
  - `name` de 1 à 80 caractères, espaces retirés aux extrémités. C'est le nom saisi par la personne (F7-PO-10), jamais recopié automatiquement d'un `displayName` ;
  - `moment` de type `AddMoment` (§ 4.3).
- `MoveRequest = { stopId, pointId, baseVersion }`.
- Aucune demande ne porte de nom de lieu Google, de `placeId` ni de donnée de lieu. `resultId` est un identifiant opaque, **jamais un `placeId`**. Le `placeId` d'un résultat reste du côté de l'implémentation, qui le pose sur l'étape créée.

#### 4.2 Aperçu (`RevisionPreview`)
- Union discriminée sur `kind`. Les champs communs sont :
  - `id` et `baseVersion` ;
  - `days: Day[]`, les brouillons complets des jours touchés, avec des `index` distincts ;
  - `changes: Change[]` ;
  - `changedStopIds: string[]`, les étapes à surligner ;
  - `targetStopId`, l'étape proposée, ajoutée ou déplacée. Elle est présente dans `days` et c'est elle qui reçoit le focus après « Appliquer » (F7-PO-1).
- Selon `kind` :
  - `replace` : en plus, `proposal: Stop` et `fromReserve: boolean`, **obligatoires** ; `targetStopId === proposal.id`. C'est le `ReplacementPreview` du handover ;
  - `add` et `move` : rien de plus.
- **Raffinements du schéma** :
  - chaque `changedStopIds` et `targetStopId` désigne un élément `stop` de `days` ;
  - aucune étape de `days` n'a `commitment` : une révision ne crée jamais d'engagement (0015 § 9).
- **Étapes verrouillées** : la règle « un brouillon ne modifie aucune étape verrouillée » compare le brouillon au programme courant, que le schéma ne connaît pas. C'est une fonction pure de `src/features/sejour/revision.ts`, `lockedStopViolations(baseDays, draftDays)`. Une étape verrouillée qui disparaît, change de nom, d'heure ou de jour est une violation. En B11, cette fonction passe dans `src/domain` et le serveur l'importe, sans seconde copie, sur le modèle de `preferencePromptFor` (0013 § 3.2).

#### 4.3 Recherche et moments
- `PlaceSearchResult = { resultId, placeId?, displayName, area?, fromGoogle: boolean, suggestedName?, moments: AddMoment[] }`. Raffinement : `fromGoogle: true` impose un `placeId`.
- `displayName` et `area` sont des valeurs d'affichage en mémoire, jamais stockées, jamais écrites dans `Stop.name` ni dans `Stop.meta`, jamais mesurées (handover back-end § 5, en revue). `suggestedName` est un nom maison.
- `AddMoment` est une union discriminée qui suit `DayLineItem` :
  - `{ kind: "free"; day; from: Time; to: Time }` ;
  - `{ kind: "openMeal"; day; time: Time; meal: Meal }`. `Meal` est l'énumération de 0015 § 2, et le moment porte `time`, comme la variante `openMeal`, et non une plage.
- `MoveOptions = { stopId, days: { index, points: { id, time: Time }[] }[] }`. Un jour sans point est « complet ».

#### 4.4 Résultats
- Toute demande d'aperçu renvoie `RevisionResult = { ok: true; preview } | { ok: false; error: RevisionError }`.
- `RevisionError = "noOption" | "conflict" | "lockedStop" | "costCapReached" | "rateLimited" | "error"`. Les deux codes de B0 (`cost_cap_reached`, `rate_limited`) sont présents dès maintenant pour que B11 n'ait pas à changer le type. L'écran les affiche comme `error` en attendant F7-Q2 (F7-PO-14). L'adaptateur `api` convertira les codes du serveur, dans une seule table.
- `apply(previewId)` renvoie `ApplyResult = { ok: true; version: number } | { ok: false; error: "conflict" | "lockedStop" | "error" }`.
- `searchPlaces` renvoie `{ ok: true; results: PlaceSearchResult[] } | { ok: false; error: "rateLimited" | "costCapReached" | "error" }`, avec 5 résultats au plus (F7-PO-9).

#### 4.5 `Change` (`src/contracts/trip.ts`)
- **Nouvelle variante** `{ type: "added"; time: Time; label }`.
- **`moved` change de forme** : `{ type: "moved"; label; before: { day; time }; after: { day; time } }`, avec `day` entier ≥ 1. Il n'y a plus de texte composé dans les données (handover § 9) : `ChangeSet` rend « J{a} {heure} → J{b} {heure} ».
- **`segment` gagne `label` obligatoire** : le nom de l'étape d'arrivée, pour distinguer deux trajets (« Trajet vers {nom} »). Le jeu simulé et les tests de F1 sont mis à jour dans la même PR.
- Tous les `label`, `before` et `after` qui sont des noms sont des noms maison (`Stop.name`, ou le nom saisi pour un ajout), jamais un `displayName` Google.
- Dans le tableau des champs de B0 (#27), les lignes `Change` suivent cette forme. Le relecteur de #27 le signale si #27 est fusionnée après celle-ci, sinon B2 s'en charge.

- PR : **F7a** (demande de remplacement, aperçu, résultats, `Change`) ; **F7b** ajoute `MoveRequest` et `MoveOptions` ; **F7c** ajoute `AddRequest`, `AddMoment` et `PlaceSearchResult`. Chaque PR ne crée que ce qu'elle utilise.

### 5. F7-TL-2 — Actions de révision injectables
**Retenue, précisée** : une seule implémentation en mémoire pour le programme et la révision.

- Interface `RevisionActions` dans `src/features/sejour/revision.ts`, toute asynchrone :
  - `previewReplacement(request, { signal })` : `Promise<RevisionResult>` ;
  - `searchPlaces(query, { signal })` : voir § 4.4 ;
  - `previewAdd(request, { signal })` : `Promise<RevisionResult>` ;
  - `getMoveOptions(stopId)` : `Promise<MoveOptions>` ;
  - `previewMove(request, { signal })` : `Promise<RevisionResult>` ;
  - `apply(previewId)` : `Promise<ApplyResult>`.
  
  L'annulation reste `ProgrammeActions.undo()` (0015 § 6) : il n'y a pas de second `undo`.
- **Une seule source de vérité.** L'implémentation en mémoire de `ProgrammeActions` (F5b) et celle de `RevisionActions` sont **le même objet**, créé par une fabrique unique (par exemple `createMemoryProgramme(trip, fixtures)`). La version locale et la dernière modification annulable sont donc uniques : poser un verrou rend définitif un remplacement, et inversement (F7-PO-1, « une modification à la fois »).
- **État** : le réducteur pur de `programme.ts` (0015 § 6) gagne les jours remplacés par une révision appliquée. Il garde seulement les écarts aux données de l'adaptateur, et `applyProgramme(trip, state)` rend toujours le voyage affiché. L'égalité profonde de l'état entre avant « Appliquer » et après « Annuler » est testée pour chacune des trois modifications.
- **Version** : un entier local, à 0 au chargement, incrémenté par chaque application, annulation, pose ou retrait de verrou. Un aperçu dont `baseVersion` n'est plus la version courante est refusé par `apply` avec `conflict`.
- **Brouillons simulés** : un brouillon n'est servi que si les jours qu'il touche sont identiques (égalité profonde) aux jours de l'adaptateur. Sinon la réponse est `noOption`. C'est la limite assumée de la phase 0, sans moteur. Tout brouillon passe par `lockedStopViolations` avant d'être servi, et une violation renvoie `lockedStop`.
- **Abandon** : l'implémentation respecte `signal`, et une demande abandonnée ne résout jamais un aperçu. L'écran ignore de toute façon une réponse arrivée après « Arrêter » (F7-PO-4), par un jeton de demande.
- **Principe « l'agent cherche, l'ancrage vérifie, le moteur planifie »** : en phase 0, l'implémentation ne choisit et ne planifie rien. Elle sert des brouillons précalculés et vérifie verrous et versions. En B11, l'implémentation serveur (Server Actions derrière `src/adapters` : `previewReplacement`, `searchPlaces`, `getMoveOptions`, `applyPatch` avec `replace`, `add`, `move` et `revert`) se branche à la place, sans changer les écrans.
- Mesure : comme 0015 § 6, l'écran envoie les événements quand `apply` ou `undo` est résolue. L'implémentation ne les envoie pas.
- PR : **F7a** (interface, fabrique, `previewReplacement`, `apply`) ; **F7b** (`getMoveOptions`, `previewMove`) ; **F7c** (`searchPlaces`, `previewAdd`).

### 6. F7-TL-3 — Jeu simulé de révision
**Retenue, amendée** : une fonction de lecture à part, et non une méthode de `TripAdapter`.

- Données dans `src/mocks/edimbourg-revision.ts`, avec les valeurs de la spécification (« Jeu simulé de révision »), entre crochets et avec des sources `https://example.org/mock/…`. Le voyage débloqué en hérite.
- Schéma `RevisionFixturesSchema` (strict) dans `src/contracts/revision.ts` : brouillons de remplacement par `stopId`, index de recherche, brouillons d'ajout par source et moment, options et brouillons de déplacement. Les tests du mock le valident.
- **Lecture** : une fonction `getRevisionFixtures(ctx, tripId): Promise<RevisionFixtures | null>`, exportée par `src/adapters`, et **pas** une méthode de `TripAdapter`. Raison : l'adaptateur `api` n'aurait rien de sensé à y renvoyer, et B11 remplace l'ensemble par les Server Actions.
  - même isolation par organisation que `getTrip` : `null` pour un voyage inconnu ou d'une autre organisation ;
  - `null` quand l'adaptateur configuré n'est pas `mock` ;
  - le layout du voyage la lit et transmet les données (sérialisables) à `TripShell`, qui crée l'implémentation en mémoire. Sans données, chaque demande d'aperçu répond `noOption`.
- **Tests du jeu simulé** :
  - aucun brouillon ne modifie le Tattoo ni une autre étape verrouillée (`lockedStopViolations` vide) ;
  - chaque brouillon passe `RevisionPreviewSchema` ;
  - aucun `placeId` simulé n'apparaît dans un `Change`.
- PR : **F7a**, puis complétée par F7b et F7c pour leurs parties.

### 7. F7-TL-4 — Adresses et pages de développement
**Retenue, précisée.**

- `tripRoutes.ajouter(n, from?)` prend une union qui remplace le paramètre `free` de F5 :
  - `{ type: "free"; from; to }` donne `?de=…&a=…` ;
  - `{ type: "meal"; time; meal }` donne `?de=…&repas=lunch|dinner` ;
  - `{ type: "idea"; ideaId }` donne `?idee=…`, avec `encodeURIComponent`.
  
  Les heures sont écrites telles quelles (0015 § 8). `getIdeasHref` de F5b est mis à jour dans la même PR.
- **Lecture des paramètres** : une fonction pure `parseAjouterParams(searchParams)` dans `routes.ts`. Le module qui écrit les adresses est aussi celui qui les relit. Elle rend la partie valide, ou rien : heure hors `HH:MM`, `repas` inconnu ou plusieurs formes mêlées sont ignorés (F7-PO-8). Elle est testée dans les deux sens (écrire puis relire donne la même valeur).
- Pages produit sous le groupe `(programme)` (§ 1.1) : `src/app/voyages/[id]/(programme)/jour/[n]/remplacer/[stopId]/page.tsx` et `…/jour/[n]/ajouter/page.tsx`. Leurs pendants sont sous `src/app/dev/voyages/[id]/jour/[n]/…`, avec la garde `devPagesEnabled()` puis `notFound()`.
- Composants serveur partagés dans `src/features/sejour/screens.tsx`, comme F5a.
- CI : le job `docker` ajoute les deux lignes 404 de la spécification (0013 § 1.6).
- PR : **F7a** (`remplacer`), **F7c** (`ajouter`, `parseAjouterParams`).

### 8. F7-TL-5 — Composants
**Retenue, amendée** pour le choix de la raison.

- **`ChangeSet`** (`src/components/ligne/ChangeSet.tsx`) : prop `changes: Change[]`. Il n'a ni adresse ni action. Il ignore `unchanged`, et il ignore `budget` quand `deltaPerPerson` vaut 0. Ses textes sont dans `fr.json` sous `ligne.changeSet.*`. Il ne compose aucune donnée : noms, jours et heures viennent des changements.
- **`DayBadge` en mode bouton** : props `onSelect?: () => void` et `pressed?: boolean`.
  - Avec `onSelect`, la pastille rend un `<button type="button" aria-pressed>`. `href` et `onSelect` sont exclusifs, ce que le type impose par une union.
  - Désactivée (« complet ») en mode bouton : `aria-disabled="true"`, sans effet à l'activation, avec le nom accessible de F3 (« Jour 3, complet »). Elle reste atteignable au clavier, comme les boutons désactivés hors ligne de F7-PO-13.
  - L'état désactivé du mode lien (F3) ne change pas.
- **Choix exclusifs (raison, moment)** : `SegmentedControl` de F2, et **pas** une seconde implémentation de groupe radio. Il gagne :
  - `value: T | null`, sans option choisie : les raisons n'ont aucune présélection (F7-PO-3), et le moment n'en a pas toujours (F7-PO-11) ;
  - `orientation?: "horizontal" | "vertical"` (`aria-orientation`), `horizontal` par défaut.
  
  Les cinq raisons ne tiennent pas en une rangée à 390 px (« Pas mon style » dépasse 70 px), d'où la présentation verticale. Le comportement clavier (un seul arrêt de tabulation, flèches) est celui de F2 et ses tests restent inchangés. Le rendu vertical est provisoire, à fixer par UX/UI (F7-Q1).
- `/dev/composants` montre ces états (critère C10).
- PR : **F7a** (`ChangeSet`, `SegmentedControl`) ; **F7b** (`DayBadge` en mode bouton).

### 9. F7-TL-6 — Surlignage et toast partagé
**Retenue.**

- `TripShell` porte :
  - la dernière modification annulable, celle de l'implémentation unique (§ 5) ;
  - les identifiants surlignés et leur minuteur de 2 000 ms (`HIGHLIGHT_MS`, constante nommée). Le minuteur est annulé par « Annuler », par une nouvelle modification et au démontage.
- `DayLine` gagne `highlightedStopIds?: readonly string[]`. Une étape surlignée porte `data-highlighted="true"`, et un rendu qui ne repose pas sur la seule couleur (UX/UI). Sans la prop, rien ne change.
- **Un seul `UndoToastRegion`**, monté dans `TripShell`, sert le verrou de F5 et les trois modifications de F7. Une nouvelle action ferme le toast précédent. Si F5b monte son toast ailleurs, F7a le déplace dans `TripShell` sans changer les critères de F5.
- Le contexte du voyage (`TripShellContext`) expose une seule commande, par exemple `notifyApplied({ message, highlighted, onUndo })`. Les écrans n'ont pas chacun leur toast.
- PR : **F7a**.

### 10. F7-TL-7 à F7-TL-9 — Attente, événements, hors-ligne
**Retenues**, avec les précisions suivantes.

- **F7-TL-7** :
  - constante `SLOW_PREVIEW_MS = 5000` dans `revision.ts` ;
  - un `AbortController` par demande, abandonné par « Arrêter », par le démontage de l'écran et par un changement de raison ou de souhait ;
  - tests avec les minuteurs simulés de Vitest (`vi.useFakeTimers`) et des actions injectées qui ne se résolvent pas ;
  - **aucun délai artificiel** dans l'implémentation en mémoire. Le chemin « 5 s » n'est vérifié qu'en test unitaire, et pas en e2e.
- **F7-TL-8** : variantes strictes `replace_applied` et `replace_undone` (`reason: EventReason`, `from_reserve: boolean`, `duration_ms` entier ≥ 0), `place_added` (`method: "button"`) et `stop_moved` (`method: "button" | "drag"`), écrites avec `zod/mini` (§ 3.1). Les tests vérifient le refus d'un nom, d'un `placeId`, d'un identifiant d'étape, d'une requête et d'un souhait. `duration_ms` est mesuré par une horloge injectable (`performance.now` par défaut).
- **F7-TL-9** : crochet `useOnline()` dans `src/lib/online.ts`, sur `useSyncExternalStore` (événements `online` et `offline`, `navigator.onLine`, `true` au rendu serveur), réutilisable par F10. Tests unitaires par événements simulés ; e2e par `context.setOffline(true)`.
- PR : **F7a**. F7b et F7c y ajoutent leurs événements.

## Décisions — Q91 et Q90

### 11. Q91 (F7-Q5) — Relier une ligne de `ChecklistItem` à son étape
**Décision : champ facultatif `stopId` sur `ChecklistItemSchema`.**

- `stopId?: Stop["id"]` : identifiant interne de l'étape que la ligne concerne (réservation, billet), comme `checklist_items.étape` du cadrage § 6.8. Ce n'est jamais un `placeId`. Absent : la ligne ne dépend d'aucune étape (assurance, adaptateur électrique…).
- Une ligne concerne au plus une étape, et une étape peut avoir plusieurs lignes.
- **Cohérence** : `TripSchema` refuse un `stopId` qui ne désigne aucun élément `stop` d'un jour du voyage, et un test le vérifie. Une ligne ne pointe donc jamais vers une étape disparue. Quand une modification retire une étape, le moteur (B11) retire les lignes non faites qui la concernent, conformément à F7-PO-19. Il garde les lignes faites, mais sans `stopId`.
- **Pas un champ sur `Stop`** (liste d'identifiants de lignes) : la ligne est l'objet qui change avec la réservation, et un lien porté des deux côtés devrait être tenu cohérent à chaque modification.
- **`Change` pour la liste** : quand F7-PO-19 sera appliquée, l'aperçu le dira par une variante `{ type: "checklist"; action: "added" | "removed"; label }`, où `label` est le texte maison de la ligne. Sa forme est fixée ici, et elle est créée par la tâche qui l'utilise.
- **Application** : la spécification F7 exclut la modification de la liste en phase 0 (F7-PO-19, « Hors périmètre »). Le champ, son raffinement, la variante `checklist` et le marquage des lignes du jeu simulé (billets du Tattoo, « À réserver ») entrent donc avec **la tâche qui applique F7-PO-19**, ou avec B2 si le schéma de base de données vient avant. Le Product Owner décide si cette application rejoint F7 ou une tâche ultérieure, et le CEO la place.
- Dans le tableau des champs de B0 (#27), la ligne à ajouter est `ChecklistItem.stopId | stocké | lien interne vers l'étape concernée`.

### 12. Q90 (F7-Q4), partie Tech Lead — Source réelle de la recherche « Ajouter un lieu »
**Décision d'architecture : la recherche est faite côté serveur, d'abord dans nos propres lieux, puis dans Google Places par Text Search (New). Pas d'Autocomplete, pas de recherche web à la demande.**

- **Ordre** (`searchPlaces` de B11, derrière `src/adapters`) :
  1. **Nos lieux de la destination** : la réserve et les lieux déjà trouvés et ancrés par l'agent (B6). Ce sont des noms maison, avec `suggestedName`, des moments calculés par le moteur et `fromGoogle: false`, sans aucun coût Google par requête. Cela suit le principe « l'agent cherche, l'ancrage vérifie, le moteur planifie » : la personne choisit d'abord parmi des lieux déjà vérifiés.
  2. **Google Places, Text Search (New)**, seulement si l'étape 1 donne moins de 5 résultats :
     - un appel par recherche explicite (bouton « Rechercher » ou Entrée, F7-PO-9) ;
     - `pageSize` 5, `languageCode: "fr"`, `locationBias` sur la destination ;
     - masque de champs minimal : `places.id`, `places.displayName` et un champ de secteur pour `area`. Ni photos, ni avis, ni notes, ni horaires.
     
     Ces résultats ont `fromGoogle: true`, s'affichent avec `PlacesAttribution` et jamais sur une carte non Google (F7-PO-9).
- **Non retenus** :
  - **Autocomplete (Places)** : il appelle Google à chaque frappe, ce que F7-PO-9 exclut. Son modèle de session ne se termine bien que par un Place Details, et il pousse vers l'affichage de données Google à chaque caractère ;
  - **notre recherche web (agent) à la demande** : un appel de modèle et une recherche web par saisie, ce qui fait une latence de plusieurs secondes et un coût par requête plus élevé. Elle reste la source de la réserve (étape 1), et pas de la recherche interactive.
- **Règles Google (CLAUDE.md), appliquées par B11** :
  - **seul le `placeId` est stocké** : `displayName` et `area` restent en mémoire pour l'affichage, ne sont mis en cache nulle part et ne sont jamais écrits dans `Stop.name` ni dans `Stop.meta` ;
  - la `meta` d'une étape ajoutée depuis Google est composée de nos seules données (durée, prix estimé par le moteur). Sans donnée maison, elle se limite à la durée ;
  - **aucune donnée Google dans un prompt** : ni la liste des résultats, ni `displayName`, ni `area` ne sont envoyés à un modèle. La requête saisie par la personne est sa propre donnée, mais B11 ne la transmet pas non plus à un modèle pour la recherche de lieux ;
  - **ancrage avant planification** : le lieu choisi est vérifié avant l'aperçu (existence, statut d'ouverture par Place Details avec un masque minimal), puis le moteur calcule le moment et les trajets. Rien ne s'ajoute au programme sans aperçu (F7-PO-1).
- **Coût et garde-fous** :
  - l'étape 1 ne coûte rien par requête ;
  - l'étape 2 coûte une requête Text Search de la catégorie qui inclut `displayName`. Selon la grille publique de Google de mars 2025, c'est de l'ordre de 0,03 USD par requête au-delà d'un quota mensuel gratuit, et l'éventuel Place Details d'ancrage est facturé en plus, selon les champs. **Ces montants sont indicatifs** : Samuel les confirme sur la grille en vigueur au moment d'ouvrir le compte ;
  - B11 applique un plafond de recherches par voyage et par organisation, qui renvoie `rateLimited` ou `costCapReached` (§ 4.4). Les valeurs de ce plafond relèvent de Samuel (argent ; F7-Q2) ;
  - aucun appel n'est fait en phase 0 : F7 n'utilise que le jeu simulé.
- **Remonte à Samuel** (argent et compte externe, questions dans la PR de cette décision) : le compte Google Cloud et la clé serveur Places (déjà demandés pour P0) avec l'activation de Places API (New), le budget mensuel, et l'affichage du `displayName` avec attribution (Q90, partie Google ; Q5).
- **Bloque** : la recherche réelle de B11, et rien dans F7.

## Conséquences
- **F5b** :
  - fonction équirectangulaire de la carte simulée et `fitCamera` qui l'utilise ;
  - test de `SimulatedMapRenderer` réécrit ;
  - critère e2e exact (§ 2).
- **T4** (nouvelle, après F5b et avant F5c ; place fixée par le CEO) :
  - `src/contracts/values.ts` ;
  - imports côté client ;
  - `zod/mini` dans `src/analytics/events.ts` ;
  - règle de lint et son test ;
  - test e2e de budget (§ 3).
- **F5c, F7, F8** : test de budget vert, événements en `zod/mini`, imports de valeur depuis `@/contracts/values` uniquement côté client.
- **F7a** :
  - `src/contracts/revision.ts` (remplacement, aperçu, résultats) et `Change` (`added`, `moved`, `segment.label`) ;
  - `RevisionActions` et la fabrique unique avec `ProgrammeActions` ;
  - `lockedStopViolations` ;
  - jeu simulé et `getRevisionFixtures` ;
  - `ChangeSet` et `SegmentedControl` (`null`, `orientation`) ;
  - surlignage, toast unique dans `TripShell`, `SLOW_PREVIEW_MS`, `useOnline` ;
  - `replace_applied` et `replace_undone` ;
  - pages `remplacer` et leurs lignes `docker`.
- **F7b** : `MoveRequest`, `MoveOptions`, `getMoveOptions`, `previewMove`, `DayBadge` en mode bouton, `stop_moved`.
- **F7c** : `AddRequest`, `AddMoment`, `PlaceSearchResult`, `searchPlaces`, `previewAdd`, `tripRoutes.ajouter` (union) et `parseAjouterParams`, pages `ajouter`, `place_added`.
- **Tâche qui applique F7-PO-19** (PO puis CEO) : `ChecklistItem.stopId`, son raffinement et la variante `checklist` de `Change`.
- **B0 (#27) et B2** : tableau des champs (`Change`, `ChecklistItem.stopId`), codes d'erreur de révision, recherche de lieux du § 12.
- La spécification F7 n'a pas à changer pour être conforme : ses critères ne dépendent pas des amendements. Sa prochaine mise à jour pourra y renvoyer, notamment pour `SegmentedControl` vertical (§ 8) et `targetStopId` (§ 4.2).
- Revue des PR F5b, T4, F7a, F7b et F7c : le Tech Lead vérifie leur conformité à cette décision. Un écart demande un amendement écrit ici, pas une exception silencieuse.

## Questions liées
**Nouvelles questions pour Samuel** (argent et compte externe, § 12) :
- compte Google Cloud et clé serveur Places API (New) pour la recherche de B11 (à regrouper avec la clé serveur Places/Routes demandée pour P0), avec le budget mensuel et le plafond de recherches par voyage. Bloque la recherche réelle de B11 ; ni F7 ni T4.

**Questions déjà ouvertes, rappelées** :
- **Q90**, partie Google (Samuel ; Q5) : affichage du `displayName` avec attribution dans la liste de résultats.
- **F7-Q2** (Samuel) : plafond de remplacements et ce qui est permis avant paiement. Aucune décision technique ici n'en préjuge.
- **F7-Q1** (UX/UI) : rendus provisoires, dont `SegmentedControl` vertical et `DayBadge` en mode bouton.
- **Q5** et **Q14** (Samuel, juridique) : origine et conservation des données de lieux.
