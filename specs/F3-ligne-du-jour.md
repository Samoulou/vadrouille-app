# F3 — Composants de la ligne du jour

Rôle : frontend · Prérequis : F1 et F2 livrées dans `main` (donc F0) — décision du CEO sur Q20 ; `docs/roadmap.md` à jour, le handover § 15 ne cite que F2 · Référence : `docs/handovers/frontend.md` (§ 0, § 4, § 5, § 6 écrans 12 et 13, § 7, § 9, § 10, § 11, § 14, § 15 F3), `docs/design-system/README.md` (« La ligne du jour »), `docs/design-system/carte.md`, `docs/design-system/redaction.md`, `docs/design-system/components/DayBadge/`, `DayLine/` et `StopMarker/` (README et `preview.html`), `docs/design-system/tokens.json`, `specs/F1-contrats-donnees-simulees.md` et `specs/F2-composants-base.md` (PR #2), maquettes des écrans 12 et 13 dans `docs/ux/maquettes/` (non exportées : Q12, posée dans la PR #3)

## Objectif
Construire dans `src/components/ligne` les composants qui présentent une journée comme une ligne de transport (pastilles de jour, rangée de navigation, ligne du jour et ses lignes, marqueur d'arrêt), accessibles et testés, pour que les écrans Séjour, Journée et Fiche étape (F5) et la carte (F4) les assemblent sans les redessiner.

## Ordre de fusion et démarrage
- Fusion des PR dans cet ordre : **#3** (F0, porte Q10 à Q12), puis **#2** (spécifications F1 et F2, porte Q13 et Q14), puis **#5** (cette spécification). Les numéros Q10 à Q14 cités ici n'existent dans `QUESTIONS.md` qu'après la fusion de #3 et #2 ; ils ne sont pas recopiés dans cette PR.
- F3 ne démarre qu'après la livraison de F1 et de F2 dans `main`. F3 s'appuie sur ce qu'elles livrent :

| Élément | Livré par | Référence vérifiable |
|---|---|---|
| Types `DayLineItem`, `Stop`, `Segment`, `Weekday` (handover § 9) dans `src/contracts` | F1 | `specs/F1-contrats-donnees-simulees.md` |
| Adaptateur `mock` et règle « `src/mocks` importé seulement depuis `src/adapters` et les tests » | F1 | idem, critère `no-restricted-imports` |
| `Tag` | F2 | `specs/F2-composants-base.md`, tableau des composants |
| Page `/dev/composants` (désactivée en production, 404 en build de production) | F2 la crée ; F3 y ajoute la section « Ligne » | idem, « À livrer » et critères |
| Test de contraste sur les paires de tokens (dont `on-line` sur `line`, `ink-soft` sur `page` et sur `muted`) | F2 | idem, « À livrer » et critère « au moins 4,5:1 » |
| Règle `react/jsx-no-literals` (ou équivalent) active sur `src/components/ligne` | F2 | idem, critère « aucune chaîne en dur » |

## Points provisoires
Tout ce qui est marqué « provisoire » ci-dessous est appliqué tel quel par le frontend, listé comme écart dans la PR de F3, et revu quand Samuel aura répondu à la question citée.
- **Référence visuelle.** Les PNG des écrans 12 et 13 ne sont pas exportés (`docs/ux/maquettes/` est vide : Q12, posée dans la PR #3). En attendant, « conforme aux écrans 12 et 13 » s'entend « conforme aux `preview.html` de DayBadge, DayLine et StopMarker » ; la comparaison avec les maquettes se fera dès leur export.
- **Tokens hors handover.** `tokens.json` contient des tokens absents du handover § 4.1 et donc de `globals.css` : espacements `space-1` à `space-8` (`space-2` = 8 px), rayon `radius-round` (999 px), styles de texte `heure` (15/22, 700) et `pastille` (15/20, 800) (Q11, posée dans la PR #3). Si Q11 n'est pas tranchée au démarrage de F3, ces valeurs vont dans le fichier provisoire décrit ci-dessous.
- **Mesures sans token** (Q19) : colonnes 52 et 28 px, coins 5 et 6 px, terminus de carte 24 px, anneau 3 px et numéros 12 / 15 px des marqueurs, vue d'ensemble 12 px, trait 3 px de l'onglet actif, coins 10 px du bloc temps libre, pastille réduite 26 px.
- **Fichier unique des valeurs provisoires.** Toute valeur sans token (Q11, Q19) est déclarée dans un seul fichier, `src/components/ligne/provisoire.css` (variables CSS) ; chaque déclaration porte en commentaire le numéro de sa question (`/* Q19 */` ou `/* Q11 */`). Aucun autre fichier de `src/components/ligne` ne contient de valeur en dur.
- **Noms des variables de géométrie.** Le handover § 4.1 préfixe la géométrie de la ligne (`--ligne-rail`, `--ligne-rail-free`, `--ligne-stop`, `--touch-target`…), `tokens.json` et les `preview.html` ne la préfixent pas (`rail`, `stop`…). F3 utilise les noms du handover, présents dans `globals.css` depuis F0 ; l'écart de nommage est renvoyé à Q19.
- **Tracé du temps libre.** Le README du design system le décrit « fin », le `preview.html` de DayLine le dessine en pointillé. Provisoire : trait plein fin (`--ligne-rail-free`, `track-free`), conforme au README et à `tokens.json` (« Tracé fin du temps libre ») ; renvoyé à Q19.
- **Précisions de style non tranchées** (provisoires, renvoyées à Q17 ou Q19) :
  - couleur du lien « Idées » : `ink` 700 dans le `preview.html`, alors que le handover § 4.2 réserve `line` aux liens d'action. Provisoire : `ink` 700 comme le `preview.html` (Q17) ;
  - heure `from` du temps libre : 600 dans le `preview.html`, alors que `legende` est en 400. Provisoire : `legende` en 600, `ink-soft`, comme le `preview.html` (Q17) ;
  - texte du terminus : 15/22 en 700 dans le `preview.html`, sans style nommé. Provisoire : style `corps` (15/22) en 700 (Q19) ;
  - numéro du marqueur sélectionné : 15 px 800 dans le `preview.html` (Q19).
- **Textes non documentés.** Tout texte qui n'apparaît dans aucun document est placé dans `fr.json` sous `ligne.*`, proposé par le frontend et listé dans la PR pour validation. Valeurs provisoires imposées pour que les tests soient écrits d'avance :
  - nom de la rangée des jours : « Jours du séjour » ;
  - nom accessible d'une pastille : « Jour {day} », suivi de « , {jour abrégé} » quand `weekday` est fourni (ex. « Jour 2, lun. ») ; jours abrégés au format du handover § 10 (« lun. », « mar. »…) ;
  - mode `walk` : « À pied » ; mode `transit` : « Bus » (libellé du design system) ; mode `car` : « En voiture » (Q16) ;
  - « environ » précède la durée si et seulement si `estimated` vaut `true`, comme « (estimation) » (Q16).
- **Contrat `Stop` et `Terminus.label`.** Le contrat du handover § 9 est appliqué tel quel. `name`, `meta` et `verifiedAt` peuvent venir de Google et `label` du terminus est traité comme le nom du logement ; la répartition entre contenu stocké et contenu chargé à la demande reste ouverte (Q14, posée dans la PR #2). F3 n'affiche que des données simulées (F1) : la mention « Données de lieux : Google » relève de l'écran appelant (F5) et de la carte (F4), pas de F3.
- **Icônes.** Le jeu d'icônes n'est pas exporté en SVG (Q13, posée dans la PR #2). Le frontend reproduit les tracés présents dans les `preview.html` (à pied, bus, maison) ; une icône sans tracé disponible (voiture) est omise, le libellé texte suffit, et l'omission est listée dans la PR.

## À livrer
Un fichier par composant dans `src/components/ligne/`, avec son test (`*.test.tsx`, Testing Library et axe), tous les textes dans `src/i18n/fr.json`, uniquement les tokens Ligne et le fichier `provisoire.css`. Les composants reçoivent les types de `src/contracts` (handover § 9) et ne lisent aucune donnée eux-mêmes ; les adresses des liens sont fournies par l'appelant.

### Props
Les props du handover § 5 sont reprises. Les props ajoutées (marquées `/* proposition */`) sont une **proposition** du product-owner, à confirmer par le Tech Lead à la revue de la PR de F3 ; leur nom peut changer sans changer les critères.

```ts
import type { DayLineItem, Stop, Weekday } from "@/contracts";

type DayBadgeProps = {
  day: number;              // 1, 2, …
  weekday?: Weekday;        // acceptée ; utilisée seulement dans le nom accessible (Q18)
  active?: boolean;
  disabled?: boolean;
  href?: string;            // sans href : pastille non interactive
  /* proposition */ size?: "md" | "sm";              // "sm" = variante réduite non interactive (Q18)
  /* proposition */ currentValue?: "true" | "page";  // valeur d'aria-current quand active ; "true" par défaut (handover § 5)
};

type DayTabsProps = {
  days: { index: number; href: string; weekday?: Weekday; disabled?: boolean }[];
  current: number | "sejour";   // index du jour actif, ou l'onglet « Séjour »
  /* proposition */ sejourHref: string;
};

type DayLineProps = {
  items: DayLineItem[];
  /* proposition */ getStopHref: (stop: Stop) => string;  // adresse de la fiche étape
  /* proposition */ ideasHref?: string;                   // destination du lien « Idées » (Q17)
};

type StopMarkerProps = {
  kind: "stop" | "terminus" | "overview";
  number?: number;
  selected?: boolean;
  /* proposition */ variant?: "ligne" | "carte";        // Q18 ; "carte" par défaut
};
```

### Rendu

| Composant | Rendu (design system) |
|---|---|
| `DayBadge` | Pastille d'au moins `--touch-target` × `--touch-target` (44 px), coins `radius-badge`, style `pastille` (15/20, 800, chiffres tabulaires), texte visible « J{day} ». Pas de date ni de jour abrégé visibles dans la pastille (le `preview.html` n'en montre pas ; affichage visible de `weekday` renvoyé à Q18). Nom accessible : voir « Textes non documentés ». **Inactive** : fond `raised`, contour 1,5 px `outline-strong`, texte `ink`. **Active** : aplat `line`, texte `on-line`, `aria-current` à la valeur `currentValue`. **Désactivée** (provisoire, Q18) : fond `muted`, texte `ink-soft`, sans contour, comme l'état désactivé des boutons (handover § 5) ; rendue sans `href` même si `href` est fourni, `aria-disabled="true"`, mention « complet » (handover § 6, Déplacer) visible sous « J{day} » et incluse dans le nom accessible. **Réduite** (`size="sm"`, provisoire, Q18) : non interactive, 26 px de haut, coins 6 px, même texte « J{day} » ; taille de texte provisoire : `etiquette` en 800. |
| `DayTabs` | `<nav>` dont l'`aria-label` vient de `fr.json` (« Jours du séjour »), contenant une liste de liens : « Séjour » (`sejourHref`) puis une `DayBadge` par élément de `days`, dans l'ordre reçu, avec `currentValue="page"`. Onglet « Séjour » : texte seul `ink-soft` 600, hauteur au moins `--touch-target` ; actif : `ink` 800 et trait de 3 px en `line` dessous. Exactement un lien porte `aria-current="page"` : « Séjour » si `current === "sejour"`, sinon la pastille dont `index === current`. Défilement horizontal de la rangée seule ; la pastille active est amenée dans la zone visible au montage, sans animation (défilement instantané). Libellé « Séjour » et jamais « Aperçu » (handover § 5 et § 10 ; contradiction avec le design system, Q15). |
| `DayLine` | Liste ordonnée `<ol>`, un `<li>` par élément de `items`, dans l'ordre reçu. Trois colonnes : heure (52 px, style `heure`, alignée à droite, chiffres tabulaires), rail (28 px), contenu ; écart `space-2` (8 px). Le rail et les marqueurs sont décoratifs (`aria-hidden="true"`). Le rail est en `line`, épaisseur `--ligne-rail`, et ne change jamais de couleur, hors temps libre (`track-free`). |
| `DayLine.Terminus` | `{ type: "terminus"; role; time; label }`. `time` affiché dans la colonne heure (style `heure`). Carré `--ligne-terminus` (20 px) en `ink`, coins 5 px. Texte en style `corps` (15/22) en 700 (provisoire, Q19) : « Départ de {label} » (`role: "start"`) ou « Retour à {label} » (`role: "end"`), préfixes dans `fr.json`. Le rail commence au centre du terminus de départ et s'arrête au centre du terminus de retour. |
| `DayLine.Stop` | `{ type: "stop"; stop: Stop }`. Heure `stop.start` dans la colonne heure. Anneau `--ligne-stop` (20 px), épaisseur `--ligne-stop-ring`, fond `raised`, anneau `line`, rail plein `line`. Nom en style `arret` ; `meta` en `corps-s` `ink-soft` ; `reason` (si présent) en `corps-s` `ink` ; une `Tag` (F2) par exception de `stop.exceptions`. Toute la zone de contenu est un lien vers `getStopHref(stop)` (fiche étape, écran 13), d'au moins `--touch-target` de haut. |
| `DayLine.Segment` | `{ type: "segment"; segment: Segment }`. Pas d'heure. Rail pointillé (`--ligne-rail-dash` / `--ligne-rail-gap`) pour `walk`, plein pour `transit` et `car` (provisoire pour `car`, Q16). Libellé en `legende` `ink-soft` avec l'icône du mode : « À pied, 20 min » ; « Bus, environ 25 min (estimation) » ; « En voiture, 15 min ». « environ » et « (estimation) » s'affichent si et seulement si `estimated` vaut `true` (handover § 9 ; « environ » provisoire, Q16). |
| `DayLine.FreeTime` | `{ type: "free"; from; to }`. Rail fin `--ligne-rail-free` en `track-free` (provisoire, voir « Tracé du temps libre »). Heure `from` dans la colonne heure en `legende` 600 `ink-soft` (provisoire, Q17). Bloc `muted`, coins 10 px (Q19), texte `ink-2` : « Temps libre jusqu'à {to} », avec un lien « Idées » en `ink` 700 (provisoire, Q17) vers `ideasHref`, cible d'au moins `--touch-target` × `--touch-target` ; sans `ideasHref`, le lien n'est pas rendu (destination non documentée, Q17). |
| `StopMarker` | Toujours décoratif : racine `aria-hidden="true"`, aucun nom accessible ; l'information est portée par la liste (handover § 11 : « la carte n'est jamais la seule source d'information »). Variantes du `preview.html` : arrêt de la ligne (anneau 20 px) ; terminus (carré 20 px `ink` en variante « ligne » ; en variante « carte », 24 px, coins 6 px, icône maison `on-line`) ; arrêt numéroté de carte (`--ligne-stop-map`, 26 px, anneau 3 px `line`, fond `raised`, numéro `ink` 12 px 800) ; arrêt sélectionné (`--ligne-stop-map-selected`, 38 px, plein `line`, numéro `on-line` 15 px 800, anneau 3 px `page`) ; vue d'ensemble (anneau 12 px sans numéro). Le terminus n'est jamais numéroté. |

### Autres livrables
- Formatage pour l'affichage (handover § 10, `redaction.md`) : heures telles que reçues (« 10:45 ») ; durées « 10 min », « 45 min », « 1 h », « 1 h 30 ». Une fonction de formatage des durées testée, réutilisable par les écrans, dans `src/components/ligne/` ou `src/lib/`.
- Icônes au trait (grille 24, trait 2,2, `aria-hidden`) : à pied, bus, maison (voir « Icônes »).
- Section « Ligne » de la page `/dev/composants` créée par F2 : chaque `DayBadge` (inactive, active, désactivée, réduite), `DayTabs` (10 jours) avec « Séjour » actif puis avec `current` = 9, une `DayLine` qui reproduit la séquence du `preview.html` de DayLine (terminus, à pied, arrêt, bus estimé, arrêt avec « À réserver », temps libre, à pied, terminus), un `Segment` `car`, chaque variante de `StopMarker`. Les données passent par l'adaptateur `mock` (F1) ou par des données de démonstration propres à la page, sans import de `src/mocks` (règle de F1).
- Captures de référence 390 × 844 de la section « Ligne » de `/dev/composants` dans `tests/visual/`.

## Critères d'acceptation
- [ ] `pnpm verify` passe.
- [ ] axe ne relève aucune violation sur `/dev/composants` (`pnpm test:a11y`) ni dans le test de chaque composant.
- [ ] `DayLine` rend un `<ol>` dont le nombre de `<li>` est égal à `items.length`, dans l'ordre de `items` (test).
- [ ] Le rail et les marqueurs de `DayLine` sont `aria-hidden="true"` ; le contenu textuel de l'`<ol>` contient chaque heure (y compris le `time` de chaque terminus) et chaque libellé (test).
- [ ] Playwright en 390 × 844 : colonne heure de 52 px, colonne rail de 28 px, écart de 8 px ; anneau d'arrêt et carré terminus de 20 px ; heures alignées à droite avec `font-variant-numeric` calculé à `tabular-nums`.
- [ ] `DayLine.Terminus` affiche `time` dans la colonne heure et « Départ de {label} » pour `start`, « Retour à {label} » pour `end`, préfixes lus dans `fr.json` (test).
- [ ] `DayLine.Stop` est un lien dont le nom accessible contient `stop.name` et dont `href` vaut `getStopHref(stop)` ; la zone cliquable mesure au moins 44 px de haut (tests).
- [ ] `DayLine.Stop` affiche `meta`, affiche `reason` seulement s'il est présent, et une `Tag` par exception ; sans exception, aucun tag ; aucun texte « Vérifié » n'existe dans `fr.json` ni dans le rendu (tests).
- [ ] `DayLine.Segment` : `walk` rend le rail pointillé, `transit` et `car` le rail plein, vérifié par un attribut `data-rail` ou un style calculé (test) et visible sur la capture ; « environ » et « (estimation) » sont présents si et seulement si `estimated` vaut `true` ; `car` de 15 min non estimé rend exactement « En voiture, 15 min » (tests).
- [ ] La fonction de formatage des durées rend 10 → « 10 min », 45 → « 45 min », 60 → « 1 h », 90 → « 1 h 30 » (test).
- [ ] `DayLine.FreeTime` affiche l'heure `from` et « Temps libre jusqu'à {to} » ; avec `ideasHref`, un lien « Idées » vers cette adresse mesure au moins 44 × 44 px ; sans `ideasHref`, aucun lien « Idées » (tests).
- [ ] Styles calculés : le rail de temps libre a la couleur de `track-free` et l'épaisseur de `--ligne-rail-free` ; tous les autres rails ont la couleur de `line` et l'épaisseur de `--ligne-rail` (test).
- [ ] `DayBadge` : texte visible « J{day} » ; nom accessible « Jour {day} », complété par le jour abrégé quand `weekday` est fourni (ex. « Jour 2, lun. ») ; aucun jour abrégé dans le texte visible ; `active` pose `aria-current="true"` (ou `"page"` si `currentValue="page"`) et l'aplat `line` ; sans `active`, pas d'`aria-current` ; `href` rend un lien (tests).
- [ ] `DayBadge` `disabled` : aucun élément `<a href>` rendu, `aria-disabled="true"`, aucune navigation au clic ni à Entrée, mention « complet » de `fr.json` visible et dans le nom accessible (tests) ; texte `ink-soft` sur fond `muted`, paire couverte par le test de contraste de F2 (au moins 4,5:1).
- [ ] `DayBadge` interactive mesure au moins 44 × 44 px ; `size="sm"` mesure 26 px de haut et n'est ni lien ni focusable (Playwright).
- [ ] `DayTabs` : un `<nav>` dont l'`aria-label` est lu dans `fr.json` ; le premier lien est « Séjour » vers `sejourHref`, puis un lien par jour vers son `href` ; aucun texte « Aperçu » (test).
- [ ] `DayTabs` : exactement un élément porte `aria-current="page"` — « Séjour » si `current === "sejour"`, sinon la pastille dont `index === current` — et aucun autre élément de la rangée ne porte `aria-current` (test, pour `current = "sejour"` et pour `current = 3`).
- [ ] `DayTabs` en 390 × 844 : l'onglet « Séjour » et chaque pastille mesurent au moins 44 px de haut ; avec 10 jours et `current` = 9, la pastille J9 est entièrement visible à l'ouverture sans action de la personne ; la rangée défile horizontalement et `document.documentElement.scrollWidth` reste égal à la largeur de la fenêtre (Playwright).
- [ ] Ordre de tabulation = ordre de lecture dans `DayTabs` et `DayLine` ; chaque élément interactif affiche au clavier un contour de 2 px en `line` décalé de 2 px (Playwright).
- [ ] `StopMarker` : la racine porte `aria-hidden="true"` dans toutes les variantes et n'est pas focusable (test) ; `kind: "terminus"` n'affiche jamais de numéro, même si `number` est fourni ; `selected` rend le diamètre `--ligne-stop-map-selected` et le plein `line` ; `overview` n'a pas de numéro (tests) ; diamètres 20, 26, 38 et 12 px selon la variante (Playwright).
- [ ] Le test de contraste de F2 couvre les paires utilisées par F3 : `on-line` sur `line`, `ink-soft` sur `page` et sur `muted`, `ink-2` sur `muted` ; s'il en manque une, F3 l'ajoute à ce test (au moins 4,5:1).
- [ ] `pnpm lint` passe avec la règle `react/jsx-no-literals` de F2 active sur `src/components/ligne` (aucune chaîne en dur) ; vocabulaire du handover § 10.
- [ ] Un test lit les fichiers de `src/components/ligne` (hors tests) et échoue s'il trouve une couleur (`#`, `rgb(`, `hsl(`) ou une valeur en `px` ailleurs que dans `provisoire.css` ; chaque déclaration de `provisoire.css` porte un commentaire `/* Q11 */` ou `/* Q19 */` ; la PR énumère ces valeurs.
- [ ] F3 n'ajoute aucune animation : sur la section « Ligne » de `/dev/composants`, chaque élément rendu par F3 a `animation-name` calculé à `none` et `transition-duration` calculé à `0s` (Playwright).
- [ ] Capture Playwright de la section « Ligne » de `/dev/composants` comparée à la référence (`pnpm test:visual`).
- [ ] La PR joint la capture à côté des `preview.html` de DayBadge, DayLine et StopMarker (en attendant les écrans 12 et 13, Q12) et liste les écarts : tout point marqué « provisoire » ci-dessus, les props proposées, les textes proposés et les icônes omises.

## Hors périmètre
- Assemblage des écrans Séjour (11), Journée (12), Fiche étape (13), `Sheet`, `DestinationPlate`, `ChecklistRow`, `ReasonBlock` (F5) ; vue compacte de l'écran 15 (F10).
- Carte Google, marqueurs avancés, tracé, synchronisation carte ↔ liste (F4, Q3) ; `StopMarker` est livré seul, sans carte.
- Mention « Données de lieux : Google » : responsabilité de l'écran appelant (F5) et de la carte (F4), liée à Q5 et Q14 ; F3 n'affiche que des données simulées.
- Points d'insertion, surlignage des étapes modifiées, `ChangeSet` (F7) ; animation de génération de la ligne (écran 5, F8).
- Changement de jour par glissement (interdit sur l'écran 12) ; routes et construction des adresses (fournies par l'appelant).
- Contenu de la page « Idées », signalement d'un repas non choisi, affichage de `locked`, de `kind: "event"` et de `Stop.end` sur la ligne (Q17).
- Création de `/dev/composants`, du test de contraste et de la règle `react/jsx-no-literals` (F2) ; contrats et adaptateur `mock` (F1).
- Thème sombre, grand écran (Q7).

## Questions ouvertes
Q11 et Q12 sont posées dans la PR #3 ; Q13 et Q14 dans la PR #2 ; Q15 à Q19 dans cette PR.
- Q11 (PR #3) : `space-*`, `radius-round`, `heure`, `pastille` absents de `globals.css`.
- Q12 (PR #3) : maquettes non exportées ; référence provisoire = `preview.html` du design system.
- Q13 (PR #2) : jeu d'icônes non exporté en SVG (à pied, bus, maison, voiture).
- Q14 (PR #2) : origine des champs de `Stop` et de `Terminus.label` ; F3 applique le contrat du handover sur données simulées.
- Q15 : « Aperçu » (design system) contre « Séjour » (handover).
- Q16 : libellés et texture des segments `transit` et `car`, usage de « environ ».
- Q17 : lien « Idées » (destination et couleur), heure du temps libre, repas non choisi, `locked`, `kind: "event"`, `Stop.end` sur la ligne.
- Q18 : `DayBadge` (jour abrégé visible, état désactivé, variante réduite, nom accessible) et choix de variante de `StopMarker`.
- Q19 : mesures sans token, nommage des variables de géométrie, tracé du temps libre, style du texte du terminus.
- Q20 : tranchée par le CEO (prérequis F1 et F2).
