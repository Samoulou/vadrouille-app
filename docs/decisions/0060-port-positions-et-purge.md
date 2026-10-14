# 0060 — Port du cache de positions et purge du MVP (B8-TL-2, B8-TL-3)

Statut : décision déléguée (architecture, outillage, tests : « Qui décide quoi » de `docs/CONTEXT.md`), à lister dans la note de version suivante (rubrique « Décisions prises par le studio ») ; définitive sans veto de Samuel dans les 2 jours qui suivent cette publication · Date : 2026-10-14 · Décideur : Tech Lead · Spécification `specs/B8-ancrage.md` (#301, fusionnée, ticket #299), propositions B8-TL-2 et B8-TL-3 · Ticket de cette décision : #333

**N'entrent pas dans ce régime** et attendent une réponse écrite : ce qui touche un compte externe ou un secret (rôle de connexion sur la base Neon, son mot de passe, environnement GitHub et ses secrets : question ouverte 1 à Samuel) ; les verdicts de la Sécurité (question ouverte 2), qui bloquent la fusion de B8c ; la forme de la migration (question ouverte 3 au rôle data).

Numérotation (vérifiée le 2026-10-14) : `main` va de 0001 à 0059 ; aucune PR ouverte (#326, #330, #332) n'ajoute un 0060.

**Amende** : **0011 § 6** (écriture « derrière le port de `src/grounding` » au lieu de « appelée par `src/grounding` » ; expiration du MVP à 29 jours ; purge planifiée propre au MVP ; `EXECUTE` de `purge_expired_coordinates` à un rôle de plus), renvoi ajouté en tête de 0011. **Précise** 0059 § 5 points 1 et 3 (nom du fichier de type ; module de lecture commun à B6a et B8c). Ne change ni 0046 (D16, S8), ni 0052, ni 0056.

## Contexte
B8c (0059 § 3) livre le port du cache `place_coordinates`, l'expiration et la purge propres au MVP. La spécification B8 laisse au Tech Lead le nom du module (B8-TL-2) et le choix de l'expiration et du mécanisme de purge (B8-TL-3), avant le code de B8c.

État vérifié sur `main` (`b06b3ba`) :
- `db/migrations/0002_place_coordinates.sql` : table, `CHECK (expires_at <= fetched_at + interval '30 days')`, lecture de `vadrouille_app` limitée aux lignes vivantes de l'organisation (jamais `org_prototype`), `store_place_coordinates(text, double precision, double precision)` qui pose `expires_at = now() + 30 jours` et purge par lot de 500, `purge_expired_coordinates()` (`EXECUTE` à `vadrouille_app` et `vadrouille_fn_prototype_purge`). Dernière migration au journal : `0005_prototype_coordinates_run`.
- `.github/workflows/p0-purge.yml` (0046 D16 point 7) appelle `prototype.purge_expired()`, qui appelle `purge_expired_coordinates()` pour toutes les organisations, toutes les 6 heures ; il disparaît avec la phase 0.
- Aucun module de `src/` ne nomme `store_place_coordinates` ni `purge_expired_coordinates`. `withOrg` (`src/server/with-org.ts`, B3b) n'existe pas encore.

## Décision

### 1. B8-TL-2 — Port `PortPositions`

#### 1.1 Type (0059 § 5 point 1)
- **Fichier unique** : `src/grounding/port-positions.ts`, créé par B8c. Déclarations de type seules : aucune valeur, aucune fonction, aucune constante exportée.
- **Imports** : `import "server-only"` (exigé par la règle `ligne/require-server-only` sur tout `src/grounding`) et `import type { Coordonnees } from "@/grounding/interfaces"`. Rien d'autre. Ces deux imports sont dans la liste blanche de `src/grounding` (handover § 3) ; c'est ce que 0059 § 5 point 1 entendait par « sans import hors de `@/contracts` » : aucune dépendance vers `src/server`, `db/` ou une bibliothèque.
- **Forme** (noms fixés ; commentaires libres) :
  ```ts
  export type CodeEchecPositions = "entree_invalide" | "perimees" | "base";
  export type ResultatPositions<T> =
    | { readonly ok: true; readonly valeur: T }
    | { readonly ok: false; readonly code: CodeEchecPositions; readonly retryable: boolean };
  export type PortPositions = {
    /** Positions vivantes de l'organisation courante ; un placeId absent du cache est absent de la Map. */
    lire(placeIds: readonly string[]): Promise<ResultatPositions<ReadonlyMap<string, Coordonnees>>>;
    /** Écrit des positions tirées d'une réponse Google obtenue au plus tôt à `obtenuesA` (ms depuis l'époque Unix). */
    ecrire(positions: ReadonlyMap<string, Coordonnees>, obtenuesA: number): Promise<ResultatPositions<void>>;
  };
  ```
- B8a le reprend tel quel ; sa règle en liste blanche le couvre. Aucun autre fichier de `src/grounding` n'est touché par B8c. Si B8-TL-1 fixe plus tard un type de résultat commun à `src/grounding`, ce fichier n'en change pas : un second type ne serait qu'un alias.

#### 1.2 Lecture : un seul module (0059 § 5 point 3)
- **`src/server/positions/lecture.ts`** (`import "server-only"`) : une seule fonction exportée, `lirePositions(executeur, placeIds)`, qui rend une `ReadonlyMap<string, { lat: number; lng: number }>` ou lève `EchecPositions` (code fermé et SQLSTATE seuls, comme `EchecEcritureProgramme` de `src/adapters/prototype-ecriture.ts`).
- Requête unique en paramètres liés : `SELECT place_id, lat, lng FROM public.place_coordinates WHERE place_id = ANY($1::text[])`. **Aucun filtre ni paramètre d'organisation** : la RLS seule borne à l'organisation courante et aux lignes vivantes, et exclut `org_prototype` (B6-TL-4, 0011 § 6). Liste vide : aucune requête, `Map` vide. Au plus 500 identifiants par appel, chacun conforme à `^[A-Za-z0-9_-]{1,256}$` (forme du `CHECK`) ; sinon `entree_invalide` sans requête.
- **Qui le crée** : la première des deux PR fusionnées, B6a ou B8c. Si c'est B6a, ce fichier entre dans ses « modules de `src/server` » (0059 § 3) et `getDayMap`/`getTripMap` l'appellent ; B8c le reprend sans le réécrire. Si c'est B8c, B6a l'importe. Le Tech Lead le vérifie à la revue de la seconde. **B6a et B8c ne sont pas assignées dans le même cycle** (fichier commun) ; le CEO le vérifie à l'assignation.
- C'est la lecture de la voie serveur (B6-PO-18 : elle ne relit rien chez Google). Le choix de la voie de B6 et B12 reste à B8-TL-9.

#### 1.3 Implémentation du port
- **`src/server/positions/cache-positions.ts`** (`import "server-only"`), créé par B8c. Une seule exportation : `creerPortPositions(executeur): PortPositions`.
- **`executeur`** : le client de la transaction **déjà ouverte par `withOrg`**, contexte d'organisation posé. Le module **n'ouvre aucune connexion ni transaction**, ne pose aucun `set_config`, ne reçoit jamais un pool ni un identifiant d'organisation. Type : celui que `withOrg` passe à son rappel si B3b est fusionnée au moment de B8c ; sinon le type structurel minimal `{ query(texte: string, valeurs: readonly unknown[]): Promise<{ rows: readonly Record<string, unknown>[] }> }` (forme de `ClientSql`, `src/server/usage/neon.ts`, sans `release`). B8c **n'attend pas B3b** : ses tests de base posent le contexte dans une transaction de test sous `vadrouille_app`, par paramètres liés, comme le fera `withOrg` (B3 point 8) ; si B3b est fusionnée avant B8c, ils utilisent `withOrg`.
- **`lire`** appelle `lirePositions` (§ 1.2) et convertit son échec en `{ ok: false }`.
- **`ecrire`** :
  1. contrôles en mémoire, avant toute requête, qui refusent **tout le lot** (`entree_invalide`, `retryable: false`) : au plus 500 entrées ; `placeId` conforme à la forme du § 1.2 ; `lat` ∈ [−90 ; 90] et `lng` ∈ [−180 ; 180], finis ; `obtenuesA` entier sûr ;
  2. **fraîcheur** : `perimees` (`retryable: false`), rien n'est écrit, si `Date.now() − obtenuesA` dépasse **60 minutes** ou si `obtenuesA` est plus d'une minute dans le futur. La composition prend `obtenuesA` **avant** l'appel de fiches qui a rendu ces positions (au plus tôt : jamais après la réponse) ;
  3. une requête en paramètres liés : `SELECT public.store_place_coordinates(p, la, ln) FROM unnest($1::text[], $2::double precision[], $3::double precision[]) AS t(p, la, ln)`. `fetched_at` et `expires_at` restent posés par la fonction (0011 § 6) ;
  4. erreur de la base : `base`, `retryable` vrai pour les classes SQLSTATE `08` et `40`, faux sinon. Jamais le message, les paramètres ni l'erreur d'origine (0052 § 1.8).
- **Règle du contenu écrit** (0011 § 6 : « ne peuvent pas être prolongées sans nouvelle réponse de Google ») : `ecrire` ne reçoit que des positions tirées d'une réponse Place Details obtenue dans la même opération. **Une position rendue par `lire` n'est jamais passée à `ecrire`.** Le port ne peut pas le vérifier : c'est un critère de B8b et de B9 (§ 4).
- **Moment d'écriture** (proposition de B8-TL-2, retenue) : en génération, dans la transaction de l'étape e qui écrit la version, pour les seuls `placeId` de la version publiée, depuis les fiches de cette étape (comme 0052 § 1.1 : une génération arrêtée n'écrit rien, le nombre de lignes est celui des lieux de la version) ; à la lecture, après la fiche d'une position absente du cache. Une lecture de B6a est en transaction `READ ONLY` (B6-TL-4) : une écriture de lecture passe par une **autre** transaction `withOrg`, ouverte par la composition de B8b (forme : B8-TL-9).

#### 1.4 Règles d'import et de nommage (testées par B8c)
- `@/server/positions/cache-positions` : importé seulement par `src/server/voyages/**`, `src/server/relecture/**`, `src/workflows/**` et les tests. Jamais par `src/grounding`, `src/ai`, `src/research`, `src/domain`, `src/adapters`, `src/app`, `src/features`, `src/components`, `src/mocks`. Le port est **injecté** dans `src/grounding` par la composition (`positionsDuJour` le reçoit en paramètre).
- `@/server/positions/lecture` : importé seulement par `cache-positions.ts`, `src/server/voyages/**` et les tests.
- `@/grounding/port-positions` : `import type` seulement, hors de `src/grounding`.
- La chaîne `store_place_coordinates` n'apparaît, hors de `db/`, `tests/db/` et `tests/support/` (données de test de B6a, B6-TL-6), que dans `cache-positions.ts`. La chaîne `purge_expired_coordinates` n'apparaît dans aucun fichier de `src/`. Aucun littéral de chaîne d'un fichier de `src/` autre que `lecture.ts` ne contient `\bplace_coordinates\b` (nom de la table ; `store_place_coordinates` n'y répond pas, les commentaires ne comptent pas).
- Mise en œuvre : blocs `no-restricted-imports` de `eslint.config.mjs` et test sous `tests/unit/lint/` ou `tests/unit/imports`, au choix de B8c.

#### 1.5 Amendement de 0011 § 6
« Réservé à `src/grounding` » et « appelée par `src/grounding` » se lisent : **derrière le port `PortPositions` de `src/grounding`**, implémenté par le seul `src/server/positions/cache-positions.ts`, et lu par le seul `src/server/positions/lecture.ts`. L'exception de 0052 § 1.10 (`src/adapters/prototype-ecriture.ts`, pour `store_prototype_coordinates`) ne change pas.

### 2. B8-TL-3 — Expiration à 29 jours
- **Retenu : 29 jours** pour les positions du MVP, comme le prototype (0046, « S8 (suite) »). Avec 30 jours, la suppression physique ne peut avoir lieu qu'après 30 jours : l'obligation « au plus tard 30 jours après leur obtention » (0011 § 6) n'est pas tenable.
- **Durée maximale réelle** d'une position du MVP dans la base vivante : délai entre la réponse Google et l'écriture (au plus 60 minutes, § 1.3 point 2) + 29 jours + intervalle jusqu'à la première purge réussie. Elle reste sous 30 jours tant que deux purges réussies ne sont jamais séparées de plus de **23 heures**. La surveillance du § 3.5 garde l'écart sous 18 heures.
- `now()` de PostgreSQL est l'heure du début de la transaction : il est postérieur à `obtenuesA`, donc `fetched_at` se lit « au plus tard », et le `CHECK` de 30 jours reste vrai. Le délai entre la réponse et le `COMMIT` est borné par le contrôle de fraîcheur.
- **Migration** (rôle data, B8c) : le **prochain numéro libre au journal au moment de B8c** (aucun numéro n'est figé ici ; 0059 § 4 : pas dans le même cycle qu'une autre PR qui ajoute une migration). Contenu :
  1. `store_place_coordinates` recréée avec la **même signature**, le même corps et les mêmes garanties (`SECURITY DEFINER`, `search_path` fixé, refus sans organisation et pour `org_prototype`, purge par lot de 500), seule change l'expiration : `interval '29 days'`. Propriétaire `vadrouille_fn_coords` ; `EXECUTE` à `vadrouille_app` seul ; `REVOKE ALL … FROM PUBLIC` réécrit ;
  2. le `CHECK` de 30 jours **ne change pas** (plafond de la règle de Samuel, 0027) ;
  3. le rôle de purge et ses droits (§ 3.2) ;
  4. aucune ligne existante n'est modifiée : aucun module de `main` n'appelle `store_place_coordinates` hors des tests, donc la base réelle n'a aucune ligne du MVP (constat à refaire par data dans la PR, question 3).
- Application à la base réelle : seulement par un lot approuvé selon 0056 § 3, après la réexécution de l'amorçage des rôles (§ 3.2), sans quoi la migration échoue sur un rôle absent.
- Coût : le cache sert un jour de moins sur 30, au plus environ 3 % de fiches de position en plus à la lecture. Aucun plafond ni forfait ne change ; les plafonds en vigueur bornent la dépense.
- Alternatives écartées : purger à 29 jours des lignes encore lisibles jusqu'à 30 jours (deux notions d'expiration ; `purge_expired_coordinates` ne supprime que des lignes expirées, 0011 § 6) ; garder 30 jours et compter sur la purge par lot à l'écriture (sans écriture, rien n'est purgé).

### 3. B8-TL-3 — Purge planifiée propre au MVP

#### 3.1 Workflow `.github/workflows/coords-purge.yml`
Sur le modèle de `p0-purge.yml` (0046 D16 point 7), avec ces valeurs :
- déclencheurs `schedule`, `cron: "17 3-21/6 * * *"` (03:17, 09:17, 15:17, 21:17 UTC : toutes les 6 heures, décalé de 3 heures sur `p0-purge.yml`), et `workflow_dispatch` seulement ;
- `permissions: {}` ; `concurrency: { group: coords-purge, cancel-in-progress: false }` ; un seul job, `if: github.ref == 'refs/heads/main'`, `runs-on: ubuntu-24.04`, `environment: coords-purge`, `timeout-minutes: 5`, une seule étape ;
- ni action `uses:`, ni checkout, ni installation de paquets ; `psql -X -v ON_ERROR_STOP=1` du runner, sans argument de connexion, sortie redirigée (`>/dev/null 2>&1`), seul le code de sortie affiché ;
- variables libpq de l'étape seule : `PGHOST`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` tirées des secrets `COORDS_PURGE_PGHOST`, `COORDS_PURGE_PGDATABASE`, `COORDS_PURGE_PGUSER`, `COORDS_PURGE_PGPASSWORD` de l'environnement `coords-purge` ; `PGSSLMODE: verify-full`, `PGSSLROOTCERT: system`, sans repli sur `require` ;
- requête : bloc `DO` qui lève une exception si `session_user <> 'vadrouille_coords_purge'`, puis `SELECT public.purge_expired_coordinates();`, seule instruction de données ;
- **le texte du fichier, commentaires compris, ne contient ni `p0-purge` ni `P0_PURGE_`** : le test existant `ci: l'environnement p0-purge n'est nommé que par p0-purge.yml` lit tout le texte des autres workflows ;
- PR de workflow : `owner-approved` posé par Samuel (0035).

#### 3.2 Rôle `vadrouille_coords_purge`
- Rôle de connexion (`LOGIN`, `NOSUPERUSER`, `NOBYPASSRLS`, `NOCREATEDB`, `NOCREATEROLE`, `NOREPLICATION`), ajouté à la liste de `db/bootstrap/roles.sql` (17 rôles) et à son `GRANT CONNECT`. Aucune appartenance, dans aucun sens.
- Droits, posés par la migration du § 2 : `USAGE` sur le schéma `public` (retiré à `PUBLIC` par `0000_socle`) et `EXECUTE` sur `public.purge_expired_coordinates()`. **Rien d'autre** : aucun droit sur une table, une vue, une séquence, une autre fonction, ni sur le schéma `prototype`. La fonction ne prend aucun paramètre et ne supprime que des lignes expirées, de toutes les organisations.
- L'amorçage est réexécuté sur chaque base avant l'application de la migration (CI : job `db`, déjà dans cet ordre ; base réelle : question 1).

#### 3.3 Activation
- **Fusion de B8c** : n'attend ni le rôle sur la base réelle, ni l'environnement, ni les secrets. Avant leur pose, le job échoue à chaque passage : ces échecs sont attendus, comme pour `p0-purge.yml`.
- **Activation**, dans l'ordre : réexécution de `db/bootstrap/roles.sql` sur la base réelle ; mot de passe du rôle (procédure S5 de 0046 : SCRAM, jamais en clair) ; environnement GitHub `coords-purge` (branche de déploiement `main` seule, sans relecteur obligatoire : un relecteur bloquerait chaque passage planifié) et ses quatre secrets ; approbation du lot qui contient la migration du § 2 (0056 § 3) et application par `db-migrate` ; `workflow_dispatch` et premier succès relevé. Qui fait les trois premiers points : question 1.

#### 3.4 Coexistence avec `p0-purge.yml` jusqu'à la fin de la phase 0
- Les deux workflows tournent. `p0-purge.yml` n'est pas modifié : il continue d'appeler `purge_expired_coordinates()` par `prototype.purge_expired()` (0046 D16 point 3). Les deux purges sont idempotentes ; le décalage de 3 heures évite qu'elles se chevauchent, et ensemble elles purgent toutes les 3 heures environ.
- Rôles, environnements, secrets et groupes de concurrence sont distincts : aucun workflow ne nomme l'environnement ou les secrets de l'autre (deux tests, § 4).
- **Conditions** (le CEO les vérifie) : (a) **aucune écriture du MVP sur la base réelle** (composition qui appelle `ecrire` hors de la CI : B8b, B9) **avant le premier succès de `coords-purge.yml`** ; (b) la PR qui retire `p0-purge.yml` à la fin de la phase 0 n'est fusionnée qu'avec `coords-purge.yml` activé et surveillé depuis au moins un cycle.

#### 3.5 Surveillance (CEO), comme S8
À chaque cycle, dès le premier succès : date du dernier succès (`gh run list --workflow coords-purge.yml --status success --limit 1`, aucune valeur secrète). Au-delà de 12 heures sans succès : `workflow_dispatch`. Au-delà de 18 heures : signalé à Samuel comme bloquant (risque de dépasser 30 jours, § 2). Un workflow planifié désactivé par GitHub après 60 jours sans activité du dépôt public se voit comme une absence de succès ; le CEO le réactive (`gh api -X PUT repos/Samoulou/vadrouille-app/actions/workflows/coords-purge.yml/enable`) et le signale. Le MVP n'a pas de refus de lecture lié à la purge (contrairement à 0046 D16 point 8) : une ligne expirée n'est déjà plus lisible (RLS), seule la suppression physique est en jeu.

#### 3.6 Alternatives écartées
- Garder `p0-purge.yml` après la phase 0 : son rôle a des droits sur le schéma `prototype`, qui disparaît avec la phase 0.
- Cron Vercel ou tâche de l'application : API propre à Vercel (0002), et un secret de purge dans l'environnement de l'application (0011 § 6).
- Purge par `vadrouille_app` : rôle de l'application, jamais posé dans un secret de GitHub.

### 4. Tests imposés à B8c
- Critères `coordonnées:` de la spécification B8 (lignes 134 à 137), avec ces précisions : durée posée égale à **29 jours** ; `vadrouille_app` n'écrit ni ne supprime directement ; écriture d'un même `placeId` dans A sans effet sur B ; une ligne d'`org_prototype` jamais rendue par `lire`.
- `coordonnées: écrites par un seul module, en paramètres liés` : règles du § 1.4 ; client `pg` simulé : aucune sentinelle de `placeId` ni de coordonnée dans le texte des requêtes de `lecture.ts` et de `cache-positions.ts`.
- `coordonnées: lot refusé en entier` : une entrée hors forme, une coordonnée hors bornes ou plus de 500 entrées, aucune requête ; `perimees` à 60 minutes et une seconde, aucune requête ; 59 minutes : écriture.
- `coordonnées: erreur réduite à son code` : ni message, ni paramètre, ni SQLSTATE hors des classes du § 1.3.
- `purge: coordonnées supprimées au plus tard à 30 jours` : test statique de `coords-purge.yml` sur le modèle de `tests/unit/ci/p0-purge.test.ts` (clés, déclencheurs et `cron` exacts, `permissions: {}`, concurrence, un job et une étape, `ubuntu-24.04`, aucune action `uses:`, secrets `COORDS_PURGE_PG*` dans l'étape seule, `verify-full` et `system`, `psql` sans argument de connexion, `session_user` vérifié avant l'unique `SELECT`, sortie redirigée) ; `ci: l'environnement coords-purge n'est nommé que par coords-purge.yml`.
- `purge: le rôle de purge du MVP ne fait que purger` (base de service) : `vadrouille_coords_purge` a `EXECUTE` sur `purge_expired_coordinates()` et sur aucune autre fonction des schémas `public` et `prototype` ; `has_table_privilege` faux pour toute table ; aucun `USAGE` sur `prototype` ; aucune appartenance ; sous ce rôle, la purge supprime les lignes expirées de deux organisations et aucune ligne vivante, et un `SELECT` direct sur `place_coordinates` est refusé.
- Tests existants amendés : liste des rôles de l'amorçage et du test égales (17) ; `rôles: aucun rôle ne contourne la RLS` étendu ; `fonctions: SECURITY DEFINER durcies` : `EXECUTE` de `purge_expired_coordinates` à `vadrouille_app`, `vadrouille_fn_prototype_purge` et `vadrouille_coords_purge` ; de `store_place_coordinates` à `vadrouille_app` seul. `p0: positions et programmes expirent à 29 jours` inchangé.
- **Pour B8b et B9** (pas pour B8c) : `coordonnées: une position lue n'est jamais réécrite` (double du port : une position servie par `lire` n'est jamais passée à `ecrire`) et `coordonnées: écrites avec la version publiée seulement` (génération arrêtée : aucun appel à `ecrire`).

## Conséquences
- **B8c** peut commencer dès la fusion de cette décision (0059 § 4) ; elle n'attend pas B3b (§ 1.3). Ses fichiers : `src/grounding/port-positions.ts`, `src/server/positions/cache-positions.ts`, `src/server/positions/lecture.ts` (si B6a ne l'a pas créé), une migration, `db/bootstrap/roles.sql`, `db/README.md`, `.github/workflows/coords-purge.yml`, `eslint.config.mjs`, les tests. Le critère « aucun autre module de `src/server` n'est créé » de la spécification B8 se lit avec ces deux modules.
- **B6a** : si elle précède B8c, elle crée `src/server/positions/lecture.ts` selon le § 1.2 au lieu d'une lecture dans `src/server/voyages/`.
- **CEO** : B6a et B8c pas dans le même cycle ; B8c ni avec B7c ni avec une PR qui ajoute une migration (0059 § 4) ; signale la PR de workflow dans `#studio` (0035) ; surveillance du § 3.5 dès le premier succès ; conditions du § 3.4 ; liste cette décision dans la note de version suivante ; reporte les questions ci-dessous dans `QUESTIONS.md`.
- **Samuel** : `owner-approved` sur la PR de B8c et sur le lot qui contient sa migration (déjà prévus par 0059 et 0056) ; réponse à la question 1.
- **Handover** : la prochaine PR qui touche `docs/handovers/backend.md` y reporte le § 1.5 (ligne `place_coordinates` du § 6 et ligne B8 de la répartition), avec les écarts de la question 9 de la spécification B8.

## Questions ouvertes
1. **Samuel (comptes, secrets ; nouvelle)** — Étends-tu ta réponse à Q321 (et à Q322) à la purge du MVP ? Le studio, sous la procédure S5 de 0046 et sans jamais afficher de valeur : réexécute `db/bootstrap/roles.sql` sur la base réelle (ajout de `vadrouille_coords_purge`), pose son mot de passe, crée l'environnement GitHub `coords-purge` (branche `main` seule, sans relecteur obligatoire) et ses quatre secrets `COORDS_PURGE_PG*`. Sinon, ces quatre opérations sont les tiennes. **Bloque l'activation de la purge du MVP, pas la fusion de B8c** ; d'ici là, `p0-purge.yml` purge toutes les organisations et aucune écriture du MVP n'a lieu sur la base réelle (§ 3.4).
2. **Sécurité** — Verdicts sur : le module et ses règles (§ 1.2 à § 1.4, dont le contrôle de fraîcheur de 60 minutes et la règle « une position lue n'est jamais réécrite ») ; l'expiration à 29 jours et le calcul de la durée maximale (§ 2) ; le workflow, le rôle, l'environnement sans relecteur et la coexistence (§ 3). **Bloque la fusion de B8c** (déjà prévu par 0059 § 3).
3. **Rôle data** — Forme de la migration du § 2 (recréation de `store_place_coordinates` sous son propriétaire, sur le modèle du transfert de `0005_prototype_coordinates_run`, et droits du rôle de purge) ; constat qu'aucune ligne du MVP n'existe sur la base réelle ; mise à jour de `db/README.md` (« Retour arrière des migrations », amorçage du nouveau rôle avant le lot). **Bloque B8c** (question 8 de la spécification B8).
4. **CEO** — Rattachement de la migration de B8c à un lot de 0056 § 3 (lot propre ou lot suivant). Ne bloque pas la fusion ; bloque l'activation.

## Quand revoir cette décision
Si la Sécurité refuse l'un des verdicts de la question 2 ; si `withOrg` (B3b) passe à son rappel un client sans requête en paramètres liés ; si B8-TL-9 retient une voie navigateur qui rend la lecture serveur inutile ; si Samuel répond autrement à la question 1 ; si la règle provisoire de Q5 (0027) change la durée de 30 jours.
