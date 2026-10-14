# 0057 — Relevé `db-releve`

Statut : décision déléguée, proposée (exigences, risques et verdicts : Sécurité ; outillage et tests : Tech Lead, « Qui décide quoi » de `docs/CONTEXT.md`), à lister dans la note de version suivante (rubrique « Décisions prises par le studio ») ; définitive sans veto de Samuel **2 jours après sa fusion**. Les passages marqués **(TL)** sont **proposés par la Sécurité, non signés tant que le Tech Lead n'a pas approuvé la PR** ; le délai de veto de Samuel ne vaut pas signature du Tech Lead.

Date : 2026-10-14 · Rédaction : rôle Sécurité, avec le Tech Lead pour l'outillage (découpage décidé par le CEO, Q418) · Ticket #314 · Numéro 0057 réservé par cette PR (mineur 3 de la revue de #300 au head `f8a0f3f`)

**Propositions à Samuel, hors du régime « sans veto »** : toute charge que cette décision fait peser sur Samuel est une **proposition qui attend sa réponse écrite**, jamais acquise par son silence : l'environnement `db-releve`, ses secrets et la copie du mot de passe de purge (Q387, partie (b) : question ouverte 1), le relevé des environnements et de leurs secrets (Q394 : question ouverte 2), et tout relevé qu'il ferait lui-même dans la console Neon (question ouverte 3).

**Ne crée ni workflow, ni secret, ni environnement, ni réglage d'un compte externe.** Elle fixe ce que contient la PR de `db-releve.yml` (§ « Conséquences ») et complète 0056 aux endroits que celle-ci lui renvoie (§ 7). Elle ne lève pas le verrou S8 et ne change aucune condition de 0056 : elle fixe **qui fait les relevés et comment**.

## Contexte

0056 (#300, fusionnée : `53e677a`) renvoie à cette décision, par son § 2.11, le relevé du catalogue en lecture qui remplace les relevés que 0052 (question ouverte 5) attribuait à Samuel. Le texte de départ est le § 2.11 du head `37fffa4b8b93d10ba53673b56d4c7569baa3a50a` de #300 (`git show 37fffa4b8b93d10ba53673b56d4c7569baa3a50a:docs/decisions/0056-migrations-et-deverrouillage-prototype.md`, lignes 65 à 93 ; SHA complet cité, mineur 5 du head `f8a0f3f`). Sa revue consolidée (head `37fffa4`) a testé le motif de sortie en bash 5.2 sous `LC_ALL=C` (R1 à R8 acceptés, cas négatifs refusés, aucune commande de workflow ne peut fuir dans le journal) et n'a relevé que les points suivants, que cette décision traite dès le départ :

| Point de la revue (head `37fffa4`)                                                               | Traité au                |
| ------------------------------------------------------------------------------------------------ | ------------------------ |
| Bloquant 1 — forme exacte d'affectation du motif, qui contient une apostrophe, figée par le test | § 5.1, « Tests imposés » |
| Mineur 2 — caractère légitime hors de la classe : échec assumé, à dire                           | § 5.3                    |
| Mineur 3 — coût du motif répété en bash face au `timeout-minutes`                                | § 5.2, § 1               |
| Mineur 4 — contrôles de `PGHOST` (sans `-pooler`) et de `PGDATABASE` dans le relevé              | § 2                      |
| Mineur 5 — échec de ces contrôles sans affichage de la valeur                                    | § 2                      |

Tout le reste du § 2.11 approuvé par cette revue est **repris tel quel** : environnement distinct, rôle, requêtes R1 à R8, classe de caractères, cas positifs, source de P0S2-PO-7. Les écarts au texte du head `37fffa4` sont listés au § 8.

## Décision

### 1. Workflow `db-releve` (exigences : Sécu ; outillage : TL)

`.github/workflows/db-releve.yml`, livré par une PR de workflow (`owner-approved`, 0035), distincte de la PR du workflow `db-migrate` de 0056 :

- déclencheur `workflow_dispatch` seul, **sans `inputs`** ; `if: github.ref == 'refs/heads/main'` sur le job ; **environnement GitHub distinct `db-releve`** (règle de déploiement : `main` seule ; aucun relecteur), avec ses propres secrets `RELEVE_PGHOST`, `RELEVE_PGDATABASE` et `RELEVE_PGPASSWORD`, exposés à la seule étape du relevé ; `PGUSER: vadrouille_prototype_purge` écrit en clair. **L'environnement `p0-purge` et ses secrets ne sont pas utilisés** : 0046 (D16 point 7) les réserve à `p0-purge.yml`, et `tests/unit/ci/p0-purge.test.ts` (« l'environnement p0-purge n'est nommé que par p0-purge.yml ») le vérifie ; `db-releve.yml` ne nomme donc ni `p0-purge` ni `P0_PURGE_` (pas même en commentaire), ni `db-migrate` ni `MIGRATOR_`, et ni 0046 ni ce test ne sont amendés. Le mot de passe de `vadrouille_prototype_purge` est posé une seconde fois, dans `RELEVE_PGPASSWORD`, par qui la question ouverte 1 désigne ;
- `permissions: {}` ; `runs-on: ubuntu-24.04` ; **`timeout-minutes: 10`** (5 au head `37fffa4` : relevé au § 5.2, mineur 3) ; `concurrency: { group: db-releve, cancel-in-progress: false }` ; **aucune action, ni checkout** : le job n'a aucun fichier du dépôt ;
- `env:` de l'étape : `LC_ALL: C`, `PGHOST`, `PGDATABASE`, `PGPASSWORD` (les trois secrets ci-dessus), `PGUSER`, `PGSSLMODE: verify-full`, `PGSSLROOTCERT: system` ; aucune autre variable `PG*`, ni `DATABASE_URL`, ni `VADROUILLE_DATABASE_URL*` ;
- mêmes commandes interdites qu'au § 2.5 de 0056 (`eval`, `exec`, `trap`, `export`, `declare`, `let`, `(( ))`, `$(( ))`, toute commande qui charge un fichier, `psql -f`, entrée redirigée ou tube vers `psql`) ; **seule commande externe admise : `psql -X`** ; une comparaison numérique ne porte que sur `${#…}` ; ni `set -x`, ni affichage de l'environnement.

### 2. Contrôles avant connexion (Sécu) — mineurs 4 et 5

Premiers dans l'étape, sans connexion, dans les mêmes formes qu'au § 2.6.1 de 0056 : `psql --version` de version majeure 16 ou plus (`sslrootcert=system`) ; `PGHOST` suit `^[a-z0-9.-]{1,253}$` et **ne contient pas `-pooler`** (hôte direct exigé : la session du § 3 enchaîne un `SET`, un bloc `DO` et une transaction que le pooler en mode transaction pourrait servir par des connexions serveur différentes ; le contrôle est un filet sur la convention de nommage de Neon, l'exigence restant celle de la question ouverte 1) ; `PGDATABASE` suit `^[a-z0-9_]{1,63}$`. **En cas d'échec de l'un de ces contrôles, le job n'affiche ni la valeur de `PGHOST` ni celle de `PGDATABASE`, ni une partie d'elles** (les journaux d'Actions d'un dépôt public sont publics) : il n'affiche que le nom du contrôle en échec, par un message fixe, et échoue sans connexion.

### 3. Rôle et session (Sécu)

- Rôle **`vadrouille_prototype_purge`** : il n'a qu'`EXECUTE` sur `prototype.purge_expired()` et `USAGE` sur le schéma `prototype` (`0003_prototype.sql`, lignes 514 à 518), aucun droit sur une table ; le relevé ne l'appelle pas.
- Une seule session `psql -X -v ON_ERROR_STOP=1 -A -t -F '|'` : `SET search_path = pg_catalog, pg_temp` ; puis, **en premier**, un bloc `DO` qui lève une exception si `session_user` ou `current_user` diffère de `vadrouille_prototype_purge`, si ce rôle a `rolsuper` ou `rolbypassrls`, ou si `ssl` est faux dans `pg_catalog.pg_stat_ssl` pour son processus ; puis `BEGIN TRANSACTION READ ONLY` ; puis **exactement les requêtes R1 à R8** (§ 4), écrites en clair dans le YAML et approuvées avec lui. La session se termine sans `COMMIT` ; rien n'est écrit.

### 4. Requêtes R1 à R8 (Sécu ; reprises du head `37fffa4`)

Chacune est préfixée par son étiquette en première colonne et ne lit que `pg_catalog` (le catalogue est lisible par tout rôle connecté ; aucune donnée de table n'est lue, donc ni donnée Google ni donnée personnelle) :

- **R1 extensions** : `pg_extension` — nom, version, schéma ;
- **R2 fonctions d'extension** : `pg_proc` joint à `pg_depend` (`classid = 'pg_proc'::regclass`, `objid = pg_proc.oid`, `deptype = 'e'`, `refclassid = 'pg_extension'::regclass`, `refobjid = pg_extension.oid` ; sans `classid`, un `objid` pourrait être l'oid d'un objet d'un autre catalogue) — extension, `oid::regprocedure`, `prosecdef`, propriétaire, `proacl::text` ;
- **R3 rôles** : `pg_roles` — nom, `rolsuper`, `rolinherit`, `rolcreaterole`, `rolcreatedb`, `rolcanlogin`, `rolreplication`, `rolbypassrls` ;
- **R4 appartenances** : `pg_auth_members` — rôle, membre, auteur, `admin_option`, `inherit_option`, `set_option` (PostgreSQL 16 ou plus), dont l'appartenance éventuelle de l'identifiant propriétaire à `pg_signal_backend` (0056, § 4.6, point 3) ;
- **R5 droits par table et par colonne** : `pg_class` des schémas `public`, `prototype` et `vadrouille_migrations` — schéma, nom, `relkind`, propriétaire, `relacl::text`, `relrowsecurity`, `relforcerowsecurity` ; `pg_attribute` de ces relations dont `attacl` n'est pas nul — relation, colonne, `attacl::text` ;
- **R6 fonctions** des schémas `public` et `prototype` — `oid::regprocedure`, `prosecdef`, propriétaire, `proacl::text`, `proconfig::text` (`PUBLIC` y apparaît comme `=X/…` ; les `vadrouille_fn_*` comme propriétaires) ;
- **R7 privilèges par défaut** : `pg_default_acl` — rôle, schéma, type d'objet, `defaclacl::text` ;
- **R8 verrou S8** : pour **chaque surcharge existante** de `public.store_prototype_coordinates`, trouvée dans `pg_proc` par nom et schéma : `oid::regprocedure` et `has_function_privilege('vadrouille_prototype', oid, 'EXECUTE')`. La fonction est désignée par son `oid`, jamais par une signature écrite : une signature absente ne lève pas d'erreur, elle n'apparaît pas. La signature à quatre paramètres n'existe qu'après l'application de la migration de remplacement de 0052 § 1.7 (lot 2 de 0056) ; **avant, R8 ne peut pas la viser**, et la condition 4 du § 4.1 de 0056 n'est pas réunie.

### 5. Sortie publique et motif (Sécu ; outillage : TL)

La sortie standard et d'erreur de `psql` vont dans un fichier de `$RUNNER_TEMP`, jamais affiché ni téléversé (une erreur de connexion commence par `psql:` et peut nommer l'hôte). Seules les lignes de ce fichier qui suivent le motif figé ci-dessous sont affichées.

**5.1 Motif et forme exacte d'affectation (bloquant 1).** Le motif contient une apostrophe (`$'@` de la classe) : il ne peut pas être tenu entre apostrophes d'un seul tenant. Il est affecté par **cette ligne exacte**, seule affectation de `motif` dans le bloc `run:`, à écrire telle quelle (le test la compare à la chaîne exacte, § « Tests imposés ») :

```bash
motif='^R[1-8](\|[][A-Za-z0-9_.,:;=/{}"()*+$'"'"'@<>#\ -]{0,500}){1,8}$'
```

Lecture de la ligne : trois mots collés, `'^R[1-8](\|[][A-Za-z0-9_.,:;=/{}"()*+$'` entre apostrophes, `"'"` (une apostrophe entre guillemets), `'@<>#\ -]{0,500}){1,8}$'` entre apostrophes ; aucune expansion n'a lieu (`$'` et `\` restent littéraux dans les deux parties entre apostrophes). La valeur obtenue est :

```text
^R[1-8](\|[][A-Za-z0-9_.,:;=/{}"()*+$'@<>#\ -]{0,500}){1,8}$
```

La forme ANSI-C `$'…'`, qui demanderait d'échapper `\` et `'`, n'est pas retenue (§ 8). Le motif est une expression régulière étendue POSIX, employée **sans guillemets** à droite de `=~` : `[[ $ligne =~ $motif ]]`, sous `LC_ALL: C`. Lecture : l'étiquette `R1` à `R8`, puis de une à huit colonnes (R3, la plus large, en a huit), chacune précédée du séparateur `|` de `-F '|'` et formée de **0 à 500 caractères** d'une **classe fermée qui exclut `|`** : lettres et chiffres ASCII, `_ . , : ; = / { } " ( ) * + $ ' @ < > #`, `[` et `]` (`regprocedure` avec tableau, `text[]`, R2 et R6), `\` (guillemet échappé dans `proconfig::text`), espace et `-`. Une colonne vide (ACL nulle, schéma nul de `pg_default_acl`) est admise. Ni tabulation, ni caractère de contrôle (séquence d'échappement de terminal), ni octet hors ASCII, et une ligne commence toujours par `R` : aucune commande de workflow (`::…`) ni ligne `psql:` ne peut être affichée.

**5.2 Lecture et coût (mineur 3).** Le fichier est lu une fois par `mapfile -t -n 601 lignes < "$sortie"` (redirection vers `mapfile`, pas vers `psql`) ; **plus de 600 lignes : échec**, par un message fixe, sans rien afficher. Puis chaque ligne du tableau est comparée au motif (`for ligne in "${lignes[@]}"`), et seules les lignes qui le suivent sont affichées (`printf '%s\n' "$ligne"`). Relevés de la Sécurité dans le bac à sable (bash 5.2.21, celui d'`ubuntu-24.04`, `LC_ALL=C`), car bash recompile l'expression à chaque `[[ =~ ]]` et la borne répétée huit fois en fixe le coût : borne 2 000 (head `37fffa4`) : 0,43 s par ligne courte, soit environ 90 s pour 209 lignes réalistes ; **borne 500 : 0,036 s par ligne réaliste (7,6 s pour 209 lignes), 0,40 s par ligne de huit colonnes de 500 caractères**, soit au plus 240 s pour 600 lignes de ce pire cas, sous les 600 s du `timeout-minutes` (marge de 2,5). Un relevé attendu compte environ 150 à 300 lignes (rôles prédéfinis de PostgreSQL, rôles du projet et de Neon, appartenances, tables, fonctions). **Filtrage unique par `grep -aE` écarté** : avec la même répétition bornée imbriquée, GNU grep 3.11 a mis 16 s sur 6 lignes à la borne 500, et n'a pas terminé en plus de 100 s à la borne 2 000 sur 10 lignes négatives (§ 8). La PR de `db-releve.yml` refait la mesure sur `ubuntu-24.04` et la joint ; si le pire cas dépasse la moitié du `timeout-minutes`, elle abaisse le plafond de lignes, jamais la classe.

**5.3 Échec fermé (mineur 2).** Le job affiche le **nombre de lignes lues** et le **nombre de lignes affichées** (tailles de tableaux, sans arithmétique), et le code de sortie de `psql` ; il **échoue** (a) si une ligne qui commence par `R[1-8]|` ne suit pas le motif, (b) si le code de sortie de `psql` n'est pas 0, (c) au-delà de 600 lignes : un relevé tronqué ou en erreur ne passe jamais pour complet. **Ce refus est assumé** : un caractère légitime hors de la classe (`%`, `!`, `&`, `~`, `?`, `^`, une lettre accentuée ou tout octet hors ASCII, par exemple dans un nom entre guillemets ou un `proconfig`), une colonne de plus de 500 caractères (ACL longue) ou plus de huit colonnes fait échouer le relevé entier, sans rien afficher de la ligne fautive. C'est une perte de disponibilité, jamais une fuite : la classe reste fermée par défaut. La Sécurité analyse alors le run sans en afficher le contenu (elle ne voit que les compteurs et le code de sortie), et la correction est une PR de workflow qui ajuste la requête (par exemple `pg_catalog.quote_ident`, `pg_catalog.left`) ou le motif ; **un changement du motif ou des cas figés amende cette décision** dans la même PR, le test comparant le YAML à ce texte.

**5.4 Lignes masquées attendues.** Sans `-q`, `psql` écrit aussi les messages de commande (`SET`, `DO`, `BEGIN`) : ce sont les seules lignes masquées d'un run normal, leur nombre est connu. **La Sécurité ne rend aucun verdict sur un run dont l'écart entre lignes lues et lignes affichées diffère de ce nombre** : un nom d'objet entre guillemets qui contient un saut de ligne couperait sa ligne en deux, dont la seconde, qui ne commence pas par `R`, serait masquée sans échec.

**5.5 Cas figés**, que le test « motif de sortie » vérifie contre la valeur extraite du YAML (§ « Tests imposés »). Les exemples sont des formes, pas un état attendu de la base (les noms propres à Neon, comme `neondb_owner`, sont illustratifs).

Cas positifs, un par requête au moins (acceptés) :

```text
R1|plpgsql|1.0|pg_catalog
R2|pgcrypto|public.armor(bytea, text[], text[])|f|neondb_owner|
R3|vadrouille_prototype|f|t|f|f|t|f|f
R4|vadrouille_fn_coords|vadrouille_migrator|neondb_owner|t|f|f
R5|public|place_coordinates|r|vadrouille_owner|{vadrouille_owner=arwdDxtm/vadrouille_owner,vadrouille_fn_coords=arwd/vadrouille_owner}|t|t
R5|public.places|nom|{vadrouille_app=r/vadrouille_owner}
R6|public.store_prototype_coordinates(uuid, text, double precision, double precision)|t|vadrouille_fn_coords|{vadrouille_fn_coords=X/vadrouille_fn_coords}|{"search_path=pg_catalog, pg_temp"}
R6|public."Fonction"(integer[])|f|vadrouille_owner||{"search_path=\"$user\", public"}
R7|vadrouille_owner|public|r|{vadrouille_app=r/vadrouille_owner}
R7|vadrouille_owner||f|{=X/vadrouille_owner}
R8|public.store_prototype_coordinates(uuid, text, double precision)|f
```

Plus une ligne `R1|` suivie d'une colonne de 500 `a` (borne atteinte, acceptée) et une ligne `R1|` suivie de huit colonnes de 500 `a` (pire cas, accepté).

Cas négatifs (refusés) : `psql: error: connection to server at "…"` ; `R9|x` ; `R1` sans colonne ; `r1|x` ; ` R1|x` (espace en tête) ; `::add-mask::x` ; une colonne contenant une tabulation ou un caractère d'échappement (`\x1b`) ; neuf colonnes ou plus ; une colonne de 501 caractères ; **caractères hors classe assumés (§ 5.3)** : `R1|50%`, `R1|a!`, `R1|a&b`, `R1|~`, `R1|?`, `R1|^`, `R1|café` (octets `c3 a9`). Tous ces cas, positifs et négatifs, ont été vérifiés par la Sécurité dans le bac à sable avec la ligne du § 5.1 (bash 5.2.21, `LC_ALL=C`).

**Les journaux d'Actions d'un dépôt public sont publics** : les lignes affichées (noms de rôles, d'extensions, de fonctions, droits) le sont aussi (risque (h)).

### 6. Lancement, consignation et source de P0S2-PO-7 (Sécu)

- **Lancé par la Sécurité**, qui consigne le résultat dans le ticket : lien du run, conclusion, compteurs du § 5.3, lignes affichées, et son verdict ; jamais de valeur secrète. Moments : **après l'application du lot 2** de 0056 et avant la PR du § 4.3 de 0056 (condition 4 du § 4.1) ; **après l'application de la migration de déverrouillage** (§ 4.4 de 0056) ; à chaque reverrouillage (§ 4.6 de 0056) ; et une fois dès que l'environnement existe, pour R4 (appartenances de l'identifiant propriétaire de Neon, § 4.6 point 3 de 0056). **Cette désignation est une consigne, non un contrôle** : `workflow_dispatch` est ouvert à tout compte qui a l'écriture, dont le compte partagé ; un lancement par un autre rôle reste sans risque propre (lecture seule, sortie filtrée).
- **Aucune session d'agent ne se connecte à la base** : P0S2-PO-7 (« aucun agent n'accède à la base ») est tenu, la requête étant versionnée et approuvée par `owner-approved`.
- **Source versionnée de P0S2-PO-7** : `prototype/sql/releve-roles.sql`, chemin proposé par la spécification, n'existe pas sur `main`, et `db-releve`, sans checkout, ne pourrait pas le lire. Le relevé des rôles et des droits de P0S2-PO-7 est donc **le texte R3 à R8 écrit dans `db-releve.yml`**, seule version de cette requête dans le dépôt ; si Samuel accepte par écrit de faire lui-même un relevé dans la console Neon (question ouverte 3), il exécute ce même texte, copié du YAML.
- **Limite** : le relevé montre l'état à l'instant du run ; un changement fait ensuite hors du workflow (risque (d)) n'est vu qu'au relevé suivant.

### 7. Ce que cette décision fixe pour 0056

Les points de 0056 qui « attendent 0057 » se lisent ainsi, sans changer ce qu'ils exigent de montrer :

1. **Condition 4 du § 4.1 (déverrouillage)** : les relevés P0S2-PO-7 (R6 et R8 : `has_function_privilege('vadrouille_prototype', …, 'EXECUTE')` faux pour chaque surcharge, aucun `EXECUTE` pour `PUBLIC` ni pour un rôle autre que le propriétaire) et des extensions (R1 et R2, avec le verdict de la Sécurité sur les fonctions `SECURITY DEFINER` et les extensions de l'annexe A de 0056) sont **faits par la Sécurité avec `db-releve`**, après l'application du lot 2, et consignés. La condition reste non réunie tant que 0057 n'est pas définitive, que la PR de `db-releve.yml` n'est pas fusionnée et que la question ouverte 1 n'a pas de réponse écrite (sans environnement, pas de relevé).
2. **§ 4.4 (après application)** : relevé refait par la Sécurité avec `db-releve` (R6 et R8 : `EXECUTE` à `vadrouille_prototype` seul, hors propriétaire, `PUBLIC` exclu) ; **le premier lancement du prototype attend ce relevé consigné** (mineur 7 du head `f8a0f3f`).
3. **§ 4.6, point 3 (appartenances)** : le test de la commande de dernier recours reproduit les appartenances de l'identifiant propriétaire de Neon **lues dans R4** ; à défaut de relevé R4 au moment de la PR de `db-reverrouillage.yml`, les deux cas (avec et sans `pg_signal_backend`) de 0056 restent exigés.
4. **Relevé des environnements et de leurs secrets** (§ 2.10 de 0056, risque (c)) : `db-releve` ne lit pas les réglages GitHub et les sessions d'agent reçoivent une erreur 403 sur les environnements et les secrets ; il reste proposé à Samuel (question ouverte 2).
5. **P0S2-PO-7** : le CEO reporte dans `specs/P0-suite-2.md` que la requête versionnée est le texte R3 à R8 de `db-releve.yml` (§ 6), à la place du chemin proposé.

### 8. Alternatives écartées et écarts au head `37fffa4` (Sécu, TL)

- **Relevés par Samuel dans la console Neon** (0052, question ouverte 5 ; P0-Q24) : Samuel ne souhaite pas manipuler Neon lui-même (0056, § 4.6, point 3) ; remplacés par `db-releve`, en lecture seule sous `vadrouille_prototype_purge`. La console reste possible sur sa seule acceptation écrite (question ouverte 3).
- **`db-releve` sous l'environnement `p0-purge`** (head `f1206eb` de #300) : contraire à 0046 (D16 point 7) et à `tests/unit/ci/p0-purge.test.ts` ; amender l'une et l'autre étendrait la surface du secret de purge à un second workflow.
- **Rôle dédié au relevé** (connexion seule, aucun droit) : éviterait de poser le mot de passe de `vadrouille_prototype_purge` dans un second environnement, mais ajoute un rôle (0007 et 0046 : 16 rôles, `tests/db/roles.test.ts`) et une migration ; non retenu tant que Samuel accepte la copie (question ouverte 1), repris sinon par une décision ultérieure.
- **Affectation entre apostrophes d'un seul tenant** (texte du head `37fffa4`) : impossible, le motif contenant une apostrophe (bloquant 1). **Forme `$'…'`** : demande d'échapper `\` (deux fois dans la classe et le séparateur) et `'`, donc une valeur différente de la chaîne écrite, plus facile à fausser ; la forme du § 5.1 garde chaque caractère du motif tel quel sauf l'apostrophe.
- **Borne 2 000 maintenue** : 0,43 s par ligne courte et 5 à 17 s par ligne longue (revue du head `37fffa4`), un relevé coupé par le `timeout-minutes` ressemblerait à une panne ; ramenée à 500 avec plafond de 600 lignes et `timeout-minutes: 10` (§ 5.2). Une colonne plus longue fait échouer le relevé (§ 5.3).
- **Filtrage unique par `grep -aE`** (piste de la revue) : mesuré pathologique avec la répétition bornée imbriquée (§ 5.2) ; non retenu.
- **Motif sans borne par colonne, longueur contrôlée à part** : plus rapide, mais change la forme approuvée du motif et sa preuve ; non retenu.
- **Écarts au head `37fffa4`**, tous issus de la revue : forme d'affectation écrite (§ 5.1) ; borne 500 au lieu de 2 000, `mapfile` et plafond de 600 lignes au lieu de `while IFS= read -r`, `timeout-minutes: 10` au lieu de 5 (§ 5.2) ; échec sur code de sortie de `psql` non nul et refus assumé écrit (§ 5.3) ; contrôles de `PGHOST` et `PGDATABASE` sans affichage (§ 2) ; contrôle `ssl` ajouté au bloc `DO` du rôle, comme pour `db-migrate` (§ 3) ; lignes masquées attendues (§ 5.4) ; cas positifs aux bornes et cas négatifs hors classe (§ 5.5) ; mention interdite de `db-migrate` et de `MIGRATOR_` (§ 1).

### 9. Risques résiduels (Sécu)

- **(h) Secret de purge et sortie publique** : le mot de passe de `vadrouille_prototype_purge` est posé dans un second environnement (`db-releve`, distinct de `p0-purge`), lu par un second workflow, sous un rôle sans droit sur une table et dans une transaction en lecture seule ; **la sortie du relevé est publique** (journaux d'Actions d'un dépôt public) : noms des rôles, des extensions, des fonctions et droits, déjà largement lisibles dans les migrations du dépôt, plus les rôles propres à Neon et les appartenances de l'identifiant propriétaire ; ni hôte, ni secret, ni donnée de table.
- **(d) Ce que le relevé ne lit pas** : R1 à R8 ne lisent ni `pg_db_role_setting` (paramètres posés par `ALTER ROLE` ou `ALTER DATABASE … SET`), ni les déclencheurs (`pg_trigger`), ni les règles (`pg_rewrite`), ni les politiques (`pg_policy`), ni les déclencheurs d'événement (`pg_event_trigger`), que l'annexe A de 0056 cite comme détours : un tel changement fait hors du workflow n'est vu par aucun relevé. Par `db-migrate`, ils restent des motifs de refus de G1, G2 et G3 à l'approbation. Les ajouter demanderait un amendement de cette décision (nouvelles requêtes, motif, cas figés) et l'évaluation de leur publication.
- **(c) Environnement élargi** par un agent sous le compte partagé : les secrets de `db-releve` deviendraient lisibles par un workflow d'une autre branche. **Aucun agent ne modifie l'environnement `db-releve`, sa règle de branche ni ses secrets** après leur création ; filet : question ouverte 2 ; à lever avec un compte distinct pour les agents (0035, « Quand revoir »).
- **(a bis) Lanceur désigné par consigne** (§ 6) ; borne : lecture seule, sortie filtrée.
- **(j) Disponibilité** : un caractère hors classe, une colonne longue ou un relevé plus long que prévu fait échouer le relevé (§ 5.3) ; la condition 4 du § 4.1 de 0056 attend alors la PR de correction. Échec fermé, assumé.
- **(g)** `psql` et bash viennent de l'image du runner, pas du dépôt.

### 10. Verdicts

- **Sécurité** : relevé `db-releve` **accordé** sous les § 1 à § 6, à la fusion de la PR de `db-releve.yml` avec ses tests et à la réponse écrite de Samuel à la question ouverte 1. Il ne change pas D17 (0056, § 7), qui n'en dépend pas.
- **Tech Lead** — **proposé par la Sécurité, non signé tant que le Tech Lead n'a pas approuvé la PR** : forme d'affectation du § 5.1, lecture par `mapfile`, borne et plafond du § 5.2, `timeout-minutes: 10`, tests ci-dessous.

### Tests imposés (TL) — dans la PR de `db-releve.yml`

- `ci: workflow db-releve conforme à 0057` (statique, sur le modèle de `tests/unit/ci/visual-update.test.ts`), un cas négatif par exigence : déclencheur ou `inputs` ajoutés ; condition `main` absente ; environnement autre que `db-releve` ; secret au niveau du job ou du workflow ; variable `PG*` hors liste ; `PGSSLMODE` autre que `verify-full` ; checkout ou autre action `uses:` ; mention de `p0-purge`, `P0_PURGE_`, `db-migrate` ou `MIGRATOR_` ; `permissions` autres que `{}` ; `runs-on`, `timeout-minutes` (10) ou `concurrency` absents ou différents ; commande interdite (§ 1) ou commande externe autre que `psql` ; `psql` sans `-X` ou sans `ON_ERROR_STOP=1` ; `psql -f`, entrée redirigée ou tube vers `psql` ; bloc `DO` du rôle absent ou après la première requête ; absence de `READ ONLY` ; requête hors de `pg_catalog` ou différente de R1 à R8 ; signature de `store_prototype_coordinates` écrite au lieu de son `oid` ; jointure de R2 sans `classid = 'pg_proc'::regclass` ; contrôle `-pooler` de `PGHOST` absent ; contrôle de forme de `PGHOST` ou de `PGDATABASE` absent ; **valeur de `PGHOST` ou de `PGDATABASE` citée dans un message d'échec** (`$PGHOST`, `${PGHOST…}`, `$PGDATABASE`, `${PGDATABASE…}` hors des contrôles eux-mêmes) ; `set -x` ou affichage de l'environnement.
- `ci: motif de sortie de db-releve figé par 0057` : (1) le bloc `run:` contient **une seule** ligne qui commence par `motif=`, et elle est **égale, caractère pour caractère, à la ligne du § 5.1** ; (2) cette ligne, exécutée par `bash` (`LC_ALL=C`) suivie de `printf '%s' "$motif"`, rend exactement la valeur du § 5.1 ; (3) le motif n'est employé que sous la forme `[[ $ligne =~ $motif ]]`, sans guillemets ; (4) chaque cas positif du § 5.5 est accepté et chaque cas négatif refusé par `[[ … =~ $motif ]]` en bash sous `LC_ALL=C`, avec la valeur obtenue en (2) ; (5) les comparaisons portent sur des chaînes figées dans le test, recopiées de cette décision, jamais sur une valeur relue du YAML seul.
- `ci: sortie de db-releve en échec fermé` (bash, sans base : le test extrait le bloc `run:`, remplace l'appel de `psql` par l'écriture d'un fichier préparé, par une substitution qui doit trouver exactement une occurrence) : une ligne `R[1-8]|` hors motif fait échouer le job sans l'afficher ; une ligne `psql: error: …` n'est pas affichée ; 601 lignes : échec sans rien afficher ; code de sortie de `psql` non nul : échec ; `PGHOST` contenant `-pooler`, hôte ou base hors forme : échec sans connexion, message fixe, et la valeur (une chaîne sentinelle) **absente de toute la sortie du job** ; 600 lignes du pire cas du § 5.5 : le job finit, durée relevée et jointe à la PR (§ 5.2).
- `ci: l'environnement db-releve et les secrets RELEVE_PG* ne sont nommés que par db-releve.yml`. `tests/unit/ci/p0-purge.test.ts` et le test de 0056 sur `db-migrate` et `MIGRATOR_PG*` restent inchangés et doivent passer.
- Relevé de l'environnement `db-releve` (noms seulement) joint au ticket, par Samuel s'il accepte la question ouverte 2.

## Conséquences

- **CEO** : nomme, après l'échéance du délai de veto, la PR de `db-releve.yml` (proposition : data, revue Tech Lead et Sécurité ; PR de workflow, `owner-approved`) avec les tests ci-dessus ; elle peut précéder ou suivre la PR du workflow `db-migrate`, mais le premier relevé utile (condition 4 du § 4.1 de 0056) suit l'application du lot 2. Il reporte dans `specs/P0-suite-2.md` (P0S2-PO-7) la source de la requête (§ 6), et dans la note « Complétée par 0056 » de 0052 (question ouverte 5) : « relevés : voir 0057 » (mineur 6 du head `f8a0f3f`), par la prochaine PR qui touche ces fichiers. Il reporte les questions ci-dessous et liste cette décision dans la note de version suivante.
- **Samuel** : propositions qui attendent sa réponse écrite (questions ouvertes 1 à 3) ; il n'a à manipuler ni Neon ni Vercel.
- **Sécurité** : lance `db-releve` aux moments du § 6 et consigne chaque run avec son verdict.
- **Tech Lead** : approuve ou non cette PR, qui vaut signature des passages **(TL)**.

## Questions ouvertes

1. **Samuel (Q387, partie (b), réponse écrite attendue)** — Environnement `db-releve` (règle de branche `main` seule, sans relecteur), secrets `RELEVE_PGHOST` (**hôte direct de Neon, jamais l'hôte poolé `-pooler`**), `RELEVE_PGDATABASE` et `RELEVE_PGPASSWORD`, ce dernier étant **une copie du mot de passe de `vadrouille_prototype_purge`** (§ 1) : toi, ou le studio si tu étends Q321 (alors selon S5 de 0046, sans jamais afficher de valeur) ? Et acceptes-tu cette copie du mot de passe de purge dans un second environnement (risque (h)) ? Sinon, un rôle dédié au relevé est proposé par une décision ultérieure (§ 8). **Ne bloque que `db-releve`**, donc la condition 4 du § 4.1 de 0056, pas D17 ni le premier lancement de `db-migrate`.
2. **Samuel (Q394, reformulée, réponse écrite attendue)** — Acceptes-tu de relever les environnements `db-migrate` et `db-releve` et leurs secrets (noms seulement, jamais de valeur) à leur création et après chaque changement que tu fais, et plus avant chaque lancement (0056, § 2.10) ? Les sessions d'agent ne peuvent pas lire ces réglages (erreur 403). **Ne bloque que la condition 4 du § 4.1 de 0056** (déverrouillage), pas D17 ni le premier lancement de `db-migrate`. Sans réponse, le risque (c) reste accepté sans filet, ce que la note de version signale (mineur 8 du head `f8a0f3f`).
3. **Samuel (P0-Q24, à confirmer)** — Ta réponse à Q321 (« je suis tes recos », 2026-10-13) suivait la recommandation de P0-Q24, où tu exécutais le relevé des rôles dans la console Neon ; 0056 note depuis que tu ne souhaites pas manipuler Neon. Cette décision propose que la Sécurité fasse tous les relevés avec `db-releve`, et que tu n'en fasses aucun toi-même sauf acceptation écrite. Confirmes-tu ? Sans réponse, les relevés sont faits par `db-releve` seul (après la question 1). Ne bloque rien d'autre.
4. **Tech Lead** — Approuver ou non la PR, qui vaut signature des passages **(TL)** : forme d'affectation (§ 5.1), `mapfile` et plafond de 600 lignes, borne 500, `timeout-minutes: 10` (§ 5.2), tests.
5. **CEO** — Nommer la PR de `db-releve.yml` (proposition : data) et reporter les points de « Conséquences ».

## Ce qui change si la réponse diffère

- **Refus de la copie du mot de passe de purge (question 1)** : `db-releve` attend un rôle dédié, par une décision ultérieure (nouvelle migration, 17 rôles, `tests/db/roles.test.ts` amendé) ; d'ici là, aucun relevé n'est fait, sauf par Samuel s'il l'accepte (question 3), et la condition 4 du § 4.1 de 0056 attend.
- **Pas de réponse à la question 1** : pas d'environnement, pas de relevé ; la condition 4 attend.
- **Samuel préfère faire lui-même les relevés (question 3)** : il exécute le texte R1 à R8 copié de `db-releve.yml` dans la console Neon et colle le résultat ; la Sécurité rend le même verdict ; le filtrage du § 5 ne s'applique pas à ce collage, que la Sécurité relit avant de le consigner dans un ticket public.
- **Comptes GitHub distincts pour les agents** : le risque (c) est revu.

## Quand revoir cette décision

À la réponse aux questions 1 à 3 ; à la fusion de la PR de `db-releve.yml` (mesure du § 5.2 sur `ubuntu-24.04`) ; au premier échec fermé du § 5.3 ; à tout ajout de requête (risque (d)) ; au déverrouillage ; à la passe de sécurité avant la mise en public (0034).
