# F10 — Pendant le voyage, hors-ligne et vue partagée

Rôle : frontend · Prérequis : code de F5 (F5a, F5b, F5c) fusionné dans `main` (handover § 15 : F10 après F5) ; voir « Prérequis vérifiables » · Ticket : #75 · Référence : `docs/handovers/frontend.md` (§ 0 règles 2 à 9, § 2 ligne « PWA », § 3 `src/features/voyage`, § 5 `DayLine`, `StatusBanner`, `IconButton`, `Tag`, `DestinationPlate`, `DayTabs`, § 6 écran 15, ligne « Vue partagée », règles de navigation, critère « 15 », § 7, § 8, § 9, § 10, § 11, § 12 `today_opened`, § 13, § 14 scénario « trouver la prochaine étape le jour J, y compris hors ligne » et budgets, § 15 F10, § 16), `docs/produit/cadrage-v5.md` (§ 3.1 écran 15, § 3.2, § 3.5 bloc « Pendant le voyage », § 4 « Voyage complet », § 6.1, § 6.5 règles Google, § 6.8 `share_links`, § 9 « Liens de partage » et « Tests de sortie »), `docs/CONTEXT.md` (principes produit 2, 4 et 5, principes techniques 2 à 4, « Qui décide quoi »), `docs/decisions/0002-hebergement-vercel.md`, `docs/decisions/0013-decisions-tech-lead-f3-f4-f6.md` (§ 1.4 carte simulée, § 1.6 pages de développement, § 3.3 mesure, § 3.5 `Dialog`, § 3.6 contexte), `docs/decisions/0015-decisions-tech-lead-f5.md` (§ 1 `tripRoutes`, § 2 `openMeal`, § 5.3 `TripShell`), `docs/decisions/0016-decisions-tech-lead-f7-et-suites-f5a.md` (§ 1.1 groupe `(programme)`, § 3.1 règles 1 à 5, § 10 `useOnline`, § 11 `ChecklistItem.stopId`), `docs/decisions/0018-rendus-ux-ui-f5a-f7-f8-d1.md` (bandeaux), `specs/F3-ligne-du-jour.md`, `specs/F4-carte.md`, `specs/F5-sejour-journee-fiche.md`, `specs/F7-remplacer-ajouter-deplacer.md`, `specs/F8-creation-compte.md` (F8-TL-9, F8-TL-10), `QUESTIONS.md` (Q5, Q12, Q14, Q27, Q34, Q38, Q44, Q50, Q56, Q59, Q63, Q100, Q101).

Documents en revue, non fusionnés au 2026-10-09, cités pour cohérence sans en dépendre : handover back-end (PR #27 : tâche B12 « partage », table `share_links`, § 5 tableau des champs stockés ou calculés à la lecture, décision 0010 « données dérivées de Google calculées, non stockées »).

Maquettes et Dossier UX : l'écran 15 est maquetté dans le canevas « Direction Ligne », mais son export PNG manque (`docs/ux/maquettes/` est vide, Q12) ; la vue partagée n'existe qu'en wireframe (handover § 6, « W ») ; la feuille « Partager », la page de repli hors ligne et le manifeste ne sont pas maquettés. Le Dossier UX n'est pas dans le dépôt (Q59) : le scénario « trouver la prochaine étape le jour J, y compris hors ligne » (handover § 14) est écrit d'après le handover et le cadrage, et sera confronté au plan de test quand Samuel l'aura exporté. Tout rendu ou texte non maquetté est marqué « provisoire (UX/UI) ».

## Objectif
Accompagner le voyage une fois parti, sur données simulées : un écran « Pendant le voyage » (`/voyages/[id]/aujourdhui`) qui dit en un coup d'œil ce qui se passe maintenant, quelle est la prochaine étape et ce qui reste à réserver ; une copie du programme du jour et du lendemain enregistrée sur l'appareil, pour retrouver la prochaine étape sans réseau ; un lien privé, révocable, qui montre le programme en lecture seule à un proche (`/p/[token]`). Aucune donnée Google mise en cache ni stockée côté client (seul l'identifiant de lieu est stockable, et la copie hors ligne n'en contient même pas), aucune donnée de lieu Google sur une carte non Google, aucun stockage propre à Vercel, aucun service externe.

## Phase 0 : ce que F10 ne fait pas
- **Aucune notification** : « rappels » se lit comme un bandeau dans l'écran (F10-PO-5) ; les notifications push sont hors du handover (§ 16).
- **Aucun service externe** : ni envoi de mesure sur le réseau (le module de F6 enregistre en local, Q56), ni appel Places, Routes ou Directions ; le lien « Itinéraire » ouvre Google Maps dans un nouvel onglet sans que l'application fasse elle-même de requête (F10-PO-6).
- **Aucun stockage réel des liens de partage** : création et désactivation sont simulées par l'adaptateur `mock` (F10-PO-18) ; la table `share_links` (empreinte du jeton, expiration, révocation) relève de B12 et de la base Postgres (décision 0002 : aucun stockage propre à Vercel).
- **Aucune expiration des liens en phase 0** : la durée relève de Samuel (F10-Q2) ; le contrat la prévoit, l'interface l'affiche si le serveur la donne.

## Prérequis vérifiables
| Élément | Livré par | Référence |
|---|---|---|
| `TripSchema`, `DaySchema`, `StopSchema`, `SegmentSchema`, adaptateur `mock`, isolation par organisation, `getRequestContext()`, voyages `mock_trip_edimbourg` (`unlocked: false`) et `mock_trip_edimbourg_debloque` (29.08 – 03.09.2026) | F1 (#11), D1 (#59) | `src/contracts`, `src/adapters` |
| `Button`, `IconButton`, `Tag`, `StatusBanner` (`offline`, `error`), `/dev/composants`, `provisoire.css`, règle `react/jsx-no-literals` | F2 (#19) | `specs/F2-composants-base.md` |
| `DayLine` et ses lignes, `DayTabs`, `DayBadge`, `DestinationPlate` | F3 (#30), F5 | `specs/F3-ligne-du-jour.md` |
| Règle de lint contre le stockage client (`noClientStorage` dans `eslint.config.mjs`) et tests « aucune persistance locale » de F4 à F8 | F4 (#35) et suivantes | `specs/F4-carte.md` |
| Module de mesure (`src/analytics`), `Dialog` sur `@radix-ui/react-dialog` | F6 (#44) | décision 0013 § 3.3 et § 3.5 |
| Séjour (11), Journée (12), `TripShell`, `tripRoutes`, groupe de routes `(programme)`, `openMeal`, contrôles posés sur la carte (« Retour ») | F5a (#54), F5b, F5c (à venir) | `specs/F5-sejour-journee-fiche.md`, décisions 0015 et 0016 § 1 |
| `src/contracts/values.ts`, imports de valeur interdits depuis `@/contracts` et `zod` interdit côté client, mesure en `zod/mini`, test de budget de la Journée | T4 (à venir) | décision 0016 § 3.1 |
| `useOnline()` dans `src/lib/online.ts` | F7a (à venir) ; créé par F10a s'il n'existe pas encore, sous la forme fixée par 0016 § 10 | décision 0016 § 10 |
| Portée et horloge des simulations côté serveur | F8 (F8-TL-9, en attente de décision du Tech Lead) | facultatif : voir F10-TL-7 |

Aucune PR de F10 ne démarre avant la fusion de F5c et de T4, pour éviter deux versions concurrentes de `TripShell`, du Séjour, de `src/analytics` et des règles de lint (F10-PO-19).

## Périmètre
- Écran 15 « Pendant le voyage » : `/voyages/[id]/aujourdhui`, page sans carte, hors du panneau du voyage (F10-PO-2).
- Accès à l'écran 15 depuis le Séjour aux dates du voyage (F10-PO-7).
- Enregistrement hors ligne du programme du jour et du lendemain, service worker, manifeste de l'application, page de repli hors ligne (F10-PO-8 à F10-PO-12).
- Bouton « Partager » du Séjour et de la Journée, feuille « Partager ton voyage », création et désactivation d'un lien (F10-PO-13).
- Vue partagée en lecture seule : `/p/[token]` (Séjour) et sa Journée (F10-PO-14, F10-PO-15).
- Événement `today_opened`.
- Contrats, adaptateur simulé de partage et jeu simulé correspondants, en proposition au Tech Lead pour la forme.

## Choix réservés au Tech Lead (signalés, non tranchés ici)
Propositions détaillées dans « Propositions au Tech Lead » ; le frontend les soumet dans sa PR et le Tech Lead les confirme à la revue ou par une décision dans `docs/decisions/`. Les critères d'acceptation décrivent des besoins observables ; ceux qui dépendent d'une forme portent « sous réserve de F10-TL-x » et désignent les routes par leur nom de référence (tableau ci-dessous) : si le Tech Lead retient une autre forme, le critère s'applique à la forme retenue, sans autre changement.
- Fuseau horaire de la destination dans le contrat et contrats de phase 0 (F10-TL-1).
- Calcul du jour courant et de la prochaine étape, horloge et rendu côté navigateur (F10-TL-2).
- Adresses, emplacement des pages et page de repli (F10-TL-3).
- Mécanisme hors ligne : service worker, lieu de stockage de la copie, stratégies réseau, bibliothèque éventuelle (F10-TL-4).
- Règles de lint et module seul autorisé à enregistrer ou lire la copie (F10-TL-5).
- Tests Playwright avec un service worker : blocage des domaines Google, horloge, lecture du stockage, isolation (F10-TL-6).
- Adaptateur de partage, format et empreinte du jeton, simulation de phase 0 (F10-TL-7).
- En-têtes et rendu de la vue partagée (F10-TL-8).
- Manifeste et icônes (F10-TL-9).
- Budget de JavaScript des nouvelles pages (F10-TL-10).
- Forme du lien « Itinéraire » (F10-TL-11).
- Emplacement et noms des fichiers ci-dessous.

### Routes de référence
| Nom | Route | Source |
|---|---|---|
| `R15` | `/voyages/[id]/aujourdhui` | handover § 6 |
| `RP` | `/p/[token]` (Séjour partagé) | handover § 6 |
| `RPJ` | proposée `/p/[token]/jour/[n]` (Journée partagée) | **sous réserve de F10-TL-3** |
| `R-repli` | proposée `/hors-ligne` (page de repli servie hors ligne) | **sous réserve de F10-TL-3 et F10-TL-4** |
| `R-manifeste` | proposée `/manifest.webmanifest` | **sous réserve de F10-TL-9** |

## Fichiers à créer ou modifier (proposition)
- `src/features/voyage/` : `TodayScreen.tsx` (écran 15), `today.ts` (fonctions pures : jour courant, moment présent, prochaine étape, rappels ; F10-TL-2), `offline-copy.ts` (projection pure du voyage vers la copie hors ligne, liste blanche de F10-PO-9), `OfflineStatus.tsx` (indicateur et bandeau), et leurs tests.
- Module hors ligne désigné (F10-TL-4, F10-TL-5), par exemple `src/lib/offline/` : enregistrement du service worker, écriture, lecture, validation et suppression de la copie ; et le script du service worker (par exemple `public/sw.js` ou sa source construite).
- `src/features/partage/` : `ShareSheet.tsx` (feuille « Partager ton voyage »), `SharedTripScreen.tsx`, `SharedDayScreen.tsx`, `actions.ts` (actions serveur `createShareLink`, `revokeShareLink`, `getShareStatus`, revalidation de l'entrée) et leurs tests.
- `src/features/sejour/` : lien « Aujourd'hui » du Séjour (F10-PO-7), bouton « Partager » posé sur la carte (Séjour et Journée), `routes.ts` (`aujourdhui()`).
- Pages : `src/app/voyages/[id]/aujourdhui/page.tsx` (`R15`, hors du groupe `(programme)` : pas de carte ni de panneau), `src/app/p/[token]/page.tsx` (`RP`), `src/app/p/[token]/jour/[n]/page.tsx` (`RPJ`), `R-repli`, `src/app/manifest.ts` (`R-manifeste`).
- `src/contracts/` : `Trip.timeZone`, contrats de la copie hors ligne, de la vue partagée et du lien de partage (F10-TL-1) ; leurs tests ; réexport par `index.ts`, valeurs côté client dans `values.ts` (0016 § 3.1).
- `src/adapters/` : `ShareAdapter` et son implémentation `mock` (F10-TL-7) ; `src/mocks/edimbourg.ts` (`timeZone`), `src/mocks/edimbourg-partage.ts` (jetons simulés : valide, désactivé, expiré).
- `src/analytics/events.ts` : variante `today_opened` en `zod/mini`.
- `eslint.config.mjs` et `tests/unit/lint/` : règles étendues aux nouveaux dossiers (F10-TL-5).
- Textes dans `src/i18n/fr.json` sous `voyage.aujourdhui.*`, `voyage.horsLigne.*` et `partage.*`.
- `tests/e2e/aujourdhui.e2e.spec.ts`, `tests/e2e/hors-ligne.e2e.spec.ts`, `tests/e2e/partage.e2e.spec.ts`, `tests/e2e/voyage.a11y.spec.ts`, `tests/visual/voyage.visual.spec.ts` et leurs références.

## Comportement

### Temps de référence (F10-PO-3)
- **Fuseau de la destination** : « aujourd'hui », « maintenant », la prochaine étape et l'heure de l'indicateur hors ligne se calculent à l'heure de la destination (handover § 9 : les heures du programme sont déjà en heure locale de la destination), jamais à l'heure de l'appareil quand elles diffèrent. Le fuseau vient des données du voyage (F10-TL-1), jamais d'une constante du code.
- **Calcul dans le navigateur** : le jour courant et la prochaine étape se calculent dans le navigateur, d'après l'horloge de l'appareil convertie au fuseau de la destination ; le serveur fournit les jours sans choisir lequel est « aujourd'hui » (mécanisme : F10-TL-2). Raison : l'écran doit fonctionner hors ligne avec le même calcul, et les tests règlent l'horloge du navigateur.
- **Mise à jour** : sans rechargement, l'écran passe à l'étape suivante au plus tard 60 secondes après l'heure de changement, et se recalcule au retour sur l'onglet.

### Écran 15 — Pendant le voyage (`R15`) (F10-PO-2 à F10-PO-6)
**Adresse et cadre**
- Composant serveur qui lit le voyage par `getTripAdapter()` avec `getRequestContext()` ; voyage inconnu ou d'une autre organisation : 404 (comme F5).
- Page sans carte et sans panneau coulissant (handover § 6 : « prochaine étape, bandeau `quai`, `DayLine` compacte ») ; « Retour » (`IconButton`, en haut à gauche) mène au Séjour `/voyages/[id]`.
- Titre de niveau 1 « Aujourd'hui » ; sous le titre, « {destination} · J{n} · {Day.title} » ; titre du document « {destination} · Aujourd'hui » (provisoires, UX/UI). Avant le calcul du jour courant dans le navigateur, une annonce `role="status"` « Chargement de ta journée. » (provisoire) occupe la place du contenu ; le titre de niveau 1 est présent dès le premier rendu.

**Contenu pendant le voyage**, dans cet ordre :
1. **Hors ligne** (F10b) : indicateur « Enregistré pour le hors-ligne à HH:MM » et, sans réseau, `StatusBanner` `offline` (voir « Hors ligne »).
2. **Rappels** (F10-PO-5) : bandeau `quai` si des étapes « À réserver » restent à venir aujourd'hui ou demain : titre « À réserver » puis une ligne par étape, groupées sous « Aujourd'hui » et « Demain » : « {heure} {nom} » (provisoire, UX/UI). Le texte du bandeau est `ink` (handover § 4.2). Sans étape concernée : pas de bandeau.
3. **En ce moment** (titre de niveau 2, rendu seulement s'il y a quelque chose) :
   - une étape en cours (`start` ≤ maintenant < `end`) : « {nom} », « jusqu'à {end} », sa `meta` et ses `Tag` ;
   - sinon un temps libre en cours (`from` ≤ maintenant < `to`) : « Temps libre jusqu'à {to} ».
4. **Prochaine étape** (titre de niveau 2 ; « Ensuite » quand « En ce moment » est rendu, provisoire, UX/UI) : la première étape du jour dont `start` est strictement après maintenant : « {start} – {end} », nom, `meta`, une `Tag` par exception ; ligne « Pour y aller : {segment} » si un segment la précède dans la ligne du jour (libellé au format de `DayLine.Segment`, F3) ; lien « Itinéraire » (F10-PO-6).
5. **Ta journée** (titre de niveau 2) : la `DayLine` compacte du jour, en lecture seule : terminus, étapes avec heures et `Tag`, temps libres et repas pas encore choisis ; les étapes ne sont pas des liens ; ni lien « Idées » ni « Choisir » (provisoire, UX/UI ; F10-TL-1 pour la variante sans lien, partagée avec la `DayLine` compacte de F7b).
6. **Demain** (titre de niveau 2, absent le dernier jour) : une ligne « Première étape à {start} : {nom} » (provisoire, UX/UI).
7. Lien « Voir la journée sur la carte » vers `/voyages/[id]/jour/{n}`.

**Cas particuliers** (F10-PO-4)
- Étape sans `end` : jamais « en cours » ; elle est « prochaine » jusqu'à son heure de début, puis passée.
- Repas pas encore choisi (`openMeal`, décision 0015 § 2) : visible dans « Ta journée », jamais « prochaine étape ».
- Les événements de « Pendant ton séjour » (`Day.events`) ne sont pas des étapes du programme : ils n'apparaissent pas sur cet écran.
- **Plus d'étape aujourd'hui** (maintenant après le début de la dernière étape, aucune en cours) : à la place de « Prochaine étape », « Plus d'étape aujourd'hui. » (provisoire) ; « Demain » reste affiché.
- **Avant le voyage** (aujourd'hui avant le premier jour) : pas de rappels ni de blocs de journée ; « Ton voyage commence le {Day.title de J1}. » ou, la veille, « Ton voyage commence demain. » suivi du bloc « Demain » de J1 ; lien « Voir le séjour » (provisoires, UX/UI).
- **Après le voyage** (aujourd'hui après le dernier jour) : « Ton voyage est terminé. » et lien « Voir le séjour » (provisoires) ; aucun rappel.
- Jour en préparation (`generating: true`) : « Ta journée est encore en préparation. » à la place des blocs 3 à 5 (provisoire).

### Rappels (F10-PO-5)
- Source : `Stop.exceptions` contient `toReserve`, pour les étapes du jour dont `start` est après maintenant et toutes les étapes du lendemain.
- Tant que le contrat ne relie pas une ligne de la liste « À faire avant de partir » à son étape (`ChecklistItem.stopId`, décision 0016 § 11, créé par la tâche qui applique F7-PO-19), une étape déjà réservée par la personne reste rappelée si les données gardent son exception ; quand le lien existera, une étape dont toutes les lignes liées sont faites ne sera plus rappelée (règle à appliquer par cette tâche-là).

### Lien « Itinéraire » (F10-PO-6)
- Rendu seulement pour une prochaine étape qui a un `placeId`. Il ouvre Google Maps (itinéraire vers l'étape) dans un nouvel onglet (`target="_blank"`, `rel="noopener noreferrer"`), nom accessible « Itinéraire vers {nom} (nouvelle fenêtre) » (provisoire, UX/UI). Forme de l'adresse : F10-TL-11 (adresse publique de Google Maps, sans clé, sans requête de l'application).
- Hors ligne : `aria-disabled="true"`, décrit par le bandeau `offline`.

### Accès à l'écran 15 (F10-PO-7)
- Aux dates du voyage (jour courant de la destination entre le premier et le dernier jour), le Séjour (écran 11) montre en tête du panneau, sous `DayTabs`, un lien « Aujourd'hui · J{n} » vers `R15` (rendu provisoire, UX/UI). Hors de ces dates, il n'est pas rendu. Le calcul suit « Temps de référence ».
- La réouverture d'un voyage sur `R15` aux dates du voyage depuis « Mes voyages » (handover § 6, règles de navigation) relève de F11, qui utilisera `tripRoutes.aujourdhui()` (F10-TL-3) et la même fonction de jour courant.
- `R15` reste accessible à toute date par son adresse.

### Hors ligne (F10b ; handover § 13 ; F10-PO-8 à F10-PO-12)
**Quand la copie est enregistrée** (F10-PO-8)
- À chaque ouverture de `R15` avec le réseau, et au retour du réseau tant que `R15` est ouverte, l'application enregistre sur l'appareil la copie du programme **du jour courant et du lendemain** de ce voyage (la veille du départ : J1 seulement ; le dernier jour : ce jour seulement ; avant la veille ou après le voyage : rien), ainsi que ce qu'il faut de l'interface (scripts, styles, polices servis par l'application) pour afficher `R15` et `R-repli` sans réseau.
- **Rien n'est enregistré sur l'appareil tant que la personne n'a pas ouvert `R15`** : les autres écrans (création, présentation, Séjour, Journée, Fiche, révision, vue partagée) n'enregistrent rien et n'installent rien. Les tests « aucune persistance locale » de F4 à F8 restent donc valables tels quels (aucun test désactivé ni affaibli).
- Une copie remplace la précédente pour le même voyage.

**Indicateur et bandeau** (handover § 6 critère 15 et § 13)
- Dès qu'une copie de ce voyage couvre le jour affiché : texte « Enregistré pour le hors-ligne à HH:MM », heure de l'enregistrement à l'heure de la destination (F10-PO-3), toujours visible sur `R15` (pas seulement hors ligne).
- Enregistrement impossible (navigateur sans service worker, stockage refusé ou plein) : « Impossible d'enregistrer ta journée pour le hors-ligne. » (provisoire, UX/UI), sans indicateur ; l'écran fonctionne en ligne.
- Sans réseau (`useOnline()` faux) : `StatusBanner` `offline` en tête du contenu, « Tu es hors ligne. Ton programme est celui enregistré à HH:MM. » (provisoire, UX/UI).

**Ouvrir `R15` sans réseau**
- L'écran s'affiche depuis la copie, avec le même calcul du jour et de la prochaine étape (« Temps de référence »).
- La copie ne couvre pas le jour courant : « Aucun programme enregistré pour aujourd'hui. Reconnecte-toi pour l'enregistrer. » (provisoire), avec le bandeau `offline`.
- Les segments s'affichent sans durée : « Pour y aller : À pied », « Transports publics » ou « Voiture » (F10-PO-9 : aucune durée de trajet dans la copie). Hors ligne, la `DayLine` compacte rend les segments sans texte de durée.
- « Itinéraire » et « Voir la journée sur la carte » : `aria-disabled="true"`, décrits par le bandeau (la Journée et Google Maps demandent le réseau).
- Retour du réseau : bandeau retiré, liens réactivés, nouvel enregistrement, sans rechargement.

**Autres adresses sans réseau** (F10-PO-11)
- Toute navigation vers une page de l'application qui n'est pas enregistrée affiche la page de repli `R-repli` : titre de niveau 1 « Tu es hors ligne », texte « Ces pages sont disponibles sans connexion : », puis un lien par voyage dont une copie existe, « {destination} · Aujourd'hui » vers son `R15` (provisoires, UX/UI). Sans copie : « Aucune page n'est enregistrée sur cet appareil. »
- La vue partagée (`RP`, `RPJ`) n'est jamais enregistrée ni servie hors ligne (F10-PO-11).

**Contenu de la copie** (F10-PO-9) — liste blanche, rien d'autre :
- voyage : identifiant, destination, couleur de destination, dates de début et de fin, fuseau ;
- pour chaque jour enregistré (aujourd'hui, demain) : `index`, `date`, `weekday`, `title`, `generating`, et ses éléments de ligne : terminus (`role`, `time`, `label`), étape (`id`, `kind`, `name`, `start`, `end`, `meta`, `exceptions`, `locked`), segment (`mode`, `estimated`, **sans** `minutes`), temps libre (`from`, `to`), repas pas encore choisi (heure, repas) ;
- heure de l'enregistrement.

Exclus : `placeId`, toute coordonnée ou position (`DayMap`), `Segment.minutes`, `travelMinutes`, `travelBudgetMinutes`, `reason`, `source`, `verifiedAt`, `budgetPerPerson`, `events`, `surprise`, la liste « À faire avant de partir », les propositions, l'organisation. Règle générale : la copie ne contient jamais un champ que le serveur n'a pas le droit de stocker (tableau des champs du handover back-end, § 5, en revue) ; si la réponse de Samuel à Q44 retire `toConfirm` des versions stockées, il sort aussi de la copie. Les durées de trajet reviennent dans la copie seulement si Samuel l'autorise (F10-Q3, suit Q38).

**Conservation** (F10-PO-10)
- Une copie par voyage, remplacée à chaque enregistrement.
- À chaque ouverture de `R15` ou de `R-repli`, les copies des voyages dont le dernier jour est passé (heure de leur destination) sont supprimées de l'appareil.
- Une copie illisible, non conforme à son contrat ou d'une version de contrat antérieure est ignorée (traitée comme absente) et supprimée (mécanisme : F10-TL-4, dans le respect de 0016 § 3.1).

**Ce que le service worker ne fait jamais** (F10-PO-11 ; handover § 8 et § 13)
- Mettre en cache ou servir une réponse d'une autre origine que l'application (domaines Google compris : scripts et tuiles de Maps, données de lieux, polices de Google) : ces requêtes passent au réseau sans copie.
- Mettre en cache les pages ou données du Séjour, de la Journée, de la Fiche, de la révision, de la présentation, de la création, des pages `/dev/` ou de la vue partagée : elles contiennent des positions ou des identifiants de lieu (F4), ou un jeton de partage.
- Servir la copie à la place du réseau quand le réseau répond : en ligne, `R15` affiche toujours le programme du serveur.
- Calculer une date : toute règle de temps (jour courant, conservation) est appliquée par la page, dont l'horloge est celle que règlent les tests (F10-TL-4).

### Manifeste et installation (F10-PO-12)
- L'application a un manifeste : nom et nom court lus dans `src/config/site.ts` (nom provisoire, Q1), `lang` `fr`, `display` `standalone`, `start_url` `/` (F11 pourra le remplacer par « Mes voyages »), couleurs tirées des tokens Ligne (jamais une valeur en dur dans le code : F10-TL-9), icônes provisoires (F10-Q5).
- Pas d'invite d'installation propre à l'application : celle du navigateur suffit au MVP.

### Partager (F10c ; cadrage § 3.1 « lien privé », § 6.8, § 9 ; F10-PO-13)
**Accès**
- `IconButton` « Partager » (icône « partager » de F2, `carte.md` : contrôles posés sur la carte), en haut à droite de la carte du Séjour et de la Journée. Il ouvre une feuille modale (`Dialog`, décision 0013 § 3.5) titrée « Partager ton voyage » (niveau 2, focus dessus), sans changer d'adresse ; Échap ou « Fermer » la ferment, focus rendu à « Partager ».

**Contenu de la feuille**
- Texte : « Toute personne qui a ce lien voit ton programme, sans pouvoir le modifier. Elle ne voit ni ton logement, ni ta liste à réserver, ni ton budget. » (provisoire, UX/UI).
- **Aucun lien actif** : « Créer un lien » (`Button` `primary`).
- **Juste après la création** : champ en lecture seule « Lien de partage » qui contient l'adresse complète (origine de la page suivie de `RP`), « Copier le lien » (`primary`, presse-papiers ; annonce `role="status"` « Lien copié. ») et, si le navigateur propose le partage natif (`navigator.share`), « Envoyer… » (`secondary`) ; mention « Copie-le maintenant : il ne pourra plus s'afficher. » ; « Valable jusqu'au {date} » si le serveur donne une expiration, sinon « Valable jusqu'à ce que tu le désactives. » (provisoires, UX/UI).
- **Lien actif, feuille rouverte** : « Un lien est actif depuis le {date}. » (et sa validité), sans l'adresse (le jeton n'est gardé que sous forme d'empreinte, cadrage § 9) ; « Créer un nouveau lien » (`secondary` : désactive l'ancien et affiche le nouveau) et « Désactiver le lien » (`secondary`).
- **Désactiver** : confirmation dans la feuille, « Le lien ne fonctionnera plus pour personne. » avec « Désactiver » et « Annuler » ; après « Désactiver », annonce « Lien désactivé. » et retour à l'état « aucun lien actif » (provisoires, UX/UI). Pas de toast d'annulation : la désactivation n'est pas une modification du programme (règle d'or 7), et un jeton désactivé ne se réactive pas ; un nouveau lien s'obtient par « Créer un lien ».
- **Un seul lien actif par voyage.**
- Hors ligne : `StatusBanner` `offline` « Tu es hors ligne. Partager demande une connexion. » ; boutons de création et de désactivation en `aria-disabled="true"` (handover § 13) ; « Copier le lien » reste actif s'il est affiché.
- Erreur de l'action : `StatusBanner` `error` « Impossible de modifier le partage pour le moment. » avec « Réessayer » (provisoire, UX/UI) ; rien n'est changé.

**Actions serveur** (F10-PO-17)
- `createShareLink(tripId)`, `revokeShareLink(tripId)`, `getShareStatus(tripId)` : entrée revalidée par les schémas de `src/contracts` avant tout appel à l'adaptateur (`invalid_input`, provisoire) ; organisation prise du contexte de la requête (`getRequestContext()`), jamais du navigateur ; voyage inconnu ou d'une autre organisation : `not_found` (provisoire), sans lien créé ni désactivé. Codes confirmés ou renommés par le Tech Lead (F10-TL-7) ; un renommage ne change ni les textes ni les critères ; les tests importent les codes depuis `src/contracts`.
- Le jeton en clair n'existe que dans la réponse de `createShareLink` ; il n'est jamais renvoyé par `getShareStatus`, journalisé, mesuré, ni placé dans une adresse de l'application autre que `RP` et `RPJ`.

### Vue partagée (`RP`, `RPJ`) (F10c ; F10-PO-14, F10-PO-15 ; Q50)
**Ce qu'elle montre** — lecture seule de 11 et 12, sans carte (F10-PO-14) :
- `RP` (Séjour partagé) : mention « Programme partagé · lecture seule » (provisoire, UX/UI) ; `DestinationPlate` (destination en titre de niveau 1, dates, voyageurs) ; « Pendant ton séjour » (événements, sans lien) ; « Jour par jour » (une ligne par jour, lien vers `RPJ`, sans durée de trajet totale) ; titre du document « {destination} · Programme partagé ».
- `RPJ` (Journée partagée) : `DayTabs` vers `RP` et les autres `RPJ` ; titre de niveau 1 `Day.title` ; `DayLine` en lecture seule (étapes sans lien, ni « Idées », ni « Choisir », ni « Surprends-moi ») ; événements du jour ; « Retour » vers `RP` ; titre du document « {destination} · Jour {n} · Programme partagé ».
- Terminus : « Début de journée » et « Fin de journée » avec l'heure, sans libellé (F10-PO-14, Q50) ; une étape verrouillée n'a pas de marque de verrou ; seules les `Tag` « À confirmer » et « Non confirmé » s'affichent (« À réserver » est une action de la personne qui voyage, règle d'or 6).
- **Jamais transmis au navigateur** (pas seulement masqué) : libellés des terminus (logement, arrivée), liste « À faire avant de partir », budgets, `reason`, `source`, `verifiedAt`, `locked`, `placeId`, positions, « Surprends-moi », `travelMinutes` et `travelBudgetMinutes` (pas de bandeau de trajet), propositions, organisation, identifiant interne du voyage.
- **Vue vivante** : la vue montre le programme courant à chaque chargement, pas un instantané.
- Aucune action (ni « Partager », ni lien « Aujourd'hui », ni lien vers une page privée), aucun événement de mesure, aucun cookie ni stockage, aucune copie hors ligne.

**Réponses** (F10-PO-15)
- Jeton inconnu, désactivé, expiré ou mal formé : **404**, avec exactement la même page pour les quatre cas (« Ce lien de partage n'est pas valide. » : provisoire, UX/UI), sans dire lequel ; un jeton mal formé (forme : F10-TL-7) ne déclenche aucun appel à l'adaptateur. `RPJ` avec un `n` hors du voyage : 404.
- Une erreur de l'adaptateur ou du serveur n'est jamais présentée comme un 404 : elle suit la page d'erreur commune de l'application (statut 500).
- Un lien désactivé cesse de fonctionner dès la requête suivante (aucune mise en cache partagée de `RP` ni de `RPJ` : F10-TL-8).
- La vue n'est pas indexée par les moteurs de recherche, et le jeton ne fuit pas vers les sites ouverts depuis la page (F10-TL-8).

## Événements de mesure (handover § 12 ; F10-PO-16)
| Événement | Quand | Propriétés |
|---|---|---|
| `today_opened` | Une fois par chargement de `R15`, quand le contenu du jour est affiché (pas pendant « Chargement de ta journée ») | `offline` : `true` si l'écran est affiché depuis la copie faute de réseau, sinon `false` |

Aucun autre événement : ni pour le partage, ni pour la vue partagée, ni pour l'enregistrement hors ligne (absents du § 12). Aucune propriété d'identifiant de voyage, de jeton, de nom ni d'heure : le schéma strict les refuse.

## Règles Google et données personnelles
- **Aucune donnée Google mise en cache** (handover § 8 et § 13, règle d'or 4) : ni tuiles, ni scripts de Maps, ni données de lieux, ni réponse d'une autre origine dans le stockage du navigateur, service worker compris (F10-PO-11). La copie hors ligne ne contient ni `placeId`, ni position, ni durée de trajet (F10-PO-9).
- **Seul l'identifiant de lieu est stockable** : la copie hors ligne n'en contient même pas (inutile hors ligne, minimisation) ; le lien « Itinéraire » utilise le `placeId` en mémoire, au moment du clic, sans le stocker.
- **Aucune donnée de lieu Google sur une carte non Google** : `R15` n'a pas de carte ; la vue partagée n'a pas de carte en F10 (F10-PO-14, F10-Q4) ; la carte simulée ne s'importe que depuis `src/app/dev/` et les tests.
- **Aucune donnée Google dans un prompt** : F10 n'appelle aucun modèle.
- **Aucun stockage propre à Vercel** (décision 0002) : ni KV, ni Edge Config, ni cache de données de la plateforme pour les liens de partage ; en phase 0, l'état simulé des liens créés vit en mémoire du processus serveur, qui **n'est pas fiable sur Vercel** (plusieurs instances, redémarrages) : un lien créé sur une démonstration Vercel peut répondre 404 sur une autre instance. La démonstration de la vue partagée sur Vercel s'appuie donc sur le lien valide du jeu simulé, fixe (F10-PO-18) ; les critères qui créent ou désactivent un lien s'exécutent contre un seul serveur (CI, local).
- **Données personnelles** : la copie hors ligne est une donnée personnelle conservée sur l'appareil de la personne : liste blanche (F10-PO-9), suppression après le voyage (F10-PO-10), aucune autre donnée (F10-Q6 pour l'appareil partagé et la déconnexion). Le jeton et l'adresse de partage ne sont ni journalisés (navigateur et serveur), ni mesurés, ni transmis à un tiers par l'en-tête `Referer`.
- **Aucune configuration serveur dans le code client** : l'expiration d'un lien, s'il y en a une, vient de la réponse du serveur ; aucune durée, aucun montant ni seuil de l'offre n'est écrit dans le code client.

## Tests

### Unitaires (Vitest, Testing Library, axe)
- `today.ts` (horloge injectée) : jour courant au fuseau de la destination (appareil à Zurich, destination à Londres, autour de minuit), avant et après le voyage, veille du départ, dernier jour ; étape en cours (`start` ≤ maintenant < `end`, bornes exactes), sans `end`, temps libre en cours, prochaine étape (strictement après), plus d'étape aujourd'hui, `openMeal` jamais prochaine étape ; rappels « À réserver » d'aujourd'hui (à venir seulement) et de demain.
- `offline-copy.ts` : la projection du voyage simulé ne contient que les champs de la liste blanche (comparaison exacte des clés, en profondeur) ; aucun `placeId`, `minutes`, `reason`, `source`, `verifiedAt`, `events`, `surprise`, `checklist`, ni position ; jours retenus selon la date (aujourd'hui et demain ; veille : J1 ; dernier jour : un jour ; sinon aucun).
- Conservation : copies supprimées après le dernier jour du voyage ; copie non conforme ignorée et supprimée.
- Projection de la vue partagée (F10-TL-1) : aucun libellé de terminus, ni `reason`, `source`, `verifiedAt`, `locked`, `placeId`, budget, liste, `surprise`, `travelMinutes`, identifiant interne du voyage ; exceptions limitées à `toConfirm` et `unconfirmed`.
- Actions de partage : entrée invalide → `invalid_input` sans appel à l'adaptateur (espion) ; voyage d'une autre organisation → `not_found`, aucun lien créé ; un seul lien actif (créer un nouveau lien désactive l'ancien) ; `getShareStatus` ne renvoie jamais le jeton ; l'adaptateur simulé ne garde que l'empreinte des jetons créés (F10-TL-7) ; jeton mal formé : aucun appel à l'adaptateur.
- **Journaux** : pendant un cycle complet (création, lecture de la vue, désactivation), un espion sur `console.*`, `process.stdout.write` et `process.stderr.write` ne voit jamais le jeton.
- Schéma de `today_opened` (propriétés refusées : identifiant de voyage, jeton, nom, heure).
- Écran 15, feuille « Partager » et vue partagée avec des données et une horloge injectées.

### E2E, a11y et visuel (Playwright, 390 × 844, build de production, domaines Google bloqués)
Sauf mention, les critères s'exécutent sur `mock_trip_edimbourg` (`unlocked: false`), destination au fuseau `Europe/London` (heure d'été : UTC+1 en août), et ne préjugent pas de ce qu'un voyage non débloqué peut faire (Q63, F10-Q2) : si Samuel le restreint, ils seront repris sur `mock_trip_edimbourg_debloque`. Horloge du navigateur installée par `page.clock.install` et avancée par le test (`runFor`, `setSystemTime`), jamais en temps fixe ; l'horloge du serveur n'intervient dans aucun critère (F10-PO-3). Les jetons simulés (valide, désactivé, expiré) sont des constantes de `src/mocks`, importées par les tests seulement. Lecture du stockage, interception des requêtes du service worker et isolation des tests de partage : F10-TL-6 et F10-TL-7.
- `tests/e2e/aujourdhui.e2e.spec.ts` [a], `tests/e2e/hors-ligne.e2e.spec.ts` [b], `tests/e2e/partage.e2e.spec.ts` [c].
- `tests/e2e/voyage.a11y.spec.ts` : axe sur `R15` (en cours, temps libre, plus d'étape, avant et après le voyage, rappels) [a], `R15` hors ligne avec et sans copie du jour, `R-repli` [b], feuille « Partager » (aucun lien, lien créé, lien actif, confirmation) et `RP`, `RPJ`, 404 [c].
- `tests/visual/voyage.visual.spec.ts` : mêmes états ; références régénérées selon la décision 0004.

## Décisions (Product Owner, définitives sans veto de Samuel sous 2 jours)
Une décision marquée « provisoire (UX/UI) » porte sur un rendu ou un texte non maquetté et peut être changée par UX/UI sans nouvelle décision du Product Owner (F10-Q5).
- **F10-PO-1 — Périmètre.** F10 couvre l'écran 15, le hors-ligne de l'écran 15 et la vue partagée, comme le handover § 15. Le calendrier (cadrage § 3.1 écran 15 et § 3.5) n'y entre pas : il n'est ni dans la ligne de l'écran 15 du handover § 6 ni dans F10 ; sa place est demandée au CEO (F10-Q7). Les « rappels » sont un bandeau dans l'écran (F10-PO-5), sans notification.
- **F10-PO-2 — Écran 15 sans carte.** Page propre, hors du panneau du voyage : rappels, « En ce moment », « Prochaine étape », `DayLine` compacte, « Demain », lien vers la Journée. Raisons : le handover § 6 n'y met pas de carte ; la carte n'est pas disponible hors ligne (handover § 8) ; la page reste légère sur un réseau mobile en voyage.
- **F10-PO-3 — Heure de la destination, calculée dans le navigateur.** Jour courant, maintenant, prochaine étape et heure de l'indicateur hors ligne à l'heure de la destination ; calcul dans le navigateur, le même en ligne et hors ligne ; mise à jour sans rechargement, au plus 60 s après le changement.
- **F10-PO-4 — Prochaine étape.** Étape en cours : `start` ≤ maintenant < `end` ; prochaine : premier `start` strictement après maintenant ; sans `end`, jamais en cours ; temps libre en cours affiché ; repas pas encore choisi jamais prochaine étape ; événements hors programme absents ; « Plus d'étape aujourd'hui », avant et après le voyage, la veille et le dernier jour ont chacun leur texte.
- **F10-PO-5 — Rappels.** Bandeau `quai` des étapes « À réserver » à venir aujourd'hui et de celles de demain ; pas de notification (handover § 16) ; avec `ChecklistItem.stopId`, une étape dont les lignes liées sont faites ne sera plus rappelée.
- **F10-PO-6 — Itinéraire.** Lien externe vers Google Maps pour la prochaine étape qui a un `placeId`, nouvel onglet, désactivé hors ligne ; aucune requête de l'application vers Google, aucun stockage. Les « liens d'itinéraire » du cadrage (§ 3.5) sont ainsi couverts pour la prochaine étape ; la Fiche (F5) n'en reçoit pas dans F10.
- **F10-PO-7 — Accès.** Lien « Aujourd'hui · J{n} » en tête du Séjour aux dates du voyage ; `R15` accessible à toute date ; réouverture depuis « Mes voyages » laissée à F11.
- **F10-PO-8 — Enregistrement hors ligne à l'ouverture de l'écran 15.** Automatique, à chaque ouverture en ligne de `R15` et au retour du réseau ; jour courant et lendemain seulement (handover § 13) ; rien n'est enregistré ni installé sur l'appareil avant la première ouverture de `R15`. Raisons : minimisation des données sur l'appareil, et aucun changement pour les écrans qui garantissent aujourd'hui l'absence de stockage (F4 à F8).
- **F10-PO-9 — Contenu de la copie.** Liste blanche ci-dessus ; ni `placeId`, ni position, ni durée de trajet (donnée dérivée de Google calculée à la lecture et non stockée, Q38 et décision 0010 en revue), ni raison, source, budget, liste, événements ou idée « Surprends-moi ». Hors ligne, les segments s'affichent sans durée. Les durées reviendront si Samuel l'autorise (F10-Q3).
- **F10-PO-10 — Conservation de la copie.** Une copie par voyage, remplacée à chaque enregistrement, supprimée après le dernier jour du voyage ; copie non conforme ignorée et supprimée.
- **F10-PO-11 — Ce qui n'est jamais enregistré.** Aucune réponse d'une autre origine, aucune page ou donnée des autres écrans, aucune page de la vue partagée ; en ligne, le réseau fait toujours foi ; hors ligne, une page non enregistrée mène à la page de repli, qui liste les voyages enregistrés.
- **F10-PO-12 — Manifeste.** Nom de la configuration, `fr`, `standalone`, `start_url` `/`, couleurs des tokens, icônes provisoires ; pas d'invite d'installation propre.
- **F10-PO-13 — Partager.** Bouton « Partager » sur la carte du Séjour et de la Journée ; feuille modale ; un seul lien actif par voyage ; l'adresse s'affiche une seule fois, à la création (le jeton n'est gardé qu'en empreinte, cadrage § 9) ; « Créer un nouveau lien » remplace l'ancien ; « Désactiver le lien » avec confirmation, sans toast d'annulation ; actions désactivées hors ligne ; pas d'expiration en phase 0, affichée si le serveur en donne une (F10-Q2).
- **F10-PO-14 — Contenu de la vue partagée (Q50).** Lecture seule du Séjour et des Journées, sans carte en F10 (F10-Q4) ; **aucune information de logement** : les terminus deviennent « Début de journée » et « Fin de journée », leurs libellés (logement, lieu d'arrivée) ne sont pas transmis ; ni liste à réserver, ni budget, ni raisons, sources, dates de vérification, verrous, idées, bandeau de trajet ; pas de `Tag` « À réserver ». Raisons : un lien peut circuler au-delà de la personne à qui il est envoyé, et l'adresse de l'hébergement d'un couple en voyage n'a pas à circuler avec lui ; les raisons parlent des goûts de la personne qui voyage ; « À réserver » demande une action que le visiteur ne peut pas faire. Vue vivante, sans action, sans mesure, sans stockage.
- **F10-PO-15 — Réponses de la vue partagée.** Même 404, même page, pour un jeton inconnu, désactivé, expiré ou mal formé ; erreur serveur en 500, jamais en 404 ; désactivation effective à la requête suivante ; vue non indexée ; jeton protégé de l'en-tête `Referer`.
- **F10-PO-16 — Mesure.** `today_opened` une fois par chargement de `R15`, `offline` vrai si l'écran vient de la copie faute de réseau ; aucun autre événement.
- **F10-PO-17 — Le serveur fait foi pour le partage.** Revalidation de l'entrée, organisation de la requête, jamais du navigateur ; voyage d'une autre organisation : `not_found` ; jeton en clair seulement dans la réponse de création ; jamais journalisé.
- **F10-PO-18 — Simulation de phase 0.** L'adaptateur simulé de partage connaît trois jetons fixes : un lien valide sur `mock_trip_edimbourg_debloque` (démonstration, y compris sur Vercel), un lien désactivé et un lien expiré ; les liens créés vivent en mémoire du processus serveur (non fiable sur Vercel, voir « Règles Google et données personnelles ») et n'expirent pas ; aucune limite de création en phase 0.
- **F10-PO-19 — Découpage proposé au CEO.** Trois PR successives, après la fusion de F5c et de T4 : **F10a** écran 15 en ligne, accès depuis le Séjour, `timeZone`, `today_opened` (critères [a]) ; **F10b** hors-ligne : manifeste, service worker, copie, page de repli, conservation (critères [b]) ; **F10c** partage et vue partagée (critères [c]). Ordre a → b → c : des critères [c] supposent le service worker de F10b. Les critères transverses s'appliquent à chaque PR pour ce qu'elle livre. Le CEO peut les réunir ou en changer l'ordre ; un critère [c] marqué « après F10b » passe alors à la PR qui livre le second des deux.

## Propositions au Tech Lead (architecture et tests, à confirmer à la revue de la PR de code ou par une décision dans `docs/decisions/`)
- **F10-TL-1 — Contrats.** Besoin : connaître le fuseau de la destination ; décrire la copie hors ligne et la vue partagée par des contrats stricts qui ne peuvent pas porter les champs exclus. Proposition :
  - `Trip.timeZone` : identifiant IANA obligatoire (`Europe/London` dans le jeu simulé), validé par `Intl.supportedValuesOf("timeZone")` ou une liste équivalente ; ajouté au tableau des champs de B0 comme champ maison stocké ;
  - `OfflineTripCopy` (`z.strictObject`, `version` de contrat, `savedAt` instant ISO) avec la liste blanche de F10-PO-9 ; segment sans `minutes` ;
  - `SharedTrip` et `SharedDay` (`z.strictObject`) : terminus `{ type: "terminus"; role; time }` sans `label`, étape sans `placeId`, `reason`, `source`, `verifiedAt`, `locked`, exceptions restreintes à `toConfirm` et `unconfirmed` ; sans identifiant interne du voyage ;
  - `ShareStatus = { active: false } | { active: true; createdAt; expiresAt? }` et `CreatedShareLink = { token; createdAt; expiresAt? }` ; résultats `{ ok: true; … } | { ok: false; error: "invalid_input" | "not_found" | "error" }` (codes provisoires) ;
  - variante sans lien de `DayLine` (prop `getStopHref` facultative ou variante `compact`), partagée avec la `DayLine` compacte de F7b ;
  - côté client, types par `import type` et valeurs depuis `@/contracts/values` (0016 § 3.1).
- **F10-TL-2 — Jour courant et prochaine étape.** Besoin : un seul calcul, en ligne et hors ligne, testable avec l'horloge du navigateur. Proposition : fonctions pures de `src/features/voyage/today.ts` (`currentDayIndex(trip, now)`, `nowAt(day, now, timeZone)`, `nextUp(day, time)`, `reminders(days, now)`) sur `Intl.DateTimeFormat` avec `timeZone`, sans bibliothèque de dates ; horloge injectable (`now: () => number`, `Date.now` par défaut) ; composant client qui calcule après le montage (pas de « aujourd'hui » au rendu serveur, pas d'écart d'hydratation), minuteur aligné sur la minute suivante et recalcul à `visibilitychange`. La page serveur transmet les jours nécessaires (tous les jours du voyage, projetés sans positions ni `placeId` sauf le `placeId` de l'étape pour « Itinéraire » en mémoire).
- **F10-TL-3 — Adresses et pages.** `tripRoutes` gagne `aujourdhui()` ; `R15` sous `src/app/voyages/[id]/aujourdhui/`, hors du groupe `(programme)` (0016 § 1.1 : pas de carte ni de panneau) ; module `src/features/partage/routes.ts` pour `RP` et `RPJ` (`/p/[token]/jour/[n]`), seul endroit qui connaît leur schéma ; `R-repli` à `/hors-ligne`, page statique servie par le service worker hors ligne. Pas de page `/dev/` : F10 n'a pas de carte.
- **F10-TL-4 — Mécanisme hors ligne.** Besoin : F10-PO-8 à F10-PO-11, sans donnée Google, sans enregistrement avant `R15`, sans logique de temps dans le service worker. Proposition :
  - service worker écrit à la main (`public/sw.js`, sans dépendance ; ou Serwist si le Tech Lead le préfère, avec une entrée dans `docs/decisions/0003-versions.md`), **enregistré seulement par `R15`** (portée `/`) ;
  - **liste blanche d'interception** : actifs `/_next/static/…` de l'application et polices servies par l'application (cache « interface », versionné par build), document de `R15` et de `R-repli` (réseau d'abord, copie seulement sans réseau) ; tout le reste passe au réseau sans copie, autres origines comprises ; `/p/`, `/dev/`, actions serveur et données des autres pages jamais interceptées ;
  - **copie** : enregistrée par la page (pas par le service worker) dans IndexedDB ou Cache Storage, sous une clé par voyage, validée à la lecture par un schéma `zod/mini` placé hors de `src/features/**` (0016 § 3.1, règle 4), version de contrat comprise ; `R15` hors ligne se rend côté client depuis la copie (le document enregistré ne contient aucune donnée du voyage) ;
  - le service worker ne lit jamais l'heure ; la conservation (F10-PO-10) est appliquée par la page ;
  - au déploiement d'une nouvelle version, l'ancien cache « interface » est supprimé à l'activation.
- **F10-TL-5 — Lint.** La règle `noClientStorage` couvre `src/features/voyage`, `src/features/partage`, `src/app/voyages/[id]/aujourdhui`, `src/app/p` et `R-repli`, **sauf** le seul module hors ligne désigné (F10-TL-4) ; `react/jsx-no-literals` et la règle de 0016 § 3.1 (pas de `zod`, pas d'import de valeur depuis `@/contracts` dans `src/features/**`) s'appliquent aux nouveaux fichiers ; tests dans `tests/unit/lint/` : un `navigator.serviceWorker.register` hors du module désigné est refusé, dans le module il passe, et les interdictions précédentes tiennent.
- **F10-TL-6 — Tests avec un service worker.** Besoin : les specs de F10b prouvent qu'aucune requête, celles du service worker comprises, ne part vers un domaine Google, et lisent le contenu enregistré. Proposition : `serviceWorkers: "allow"` pour les specs de F10b et `"block"` pour les autres projets (ce qui garde les tests de F4 à F8 inchangés) ; blocage des domaines Google au niveau du contexte (`context.route`), vérifié aussi pour les requêtes du service worker (test qui fait demander une ressource Google par le service worker et constate le blocage) ; lecture du stockage par `page.evaluate` (`caches.keys()`, `caches.open(…).keys()`, corps des réponses, `indexedDB.databases()` et contenu des bases) ; horloge du navigateur par `page.clock`, jamais celle du service worker.
- **F10-TL-7 — Adaptateur de partage.** `ShareAdapter` (`createLink(ctx, tripId)`, `revokeLink(ctx, tripId)`, `getStatus(ctx, tripId)`, `getSharedTrip(token)`, `getSharedDay(token, n)`) dans `src/adapters`, choisi par `DATA_ADAPTER` ; jeton de 32 octets aléatoires (`crypto.getRandomValues`), en base64url (43 caractères) ; forme vérifiée avant tout appel (`^[A-Za-z0-9_-]{43}$`) ; seule l'empreinte SHA-256 du jeton est gardée, y compris par l'adaptateur simulé ; implémentation `mock` en mémoire du processus, rangée par portée de simulation si F8-TL-9 est livrée, sinon specs de partage en série (`test.describe.configure({ mode: "serial" })`) ; trois jetons fixes dans `src/mocks/edimbourg-partage.ts` (F10-PO-18), lus seulement par `src/adapters` et les tests ; B12 remplace le tout par la table `share_links` (Postgres UE). Codes provisoires `invalid_input`, `not_found`, `error` à confirmer.
- **F10-TL-8 — En-têtes et rendu de la vue partagée.** Rendu dynamique à chaque requête ; `Cache-Control: private, no-store` ; `Referrer-Policy: no-referrer` ; `X-Robots-Tag: noindex, nofollow` et `<meta name="robots" content="noindex, nofollow">` ; aucun fournisseur de mesure monté ; le jeton n'apparaît dans aucun journal de l'application. Les journaux d'accès de l'hébergeur, hors de l'application, relèvent de F10-Q6.
- **F10-TL-9 — Manifeste.** `src/app/manifest.ts` (route de métadonnées de Next.js), nom depuis `src/config/site.ts`, couleurs lues dans les tokens Ligne (par exemple depuis `docs/design-system/tokens.json` à la construction) plutôt qu'écrites en dur ; icônes provisoires 192 et 512 px fournies par UX/UI (F10-Q5).
- **F10-TL-10 — Budget de JavaScript.** Le test de 0016 § 3.1 (règle 5) garde la Journée strictement sous 200 000 octets avec F10 (le bouton « Partager » et sa feuille ne doivent pas l'alourdir : feuille chargée à la demande) ; proposition : la même mesure, journalisée, sur `R15` et `RP`, avec un seuil fixé par le Tech Lead.
- **F10-TL-11 — Lien « Itinéraire ».** Adresse publique de Google Maps (« Maps URLs ») : `https://www.google.com/maps/dir/?api=1&destination={nom encodé}&destination_place_id={placeId}&travelmode={walking|transit|driving}` d'après le segment qui précède ; aucune clé ; construite dans un module pur testé.

## Critères d'acceptation
Chaque critère porte la sous-tâche qui le livre et l'exécute : [a] F10a, [b] F10b, [c] F10c ; [t] : transverse, exécuté par chaque PR pour ce qu'elle livre.

Transverses :
- [ ] **C1** [t] `pnpm verify` passe, sans clé ni service externe ; le test de budget de la Journée (0016 § 3.1) reste vert.
- [ ] **C2** [t] axe sans violation sur chaque état listé dans « Tests » (`pnpm test:a11y`) ; chaque élément interactif mesure au moins 44 × 44 px ; contour de focus 2 px `line` décalé de 2 px ; un seul titre de niveau 1 par page (Playwright).
- [ ] **C3** [t] Aucune couleur, taille ni valeur en `px` en dur hors `provisoire.css` (le manifeste compris : F10-TL-9) ; tous les textes dans `fr.json` sous `voyage.aujourdhui.*`, `voyage.horsLigne.*` et `partage.*` ; aucun texte « Aperçu », « Supprimer », « OK », « Valider », « Vérifié » ni point d'exclamation dans `fr.json` ni dans le rendu ; `react/jsx-no-literals` actif sur les nouveaux fichiers ; aucun fichier de `src/features/**` n'importe `zod` ni une valeur de `@/contracts` (lint et test, 0016 § 3.1).
- [ ] **C4** [t] Aucune requête vers un domaine Google pendant les specs de F10 ; aucun fichier de `src/features/voyage`, `src/features/partage`, `src/app/voyages/[id]/aujourdhui` ni `src/app/p` n'importe la carte simulée ni `src/mocks` (règle de lint testée) ; la PR joint les captures 390 × 844, liste les rendus provisoires (F10-Q5), les choix soumis au Tech Lead (F10-TL-1 à F10-TL-11) et l'absence de maquette (Q12).

Écran 15 en ligne [a] :
- [ ] **C5** [a] `/voyages/inconnu/aujourdhui` et l'écran 15 d'un voyage d'une autre organisation : 404 (test unitaire de la page avec un contexte d'une autre organisation, et e2e pour l'identifiant inconnu).
- [ ] **C6** [a] **Scénario du handover § 14, jour J en ligne** : horloge au 2026-08-30T10:40:00+01:00, ouverture de `/voyages/mock_trip_edimbourg/aujourdhui` : titre de niveau 1 « Aujourd'hui », « J2 · Dimanche 30 août », pas de bloc « En ce moment » ; « Prochaine étape » : « 10:50 – 11:50 », « [Dean Village] », « Pour y aller : » suivi du segment à pied de 20 min au format de F3 ; lien « Itinéraire » avec `target="_blank"` et `rel` contenant `noopener` et `noreferrer` (adresse sous réserve de F10-TL-11, contenant `mock_place_dean_village`) ; titre du document « Édimbourg · Aujourd'hui » (test `aujourdhui: prochaine étape`).
- [ ] **C7** [a] Même page, `page.clock.runFor` jusqu'à 10:51 sans rechargement : « En ce moment » montre « [Dean Village] » et « jusqu'à 11:50 », « Ensuite » montre « [Café de Stockbridge] » « 12:05 – 13:15 » ; à 16:00 : « Temps libre jusqu'à 18:30 » et prochaine étape « [Bonne table de New Town] » « 19:00 – 20:30 », sans lien « Itinéraire » (étape sans `placeId`) ; à 21:00 : « Plus d'étape aujourd'hui. » et « Demain » : « Première étape à 08:00 : [Excursion guidée dans les Highlands] » (test `aujourdhui: au fil de la journée`).
- [ ] **C8** [a] Rappels à 10:40 le 30.08 : bandeau `quai` « À réserver » avec, sous « Aujourd'hui », « 19:00 [Bonne table de New Town] » et, sous « Demain », « 08:00 [Excursion guidée dans les Highlands] » ; à 21:00 le même jour, la ligne de 19:00 a disparu ; le texte du bandeau a un contraste d'au moins 4,5:1 (test `aujourdhui: rappels`).
- [ ] **C9** [a] **Fuseau de la destination** : contexte Playwright `timezoneId: "Europe/Zurich"`, horloge au 2026-08-30T00:30:00+02:00 (23:30 le 29.08 à Édimbourg) : l'écran montre J1 (« Samedi 29 août »), « Plus d'étape aujourd'hui. » et « Demain » « Première étape à 09:15 : [Royal Mile] » (test `aujourdhui: heure de la destination`).
- [ ] **C10** [a] Avant et après le voyage : le 2026-08-01T12:00:00+01:00, « Ton voyage commence le Samedi 29 août. » (ou la forme retenue par UX/UI pour la date), sans rappel ni « Prochaine étape » ; le 2026-08-28T12:00:00+01:00, « Ton voyage commence demain. » et « Première étape à 12:45 : [Petite adresse du Grassmarket] » ; le 2026-09-04T12:00:00+01:00, « Ton voyage est terminé. » ; chaque fois, lien « Voir le séjour » vers `/voyages/mock_trip_edimbourg` ; le 2026-09-03 (dernier jour), pas de bloc « Demain » (test `aujourdhui: hors des dates`).
- [ ] **C11** [a] « Ta journée » contient la `DayLine` du jour (`<ol>`) sans aucun lien d'étape ; « Voir la journée sur la carte » mène à `/voyages/mock_trip_edimbourg/jour/2` ; « Retour » mène à `/voyages/mock_trip_edimbourg` (test `aujourdhui: navigation`).
- [ ] **C12** [a] Séjour de `mock_trip_edimbourg` avec l'horloge au 2026-08-30T10:40:00+01:00 : lien « Aujourd'hui · J2 » vers `/voyages/mock_trip_edimbourg/aujourdhui` ; au 2026-08-01, pas de lien (test `sejour: lien aujourd'hui`).
- [ ] **C13** [a] Un seul `today_opened` `{ offline: false }` par chargement de l'écran 15, sans autre propriété ; aucun pendant « Chargement de ta journée » ; un ajout de propriété (identifiant de voyage, nom, heure) au schéma est refusé (test unitaire et e2e).
- [ ] **C14** [a] Après le parcours de C6 à C12, `localStorage` et `sessionStorage` sont vides, `indexedDB.databases()` et `caches.keys()` renvoient des listes vides, aucun cookie, aucun service worker enregistré (F10a n'enregistre rien ; dans F10b, ce contrôle est remplacé par C16 et C17, comme prévu ici : ce n'est pas une désactivation de test).

Hors-ligne [b] (horloge au 2026-08-30T10:40:00+01:00 sauf mention) :
- [ ] **C15** [b] Le manifeste (`R-manifeste`, sous réserve de F10-TL-9) est lié depuis chaque page, et contient `name` égal au nom de `src/config/site.ts`, `lang` `fr`, `display` `standalone`, `start_url` `/`, au moins une icône de 192 px et une de 512 px ; ses couleurs sont celles des tokens (test unitaire qui compare au fichier de tokens, et e2e).
- [ ] **C16** [b] **Rien avant l'écran 15** : un parcours Séjour, Journée, Fiche et présentation, sans ouvrir `R15`, ne laisse aucun service worker enregistré et `caches.keys()` vide ; les tests « aucune persistance locale » de F4 à F8 passent sans modification (test `hors-ligne: rien avant l'écran 15`).
- [ ] **C17** [b] Ouverture en ligne de `/voyages/mock_trip_edimbourg/aujourdhui` : « Enregistré pour le hors-ligne à 10:40 » visible ; puis lecture de tout le stockage du navigateur (Cache Storage, IndexedDB, Web Storage ; F10-TL-6) : chaque entrée a l'origine de l'application ; aucune entrée ne correspond à une adresse sous `/p/`, `/dev/`, `/voyages/mock_trip_edimbourg/jour/` ni au Séjour ; aucun contenu enregistré autre qu'un script, une feuille de style ou une police de l'application ne contient une valeur `mock_place_`, une latitude ou une longitude de `src/mocks/edimbourg-carte.ts`, ni `maps.googleapis.com`, `maps.gstatic.com` ou `places.googleapis.com` ; la copie ne contient que J2 et J3 ; `localStorage`, `sessionStorage` et les cookies restent vides (test `hors-ligne: aucun cache Google`, complété par le test unitaire de `offline-copy.ts`).
- [ ] **C18** [b] **Scénario du handover § 14, jour J hors ligne** : après C17, `context.setOffline(true)` puis rechargement : la page s'affiche, `StatusBanner` `offline` « Tu es hors ligne. Ton programme est celui enregistré à 10:40. », indicateur « Enregistré pour le hors-ligne à 10:40 », « Prochaine étape » « [Dean Village] » « 10:50 – 11:50 », « Pour y aller : À pied » sans durée, « Itinéraire » et « Voir la journée sur la carte » en `aria-disabled="true"` ; un `today_opened` `{ offline: true }` ; `runFor` jusqu'à 10:51 : « En ce moment » « [Dean Village] » sans rechargement (test `hors-ligne: prochaine étape le jour J`).
- [ ] **C19** [b] Toujours hors ligne : horloge au 2026-08-31T07:00:00+01:00 et rechargement : J3 depuis la copie, prochaine étape « [Excursion guidée dans les Highlands] » à 08:00 ; horloge au 2026-09-01T09:00:00+01:00 et rechargement : « Aucun programme enregistré pour aujourd'hui. Reconnecte-toi pour l'enregistrer. » (test `hors-ligne: jours enregistrés`).
- [ ] **C20** [b] Hors ligne, navigation vers `/voyages/mock_trip_edimbourg/jour/2` puis vers `/` : la page de repli s'affiche (« Tu es hors ligne »), avec un lien « Édimbourg · Aujourd'hui » vers `/voyages/mock_trip_edimbourg/aujourdhui` qui, suivi, affiche l'écran 15 depuis la copie ; dans un contexte neuf qui n'a jamais ouvert `R15`, aucune page de repli n'est servie (le navigateur montre son erreur réseau) (test `hors-ligne: page de repli`).
- [ ] **C21** [b] Retour du réseau sur l'écran 15 ouvert, l'horloge étant avancée à 10:45 : bandeau retiré, liens réactivés, indicateur « Enregistré pour le hors-ligne à 10:45 », sans rechargement (test `hors-ligne: retour du réseau`).
- [ ] **C22** [b] Conservation : copie enregistrée le 2026-08-30, puis ouverture en ligne le 2026-09-04T12:00:00+01:00 : « Ton voyage est terminé. », plus d'indicateur, et le stockage ne contient plus de copie de ce voyage ; une copie modifiée à la main pour la rendre non conforme est ignorée (« Aucun programme enregistré pour aujourd'hui. » hors ligne) et supprimée (tests e2e et unitaires).
- [ ] **C23** [b] Navigateur où l'enregistrement échoue (service worker indisponible, simulé par le test) : « Impossible d'enregistrer ta journée pour le hors-ligne. », pas d'indicateur, l'écran 15 reste complet en ligne (test unitaire ou e2e, F10-TL-6).
- [ ] **C24** [b] Le service worker ne fait passer aucune requête vers un domaine Google hors du blocage du test (vérifié par le test de F10-TL-6) ; un `navigator.serviceWorker` ou une écriture de stockage hors du module désigné est refusé par le lint (test dans `tests/unit/lint/`, F10-TL-5).

Partager et vue partagée [c] :
- [ ] **C25** [c] Le Séjour et la Journée de `mock_trip_edimbourg` ont un `IconButton` « Partager » ; il ouvre une feuille modale (`role="dialog"`, `aria-modal="true"`) titrée « Partager ton voyage » avec le focus, adresse inchangée ; Échap la ferme, focus sur « Partager » (test `partage: feuille`).
- [ ] **C26** [c] « Créer un lien » : le champ « Lien de partage » contient `{origine}/p/{jeton}` (jeton de la forme de F10-TL-7) ; « Copier le lien » écrit cette adresse dans le presse-papiers (permission accordée au contexte) et annonce « Lien copié. » ; avec `navigator.share` simulé par le test, « Envoyer… » l'appelle avec cette adresse ; sans `navigator.share`, « Envoyer… » est absent ; fermer puis rouvrir la feuille : « Un lien est actif depuis le … », et aucun élément ne contient le jeton (test `partage: créer un lien`).
- [ ] **C27** [c] Dans un contexte de navigateur neuf (sans cookie), l'adresse créée affiche `RP` : mention « Programme partagé · lecture seule », destination en titre de niveau 1, « Jour par jour » avec un lien par jour vers `RPJ` (sous réserve de F10-TL-3) ; la page ne contient ni « À faire avant de partir », ni « Budget », ni « Partager », ni « Aujourd'hui » ; le corps de la réponse HTTP de `RP` et de `RPJ` (jour 2) ne contient pas « [Hôtel, Old Town] », « [Arrivée, aéroport d'Édimbourg] », `mock_trip_edimbourg`, `mock_place_`, ni le texte d'une `reason` ou d'une `source` du jour (test `partage: vue partagée sans logement`).
- [ ] **C28** [c] `RPJ` jour 2 : `DayLine` (`<ol>`) avec « [Dean Village] » à 10:50 sans lien, « Début de journée » 09:00 et « Fin de journée » 20:45 ; « [Bonne table de New Town] » à 19:00 sans `Tag` « À réserver » ; le concert « [Concert d'orgue à St Giles] » avec « Non confirmé » ; aucune carte ; pas de bandeau de trajet ; « Retour » mène à `RP` ; `RPJ` jour 7 : 404 (test `partage: journée partagée`).
- [ ] **C29** [c] Réponses de `RP` et `RPJ` : `Cache-Control` contient `no-store`, `Referrer-Policy: no-referrer`, `X-Robots-Tag` contient `noindex` et la page porte `<meta name="robots">` avec `noindex` ; aucun cookie posé ; après la visite, `localStorage`, `sessionStorage` vides et `indexedDB.databases()` vide ; aucun événement de mesure enregistré (sous réserve de F10-TL-8) (test `partage: en-têtes et rien sur l'appareil`).
- [ ] **C30** [c] Jeton inconnu (bonne forme), jeton fixe désactivé, jeton fixe expiré, jeton mal formé (`abc`, et 300 caractères) : statut 404 et même texte visible pour les quatre (« Ce lien de partage n'est pas valide. ») ; le jeton fixe valide (`mock_trip_edimbourg_debloque`) répond 200 (test `partage: liens non valides`, et test unitaire « aucun appel à l'adaptateur pour un jeton mal formé »).
- [ ] **C31** [c] Désactivation : « Désactiver le lien », confirmation « Désactiver » : annonce « Lien désactivé. », la feuille revient à « Créer un lien », et l'adresse créée répond 404 dès la requête suivante ; « Créer un lien » puis « Créer un nouveau lien » : l'ancienne adresse répond 404, la nouvelle 200 (test `partage: désactiver et remplacer`).
- [ ] **C32** [c] Hors ligne, feuille ouverte : bandeau « Tu es hors ligne. Partager demande une connexion. », « Créer un lien », « Créer un nouveau lien » et « Désactiver le lien » en `aria-disabled="true"` ; de retour en ligne, réactivés sans rechargement (test `partage: hors ligne`).
- [ ] **C33** [c] **Le serveur fait foi** : `createShareLink` avec un voyage d'une autre organisation renvoie `not_found` et aucun lien n'existe ensuite pour ce voyage ; une entrée invalide renvoie `invalid_input` sans appel à l'adaptateur ; `getShareStatus` ne renvoie jamais le jeton ; pendant le parcours de C26 à C31, ni la console du navigateur, ni la sortie du serveur de test (`webServer` de Playwright, `stdout` et `stderr` capturés et relus), ni aucun événement de mesure ne contiennent le jeton (tests unitaires des actions et test `partage: jeton jamais journalisé`).
- [ ] **C34** [c] (après F10b) Après l'ouverture de `R15` (service worker installé), une visite de `RP` puis de `RPJ` n'ajoute aucune entrée de stockage dont l'adresse est sous `/p/` ; hors ligne, `RP` affiche la page de repli et non la vue partagée (test `partage: jamais hors ligne`).

## Hors périmètre
- Calendrier (export d'agenda) : F10-PO-1, F10-Q7.
- Notifications et rappels push (handover § 16) ; vérification à J-7, « Ce soir », « Deux heures libres », « S'il pleut » (cadrage § 3.5, après le MVP).
- Carte de la vue partagée (F10-Q4) ; carte de l'écran 15 (F10-PO-2).
- Fiche étape et liens d'itinéraire dans la vue partagée ; lien « Itinéraire » dans la Fiche (F5).
- Expiration des liens (F10-Q2) ; plusieurs liens par voyage ; liens nominatifs ou protégés par code ; trier à deux.
- Enregistrement hors ligne d'autres écrans que l'écran 15 ; modification du programme hors ligne (F7 désactive déjà les modifications sans réseau).
- Table `share_links`, empreinte et révocation en base, limite de création de liens : B12.
- Réouverture d'un voyage sur l'écran 15 depuis « Mes voyages », « Après le voyage » : F11 ; grand écran : F12 ; thème sombre.

## Questions ouvertes
Nouvelles questions de cette spécification (numéros provisoires à partir de Q137 ; numéros définitifs attribués par le CEO dans `QUESTIONS.md`) :
- **F10-Q1 = Q137 (Samuel, phases et périmètre du MVP)** : le cadrage (§ 3.5, bloc « Pendant le voyage ») range « Hors ligne » **après le MVP**, alors que le handover front-end (§ 2, § 13, § 15 F10) l'inclut. F10 suit le handover sur données simulées (périmètre F1 à F12 autorisé le 2026-10-08). Le hors-ligne fait-il partie du MVP mis en service, ou seulement du front de phase 0 ? Bloque : rien dans F10 ; la mise en service de F10b et le chiffrage de B12.
- **F10-Q2 = Q138 (Samuel, offre)** : le cadrage (§ 4) range « partage et accès jusqu'à 30 jours après le retour » dans le voyage complet payé. Un voyage non débloqué peut-il être partagé et ouvrir l'écran 15 (lié à Q63) ? Un lien de partage expire-t-il, et quand (30 jours après le dernier jour du voyage ?) ? Bloque : la restriction éventuelle avant paiement et la règle d'expiration (F10 n'en applique aucune en phase 0, F10-PO-13) ; pas le code.
- **F10-Q3 = Q139 (Samuel, juridique, suit Q5, Q38 et Q44)** : la copie hors ligne gardée sur l'appareil peut-elle contenir les durées de trajet (`Segment.minutes`, tirées de Routes) et l'exception « À confirmer » déduite des horaires Google ? F10 exclut les durées par défaut (F10-PO-9) et garde « À confirmer » tant qu'elle est stockée côté serveur. Bloque : l'affichage des durées hors ligne ; pas le code.
- **F10-Q4 = Q140 (Samuel, argent)** : la vue partagée est ouverte par toute personne qui a le lien ; une carte Google y ferait un chargement facturé par visite, sans plafond par voyage. Faut-il une carte dans la vue partagée (handover § 6 : « lecture seule de 11 et 12 »), et avec quel plafond ? F10 la livre sans carte. Bloque : la carte de la vue partagée ; pas F10.
- **F10-Q5 = Q141 (UX/UI)** : rendus et textes non maquettés : écran 15 (maquetté, PNG absent, Q12), indicateur et bandeau hors ligne, bandeau `quai` des rappels, blocs « En ce moment », « Ensuite » et « Demain », lien « Aujourd'hui · J{n} » du Séjour, page de repli, feuille « Partager ton voyage » (états, confirmation, mention d'affichage unique), vue partagée (wireframe seulement : mention de lecture seule, « Début de journée » et « Fin de journée », page 404), icônes du manifeste (aucune icône d'application n'existe ; le logo est un texte, handover § 17) et couleurs de thème. Bloque : validation visuelle de F10, pas le code.
- **F10-Q6 = Q142 (Tech Lead, Sécurité)** : (1) copie hors ligne sur un appareil partagé : faut-il l'effacer à la déconnexion (B3) ou offrir « Retirer de cet appareil » ? (2) le jeton est dans le chemin de `/p/[token]` : les journaux d'accès de l'hébergeur (Vercel) le contiennent ; faut-il un jeton dans le fragment (`#`), lu par le navigateur, ou une durée de rétention des journaux ? (3) limite de création de liens et de consultations par jeton pour B12. Bloque : B3 et B12 ; rien en phase 0.
- **F10-Q7 = Q143 (CEO)** : découpage F10a, F10b, F10c (F10-PO-19) et ordre après F5c, T4 et F7a (`useOnline`), en tenant compte de F8 (fichiers partagés : `src/contracts`, `src/adapters`, `fr.json`, `eslint.config.mjs`) ; place du calendrier (export d'agenda, cadrage § 3.5 « Pendant le voyage », MVP) dans le backlog, absent du handover § 15. Bloque : création des tickets de code et du ticket « calendrier ».
- **F10-Q8 = Q144 (Tech Lead)** : propositions F10-TL-1 à F10-TL-11 (`Trip.timeZone` et contrats, calcul du jour dans le navigateur, adresses `R15`, `RPJ` et `R-repli`, service worker enregistré seulement par l'écran 15 et liste blanche d'interception, lieu de la copie, lint, tests avec service worker, `ShareAdapter` et jeton à empreinte, en-têtes de la vue partagée, manifeste, budget, adresse « Itinéraire »). Bloque : le démarrage du code si le Tech Lead veut trancher avant ; sinon confirmées à la revue.

Questions existantes qui touchent F10 :
- **Q50 (Product Owner)** : tranchée ici (F10-PO-14) : aucune information de logement dans la vue partagée.
- Q12 et Q59 (Samuel) : maquettes et Dossier UX absents ; le scénario « jour J, y compris hors ligne » sera confronté au plan de test.
- Q5, Q14, Q34, Q38, Q44 (Samuel, Tech Lead) : origine et conservation des données de lieux ; F10 n'enregistre ni `placeId`, ni position, ni durée de trajet.
- Q63 (Samuel) : contenu d'un voyage non débloqué ; F10 n'en préjuge pas (F10-Q2).
- Q27 (Samuel) : durées de conservation ; F10 supprime la copie de l'appareil après le voyage.
- Q56 (Samuel) : compte de mesure et consentement ; `today_opened` reste local.
- Q100 (Tech Lead) : le voyage débloqué simulé n'a pas de positions ; sans effet sur F10 (aucune carte dans la vue partagée).
- Q101 (Samuel, avec le Tech Lead) : variables des environnements Vercel ; la démonstration de la vue partagée sur Vercel utilise le jeton fixe du jeu simulé.
