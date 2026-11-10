# 0149 — Réponses de la Sécurité à S-M4-1 à S-M4-5 (plusieurs villes, M4) : textes des logements et heures de fin vers le modèle et Text Search, durée estimée par l'IA, recherche de ville des autres villes, `transfer` hors de la vue partagée

Statut : **proposée**, définitive dès sa fusion (décision 0093) · **décision de la Sécurité** (questions S-M4-1 à S-M4-5 posées par `specs/M4-plusieurs-villes.md` § 10 et par la décision 0148 § 13 ; contrôles d'une sortie de modèle, données personnelles envoyées à des tiers, règles Google, vue partagée en liste blanche, plafonds de la recherche de ville), sans délai de veto ; à lister dans la note de version suivante (rubrique « Décisions prises par le studio »). Elle répond à Q725. Un refus d'un point du § 13 de 0148 aurait amendé ce seul point (en-tête de 0148) : **aucun point n'est refusé**, les réponses ajoutent des conditions.

Date : 2026-10-30 · Décideur : Sécurité · Ticket : #914 · Spécification : `specs/M4-plusieurs-villes.md` § 10 · Décision de référence : 0148 (#907, fusionnée), § 1 point 4, § 2, § 6, § 7.1, § 8 point 2, § 10.2, § 13 · Décisions liées : 0011, 0027, 0103, 0116, 0117, 0136, 0139, 0141, 0146 · Questions : Q636, Q645, Q660, Q669, Q725 (`QUESTIONS.md`)

Numérotation : 0149 est réservé par le CEO pour cette décision. `main` (`702df38`) porte les décisions jusqu'à 0148 ; aucune PR ouverte ni branche `claude/…` ne porte 0149.

**Ce que cette décision n'engage pas.** Aucun argent : aucun plafond réel changé (`PLAFONDS_USAGE` reste `null`), aucun seuil changé (`SEUILS_AUTOCOMPLETION` et `SEUILS_AUTOCOMPLETION_VALIDES = false` inchangés), aucune barrière ouverte. Aucun compte externe, aucune variable d'environnement, aucune migration, aucun test supprimé ni désactivé. M4a à M4c restent en composition simulée : rien ne part vers un fournisseur.

**Réservé à Samuel, non tranché ici** : Q636 (récit et logement de vrais comptes vers le fournisseur de modèles, hors UE), son complément Q645 (libellés d'engagements vers le modèle ; textes du brief vers Text Search ; requête vers un site) et Q660 ; les plafonds et les seuils réels (Q639, Q669, question 4 de la spécification M4). Les verdicts ci-dessous lèvent la condition **de la Sécurité** ; ce qui dépend de Samuel est posé comme question, avec une recommandation (« Questions nouvelles »).

**Amende** : rien. **Précise**, pour le chemin `api` à plusieurs villes : 0117 § 2 point 2 et 0139 § 5.2 point 2 (« zone des logements ») valent **ville par ville** (§ 1.3) ; 0141 § 4 point 6 (risque d'épuisement) vaut tel quel pour les autres villes (§ 3).

**N'amende pas** : 0011 (seul le `placeId` est stocké de Google ; aucune donnée Google dans un prompt), 0027, 0092, 0103 (liste blanche de la vue partagée), 0117 § 1 à § 5, 0139 (toutes ses conditions valent pour l'entrée v5), 0141 (seuils, débit, garde des seuils), 0148 (architecture prise telle quelle).

## Faits vérifiés sur `origin/main` `702df38`

- **Entrée du modèle** : `EntreeProgrammeSchema` (`src/ai/entrees.ts`, l. 180-208) est strict ; `logements` 1 à 5 entrées `{ texte ≤ 120, nuits }` (l. 195) ; `engagements` au plus 10 entrées `{ libelle ≤ 80, date, heure, type }` (l. 196-199), **sans `fin`** ; aucun champ pour une donnée Google. `requeteProgramme` envoie une **projection champ par champ** (`projectionBrief`, `src/ai/requetes.ts`, l. 253-278), commune aux requêtes `programme` et `revision`. `creerRedigerProgramme` impose `data_collection: "deny"` et `zdr: true` quel que soit le réglage (`src/ai/rediger-programme.ts`, l. 25). Canaris : `tests/unit/workflows/p0-run-finale.test.ts`, l. 432 ; sur `api`, `tests/db/chaine-inversee.test.ts`, l. 745 (« aucune donnée Google dans l'état, le journal ni le prompt ») et l. 704 (`zdr` et `data_collection`).
- **Brief de `api`** : `briefDepuisFormulaire` refuse `draft.otherCities` (`src/server/programme/brief.ts`, l. 112) ; `engagementsDuBrief` écarte tout vol et envoie le libellé saisi, la date et l'heure de début (l. 76-80) ; `texteDuLogement` (l. 60-73). `TripCommitment` porte `label` (2 à 80 caractères), `start` et `end` facultatif (`src/contracts/creation.ts`, l. 74-80) ; `OtherCitySchema` n'a que `name`, `arrival` et `lodging`, sans `placeId` ni région (l. 67-71). `createTrip` contrôle toutes les villes contre la table des 62 villes (`controlerVilles`, `src/lib/fuseaux/index.ts`, l. 209-221 ; appel `src/server/creation/creer-voyage.ts`, l. 93).
- **Vérification** : `ancrerLogementsDuSejour` rend **une** zone commune (`src/grounding/ancrage-zone.ts`, l. 56-60) ; `verifierLieuxDuProgramme` (l. 119-141) cherche `« {lieu}, {lieu.ville ?? destination} »` restreint à cette zone (l. 130) et ne garde une fiche que dans la zone (l. 138). Le type `Brief` de `@/prototype/brief` y est importé en type seulement (l. 7), ligne admise `tests/unit/confinement/listes/specificateurs.ts`, l. 214. Masque `places.id` (`src/grounding/places-client.ts`, l. 60). Capacité de `api` : une seule `zone` (`src/server/composition/generation.ts`, l. 635, 669, 683). `p0Run` : l. 865 et 901 de `src/workflows/p0-run.ts`.
- **Sortie du modèle** : `CreneauIaObjet` (`src/ai/sorties.ts`, l. 646-660), champs facultatifs invalides retirés par `.catch(undefined)` ; `ville` lue et coupée (l. 650) ; `lireProgramme` (l. 704) ; aucune durée lue au niveau du jour aujourd'hui. Durée maison déjà bornée ailleurs : `dureeMinutes` d'un candidat, `z.number().int().min(15).max(600)` (l. 440). Contrat : `MinutesSchema = z.number().int().nonnegative()` (`src/contracts/trip.ts`, l. 48), sans borne haute.
- **Vue partagée, base** : `public.shared_line_item` (`db/migrations/0001_securite.sql`, l. 487-508) nomme `terminus`, `stop`, `segment`, `free`, `openMeal` dans un `CASE` **sans `ELSE`** : tout autre type rend `NULL` ; `shared_day` (l. 510-528) agrège les éléments avec `FILTER (WHERE … IS NOT NULL)` (l. 519-520) et ne projette ni `theme` ni aucune ville. Aucune migration plus récente ne redéfinit ces fonctions. Aucune vue sur `stays` (commentaire l. 555). `purge_organization_data` supprime `trip_versions`, `stays` et `trip_commitments` (`db/migrations/0015_recalcul_lot.sql`, l. 114-118).
- **Vue partagée, code** : `SharedDayItemSchema` (`src/contracts/share.ts`, l. 58-64), `SharedDaySchema` (l. 68-71 : `index`, `date`, `generating`, sans `theme`), `SharedTripSchema` par `pick` (l. 78-86). **La projection TypeScript** `sharedItem` (`src/adapters/share-projection.ts`, l. 75-91) est un `switch` exhaustif sans `default` qui rend toujours un `SharedDayItem`, et `projectSharedDay` recopie **chaque** élément (l. 99) : elle n'a **pas** de liste blanche par filtre comme la base. Elle sert la vue partagée de `mock` (`src/adapters/share-views.ts`, l. 4). 0148 § 1 point 3 ne la cite pas parmi les fonctions qui parcourent `Day.items`.
- **Recherche de ville** : action du limiteur `ville-recherche`, 20 par minute et par adresse (`src/server/config/limites.ts`, l. 39) ; seuils 150 et 40 (`src/server/config/villes.ts`, l. 16) ; garde `SEUILS_AUTOCOMPLETION_VALIDES: boolean = false` (l. 28) ; terminaux `src/server/actions/villes.ts` et `src/server/composition/villes-api.ts` ; importateurs des clients Google en liste fermée (`tests/unit/p0/composition.test.ts`, l. 70-75). L'écran 1 choisit la recherche par `RechercheVille` (`src/features/creation/DestinationVille.tsx`, l. 36-37).
- **Modules chargés par `pnpm p0`** : seuls `forme.ts`, `entree.ts` et `assemblage.ts` de `src/server/programme` sont exemptés de `server-only` (`eslint.config.mjs`, l. 691-693 ; `tests/unit/lint/p0-server-modules-lint.test.ts`, l. 231 et 273 ; `tests/unit/p0/imports.test.ts`, l. 400).

## Décision

### 1. S-M4-1 — Textes des logements de 2 ou 3 villes vers le modèle et vers Text Search : **accepté sous conditions** ; réduction du Tech Lead **retenue** ; Q636 et Q645 restent à Samuel

#### 1.1 Le verdict 0139 couvre-t-il ce cas ?

**Oui pour la nature des flux, non pour la décision de Samuel.** Les flux de M4 sont ceux que 0139 a jugés, en plus grand nombre :

| Flux | Aujourd'hui (une ville) | M4 (2 ou 3 villes) | Verdict technique existant | Réponse de Samuel |
|---|---|---|---|---|
| Texte du logement → modèle | 1 texte | 1 à 3 textes (un par ville ; 5 au plus par le schéma) | 0139 § 1.1 | Q636 |
| Texte du logement → Text Search (`« {texte}, {ville} »`) | 1 | 1 à 3 | 0139 § 5.2 (Q604 pour le site d'essai) | Q645 (b) |
| Libellés d'engagements → modèle | oui | oui, **moins** le billet devenu changement de ville | 0139 § 1.4 | Q645 (a), Q660 |
| Heures de fin d'engagements → modèle | non | oui | — (§ 5 ci-dessous) | complément demandé |
| Noms de ville → modèle et Text Search | destination | noms maison de la table des 62 villes | 0117 § 2 point 1 | aucune (pas une donnée personnelle) |
| Noms de lieux de l'IA → Text Search | oui | oui, avec la ville **du code** | 0139 § 5.2 | Q645 (b) |

Aucun flux d'une nature nouvelle vers un tiers, hormis les heures de fin (§ 5). La Sécurité n'a donc **pas** de nouveau verdict de principe à rendre : 0117 § 1, § 2 et § 5 et 0139 § 1.1, § 1.4 et § 5.2 valent tels quels pour l'entrée v5 et pour la vérification par ville. Pour l'usage réel, la réponse de Samuel à Q636 et Q645 doit dire qu'elle couvre aussi le cas à plusieurs villes : question nouvelle 1, recommandation **oui**.

#### 1.2 Réduction proposée : **retenue, et rendue obligatoire**

Le libellé de l'engagement devenu changement de ville (« Train Rome–Florence ») n'est **jamais** envoyé au modèle : seules ses heures (`start`, `end` s'il existe) et la source (`entered`) passent, dans le cadre de la journée (0148 § 5.1 point 2, § 8 point 2). Il n'a pas de lieu : il n'est jamais envoyé à Text Search non plus. Il est stocké dans l'instantané (`transfer.label`), comme le libellé l'est déjà dans `trip_commitments`, et supprimé avec le compte (`purge_organization_data`, 0015, l. 114-118).

Un vol devenu changement de ville suit la même règle : son libellé ne part pas ; les autres vols restent écartés du brief comme aujourd'hui (`brief.ts`, l. 76-80).

#### 1.3 Conditions (M4a pour l'entrée, M4b pour la conversion et la vérification)

1. **Une voie, une projection.** L'entrée v5 est un schéma **strict** de `src/ai/entrees.ts` (`EntreeProgrammeV5`, nom au choix de M4a), sans champ pour une donnée Google ni pour un libellé de billet, ni pour une ville par créneau (0148 § 8 point 3). Elle est envoyée par une projection **champ par champ** dans `src/ai/requetes.ts`, sur le modèle de `projectionBrief` (l. 258-278), commune à `programme` et à `revision` ; jamais une décomposition (`...`) d'un objet du brief.
2. **`zdr` et `data_collection: "deny"` imposés** par `creerRedigerProgramme` (ou sa version v5), comme `src/ai/rediger-programme.ts` l. 25 ; échec fermé sans second appel (0139 § 1.1 point 2). Le test `generateProgramme: une seule requête programme, routage zdr et data_collection deny…` (`tests/db/chaine-inversee.test.ts`, l. 704) passe sur un voyage à deux villes.
3. **Bornes de l'entrée** : `villes` de 1 à `MAX_CITIES` entrées, `nom` ≤ `CITY_NAME_LENGTH.max` ; `logements` inchangé (≤ 5, texte ≤ 120) ; `engagements` ≤ `MAX_COMMITMENTS`, `libelle` ≤ 80. Le nom d'une ville est le **nom maison** de la table, contrôlé par `controlerVilles` (`creer-voyage.ts`, l. 93), jamais la saisie brute.
4. **Ville de la recherche posée par le code.** Sur `api`, la ville d'un lieu envoyée à Text Search est celle du cadrage (0148 § 7.1 point 3) ; le champ `ville` de l'IA est ignoré et écrasé. L'IA ne choisit donc plus le texte de ville de la requête Google : c'est une réduction de surface par rapport à 0139 § 5.2.
5. **Zone par ville** (précision de 0117 § 2 point 2 et 0139 § 5.2 point 2) : la zone d'un lieu est le rectangle des logements **de sa ville**, jamais déduit d'un texte de l'IA, jamais élargi, jamais remplacé par la zone commune. Une ville absente de `zonesParVille`, ou un lieu sans `ville`, lève une `RangeError` (échec fermé, 0148 § 7.1 point 6) ; aucun appel Google n'est fait pour ce lieu. Les positions des logements ne quittent pas la mémoire de l'étape (0011).
6. **Rien du brief ailleurs** : textes des logements, libellés, heures et noms de ville ne vont ni au journal, ni à `generation_runs`, ni dans une trace, ni dans l'état sérialisé (0139 § 1.2 point 2, § 5.2 point 3) ; les compteurs nouveaux (`slotsRemoved`) sont des nombres.
7. **Garde du récit inchangée** : la constante de 0139 § 1.2 point 6 et ses tests valent pour l'entrée v5 ; M4 n'y touche pas.

**Tests exigés** :
- M4a : `prompts: entrée v5 sans libellé du billet de changement de ville` (l'entrée construite d'un brief Rome puis Florence avec un « Billet » du jour de changement ne contient pas son libellé, et contient ses heures) ; `prompts: entrée v5 refuse une clé en trop` (schéma strict) ; sentinelles du prompt v5 dans `tests/unit/ia/prompts-sentinelles.test.ts`.
- M4b : `plusieurs-villes: aucune donnée Google ni libellé du billet dans le prompt` (base de données, forme du test de `tests/db/chaine-inversee.test.ts` l. 745, voyage à deux villes : sentinelles des fiches et des recherches, et libellé du billet absents de la requête, du journal et de l'état) ; `plusieurs-villes: zone par ville` (0148 § 7.1 point 6) ; `plusieurs-villes: ville absente des zones, arrêt fermé sans appel` ; `changement de ville: ville de l'IA écrasée par la ville du code` (0148 § 10.2) ; `plusieurs-villes: révision d'un voyage à deux villes` (0148 § 10.2), complété : la requête `revision` ne contient pas le libellé du billet.

### 2. S-M4-2 — Durée estimée par le modèle : **accepté sous conditions** (les contrôles de 0148 § 2 point 2 suffisent, précisés)

La durée estimée est une **donnée du modèle**, pas une donnée Google (aucune requête Routes : profil `programme` à 0, 0148 § 3 point 2) : 0011 ne s'y oppose pas. Un nombre ne porte ni texte, ni URL, ni balise : le risque est la **valeur** (fausse, énorme, négative, non entière) et sa **présentation** (prise pour un fait). Les contrôles proposés y répondent ; la Sécurité les précise :

1. **Lecture** (M4a, `lireProgramme`) : le champ n'est lu que comme un **nombre JSON** ; une chaîne (`"120"`, `"2 h"`), un booléen, un objet sont **retirés**, jamais convertis. Ordre des contrôles : nombre fini → entier (`Number.isSafeInteger`) → bornes `changementDeVille.dureeEstimeeMinutes` (20 à 600, inclusives) → arrondi au multiple de 5 le plus proche (20 et 600 étant des multiples de 5, l'arrondi ne sort jamais des bornes). Un nombre non entier (`120.5`) est **retiré**, pas arrondi. Toute valeur refusée : champ retiré, compté dans les compteurs existants (`champsRetires`), jamais remplacée par une valeur par défaut ; la ligne affiche « durée à confirmer ». **Aucune durée n'est écrite par le code.**
2. **Place** : un seul entier par journée de changement de ville, au niveau du jour (0148 § 5.3). Sur une journée ordinaire, le champ est ignoré et compté ; il n'atteint ni le cadrage, ni l'assemblage.
3. **Bornes appliquées deux fois** : à la lecture (point 1) et dans `cadrerProgramme` (0148 § 5.3), qui seule le rend au domaine. Le schéma final reste `TripSnapshotSchema` (0117 § 1 point 6) : `MinutesSchema` (`src/contracts/trip.ts`, l. 48) refuse un négatif et un non-entier. Une borne haute dans le contrat est **recommandée** au Tech Lead, non exigée (question nouvelle 3).
4. **Effet borné sur la dépense** : la durée ne peut que **retirer** des créneaux de l'IA (créneau occupé plus long), jamais en ajouter ; le plafond d'activités du jour (0148 § 5.4) est indépendant d'elle ; le créneau occupé est borné à `fenetreJour.fin` (0148 § 5.1 point 5). Un créneau retiré n'est jamais cherché (test `changement de ville: créneau retiré jamais cherché`, 0148 § 10.2).
5. **Toujours une estimation** : le texte affiché est composé par l'interface depuis l'entier (« environ {durée} (estimation) », clé i18n), jamais un texte du modèle ; la ligne « Vers {ville} » et le thème du jour sont écrits par le code (0148 § 5.1 point 2). Aucune heure d'arrivée n'est déduite d'une durée estimée (spécification § 3.3).
6. **Nulle part ailleurs** : ni dans une requête Google, ni dans le journal (un compteur au plus), ni dans la vue partagée (§ 4).

**Tests exigés** :
- M4a : `programme v5: durée estimée en texte retirée`, `… non entière retirée`, `… arrondie aux 5 minutes` (par exemple 93 → 95), `… hors bornes retirée` (19 et 601), `… sur un jour ordinaire ignorée`.
- M4b : `changement de ville: durée estimée hors bornes → durée à confirmer` (0148 § 10.2) ; `changement de ville: durée estimée longue bornée à la fin du jour` (0148 § 10.2) ; `changement de ville: cadrerProgramme reborne une durée hors bornes reçue directement` (entrée qui n'est pas passée par la lecture).

### 3. S-M4-3 — Recherche de ville pour les autres villes (M4c) : **accepté sous conditions** ; le risque accepté de 0141 § 4 point 6 **ne change pas de nature** ; sa portée change, et c'est à Samuel d'en juger avec Q669

1. **Ce qui ne change pas.** Un attaquant n'était pas borné par le nombre de champs : il pouvait déjà épuiser 150 suggestions ou 40 choix par jour depuis le seul champ de la destination, au débit de 20 actions par minute et par adresse (0141 § 4 point 1). Trois champs ne lui donnent ni plus de débit (l'action `ville-recherche` est **commune**, par adresse, `limites.ts` l. 39), ni plus de plafond (les seuils sont **communs**, `villes.ts` l. 16), ni une dépense au-delà du plafond. L'effet d'un épuisement reste un repli sur le champ des 62 villes, jusqu'à minuit UTC, sans blocage de la création.
2. **Ce qui change** : un voyage légitime à 3 villes consomme jusqu'à 3 choix au lieu d'un. Au seuil proposé de 40 choix par jour, la recherche sert environ 13 voyages à trois villes au lieu de 40. Ce n'est pas un risque de sécurité, c'est une **capacité** sous un plafond d'argent : à présenter à Samuel avec Q669 à M1h (question nouvelle 2). Aucun seuil n'est changé ici.
3. **Conditions de M4c** :
   - **mêmes terminaux et même cœur** : chaque champ de ville appelle les actions existantes de `src/server/actions/villes.ts` par le terminal `src/server/composition/villes-api.ts` ; aucune action, aucun terminal, aucun compteur, aucune action du limiteur, aucun seuil nouveaux ; `SEUILS_AUTOCOMPLETION_VALIDES` reste `false` (`villes.ts`, l. 28), M4c ne touche pas ce module ;
   - **ce qui entre dans le brouillon** : le **nom maison** rendu par `villeMvpDuPays`, seul ; `OtherCitySchema` (`creation.ts`, l. 67-71) ne reçoit **ni `placeId`, ni région, ni texte Google** ; ajouter l'un d'eux demande un nouveau verdict. `createTrip` recontrôle chaque ville (`controlerVilles`, `creer-voyage.ts` l. 93) ;
   - **repli par champ** : un refus `limite` ou `indisponible` replie **chaque** champ de ville sur la liste des 62 villes, comme celui de la destination (0141 § 6.3) ;
   - **journal** : aucun champ nouveau ; ni saisie, ni `placeId`, ni adresse IP (0141 § 12, T17, T22).
4. **Tests exigés de M4c** : `plusieurs-villes: recherche épuisée, repli sur les 62 villes pour chaque ville` ; `plusieurs-villes: la ville choisie entre dans otherCities par son nom maison, sans placeId` ; les tests de 0141 § 10 passent inchangés.

### 4. S-M4-4 — `transfer` et `Trip.cities` hors de la vue partagée : **accepté sous conditions** (confirmé pour la base ; une condition de plus pour la projection TypeScript)

1. **Base : confirmé, sans migration.** `shared_line_item` ne nomme pas `transfer` et rend `NULL` (`0001_securite.sql`, l. 491-507, `CASE` sans `ELSE`) ; `shared_day` filtre les `NULL` (l. 519-520). Aucun champ du `transfer` (`from`, `to`, `label`, `start`, `end`, `estimatedMinutes`, `mode`, `source`) n'atteint `shared_trip_version`. `Day.theme` (« De {ville} à {ville} ») n'est pas projeté (`shared_day`, l. 514-527). `Trip.cities` est lu depuis `stays`, sans vue (l. 555), et `shared_trip` a une liste de colonnes fermée.
2. **Projection TypeScript : condition nouvelle (M4-C).** `sharedItem` (`src/adapters/share-projection.ts`, l. 75-91) devra traiter `transfer` dès que M4-C l'ajoute à `DayLineItemSchema` (le `switch` exhaustif l'impose à la compilation). La seule forme admise : **l'élément est retiré** de `items` dans `projectSharedDay` (l. 99), par un filtre explicite sur le type, **comme la base** ; il n'est jamais converti en `free`, en `segment` ni en un autre élément partagé, et aucun de ses champs n'est recopié. `SharedDayItemSchema` (`share.ts`, l. 58-64) ne change pas ; `SharedTripSchema` (l. 78-86) et `projectSharedTrip` (l. 104-113) ne reçoivent pas `cities`. La liste de 0148 § 1 point 3 est complétée par ce cas, que fait M4-C.
3. **Points de carte** : `projectSharedPoints` ne garde que les étapes (`point.ref.type !== "stop"`) ; aucun point n'est créé pour un `transfer` (0148 § 7.2 ne trace rien entre villes).
4. **Ouverture par B12** : le `transfer` n'entre dans la vue partagée que par une PR qui l'ajoute à `shared_line_item` (migration) **et** à `SharedDayItemSchema`, avec un verdict de la Sécurité sur ses champs (le `label` est une saisie de la personne, comme le libellé de terminus refusé par Q50).

**Tests exigés** :
- M4-C : `partage: transfer absent de la projection` (`src/adapters/share-projection.test.ts` : un jour avec un `transfer` donne des `items` sans lui, et le texte JSON de la vue ne contient ni son `label` ni ses villes) ; `partage: SharedDayItemSchema refuse un transfer` (`src/contracts/share.test.ts`, extension prévue par 0148 § 10.2).
- M4b : `plusieurs-villes: transfer absent de la vue partagée` (base de données, `shared_trip_version`, forme du test de `tests/db/partage.test.ts` l. 321 : aucun élément de type `transfer`, et ni le libellé du billet, ni `estimatedMinutes`, ni le thème « De … à … » dans le texte de l'instantané partagé) ; `plusieurs-villes: Trip.cities absent de la vue partagée` (ni par la projection, ni par la base).

### 5. S-M4-5 — Heures de fin des engagements vers le modèle : **accepté sous conditions** (non bloquant)

L'heure de fin est une heure `HH:MM` saisie par la personne, de même nature que l'heure de début déjà envoyée (0139 § 1.4) ; elle sert au cadre de la journée (0148 § 9 point 2). Conditions :

1. `engagements[].fin` de l'entrée v5 : facultatif, **`TimeSchema`** (format fermé), postérieur au début, et **rien d'autre** de l'engagement n'est ajouté (ni `kind` brut, ni lieu, ni ville déduite) ; l'engagement devenu changement de ville n'est pas dans `engagements` (§ 1.2), ses heures passent par le cadre du jour.
2. Projection champ par champ (§ 1.3 point 1) ; ni journal, ni trace, ni état.
3. Pour l'usage réel, la réponse de Samuel à Q645 (a) la couvre : question nouvelle 1.

**Test exigé (M4a)** : `prompts: entrée v5, fin d'engagement au format HH:MM seulement` (une fin invalide est refusée par le schéma, avant toute requête).

### 6. Lignes de confinement attendues

- **M4-C, M4a, M4c** : **aucune ligne nouvelle** dans `tests/unit/confinement/listes/capacites.ts`, `paquets.ts`, `process.ts`, `specificateurs.ts`, `formes-tests.ts`, ni dans `donnees/lignes-textes.json`, `lectures-env-secretes.json` ou `refus.json` ; `IMPORTATEURS_CLIENTS_GOOGLE` (`tests/unit/p0/composition.test.ts`, l. 70-75) inchangée ; aucune entrée nouvelle dans `eslint-rules/creation-imports.mjs`.
- **M4b** :
  - **retrait** (et seulement retrait) de la ligne `{ fichier: "src/grounding/ancrage-zone.ts", specificateur: "@/prototype/brief", noms: ["type:Brief"] }` (`specificateurs.ts`, l. 214), quand `BriefAncrage` remplace l'import (0148 § 7.1 point 7) ; le test « confinement: aucune ligne inutile » (`tests/unit/confinement/depot.test.ts`, l. 176) l'exige. La ligne du test `ancrage-zone.test.ts` (l. 215) reste si le test garde son import ;
  - `src/server/composition/generation.ts` reste le seul importateur de capacités du chemin `api` ; `src/domain/changement-de-ville.ts`, `src/domain/villes-du-voyage.ts` et `src/server/programme/cadrage.ts` n'importent aucun module de capacité, ni `src/ai`, `src/grounding`, `src/research`, `src/prototype` (0136 § 1.2) ;
  - **`cadrage.ts` et `pnpm p0`** : si `assemblage.ts` l'importe pour son second contrôle (0148 § 5.1 point 3 (b)), `cadrage.ts` est chargé par `pnpm p0` et entre, **avec le même régime** que `forme.ts`, `entree.ts` et `assemblage.ts` (pur, `@/contracts`, `src/domain` et ces fichiers seulement), dans les trois listes : `eslint.config.mjs` l. 691-693, `EXEMPTED_SERVEUR_PROGRAMME` (`p0-server-modules-lint.test.ts`, l. 231, dont le titre l. 273 change) et `MODULES_PROGRAMME_P0` (`imports.test.ts`, l. 400). Sinon il garde `import "server-only"`. La Sécurité admet les deux formes ; la PR de M4b dit laquelle, et le changement de titre est un écart à déclarer au sens de 0148 § 10.2 (question nouvelle 3) ;
  - `p0Run` ne change que par l'appel `zoneDe` (`() => zone`, l. 901) : `zonesParVille` vide, aucune requête de plus.
- Toute autre ligne relevée par l'analyseur : la PR la dit, avec sa justification, et la Sécurité la juge à sa revue.

## Conditions récapitulatives (vérifiées à la revue Sécurité)

| PR | Conditions |
|---|---|
| M4-C | § 4 point 2 (projection TypeScript : `transfer` retiré, jamais converti) et ses deux tests ; § 6 (aucune ligne) |
| M4a | § 1.3 points 1 à 3 (schéma strict v5, projection champ par champ, bornes, `zdr` imposé) ; § 2 points 1, 2 et 5 (lecture de la durée) ; § 5 point 1 ; tests des § 1.3, § 2 et § 5 ; § 6 (aucune ligne) |
| M4b | § 1.2 (libellé du billet jamais envoyé) ; § 1.3 points 4 à 7 (ville du code, zone par ville, échec fermé, rien du brief ailleurs) ; § 2 points 2 à 4 et 6 ; § 4 points 1 et 3 (tests de base de données) ; tests des § 1.3, § 2 et § 4 ; § 6 (retrait de la l. 214, place de `cadrage.ts`) |
| M4c | § 3 point 3 (mêmes terminaux, nom maison seul, repli par champ, journal fermé) et ses tests ; § 2 point 5 (texte « (estimation) » composé par l'interface) ; § 6 (aucune ligne) |
| M1h (barrière) | réponse de Samuel à Q636, Q645 et à la question nouvelle 1 avant tout voyage réel à plusieurs villes ; seuils de 0141 présentés avec la question nouvelle 2 |
| B12 | § 4 point 4 (verdict avant d'ouvrir `transfer` au partage) |

## Ce qui est débloqué

- **M4a** : débloquée par S-M4-2 (§ 2), dès la fusion de cette décision.
- **M4b** : débloquée par S-M4-1 (§ 1), S-M4-2 (§ 2) et S-M4-4 (§ 4), dès la fusion ; elle reste après M4-C et M4a (0148 § 12).
- **M4c** : la recherche de ville des autres villes est débloquée par S-M4-3 (§ 3), dès la fusion ; elle reste derrière la garde `SEUILS_AUTOCOMPLETION_VALIDES = false` et la barrière fermée.
- S-M4-5 (§ 5), non bloquante, est répondue avec S-M4-1.
- **Rien n'est débloqué pour l'usage réel** : les voyages réels à plusieurs villes attendent M1h et les réponses de Samuel (Q636, Q645, questions nouvelles 1 et 2).

## Conséquences

- Aucun flux d'une nature nouvelle vers un tiers : plus de textes de logement de même nature, des heures de fin, et un libellé de billet **retiré** du flux.
- L'IA ne choisit plus la ville du texte envoyé à Google sur `api` (ville du code) et chaque lieu est cherché dans la zone de sa ville : la surface de 0139 § 5.2 diminue.
- La durée estimée est un entier borné, lu sans conversion, qui ne peut que retirer des créneaux et s'affiche toujours comme estimation.
- La vue partagée ne change ni en base ni en contrat ; la projection TypeScript de `mock` reçoit un filtre explicite.
- Aucun plafond, seuil, barrière, variable d'environnement ni migration ne change.

## Ce que cette décision ne tranche pas

- Q636, Q645, Q660 et les questions nouvelles 1 et 2 (Samuel) ; Q639 et Q669 (plafonds et seuils réels).
- L'architecture de 0148 (Tech Lead), dont la place de `cadrage.ts` (§ 6) et une borne de `estimatedMinutes` dans le contrat (question nouvelle 3).
- L'entrée du `transfer` dans la vue partagée (B12) et le rendu d'une journée de changement de ville sur la vue partagée (Product Owner).

## Questions nouvelles (pour la description de la PR, reportées par le CEO)

1. **Samuel** (à joindre à Q636 et Q645 ; ne bloque ni M4a, ni M4b, ni M4c, simulées ; bloque les voyages réels à plusieurs villes, à M1h) : pour un voyage à 2 ou 3 villes, ton oui à Q636 et Q645 couvre-t-il aussi (a) jusqu'à 3 textes de logement (un par ville) envoyés au fournisseur de modèles et à Google Text Search, et (b) les heures de fin des engagements envoyées au fournisseur de modèles ? Le libellé du billet de changement de ville, lui, n'est jamais envoyé. Recommandation de la Sécurité : **oui**, aux conditions de 0139 et 0149.
2. **Samuel** (avec Q669, à M1h ; ne bloque pas M4c) : avec 3 villes par voyage, les 40 choix par jour proposés pour la recherche de ville de `api` servent environ 13 voyages à trois villes au lieu de 40 ; le risque d'épuisement par un tiers ne change pas. Garder 150 et 40 pour l'essai de `mvp-essai`, ou relever le seuil des choix (dépense maximale à recalculer par M1h) ? Recommandation de la Sécurité : les garder pour l'essai, le repli sur les 62 villes ne bloquant jamais la création ; revoir après le premier essai réel.
3. **Tech Lead** (ne bloque pas ; échéance : la revue de M4b) : (a) dire dans la PR de M4b si `cadrage.ts` est chargé par `pnpm p0` (trois listes et titre du test l. 273 de `p0-server-modules-lint.test.ts`, écart à ajouter à la liste fermée de 0148 § 10.2) ; (b) une borne haute de `transfer.estimatedMinutes` dans `TransferItemSchema` (par exemple `MinutesSchema.max(600)` ou une constante du contrat), recommandée et non exigée ; (c) ajouter `src/adapters/share-projection.ts` à la liste de 0148 § 1 point 3 (cas « retiré » fait par M4-C, § 4 point 2).
4. **Product Owner** (pour B12 ; ne bloque rien) : sur la vue partagée, la journée d'un changement de ville n'aura ni ligne « Vers {ville} » ni thème, tant que B12 ne les liste pas ; la suite des étapes y passe de la ville quittée à la ville d'arrivée sans transition. Acceptable jusqu'à B12 ?
5. **CEO** : reporter Q725 comme répondue par 0149.

## Décisions attendues de Samuel

- Questions nouvelles 1 et 2, avec Q636, Q645, Q660 et Q669, à M1h. Sans réponse : aucun voyage réel à plusieurs villes, la barrière et la garde des seuils restent fermées.
- Rien d'autre : aucun montant, aucun compte, aucune exception à 0011 n'est demandé ici.

## Quand revoir

- À la réponse de Samuel aux questions nouvelles 1 et 2.
- À B12 (ouverture du `transfer` au partage) et à M4d (plusieurs fuseaux).
- Si une option autre que (a) est retenue pour la durée (0148 § 2 point 3 : table maison ou Routes) : nouveau verdict (Routes touche 0011 et 0092).
- Si la recherche de ville sert un jour après la connexion (« Ajouter une ville » de l'étape 4, 0141 § 4 point 5), ou si `OtherCitySchema` reçoit un `placeId`.
- Après le premier essai réel à plusieurs villes : durées estimées aberrantes, lieux trouvés hors de leur ville, épuisements de la recherche de ville.
