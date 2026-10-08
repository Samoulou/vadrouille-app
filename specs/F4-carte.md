# F4 — Carte Google Maps

Rôle : frontend · Prérequis : F3 livrée dans `main` (donc F1, F2 et F0) · Ticket : #24 · Référence : `docs/handovers/frontend.md` (§ 0 règles 3 et 4, § 2, § 3, § 5 `StopMarker`, § 6 écrans 11 et 12, § 7, § 8, § 9, § 10, § 11, § 13, § 14, § 15 F4), `docs/produit/cadrage-v5.md` (§ 6.4, § 6.5 « Règles Google Maps Platform appliquées », § 9), `docs/design-system/carte.md`, `docs/design-system/components/StopMarker/` (README et `preview.html`), `docs/design-system/redaction.md`, `docs/CONTEXT.md` (principe technique 2, « Qui décide quoi »), `specs/F1-contrats-donnees-simulees.md`, `specs/F3-ligne-du-jour.md`, `QUESTIONS.md` (Q3 tranchée, Q5, Q6, Q12, Q14, Q18, Q19). Dossier UX : `docs/ux/dossier-ux.md` n'est pas encore exporté (Q12) ; les critères de l'écran 12 viennent du handover § 6.

## Objectif
Livrer un composant de carte réutilisable qui affiche, sur une carte Google (Maps JavaScript API, Map ID au style Ligne), les étapes d'une journée avec les marqueurs `StopMarker` de F3, le tracé du jour et la synchronisation avec la liste, ainsi qu'une vue d'ensemble du séjour ; avec un état de remplacement quand la carte ne peut pas s'afficher, sans aucune persistance locale de données Google et sans dépendre du réseau Google en CI. Les écrans Séjour (11) et Journée (12) l'assemblent dans F5.

## Prérequis vérifiables
| Élément | Livré par | Référence |
|---|---|---|
| Types `Day`, `DayLineItem`, `Stop`, schémas stricts, adaptateur `mock`, règle « `src/mocks` importé seulement depuis `src/adapters` et les tests » | F1 (#11) | `specs/F1-contrats-donnees-simulees.md` |
| `IconButton`, `Button`, `StatusBanner`, page `/dev/composants`, test de contraste, règle `react/jsx-no-literals` | F2 | `specs/F2-composants-base.md` |
| `StopMarker` (variantes « carte » : arrêt numéroté 26 px, sélectionné 38 px, terminus 24 px, vue d'ensemble 12 px), `DayLine`, `provisoire.css` | F3 | `specs/F3-ligne-du-jour.md` |
| Variables `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` et `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` posées dans Vercel, clé restreinte au staging et à localhost, Maps JavaScript API seulement, style Carte appliqué à l'ID | Samuel (Q3, 2026-10-08) | `QUESTIONS.md` |

## Périmètre
- Carte d'une journée : marqueurs numérotés, terminus, tracé, arrêt sélectionné, cadrage initial, recentrage sur sélection, signal « marqueur touché » vers la liste.
- Vue d'ensemble du séjour : petits anneaux sans numéro, sans tracé, pour l'écran 11.
- État de remplacement (configuration absente, erreur de chargement, hors ligne) et composant de mention « Données de lieux : Google ».
- Positions des étapes simulées (phase 0) et contrat qui les porte, en proposition au Tech Lead (F4-TL-1).
- Carte simulée pour les tests, page de démonstration `/dev/carte`, tests unitaires, e2e, a11y et visuels sans réseau Google.

## Choix réservés au Tech Lead (signalés, non tranchés ici)
- **Bibliothèque de chargement de Maps.** Le handover § 2 et § 8 nomme `@vis.gl/react-google-maps` ; le choix définitif (cette bibliothèque, `@googlemaps/js-api-loader` ou autre), sa version et la forme d'injection de la carte simulée sont des décisions d'architecture du Tech Lead (délégation « bibliothèques, outillage, tests »). Le frontend les soumet dans sa PR ; le Tech Lead les confirme à la revue ou par une décision dans `docs/decisions/`. Les critères ci-dessous ne dépendent pas de la bibliothèque.
- **Forme du contrat des positions** (F4-TL-1) : proposition ci-dessous, à confirmer par le Tech Lead (lié à Q14 et au § 5 du handover back-end de B0).
- **Emplacement des fichiers** : la liste ci-dessous est une proposition ; un renommage par le Tech Lead ne change pas les critères.

## Fichiers à créer (proposition)
- `src/contracts/map.ts` : schéma Zod strict et type `DayMap` (F4-TL-1), réexportés par `src/contracts/index.ts`.
- `src/adapters/types.ts` et `src/adapters/mock.ts` : méthode `getDayMap(ctx, tripId, index): Promise<DayMap | null>` et `getTripMap(ctx, tripId): Promise<DayMap[]>` (même isolation par organisation que F1).
- `src/mocks/edimbourg-carte.ts` : positions simulées des terminus et des étapes des 6 jours d'Édimbourg (F4-PO-2).
- `src/components/carte/DayMap.tsx` : carte d'une journée et vue d'ensemble (prop `mode`).
- `src/components/carte/GoogleMapRenderer.tsx` : rendu Google (chargement de l'API, Map ID, marqueurs avancés HTML, polylignes).
- `src/components/carte/SimulatedMapRenderer.tsx` : rendu simulé, sans aucune requête réseau, pour les tests et `/dev/carte` (F4-TL-2).
- `src/components/carte/MapFallback.tsx` : état de remplacement (F4-PO-8).
- `src/components/carte/PlacesAttribution.tsx` : mention « Données de lieux : Google » (F4-PO-9).
- `src/components/carte/route.ts` : construction du tracé et de la numérotation à partir de `Day.items` et `DayMap` (fonctions pures).
- `src/app/dev/carte/page.tsx` : démonstration carte + `DayLine` synchronisées, désactivée en production comme `/dev/tokens` (`devPagesEnabled`).
- Textes dans `src/i18n/fr.json` sous `carte.*` ; tests à côté des fichiers (`*.test.ts(x)`), `tests/e2e/carte.e2e.spec.ts`, `tests/e2e/carte.a11y.spec.ts`, `tests/visual/carte.visual.spec.ts` et leurs références.
- `.env.example` : les deux noms de variables, valeurs vides (aucune valeur réelle commitée).

### Props (proposition, à confirmer par le Tech Lead à la revue)
```ts
import type { Day, DayMap } from "@/contracts";

type DayMapProps =
  | {
      mode: "day";
      day: Day;                         // fournit l'ordre et la numérotation (items)
      map: DayMap;                      // positions (F4-TL-1)
      selectedStopId?: string;          // étape dont la fiche est ouverte (F4-PO-5)
      onMarkerPress?: (stopId: string) => void;   // F4-PO-4
      listId: string;                   // id de la liste, cible du lien d'évitement (F4-PO-10)
      fitPadding?: { top: number; right: number; bottom: number; left: number }; // F5 y réserve la place du panneau
      placesFromGoogle: boolean;        // F4-PO-9 ; false avec l'adaptateur mock
    }
  | {
      mode: "overview";
      days: Day[];
      maps: DayMap[];
      placesFromGoogle: boolean;
    };
```

## Comportement

### Marqueurs
- Un marqueur par élément `type: "stop"` de `day.items` ayant une position dans `DayMap`, numéroté par son rang parmi les étapes (`type: "stop"`) de `day.items` (1, 2, 3…), que l'étape ait une position ou non : une étape sans position garde son numéro dans la liste et ne décale pas les suivantes (marqueurs 1, 3, 4 si l'étape 2 n'a pas de position), pour que la carte et la `DayLine` concordent, comme le veut le README de `StopMarker` (« Le numéro sur la carte suit l'ordre de la journée »). Les éléments `segment` et `free` n'ont pas de marqueur ; `Day.events` n'est pas affiché sur la carte (F4-PO-3).
- Marqueur = `StopMarker` de F3, variante « carte » : arrêt numéroté (`--ligne-stop-map`, 26 px), sélectionné (`--ligne-stop-map-selected`, 38 px, plein `line`, anneau `page`), terminus carré 24 px avec maison, jamais numéroté. `StopMarker` reste décoratif (`aria-hidden`) ; c'est son conteneur qui porte le rôle et le nom accessible (F4-PO-10).
- Terminus : un marqueur pour le départ et un pour le retour ; s'ils ont la même position (même logement), un seul marqueur (F4-PO-3).
- Un seul marqueur sélectionné à la fois, celui de `selectedStopId` ; il est dessiné au-dessus des autres.
- Rendu Google : marqueurs avancés en HTML (handover § 8), qui exigent la bibliothèque `marker` de la Maps JavaScript API et le Map ID.

### Tracé
- Polyligne qui relie, dans l'ordre de `day.items`, le terminus de départ, chaque étape positionnée, puis le terminus de retour. Avec `n` = nombre d'étapes positionnées du jour (n ≥ 1), le tracé compte `n + 1` tronçons, y compris quand départ et retour sont fusionnés en un seul marqueur (le tracé part de ce point et y revient). Un terminus sans position est omis, ainsi que le tronçon qui le touche. Couleur `line`, épaisseur `--ligne-rail` (4 px), extrémités arrondies si l'API le permet (sinon écart listé dans la PR).
- Pointillé seulement pour le dernier tronçon vers le logement quand le segment qui le précède est `walk` (handover § 8, `carte.md` : « le retour à pied vers l'hôtel en pointillé ») ; tous les autres tronçons sont pleins (F4-PO-6).
- Phase 0 : chaque tronçon est une ligne droite entre deux positions. Aucun appel à Routes API ni à Directions : la clé serveur n'existe pas (Q3) et l'itinéraire réel viendra du back-end.
- Les couleurs passées à l'API Google sont lues dans les variables CSS des tokens à l'exécution (`getComputedStyle`) : aucune couleur en dur dans le code.

### Cadrage et synchronisation carte ↔ liste (critères écran 12)
- Au montage, la carte cadre toutes les positions de la journée (terminus compris), avec la marge `fitPadding` (par défaut `--touch-target` de chaque côté) (F4-PO-7).
- **Toucher un marqueur** appelle `onMarkerPress(stopId)` ; l'appelant fait défiler la liste jusqu'à l'étape. Le marqueur touché ne devient pas sélectionné et aucune fiche ne s'ouvre (F4-PO-4). Quand deux marqueurs (ou leurs zones actives de 44 px) se chevauchent, aucune règle n'est promise sur celui qui reçoit le toucher : c'est l'ordre de superposition du rendu, à revoir avec UX/UI (F4-Q3) ; aucun critère ne le teste.
- **Changement de `selectedStopId`** (étape touchée dans la liste, fiche ouverte par F5) : la carte se recentre sur l'étape sans changer le zoom ; avec `prefers-reduced-motion`, recentrage instantané (F4-PO-5).
- **Déplacer ou zoomer la carte** ne déclenche aucun rappel vers la liste, ne change pas `selectedStopId` et ne recadre pas ; seul un nouveau `day` (changement de jour) recadre.
- Pas de glissement horizontal pour changer de jour : la carte capte les gestes pour elle-même (`gestureHandling` « greedy »), les contrôles Google par défaut sont masqués (`disableDefaultUI`) ; les contrôles posés sur la carte (retour, partager) relèvent de F5 (`carte.md`, « Contrôles posés sur la carte ») (F4-PO-7).

### Vue d'ensemble (`mode: "overview"`)
- Toutes les étapes positionnées de tous les jours en anneaux de 12 px sans numéro (`StopMarker` `overview`), plus un anneau de 12 px par position de terminus distincte (les terminus de même position, d'un même jour ou de jours différents, ne donnent qu'un anneau ; ni carré ni maison en vue d'ensemble, F4-PO-3) ; pas de tracé, pas de sélection, marqueurs non interactifs et masqués aux technologies d'assistance (la rangée des jours et la liste « jour par jour » de l'écran 11 portent l'information). Cadrage initial sur toutes les positions.

### Mention d'attribution
- Sur la carte Google : le logo Google et les liens de conditions affichés par l'API ne sont jamais masqués, recouverts ni déplacés hors de la zone visible ; aucun style du dépôt ne cible les éléments d'attribution de Google.
- Sans carte (état de remplacement, ou tout écran qui affiche des données de lieux sans carte) : le composant `PlacesAttribution` affiche « Données de lieux : Google » quand `placesFromGoogle` vaut `true` (F4-PO-9).

### État de remplacement (sans clé, erreur, hors ligne)
Même emplacement et même hauteur que la carte (aucun décalage de mise en page), fond `muted`, texte `ink-2`, `role="status"` ; la liste reste complète et utilisable. Trois causes (F4-PO-8) :
- hors ligne (`navigator.onLine` faux ou événement `offline`) : « Carte indisponible hors ligne » (handover § 8 et § 13) ; retour automatique à la carte à l'événement `online`. **Ce test est fait par l'enveloppe `DayMap`, quel que soit le rendu** (Google ou simulé) : la carte simulée passe donc aussi à cet état hors ligne ;
- configuration absente (clé ou Map ID vide dans la configuration injectée, voir « Configuration injectable ») : « Carte indisponible. La liste contient tout le programme. » Aucun chargement de script n'est tenté. Le nom des variables n'apparaît jamais dans l'interface (avertissement en console en développement seulement). **Ce contrôle ne s'applique qu'au rendu Google** : la carte simulée ne lit pas la configuration et s'affiche sans clé ni Map ID (c'est le cas de la CI) ;
- erreur de chargement (rendu Google seulement : échec du script, refus de la clé signalé par l'API, délai de 10 s dépassé) : « La carte n'a pas pu être chargée. La liste contient tout le programme. » et un bouton « Réessayer » (`Button` `secondary` `sm`).

**Précédence** quand plusieurs causes sont réunies : hors ligne, puis configuration absente, puis erreur de chargement. Un seul état est affiché. Hors ligne, aucun chargement n'est tenté, même avec une configuration complète ; au retour en ligne, l'enveloppe réévalue la cause suivante (configuration absente, sinon nouveau chargement). Le cas « jour sans aucune position » (F4-PO-3) est traité avant le choix du rendu, avec le texte de la configuration absente, et cède lui aussi la place à l'état hors ligne.

Puis `PlacesAttribution` selon `placesFromGoogle`.

### Accessibilité de la carte et alternative liste
- La carte n'est jamais la seule source d'information (handover § 11) : tout ce qu'elle montre (étapes, ordre, logement) est dans la `DayLine` de la même page.
- Un lien d'évitement « Aller à la liste des étapes » précède la carte, visible au focus, vers `#{listId}` (F4-PO-10). L'élément cible porte `tabindex="-1"`, posé par l'appelant (F5, et `/dev/carte` dans F4), pour pouvoir recevoir le focus ; activer le lien y amène le focus (`document.activeElement` est la cible).
- Conteneur de la carte : `role="region"`, nom accessible « Carte du jour {n} » (vue d'ensemble : « Carte du séjour »).
- En mode `day`, chaque marqueur d'étape est un bouton focusable, au moins 44 × 44 px de zone active (la pastille visuelle garde 26 ou 38 px), nom accessible « Étape {numéro} : {name} », `aria-pressed` absent, `aria-current="true"` sur l'étape sélectionnée ; le terminus est un élément non focusable, `aria-hidden="true"`, ni bouton ni `tabindex`, son information étant dans la liste. Ordre de tabulation : lien d'évitement, marqueurs dans l'ordre de la journée, puis la suite de la page. Entrée ou Espace sur un marqueur = toucher.
- Focus visible : contour 2 px `line` décalé de 2 px, comme le reste de l'interface.
- Aucune animation propre à F4 hors le recentrage ; `prefers-reduced-motion` le rend instantané.

## Règles Google
- **Aucune donnée Google persistée côté client** (handover § 0 règle 4 et § 8, cadrage § 6.5) : F4 n'écrit rien dans `localStorage`, `sessionStorage`, IndexedDB, Cache Storage ni cookies ; aucune coordonnée n'est persistée, même simulée ; pas de cache de tuiles (aucun service worker dans F4). Vérifié par un test e2e et par une règle de lint (critères).
- **Données simulées seulement en phase 0** : les noms, positions et étapes viennent de l'adaptateur `mock` ; positions saisies à la main, jamais obtenues d'un service Google (F4-PO-2). `placesFromGoogle` vaut `false` partout en phase 0.
- **Aucun appel Places, Routes, Directions, Geocoding ni Distance Matrix** : la clé serveur n'existe pas (Q3 : « Clé serveur Places/Routes : avec P0 ») et la clé du navigateur est restreinte à la Maps JavaScript API. Seules les bibliothèques `maps` et `marker` de la Maps JavaScript API sont chargées.
- **Aucune donnée Google dans un prompt** : sans objet dans F4 (aucun appel de modèle), rappelé pour les tâches qui réutiliseront ces composants.
- **Clés** : lues uniquement dans `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` et `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`, à travers une lecture de configuration injectable (voir « Configuration injectable ») ; jamais commitées ; aucune clé utilisée en CI ni dans les tests ; aucune clé de production (il n'en existe pas).
- **Google data sur une autre carte** : la carte simulée n'affiche que les données simulées du dépôt, n'est accessible que sur les pages de développement et les tests, et ne dessine aucun fond cartographique (F4-TL-2).

## Tests

### Configuration injectable
Les variables `NEXT_PUBLIC_*` sont figées au moment du build : un même build ne peut pas servir à la fois « clé absente » et « clé factice ». La configuration de la carte (`{ apiKey?: string; mapId?: string }`) est donc lue par une fonction ou un contexte injectable (prop ou contexte React, au choix du Tech Lead : F4-TL-3), dont la valeur par défaut lit `process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` et `process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`. Les tests unitaires et `/dev/carte` (paramètre de démonstration, par exemple `?config=absente` ou `?config=factice`, disponible seulement sur les pages de développement) injectent une configuration vide ou factice (`apiKey: "test-key"`, `mapId: "test-map"`), si bien que `pnpm verify` ne dépend pas de l'environnement du build. Les routes de production n'utilisent que la valeur par défaut.

### Ne pas dépendre du réseau Google en CI
- La CI n'a ni clé ni Map ID : avec le rendu Google, sans configuration, l'application affiche l'état de remplacement « configuration absente » ; les tests l'obtiennent par injection d'une configuration vide, sans dépendre de l'environnement du build. La carte simulée ne lit pas la configuration (voir « État de remplacement ») : elle s'affiche en CI sans clé, ce qui rend exécutables les tests du jour 2, du glisser, de la sélection et les captures ; seul l'état hors ligne de l'enveloppe la remplace.
- Les tests de la carte utilisent la carte simulée (`SimulatedMapRenderer`) : mêmes props, même numérotation, même tracé (fonctions pures de `route.ts`), mêmes boutons de marqueurs, rendus en HTML et SVG, sans fond de carte ni requête réseau. Modèle minimal, déterministe (F4-TL-2) :
  - état `{ center: { lat, lng }, zoom }` exposé en attributs `data-center-lat`, `data-center-lng` et `data-zoom` sur le conteneur ;
  - projection équirectangulaire fixe : au zoom z, 1 degré = 256 × 2^z / 360 px, en longitude comme en latitude, sans correction de Mercator (suffisant à l'échelle d'une ville) ; un marqueur est placé depuis le centre du conteneur à `x = (lng − center.lng) × échelle` vers la droite et `y = (lat − center.lat) × échelle` vers le haut (latitude croissante vers le haut, comme sur une carte ; en coordonnées d'écran, `top = centre − y`) ;
  - cadrage : centre = milieu de la boîte englobante des positions, zoom = plus grand entier qui fait tenir la boîte dans le conteneur moins `fitPadding` ;
  - recentrage sur `selectedStopId` : `center` = position de l'étape, zoom inchangé, sans transition ;
  - glisser (pointeur ou toucher) : `center` déplacé de l'opposé du déplacement converti par l'échelle, sans rappel vers l'appelant ;
  - changement de `day` : nouveau cadrage ; aucun autre événement ne recadre.

  La carte simulée est sélectionnée par injection (contexte React ou prop, au choix du Tech Lead) sur `/dev/carte`, jamais dans une route de production : en build de production, elle n'est disponible que si `VADROUILLE_DEV_PAGES=1` (Playwright).
- Chaque spec Playwright de F4 intercepte `**/*.googleapis.com/**`, `**/*.gstatic.com/**` et `**/maps.google.com/**` et les fait échouer (`route.abort()`), puis vérifie qu'aucune requête n'y a été tentée par la carte simulée ; une spec dédiée force le rendu Google avec une clé factice (`test-key`, jamais une vraie clé) pour vérifier qu'une requête bloquée produit l'état « erreur de chargement ».
- Le rendu Google est vérifié **en unitaire seulement**, avec la bibliothèque de chargement simulée (`vi.mock`) : options passées (Map ID, `disableDefaultUI`, `gestureHandling`, bibliothèques demandées), nombre de marqueurs, options des polylignes. Le recentrage du rendu Google (`panTo` avec la position de l'étape, sans `setZoom` ; `setCenter` avec `prefers-reduced-motion`) et le cadrage (`fitBounds`) ne sont vérifiables qu'ainsi. Les critères Playwright de centre, de glisser et de recadrage portent sur la carte simulée.
- Validation de la vraie carte (style du Map ID, rendu des marqueurs avancés) : manuelle, par une capture jointe à la PR prise sur un déploiement où la clé est acceptée (voir la question F4-Q1) ; elle n'entre pas dans `pnpm verify`.

### Unitaires (Vitest, Testing Library, axe)
- `route.ts` : numérotation, tronçons, pointillé du retour à pied, terminus fusionnés, étapes sans position ignorées.
- `DayMapSchema` strict ; `validateDayMap(day, map)` ; `getDayMap` et `getTripMap` du mock ; isolation par organisation.
- `DayMap`, `MapFallback`, `PlacesAttribution`, `GoogleMapRenderer` (bibliothèque simulée), `SimulatedMapRenderer`.

### E2E, a11y et visuel (Playwright, 390 × 844, build de production)
- `tests/e2e/carte.e2e.spec.ts` sur `/dev/carte` : synchronisation, recentrage, état de remplacement, stockage client vide, absence de requête Google.
- `tests/e2e/carte.a11y.spec.ts` : axe sur `/dev/carte` dans chaque état.
- `tests/visual/carte.visual.spec.ts` : captures de la carte simulée (jour 2 avec étape sélectionnée, vue d'ensemble) et des trois états de remplacement ; références régénérées selon la décision 0004.

## Décisions (Product Owner, définitives sans veto de Samuel sous 2 jours)
F4-PO-1 et F4-PO-11 sont sortis de cette rubrique après la revue du Tech Lead (points d'architecture) : voir « Propositions au Tech Lead » (F4-TL-1 et F4-TL-2). Une décision marquée « provisoire (UX/UI) » porte sur un rendu non maquetté et peut être changée par UX/UI.
- **F4-PO-2 — Positions simulées.** Le mock fournit une position pour chaque terminus et chaque étape des 6 jours d'Édimbourg, saisie à la main d'après la géographie publique de la ville, arrondie à 3 décimales (environ 100 m), jamais copiée depuis Google Maps ni obtenue par un service Google ; le fichier le dit en commentaire. Aucune autre donnée de lieu n'est ajoutée.
- **F4-PO-3 — Ce que la carte montre.** Les étapes de la ligne (`type: "stop"`) et les terminus ; ni segments, ni temps libre, ni `Day.events` en marqueurs. Un terminus de départ et de retour à la même position = un seul marqueur. Une étape sans position est absente de la carte, reste dans la liste, garde son numéro (rang dans `day.items`, sans renumérotation des suivantes) et le tracé relie ses voisines. Sans aucune position pour le jour (`DayMap` absent ou vide), aucun script n'est chargé et l'état de remplacement affiche « Carte indisponible. La liste contient tout le programme. », sans bouton « Réessayer ». En vue d'ensemble, chaque position de terminus distincte est un anneau de 12 px comme les étapes (le logement reste repérable sans y ajouter de forme non maquettée).
- **F4-PO-4 — Toucher un marqueur.** Fait défiler la liste jusqu'à l'étape (via `onMarkerPress`), sans ouvrir la fiche ni changer la sélection : le README de `StopMarker` lie la sélection à la fiche ouverte, et le handover § 6 (écran 12) ne demande que le défilement.
- **F4-PO-5 — Sélection et recentrage.** `selectedStopId` (fiche ouverte) sélectionne le marqueur et recentre la carte sans changer le zoom ; aucun recadrage automatique ensuite, pour respecter « déplacer la carte ne change pas la liste » dans les deux sens.
- **F4-PO-6 — Pointillé du tracé (provisoire, UX/UI).** Seul le dernier tronçon vers le logement, quand il se fait à pied, est en pointillé (handover § 8, `carte.md`) ; les autres trajets à pied sont pleins sur la carte, même s'ils sont pointillés sur la ligne du jour (F3). Écart de texture voulu entre ligne et carte, à confirmer par UX/UI s'il gêne (F4-Q3).
- **F4-PO-7 — Cadrage et gestes.** Cadrage initial sur toutes les positions du jour avec une marge réglable par l'appelant ; contrôles Google par défaut masqués ; la carte capte les gestes à un doigt (« greedy »), puisque le défilement de la page se fait dans le panneau (F5).
- **F4-PO-8 — État de remplacement (provisoire, UX/UI).** Trois causes (configuration absente, erreur de chargement avec « Réessayer », hors ligne) ; délai de chargement de 10 s avant l'état d'erreur ; précédence hors ligne, puis configuration absente, puis erreur de chargement ; le contrôle de configuration ne vise que le rendu Google, le test hors ligne vaut pour tout rendu ; textes ci-dessus, proposés dans `fr.json` et soumis à UX/UI (rendu non maquetté, F4-Q2).
- **F4-PO-9 — Mention « Données de lieux : Google ».** Rendue par `PlacesAttribution` seulement quand `placesFromGoogle` vaut `true`. En phase 0, aucune donnée affichée ne vient de Google : la mention n'est pas rendue (l'afficher sur des données simulées serait inexact) ; `/dev/carte` montre les deux cas. L'attribution native de la carte Google n'est jamais masquée.
- **F4-PO-10 — Accessibilité des marqueurs.** Marqueurs d'étape focusables avec le nom « Étape {numéro} : {name} », zone active d'au moins 44 × 44 px ; terminus et marqueurs de vue d'ensemble : éléments non focusables, `aria-hidden="true"`, ni bouton ni `tabindex` ; lien d'évitement « Aller à la liste des étapes » avant la carte. La liste reste l'alternative complète.

## Propositions au Tech Lead (architecture et tests, à confirmer à la revue de la PR de code ou par une décision dans `docs/decisions/`)
- **F4-TL-1 — Positions dans un contrat séparé (ex-F4-PO-1).** Les positions ne sont pas ajoutées à `Stop` (F1 refuse `location`, `lat`, `lng` pour empêcher d'y glisser des contenus Google). Elles vivent dans un contrat à part, `DayMap`, chargé à la demande pour l'affichage et jamais persisté côté client. Forme proposée (lié à Q14 et au § 5 de B0) : `{ tripId, dayIndex, points: { ref: { type: "stop"; stopId } | { type: "terminus"; role: "start" | "end" }; lat: number; lng: number }[] }`, objet strict, `lat` dans [-90, 90], `lng` dans [-180, 180], au plus un point par référence. « `stopId` existant dans le jour » ne se vérifie pas par le schéma seul : une fonction pure séparée, `validateDayMap(day, map)`, vérifie aussi que `tripId` et `dayIndex` correspondent au jour et que chaque `stopId` désigne un élément `type: "stop"` de `day.items` ; elle est appelée par l'adaptateur `mock` et testée.
- **F4-TL-2 — Carte simulée (ex-F4-PO-11).** Rendu de test sans fond cartographique ni réseau, réservé à `/dev/carte` et aux tests, qui n'affiche que les données simulées du dépôt ; elle sert aux tests e2e, a11y et visuels de F4 et pourra servir à ceux de F5. Modèle minimal décrit dans « Tests » ; mécanisme d'injection au choix du Tech Lead.
- **F4-TL-3 — Configuration injectable.** Configuration de la carte lue par prop ou contexte, valeur par défaut `process.env` (voir « Configuration injectable »).

## Critères d'acceptation
- [ ] `pnpm verify` passe sans clé ni Map ID dans l'environnement.
- [ ] `DayMapSchema` refuse un champ inconnu (`rating`, `openingHours`, `photos`, `name`, `address`), une `lat` hors [-90, 90], une `lng` hors [-180, 180], deux points pour la même référence (tests). `validateDayMap(day, map)` signale un `stopId` absent de `day.items` ou désignant un élément qui n'est pas une étape, et un `tripId` ou `dayIndex` qui ne correspond pas au jour ; elle ne signale rien sur les données du mock (tests).
- [ ] Le mock fournit une position pour chaque terminus et chaque étape des 6 jours ; toutes les positions ont au plus 3 décimales ; `TripSchema.parse` et `DayMapSchema.parse` réussissent ; `getDayMap` et `getTripMap` renvoient `null` ou `[]` pour une autre organisation (tests).
- [ ] `route.ts` : pour un jour à 4 étapes, numéros 1 à 4 dans l'ordre de `items` ; si l'étape 2 n'a pas de position, les marqueurs portent 1, 3 et 4 (rang dans `day.items`, identique à la liste) ; terminus sans numéro ; un seul terminus quand départ et retour ont la même position ; avec `n` étapes positionnées (n ≥ 1), tracé de `n + 1` tronçons, y compris quand départ et retour sont fusionnés, dont seul le dernier est pointillé si et seulement si le segment qui le précède est `walk` ; une étape sans position n'a pas de marqueur et ses voisines sont reliées (tests).
- [ ] Rendu Google (bibliothèque simulée) : Map ID égal à `config.mapId` de la configuration injectée, `disableDefaultUI` vrai, `gestureHandling` « greedy », bibliothèques demandées limitées à `maps` et `marker` ; un marqueur avancé par étape positionnée et par terminus distinct ; polyligne de couleur égale à la valeur calculée du token `line` et d'épaisseur 4 (tests).
- [ ] La configuration est lue par la fonction ou le contexte injectable, dont la valeur par défaut lit les deux variables `NEXT_PUBLIC_*` (test unitaire). Avec le rendu Google et une configuration injectée sans clé ou sans Map ID, aucun script Google n'est demandé et l'état « Carte indisponible. La liste contient tout le programme. » s'affiche avec `role="status"` ; aucun nom de variable n'apparaît dans le DOM (test unitaire et Playwright). Avec la carte simulée et la même configuration vide, la carte simulée s'affiche (aucun état de remplacement) (test unitaire et Playwright).
- [ ] Avec une configuration factice injectée (`apiKey: "test-key"`) et les domaines Google bloqués, l'état « La carte n'a pas pu être chargée » et un bouton « Réessayer » s'affichent au plus tard 10 s après le montage ; « Réessayer » relance un chargement (Playwright, horloge simulée admise).
- [ ] Hors ligne (`context.setOffline(true)`), l'état « Carte indisponible hors ligne » s'affiche avec la carte simulée comme avec le rendu Google ; la `DayLine` voisine reste entièrement lisible ; de retour en ligne, l'état disparaît et la carte simulée revient (Playwright, carte simulée).
- [ ] Précédence : hors ligne avec une configuration vide → « Carte indisponible hors ligne » ; de retour en ligne avec la configuration vide → « Carte indisponible. La liste contient tout le programme. » ; hors ligne avec une configuration factice → aucun chargement tenté et « Carte indisponible hors ligne », jamais l'état d'erreur (test unitaire de l'enveloppe `DayMap`, rendu Google avec bibliothèque simulée).
- [ ] L'état de remplacement occupe la même hauteur que la carte : la position de la `DayLine` ne change pas entre la carte simulée et chacun des trois états de remplacement (hors ligne sur la carte simulée ; configuration absente et erreur de chargement sur le rendu Google, configuration injectée) (Playwright, écart de 0 px).
- [ ] `/dev/carte`, carte simulée, jour 2 : autant de boutons de marqueur que d'étapes du jour, noms « Étape 1 : … » à « Étape n : … » dans l'ordre de la `DayLine` ; le terminus n'est ni un bouton ni focusable (aucun `tabindex`) et porte `aria-hidden="true"` (Playwright et axe).
- [ ] Toucher le marqueur « Étape 3 » fait entrer l'étape 3 de la `DayLine` dans la zone visible, ne change pas l'URL, n'ouvre aucune fiche et ne sélectionne pas le marqueur (Playwright).
- [ ] Toucher l'étape 3 dans la liste de `/dev/carte` (qui simule l'ouverture de la fiche en posant `selectedStopId`) rend le marqueur 3 sélectionné (38 px, plein `line`, `aria-current="true"`), seul sélectionné, et la carte simulée a pour centre (`data-center-lat`, `data-center-lng`) la position de l'étape, zoom inchangé, le marqueur 3 étant au centre du conteneur à 2 px près (Playwright, carte simulée) ; pour le rendu Google, `panTo` est appelé avec cette position et `setZoom` n'est pas appelé (unitaire).
- [ ] Glisser la carte simulée de 100 px vers la gauche déplace `data-center-lng` de la valeur prévue par le modèle, ne change ni `data-zoom`, ni le défilement de la liste, ni la sélection, et n'appelle pas `onMarkerPress` (Playwright) ; changer de jour recadre : toutes les positions du nouveau jour sont dans le conteneur et `data-zoom` vaut la valeur calculée par le modèle (Playwright, carte simulée ; `fitBounds` du rendu Google en unitaire).
- [ ] Vue d'ensemble : un anneau de 12 px sans numéro par étape positionnée des 6 jours et un par position de terminus distincte (aucun carré de terminus), aucun tracé, aucun marqueur focusable, marqueurs `aria-hidden` (tests).
- [ ] Accessibilité : axe sans violation sur `/dev/carte` (carte simulée, chaque état de remplacement, vue d'ensemble) (`pnpm test:a11y`) ; région nommée « Carte du jour 2 » ; lien d'évitement visible au focus, premier élément focusable de la démonstration ; l'activer rend `document.activeElement` égal à la cible `#{listId}`, qui porte `tabindex="-1"` ; ordre de tabulation lien, marqueurs 1 à n, puis liste ; zone active de chaque marqueur d'au moins 44 × 44 px ; contour de focus 2 px `line` (Playwright).
- [ ] Avec `prefers-reduced-motion: reduce`, le recentrage est instantané (aucune transition calculée) (Playwright).
- [ ] **Aucune persistance locale** : après le parcours complet de `/dev/carte` (chargement, touchers, sélection, changement de jour, hors ligne puis en ligne), `localStorage` et `sessionStorage` sont vides, `indexedDB.databases()` renvoie une liste vide, `caches.keys()` renvoie une liste vide, aucun cookie n'est posé, aucun service worker n'est enregistré (test Playwright nommé `carte: aucune donnée persistée côté client`).
- [ ] `pnpm lint` échoue si un fichier de `src/components/carte` ou `src/app/dev/carte` utilise `localStorage`, `sessionStorage`, `indexedDB`, `caches` ou `document.cookie` (règle `no-restricted-globals` ou `no-restricted-properties`, avec un test de la règle comme pour la règle anti-couleurs de F0).
- [ ] **Aucun appel Places ni Routes** : aucune spec de F4 n'observe de requête vers `places.googleapis.com` ou `routes.googleapis.com` ; un test unitaire capte toutes les bibliothèques demandées au chargeur (options du chargeur et chaque appel d'importation de bibliothèque, par exemple `importLibrary`, avec la bibliothèque simulée) et échoue si l'une d'elles n'appartient pas à la liste blanche `["maps", "marker"]`. Pas de recherche de mots dans les fichiers ni dans le paramètre `libraries=` de l'URL : elle donnerait des faux positifs (`placesFromGoogle`, `PlacesAttribution`) (tests).
- [ ] La carte simulée ne fait aucune requête réseau (Playwright, domaines Google bloqués, zéro requête interceptée) et n'est pas accessible hors des pages de développement : `/dev/carte` renvoie 404 en build de production sans `VADROUILLE_DEV_PAGES=1` (test, comme `/dev/tokens`).
- [ ] Aucune règle CSS du dépôt ne cible `.gm-style`, `.gmnoprint`, `.gm-style-cc` ni un lien vers `google.com/maps` (test qui lit les fichiers de styles et de composants) ; `PlacesAttribution` affiche « Données de lieux : Google » si et seulement si `placesFromGoogle` vaut `true` (tests).
- [ ] Aucune clé ni Map ID réels dans le dépôt : `.env.example` contient les deux noms avec des valeurs vides ; un test échoue si une chaîne au format d'une clé Google (préfixe de 4 caractères propre à ces clés, suivi de 35 caractères) est trouvée hors de `node_modules` et `.next` ; le test ne contient pas lui-même de chaîne de ce format : il construit le motif par concaténation pour ne pas se détecter (test).
- [ ] Aucune couleur ni valeur en `px` en dur dans `src/components/carte` (hors `provisoire.css` de F3 si une valeur y manque, avec son commentaire de question) ; tous les textes dans `fr.json` sous `carte.*` ; `react/jsx-no-literals` actif sur `src/components/carte` (lint et test).
- [ ] Captures Playwright de `/dev/carte` (carte simulée jour 2 avec étape sélectionnée, vue d'ensemble, trois états de remplacement) comparées aux références (`pnpm test:visual`).
- [ ] La PR joint une capture de la vraie carte Google (Map ID au style Ligne, marqueurs et tracé) prise sur un déploiement où la clé est acceptée, ou indique qu'elle n'a pas pu l'être et pourquoi (F4-Q1) ; elle liste les choix d'architecture soumis au Tech Lead (bibliothèque, injection de la carte simulée, contrat `DayMap`), les textes proposés et les écarts.

## Hors périmètre
- Assemblage des écrans Séjour (11) et Journée (12), `Sheet` à 3 hauteurs, contrôles posés sur la carte (retour, partager), ouverture de la fiche et gestion du focus de la fiche (F5).
- Mini-carte de zone de l'écran Où loger (3, F8) ; carte de la vue partagée et de « Pendant le voyage » (F10).
- Itinéraires réels, temps de trajet, géocodage, recherche de lieux, détails de lieux (Routes et Places, côté serveur, après P0 et la clé serveur).
- Données de lieux Google affichées (noms, horaires, notes, photos : Q5, Q6, Q14) ; adaptateur `api`.
- Service worker et hors-ligne complet (F10) ; mise en page grand écran (F12, Q7) ; thème sombre.
- Toute modification de `StopMarker` au-delà d'un correctif nécessaire à son usage sur la carte (listé dans la PR).

## Questions ouvertes
Nouvelles questions de cette spécification (numéros définitifs attribués par le CEO dans `QUESTIONS.md`) :
- **F4-Q1 (Samuel)** : la clé `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` est restreinte « au staging et à localhost » (Q3). Les déploiements de prévisualisation des PR (domaines `*.vercel.app` propres à chaque branche) sont-ils autorisés ? Sinon, quel domaine sert à valider la vraie carte ? Bloque : la capture de la vraie carte dans la PR de F4 (pas le développement ni `pnpm verify`).
- **F4-Q2 (UX/UI)** : rendu des trois états de remplacement de la carte et de `PlacesAttribution` (non maquettés) ; provisoire : bloc `muted`, texte `ink-2`, `Button` `secondary` `sm` pour « Réessayer ». Bloque : validation visuelle de F4.
- **F4-Q3 (UX/UI)** : texture des trajets à pied sur la carte (pointillé seulement pour le retour au logement, F4-PO-6) alors que la ligne du jour pointille tous les trajets à pied ; zone active de 44 px autour d'un marqueur de 26 px quand deux étapes sont proches (chevauchement). Bloque : rendu définitif du tracé et des marqueurs.
- **F4-Q4 (Tech Lead)** : forme et emplacement du contrat des positions (`DayMap`, F4-TL-1), méthode d'adaptateur, et ce que l'adaptateur `api` renverra (coordonnées issues de Place Details, cache serveur de 30 jours au plus selon le cadrage § 6.5) ; à rattacher au § 5 du handover back-end (Q14). Bloque : contrat définitif ; F4 avance sur la proposition.
- **F4-Q5 (Tech Lead)** : bibliothèque de chargement de Maps (le handover nomme `@vis.gl/react-google-maps`) et mécanisme d'injection de la carte simulée. Bloque : démarrage du code de F4 si le Tech Lead veut trancher avant ; sinon confirmé à la revue.

Pour la PR de code (relevé par la revue du Tech Lead) :
- **F4-Q6 (Samuel, suit Q5)** : le cadrage § 6.5 autorise un cache des coordonnées Google de 30 jours au plus, alors que `CLAUDE.md` interdit de « stocker autre chose que l'identifiant d'un lieu Google ». À trancher avec F4-Q4 et Q5. En attendant, F4 ne stocke aucune coordonnée (positions simulées, en mémoire seulement). Bloque : ce que renverra l'adaptateur `api` pour `DayMap` (pas F4 sur données simulées).
- Vérifier que `playwright.config.ts` pose `VADROUILLE_DEV_PAGES=1` dans l'environnement du serveur de test (c'est le cas dans `main` au 2026-10-08, `webServer.env`) ; sans lui, `/dev/carte` renvoie 404 et les tests de F4 échouent.

Questions existantes qui touchent F4 :
- Q5 (Samuel, juridique) : validation des règles Google ; F4 applique le handover § 8 en attendant.
- Q6 (Samuel) : photos de lieux ; aucune photo sur la carte.
- Q12 (Samuel) : maquettes et Dossier UX non exportés ; référence provisoire : `carte.md` et `preview.html` de `StopMarker`.
- Q14 (Tech Lead) : origine des champs de `Stop` ; les noms affichés dans les noms accessibles des marqueurs sont ceux du contrat, simulés en phase 0.
- Q18 et Q19 (UX/UI) : variante « carte » de `StopMarker` et mesures sans token (terminus 24 px, anneau 3 px).
