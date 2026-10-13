# B1 — Socle base de données

Rôle : data · Rédaction : Product Owner · Ticket : #184 · Prérequis : B0 fusionnée (#27) ; décision 0029 (chaîne MVP ouverte avant G0, la mention « après G0 » ne bloque plus) ; aucun compte externe pour développer ni pour la CI · Parallèle : B2 (contrats), sur des fichiers distincts (roadmap, ligne 13) · Référence : `docs/handovers/backend.md` (§ 2, § 3, § 6, § 7 « Organisations et rôles », § 12, « Partie Q5 » § 6, ligne B1 du « Backlog »), `specs/B0-handover-backend.md`, décisions 0002, 0006, 0007, 0010, 0011, 0027, 0029 et 0034 (PR #182, ouverte)

## Objectif
Poser la base Postgres multi-organisation du MVP : schéma, migrations, rôles à moindre privilège, RLS forcée, fonctions et vues partagées, et la suite de tests qui prouve l'isolation. Aucun écran, aucune action serveur, aucune authentification : B3 et B6 s'appuient sur ce socle.

Deux contraintes de l'environnement fixent la façon de travailler :
- **Samuel travaille entièrement à distance** : rien ne s'exécute sur son poste. La base de référence est le conteneur Postgres de la CI.
- **Docker ne tourne pas dans les sessions d'agents** : les tests de base ne passent qu'en CI. Un agent qui modifie `db/` pousse et lit le résultat de la CI ; il n'annonce jamais un test de base comme vert sans ce résultat.

## Ce que B1 ne fait pas
- Aucune modification des variables d'environnement Vercel, aucun compte, aucune clé : c'est Samuel qui agit dans les consoles (Neon, Vercel), selon la procédure livrée (« Passage aux rôles à moindre privilège »).
- Aucune migration appliquée sur la base Neon de staging par le studio. La façon de les appliquer reste à décider (question 3).
- Aucun stockage ni API propres à Vercel (KV, Edge Config) : interdits (décision 0002).
- Aucune donnée Google en base, hormis l'identifiant de lieu (`place_id`) ; le cache `place_coordinates` (30 jours au plus, décisions 0027 et 0011) est créé par B8, pas par B1 (décision B1-PO-3).

## À livrer

### Base locale et CI
- `docker-compose.yml` : service `db` sur l'image `postgres:17.11` (décision 0006). Il sert à la portabilité (décision 0002) et à tout poste qui dispose de Docker ; aucun agent ni Samuel n'est tenu de l'exécuter.
- Un job de CI `db` dans `.github/workflows/ci.yml` : conteneur de service `postgres:17.11`, ignoré pour une PR de documentation seule (même détection que les jobs existants). Ordre : amorçage des rôles avec l'utilisateur administrateur du conteneur, migrations avec `vadrouille_migrator`, puis `pnpm test:db`. Chaque test se connecte avec le rôle qu'il éprouve ; aucun test d'isolation ne s'exécute en superutilisateur.
- `pnpm test:db` : projet Vitest distinct de `pnpm test` (les tests unitaires restent exécutables sans base). Sans base joignable, il échoue avec un message explicite ; il n'est jamais ignoré en silence (décision 0006, convention 6). Son intégration à `pnpm verify` suit le choix B1-TL-1.

### Outils (décision 0006)
- Drizzle ORM 0.45.4, drizzle-kit 0.31.11, `pg` 8.23.1, paquet `server-only` (dernière version stable). Une version plus récente au moment de B1 est notée dans un amendement de 0006, comme le prévoit la décision.
- Migrations SQL relues dans `db/migrations/` (générées par `drizzle-kit generate` puis complétées à la main pour les rôles, politiques, fonctions, vues et déclencheurs). `drizzle-kit push` n'est jamais utilisé.
- Règle ESLint « `import "server-only"` obligatoire » dans `db/` et dans les dossiers serveur listés au handover § 3, avec son test (`tests/unit/lint/`). La règle de lint de 0017 § 3.3 reste en place (décision 0006).

### Amorçage des rôles
Un script SQL idempotent `db/bootstrap/roles.sql`, exécuté **une seule fois par base** par un utilisateur qui peut créer des rôles (le superutilisateur du conteneur en CI ; l'utilisateur propriétaire injecté par l'intégration Neon sur staging, par Samuel). Il crée les **13 rôles de la décision 0007**, avec leurs attributs (`NOLOGIN` ou `LOGIN`, jamais `SUPERUSER` ni `BYPASSRLS`) et les appartenances `vadrouille_share`, `vadrouille_webhook`, `vadrouille_account_admin`, `vadrouille_limiter` → `vadrouille_app` en `WITH INHERIT FALSE, SET TRUE, ADMIN FALSE`. Il ne contient aucun mot de passe : les rôles de connexion (`vadrouille_migrator`, `vadrouille_app`, `vadrouille_auth`) reçoivent leur mot de passe hors du dépôt (en CI, une valeur jetable générée par le job ; sur staging, la procédure ci-dessous).

`vadrouille_fn_coords` est créé dès B1 pour que la liste des rôles soit celle de 0007, même s'il ne possède rien avant B8.

### Schéma (handover § 6, « Partie Q5 » § 6)
Tables, dans `db/schema/` (Drizzle) et `db/migrations/` (SQL) :
- **Authentification et organisations** : `users`, `sessions`, `accounts`, `verifications`, `organizations`, `memberships`, avec les colonnes, contraintes et droits du handover § 6 et de 0007. B3 adapte les noms de modèles de Better Auth à ces tables, ou ajoute une migration si la bibliothèque exige une colonne de plus (décision B1-PO-4).
- **Limiteur** : `action_rate_limits`.
- **Métier** : `trips`, `briefs`, `stays`, `trip_versions`, `generation_runs`, `proposals`, `research_runs`, `candidates`, `event_occurrences`, `feedback`, `preference_signals`, `preferences`, `checklist_items`, `share_links`, `usage_ledger`, `checkouts`, `billing`, `entitlements`.
- **Non créées par B1** : `place_coordinates` (B8, décision 0011 point 6 ; décision B1-PO-3), `rate_limits` (B3, seulement s'il garde le limiteur intégré), `invitations` (greffon désactivé au MVP ; B3 la crée si Better Auth l'exige même désactivé), `place_memory` (bêta), tables du monde Postgres des workflows (B9, décision 0009).

Règles communes, toutes vérifiées par un test nommé ci-dessous :
- `organization_id uuid NOT NULL` sur chaque table métier, index qui commence par `organization_id`, clés étrangères composites `(organization_id, trip_id)` vers `trips` ; exceptions justifiées au handover § 6 seulement.
- RLS activée **et forcée** sur toutes les tables du schéma `public` ; politique type de 0007 pour `vadrouille_app` ; fonctions `app_current_org()`, `app_current_user()`, `app_share_token_hash()` (échec fermé sans contexte).
- Droits par table et par colonne exactement comme les tableaux de 0007 (`vadrouille_app`, `vadrouille_auth`, `vadrouille_webhook`, `vadrouille_limiter`, rôles `vadrouille_fn_*`).
- Ajout seulement : `trip_versions`, `billing`, `usage_ledger` (droits et déclencheur ; seule exception : `DELETE` sur `trip_versions` par `vadrouille_fn_purge`). `TRUNCATE` révoqué à tous les rôles applicatifs.
- Invariant « exactement un propriétaire » par organisation qui n'est pas en suppression (déclencheur contraint différé).
- `trip_versions` sans colonne `validation_report` ; `research_runs` sans compteur de candidats ; `candidates` sans verdict, motif d'écart ni date de contrôle (« Partie Q5 »).
- `CHECK` de premier niveau sur les JSONB à contrat fermé (`candidates.facts`, `candidates.sources` élément par élément avec `url` en `https://`, `checklist_items.moment`, `proposals.content`) ; `CHECK` `https://` sur `checklist_items.booking_url` et `event_occurrences.source_url`.
- Aucune colonne de contenu Google ni dérivée de Google (liste du handover § 6, « Colonnes interdites »).

### Fonctions et vues
- `resolve_share_link`, `checkout_organization`, `purge_organization_data` : `SECURITY DEFINER`, propriétaires `vadrouille_fn_*`, `search_path = pg_catalog, pg_temp`, `EXECUTE` nominatif, règles communes de 0007. `purge_organization_data` couvre les tables créées par B1, sauf `billing` et `usage_ledger` tant que Q48 est ouverte ; B8 l'étend à `place_coordinates`.
- Vues `shared_trip`, `shared_trip_version`, `shared_checklist` : propriétaire `vadrouille_fn_share_views`, `security_barrier`, sans `security_invoker`, jointure sur le jeton de la transaction, colonnes nommées, et pour `shared_trip_version` une **liste blanche de clés** de l'instantané (jamais `snapshot` tel quel, jamais l'étiquette de logement des `terminus` tant que Q50 n'est pas tranchée). `SELECT` à `vadrouille_share` seulement.

### Documentation dans le dépôt
`db/README.md`, en trois parties :
1. **Organisation** de `db/` et commandes (`pnpm db:migrate`, `pnpm test:db`).
2. **Retour arrière des migrations** (critère du handover § 12) : chaque migration a sa migration inverse écrite et relue, ou la mention « irréversible » avec la raison ; procédure pas à pas ; le test de restauration sur la base de staging est renvoyé à la question 3.
3. **Passage aux rôles à moindre privilège** sur la base Neon de staging, à exécuter par Samuel, entièrement dans un navigateur (console Neon et tableau de bord Vercel), sans outil local :
   - exécuter `db/bootstrap/roles.sql` dans l'éditeur SQL de Neon ;
   - donner un mot de passe aux trois rôles de connexion depuis l'éditeur SQL, sans le recopier ailleurs que dans Vercel ;
   - créer dans Vercel, pour Preview, les variables de connexion de `vadrouille_app` et `vadrouille_auth` (noms : choix B1-TL-3) ; jamais celles de `vadrouille_migrator`, réservées à l'environnement des migrations (décision 0006) ;
   - retirer l'identifiant propriétaire de Preview et de Production : **au plus tard à la passe de sécurité avant la mise en public** (décision 0034, point 1 de sa liste de contrôle) ; le studio recommande de le faire dès la première préversion qui lit la base (B3 ou B6, question 4) ;
   - contrôles à faire après chaque étape (requêtes de vérification fournies, qui ne renvoient aucun secret).

La procédure dit ce que Samuel fait et ce que le studio ne fait pas. Aucun mot de passe ni chaîne de connexion n'apparaît dans le dépôt, dans une PR ou dans un journal de CI.

### Garde de connexion
Le module de connexion de `db/` (seul point d'entrée des connexions applicatives) vérifie, à la première connexion d'un pool, que `current_user` est le rôle attendu (`vadrouille_app` ou `vadrouille_auth`) et que ce rôle n'a ni `SUPERUSER` ni `BYPASSRLS` ; sinon il refuse de servir la moindre requête, avec un message qui ne contient pas la chaîne de connexion. Cette garde rend vraie la règle de 0029 (« l'application ne lit jamais ces identifiants » d'administration) même si une variable est mal posée.

## Critères d'acceptation
Chaque test nommé est un test Vitest de `pnpm test:db`, au nom exact ci-dessous, vert dans le job `db` de la CI.

**Outillage**
- [ ] Le job `db` de la CI démarre `postgres:17.11`, exécute l'amorçage, les migrations sous `vadrouille_migrator`, puis `pnpm test:db`, et il est vert ; il est ignoré pour une PR de documentation seule.
- [ ] Sans base joignable, `pnpm test:db` échoue avec un message explicite (test : lancement avec une adresse injoignable, code de sortie non nul, message attendu).
- [ ] `pnpm test` (unitaires) passe sans base.
- [ ] `pnpm verify` est vert, ou vert hors base selon B1-TL-1 ; la PR dit lequel.
- [ ] Les migrations s'appliquent deux fois de suite sans erreur (la seconde ne fait rien), et l'amorçage aussi.
- [ ] La règle ESLint « `server-only` obligatoire » signale un fichier de `db/` qui ne l'importe pas (test dans `tests/unit/lint/`).
- [ ] Versions installées notées dans la décision 0006 (ou son amendement).

**Tests nommés du handover (ligne B1) et de la décision 0007**
- [ ] `schéma: RLS activée et forcée partout`
- [ ] `isolation: une organisation ne lit ni ne modifie les voyages d'une autre` (chaque table métier ; lecture, insertion, mise à jour et suppression croisées ; refus par la RLS ou par les droits ; `UPDATE checkouts SET status` refusé sous `vadrouille_app`)
- [ ] `rôles: aucun rôle ne contourne la RLS` (les 13 rôles de 0007 ; liste des rôles `vadrouille_*` comparée à l'identique ; `pg_auth_members.inherit_option = false`, `set_option = true`, `admin_option = false` pour chaque rôle accordé à `vadrouille_app` ; `has_function_privilege('vadrouille_app', 'public.purge_organization_data(uuid)', 'EXECUTE')` et `has_table_privilege('vadrouille_app', 'public.entitlements', 'INSERT')` faux ; `UPDATE` de `vadrouille_app` sur `checkouts` limité à `stripe_checkout_session_id` ; `INSERT` de `vadrouille_auth` sur `organizations` sans `deletion_requested_at` ; rôles `vadrouille_fn_*` sans appartenance avec `SET` ni `INHERIT`, seules les appartenances `ADMIN` seule de `vadrouille_migrator` et du rôle d'amorçage admises, celle du rôle d'amorçage tolérée et non exigée : décision 0036, B1-TL-2)
- [ ] `fonctions: SECURITY DEFINER durcies`
- [ ] `vues partagées: lecture seulement avec un jeton valide` (dont la liste fermée des politiques `USING (true)`)
- [ ] `vues partagées: l'instantané partagé ne contient que les clés de la liste blanche`
- [ ] `purge: vadrouille_app ne peut pas purger une autre organisation`
- [ ] `schéma: les JSONB refusent les clés hors contrat` (clés `rating`, `openingHours`, `displayName`, `location` refusées dans `candidates.facts` et dans un élément de `candidates.sources` ; `url` en `http:` refusée)
- [ ] `versions: trip_versions est en ajout seulement`
- [ ] `registres: billing et usage_ledger sont en ajout seulement`
- [ ] `organisations: exactement un propriétaire`
- [ ] `schéma: aucune colonne de contenu Google` (motifs sur `information_schema.columns` ; l'exception `place_coordinates.lat` et `.lng` est déjà nommée dans le test, inactive tant que B8 n'a pas créé la table)
- [ ] `schéma: aucune colonne dérivée de Google` (dont `validation_report`, compteurs d'ancrage, verdict, date de contrôle, durée de trajet ; aucune table de plan de travail)
- [ ] `partage: la vue partagée n'expose jamais place_coordinates` (part de B1 : aucune vue partagée ne dépend d'une table nommée `place_coordinates`, `pg_depend` ; aucun droit de `vadrouille_share` ni de `vadrouille_fn_share_views` sur elle quand elle existe)

**Tests propres à cette spécification**
- [ ] `connexion: la garde refuse un rôle administrateur` : une connexion du module de `db/` sous un rôle qui a `BYPASSRLS`, ou sous un rôle autre que celui attendu, est refusée avant toute requête métier ; le message ne contient ni mot de passe ni chaîne de connexion.
- [ ] `isolation: sans contexte, aucune ligne` : sous `vadrouille_app`, sans `app.organization_id`, chaque table métier renvoie zéro ligne et toute insertion est refusée.
- [ ] `amorçage: aucun secret dans le dépôt` : `db/bootstrap/` et `db/migrations/` ne contiennent ni `PASSWORD '…'` littéral ni chaîne `postgres://…@` (recherche par motif dans le test).

**Documentation**
- [ ] `db/README.md` contient les trois parties ci-dessus ; la procédure de passage aux rôles à moindre privilège n'exige aucun outil local et nomme Samuel comme seul acteur des consoles Neon et Vercel.
- [ ] Chaque migration a sa migration inverse relue ou la mention « irréversible » motivée.

**Règles transverses**
- [ ] Aucune dépendance à KV ni à Edge Config (`grep -rn -i -E '@vercel/(kv|edge-config)' package.json db src` ne renvoie rien).
- [ ] Aucun secret ni chaîne de connexion dans le diff de la PR.
- [ ] Aucun fichier de `src/contracts`, `src/mocks` ni `src/components` modifié (fichiers de B2).

## Décisions (Product Owner, définitives sans veto de Samuel avant le 2026-10-14)
À lister dans la note de version suivante, rubrique « Décisions prises par le studio ».
- **B1-PO-1 — La CI est la référence.** Les tests de base font foi en CI seulement ; un agent ne déclare jamais un test de base vert sans le job `db`. Raison : Docker ne tourne pas dans les sessions d'agents et rien ne tourne sur le poste de Samuel.
- **B1-PO-2 — Pas de migration sur staging dans B1.** B1 fusionne sur la seule preuve de la CI ; l'application des migrations à Neon suit la question 3. Raison : B1 ne doit dépendre d'aucune action de Samuel.
- **B1-PO-3 — `place_coordinates` reste à B8.** La ligne B1 du « Backlog » couvre « les tables du § 6 », qui incluent `place_coordinates` ; la décision 0011 (point 6), plus récente et plus précise, dit « créé par B8 ». B1 suit 0011 : il crée le rôle `vadrouille_fn_coords`, pas la table ni ses deux fonctions ; B8 étend `purge_organization_data` et ses tests. Écart signalé au Tech Lead dans la PR.
- **B1-PO-4 — Tables d'authentification créées par B1, adaptées par B3.** B1 crée les tables d'authentification et d'organisation avec les colonnes du handover § 6, parce que les clés étrangères, la RLS et l'invariant du propriétaire en dépendent. B3 relie Better Auth à ces tables et ajoute par migration ce que la bibliothèque exige de plus ; il ne retire aucune contrainte de B1 sans décision écrite.
- **B1-PO-5 — Clés des JSONB et B2 en parallèle.** B1 écrit les listes de clés des `CHECK` (`StopFacts`, `ChecklistMoment`, `ProposalRecord` premier niveau) d'après le handover § 5 et la décision 0010, dans un seul fichier de `db/`, sans importer `src/contracts`. La PR fusionnée en second, B1 ou B2, ajoute le test `schéma: les clés JSONB suivent les contrats`, qui compare ces listes aux schémas Zod de B2.
- **B1-PO-6 — Garde de connexion.** Le module de connexion de `db/` refuse un rôle administrateur (voir « Garde de connexion »). Conséquence : une préversion qui lit la base (B3, B6) ne fonctionne qu'après le passage aux rôles à moindre privilège sur Preview (question 4). Le risque accepté par Samuel dans 0034 porte sur la **présence** de l'identifiant propriétaire dans Vercel ; cette garde fait que le code ne s'en sert pas.

## Choix réservés au Tech Lead (signalés et proposés, non tranchés ici)
**Tranchés par la décision 0036 (2026-10-12)**, qui retient les quatre propositions ci-dessous et prévaut sur leur texte ; en particulier, l'invariant « sans membre » de B1-TL-2 devient « sans appartenance avec `SET` ni `INHERIT` », et le refus de `SKIP_DB_TESTS` en CI est écrit dans `scripts/test-db.mjs` seulement (B1-TL-1, point 3).

- **B1-TL-1 — `pnpm test:db` et `pnpm verify`.** Le handover (ligne B1) demande `pnpm test:db` « dans `pnpm verify` et en CI » ; `CLAUDE.md` exige `pnpm verify` vert avant toute PR ; or aucune session d'agent n'a de base. Proposition : `pnpm verify` appelle `pnpm test:db`, qui échoue sans base sauf si `SKIP_DB_TESTS=1` est posé **explicitement** ; dans ce cas il affiche un avertissement et sort avec succès ; la CI ne pose jamais cette variable, et le job `db` échoue s'il la trouve. Le saut n'est donc jamais silencieux (décision 0006). Autre option : laisser `pnpm verify` inchangé et rendre le job `db` obligatoire.
- **B1-TL-2 — Rôles `vadrouille_fn_*` « sans membre » (formule historique ; devenue « sans appartenance avec `SET` ni `INHERIT` », décision 0036) et Postgres 16 et suivants.** Depuis Postgres 16, un rôle non superutilisateur qui crée un rôle en reçoit l'option `ADMIN` (ligne dans `pg_auth_members`) ; c'est le cas de l'utilisateur propriétaire de Neon, qui n'est pas superutilisateur. De plus, le transfert de propriété de 0007 exige que `vadrouille_migrator` puisse accorder le rôle `vadrouille_fn_*`, donc qu'il ait l'option `ADMIN`. Le test « les rôles `vadrouille_fn_*` n'ont aucun membre » échouerait sur Neon, pas dans le conteneur de CI. Proposition : reformuler l'invariant en « aucune appartenance avec `SET` ou `INHERIT` ; seules l'appartenance `ADMIN` de `vadrouille_migrator` et celle du rôle d'amorçage sont admises, nommées dans le test ». Le critère « `current_user = 'vadrouille_fn_purge'` non falsifiable » reste vrai pour les rôles applicatifs.
- **B1-TL-3 — Noms des variables de connexion.** L'intégration Neon de Vercel injecte `DATABASE_URL` (et d'autres variables) avec l'identifiant propriétaire ; le handover § 2 prévoit `DATABASE_URL` pour `vadrouille_app`. Le même nom désignerait deux identifiants. Proposition : des noms qui ne peuvent pas venir de l'intégration (par exemple `VADROUILLE_DATABASE_URL`, `VADROUILLE_DATABASE_URL_AUTH`, `VADROUILLE_DATABASE_URL_MIGRATOR`), amendement du handover § 2 et de 0006.
- **B1-TL-4 — Vérification de `BYPASSRLS` sur Neon.** L'agent `data` vérifie dans la documentation Neon si l'utilisateur propriétaire de l'intégration a `BYPASSRLS` (rôle `neon_superuser`) et le note dans la PR. Si c'est le cas, tant que cet identifiant sert, la RLS ne protège rien sur Preview : raison de plus pour la garde B1-PO-6.

## Hors périmètre
- `src/server/env.ts`, `withOrg`, `getRequestContext()`, Better Auth et Mailpit (B3) ; adaptateur `api` et actions serveur (B6) ; `place_coordinates` et sa purge (B8) ; tables des workflows (B9).
- Les contrats (`src/contracts`), les données simulées (`src/mocks`) et les composants (B2).
- Toute action dans les consoles Neon, Vercel ou GitHub (secrets, variables, intégrations) : Samuel.
- Sauvegardes, test de restauration et durées de conservation (Q24 pour le fournisseur, Q27, Q48).
- Toute mise en production.

## Questions ouvertes
Nouvelles questions (numérotées par le CEO dans `QUESTIONS.md`) :
1. **Tech Lead, 2026-10-12** — B1-TL-1 (`pnpm test:db` dans `pnpm verify`). Bloque la fusion de la PR de code de B1, pas son démarrage.
2. **Tech Lead, 2026-10-12** — B1-TL-2 (appartenances `ADMIN` des rôles `vadrouille_fn_*` sur Postgres 16 et suivants). Bloque le test `rôles` dans sa forme finale.
3. **Tech Lead, puis Samuel pour le secret, 2026-10-12** — Comment appliquer les migrations à la base Neon de staging ? Option A : un workflow GitHub déclenché à la main, avec l'identifiant de `vadrouille_migrator` en secret GitHub posé par Samuel. Option B : à la construction Vercel. Elle se heurte à la garde de 0006 (`DATABASE_URL_MIGRATOR` présente : refus de démarrer), car Vercel donne les mêmes variables à la construction et à l'exécution. Bloque la base de staging et le test de restauration, pas B1.
4. **Samuel, 2026-10-12** — Quand faire le passage aux rôles à moindre privilège sur Preview (procédure de `db/README.md`) ? La décision 0034 l'exige au plus tard à la passe de sécurité avant la mise en public. Avec la garde B1-PO-6, il est nécessaire dès la première préversion qui lit la base (B3 ou B6). Recommandation du studio : dès la fusion de B1. Bloque les préversions de B3 et B6 sur base réelle, pas B1.
5. **CEO, 2026-10-12** — Contradiction à réconcilier : la décision 0029 et la réponse à Q24 dans `QUESTIONS.md` disent l'intégration Neon reliée à **Development et Preview seulement** ; la décision 0034 (PR #182) dit l'identifiant propriétaire posé sur **Preview et Production**. Laquelle décrit l'état réel ? Bloque l'exactitude de la procédure de passage (environnements à nettoyer), pas B1.

Questions existantes touchées :
- **Q40** (Samuel) : Docker dans les sessions d'agents. Constat du 2026-10-12 : il ne tourne pas. B1 ne dépend plus de la réponse si B1-TL-1 est retenue ; le CEO peut proposer à Samuel de la clore.
- **Q24** (tranchée) : Neon à Francfort ; B1 crée les rôles, Samuel les branche (procédure).
- **Q27, Q48** (Samuel) : `billing` et `usage_ledger` hors de la purge tant que Q48 est ouverte ; aucune purge de conservation dans B1.
- **Q50** (Product Owner) : aucune information de logement dans les vues partagées tant qu'elle n'est pas tranchée.
- **Écart C16** du handover (suppression de `trip_versions` par la purge seulement) : appliqué tel quel.
