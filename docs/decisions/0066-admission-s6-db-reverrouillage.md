# 0066 — Admission de `db-reverrouillage` dans l'exception S6, et réponses du Tech Lead à la revue de #365

Statut : décision déléguée (architecture, outillage et tests : Tech Lead, « Qui décide quoi » de `docs/CONTEXT.md`), à lister dans la note de version suivante (rubrique « Décisions prises par le studio ») ; définitive sans veto de Samuel **2 jours après sa fusion**. Aucune dépense, aucun compte externe, aucune donnée personnelle : rien n'est réservé à Samuel. Elle ne touche pas à `owner-approved` (décision 0035) : la PR qui la porte reste une PR de workflow, fusionnable seulement avec ce libellé, posé par Samuel.

Date : 2026-10-15 · Décideur : Tech Lead · Avis de la Sécurité : **admission jugée acceptable** (revue consolidée de #365, commentaire du 2026-10-15 06:08 UTC, head `ec91259`, verdict Sécurité « approuvé, aucun bloquant ») ; les bornes du § 2 sont plus étroites que la forme alors examinée et reprennent le durcissement que la Sécurité a proposé (mineur 5) · Source : bloquants 1 et 2, mineur 9 et section « Choix demandés au Tech Lead » de cette revue · Ticket #363 · Complète 0046 (S6), 0052 (§ 1.10), 0056 (§ 4.6) et 0057 (§ 4, R8)

Numérotation (vérifiée le 2026-10-15) : `main` va jusqu'à 0065 ; 0064 est ajoutée par la PR ouverte #357 ; aucune PR ouverte n'ajoute 0066.

## Contexte

L'exigence S6 de 0046, resserrée par 0052 § 1.10, veut qu'aucun fichier hors de `db/`, `tests/db/`, `docs/`, `specs/` et des fichiers Markdown ne nomme `store_prototype_coordinates`, sauf le module appelant fixé par 0052 (`src/adapters/prototype-ecriture.ts`). Le test `tests/unit/p0/base-prototype.test.ts` l'applique. 0057 § 4 (R8) y a ajouté `db-releve` : son workflow lit le catalogue par le nom de la fonction, et son test recopie les cas figés.

La PR #365 livre la coupure d'urgence de 0056 § 4.6 point 1. Son workflow cherche chaque surcharge de la fonction par nom dans `pg_proc` (contrôle final), et son test statique recopie le texte figé, dont le `REVOKE` écrit la signature à quatre paramètres. Ces deux fichiers sortent donc du périmètre de S6. Le head `ec91259` les admet dans le test sans décision écrite (bloquant 1), avec un contrôle plus faible que celui de `db-releve` (bloquant 2 : cinq mentions dans le workflow, nombre non borné).

## Décision

### 1. Admission

`.github/workflows/db-reverrouillage.yml` et `tests/unit/ci/db-reverrouillage.test.ts` sont **admis** dans l'exception S6, sous les bornes du § 2, et **eux seuls**. Raison : 0056 § 4.6 point 1 impose au workflow de désigner chaque surcharge par son `oid` trouvé par nom et schéma (une signature écrite absente ne lèverait pas d'erreur) ; il ne peut le faire sans écrire le nom. Le test statique doit comparer le texte figé, octet pour octet, au `REVOKE` du § 4.6 ; il ne peut le faire sans écrire la signature. Aucun des deux n'appelle la fonction, n'importe le module appelant ni ne transmet de position : l'objet de S6 (que seul le module de 0052 § 1.10 transmette une position à la base) est intact.

**Hors de l'admission** : `tests/support/workflows.ts` et tout autre fichier partagé. La factorisation du mineur 3 de la revue peut y déplacer les cas communs à `db-migrate`, `db-releve` et `db-reverrouillage`, **jamais le nom de la fonction** : les chaînes qui le portent restent dans `tests/unit/ci/db-reverrouillage.test.ts`.

### 2. Bornes (bloquant 2), toutes testées par `tests/unit/p0/base-prototype.test.ts`

Dans `.github/workflows/db-reverrouillage.yml` :

1. **Exactement deux mentions** du nom, et toutes deux de la forme `p.proname = 'store_prototype_coordinates'` : les deux recherches dans `pg_proc` du contrôle final (aucune surcharge ; une surcharge qui garde l'`EXECUTE`). Le commentaire d'en-tête et les deux messages `RAISE EXCEPTION` ne nomment plus la fonction (par exemple « la fonction d'écriture des positions »). Test : `yaml.split(nom).length - 1` vaut 2, et le nombre d'occurrences de `p.proname = '${nom}'` vaut 2.
2. **Aucune signature écrite ni appel** : le nom n'est jamais suivi (espaces admis) de `(` ; le fichier ne contient ni `regprocedure` ni `regproc`.
3. **Aucun `GRANT`** (durcissement proposé par la Sécurité, mineur 5) : `not.toMatch(/\bGRANT\s/i)` sur tout le fichier, commentaires compris ; la phrase d'en-tête « un GRANT en cours d'application » est reformulée (par exemple « une attribution du droit en cours d'application »). Le texte figé, seul porteur de `GRANT vadrouille_fn_coords …`, est dans `db/reverrouillage/`, hors du périmètre de S6.

Dans `tests/unit/ci/db-reverrouillage.test.ts` :

4. **Nombre exact de mentions figé** dans le test S6 à la valeur du head corrigé, que la PR indique dans sa description ; le nom n'y apparaît que dans des littéraux de chaîne ou d'expression régulière (texte figé attendu, contrôle final, cas négatifs). Le changer demande une revue du Tech Lead, comme tout changement de test (CLAUDE.md).
5. **Aucun import** autre que `node:crypto`, `node:fs`, `node:path`, `node:url`, `vitest` et `../../support/workflows` : ni `pg`, ni `node:child_process`, ni rien de `src/` ou de `db/`. Le test reste statique, sans connexion.

Pour `.github/workflows/db-releve.yml`, la borne de 0057 reste : une seule mention, jamais suivie de `(`. Le commentaire du test le dit pour ce seul fichier (mineur 5).

**Cas négatifs imposés** (bloquant 2) : le contrôle S6 est écrit comme une fonction pure (contenu des fichiers en entrée, liste d'écarts en sortie) appliquée au dépôt, et le test montre qu'elle **refuse** chacun de ces cas, construits par remplacement dans le contenu réel :
- une troisième mention du nom dans le workflow (dans un commentaire) ;
- une mention du nom hors d'un `p.proname = '…'` qui garde le compte à deux (une recherche remplacée par `p.proname LIKE 'store_prototype%'` et le nom remis dans un message) ;
- `'public.store_prototype_coordinates(uuid, text, double precision, double precision)'::pg_catalog.regprocedure` dans le workflow ;
- `GRANT` dans le workflow ;
- une mention de plus dans le test statique ;
- un `import … from "pg"` dans le test statique ;
- le nom dans `tests/support/workflows.ts` (fichier hors de la liste admise).

Le fichier du dépôt, lui, ne présente aucun écart.

### 3. Référence dans le test

Dans `tests/unit/p0/base-prototype.test.ts`, la ligne « Admission proposée à la revue (Sécurité, Tech Lead). » du bloc `REVERROUILLAGE` est remplacée par « Admission : décision 0066 (bornes : § 2). » Celle du bloc `RELEVE` peut citer « Admission : décision 0057, § 4 (R8). » au même passage (mineur 5).

### 4. Réponses aux trois choix posés au Tech Lead par l'auteur de #365

1. **Repère de transaction et contrôle complet de l'étape 6, repris de `db-migrate.yml` : confirmé.** 0056 § 4.6 cite « le contrôle de rôle de l'étape 6 » ; le contrôle complet (rôle, `session_replication_role`, repère `vadrouille_migrate.txid`) est plus strict et détecte en plus un texte qui changerait de transaction. La même instruction SQL dans deux workflows est imposée par 0056 (aucun fichier du dépôt n'est exécuté ni chargé par le job) ; pour qu'elle ne diverge pas, **le test statique vérifie que `SQL_SESSION`, `SQL_ROLE`, `SQL_DELAIS`, `SQL_VERROU`, `SQL_REPERE`, `SQL_APRES_CHEMIN` et `SQL_APRES` de `db-reverrouillage.yml` sont égaux à ceux de `db-migrate.yml`**, avec un cas négatif ; à livrer avec la factorisation du mineur 3.
2. **`SET search_path = pg_catalog, pg_temp` non local avant le bloc `DO` final : accepté.** Après le `COMMIT`, un `SET LOCAL` n'aurait aucun effet hors transaction ; le bloc `DO` ne désigne que des objets qualifiés (`pg_catalog.*`, `'public'` par `nspname`), et le réglage meurt avec la session `psql`, qui se termine aussitôt. Même raisonnement que 0061 point 4.
3. **Séparateurs `--> statement-breakpoint` conservés dans le texte figé : confirmé.** Ils sont des commentaires SQL pour `psql`, donc sans effet dans le `-c` du workflow, et le cadre de `0001_securite.sql` les porte. La PR du § 4.3 de 0056 copie le texte figé **octet pour octet**, séparateurs compris (0056 § 4.2 ; test `migrations: retour arrière du déverrouillage identique au texte figé de db-reverrouillage`).

### 5. Échec du contrôle final : ne pas relancer en boucle, escalader (mineur 9)

Précision de 0056 § 4.6 point 1 (« le lanceur vérifie la conclusion `success` de son run et relance sinon ») :

- **Relance admise une fois** seulement, et seulement si le run n'a pas atteint le contrôle final : run annulé en attente dans le groupe `db-migrate`, échec avant connexion ou de connexion, délai dépassé.
- **Contrôle final en échec** (SQLSTATE `P0001`) : **ne pas relancer**. Le `REVOKE` est déjà validé ; si `vadrouille_prototype` garde l'`EXECUTE`, c'est par un autre chemin (`PUBLIC`, appartenance à un rôle qui a le droit), que ce texte figé ne retire pas : une relance donnerait le même échec. Le lanceur **escalade aussitôt** : il alerte le CEO avec le numéro du run et le SQLSTATE ; le CEO signale dans `#studio` qu'aucune exécution du prototype ne doit être lancée et prévient Samuel (0056 § 4.6) ; la Sécurité relève l'origine du droit avec `db-releve` (R6, R8) et propose la migration de reverrouillage durable (§ 4.6 point 2) qui retire ce chemin, par le chemin ordinaire d'approbation. Le refus de lancement du § 4.5 ne joue peut-être pas tant que le droit reste : la consigne du CEO est alors la seule barrière jusqu'à cette migration.
- **Deux runs en échec**, quelle qu'en soit la cause, valent « échec répété » au sens de 0056 § 4.6 point 3 : le dernier recours de Samuel est proposé, s'il l'a accepté par écrit (question ouverte 8 de 0056).

Le runbook de `db/README.md` (paragraphe de la coupure, mineur 7) reprend ces trois règles en une phrase chacune ; c'est à la PR #365 de l'écrire.

## Alternatives écartées

- **Laisser le contrôle de #365 en l'état** (aucun appel, nombre non borné) : une mention ajoutée plus tard dans un commentaire ou un message passerait sans revue ; l'exception doit être plus étroite que celle de `db-releve`, pas plus large.
- **Amender 0056 sans nouvelle décision** : 0056 porte déjà l'amendement de 0061 et ne parle pas de S6 ; une décision courte, citée par le test, est plus facile à retrouver.
- **Retirer le nom du workflow** (recherche par `pg_depend` ou par propriétaire) : plus fragile que la recherche par nom et schéma imposée par 0056 § 4.6, et sans gain pour S6.

## Conséquences

- 0056 porte en tête la mention « Complétée par 0066 » ; son texte n'est pas réécrit.
- La PR #365 (rôle data) corrige le bloquant 2 selon le § 2, remplace le commentaire selon le § 3, ajoute le test d'égalité du § 4 point 1 et le runbook du § 5.
- Note de version suivante : lister 0066.

## Quand revoir cette décision

À la PR du § 4.3 de 0056 (déverrouillage) et à celle du reverrouillage durable (§ 4.6 point 2), qui ne touchent que `db/` ; à tout changement du contrôle final de `db-reverrouillage.yml` ; si un troisième fichier hors de `db/` doit nommer la fonction.
