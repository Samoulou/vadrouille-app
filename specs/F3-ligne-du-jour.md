# F3 — Composants de la ligne du jour

Rôle : frontend · Prérequis : F2 (handover § 15), et les types de `src/contracts` livrés par F1 (voir Q20) · Référence : `docs/handovers/frontend.md` (§ 0, § 4, § 5, § 6 écrans 12 et 13, § 7, § 9, § 10, § 11, § 14, § 15 F3), `docs/design-system/README.md` (« La ligne du jour »), `docs/design-system/carte.md`, `docs/design-system/redaction.md`, `docs/design-system/components/DayBadge/`, `DayLine/` et `StopMarker/` (README et `preview.html`), `docs/design-system/tokens.json`, maquettes des écrans 12 et 13 dans `docs/ux/maquettes/` (non exportées, Q12)

## Objectif
Construire dans `src/components/ligne` les composants qui présentent une journée comme une ligne de transport (pastilles de jour, rangée de navigation, ligne du jour et ses lignes, marqueur d'arrêt), accessibles et testés, pour que les écrans Séjour, Journée et Fiche étape (F5) et la carte (F4) les assemblent sans les redessiner.

## Points provisoires
- **Référence visuelle.** Les PNG des écrans 12 et 13 ne sont pas exportés (Q12). En attendant, « conforme aux écrans 12 et 13 » s'entend « conforme aux `preview.html` de DayBadge, DayLine et StopMarker » ; la comparaison avec les maquettes se fera dès leur export, et les écarts seront listés dans une PR de suite.
- **Tokens.** Les espacements `space-*` et les styles de texte `heure` et `pastille` viennent de `tokens.json` mais ne sont pas encore dans `globals.css` (Q11). Plusieurs mesures du design system n'ont pas de token (Q19). Le frontend les applique selon la décision prise sur Q11 et Q19 ou, à défaut, les isole dans un seul endroit commenté avec le numéro de la question, et les liste comme écarts dans la PR.
- **Textes non documentés.** Tout texte qui n'apparaît dans aucun document (noms accessibles, libellé du mode `car`, etc.) est placé dans `fr.json`, proposé par le frontend et listé dans la PR pour validation.

## À livrer
Un fichier par composant dans `src/components/ligne/`, avec son test (`*.test.tsx`, Testing Library et axe), tous les textes dans `src/i18n/fr.json`, uniquement les tokens Ligne. Les composants reçoivent les types de `src/contracts` (handover § 9) et ne lisent aucune donnée eux-mêmes ; les liens et actions sont fournis par l'appelant.

| Composant | Props (handover § 5) | Rendu (design system) |
|---|---|---|
| `DayBadge` | `day`, `weekday`, `active`, `disabled`, `href` | Pastille d'au moins 44 × 44 px, coins `radius-badge`, style `pastille` (15 px, 800, chiffres tabulaires), texte « J{day} ». Inactive : fond `raised`, contour 1,5 px `outline-strong`, texte `ink`. Active : aplat `line`, texte `on-line`, `aria-current="true"`. Désactivée : non cliquable, mention « complet » (handover § 6, Déplacer ; rendu à valider, Q18). Pas de date dans la pastille. Variante réduite non interactive (26 px de haut, coins 6 px) pour étiqueter un arrêt dans la fiche étape et l'aperçu du séjour (design system ; prop à proposer, Q18). |
| `DayTabs` | `days`, `current` | Rangée « Séjour » suivie d'une `DayBadge` par jour. Onglet « Séjour » : texte seul `ink-soft` 600 ; actif : `ink` 800 et trait de 3 px en `line` dessous. Défilement horizontal ; la pastille active est visible à l'ouverture. Libellé « Séjour » et non « Aperçu » (handover § 5 et § 10 ; contradiction avec le design system, Q15). |
| `DayLine` | `items: DayLineItem[]` | Liste ordonnée `<ol>`, un `<li>` par élément de `items`, dans l'ordre reçu. Trois colonnes : heure (52 px, style `heure`, alignée à droite, chiffres tabulaires), rail (28 px), contenu ; écart `space-2`. Le rail est décoratif (`aria-hidden`) et ne change jamais de couleur. |
| `DayLine.Terminus` | `{ type: "terminus"; role; time; label }` | Carré `terminus` (20 px) en `ink`, coins 5 px. Texte en 700 : « Départ de {label} » (`role: "start"`) ou « Retour à {label} » (`role: "end"`), préfixes dans `fr.json` (`label` = nom du logement, voir Q14). Le rail commence au centre du terminus de départ et s'arrête au centre du terminus de retour. |
| `DayLine.Stop` | `{ type: "stop"; stop: Stop }` | Anneau `stop` (20 px), épaisseur `stop-ring`, fond `raised`, anneau `line`, rail plein `line`. Heure `stop.start`. Nom en style `arret` ; `meta` en `corps-s` `ink-soft` ; `reason` (si présent) en `corps-s` `ink` ; une `Tag` (F2) par exception de `stop.exceptions`. Toute la zone est un lien vers la fiche étape (écran 13), cible d'au moins 44 px de haut. |
| `DayLine.Segment` | `{ type: "segment"; segment: Segment }` | Pas d'heure. Rail pointillé (`rail-dash` / `rail-gap`) pour `walk`, plein pour `transit` (et `car`, Q16). Libellé `legende` `ink-soft` avec l'icône du mode : « À pied, 20 min » ; « Bus, environ 25 min (estimation) ». « (estimation) » s'affiche si et seulement si `estimated` vaut `true` (handover § 9). Libellés de `transit` et `car` et usage de « environ » : provisoires (Q16). |
| `DayLine.FreeTime` | `{ type: "free"; from; to }` | Rail fin `rail-free` en `track-free`. Heure `from` en `legende` `ink-soft`. Bloc `muted`, texte `ink-2` : « Temps libre jusqu'à {to} », avec un lien « Idées » (cible 44 px) dont la destination est fournie par l'appelant ; sans destination fournie, le lien n'est pas rendu (Q17). |
| `StopMarker` | `number`, `selected`, `kind: stop \| terminus \| overview` | Variantes du `preview.html` : arrêt de la ligne (anneau 20 px) ; terminus (carré 20 px `ink` sur la ligne ; sur la carte 24 px, coins 6 px, icône maison `on-line`) ; arrêt numéroté de carte (`stop-map`, 26 px, anneau 3 px `line`, fond `raised`, numéro `ink` 12 px 800) ; arrêt sélectionné (`stop-map-selected`, 38 px, plein `line`, numéro `on-line`, anneau 3 px `page`) ; vue d'ensemble (anneau 12 px sans numéro). Le terminus n'est jamais numéroté. Le moyen de choisir entre variante « ligne » et variante « carte » est proposé par le frontend et listé dans la PR (Q18). |

- Formatage pour l'affichage (handover § 10, `redaction.md`) : heures telles que reçues (« 10:45 ») ; durées « 10 min », « 45 min », « 1 h », « 1 h 30 ». Une fonction de formatage des durées testée, réutilisable par les écrans.
- Icônes au trait (grille 24, trait 2,2, `aria-hidden`) : à pied et bus, présentes dans le jeu du design system ; maison pour le terminus de carte (tracé du `preview.html` de StopMarker). Si le SVG n'est pas encore exporté (Q13), le frontend reproduit le tracé du `preview.html` quand il existe, sinon le signale dans la PR.
- Page `/dev/composants`, section « Ligne » (désactivée en production) : chaque `DayBadge` (inactive, active, désactivée, réduite), `DayTabs` avec « Séjour » actif puis un jour actif, une `DayLine` qui reproduit la séquence du `preview.html` de DayLine (terminus, à pied, arrêt, bus estimé, arrêt avec « À réserver », temps libre, à pied, terminus), chaque variante de `StopMarker`. Les données de démonstration passent par l'adaptateur `mock` (F1) ou par des données de démonstration propres à la page ; aucun import de `src/mocks` hors adaptateurs et tests (règle de F1).
- Captures de référence 390 × 844 de la section « Ligne » de `/dev/composants` dans `tests/visual/`.

## Critères d'acceptation
- [ ] `pnpm verify` passe.
- [ ] axe ne relève aucune violation sur `/dev/composants` (`pnpm test:a11y`) ni dans le test de chaque composant.
- [ ] `DayLine` rend un `<ol>` dont le nombre de `<li>` est égal à `items.length`, dans l'ordre de `items` (test).
- [ ] Le rail et les marqueurs de `DayLine` sont `aria-hidden` ; le texte de chaque ligne (heure, nom, libellé du segment, temps libre) est lisible sans eux (test : le contenu textuel de l'`<ol>` contient chaque heure et chaque libellé).
- [ ] Playwright en 390 × 844 : colonne heure de 52 px, colonne rail de 28 px, écart de 8 px ; anneau d'arrêt et carré terminus de 20 px ; heures alignées à droite en chiffres tabulaires (`font-variant-numeric` calculé).
- [ ] `DayLine.Terminus` affiche « Départ de {label} » pour `start` et « Retour à {label} » pour `end`, préfixes lus dans `fr.json` (test).
- [ ] `DayLine.Stop` est un lien (`role="link"`) dont le nom accessible contient `stop.name`, vers l'adresse fournie par l'appelant ; la zone cliquable mesure au moins 44 px de haut (tests).
- [ ] `DayLine.Stop` affiche `meta`, affiche `reason` seulement s'il est présent, et une `Tag` par exception ; sans exception, aucun tag ; aucun texte « Vérifié » n'existe dans `fr.json` ni dans le rendu (tests).
- [ ] `DayLine.Segment` : `walk` rend le rail pointillé, `transit` le rail plein, vérifié par un attribut ou un style calculé (test) et visible sur la capture ; « (estimation) » est présent si et seulement si `estimated` vaut `true` (test).
- [ ] La fonction de formatage des durées rend 10 → « 10 min », 45 → « 45 min », 60 → « 1 h », 90 → « 1 h 30 » (test).
- [ ] `DayLine.FreeTime` affiche l'heure `from` et « Temps libre jusqu'à {to} » ; le lien « Idées » mesure au moins 44 × 44 px et n'est rendu que si l'appelant fournit sa destination (tests).
- [ ] Le rail de temps libre utilise `track-free` et `rail-free` ; tous les autres rails utilisent `line` et `rail` (test sur les styles calculés).
- [ ] `DayBadge` : texte « J{day} » ; `active` pose `aria-current="true"` et l'aplat `line` ; sans `active`, pas d'`aria-current` ; `href` rend un lien ; `disabled` ne rend pas de lien actif, n'est pas activable au clavier ni à la souris et affiche la mention « complet » de `fr.json` (tests).
- [ ] `DayBadge` interactive mesure au moins 44 × 44 px (Playwright).
- [ ] `DayTabs` : le premier élément est « Séjour » ; aucun texte « Aperçu » n'apparaît (test) ; exactement un élément porte `aria-current` (« Séjour » ou la pastille du jour `current`) (test).
- [ ] `DayTabs` avec 10 jours et `current` = 9 en 390 × 844 : la pastille J9 est entièrement visible à l'ouverture, sans action de la personne (Playwright) ; la rangée défile horizontalement sans faire défiler la page.
- [ ] Ordre de tabulation = ordre de lecture dans `DayTabs` et `DayLine` ; chaque élément interactif affiche au clavier un contour de 2 px en `line` décalé de 2 px (Playwright).
- [ ] `StopMarker` : `kind: "terminus"` n'affiche jamais de numéro, même si `number` est fourni ; `selected` rend le diamètre `stop-map-selected` et le plein `line` ; `overview` n'a pas de numéro (tests) ; diamètres 20, 26, 38 et 12 px selon la variante (Playwright).
- [ ] Le texte `on-line` sur `line` (pastille active, marqueur sélectionné) et `ink-soft` sur `page` et `muted` passent le test de contraste de F2 (au moins 4,5:1).
- [ ] La règle `react/jsx-no-literals` (ou équivalent, F2) couvre ces composants : aucune chaîne en dur ; vocabulaire du handover § 10.
- [ ] Aucune valeur de couleur, taille de texte, rayon ou espacement en dur hors des endroits listés comme provisoires (Q11, Q19) ; la PR les énumère.
- [ ] Aucune animation n'est ajoutée par F3 ; rien ne bouge sous `prefers-reduced-motion`.
- [ ] Capture Playwright de la section « Ligne » de `/dev/composants` comparée à la référence (`pnpm test:visual`).
- [ ] La PR joint la capture à côté des `preview.html` de DayBadge, DayLine et StopMarker (en attendant les écrans 12 et 13, Q12) et liste les écarts : libellé « Séjour », libellés des segments, mesures sans token, rendu de `disabled` et de la variante réduite.

## Hors périmètre
- Assemblage des écrans Séjour (11), Journée (12), Fiche étape (13), `Sheet`, `DestinationPlate`, `ChecklistRow`, `ReasonBlock` (F5) ; vue compacte de l'écran 15 (F10).
- Carte Google, marqueurs avancés, tracé, synchronisation carte ↔ liste, mention « Données de lieux : Google » (F4, Q3, Q5, Q14) ; `StopMarker` est livré seul, sans carte.
- Points d'insertion, surlignage des étapes modifiées, `ChangeSet` (F7) ; animation de génération de la ligne (écran 5, F8).
- Changement de jour par glissement (interdit sur l'écran 12) ; routes et construction des adresses (fournies par l'appelant).
- Contenu de la page « Idées », signalement d'un repas non choisi, affichage de `locked` et de `kind: "event"` sur la ligne (Q17).
- Thème sombre, grand écran (Q7).

## Questions ouvertes
- Q11 : `space-*`, `heure`, `pastille` absents de `globals.css`.
- Q12 : maquettes non exportées ; référence provisoire = `preview.html` du design system.
- Q13 : jeu d'icônes non exporté en SVG (à pied, bus, maison).
- Q14 : `Terminus.label` traité comme nom du logement, préfixes « Départ de » / « Retour à » dans `fr.json`.
- Q15 : « Aperçu » (design system) contre « Séjour » (handover).
- Q16 : libellés et texture des segments `transit` et `car`, usage de « environ ».
- Q17 : lien « Idées », repas non choisi, `locked`, `kind: "event"`, `Stop.end` sur la ligne.
- Q18 : `DayBadge` (jour abrégé, état désactivé, variante réduite, nom accessible) et choix de variante de `StopMarker`.
- Q19 : mesures du design system sans token.
- Q20 : prérequis F1 pour les types.
