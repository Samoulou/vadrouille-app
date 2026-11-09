# 0167 — Purge de `place_coordinates` à la suppression d'une organisation (T4 de M9)

Statut : **proposée** (définitive à la fusion de sa PR, décision 0093). Décision déléguée du **Tech Lead** (architecture, outillage, tests : « Qui décide quoi » de `docs/CONTEXT.md`, l. 37-44). Elle répond à **T4** de la spécification M9 (`specs/M9-export-suppression-api.md`, PR #1083, § 8, et premier écart « `place_coordinates` n'est pas purgée avec le compte ») et fixe ce que livre le ticket `[data]` que le CEO ouvrira (§ 4). Rien n'est tranché ici de ce qui revient à la **Sécurité** (points SP1 à SP3, posés sans être tranchés) ni à **Samuel** (aucune question : § 5). À lister dans la prochaine note de version (rubrique « Décisions prises par le studio »). Samuel peut la remettre en cause à tout moment par une nouvelle décision.

Date : 2026-11-09 · Décideur : Tech Lead · Ticket : #1086 · `main` relu : `a8e6b66` (après #1084)

Numérotation : `main` va jusqu'à 0165 ; 0166 est prise par la PR #1085 (branche `claude/1080-0166-formes-m8a-relais`). Dernière migration au journal (`db/migrations/meta/_journal.json`) : `0027_rappels_relais` ; aucune PR ouverte au 2026-11-09 n'ajoute de fichier `db/migrations/0028_*` (#1065 ne touche que `MIGRATIONS_APPROUVEES`).

Références : 0007 (tableau des rôles l. 43, « Suppressions » l. 58, tests l. 121-122), 0011 (§ 6, § « Conséquences » l. 141, l. 117), 0027 (point 4), 0036 (B1-TL-2), 0046 (D15, S2), 0060 (§ 2, § 3), 0077 (l. 103), 0093 ; spécification M9 (PR #1083, head relu : branche `claude/1079-m9-spec-export-suppression`) l. 23, l. 61, l. 132, l. 155-156, l. 211, l. 216, l. 298 ; revue consolidée de #1083 (Tech Lead, mineur 8) ; `QUESTIONS.md` Q48, Q438 ; `docs/handovers/backend.md` l. 808.

Code relu (sur `a8e6b66`) : `db/migrations/0002_place_coordinates.sql` (table l. 24-39, RLS l. 43-45, droits et politiques l. 51-84, `purge_expired_coordinates` l. 135-142, droits d'exécution l. 146-163, propriété l. 165-175) ; `db/migrations/0008_positions_mvp_29_jours.sql` (`store_place_coordinates`, l. 35-62) ; `db/migrations/0001_securite.sql` (droits de `vadrouille_fn_purge` l. 214-224, politiques de purge l. 247-256 et 264-268, en-tête de la purge l. 354-358, déclencheur « ajout seulement » l. 55-70) ; `db/migrations/0027_rappels_relais.sql` (purge, l. 97-166) ; `db/schema/business.ts` (l. 35-45) ; `tests/db/roles.test.ts` (l. 136-144, l. 214-225) ; `tests/db/purge.test.ts` (l. 77-89) ; `tests/db/coordonnees.test.ts` (l. 115-185) ; `tests/db/helpers.ts` (`PURGED_TABLES`, l. 169).

**Ce que cette décision n'engage pas.** Aucun code, aucun test, aucune migration dans cette PR (documentation seule). Aucune dépense, aucun compte externe, aucun réglage, aucune valeur de secret lue. Aucun test retiré ni désactivé ; deux tests existants seront **complétés** par le ticket du § 4 (`tests/db/roles.test.ts`, `tests/db/purge.test.ts`), sans rien en retirer : cette décision est la décision écrite qu'exige `CLAUDE.md` pour ces modifications.

## Constat vérifié

1. **Forme de la table** (`0002_place_coordinates.sql` l. 24-39, inchangée depuis : 0005 et 0008 ne recréent que des fonctions). Colonnes : `organization_id uuid NOT NULL REFERENCES public.organizations (id)` (sans action à la suppression, donc `NO ACTION`), `place_id text NOT NULL`, `lat`, `lng` (`double precision NOT NULL`), `fetched_at`, `expires_at` (`timestamptz NOT NULL`). Clé primaire `(organization_id, place_id)`, donc **un index qui commence par `organization_id`**. `CHECK (expires_at <= fetched_at + interval '30 days')`. RLS activée et forcée. La table **n'est pas** dans `db/schema/` (Drizzle) : `business.ts` l. 43-44 la renvoie à B8 et à la migration écrite à la main ; elle n'est donc pas non plus dans `BUSINESS_TABLES` ni `PURGED_TABLES` des tests.
2. **Droits actuels sur la table** : `vadrouille_app` `SELECT` (organisation courante, lignes vivantes, jamais `org_prototype`) ; `vadrouille_fn_coords` `SELECT (organization_id, place_id, expires_at)`, `INSERT`, `DELETE`, cinq politiques (l. 60-77) ; `vadrouille_prototype` `SELECT` d'`org_prototype`. **`vadrouille_fn_purge` n'a aucun droit et aucune politique** sur `place_coordinates` (`0001_securite.sql` l. 220-224 : « place_coordinates : B8 » ; aucune migration suivante ne l'ajoute ; `tests/db/roles.test.ts` l. 141 et l. 219-225 figent cette absence).
3. **La purge ne la touche pas** : `purge_organization_data` (dernière version : `0027_rappels_relais.sql` l. 107-158) supprime 23 tables (24 instructions `DELETE`), de `stop_reviews` à `trips`, et ne nomme pas `place_coordinates`. Sans droit, elle ne le pourrait d'ailleurs pas : un `DELETE` y lèverait `42501` et annulerait toute la purge.
4. **Les textes promettent le contraire** : 0007 l. 43 (« `DELETE` sur les tables métier, `place_coordinates` comprise (amendement 0011) ») ; 0011 l. 117 et « Conséquences » l. 141 (« `purge_organization_data` étendue à cette table ») ; `0001_securite.sql` l. 220 et l. 358 (« B8 l'étend à place_coordinates ») ; `docs/handovers/backend.md` l. 808 (« qui couvre aussi `place_coordinates` »). B8 ne l'a pas fait. À l'inverse, 0007 l. 58 dit déjà que les suppressions de `place_coordinates` sont « faites par les fonctions de `vadrouille_fn_coords` » : les deux phrases de 0007 se contredisent.
5. **L'expiration ne compense pas aujourd'hui** : la purge planifiée du MVP (`coords-purge`, 0060 § 3) n'est pas activée (Q438, ticket #527 en échec faute de secrets) ; seule la purge par lot de 500 dans `store_place_coordinates` supprime des lignes expirées, et seulement quand une écriture a lieu. Une ligne d'une organisation supprimée peut donc rester **au-delà** de 30 jours. (0077 l. 103 interdit d'ailleurs d'écrire des lignes du MVP tant que cette purge n'est pas active : l'écart est aujourd'hui latent, il ne le sera plus à l'ouverture du MVP.)
6. **Ce que contient une ligne** : l'organisation (une personne seule tant que la purge exige l'unique membre propriétaire), un lieu qu'elle a regardé et l'heure à laquelle sa position a été demandée. Rattachée au compte, c'est une trace de ses voyages (§ 5).
7. **Clé étrangère** : `NO ACTION` vers `organizations`. Elle ne gêne pas l'option A de Q48 (l'organisation n'est jamais supprimée) ; avec l'option B, la suppression de l'organisation échouerait tant qu'une ligne de `place_coordinates` reste (M9 l. 23).

## Options

| | (a) Migration corrective : la purge du compte supprime `place_coordinates` | (b) Cache non rattaché à la personne : l'expiration suffit, 0007 et 0011 amendés |
|---|---|---|
| Ce qui change | Migration `0028` : droits et politique de `vadrouille_fn_purge`, `purge_organization_data` recréée avec un `DELETE` de plus | Aucun code ; 0007 l. 43, 0011 (l. 117, l. 141), handover l. 808 réécrits par renvoi |
| Tenue des textes | Rend vrais 0007 l. 43, 0011, `0001_securite.sql` et le handover ; 0007 l. 58 seul est précisé | Revient sur une promesse écrite de 0011, sans nouvel élément technique |
| Après la suppression du compte | Plus aucune ligne de l'organisation | Lignes gardées jusqu'à l'expiration (29 jours, 0060 § 2) **et** jusqu'à une purge réussie, qui n'existe pas encore (Q438) |
| Donnée personnelle | Rien ne reste | Une trace des lieux consultés survit au compte : qualification et durée relèvent de la Sécurité puis, si elles sont admises, du juridique (Samuel) |
| Q48 option B | Rien à faire de plus : les lignes ont disparu avant l'organisation ; la clé reste `NO ACTION` | Il faudrait `ON DELETE CASCADE` ou une purge de plus dans M9b-2 |
| Coût | Une migration (le modèle de 0024, 0026 et 0027 existe), deux tests complétés, une ligne `MIGRATIONS_APPROUVEES` | Nul en code ; une question de plus pour la Sécurité et Samuel |

**Variante écartée (a')** : appeler depuis `purge_organization_data` une fonction nouvelle de `vadrouille_fn_coords` (qui a déjà `DELETE` et la politique `place_coordinates_fn_coords_delete_org`). Elle évite de donner une seconde table à `vadrouille_fn_purge`, mais ajoute une fonction `SECURITY DEFINER`, un `GRANT EXECUTE` d'un rôle `vadrouille_fn_*` à un autre et une chaîne d'appels entre propriétaires que les tests `rôles` et `fonctions` ne savent pas encore décrire. Le modèle commun (une politique `*_fn_purge` et `SELECT (organization_id), DELETE` par table purgée) est plus simple à relire et déjà testé pour chaque table purgée.

## Décision

**Option (a)**, sous la forme ci-dessous.

1. **Migration `0028_purge_place_coordinates.sql`** (numéro à confirmer à l'ouverture du ticket : si une autre migration passe avant, elle prend le suivant), écrite à la main, sur le modèle de `0027_rappels_relais.sql` section 5 :
   1. sous `vadrouille_owner` : `GRANT SELECT (organization_id), DELETE ON public.place_coordinates TO vadrouille_fn_purge` ; politique `place_coordinates_fn_purge ON public.place_coordinates AS PERMISSIVE FOR ALL TO vadrouille_fn_purge USING (organization_id = public.app_current_org()) WITH CHECK (organization_id = public.app_current_org())` (même forme que les politiques `*_fn_purge` de `0001_securite.sql` l. 247-256 et de 0012 à 0027). Aucun autre droit : ni `INSERT`, ni `UPDATE`, ni `SELECT` de `place_id`, `lat`, `lng`, `fetched_at`, `expires_at` ;
   2. `purge_organization_data` recréée sous son propriétaire `vadrouille_fn_purge` (appartenance `SET` temporaire de `vadrouille_migrator`, `GRANT CREATE` puis `REVOKE`, comme 0027), **corps identique à 0027** plus une ligne `DELETE FROM public.place_coordinates AS x WHERE x.organization_id = v_org;`, placée **en tête** des suppressions, avant `stop_reviews` (aucune clé ne pointe vers `place_coordinates` ; en tête, elle ne dépend d'aucune autre ligne). Les lignes expirées de l'organisation partent avec les vivantes ; `org_prototype` n'est jamais visée, puisque la purge exige l'organisation de la transaction et son unique propriétaire ;
   3. `REVOKE ALL … FROM PUBLIC` et `GRANT EXECUTE … TO vadrouille_account_admin` réécrits ;
   4. `.down.sql` : purge de 0027 recréée à l'identique, politique supprimée, droits retirés.
2. **Rien d'autre ne change** : `vadrouille_fn_coords`, ses fonctions et ses politiques ; les droits de `vadrouille_app` ; le déclencheur « ajout seulement » (il ne vise pas `place_coordinates`) ; la clé étrangère (`NO ACTION` est gardée : avec l'option B de Q48, elle fait échouer la suppression de l'organisation si une ligne a échappé à la purge, ce qui est le comportement voulu).
3. **Réponse à la fin de T4** (« action de la clé vers `organizations` si l'option B de Q48 est retenue ») : aucune. La clé reste `NO ACTION`.

**Pourquoi (a).** Les textes la promettent depuis 0011 ; (b) laisserait survivre au compte une trace de ses lieux, sans borne réelle tant que Q438 est ouverte, et ferait d'une question technique une question juridique. Le coût de (a) est une migration de forme connue.

## Tests exigés (ticket du § 4)

1. **`tests/db/roles.test.ts`, droits exacts** : dans la carte des droits de table (l. 141), `vadrouille_fn_purge` reçoit `place_coordinates: ["DELETE"]` ; dans la carte des droits de colonne (l. 219-225), `place_coordinates: { SELECT: ["organization_id"] }`. Ajout **explicite**, sans mettre `place_coordinates` dans `BUSINESS_TABLES` ni `PURGED_TABLES` (`tests/db/helpers.ts` l. 169), qui servent aussi aux politiques de `vadrouille_app` et aux comptes de `purge.test.ts`. Les entrées de `vadrouille_app`, `vadrouille_fn_coords` et `vadrouille_prototype` sur `place_coordinates` ne changent pas.
2. **Politiques** : sur `place_coordinates`, exactement les sept politiques attendues (les cinq de `vadrouille_fn_coords`, celles de `vadrouille_app` et `vadrouille_prototype`) plus `place_coordinates_fn_purge`, `ALL`, `TO vadrouille_fn_purge`, `USING` et `WITH CHECK` égaux à `organization_id = app_current_org()` (forme de `tests/db/rappels.test.ts` l. 101-120).
3. **`tests/db/purge.test.ts`, test de purge** : le cas « avec le contexte de A et son owner » (l. 77-89) est complété, sans rien en retirer : des lignes vivantes de `place_coordinates` écrites par `store_place_coordinates` dans A, dans B et (par la fonction dédiée, comme `tests/db/positions-prototype.test.ts`) dans `org_prototype` ; après la purge de A, plus aucune ligne de A, celles de B et d'`org_prototype` intactes ; le second appel ne lève pas d'erreur. Un cas de plus : une ligne **expirée** de A disparaît aussi (compte lu sous un rôle qui voit les lignes expirées, par exemple `vadrouille_coords_purge` de `tests/db/coordonnees.test.ts` l. 302 et suivantes, ou sous le rôle d'amorçage).
4. **Refus inchangés** : purge de B avec le contexte de A, organisation à deux membres, appel direct sous `vadrouille_app` (cas existants l. 43-75) : aucune ligne de `place_coordinates` supprimée.
5. **Migration** : test de migration dans `tests/unit/db/` (modèle `migration-apres-voyage.test.ts`) ; `.down.sql` testé (purge de 0027 rétablie, droits et politique retirés) ; appartenance de `vadrouille_migrator` à `vadrouille_fn_purge` sans `SET` ni `INHERIT` après la migration (forme de `tests/db/rappels-relais.test.ts` l. 458-466).
6. **Tests existants qui doivent rester verts sans modification** : `tests/db/coordonnees.test.ts` (« vadrouille_fn_coords : ses seuls droits listés sur place_coordinates », « vadrouille_app n'a ni INSERT, ni UPDATE, ni DELETE ») et la règle qui borne `purge_organization_data` à `db/` et au module de suppression (0007, ESLint).

## Effet sur M9b

- **M9b ne porte plus de migration pour T4.** La ligne « migration seulement si T4 étend la purge » de la spécification (l. 211) ne joue plus pour T4 (elle reste possible pour T1, colonne `reauthenticated_at`, si cette voie était retenue). Le ticket `[data]` du § 4 est un **prérequis** de M9b : fusionné, et la migration appliquée par `db-migrate` (ligne `MIGRATIONS_APPROUVEES`, `owner-approved` sur la PR de workflow, 0035), avant que M9b n'ouvre la suppression à une vraie base.
- **Critère 3 de M9b** (spécification l. 216) : « `place_coordinates` de Samuel supprimées, celles de Léa intactes » s'applique tel quel ; la branche « sinon le critère suit T4 » tombe.
- **§ 4 étape 1** (l. 132, « À compléter de `place_coordinates` selon T4 ») : la purge du compte la couvre ; M9b n'appelle rien de plus.
- **Q48 option B** (M9b-2, l. 155-156) : rien de plus pour `place_coordinates` ; la clé reste `NO ACTION`.
- **Ordre des cycles** : une seule tâche `db/migrations` par cycle (M9 l. 10). Le ticket `[data]` passe avant M9b ; il ne dépend ni de M9a ni de Q48. M9a (export) n'est pas touché.

## 4. Tickets à ouvrir par le CEO

### 4.1 `[data]` « Purge du compte : supprimer `place_coordinates` (0167) »

**Fichiers** : `db/migrations/0028_purge_place_coordinates.sql` et `.down.sql`, `db/migrations/meta/_journal.json` ; `tests/db/roles.test.ts` ; `tests/db/purge.test.ts` ; un test de migration dans `tests/unit/db/` ; la ligne `MIGRATIONS_APPROUVEES` de `.github/workflows/db-migrate.yml` dans sa PR de workflow habituelle (0035), séparée si la règle du CEO l'exige.
**Critères** : § « Décision » points 1 à 3 ; § « Tests exigés » 1 à 6. Revue : Tech Lead et Sécurité (fichier sous `db/`).

## Textes amendés (par renvoi, sans les réécrire)

- **0007 l. 58** : se lit « Toute autre suppression passe par `purge_organization_data`, qui couvre aussi `place_coordinates` à partir de la migration 0028 (0167) ; hors de la purge du compte, les suppressions de `place_coordinates` sont faites par les fonctions de `vadrouille_fn_coords` (remplacement d'une ligne, purge des lignes expirées) ». 0007 l. 43 et 0011 (l. 117, l. 141) deviennent exacts à l'application de 0028 ; jusque-là, ils décrivent une cible non tenue (constat 4).
- **`docs/handovers/backend.md` l. 808** : même lecture (« depuis la migration 0028 »). Cette PR ne touche pas `docs/handovers/` (autres agents en cours) : la correction est faite par la PR du ticket 4.1 ou par la prochaine PR du handover, au choix du CEO.
- **Spécification M9** : effets ci-dessus ; la PR #1083 n'est pas modifiée ici, le Product Owner aligne l. 61, l. 132, l. 211 et l. 216 à sa prochaine correction.
- Les commentaires de `0001_securite.sql` (l. 220, l. 358) ne sont pas réécrits (migration appliquée, immuable) ; l'en-tête de 0028 dit qu'elle les rend vrais.

## Risques (à lister dans la note de version)

- Jusqu'à l'application de 0028, une suppression de compte laisserait les lignes de `place_coordinates` de l'organisation. Sans effet aujourd'hui : M9b n'existe pas et aucune ligne du MVP ne doit être écrite avant Q438 (0077 l. 103).
- Une écriture concurrente (un recalcul en cours qui appelle `store_place_coordinates` juste après la purge) pourrait recréer une ligne : point SP3.

## Questions nouvelles, par destinataire (à reporter par le CEO dans `QUESTIONS.md`)

**Sécurité** (posées, non tranchées ; aucune ne bloque le ticket 4.1, toutes sont vues à sa revue)
- **SP1 — Qualification** : une ligne de `place_coordinates` (organisation d'une seule personne, `placeId`, `fetched_at`) est-elle une donnée personnelle au sens du RGPD ? La réponse ne change pas l'option (a), qui supprime tout ; elle compte pour l'export de M9a, qui l'exclut comme donnée Google (M9 l. 98), et pour la liste « ce qui sera supprimé » de M9b.
- **SP2 — Droits** : confirmer que `SELECT (organization_id), DELETE` et la politique `FOR ALL` bornée à l'organisation de la transaction suffisent et ne donnent à `vadrouille_fn_purge` aucune lecture de `lat`, `lng` ni des lignes d'une autre organisation.
- **SP3 — Écriture après purge** : faut-il que M9b empêche toute écriture de positions après `purge_organization_data` (fin des sessions et des recalculs avant la purge, ou garde de `store_place_coordinates` sur `deletion_requested_at`, qui demanderait un droit de lecture de `organizations` à `vadrouille_fn_coords`) ? Le Tech Lead propose de traiter ce point dans M9b (ordre des étapes du handover § 12 et critère de complétude, M9 § 7 point 5), sans toucher `vadrouille_fn_coords`.

**Samuel** : aucune (§ 5).

**CEO**
- **C1** : ouvrir le ticket 4.1 au cycle suivant, avant M9b ; mettre à jour `STATUS.md` (point C3 de M9 : l'écart `place_coordinates` a sa réponse).
- **C2** : choisir qui corrige `docs/handovers/backend.md` l. 808.

## 5. Ce qui ne remonte pas à Samuel

Une donnée personnelle est en jeu (constat 6), mais l'option retenue la **supprime** avec le compte, comme 0011 le prévoyait déjà ; elle n'ajoute aucune conservation, aucune donnée, aucun transfert hors UE, aucune dépense ni aucun compte. Q27 (durées de conservation) et Q48 (`billing`, `usage_ledger`) ne changent pas. Seule l'option (b), qui garderait une trace des lieux après le compte, aurait demandé une décision de Samuel (juridique) : elle n'est pas retenue.

## Quand revoir

- Si Samuel retient l'option B de Q48 (vérifier que M9b-2 supprime l'organisation après `place_coordinates`, ce que l'ordre de la purge garantit).
- Si la purge cesse d'exiger un membre unique (organisations à plusieurs) : une ligne n'est plus alors la trace d'une seule personne.
- Si la Sécurité répond à SP3 par une garde dans `store_place_coordinates`.
