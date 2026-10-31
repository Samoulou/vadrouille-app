# M5 — Retouches du programme et « À faire avant de partir » (B11 adaptée à la chaîne inversée, vraie app)

Rédaction : Product Owner · Date : 2026-10-29 · `main` relu : `a936717`, puis `56a560f` à la correction 2 (fusionné dans la branche ; porte 0141) · Ticket : #874 · Plan : `docs/plans/mvp-etapes-1-9.md`, étape 5, ligne M5-spec · Rôles des tâches qui suivent : tech-lead et sécurité (M5-TL), data si M5-TL exige une migration (M5-D), backend avec frontend (M5a à M5e), UX/UI (écrans non maquettés) · Revue : Tech Lead, Sécurité, UX/UI.

**Prérequis, dans cet ordre** :
1. cette spécification fusionnée ;
2. **décision du Tech Lead M5-TL**, qui répond aux questions T1 à T11 du § 10 (contrat `StopReport`, recherche d'un lieu à soi, versions, liste) ;
3. **avis de la Sécurité** sur S1 à S5 du § 11, dans la revue de M5-TL ou par une décision à part ;
4. la migration M5-D, seulement si M5-TL en exige une (par exemple une table des signalements) ;
5. les tâches M5a à M5e, chacune avec ses prérequis du plan (M5a attend aussi M1b ; M5e n'attend que M1a).

Le code ne commence pas avant le point 2, sauf M5e, qui ne dépend que des questions T8 et T9 : si M5-TL les tranche à part, M5e peut partir avant le reste. Si la décision M5-TL change un point de cette spécification, elle prime pour ce point.

**Écarts relevés dans le ticket et les documents**, sans effet sur le fond :
- `StopReport` n'existe pas dans `src/contracts` (seuls `TripPatch`, `PatchResult`, `ChecklistItem`, `ChecklistMoment`, `ChecklistUpdate` et les contrats de révision de F7 existent). Le handover back-end (`docs/handovers/backend.md`, l. 254) le décrit avec « motif (code), texte libre facultatif » : M5-PO-9 retire le texte libre. La ligne du handover est à aligner par la décision M5-TL (T1).
- Les décisions du Product Owner (§ 13) suivent la décision 0093 et `.claude/agents/product-owner.md` : définitives dès la fusion, sans délai de veto. Le ticket #874 demandait une fenêtre de veto de 2 jours ; la spécification s'en écarte au profit de 0093, Cette fenêtre était demandée par le ticket #874 (auteur `Samoulou`, 2026-10-29 08:36 UTC) ; l'écart est assumé au profit de 0093. Il ne bloque pas le point 2 des prérequis (décision M5-TL).
- Le plan (`docs/plans/mvp-etapes-1-9.md`, ligne M5e) ne donne à M5e que le prérequis M1a ; cette spécification la fait aussi dépendre de T8 et T9 (compteur et lignes écrites à la génération). Le plan n'est pas modifié ici : écart signalé au CEO.
- Sur la vraie app, les engagements (billets, réservations saisis à l'écran 1) sont écrits en `Day.events`, avec `commitment` et `locked: true` (`src/server/programme/assemblage.ts`, l. 275-286). La Fiche les montre en lecture seule, sans action. Le cas « déverrouiller un engagement » (Q71) ne se pose donc pas sur `api` : M5-PO-3 le ferme.

## 1. Contexte

La chaîne inversée écrit le programme de la vraie app depuis M1a (0136) : version 1 en `trip_versions`, 8 propositions de l'aperçu en `proposals`, bons plans de l'IA en lignes `checklist_items`. Les tâches suivantes changent le programme par une version nouvelle : M1b (révision après « Pas pour moi », 0126), M1c (voyage complet) et M1g (remplacer une étape par une autre proposition déjà vérifiée, ticket #869, en cours).

Ce qui existe aujourd'hui, relevé sur `a936717` :

| Retouche | Contrat et base | Écrans | Site d'essai (adaptateur `prototype`) | Vraie app (`api`) |
|---|---|---|---|---|
| Verrou | `Stop.locked`, opérations `lock` et `unlock` de `TripPatch` (`src/contracts/patch.ts`) ; R3 du moteur (B5-PO-11) | Fiche (écran 13) : bouton « Verrouiller » (`aria-pressed`), mention « Étape verrouillée : … », toasts « Étape verrouillée. » et « Verrou retiré. » (`src/i18n/fr/sejour.json`) | Verrou tenu **en mémoire** dans `TripShell` (`src/features/sejour/programme.ts`, `locks`), perdu au rechargement | Même état en mémoire ; aucune écriture |
| Versions | `trip_versions` en ajout seulement (`snapshot`, `patch`, `parent_version`, `author_kind` ∈ `user`, `engine`, `workflow`, `created_at`) ; opération `revert` (« crée une version identique », PO-5) | Toast « Annuler » 5 s après une retouche (F7a). Aucun écran « Versions » | Aucune version (programme dans `prototype.programmes`) | Version 1 (M1a) ; versions suivantes par M1b, M1c, M1g (`src/server/versions/ecrire.ts`) |
| Signalement | Aucun contrat (`StopReport` décrit par le handover seulement) | Aucun bouton : « « Signaler une erreur » vient après B11 » (`StopSheet.tsx`, l. 48) ; roadmap, ligne 12 | Rien | Rien |
| Lieu à soi | Opération `add` de `TripPatch` (`name` saisi, 80 caractères au plus, `ADDED_STOP_NAME_MAX` ; `placeId` facultatif) ; `PlaceSearchResult` et `searchPlaces` décrits par le handover | Écran « Ajouter un lieu » (`/voyages/[id]/jour/[n]/ajouter`, F7c) sur `mock`, avec le jeu simulé | Rien | Rien : aucune recherche de lieu |
| Liste « À faire avant de partir » | `ChecklistItem` (`id`, `label`, `when`, `done`, `bookingUrl`, `sponsored`, `stopId`) ; table `checklist_items` (`kind` ∈ `reservation`, `ticket`, `other`, absent du contrat) ; `toggleChecklistItem` (B6b, `src/server/voyages/a-faire.ts`), **non branché sur l'écran 11** (B6-PO-14) | Séjour : titre, compteur « {n} réservations à faire », lignes cochables (`ChecklistRow`) | Lignes = bons plans de l'IA (`assemblage.ts`, l. 310), cochage **en mémoire** | Lignes = bons plans de l'IA (0136 § 3.3), cochage en mémoire ; lignes filtrées avant le déblocage (`servisAvantDeblocage`) |

Deux faits pèsent sur les règles qui suivent :
1. **Le compteur ment déjà.** `countToReserve` (`src/contracts/values.ts`, l. 56) compte toutes les lignes non faites. Sur la chaîne inversée, ce sont des bons plans (« Prends un pass de transport »), pas des réservations. M5-PO-13 corrige le compte.
2. **Le nom d'un lieu à soi ne peut venir que de la personne.** La chaîne inversée n'a pas de recherche web, donc pas de nom maison (`suggestedName`, F7-TL-1). Sur `api`, le champ « Nom dans ton programme » est donc toujours vide à l'ouverture (F7-PO-10, M5-PO-10), sauf pour une idée de « Surprends-moi ».

## 2. Ce que la personne voit, tâche par tâche

| Tâche | Ce que Samuel voit sur la vraie app (adaptateur `api`) |
|---|---|
| **M5a — Verrou** | Sur un voyage débloqué, il verrouille une étape depuis sa fiche, recharge la page : le verrou est toujours là. Un remplacement, un ajout, un déplacement ou la révision après le tri ne touchent pas l'étape verrouillée. |
| **M5b — Versions** | Depuis le Séjour, « Versions du programme » liste ses retouches, la plus récente en haut. Il choisit une version, voit ce qui change, puis « Appliquer » : le programme revient à cette version, et le toast « Annuler » permet de revenir en arrière. |
| **M5c — Signaler une erreur** | Depuis la fiche d'une étape, « Signaler une erreur » ouvre une feuille avec cinq motifs. Il en choisit un, « Envoyer » : « Merci, c'est noté. » Pour un lieu fermé, la feuille propose « Remplacer ». Son programme ne change pas. |
| **M5d — Lieu à soi** | Sur la Journée, « Ajouter un lieu », il tape un nom, « Rechercher », choisit un résultat, écrit le nom qu'il veut voir, choisit un moment libre, voit l'effet, « Appliquer ». Le lieu apparaît verrouillé, avec le nom qu'il a écrit. |
| **M5e — À faire avant de partir** | Dans le Séjour, la liste montre les réservations à faire (une par étape « À réserver »), ses billets déjà pris (cochés) et les bons plans. Il coche une ligne, recharge : elle reste cochée. Le compteur ne compte que les réservations. |

## 3. Verrou du voyage (M5a)

**Qui.** La personne propriétaire du voyage et un membre de son organisation (rôle `member`, « conseiller » du handover, l. 186), comme les autres retouches. La vue partagée (`/p/[token]`) n'a aucune action.

**Quand.** Sur un voyage débloqué seulement (M5-PO-1), sur une étape du programme (`DayLineItem` de type `stop`) d'une journée servie. Jamais sur un événement de `Day.events` (engagement ou événement proposé : déjà en lecture seule) ni sur une ligne `free`, `openMeal` ou `terminus`. Le bouton est le même que sur `mock` (`aria-pressed`). Avant le déblocage, la fiche ne montre pas le bouton « Verrouiller » (M5-PO-1, sous Q88).

**Effet.**
- Verrouiller ou déverrouiller crée une version (opération `lock` ou `unlock`, seule dans son patch quand la personne la demande depuis la fiche, `author_kind = 'user'` ; seule autre combinaison prévue : `add` suivi de `lock`, § 6, sous T11). Rien d'autre ne change dans le programme. Le toast reste celui de `mock` (« Étape verrouillée. » ou « Verrou retiré. »), sans bouton « Annuler » : le geste inverse suffit (F5-PO-10, inchangé).
- Une étape verrouillée n'est **jamais** remplacée, déplacée, décalée ni retirée par une écriture du serveur : remplacement (M1g), ajout (M5d), déplacement, révision après le tri (M1b), voyage complet (M1c). **Seule exception, nommée : le retour à une version (M5b, M5-PO-2)**, ci-dessous. Le test R3 de B5 (`validation: R3 étapes verrouillées inchangées`, définition de B5-PO-11 : nom, jour, heures, `placeId`) est rejoué sur chacun de ces chemins. Une écriture qui la modifierait est refusée en entier, sans version.
- « Remplacer » et « Déplacer » restent absents de la fiche d'une étape verrouillée (F7-PO-1, inchangé).
- **Exception du retour à une version** (M5-PO-2). Le retour (`revert`) recopie l'instantané de la version choisie sans replanifier ni revalider (`src/domain/patch.ts`) : il peut déplacer ou retirer une étape verrouillée, ou retirer un verrou, et il rétablit les verrous de la version choisie. C'est admis parce que c'est un geste explicite de la personne, toujours précédé de l'aperçu « Ce qui change » (§ 4), qui affiche la phrase fixe « Ce retour peut toucher des étapes verrouillées. » dès que la version actuelle a au moins une étape verrouillée. Aucune autre écriture ne bénéficie de cette exception.
- **Engagements** (M5-PO-3) : toujours verrouillés, jamais déverrouillables. Leur fiche garde sa lecture seule et reçoit la mention « Déjà réservé : cette étape ne bouge pas. ».

**Concurrence.** Toute écriture porte `baseVersion` (handover, « Concurrence ») : `version_conflict` si le programme a changé, avec le message du § 9 et le rechargement de la fiche.

## 4. Versions (M5b)

**Ce qui crée une version** : la génération (version 1, M1a), la révision après le tri (M1b), le voyage complet (M1c), et chaque retouche appliquée par la personne : remplacement (M1g), ajout (M5d), déplacement, verrou, retrait du verrou, retour à une version. Une version n'est jamais modifiée ni supprimée, sauf par la suppression du compte (`purge_organization_data`, écart C16 du handover).

**Écran « Versions du programme »** (non maquetté : rendu UX/UI ; adresse proposée `/voyages/[id]/versions`, forme au Tech Lead, T5) :
- entrée : lien « Versions du programme » en bas du Séjour, sur un voyage débloqué seulement (M5-PO-1) ;
- liste de la plus récente à la plus ancienne, par pages de 20 (« Voir les versions plus anciennes »). Chaque ligne : un libellé, la date et l'heure de l'appareil (« mar. 28.10, 14:05 »), et « Version actuelle » sur la première ;
- libellé composé à l'affichage depuis le patch et les noms **du programme** (`Stop.name` : nom de l'IA ou nom saisi par la personne, jamais un nom Google), jamais stocké (handover § 9 : aucun texte d'interface dans les données). Textes au § 9 ;
- sur chaque version **proposée au retour** (M5-PO-6) : « Revenir à cette version ».

**Retour à une version** :
1. « Revenir à cette version » ouvre un aperçu : « Ce qui change » entre la version actuelle et la version choisie (`ChangeSet` de F7), puis « Appliquer » et « Annuler ». **Avec le contrat actuel**, l'aperçu montre ce que `changements()` produit pour un retour (`src/domain/patch.ts` : appel avec une liste de cibles vide) : des changements `moved`, `added`, `segment`, `budget` et `unchanged`, **jamais `replaced`**. Il affiche en plus la phrase fixe « Ce retour peut toucher des étapes verrouillées. » dès que la version actuelle a au moins une étape verrouillée (exception du § 3). Nommer une étape retirée et un verrou changé demande une extension de `Change` : question T5 au Tech Lead ; tant qu'elle n'a pas de réponse, l'aperçu s'en tient à ce qui précède. Rien ne change sans cet aperçu (principe produit 5).
2. « Appliquer » écrit une version nouvelle, copie identique du programme de la version choisie (opération `revert`, seule dans son patch, `1 ≤ toVersion < baseVersion`), puis ramène au Séjour avec le toast « Programme rétabli. » et « Annuler » pendant 5 secondes (F7-PO-1). « Annuler » écrit à son tour un `revert` vers la version d'avant.
3. La liste « À faire avant de partir » suit le programme rétabli selon les règles du § 7.4. Les cases cochées ne sont jamais décochées par un retour.

**Limites** (M5-PO-6) :
- on ne revient qu'à une version écrite **après le déblocage**. Les versions d'avant (aperçu, révision après le tri faite avant le paiement) sont listées sous « Avant le déblocage », sans bouton. Motif : sous la recommandation de Q638 (encore ouverte), la version 1 laisse sans vérification les lieux hors de l'aperçu ; y revenir rétablirait des étapes « À confirmer » après le voyage complet. Si Samuel répond à Q638 « tout le programme vérifié avant le paiement », le motif tombe, mais la règle reste (aucun retour avant le paiement, M5-PO-1) ; seule la mention du motif change ;
- la version actuelle n'a pas de bouton ;
- aucun nombre maximal de versions : `trip_versions` est en ajout seulement, et une version ne coûte qu'une ligne. Si la taille pose problème, le Tech Lead le dit (T5).

## 5. Signaler une erreur sur une étape (M5c)

**Où.** Fiche d'une étape du programme (écran 13), action « Signaler une erreur », après les autres actions. Sur toute étape du programme, débloqué ou non (un signalement ne modifie pas le voyage, M5-PO-1), sauf les engagements, les événements de `Day.events` et les lieux à soi (la personne les a saisis).

**Feuille « Signaler une erreur »** (non maquettée : rendu UX/UI, sur le modèle de la feuille « Déplacer ») :
- titre de niveau 1 « Signaler une erreur », focus dessus ;
- choix exclusif obligatoire (`role="radiogroup"`) parmi **cinq motifs fermés** (M5-PO-8) :

| Code proposé (forme : T1) | Texte |
|---|---|
| `closed` | Fermé ou n'existe plus |
| `hours` | Horaires faux |
| `wrongPlace` | Mauvais lieu ou mauvaise adresse |
| `price` | Prix faux |
| `other` | Autre erreur |

- **aucun champ de texte libre** (M5-PO-9) ;
- « Envoyer » (`Button` `primary`) et « Annuler ». Sans motif : « Choisis ce qui ne va pas. » (`role="alert"`).

**Ce que le signalement déclenche** (M5-PO-7) :
- il **enregistre** le motif, l'étape et le voyage (forme et lieu de stockage : T1 et T2), sous l'organisation de la session ;
- il ne crée **aucune version** et ne change **rien** au programme, aux badges ni à la liste ;
- il n'appelle **ni modèle, ni Google** ; il n'entre dans **aucun prompt**, ni de ce voyage ni d'un autre (pas d'apprentissage automatique sur les signalements dans ce lot) ;
- il émet un événement de journal ajouté à la liste fermée `LOG_EVENTS` (`src/server/log.ts`), avec le seul code du motif ; son nom et ses champs relèvent de la Sécurité (S1) ;
- la feuille se ferme sur « Merci, c'est noté. » (`role="status"`) et le focus revient à « Signaler une erreur ». Pour le motif `closed`, si l'étape n'est pas verrouillée et que le voyage est débloqué, la confirmation propose aussi « Remplacer cette étape » (lien vers l'écran 14, M1g).

**Règles** :
- idempotent par `requestId` ; un second signalement du même motif sur la même étape du même voyage ne crée pas de doublon et reçoit la même confirmation ;
- au plus 20 signalements par voyage et par jour (M5-PO-11) ; au-delà : « Tu as déjà beaucoup signalé aujourd'hui. Réessaie demain. » ;
- ce que le studio fait des signalements (file de vérification humaine du cadrage, § 3.5 « Qualité et exploitation ») est hors périmètre ; leur conservation et leur lecture relèvent de la Sécurité (S1) et de Samuel (question 4).

## 6. Lieu à soi (M5d)

**Entrées** : celles de F7-PO-8 sur un voyage débloqué (M5-PO-1) : lien « Idées » d'un temps libre, « Choisir » d'un repas pas encore choisi, « Ajouter un lieu » sous la `DayLine`, « Ajouter à ma journée » de « Surprends-moi » si la journée a une idée. Écran existant `/voyages/[id]/jour/[n]/ajouter` (F7c), branché sur `api`.

**Recherche par nom** (M5-PO-12 ; forme technique : T3) :
- champ « Lieu à ajouter » et « Rechercher », comme F7-PO-9 : 2 à 80 caractères (espaces retirés), aucune recherche à la frappe ;
- côté serveur : une requête Text Search **par le texte saisi**, orientée vers la ville du séjour de la journée choisie, qui rend au plus 5 résultats. Pour un voyage à plusieurs villes, c'est la ville où l'on dort ce jour-là, la règle de rangement des jours de `specs/M4-plusieurs-villes.md` (M4-PO-11, #872, en revue), citée et non redéfinie ici. Si M4 change cette règle, ou tant qu'elle n'est pas fusionnée, la recherche vise la ville du séjour qui couvre la date de la journée (`stays`), ce qui revient au même pour un voyage à une ville. Seul le `placeId` d'un résultat est gardé, et seulement s'il est ajouté au programme ;
- chaque résultat affiche le nom et l'adresse courte que rend Google, avec la mention « Données de lieux : Google » (`PlacesAttribution`). Ces textes sont **chargés pour l'écran et jamais stockés** : ni en base, ni dans le journal, ni dans l'adresse, ni dans un stockage du navigateur, ni dans un prompt. Les résultats ne sont jamais posés sur la carte (F7, règle d'or 3) ;
- « Aucun lieu trouvé. Essaie un autre nom. » sans résultat ; « La recherche n'est pas disponible pour le moment. Réessaie plus tard. » sur `provider_error` ou `cost_cap_reached` ;
- **limites** (M5-PO-11, montants à Samuel, question 1) : 20 recherches par voyage et par jour, et le débit du limiteur existant (5 recherches par minute et par session, forme : T3). Au-delà : « Tu as fait beaucoup de recherches aujourd'hui pour ce voyage. Réessaie demain. » ;
- **coût** (question 1 de Samuel) : au prix de la table de `prototype/config/prix-google.json`, une recherche qui rend des noms coûte de l'ordre de 0,032 USD (`places_text_search_pro`, 32 USD pour 1 000, 5 000 gratuites par mois). 20 recherches par jour font au plus 0,64 USD par voyage et par jour, hors gratuité. Aucune fiche n'est demandée après le choix (le `placeId` suffit).

**Nom dans ton programme** (M5-PO-10) :
- champ obligatoire, 1 à 80 caractères, **vide à l'ouverture**, sans texte indicatif, sans bouton qui recopierait le nom Google (F7-PO-10, décision 0018 § 12) ;
- la seule exception est `?idee=` : prérempli par `SurpriseIdea.name` (contenu maison), modifiable ;
- le nom n'est jamais prérempli par le nom Google, ni par la requête saisie ;
- le serveur écrit `Stop.name` depuis ce champ seulement, et aucun nom Google ne lui parvient dans la demande (T3). Il ne compare pas le nom saisi au nom affiché : la personne a le droit de recopier le nom elle-même (F7 : « c'est alors sa saisie »).

**Moment et durée** (M5-PO-12) :
- un moment libre seulement (F7-PO-11) : temps libre ou repas pas encore choisi ;
- **durée** : celle du moteur pour un `add`, la durée prévue de son type dans la configuration (`dureesParDefaut`, `src/server/config/moteur.json` : aujourd'hui 90 min pour une activité, 75 min pour un déjeuner, 90 min pour un dîner) ;
- **heure proposée** (le moteur ne la choisit pas : `add` exige un `time` fourni par l'appelant) : le début du **premier temps libre du jour choisi qui dure au moins la durée prévue** du type, ce temps libre commençant à la fin de l'étape précédente. Pour un repas pas encore choisi, l'heure de ce repas. Si l'entrée désigne un moment (`de` et `a`, ou `de` et `repas`) assez long, c'est lui ;
- **sinon** (aucun temps libre assez long) : aucune heure n'est proposée, et la personne choisit dans la liste des temps libres du jour (« Temps libre {from} – {to} ») ; l'heure est alors le début du temps libre choisi ;
- **essai à blanc** : « Voir l'effet » demande l'aperçu au moteur sans rien écrire. S'il refuse (`no_option`), l'écran affiche « Pas de place ce jour-là, choisis un autre jour. » et n'écrit rien ;
- `kind` : `meal` si le moment est un repas, `activity` sinon ;
- l'aperçu montre l'étape, « Ce qui change » et « Ce qui ne bouge pas », comme F7. Les temps de trajet viennent du relecteur de la lecture (B8b, 0074) ; si l'aperçu ne peut pas les donner sans appel payant, il dit « Temps de trajet calculé après l'ajout » (choix : T4).

**Étape écrite** (M5-PO-12) : l'opération `add` de `TripPatch` (objet strict, sans champ `locked`) écrit une étape **non verrouillée** (`locked: false`, `src/domain/patch.ts`), avec le `name` saisi, le `placeId` du résultat, `kind`, jour et heure. Pour que le lieu à soi arrive verrouillé (le lieu est un choix de la personne : aucune écriture du serveur ne le retire ensuite, § 3), le patch d'ajout est la séquence **`[add, lock]`** sur le même `stopId`, dans un seul patch et une seule version. La forme revient au Tech Lead (T11) : cette séquence, ou un nouveau type d'opération, ou un champ de `add`. L'étape est écrite sans `reason`, sans `source`, sans badge, sans `tip`. Aucune ligne « À faire » n'est créée pour lui. La fiche dit « Ajouté par toi. » si le contrat permet de le savoir (T6). Après « Appliquer » : toast « Lieu ajouté. » et « Annuler » 5 s (F7-PO-1).

**Hors ligne, erreurs, mesure** : comme F7 (`StatusBanner` `offline`, `version_conflict`, mesure `place_added` sans nom ni `placeId` : c'est un événement de **mesure** (`src/analytics`), pas un événement du journal serveur `LOG_EVENTS`).

## 7. Liste « À faire avant de partir » (M5e)

### 7.1 Contenu, écrit à la génération (M5-PO-13)

Trois sortes de lignes, dans cet ordre à l'écran :

| Sorte | D'où elle vient | `kind` (base) | Libellé | Moment | Lien | État |
|---|---|---|---|---|---|---|
| Réservation | Chaque étape du programme qui porte l'exception `toReserve` (`aReserver` de l'IA) | `reservation` | stocké : le seul nom de l'étape (`Stop.name`) ; affiché : « Réserver : {nom} », préfixe composé à l'écran (forme : T9) | `beforeDeparture` | `stopId` de l'étape | non faite |
| Déjà réservé | Chaque engagement saisi (`Day.events` avec `commitment`) | `ticket` ou `reservation` (selon `commitment`) | « {libellé de l'engagement} » (saisie de la personne) | `beforeDeparture` | `stopId` de l'événement | **faite** |
| Bon plan | Les bons plans de l'IA (0136 § 3.3, inchangé) | `other` | le texte du bon plan | `beforeDeparture` | aucun | non faite |

- Réservations et engagements dans l'ordre du programme ; bons plans dans l'ordre de l'IA (0136 § 3.3). Identifiants stables, dérivés de l'exécution et du rang (forme : T9).
- Le conseil pratique d'une étape (`facts.tip`) reste dans sa fiche : il n'est pas copié dans la liste (il doublerait la ligne de réservation, et la fiche le montre déjà).
- Aucun lien de réservation (`bookingUrl`) ni lien rémunéré dans ce lot : la ligne mène à l'étape, dont la fiche a déjà « Site officiel » (0121, 0122).
- Avant le déblocage, la lecture ne sert que les lignes des journées de l'aperçu (`servisAvantDeblocage`, 0136 § 1.7, inchangé).

### 7.2 Compteur

« {n} réservations à faire » ne compte que les lignes **Réservation** non faites (pas les bons plans ni les engagements). Sans réservation à faire, le compteur n'est pas affiché. La forme (champ `kind` dans le contrat, ou autre) revient à T8.

### 7.3 Cases

- Cocher ou décocher une ligne appelle `toggleChecklistItem` sur `api` (B6b, existant), branché sur l'écran 11 par M5e : la ligne reste cochée après un rechargement. État final, idempotent, **hors des versions** (aucune version, aucun « Annuler » : décocher suffit).
- L'état s'affiche dès le geste ; si l'enregistrement échoue, la case revient à son état d'avant et « Impossible d'enregistrer. Réessaie. » s'affiche (`role="alert"`). Hors ligne : cases désactivées, décrites par le bandeau `offline`.
- La mesure `checklist_item_done` (`src/analytics`, événement de mesure et non de journal) reste envoyée au cochage seulement (0015 § 6).
- Avant le déblocage, les lignes servies sont cochables (cocher ne modifie pas le programme).
- La personne n'ajoute ni ne supprime de ligne dans ce lot.

### 7.4 Après une retouche (F7-PO-19 sur `api`)

Dans la **même écriture** que la version nouvelle (forme : T7), pour toute écriture du programme (remplacement, ajout, déplacement, retour à une version, révision après le tri, voyage complet) :
- une étape retirée du programme retire ses lignes **non faites** ; ses lignes faites restent, sans lien (`stopId` retiré) ;
- une étape nouvelle avec `toReserve` ajoute sa ligne de réservation, non faite ;
- une étape déplacée garde ses lignes ;
- l'aperçu le dit dans « Ce qui change » (variante `checklist` de F7d) ;
- aucune ligne ne désigne jamais une étape absente de la version courante (le contrôle `checklist_orphan` de la lecture reste vrai).

## 8. Écrans touchés

| Écran | Changement | Rendu |
|---|---|---|
| 11 Séjour (`/voyages/[id]`) | Liste écrite par la génération, cochable sur `api` ; compteur des réservations ; lien « Versions du programme » (débloqué) | Existant ; lien : UX/UI |
| 12 Journée (`/voyages/[id]/jour/[n]`) | « Ajouter un lieu » branché sur `api` (débloqué) ; surlignage et toast de F7 | Existant (F7c) |
| 13 Fiche étape | « Verrouiller » écrit sur `api` (débloqué) ; « Signaler une erreur » ; mention « Déjà réservé » sur un engagement ; « Ajouté par toi. » (T6) | Bouton existant ; feuille du signalement et mentions : UX/UI |
| Ajouter un lieu (`…/jour/[n]/ajouter`) | Recherche Text Search sur `api`, nom toujours vide, moment, aperçu | Existant (F7c) |
| Versions du programme (nouveau, `/voyages/[id]/versions` proposé) | Liste, aperçu du retour, « Appliquer » | Non maquetté : UX/UI |
| 14 Remplacer | Inchangé par M5 (M1g) ; reçoit seulement le lien de la confirmation d'un signalement `closed` | — |

Chaque nouvelle page s'inscrit à l'inventaire des routes (`tests/e2e/routes.ts`, F12-PO-15). Tokens Ligne, accessibilité et vocabulaire selon `docs/handovers/frontend.md` (§ 10 : « Verrouiller », « Appliquer / Annuler », « À réserver », « Déjà réservé », « À confirmer » ; jamais « Supprimer une étape » ni « OK »).

## 9. Textes (français, provisoires, à valider par UX/UI)

Clés dans `src/i18n/fr/sejour.json` et `src/i18n/fr/revision.json` (noms des clés libres).

| Où | Texte |
|---|---|
| Fiche, engagement | Déjà réservé : cette étape ne bouge pas. |
| Fiche, lieu à soi | Ajouté par toi. |
| Fiche, action | Signaler une erreur |
| Feuille de signalement, titre | Signaler une erreur |
| Feuille, motifs | Fermé ou n'existe plus · Horaires faux · Mauvais lieu ou mauvaise adresse · Prix faux · Autre erreur |
| Feuille, boutons | Envoyer · Annuler |
| Feuille, sans motif | Choisis ce qui ne va pas. |
| Confirmation | Merci, c'est noté. |
| Confirmation, motif `closed` | Remplacer cette étape |
| Plafond des signalements | Tu as déjà beaucoup signalé aujourd'hui. Réessaie demain. |
| Recherche, plafond | Tu as fait beaucoup de recherches aujourd'hui pour ce voyage. Réessaie demain. |
| Recherche, indisponible | La recherche n'est pas disponible pour le moment. Réessaie plus tard. |
| Aperçu d'ajout, trajets | Temps de trajet calculé après l'ajout |
| Ajout refusé par le moteur (`sejour.json`, clé proposée `ajouter.pasDePlace`) | Pas de place ce jour-là, choisis un autre jour. |
| Aperçu du retour, version actuelle avec une étape verrouillée | Ce retour peut toucher des étapes verrouillées. |
| Séjour, lien | Versions du programme |
| Versions, titre | Versions du programme |
| Versions, actuelle | Version actuelle |
| Versions, groupe | Avant le déblocage |
| Versions, pages | Voir les versions plus anciennes |
| Versions, action | Revenir à cette version |
| Libellés de version | Programme préparé · Programme ajusté après ton tri · Voyage complet · {ancien} remplacé par {nouveau} · {nom} ajouté · {nom} déplacé au jour {n} · {nom} verrouillé · Verrou retiré : {nom} · Retour à la version du {date} |
| Toast du retour | Programme rétabli. |
| Conflit de version | Ton programme a changé entre-temps. Regarde la dernière version, puis réessaie. |
| Case non enregistrée | Impossible d'enregistrer. Réessaie. |
| Liste, hors ligne (Ajout M5e, accepté par l'UX/UI à la revue de #908) | Tu es hors ligne. Cocher une ligne demande une connexion. |
| Liste, réservation | Réserver : {nom} |

## 10. Propositions au Tech Lead (décision M5-TL, avant le code)

- **T1 — Contrat `StopReport`.** *Proposition* : objet strict `{ tripId, stopId, reason, requestId }`, `reason` dans l'énumération fermée du § 5 (`closed`, `hours`, `wrongPlace`, `price`, `other`) ; **aucun champ de texte** (M5-PO-9 : amende la ligne 254 du handover) ; réponse sans donnée ; erreurs `unauthenticated`, `not_found`, `validation_failed`, `rate_limited`. Le nom de l'action (`reportStop` du handover) et les codes restent au Tech Lead.
- **T2 — Stockage des signalements.** Table propre (`stop_reports` : organisation, voyage, étape, `placeId` de l'étape au moment du signalement, motif, `request_id`, date ; RLS, effacée avec le compte), ou journal seulement ? *Proposition* : une table, donc une tâche M5-D (rôle data) avant M5c. Le `placeId` permet de regrouper les signalements d'un même lieu sans stocker de nom.
- **T3 — Recherche d'un lieu à soi.** SKU et masque de champs (proposition : Text Search `places.id,places.displayName,places.shortFormattedAddress`, au plus 5 résultats), orientation vers la ville (cache `place_coordinates` du logement, 30 jours, 0027, ou centre de la ville), compteurs et forfait (réutiliser les compteurs de M1f et le crochet `accesReelApi` de 0141, fusionnée : compteurs `autocomplete_daily_counts`, débit par le limiteur, coûts dérivés ?), débit par session, double simulé en CI. **Forme de la demande d'ajout** : elle ne porte que le texte saisi, l'identifiant opaque du résultat (`resultId`), le jour, le moment et le nom saisi ; le serveur retrouve le `placeId` côté serveur (aucun nom Google ne revient du navigateur).
- **T4 — Temps de trajet de l'aperçu d'ajout.** Une relecture Routes dans le forfait de la retouche, ou « Temps de trajet calculé après l'ajout » (aucun appel, durées relues à la lecture par B8b) ? *Préférence du Product Owner* : pas d'appel tant que Q637 n'est pas tranchée.
- **T5 — Versions.** Contrat de la liste (`TripVersionSummary` : numéro, date, sorte, opérations utiles au libellé, proposée au retour ou non), adresse de l'écran, pagination, aperçu d'un `revert` (`RevisionPreview` réutilisé ?), et la règle « après le déblocage » (M5-PO-6) : comment la lecture sait quelles versions précèdent le droit `tripUnlocked`. **Aperçu d'un `revert`** : `ChangeSchema` n'a ni étape « retirée » ni verrou ; faut-il l'étendre (par exemple `removed` et `lock`, `unlock`), par une PR de contrat d'abord, et comment `changements()` calcule-t-il le diff entre la version courante et la version visée d'un `revert` (qui ne passe pas par le moteur) ? En attendant, l'aperçu donne seulement ce que `changements()` produit pour un retour (`moved`, `added`, `segment`, `budget`, `unchanged`), plus la phrase fixe « Ce retour peut toucher des étapes verrouillées. » (§ 4). Si le Tech Lead étend `Change`, l'aperçu pourra compter et nommer ces étapes, par un calcul fait côté serveur entre les deux instantanés. `lock` et `unlock` restent-ils des versions (proposition : oui, comme le contrat de B2) ?
- **T6 — Marque d'un lieu à soi.** La fiche doit dire « Ajouté par toi. » et M8b (« adresse découverte ») en aura besoin. Champ de contrat (par exemple `Stop.addedBy: "person"`), ou déduction depuis le patch `add` ? Si un champ est retenu, PR de contrat d'abord.
- **T7 — Liste et versions dans une même écriture.** Les règles du § 7.4 s'appliquent dans la transaction qui écrit la version (`src/server/versions`), pour tous les écrivains (M1b, M1c, M1g, M5b, M5d). Une fonction pure de `src/domain` (lignes avant, programme après → lignes après) ? Comment M1g, en cours, s'y raccorde ?
- **T8 — `kind` dans le contrat `ChecklistItem`.** Le compteur (M5-PO-13) doit distinguer réservations, billets et bons plans. Ajouter `kind` au contrat (la colonne existe), ou un autre moyen ?
- **T9 — Lignes écrites à la génération.** Identifiants stables des lignes de réservation et d'engagement (dérivés de l'exécution et du rang, comme 0136 § 3.3), écriture dans la transaction de la version 1 et de la version du voyage complet, et sort des lignes existantes d'un voyage déjà écrit par M1a (aucune reprise : proposition).
- **T10 — Rôles et refus côté serveur.** Les retouches (verrou, ajout, retour) sont refusées côté serveur sur un voyage non débloqué (M5-PO-1), et un `unlock` d'un engagement est refusé (M5-PO-3), pas seulement masqués à l'écran. Rôles admis : `owner` et `member`. Aucun code de `API_ERROR_CODES` ne dit « voyage non débloqué » : nouveau code (PR de contrat d'abord) ou code existant, au choix du Tech Lead.
- **T11 — Lieu à soi verrouillé à l'ajout.** `add` n'a pas de champ `locked` et le moteur écrit `locked: false`. *Proposition* : un seul patch `[add, lock]` (même `stopId`), seule combinaison admise où `lock` n'est pas seule. Question : `lock` seule dans son patch hors de ce cas, ou un nouveau type d'opération (par exemple `addLocked`) ? Le contrat `TripPatch` et le moteur suivent la réponse.

## 11. Questions à la Sécurité (avant M5c et M5d)

- **S1 — Signalements.** Contenu stocké (T2 : motif, étape, `placeId`, voyage, date, aucun texte), durée de conservation (avec le voyage, effacé avec le compte), qui les lit (le studio, en comptes agrégés ?), et événement de journal ajouté à la liste fermée `LOG_EVENTS` (`src/server/log.ts`) par M5c : nom et champs (motif seul ?). M5d ajoute-t-il aussi un événement de journal pour la recherche (compteurs seulement, jamais la requête) ?
- **S2 — Texte saisi envoyé à Google.** La requête d'un lieu à soi est un texte libre de la personne envoyé à Google Places. Même verdict que l'autocomplétion de la ville (0129, et 0141 fusionnée : compteurs, débit, crochet `accesReelApi`) ? La requête n'est ni stockée ni journalisée.
- **S3 — Noms et adresses Google à l'écran.** Chargés pour l'écran, jamais stockés, jamais journalisés, jamais dans un prompt, jamais sur la carte : quels tests à valeurs sentinelles exiges-tu (sur le modèle de `tests/unit/p0/sentinelles-google.test.ts`) ?
- **S4 — Nom saisi.** `Stop.name` d'un lieu à soi est un texte libre de la personne (80 caractères), stocké dans la version et relu par la vue partagée. Faut-il une règle de forme de plus que `ADDED_STOP_NAME_MAX` (balises, URL : `texteMaison`) ? Entre-t-il dans le prompt d'une révision suivante (M1b) ? *Proposition* : jamais dans un prompt dans ce lot.
- **S5 — Limites anti-abus.** 20 signalements et 20 recherches par voyage et par jour (M5-PO-11), débit par session : suffisant pour la préversion `mvp-essai` ?

## 12. Critères d'acceptation

Chaque critère est vérifié par un test nommé dans la PR de sa tâche. Les tests de base de données tournent en CI (`pnpm test:db`). Tout se fait en composition **simulée** : aucun appel réel, barrière B9-TL-8 fermée.

**M5a — Verrou**
1. `verrou: verrouiller écrit une version` : sur `api`, voyage débloqué, `lock` crée la version `n + 1` (`author_kind = 'user'`, patch `{ requestId, baseVersion: n, operations: [{ op: "lock", stopId }] }`) ; après rechargement, la fiche montre l'étape verrouillée.
2. `verrou: une étape verrouillée survit à toute écriture` : le test R3 de B5 est rejoué sur le remplacement (M1g), l'ajout (M5d), le déplacement, la révision après le tri (M1b) et le voyage complet (M1c) : nom, jour, heures et `placeId` inchangés ; une écriture qui la modifierait est refusée sans version. **Exception nommée** : `revert` (critère 8).
3. `verrou: refusé avant le déblocage` : sur un voyage non débloqué, `lock` est refusé côté serveur, sans écriture, et la fiche ne montre pas « Verrouiller ».
4. `verrou: un engagement ne se déverrouille pas` : `unlock` sur un engagement est refusé sans écriture ; sa fiche montre « Déjà réservé : cette étape ne bouge pas. ».
5. `verrou: conflit de version` : une demande sur une `baseVersion` dépassée rend `version_conflict`, sans écriture.

**M5b — Versions**
6. `versions: liste de la plus récente à la plus ancienne` : après trois retouches, l'écran liste 4 versions au moins, la première marquée « Version actuelle », libellés composés depuis `Stop.name`, jamais depuis un nom Google (valeurs sentinelles).
7. `versions: revenir crée une version identique` : « Revenir à cette version » puis « Appliquer » crée la version `n + 1` dont le `snapshot` est égal à celui de la version choisie (test de B5 `versions: annuler crée une version identique`, rejoué) ; aucune version n'est modifiée ni supprimée.
8. `versions: le retour est la seule exception au verrou` : une version choisie où une étape aujourd'hui verrouillée est absente, ou à une autre heure, est rétablie telle quelle par `revert` ; l'aperçu ne contient que des changements `moved`, `added`, `segment`, `budget` ou `unchanged` (jamais `replaced`) et affiche « Ce retour peut toucher des étapes verrouillées. » ; sur une version actuelle sans étape verrouillée, la phrase est absente ; aucune autre écriture (critère 2) ne passe outre le verrou. Si T5 étend `Change`, le critère est complété par la PR de contrat.
9. `versions: aperçu avant le retour` : « Ce qui change » est affiché avant « Appliquer » ; « Annuler » ne crée aucune version.
10. `versions: pas de retour avant le déblocage` : les versions écrites avant le droit `tripUnlocked` sont listées sous « Avant le déblocage », sans bouton ; un `revert` vers elles est refusé côté serveur.
11. `versions: annuler le retour` : le toast « Programme rétabli. » propose « Annuler » 5 s ; « Annuler » écrit un `revert` vers la version d'avant.

**M5c — Signaler une erreur**
12. `signalement: motifs fermés, aucun texte` : la feuille montre les cinq motifs du § 5 et aucun champ de texte ; le contrat refuse un motif inconnu et tout champ de plus (objet strict).
13. `signalement: rien ne change` : après « Envoyer », la version courante, le programme, les badges et la liste sont identiques ; aucun appel de modèle ni de Google n'est fait (doubles comptés).
14. `signalement: idempotent` : le même `requestId`, ou le même motif sur la même étape, ne crée qu'un enregistrement.
15. `signalement: jamais dans un prompt` : les tests à valeurs sentinelles des prompts (`tests/unit/ia/prompts-sentinelles.test.ts`) montrent qu'aucun motif ni aucun signalement n'entre dans une requête de modèle.
16. `signalement: plafond` : le 21e signalement du jour sur un voyage rend `rate_limited` et le texte du § 9.
17. `signalement: isolation` : une autre organisation ne peut ni signaler une étape du voyage ni lire ses signalements (`not_found`, aucune écriture).
18. `signalement: motif closed propose Remplacer` : seulement si l'étape n'est pas verrouillée et que le voyage est débloqué.

**M5d — Lieu à soi**
19. `ajouter: le nom n'est jamais prérempli par le nom Google` (C28 de F7, rejoué sur `api`) : après le choix d'un résultat, le champ « Nom dans ton programme » est vide ; l'étape écrite a le `name` saisi et le `placeId` du résultat.
20. `ajouter: aucune donnée Google stockée` : après un ajout, ni `trip_versions`, ni `checklist_items`, ni le journal, ni l'état d'un workflow ne contiennent le nom ou l'adresse sentinelle du résultat ; seul son `placeId` est écrit.
21. `ajouter: la demande ne porte aucun nom Google` : la demande d'ajout envoyée par le navigateur ne contient ni `displayName` ni adresse (T3).
22. `ajouter: heure proposée et refus` : avec `dureesParDefaut.activity` = 90, sur un jour « A 09:00 – 10:30, temps libre 10:30 – 11:15, B 11:15 – 13:00 (verrouillée), C 13:00 – 14:30, temps libre 14:30 – 18:00 », l'heure proposée pour une activité est 14:30 et l'étape écrite va de 14:30 à 16:00. Sur le même jour où D (verrouillée) occupe 14:30 – 18:00 à la place du temps libre, aucune heure n'est proposée, la liste offre « Temps libre 10:30 – 11:15 » ; le choisir puis « Voir l'effet » rend `no_option` (l'étape 10:30 – 12:00 chevaucherait B, verrouillée : refus par l'étape de contrôle des verrous du moteur, `src/domain/patch.ts`, non par `heureSure` seule), affiche « Pas de place ce jour-là, choisis un autre jour. » et n'écrit aucune version.
23. `ajouter: le lieu à soi est verrouillé` : après l'ajout, une seule version nouvelle, dont le patch est `[add, lock]` sur le même `stopId` (ou la forme retenue par T11) ; l'étape a `locked: true` et survit au critère 2.
24. `ajouter: plafond de recherche` : la 21e recherche du jour sur un voyage rend `rate_limited` sans appel ; une recherche à moins de 2 caractères n'appelle rien.
25. `ajouter: refusé avant le déblocage` : recherche et ajout refusés côté serveur sur un voyage non débloqué.
26. `ajouter: résultats jamais sur la carte` : aucun marqueur nouveau pendant la recherche ; « Données de lieux : Google » visible tant qu'un nom Google est à l'écran.

**M5e — À faire avant de partir**
27. `a-faire: lignes écrites à la génération` : sur la sortie simulée de Rome, une ligne par étape `toReserve` (libellé stocké = nom de l'étape seul, affiché « Réserver : {nom} »), une ligne faite par engagement, puis les bons plans, dans l'ordre du § 7.1, avec des identifiants stables.
28. `a-faire: compteur des réservations seulement` : le compteur vaut le nombre de lignes de réservation non faites ; il est absent sans réservation à faire.
29. `a-faire: cocher reste coché` : sur `api`, cocher une ligne puis recharger la page la montre cochée (`toggleChecklistItem`) ; un échec rétablit la case et affiche le message du § 9.
30. `a-faire: une retouche met la liste à jour` : remplacer une étape `toReserve` retire sa ligne non faite et garde une ligne faite sans lien ; une étape nouvelle `toReserve` ajoute la sienne ; jamais de ligne orpheline (`checklist_orphan`).
31. `a-faire: avant le déblocage` : seules les lignes des journées de l'aperçu sont servies (0136 § 3.5, rejoué).

**Transverses**
32. **Bout en bout** (projet Playwright `api`) : connexion par code lu dans Mailpit, voyage simulé débloqué, verrou, ajout d'un lieu à soi, retour à une version, signalement, cochage d'une ligne, rechargement : tout est conservé.
33. Accessibilité (axe) sur la feuille de signalement, l'écran « Versions du programme » et « Ajouter un lieu » ; inventaire des routes à jour.
34. `pnpm verify` vert (variante du studio : `env -u GOOGLE_MAPS_SERVER_KEY SKIP_DB_TESTS=1 pnpm verify`, tests de base de données en CI). Aucun test supprimé ni désactivé.

## 13. Décisions du Product Owner

**Définitives dès la fusion de cette spécification**, sans délai de veto (décision 0093) ; Samuel peut les remettre en cause à tout moment par une nouvelle décision. Elles seront listées dans la note de version suivante (rubrique « Décisions prises par le studio »). Elles restent dans le cadre du cadrage (§ 3.5 « Programme » : verrou, versions, signalement d'erreur, ajout d'un lieu personnel ; § 6.6) et ne touchent ni au prix, ni à l'argent, ni à l'architecture.

- **M5-PO-1 — Retouches après le déblocage, signalement toujours.** Verrou, ajout d'un lieu à soi et retour à une version ne sont permis que sur un voyage débloqué, refusés côté serveur sinon. Le signalement est permis avant et après : il ne modifie pas le voyage. C'est la règle prudente **en attendant Samuel** sur Q88 (« modification d'un voyage non débloqué ») : sa réponse peut l'élargir (question 2) sans autre changement.
- **M5-PO-2 — Une étape verrouillée ne change jamais par le serveur, sauf au retour à une version.** Aucun remplacement, ajout, déplacement, révision ni voyage complet ne la modifie ; une écriture qui le ferait est refusée en entier. **Exception nommée** : le retour à une version (`revert`), geste explicite de la personne précédé d'un aperçu (changements `moved`, `added`, `segment`, `budget`, `unchanged` de `changements()`) qui affiche « Ce retour peut toucher des étapes verrouillées. » dès que la version actuelle a une étape verrouillée (compte et noms seulement si T5 étend `Change`), rétablit la version choisie telle quelle, verrous compris. Le verrou se pose et se retire par une version, sans « Annuler » (geste inverse).
- **M5-PO-3 — Engagements (tranche Q71, partie Product Owner).** Un engagement reste verrouillé et ne se déverrouille pas. Sa fiche dit « Déjà réservé : cette étape ne bouge pas. ». Le rendu reste à UX/UI.
- **M5-PO-4 — Toute retouche est une version.** Remplacement, ajout, déplacement, verrou, retrait du verrou et retour créent chacun une version ; aucune n'est modifiée ni supprimée hors de la suppression du compte.
- **M5-PO-5 — Écran « Versions du programme ».** Liste de la plus récente à la plus ancienne, par pages de 20, libellés composés à l'affichage depuis les noms du programme, entrée depuis le Séjour.
- **M5-PO-6 — Retour à une version.** Aperçu « Ce qui change » d'abord, puis copie identique (`revert`), toast « Programme rétabli. » avec « Annuler » 5 s. On ne revient qu'à une version écrite après le déblocage. Aucun nombre maximal de versions.
- **M5-PO-7 — Signalement sans effet sur le programme.** Il enregistre, remercie, et propose « Remplacer » pour un lieu fermé. Il ne crée aucune version, ne change aucun badge, n'appelle ni modèle ni Google.
- **M5-PO-8 — Cinq motifs fermés.** Fermé ou n'existe plus ; Horaires faux ; Mauvais lieu ou mauvaise adresse ; Prix faux ; Autre erreur.
- **M5-PO-9 — Pas de texte libre dans un signalement.** Ni saisi, ni stocké, ni envoyé à un modèle. Motifs : aucune donnée personnelle inutile, aucun contenu à modérer, aucun risque d'instruction cachée dans un texte relu plus tard. Écart au handover (« texte libre facultatif », l. 254), à aligner par M5-TL.
- **M5-PO-10 — Nom d'un lieu à soi.** Toujours saisi par la personne, vide à l'ouverture sur `api` (aucun nom maison n'existe dans la chaîne inversée), sauf l'idée de « Surprends-moi » ; jamais prérempli par le nom Google ni par la requête. Le serveur ne reçoit jamais de nom Google.
- **M5-PO-11 — Limites.** 20 recherches de lieu et 20 signalements par voyage et par jour, plus le débit par session. Les valeurs sont proposées ; le coût des recherches est soumis à Samuel (question 1) et le code les lit dans la configuration.
- **M5-PO-12 — Lieu à soi.** Recherche par nom → `placeId` seulement ; moment libre ou repas pas encore choisi ; durée prévue de la configuration (`dureesParDefaut`) ; heure proposée = début du premier temps libre du jour au moins aussi long que cette durée, sinon choix de la personne dans la liste des temps libres ; refus du moteur (`no_option`) : « Pas de place ce jour-là, choisis un autre jour. » ; étape verrouillée à l'ajout (séquence `[add, lock]` dans un seul patch, forme : T11), sans raison, source, badge ni ligne « À faire ».
- **M5-PO-13 — Contenu de la liste.** Réservations (une par étape « À réserver »), engagements déjà réservés (cochés), puis bons plans de l'IA. Le compteur ne compte que les réservations non faites. Pas de lien de réservation ni de lien rémunéré, pas de ligne saisie par la personne dans ce lot.
- **M5-PO-14 — Cases hors des versions.** Cochage enregistré sur `api`, idempotent, sans version ni « Annuler » ; permis avant le déblocage sur les lignes servies.
- **M5-PO-15 — La liste suit les retouches.** F7-PO-19 vaut sur `api` pour toutes les écritures du programme, dans la même écriture que la version.
- **M5-PO-16 — Textes.** Ceux du § 9, provisoires. UX/UI les valide ou les reformule sans changer la règle, et reste maître du rendu de l'écran « Versions du programme », de la feuille de signalement et des mentions de la fiche.

## 14. Hors périmètre

- « Remplacer » (écran 14) sur `api` : M1g (#869). « Déplacer » sur `api` : ticket #947 (PR #953), par le moteur (`appliquerPatch`, patch `[move]`) et la relecture du port de la lecture, comme M1g et l'ajout : décision 0153 (`docs/decisions/0153-deplacement-sur-api.md`).
- « Garder » sur la fiche (Q67, Samuel).
- Le nombre de remplacements inclus dans le voyage complet (« [N] remplacements », Q88, Samuel).
- La file de vérification humaine des signalements, toute vérification Google déclenchée par un signalement, et tout apprentissage tiré des signalements.
- Les lignes « À faire » saisies par la personne, les liens de réservation et l'affiliation.
- La demande libre (« journée plus calme ») : hors MVP (cadrage § 3.5).
- « Adresse découverte » (M8b), qui réutilisera le lieu à soi.
- Le site d'essai, `p0Run`, le schéma `prototype` et l'ancienne chaîne.
- Tout appel réel, toute préversion, toute variable Vercel (M1h). La conservation des temps de trajet (Q637).

## 15. Questions ouvertes, par destinataire

**Samuel** (réservées : argent, offre, données), avec recommandation :
1. **Coût de la recherche d'un lieu à soi.** Une recherche coûte de l'ordre de 0,032 USD au-delà de 5 000 gratuites par mois. Plafond proposé : 20 recherches par voyage et par jour (0,64 USD au plus), dans le plafond Google de 20 USD par mois de 0027. *Recommandation : oui.* Bloque : l'ouverture réelle de M5d à M1h, pas son code (simulé).
2. **Q88, retouches d'un voyage non débloqué.** *Recommandation* : permettre le verrou avant le déblocage (aucun coût, et il protège une étape pendant la révision après le tri), garder l'ajout et le retour à une version après le déblocage. Sans réponse, M5-PO-1 s'applique (tout après le déblocage, sauf le signalement). Bloque : rien.
3. **Q88, ce que compte « [N] remplacements ».** Les ajouts d'un lieu à soi et les retours à une version comptent-ils ? *Recommandation : non*, seuls les remplacements (ils seuls appellent le modèle ou une recherche de remplacement). Bloque : l'affichage d'un plafond, pas le code de M5.
4. **Signalements.** Les garder avec le voyage (effacés avec le compte) et les lire au studio en comptes agrégés (motif, lieu), pour la qualité ? *Recommandation : oui*, sans texte libre (M5-PO-9). Bloque : la lecture des signalements par le studio, pas leur enregistrement.

**Tech Lead** (décision M5-TL) : T1 à T11 du § 10, en particulier T1 et T2 (contrat et stockage de `StopReport`), T3 (recherche Text Search et forme de la demande d'ajout), T5 (versions), T11 (lieu à soi verrouillé à l'ajout) et T7 (liste dans la transaction de la version). Elles bloquent M5a à M5d ; T8 et T9 bloquent M5e.

**Sécurité** : S1 à S5 du § 11. Elles bloquent M5c (S1, S5) et M5d (S2 à S5).

**UX/UI** : rendu de l'écran « Versions du programme », de la feuille « Signaler une erreur », des mentions « Déjà réservé » et « Ajouté par toi. », de l'ordre des sortes de lignes de la liste, et textes du § 9. Ne bloque pas le code (clés de `src/i18n`), mais bloque la fusion de M5b, M5c et M5d.

**CEO** : ordre des tâches (M5-TL au cycle 221 du plan, puis M5e, M5a à M5d) ; la tâche « Déplacer une étape sur `api` » est ouverte (ticket #947, PR #953 ; décision 0153), rattachée à l'étape 5 du plan `docs/plans/mvp-etapes-1-9.md` (§ 5, qui ne la liste pas encore dans son tableau) ; report dans `QUESTIONS.md` des questions ci-dessus ; Q71 tranchée par M5-PO-3 (partie Product Owner, rendu UX/UI).
