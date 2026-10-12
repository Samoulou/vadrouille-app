# 0036 — Décisions du Tech Lead pour B1 (socle base de données) : B1-TL-1 à B1-TL-4

Statut : décision déléguée, à lister dans la note de version suivante (rubrique « Décisions prises par le studio ») ; définitive sans veto de Samuel dans les 2 jours qui suivent cette publication · Date : 2026-10-12 · Décideur : Tech Lead (architecture, bibliothèques, outillage, tests ; délégation « Qui décide quoi » de `docs/CONTEXT.md`) · Ticket #190

Numérotation : 0031 est prise par la PR #172, 0033 par la PR #177, 0035 par la PR #183 (spécification T18). Aucune autre PR ouverte n'ajoute de fichier dans `docs/decisions/` ni ne cite un numéro plus élevé (vérifié le 2026-10-12). 0036 est le prochain numéro libre.

## Contexte
La spécification B1 (`specs/B1-socle-base-de-donnees.md`, #185, fusionnée le 2026-10-12) attend quatre décisions du Tech Lead (section « Décisions attendues », B1-TL-1 à B1-TL-4 ; questions Q276 et Q277). La PR de code de B1 (#188) applique les valeurs par défaut de la spécification. La revue consolidée de #188 (2026-10-12, 15:42 UTC) retient ces valeurs et demande qu'elles soient écrites : B1-TL-1 bloque la fusion de #188.

Cette décision retient les propositions de la spécification, en précisant ce qu'il faut pour les tester. Elle ne modifie aucun code. Elle amende le handover back-end § 2, le handover des comptes externes et la décision 0006 sur les noms des variables (B1-TL-3), la décision 0006 et le handover back-end sur Q40 (B1-TL-1), et, sur l'invariant des rôles `vadrouille_fn_*` (B1-TL-2), la décision 0007, la décision 0011, le handover back-end et le handover des comptes externes.

**Argent, comptes, données hors UE** : rien. Aucune dépendance, aucun compte, aucun service. Le réglage « job `db` obligatoire sur `main` » (protection de branche) touche le compte GitHub : il reste à Samuel.

**Principe « l'agent cherche, l'ancrage vérifie, le moteur planifie »** : non concerné (socle de données).

## B1-TL-1 — `pnpm test:db` dans `pnpm verify` (Q276)
**Retenu : `pnpm verify` appelle `pnpm test:db`.**

1. Sans base joignable, `pnpm test:db` échoue avec un message explicite et un code de sortie non nul (décision 0006, convention 6 : jamais ignoré en silence).
2. Hors CI, une session sans base peut poser **explicitement** `SKIP_DB_TESTS=1`. `pnpm test:db` affiche alors un avertissement visible (les tests de base sont « NON EXÉCUTÉS ») et sort avec succès. Aucune autre variable, aucune détection automatique (absence de Docker, adresse vide) ne déclenche ce saut.
3. **En CI, `SKIP_DB_TESTS` est refusée** : si elle est posée (quelle que soit sa valeur) alors que `CI` est vraie, `pnpm test:db` échoue. Ce refus est écrit **à un seul endroit**, dans le script lancé par `pnpm test:db` (`scripts/test-db.mjs`), qui s'exécute dans tous les jobs ; les workflows ne le recopient pas (revue de #188, mineur 6).
4. Conséquence : le job `verify` de la CI a lui aussi un conteneur `postgres:17.11`, amorcé et migré comme le job `db`. Les deux jobs font foi.
5. Une PR doit dire dans sa section « Vérifications » si `pnpm verify` a été lancé avec ou sans base (`SKIP_DB_TESTS=1`). Une PR qui touche `db/`, `tests/db/` ou une migration ne s'appuie jamais sur un `verify` local sans base : le job `db` de la CI fait foi.
6. Q40 (Docker dans les sessions d'agents) ne bloque plus B1. Le CEO peut proposer à Samuel de la clore.

**Noms ajoutés par la PR de code de B1 (#188)**, absents jusqu'ici du handover back-end § 2 : le script `scripts/test-db.mjs` (lancé par `pnpm test:db`, seul endroit du refus en CI), la variable `SKIP_DB_TESTS` (point 2 ci-dessus ; outillage de test, jamais lue par l'application) et la variable `VADROUILLE_DB_BOOTSTRAP_ROLE` (nom du rôle qui a exécuté l'amorçage, lue par le test `rôles` seulement, B1-TL-2 ; `postgres` en CI). Elles s'ajoutent aux trois variables de connexion de B1-TL-3, qui restent les seules lues par l'application.

Option écartée : laisser `pnpm verify` sans base et ne compter que sur le job `db`. Elle crée deux définitions de « vert » et rend `test:db` facile à oublier en local quand une base existe.

## B1-TL-2 — Rôles `vadrouille_fn_*` « sans membre » sur Postgres 16 et suivants (Q277)
Depuis Postgres 16, un rôle non superutilisateur qui crée un rôle en reçoit l'option `ADMIN` (une ligne dans `pg_auth_members`). C'est le cas du rôle propriétaire de Neon. Le transfert de propriété de 0007 exige en outre que `vadrouille_migrator` puisse accorder les rôles `vadrouille_fn_*`. L'invariant « aucun membre » de 0007 est donc reformulé.

**Retenu** : à l'état stable (après amorçage et migrations), pour chaque rôle `vadrouille_fn_*` :
1. aucune appartenance n'a `inherit_option = true` ni `set_option = true` ;
2. les seules appartenances admises sont, avec `admin_option = true` seule, celle de `vadrouille_migrator` et celle du rôle qui a exécuté l'amorçage (ligne créée par Postgres 16 et suivants) ;
3. le test `rôles: aucun rôle ne contourne la RLS` nomme ces deux membres (le second par `VADROUILLE_DB_BOOTSTRAP_ROLE`) et échoue sur tout autre membre ou toute autre option ;
4. pendant une migration, `vadrouille_migrator` peut s'accorder `SET` sur un rôle `vadrouille_fn_*` pour un `ALTER … OWNER TO`, puis doit le retirer **dans la même transaction** (`REVOKE … GRANTED BY vadrouille_migrator`). Le test vérifie l'état après migrations, donc ce retrait.

Le critère « `current_user = 'vadrouille_fn_purge'` n'est pas falsifiable par un rôle applicatif » reste vrai : `vadrouille_app`, `vadrouille_auth` et les rôles qui leur sont accordés n'ont aucune appartenance aux `vadrouille_fn_*`. Ce critère ne tient que tant que les identifiants de `vadrouille_migrator` et du rôle d'amorçage restent hors de l'environnement de l'application (B1-TL-3) : avec leur option `ADMIN`, l'un ou l'autre peut s'accorder `SET` sur un rôle `vadrouille_fn_*`.

La ligne `ADMIN` du rôle d'amorçage est **tolérée, non exigée** : en CI, l'amorçage est exécuté par un superutilisateur (`postgres`), qui n'en reçoit pas. Le test `rôles` passe donc avec ou sans cette ligne ; il échoue seulement sur une appartenance d'un autre rôle ou avec une autre option.

## B1-TL-3 — Noms des variables de connexion
L'intégration Neon de Vercel injecte `DATABASE_URL` (et des variables voisines) avec l'identifiant propriétaire. Le même nom ne peut pas désigner deux identifiants.

**Retenu** : des noms que l'intégration ne pose jamais.

| Variable | Rôle | Où elle existe |
|---|---|---|
| `VADROUILLE_DATABASE_URL` | `vadrouille_app` | environnement de l'application |
| `VADROUILLE_DATABASE_URL_AUTH` | `vadrouille_auth` | environnement de l'application |
| `VADROUILLE_DATABASE_URL_MIGRATOR` | `vadrouille_migrator` | environnement des migrations seulement, **jamais** celui de l'application |

Règles :
1. Le code de l'application ne lit **jamais** `DATABASE_URL` ni aucune variable posée par l'intégration Neon (`DATABASE_URL_UNPOOLED`, `PG*`, `POSTGRES_*`). Seul le module de connexion de `db/` lit les deux premières variables du tableau.
2. La garde de `src/server/env.ts` (0006, convention 4) porte désormais sur `VADROUILLE_DATABASE_URL_MIGRATOR` : présente dans l'environnement de l'application, refus de démarrer.
3. Les noms sans préfixe `DATABASE_URL`, `DATABASE_URL_AUTH` et `DATABASE_URL_MIGRATOR` du handover § 2, du handover des comptes externes et de 0006 sont remplacés (amendements ci-dessous et dans ces documents).

## B1-TL-4 — `BYPASSRLS` du rôle propriétaire sur Neon
**Constat retenu** (relevé par l'agent `data` dans #188, d'après la documentation Neon « Manage roles ») : `neon_superuser` a `BYPASSRLS` (projets créés après le 15 août 2023), `CREATEROLE`, `CREATEDB` et `REPLICATION`. Ces attributs ne s'héritent pas par appartenance, mais le rôle propriétaire créé par l'intégration les reçoit à sa création. Le handover des comptes externes le disait déjà (« le rôle d'administration fourni a `BYPASSRLS` »).

Conséquences :
1. Sous l'identifiant propriétaire, la RLS ne protège rien. Il ne sert qu'à l'amorçage des rôles (`db/bootstrap/roles.sql`), par Samuel.
2. La garde de connexion de `db/` (B1-PO-6) est obligatoire et testée : elle exige `session_user = current_user` = rôle attendu, ni `SUPERUSER` ni `BYPASSRLS`, sinon elle refuse de servir.
3. Le constat se vérifie sur le projet réel avec la requête de contrôle sans secret de `db/README.md`, lors du passage de Preview aux rôles à moindre privilège (question 4 de la spécification, Samuel).

## Amendements
- **Décision 0006**, convention 4 : `DATABASE_URL_MIGRATOR` devient `VADROUILLE_DATABASE_URL_MIGRATOR` ; renvoi à cette décision.
- **Handover back-end § 2** : variables d'exécution `VADROUILLE_DATABASE_URL` et `VADROUILLE_DATABASE_URL_AUTH` ; `VADROUILLE_DATABASE_URL_MIGRATOR` dans l'environnement des migrations seulement, et dans la garde de `src/server/env.ts`.
- **Handover des comptes externes** (Neon) : mêmes noms.
- **Décision 0007** (B1-TL-2), dont le texte est amendé en conséquence (sa ligne « Statut » renvoie à cette décision, qui prévaut en cas d'écart) :
  - tableau des rôles, ligne `vadrouille_migrator` : « membre de `vadrouille_owner` et de lui seul » devient « seule appartenance avec `SET` : `vadrouille_owner` ; en outre, appartenance avec `ADMIN` seule à chaque rôle `vadrouille_fn_*` » ;
  - l. 33 (« n'ont **aucun membre** (`pg_auth_members` vide pour eux) : personne ne peut `SET ROLE` vers eux ») : aucune appartenance n'a `inherit_option` ni `set_option` ; seules les appartenances `ADMIN` seule de `vadrouille_migrator` et du rôle d'amorçage sont admises ; aucun rôle applicatif ne peut `SET ROLE` vers eux ;
  - l. 35 (transfert de propriété) : `vadrouille_migrator` s'accorde `SET` sur le rôle `vadrouille_fn_*` puis le retire dans la même transaction (`REVOKE … GRANTED BY vadrouille_migrator`) ; le test vérifie qu'après migration aucune appartenance n'a `SET` ni `INHERIT` ;
  - l. 73 (règles communes, point 1) : « sans membre » devient « sans appartenance avec `SET` ni `INHERIT` » ;
  - l. 102 (test `rôles`) : « `vadrouille_migrator` n'est membre que de `vadrouille_owner` après migration » devient « après migration, la seule appartenance de `vadrouille_migrator` avec `SET` est `vadrouille_owner` ; ses autres appartenances sont celles, `ADMIN` seule, aux rôles `vadrouille_fn_*` » ; « les rôles `vadrouille_fn_*` n'ont aucun membre » devient le point 3 de B1-TL-2 ;
  - l. 111 (test `registres`) : « (aucun membre) » devient « (aucune appartenance avec `SET`) ».
- **Décision 0011** (B1-TL-2), texte amendé en conséquence (sa ligne « Statut » renvoie à cette décision, qui prévaut) :
  - point 6, rôle `vadrouille_fn_coords` (l. 75) : « `NOLOGIN`, sans membre » devient « `NOLOGIN`, sans appartenance avec `SET` ni `INHERIT` (0036, B1-TL-2) » ;
  - test `coordonnées: DELETE limité et aucun UPDATE` (l. 103, B8) : « et aucun membre » devient « et sans appartenance avec `SET` ni `INHERIT` (0036, B1-TL-2) », ses seules appartenances admises étant celles, `ADMIN` seule, de `vadrouille_migrator` et du rôle d'amorçage (point 2 de B1-TL-2).
- **Handover back-end** (B1-TL-2) : § 6, règles communes (l. 450), et tableau des décisions, ligne 0007 (l. 666) : « rôles `vadrouille_fn_*` sans membre » devient « rôles `vadrouille_fn_*` sans appartenance avec `SET` ni `INHERIT` (0036, B1-TL-2) ».
- **Handover des comptes externes** (B1-TL-2), vérification sur Neon staging : les appartenances et le transfert de propriété ne sont plus « à consigner par B1 dans un amendement de 0007 » ; renvoi à cette décision et à l'amendement de 0007. La vérification sur la base de staging Neon reste à faire.
- **Décision 0006**, « Conséquences », et **handover back-end**, Q40 : Q40 ne bloque plus `pnpm verify` en local (B1-TL-1, point 6 : `SKIP_DB_TESTS=1` hors CI, la CI fait foi) ; renvoi à cette décision.

## Hors de cette décision
- Question 3 de la spécification (Q278 : application des migrations à Neon staging, workflow manuel ou construction Vercel) : décision à part, après la fusion de B1 ; le secret éventuel reste à Samuel.
- Rendre le job `db` obligatoire sur `main` (protection de branche) : Samuel.
