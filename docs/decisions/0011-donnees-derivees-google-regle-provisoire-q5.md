# 0011 — Données dérivées de Google : application de la règle provisoire de Q5 (verdicts d'ancrage, état des workflows, durées, coordonnées)

Statut : proposé · Date : 2026-10-12 (réécriture de la version du 2026-10-08 de la PR #27) · Décideur : Tech Lead pour l'architecture (délégation « Qui décide quoi » de `docs/CONTEXT.md`) ; **la règle appliquée est celle de Samuel** (décision 0027, point 4, #studio, 2026-10-12 09:46 CEST) · Définitif sans veto de Samuel sous 2 jours pour sa partie technique ; à lister dans la note de version suivante, rubrique « Décisions prises par le studio ». **L'accord tacite sous veto ne couvre aucun aspect juridique** : la validation juridique formelle de Q5 reste ouverte (Samuel, avant le lancement) ; cette décision n'interprète pas la règle au-delà de son texte et signale chaque point d'interprétation (section « Points soumis à Samuel »).

Numérotation : 0011 était réservé à la PR #27 depuis le découpage de B0 (Q43). La version du 2026-10-08 (« Verdicts d'ancrage et contenu admis dans l'état des workflows ») est remplacée en entier par celle-ci.

## Contexte
B0a (#114) a fixé le handover back-end sauf ce qui dépend du statut des données **dérivées** de réponses Google (verdict d'ancrage, date de contrôle, durée de trajet, code tiré d'horaires, cache de coordonnées), regroupé dans la section « En attente de Q5 » du handover, avec Q29, Q34, Q38 et Q44. La seconde revue Sécurité de #27 (2026-10-08) avait relevé trois bloquants sur la version d'origine de 0011 : verdicts et `checkedAt` dans l'état durable des workflows (1) ; codes tirés d'horaires Google et de Routes envoyés au modèle de réparation (2) ; contradiction entre le « défaut prudent » et le stockage de `Stop.exceptions.toConfirm` et de `validation_report` dans des versions en ajout seulement (3).

Le 2026-10-12, Samuel a fixé une **règle provisoire** pour Q5 (décision 0027, point 4) : « lecture stricte du cadrage : **aucune donnée Google dans les prompts, seul l'identifiant de lieu stocké, coordonnées gardées 30 jours au plus** ». Il a demandé de finaliser #27 sur cette base (Q237, 0027 point 5). Il a aussi orienté le pipeline de génération (variante B, 0027 point 1) : recherche web par DeepSeek, ancrage Google par le code, notation des candidats ancrés par le Decider à partir de nos seules descriptions, classement par le code, raisons rédigées par DeepSeek pour les seuls lieux retenus.

## Décision

### 1. Règle appliquée
Dans tout le back-end (base, instantanés de versions, table `proposals`, état des workflows, journaux, traces, jeux d'évaluation, prompts) :
- **stocké** comme donnée Google : le `placeId` seul ;
- **gardé au plus 30 jours** : les coordonnées d'un lieu, dans le seul cache `place_coordinates` (point 6) ;
- **jamais stocké** : toute autre donnée Google et toute donnée **dérivée** d'une réponse Google (verdict d'ancrage par lieu, motif d'écart, date de contrôle tirée d'une réponse, durée ou distance de Routes, horaire ou statut d'ouverture, code tiré d'horaires ou de durées) ; elles ne vivent qu'en mémoire, à l'intérieur d'une étape ou d'une requête, et sont **recalculées** quand on en a besoin ;
- **jamais dans un prompt** : aucune donnée Google ni dérivée, sous aucune forme (valeur, code, motif).

Cette règle répond provisoirement à Q29 (verdicts : non conservés), Q34 (coordonnées : cache de 30 jours au plus), Q38 (`Segment.minutes` : non stocké, calculé à la lecture) et Q44 (codes : ni dans les versions, ni dans l'état des workflows, ni dans un prompt). Ces questions restent rattachées à Q5 pour la validation juridique formelle.

### 2. Verdicts d'ancrage
L'énumération `GroundingVerdict` (type serveur de `src/grounding`, jamais exposé à l'interface, jamais sérialisé) est gardée **pour le code en mémoire** :

| Identifiant | Nom dans les documents | Sens |
|---|---|---|
| `compatible` | compatible | Résolu en un seul `placeId` dans la zone du séjour et non fermé définitivement : sélectionnable (R1). Les horaires ne sont pas jugés ici (R4, à la planification). |
| `discarded` | écarté | Non résolu : aucun résultat, plusieurs lieux sans départage, ou hors de la zone du séjour. |
| `closedPermanently` | fermé définitivement | Résolu, mais fermé définitivement d'après notre contrôle : écarté (R1). |

Les trois verdicts sont exclusifs et couvrent tous les cas. **Aucun n'est conservé** : ni colonne, ni champ d'instantané, ni état de workflow, ni journal. Le motif d'un écart (introuvable, hors zone, fermé) n'est écrit nulle part.

**Seule trace durable de l'ancrage : le `placeId`.** L'étape d'ancrage écrit `candidates.place_id` pour un candidat `compatible`, et rien pour les autres. Un candidat sans `placeId` peut donc être non résolu, hors zone ou fermé : le motif n'est pas recouvrable. C'est l'application directe de « seul l'identifiant de lieu stocké » (point soumis à Samuel S1).

**Revérification.** Un candidat réutilisé plus tard (réserve, recalcul par lot, révision unitaire, workflow 4) est **ré-ancré** dans l'étape qui l'utilise (résolution « IDs only », puis Place Details avec le seul champ de statut) : le verdict est recalculé, jamais relu. Un `placeId` présent ne vaut pas verdict.

**Compteurs agrégés.** La mesure du taux d'ancrage (P0, variante A contre B, 0027 point 1) n'utilise que des compteurs par exécution sans identifiant de lieu ni de candidat (`candidates_found`, `candidates_grounded`, `candidates_retained` de `research_runs`), comme le rapport de P0. Aucun compteur par motif d'écart.

### 3. État des workflows (amende la décision 0009, point 3)
L'entrée et la sortie sérialisées d'une étape ne contiennent que : identifiants internes (organisation, voyage, version, exécution, candidat), compteurs, codes d'erreur d'une énumération fermée (`API_ERROR_CODES` ou codes d'étape typés, jamais un code tiré d'un horaire, d'une durée ou d'un statut Google) et identifiant de la version produite. **Ni verdict, ni `checkedAt`, ni `placeId`** : une étape qui a besoin d'un `placeId` le relit en base. Le `placeId` sort donc aussi de la liste admise par 0009 point 3 (resserrement : il n'apporte rien à l'état, puisqu'il est en base).

Conséquence sur le découpage : **aucune étape ne passe un sous-ensemble de candidats à une autre par son état**. L'étape d'ancrage écrit `candidates.place_id` et ne renvoie que des compteurs ; l'étape de notation lit en base les candidats qui ont un `placeId`.

### 4. Prompts
- **Notation (Decider, variante B)** : le modèle reçoit le brief, nos descriptions issues de la recherche (nom maison, résumé maison, catégorie, faits `StopFacts` maison) et des identifiants internes (`c_017`). Jamais de `placeId`, de nom Google, d'adresse, de coordonnée, d'horaire, de note, de prix, de statut, de durée ni de verdict. L'ensemble noté est celui des candidats ancrés, comme le prévoit 0027 point 1.3 (point soumis à Samuel S2).
- **Raisons (DeepSeek, variante B)** : mêmes entrées, pour les seuls lieux retenus (0027 point 1.5).
- **Réparation** : **plus aucun appel de modèle**. La réparation d'un créneau qui échoue à la validation (R1 à R10) est déterministe : option suivante du classement, sinon case « aucune option compatible » (PO-6). Les codes `slotUnavailable`, `tooFar`, `overBudget`, `conflict` de la version d'origine sont supprimés ; aucun motif de validation n'atteint un modèle. Résout le bloquant 2 de la seconde revue Sécurité.

### 5. Champs des contrats en attente de Q5 (amende la décision 0010, principes 6 et 8)
| Champ | Catégorie | Règle |
|---|---|---|
| `Segment.minutes` | calculé | Recalculé à la lecture par Routes API (matrice entre `placeId`, à l'intérieur de `src/grounding`, arrondi à 5 min), sans cache partagé ni stockage ; coût compté dans `usage_ledger` et soumis aux plafonds |
| `Day.travelMinutes` | calculé | Somme à la lecture des `Segment.minutes` du jour, hors excursion |
| `Change[segment].before` | calculé | Durée relue pour la version de départ, au moment de la réponse de révision ; jamais écrite dans `trip_versions.patch` |
| `Change[segment].after` | calculé | Idem, pour la version produite |
| `Stop.verifiedAt` | calculé | Date (`created_at`, donnée maison) de la version qui a planifié l'étape : le moteur contrôle chaque lieu à la création de la version (R1, R4). Aucune colonne `verified_at` |
| `SurpriseIdea.verifiedAt` | calculé | Idem, pour la version qui a écrit l'idée |
| `Stop.exceptions` | stocké, sans `toConfirm` | L'instantané type `exceptions` comme un tableau de `toReserve` et `unconfirmed` seulement (au plus 2 ; schéma imbriqué `StopSnapshot` dérivé de `StopSchema`), comme l'écart 3 bis de la spec P0 ; `toReserve` vient de nos sources web, `unconfirmed` de la relecture de la page d'un événement (R2). `toConfirm`, tiré d'horaires Google, n'est **jamais stocké** : il est ajouté à la lecture d'une journée ou d'une fiche par une relecture des horaires (Place Details, à l'intérieur de `src/grounding`, sans stockage), dans la limite de 2 badges |

**Relecture.** Une relecture qui échoue (plafond ou quota atteint, Google indisponible) **n'invente jamais de valeur** : la journée s'affiche avec l'état d'erreur existant et « Réessayer » (comme P0b) ; `toConfirm` absent faute de relecture n'est pas une erreur (le moteur a garanti R4 à la création). Une relecture qui ne trouve pas d'itinéraire pour le mode choisi donne une durée estimée par le moteur à partir des coordonnées, avec `estimated = true`, calculée et jamais stockée.

**`Proposal.detour`** : écrit pour chaque proposition (justification maison, sans durée), gardé ou omis à la lecture selon `DETOUR_THRESHOLD_MINUTES` et la durée relue, comme dans P0 (sinon sa présence trahirait une durée de Routes).

**`trip_versions.validation_report`** : **n'est pas créée**. Le rapport de validation ne vit qu'en mémoire dans l'étape de planification ; une version écrite est une version qui a passé la validation. La contradiction relevée par le bloquant 3 (purge ciblée impossible dans une table en ajout seulement) disparaît : aucune donnée dérivée n'entre dans `trip_versions`.

**Horaires planifiés** (`Stop.start`, `Stop.end`) : hors des 7 clés, ils suivent la réponse de Samuel à P0-Q9 (spec P0) ; d'ici là, B9 ne branche pas l'écriture de programmes réels (même règle que P0).

### 6. Cache des coordonnées (`place_coordinates`, amende la décision 0007)
Créé par B8 et réservé à `src/grounding` (moteur et carte Google) :
- colonnes `organization_id`, `place_id`, `lat`, `lng`, `fetched_at`, `expires_at` ; unique `(organization_id, place_id)` ; `CHECK (expires_at <= fetched_at + interval '30 days')` ;
- RLS activée et forcée ; politique type (organisation courante) **et** `expires_at > now()` en lecture : une ligne expirée n'est plus lisible, même avant sa purge ;
- `vadrouille_app` : `SELECT, INSERT, UPDATE` ; une mise à jour n'est faite qu'avec une nouvelle réponse de Google (nouvelles `fetched_at` et `expires_at`) ; aucun `DELETE` ;
- purge quotidienne par `purge_expired_coordinates()`, fonction `SECURITY DEFINER` possédée par le rôle `vadrouille_fn_coords` (`NOLOGIN`, sans membre, règles communes de la décision 0007), `EXECUTE` à `vadrouille_app` seulement ; politique `DELETE ... TO vadrouille_fn_coords USING (expires_at <= now())` ; le rôle s'ajoute à la liste du test `rôles` ;
- les coordonnées ne sortent du serveur que dans `DayMap` pour la carte Google, et n'entrent dans aucun contrat stocké, aucune version, aucun état de workflow, aucun journal ni aucun prompt.

Le test `schéma: aucune colonne de contenu Google` admet une seule exception, `place_coordinates.lat` et `.lng`, nommée dans le test.

### 7. Pipeline de génération (variante B, 0027 point 1)
| Étape | Type | Données Google dans l'étape | Écrit en base | Sortie sérialisée |
|---|---|---|---|---|
| a Recherche web | IA (DeepSeek) | non | `candidates` (contenu maison, sans `placeId`) | compteurs |
| b Ancrage | appel externe (Places) | oui, en mémoire | `candidates.place_id` des candidats `compatible` seulement | compteurs |
| c Notation | IA (Decider) | non | notes du Decider sur les candidats (donnée maison) | compteurs |
| d Classement, planification, validation, réparation déterministe | déterministe (moteur), relectures Places et Routes | oui, en mémoire | version de travail (instantané sans données dérivées, sans raisons), cases `proposals` | identifiant de version |
| e Raisons et publication | IA (DeepSeek), puis écriture | non | `Stop.reason` des lieux retenus dans une nouvelle version, qui devient `current_version` | identifiant de version |

Une étape IA ne contient jamais de donnée Google (règle du § 8 du handover). La version de travail de l'étape d n'est jamais `current_version` : seule celle de l'étape e est publiée (aucune version partielle). La variante A (DeepSeek seul, mesure de référence) remplace les étapes c et e par une étape DeepSeek qui note et rédige ; les règles d'entrée sont les mêmes. Modèles et variante choisis par configuration (0027).

## Tests nommés
- `workflows: aucune donnée Google dans l'état sérialisé` : pour chaque étape, entrée et sortie validées par leur contrat strict ; aucune clé interdite à aucun niveau (`rating`, `userRatingCount`, `openingHours`, `regularOpeningHours`, `currentOpeningHours`, `businessStatus`, `priceLevel`, `photos`, `phone`, `nationalPhoneNumber`, `internationalPhoneNumber`, `address`, `formattedAddress`, `displayName`, `reviews`, `lat`, `lng`, `latitude`, `longitude`, `location`, `viewport`, `duration`, `staticDuration`, `distanceMeters`, `polyline`) ; **en plus** : aucune clé `verdict`, `checkedAt`, `placeId`, `grounded`, aucune valeur de `GroundingVerdict`, et aucune liste d'identifiants de candidats en sortie de l'étape d'ancrage.
- `prompts: canari, aucune donnée Google ni dérivée dans un prompt` : clients Places et Routes simulés à valeurs sentinelles (comme P0) ; aucune sentinelle, aucun `placeId`, aucune valeur de `GroundingVerdict` dans les messages envoyés au client de modèles simulé, pour les étapes a, c et e.
- `réparation: aucun appel de modèle` : un créneau en échec de validation est réparé sans appel au client de modèles simulé.
- `schéma: aucune colonne dérivée de Google` (B1, étendu) : ni `grounding_verdict`, `grounding_checked_at`, `verified_at`, `travel_minutes`, `validation_report` ni équivalent.
- `versions: l'instantané ne contient ni durée de trajet ni date de contrôle` (B2, étendu) : ni `toConfirm` dans `exceptions`.
- `lecture: les champs calculés sont recomposés et validés` (B6, B8) : `Trip` et `Proposal` recomposés valident `TripSchema` et `ProposalSchema` ; deux lectures successives rappellent le relecteur simulé (aucun cache partagé) ; une relecture en échec renvoie l'erreur, jamais une valeur inventée.
- `coordonnées: expiration à 30 jours au plus` (B8) : `CHECK` refusé au-delà ; une ligne expirée n'est plus lisible ; `purge_expired_coordinates` ne supprime que les lignes expirées ; `vadrouille_app` n'a pas `DELETE`.
- `ancrage: un candidat réutilisé est ré-ancré` (B9) : le client Places simulé est rappelé pour un candidat de la réserve qui a déjà un `placeId`.

## Points soumis à Samuel (validation juridique de Q5)
- **S1** : un candidat sans `placeId` laisse savoir qu'il n'a pas été ancré, sans motif. La décision considère que seul le `placeId` est stocké ; si Samuel juge que cette absence est déjà une donnée dérivée, l'étape b n'écrit plus rien et l'étape d ré-ancre tous les candidats (coût : appels « IDs only » supplémentaires).
- **S2** : 0027 point 1.3 fait noter par le Decider les seuls candidats ancrés ; la spec P0 (contrainte 7) retenait l'ordre inverse (le modèle note tout, le code écarte ensuite), pour que l'ensemble présenté au modèle ne trahisse pas un verdict. Cette décision suit 0027, décision de Samuel, et ne tranche pas l'écart avec P0.
- **S3** : `CLAUDE.md` interdit encore de « stocker autre chose que l'identifiant d'un lieu Google », sans l'exception de 30 jours pour les coordonnées que la règle provisoire admet. La modification des règles du studio est réservée à Samuel : le cache du point 6 n'est créé par B8 qu'une fois `CLAUDE.md` aligné.

## Conséquences
- Le handover back-end remplace la section « En attente de Q5 » par « Partie Q5 » (§ 5, § 6, § 8, § 10, § 15).
- La décision 0009 (point 3) et la décision 0010 (principes 6 et 8, comportement intérimaire) sont amendées par les points 3 et 5 ci-dessus ; leurs textes seront alignés par la prochaine PR qui les touche.
- B8 et B9 peuvent être spécifiés sans attendre la validation juridique formelle de Q5 ; ils restent soumis à leurs autres prérequis (G0, Q3, Q45, P0-Q9).

## Quand revoir cette décision
À la validation juridique formelle de Q5 (Samuel), à la réponse sur S1 à S3, ou si la mesure comparée des variantes A et B change le pipeline (0027).
