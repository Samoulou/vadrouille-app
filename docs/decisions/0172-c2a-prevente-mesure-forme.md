# 0172 — Mesure de la prévente (C2a) : forme confirmée (T1), amendement de 0007, statut de C2a-2, descente partielle, lecture par workflow (T5)

Statut : **proposée par l'agent tech-lead, définitive à la fusion (0093)**. Décision déléguée du **Tech Lead** (architecture, outillage, tests : « Qui décide quoi » de `docs/CONTEXT.md`). Elle répond au bloquant 1 de la revue consolidée du head `4049ec4` de la PR #1123, et aux questions **T1** et **T5** de `specs/C2-prevente-mesure.md`. Elle ne tranche rien de ce qui revient à la **Sécurité** (S1 est rapporté, S2 et S3 restent posés : § 6) ni à **Samuel** (§ 7). À lister dans la prochaine note de version (rubrique « Décisions prises par le studio »). Samuel peut la remettre en cause à tout moment, par une nouvelle décision.

Date : 2026-11-10 · Décideur : Tech Lead · Ticket : #1117 · PR : #1123 (branche `claude/1117-c2a-prevente-mesure-tables`) · Head relu : `6c1f523` · `main` relu : `039cce1` (après #1102, qui ne touche ni `db/`, ni `tests/db/`, ni `scripts/ci/`, ni `.github/`)

Numérotation : la revue consolidée et la réponse de l'auteur citent « 0170 », prochain numéro libre au moment de la revue. Depuis, **0170 et 0171 sont pris** par la PR #1126 (branche `claude/project-thread-rg2usb` : `0170-landing-identite-ligne.md`, `0171-titrage-et-bouton-principal.md`). `main` va jusqu'à 0169 ; aucune branche distante ni PR ouverte (#1123, #1124, #1126) ne porte de fichier `0172-*` (vérifié le 2026-11-10). Partout où la revue, la réponse de l'auteur ou la description de #1123 écrivent « décision 0170 » pour C2a, lire **0172**.

Décisions liées : 0007, 0034, 0035, 0056 (§ 3), 0057, 0093 (points 1 et 7), 0099, 0138 (§ 11), 0141 (§ 8 ter).

## Contexte

C2a livre la migration `0029_prevente_mesure` : trois tables sans organisation, un domaine, cinq fonctions `SECURITY DEFINER`, trois rôles. La spécification (§ 4) en donnait la forme comme une proposition, « à confirmer par le Tech Lead (T1) et par la Sécurité (S1) ». La revue consolidée a confirmé T1 sur le fond et approuvé S1, mais a bloqué la PR faute de trace écrite : le diff change la liste fermée des politiques `true` de 0007, le parc de rôles et un garde de sécurité de `tests/db/roles.test.ts`, trois choses que 0138 § 11 et 0141 § 8 ter ont chacune fait acter par décision.

Chaque point ci-dessous a été vérifié sur le code du head `6c1f523`, pas sur la description de la PR.

## 1. T1 : forme confirmée, telle que livrée

1. **Tables hors organisation.** `prevente_visites`, `prevente_reponses_jour` et `prevente_reponses` n'ont pas d'`organization_id` : elles comptent des visiteurs anonymes, avant tout compte, et aucune ligne n'appartient à une organisation. C'est une exception au principe « multi-organisation dès le schéma », sur les précédents de `action_rate_limits` (0007), `email_daily_counts` (0138 § 11) et `autocomplete_daily_counts` (0141). Elle est admise parce que la RLS reste **activée et forcée** sur les trois tables et qu'aucun rôle applicatif ni de connexion n'y a de droit. Colonnes, clés et `CHECK` : ceux de la migration, sans changement.
2. **Écriture par deux fonctions seulement.** `prevente_compter_visite(text)` et `prevente_enregistrer_reponse(…)`, `SECURITY DEFINER`, `search_path = pg_catalog, pg_temp`, objets nommés avec leur schéma, propriétaire `vadrouille_fn_prevente` (`NOLOGIN`, aucune appartenance hors l'`ADMIN` seule du migrateur). Elles ne rendent aucune donnée stockée : `void`, ou le verdict `admise` / `plafond_atteint`. Le jour vient de l'horloge de la base, en UTC. Le compteur du jour et l'insertion de la réponse sont dans la transaction de l'appel ; un refus de contrainte annule l'incrément (bloc `EXCEPTION`), donc ne consomme pas le plafond.
3. **Plafond en paramètre borné : confirmé**, de préférence à une constante. `p_plafond integer DEFAULT 200`, refusé hors de 1 à 200 (`22023`), doublé par le `CHECK (reponses BETWEEN 1 AND 200)` de `prevente_reponses_jour`. Un appelant ne peut que l'abaisser ; le critère B6 exige un plafond de test de 3, qu'une constante ne permettrait pas sans une seconde fonction réservée aux tests. Règle pour C2c : **le code de l'application appelle la fonction sans `p_plafond`** (sept arguments). Il ne le passe que si la Sécurité fixe par écrit un seuil plus bas (S2), et alors depuis `src/server/config/limites.ts`. Monter au-dessus de 200 demande une migration.
4. **Rôle d'écriture : `vadrouille_app`, sans rôle dédié.** Il n'a que `EXECUTE` sur les deux fonctions d'écriture, aucun droit de table, et aucun `EXECUTE` sur le relevé. Un rôle `vadrouille_prevente` de connexion ajouterait un septième rôle de connexion, une chaîne de connexion et un secret à poser, pour ne rien retirer : les deux fonctions ne lisent rien, et le pire qu'elles permettent (gonfler un compteur, épuiser le plafond du jour) est déjà à la portée de quiconque envoie le formulaire. Un rôle intermédiaire pris par `SET LOCAL ROLE` (modèle de `vadrouille_mail_counter`) n'apporterait rien non plus : ici l'application n'a aucun droit de table à isoler.
5. **Lecture par un rôle distinct.** Trois fonctions de relevé, propriétaire `vadrouille_fn_prevente_releve`, `EXECUTE` à `vadrouille_prevente_releve` seul. Elles ne rendent que des `bigint`, des `date` et le domaine `public.prevente_code` : un texte saisi ne peut pas sortir, même par erreur de requête (la conversion échoue). Deux propriétaires de fonctions distincts, écriture et lecture : confirmé, le relevé n'a ainsi aucun droit d'écriture et l'écriture ne relit aucune réponse.
6. **Parc de rôles : 20 → 23** (`db/bootstrap/roles.sql`). `vadrouille_fn_prevente`, `vadrouille_fn_prevente_releve` et `vadrouille_prevente_releve`, tous trois `NOLOGIN` ; les six rôles de connexion de `main` ne changent pas. `vadrouille_prevente_releve` est créé sans connexion ni appartenance : personne ne peut le prendre avant C2e (§ 5). La « création de rôle » réservée à Samuel par `docs/CONTEXT.md` vise les rôles du studio (`.claude/agents/`), pas les rôles Postgres : ceux-ci ont toujours été créés par décision déléguée (0046, 0060, 0138 § 11, 0141). Ce qui reste à Samuel est dit au § 7 : le mot de passe, l'environnement et les secrets d'un rôle de connexion.
7. **Listes de codes : une source par côté, un test entre les deux.** `db/prevente-codes.ts` est la seule source de `db/` (schéma, migration, tests de base). C2b écrit les contrats dans `src/contracts` sans importer `db/`, et ajoute le test qui prouve l'égalité des deux listes (modèle : `db/jsonb-keys.ts`). Aucune troisième copie, ni dans un adaptateur, ni dans une page.
8. **Fait avant la fusion de #1102** : admis. C2a ne lit rien de #1102, fusionnée depuis (`039cce1`).

## 2. Amendement de 0007

Par renvoi, comme 0141 § 8 ter. Cette PR ajoute un paragraphe « Amendée par 0172 » en tête de `docs/decisions/0007-rls.md` et complète la phrase « Liste fermée des politiques `USING (true)` ».

1. **Liste fermée des politiques `USING (true)` ou `WITH CHECK (true)` : neuf politiques de plus** (migration 0029, § 2 de son plan) :

   | Table | Rôle | Politiques |
   | --- | --- | --- |
   | `prevente_visites` | `vadrouille_fn_prevente` | `SELECT`, `INSERT`, `UPDATE` (trois) |
   | `prevente_visites` | `vadrouille_fn_prevente_releve` | `SELECT` (une) |
   | `prevente_reponses_jour` | `vadrouille_fn_prevente` | `SELECT`, `INSERT`, `UPDATE` (trois) |
   | `prevente_reponses` | `vadrouille_fn_prevente` | `INSERT` (une) |
   | `prevente_reponses` | `vadrouille_fn_prevente_releve` | `SELECT` (une) |

   Elles sont `true` parce que ces tables n'ont pas d'organisation : il n'y a aucune ligne à cacher d'une organisation à une autre. Elles sont bornées par quatre choses : deux rôles visés seulement, `NOLOGIN`, que personne ne peut prendre (ils n'agissent que par les fonctions qu'ils possèdent) ; une politique **par commande**, jamais `FOR ALL` ; des droits au plus juste (`UPDATE` du seul nombre, lecture du relevé par colonnes, sans `id` ni `jour` d'une réponse ; ni `DELETE` ni `TRUNCATE` pour personne) ; la RLS forcée, qui ne laisse rien lire à `vadrouille_owner`. Porteur : `tests/db/partage.test.ts`, test « liste fermée des politiques USING (true) et WITH CHECK (true) ». Toute autre politique `true` fait toujours échouer la CI. Le tri des deux côtés en JavaScript (au lieu d'`ORDER BY 1`) ne change pas ce que le test compare.
2. **23 rôles** : § 1 point 6. Porteurs : `db/bootstrap/roles.sql`, `tests/db/roles.test.ts` (attribut `LOGIN`, droits de table et par colonne exacts de chaque rôle, treize fonctions `SECURITY DEFINER`).
3. **Garde « les fonctions nomment leurs objets avec leur schéma »** (`tests/db/roles.test.ts`, bloc « fonctions: SECURITY DEFINER durcies »). L'expression du contrôle est **celle de `main`, inchangée**. Avant le contrôle, la seule suite exacte `DO UPDATE SET` (`/\bDO\s+UPDATE\s+SET\b/gi`) est remplacée par un jeton neutre. Raison : dans `INSERT … ON CONFLICT … DO UPDATE SET`, `UPDATE` ne nomme aucun objet ; sa cible est la table de l'`INSERT INTO`, que le contrôle voit déjà par `INTO`. Sans cela, l'incrément atomique exigé par la spécification (§ 4) ne peut pas s'écrire. Le garde reste vif : cinq auto-vérifications dans le même test prouvent qu'un `UPDATE` sans schéma est vu seul, après `DO NOTHING;`, après `DO` sans `SET` immédiat et devant `SETS`, et que seule la clause de conflit ne l'est pas. C'est l'assouplissement d'un garde de sécurité : **il est autorisé par la présente décision, pour cette suite exacte seulement**. Toute autre exemption demande une nouvelle décision.

Aucun test n'est désactivé ni supprimé par C2a.

## 3. Descente partielle : conforme à B1

`0029_prevente_mesure.down.sql` retire les cinq fonctions, le domaine, les neuf politiques et les droits ; elle garde les trois tables et leurs lignes, RLS forcée, sans aucun accès. Le critère B1 (« son retour arrière la défait ») se lit avec la règle du rôle `data` (« Aucune suppression de données », `.claude/agents/data.md`), qui prime : la descente défait tout ce que 0029 ajoute **hors des données**. Précédents : 0020, 0021, 0027. La présente décision prime sur la lettre de B1 pour ce point (spécification, « Prérequis » : la réponse du Tech Lead prime).

Conséquences, déjà écrites dans `db/README.md` : après la descente, le compteur et l'envoi échouent fermés (`42883`) et la page de prévente s'affiche comme sans base ; 0029 ne se rejoue pas (son `CREATE TABLE` échouerait) ; un retour passe par une migration corrective vers l'avant.

## 4. C2a-2 : PR de workflow sous `owner-approved`, le point 7 de 0093 ne s'applique pas

La spécification demandait si la ligne `MIGRATIONS_APPROUVEES` de 0029 peut se passer d'`owner-approved` pour la base d'essai (point 7 de 0093). **Non, en l'état du dépôt.**

- 0093 point 7 ne vaut qu'« à la fusion de la tâche C et après le verdict de la Sécurité ». Ce verdict (0099, M1 à M10) accorde le chemin d'essai à une condition de mécanisme : une **seconde liste**, hors de `.github/workflows/`, et une porte mécanique du verdict de la Sécurité.
- Vérifié sur `main` (`039cce1`) : ce mécanisme n'existe pas. `.github/workflows/db-migrate.yml` ne lit qu'une liste, dans son YAML (29 lignes, `0000` à `0028`) ; aucun script de `scripts/ci/` ni aucun workflow ne nomme de seconde liste ni de libellé `secu-approved`. Les lignes 0027 et 0028 sont passées par une PR de workflow (#1116).
- La seule liste étant sous `.github/workflows/`, toute ligne ajoutée est une PR de workflow : **0035 et 0056 § 3 s'appliquent entiers**. C2a-2 attend l'`owner-approved` de Samuel, avec le verdict de la Sécurité sur la grille G1 à G6 (0056 § 3.3) dans sa PR. Aucun agent ne pose ce libellé.
- C2a-2 cite l'empreinte de 0029 **telle que fusionnée sur `main`** (recalculée par la méthode de l'exécuteur), et rappelle le prérequis : `db/bootstrap/roles.sql` rejoué sur la base avant la migration.
- C2a-2 n'est proposée au libellé de Samuel qu'avec sa réponse écrite sur la durée de conservation (§ 7, question 1).

Construire le chemin d'essai de 0099 n'est pas l'objet de C2 ; si le CEO veut l'ouvrir, c'est une tâche à part.

## 5. T5 : lecture par un workflow lancé à la main

La proposition du § 5 de la spécification est **retenue** : workflow `prevente-releve.yml`, `workflow_dispatch` seulement, sur `main`, sur le modèle de `db-releve.yml` (0057). Pas de page interne.

1. **Pourquoi.** La forme livrée par C2a la rend sûre par construction : le rôle du relevé n'a que `EXECUTE` sur trois fonctions qui ne rendent que des nombres, des dates et des codes d'une liste fermée. Une page interne ajouterait une route publique, un secret d'accès et un écran à protéger, pour une lecture par semaine. Une lecture par Samuel seul dans la console Neon ferait dépendre de lui le report hebdomadaire du rôle `commercial`.
2. **Ce que C2e livre**, sans changement par rapport à la spécification (§ 5 points 1 à 7, critères E1 à E4) : le workflow (ni `checkout` ni action tierce, `permissions: {}`, motif de sortie figé, une ligne hors motif fait échouer le job sans être affichée) ; la requête de `db/maintenance/` pour la lecture des destinations par Samuel ; le passage de `vadrouille_prevente_releve` en rôle de connexion dans `db/bootstrap/roles.sql` (attribut, limite de deux connexions, `CONNECT`), avec la procédure d'`ALTER ROLE` déjà décrite dans `db/README.md` § 5 pour une base où l'amorçage a été joué ; les tests de `tests/db/roles.test.ts` mis à jour (sept rôles de connexion).
3. **Le workflow n'appelle que les trois fonctions de relevé.** Aucune autre requête sur des données, aucun SQL composé à partir d'une entrée du lancement.
4. **Conditions.** L'avis de la Sécurité sur la sortie publique (S3) est rendu sur la PR de C2e, sur le YAML réel. Le fichier est sous `.github/workflows/` : `owner-approved` de Samuel (0035). L'environnement GitHub, le mot de passe du rôle et les secrets sont posés par Samuel (§ 7, question 2). Avant ces poses, le workflow échoue à chaque lancement : attendu.

## 6. Sécurité : ce qui est rapporté, ce qui reste posé

Rien ici n'est un verdict du Tech Lead sur la sécurité.

- **S1 : approuvé, aucun bloquant** (rôle Sécurité, revue consolidée du head `4049ec4` de la PR #1123, 2026-11-10) : « droits, `SECURITY DEFINER`, politiques `true`, plafond et amendement du garde de `roles.test.ts` jugés conformes ». Ce verdict porte sur `4049ec4`. Les trois changements faits depuis (head `6c1f523`) répondent aux mineurs de cette même revue, tous dans le sens d'un resserrement : rôle du relevé créé `NOLOGIN` ; expression du garde revenue à celle de `main` (§ 2 point 3) ; `CHECK` de `destination` élargi aux contrôles C1, aux caractères de sens d'écriture et de largeur nulle. **La Sécurité ne les a pas encore relus** : sa relecture du head courant fait partie de la prochaine revue consolidée de #1123.
- **La Sécurité n'a pas été consultée de nouveau pour écrire cette décision** : la session du Tech Lead n'a pas pu lancer d'agent `securite`. S2 et S3 ne sont donc ni tranchées ni rapportées ici.
- **S2 (seuils : 5 par heure et par adresse, 30 pour le compartiment commun, 200 par jour ; champ piège ou contrôle d'origine)** : à la Sécurité. Bloque C2c, pas C2a. À savoir : 200 est une borne haute tenue par la base ; la baisser se fait sans migration (§ 1 point 3), la monter non. Aucun limiteur propre aux fonctions d'écriture n'existe dans la base : le limiteur applicatif est le premier verrou (spécification § 3.4).
- **S3 (sortie publique du workflow)** : à la Sécurité, sur la PR de C2e (§ 5 point 4). Bloque C2e, pas C2a.
- **Consigne pour C2b et C2c**, reprise de la revue : ne jamais journaliser le message ni le détail d'une erreur des deux fonctions d'écriture ; le code SQL et le nom de la contrainte suffisent.

## 7. Questions à Samuel (réservées ; à reporter dans `QUESTIONS.md` par le CEO)

Aucune n'est tranchée ici. Aucune ne bloque la fusion de C2a : le code fusionné ne crée de table sur aucune base réelle (conteneur Postgres de la CI seulement).

1. **Durée de conservation des réponses** (Q27 ; question 3 de la spécification). `destination` est un texte libre de 80 caractères qui peut contenir une donnée personnelle malgré la consigne affichée ; aucune purge n'existe et aucun rôle n'a `DELETE`. Recommandation de la spécification : supprimer les réponses à la clôture de G0, après report des agrégats dans `suivi.md`. **Bloque** : l'application de 0029 sur une base réelle (C2a-2, § 4), puis l'ouverture du questionnaire. Une réponse qui fixe une durée demandera une migration de purge (rôle `data`).
2. **Poses pour la lecture** (question 2 de la spécification) : environnement GitHub `prevente-releve`, mot de passe de `vadrouille_prevente_releve`, secrets, `owner-approved` sur la PR de C2e. **Bloque** : C2e en fonctionnement réel, pas son code.
3. **`owner-approved` sur C2a-2** (§ 4). **Bloque** : l'application de 0029 sur la base d'essai.
4. **Base en production** (question 1 de la spécification), inchangée. **Bloque** : la lecture des seuils 300 et 10 en production.

## Conséquences

- **Dans cette PR (#1123)** : la présente décision ; l'amendement de `docs/decisions/0007-rls.md` (§ 2) ; les mentions « à confirmer par le Tech Lead (T1) et par la Sécurité (S1) » remplacées par le renvoi à 0172 et au verdict rapporté au § 6, dans `db/migrations/0029_prevente_mesure.sql` (en-tête, commentaires seulement), `db/bootstrap/roles.sql`, `db/schema/prevente.ts`, `db/README.md`, `tests/db/partage.test.ts` et `tests/db/roles.test.ts`. Aucune instruction SQL, aucune assertion de test ne change. **L'empreinte de 0029 change** (son en-tête a changé) : la nouvelle est dans la description de #1123 ; celle de `6c1f523` (`10be63af…16dc`) ne vaut plus.
- **Aucun changement de code n'est demandé au rôle `data`** par cette décision.
- **Tâches suivantes** : C2a-2 (§ 4), C2b (§ 1 point 7), C2c (§ 1 point 3, S2), C2e (§ 5, S3).
- **Non tranché ici** : T2, T3, T4 (C2b), T6 (production), T7 (C2c). Ils ne bloquent pas C2a et seront répondus avant leurs tâches.

## Quand revoir

Avant toute base en production (T6, 0034) ; à la réponse de Samuel sur la durée de conservation ; si la Sécurité, à la relecture du head courant, revient sur S1.
