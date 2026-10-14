# `db/` : socle de la base de données

Spécification B1 (`specs/B1-socle-base-de-donnees.md`), décisions 0006 (outils), 0007 (rôles, RLS, fonctions),
0011 (données Google), 0029 (identifiants d'administration), 0034 (aucune connexion en production avant la passe
de sécurité de la mise en public) et 0046 (base du prototype, P0r2 : `place_coordinates`, schéma `prototype`, trois
rôles, purge).

Aucun mot de passe ni chaîne de connexion n'apparaît dans ce dépôt, dans une PR ou dans un journal de CI.

## 1. Organisation et commandes

| Chemin | Rôle |
| --- | --- |
| `db/bootstrap/roles.sql` | Amorçage idempotent des 16 rôles des décisions 0007 et 0046, une fois par base, avant les migrations. Aucun mot de passe. |
| `db/schema/` | Schéma Drizzle (`auth.ts` : utilisateurs, organisations, appartenances, limiteur d'actions ; `business.ts` : tables métier). |
| `db/jsonb-keys.ts` | Listes de clés des colonnes JSONB, partagées par le schéma (contraintes `CHECK`) et les tests. |
| `db/migrations/` | Migrations SQL relues. `0000_socle` est générée par drizzle-kit puis complétée à la main ; `0001_securite` est écrite à la main (RLS, politiques, droits, déclencheurs, fonctions `SECURITY DEFINER`, vues partagées) ; `0002_place_coordinates` (cache des coordonnées et ses trois fonctions, 0011 § 6 amendée par 0046) et `0003_prototype` (schéma `prototype`, `org_prototype`, purge, gardes de `usage_ledger`) aussi, dans cet ordre (0046 D17). |
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
| `P0_DATABASE_URL` | `vadrouille_prototype` | seule préversion de `p0-reel` (0046 S5), posée après la décision 0052 ; refusée sans `VERCEL_ENV` `preview` ou `development` |
| `VADROUILLE_DB_ADMIN_URL` | administrateur de la base de test | tests de base seulement (CI, poste local) |
| `VADROUILLE_DB_PROTOTYPE_URL`, `VADROUILLE_DB_PROTOTYPE_PURGE_URL` | `vadrouille_prototype`, `vadrouille_prototype_purge` | tests de base seulement (mots de passe jetables de `scripts/ci/db-setup.sh`) ; jamais une variable `P0_*` |

Le job `.github/workflows/p0-purge.yml` (0046 D16 point 7) ne lit aucune de ces variables : il se connecte sous
`vadrouille_prototype_purge` par les variables libpq de son étape, tirées des secrets `P0_PURGE_PGHOST`,
`P0_PURGE_PGDATABASE`, `P0_PURGE_PGUSER` et `P0_PURGE_PGPASSWORD` de l'environnement GitHub `p0-purge`.

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
3. poser, dans le shell, les quatre variables de connexion du tableau ci-dessus, toutes vers l'hôte `127.0.0.1`, le
   port `5432` et la base `vadrouille`, sans mot de passe grâce à « trust » :

   | Variable | Rôle de connexion |
   | --- | --- |
   | `VADROUILLE_DATABASE_URL` | `vadrouille_app` |
   | `VADROUILLE_DATABASE_URL_AUTH` | `vadrouille_auth` |
   | `VADROUILLE_DATABASE_URL_MIGRATOR` | `vadrouille_migrator` |
   | `VADROUILLE_DB_ADMIN_URL` | `postgres` |

4. `pnpm db:migrate`, puis `pnpm test:db`.

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
7. Application à la base Neon de staging : selon la réponse à la question 3 de la spécification B1 ; jamais depuis
   l'application. L'option « construction Vercel » de cette question contredit la décision 0006 (l'identifiant de
   `vadrouille_migrator` n'entre jamais dans Vercel) : elle est remontée à Samuel (#188), seul le workflow GitHub
   déclenché à la main reste compatible en l'état.

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
décision 0052** (0046, « Frontière »), qui ajoute ici l'application des migrations (Q294). Le reste de cette section
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

Contrôle (16 lignes ; `super` et `bypassrls` à `false` partout ; `login` à `true` seulement pour
`vadrouille_migrator`, `vadrouille_app`, `vadrouille_auth`, `vadrouille_prototype` et `vadrouille_prototype_purge`) :

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
Vercel, ne reçoit aucun mot de passe et n'applique aucune migration à staging tant que la question 3 n'est pas
tranchée. **Exception (Q321, amendement ci-dessus)** : l'amorçage des trois rôles du prototype, la connexion
d'administration qu'il exige, la pose de leurs mots de passe, de `P0_DATABASE_URL` et des secrets de `p0-purge`, par
le studio selon 0046 S5, après la décision 0052 ; la lecture de contrôle reste à Samuel.
