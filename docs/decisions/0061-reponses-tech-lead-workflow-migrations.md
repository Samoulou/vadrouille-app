# 0061 — Réponses du Tech Lead à la revue du workflow des migrations (PR #332) ; amende 0056

Statut : décision déléguée (architecture, bibliothèques, outillage, tests : « Qui décide quoi » de `docs/CONTEXT.md`), à lister dans la note de version suivante (rubrique « Décisions prises par le studio ») ; définitive sans veto de Samuel dans les 2 jours qui suivent cette publication · Date : 2026-10-14 · Décideur : Tech Lead · Source : revue consolidée de la PR #332 (commentaire du 2026-10-14 18:11 UTC, head `d647077`), section « Réponses du Tech Lead aux questions de la PR » ; reprises dans la section « Correction 1 » de la description de #332 · Questions : Q419, Q433 à Q436 (Q412 tranchée par le CEO, précisée ici) · Ticket : #337

Numérotation (vérifiée le 2026-10-14) : `main` va de 0001 à 0059 ; parmi les PR ouvertes, #336 ajoute 0060 et #332 modifie 0056 (§ 4.4) ; aucune n'ajoute de 0061. Le ticket #335 réserve 0062. La revue citait « 0058, numéro à vérifier » : 0058 et 0059 sont pris.

Cette décision ne fait que consigner des réponses déjà données à la revue ; elle ne change rien au code de #332.

## Décision

1. **Q419 — accès à `pg-connection-string` (0056 § 2.8, question ouverte 5) : voie 1.** Dépendance directe épinglée, `pg-connection-string` 2.14.1, version identique à celle que `pg` 8.23.1 résout déjà ; le verrou ne gagne que l'entrée racine. Voie 2 (`createRequire(require.resolve("pg"))`) écartée : elle lie `db/migrate.ts` à la structure interne de `pg`. Un analyseur maison est écarté : il divergerait de `pg` sur les cas limites (socket, `?host=`, IPv6). Le refus d'hôte non local est appliqué deux fois : sur la chaîne, puis sur `client.host` une fois la chaîne résolue par `pg`. Toute montée de `pg` vérifie que les deux versions restent alignées.

2. **Q412 — harnais.** Le harnais livré par la PR du workflow (`tests/db/workflows-harnais.ts`) est celui des **bases jetables des workflows** (`<base>_<suffixe>`, amorcées par `db/bootstrap/roles.sql`). Le harnais `_dv` de 0052 (seconde base jetable, confiée à P0r3c par 0055) **reste distinct** ; leur factorisation (`nomBaseJetable` / `urlBaseJetable` avec `urlDeverrouillee`) se fait lors de P0r3c, pas dans #332 (mineur 5 de la revue).

3. **Q434 — liste `MIGRATIONS_APPROUVEES` vide : accepté.** Avec une liste vide, `db-migrate.yml` sort en 0 **sans aucune connexion**. Conséquence écrite (dans `db/README.md` par #332, et ici) : **un run vert avec une liste vide ne teste ni les secrets ni la connexion** ; il ne prouve rien sur l'environnement `db-migrate`.

4. **Q433 — `SET search_path` non local dans le texte d'une migration : pas de garde supplémentaire.** Chaque migration a sa propre session `psql` ; l'exécuteur pose `SET LOCAL search_path = pg_catalog, pg_temp` avant le contrôle de l'étape 6 (0056 § 2) ; le `SET` du texte meurt avec la session, aucun effet ne survit. **Amendement de 0056** (section « Tests imposés », cas « contrôles après le texte ») : pour `SET search_path` non local, l'attente « échec, aucune insertion dans `applied` » se lit **« cas accepté, sans effet »** (migration appliquée et journalisée, `search_path` des sessions suivantes inchangé). Les autres cas de cette liste (`COMMIT`, `SET ROLE`, `SET SESSION AUTHORIZATION`) restent en échec.

5. **Q435 — `push: main` dans `ci.yml` : petite PR dédiée.** 0056 demande les tests de liste « sur chaque PR et sur `main` » (section « Tests imposés », § 3.4), mais `ci.yml` ne tourne que sur `pull_request`. L'ajout de `push: main` ne se fait **pas dans #332** : il passe par une petite PR dédiée, qui touche `.github/workflows/`, donc fusionnable seulement avec l'`owner-approved` posé par Samuel (0035). **Elle est fusionnée avant la PR d'approbation du lot 1.** Le ticket est ouvert par le CEO.

6. **Q436 — test des 600 lignes (0057 § 5.2) : conservé dans `pnpm test`.** Durée relevée sur `ubuntu-24.04` (CI `verify`, head `d647077`) : 171 s, pour une borne de 450 s. Il ne passe pas dans un script à part : le cas protège le plafond de lecture de `db-releve.yml`. À revoir si la durée de `pnpm test` devient gênante.

## Question ouverte, non tranchée ici
- **Sécurité** (correction 1 de #332, 2026-10-14) : point 8 (c) de la revue, exiger au moins une ligne R1, R3 et R6 dans la sortie de `db-releve.yml`. Cela demande d'amender 0057 § 5.3 (bloc de contrôle figé) et le cas des 600 lignes du § 5.2 (596 lignes R3 seulement), qui échouerait sinon. Faut-il amender 0057, et sous quelle forme ? Décision réservée à la Sécurité ; ne bloque pas #332.

## Conséquences
- 0056 porte en tête la mention « Amendée par 0061 » ; son texte n'est pas réécrit (#332 modifie déjà son § 4.4, Q432).
- Le test `SET search_path` non local de #332 cite 0061 au lieu de « décision du Tech Lead à venir ».
- Note de version suivante : lister 0061 avec l'amendement de 0056 § 4.4 (Q432).
