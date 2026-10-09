# F5 — Séjour, Journée et Fiche étape

Rôle : frontend · Prérequis : F3 (#30) et F4 (#35) livrées dans `main` (handover § 15) · Ticket : #37 · Référence : `docs/handovers/frontend.md` (§ 0 règles 2 à 9, § 2, § 3, § 5 `DayTabs`, `DayLine`, `StopMarker`, `DestinationPlate`, `ChecklistRow`, `ReasonBlock`, `Sheet`, `UndoToast`, `Counter`, `StatusBanner`, § 6 écrans 11, 12 et 13, règles de navigation et critères de l'écran 12, § 7, § 8, § 9, § 10, § 11, § 12, § 13, § 14, § 15 F5), `docs/produit/cadrage-v5.md` (§ 3.1 écrans 11 à 13, § 3.2, § 3.4 « Événements » et « Découvertes », § 3.5 bloc « Programme », § 3.7 « Budget de trajet » et « Transparence »), `docs/CONTEXT.md` (principes produit 2, 4 et 5, principe technique 2, « Qui décide quoi »), `docs/design-system/README.md`, `docs/design-system/carte.md` (« Contrôles posés sur la carte »), `docs/design-system/redaction.md`, `docs/design-system/components/DestinationPlate/`, `ChecklistRow/`, `ReasonBlock/`, `DayLine/`, `StopMarker/` (README et `preview.html`), `specs/F1-contrats-donnees-simulees.md`, `specs/F3-ligne-du-jour.md`, `specs/F4-carte.md`, `specs/F6-presentation.md`, `docs/decisions/0013-decisions-tech-lead-f3-f4-f6.md` (carte simulée, API de F3, contexte d'organisation, `Dialog` et Pointer Events), `QUESTIONS.md` (Q8, Q12, Q14, Q17, Q37, Q51, Q53, Q59, Q60, Q63).

Documents en revue, non fusionnés au 2026-10-08, cités pour cohérence sans en dépendre : handover back-end (PR #27, `docs/handovers/backend.md` : `TripPatch` avec les opérations `lock` et `unlock`, évolutions E1, E3, E4 et E8, `StopReport`, tâche B11), décision UX/UI 0012 (PR #26).

Dossier UX : `docs/ux/dossier-ux.md` n'existe pas dans le dépôt (Q59) et `docs/ux/maquettes/` est vide (Q12). Les critères viennent du handover § 6 et § 7, du cadrage et du design system ; tout rendu non maquetté est marqué « provisoire (UX/UI) ».

## Objectif
Livrer le cœur du programme sur données simulées : l'écran Séjour (11, vue d'ensemble du voyage), l'écran Journée (12, carte et ligne du jour synchronisées dans un panneau coulissant à 3 hauteurs) et la Fiche étape (13, ouverte dans ce panneau), avec les composants `Sheet`, `DestinationPlate`, `ChecklistRow` et `ReasonBlock`. Navigation, focus et clavier gérés, aucune persistance côté client, aucune donnée Google affichée ou stockée.

## Prérequis vérifiables
| Élément | Livré par | Référence |
|---|---|---|
| Contrats `Trip`, `Day`, `DayLineItem`, `Stop`, `ChecklistItem`, adaptateur `mock` (`getTrip`, `getDay`), isolation par organisation, règle « `src/mocks` importé seulement depuis `src/adapters` et les tests » | F1 (#11) | `specs/F1-contrats-donnees-simulees.md` |
| `Button`, `IconButton`, `Tag`, `Counter`, `StatusBanner`, `/dev/composants`, test de contraste, règle `react/jsx-no-literals`, `provisoire.css` | F2 (#19) | `specs/F2-composants-base.md` |
| `DayBadge`, `DayTabs` (`sejourHref`, `label`), `DayLine` (`getStopHref`, `ideasHref`), `StopMarker`, formatage des durées | F3 (#30) | `specs/F3-ligne-du-jour.md` |
| `DayMap` (modes `day` et `overview`, `selectedStopId`, `onMarkerPress`, `listId`, `fitPadding`, `placesFromGoogle`), `PlacesAttribution`, `CarteProvider`, carte simulée, `getDayMap`, `getTripMap`, règle de lint contre le stockage client | F4 (#35, fusionnée dans `main`) | `specs/F4-carte.md` |
| `UndoToast` (5 s, focus non volé, délai suspendu au focus), module de mesure `track` (décision 0013 § 3.3), `getRequestContext()` dans `src/adapters` (§ 3.6), voyage débloqué simulé `mock_trip_edimbourg_debloque` | F6 (code, ticket #42, en cours en parallèle) | `specs/F6-presentation.md`, décision 0013 |

Le code de F6 (ticket #42) est en cours en parallèle et crée `UndoToast`, `src/analytics/events.ts`, `src/analytics/track.ts` et `getRequestContext()`. F5 réutilise ce que F6 livre et n'y ajoute que ce qui lui est propre (l'événement `checklist_item_done`, le type `travel` de `StatusBanner`) ; le code de F5 qui touche ces fichiers démarre après la fusion de F6, pour éviter deux versions concurrentes (F5-PO-18).

## Périmètre
- Composants `Sheet`, `DestinationPlate`, `ChecklistRow`, `ReasonBlock` dans `src/components/ligne` ; ajouts à `DayLine` (mention de verrou, créneau de repas non choisi).
- Écran 11 « Séjour » : `/voyages/[id]`.
- Écran 12 « Journée » : `/voyages/[id]/jour/[n]`.
- Écran 13 « Fiche étape » : `/voyages/[id]/jour/[n]?etape=[stopId]`, dans le panneau de l'écran 12.
- Actions locales « Verrouiller » et « fait » de la liste « À faire avant de partir », annulation, événement `checklist_item_done`.
- Ajouts au jeu simulé nécessaires aux critères (« Surprends-moi »), en proposition au Tech Lead pour la forme.

## Choix réservés au Tech Lead (signalés, non tranchés ici)
Propositions détaillées dans « Propositions au Tech Lead » ; le frontend les soumet dans sa PR et le Tech Lead les confirme à la revue ou par une décision dans `docs/decisions/`. Les critères d'acceptation ne dépendent pas de la forme retenue, sauf mention.
- Pages de développement qui montent les écrans avec la carte simulée (F5-TL-1, dans le cadre de la décision 0013 § 1.4).
- Forme du créneau de repas non choisi dans `DayLineItem` (F5-TL-2, évolution E8 de B0).
- Contrat de l'idée « Surprends-moi » (F5-TL-3).
- Recentrage de la carte dans la zone non couverte par le panneau (F5-TL-4, extension de l'API de F4).
- Bibliothèque et structure du `Sheet`, mise en page partagée des routes du voyage (F5-TL-5).
- Actions locales du programme (F5-TL-6).
- Type de `StatusBanner` pour le dépassement du budget de trajet (F5-TL-7).
- Lien « Idées » par plage de temps libre (F5-TL-8).
- Emplacement et noms des fichiers ci-dessous.

## Fichiers à créer ou modifier (proposition)
- `src/components/ligne/Sheet.tsx`, `DestinationPlate.tsx`, `ChecklistRow.tsx`, `ReasonBlock.tsx` et leurs tests `*.test.tsx` ; `DayLine.tsx` (verrou, créneau de repas non choisi, `getIdeasHref`) et son test.
- `src/features/sejour/` : `TripShell.tsx` (carte + panneau, client), `SejourPanel.tsx`, `JourneePanel.tsx`, `StopSheet.tsx` (fiche), `SurpriseBlock.tsx`, `travel.ts` (fonctions pures : dépassement du budget, plus long trajet, « Pour y aller », résumé du jour, budget total), `programme.ts` (état local et actions, F5-TL-6).
- `src/app/voyages/[id]/layout.tsx`, `src/app/voyages/[id]/page.tsx`, `src/app/voyages/[id]/jour/[n]/page.tsx` (composants serveur : contexte par `getRequestContext()`, lecture par `getTripAdapter()`, `notFound()` hors organisation ou hors limites) ; `src/app/dev/voyages/[id]/…` : mêmes écrans sous `CarteProvider` avec la carte simulée (F5-TL-1).
- `src/contracts/trip.ts` (F5-TL-2, F5-TL-3) et `src/mocks/edimbourg.ts` (idées « Surprends-moi » des J2 et J4), tests de F1 mis à jour.
- `src/app/dev/composants` : section « Programme » (chaque nouveau composant dans chacun de ses états).
- `src/components/carte/DayMap.tsx` (F4, fusionnée dans `main` par #35), `types.ts`, `GoogleMapRenderer.tsx`, `SimulatedMapRenderer.tsx`, `simulated-model.ts` et leurs tests : extension de l'API de `DayMap` pour le recentrage dans la zone non couverte par le panneau (F5-TL-4).
- `src/components/ligne/StatusBanner.tsx` et son test : type `travel` (F5-TL-7).
- `src/components/ligne/UndoToast.tsx` : livré par F6 (#42) et réutilisé tel quel ; modifié seulement si F5 l'exige, avec son test.
- `src/analytics/events.ts` (livré par F6, décision 0013 § 3.3) : ajout de la variante stricte `checklist_item_done`, sans propriété, et son test ; `src/analytics/track.ts` réutilisé sans changement.
- `src/adapters/index.ts` : `getRequestContext()` (décision 0013 § 3.6), livré par F6 et réutilisé ; ajouté par F5 selon la même décision seulement s'il manque encore.
- `.github/workflows/ci.yml` : dans le job `docker`, vérification que `/dev/voyages/mock_trip_edimbourg` et `/dev/voyages/mock_trip_edimbourg/jour/2` répondent 404 sans `VADROUILLE_DEV_PAGES=1`, à côté de `/dev/tokens`, `/dev/composants` et `/dev/carte` (décision 0013 § 1.6, F5-TL-1).
- `eslint.config.mjs` : `react/jsx-no-literals` et la règle de F4 contre le stockage client étendues à `src/features/sejour` et aux nouveaux composants ; interdiction d'importer la carte simulée depuis `src/app/voyages` et `src/features/sejour` (F5-TL-1).
- Textes dans `src/i18n/fr.json` sous `sejour.*` ; `tests/e2e/sejour.e2e.spec.ts`, `tests/e2e/sejour.a11y.spec.ts`, `tests/visual/sejour.visual.spec.ts` et leurs références.

### Props (proposition, à confirmer par le Tech Lead à la revue)
```ts
import type { ChecklistItem, Trip } from "@/contracts";

type SnapPoint = 0.25 | 0.55 | 0.92;

interface SheetProps {
  snapPoints?: readonly SnapPoint[];      // [0.25, 0.55, 0.92] (handover § 5)
  defaultSnap?: SnapPoint;                // 0.55
  snap?: SnapPoint;                       // contrôlé par l'écran (fiche, lien d'évitement)
  onSnapChange?: (snap: SnapPoint) => void;
  label: string;                          // nom de la région (« Programme », « Fiche étape »)
  children: React.ReactNode;
}
interface DestinationPlateProps { name: string; meta: string; color: Trip["destinationColor"] }
interface ChecklistRowProps {
  label: string; when: string; done: boolean;
  bookingUrl?: string; sponsored: boolean;
  onToggle: (done: boolean) => void;
}
interface ReasonBlockProps { text: string; sourceLabel: string; sourceUrl: string; verifiedAt?: string }
```

## Comportement

### Mise en page commune (écrans 11 et 12)
- Carte en fond sur toute la fenêtre, panneau `Sheet` au-dessus (cadrage § 3.2 « carte en haut, panneau coulissant à plusieurs hauteurs ») ; le panneau chevauche la carte avec ses coins `radius-sheet` (`carte.md`). Séjour : `DayMap` en mode `overview` ; Journée : `DayMap` en mode `day` (F5-PO-1).
- Contrôles posés sur la carte (`carte.md`) : `IconButton` « Retour » en haut à gauche, vers le niveau supérieur (Journée → `/voyages/[id]` ; Séjour → `/voyages`, écran « Mes voyages » de F11, qui peut répondre 404 d'ici là). Le bouton « Partager » n'est pas rendu dans F5 : sa destination (vue partagée) relève de F10.
- En tête du panneau, sous la poignée : `DayTabs` (« Séjour », puis J1 à Jn) ; l'onglet en cours porte `aria-current="page"`. Pas de glissement horizontal pour changer de jour (handover § 6, écran 12).
- Le titre de niveau 1 est dans le panneau : nom de la destination (Séjour, porté par la `DestinationPlate`) titre du jour (Journée, style `titre-jour`) ou, fiche ouverte, nom de l'étape (style `titre-fiche`). Chaque état a exactement un titre de niveau 1.
- Titre du document : « {destination} · Séjour », « {destination} · Jour {n} », et, fiche ouverte, « {nom de l'étape} · Jour {n} » (F5-PO-1).

### Panneau coulissant (`Sheet`)
- Trois hauteurs, en part de la hauteur de la fenêtre : 25 %, 55 % (défaut), 92 % (handover § 5 et § 7).
- La poignée est un bouton d'au moins 44 × 44 px : « Agrandir le panneau » à 25 % et 55 % (passe à la hauteur suivante), « Réduire le panneau » à 92 % (revient à 25 %). Flèche haut et flèche bas sur la poignée montent ou descendent d'une hauteur. Toutes les hauteurs sont donc atteignables sans glisser (WCAG 2.5.7) (F5-PO-2).
- Glisser verticalement la poignée ou l'en-tête du panneau (zone au-dessus de `DayTabs`) le déplace ; au relâchement, il se pose sur la hauteur la plus proche, ou sur la suivante dans le sens du geste si la vitesse verticale dépasse 0,5 px/ms. Le contenu du panneau défile à l'intérieur du panneau, à toutes les hauteurs ; glisser dans le contenu fait défiler le contenu, jamais le panneau (F5-PO-2).
- Le panneau n'est pas modal : la carte reste utilisable, aucun piège à focus. Région nommée (`role="region"`, nom « Programme » ou « Fiche étape »).
- La hauteur choisie est conservée quand on passe d'un onglet à l'autre (Séjour ↔ jours) dans le même voyage ; elle repart à 55 % au chargement de la page (F5-PO-2).
- Transitions de 150 à 250 ms, courbe standard ; `prefers-reduced-motion: reduce` : changement de hauteur instantané.
- La marge de cadrage de la carte (`fitPadding.bottom`) est la hauteur du panneau à 55 %, pour que le cadrage initial reste visible au-dessus du panneau.

### Écran 11 — Séjour (`/voyages/[id]`)
Contenu du panneau, dans cet ordre (cadrage § 3.1, écran 11 ; F5-PO-3) :
1. `DayTabs`, « Séjour » actif.
2. `DestinationPlate` : nom de la destination (titre de niveau 1), ligne « {date de début} – {date de fin} · {voyageurs} » au format des listes (« sam. 29.08 – jeu. 03.09 · 2 adultes » ; « 2 adultes, 1 enfant » s'il y a des enfants), couleur `dest-{destinationColor}`.
3. Budget : « Budget estimé : environ {total} CHF par personne », total = somme des `Day.budgetPerPerson` définis, formaté par `Intl.NumberFormat("fr-CH")` ; si un jour n'a pas de budget, la ligne ajoute « (sans le jour {n}) » pour chacun ; si aucun jour n'en a, la ligne n'est pas rendue.
4. « À faire avant de partir » (titre de niveau 2) avec un `Counter` `quai` du nombre de lignes non faites, puis une `ChecklistRow` par `ChecklistItem`, dans l'ordre des données (F5-PO-4).
5. « Pendant ton séjour » (titre de niveau 2, cadrage § 3.4) : les `Day.events` de tous les jours, par jour puis par heure. Chaque ligne : « J{n} · {date courte} · {start} – {end} » (ou `{start}` seul sans `end`), nom, `meta`, une `Tag` par exception ; toute la ligne est un lien vers la fiche de l'événement (`/voyages/[id]/jour/{n}?etape={id}`). Sans événement : « Aucun événement retenu pour tes dates. » (provisoire, UX/UI).
6. « Jour par jour » (titre de niveau 2) : une ligne par jour, lien vers `/voyages/[id]/jour/{n}` : `DayBadge` réduite « J{n} », `Day.title`, résumé « {nombre d'étapes} étapes · {durée} de trajet » (durée de `travelMinutes` au format de F3) ; un jour `generating: true` affiche « En préparation » à la place du résumé (F5-PO-3).
- Carte : `DayMap` `overview` avec `getTripMap` ; marqueurs non interactifs (F4).
- Le scénario du handover § 14 « trouver la liste à réserver » se fait depuis cet écran.

### Liste « À faire avant de partir » (`ChecklistRow`)
- Anatomie du README : case de 22 px dans une zone de 44 px (bouton `aria-pressed`, nom accessible = `label`), nom en 15 px 700, moment (`when`) en `legende` `ink-soft`, lien « Réserver » en `line` 800 vers `bookingUrl` (nouvel onglet, `rel="noopener noreferrer"`), au moins 44 px de haut. Sans `bookingUrl`, pas de lien.
- `sponsored: true` : mention « Lien rémunéré » en `legende` `ink-soft` à côté du lien (README : « signalé comme tel ») (F5-PO-4).
- Cocher : la ligne passe en `ink-soft`, nom barré, perd son lien, reste à sa place ; le compteur diminue ; l'événement `checklist_item_done` est envoyé. Décocher rétablit la ligne, sans événement. Pas de `UndoToast` : la case elle-même s'annule à tout moment (F5-PO-4).
- Compteur à 0 : pas rendu (aucun jaune sans action requise, design system, principe 2). Nom accessible du compteur : « {n} réservations à faire » (« 1 réservation à faire »).
- État en mémoire seulement (F5-PO-16).

### Écran 12 — Journée (`/voyages/[id]/jour/[n]`)
Contenu du panneau, dans cet ordre (F5-PO-5) :
1. `DayTabs`, pastille J{n} active.
2. Titre `Day.title` (niveau 1, `titre-jour`), puis une ligne « {durée} de trajet · environ {budget} CHF par personne » (la partie budget seulement si `budgetPerPerson` est défini).
3. `StatusBanner` `generating` « Jour {n} en préparation » si `Day.generating` vaut `true` ; dans ce cas, ni ligne du jour ni bandeau de trajet, et rien d'autre que les événements.
4. Bandeau de trajet si `travelMinutes` > `travelBudgetMinutes` (F5-PO-6).
5. `DayLine` de `Day.items` (F3), `id` = `listId` de la carte, `tabindex="-1"` ; chaque étape mène à sa fiche.
6. « Événements du jour » (titre de niveau 2) si `Day.events` n'est pas vide : mêmes lignes que sur l'écran 11, sans le préfixe « J{n} · {date} ».
7. « Surprends-moi » si le jour a une idée (F5-PO-5, F5-TL-3).
- Lien d'évitement de F4 « Aller à la liste des étapes » : s'il est activé panneau à 25 %, le panneau passe à 55 % avant que le focus arrive sur la liste.
- `PlacesAttribution` en bas du contenu du panneau, rendue si `placesFromGoogle` vaut `true` (faux en phase 0, F4-PO-9).

### Bandeau de dépassement du budget de trajet (critère écran 12)
Affiché si et seulement si `Day.travelMinutes` > `Day.travelBudgetMinutes` (égalité : pas de bandeau), valeurs lues dans les données, jamais en dur (Q8). Texte (F5-PO-6, provisoire UX/UI) : « {travelMinutes} de trajet ce jour, au-delà des {travelBudgetMinutes} prévues pour ton rythme. Le plus long : {segment}, vers {nom}. » — {segment} = libellé du segment de F3 (« Bus, environ 50 min (estimation) »), pour le plus long segment de `items` suivi d'une étape (à égalité, le premier) ; sans segment suivi d'une étape, la seconde phrase est omise. Jeu simulé : J5 (165 min pour 90) affiche le bandeau, vers « [Distillerie accessible en bus] » ; J1 (90 pour 90) ne l'affiche pas.

### Synchronisation carte ↔ liste (critères écran 12)
- Toucher un marqueur (`onMarkerPress`) : si une fiche est ouverte, elle se ferme (paramètre `etape` retiré de l'adresse) ; le panneau passe à 55 % s'il était à 25 % ; la liste défile pour amener l'étape dans la zone visible du panneau ; le focus reste sur le marqueur (F5-PO-7, F4-PO-4).
- Toucher une étape dans la liste : ouvre sa fiche et sélectionne son marqueur (`selectedStopId`) ; la carte se recentre sur l'étape dans la zone non couverte par le panneau (F5-TL-4).
- Déplacer ou zoomer la carte ne change ni la liste, ni son défilement, ni la fiche ouverte, ni l'adresse (F4).
- Glisser horizontalement sur le panneau ne change pas de jour.

### Écran 13 — Fiche étape
- **Ouverture** (F5-PO-8) : depuis une étape de la `DayLine` ou une ligne d'événement. L'adresse devient `/voyages/[id]/jour/[n]?etape=[stopId]` (nouvelle entrée d'historique) ; le contenu du panneau est remplacé par la fiche ; le panneau passe à 55 % s'il était à 25 %, sinon garde sa hauteur ; le focus va sur le titre de la fiche (`tabindex="-1"`, handover § 7).
- **Ouverture directe** (adresse avec `?etape=` chargée telle quelle) : la fiche est ouverte au chargement. Un `stopId` absent des étapes et des événements du jour : la journée s'affiche sans fiche, l'adresse est remplacée sans le paramètre, et une annonce `role="status"` dit « Cette étape n'est plus dans ce jour. » (provisoire, UX/UI).
- **Fermeture** : bouton « Fermer » (`IconButton`, en haut à droite de la fiche), Échap quand le focus est dans la fiche, retour du navigateur, ou toucher un marqueur. Après une ouverture depuis la liste, la fermeture revient à l'entrée d'historique précédente (la touche Retour du navigateur ne rouvre pas la fiche) ; après une ouverture directe, elle remplace l'adresse par celle du jour. Le focus revient sur le lien d'origine (étape ou ligne d'événement) ; après une ouverture directe, sur le lien de cette étape dans la `DayLine`, ou sur la ligne de l'événement dans « Événements du jour » (handover § 7 et § 6, « la fiche se ferme sur l'arrêt d'origine »). Le marqueur n'est plus sélectionné.
- **Exception : fermeture par un marqueur** (F5-PO-7, F4-PO-4). Toucher un marqueur ferme la fiche sans déplacer le focus : il reste sur le marqueur touché ; la liste défile jusqu'à l'étape de ce marqueur (pas celle de la fiche fermée), qui devient l'étape sélectionnée. L'adresse est remplacée par celle du jour, sans nouvelle entrée d'historique.
- **Fiche ouverte depuis une ligne d'événement du Séjour** (« Pendant ton séjour ») : le lien mène à `/voyages/[id]/jour/{n}?etape={id}` (nouvelle entrée d'historique) et la fiche s'ouvre dans la Journée du jour {n}, focus sur son titre. « Fermer » ou Échap la ferment dans cette Journée : adresse remplacée par `/voyages/[id]/jour/{n}`, comme après une ouverture directe, focus sur la ligne de l'événement dans « Événements du jour ». Le retour du navigateur revient au Séjour, focus sur la ligne d'événement d'origine dans « Pendant ton séjour » (F5-PO-8).
- **Contenu** (F5-PO-9), dans cet ordre :
  - titre = `name` (style `titre-fiche`, **niveau 1** : la fiche remplace le contenu du panneau, le titre du jour n'est plus rendu, et la page garde un et un seul titre de niveau 1, règle axe `page-has-heading-one`) ; les titres internes de la fiche sont de niveau 2 ;
  - moment : « J{n} · {Day.title} · {start} – {end} » (`{start}` seul sans `end`) ;
  - `meta` en `corps-s` `ink-soft` ; une `Tag` par exception ;
  - si l'étape est verrouillée : « Étape verrouillée : elle ne bougera pas quand tu modifies ton programme. » (provisoire, UX/UI) ;
  - « Pour y aller » : le segment le plus proche avant l'étape, sans autre étape entre eux, et son origine (étape ou terminus précédent) : « À pied, 20 min depuis [Royal Mile] » ; absent pour un événement de `Day.events` ou sans segment ;
  - `ReasonBlock` si `reason` et `source` sont présents ; `reason` sans `source` : texte simple en `corps` sous les métadonnées, sans bloc ; ni l'un ni l'autre : rien ;
  - actions (F5-PO-10).
- **Actions** (F5-PO-10) :
  - « Remplacer » (`Button` `secondary`) : lien vers `/voyages/[id]/jour/[n]/remplacer/[stopId]` (écran 14, F7 ; 404 d'ici là). Non rendu pour une étape verrouillée.
  - « Verrouiller » (`Button` `secondary`, `aria-pressed` égal à `locked`) : bascule le verrou. Après chaque bascule : `UndoToast` « Étape verrouillée. » ou « Verrou retiré. » avec « Annuler » (5 s, focus non volé) ; « Annuler » rétablit l'état exact et rend le focus au bouton. La mention de verrou de la fiche et de la `DayLine` suit l'état ; « Remplacer » disparaît ou réapparaît.
  - « Garder » (cadrage § 3.1, écran 13 « garder ou remplacer », et vocabulaire « Garder » / « Remplacer ») : son comportement dans la fiche n'est défini ni par le cadrage ni par le handover ; question posée à Samuel (F5-Q6). F5 livre « Remplacer » et « Verrouiller » seulement, sans inventer de comportement pour « Garder » en attendant la réponse. « Déplacer » est ajouté à la fiche par F7 ; « Signaler une erreur » attend le contrat `StopReport` (B11).
- **Fiche d'un événement de `Day.events`** (F5-PO-11) : même contenu en lecture seule, précédé de « Proposé pendant ton séjour, pas dans ton programme. » (provisoire, UX/UI) ; ni « Remplacer » ni « Verrouiller » ; aucun marqueur sélectionné (les événements ne sont pas sur la carte, F4-PO-3).
- La fiche ne s'ouvre jamais pour un terminus ni pour un créneau de repas non choisi.

### Ajouts à `DayLine` (Q17, partie Product Owner)
- **Étape verrouillée** (F5-PO-14) : sous `meta`, mention « Verrouillée » en `legende` `ink-soft`, précédée de l'icône cadenas du jeu d'icônes (`aria-hidden`) si son tracé est disponible (Q13, Q51) ; ce n'est pas une `Tag` (les tags sont réservés aux exceptions). Le nom accessible du lien de l'étape contient « Verrouillée ».
- **Créneau de repas non choisi** (F5-PO-13, F5-TL-2) : élément `{ type: "openMeal"; time; meal: "lunch" | "dinner" }` ; heure dans la colonne heure, anneau d'arrêt et rail comme une étape, texte « Déjeuner pas encore choisi » ou « Dîner pas encore choisi » en style `arret` `ink-2` (provisoire, UX/UI). Pas de lien, pas de fiche, pas de marqueur ni de numéro sur la carte (il n'a pas de lieu ; la numérotation de F4 ne compte que les éléments `stop`).
- **Lien « Idées » du temps libre** (F5-PO-12) : vers « Ajouter un lieu » du jour, `/voyages/[id]/jour/[n]/ajouter?de={from}&a={to}` (F7 propose ce moment ; 404 d'ici là). Si F5-TL-8 n'est pas retenue, le lien est `/voyages/[id]/jour/[n]/ajouter` sans paramètre.

### « Surprends-moi » (écran 12, cadrage § 3.4)
Bouton « Surprends-moi » (`Button` `secondary` `sm`, `aria-expanded`, `aria-controls`) rendu seulement si le jour a une idée. L'activer affiche sous le bouton l'idée : nom (niveau 3), `meta` (durée et coût), `ReasonBlock` (justification et source) ; le focus reste sur le bouton ; l'activer à nouveau la masque. Aucune action d'ajout dans F5 : « Ajouter à ma journée » viendra avec F7 (F5-PO-5).

### Navigation et erreurs
- Voyage inconnu ou d'une autre organisation, `n` qui n'est pas un entier écrit sans zéro initial (`/^[1-9]\d*$/`), ou `n` hors des jours du voyage : 404 (`notFound()`).
- Un voyage s'ouvre sur l'écran Séjour ; la réouverture sur le dernier onglet consulté et sur `/aujourdhui` aux dates du voyage (handover § 6, règles de navigation) relèvent de F10 et F11.
- Voyage non débloqué (`unlocked: false`) : F5 affiche ce que renvoie l'adaptateur, sans élément d'offre ni lien « Débloquer » (F5-PO-17, F5-Q2).

## Événements de mesure (handover § 12)
| Événement | Quand | Propriétés |
|---|---|---|
| `checklist_item_done` | Une ligne passe de « à faire » à « faite » | aucune |

Aucun autre événement dans F5 : le verrou n'a pas d'événement au § 12 et le plan de mesure du Dossier UX n'est pas disponible (Q59). Aucun identifiant, nom ni `placeId` dans les propriétés.

## Règles Google
- **Aucune donnée Google dans un prompt** : F5 n'appelle aucun modèle.
- **Seul l'identifiant de lieu est stockable** : F5 ne stocke rien côté client. Verrous, cases cochées, hauteur du panneau et idée affichée vivent en mémoire ; aucune écriture dans `localStorage`, `sessionStorage`, IndexedDB, Cache Storage ni cookies ; sur les écrans de F5, le seul paramètre d'adresse est `etape`, un `Stop.id` (identifiant d'étape interne), jamais un `placeId`. Recharger la page rétablit les données de l'adaptateur (F5-PO-16).
- **Données de lieux** : toutes simulées en phase 0, `placesFromGoogle` vaut `false` et la mention n'est pas rendue (F4-PO-9) ; la carte Google, quand elle s'affiche, garde son attribution native (F4). Aucune donnée de lieu sur une carte non Google : la carte simulée ne s'importe que depuis `src/app/dev/` et les tests (décision 0013 § 1.4, F5-TL-1).
- **Aucun appel Places, Routes ni Directions** : « Pour y aller » vient des segments de la ligne du jour ; aucun lien d'itinéraire externe dans F5 (F10).
- **Clés** : celles de F4 seulement, jamais en CI.

## Tests

### Unitaires (Vitest, Testing Library, axe)
- `Sheet` (hauteurs, poignée, flèches, contrôle externe), `DestinationPlate`, `ChecklistRow`, `ReasonBlock`, ajouts à `DayLine` (verrou, `openMeal`, lien « Idées »).
- `travel.ts` : dépassement strict, plus long segment suivi d'une étape, « Pour y aller », résumé du jour, budget total avec jours sans budget.
- `programme.ts` : verrouiller, annuler, cocher, décocher.
- Écrans avec l'adaptateur simulé et des jours de test (jour en préparation, `openMeal`, événement sans `end`, étape sans `source`), page 404.

### E2E, a11y et visuel (Playwright, 390 × 844, build de production, domaines Google bloqués)
Les critères qui touchent la carte (marqueurs, recentrage, glisser) s'exécutent sur les pages de développement de F5-TL-1 (`/dev/voyages/mock_trip_edimbourg…`), qui montent les mêmes écrans avec la carte simulée ; les adresses des critères s'entendent alors avec le préfixe `/dev`. Les autres critères s'exécutent sur les routes `/voyages/…`, où la CI affiche l'état « configuration absente » de F4 à la place de la carte.

Les critères s'exécutent sur `mock_trip_edimbourg` (`unlocked: false`, six jours complets). Ils vérifient le rendu de ce que renvoie l'adaptateur et ne préjugent pas de ce qu'un voyage non débloqué doit montrer avant paiement (F5-Q2, Q63) : si Samuel restreint ce contenu, B9 modifiera les données et ces critères seront repris sur le voyage débloqué simulé `mock_trip_edimbourg_debloque`.
- `tests/e2e/sejour.e2e.spec.ts` sur `/voyages/mock_trip_edimbourg`, ses jours et ses fiches.
- `tests/e2e/sejour.a11y.spec.ts` : axe sur le Séjour, la Journée (J2, J5), la fiche (étape, étape verrouillée, événement), le panneau à chaque hauteur.
- `tests/visual/sejour.visual.spec.ts` : Séjour, Journée J2 et J5, fiche de Dean Village, fiche du Tattoo (verrouillée), panneau à 25 % et 92 % ; références régénérées selon la décision 0004.

## Décisions (Product Owner, définitives sans veto de Samuel sous 2 jours)
Une décision marquée « provisoire (UX/UI) » porte sur un rendu ou un texte non maquetté et peut être changée par UX/UI sans nouvelle décision du Product Owner (F5-Q1).
- **F5-PO-1 — Mise en page commune.** Séjour et Journée partagent la mise en page « carte en fond + panneau à 3 hauteurs » (cadrage § 3.2), carte d'ensemble pour le Séjour et carte du jour pour la Journée ; « Retour » vers le niveau supérieur ; « Partager » absent jusqu'à F10 ; titre de niveau 1 dans le panneau ; titres du document ci-dessus (provisoire, UX/UI).
- **F5-PO-2 — Panneau.** Hauteurs 25, 55 (défaut), 92 % ; poignée : agrandir d'une hauteur, ou réduire de 92 à 25 % ; flèches haut et bas d'une hauteur ; glisser seulement depuis la poignée et l'en-tête, pose sur la hauteur la plus proche ou, au-delà de 0,5 px/ms, sur la suivante dans le sens du geste ; non modal ; hauteur conservée d'un onglet à l'autre du même voyage, 55 % au chargement.
- **F5-PO-3 — Contenu du Séjour.** Ordre : onglets, plaque, budget, « À faire avant de partir », « Pendant ton séjour », « Jour par jour » (ordre du cadrage, écran 11, avec la plaque en tête comme le veut son README). Budget total = somme des budgets journaliers par personne, jours sans budget nommés ; « Pendant ton séjour » liste les `Day.events` (les événements déjà dans le programme, comme le Tattoo, restent dans leur ligne du jour) ; résumé du jour en nombre d'étapes et durée de trajet (provisoire, UX/UI).
- **F5-PO-4 — Liste « À faire avant de partir ».** Cocher et décocher sans `UndoToast` (la case s'annule elle-même) ; ligne faite gardée à sa place ; compteur des lignes non faites, masqué à 0 ; « Lien rémunéré » à côté de « Réserver » pour `sponsored` (provisoire, UX/UI) ; `checklist_item_done` au cochage seulement ; `when` affiché tel quel jusqu'à l'évolution E4 de B0.
- **F5-PO-5 — Contenu de la Journée.** Ordre : onglets, titre et ligne trajet/budget, bandeaux (préparation, trajet), ligne du jour, « Événements du jour », « Surprends-moi ». Un jour en préparation n'affiche que son bandeau et ses événements. « Surprends-moi » dévoile une idée sans l'ajouter (l'ajout passe par F7).
- **F5-PO-6 — Bandeau de trajet.** Seuil strict (`travelMinutes` > `travelBudgetMinutes`) ; explication par le plus long trajet vers une étape, composé par l'interface depuis les segments (aucun texte d'interface dans les données) ; textes provisoires (UX/UI).
- **F5-PO-7 — Marqueur touché.** Ferme la fiche ouverte, relève le panneau à 55 % s'il est à 25 %, fait défiler la liste jusqu'à l'étape, laisse le focus sur le marqueur, y compris quand il ferme une fiche (exception au retour du focus de F5-PO-8) ; n'ouvre pas de fiche (F4-PO-4).
- **F5-PO-8 — Ouverture et fermeture de la fiche.** Fiche dans le panneau (pas de seconde feuille), adresse avec `?etape=` en nouvelle entrée d'historique, panneau relevé à 55 % s'il est à 25 % ; fermeture par « Fermer », Échap, retour du navigateur ou marqueur ; focus sur le titre à l'ouverture et sur le lien d'origine à la fermeture, sauf fermeture par un marqueur (focus sur le marqueur, F5-PO-7) ; fiche ouverte depuis le Séjour : fermée dans la Journée du jour avec le focus sur la ligne de l'événement, ou retour du navigateur vers le Séjour avec le focus sur la ligne d'origine ; `stopId` inconnu : journée sans fiche et annonce (provisoire, UX/UI).
- **F5-PO-9 — Contenu de la fiche.** Titre de la fiche au niveau 1, à la place du titre du jour ; moment avec `Stop.end` ; « Pour y aller » tiré du segment précédent et de son origine ; `ReasonBlock` seulement avec une source (README : « toujours une source ») ; date de vérification affichée « Source consultée le {date longue} » sous le bloc (le mot « Vérifié » reste banni, F3) ; aucun lien d'itinéraire externe.
- **F5-PO-10 — Actions de la fiche.** « Remplacer » (lien vers F7, absent si l'étape est verrouillée) et « Verrouiller » (bascule `aria-pressed`, annulable 5 s, messages provisoires « Étape verrouillée. » et « Verrou retiré. »). Toute étape verrouillée peut être déverrouillée, engagement compris, faute de distinction dans le contrat (F5-Q3). « Garder » n'est pas tranché ici : son comportement relève de Samuel (F5-Q6) ; F5 ne le livre pas et aucun test n'en fige l'absence. « Déplacer » : F7 ; « Signaler une erreur » : après B11.
- **F5-PO-11 — Fiche d'un événement.** Lecture seule, signalée comme hors programme ; pas de marqueur sélectionné.
- **F5-PO-12 — Destination du lien « Idées » (Q17).** « Ajouter un lieu » du jour, avec la plage de temps libre comme moment proposé (F7). Couleur et graisse du lien : UX/UI (décision 0012, Q37).
- **F5-PO-13 — Repas pas encore choisi (Q17, E8).** Un élément de la ligne du jour à part, sans lieu (proposition de forme F5-TL-2), visible et signalé par son texte (« Déjeuner pas encore choisi », « Dîner pas encore choisi »), sans badge (ce n'est pas une des trois exceptions), sans lien ni marqueur en phase 0. C'est la représentation du créneau laissé vide par « Pas pour moi » sur la dernière option (F6-PO-7). Le choisir après coup passera par « Ajouter un lieu » (F7).
- **F5-PO-14 — Affichage de `locked` (Q17).** Mention texte « Verrouillée » en `legende` `ink-soft`, avec le cadenas si son tracé est disponible, dans la ligne du jour et la fiche ; pas de `Tag`.
- **F5-PO-15 — `kind: "event"` et `Stop.end` (Q17).** Un événement présent dans `Day.items` s'affiche comme toute étape (sa nature est dans `meta`) ; les `Day.events` vont dans les sections « Pendant ton séjour » et « Événements du jour », jamais sur la carte. `Stop.end` s'affiche dans la fiche et les lignes d'événement (« 18:00 – 19:00 »), pas dans la colonne heure de la ligne du jour (52 px, une heure).
- **F5-PO-16 — Pas de persistance en phase 0.** Verrous et cases en mémoire, rétablis depuis l'adaptateur au rechargement ; seul `etape` dans l'adresse ; écriture réelle avec B11 (`TripPatch` `lock`/`unlock`) et l'action de liste de B0.
- **F5-PO-17 — Voyage non débloqué (provisoire, F5-Q2).** F5 affiche ce que renvoie l'adaptateur, sans élément d'offre ; ce que montre un voyage non débloqué au-delà de l'aperçu est fixé par les données (B9) une fois F5-Q2 tranchée.
- **F5-PO-18 — Découpage proposé au CEO.** Trois PR successives, chacune avec ses critères ci-dessous : **F5a** `Sheet`, mise en page commune et Journée (critères marqués [a]) ; **F5b** Fiche étape, verrou, `ReasonBlock`, ajouts à `DayLine` (marqués [b]) ; **F5c** Séjour, `DestinationPlate`, `ChecklistRow` (marqués [c]). Les critères transverses (sans marque) s'appliquent à chaque PR pour ce qu'elle livre. Le CEO peut garder une seule PR.

## Propositions au Tech Lead (architecture et tests, à confirmer à la revue de la PR de code ou par une décision dans `docs/decisions/`)
- **F5-TL-1 — Pages de développement des écrans du voyage.** La décision 0013 (§ 1.4) interdit d'importer la carte simulée ailleurs que dans `src/app/dev/` et les tests ; sans elle, les critères de synchronisation de l'écran 12 ne sont pas testables en CI (pas de clé). Proposition : `src/app/dev/voyages/[id]/layout.tsx`, `page.tsx` et `jour/[n]/page.tsx` réutilisent les composants d'écran de `src/features/sejour` sous `CarteProvider` avec la carte simulée ; les écrans reçoivent un préfixe d'adresse (`basePath`, `/voyages` ou `/dev/voyages`) pour construire leurs liens. Ces pages répondent 404 en production sans `VADROUILLE_DEV_PAGES=1`, et le job `docker` ajoute leur vérification de 404 (décision 0013 § 1.6). Les routes `/voyages/…` n'importent jamais la carte simulée.
- **F5-TL-2 — Créneau de repas non choisi (E8).** Ajouter à `DayLineItemSchema` la variante stricte `{ type: "openMeal"; time: Time; meal: "lunch" | "dinner" }`. Alternative : un champ sur `Stop` ; écartée ici car un créneau vide n'a ni nom ni lieu. Le jeu simulé n'en contient pas (les repas d'Édimbourg sont choisis) : les tests utilisent des jours de test.
- **F5-TL-3 — Idée « Surprends-moi ».** Champ facultatif `Day.surprise?: Stop` (`kind: "activity"`, hors `items`), alimenté par la sélection (cadrage § 6.5, « une idée Surprends-moi »). Jeu simulé : une idée entre crochets pour J2 et J4, avec `source`. Alternative : méthode d'adaptateur `getSurprise(ctx, tripId, index)`.
- **F5-TL-4 — Recentrage dans la zone visible.** Prop `visibleInsets` (ou réutilisation de `fitPadding`) de `DayMap` : le recentrage sur `selectedStopId` place l'étape au centre de la zone non couverte par le panneau (Google : `panTo` puis `panBy` du décalage ; carte simulée : centre décalé dans le modèle). Sans cela, l'étape sélectionnée serait cachée sous le panneau à 55 %.
- **F5-TL-5 — Panneau et mise en page.** `Sheet` écrit sur les Pointer Events natifs, comme le geste de F6 (décision 0013 § 3.4), sans nouvelle dépendance : la décision 0013 (§ 3.5) écarte le `Drawer` de shadcn/ui (`vaul` non maintenu) et le `Dialog` est modal, alors que le panneau ne l'est pas ; hauteurs et choix de la hauteur au relâchement en fonctions pures testées. `motion` reste possible par amendement de la décision 0013. Carte et panneau montés dans `src/app/voyages/[id]/layout.tsx` (et son pendant de `/dev`) pour conserver la hauteur entre Séjour et jours.
- **F5-TL-6 — Actions locales du programme.** Interface injectable `ProgrammeActions` (`setStopLocked(stopId, locked)`, `setChecklistItemDone(itemId, done)`), implémentée en mémoire dans le navigateur en phase 0, alignée sur `TripPatch` (`lock`, `unlock`) et l'action de liste de B0, pour que B11 la remplace sans toucher aux écrans.
- **F5-TL-7 — Type de bandeau pour le trajet.** Ajouter à `StatusBanner` un type `travel` (`role="status"`, filet `ink-soft`), aucun des cinq types existants ne convenant ; rendu à confirmer par UX/UI (F5-Q1).
- **F5-TL-8 — Lien « Idées » par plage.** Remplacer la prop `ideasHref` de `DayLine` par `getIdeasHref?: (free: { from: string; to: string }) => string`, sur le modèle de `getStopHref`.

## Critères d'acceptation
Transverses :
- [ ] `pnpm verify` passe, sans clé ni Map ID.
- [ ] Voyage inconnu, voyage d'une autre organisation, `/jour/0`, `/jour/7`, `/jour/02`, `/jour/abc` : 404 (test `sejour: 404 hors organisation ou hors limites`).
- [ ] **Aucune persistance locale** : après le parcours complet (Séjour, cases cochées, jours, fiches, verrou et annulation, « Surprends-moi », hauteurs du panneau), `localStorage` et `sessionStorage` sont vides, `indexedDB.databases()` et `caches.keys()` renvoient des listes vides, aucun cookie n'est posé ; sur les écrans de F5 (Séjour, Journée, fiche), le seul paramètre d'adresse est `etape`, dont la valeur est toujours un `Stop.id`, jamais un `placeId` (les paramètres `de` et `a` du lien « Idées » appartiennent à l'écran « Ajouter un lieu » de F7, non visité par ce test) (test Playwright `sejour: aucune donnée persistée côté client`) ; la règle de lint de F4 contre le stockage client couvre `src/features/sejour` et les nouveaux composants.
- [ ] Aucune requête vers un domaine Google pendant les specs de F5 (domaines bloqués, zéro requête interceptée). Aucun fichier de `src/app/voyages` ni de `src/features/sejour` n'importe la carte simulée (règle de lint ou test d'import) ; `/dev/voyages/…` répond 404 en build de production sans `VADROUILLE_DEV_PAGES=1` (test et job `docker`). Sur `/voyages/mock_trip_edimbourg/jour/2` en CI, l'état « Carte indisponible. La liste contient tout le programme. » de F4 s'affiche et la `DayLine` reste complète (test `journee: route sans clé`).
- [ ] axe sans violation sur chaque écran et état listés dans « Tests » (`pnpm test:a11y`) ; contour de focus 2 px `line` décalé de 2 px ; chaque élément interactif mesure au moins 44 × 44 px (Playwright).
- [ ] Aucune couleur, taille ni valeur en `px` en dur hors `provisoire.css` (chaque valeur ajoutée y porte le numéro de sa question) ; tous les textes dans `fr.json` sous `sejour.*` ; aucun texte « Vérifié », « Aperçu », « Supprimer » ni « OK » dans `fr.json` ni dans le rendu ; `react/jsx-no-literals` actif sur les nouveaux fichiers (lint et test).
- [ ] `/dev/composants` montre `Sheet` (3 hauteurs), `DestinationPlate` (4 couleurs), `ChecklistRow` (à faire, faite, sans lien, rémunérée), `ReasonBlock` (avec et sans date), les ajouts à `DayLine` ; le test de contraste couvre `on-line` sur chaque `dest-*` (au moins 4,5:1).
- [ ] Captures Playwright comparées aux références (`pnpm test:visual`) ; la PR joint les captures 390 × 844 à côté des `preview.html` (DestinationPlate, ChecklistRow, ReasonBlock, DayLine), liste les rendus provisoires (F5-Q1), les choix soumis au Tech Lead (F5-TL-1 à F5-TL-8), les modifications du jeu simulé et la taille du JavaScript initial de la route Journée (budget du § 14, vérifié par F12).

Panneau et Journée [a] :
- [ ] À l'ouverture de `/voyages/mock_trip_edimbourg/jour/2`, le panneau mesure 55 % de la hauteur de la fenêtre (464 px à 2 px près) ; la poignée nommée « Agrandir le panneau » le passe à 92 % puis, nommée « Réduire le panneau », à 25 %, puis à 55 % ; flèche haut et flèche bas sur la poignée changent d'une hauteur (test `sheet: trois hauteurs sans glisser`).
- [ ] Glisser la poignée de 200 px vers le haut lentement depuis 55 % pose le panneau à 92 % ; de 40 px lentement, le ramène à 55 % ; un geste rapide de 60 px vers le bas depuis 55 % le pose à 25 % ; faire défiler le contenu ne change pas la hauteur (test `sheet: glisser et défilement`).
- [ ] À 92 %, toucher la pastille J3 mène à `/jour/3` avec le panneau toujours à 92 % ; recharger la page le remet à 55 % (test `sheet: hauteur conservée entre les jours`).
- [ ] Avec `prefers-reduced-motion: reduce`, le changement de hauteur n'a aucune transition calculée (Playwright).
- [ ] Le panneau n'est pas modal : avec le focus dans le panneau, Tab atteint ensuite les éléments suivants de la page sans piège ; la région est nommée « Programme » (test).
- [ ] Journée J2 : titre « Dimanche 30 août » de niveau 1, ligne « 1 h 25 de trajet · environ 95 CHF par personne », `DayLine` des `items`, section « Événements du jour » avec « [Concert d'orgue à St Giles] », sa plage « 18:00 – 19:00 » et la `Tag` « Non confirmé » ; `DayTabs` avec J2 en `aria-current="page"` (test `journee: contenu du jour`).
- [ ] Bandeau de trajet : présent sur J5 avec « 2 h 45 de trajet ce jour, au-delà des 1 h 30 prévues pour ton rythme. » et « vers [Distillerie accessible en bus] », `role="status"` ; absent sur J1 (90 pour 90) et J2 ; les valeurs viennent des données (test unitaire avec un budget de test modifié) (tests `journee: bandeau de trajet`, `travel: dépassement strict`).
- [ ] Jour de test `generating: true` : `StatusBanner` « Jour {n} en préparation », pas de `DayLine` ni de bandeau de trajet (test unitaire ; e2e sur le voyage débloqué simulé de F6-TL-6 s'il existe).
- [ ] Toucher le marqueur « Étape 4 » de J2, panneau à 25 % : le panneau passe à 55 %, l'étape 4 de la `DayLine` est entièrement dans la zone visible du panneau, l'adresse ne change pas, le focus reste sur le marqueur ; avec la fiche de Dean Village ouverte, toucher le marqueur 1 ferme la fiche (adresse sans `etape`, sans nouvelle entrée d'historique), amène l'étape 1 dans la zone visible, sélectionne le marqueur 1 et laisse le focus sur le marqueur 1, pas sur le lien « [Dean Village] » (test `journee: marqueur fait défiler la liste`).
- [ ] Glisser la carte simulée de 100 px ne change ni le défilement de la liste, ni l'adresse, ni la fiche ouverte ; glisser horizontalement de 200 px sur le panneau ne change pas de jour (test `journee: carte et jour indépendants`).
- [ ] Lien d'évitement activé panneau à 25 % : le panneau passe à 55 % et `document.activeElement` est la liste (test).
- [ ] Ordre de tabulation de la Journée : lien d'évitement, « Retour », marqueurs dans l'ordre, poignée, « Séjour », J1 à J6, puis le contenu du panneau dans l'ordre de lecture (test).
- [ ] « Surprends-moi » sur J2 : `aria-expanded="false"`, puis `true` et l'idée affichée (nom, `meta`, `ReasonBlock`) avec le focus resté sur le bouton ; masquée au second appui ; absent sur un jour sans idée (test `journee: surprends-moi`).
- [ ] « Retour » de la Journée mène à `/voyages/mock_trip_edimbourg` ; titre du document « Édimbourg · Jour 2 » (test).

Fiche [b] :
- [ ] Toucher « [Dean Village] » dans la `DayLine` de J2 : adresse `/voyages/mock_trip_edimbourg/jour/2?etape={id}`, fiche dans le panneau, focus sur son titre « [Dean Village] », marqueur 2 sélectionné (`aria-current="true"`) et placé dans la zone de carte au-dessus du panneau (centre du marqueur au-dessus du bord supérieur du panneau) (test `fiche: ouverture, focus et carte`).
- [ ] La fiche de Dean Village montre le moment « J2 · Dimanche 30 août · 10:50 – 11:50 », `meta`, « Pour y aller » « À pied, 20 min depuis [Royal Mile] », et sa `reason` en texte simple sans `ReasonBlock` (le jeu simulé ne lui donne pas de source) ; titre du document « [Dean Village] · Jour 2 » ; le titre de la fiche est l'unique titre de niveau 1 de la page (axe `page-has-heading-one` sans violation) ; la fiche de « [Distillerie accessible en bus] » (J5) montre un `ReasonBlock` avec le lien « [Site de la distillerie] », « Source consultée le 15 août 2026 », et « Pour y aller » « Bus, environ 50 min (estimation) depuis [Petite adresse de Chambers Street] » (libellé du mode selon F3) (test `fiche: contenu`).
- [ ] Fermer par « Fermer », par Échap et par le retour du navigateur : adresse sans `etape`, liste de J2 rétablie, focus sur le lien « [Dean Village] » de la `DayLine`, aucun marqueur sélectionné ; après « Fermer », le retour du navigateur ne rouvre pas la fiche (test `fiche: fermeture et retour du focus`).
- [ ] Chargement direct de `…/jour/2?etape={id de Dean Village}` : fiche ouverte, focus sur son titre ; « Fermer » remplace l'adresse par `/jour/2` et met le focus sur le lien de l'étape ; `?etape=inconnue` : journée sans fiche, adresse sans paramètre, annonce « Cette étape n'est plus dans ce jour. » (test `fiche: ouverture directe`).
- [ ] « Verrouiller » sur Dean Village : `aria-pressed="true"`, mention « Verrouillée » dans la fiche et dans la `DayLine` (nom accessible du lien compris), « Remplacer » disparaît, `UndoToast` « Étape verrouillée. » `role="status"` sans déplacer le focus ; « Annuler » dans les 5 s rétablit l'état exact (égalité profonde de l'état du programme), « Remplacer » revient, le focus est sur « Verrouiller » ; le toast disparaît à 5 000 ms (horloge simulée) (test `fiche: verrouiller et annuler`).
- [ ] La fiche du Tattoo (J1, verrouillé dans les données) montre la mention de verrou, « Verrouiller » en `aria-pressed="true"`, pas de « Remplacer » ; « Verrouiller » le déverrouille avec le toast « Verrou retiré. » (test).
- [ ] « Remplacer » est un lien vers `/voyages/mock_trip_edimbourg/jour/2/remplacer/{id}` ; aucun bouton « Supprimer » dans la fiche (test).
- [ ] Fiche du concert (événement de `Day.events` du J2) ouverte depuis « Événements du jour » : « Proposé pendant ton séjour, pas dans ton programme. », plage « 18:00 – 19:00 », `Tag` « Non confirmé », ni « Remplacer » ni « Verrouiller », aucun marqueur sélectionné ; la fermeture rend le focus à la ligne de l'événement (test `fiche: événement`).
- [ ] Étape sans `source` : pas de `ReasonBlock`, `reason` en texte simple ; `ReasonBlock` rend toujours son lien de source, titre « Pourquoi pour toi » (tests unitaires).
- [ ] `DayLine` : élément `openMeal` rendu avec son heure et « Dîner pas encore choisi », sans lien ; la numérotation des marqueurs de F4 l'ignore ; le lien « Idées » du temps libre de J2 pointe vers `/voyages/mock_trip_edimbourg/jour/2/ajouter?de=15:00&a=18:30` (F5-TL-8) (tests unitaires).

Séjour [c] :
- [ ] `/voyages/mock_trip_edimbourg` : onglet « Séjour » en `aria-current="page"` ; `DestinationPlate` « Édimbourg » (niveau 1) avec « sam. 29.08 – jeu. 03.09 · 2 adultes », aplat `dest-bruyere` ; « Budget estimé : environ 640 CHF par personne » ; carte d'ensemble ; titre du document « Édimbourg · Séjour » (test `sejour: en-tête et budget`).
- [ ] Budget : un voyage de test dont un jour n'a pas de budget affiche « (sans le jour {n}) » ; aucun jour avec budget : pas de ligne de budget (test unitaire).
- [ ] « À faire avant de partir » : 5 lignes dans l'ordre des données ; compteur de nom accessible « 4 réservations à faire » ; « [Billets du Tattoo] » faite (barrée, `ink-soft`, sans lien) ; « Réserver » ouvre `bookingUrl` dans un nouvel onglet avec `rel="noopener noreferrer"` ; « [Assurance voyage] » porte « Lien rémunéré » (test `sejour: trouver la liste à réserver`, scénario du handover § 14).
- [ ] Cocher « [Château d'Édimbourg] » : `aria-pressed="true"`, ligne barrée sans lien, compteur à 3, un `checklist_item_done` sans propriété, aucun toast ; décocher : ligne rétablie, compteur à 4, aucun événement ; cocher les 4 lignes masque le compteur (test `sejour: liste à réserver`).
- [ ] « Pendant ton séjour » : « [Concert d'orgue à St Giles] » (J2) puis « [Marché nocturne de Leith] » (J4), chacun avec « J{n} · {date courte} · {plage} » et « Non confirmé » ; le Tattoo n'y figure pas ; chaque ligne mène à la fiche de l'événement dans son jour (test).
- [ ] Depuis le Séjour, ouvrir « [Concert d'orgue à St Giles] » : adresse `/voyages/mock_trip_edimbourg/jour/2?etape={id}`, Journée J2 avec la fiche, focus sur son titre ; « Fermer » : adresse remplacée par `/voyages/mock_trip_edimbourg/jour/2`, J2 sans fiche, focus sur la ligne du concert dans « Événements du jour » ; rouvrir depuis le Séjour puis retour du navigateur : adresse `/voyages/mock_trip_edimbourg`, focus sur la ligne du concert dans « Pendant ton séjour » (test `sejour: fiche d'un événement et retour`).
- [ ] « Jour par jour » : 6 liens vers `/jour/1` à `/jour/6`, chacun avec « J{n} », le titre du jour et « {nombre} étapes · {durée} de trajet » ; un jour de test en préparation affiche « En préparation » (tests).
- [ ] Ordre de tabulation du Séjour : « Retour », poignée, onglets, puis contenu du panneau dans l'ordre de lecture ; les marqueurs de la vue d'ensemble ne sont pas focusables (test).
- [ ] `DestinationPlate` : style `destination`, texte `on-line` sur chacune des 4 couleurs, contraste d'au moins 4,5:1 (test de contraste) ; `ChecklistRow` : case de 22 px dans une zone d'au moins 44 × 44 px, lien « Réserver » d'au moins 44 px de haut (Playwright).

## Hors périmètre
- Remplacer (écran 14), Ajouter un lieu, Déplacer, « Ajouter à ma journée » depuis « Surprends-moi » : F7. Les liens de F5 y pointent et peuvent répondre 404 d'ici là.
- « Signaler une erreur » : attend le contrat `StopReport` (B11) ; à placer dans le backlog par le CEO.
- Bouton « Partager », vue partagée, Pendant le voyage (`/aujourdhui`), réouverture sur le dernier onglet consulté, hors-ligne et service worker, liens d'itinéraire externes : F10 ; Mes voyages (cible de « Retour » du Séjour) : F11.
- Mise en page grand écran (≥ 1024 px, Q7) et budgets Lighthouse : F12.
- Écriture réelle des verrous et de la liste, versions, conflits (`version_conflict`) : B11 et adaptateur `api`.
- Évolutions E1 (titres calculés depuis `date`), E3 (`Stop.facts`), E4 (`ChecklistMoment`) du handover back-end : B2 adaptera les écrans.
- Données de lieux Google réelles (Q5, Q14), photos (Q6), thème sombre.
- Écran 10 (Programme ajusté) et surlignage des étapes modifiées : F9 et F7.

## Questions ouvertes
Nouvelles questions de cette spécification (numéros définitifs attribués par le CEO dans `QUESTIONS.md`) :
- **F5-Q1 (UX/UI)** : rendus et textes non maquettés : mise en page carte + panneau du Séjour, poignée et en-tête du panneau, fiche dans le panneau (bouton « Fermer », ordre des blocs, actions), ligne de la plaque, ligne de budget, sections « Pendant ton séjour » et « Jour par jour », mention « Verrouillée » et cadenas, créneau de repas non choisi, bandeau de trajet (type `travel`, F5-TL-7), bloc « Surprends-moi », « Lien rémunéré », textes provisoires de F5-PO-1 à F5-PO-15. Bloque : validation visuelle de F5 (pas le code).
- **F5-Q2 (Samuel)** : avant paiement (`unlocked: false`), que montrent le Séjour et les journées au-delà de l'aperçu (première journée et début de la deuxième, cadrage § 4) : jours masqués, jours visibles sans étapes, ou programme complet ? Touche le contenu de l'offre gratuite. Bloque : le rendu définitif d'un voyage non débloqué et les données de B9, pas le code de F5 (qui affiche ce que renvoie l'adaptateur).
- **F5-Q3 (Tech Lead)** : distinguer dans le contrat un engagement saisi (billets du Tattoo) d'un verrou posé par la personne, pour empêcher de déverrouiller un engagement ? En attendant, tout verrou est réversible (F5-PO-10). Bloque : rien dans F5.
- **F5-Q4 (Tech Lead)** : propositions F5-TL-1 à F5-TL-8 (pages `/dev/voyages` avec la carte simulée, `openMeal`, `Day.surprise`, recentrage dans la zone visible, bibliothèque du panneau et mise en page partagée, actions locales, type de bandeau `travel`, `getIdeasHref`). Bloque : démarrage du code si le Tech Lead veut trancher avant ; sinon confirmées à la revue.
- **F5-Q6 (Samuel)** : que fait « Garder » sur la Fiche étape (cadrage § 3.1, écran 13 « garder ou remplacer », et vocabulaire « Garder » / « Remplacer » ; handover § 11 ; `redaction.md`) ? Une étape est gardée par défaut : faut-il un bouton « Garder » dans la fiche, et avec quel effet ? Bloque : l'ajout de « Garder » à la fiche ; pas le reste de F5, qui livre « Remplacer » et « Verrouiller ».
- **F5-Q5 (CEO)** : découpage en F5a, F5b, F5c (F5-PO-18) et ordre avec le code de F6 (`UndoToast`, module de mesure). Bloque : création des tickets de code.

Questions existantes qui touchent F5 :
- Q17 : partie Product Owner tranchée ici (F5-PO-12 à F5-PO-15) ; partie UX/UI (couleur du lien « Idées », graisse de l'heure) suit la décision 0012 et Q37.
- Q8 : budgets de trajet lus dans les données, jamais en dur.
- Q63 : contenu visible avant paiement ; les critères de F5, exécutés sur `mock_trip_edimbourg` (`unlocked: false`), n'en préjugent pas (voir « Tests » et F5-Q2).
- Q12 et Q59 : maquettes et Dossier UX absents ; référence provisoire : README et `preview.html` du design system.
- Q13, Q51 : icônes (cadenas, retour, fermer) non exportées en SVG ; texte seul si le tracé manque.
- Q14 et Q5 : origine des champs de `Stop` ; F5 n'affiche que des données simulées.
- Q37 et Q53 : libellés « Bus » ou « Transports publics » et format « 1 h 05 », repris de F3.
- Q52, Q58, Q60 : tranchées par la décision 0013 ; F5 s'y conforme (`CarteProvider`, carte simulée réservée à `src/app/dev/`, `getRequestContext()`, Pointer Events). F5-TL-8 amende l'API `ideasHref` de `DayLine` acceptée au § 2 de cette décision.
- Q49 et Q50 : non tranchées ici (Ajouter un lieu, F7 ; vue partagée, F10).
