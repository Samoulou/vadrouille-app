# 0158 — Lien privé `/p/` sur `api` : un voyage reverrouillé n'est plus servi, par une condition des vues partagées (option (a)) ; scission de 0157

Statut : **acceptée**. Décision de la **Sécurité** (droits, politiques, exigences de test), **avec le Tech Lead** (architecture : forme de la lecture, périmètre de M6a-D, tests). Comme pour 0056, la part du Tech Lead n'est signée que par son approbation de cette PR. Définitive dès sa fusion, sans délai de veto (décision 0093). À lister dans la prochaine note de version (rubrique « Décisions prises par le studio »), avec les risques du § 7. Samuel peut la remettre en cause à tout moment par une nouvelle décision. Rien n'est tranché ici de ce qui revient à Samuel (Q129 : effet d'un remboursement sur le droit ; application des migrations ; production), au Product Owner, à l'UX/UI ni au CEO (ordre des cycles) : voir « Questions ».

Date : 2026-10-31 · Décideurs : Sécurité, avec le Tech Lead · Ticket : #1002 (scission de 0157, **Q813**) · `main` relu : `85d7021` (0157 fusionnée par la PR #987) · Correction 1 (2026-10-31) : revue consolidée du head `9330f7b` de la PR #1004 (bloquant 1, mineurs 2 à 9), et mineurs 1, 3, 4 et 7 de la dernière revue de 0157 (head `75e9b2f` de la PR #987, « à reprendre ici ou dans 0158 ») · Répond à : revue consolidée du head `0821497` de la PR #987, bloquant 1 (options (a), (b), (c)) et mineur 2 · Références : 0157 (fusionnée ; « État à la scission (Q813) », § 1.2, § 1.4 points 3 et 9, § 1.5, § 1.9, § 2.1 point 5, § 2.4, § 3, § 4, « Questions »), 0135 (§ 5, § 6), 0007 (« Vues partagées »), 0011 § 6, 0035, 0081 B9-TL-12 point 3, 0087 § 1.6, 0093, 0097 et 0140 § 2.4 (remboursement : alerte seule, Q129), `specs/M6-pendant-le-voyage-api.md` (§ 3.3 point 2, M6-PO-2), `specs/F10-pendant-le-voyage.md` (F10-PO-15), `specs/B4-paiement-simule.md` (B4-PO-16), `docs/handovers/backend.md` (§ 6, ligne `entitlements`) · Code relu : `db/migrations/0001_securite.sql` (§ 4.6 droits de `vadrouille_fn_share_views`, § 5.1 politiques type, § 5.3 politiques du lien privé, § 6.1 `resolve_share_link`, § 6.5 vues partagées, § 7 transfert de propriété), `db/migrations/0015_recalcul_lot.sql` (cadre de propriété, `purge_organization_data`), `db/schema/business.ts` (`entitlements`), `src/server/with-system-org.ts`, `src/server/payment/{webhook,paiements}.ts`, `src/server/voyages/lecture.ts` (`SQL_DEBLOQUES`), `.github/workflows/db-migrate.yml` (`MIGRATIONS_APPROUVEES`), `tests/db/{roles,partage,plusieurs-villes,schema}.test.ts`, `tests/unit/db/migrations-retour-arriere.test.ts`.

Numérotation : `main` (`85d7021`) va jusqu'à 0157 (fusionnée par la PR #987) ; aucune branche `claude/…` n'ajoute 0158 (numéro réservé par le ticket #1002, et nommé par 0157).

**Ce que cette décision n'engage pas.** Aucun code, aucun test, aucune migration dans cette PR (documentation seule). Elle ne modifie ni 0157 (fusionnée), ni 0135, ni `db/migrations/0001_securite.sql`. Elle ajoute au périmètre de la migration M6a-D, déjà prévue par 0157 (§ 3, qui fait de 0158 un préalable de M6a-D), un droit par colonnes, une politique et deux vues redéfinies (§ 2), et des tests (§ 4) ; M6a-D et M6a les font sous cette décision écrite, sans retrait ni affaiblissement d'un test. Aucune dépense, aucun compte externe, aucune variable d'environnement, aucun appel nouveau, aucune donnée Google lue, stockée ou envoyée en plus.

## Contexte

1. **La règle.** Un lien privé ne sert qu'un voyage **débloqué** : F10c, M6-PO-2 (« Personne propriétaire seule, voyage débloqué »), et 0157, fusionnée, qui renvoie ce refus à la présente décision. Ligne de renvoi de 0157 (« État à la scission (Q813) », l. 167) : « le refus de `/p/` pour un voyage reverrouillé est tranché par la **décision 0158** (Sécurité avec le Tech Lead), préalable à M6a-D ». Même renvoi au § 1.2 (l. 59, « Lecture de `/p/` »), au § 2.1 point 5 (l. 184, « Ordre des pages »), au § 3, ligne M6a-D (l. 231), au § 4 (l. 241 et l. 247), dans « Conséquences » (l. 282) et dans « Questions » (l. 297). 0157 ne porte pas de ligne de renvoi en tête. La dernière revue de 0157 (head `75e9b2f`) relève que le test « voyage reverrouillé → 404 commun » n'y figure plus : il est repris ici (§ 4.2). Le déblocage est la ligne `kind = 'tripUnlocked'` de `entitlements` (`db/schema/business.ts`, unique `(organization_id, trip_id, kind)`) ; aucune colonne de `trips` ne le porte (handover § 6).
2. **Aucun chemin de lecture n'existe** (revue du head `0821497`, bloquant 1) :
   - `vadrouille_fn_share_views`, propriétaire des vues partagées, n'a **aucun droit** sur `entitlements` (`0001_securite.sql` § 4.6) et aucune politique sur elle ; la RLS d'`entitlements` est activée et forcée ;
   - `shared_trip` et `shared_trip_version` (§ 6.5) ne testent que le jeton, `revoked_at` et `expires_at` ; le commentaire du § 6.5 dit « Aucune vue sur stays (Q50), entitlements, billing, … » ;
   - `resolve_share_link` (§ 6.1) ne contrôle que le lien ;
   - `vadrouille_share` n'a aucun droit sur les tables ;
   - `withSystemOrg` n'est admis pour le partage que pour `lirePositions` sur `place_coordinates` (0157 § 1.4 point 3, test (f) du point 9, S7 condition 2) ;
   - `vadrouille_app` lit `entitlements` sous la politique type (organisation de la transaction), mais la transaction 1 de `/p/` n'a pas d'organisation, et en poser une depuis le lien reviendrait à détourner `withSystemOrg`.
3. **Comment un voyage peut être reverrouillé aujourd'hui** : **il ne le peut pas**. Aucun rôle n'a `UPDATE` ni `DELETE` sur `entitlements`, sauf `vadrouille_fn_purge`, et `purge_organization_data` supprime liens, droits et voyages dans une seule transaction (`0015_recalcul_lot.sql`, `share_links` puis `entitlements` puis `trips`). Un remboursement ou un litige ne donne qu'une alerte et ne retire pas le droit (B4-PO-16 ; 0097 ; 0140 § 2.4) tant que **Q129** (Samuel : effet d'un remboursement sur le droit) n'est pas tranchée. L'exigence de 0157 est donc une **défense préventive** : elle doit tenir le jour où Q129, ou une correction manuelle, retirera un droit, sans attendre qu'une tâche y pense.
4. **0001 ne peut pas être modifiée** : la migration est appliquée et son empreinte est dans `MIGRATIONS_APPROUVEES` (`db-migrate.yml`). Le commentaire du § 6.5 se corrige donc dans la migration qui change les vues (§ 2.5).
5. **Le 404 commun** (F10-PO-15) couvre aujourd'hui quatre cas : jeton inconnu, désactivé, expiré, mal formé. Un voyage reverrouillé en devient un cinquième, sans page ni texte nouveau.

## Décision

### 1. Option retenue : (a), condition `EXISTS` dans les vues partagées

**Retenu : (a)**, la recommandation de la revue. Un lien dont le voyage n'a plus de droit `tripUnlocked` donne **zéro ligne** dans `shared_trip` et `shared_trip_version` ; la lecture de la vue partagée répond alors le 404 commun, comme pour un lien désactivé.

Pourquoi :
- **La règle vit au même endroit que les autres conditions du lien** (jeton, `revoked_at`, `expires_at`) : dans la définition des vues, sous `security_barrier`, évaluée par la base à chaque lecture. Aucun chemin de code ne peut l'oublier, ni M6a, ni une page ajoutée plus tard.
- **Aucun droit nouveau pour un rôle que le serveur peut prendre** : `vadrouille_share` et `vadrouille_app` ne gagnent rien. Le seul droit ajouté va à `vadrouille_fn_share_views`, rôle sans connexion qu'aucun rôle de connexion ne peut prendre (test existant de `roles.test.ts`), et il est limité à trois colonnes qui ne disent rien d'autre que « ce voyage a ce droit ». Aucune colonne d'`entitlements` n'est projetée par une vue.
- **Le coût est d'une sonde d'index** : l'`EXISTS` suit la clé unique `(organization_id, trip_id, kind)`.
- **Le travail tient dans M6a-D**, déjà prévue (0157 § 3) et déjà passée par la revue de la Sécurité (S4) et par `owner-approved` pour sa ligne de `MIGRATIONS_APPROUVEES` : pas de tâche `db/migrations` de plus, donc pas de cycle de plus.

**(b) rejetée** (chemin applicatif nommé en critère de revue de M6a). Les seuls chemins réalisables sont : lire `entitlements` sous `vadrouille_app` après avoir posé l'organisation du lien, ce qui élargit `withSystemOrg` au-delà de `lirePositions` et contredit S7 condition 2 et le test (f) de 0157 ; ou donner un droit à `vadrouille_share`, rôle que le serveur prend, ce qui est plus large que (a). Dans les deux cas, le contrôle vit dans le code, et une page ou une route ajoutée plus tard peut l'oublier.

**(c) rejetée** (ne rien exiger au MVP, en amendant 0135 § 6). Sur `api`, le déblocage est payant et pourra être retiré (Q129) : sans contrôle, un lien continuerait de servir **tout le programme** jusqu'à la fin du partage (retour + 30 jours) après le retrait du droit, à quiconque a l'adresse. 0135 § 5 (« le lien vaut attestation de ce déblocage pour sa durée ») vaut pour un déblocage **simulé**, qui ne peut pas être retiré ; il ne se transpose pas à `api`. Et (a) coûte peu.

### 2. Texte exact, à porter par la migration M6a-D

Ordre dans la migration : droit (§ 2.1), politique (§ 2.2), puis vues (§ 2.3), dans le cadre du § 2.4. Les noms sont ceux-ci, sans variante.

#### 2.1 Droit par colonnes

Sous `vadrouille_owner` (propriétaire d'`entitlements`) :

```sql
GRANT SELECT (organization_id, trip_id, kind) ON public.entitlements TO vadrouille_fn_share_views;
```

Ni `id`, ni `billing_id`, ni `granted_at` ; aucun droit de table ; aucun droit d'écriture. Aucun droit nouveau pour `vadrouille_share`, `vadrouille_app` ni `vadrouille_fn_share`.

#### 2.2 Politique dédiée

Sous `vadrouille_owner` :

```sql
CREATE POLICY entitlements_fn_share_views ON public.entitlements FOR SELECT TO vadrouille_fn_share_views
  USING (kind = 'tripUnlocked' AND EXISTS (
    SELECT 1 FROM public.share_links s
    WHERE s.organization_id = entitlements.organization_id AND s.trip_id = entitlements.trip_id
      AND s.token_hash = public.app_share_token_hash() AND s.revoked_at IS NULL AND s.expires_at > pg_catalog.now()));
```

Même forme que `trips_fn_share_views` et `trip_versions_fn_share_views` (`0001_securite.sql` § 5.3) : le propriétaire des vues ne voit que la ligne `tripUnlocked` du voyage d'un lien valide du jeton de la transaction. Jamais `USING (true)` : la liste fermée des politiques `USING (true)` (§ 5.2) ne change pas.

#### 2.3 Vues redéfinies

Sous `vadrouille_fn_share_views` (propriétaire des vues), par `CREATE OR REPLACE VIEW`, qui garde les droits accordés à `vadrouille_share` et la propriété ; colonnes, ordre des colonnes et jointures **inchangés**, `security_barrier` redit, sans `security_invoker` :

```sql
CREATE OR REPLACE VIEW public.shared_trip WITH (security_barrier = true) AS
  SELECT t.destination, t.start_date, t.end_date, t.travellers_adults, t.travellers_children, t.time_zone
  FROM public.share_links AS s
  JOIN public.trips AS t ON t.organization_id = s.organization_id AND t.id = s.trip_id
  WHERE s.token_hash = public.app_share_token_hash() AND s.revoked_at IS NULL AND s.expires_at > pg_catalog.now()
    AND EXISTS (
      SELECT 1 FROM public.entitlements AS e
      WHERE e.organization_id = s.organization_id AND e.trip_id = s.trip_id AND e.kind = 'tripUnlocked');

CREATE OR REPLACE VIEW public.shared_trip_version WITH (security_barrier = true) AS
  SELECT v.version, v.created_at, public.shared_snapshot(v.snapshot) AS snapshot
  FROM public.share_links AS s
  JOIN public.trips AS t ON t.organization_id = s.organization_id AND t.id = s.trip_id
  JOIN public.trip_versions AS v ON v.organization_id = t.organization_id AND v.trip_id = t.id AND v.version = t.current_version
  WHERE s.token_hash = public.app_share_token_hash() AND s.revoked_at IS NULL AND s.expires_at > pg_catalog.now()
    AND EXISTS (
      SELECT 1 FROM public.entitlements AS e
      WHERE e.organization_id = s.organization_id AND e.trip_id = s.trip_id AND e.kind = 'tripUnlocked');
```

- `shared_checklist` est supprimée par la même migration (0157 § 1.5, T5) et ne reçoit donc pas la condition. **Si T5 sortait de M6a-D** pour une raison quelconque, `shared_checklist` reçoit la même condition `EXISTS` dans la même migration.
- **Les politiques `trips_fn_share_views` et `trip_versions_fn_share_views` ne changent pas.** `vadrouille_fn_share_views` n'est atteint que par ses vues : la condition y est écrite une fois par vue, et c'est le seul texte à reprendre si la forme du droit change (§ 6).

#### 2.4 Cadre de propriété

Sur le modèle de `0015_recalcul_lot.sql` et de `0001_securite.sql` § 7 : `SET LOCAL ROLE vadrouille_owner` pour le § 2.1 et le § 2.2 ; `RESET ROLE` ; `GRANT vadrouille_fn_share_views TO vadrouille_migrator WITH INHERIT FALSE, SET TRUE` ; `GRANT CREATE ON SCHEMA public TO vadrouille_fn_share_views` (le remplacement d'une vue l'exige, sauf constat contraire du test de migration de M6a-D, noté dans sa PR ; sans besoin constaté, le droit n'est pas accordé) ; `SET LOCAL ROLE vadrouille_fn_share_views` ; les deux vues ; `RESET ROLE` ; `REVOKE CREATE ON SCHEMA public FROM vadrouille_fn_share_views` ; `REVOKE vadrouille_fn_share_views FROM vadrouille_migrator GRANTED BY vadrouille_migrator`. M6a-D peut regrouper ce cadre avec celui qu'exige déjà la suppression de `shared_checklist` (même propriétaire), sans l'ouvrir deux fois.

#### 2.5 Commentaire « Aucune vue sur … entitlements »

`0001_securite.sql` n'est pas modifiée (Contexte, point 4). La migration M6a-D porte, en tête de la redéfinition des vues, le commentaire qui **remplace** celui du § 6.5 de 0001 pour `entitlements` :

```sql
-- Vues partagées (décision 0158, remplace pour entitlements le commentaire de 0001 § 6.5) : aucune vue n'expose de
-- colonne de stays (Q50), entitlements, billing, checkouts, briefs, feedback, preferences ni place_coordinates.
-- entitlements n'est lue par shared_trip et shared_trip_version que pour la condition du déblocage (droit
-- tripUnlocked du voyage du lien), par vadrouille_fn_share_views, sur organization_id, trip_id et kind seulement.
```

Les deux autres textes qui disent la même chose sont mis à jour par M6a-D, avec renvoi à 0158 : 0007, « Vues partagées » (« aucune sur `entitlements`, … » se lit « aucune vue n'expose `entitlements` ; les vues partagées la lisent pour la seule condition du déblocage, 0158 ») ; handover `docs/handovers/backend.md` § 6, ligne `entitlements`, colonne « aucune vue partagée » (même lecture).

#### 2.6 Retour arrière

Le `.down.sql` de M6a-D, déjà exigé par 0157, défait la migration entière, dans le même cadre et dans l'ordre inverse. Pour la part de 0158 et de T5 : il rend `shared_trip` et `shared_trip_version` dans leur texte de 0001 § 6.5 (sans l'`EXISTS`) ; il **recrée `shared_checklist`** (T5) dans son texte de 0001 § 6.5, avec le droit `SELECT (…) ON public.checklist_items TO vadrouille_fn_share_views` de 0001 § 4.6, la politique `checklist_items_fn_share_views` de 0001 § 5.3, la propriété à `vadrouille_fn_share_views`, `REVOKE ALL … FROM PUBLIC` et `GRANT SELECT ON public.shared_checklist TO vadrouille_share` ; puis `DROP POLICY entitlements_fn_share_views ON public.entitlements` et `REVOKE SELECT (organization_id, trip_id, kind) ON public.entitlements FROM vadrouille_fn_share_views` (les vues d'abord, pour qu'aucune vue ne lise une table sans droit). La part de T9 suit 0157 § 1.9. Un cas ajouté à `tests/unit/db/migrations-retour-arriere.test.ts` couvre ce contenu, au-delà de la seule existence du fichier : `shared_checklist` recréée, sa propriété, son `GRANT` à `vadrouille_share`, sa politique et son droit ; les deux vues sans `entitlements` ; le `DROP POLICY` et le `REVOKE`.

### 3. Lecture par `src/server/partage/vue.ts` (M6a)

1. **Chemin unique pour les cinq 404.** Avec l'option (a), le contrôle du déblocage est **fusionné dans la lecture des vues** : il n'y a pas d'étape « déblocage » séparée après le lien. La transaction 1 de 0157 § 1.4 point 3 exécute **toujours la même suite de requêtes**, quel que soit l'état rendu par `resolve_share_link` : `resolve_share_link(empreinte)` sous `vadrouille_app`, puis `SET LOCAL ROLE vadrouille_share`, puis la lecture de `shared_trip`, puis celle de `shared_trip_version`. Elle ne s'arrête pas plus tôt sur un état `revoked`, `expired` ou sur un jeton inconnu (`resolve_share_link` pose l'empreinte dans tous les cas, et les vues rendent alors zéro ligne). Ainsi jeton inconnu, désactivé, expiré et voyage reverrouillé suivent le même chemin et la même suite de requêtes. Cela **réduit** l'écart de durée entre ces cas sans l'annuler : le travail de la base diffère encore de quelques sondes d'index, comme il diffère **déjà** aujourd'hui entre un jeton inconnu et un lien désactivé ou expiré (risque préexistant, § 7). Le jeton mal formé reste refusé **avant** toute lecture (0157 § 2.1 point 2, critère 13 de M6a) : il ne compte pas dans ce chemin.
2. **Décision du 404 après lecture** : la page répond 200 seulement si l'état est `valid` **et** `shared_trip` rend une ligne **et** `shared_trip_version` en rend une ; sinon le 404 commun (F10-PO-15), après la lecture complète du point 1. La règle de date de 0157 § 1.3 point 2 s'applique ensuite, comme prévu. L'état `valid` de `resolve_share_link` ne désigne que le lien ; « lien valide **et** voyage débloqué » se lit ici « état `valid` et une ligne dans chaque vue ».
3. **Transaction 2 (positions, `withSystemOrg`)** : ouverte **seulement** si le point 2 a conclu à 200, c'est-à-dire si le lien est valide **et** le voyage débloqué (contrôle fait par les vues). Un voyage reverrouillé ne déclenche donc aucune lecture de `place_coordinates`. Le test (f) de 0157 § 1.4 point 9, « lien non valide : `withSystemOrg` jamais appelé », vaut aussi pour un lien valide dont le voyage est reverrouillé.
4. **Aucune lecture d'`entitlements` par le code de `/p/`**, ni par `vadrouille_app`, ni par `withSystemOrg`, ni par une autre fonction : la condition est dans les vues. `vue.ts` ne lit rien d'autre que ce que 0157 § 1.4 lui permet. Le confinement de `withSystemOrg` (0157 § 1.4 point 8) ne change pas.
5. **Écart admis**, comme pour la désactivation (0157 § 1.4 point 3) : un retrait de droit validé entre la transaction 1 et la transaction 2 peut laisser passer une dernière réponse.
6. **Actions de la personne** (inchangées par 0158) : la création et `getShareStatus` exigent un voyage débloqué (0157 § 1.2, ordre gardé) ; la **désactivation** ne l'exige pas et reste toujours possible.
7. **`getShareStatus` après un reverrouillage : accepté au MVP, sans état nouveau.** `/p/` ne sert plus le voyage (§ 2) ; `getShareStatus` rend `not_found` ; le bouton « Partager » n'apparaît que pour un voyage débloqué (`shareButtonVisible`), donc la feuille ne montre pas le lien et la personne ne le voit pas. Rien n'est exposé : le lien ne sert rien tant que le droit manque. M6a **ne montre pas** d'état « voyage non débloqué » et `ShareStatus` (`src/contracts/share.ts`) ne change pas. Raisons : au MVP aucun droit ne peut être retiré hors purge (Contexte, point 3) ; et si le droit revient, le même lien sert de nouveau le voyage jusqu'à sa fin, ce qui est voulu (même personne, même lien, non désactivé). Point à revoir avec la transcription de Q129 (Product Owner et UX/UI : faut-il alors un état visible dans la feuille ?).

### 4. Tests exigés

#### 4.1 M6a-D (base)

- **`tests/db/roles.test.ts`** :
  - `EXPECTED_COLUMN_PRIVILEGES.vadrouille_fn_share_views` reçoit `entitlements: { SELECT: ["kind", "organization_id", "trip_id"] }` (le test existant « droits par colonne » vérifie alors la liste exacte, donc l'absence de `id`, `billing_id` et `granted_at`) ;
  - `EXPECTED_TABLE_PRIVILEGES.vadrouille_fn_share_views` reste `{}` : aucun droit de table sur `entitlements` ;
  - test nommé `rôles: vadrouille_fn_share_views ne lit d'entitlements que organization_id, trip_id et kind (0158)` : `has_column_privilege` faux pour `id`, `billing_id`, `granted_at` ; `has_any_column_privilege(…, 'INSERT, UPDATE, REFERENCES')` faux ; `has_table_privilege` faux pour `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE` ;
  - le test existant « vadrouille_share n'en a sur aucune table » reste inchangé et doit passer (`entitlements` comprise) ;
  - `SHARED_VIEWS` suit 0157 § 1.5 (`["shared_trip", "shared_trip_version"]`) ; la propriété des vues reste à `vadrouille_fn_share_views` (test existant).
- **`tests/db/partage.test.ts`** :
  - **politique** : sur `entitlements`, exactement une politique visant `vadrouille_fn_share_views`, `entitlements_fn_share_views`, `PERMISSIVE`, `FOR SELECT`, sans `WITH CHECK`, dont le texte (`pg_policies.qual`) contient `app_share_token_hash()`, `revoked_at IS NULL`, `expires_at > now()` et `'tripUnlocked'`. La comparaison se fait par **sous-chaînes tolérantes**, espaces normalisés : Postgres sérialise le texte à sa façon (`now()` sans `pg_catalog.`, `'tripUnlocked'::text`, parenthèses ajoutées), et le test ne compare jamais le texte entier ; la liste fermée des politiques `USING (true)` reste inchangée (test existant) ;
  - **voyage reverrouillé** : lien valide d'un voyage débloqué → une ligne dans chaque vue ; la ligne `tripUnlocked` retirée par la connexion d'administration des tests → **zéro ligne** dans `shared_trip` et `shared_trip_version`, alors que `resolve_share_link` rend toujours `valid` pour ce jeton (la fonction ne contrôle que le lien, voulu) ; droit remis → de nouveau une ligne (la règle est lue à chaque lecture) ;
  - **seul le bon droit compte** : voyage avec la seule ligne `preview` → zéro ligne ; ligne `tripUnlocked` d'un autre voyage de la même organisation → zéro ligne ; ligne `tripUnlocked` du voyage d'une autre organisation → zéro ligne ;
  - **définition des vues** : pour `shared_trip` et `shared_trip_version`, `pg_get_viewdef` contient `entitlements` et `kind = 'tripUnlocked'` (même comparaison tolérante, `::text` admis), pour qu'une dérive entre la politique et les vues ne passe pas en silence ;
  - les tests existants « security_barrier et pas security_invoker » et « seulement les colonnes prévues » restent inchangés et doivent passer (aucune colonne d'`entitlements` projetée).
- **Données des tests existants** (modification sous cette décision écrite, sans affaiblissement) : tout test de `tests/db/` qui lit `shared_trip` ou `shared_trip_version` avec un lien valide et attend des lignes reçoit le droit `tripUnlocked` de son voyage s'il ne l'a pas, **posé par la connexion d'administration des tests** (`connect("admin")`, comme `ouvrirRevision` de `plusieurs-villes.test.ts`) : `vadrouille_app`, sous lequel `seedShared` insère ses lignes, n'a que `SELECT` sur `entitlements` (0001 § 4.1). Relevé sur `85d7021` : `seedShared` de `partage.test.ts`, qui n'en pose pas ; le test de la vue partagée de `plusieurs-villes.test.ts`, à vérifier. Chacun de ces tests garde, ou reçoit, une assertion sur le **nombre de lignes** non nul, pour qu'aucun ne passe à vide ; aucune assertion n'est retirée. M6a-D liste dans sa PR les fichiers touchés.

#### 4.2 M6a (serveur et bout en bout)

- **404 de `/p/` pour un voyage reverrouillé** (`tests/db/partage-api.test.ts`, base réelle) : lien créé sur un voyage débloqué, droit retiré par la connexion d'administration → `RP` (`/p/<jeton>`) et `RPJ` (`/p/<jeton>/jour/1`) répondent le **même 404** que pour un jeton inconnu (statut, page, en-têtes de F10-TL-8, corps identique) ; aucune requête vers `place_coordinates` ; aucun appel de `withSystemOrg`.
- **Même chemin, aucun écart observable** (client simulé qui relève les requêtes) : pour un jeton inconnu, désactivé, expiré, et pour un lien valide de voyage reverrouillé, la transaction 1 reçoit **la même suite de textes SQL**, dans le même ordre et en même nombre (§ 3 point 1) ; la transaction 2 n'est jamais ouverte ; la réponse rendue est identique. **Aucun test de durée par horloge** n'est exigé : il serait instable en CI ; l'égalité des chemins **réduit** l'écart, sans en tenir lieu de preuve. Écart résiduel, préexistant, admis au § 7.
- **Désactivation après reverrouillage** (mineur 2 de la revue du head `0821497` ; 0157 § 1.2 garde aussi ce test) : sur un voyage dont le droit a été retiré, `revokeShareLink` de la personne propriétaire réussit et pose `revoked_at` ; `getShareStatus` rend `not_found` (ordre « débloqué requis » gardé, 0157 § 1.2 ; § 3 point 7).
- **Création après reverrouillage** : `createShareLink` rend `not_found`, aucune ligne écrite (déjà exigé par le critère 4 de M6a ; rejoué ici avec un droit retiré après une première création).
- Le **constat attendu de la Sécurité** sur la PR de M6a (0157 § 4 et « Questions ») comprend ces tests.

### 5. Effet sur M6a-D et M6a

- **M6a-D** : la migration des vues revient à **M6a-D**, et à elle seule. Son périmètre est donc : **T5** (0157 § 1.5), **T9** (0157 § 1.9) **et 0158 § 2** (droit, politique, deux vues, commentaire, retour arrière), avec les tests du § 1.5 et du § 1.9 de 0157 et du § 4.1 de 0158. Elle reste **une seule tâche `db/migrations`** et **une seule migration** ; la règle « une tâche `db/migrations` par cycle » (plan § 10, 0157 § 3) ne change pas, et aucune tâche de base de plus n'est créée. Sa **ligne de `MIGRATIONS_APPROUVEES`** passe, comme prévu, par une **PR de workflow**, fusionnable seulement avec `owner-approved` posé par **Samuel** (décision 0035) ; le studio ne pose ni ne retire ce libellé, et l'application suit le circuit des migrations (plan § 0.2 point 6). La revue de la Sécurité de M6a-D (S4, G1 à G6) vérifie en plus le texte exact du § 2. Prérequis de M6a-D : la présente décision fusionnée (0157 l'est).
- **M6a** : prérequis inchangés (M6a-D fusionnée, S1 à S3 confirmés ; S7 et la réponse de Samuel pour la carte), plus le § 3 et le § 4.2. M6a **n'ajoute aucune migration** ni aucun droit. **M6a ne livre pas `/p/` sur `api` avant que M6a-D, avec le § 2, soit fusionnée** : d'ici là, `/p/` reste fermé sur `api` (404 commun par la garde, comme aujourd'hui), et la PR de M6a n'est pas fusionnable sans le test du § 4.2. Elle ne contourne pas : la lecture d'un voyage reverrouillé n'a pas d'autre chemin admis.
- **M6b, M6c-D, M6c** : non touchées.

### 6. Règle durable

- **Toute tâche qui change la façon dont un droit `tripUnlocked` est retiré** (réponse de Samuel à Q129, colonne de retrait, nouvelle sorte de droit, suppression par une fonction) met à jour **dans la même migration** la condition `EXISTS` des vues partagées et la politique `entitlements_fn_share_views`, et rejoue les tests du § 4.1 avec le nouveau mode de retrait. La revue de la Sécurité le vérifie.
- Aucun autre rôle ne reçoit de droit sur `entitlements` pour le partage. Un besoin nouveau de lecture d'`entitlements` par `/p/` passe par une décision.

### 7. Risques (à lister dans la note de version)

- **Écart de durée résiduel entre les cas du 404** : le chemin et la suite de requêtes sont identiques (§ 3 point 1), mais le travail de la base diffère de quelques sondes d'index entre un jeton inconnu et un lien valide de voyage reverrouillé. Ce qu'un tel écart pourrait apprendre, à quelqu'un qui a déjà le jeton, est que le lien n'est ni désactivé ni expiré ; il n'ouvre aucun contenu. Cet écart existe **déjà** entre un jeton inconnu et un lien désactivé ou expiré (la ligne de `share_links` est trouvée ou non) : 0158 ne le crée pas, le chemin unique le réduit. Accepté.
- **Fenêtre entre les deux transactions** (§ 3 point 5) : un retrait de droit validé entre la lecture des vues et celle des positions peut laisser passer une dernière réponse avec carte.
- **Lien non désactivé servi de nouveau si le droit revient** (§ 3 point 7) : voulu ; la personne ne voit pas l'état du lien tant que le voyage n'est pas débloqué.
- **Défense sans cas réel aujourd'hui** (Contexte, point 3) : tant que Q129 n'est pas tranchée, aucun droit n'est retiré hors purge ; la condition et ses tests protègent le jour où un retrait existera, à condition que la règle du § 6 soit tenue.

## Textes amendés (par renvoi, sans les réécrire)

- **0157** (fusionnée, PR #987 ; `main` `85d7021`), sur son texte réel :
  - § 1.2 (l. 59), phrase « Lecture de `/p/` : le refus de `/p/` pour un voyage reverrouillé est tranché par la **décision 0158** […], préalable à M6a-D ; la revue recommande l'option (a) […] » : tranché, **option (a)** (0158 § 1 et § 2) ; phrase « `getShareStatus` […] **garde « voyage débloqué » requis** : après un reverrouillage, la personne peut couper le lien sans voir son état » : accepté au MVP, sans état nouveau (0158 § 3 point 7) ;
  - § 1.4 point 3 (l. 77-80) : « Transaction 1 […] puis, si l'état est `valid`, `SET LOCAL ROLE vadrouille_share` et lecture de `shared_trip` et `shared_trip_version` » se lit selon le chemin unique de 0158 § 3 point 1 (lecture des vues dans tous les cas) ; « Transaction 2 […] ouverte **seulement** si la transaction 1 a rendu `valid` » se lit « seulement si 0158 § 3 point 2 conclut à 200 » (lien valide **et** voyage débloqué, contrôle fait par les vues) ;
  - § 1.4 point 9 (f) (l. 89), « lien non valide : `withSystemOrg` jamais appelé » : comprend le lien valide d'un voyage reverrouillé (0158 § 4.2) ;
  - § 2.1 point 5 (l. 184), « Ordre des pages : en-tête « compté », puis lien (`resolve_share_link`), puis déblocage du voyage (selon la décision 0158) » : avec l'option (a), lien et déblocage sont **une seule étape**, la lecture de 0158 § 3 (`resolve_share_link` puis vues) ; l'ordre se lit « en-tête « compté », puis lecture du lien et des vues » ;
  - § 2.4 (S4, l. 197-198) : l'exigence vaut aussi pour 0158 § 2, dans la même migration M6a-D, fusionnée avant M6a ; la revue de la Sécurité (G1 à G6) porte sur ce texte aussi ;
  - § 3, ligne M6a-D (l. 231) : la colonne « Tâche », qui ne cite que T5 et T9, se lit « T5, T9 **et 0158 § 2** », avec les tests de 0158 § 4.1 ; dans la colonne « Prérequis », « la revue recommande l'option (a) » est tranché (0158 § 1) ; ligne M6a : reçoit 0158 § 3 et § 4.2 ;
  - § 4 (l. 241 et l. 247) et « Questions », point « Sécurité » (l. 297) : la décision 0158 n'est plus « à part » ; le constat attendu de la Sécurité sur M6a comprend 0158 § 4.2.
  0157 renvoie déjà à 0158 dans le texte (Contexte, point 1) mais n'a pas de ligne de renvoi en tête : la PR de M6a-D ajoute, sous l'en-tête de 0157, la ligne « **Lecture de `/p/` pour un voyage reverrouillé : décision 0158 (option (a), condition des vues partagées, M6a-D).** », sans autre changement.
- **0135** : § 5, quatrième tiret, dernière phrase (« le lien vaut attestation de ce déblocage pour sa durée ») : **inchangée pour le site d'essai** (déblocage simulé, qui ne peut pas être retiré) ; sur `api`, un lien n'atteste rien : le déblocage est relu par la base à chaque lecture (0158 § 2). § 6 : sur `api`, en plus des deux règles d'expiration, le voyage doit avoir son droit `tripUnlocked` au moment de la lecture. La ligne de renvoi en tête de 0135, déjà prévue par 0157 (« Textes amendés », portée par M6a), cite aussi 0158.
- **`specs/M6-pendant-le-voyage-api.md`** (la décision prime, le texte n'est pas réécrit) : § 3.3 point 2, « si l'état n'est pas `valid`, 404 » se lit selon 0158 § 3 (lecture complète, puis 404) ; « Réponses » (point 7) : le voyage reverrouillé reçoit le même 404 que les quatre cas de F10-PO-15.
- **`specs/F10-pendant-le-voyage.md`**, F10-PO-15 : la liste des cas du 404 commun s'étend au voyage reverrouillé, sur `api` ; aucun texte ni rendu nouveau. Renvoi porté par M6a avec ses autres amendements de F10.
- **0007**, « Vues partagées », et **`docs/handovers/backend.md`** § 6, ligne `entitlements` : 0158 § 2.5 (renvois portés par M6a-D).
- **`db/migrations/0001_securite.sql`** § 6.5, commentaire : non modifié ; remplacé pour `entitlements` par le commentaire de M6a-D (0158 § 2.5).

## Conséquences

- Le bloquant 1 de la revue du head `0821497` de la PR #987 a une réponse écrite. 0157, fusionnée, renvoie déjà à 0158 et en fait un préalable de M6a-D : à la fusion de 0158, ce préalable est levé et le CEO peut ouvrir M6a-D avec le périmètre du § 5.
- Les mineurs 1, 3, 4 et 7 de la dernière revue de 0157 (head `75e9b2f`) sont repris ici (§ 3 points 1 à 3 et 7, § 4.2, § 5, « Textes amendés ») ; les mineurs 2, 5 et 6 de cette revue ne relèvent pas de 0158 (2 et 6 sont réglés par le renvoi ci-dessus ; 5 porte sur les accords des rappels, M6c-D).
- M6a-D grossit d'un droit par colonnes, d'une politique, de deux redéfinitions de vue et de leurs tests ; elle reste une tâche et une migration.
- Aucun contrat de `src/contracts` ne change. Aucun rôle que le serveur peut prendre ne gagne de droit.
- Aucun test n'est supprimé ni affaibli : les tests modifiés le sont sous le § 4.1, avec des assertions ajoutées.
- Contenu non fiable : aucun rencontré. Le ticket #1002, la PR #987 et la PR #1004 viennent de Samoulou et de branches `claude/…`.

## Questions (à reporter par le CEO dans `QUESTIONS.md`)

**Samuel** : aucune question nouvelle. Information : un voyage ne peut être reverrouillé que si un droit est retiré, ce qui dépend de ta réponse à **Q129** (effet d'un remboursement sur le droit, déjà ouverte) ; cette décision fait que, le jour où un droit sera retiré, le lien privé de ce voyage cessera aussitôt de l'afficher. Rappel du circuit existant : la ligne `MIGRATIONS_APPROUVEES` de M6a-D attend ton libellé `owner-approved` (décision 0035) ; elle bloque M6a, comme déjà prévu par 0157.

**Product Owner** : aucune question nouvelle. Information : après un reverrouillage, la feuille « Partager » ne montre pas le lien (§ 3 point 7, accepté au MVP) ; un état visible sera à regarder avec l'UX/UI quand Q129 sera transcrite. Autre information : le voyage reverrouillé rejoint les cas du 404 commun de F10-PO-15, sans texte nouveau ; si le PO voulait un message distinct pour ce cas, ce serait une demande à part (non recommandé : un message distinct dirait à qui a le lien que le voyage existe).

**CEO** : aucune question nouvelle. Consigne d'ouverture : le ticket de M6a-D cite 0157 § 1.5 et § 1.9 **et** 0158 § 2 et § 4.1 ; celui de M6a cite en plus 0158 § 3 et § 4.2. La place de M6a-D dans l'ordre des cycles reste au CEO (une tâche `db/migrations` par cycle). Bloque : M6a-D, donc M6a, jusqu'à l'ouverture de M6a-D avec ce périmètre.

## Quand revoir

À la réponse de Samuel à Q129 (règle du § 6 ; état de la feuille, § 3 point 7) ; si un autre mode de retrait d'un droit apparaît ; si une vue partagée est ajoutée (elle reçoit la même condition) ; avant toute ouverture publique ou en production (Q101), avec les autres points de 0157.
