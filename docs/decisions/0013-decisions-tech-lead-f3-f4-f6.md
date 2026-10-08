# 0013 — Décisions du Tech Lead pour F3, F4 et F6, sous-mode de transport public

Statut : décision déléguée, définitive sans veto de Samuel sous 2 jours (avant le 2026-10-10) · Date : 2026-10-08 · Décideur : Tech Lead (architecture, bibliothèques, outillage, tests ; délégation « Qui décide quoi » de `docs/CONTEXT.md`) · Ticket #38

## Contexte
Cinq questions déléguées au Tech Lead sont ouvertes dans `QUESTIONS.md` :
- **Q33** et **Q60** : choix de F4 (spécification `specs/F4-carte.md`, PR #35), acceptés à la revue de #35 et à consigner ;
- **Q52** : API des composants de F3, acceptée à la revue de la PR #30 ;
- **Q58** : propositions F6-TL-1 à F6-TL-6 de `specs/F6-presentation.md`, à trancher avant le code de F6 ;
- **Q36** : sous-mode de transport public dans le contrat `Segment`.

Les numéros 0006 à 0012 sont réservés par les PR ouvertes #26 (UX/UI) et #27 (B0). Cette décision y renvoie sans les présupposer acceptées : quand un renvoi porte sur une décision encore en revue, il est signalé.

Aucune de ces décisions n'engage d'argent, de compte externe, de point juridique ni de donnée personnelle hors UE. Les points qui en dépendent restent aux questions déjà ouvertes pour Samuel (Q5, Q29, F4-Q1, F6-Q3), rappelées en fin de document.

## Décisions

### 1. Carte (F4) — Q33 et Q60

#### 1.1 Contrat `DayMap` séparé de `Stop` (F4-TL-1)
- Les positions ne sont pas ajoutées à `Stop`. F1 refuse `location`, `lat` et `lng` sur `Stop`, et ce refus reste la protection contre un contenu Google glissé dans une étape.
- Contrat `src/contracts/map.ts`, réexporté par `src/contracts/index.ts` : `DayMap = { tripId, dayIndex, points: MapPoint[] }`, avec `MapPoint = { ref, lat, lng }` et `ref` égal à `{ type: "stop"; stopId }` ou à `{ type: "terminus"; role: "start" | "end" }`. Tous les objets sont stricts (`z.strictObject`) : un champ inconnu (`name`, `rating`, `photos`…) est refusé. `lat` est dans [-90, 90], `lng` dans [-180, 180], et il y a au plus un point par référence (`mapPointKey`).
- `DayMap` est une donnée d'affichage chargée à la demande, jamais persistée côté client (handover front § 8). Sa catégorie dans le tableau des champs de B0 (stockage côté serveur des coordonnées, 30 jours au plus) relève de la décision 0010 (#27, en revue) et de Q14.
- `TripAdapter` gagne `getDayMap(ctx, tripId, index): Promise<DayMap | null>` et `getTripMap(ctx, tripId): Promise<DayMap[]>`, avec la même isolation par organisation que les autres méthodes. Un jour sans position renvoie `null`.

#### 1.2 `validateDayMap(day, map, tripId)` à trois paramètres
- Fonction pure de `src/contracts/map.ts`. Elle renvoie la liste des incohérences, vide si tout concorde : `tripId` différent du voyage, `dayIndex` différent de `day.index`, `stopId` qui ne désigne aucun élément `type: "stop"` de `day.items`.
- Le troisième paramètre est nécessaire : `Day` ne porte pas l'identifiant du voyage. La spécification F4 (F4-TL-1) écrit `validateDayMap(day, map)` ; c'est la signature à trois paramètres qui fait foi. La spécification sera alignée par sa prochaine mise à jour (PO ou frontend), ce document ne modifie pas `specs/`.
- Tout adaptateur (`mock` aujourd'hui, `api` demain) passe chaque sortie par `DayMapSchema.parse` puis par `validateDayMap`, et refuse les positions incohérentes.

#### 1.3 Bibliothèque : `@googlemaps/js-api-loader` 2.1.3 et `@types/google.maps` 3.66.4
- **Retenu** : `@googlemaps/js-api-loader` 2.1.3 (dépendance), le chargeur officiel de Google (licence Apache-2.0), avec son API fonctionnelle `setOptions` et `importLibrary`. **Non retenu** : `@vis.gl/react-google-maps`, que nommait le handover front (§ 2 et § 8).
- Raisons :
  - la carte est pilotée de façon impérative (`fitBounds` avec marge, `panTo` ou `setCenter`, polylignes en pointillé). `@vis.gl/react-google-maps` n'a pas de composant de polyligne, et il faudrait sortir de ses composants pour ces appels ;
  - chaque appel `importLibrary` est intercepté dans les tests, ce qui rend testable la liste blanche des bibliothèques Google chargées (`maps` et `marker` seulement) ;
  - les tests simulent un module de chargement au lieu de toute une bibliothèque de composants React ;
  - la seule dépendance ajoutée est `@types/google.maps`.
- **`@types/google.maps` 3.66.4** (dépendance de développement), déclaré dans `types` de `tsconfig.json`.
- Les deux versions sont exactes, figées dans `package.json` et le lockfile, et consignées dans la décision 0003. Elles montent ensemble quand le chargeur exige des types plus récents.
- Le handover front § 2 et § 8 est mis à jour en conséquence par cette décision.

#### 1.4 Injection : `CarteProvider` (F4-TL-2 et F4-TL-3)
- Un contexte React, `CarteProvider`, porte `{ config?: MapConfig; simulated?: SimulatedRenderer }` (`src/components/carte/config.tsx`).
- Sans contexte (routes de production), la configuration vient de `process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` et `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`, et le rendu est Google.
- La carte simulée n'est jamais importée par `DayMap` : seul l'appelant qui l'injecte (`/dev/carte`, tests) l'embarque. Elle n'entre donc dans aucune route de production. Cette règle vaut aussi pour F5 et les écrans suivants : la carte simulée ne s'importe que depuis `src/app/dev/` et les tests.
- On injecte par contexte plutôt que par prop, parce que la configuration et le rendu simulé traversent plusieurs niveaux (écran, panneau, carte) sans être des données de l'écran.

#### 1.5 `MOCK_DEMO_TRIP` exporté par `@/adapters`
- Les pages de développement n'importent pas `src/mocks` : elles passent par `src/adapters` (règle « données uniquement via `src/adapters` »). `MOCK_DEMO_TRIP = { ctx, tripId }` donne le contexte d'organisation simulé et l'identifiant du voyage d'Édimbourg à `/dev/carte`.
- Usage réservé aux pages `src/app/dev/` et aux tests. Une route produit n'utilise jamais `MOCK_DEMO_TRIP`. Le contexte d'organisation des routes produit est réglé au § 3.6.

#### 1.6 CI : 404 de `/dev/carte` dans le job `docker`
- La ligne `curl` du job `docker` qui vérifie le 404 de `/dev/carte` dans l'image de production est acceptée, comme celles de `/dev/tokens` et `/dev/composants` (décision 0005). Toute nouvelle page `src/app/dev/*` ajoute sa ligne dans la même PR.

### 2. API des composants de F3 — Q52
Acceptée à la revue de la PR #30 et consignée ici. Ce sont des propositions du frontend hors du texte de la spécification F3 ; elles font désormais partie de l'API des composants Ligne.

| Composant | Prop | Décision |
|---|---|---|
| `DayBadge` | `size?: "md" \| "sm"` | Acceptée. `sm` donne la pastille réduite non interactive (26 px). Le rendu de la variante relève d'UX/UI (Q18, Q19). |
| `DayBadge` | `currentValue?: "true" \| "page"` | Acceptée. Valeur d'`aria-current` quand la pastille est active : `"true"` par défaut (handover § 5), `"page"` quand la pastille est un onglet de navigation (`DayTabs`). |
| `DayTabs` | `sejourHref: string` | Acceptée. Adresse de l'onglet « Séjour » fournie par l'appelant. Le composant ne construit aucune route. |
| `DayTabs` | `label?: string` | Acceptée. Nom du repère de navigation, « Jours du séjour » (`fr.json`) par défaut. Elle sert seulement quand deux rangées coexistent sur une page (règle axe `landmark-unique`) ; la valeur vient toujours de `fr.json`. |
| `DayLine` | `getStopHref: (stop: Stop) => string` | Acceptée. Le composant reçoit une fonction et ne connaît pas le schéma des routes. |
| `DayLine` | `ideasHref?: string` | Acceptée. Sans adresse, pas de lien « Idées ». La destination reste à fixer par le Product Owner (Q17). |
| `StopMarker` | `variant?: "ligne" \| "carte"` | Acceptée, `"carte"` par défaut. `selected` ne s'applique qu'à un marqueur de carte. Le rendu des variantes relève d'UX/UI (Q18). |

**Espacements Tailwind hors tokens dans `DayLine`** (`min-h-10`, `min-h-16`, `pb-3`, `gap-1`, `px-2`, `p-1`…) : acceptés à titre provisoire. L'échelle d'espacement par défaut de Tailwind n'est pas une valeur arbitraire (le handover § 2 n'interdit que `[#hex]` et les valeurs entre crochets), et F2 l'utilise déjà. Les mesures documentées par le design system passent, elles, par les tokens ou par `provisoire.css`. Quand UX/UI fixera des tokens d'espacement (Q19, décision 0012 en revue dans #26), une tâche front remplacera ces classes.

**Hors de cette décision** :
- le format « 1 h 05 » des durées est un choix de rédaction (UX/UI, Q16 et `redaction.md`) ;
- le soulignement du lien « Idées » est une modification de Ligne réservée à Samuel (Q37, S-3).

La revue de #30 les a acceptés dans le code. Le Tech Lead ne les tranche pas ici.

### 3. Présentation (F6) — Q58
Les six propositions de `specs/F6-presentation.md` sont tranchées comme suit. Le code de F6 peut démarrer sur cette base.

#### 3.1 F6-TL-1 — Catégorie sur `Proposal`
- **Retenu** : champ obligatoire `category` sur `ProposalSchema` (pas sur `Stop`).
- Le vocabulaire est un `z.enum` fermé, `CategorySchema`, dans un fichier dédié `src/contracts/category.ts`, réexporté par `src/contracts/index.ts`. Il est seul source du vocabulaire, pour que `Brief` (B9), `candidates.category`, `preference_signals.category` et `PreferencePrompt` (B10) l'importent au lieu de le recopier. Codes provisoires de F6-PO-10 : `museum`, `walk`, `nature`, `tasting`, `restaurant`. Ils seront alignés sur le vocabulaire des envies du brief quand F8 et B9 le fixeront, par amendement de cette décision.
- Les libellés sont dans `fr.json`, jamais dans les données.
- La catégorie est un contenu maison (classement de l'agent ou du moteur, copie de `candidates.category`), jamais un type de lieu Google recopié. Dans le tableau des champs de B0 (#27, § 5), la ligne à ajouter est `Proposal.category | stocké | copie de candidates.category (vocabulaire commun)`.
- Le test de F1 qui compare `Proposal` à la forme du handover § 9 est mis à jour dans la PR de F6 : champ ajouté et signalé, comme `Trip.organizationId`.
- Pourquoi pas `Stop` : le seul besoin actuel est celui du paquet. Porter la catégorie sur `Stop` obligerait à classer toutes les étapes simulées des 6 jours et toucherait la répartition des champs de `Stop` en revue (#27). Si un écran de la ligne du jour ou du remplacement (F5, B11) en a besoin, le champ passera sur `Stop` par une décision qui amende celle-ci.

#### 3.2 F6-TL-2 — État du paquet et `DeckActions`
- **Retenu** : réducteur pur dans `src/features/presentation/deck.ts`, avec les fonctions pures `resolveSwipe`, `swipeRotation` et `preferencePromptFor`. L'égalité profonde de l'état avant et après « Annuler » est testée sur le réducteur.
- Les décisions passent par l'interface injectable `DeckActions` (`decide`, `undo`, `answerPrompt`), dont les noms suivent `decideCard`, `undoDecision` et `answerPreferencePrompt` de B0. Chaque méthode renvoie une `Promise`, pour que l'implémentation serveur de B10 se branche sans changer l'interface. `decide` renvoie la question de préférence éventuelle.
- L'interface et l'implémentation locale (en mémoire) sont dans `src/features/presentation/`. Elles sont injectées par prop dans `PresentationScreen` depuis la page. En B10, l'implémentation serveur appellera `src/adapters` (Server Actions derrière l'adaptateur), jamais une requête directe.
- **Types `PreferencePrompt` et `PreferenceAnswer` dans `src/contracts/deck.ts` dès F6**, pas en local : ce sont des contrats partagés listés par le handover back-end (B10), et les créer à part dans F6 obligerait B10 à les dédoubler. F6 ne pose que les champs dont il a besoin :
  - `PreferencePrompt = { kind: "category"; category: Category } | { kind: "distance" }` ;
  - `PreferenceAnswer = { answer: "yes" | "no"; reason?: PreferenceReason }`, où `PreferenceReason` reprend les codes de raison de B0 (`notMyStyle`, `tooBusy`, `tooExpensive`, `tooFar`, `other`).
  
  B10 les étend (`requestId`, identifiant de question, compteurs de `DeckDecisionResult`) sans renommer ces champs. Les valeurs des événements de mesure (`too_expensive`… dans F6-PO-14) sont propres au schéma des événements (§ 3.3). La conversion depuis les codes du contrat se fait par une seule table, dans `src/analytics`.
- **Principe « le moteur planifie »** : en phase 0, la règle de la question (deux refus de la même catégorie, distance après deux « Trop loin ») est calculée côté client par `preferencePromptFor`, faute de serveur. En B10, cette fonction pure passe dans `src/domain` et le serveur devient seul juge de la question. L'implémentation locale importe alors la même fonction : pas de seconde copie de la règle. Le test `préférences: aucune généralisation sans réponse` porte le même nom dans F6 et dans B10.

#### 3.3 F6-TL-3 — Module de mesure
- **Retenu** tel que proposé :
  - `src/analytics/events.ts` définit une union discriminée Zod des événements (`deck_decision`, `deck_undo`, `deck_skipped`, `preference_prompt_answered`…), en objets stricts : une propriété inconnue est refusée, ce qui empêche d'y glisser un nom, un `placeId` ou une donnée personnelle ;
  - `src/analytics/track.ts` fournit `track(event)`, qui valide l'événement puis le confie à un enregistreur injectable par contexte React.
- Enregistreurs fournis : en mémoire (tests), console (développement), sans effet (production). **Aucun envoi réseau** et aucune dépendance PostHog tant que Samuel n'a pas répondu à F6-Q3 (compte externe et consentement). L'enregistreur PostHog sera ajouté par une tâche dédiée, sans changer `track`.
- Un événement invalide fait échouer les tests. En production, il est ignoré et n'est jamais envoyé partiellement.

#### 3.4 F6-TL-4 — Geste : événements pointeur écrits à la main
- **Retenu** : Pointer Events natifs (`pointerdown`, `pointermove`, `pointerup`, `pointercancel`, `setPointerCapture`), avec une transformation CSS (`translate` et `rotate`) appliquée pendant le glisser. **Non retenu pour F6** : `motion`.
- Raisons :
  - les seuils, la vitesse et la rotation sont déjà des fonctions pures testées sans bibliothèque (`resolveSwipe`, `swipeRotation`), et il ne reste qu'à suivre un pointeur ;
  - boutons, clavier et geste partagent le même chemin de décision ;
  - `prefers-reduced-motion` se gère par CSS (fondu au lieu de la rotation) ;
  - Playwright pilote directement les événements pointeur ;
  - aucune dépendance de plus (`motion` 14 embarque `framer-motion`).
- La vitesse est calculée sur les derniers événements `pointermove` (fenêtre de temps fixée dans `deck.ts`), pas sur le seul dernier écart. `touch-action: pan-y` sur la carte laisse le défilement vertical au navigateur.
- `motion` reste l'option si F5 (panneau à points d'arrêt) ou une animation de F6 l'exige. Ce sera alors une décision qui amende celle-ci, version selon la décision 0003.
- Le handover front § 2 est mis à jour (ligne « Gestes »).

#### 3.5 F6-TL-5 — Feuille modale : `Dialog` de shadcn/ui sur `@radix-ui/react-dialog` 1.2.0
- **Retenu** : la feuille de question (écran 7) et le détail utilisent le `Dialog` de shadcn/ui (`src/components/ui/dialog.tsx`), présenté en feuille ancrée en bas de l'écran, à une seule hauteur. La primitive est `@radix-ui/react-dialog` **1.2.0** (dernière version stable sur le registre npm le 2026-10-08 ; les 1.2.1 et 1.3.0 ne sont que des `rc`).
- Cette primitive fournit le piège de focus, la fermeture par Échap, le retour du focus à l'élément d'origine, `aria-modal` et le titre lié (`DialogTitle`), soit ce que demandent les critères de F6. Le critère « focus sur le titre à l'ouverture » se règle par `onOpenAutoFocus`.
- Elle dépend de `@radix-ui/react-slot` 1.4.0, déjà présente (décision 0005), sans doublon.
- **Non retenu** : le `Drawer` de shadcn/ui, qui repose sur `vaul`, dont la dernière publication date du 2024-12-14 (1.1.2). Le handover § 2 demande de vérifier que cette dépendance est maintenue, ce qui n'est pas établi. Le panneau à points d'arrêt de F5 fera l'objet de sa propre décision (`Sheet` de F5).
- Les surfaces (`card`, `popover`, fond de la feuille) suivent Q10 (UX/UI, décision 0012 en revue dans #26). En attendant, F6 utilise les tokens existants et liste ses rendus provisoires (F6-Q1).
- Quand le `Sheet` de F5 existera, F6 pourra l'adopter pour le détail. Ce sera une modification d'une seule primitive, sans changement des critères de F6.
- La version figure déjà dans la décision 0003, avec la mention « ajoutée par F6 ». La PR de F6 l'installe à cette version exacte et retire cette mention.

#### 3.6 F6-TL-6 — Contexte d'organisation et jeu simulé de 6b
- **Retenu**, avec une précision d'emplacement : la page ne lit jamais `MOCK_ORGANIZATION_ID` dans `src/mocks`. `src/adapters` expose une fonction serveur, par exemple `getRequestContext(): AdapterContext`, qui renvoie le contexte d'organisation simulé **seulement** quand `DATA_ADAPTER` vaut `mock`, et qui lève une erreur sinon. B3 remplacera son corps par la lecture de la session (« le contexte vient de la session, jamais du client », décision 0008 en revue dans #27), sans changer les pages qui l'appellent.
- Second voyage simulé `mock_trip_edimbourg_debloque` (même contenu, `unlocked: true`, J6 `generating: true` sans proposition, au moins 7 propositions des jours 3 et 4 entre crochets, dont un créneau de repas à 3 options et deux activités d'une même catégorie) : accepté. Il est construit à partir du voyage d'Édimbourg (dérivation, pas copie du fichier), validé par `TripSchema` et `ProposalSchema` dans l'adaptateur comme le premier, et couvert par les tests du mock.

### 4. Sous-mode de transport public dans `Segment` — Q36
- **Décision : pas de sous-mode maintenant.** Le contrat `Segment` garde `mode: "walk" | "transit" | "car"`. Le sujet est reporté à la tâche back-end qui branchera les trajets réels (Routes API dans `src/grounding`), et n'est rouvert que si l'une des deux conditions ci-dessous est remplie.
- Raisons :
  - **Fiabilité** (principe produit 2) : le seul moyen de connaître le véhicule (bus, tram, train) est le calcul d'itinéraire en transports publics. Sans lui, un sous-mode serait inventé par le moteur ou l'agent. Le libellé neutre proposé par UX/UI (S-1, « Transports publics » sans icône) est exact. Ce libellé dépend de Q37, modification de Ligne réservée à Samuel ; ce n'est pas une décision du Tech Lead.
  - **Données Google** : le véhicule vient de la réponse de Routes API, donc d'une donnée dérivée de Google. Par le défaut prudent de la décision 0010 (#27, en revue), elle ne serait pas stockée : il faudrait la calculer à la lecture, comme `Segment.minutes`. Ajouter aujourd'hui un champ stocké contredirait ce défaut.
  - **Exactitude** : un trajet en transports publics enchaîne souvent plusieurs véhicules (tram puis bus). Un sous-mode unique serait faux une fois sur deux. La forme juste est une liste, qu'on ne peut pas dessiner sans données réelles.
- Conditions pour rouvrir :
  1. une source non Google qui donne le véhicule (horaires publics, GTFS) ;
  2. ou une réponse écrite de Samuel à Q5 et Q29 qui autorise la conservation des données dérivées de Routes API.
- Forme pressentie, à confirmer à ce moment : un champ facultatif `vehicles?: ("bus" | "tram" | "metro" | "train" | "ferry")[]`, présent seulement pour `mode: "transit"`, de la même catégorie que `minutes` dans le tableau des champs, avec repli sur le libellé neutre quand il est absent.
- Aucun code n'est modifié par cette décision.

## Conséquences
- `docs/decisions/0003-versions.md` liste `@googlemaps/js-api-loader` 2.1.3 et `@types/google.maps` 3.66.4 (F4), et fixe `@radix-ui/react-dialog` 1.2.0 (F6), que la PR de F6 installe.
- `docs/handovers/frontend.md` § 2 (lignes « Carte » et « Gestes », renvoi aux versions) et § 8 (premier point) renvoient à cette décision.
- La spécification F4 sera alignée sur `validateDayMap(day, map, tripId)` par sa prochaine mise à jour. La spécification F6 n'a pas à changer : ses propositions sont tranchées ici.
- Le handover back-end (#27) devra ajouter `Proposal.category` à son tableau des champs, importer `CategorySchema` de `src/contracts/category.ts` pour `candidates.category`, et partir de `src/contracts/deck.ts` pour `PreferencePrompt` et `PreferenceAnswer`. Le relecteur de #27 le signale si #27 est fusionnée après celle-ci, sinon la tâche suivante s'en charge.
- Revue des PR de F4 (#35), F5 et F6 : le Tech Lead vérifie la conformité à cette décision. Un écart demande un amendement écrit ici, pas une exception silencieuse.

## Questions pour Samuel liées à ces décisions (déjà ouvertes, aucune nouvelle)
- **Q5 et Q29** (juridique) : conservation des données dérivées de Google. Elles conditionnent la réouverture de Q36 (§ 4) et la catégorie de stockage de `DayMap` côté serveur.
- **F4-Q1** (compte externe) : domaine où la clé Google est acceptée, pour valider la vraie carte.
- **F6-Q3** (compte externe et juridique) : compte PostHog en région UE et règle de consentement. Elle conditionne l'enregistreur réseau du § 3.3.
- **Q37** (modification de Ligne) : libellé « Transports publics » (S-1) et soulignement du lien « Idées » (S-3).
