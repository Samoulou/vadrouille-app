# 0067 — Contrôle du chiffrement côté client dans les workflows de la base (amendement de 0056 § 2.6.2)

Statut : décision déléguée (exigence de sécurité : Sécurité ; tests : Tech Lead), à lister dans la note de version suivante (rubrique « Décisions prises par le studio ») ; définitive sans veto de Samuel 2 jours après sa fusion. Aucune dépense, aucun compte externe, aucune donnée personnelle. La PR qui la porte modifie `.github/workflows/` : elle attend `owner-approved`, posé par Samuel (0035).

Date : 2026-10-15 · Autrice : Sécurité, avec le data · Source : échec du premier lancement de `db-migrate` (run 38728887188, `585b09c`, SQLSTATE `P0001`, consigné sur #374), analyse demandée par 0056 § 2.6.4 · Amende 0056 § 2.6.2 et « Tests imposés », et 0057 § 3 (bloc `DO` de `db-releve`) · Numérotation : `main` va jusqu'à 0066 ; aucune PR ouverte n'ajoute 0067.

## Contexte

0056 § 2.6.2 exigeait, dans la première session, `ssl` vrai dans `pg_catalog.pg_stat_ssl` pour le processus serveur. Sur Neon, ce contrôle ne peut pas réussir :

- le client (`psql`, `PGSSLMODE=verify-full`) parle en TLS au **proxy** de Neon, qui termine le TLS et ouvre sa propre connexion vers le compute PostgreSQL. `pg_stat_ssl` décrit la connexion que voit le compute, celle du proxy, pas celle du client ;
- dans le code source du proxy (`neondatabase/neon`, `proxy/src/control_plane/client/cplane_proxy_v1.rs`), la connexion proxy→compute est en `SslMode::Disable` sauf si le plan de contrôle fournit un `server_name` ;
- relevé de Samuel (2026-10-15 11:50 UTC, éditeur SQL de Neon, lecture seule) : `rolsuper = f`, `rolbypassrls = f`, `ssl = f`. Limite : l'éditeur SQL passe lui aussi par le proxy, pas par le chemin de `psql` ; le relevé montre ce que voit le compute derrière le proxy, ce qui suffit à expliquer l'échec.

Les deux autres conditions du bloc sont écartées : le rôle a été créé par `db/bootstrap/roles.sql` (`NOSUPERUSER NOBYPASSRLS`, arrêt si un rôle existant porte un attribut en trop), contrôlé à l'étape 6 de la fiche #362, puis relevé par Samuel ; `PGUSER` est fixé dans le YAML, et l'authentification a réussi sous ce nom.

## Décision

1. **Retrait** du contrôle `pg_stat_ssl` des blocs `DO` de `db-migrate.yml`, `db-reverrouillage.yml` et `db-releve.yml` (même défaut dans les trois). Les contrôles de rôle (`session_user`, `current_user`, `rolsuper`, `rolbypassrls`) restent inchangés.
2. **Remplacement par un contrôle côté client**, avant toute connexion, une ligne identique dans les trois workflows (à la fonction d'échec près) :
   `if [[ "${!PG*}" != "PGDATABASE PGHOST PGPASSWORD PGSSLMODE PGSSLROOTCERT PGUSER" || $PGSSLMODE != verify-full || $PGSSLROOTCERT != system ]]; then echec "…"; fi`
   - `PGSSLMODE=verify-full` : libpq refuse toute connexion sans TLS, et tout certificat qui ne chaîne pas aux autorités du système ou ne nomme pas `PGHOST`. Aucun repli en clair n'est possible, quel que soit le serveur.
   - les six seules variables `PG*` : aucune variable héritée du runner (`PGSERVICE`, `PGSERVICEFILE`, `PGSSLNEGOTIATION`, `PGPORT`…) ne peut changer la connexion. Un fichier de service, par exemple, passe avant les variables d'environnement et pourrait fixer `sslmode`. `PGHOST` et `PGDATABASE` gardent leurs contrôles de forme : ni l'un ni l'autre ne peut porter une chaîne de connexion.
   - Neon refuse de son côté toute connexion sans TLS (documentation « Connect securely »).
3. **Ce que la garantie couvre** : le mot de passe et les textes SQL sont chiffrés du runner jusqu'au proxy de Neon, authentifié par son certificat. Le tronçon proxy→compute, interne à Neon, n'était pas vérifiable par l'ancien contrôle non plus (au mieux, il aurait vu ce tronçon-là, jamais celui du client) : il reste un risque résiduel du fournisseur, inchangé. S9 n'est pas affaibli. Le contrôle ne porte sur aucun texte de migration.
4. **Tests** : `tests/db/workflows-harnais.ts` retire désormais la ligne côté client (une occurrence exactement), et refuse tout texte SQL qui lirait encore `pg_stat_ssl`. Les trois cas « gardé » vérifient un refus **sans connexion**. Les tests statiques `tests/unit/ci/db-migrate.test.ts`, `db-reverrouillage.test.ts` et `db-releve.test.ts` exigent la ligne (unique, avant la première connexion) et l'absence de `pg_stat_ssl`. Le premier joue aussi la ligne sous bash (refus de `require`, `disable`, `PGSSLROOTCERT` autre, `PGSERVICE`, `PGSERVICEFILE`, `PGSSLNEGOTIATION`, `PGPORT`, `PGSSLMODE` absente). Ces tests ne sont pas modifiables par les agents : leur nouvelle version est préparée pour Samuel (description de la PR).
5. **Hors périmètre** : `p0-purge.yml` n'avait pas ce contrôle (seulement `session_user`) ; inchangé.

## Quand revoir

Si Neon expose au compute une preuve du TLS client (paramètre de session posé par le proxy, par exemple), ou si la base quitte Neon pour un serveur joint directement : le contrôle `pg_stat_ssl` côté serveur redevient possible et peut s'ajouter au contrôle côté client.
