-- 0023_lien_prive_partage — lien privé sur `api` : droits de `vadrouille_app` sur `share_links` réduits (T9), vue
-- `shared_checklist` retirée (T5), et vues partagées conditionnées au déblocage du voyage (plan du MVP, étape 6, tâche
-- M6a-D, ticket 1009 ; décision 0157 § 1.5, § 1.9 et § 3, ligne M6a-D ; décision 0158 § 2, texte exact ; Sécurité :
-- 0157 § 2.4, S4, et 0158). **Seule migration de M6a.** Les deux `CHECK` du point 1.c sont générées par
-- `pnpm db:generate` depuis `db/schema/business.ts` ; tout le reste est écrit à la main (droits, déclencheur, politique,
-- vues). Exécutée par `vadrouille_migrator` dans une transaction, après 0022_feedback_signalements.
-- Retour arrière : `0023_lien_prive_partage.down.sql` (complet, voir ce fichier).
--
-- Plan :
--   1. `share_links` (0157 § 1.9, T9), sous `vadrouille_owner` :
--      a. `UPDATE` de `vadrouille_app` réduit à `revoked_at` : `token_hash`, `expires_at`, `trip_id`, `organization_id`,
--         `created_by` et `created_at` ne sont plus modifiables par l'application ; le verrou `FOR UPDATE` reste possible
--         (droit `UPDATE` sur une colonne) ;
--      b. `INSERT` par colonnes (`organization_id`, `trip_id`, `token_hash`, `created_by`, `expires_at`) : ni `id`, ni
--         `created_at`, ni `revoked_at` fournis par l'application (valeurs par défaut de la base ; un lien naît actif) ;
--      c. bornes d'`expires_at` : `expires_at > created_at` et `expires_at <= created_at + interval '3 years'` ;
--      d. désactivation définitive : déclencheur `BEFORE UPDATE` (fonction ordinaire, propriétaire `vadrouille_owner`,
--         `search_path` fixé) qui refuse toute mise à jour d'un lien déjà désactivé, refuse `revoked_at` nul dans la
--         nouvelle ligne et pose `revoked_at = now()` (l'instant vient de la base, jamais de l'appelant).
--   2. `entitlements` (0158 § 2.1 et § 2.2), sous `vadrouille_owner` : `SELECT (organization_id, trip_id, kind)` à
--      `vadrouille_fn_share_views` (ni `id`, ni `billing_id`, ni `granted_at` ; aucun droit de table ni d'écriture) et
--      politique dédiée `entitlements_fn_share_views` (ligne `tripUnlocked` du voyage d'un lien valide du jeton de la
--      transaction ; jamais `USING (true)`).
--   3. Vues partagées, sous `vadrouille_fn_share_views`, dans le cadre de 0158 § 2.4 (modèle de 0001 § 7 et de 0015),
--      ouvert une seule fois pour T5 et pour 0158 :
--      a. `DROP VIEW public.shared_checklist` (0157 § 1.5, T5) ;
--      b. `shared_trip` et `shared_trip_version` redéfinies par `CREATE OR REPLACE VIEW` (0158 § 2.3, texte exact),
--         avec la condition `EXISTS` sur la ligne `tripUnlocked` du voyage du lien ; colonnes, ordre des colonnes et
--         jointures inchangés (texte de 0001 § 6.5), `security_barrier` redit, sans `security_invoker` ; propriété et
--         droit `SELECT` de `vadrouille_share` gardés par le remplacement.
--      `CREATE ON SCHEMA public` est accordé à `vadrouille_fn_share_views` pour la durée du cadre : Postgres l'exige
--      pour `CREATE OR REPLACE VIEW` même quand la vue existe (le droit sur le schéma est contrôlé avant la propriété de
--      la vue), puis il est retiré, comme l'appartenance `SET` de `vadrouille_migrator`.
--   4. `checklist_items` (0157 § 1.5, T5), sous `vadrouille_owner`, une fois la vue retirée : politique
--      `checklist_items_fn_share_views` et droit `SELECT (…)` de `vadrouille_fn_share_views` retirés (ils ne servaient
--      qu'à la vue).
--
-- Aucune ligne n'est lue, modifiée ni supprimée. Aucun code de `src/` n'écrit encore `share_links` (M6a sera le premier,
-- après cette migration) : la table est vide partout et les `CHECK` sont posées valides, sans `NOT VALID` ; si une ligne
-- existante les contredisait, la migration échouerait (`23514`) sans rien changer. `ADD CONSTRAINT` prend un verrou
-- `ACCESS EXCLUSIVE` le temps d'un balayage de `share_links` (table vide ou presque : durée négligeable). La RLS de
-- `share_links`, `trips`, `trip_versions`, `checklist_items` et `entitlements` reste activée et forcée ; les politiques
-- `trips_fn_share_views`, `trip_versions_fn_share_views`, `share_links_fn_share` et `share_links_fn_share_views` ne
-- changent pas ; la liste fermée des politiques `USING (true)` ou `WITH CHECK (true)` ne change pas. Aucun droit nouveau
-- pour `vadrouille_share`, `vadrouille_app`, `vadrouille_fn_share` ni `PUBLIC` (la fonction du déclencheur est créée
-- par `vadrouille_owner`, dont les privilèges par défaut retirent `EXECUTE` à `PUBLIC`, 0000_socle). Aucun rôle n'est
-- créé ; aucune appartenance ne survit à la migration. Aucune donnée Google, aucune donnée personnelle. Sur Neon, cette
-- migration n'est appliquée qu'après l'ajout de sa ligne à `MIGRATIONS_APPROUVEES` par une PR de workflow à part et
-- l'`owner-approved` de Samuel (0158 § 5, décision 0035) ; d'ici là, `/p/` reste fermé sur `api` (0158 § 5).
SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint

-- 1.a `UPDATE` réduit à `revoked_at` (0157 § 1.9). `REVOKE UPDATE` de table retire aussi tout droit par colonne (aucun
-- n'existait) : l'ordre est donc retrait, puis droit par colonnes.
REVOKE UPDATE ON public.share_links FROM vadrouille_app;
--> statement-breakpoint
GRANT UPDATE (revoked_at) ON public.share_links TO vadrouille_app;
--> statement-breakpoint
-- 1.b `INSERT` par colonnes (0157 § 1.9).
REVOKE INSERT ON public.share_links FROM vadrouille_app;
--> statement-breakpoint
GRANT INSERT (organization_id, trip_id, token_hash, created_by, expires_at) ON public.share_links TO vadrouille_app;
--> statement-breakpoint
-- 1.c Bornes d'`expires_at` (0157 § 1.9). Aucune création ne doit les atteindre : `createShareLink` refuse avant
-- l'écriture (M6a, marge de 2 jours). `timestamptz + interval '3 years'` suit le fuseau de la session (au plus une heure
-- d'écart autour d'un changement d'heure), ce que cette marge couvre.
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_expires_after_created_check" CHECK ("share_links"."expires_at" > "share_links"."created_at");
--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_expires_within_3_years_check" CHECK ("share_links"."expires_at" <= "share_links"."created_at" + interval '3 years');
--> statement-breakpoint
-- 1.d Désactivation définitive (0157 § 1.9) : une erreur de code ne peut pas réactiver un lien. En usage normal, le
-- code n'atteint jamais ce refus : la désactivation porte `WHERE revoked_at IS NULL` (0157 § 1.3 point 5). Le verrou
-- `SELECT … FOR UPDATE` ne déclenche rien.
CREATE FUNCTION public.share_links_revoke_once() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF OLD.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'share_links : lien déjà désactivé, aucune modification' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.revoked_at IS NULL THEN
    RAISE EXCEPTION 'share_links : revoked_at nul refusé' USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.revoked_at := pg_catalog.now();
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER share_links_revoke_once BEFORE UPDATE ON public.share_links FOR EACH ROW EXECUTE FUNCTION public.share_links_revoke_once();
--> statement-breakpoint

-- 2.1 Droit par colonnes (0158 § 2.1, texte exact).
GRANT SELECT (organization_id, trip_id, kind) ON public.entitlements TO vadrouille_fn_share_views;
--> statement-breakpoint
-- 2.2 Politique dédiée (0158 § 2.2, texte exact) : même forme que `trips_fn_share_views` et
-- `trip_versions_fn_share_views` (0001 § 5.3).
CREATE POLICY entitlements_fn_share_views ON public.entitlements FOR SELECT TO vadrouille_fn_share_views
  USING (kind = 'tripUnlocked' AND EXISTS (
    SELECT 1 FROM public.share_links s
    WHERE s.organization_id = entitlements.organization_id AND s.trip_id = entitlements.trip_id
      AND s.token_hash = public.app_share_token_hash() AND s.revoked_at IS NULL AND s.expires_at > pg_catalog.now()));
--> statement-breakpoint
RESET ROLE;
--> statement-breakpoint

-- 3. Cadre de propriété (0158 § 2.4) : appartenance `SET` de `vadrouille_migrator` et `CREATE` sur le schéma accordés,
-- utilisés sous `vadrouille_fn_share_views` (propriétaire des vues), puis retirés dans cette même transaction.
GRANT vadrouille_fn_share_views TO vadrouille_migrator WITH INHERIT FALSE, SET TRUE;
--> statement-breakpoint
GRANT CREATE ON SCHEMA public TO vadrouille_fn_share_views;
--> statement-breakpoint
SET LOCAL ROLE vadrouille_fn_share_views;
--> statement-breakpoint
-- 3.a Vue sans lecteur retirée (0157 § 1.5, T5) : avec un jeton valide, elle rendait libellés et liens de réservation,
-- que F10-PO-14 interdit de montrer ; M6a ne lit que `shared_trip` et `shared_trip_version`.
DROP VIEW public.shared_checklist;
--> statement-breakpoint
-- 3.b Vues redéfinies (0158 § 2.3, texte exact), précédées du commentaire de 0158 § 2.5 :
-- Vues partagées (décision 0158, remplace pour entitlements le commentaire de 0001 § 6.5) : aucune vue n'expose de
-- colonne de stays (Q50), entitlements, billing, checkouts, briefs, feedback, preferences ni place_coordinates.
-- entitlements n'est lue par shared_trip et shared_trip_version que pour la condition du déblocage (droit
-- tripUnlocked du voyage du lien), par vadrouille_fn_share_views, sur organization_id, trip_id et kind seulement.
CREATE OR REPLACE VIEW public.shared_trip WITH (security_barrier = true) AS
  SELECT t.destination, t.start_date, t.end_date, t.travellers_adults, t.travellers_children, t.time_zone
  FROM public.share_links AS s
  JOIN public.trips AS t ON t.organization_id = s.organization_id AND t.id = s.trip_id
  WHERE s.token_hash = public.app_share_token_hash() AND s.revoked_at IS NULL AND s.expires_at > pg_catalog.now()
    AND EXISTS (
      SELECT 1 FROM public.entitlements AS e
      WHERE e.organization_id = s.organization_id AND e.trip_id = s.trip_id AND e.kind = 'tripUnlocked');
--> statement-breakpoint
CREATE OR REPLACE VIEW public.shared_trip_version WITH (security_barrier = true) AS
  SELECT v.version, v.created_at, public.shared_snapshot(v.snapshot) AS snapshot
  FROM public.share_links AS s
  JOIN public.trips AS t ON t.organization_id = s.organization_id AND t.id = s.trip_id
  JOIN public.trip_versions AS v ON v.organization_id = t.organization_id AND v.trip_id = t.id AND v.version = t.current_version
  WHERE s.token_hash = public.app_share_token_hash() AND s.revoked_at IS NULL AND s.expires_at > pg_catalog.now()
    AND EXISTS (
      SELECT 1 FROM public.entitlements AS e
      WHERE e.organization_id = s.organization_id AND e.trip_id = s.trip_id AND e.kind = 'tripUnlocked');
--> statement-breakpoint
RESET ROLE;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM vadrouille_fn_share_views;
--> statement-breakpoint
REVOKE vadrouille_fn_share_views FROM vadrouille_migrator GRANTED BY vadrouille_migrator;
--> statement-breakpoint

-- 4. Politique et droit de `vadrouille_fn_share_views` sur `checklist_items` retirés (0157 § 1.5, T5), après la vue qui
-- les lisait : aucune vue ne reste sur une table sans droit.
SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint
DROP POLICY checklist_items_fn_share_views ON public.checklist_items;
--> statement-breakpoint
REVOKE SELECT (id, organization_id, trip_id, stop_id, kind, label, moment, booking_url, sponsored, done)
  ON public.checklist_items FROM vadrouille_fn_share_views;
--> statement-breakpoint
RESET ROLE;
