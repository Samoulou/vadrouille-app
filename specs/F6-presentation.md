# F6 — Présentation « J'aime / Pas pour moi »

Rôle : frontend · Prérequis : F1 (#11) et F2 (#19) livrées dans `main` (handover § 15) · Ticket : #31 · Référence : `docs/handovers/frontend.md` (§ 0 règles 2 à 9, § 2 « Gestes », § 3, § 5 `DeckCard`, `DeckProgress`, `UndoToast`, `Sheet`, `Chip`, `StatusBanner`, § 6 écrans 6, 6b, 7 et 8 et leurs critères, § 7, § 8, § 9 `Proposal`, § 10, § 11, § 12, § 14, § 15 F6), `docs/produit/cadrage-v5.md` (§ 1 D11 et D12, § 3.1 écrans 5 à 9, § 3.2, § 3.3, § 3.4 « Restaurants », § 3.7 « Transparence » et « Apprentissage », § 6.6 « Tri par lot »), `docs/CONTEXT.md` (principes produit 3 et 5, principe technique 2, « Qui décide quoi »), `docs/design-system/components/DeckCard/` (README et `preview.html`), `docs/design-system/README.md`, `docs/design-system/redaction.md`, `specs/F1-contrats-donnees-simulees.md`, `specs/F2-composants-base.md`, `QUESTIONS.md`.

Documents en revue, non fusionnés au 2026-10-08, cités pour cohérence sans en dépendre : handover back-end (PR #27, `docs/handovers/backend.md` : actions `decideCard`, `undoDecision`, `answerPreferencePrompt`, contrats `DeckDecision`, `PreferencePrompt`, `PreferenceAnswer`, évolutions E1, E2, E5, tâche B10), décision UX/UI 0012 (PR #26 : tokens `trait-fin`, `trait-fort`, `radius-round`, espacements), questions Q31 à Q42 (PR #28).

Dossier UX : `docs/ux/dossier-ux.md` n'existe pas encore et `docs/ux/maquettes/` est vide (Q12). Les critères viennent du handover § 6 et § 7, du cadrage et du design system.

## Objectif
Livrer l'écran de présentation : une carte par proposition, à garder (« J'aime ») ou à écarter (« Pas pour moi ») d'un geste, d'un bouton ou au clavier, avec la progression, l'annulation pendant 5 secondes, la variante repas (« Je choisis » / « Option suivante »), la question de préférence au deuxième refus d'une catégorie, et la suite du tri après déblocage. Le tout sur données simulées (adaptateur `mock`, types de `src/contracts`), sans persistance côté client, et avec les événements de mesure `deck_*` et `preference_prompt_answered`.

## Prérequis vérifiables
| Élément | Livré par | Référence |
|---|---|---|
| `ProposalSchema` (avec `option`, `travelFromPrevious`, `detour`, `DETOUR_THRESHOLD_MINUTES` = 20), `TripSchema` (`unlocked`), `DaySchema` (`generating`), adaptateur `mock` (`getTrip`, `listProposals`), isolation par organisation, règle « `src/mocks` importé seulement depuis `src/adapters` et les tests » | F1 (#11) | `specs/F1-contrats-donnees-simulees.md` |
| 8 propositions simulées (Édimbourg), dont un repas à options et une proposition à plus de 20 min avec `detour` | F1 (#11) | `src/mocks/edimbourg.ts` |
| `Button`, `IconButton`, `Tag`, `Chip`, `StatusBanner`, page `/dev/composants`, test de contraste, règle `react/jsx-no-literals` sur `src/components/ligne`, `provisoire.css` | F2 (#19) | `specs/F2-composants-base.md` |

F6 ne dépend ni de F3 (#30, en revue) ni de F5. Si F3 est fusionnée avant le début du code, F6 réutilise ses libellés de modes de trajet (clés `ligne.*` de `fr.json`) au lieu d'en créer ; sinon F6 crée les siens sous `presentation.*` avec les mêmes valeurs provisoires que la spec F3 (« À pied », « Bus », « En voiture » ; Q16, Q37).

## Périmètre
- Composants `DeckCard` (variantes activité et repas), `DeckProgress`, `UndoToast` dans `src/components/ligne`.
- Écran 6 « Présentation » et écran 6b « Suite du tri » sur la route `/voyages/[id]/presentation`.
- Écran 7 « Confirmer une préférence » : feuille modale sur l'écran 6, avec `Chip` pour la raison facultative.
- Écran 8 « Choisir un repas » : `DeckCard` en variante repas dans le même paquet.
- Détail d'une proposition (appui sur la carte), écrans de fin de paquet, état vide.
- Événements de mesure, enregistreur local injectable.
- Ajouts au jeu simulé nécessaires aux critères (catégories, voyage débloqué pour 6b), en proposition au Tech Lead pour la forme.

## Choix réservés au Tech Lead (signalés, non tranchés ici)
Les points suivants sont des propositions (voir « Propositions au Tech Lead ») ; le frontend les soumet dans sa PR et le Tech Lead les confirme à la revue ou par une décision dans `docs/decisions/`. Les critères d'acceptation ne dépendent pas de la forme retenue, sauf mention.
- Champ de catégorie sur `Proposal` et vocabulaire des codes (F6-TL-1).
- Emplacement de l'état du paquet et forme des actions de décision en phase 0 (F6-TL-2).
- Module de mesure et son enregistreur (F6-TL-3).
- Bibliothèque de geste (`motion` nommée par le handover § 2, ou événements pointeur écrits à la main) et sa version (F6-TL-4).
- Primitive de la feuille modale de l'écran 7 et du détail, avant le `Sheet` à 3 hauteurs de F5 (F6-TL-5).
- Contexte d'organisation des routes sur l'adaptateur `mock` et jeu simulé de 6b (F6-TL-6).
- Emplacement et noms des fichiers ci-dessous.

## Fichiers à créer ou modifier (proposition)
- `src/components/ligne/DeckCard.tsx`, `DeckProgress.tsx`, `UndoToast.tsx` et leurs tests `*.test.tsx`.
- `src/features/presentation/deck.ts` : réducteur pur de l'état du paquet (F6-TL-2) et fonctions pures `resolveSwipe`, `swipeRotation`, `preferencePromptFor`.
- `src/features/presentation/PresentationScreen.tsx` (client), `PreferenceSheet.tsx`, `ProposalDetailSheet.tsx`, `DeckEnd.tsx`.
- `src/app/voyages/[id]/presentation/page.tsx` (composant serveur : lit le voyage et les propositions par `getTripAdapter()`, `notFound()` si le voyage est absent ou d'une autre organisation).
- `src/analytics/events.ts` (schémas des événements), `src/analytics/track.ts` (enregistreur injectable) (F6-TL-3).
- `src/contracts/trip.ts` (champ `category`, F6-TL-1), `src/mocks/edimbourg.ts` (catégories, corrections F6-PO-7 et F6-PO-11, voyage débloqué F6-TL-6), tests de F1 mis à jour en conséquence.
- `src/app/dev/composants` : section « Présentation » (chaque composant dans chacun de ses états).
- Textes dans `src/i18n/fr.json` sous `presentation.*` ; `tests/e2e/presentation.e2e.spec.ts`, `tests/e2e/presentation.a11y.spec.ts`, `tests/visual/presentation.visual.spec.ts` et leurs références.

### Props (proposition, à confirmer par le Tech Lead à la revue)
```ts
import type { Proposal } from "@/contracts";

type Gesture = "swipe" | "button" | "key";

interface DeckCardProps {
  proposal: Proposal;
  isLastOption?: boolean;                 // repas : dernière option du créneau (F6-PO-7)
  onLike: (gesture: Gesture) => void;     // « J'aime » ou « Je choisis »
  onDislike: (gesture: Gesture) => void;  // « Pas pour moi » ou « Option suivante »
  onOpen: () => void;                     // détail (F6-PO-12)
}
interface DeckProgressProps { current: number; total: number; label: string }
interface UndoToastProps { message: string; onUndo: () => void; onExpire: () => void; duration?: number } // 5000 par défaut
```

## Comportement

### Paquet et ordre
- Le paquet contient les propositions renvoyées par `listProposals`, dans l'ordre des données, regroupées par jour (tri stable par `day` puis `time`). Une proposition dont `stop.locked` vaut `true` n'est jamais présentée, même si l'adaptateur la renvoie (cadrage § 3.3, README DeckCard) (F6-PO-1).
- Une carte à la fois. Par défaut, une proposition est gardée : seul « Pas pour moi » la retire (cadrage § 3.3).
- Écran 6 (`trip.unlocked` faux) : « Tes premières propositions », les 8 propositions de l'aperçu (D11). Écran 6b (`trip.unlocked` vrai) : les propositions non encore triées du voyage débloqué, avec un `StatusBanner` `generating` tant qu'un jour a `generating: true` (F6-PO-13). F6 ne plafonne pas le nombre de cartes : le plafond d'environ 15 à 20 cartes (cadrage § 3.3) est appliqué par les données.

### Carte (`DeckCard`)
Anatomie du README et du `preview.html` de DeckCard : photo en haut, moment (pastille « J{day} » et « vers {time} »), nom, métadonnées (`stop.meta`), position dans la journée (`context`), ligne de trajet si besoin, justification (`stop.reason`), au plus un tag ; deux boutons ronds dessous. Détails en F6-PO-11.
- Ligne de trajet : affichée si et seulement si `travelFromPrevious.minutes` > 20 (`DETOUR_THRESHOLD_MINUTES`), composée par l'interface depuis `travelFromPrevious` (« À 50 min en bus (estimation) »), suivie du texte `detour` (handover § 6, cadrage § 3.7).
- Photo : toujours le bloc `muted` « Photo du lieu » en phase 0 ; `photoUrl` n'est pas affichée (Q6).
- Carte entière = bouton, nom accessible « Voir le détail de {name} », description accessible (`aria-describedby`) = moment, métadonnées, position, trajet, justification et tag, pour qu'un lecteur d'écran entende tout ce que la carte montre.

### Gestes, boutons et clavier (critères écran 6, handover § 7)
- Glisser horizontalement (événements pointeur : souris, toucher, stylet) : la carte suit le doigt ; rotation proportionnelle au déplacement, au plus 8° ; étiquette « J'aime » (vers la droite) ou « Pas pour moi » (vers la gauche) sur la carte, décorative (`aria-hidden`), l'information étant portée par les boutons et l'annonce. Repas : « Je choisis » et « Option suivante » (ou « Pas pour moi » sur la dernière option, F6-PO-7).
- Relâcher au-delà de 30 % de la largeur de la carte, ou avec un geste rapide, décide ; sinon retour élastique à la position de départ. Seuils en F6-PO-4. La carte sort du côté choisi ; rien d'autre ne bouge.
- Le défilement vertical de la page reste possible (`touch-action: pan-y` ou équivalent) ; un déplacement de moins de 10 px est un toucher, qui ouvre le détail.
- Boutons toujours visibles : « Pas pour moi » (à gauche) et « J'aime » (à droite), ronds, libellés visibles dessous ; nom accessible égal au libellé.
- Clavier (F6-PO-5) : flèche droite = « J'aime » / « Je choisis », flèche gauche = « Pas pour moi » / « Option suivante », quand le focus est dans la zone du paquet (carte, boutons, progression, « Passer », « Tout garder… ») ; inactives quand le focus est dans une feuille ou sur le `UndoToast`. Entrée ou Espace sur la carte ouvre le détail.
- Toujours visibles en 390 × 844, sans défilement, hors feuille ouverte : la progression, « Passer », la carte, les deux boutons et « Tout garder pour le jour {n} » (handover § 6).
- `prefers-reduced-motion: reduce` : pas de rotation ; la carte suit toujours le doigt pendant le glisser (manipulation directe), mais sa sortie et le retour élastique sont remplacés par un fondu (150 ms) ou un retour immédiat. Durées hors mouvement réduit : 150 à 250 ms, courbe standard.

### Passer et Tout garder
- « Passer » (bouton texte, en haut à droite, README DeckCard) quitte la présentation vers le programme, `/voyages/[id]` (écran 11, F5) : les cartes restantes sont gardées (F6-PO-2).
- « Tout garder pour le jour {n} », où {n} est le jour de la carte en cours : garde toutes les cartes restantes de ce jour et passe à la première carte du jour suivant, ou à la fin du paquet (F6-PO-3). Annulable 5 s.

### Annulation (`UndoToast`)
- Après chaque décision (« J'aime », « Pas pour moi », « Je choisis », « Option suivante », « Tout garder… ») : `UndoToast` avec le message de la décision et « Annuler », `role="status"`, sans prendre le focus, pendant 5 s (F6-PO-6).
- Une seule action annulable à la fois : une nouvelle décision rend définitive la précédente et remplace le toast.
- « Annuler » restaure l'état exact d'avant la décision (carte en cours, décisions, progression, réponse à la question qu'elle a déclenchée) et place le focus sur la carte restaurée.
- Le délai est suspendu tant que le toast a le focus ou est survolé, et reprend à la sortie (WCAG 2.2.1).

### Repas (écran 8)
- Un créneau de repas = les propositions `kind: "meal"` de même `day` et même `time`, ordonnées par `option.index`. Une seule option visible à la fois ; la carte indique « option {index} sur {total} » (F6-PO-7).
- « Je choisis » garde cette option pour le créneau : les autres options du créneau sortent du paquet et la progression avance au-delà d'elles.
- « Option suivante » montre l'option suivante du créneau. Sur la dernière option, le bouton de gauche s'appelle « Pas pour moi » : il laisse le créneau sans repas choisi, signalé comme tel dans le programme (représentation : E8 du handover back-end, réservée à F5 ; Q17).
- Sans décision (« Passer », « Tout garder… »), l'option 1 reste le repas du créneau.

### Question de préférence (écran 7)
- Déclenchée au deuxième « Pas pour moi » sur des propositions d'activité de même catégorie dans la session de tri (handover § 6 écran 7, cadrage § 3.3, D12). Les repas n'entrent pas dans ce compte (F6-PO-8).
- Feuille modale : titre « On arrête {catégorie} pour ce voyage ? » (libellé de la catégorie, F6-PO-10), raison facultative en `Chip` (« Pas mon style », « Trop chargé », « Trop cher », « Trop loin », « Autre raison », dans cet ordre, une seule à la fois), boutons « Oui » et « Non ».
- Aucune généralisation sans réponse : fermer la feuille (Échap, bouton de fermeture, toucher hors de la feuille) n'enregistre rien et n'envoie aucun événement.
- Une seule question par catégorie et par session de tri, quelle que soit la réponse.
- « Oui » : les cartes restantes de cette catégorie sortent du paquet (la progression se met à jour) et une annonce `role="status"` le dit. « Non » : rien ne change.
- Question de distance : quand deux refus portent la raison « Trop loin », la feuille pose « On reste plus près de ton hôtel ? » (cadrage § 3.7), une seule fois par session (F6-PO-9).
- Focus : à l'ouverture, sur le titre de la feuille ; piège à focus dans la feuille ; à la fermeture, retour sur l'élément du paquet qui avait le focus (ou la carte en cours).
- Le `UndoToast` de la décision qui a déclenché la question s'affiche à la fermeture de la feuille, pour 5 s.

### Détail d'une proposition
Appui sur la carte (ou Entrée, Espace) : feuille modale avec le nom, le moment, les métadonnées, la justification, la source (`stop.source`, lien) et la date de vérification si présente, et un bouton « Fermer » ; le focus va sur le titre à l'ouverture et revient sur la carte à la fermeture (handover § 7). Aucune décision ne se prend dans le détail (F6-PO-12).

### Progression (`DeckProgress`)
Ligne du `preview.html` : un arrêt par carte du paquet, pleins jusqu'à la carte en cours. `role="progressbar"`, `aria-valuemin="1"`, `aria-valuemax="{total}"`, `aria-valuenow="{current}"`, `aria-valuetext` et nom accessible « Proposition {current} sur {total} » (F6-PO-16). Les arrêts sont décoratifs.

### Fin du paquet, état vide, 6b
Voir F6-PO-13. Écran 6 : « Débloquer » (lien vers `/voyages/[id]/debloquer`, écran 9, F9) et « Voir le programme » (`/voyages/[id]`) ; aucun prix affiché dans F6 (Q2, écran 9). Écran 6b : « Voir le programme », et le `StatusBanner` `generating` si un jour est encore en préparation.

## Événements de mesure (handover § 12)
| Événement | Quand | Propriétés |
|---|---|---|
| `deck_decision` | Chaque décision sur une carte | `decision: like \| dislike`, `kind: activity \| meal`, `category` (code), `position` (rang de la carte, à partir de 1), `gesture: swipe \| button \| key`, `travel_minutes` (`travelFromPrevious.minutes`, 0 si absent) |
| `deck_undo` | « Annuler » du toast | `position` |
| `deck_skipped` | « Passer » ou « Tout garder… » | `position`, `scope: all \| day` (ajout, F6-PO-14) |
| `preference_prompt_answered` | « Oui » ou « Non » dans la feuille | `category` (code, ou `distance`), `answer: yes \| no`, `reason?` (`not_my_style`, `too_busy`, `too_expensive`, `too_far`, `other`) |

Correspondance repas : « Je choisis » = `like`, « Option suivante » et « Pas pour moi » = `dislike`, avec `kind: meal`. `deck_decision.reason` n'est jamais renseigné dans F6 : la raison se donne dans la feuille (F6-PO-14). Aucune donnée personnelle ni de lieu : ni nom, ni `placeId`, ni identifiant de proposition, ni texte libre.

## Règles Google
- **Aucune donnée Google dans un prompt** : F6 n'appelle aucun modèle ; les textes viennent de l'adaptateur `mock` et de `fr.json`.
- **Seul l'identifiant de lieu est stockable** : F6 ne stocke rien côté client, pas même `placeId`. L'état du paquet vit en mémoire ; aucune écriture dans `localStorage`, `sessionStorage`, IndexedDB, Cache Storage ni cookies ; aucun paramètre d'URL ne porte de décision. Recharger la page recommence le paquet à la première carte (F6-PO-15).
- **Pas de données Google affichées** : aucune carte géographique dans F6 ; aucune photo (`photoUrl` ignorée, Q6) ; en phase 0 toutes les données sont simulées, la mention « Données de lieux : Google » n'est donc pas rendue (comme F4-PO-9) ; l'affichage de contenus Google réels relève de B11 et de Q5, Q14.
- **Événements** : aucun nom de lieu ni `placeId` dans les propriétés (test).
- **Clés** : aucune.

## Tests

### Unitaires (Vitest, Testing Library, axe)
- `deck.ts` : réducteur (décider, annuler, passer, tout garder, options de repas, retrait par catégorie), `resolveSwipe`, `swipeRotation`, `preferencePromptFor`.
- `DeckCard`, `DeckProgress`, `UndoToast` (horloge simulée), `PreferenceSheet`, `ProposalDetailSheet`, `DeckEnd`, page (adaptateur simulé, voyage d'une autre organisation).
- Schémas des événements ; enregistreur en mémoire injecté.

### E2E, a11y et visuel (Playwright, 390 × 844, build de production)
- `tests/e2e/presentation.e2e.spec.ts` sur `/voyages/mock_trip_edimbourg/presentation` (écran 6) et sur le voyage débloqué simulé (écran 6b, F6-TL-6) : gestes, boutons, clavier, annulation, repas, question, fin, stockage client vide.
- `tests/e2e/presentation.a11y.spec.ts` : axe sur l'écran 6 (carte activité, carte repas), la feuille de question, le détail, la fin, l'écran 6b.
- `tests/visual/presentation.visual.spec.ts` : captures de l'écran 6 (première carte, carte repas, carte à plus de 20 min), de la feuille de question, du toast, de la fin de l'aperçu, de l'écran 6b ; références régénérées selon la décision 0004.

## Décisions (Product Owner, définitives sans veto de Samuel sous 2 jours)
Une décision marquée « provisoire (UX/UI) » porte sur un rendu ou un texte non maquetté et peut être changée par UX/UI sans nouvelle décision du Product Owner (F6-Q1).
- **F6-PO-1 — Ordre du paquet.** Ordre des données, regroupé par jour (tri stable par `day` puis `time`) ; aucune étape verrouillée présentée, même renvoyée par l'adaptateur.
- **F6-PO-2 — « Passer ».** Quitte la présentation vers `/voyages/[id]` (cadrage § 3.1 « Passer, voir le programme », § 3.3) ; les cartes restantes sont gardées ; pas de toast (rien n'est modifié : une proposition est gardée par défaut). Événement `deck_skipped` avec `scope: "all"`.
- **F6-PO-3 — « Tout garder pour le jour {n} ».** {n} = jour de la carte en cours ; garde les cartes restantes de ce jour (repas : l'option 1), passe au jour suivant ; annulable 5 s (toast « Jour {n} gardé. ») ; `deck_skipped` avec `scope: "day"`.
- **F6-PO-4 — Seuils du geste.** Décision si le déplacement horizontal au relâchement dépasse 30 % de la largeur de la carte, ou si la vitesse horizontale au relâchement est d'au moins 0,5 px/ms dans le sens du déplacement avec un déplacement d'au moins 24 px ; sinon retour élastique. Rotation = 8° × min(|déplacement| / (30 % de la largeur), 1), signe du déplacement. Moins de 10 px de déplacement = toucher.
- **F6-PO-5 — Clavier et focus.** Flèches gauche et droite actives seulement quand le focus est dans la zone du paquet. Après une décision au bouton ou au clavier depuis un bouton, le focus reste sur ce bouton (il sert à la carte suivante) ; depuis la carte, il passe à la carte suivante ; en fin de paquet, sur le titre de l'écran de fin. Pas de raccourci d'annulation : « Annuler » est atteint par Tab (le toast suit les boutons dans l'ordre de tabulation).
- **F6-PO-6 — Annulation.** 5 s, une action à la fois, état exact restauré y compris la réponse à la question déclenchée par la décision annulée ; focus sur la carte restaurée ; délai suspendu pendant le focus ou le survol du toast. Messages (provisoires, UX/UI) : « {name} écarté. », « {name} gardé. », « {name} choisi. », « Jour {n} gardé. », bouton « Annuler » (handover § 5 : « [X] écarté. Annuler »).
- **F6-PO-7 — Repas.** Créneau = même `day` et même `time` ; « option {index} sur {total} » ; « Je choisis » retire les autres options ; « Option suivante » montre la suivante ; sur la dernière, le bouton de gauche devient « Pas pour moi » (provisoire, UX/UI) et laisse le créneau sans repas choisi ; sans décision, l'option 1 reste. `option.total` est égal au nombre d'options du créneau présentes dans les données : le jeu simulé passe le dîner du J1 de `total: 3` à `total: 2` (deux options présentes), sans changer le nombre de propositions (8).
- **F6-PO-8 — Déclenchement de la question.** Deuxième « Pas pour moi » sur une activité de même catégorie dans la session ; la session est une instance de la page : son état vit en mémoire, sans persistance (F6-PO-15), et les écrans 6 et 6b, qui sont deux voyages simulés distincts, ont chacun la leur ; les refus de repas (« Option suivante », « Pas pour moi » sur la dernière option) ne comptent pas, car ils choisissent entre options d'un même créneau. Une question par catégorie et par session. Fermer sans répondre n'enregistre rien. « Oui » retire du paquet les cartes restantes de la catégorie, avec l'annonce « {nombre} propositions retirées » (provisoire, UX/UI) ; « Non » ne change rien. Raison facultative : une seule à la fois (toucher une autre `Chip` désélectionne la précédente). Le toast de la décision déclenchante est différé à la fermeture de la feuille.
- **F6-PO-9 — Question de distance.** La raison choisie dans la feuille s'applique au refus qui l'a déclenchée. Deux refus avec la raison « Trop loin » déclenchent, à la fermeture de la seconde feuille, « On reste plus près de ton hôtel ? », une seule fois par session ; la réponse est enregistrée dans l'état du paquet et envoyée en événement (`category: "distance"`) ; la réduction du budget de trajet est appliquée par le serveur (PO-1 de B0, tâche B10), pas par F6. Q41 (redemander après annulation) n'est pas tranchée ici.
- **F6-PO-10 — Catégories (provisoire, à aligner sur le vocabulaire des envies du brief quand F8 et B9 le fixeront).** Codes et libellés de la question : `museum` (« les musées et monuments »), `walk` (« les balades en ville »), `nature` (« la nature et les points de vue »), `tasting` (« les dégustations »), `restaurant` (repas, sans question). Libellés dans `fr.json`, jamais dans les données. Jeu simulé : château et musée national `museum`, Dean Village `walk`, jardin botanique et Arthur's Seat `nature`, distillerie `tasting`, dîners `restaurant` ; ce qui rend jouable le scénario du handover § 14 « écarter deux musées et répondre à la question ».
- **F6-PO-11 — Contenu de la carte.** Moment : pastille « J{day} » et « vers {time} » (`preview.html`). Au plus un tag, par priorité « Non confirmé », puis « À confirmer », puis « À réserver » (l'incertitude compte le plus pour décider, principe produit 2 ; la réservation reste dans la liste « À faire avant de partir »). Ligne de trajet seulement au-delà de 20 min, composée par l'interface depuis `travelFromPrevious` (mode, durée, « (estimation) » si `estimated`), puis le texte `detour` sur la ligne suivante ; `detour` ne contient que la justification : le jeu simulé corrige la distillerie en « [La distillerie la plus proche accessible sans voiture] » (aucun texte d'interface dans les données, handover § 9). Photo : bloc `muted` « Photo du lieu », `photoUrl` ignorée (Q6).
- **F6-PO-12 — Détail (provisoire, UX/UI).** Feuille modale en lecture seule (nom, moment, métadonnées, justification, source, date de vérification, « Fermer ») ; les décisions restent sur l'écran de présentation. Quand `ReasonBlock` existera (F5), le détail l'utilisera.
- **F6-PO-13 — Fin, vide et 6b (provisoire, UX/UI pour les textes).** Fin de l'écran 6 : titre « Tu as vu tes premières propositions », boutons « Débloquer » (`primary`, lien vers `/voyages/[id]/debloquer`) et « Voir le programme » (`secondary`, lien vers `/voyages/[id]`), sans prix. Fin de l'écran 6b : « Tu as tout trié », « Voir le programme » ; si un jour a `generating: true`, `StatusBanner` `generating` « Jour {n} en préparation » au-dessus du paquet et sur l'écran de fin (pas de mise à jour en direct dans F6). Paquet vide : « Aucune proposition à trier », « Voir le programme ». Titre de niveau 1 de l'écran, masqué visuellement : « Tes premières propositions » (6) ou « Suite du tri » (6b).
- **F6-PO-14 — Événements.** Propriétés du tableau ci-dessus ; ajout de `scope` à `deck_skipped` pour distinguer « Passer » de « Tout garder… » ; repas mappés sur `like` / `dislike` avec `kind: meal` ; raison envoyée seulement dans `preference_prompt_answered` ; aucune donnée personnelle ni de lieu. « Tout garder… » n'envoie pas de `deck_decision` par carte (aucune décision n'est prise).
- **F6-PO-15 — Pas de persistance en phase 0.** État en mémoire, rien dans le navigateur ni dans l'URL ; un rechargement recommence le paquet. Les décisions ne modifient pas le programme simulé : le recalcul par lot et l'écran 10 relèvent de B10 et F9. La reprise « à la dernière carte vue » (handover § 6, email) attend le back-end.
- **F6-PO-16 — Progression.** Compte les cartes du paquet (chaque option de repas est une carte) ; `current` = rang de la carte en cours ; quand des cartes sortent (« Je choisis », « Oui » à la question), `total` diminue d'autant et `current` garde le rang de la carte en cours dans le nouveau paquet. Texte « Proposition {current} sur {total} » en nom accessible ; pas de texte visible, comme le `preview.html` (provisoire, UX/UI).

## Propositions au Tech Lead (architecture et tests, à confirmer à la revue de la PR de code ou par une décision dans `docs/decisions/`)
- **F6-TL-1 — Catégorie de proposition.** Ajouter à `ProposalSchema` un champ obligatoire `category`, code d'un vocabulaire fermé (`CategorySchema`, `z.enum` des codes de F6-PO-10), aligné sur `candidates.category` du handover back-end (« vocabulaire commun ») ; mettre à jour le test de F1 qui compare `Proposal` à la forme du handover § 9 (champ ajouté, signalé, comme `Trip.organizationId`). Alternative laissée au Tech Lead : porter la catégorie sur `Stop`.
- **F6-TL-2 — État du paquet et actions.** Réducteur pur dans `src/features/presentation/deck.ts` ; les décisions passent par une interface injectable `DeckActions` (`decide`, `undo`, `answerPrompt`, noms alignés sur `decideCard`, `undoDecision`, `answerPreferencePrompt` de B0) qui renvoie la question de préférence éventuelle. En phase 0, l'implémentation locale (navigateur, en mémoire) calcule la question avec `preferencePromptFor` ; en B10 l'implémentation serveur la renverra (`DeckDecisionResult`) sans changer l'interface. Types `PreferencePrompt` (`{ kind: "category"; category } | { kind: "distance" }`) et `PreferenceAnswer` : dans `src/contracts/deck.ts` dès F6, ou locaux à F6 jusqu'à B10, au choix du Tech Lead.
- **F6-TL-3 — Mesure.** `src/analytics` : `track(event)` typé par une union d'événements validée par Zod (objets stricts : toute propriété inconnue refusée, ce qui empêche d'y glisser un nom ou un `placeId`) ; enregistreur injectable (contexte React) : en mémoire pour les tests, console en développement, aucun envoi réseau tant que PostHog n'est pas ouvert (F6-Q3).
- **F6-TL-4 — Geste.** `motion` (handover § 2) ou événements pointeur écrits à la main ; version selon la décision 0003. Les seuils et la rotation restent dans les fonctions pures de `deck.ts`, testées sans bibliothèque.
- **F6-TL-5 — Feuille modale.** La feuille de l'écran 7 et le détail utilisent une primitive modale (Drawer ou Dialog de shadcn/ui, Q10 pour les surfaces) à une seule hauteur, sans les points d'arrêt du `Sheet` de F5 ; F5 pourra la remplacer par son `Sheet`.
- **F6-TL-6 — Contexte et jeu simulé de 6b.** Tant que l'authentification n'existe pas (B3), la page construit le contexte d'adaptateur avec l'organisation simulée (`MOCK_ORGANIZATION_ID`), seulement quand `DATA_ADAPTER` vaut `mock`. Pour l'écran 6b, une seconde entrée du mock : voyage `mock_trip_edimbourg_debloque` (même contenu, `unlocked: true`, J6 `generating: true`, sans aucune proposition), avec au moins 7 propositions des jours 3 et 4 hors aperçu, entre crochets, dont un créneau de repas à 3 options et deux activités d'une même catégorie.

## Critères d'acceptation
- [ ] `pnpm verify` passe.
- [ ] `/voyages/mock_trip_edimbourg/presentation` affiche les 8 propositions dans l'ordre des données, regroupées par jour ; une proposition `locked` injectée dans l'adaptateur n'est pas présentée ; un voyage inconnu ou d'une autre organisation répond 404 (tests `presentation: ordre et filtrage du paquet`, `presentation: 404 hors organisation`).
- [ ] `DeckCard` affiche la pastille « J{day} », « vers {time} », le nom, `meta`, `context`, `reason` et au plus un tag selon la priorité de F6-PO-11 ; la photo est le bloc « Photo du lieu », même avec un `photoUrl` (tests `DeckCard: contenu`, `DeckCard: un seul tag`, `DeckCard: aucune photo affichée`).
- [ ] La ligne de trajet et le `detour` s'affichent pour la distillerie (50 min) et pas pour Dean Village (20 min exactement) ; le texte de trajet vient de `fr.json` (test `DeckCard: trajet au-delà de 20 min`).
- [ ] La carte est un bouton nommé « Voir le détail de {name} » dont la description accessible contient le moment, `meta`, `context` et `reason` ; l'activer (clic, Entrée, Espace) ouvre le détail, focus sur son titre, et le fermer rend le focus à la carte (tests `DeckCard: nom et description accessibles`, `presentation: détail et retour du focus`).
- [ ] `resolveSwipe` : 31 % de la largeur → décision ; 29 % lent → retour ; 15 % à 0,6 px/ms → décision ; 20 px à 1 px/ms → retour ; 9 px → toucher ; sens gauche = `dislike`, droite = `like`. `swipeRotation` ne dépasse jamais 8° en valeur absolue et vaut 8° à 30 % (test `presentation: seuils et rotation du geste`).
- [ ] Playwright : glisser la carte de 40 % vers la droite décide « J'aime » (`deck_decision` avec `gesture: "swipe"`) ; glisser de 10 % lentement la ramène à sa place sans décision ; pendant le glisser, l'étiquette « J'aime » ou « Pas pour moi » apparaît selon le sens (test `presentation: glisser décide ou revient`).
- [ ] Les boutons « Pas pour moi » et « J'aime » décident (`gesture: "button"`) ; flèches gauche et droite décident quand le focus est dans le paquet (`gesture: "key"`) et sont sans effet quand le focus est dans la feuille ou sur le toast (test `presentation: boutons et clavier`).
- [ ] Pour chacune des 8 cartes en 390 × 844 : progression, « Passer », carte, deux boutons et « Tout garder pour le jour {n} » sont entièrement dans la fenêtre sans défilement ; chaque élément interactif mesure au moins 44 × 44 px (test `presentation: commandes toujours visibles`).
- [ ] Après chaque décision, un `UndoToast` `role="status"` apparaît sans déplacer le focus, avec le message de F6-PO-6 ; il disparaît à 5 000 ms (horloge simulée) ; une nouvelle décision le remplace et rend la précédente définitive ; le délai est suspendu pendant le focus du toast (tests `UndoToast: 5 s et focus non volé`, `UndoToast: suspendu au focus`).
- [ ] « Annuler » restaure exactement l'état d'avant la décision (égalité profonde de l'état du réducteur), remet la carte en cours, place le focus sur elle et envoie `deck_undo` avec la position ; si la décision annulée avait déclenché une question à laquelle la personne a répondu, la réponse est aussi retirée (tests `presentation: annuler restaure l'état exact`).
- [ ] Repas : la carte du dîner J1 montre « option 1 sur 2 », « Je choisis » et « Option suivante » ; « Option suivante » montre « option 2 sur 2 » avec le bouton de gauche « Pas pour moi » ; « Je choisis » sur l'option 1 retire l'option 2 et la progression passe de 2 à 3 sur 7 ; le jeu simulé a `total: 2` pour les deux options (tests `presentation: créneau de repas`, `mock: options de repas présentes`).
- [ ] Scénario du handover § 14 : écarter le château puis le musée national (catégorie `museum`) ouvre la feuille « On arrête les musées et monuments pour ce voyage ? » avec focus sur son titre ; « Oui » avec « Trop cher » envoie `preference_prompt_answered` `{ category: "museum", answer: "yes", reason: "too_expensive" }` ; le toast de la décision apparaît ensuite (test e2e `presentation: écarter deux musées et répondre`).
- [ ] Fermer la feuille par Échap n'envoie aucun événement, n'enregistre aucune préférence, rend le focus au paquet, et un troisième refus de la même catégorie ne rouvre pas la question ; deux refus `nature` puis un refus `museum` ne la déclenchent pas pour `museum` ; deux « Option suivante » ne la déclenchent jamais (test `préférences: aucune généralisation sans réponse`, même nom que le critère de B10).
- [ ] « Oui » retire du paquet les cartes restantes de la catégorie et l'annonce ; « Non » ne retire rien (test `presentation: réponse oui ou non`).
- [ ] Deux feuilles répondues avec la raison « Trop loin » (catégories `nature` puis `museum`) ouvrent « On reste plus près de ton hôtel ? » ; la réponse envoie `category: "distance"` ; la question ne revient pas dans la session (test `presentation: question de distance`).
- [ ] « Tout garder pour le jour 1 » sur la première carte passe à la première carte du jour 2, envoie `deck_skipped` `{ scope: "day" }`, et s'annule ; « Passer » envoie `deck_skipped` `{ scope: "all" }` et mène à `/voyages/mock_trip_edimbourg` (test `presentation: passer et tout garder`).
- [ ] Fin de l'aperçu : titre de fin, liens « Débloquer » vers `/voyages/mock_trip_edimbourg/debloquer` et « Voir le programme » ; aucun montant ni « CHF » affiché ; écran 6b (voyage débloqué simulé, J6 `generating: true` sans proposition) : `StatusBanner` `generating` « Jour 6 en préparation » au-dessus du paquet, aucune carte du J6, puis, après la dernière carte des jours 3 et 4, l'écran de fin avec « Jour 6 en préparation » et « Voir le programme » ; paquet vide : état vide (tests `presentation: fin de l'aperçu`, `presentation: suite du tri`).
- [ ] `DeckProgress` : `role="progressbar"`, nom « Proposition {current} sur {total} », valeurs `aria-valuenow` et `aria-valuemax` justes au fil du paquet, y compris après un retrait (test `DeckProgress: valeurs accessibles`).
- [ ] Chaque événement émis est validé par son schéma strict ; une propriété `name`, `placeId`, `proposalId` ou un texte libre est refusée ; les propriétés correspondent au tableau des événements (tests `analytics: événements deck sans donnée personnelle`).
- [ ] Avec `prefers-reduced-motion: reduce`, aucune rotation n'est appliquée pendant le glisser et la sortie de carte est un fondu (test Playwright `presentation: mouvement réduit`).
- [ ] **Aucune persistance locale** : après le parcours complet (décisions, annulation, feuille, détail, fin), `localStorage` et `sessionStorage` sont vides, `indexedDB.databases()` et `caches.keys()` renvoient des listes vides, aucun cookie n'est posé, l'URL ne contient aucun paramètre (test Playwright nommé `presentation: aucune donnée persistée côté client`) ; `pnpm lint` échoue si un fichier de `src/features/presentation` ou des composants de F6 utilise `localStorage`, `sessionStorage`, `indexedDB`, `caches` ou `document.cookie` (règle avec son test, comme F4).
- [ ] Aucune requête vers un domaine Google pendant les specs de F6 (domaines bloqués, zéro requête interceptée).
- [ ] axe sans violation : composants (tests unitaires), écran 6 (carte activité et repas), feuille, détail, fin, écran 6b (`pnpm test:a11y`) ; contour de focus 2 px `line` décalé de 2 px ; feuille : `role="dialog"`, `aria-modal`, nommée par son titre, piège à focus, Échap.
- [ ] Aucune couleur, taille ni valeur en `px` en dur hors `provisoire.css` (chaque valeur ajoutée y porte le numéro de sa question, F6-Q2) ; tous les textes dans `fr.json` sous `presentation.*`, vocabulaire du handover § 10 (aucun « Like », « swiper », « valider ») ; `react/jsx-no-literals` actif sur les nouveaux fichiers (lint et test).
- [ ] `/dev/composants` montre `DeckCard` (activité, repas, dernière option, avec trajet), `DeckProgress` et `UndoToast` ; captures Playwright de `/dev/composants` et de l'écran de présentation comparées aux références (`pnpm test:visual`).
- [ ] La PR joint les captures 390 × 844 à côté du `preview.html` de DeckCard, liste les rendus provisoires (F6-Q1, F6-Q2), les choix soumis au Tech Lead (F6-TL-1 à F6-TL-6) et les modifications du jeu simulé.

## Hors périmètre
- Écran 5 (préparation, F8), écran 9 (Débloquer) et écran 10 (Programme ajusté) : F9. Les liens de F6 y pointent ; les routes peuvent répondre 404 tant qu'elles n'existent pas.
- Recalcul par lot, préférences déduites après trois « J'aime » et leur affichage, réduction du budget de trajet, persistance des décisions et reprise à la dernière carte vue : B10 et F9.
- Cases « aucune option compatible » de l'aperçu (`PreviewSlot`, E5 et PO-6 de B0) : B2 adaptera F6.
- Évolutions E1 et E2 du handover back-end (`Proposal.weekday` et `context` remplacés) : B2 adaptera `DeckCard`.
- Mise à jour en direct de la génération (`GenerationStatus`), hors-ligne, envoi réel des événements (F6-Q3), photos de lieux (Q6), données de lieux Google réelles (Q5, Q14), trier à deux, grand écran (Q7, F12), thème sombre.
- `Sheet` à 3 hauteurs et `ReasonBlock` (F5).

## Questions ouvertes
Nouvelles questions de cette spécification (numéros définitifs attribués par le CEO dans `QUESTIONS.md`) :
- **F6-Q1 (UX/UI)** : rendus et textes non maquettés de la présentation : `UndoToast` (position, aplat, contraste du lien « Annuler » ; provisoire : aplat `ink`, texte `page`, « Annuler » souligné en 700, au-dessus des boutons) ; étiquette pendant le glisser ; emplacement de « Tout garder pour le jour {n} » (provisoire : `Button` `text` `sm` sous les boutons ronds) ; texte visible « 4 sur 8 » ou non (handover § 5 « lisible », `preview.html` sans texte) ; mise en page de la feuille de question (titre, `Chip`, « Oui », « Non ») ; feuille de détail ; écrans de fin, vide et 6b ; place de « option 1 sur 2 » sur la carte repas ; libellé « Pas pour moi » sur la dernière option ; messages du toast et annonce de retrait. Bloque : validation visuelle de F6 (pas le code).
- **F6-Q2 (UX/UI)** : mesures du `preview.html` de DeckCard sans token (complète Q19 et la décision 0012, #26) : nom 22/28 en 800 (−0,01 em), photo de 220 px, boutons ronds de 68 px et écart de 56 px, pastille de jour de 24 px aux coins de 6 px, arrêts de progression de 12 px à anneau de 3 px. Bloque : retrait des valeurs de F6 de `provisoire.css`.
- **F6-Q3 (Samuel)** : ouverture d'un compte PostHog en région UE (compte externe) et règle de consentement aux mesures d'audience (juridique). Bloque : envoi réel des événements `deck_*` ; F6 utilise un enregistreur local sans réseau.
- **F6-Q4 (Samuel)** : les « 8 propositions offertes » (D11) comptent-elles chaque option de repas comme une proposition (choix du jeu simulé : oui, 8 cartes dont 2 options du même dîner) ou un créneau de repas comme une seule ? Touche la taille de l'offre. Bloque : la génération de l'aperçu (B9), pas F6, qui affiche ce que renvoient les données.
- **F6-Q5 (Tech Lead)** : propositions F6-TL-1 à F6-TL-6 (catégorie sur `Proposal`, état et actions du paquet, module de mesure, bibliothèque de geste, feuille modale avant F5, contexte et jeu simulé de 6b). Bloque : démarrage du code si le Tech Lead veut trancher avant ; sinon confirmées à la revue.

Questions existantes qui touchent F6 :
- Q5 (Samuel, juridique) et Q14 (Tech Lead) : contenus Google et origine des champs de `Stop` ; F6 n'affiche que des données simulées.
- Q6 (Samuel) : photos de lieux ; bloc « Photo du lieu » seulement.
- Q10 (UX/UI, décision proposée dans #26) : surfaces shadcn/ui de la feuille modale.
- Q12 (Samuel) : maquettes et Dossier UX non exportés ; référence provisoire : README et `preview.html` de DeckCard.
- Q13, Q19, Q30 (UX/UI, décision 0012 en revue dans #26) : tokens `trait-fin`, `trait-fort`, `radius-round`, style `bouton`, espacements, utilisés par F6 dès leur fusion.
- Q16 et Q37 : libellé du mode `transit` (« Bus » ou « Transports publics ») dans la ligne de trajet ; F6 suit F3.
- Q17 (Product Owner) et E8 de B0 : représentation d'un repas « pas encore choisi », fixée avec F5.
- Q41 (Product Owner, #28) : redemander la réduction de trajet après annulation ; non tranchée ici, F6 pose la question de distance une fois par session.
