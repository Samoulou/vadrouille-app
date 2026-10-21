# `db/` : socle de la base de données

Spécification B1 (`specs/B1-socle-base-de-donnees.md`), décisions 0006 (outils), 0007 (rôles, RLS, fonctions),
0011 (données Google), 0029 (identifiants d'administration), 0034 (aucune connexion en production avant la passe
de sécurité de la mise en public), 0046 (base du prototype, P0r2 : `place_coordinates`, schéma `prototype`, trois
rôles, purge) et 0060 (cache de positions du MVP, B8c : expiration à 29 jours, rôle et workflow de purge, repli manuel).

Aucun mot de passe ni chaîne de connexion n'apparaît dans ce dépôt, dans une PR ou dans un journal de CI.

## 1. Organisation et commandes

| Chemin | Rôle |
| --- | --- |
| `db/bootstrap/roles.sql` | Amorçage idempotent des 18 rôles des décisions 0007, 0046 et 0060 (§ 3.2 : `vadrouille_coords_purge`) et de B7c (`vadrouille_fn_usage`, migration `0010_usage_forfait`), une fois par base, avant les migrations. Aucun mot de passe. |
| `db/maintenance/coords-purge-repli.sql` | Repli manuel de la purge du MVP (0060 § 3.5), exécuté par Samuel seul dans la console Neon quand `coords-purge.yml` ne peut pas réussir ; jamais par le studio (section 4). |
| `db/schema/` | Schéma Drizzle (`auth.ts` : utilisateurs, organisations, appartenances, limiteur d'actions ; `business.ts` : tables métier). |
| `db/jsonb-keys.ts` | Listes de clés des colonnes JSONB, partagées par le schéma (contraintes `CHECK`) et les tests. |
| `db/migrations/` | Migrations SQL relues. `0000_socle` est générée par drizzle-kit puis complétée à la main ; `0001_securite` est écrite à la main (RLS, politiques, droits, déclencheurs, fonctions `SECURITY DEFINER`, vues partagées) ; `0002_place_coordinates` (cache des coordonnées et ses trois fonctions, 0011 § 6 amendée par 0046) et `0003_prototype` (schéma `prototype`, `org_prototype`, purge, gardes de `usage_ledger`) aussi, dans cet ordre (0046 D17) ; `0005_prototype_coordinates_run` (écrite à la main) remplace `store_prototype_coordinates` par sa forme à quatre paramètres liée à une exécution en cours (0052 § 1.7 et § 1.9), sans aucun `EXECUTE` hors de son propriétaire (verrou S8) ; `0008_positions_mvp_29_jours` (écrite à la main) passe l'expiration des positions du MVP à 29 jours et donne au rôle de purge du MVP son seul `EXECUTE` (0060 § 2 et § 3.2) ; `0009_verifications_updated_at` (générée, commentée à la main) ajoute la colonne `updated_at` que Better Auth 1.7.7 écrit dans `verifications` (B3b) ; `0011_trajets_prototype` (écrite à la main) crée `prototype.trajets`, temps de trajet des programmes du prototype supprimés avec eux par `prototype.purge_expired()` (décision 0092) ; `0013_secteurs_prototype` (écrite à la main) étend les clés admises de `prototype.run_candidates` aux cinq champs du candidat enrichi et crée `prototype.run_secteurs`, plan de secteurs d'une exécution (noms, voisins, incontournables, clés fermées, 24 h), supprimé à la clôture de l'exécution et à l'écriture du programme, et vidé par `prototype.purge_expired()` (décision 0094 § 1, verdict 0103, question 1). |
| `db/migrate.ts` | Applique les migrations sous `vadrouille_migrator`, une transaction par migration, journal dans `vadrouille_migrations.applied` (empreinte SHA-256 : une migration déjà appliquée et modifiée est refusée). |
| `db/connection.ts` | Seul point d'entrée des connexions applicatives : garde de production (0034, sur l'environnement injecté **et** le vrai `process.env`, 0046 D21), liste d'autorisation de `vadrouille_prototype` (préversion ou développement seulement, D21) et garde de rôle (B1-PO-6). |
| `db/index.ts` | `createDatabase("vadrouille_app" \| "vadrouille_auth" \| "vadrouille_prototype")` : client Drizzle sur un pool gardé. |
| `scripts/db/scram-verifier.ts` | Vérificateur SCRAM-SHA-256 d'un mot de passe lu sur l'entrée standard (0046 S5) : seul le vérificateur sort, pour `ALTER ROLE … PASSWORD`. |

Variables (noms de la décision 0036, B1-TL-3 ; jamais `DATABASE_URL`, que l'intégration Neon de Vercel pose avec
l'identifiant propriétaire) :

| Variable | Rôle | Où |
| --- | --- | --- |
| `VADROUILLE_DATABASE_URL` | `vadrouille_app` | application |
| `VADROUILLE_DATABASE_URL_AUTH` | `vadrouille_auth` | application (Better Auth, B3) |
| `VADROUILLE_DATABASE_URL_MIGRATOR` | `vadrouille_migrator` | environnement des migrations seulement, jamais dans Vercel (décision 0006) |
| `P0_DATABASE_URL` | `vadrouille_prototype` | seule préversion de `p0-reel` (0046 S5), posée selon la décision 0056 (workflow des migrations et déverrouillage) ; refusée sans `VERCEL_ENV` `preview` ou `development` |
| `VADROUILLE_DB_ADMIN_URL` | administrateur de la base de test | tests de base seulement (CI, poste local) |
| `VADROUILLE_DB_PROTOTYPE_URL`, `VADROUILLE_DB_PROTOTYPE_PURGE_URL` | `vadrouille_prototype`, `vadrouille_prototype_purge` | tests de base seulement (mots de passe jetables de `scripts/ci/db-setup.sh`) ; jamais une variable `P0_*` |
| `VADROUILLE_DB_COORDS_PURGE_URL` | `vadrouille_coords_purge` | tests de base seulement (mot de passe jetable de `scripts/ci/db-setup.sh`, 0060 § 4) ; jamais un secret `COORDS_PURGE_*` |

Le job `.github/workflows/p0-purge.yml` (0046 D16 point 7) ne lit aucune de ces variables : il se connecte sous
`vadrouille_prototype_purge` par les variables libpq de son étape, tirées des secrets `P0_PURGE_PGHOST`,
`P0_PURGE_PGDATABASE`, `P0_PURGE_PGUSER` et `P0_PURGE_PGPASSWORD` de l'environnement GitHub `p0-purge`. De même,
`.github/workflows/coords-purge.yml` (0060 § 3.1) se connecte sous `vadrouille_coords_purge` par les secrets
`COORDS_PURGE_PGHOST` (hôte direct de Neon, jamais l'hôte poolé), `COORDS_PURGE_PGDATABASE`, `COORDS_PURGE_PGUSER` et
`COORDS_PURGE_PGPASSWORD` de l'environnement GitHub `coords-purge`, posés par Samuel (section 4).

Commandes :

- `pnpm db:migrate` : applique les migrations en attente (lit `VADROUILLE_DATABASE_URL_MIGRATOR`). Refuse en
  production (`VERCEL_ENV` ou `VADROUILLE_ENV` à `production`), refuse un rôle autre que `vadrouille_migrator` ou un
  rôle qui a `SUPERUSER` ou `BYPASSRLS`. Une seconde exécution ne fait rien.
- `pnpm test:db` : tests de base (projet Vitest `vitest.db.config.mts`, dossier `tests/db/`). Chaque test se connecte
  avec le rôle qu'il éprouve. Sans base joignable ou sans variables, il échoue avec un message explicite.
  `SKIP_DB_TESTS=1`, posée explicitement et hors CI, l'ignore avec un avertissement visible (décision 0036, B1-TL-1) ;
  en CI elle est refusée (par `scripts/test-db.mjs`, seul endroit qui porte ce refus).
- `pnpm verify` appelle `pnpm test:db` (décision 0036, B1-TL-1). Une PR dit si `pnpm verify` a tourné avec ou sans
  base ; une PR qui touche `db/`, `tests/db/` ou une migration s'appuie sur le job `db` de la CI, jamais sur un
  `verify` local sans base.
- `pnpm db:generate` : génère une migration à partir de `db/schema/` (drizzle-kit). `drizzle-kit push` n'est
  jamais utilisé. Une migration de sécurité s'écrit à la main : `pnpm db:generate --custom --name <nom>`.

Base de référence : le conteneur `postgres:17.11` de la CI (jobs `db` et `verify`, `scripts/ci/db-setup.sh`).
Sur un poste qui dispose de Docker (facultatif, décision 0002) :

1. `docker compose up -d db` (authentification « trust », port lié à `127.0.0.1` seulement) ;
2. exécuter `db/bootstrap/roles.sql` avec `psql -v ON_ERROR_STOP=1 -f db/bootstrap/roles.sql`, connecté en
   `postgres` (hôte `127.0.0.1`, port `5432`, base `vadrouille`) ;
3. poser les quatre variables de connexion du tableau ci-dessus (les deux dernières sur la ligne de commande
   seulement, voir le point 4), toutes vers l'hôte `127.0.0.1`, le
   port `5432` et la base `vadrouille`, sans mot de passe grâce à « trust » :

   | Variable | Rôle de connexion |
   | --- | --- |
   | `VADROUILLE_DATABASE_URL` | `vadrouille_app` |
   | `VADROUILLE_DATABASE_URL_AUTH` | `vadrouille_auth` |
   | `VADROUILLE_DATABASE_URL_MIGRATOR` | `vadrouille_migrator` |
   | `VADROUILLE_DB_ADMIN_URL` | `postgres` |

4. `pnpm db:migrate`, puis `pnpm test:db`.

   **Jamais dans un `export` de shell** pour `VADROUILLE_DATABASE_URL_MIGRATOR` et `VADROUILLE_DB_ADMIN_URL`
   (décision 0050, B3-TL-1 point 4) : le serveur (`pnpm dev`, `pnpm start`) refuse de démarrer quand l'une d'elles
   est présente dans son processus (`register()`, `assertServerProcessEnv`). Pose la première sur la seule ligne de
   commande de `pnpm db:migrate` (`VADROUILLE_DATABASE_URL_MIGRATOR=… pnpm db:migrate`), la seconde sur celle de
   `pnpm test:db` ou de `pnpm verify` (`VADROUILLE_DB_ADMIN_URL=… pnpm test:db`).

Les tests de base supposent une base jetable : ils créent des organisations et ne nettoient pas.

## 2. Retour arrière des migrations

Critère du handover § 12 : chaque migration a sa migration inverse écrite et relue, ou la mention « irréversible »
avec sa raison. La règle du rôle `data` interdit toute suppression de données ; une migration inverse qui supprime
des tables ou des colonnes porteuses de données n'est donc jamais écrite.

| Migration | Retour arrière | Raison |
| --- | --- | --- |
| `0000_socle` | irréversible | Elle crée les tables : son inverse serait une suite de `DROP TABLE` qui supprime toutes les données des organisations (interdit par la règle du rôle `data`). |
| `0001_securite` | irréversible | Elle active et force la RLS, pose les politiques, retire les droits et crée les fonctions et vues durcies : son inverse rouvrirait l'accès entre organisations. Aucun état antérieur n'est acceptable à restaurer. |
| `0002_place_coordinates` | irréversible | Elle crée `place_coordinates` et ses fonctions : son inverse supprimerait la table et ses lignes (règle du rôle `data`) ; une correction se fait vers l'avant. Les coordonnées expirent d'elles-mêmes (30 jours, 29 pour `org_prototype`) et sont purgées par les fonctions. |
| `0003_prototype` | irréversible | Elle crée le schéma `prototype`, `org_prototype` et son utilisateur technique : son inverse supprimerait des données. Sa suppression à la fin de la phase 0 sera une migration corrective décidée par écrit (0046 D17 point 5). |
| `0004_rate_limit_expires_at` | `0004_rate_limit_expires_at.down.sql` | Exception nommée (décision 0050, amendement de 0007, point 2 ; 0051, point 6.3) : la migration inverse supprime l'index puis la colonne `expires_at`, qui ne porte qu'une échéance technique recalculable (au pire `window_start` + 1 jour), sans donnée d'une personne ni d'une organisation ; les lignes restent. L'exception ne vaut que pour cette colonne. |
| `0005_prototype_coordinates_run` | irréversible | Elle remplace la forme à trois paramètres de `store_prototype_coordinates`, qui écrivait une position sans exécution en cours, contraire à 0052 § 1.7 : la recréer rouvrirait ce chemin. Aucune donnée n'est supprimée ; une correction se fait vers l'avant. |
| `0006_deverrouillage_positions_prototype` | `0006_deverrouillage_positions_prototype.down.sql` | Levée du verrou S8 (décision 0056 § 4.2) : la migration inverse est le texte figé `db/reverrouillage/retour-deverrouillage.sql` copié octet pour octet (`REVOKE EXECUTE … FROM vadrouille_prototype`, même cadre), joué en urgence par `db-reverrouillage` ; le reverrouillage durable est une nouvelle migration (0056 § 4.6 point 2). Aucune donnée supprimée. |
| `0007_essais_sans_limite` | `0007_essais_sans_limite.down.sql` | Levée de la règle « une exécution `reel` ou `essai` par jour de quota » (décision 0071) : la migration inverse recrée l'index unique `runs_one_per_quota_day_idx` à l'identique ; elle échoue sans rien supprimer si un jour compte déjà plusieurs exécutions (rétablir la règle exige alors une décision de Samuel). Aucune donnée supprimée. |
| `0008_positions_mvp_29_jours` | irréversible | Elle passe l'expiration de `store_place_coordinates` de 30 à 29 jours (0060 § 2) et donne `EXECUTE` de `purge_expired_coordinates()` à `vadrouille_coords_purge` : revenir à 30 jours rendrait intenable l'obligation « supprimées au plus tard 30 jours après leur obtention » (0011 § 6), et retirer le droit couperait la purge planifiée du MVP. Aucune ligne n'est modifiée ni supprimée ; une correction se fait vers l'avant. Elle exige l'amorçage de `vadrouille_coords_purge` (`db/bootstrap/roles.sql`) avant son lot. |
| `0009_verifications_updated_at` | `0009_verifications_updated_at.down.sql` | Exception nommée (spécification B3, B3b point 6 ; acceptée par le Tech Lead le 2026-10-17, inscrite dans l'amendement B3b de la décision 0007, `docs/decisions/0007-rls.md`), sur le modèle de 0004 : la migration inverse supprime la colonne `updated_at` de `verifications`, instant technique d'écriture d'un code de connexion (10 minutes de vie), sans donnée d'une personne ni d'une organisation ; les lignes restent. Better Auth 1.7.7 ne peut plus créer de vérification après elle : `AUTH_ADAPTER=mock` d'abord. L'exception ne vaut que pour cette colonne. |
| `0010_usage_forfait` | irréversible | Elle remplace les deux gardes de P0r2 sur `usage_ledger` par la contrainte « toute ligne est une ligne de forfait » (verdict Sécurité de B7c), crée l'organisation des actions sans compte (0081, B9-TL-4) et la fonction des sommes `usage_forfait_totals()` : son inverse supprimerait une organisation à laquelle des lignes de `usage_ledger` (ajout seulement) peuvent se rattacher, et rouvrirait l'écriture de lignes par appel. Aucune ligne n'est modifiée ni supprimée ; une correction se fait vers l'avant. Elle exige l'amorçage de `vadrouille_fn_usage` (`db/bootstrap/roles.sql`) avant son lot. |
| `0011_trajets_prototype` | `0011_trajets_prototype.down.sql` | Temps de trajet des programmes du prototype conservés (décision 0092 § 3, décision de Samuel : exception à 0011 et 0027 point 4, prototype seulement) : table `prototype.trajets` et purge `prototype.purge_expired()` qui la vide avant les programmes. Exception à la règle du rôle `data`, acceptée par écrit (décision 0092, amendement 1), limitée à `prototype.trajets` : la migration inverse rétablit la purge de 0003_prototype à l'identique puis **supprime la table**, qui ne porte que des temps de trajet Routes (donnée Google à supprimer avec son programme, aucune donnée d'une personne ni d'une organisation) ; la garder sans la purge qui la vide enfreindrait 0092 § 1 point 2 et bloquerait la purge des programmes. Les programmes restent et sont relus par Routes comme avant. Descente à jouer hors de toute exécution `p0Run` (verrou exclusif du `DROP TABLE`). |
| `0012_creation_voyage` | irréversible | Création du voyage de B9b (décision 0081, B9-TL-6 ; 0087 § 1.2) : elle crée `trip_commitments` (RLS forcée, politiques, droits nominatifs) et ajoute des colonnes nullables ou à défaut à `stays`, `briefs`, `candidates` et `generation_runs`, avec leurs `CHECK` (ceux de `trips.time_zone`, `stays.to_date`, `generation_runs.phase` et `stop_reason` en `NOT VALID`, lignes antérieures non vérifiées) et deux index uniques partiels ; elle recrée `purge_organization_data` pour qu'elle vide aussi `trip_commitments`. Son inverse supprimerait la table et des colonnes porteuses des brouillons des organisations (règle du rôle `data`) et rendrait la purge incomplète. Aucune ligne n'est modifiée ni supprimée ; une correction se fait vers l'avant. |
| `0013_secteurs_prototype` | `0013_secteurs_prototype.down.sql` (partielle) | Règle du rôle `data` : aucune suppression de données. La migration inverse rétablit seulement la contrainte de clés de `prototype.run_candidates` de 0003_prototype (dix clés), en `NOT VALID` : les lignes déjà écrites avec les clés du candidat enrichi ne sont ni lues ni modifiées, et expirent en 24 h. `prototype.run_secteurs`, ses droits, ses politiques, son déclencheur et la purge de 0013 restent : le code d'avant 0013 ne nomme pas la table, qui reste vide puis purgée. Supprimer la table demanderait une exception écrite à la règle du rôle `data`, comme 0092 pour `prototype.trajets` (question de la PR de Q-L2a). Descente à jouer hors de toute exécution `p0Run`. |
| `0014_tri_enregistre` | `0014_tri_enregistre.down.sql` (partielle) | Règle du rôle `data` : aucune suppression de données. La migration inverse retire seulement les écritures du tri enregistré par `vadrouille_app` (`SELECT, INSERT` sur `deck_closures`, `SELECT, INSERT, UPDATE (state, answer_signal_id, updated_at)` sur `preference_prompts`, `UPDATE` des quatre colonnes d'annulation de `preference_signals`). Les tables, leurs lignes, leur RLS, les colonnes, contraintes et index ajoutés et la purge de 0014 restent (la purge de 0012 échouerait sur les nouvelles clés étrangères). Le `UPDATE` de table de `vadrouille_app` sur `preference_signals` n'est pas rétabli : il rouvrirait la réécriture d'un signal (décision 0112 § 3.1) et demanderait une décision écrite. Le code d'avant 0014 n'écrit aucun signal et ne nomme pas les nouvelles tables. |
| `0015_recalcul_lot` | `0015_recalcul_lot.down.sql` (partielle) | Règle du rôle `data` : aucune suppression de données. La migration inverse retire ce que 0015 ajoute hors des données (décision 0119 § 1.1, § 1.2 et § 5.2) : les deux index uniques partiels des lignes `batch`, la `CHECK` `generation_runs_batch_check`, la clé étrangère composée vers `deck_closures` et la contrainte unique `(organization_id, id)` de `deck_closures` ; elle rétablit ensuite la purge de compte de 0014 à l'identique (la clé étrangère est retirée d'abord : la purge de 0014 vide les clôtures avant les exécutions) et retire `SELECT (kind)` de `generation_runs` à `vadrouille_fn_purge`. Les colonnes `base_version` et `deck_closure_id` et leurs valeurs restent ; le code d'avant 0015 ne les nomme pas et n'écrit aucune ligne `batch`. |

Une migration déjà appliquée n'est jamais modifiée (`db/migrate.ts` refuse une empreinte différente). Le retour
arrière se fait **vers l'avant**, par une migration corrective :

1. Constater le problème (CI, préversion) et ouvrir un ticket ; ne rien modifier à la main sur la base.
2. Si l'application déployée est en cause, le retour à une version précédente du code se fait par Samuel dans
   Vercel ; le schéma reste en place. Pour que ce retour soit toujours possible, chaque migration est additive
   (ajouter une colonne nullable ou une table, puis retirer l'ancienne lecture dans une PR suivante) : la version
   précédente du code fonctionne encore sur le nouveau schéma.
3. Écrire la correction dans `db/schema/` puis `pnpm db:generate`, ou une migration manuelle
   (`pnpm db:generate --custom --name <nom>`) pour une politique, un droit, une fonction ou un déclencheur.
4. Toute nouvelle table reçoit, dans la même migration, sa RLS (`ENABLE` et `FORCE`), ses politiques, ses droits
   nominatifs, et un test d'isolation entre organisations dans `tests/db/`.
5. Ajouter la migration au tableau ci-dessus : « irréversible » motivé, ou fichier inverse relu
   `db/migrations/<tag>.down.sql` (le test `tests/unit/db/migrations-retour-arriere.test.ts` l'exige).
6. CI : le job `db` applique les migrations deux fois (la seconde ne fait rien) puis `pnpm test:db`.
7. Application à la base Neon : par `db-migrate.yml`, lancé à la main sur `main` (Q294 ; décision 0056), qui
   n'applique que les migrations approuvées ; jamais depuis l'application, la construction Vercel ni `db/migrate.ts`.
   Approbation : une PR de workflow ajoute la ligne `<tag> <sha256>` de la migration à `MIGRATIONS_APPROUVEES`, avec
   le verdict Sécurité G1 à G6 (0056 § 3), et attend `owner-approved` de Samuel (Q408). `db/migrate.ts` refuse tout
   hôte autre que `localhost`, `127.0.0.1` ou `::1` (0056 § 2.8). Relevé du catalogue en lecture : `db-releve.yml`
   (décision 0057), lancé par la Sécurité.
   Liste vide : le workflow sort en succès sans aucune connexion. **Un run vert avec une liste vide ne teste ni les
   secrets ni la connexion** ; seul un run qui applique au moins une migration approuvée les éprouve (réponse du
   Tech Lead, revue de la PR 332).
8. Coupure d'urgence de l'écriture des positions du prototype : `db-reverrouillage.yml` (0056 § 4.6, point 1),
   lancé à la main sur `main` par la Sécurité dans les 2 heures d'un déclencheur. Il n'envoie que le texte figé
   `db/reverrouillage/retour-deverrouillage.sql` (`REVOKE EXECUTE … FROM vadrouille_prototype`, vérifié contre
   `REVERROUILLAGE_SHA256`) et n'écrit pas dans le journal des migrations. Une fois le lot 2 appliqué (surcharge à
   quatre paramètres présente), un lancement sans droit à retirer est sans effet ; avant, le retrait échoue. Le
   fichier de retour arrière de la future migration de déverrouillage en sera une copie à l'identique (§ 4.2).
   Conduite en cas d'échec (décision 0066 § 5) :
   - on relance une fois au plus, et seulement si le run n'a pas atteint le contrôle final (run annulé en attente,
     échec avant connexion ou de connexion, délai dépassé) ;
   - on ne relance jamais sur un SQLSTATE `P0001` du contrôle final (le retrait est déjà validé, le droit reste par un
     autre chemin) : on escalade aussitôt au CEO avec le numéro du run, puis la Sécurité relève l'origine du droit
     avec `db-releve` et propose la migration de reverrouillage durable (0056 § 4.6, point 2) ;
   - deux runs en échec, quelle qu'en soit la cause, valent « échec répété » : le dernier recours de Samuel est
     proposé, s'il l'a accepté par écrit (question ouverte 8 de 0056).

Test de restauration sur la base de staging (sauvegarde, point dans le temps) : renvoyé à la question 3 de la
spécification B1 et aux questions Q24, Q27 et Q48 (sauvegardes, durées de conservation).

## 3. Passage aux rôles à moindre privilège (base Neon de staging)

**Amendement Q321 (décision 0046, S5).** Réponse écrite de Samuel à Q321 (2026-10-13 21:01 CEST, fil « Routine
cycle du studio » du projet claude.ai : « je suis tes recos ») : pour les **trois rôles du prototype**
(`vadrouille_prototype`, `vadrouille_prototype_purge`, `vadrouille_fn_prototype_purge`), **le studio** (rôle `data`,
vérification par le rôle Sécurité) fait l'amorçage par `db/bootstrap/roles.sql`, ouvre la connexion d'administration
qu'il exige, pose les mots de passe des deux rôles de connexion (vérificateur SCRAM calculé par
`scripts/db/scram-verifier.ts`, jamais de mot de passe en clair dans une requête), `P0_DATABASE_URL` (préversion de
`p0-reel`) et les secrets de l'environnement GitHub `p0-purge`, sans jamais afficher une valeur, selon la procédure
de 0046 S5 ; **Samuel lance lui-même la lecture de contrôle des rôles** (requête de l'étape 1 ci-dessous) dans la
console Neon. Ces opérations viennent avec le premier passage des migrations sur la base réelle, donc **après la
décision 0056** (workflow `db-migrate`, chaque lot approuvé par Samuel : Q408), qui reprend de 0052 l'application des
migrations (Q294). Le reste de cette section
(rôles du MVP) est inchangé.

**Acteur : Samuel, seul** (rôles du MVP). Tout se fait dans un navigateur (console Neon et tableau de bord Vercel), sans outil
local. Le studio ne touche ni aux réglages Neon ni aux variables Vercel, ne voit aucun mot de passe et n'en demande
aucun. Il fournit ce script, les requêtes de contrôle ci-dessous (aucune ne renvoie de secret) et la garde de
connexion de `db/connection.ts`.

Pourquoi : l'utilisateur propriétaire que l'intégration Neon injecte dans Vercel appartient à `neon_superuser`,
qui a `BYPASSRLS` (documentation Neon, rôles ; vérification B1-TL-4). Tant que l'application se connecterait avec
lui, la RLS ne protégerait rien. La garde de connexion refuse donc ce rôle : une préversion qui lit la base (B3, B6)
ne fonctionne qu'après ce passage.

Quand : au plus tard à la passe de sécurité avant la mise en public (décision 0034, point 1 de sa liste de
contrôle). Le studio recommande de le faire dès la première préversion qui lit la base (B3 ou B6 ; question 4 de la
spécification B1).

### Étape 1. Créer les rôles

Console Neon, projet de staging, branche principale, **SQL Editor**, base de l'application : coller le contenu de
`db/bootstrap/roles.sql` et l'exécuter. Il peut être rejoué sans effet.

Contrôle (17 lignes ; `super` et `bypassrls` à `false` partout ; `login` à `true` seulement pour
`vadrouille_migrator`, `vadrouille_app`, `vadrouille_auth`, `vadrouille_prototype`, `vadrouille_prototype_purge` et
`vadrouille_coords_purge`) :

```sql
SELECT rolname, rolsuper AS super, rolbypassrls AS bypassrls, rolcanlogin AS login
FROM pg_catalog.pg_roles WHERE rolname LIKE 'vadrouille\_%' ORDER BY rolname;
```

Contrôle des appartenances (attendu : `vadrouille_app` membre de `vadrouille_share`, `vadrouille_webhook`,
`vadrouille_account_admin`, `vadrouille_limiter` avec `inherit = false` ; `vadrouille_migrator` membre de
`vadrouille_owner` avec `inherit = true`, et des six `vadrouille_fn_*` avec `admin = true`, `inherit = false`,
`set = false` ; décision 0036, B1-TL-2. La ligne `ADMIN` seule du rôle d'amorçage sur chaque `vadrouille_fn_*`,
créée par Postgres 16 et suivants quand il n'est pas superutilisateur, est admise ; elle n'apparaît pas ici) :

```sql
SELECT m.rolname AS membre, r.rolname AS role, am.admin_option AS admin,
       am.inherit_option AS inherit, am.set_option AS set
FROM pg_catalog.pg_auth_members am
JOIN pg_catalog.pg_roles r ON r.oid = am.roleid
JOIN pg_catalog.pg_roles m ON m.oid = am.member
WHERE m.rolname LIKE 'vadrouille\_%' ORDER BY 1, 2;
```

### Étape 2. Donner un mot de passe aux trois rôles de connexion

Toujours dans le SQL Editor, pour `vadrouille_app`, `vadrouille_auth` et `vadrouille_migrator`, une ligne à la
fois, avec un mot de passe long et aléatoire (Neon exige une entropie suffisante pour un mot de passe posé en SQL) :

```sql
ALTER ROLE vadrouille_app PASSWORD '<mot de passe>';
```

Le mot de passe n'est recopié nulle part ailleurs que dans Vercel (étape 3) ou, pour `vadrouille_migrator`, dans
l'environnement des migrations choisi à la question 3. Effacer ensuite la requête de l'éditeur ; si la console en
garde un historique, y supprimer l'entrée quand c'est possible (sinon, le signaler au studio, qui le reporte en
question).

Contrôle (aucun secret ; `valid_until` vide) :

```sql
SELECT rolname, rolvaliduntil AS valid_until FROM pg_catalog.pg_roles
WHERE rolname IN ('vadrouille_app', 'vadrouille_auth', 'vadrouille_migrator') ORDER BY 1;
```

### Étape 3. Créer les variables dans Vercel (Preview seulement)

Vercel, projet, **Settings**, **Environment Variables**, environnement **Preview** uniquement, type « Sensitive » :

- `VADROUILLE_DATABASE_URL` : chaîne de connexion Neon de `vadrouille_app` (bouton « Connect » de la console Neon,
  rôle `vadrouille_app`) ;
- `VADROUILLE_DATABASE_URL_AUTH` : idem pour `vadrouille_auth`.

Jamais `VADROUILLE_DATABASE_URL_MIGRATOR` dans Vercel (décision 0006), et aucune de ces variables en Production
(décision 0034 : aucune connexion en production avant la passe de sécurité ; la garde la refuserait de toute façon).

Contrôle : la liste des variables Preview contient les deux noms ci-dessus et aucun `VADROUILLE_DATABASE_URL_MIGRATOR`.
À la première préversion qui lit la base, un rôle mal posé est refusé par la garde avec un message qui nomme le rôle
reçu et le rôle attendu, sans chaîne de connexion.

### Étape 4. Retirer l'identifiant propriétaire de Preview et de Production

Vercel, **Environment Variables** : supprimer de Preview et de Production les variables que l'intégration Neon a
posées avec l'utilisateur propriétaire (`DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `PGUSER`, `PGPASSWORD`,
`POSTGRES_*`, selon ce que la liste montre). L'application ne les lit pas ; leur seule présence est le risque
accepté par Samuel dans 0034, à lever au plus tard à la passe de sécurité.

Contrôle : aucune variable de Preview ni de Production ne contient l'utilisateur propriétaire ; si l'intégration les
repose (par exemple à la création d'une branche de préversion), le noter au studio : la question est alors à
reprendre avec le Tech Lead.

### Ce que le studio ne fait pas

Il ne se connecte pas à la base de staging, n'exécute rien dans la console Neon, ne crée ni ne supprime de variable
Vercel, ne reçoit aucun mot de passe et n'applique de migration que par le workflow `db-migrate.yml`
(décision 0056), migration par migration approuvée par Samuel. **Exception (Q321, amendement ci-dessus)** :
l'amorçage des trois rôles du prototype, la connexion d'administration qu'il exige, la pose de leurs mots de passe, de
`P0_DATABASE_URL` et des secrets de `p0-purge`, par le studio selon 0046 S5, après la décision 0056 ; la lecture de
contrôle reste à Samuel.

## 4. Purge planifiée du MVP (décision 0060 § 3)

`.github/workflows/coords-purge.yml` appelle `public.purge_expired_coordinates()` toutes les 6 heures (03:17, 09:17,
15:17 et 21:17 UTC) sous `vadrouille_coords_purge`, rôle de connexion qui n'a que `EXECUTE` sur cette fonction et
`USAGE` sur le schéma `public` (migration `0008_positions_mvp_29_jours`), `CONNECTION LIMIT 2`, aucune appartenance
hors la ligne `ADMIN` seule que Postgres 16 et suivants donnent au rôle d'amorçage quand il n'est pas
superutilisateur. Avec l'expiration à 29 jours, une position est supprimée au plus tard 30 jours après la réponse de
Google tant que deux purges réussies ne sont pas séparées de 22 heures ou plus (calcul de 0060 § 2).

**Fusion sans activation.** La PR de B8c fusionne sans le rôle sur la base réelle, ni l'environnement, ni les
secrets : d'ici leur pose, chaque passage du job échoue, ce qui est attendu. Aucune écriture du MVP sur la base réelle
avant le premier succès de `coords-purge.yml` (0060 § 3.4).

**Activation** (Samuel, ou le studio s'il étend sa réponse à Q321 à cette purge : question 1 de 0060), dans l'ordre :

1. réexécution de `db/bootstrap/roles.sql` sur la base réelle (ajout de `vadrouille_coords_purge`), **avant**
   l'application du lot qui contient `0008_positions_mvp_29_jours` (sans le rôle, la migration échoue) ;
2. mot de passe du rôle selon la procédure S5 de 0046 (vérificateur SCRAM, jamais en clair) ;
3. environnement GitHub `coords-purge`, sans relecteur obligatoire, branches de déploiement « Selected branches »
   réduites à `main` (`deployment_branch_policy: {protected_branches: false, custom_branch_policies: true}` puis une
   politique `name=main`, `type=branch`), et ses quatre secrets `COORDS_PURGE_PGHOST` (hôte direct, sans `-pooler`),
   `COORDS_PURGE_PGDATABASE`, `COORDS_PURGE_PGUSER`, `COORDS_PURGE_PGPASSWORD` ;
4. approbation du lot qui contient la migration (0056 § 3) et application par `db-migrate` ;
5. `workflow_dispatch` de `coords-purge.yml` et premier succès relevé ;
6. **exercice du repli manuel**, une fois, par Samuel (ci-dessous). Sans cet exercice réussi, l'activation n'est pas
   acquise.

**Repli manuel** (0060 § 3.5, point 1 ; Samuel seul, le studio ne se connecte jamais à la base réelle) : quand le
workflow ne peut pas réussir (un `workflow_dispatch` sans succès relevé 30 minutes plus tard, ou impossible à lancer),
coller et exécuter le contenu de `db/maintenance/coords-purge-repli.sql` dans l'éditeur SQL de la console Neon
(projet et branche de la base, base de l'application), sous l'utilisateur propriétaire de l'intégration. Noter l'heure
UTC juste avant le lancement et à la réponse `DO`, et les donner au CEO. Le bloc ne dépend ni de GitHub, ni de
l'environnement, ni des secrets, ni du mot de passe du rôle ; il réussit en entier ou ne change rien. L'appel direct
`SELECT public.purge_expired_coordinates();` sous le propriétaire échoue (`42501`) : `EXECUTE` est nominatif. Il
accompagne la suspension des écritures (`POSITIONS_ECRITURE_SUSPENDUE=1` sur Vercel, 0060 § 3.5 point 2), il ne la
remplace pas.

**Contrôle après l'exercice**, dans le même éditeur. Cette requête est filtrée sur le rôle (celle de la section 3,
étape 1, filtre sur le membre et ne montrerait ni la ligne `ADMIN` du propriétaire ni une appartenance résiduelle) :

```sql
SELECT m.rolname AS membre, r.rolname AS role, am.admin_option AS admin,
       am.inherit_option AS inherit, am.set_option AS set
FROM pg_catalog.pg_auth_members am
JOIN pg_catalog.pg_roles r ON r.oid = am.roleid
JOIN pg_catalog.pg_roles m ON m.oid = am.member
WHERE r.rolname = 'vadrouille_coords_purge' OR m.rolname = 'vadrouille_coords_purge'
ORDER BY 1, 2;
```

**Résultat attendu, exactement une ligne** : `membre` = l'utilisateur propriétaire de l'intégration sous lequel le
bloc a été lancé, `role` = `vadrouille_coords_purge`, `admin` vrai, `inherit` faux, `set` faux. Toute autre ligne
(deuxième ligne pour ce membre, `inherit` ou `set` vrai, autre membre, ou `vadrouille_coords_purge` membre d'un rôle)
ou l'absence de ligne : exercice échoué, signalé au Tech Lead et à la Sécurité.

**Coexistence** : `p0-purge.yml` reste en place jusqu'à la fin de la phase 0 et purge aussi ces lignes quand il
réussit ; seuls les succès de `coords-purge.yml` et les purges manuelles comptent pour le calcul de 0060 § 2.
Surveillance : CEO, à chaque cycle (0060 § 3.5).
