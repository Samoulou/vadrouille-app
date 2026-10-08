# Handover front-end — Planificateur de voyages IA (MVP)

Destinataire : l'agent de développement front-end (Claude Code ou équivalent) et les agents qui le relaient.
Émetteur : Samuel Coppey, avec l'appui de Claude. Date : 7 octobre 2026.

Ce document est conçu pour être exécuté par des agents automatisés : chaque tâche a ses fichiers attendus, ses critères d'acceptation vérifiables et ses commandes de contrôle. Quand une information manque, l'agent ne l'invente pas : il l'inscrit dans la description de sa PR (le CEO la reporte dans `QUESTIONS.md` via la PR « chore: status ») et continue sur ce qui est défini.

---

## 0. À lire en premier

**Mission.** Construire l'interface web mobile d'abord du MVP, en style **Ligne**, branchée sur des **données simulées** derrière des adaptateurs typés, pour que les agents back-end puissent ensuite brancher les vraies sources sans toucher à l'interface.

**Règles d'or**

1. Aucune couleur, taille de texte, rayon ou espacement en dur : uniquement les tokens Ligne (§ 4).
2. L'interface n'affiche jamais un lieu qui ne vient pas des données : aucun texte de démonstration en production, les maquettes utilisent des crochets `[ ]` pour les contenus non vérifiés.
3. Toute donnée de lieu Google s'affiche avec la carte Google ou avec la mention d'attribution ; jamais sur une autre carte (§ 8).
4. Rien n'est stocké côté client à partir des données Google, sauf l'identifiant de lieu (§ 8).
5. Badges seulement pour les exceptions : « À réserver », « À confirmer », « Non confirmé ». Jamais « Vérifié ».
6. Le jaune `quai` signale exclusivement une action requise.
7. Chaque geste a un équivalent bouton ; chaque modification est annulable 5 secondes.
8. Cibles tactiles de 44 px minimum, contrastes WCAG 2.2 AA.
9. Vocabulaire fixe (§ 10) : une action garde le même nom partout.
10. Une tâche = une branche = une pull request, avec les vérifications du § 14 au vert.

---

## 1. Sources de vérité

| Source | Contenu | Accès |
|---|---|---|
| Canevas, page « Direction Ligne » | 18 écrans haute fidélité et prototype cliquable (bouton Play) | https://claude.ai/artifact/8CSvG9DzaQ74mQz7zWmAe6 |
| Canevas, page « Wireframes » | Parcours complet, écrans sans haute fidélité (Mes voyages, Après le voyage, États) | même lien |
| Design system Ligne | Tokens, principes, 9 composants avec règles, sections Carte et Rédaction | https://claude.ai/artifact/HMG9igk4KzTjtbKjWiA9vw |
| Dossier UX/UI | Personas, carte d'expérience, architecture de l'information, revue heuristique, spécifications d'interaction, plan de test, mesures | https://claude.ai/code/artifact/4908962d-a191-4cd7-8ec2-0bcf108913f7 |
| Cadrage v5 | Produit, architecture globale, données, conformité Google, règle « le meilleur, bien organisé » (§ 3.7) | `Cadrage_Voyage_IA_v5.md` |

Ces liens sont privés : Samuel exporte les maquettes en PNG dans `docs/ux/maquettes/` et le contenu du design system dans `docs/design-system/`. Ce handover reprend tout ce qui est nécessaire pour coder sans y accéder.

**En cas de conflit :** spécifications d'interaction du Dossier UX > maquettes Ligne > wireframes. Pour les valeurs (couleurs, tailles), les tokens du § 4 priment sur les maquettes.

---

## 2. Stack front et conventions

| Domaine | Choix | Note |
|---|---|---|
| Langage | TypeScript strict | `strict: true`, pas de `any` non justifié |
| Framework | Next.js (App Router), React Server Components par défaut | Composants client seulement pour l'interaction |
| Styles | Tailwind CSS v4, tokens dans `@theme` | Aucune valeur arbitraire `[#hex]` |
| Composants de base | shadcn/ui, adaptés à Ligne | Utiliser le serveur MCP et les skills shadcn si disponibles |
| Police | Hanken Grotesk 400, 600, 700, 800 via `next/font/google` | Chiffres tabulaires pour heures, dates, montants |
| Carte | Google Maps JavaScript API, chargée par `@googlemaps/js-api-loader` (chargeur officiel de Google) ; types `@types/google.maps` | Map ID avec style cloud (§ 8). `@vis.gl/react-google-maps` non retenue : décision 0013 |
| Gestes | Pointer Events natifs pour le glisser des cartes de présentation (seuils et rotation en fonctions pures) | `motion` non retenu pour F6 : décision 0013 |
| Panneau coulissant | Drawer de shadcn/ui avec points d'arrêt | Vérifier que la dépendance sous-jacente est maintenue, sinon `motion` |
| Validation | Zod, schémas partagés avec le back-end | `src/contracts` |
| Données serveur | Server Actions et route handlers derrière des adaptateurs | Mocks au MVP front |
| Tests | Vitest, Testing Library, Playwright, axe | § 14 |
| Mesure | PostHog (région UE) | Événements du § 12 |
| Erreurs | Sentry | |
| PWA | Manifest + service worker | Hors-ligne du § 13 |
| Hébergement | Vercel ; portabilité préservée : `output: "standalone"`, `Dockerfile` construit en CI, aucun stockage propre à Vercel (KV, Edge Config) | Décision 0002 |

Versions : dernière version stable de chaque outil au démarrage, notée dans `docs/decisions/0003-versions.md`. L'agent vérifie la documentation officielle avant d'utiliser une API qu'il ne connaît pas avec certitude.

---

## 3. Structure du dépôt (partie front)

```
src/
  app/                   routes (§ 6)
  components/
    ui/                  composants shadcn adaptés
    ligne/               composants du design system (§ 5)
  features/
    creation/            écrans 1 à 5
    presentation/        écrans 6 à 10
    sejour/              écrans 11 à 14, ajouter, déplacer
    voyage/              pendant et après le voyage
    compte/              mes voyages, compte
  contracts/             types et schémas Zod (§ 9)
  adapters/              accès aux données, mock ou réel
  mocks/                 jeux de données (Édimbourg)
  i18n/                  fr.json
  analytics/             événements (§ 12)
  styles/                globals.css avec @theme
tests/
  e2e/                   Playwright, scénarios du plan de test
  visual/                captures de référence
docs/
  maquettes/             PNG exportés du canevas
  design-system/         README, tokens.json, composants
  decisions/             décisions techniques
CLAUDE.md                instructions agents (annexe A)
QUESTIONS.md             questions ouvertes des agents
```

---

## 4. Design system Ligne dans le code

### 4.1 Tokens (à copier dans `src/styles/globals.css`)

```css
@import "tailwindcss";

@theme {
  /* Couleurs */
  --color-page: #fcfdfe;
  --color-raised: #ffffff;
  --color-muted: #f1f4f8;
  --color-ink: #0e1b30;
  --color-ink-2: #1d2939;
  --color-ink-soft: #475467;
  --color-line: #2a55d4;
  --color-on-line: #ffffff;
  --color-quai: #f6c744;
  --color-hairline: #e3e8ef;
  --color-outline: #d5dce6;
  --color-outline-strong: #c5ceda;
  --color-border-control: #848fa1;
  --color-track-free: #98a3b3;
  --color-map-land: #edf0f4;
  --color-map-water: #d3e1ee;
  --color-map-park: #e0eadf;
  --color-map-road: #ffffff;
  --color-dest-bruyere: #5e4290;
  --color-dest-azulejo: #1f5fa8;
  --color-dest-ocre: #8f5a14;
  --color-dest-granit: #3e4a57;

  /* Police */
  --font-sans: "Hanken Grotesk", "Helvetica Neue", Arial, sans-serif;

  /* Rayons */
  --radius-tag: 4px;
  --radius-badge: 8px;
  --radius-control: 12px;
  --radius-block: 14px;
  --radius-plate: 16px;
  --radius-sheet: 22px;

  /* Styles de texte */
  --text-destination: 36px;   --text-destination--line-height: 40px;
  --text-titre-fiche: 30px;   --text-titre-fiche--line-height: 34px;
  --text-titre-jour: 28px;    --text-titre-jour--line-height: 32px;
  --text-montant: 24px;       --text-montant--line-height: 30px;
  --text-section: 20px;       --text-section--line-height: 26px;
  --text-arret: 18px;         --text-arret--line-height: 22px;
  --text-heure-l: 17px;       --text-heure-l--line-height: 22px;
  --text-corps: 15px;         --text-corps--line-height: 22px;
  --text-corps-s: 14px;       --text-corps-s--line-height: 20px;
  --text-legende: 13px;       --text-legende--line-height: 18px;
  --text-etiquette: 12px;     --text-etiquette--line-height: 24px;
}

:root {
  /* Géométrie de la ligne */
  --ligne-rail: 4px;
  --ligne-rail-free: 2px;
  --ligne-rail-dash: 4px;
  --ligne-rail-gap: 5px;
  --ligne-stop: 20px;
  --ligne-stop-ring: 4px;
  --ligne-stop-map: 26px;
  --ligne-stop-map-selected: 38px;
  --ligne-terminus: 20px;
  --touch-target: 44px;

  /* Correspondance shadcn/ui */
  --background: var(--color-page);
  --foreground: var(--color-ink);
  --primary: var(--color-line);
  --primary-foreground: var(--color-on-line);
  --secondary: var(--color-raised);
  --secondary-foreground: var(--color-ink);
  --muted: var(--color-muted);
  --muted-foreground: var(--color-ink-soft);
  --accent: var(--color-muted);
  --accent-foreground: var(--color-ink);
  --border: var(--color-outline);
  --input: var(--color-border-control);
  --ring: var(--color-line);
  --radius: 12px;
}
```

Graisses : titres d'affichage et `montant` en 800 avec `letter-spacing: -0.015em` (destination : `-0.02em`) ; `section` en 800 ; `arret` en 700 ; heures en 700 ; étiquettes en 700. Heures, dates, durées et montants en `tabular-nums`.

Thème clair uniquement au MVP. Pas d'ombres : la profondeur vient des aplats et des contours.

### 4.2 Règles d'usage

| Élément | Règle |
|---|---|
| `line` | Tracé, arrêts, sélection, action principale, liens d'action. Jamais décoratif. |
| `quai` | « À réserver », compteur de réservations, bandeau d'action requise. Texte toujours `ink`. |
| `ink-soft` | Texte secondaire le plus clair autorisé. |
| `border-control` | Contour de tout champ de saisie et de tout contrôle sans libellé visible (3,2:1). |
| `outline`, `outline-strong`, `hairline` | Décoratifs uniquement. |
| `dest-*` | Plaque destination uniquement, texte `on-line`. Attribution d'une couleur par destination, stable. |
| Focus | `outline: 2px solid var(--color-line); outline-offset: 2px` sur tous les éléments interactifs. |

---

## 5. Composants à construire (`src/components/ligne`)

| Composant | Rôle | Props clés | États et accessibilité |
|---|---|---|---|
| `Button` | Action | `variant: primary \| secondary \| text`, `size: md (52) \| sm (44)`, `asChild` | Focus visible ; `disabled` en `muted` + `ink-soft` |
| `IconButton` | Contrôle sur la carte ou en-tête | `icon`, `label` (obligatoire), `shape: square \| round` | 44 × 44 ; `aria-label` = `label` |
| `DayBadge` | Pastille J1, J2… avec jour abrégé | `day`, `weekday`, `active`, `disabled`, `href` | Actif : `aria-current="true"` ; désactivé : « complet » |
| `DayTabs` | Rangée « Séjour » + pastilles | `days`, `current` | Défilement horizontal, pastille active visible à l'ouverture |
| `DayLine` | Ligne du jour | `items: DayLineItem[]` | Liste ordonnée sémantique (`<ol>`) |
| `DayLine.Stop` / `.Terminus` / `.Segment` / `.FreeTime` | Lignes de la ligne du jour | voir § 9 | Arrêt = lien vers la fiche |
| `StopMarker` | Marqueur de carte | `number`, `selected`, `kind: stop \| terminus \| overview` | Accessible via la liste, pas seulement la carte |
| `Tag` | Exception | `kind: toReserve \| toConfirm \| unconfirmed` | Texte toujours présent |
| `Counter` | Compteur jaune | `value` | `aria-label` explicite |
| `DestinationPlate` | Plaque destination | `name`, `meta`, `color` | Contraste vérifié par test |
| `ChecklistRow` | Ligne « à réserver » | `label`, `when`, `done`, `bookingUrl`, `sponsored` | Case de 44 px, `aria-pressed` |
| `ReasonBlock` | « Pourquoi pour toi » | `text`, `sourceLabel`, `sourceUrl`, `verifiedAt` | Lien source obligatoire |
| `DeckCard` | Carte de présentation | `proposal`, `onLike`, `onDislike`, `onOpen` | Carte entière = bouton ; gestes doublés de boutons |
| `DeckProgress` | Progression en ligne | `current`, `total`, `label` | Texte « 4 sur 8 » lisible |
| `UndoToast` | « [X] écarté. Annuler » | `message`, `onUndo`, `duration=5000` | `role="status"`, focus non volé |
| `Sheet` | Panneau coulissant | `snapPoints=[0.25,0.55,0.92]`, `defaultSnap=0.55` | Poignée = bouton « Agrandir / Réduire » |
| `SegmentedControl` | Choix exclusif | `options`, `value` | Rôle radiogroup |
| `Chip` | Choix multiple | `selected`, `inferred` (pointillé) | `aria-pressed` |
| `OtpInput` | Code à 6 chiffres | `length=6`, `onComplete` | Collage du code accepté, `autocomplete="one-time-code"` |
| `ChangeSet` | « Ce qui change » sur la ligne | `changes: Change[]` | Ancien barré + texte « à la place de » |
| `StatusBanner` | États transverses | `kind: offline \| conflict \| noOption \| error \| generating` | `role="status"` ou `alert` selon gravité |

Chaque composant a une story ou une page de démonstration (`/dev/composants`, désactivée en production) et un test d'accessibilité axe.

---

## 6. Écrans et routes

Numéros = titres des écrans sur la page « Direction Ligne ». « W » = écran présent seulement en wireframe : appliquer Ligne puis joindre une capture à la PR pour validation.

| # | Écran | Route | Composants principaux | Données |
|---|---|---|---|---|
| 1 | Créer le voyage | `/voyages/nouveau` | inputs, `SegmentedControl`, options logement, liste d'engagements | `TripDraft` |
| 2 | Brief raconté | `/voyages/nouveau/brief` | textarea, `Chip` (déduit = pointillé), `SegmentedControl` | `Brief` |
| 3 | Où loger | `/voyages/[id]/logement` | mini-carte zone, cartes logement | `LodgingSuggestion` |
| 4 | Compte | `/connexion?suite=…` | email, `OtpInput` | — |
| 5 | Propositions prêtes | `/voyages/[id]/preparation` | mini-lignes par jour, état de génération | `GenerationStatus` |
| 6 | Présentation | `/voyages/[id]/presentation` | `DeckProgress`, `DeckCard`, `UndoToast` | `Proposal[]` |
| 6b | Suite du tri | même route, après déblocage | idem + `StatusBanner generating` | idem |
| 7 | Confirmer une préférence | feuille sur 6 | `Sheet`, `Chip` | `PreferencePrompt` |
| 8 | Choisir un repas | carte de type repas dans 6 | `DeckCard` variante repas | `Proposal` (`kind: meal`) |
| 9 | Débloquer | `/voyages/[id]/debloquer` | `DestinationPlate`, liste incluse, boutons de paiement | `Offer` |
| 10 | Programme ajusté | `/voyages/[id]/ajuste` | préférences retenues, changements, bandeau `quai` | `AdjustmentSummary` |
| 11 | Séjour | `/voyages/[id]` | carte d'ensemble, `DayTabs`, `DestinationPlate`, `ChecklistRow`, événements, jour par jour | `Trip` |
| 12 | Journée | `/voyages/[id]/jour/[n]` | carte, `Sheet`, `DayLine`, événements du jour, « Surprends-moi » | `Day` |
| 13 | Fiche étape | `/voyages/[id]/jour/[n]?etape=[stopId]` (feuille) | `ReasonBlock`, actions | `Stop` |
| 14 | Remplacer une étape | `/voyages/[id]/jour/[n]/remplacer/[stopId]` | raisons, proposition, `ChangeSet` | `ReplacementPreview` |
| — | Ajouter un lieu | `/voyages/[id]/jour/[n]/ajouter` | recherche, `DayBadge`, choix du moment | `PlaceSearchResult[]` |
| — | Déplacer une étape | feuille sur 12 ou 13 | `DayBadge`, points d'insertion sur `DayLine` | `MoveOptions` |
| 15 | Pendant le voyage | `/voyages/[id]/aujourdhui` | prochaine étape, bandeau `quai`, `DayLine` compacte | `Today` |
| W | Mes voyages | `/voyages` | cartes de voyage, plaque | `TripSummary[]` |
| W | Après le voyage | `/voyages/[id]/retour` | avis par étape, mémoire des goûts (opt-in) | `TripReview` |
| W | États | composants transverses | `StatusBanner` | — |
| W | Vue partagée | `/p/[token]` | lecture seule de 11 et 12 | `SharedTrip` |

**Règles de navigation** (Dossier UX, architecture de l'information) : retour toujours vers le niveau supérieur ; un voyage rouvre sur le dernier onglet consulté, et sur `/aujourdhui` aux dates du voyage ; la fiche se ferme sur l'arrêt d'origine ; l'email « propositions prêtes » ouvre la présentation à la dernière carte vue.

**Mise en page grand écran (non maquettée) :** à partir de 1024 px, carte à gauche (flexible) et panneau de 420 px à droite, sans feuille coulissante. Implémenter, capturer, signaler dans la PR.

### Critères d'acceptation par écran (extraits obligatoires)

- **6 Présentation :** glisser au-delà de 30 % de la largeur ou geste rapide = décision ; sinon retour élastique ; rotation ≤ 8° ; étiquette « J'aime » ou « Pas pour moi » selon le sens ; flèches clavier gauche et droite ; `UndoToast` 5 s après chaque décision ; « Passer » et « Tout garder pour le jour N » toujours visibles ; chaque carte affiche sa position dans la journée (« Entre ton déjeuner et … ») ; une proposition à plus de 20 min de l'étape précédente affiche son temps de trajet et ce qui justifie le détour (« À 25 min de ton hôtel en bus, sur ton chemin vers … »).
- **7 :** déclenchée au deuxième refus dans une même catégorie ; aucune généralisation sans réponse.
- **9 :** si l'utilisateur ne paie pas, ses premières propositions restent accessibles ; aucun écran ne bloque le retour.
- **12 :** le panneau a 3 hauteurs ; toucher un arrêt sur la carte fait défiler la liste ; toucher un arrêt dans la liste ouvre la fiche et centre la carte ; déplacer la carte ne change pas la liste ; pas de glissement horizontal pour changer de jour ; si le temps de trajet du jour dépasse le budget du rythme, un `StatusBanner` l'indique et l'explique.
- **14 :** raisons proposées dans cet ordre : Pas mon style, Trop chargé, Trop cher, Trop loin, Autre raison ; réponse depuis la réserve < 5 s avec squelette ; au-delà, message « On cherche autour de … » avec « Arrêter » ; après « Appliquer », retour à la journée, étapes modifiées surlignées 2 s, `UndoToast` « Modifié. Annuler ».
- **Déplacer :** toujours disponible sans glisser ; jours complets désactivés avec la mention « complet ».
- **15 :** « Enregistré pour le hors-ligne à HH:MM » visible ; liste utilisable sans réseau.

---

## 7. Interactions et mouvement

| Élément | Spécification |
|---|---|
| Panneau | Points d'arrêt 25 %, 55 % (défaut), 92 % ; poignée cliquable |
| Présentation | Seuil 30 % ou vélocité ; rotation max 8° ; sortie de la carte du côté choisi ; aucune autre animation |
| Annulation | 5 s, une action à la fois ; restaure l'état exact |
| Remplacement | Surlignage 2 s des étapes modifiées après application |
| Génération | La ligne de chaque jour se dessine, puis les arrêts apparaissent ; texte équivalent « Jour 2 prêt » |
| Durées | 150 à 250 ms, courbe standard |
| Mouvement réduit | `prefers-reduced-motion` : fondus seulement, pas de rotation ni de tracé animé |
| Focus | Ouvrir une fiche → focus sur son titre ; fermer → retour sur l'arrêt d'origine |

---

## 8. Carte (Google Maps)

- Carte vectorielle chargée par `@googlemaps/js-api-loader` (décision 0013), avec **Map ID** et style cloud selon la section Carte du design system : terre `map-land`, eau `map-water`, parcs `map-park`, routes blanches de toutes catégories, points d'intérêt Google masqués, lignes de transport masquées, libellés en gris.
- Marqueurs avancés en HTML : `StopMarker` numérotés, terminus carré, arrêt sélectionné 38 px plein `line`.
- Tracé du jour : polyligne `line` 4 px, extrémités arrondies ; retour à pied vers l'hôtel en pointillé.
- **Conformité :** les données de lieux Google (noms, horaires, notes) ne s'affichent que sur cette carte ou, sans carte, avec la mention « Données de lieux : Google ». Aucune autre carte n'affiche ces données.
- **Stockage :** côté client, seuls les identifiants de lieu peuvent être conservés. Pas de mise en cache locale des horaires, notes ou photos Google ; pas de cache des tuiles de carte. Les coordonnées éventuellement reçues ne sont jamais persistées en local.
- Hors-ligne : la carte est remplacée par un message « Carte indisponible hors ligne » ; la liste reste utilisable.
- La clé API est restreinte par domaine ; elle n'est jamais commitée.

---

## 9. Données : contrats et simulations

Les écrans consomment uniquement les types ci-dessous, via `src/adapters`. Au MVP front, l'adaptateur `mock` lit `src/mocks/edimbourg.ts`, construit d'après les maquettes. L'adaptateur `api` sera écrit avec le back-end.

```ts
// src/contracts/trip.ts (extrait, à compléter en Zod)
export type Weekday = "lun." | "mar." | "mer." | "jeu." | "ven." | "sam." | "dim.";

export type Exception = "toReserve" | "toConfirm" | "unconfirmed";

export interface Source { label: string; url: string }

export interface Stop {
  id: string;
  kind: "activity" | "meal" | "event";
  placeId?: string;            // identifiant Google, seul élément stockable
  name: string;
  start: string;               // "10:45", heure locale de la destination
  end?: string;
  meta: string;                // "Quartier historique, 1 h, gratuit"
  reason?: string;             // une ligne, commence par ce que la personne a choisi
  source?: Source;
  verifiedAt?: string;         // ISO date
  exceptions: Exception[];
  locked: boolean;
}

export interface Segment {
  mode: "walk" | "transit" | "car";
  minutes: number;
  estimated: boolean;          // affiche « (estimation) »
}

export type DayLineItem =
  | { type: "terminus"; role: "start" | "end"; time: string; label: string }
  | { type: "stop"; stop: Stop }
  | { type: "segment"; segment: Segment }
  | { type: "free"; from: string; to: string };

export interface Day {
  index: number;               // 1 = J1
  date: string;                // ISO
  weekday: Weekday;
  title: string;               // "Dimanche 30 août"
  items: DayLineItem[];
  budgetPerPerson?: number;
  events: Stop[];              // kind: "event", du jour seulement
  generating: boolean;
  travelMinutes: number;       // total des trajets du jour, hors excursion
  travelBudgetMinutes: number; // budget du rythme choisi (à calibrer, D14)
}

export interface Trip {
  id: string;
  destination: string;
  destinationColor: "bruyere" | "azulejo" | "ocre" | "granit";
  start: string; end: string;
  travellers: { adults: number; children: number };
  days: Day[];
  checklist: ChecklistItem[];
  unlocked: boolean;           // voyage débloqué ou non
}

export interface ChecklistItem { id: string; label: string; when: string; done: boolean; bookingUrl?: string; sponsored: boolean }

export interface Proposal {
  id: string;
  kind: "activity" | "meal";
  day: number; weekday: Weekday; time: string;
  context: string;             // "Entre ton déjeuner et [Distillerie]"
  stop: Stop;
  option?: { index: number; total: number };   // repas : option 1 sur 3
  photoUrl?: string;
  travelFromPrevious?: Segment;  // trajet depuis l'étape précédente (ou l'hôtel)
  detour?: string;               // affiché si trajet > 20 min : ce qui justifie le détour
}

export type Change =
  | { type: "replaced"; time: string; before: string; after: string }
  | { type: "moved"; label: string; before: string; after: string }
  | { type: "segment"; before: number; after: number; estimated: boolean }
  | { type: "budget"; deltaPerPerson: number }
  | { type: "unchanged"; label: string; time: string };
```

Règles : les montants arrivent en nombres et sont formatés côté interface (`Intl.NumberFormat("fr-CH")`) ; les heures sont déjà en heure locale de la destination ; aucun texte d'interface n'est stocké dans les données.

---

## 10. Rédaction et langue

Français uniquement au MVP, mais **toutes** les chaînes passent par `src/i18n/fr.json`. Tutoiement, phrases courtes, pas de point d'exclamation, pas d'emoji.

| Contexte | Mots imposés | Mots interdits |
|---|---|---|
| Présentation | J'aime / Pas pour moi ; Je choisis / Option suivante ; Passer ; Tout garder pour le jour N | Like, swiper, valider |
| Programme | Garder, Remplacer, Déplacer, Verrouiller ; Appliquer / Annuler | Supprimer une étape, OK |
| Préférences | Retirer, Modifier | Annuler (pour une préférence) |
| Raisons de refus ou de remplacement | Pas mon style, Trop chargé, Trop cher, Trop loin, Autre raison | Pas intéressé, Nul |
| Réservations | À réserver ; Réserver ; Déjà réservé | Booker |
| Incertitude | À confirmer ; Non confirmé | Peut-être |
| Paiement | Débloquer ; Payer avec TWINT ; Payer par carte | Acheter maintenant, Premium |
| Essai gratuit | Tes premières propositions | Aperçu |
| Onglet du voyage | Séjour | Aperçu |

Formats : « dim. 30.08 », « Dimanche 30 août », « 10:45 », « 10:45 – 11:45 », « 45 min », « 1 h 30 », « environ 35 CHF par personne ».

---

## 11. Accessibilité (WCAG 2.2 AA)

- Contrastes : texte ≥ 4,5:1, grands textes et contours de contrôle ≥ 3:1 ; tests automatiques sur les paires de tokens.
- Cibles ≥ 44 × 44 px (critère 2.5.8).
- Alternative à tout glisser (critère 2.5.7) : boutons de la présentation, « Déplacer vers… ».
- Ordre de tabulation = ordre de lecture ; focus visible partout ; pièges à focus seulement dans les feuilles modales, avec Échap.
- La carte n'est jamais la seule source d'information : la liste contient tout.
- Annonces : décisions de la présentation, remplacements, états via `role="status"`.
- `prefers-reduced-motion` respecté.
- Langue du document `lang="fr"`.

---

## 12. Événements de mesure

Noms en `snake_case`, propriétés sans donnée personnelle. Ils alimentent les indicateurs du Dossier UX (taux de « Pas pour moi », conversion, engagement pendant le voyage).

| Événement | Propriétés |
|---|---|
| `brief_completed` | `inferred_fields_count`, `edited_fields_count` |
| `preview_ready` | `duration_ms` |
| `deck_decision` | `decision: like \| dislike`, `kind`, `category`, `position`, `gesture: swipe \| button \| key`, `travel_minutes`, `reason?` (`too_far`…) |
| `deck_undo` | `position` |
| `deck_skipped` | `position` |
| `preference_prompt_answered` | `category` (dont `distance`), `answer: yes \| no`, `reason?` |
| `paywall_viewed` / `payment_started` / `payment_succeeded` | `method: twint \| card`, `price_variant` |
| `replace_applied` / `replace_undone` | `reason`, `from_reserve: boolean`, `duration_ms` |
| `place_added` / `stop_moved` | `method: button \| drag` |
| `checklist_item_done` | — |
| `today_opened` | `offline: boolean` |
| `error_reported` | `kind` |

---

## 13. Hors-ligne (PWA)

- Mise en cache des données du programme du jour et du lendemain (données produites par nous), des polices et de l'interface.
- Pas de mise en cache des contenus ou tuiles Google (§ 8).
- Indicateur « Enregistré pour le hors-ligne à HH:MM » sur `/aujourdhui` ; `StatusBanner offline` quand le réseau manque.
- Les actions qui demandent le réseau (remplacer, ajouter) sont désactivées hors ligne avec une explication.

---

## 14. Qualité : vérifications et définition de « terminé »

Commandes attendues dans `package.json` :

```
pnpm typecheck      # tsc --noEmit
pnpm lint           # eslint, règle anti-couleurs en dur
pnpm test           # vitest
pnpm test:a11y      # axe sur les pages de démonstration et les écrans
pnpm test:e2e       # playwright, mobile 390 × 844
pnpm test:visual    # captures comparées à tests/visual
```

**Une tâche est terminée quand :**

1. Toutes les commandes ci-dessus passent.
2. Les critères d'acceptation de la tâche sont couverts par des tests.
3. Aucune valeur de style en dur, aucune chaîne hors `fr.json`.
4. Les captures mobiles (390 × 844) des écrans touchés sont jointes à la PR, à côté de la maquette correspondante.
5. Les écarts volontaires avec la maquette sont listés dans la PR.
6. Les nouvelles questions sont listées dans la description de la PR (le CEO les reporte dans `QUESTIONS.md`).

**Budgets :** Lighthouse mobile ≥ 90 en performance et 100 en accessibilité sur `/voyages/[id]` avec données simulées ; JavaScript initial de la route Journée < 200 Ko compressé hors carte.

**Scénarios Playwright** (reprennent le plan de test du Dossier UX) : créer un voyage sans hôtel ; corriger le brief ; trier en écartant deux musées et répondre à la question ; débloquer ; remplacer Dean Village sans toucher au dîner ; trouver la liste à réserver ; trouver la prochaine étape le jour J, y compris hors ligne.

---

## 15. Backlog ordonné pour les agents

Chaque tâche est indépendante une fois ses prérequis terminés. Taille visée : une PR relisible en moins de 30 minutes.

| # | Tâche | Prérequis | Critères d'acceptation |
|---|---|---|---|
| F0 | Socle : Next.js, TypeScript strict, Tailwind v4 + tokens § 4, police, shadcn/ui, ESLint (règle anti-couleurs), Vitest, Playwright, axe, `CLAUDE.md`, `QUESTIONS.md` | — | Toutes les commandes du § 14 tournent ; page `/dev/tokens` affiche couleurs, textes et rayons |
| F1 | Contrats Zod du § 9 et données simulées Édimbourg (6 jours, contenu des maquettes) | F0 | Schémas valident le mock ; types exportés ; adaptateur `mock` |
| F2 | Composants de base : `Button`, `IconButton`, `Tag`, `Counter`, `Chip`, `SegmentedControl`, `OtpInput`, `StatusBanner` | F0 | Démo et tests axe pour chaque composant |
| F3 | Composants ligne : `DayBadge`, `DayTabs`, `DayLine` et ses lignes, `StopMarker` | F2 | Rendu conforme aux écrans 12 et 13 ; `<ol>` sémantique ; tests visuels |
| F4 | Carte : intégration Google Maps, Map ID, marqueurs, tracé, synchronisation carte ↔ liste, mention d'attribution | F3 | Critères écran 12 ; aucune persistance locale de données Google (test) |
| F5 | Séjour (11), Journée (12), Fiche (13) avec `Sheet` à 3 hauteurs | F3, F4 | Critères écrans 11 à 13 ; focus géré |
| F6 | Présentation : `DeckCard`, `DeckProgress`, `UndoToast`, carte repas, question de préférence (6, 6b, 7, 8) | F2, F1 | Critères écrans 6 à 8 ; gestes + boutons + clavier ; événements `deck_*` |
| F7 | Remplacer (14), Ajouter un lieu, Déplacer : `ChangeSet`, choix du moment, points d'insertion | F5 | Critères écran 14 et Déplacer ; `UndoToast` après application |
| F8 | Création (1 à 5) et compte : formulaires, brief raconté puis vérifié (champs déduits en pointillé), suggestions de logement, code à 6 chiffres | F2 | Scénarios e2e création ; brief éditable champ par champ |
| F9 | Débloquer (9) et Programme ajusté (10) : redirection vers un paiement simulé, état débloqué | F6 | Les premières propositions restent accessibles sans paiement ; événements de paiement |
| F10 | Pendant le voyage (15), hors-ligne PWA, vue partagée `/p/[token]` | F5 | Scénario jour J hors ligne ; aucun cache Google |
| F11 | Mes voyages, Après le voyage, états transverses (wireframes en Ligne) | F5 | Captures soumises à validation |
| F12 | Passe accessibilité, performance et grand écran (≥ 1024 px) | F5 à F11 | Budgets du § 14 atteints |

---

## 16. Hors périmètre de ce handover

Back-end, agent de recherche, ancrage Google côté serveur, paiement réel et webhooks Stripe, espace agence, thème sombre, multilingue, application native, notifications push, trier à deux, souvenir partageable.

---

## 17. Questions ouvertes (à ne pas trancher par l'agent)

1. Nom du produit : **Vadrouille** (provisoire, centralisé dans la configuration pour pouvoir changer). Logo : texte « Vadrouille » en Hanken Grotesk 800 en attendant.
2. Prix : afficher `[PRIX]` depuis la configuration, jamais en dur.
3. Fournisseur d'authentification (organisations natives) : décision D8 du cadrage ; le front passe par un adaptateur `auth`.
4. Validation juridique des règles Google (données dérivées, interdiction liée à l'IA) : en cours ; appliquer les règles du § 8 en attendant.
5. Photos des lieux : source et règles de recadrage à définir ; utiliser le placeholder `muted` des maquettes.
6. Mise en page grand écran : non maquettée, proposition de l'agent à valider.
7. Budget de trajet par rythme (environ 1 h, 1 h 30, 2 h 30 par jour hors excursion) : valeurs fournies par les données, à calibrer en bêta ; le front ne les code pas en dur.

---

## Annexe A — `CLAUDE.md` (partie front, à placer à la racine)

```markdown
# Règles pour les agents front-end

## Avant de coder
- Lis docs/handover-frontend.md (ce document) et la tâche assignée.
- Ouvre la maquette correspondante dans docs/ux/maquettes/.
- Si une information manque : note-la dans la description de ta PR (le CEO la reporte dans QUESTIONS.md), ne l'invente pas.

## Toujours
- Styles uniquement via les tokens Ligne (globals.css). Aucune couleur, taille ou rayon en dur.
- Chaînes uniquement dans src/i18n/fr.json, avec le vocabulaire imposé.
- Données uniquement via src/adapters et les types de src/contracts.
- Composants de src/components/ligne avant tout nouveau composant.
- Gestes toujours doublés de boutons ; cibles ≥ 44 px ; focus visible.
- Tests : unitaires, axe, e2e mobile 390 × 844 pour chaque écran touché.

## Jamais
- Afficher des données de lieux Google sur une carte non-Google.
- Stocker côté client autre chose que l'identifiant d'un lieu Google.
- Ajouter un badge « Vérifié » ou utiliser le jaune pour autre chose qu'une action requise.
- Committer une clé API.

## Livrer
- Une tâche = une branche = une PR.
- pnpm typecheck && pnpm lint && pnpm test && pnpm test:a11y && pnpm test:e2e && pnpm test:visual
- PR avec le modèle de l'annexe B.
```

## Annexe B — Modèle de pull request

```markdown
## Tâche
F? — titre

## Ce qui est fait
- …

## Captures (390 × 844)
| Maquette | Implémentation |
|---|---|
| … | … |

## Écarts avec la maquette
- … (raison)

## Vérifications
- [ ] typecheck  - [ ] lint  - [ ] test  - [ ] a11y  - [ ] e2e  - [ ] visual

## Nouvelles questions (reportées par le CEO dans QUESTIONS.md)
- …
```
