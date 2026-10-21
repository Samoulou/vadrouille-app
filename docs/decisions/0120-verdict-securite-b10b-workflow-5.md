# 0120 — Verdict de la Sécurité sur la composition du workflow 5 `batchRecompute` (B10b) : ligne `batch` par tri clos, suite du déblocage en contexte système, verrous, publication sérialisée, droits de `generation_runs`, confinement

Statut : **proposée**, définitive dès sa fusion (décision 0093) · **décision de la Sécurité** (verdict demandé par 0119 § 1.9 et § 7 point 1, par la question 7 de `specs/B10-propositions-preferences.md` et par Q575 de `QUESTIONS.md` ; droits en base, isolation d'organisation, règles Google appliquées à l'état, aux prompts et au journal), sans délai de veto ; à lister dans la note de version suivante (rubrique « Décisions prises par le studio »). Elle ne tranche rien de réservé à Samuel ni au Tech Lead : l'architecture de 0119 est prise telle quelle, et ce qui toucherait au schéma au-delà d'un droit est **posé comme question**. Elle n'engage ni argent ni compte externe, ne fixe **aucun montant** (`PLAFONDS_USAGE` reste `null`, B10-PO-20), n'ouvre pas `RECALCUL_FIN_APERCU` (question 4 de la spécification, à Samuel) et ne supprime ni ne désactive aucun test. **Elle bloque la fusion de la PR B10b-serveur** jusqu'à sa propre fusion ; elle ne bloque ni #657 (B10b-migration), ni rien d'autre.

Date : 2026-10-21 · Décideur : Sécurité · Ticket : #659 · Spécification : `specs/B10-propositions-preferences.md`, « B10b », critères « B10b », question 7 · Décisions liées : 0011, 0027, 0035, 0046 (S4), 0081 (B9-TL-3, B9-TL-10, B9-TL-12), 0086 § 2.2, 0087 § 1.4, 0092 (amendée par 0109), 0105 § 1, 0112 (§ 1.6, § 3.1, § 3.4, § 3.6, § 3.7), 0113, 0117 (forme), 0119 (§ 1 à § 5)

Faits relus pour ce verdict : `main` `fd45254` (tête renvoyée par l'API le 2026-10-21) ; #656 (B10b-domaine, fusionnée, `d2baef0`) ; #657 (B10b-migration, ouverte, head `e80346c`, description et revue consolidée du 2026-10-21 20:54 UTC). **Si la PR B10b-serveur s'écarte de 0119 sur un point jugé ici, ou si #657 change avant sa fusion** (colonnes, `CHECK`, index, droits, purge), le verdict ne couvre pas le point changé : la PR le signale et la Sécurité le rejuge à sa revue, avant toute fusion ; le reste tient.

Numérotation (relue le 2026-10-21 sur `main` `fd45254` et sur les PR ouvertes #648 et #657) : `main` porte 0001 à 0117 et 0119 ; 0118 est réservée par 0116 ; aucune PR ouverte ni branche `claude/…` ne porte un 0120, attribué par le ticket #659.

**N'amende pas** : 0011 (aucune donnée Google ni dérivée dans un prompt, un journal, une trace ou un état de workflow ; seul le `placeId` stocké) ; 0027, 0092 et 0109 (exceptions existantes : coordonnées 30 jours au plus dans `place_coordinates` ; temps Routes du prototype dans le schéma `prototype`) ; 0046 S4 ; 0112 § 3.1 (droits restreints de `preference_signals`) ; 0119 (aucun choix d'architecture n'est changé ; les conditions ci-dessous s'ajoutent à ses règles).

## Contexte

0119 fixe le workflow 5 `batchRecompute` : une ligne `generation_runs` de `kind = 'batch'` par tri clos (§ 1.1, § 1.2), créée sous le verrou du tri par `completeDeck` ou par la suite du déblocage (§ 1.3), deux étapes `a` et `e` sans recherche ni ancrage (§ 1.4), une publication sous un nouveau verrou des versions, sérialisée avec le workflow 4 (§ 1.6), et un graphe d'imports sans arête nouvelle (§ 1.8). Le § 1.9 soumet six points à la Sécurité. La revue consolidée de #657 ajoute une question (position 2) : faut-il restreindre l'`UPDATE` de `vadrouille_app` sur les deux colonnes nouvelles. Le ticket #659 demande enfin si les listes du confinement de B10b-serveur demandent une capacité nouvelle.

Faits relus dans le code et qui fondent ce verdict :
- `vadrouille_app` a `SELECT, INSERT, UPDATE` **de table** sur `generation_runs` (`db/migrations/0001_securite.sql`, l. 159) ; #657 n'y change rien, donc `base_version` et `deck_closure_id` sont modifiables par toute requête de l'application. Les `UPDATE` de `generation_runs` dans `src/` n'écrivent aujourd'hui que `phase`, `step`, `step_seq`, `stop_reason`, `updated_at`, `finished_at`, `last_version`, `workflow_run_id`, `person_retry_request_ids` et `studio_retries` (dans `src/server/generation/` : `garde.ts`, `etapes.ts`, `etapes-complet.ts`, `publication.ts`, `expiration.ts`, `reconciliation.ts`, `reprise.ts` ; et `src/server/creation/commun.ts`) ; **aucun** n'écrit `kind`, `organization_id`, `trip_id`, `request_id` ni `started_at`. Seul le jeu de test `tests/support/voyages-en-base.ts` de #657 passe une ligne en `batch` par `UPDATE` de `kind`, `base_version` et `deck_closure_id` (mineurs 1 et 2 de la revue de #657).
- `deck_closures` : `SELECT, INSERT` seulement pour `vadrouille_app` (0112 § 3.7 point 3) ; aucune clôture n'est modifiable après écriture.
- `withSystemOrg` (`src/server/with-system-org.ts`) ouvre une transaction sous `vadrouille_app` avec `app.organization_id` seul, validé comme `uuid` ; la RLS ne laisse voir que cette organisation. La suite du déblocage (`src/server/payment/suite-voyage-complet.ts`) reçoit `{ entitlementId, tripId, organizationId }` de `lancerSuite` (`src/server/payment/suite.ts`), après la vérification du webhook.
- `SQL_VERROU_TRI` (`src/server/presentation/etat.ts`) est un verrou consultatif de transaction sur la clé `'vadrouille:tri:' || trip_id`, sans l'organisation ; il est pris dans `ouvrir` (`src/server/presentation/tri.ts`) après le contrôle du voyage dans l'organisation par le cadre des actions (0086 § 2.2, étape 5). `SQL_EXECUTION_APERCU`, `SQL_DEBLOQUE` et `SQL_CASES` du même module ne sont pas exportés (Q578).
- `generation_runs` porte un index unique partiel `(organization_id, trip_id, request_id) WHERE request_id IS NOT NULL` (`db/migrations/0012_creation_voyage.sql`, l. 133) : le `request_id` d'une ligne `preview` vient du client (`createTrip`, `retryGeneration`), dans la même organisation et le même voyage que la future ligne `batch`.
- `SQL_EXPIRATION` (`src/server/generation/expiration.ts`) ne filtre pas le `kind`.
- Le paquet `workflow` est admis par zone dans `src/workflows/**` ; `server-only` par zone dans `src/server/**`, et par ligne nominative pour chaque pont de `src/workflows/` (`tests/unit/confinement/listes/specificateurs.ts`, ligne de `src/workflows/voyage-complet.ts`) ; `uuidV5` existe déjà (`src/server/generation/voyage-complet.ts`).
- B10b-domaine (`src/domain/recalcul.ts`) ne lit des signaux que des identifiants (`candidatId`, `placeId`) et des valeurs maison ; aucun nom, aucune donnée Google.

## Décision

### 1. S1 — Une ligne `batch` par tri clos (0119 § 1.1, § 1.2) : **approuvée, avec quatre conditions**

La ligne ne porte que des identifiants internes et un numéro de version : aucune donnée personnelle nouvelle, aucune donnée Google. La clé étrangère composée `(organization_id, deck_closure_id)`, la `CHECK` et les deux index commençant par `organization_id` (#657) tiennent l'isolation : une ligne ne peut viser la clôture d'une autre organisation, et un voyage d'une autre organisation n'est jamais gêné.

1. **Relecture après `ON CONFLICT DO NOTHING` filtrée sur la ligne attendue** : `kind = 'batch'`, même organisation, même voyage, `deck_closure_id` = la clôture. Le `request_id` de la ligne (`uuidV5` de la clôture) partage l'index unique de `request_id` avec les lignes `preview`, dont le `request_id` vient du client : une collision (requête forgée par la personne sur son propre voyage) ne doit jamais faire démarrer le workflow 5 sur une autre ligne. Ligne attendue absente après le `DO NOTHING` : aucun démarrage, événement de journal à code fermé (§ 7), rien d'autre. Test : `recalcul: collision de request_id sans démarrage` (une ligne `preview` du même voyage porte déjà ce `request_id` ; aucun workflow démarré, aucune ligne `batch`).
2. **Version de base lue dans la transaction qui crée la ligne** (`trips.current_version`, sous le verrou du tri), jamais reçue d'une entrée (action, état du workflow, droit).
3. **Organisation et voyage d'une ligne `batch` tirés de la ligne**, jamais d'une entrée (0105 § 1 point 3) : le démarreur `demarrerRecalcul(generationRunId, organizationId)` reçoit l'organisation de la ligne réservée, et chaque étape relit la ligne sous `withSystemOrg(organizationId)` avec `kind = 'batch'` ; ligne absente dans cette organisation : échec à code fermé, sans écriture.
4. **Aucune écriture de `base_version`, `deck_closure_id`, `kind`, `organization_id`, `trip_id` ni `request_id` après l'`INSERT`** dans le code de B10b-serveur (aucune requête `UPDATE` qui les nomme). Test en base : à la fin d'une exécution `batch` (`ready`, `failed`, expirée, démarrage échoué), `base_version` et `deck_closure_id` sont ceux de l'insertion. La restriction en base suit au § 8.

### 2. S2 — Clôture et ligne `batch` écrites par la suite du déblocage en contexte système (0119 § 1.3 points 3 et 4) : **approuvées, avec sept conditions**

Écrire en contexte système, sans `userId`, est admis : c'est déjà le régime de la suite de B9d (0081 B9-TL-12 point 3), la RLS borne l'écriture à l'organisation du droit, et les deux lignes écrites ne portent que des identifiants internes et une position. L'autorité de l'écriture vient du droit vérifié (webhook signé), pas d'une personne : la suite doit donc ne rien écrire qu'un droit ne justifie.

1. **Contrôles avant le verrou** : dans la transaction du second travail, sous `withSystemOrg(organizationId)`, la suite vérifie que le voyage existe dans l'organisation **et** qu'il est débloqué (droit `tripUnlocked` de ce voyage, même requête que la lecture, `SQL_DEBLOQUE` de `src/server/presentation/etat.ts`, exportée et non recopiée). Sinon, rien n'est écrit et aucun verrou n'est pris. Le verrou du tri n'est pris qu'**après** ces contrôles (même règle que 0112 § 3.8 : aucun verrou pour le voyage d'une autre organisation).
2. **Même exécution `preview` que la lecture, par la même requête** : `SQL_EXECUTION_APERCU` exportée de `src/server/presentation/etat.ts` (Q578), jamais recopiée ; la plus grande position par la même lecture des cases (`SQL_CASES`, ou une requête du même module sur les mêmes lignes). Une copie divergente pourrait clore un tri que la personne n'a pas vu ou laisser ouvert un tri qu'elle voit clos.
3. **Clôture retrouvée par exécution et phase** (`generation_run_id`, `phase = 'preview'`), jamais par `request_id` seul : une clôture déjà écrite par `completeDeck` (autre `request_id`) est reprise telle quelle. L'écriture est `INSERT … ON CONFLICT DO NOTHING` puis relecture par exécution et phase.
4. **Ce que la suite écrit, et rien d'autre** : une ligne `deck_closures` (au plus) et une ligne `generation_runs` `batch` (au plus), plus le démarrage du workflow après validation. Aucun signal, aucune réponse, aucune proposition, aucune version. **Si la mise en œuvre doit aussi fermer une question ouverte** de l'aperçu (`preference_prompts`, comme le fait `completeDeck`), la PR le dit dans sa description et la Sécurité le juge à sa revue (point non prévu par 0119 ; observation au Tech Lead, question 3).
5. **Aperçu sans proposition** : aucune écriture (0119 § 1.3 point 3), test déjà prévu par 0119.
6. **Second travail isolé du premier** : l'erreur du second travail est attrapée dans la suite, journalisée (§ 7), jamais relancée vers `lancerSuite` ; l'erreur du premier travail (`DemarrageVoyageCompletError`) n'est **pas** attrapée par ce mécanisme et garde ses relances. Le droit n'est jamais retiré (B4-PO-15). Critère `recalcul: déblocage sans perte du voyage complet`.
7. **Démarrage échoué** : ligne close aussitôt en `failed` par écriture conditionnelle (0119 § 1.3 point 5), et **aucune réconciliation ne redémarre une ligne `batch`** : la réconciliation et `getGenerationStatus` gardent leur filtre `kind = 'full'` pour les démarrages (`src/server/generation/reconciliation.ts`). Une relance automatique repaierait.

### 3. S3 — Verrou du tri au démarrage, verrou des versions, ordre (0119 § 1.3 points 1 et 6, § 1.6 point 1) : **approuvés, avec quatre conditions**

Prendre le verrou du tri pour créer la ligne `batch` ferme la course entre la lecture des signaux et la création de la ligne ; le verrou des versions ferme la course entre deux publications. Les deux sont des verrous consultatifs **de transaction** (relâchés à sa fin), sans donnée.

1. **Chaque verrou n'est pris qu'après le contrôle de l'organisation** : action du tri, après le cadre des actions (0086 § 2.2, étape 5) ; suite du déblocage, après le S2 point 1 ; étapes du workflow, après la garde de l'étape (exécution relue dans l'organisation, 0119 § 1.6 point 1). La clé du verrou ne contient que l'identifiant du voyage : c'est ce contrôle préalable qui empêche un voyage d'une autre organisation de bloquer le tri ou la publication.
2. **Ordre unique** : verrou du tri, puis verrou des versions, jamais l'inverse (0119 § 1.3 point 6), y compris dans `publierJour` du workflow 4.
3. **Aucun appel externe sous un verrou** : aucun appel Google ni appel de modèle dans une transaction qui tient le verrou du tri ou celui des versions ; le démarrage du workflow se fait **après** la validation (0119 § 1.3 point 2). La replanification sous le verrou des versions (0119 § 1.6 point 3) est pure, avec les candidats et relectures déjà en mémoire. Un verrou tenu pendant un appel lent bloquerait toutes les actions du tri de la personne.
4. **Fonctions uniques** : `SQL_VERROU_TRI` importé de `src/server/presentation/etat.ts` ; `SQL_VERROU_VERSIONS` et `verrouillerVersions` exportés par `src/server/versions/ecrire.ts` seulement ; aucune copie de la chaîne de clé ailleurs. Test : `recalcul: verrou pris après le contrôle d'organisation` (exécution d'une autre organisation désignée par une entrée forgée : aucune ligne écrite, aucun verrou pris sur le voyage visé, code fermé).

### 4. S4 — Publication sérialisée avec le workflow 4 (0119 § 1.6) : **approuvée, avec trois conditions**

Deux exécutions concurrentes sérialisées à la publication n'ouvrent aucun flux de données nouveau : les versions passent par le module unique, et la règle « aucun lieu deux fois » est tenue sous le verrou.

1. **Module unique** : toute version du workflow 5 passe par `src/server/versions/ecrire.ts` (`author_kind` `workflow`, 0081 B9-TL-10), dans une transaction avec `trips.current_version`, `last_version` et la phase de l'exécution. Le contenu publié n'est que l'instantané du voyage (`TripSnapshot`) : `placeId` et valeurs maison, jamais une fiche, un horaire, une note ni un nom Google.
2. **Positions** : écrites seulement pour les étapes publiées, dans la transaction de publication, par la fonction existante du workflow 4 (cache `place_coordinates`, 30 jours au plus, 0027 et 0011) ; aucune autre table, aucun état, aucun journal ne reçoit une position.
3. **Fiches relues en mémoire seulement** (`CapaciteFinale.planifier`, B8a) : jamais écrites, ni dans l'état, ni dans le journal, ni dans une table de travail ; aucune ne survit à l'étape `e`.

### 5. S5 — État strict et requête `raisons` (0119 § 1.4 point 3, § 1.5 point 4) : **approuvés, avec trois conditions**

1. **`EtatLotSchema`** est un `z.strictObject` de `generationRunId`, `organizationId`, `rang` (borné à 2) et `arret?` (code fermé de `CODES_ARRET`) ; il ne porte ni jour, ni signal, ni catégorie, ni raison, ni `placeId`, ni candidat, ni compteur. Critère `workflows: aucune donnée Google dans l'état sérialisé` rejoué sur le workflow 5, avec une sentinelle de signal et de catégorie.
2. **Requête `raisons`** : construite par le module commun extrait de l'étape `e` du workflow 4 (0119 § 1.5 point 2), jamais recopiée ; entrée = les seuls remplaçants, décrits par les mêmes champs maison que pour le workflow 4 (lignes `candidates`), **jamais** par la fiche relue ni par le contenu d'une proposition au-delà de l'identifiant du candidat ; aucun signal, aucune catégorie arrêtée, aucune raison de refus, aucun texte de question. Tests : `recalcul: aucune préférence dans un prompt` (octet pour octet, critère de la spécification) et le test des sentinelles de prompts (`prompts: aucun prompt journalisé ne contient de donnée Google`, `tests/unit/ia/prompts-sentinelles.test.ts`) étendu au workflow 5 : relectures Google à sentinelles, aucune sentinelle dans la requête `raisons` du lot.
3. **Aucune autre requête de modèle** : ni `plan`, ni `recherche`, ni `notation`, ni outil, ni recherche web du fournisseur (critère `recalcul: aucun appel de modèle hors des raisons`) ; routage inchangé de la requête `raisons` existante.

### 6. S6 — Expiration écrite par les actions du tri (0119 § 1.4 point 5) : **approuvée, avec trois conditions**

Une action de la personne écrit `failed` sur une ligne `batch` figée de son propre voyage : c'est une écriture d'état, sans donnée, déjà faite par la lecture d'état d'une génération.

1. **Requête dédiée** filtrée sur `kind = 'batch'`, l'organisation et le voyage (`SQL_EXPIRATION_LOT`, ou `expirerExecutions` à paramètre de `kind` obligatoire), sous le verrou du tri, dans la transaction de l'action (contexte de la personne, `withOrg`), avant le contrôle `generation_in_progress` ; **jamais `SQL_EXPIRATION` sans filtre** depuis une action. Le test de 0119 (« une exécution `full` figée, et une `preview`, n'est pas touchée ») est exigé.
2. **Même seuil** (`EXPIRATION_EXECUTION_MS`, 20 minutes) et même écriture conditionnelle ; la réponse de l'action n'expose ni l'identifiant de la ligne expirée ni son code.
3. **`getDeckSession` n'écrit rien** (lecture seule, 0119 § 1.4 point 5).

### 7. S7 — Nouveaux événements de journal (0119 § 1.3 point 4, § 1.9) : **admis en liste fermée, avec deux conditions**

1. **Champs admis** : identifiants internes (`organizationId`, `tripId`, `generationRunId`), codes fermés (`CODES_ARRET`, codes des refus de la suite) et, au plus, des entiers positifs ou nuls fonctions **des seuls signaux du tri et de la version de base** (nombre de jours touchés). Chaque événement nouveau entre dans la liste fermée de `src/server/log.ts` avec son test d'égalité, comme 0114.
2. **Champs refusés** : tout nom (de l'IA ou de Google), `placeId`, position, horaire, note, catégorie, raison de refus, texte de question, durée, et tout compteur qui dépend des réponses de Google (remplaçants trouvés, candidats écartés par la relecture, créneaux laissés en `openMeal` faute de relecture) : ce serait un compte dérivé de l'ancrage (0046 S4, 0011 § 2). La durée du recalcul en simulé (B10-PO-17) est notée dans la description de la PR, pas dans le journal.

### 8. S8 — Restriction de l'`UPDATE` de `vadrouille_app` sur `base_version` et `deck_closure_id` (question 2 de la relecture de #657) : **oui, par une migration ultérieure, qui ne bloque pas B10b-serveur**

**Oui** : les deux colonnes ne doivent jamais changer après l'écriture de la ligne. `deck_closure_id` désigne le tri dont les signaux décident des jours touchés, `base_version` la version contre laquelle ils sont calculés ; une valeur changée en cours d'exécution ferait recalculer d'autres jours que ceux du tri, ou rattacherait le recalcul à un autre tri. C'est le principe déjà appliqué aux signaux (0112 § 3.1 : « aucune autre colonne d'un signal ne change jamais après son écriture ») et aux clôtures (`INSERT` seulement). Le risque actuel est **borné** : l'organisation par la clé étrangère composée et la RLS, une seconde ligne pour la même clôture par l'index, et aucune requête de `src/` n'écrit ces colonnes (S1 point 4). Il ne justifie donc pas de bloquer B10b-serveur, mais il justifie le droit restreint, en défense en profondeur.

**Pas dans B10b-serveur** : cette PR est du rôle backend et ne touche pas `db/` (0119 § 5.2) ; une migration y ajouterait un second numéro de migration au cycle de B10b et croiserait la règle du § 5.3 point 3 de 0119.

**Dans une migration ultérieure du rôle data** (prochain numéro libre après `0015_recalcul_lot`), sur un ticket à ouvrir par le CEO (ordre des tâches), qui :
1. retire l'`UPDATE` de table de `vadrouille_app` sur `generation_runs` et accorde `UPDATE` **sur une liste de colonnes** qui exclut **au moins** `base_version` et `deck_closure_id` ; la Sécurité recommande d'exclure aussi `kind`, `organization_id`, `trip_id`, `request_id` et `started_at`, qu'aucune requête de `src/` n'écrit (relevé ci-dessus ; étendue au-delà des deux colonnes : question 1 au Tech Lead) ; la liste accordée est relevée sur `main` au moment de la PR, à partir des `UPDATE` de `src/` (y compris ceux de B10b-serveur) ;
2. corrige le jeu `tests/support/voyages-en-base.ts` pour écrire une ligne `batch` directement par `INSERT`, avec une clôture rattachée à l'exécution `preview` (mineurs 1 et 2 de la revue de #657), puisque son `UPDATE` de `kind`, `base_version` et `deck_closure_id` serait refusé ;
3. ajoute les tests de base de 0112 § 6 (forme) : un `UPDATE` de `base_version` ou de `deck_closure_id` par `vadrouille_app` est refusé (`42501`) ; chaque `UPDATE` du code reste permis ; `tests/db/roles.test.ts` attend les nouveaux droits ; migration inverse qui rend l'`UPDATE` de table ;
4. **passe par `MIGRATIONS_APPROUVEES` de `db-migrate`, avec l'`owner-approved` de Samuel seul** (0035, 0056 § 3), pour son application à la base de préversion.

**Échéance** : cette migration est une condition de la Sécurité **avant toute PR qui rend un recalcul réel possible** (profil `lot` non nul dans `PLAFONDS_USAGE`, ou `RECALCUL_FIN_APERCU` à `true`) ; d'ici là, aucun recalcul réel n'a lieu (0119 § 4.2). Elle ne décide ni de ces PR ni de leur date, qui restent à Samuel (questions 3 et 4 de la spécification).

Le droit `SELECT (kind)` de `vadrouille_fn_purge` (#657, position 1 de sa revue) est **confirmé** : colonne d'énumération non personnelle, nécessaire à l'ordre de la purge.

### 9. S9 — Listes du confinement de B10b-serveur (0119 § 1.8) : **aucune capacité nouvelle ; une seule ligne nominative attendue**

Le pont `src/workflows/recalcul.ts` (nouveau, B10b-serveur) a la forme de `src/workflows/voyage-complet.ts` : directives d'étape, imports de `src/server/generation/` et de `server-only`, aucun module à capacité. Les modules nouveaux de `src/server/` (`src/server/generation/etapes-lot.ts`, `src/server/generation/signaux.ts`, le module commun de l'étape `e`, `src/server/config/recalcul.ts`, tous à créer par B10b-serveur) sont couverts par la zone `src/server/**` de `server-only` ; `uuidV5` et son espace de noms sont réutilisés, sans import nouveau de `node:crypto` ; aucun paquet nouveau.

La Sécurité exigera à la relecture :
1. **dans `tests/unit/confinement/listes/`, une seule ligne ajoutée** : la ligne nominative de `tests/unit/confinement/listes/specificateurs.ts` pour `src/workflows/recalcul.ts`, `server-only`, `noms: ["effet"]`, sur le modèle de celle de `src/workflows/voyage-complet.ts`, avec un motif qui cite le ticket de B10b-serveur, 0119 § 1.8 et cette décision ; **aucune ligne** dans `capacites.ts`, `paquets.ts`, `process.ts` ni `formes-tests.ts` ;
2. **aucune ligne d'`ARETES_ADMISES`** (`tests/unit/p0/imports.test.ts`) ; `./recalcul` ajouté à `IMPORTS_TERMINAL_WORKFLOWS` et le pont à la règle `ligne/creation-imports` (`eslint.config.mjs`, `tests/unit/lint/creation-imports-lint.test.ts`), sans autre changement de ces règles ;
3. **si une capacité ou une arête se révèle nécessaire** (lecture de fichier, `process`, réseau, paquet, nouvelle arête), la PR la dit dans sa description avec ses cas fabriqués (modèle de 0081 B9-TL-1 points 3 et 4) : la ligne n'est pas couverte par ce verdict et la Sécurité la juge à sa revue, avant toute fusion.

## Conditions pour la PR B10b-serveur (récapitulatif vérifié à la revue Sécurité)

- La description cite ce verdict et dit, point par point, où chaque condition est tenue (fichier et test).
- S1 : relecture après `DO NOTHING` filtrée sur `kind = 'batch'` et la clôture ; test de collision de `request_id` ; version de base lue sous le verrou ; organisation tirée de la ligne ; aucune écriture de `base_version`, `deck_closure_id`, `kind`, `organization_id`, `trip_id`, `request_id` après l'`INSERT`, avec son test en base.
- S2 : voyage et déblocage contrôlés (requête `SQL_DEBLOQUE` exportée) avant le verrou ; `SQL_EXECUTION_APERCU` et la lecture des cases exportées, jamais recopiées ; clôture retrouvée par exécution et phase ; au plus deux lignes écrites ; toute autre écriture dite dans la description ; second travail isolé ; aucune réconciliation d'une ligne `batch`.
- S3 : verrous après le contrôle de l'organisation, ordre tri puis versions, **aucun appel externe sous un verrou**, démarrage après validation ; test du verrou sur une entrée forgée.
- S4 : module unique d'écriture ; positions seulement par la fonction existante, dans la transaction de publication ; fiches en mémoire seulement.
- S5 : état strict ; requête `raisons` du module commun, entrée maison des seuls remplaçants ; tests octet pour octet et canari.
- S6 : expiration dédiée au `kind = 'batch'`, contexte de la personne, `full` et `preview` intactes.
- S7 : événements en liste fermée, identifiants, codes et entiers fonctions des signaux seulement.
- S9 : une seule ligne nominative dans les listes du confinement ; aucune capacité, aucune arête.
- Toujours : aucune donnée Google dans le diff, les fixtures, les journaux, les traces, l'état ni les prompts, hormis des sentinelles fabriquées ; seul le `placeId` est écrit (exceptions 0027, 0011, 0092 amendée par 0109, inchangées) ; aucune clé lue dans les tests, aucun appel réseau réel, doubles seulement ; le studio ne lance aucun appel payant ; `PLAFONDS_USAGE` reste `null` et les valeurs du profil `lot` restent des valeurs de test (0119 § 4.1 point 3) ; `RECALCUL_FIN_APERCU` reste `false` ; barrière B9-TL-8 vérifiée à l'entrée de chaque étape.

## Ce que cette décision ne tranche pas

- L'architecture de B10b (0119, Tech Lead) : étapes, verrous, découpage, profil `lot` ; ce verdict y ajoute des conditions, il n'en change aucun choix.
- L'étendue de la restriction de l'`UPDATE` au-delà de `base_version` et `deck_closure_id` (question 1) et l'ordre du ticket de migration (CEO).
- Ce qui est réservé à Samuel : montant et appartenance du plafond d'un recalcul (question 3 de la spécification), ouverture de `RECALCUL_FIN_APERCU` (question 4), approbation des migrations dans `db-migrate` (0015 et la migration du § 8).
- Les règles de produit renvoyées au Product Owner par 0119 § 7 (Q576).
- La composition de B10d (propositions `deck` écrites à l'étape `e`) et de B10f (version `travelBudget`) : chacune demande son propre verdict (« Revue » de la spécification).

## Questions ouvertes (à reporter par le CEO dans `QUESTIONS.md`)

1. **Tech Lead** (schéma ; ne bloque pas B10b-serveur) : la migration du § 8 doit exclure de l'`UPDATE` de `vadrouille_app` au moins `base_version` et `deck_closure_id`. Étends-tu l'exclusion à `kind`, `organization_id`, `trip_id`, `request_id` et `started_at`, qu'aucune requête de `src/` n'écrit (recommandation de la Sécurité : oui) ?
2. **CEO** (ordre des tâches ; ne bloque pas B10b-serveur) : ouvrir le ticket `[data]` de la migration du § 8 (restriction de l'`UPDATE` de `generation_runs`, correction du jeu `tests/support/voyages-en-base.ts`), après la fusion de #657 et hors du cycle de toute autre PR de migration (0119 § 5.3 point 3). Condition de la Sécurité : fusionnée avant toute PR qui rend un recalcul réel possible.
3. **Tech Lead** (observation ; ne bloque pas) : quand la suite du déblocage écrit la clôture de l'aperçu, une question de préférence peut rester `open` (`completeDeck` la ferme, la suite ne le fait pas d'après 0119 § 1.3 point 3). Faut-il que la suite la ferme aussi ? Si oui, la PR B10b-serveur le dit et la Sécurité le juge à sa revue (S2 point 4).

## Quand revoir

- À la revue de B10b-serveur, pour tout point où le code s'écarte de 0119 ou de ce verdict.
- Si #657 change avant sa fusion (droits, purge, contraintes).
- À la PR de la migration du § 8 (liste des colonnes accordées).
- Si une reprise d'un recalcul échoué est mise en œuvre (0119 § 1.2 point 3) : elle réutiliserait la ligne échouée et réécrirait sa version de base, donc l'exception à la restriction du § 8 demandera un nouveau verdict.
- À B10d et B10f (nouvelles écritures dans l'étape `e` et seconde version), et si B11 écrit des versions par un autre chemin.
- Si « trier à deux » entre dans le périmètre (verrou du tri, contexte d'écriture).
