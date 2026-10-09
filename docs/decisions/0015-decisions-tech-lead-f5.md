# 0015 — Décisions du Tech Lead pour F5 (Séjour, Journée, Fiche étape)

Statut : décision déléguée, définitive sans veto de Samuel sous 2 jours (avant le 2026-10-11) · Date : 2026-10-09 · Décideur : Tech Lead (architecture, bibliothèques, outillage, tests ; délégation « Qui décide quoi » de `docs/CONTEXT.md`) · Ticket #46

## Contexte
Deux questions déléguées au Tech Lead sont ouvertes dans `QUESTIONS.md` pour la spécification `specs/F5-sejour-journee-fiche.md` (fusionnée par #40) :
- **Q65** (F5-Q4) : propositions F5-TL-1 à F5-TL-8, à trancher avant le code de F5 ;
- **Q64** (F5-Q3) : distinguer dans le contrat un engagement saisi (billet, réservation) d'un verrou posé par la personne.

Le code de F5 est découpé en trois PR successives, F5a, F5b et F5c (F5-PO-18), après le code de F6 (Q66, tranchée par le CEO). Pour chaque décision, la PR qui l'applique est indiquée.

Cette décision s'appuie sur la décision 0013 et l'amende là où c'est dit (§ 1.4 et § 2). Elle renvoie au code de F6 (#44, en revue) et au handover back-end (#27, en revue) sans les présupposer acceptés : quand un renvoi porte sur un document encore en revue, il est signalé. Le numéro 0014 est réservé à une décision UX/UI de F6 ; les numéros 0006 à 0012 sont réservés par des PR en revue.

Hors de cette décision :
- **Samuel** : Q63 (ce que montre un voyage non débloqué), Q67 (« Garder » sur la fiche) ;
- **UX/UI** : rendus et textes non maquettés (F5-Q1, Q62), dont celui du type de bandeau `travel` et de la mention d'engagement ;
- **Product Owner** : comportement fonctionnel, dont la possibilité de déverrouiller un engagement (§ 9).

Aucune de ces décisions n'engage d'argent, de compte externe, de point juridique ni de donnée personnelle hors UE. **Aucune nouvelle dépendance** : `docs/decisions/0003-versions.md` ne change pas.

## Décisions

### 1. F5-TL-1 — Pages de développement des écrans du voyage
**Retenue, amendée** : un module d'adresses au lieu d'un `basePath` passé à chaque composant.

- Pages `src/app/dev/voyages/[id]/layout.tsx`, `page.tsx` et `jour/[n]/page.tsx`. Elles montent les mêmes composants de `src/features/sejour` que les routes `/voyages/…`, avec la carte simulée.
- **Injection de la carte simulée** : un layout est un composant serveur, et il ne peut pas transmettre un composant (`SimulatedMapRenderer`) à un contexte client. Un petit composant client propre à `/dev`, par exemple `src/app/dev/voyages/SimulatedCarte.tsx`, importe `SimulatedMapRenderer` et enveloppe ses enfants dans `CarteProvider`, comme `CarteDemo` de `/dev/carte`. C'est le seul fichier de F5 qui importe la carte simulée. La règle de la décision 0013 § 1.4 est inchangée : la carte simulée ne s'importe que depuis `src/app/dev/` et les tests.
- **Adresses** (amendement) : au lieu de passer un `basePath` à chaque écran, un module pur `src/features/sejour/routes.ts` construit toutes les adresses du voyage :
  - `tripRoutes(base: "/voyages" | "/dev/voyages", tripId)` renvoie `sejour()`, `jour(n)`, `etape(n, stopId)`, `remplacer(n, stopId)`, `ajouter(n, free?)` et `retour()` ;
  - les identifiants sont encodés (`encodeURIComponent`) ;
  - l'objet est construit une fois dans le layout et transmis par le contexte du voyage (§ 5) ;
  - `DayTabs.sejourHref`, `DayLine.getStopHref` et `DayLine.getIdeasHref` (§ 8) en sont dérivés.

  Raison : un seul endroit connaît le schéma des routes. Les composants Ligne n'en connaissent aucun (décision 0013 § 2), et les écrans n'ont plus de concaténation à dupliquer. Le module a ses tests unitaires (préfixe, encodage, paramètres `de` et `a`).
- **Garde** : chaque page de `/dev/voyages` appelle `devPagesEnabled()` puis `notFound()`, comme `/dev/carte`. Elles lisent les données par `getRequestContext()` et `getTripAdapter()`, comme les routes produit, et jamais par `src/mocks`.
- **CI** : le job `docker` ajoute deux lignes 404, pour `/dev/voyages/mock_trip_edimbourg` et `/dev/voyages/mock_trip_edimbourg/jour/2` (décision 0013 § 1.6).
- **Lint** : un bloc `no-restricted-imports` interdit `@/components/carte/SimulatedMapRenderer` et `@/components/carte/simulated-model` dans `src/app/voyages/**` et `src/features/**`. Il est testé dans `tests/unit/lint/`, sur le modèle de `presentation-lint.test.ts` (#44).
  
  **Point d'attention** : en configuration plate, deux blocs qui règlent la même règle sur les mêmes fichiers ne se cumulent pas, le dernier remplace le premier. Le nouveau bloc doit donc reprendre les motifs `@/mocks` du bloc de F1. On peut aussi construire les deux blocs avec une fonction commune, comme `noClientStorage` de #44. Le test vérifie que les deux interdictions tiennent sur un fichier de `src/features/sejour`.
- PR : **F5a**.

### 2. F5-TL-2 — Créneau de repas non choisi (`openMeal`, évolution E8)
**Retenue.**

- `DayLineItemSchema` gagne la variante stricte `{ type: "openMeal"; time: Time; meal: "lunch" | "dinner" }`, avec `MealSchema = z.enum(["lunch", "dinner"])` exporté de `src/contracts/trip.ts`.
- Raison : un créneau vide n'a ni nom, ni lieu, ni `placeId`. En faire un `Stop` obligerait à remplir des champs obligatoires (`name`, `meta`, `locked`) avec des valeurs fictives. Une variante sans lieu ne peut pas porter de donnée de lieu, et ne peut donc pas en recevoir une de Google.
- **Règle pour tous les consommateurs de `DayLineItem`** : `openMeal` n'est pas une étape. Il n'est compté ni dans la numérotation des marqueurs (`route.ts` de F4), ni dans le nombre d'étapes du résumé du jour, ni comme origine ou destination dans « Pour y aller » et « le plus long segment suivi d'une étape » (`travel.ts`). `validateDayMap` n'est pas touché : il ne regarde que les éléments `stop`.
- Les `switch` sur `item.type` (`DayLine`, `route.ts`, `travel.ts`) restent exhaustifs : TypeScript signale un cas oublié. Un test par consommateur porte sur un jour de test qui contient un `openMeal`.
- Le jeu d'Édimbourg n'en contient pas (ses repas sont choisis). Les tests utilisent des jours de test et ne modifient pas les jours simulés.
- Cette forme fixe la place réservée par E8 dans le handover back-end (#27, en revue). Dans le tableau des champs, la ligne à ajouter est `DayLineItem openMeal | stocké | créneau laissé vide (F6-PO-7), sans lieu`.
- PR : **F5b**.

### 3. F5-TL-3 — Idée « Surprends-moi »
**Retenue, amendée** : `Day.surprise` porte un type dédié, pas un `Stop`.

- Champ facultatif `Day.surprise?: SurpriseIdea`. `SurpriseIdeaSchema` est un objet strict de `src/contracts/trip.ts` : `{ id, placeId?, name, meta, reason, source, verifiedAt? }`, dont `reason` et `source` sont **obligatoires**.
- Raisons de l'amendement :
  - une idée n'est pas dans le programme. Avec un `Stop`, il faudrait inventer `start`, `locked` et `exceptions` ;
  - le bloc affiche un `ReasonBlock`, qui exige une source (README : « toujours une source ») ;
  - une idée sans justification sourcée ne doit pas exister (principe produit 2), et le schéma l'interdit au lieu de laisser l'écran la masquer.
  
  « Ajouter à ma journée » (F7) passera par `TripPatch` (`add`), et c'est le moteur qui placera l'idée dans le temps.
- **`Day.surprise` plutôt qu'une méthode d'adaptateur** : l'idée est lue avec le jour, sans aller-retour de plus, et elle est choisie côté serveur (sélection de B6 dans la réserve). Le client ne choisit jamais parmi des candidats (« l'agent cherche, l'ancrage vérifie, le moteur planifie »). La méthode `getSurprise` n'est pas retenue.
- Règles Google : `name` suit la règle de `Stop.name` (jamais le nom Google, handover back-end § 5, en revue) ; seul `placeId` vient de Google.
- Jeu simulé : une idée entre crochets pour J2 et J4, avec `source` (`https://example.org/mock/…`, comme les autres sources simulées). Les tests du mock les valident.
- Dans le tableau des champs de B0 (#27), la ligne à ajouter est `Day.surprise | stocké | copie d'un candidat de la réserve, choisi par la sélection`.
- PR : **F5a** (le bloc « Surprends-moi » fait partie de la Journée, critères [a]).

### 4. F5-TL-4 — Recentrage dans la zone non couverte par le panneau
**Retenue, amendée** : une prop séparée, `visibleInsets`, et non la réutilisation de `fitPadding`.

- `DayMap`, en mode `day`, gagne `visibleInsets?: FitPadding` : la partie de la carte couverte par d'autres éléments, le panneau en bas. Le type `FitPadding` de `src/components/carte/types.ts` est réutilisé.
- **Pourquoi pas `fitPadding`** : dans `GoogleMapRenderer`, `fitPadding` fait partie des dépendances de l'effet de cadrage. Le faire suivre la hauteur du panneau (25, 55 ou 92 %) recadrerait toute la carte à chaque changement de hauteur, ce que les critères interdisent : « déplacer ou zoomer la carte ne change rien », et seul le changement de jour recadre. `fitPadding` reste la marge du cadrage initial (panneau à 55 %). `visibleInsets` ne sert qu'au recentrage sur `selectedStopId`, et le changer ne recadre ni ne recentre rien.
- **Calcul** : une fonction pure `offsetCenter(target, insets, zoom)` dans `route.ts` (ou un module voisin) renvoie le centre de carte qui place `target` au milieu de la zone visible. Le décalage en pixels vaut `((left − right) / 2, (bottom − top) / 2)`, converti en latitude et longitude en projection Web Mercator au zoom courant. Les deux rendus l'utilisent :
  - Google : un seul appel `panTo(centre décalé)`, ou `setCenter` sous `prefers-reduced-motion`. On n'enchaîne pas `panTo` puis `panBy`, parce que la seconde animation interrompt la première ;
  - carte simulée : le même centre, dans `simulated-model.ts`.
- Tests :
  - unitaires de `offsetCenter` (inserts nuls : centre inchangé ; panneau en bas : centre au sud de la cible) ;
  - `GoogleMapRenderer` appelle `panTo` avec le centre décalé ;
  - e2e de F5 sur la carte simulée (« centre du marqueur au-dessus du bord supérieur du panneau »).
- Les objets `fitPadding` et `visibleInsets` passés à `DayMap` sont mémoïsés par l'écran. `fitPadding` est calculé au montage à partir de la hauteur de la fenêtre et n'est pas recréé à chaque rendu, sinon l'effet de cadrage se relance.
- PR : **F5a** (modification de F4 avec ses tests, comme le prévoit la liste des fichiers de la spécification).

### 5. F5-TL-5 — Panneau (`Sheet`) et mise en page partagée
**Retenue, précisée.**

#### 5.1 Bibliothèque : aucune
- `Sheet` est écrit sur les Pointer Events natifs (`pointerdown`, `pointermove`, `pointerup`, `pointercancel`, `setPointerCapture`), comme le geste de F6 (décision 0013 § 3.4). Aucune dépendance n'est ajoutée.
- **Non retenus** :
  - le `Drawer` de shadcn/ui (`vaul`, non maintenu, décision 0013 § 3.5) ;
  - le `Dialog` (modal, alors que le panneau ne l'est pas : la carte reste utilisable, sans piège à focus) ;
  - `motion`. Les points d'arrêt se règlent par deux fonctions pures et une transition CSS. `motion` resterait possible par amendement de la décision 0013 § 3.4, avec sa version dans la décision 0003.
- Le handover front § 2 (ligne « Panneau coulissant », qui cite encore le `Drawer`) est mis à jour par la PR F5a avec un renvoi à cette décision. Ce document ne modifie pas le handover.

#### 5.2 Structure
- `src/components/ligne/Sheet.tsx` (composant Ligne) et `src/components/ligne/sheet-model.ts`, qui contient les fonctions pures :
  - `nearestSnap(height, snaps)` ;
  - `snapAfterRelease({ height, velocity, snaps })` : hauteur la plus proche, ou la suivante dans le sens du geste au-delà de 0,5 px/ms, seuil en constante nommée ;
  - `nextSnapUp` et `nextSnapDown` pour la poignée et les flèches, dont le cas « Réduire » de 92 % à 25 %.
  
  Toutes sont testées sans DOM.
- **Vitesse au relâchement, sans seconde copie** : `releaseVelocity` et `VELOCITY_WINDOW_MS` de `src/features/presentation/deck.ts` (#44) mesurent une vitesse horizontale sur une fenêtre de temps. F5a les déplace dans `src/lib/pointer.ts`, avec un axe indifférent (`{ pos, t }`). `deck.ts` les importe, et les tests existants sont déplacés sans changer leurs attentes. Les seuils restent propres à chaque composant (`SWIPE_VELOCITY` pour les cartes, seuil du panneau dans `sheet-model.ts`).
- **Rendu** : pendant le glisser, le panneau se déplace par `transform`, sans recalcul de mise en page à chaque `pointermove`. Au repos, sa hauteur est celle du point d'arrêt, pour que le contenu défile jusqu'au bout à chaque hauteur. Les hauteurs sont des parts de `window.innerHeight`, relues au `resize`, et non de `vh` (barres d'outils mobiles). La transition se fait en CSS, coupée sous `prefers-reduced-motion: reduce`.
- `touch-action: none` sur la poignée et l'en-tête seulement. Le contenu garde son défilement natif : glisser dans le contenu ne déplace jamais le panneau.

#### 5.3 Mise en page partagée
- **Retenu** : carte et panneau sont montés dans `src/app/voyages/[id]/layout.tsx`, et dans son pendant `src/app/dev/voyages/[id]/layout.tsx`. Next.js ne remonte pas un layout quand on passe d'une page enfant à l'autre : la hauteur du panneau est conservée entre Séjour et jours, et elle repart à 55 % au rechargement, sans stockage.
- **Composant client `TripShell`** (`src/features/sejour/TripShell.tsx`) : il reçoit du layout `trip`, `maps` (`getTripMap`, chargé une fois pour tout le voyage) et `routes` (§ 1). Il lit `n` par `useParams()`, choisit la carte (`overview` sans `n`, `day` avec la `DayMap` du jour prise dans `maps`) et rend les pages enfants dans le panneau.
- **Contexte du voyage** : `TripShell` fournit un contexte React (`TripShellContext`) avec :
  - la hauteur du panneau et sa commande (lien d'évitement, marqueur, fiche) ;
  - l'étape sélectionnée ;
  - les adresses ;
  - l'état du programme (§ 6).
  
  Aucune bibliothèque d'état n'est ajoutée (pas de `zustand` ni d'équivalent).
- **Chargement unique par requête** : le layout et la page lisent le même voyage. Un chargeur `src/features/sejour/load.ts` enveloppe `getTripAdapter().getTrip` dans `cache()` de React, pour une seule lecture par requête, sur le modèle de `src/features/presentation/load.ts` (#44). La page valide `n` (`/^[1-9]\d*$/`, dans les limites du voyage) et appelle `notFound()` sinon ; le layout appelle `notFound()` pour un voyage inconnu ou d'une autre organisation.
- `?etape=` est lu par la page ou par le panneau (`useSearchParams`), jamais par le layout, qui ne reçoit pas les paramètres de recherche.
- PR : **F5a**.

### 6. F5-TL-6 — Actions locales du programme
**Retenue, amendée** : interface asynchrone, avec une annulation séparée.

- Interface injectable `ProgrammeActions` dans `src/features/sejour/programme.ts` :
  - `setStopLocked(stopId, locked): Promise<void>` ;
  - `undo(): Promise<void>` : annule la dernière modification du programme ;
  - `setChecklistItemDone(itemId, done): Promise<void>`.
- **Pourquoi une `Promise`** : comme `DeckActions` (décision 0013 § 3.2), l'implémentation serveur de B11 (`applyPatch`, opérations `lock` et `unlock`, action de la liste) se branche sans changer les écrans.
- **Pourquoi `undo` séparé** : en B11, « Annuler » est l'opération `revert` de `TripPatch` (handover back-end, PO-5, en revue) et non une bascule inverse. Si l'écran rappelait `setStopLocked(id, !locked)`, l'implémentation serveur ne pourrait pas faire la différence. La liste n'a pas d'`undo` : la case s'annule elle-même (F5-PO-4).
- **État** : réducteur pur dans `programme.ts`. L'état contient seulement les écarts aux données de l'adaptateur (verrous et cases modifiés, et la dernière modification annulable), et un sélecteur pur `applyProgramme(trip, state)` rend le voyage affiché. L'égalité profonde de l'état avant la modification et après « Annuler » est testée sur le réducteur.
- L'état vit dans `TripShell` (§ 5.3) : un verrou posé sur J2 est toujours là en revenant à J2 depuis J3 ou le Séjour, et rien ne survit au rechargement (F5-PO-16).
- L'implémentation en mémoire est injectée par prop depuis le layout. En B11, l'implémentation serveur appellera `src/adapters` (Server Actions derrière l'adaptateur), jamais une requête directe.
- **Mesure** : l'écran envoie `checklist_item_done` quand `setChecklistItemDone(id, true)` est résolue. L'implémentation ne l'envoie pas, pour qu'un futur enregistrement serveur ne double pas l'événement.
- PR : **F5b** crée l'interface avec `setStopLocked` et `undo` ; **F5c** ajoute `setChecklistItemDone`. Si le CEO réunit les PR, une seule PR crée l'ensemble.

### 7. F5-TL-7 — Type `travel` de `StatusBanner`
**Retenue.**

- `StatusBannerKind` gagne `"travel"`, avec `statusBannerRole("travel") === "status"`. Le filet est provisoire, `bg-ink-soft`, et son rendu est à confirmer par UX/UI (F5-Q1, Q62).
- Aucun des cinq types existants ne convient : ce n'est ni une erreur, ni un conflit, ni une absence d'option, ni un état de réseau ou de génération. Emprunter un type changerait le sens des tests et du rendu de ce type.
- Le message est composé par une fonction pure de `travel.ts` à partir de `travelMinutes`, `travelBudgetMinutes` et des segments (aucune valeur en dur, Q8). `StatusBanner` ne connaît pas la règle du dépassement.
- `/dev/composants` montre le nouveau type, et le test de `statusBannerRole` le couvre.
- PR : **F5a** (critère « Bandeau de trajet » [a]).

### 8. F5-TL-8 — Lien « Idées » par plage de temps libre
**Retenue.** Elle amende la ligne `DayLine` / `ideasHref` du tableau de la décision 0013 § 2.

- `DayLine` remplace `ideasHref?: string` par `getIdeasHref?: (free: { from: Time; to: Time }) => string`, sur le modèle de `getStopHref`. Sans fonction, pas de lien « Idées ». L'ancienne prop est **supprimée**, sans période de coexistence : ses seuls usages sont `DayLine.test.tsx` et `ComposantsShowcase.tsx`, mis à jour dans la même PR.
- L'adresse est construite par `routes.ajouter(n, { from, to })` (§ 1). `from` et `to` sont des `Time` validés (`HH:MM`) : le module les écrit tels quels, sans `URLSearchParams`, qui encoderait `:` en `%3A`. Le critère (`?de=15:00&a=18:30`) compare la chaîne exacte. Ces paramètres sont des heures, jamais un identifiant de lieu.
- PR : **F5b**.

### 9. Q64 (F5-Q3) — Engagement saisi et verrou posé par la personne
**Décision : oui, le contrat les distingue, par un champ propre à l'engagement et indépendant du verrou.**

- `StopSchema` gagne le champ facultatif `commitment?: "ticket" | "reservation"` (`CommitmentSchema = z.enum(["ticket", "reservation"])`) : l'étape correspond à un engagement saisi par la personne avant la génération (cadrage § 3.1, écran 1, « engagements déjà pris », § 3.2 « les engagements deviennent des étapes verrouillées »). Absent : l'étape n'est pas un engagement.
- `locked: boolean` ne change pas. C'est l'état que lisent le moteur (R3 « les étapes verrouillées sont inchangées ») et les opérations `lock` et `unlock`. Un engagement est verrouillé à sa création par le moteur (B5). Le schéma n'impose pas `commitment ⇒ locked` : un engagement déverrouillé garderait ainsi la trace de sa réservation, et cette possibilité relève du Product Owner (ci-dessous).
- **Pourquoi pas un champ `lockedBy` ou `lockReason` attaché au verrou** : il faudrait l'effacer au déverrouillage, et l'information « billets déjà pris » serait perdue. **Pourquoi pas un booléen** : il aurait deux valeurs pour « non » (absent ou `false`), alors que le type d'engagement est saisi par la personne et sert à l'affichage. Ajouter une valeur à l'énumération ne casse rien. Les prestations vendues par une agence (cadrage § 4, « Agences de voyages ») feront l'objet de leur propre décision quand l'offre agences sera spécifiée.
- `ProposalSchema` refuse une proposition dont `stop.commitment` est présent : une proposition de la présentation n'est jamais un engagement. Un test le vérifie.
- Origine des données : saisie de la personne (`TripDraft`, B9), aucune donnée Google. Dans le tableau des champs de B0 (#27), la ligne à ajouter est `Stop.commitment | stocké | saisi par la personne (écran 1)`, et la ligne `Stop.locked` devient « choix de la personne, ou engagement verrouillé par le moteur ».
- **Comportement non tranché ici** (Product Owner, nouvelle question ci-dessous) : faut-il pouvoir déverrouiller un engagement, avec ou sans confirmation, et faut-il une mention qui le distingue d'un verrou posé par la personne (rendu : UX/UI) ? En attendant, F5-PO-10 s'applique : tout verrou est réversible, et F5 n'affiche rien de plus.
- **Application** : F5b ajoute le champ au contrat et ses tests (refus d'une valeur inconnue, refus dans une proposition). Le jeu simulé marque le Tattoo `commitment: "ticket"` (ses billets figurent comme faits dans « À faire avant de partir »). Aucun écran ne change dans F5 sans décision du Product Owner.

## Conséquences
- **F5a** :
  - `src/features/sejour/routes.ts`, `load.ts`, `TripShell.tsx` et le contexte du voyage ;
  - `src/app/voyages/[id]/layout.tsx` et `src/app/dev/voyages/…` (avec leur composant client d'injection) ;
  - `Sheet.tsx` et `sheet-model.ts` ;
  - `src/lib/pointer.ts` (déplacé depuis `deck.ts`) ;
  - `visibleInsets` et `offsetCenter` dans `src/components/carte` ;
  - `Day.surprise` et son jeu simulé ;
  - type `travel` de `StatusBanner` ;
  - lignes 404 du job `docker` ;
  - règle de lint contre la carte simulée (avec les motifs `@/mocks` repris) et son test ;
  - ligne « Panneau coulissant » du handover front § 2.
- **F5b** :
  - variante `openMeal` et ses consommateurs ;
  - `getIdeasHref` à la place de `ideasHref` ;
  - `Stop.commitment` et le Tattoo ;
  - `ProgrammeActions` (`setStopLocked`, `undo`).
- **F5c** : `setChecklistItemDone` et l'envoi de `checklist_item_done` par l'écran.
- La spécification F5 n'a pas à changer pour être conforme. Elle décrit des propositions, tranchées ici, et ses critères ne dépendent pas des amendements. La prochaine mise à jour de la spécification (Product Owner ou frontend) pourra y renvoyer.
- Le handover back-end (#27) devra ajouter `DayLineItem openMeal`, `Day.surprise` et `Stop.commitment` à son tableau des champs, et fixer E8 par la forme du § 2. Le relecteur de #27 le signale si #27 est fusionnée après celle-ci, sinon la tâche B2 s'en charge.
- Revue des PR F5a, F5b et F5c : le Tech Lead vérifie leur conformité à cette décision. Un écart demande un amendement écrit ici, pas une exception silencieuse.

## Questions liées
**Nouvelle question (Product Owner)** :
- Avec `Stop.commitment` (§ 9), peut-on déverrouiller un engagement (billet, réservation) depuis la fiche, avec ou sans confirmation ? Faut-il une mention propre aux engagements (rendu : UX/UI) ?
- Ne bloque pas F5 : F5-PO-10 s'applique en attendant.

**Questions déjà ouvertes, rappelées** :
- **Q63** et **Q67** (Samuel) : ce que montre un voyage non débloqué, et « Garder » sur la fiche. Aucune décision technique ici n'en préjuge.
- **Q62** (UX/UI, F5-Q1) : rendus provisoires, dont le filet du type `travel`.
- **Q5** et **Q14** (Samuel, juridique) : origine et conservation des données de lieux. Elles concernent aussi `Day.surprise` quand les données seront réelles.
