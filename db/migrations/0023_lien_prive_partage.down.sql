-- Migration inverse de 0023_lien_prive_partage (plan du MVP, M6a-D, ticket 1009 ; décision 0157 § 1.5 et § 1.9 ;
-- décision 0158 § 2.6). Elle **défait la migration entière** (0158 § 2.6), dans le même cadre et dans l'ordre inverse.
-- Règle du rôle `data` : **aucune suppression de données**. Aucune ligne n'est lue, modifiée ni supprimée : elle ne
-- touche que des droits, une politique, deux vues, une vue recréée, un déclencheur, sa fonction et deux `CHECK`.
--
-- Ordre :
--   1. `checklist_items`, sous `vadrouille_owner` : droit `SELECT (…)` de `vadrouille_fn_share_views` (0001 § 4.6) et
--      politique `checklist_items_fn_share_views` (0001 § 5.3) recréés, avant la vue qui les lit ;
--   2. sous `vadrouille_fn_share_views`, dans le cadre de 0158 § 2.4 (appartenance `SET` et `CREATE ON SCHEMA public`
--      accordés puis retirés : le remplacement d'une vue et la création d'un nouvel objet l'exigent) :
--      a. `shared_trip` et `shared_trip_version` rendues dans leur texte de 0001 § 6.5, sans l'`EXISTS` sur
--         `entitlements` (même colonnes : `CREATE OR REPLACE VIEW` garde propriété et droits) ;
--      b. `shared_checklist` recréée dans son texte de 0001 § 6.5 ; propriété à `vadrouille_fn_share_views` (créée sous
--         ce rôle : même propriétaire et même liste de droits que le transfert de 0001 § 7) ; `REVOKE ALL … FROM
--         PUBLIC` ; `GRANT SELECT … TO vadrouille_share` ;
--   3. sous `vadrouille_owner`, une fois les vues rendues (aucune vue ne lit alors une table sans droit) :
--      `DROP POLICY entitlements_fn_share_views` et `REVOKE SELECT (organization_id, trip_id, kind)` sur `entitlements` ;
--      puis la part de T9 (0157 § 1.9), à l'inverse : déclencheur et fonction de désactivation définitive supprimés,
--      deux `CHECK` d'`expires_at` retirées (les lignes restent), droits par colonnes de `vadrouille_app` retirés et
--      `INSERT, UPDATE` de table rendus (état de 0001 § 4.1).
--
-- La descente rouvre ce que la Sécurité a voulu fermer (S4) : réactivation d'un lien, réécriture de `token_hash` ou
-- d'`expires_at`, lecture de `shared_checklist` avec un jeton valide, lien servi pour un voyage reverrouillé. Descente
-- d'urgence seulement, hors de tout code M6a déployé sur la base (M6a suppose les vues de 0023) ; la correction durable
-- se fait vers l'avant. Après elle, le texte de 0023 se rejoue sans erreur (aucun objet qu'il crée ne subsiste ; test
-- de `tests/db/partage.test.ts`, base jetable) ; mais le journal de `vadrouille_migrations` garde 0023 appliquée : un
-- retour passe par une migration corrective vers l'avant qui reprend ce texte.
SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint
-- 1. Droit et politique de `vadrouille_fn_share_views` sur `checklist_items` (texte de 0001 § 4.6 et § 5.3).
GRANT SELECT (id, organization_id, trip_id, stop_id, kind, label, moment, booking_url, sponsored, done)
  ON public.checklist_items TO vadrouille_fn_share_views;
--> statement-breakpoint
CREATE POLICY checklist_items_fn_share_views ON public.checklist_items FOR SELECT TO vadrouille_fn_share_views
  USING (EXISTS (
    SELECT 1 FROM public.share_links s
    WHERE s.organization_id = checklist_items.organization_id AND s.trip_id = checklist_items.trip_id
      AND s.token_hash = public.app_share_token_hash() AND s.revoked_at IS NULL AND s.expires_at > pg_catalog.now()));
--> statement-breakpoint
RESET ROLE;
--> statement-breakpoint

-- 2. Cadre de propriété (0158 § 2.4).
GRANT vadrouille_fn_share_views TO vadrouille_migrator WITH INHERIT FALSE, SET TRUE;
--> statement-breakpoint
GRANT CREATE ON SCHEMA public TO vadrouille_fn_share_views;
--> statement-breakpoint
SET LOCAL ROLE vadrouille_fn_share_views;
--> statement-breakpoint
-- 2.a Vues de 0001 § 6.5, sans la condition du déblocage.
CREATE OR REPLACE VIEW public.shared_trip WITH (security_barrier = true) AS
  SELECT t.destination, t.start_date, t.end_date, t.travellers_adults, t.travellers_children, t.time_zone
  FROM public.share_links AS s
  JOIN public.trips AS t ON t.organization_id = s.organization_id AND t.id = s.trip_id
  WHERE s.token_hash = public.app_share_token_hash() AND s.revoked_at IS NULL AND s.expires_at > pg_catalog.now();
--> statement-breakpoint
CREATE OR REPLACE VIEW public.shared_trip_version WITH (security_barrier = true) AS
  SELECT v.version, v.created_at, public.shared_snapshot(v.snapshot) AS snapshot
  FROM public.share_links AS s
  JOIN public.trips AS t ON t.organization_id = s.organization_id AND t.id = s.trip_id
  JOIN public.trip_versions AS v ON v.organization_id = t.organization_id AND v.trip_id = t.id AND v.version = t.current_version
  WHERE s.token_hash = public.app_share_token_hash() AND s.revoked_at IS NULL AND s.expires_at > pg_catalog.now();
--> statement-breakpoint
-- 2.b `shared_checklist` recréée (texte de 0001 § 6.5), propriété de `vadrouille_fn_share_views` par sa création sous ce
-- rôle, puis ses droits (0001 § 6.5).
CREATE VIEW public.shared_checklist WITH (security_barrier = true) AS
  SELECT c.id, c.stop_id, c.kind, c.label, c.moment, c.booking_url, c.sponsored, c.done
  FROM public.share_links AS s
  JOIN public.checklist_items AS c ON c.organization_id = s.organization_id AND c.trip_id = s.trip_id
  WHERE s.token_hash = public.app_share_token_hash() AND s.revoked_at IS NULL AND s.expires_at > pg_catalog.now();
--> statement-breakpoint
REVOKE ALL ON public.shared_checklist FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT ON public.shared_checklist TO vadrouille_share;
--> statement-breakpoint
RESET ROLE;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM vadrouille_fn_share_views;
--> statement-breakpoint
REVOKE vadrouille_fn_share_views FROM vadrouille_migrator GRANTED BY vadrouille_migrator;
--> statement-breakpoint

-- 3. Politique et droit sur `entitlements` (0158 § 2.6), puis T9 à l'inverse (0157 § 1.9).
SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint
DROP POLICY entitlements_fn_share_views ON public.entitlements;
--> statement-breakpoint
REVOKE SELECT (organization_id, trip_id, kind) ON public.entitlements FROM vadrouille_fn_share_views;
--> statement-breakpoint
DROP TRIGGER share_links_revoke_once ON public.share_links;
--> statement-breakpoint
DROP FUNCTION public.share_links_revoke_once();
--> statement-breakpoint
ALTER TABLE public.share_links DROP CONSTRAINT share_links_expires_within_3_years_check;
--> statement-breakpoint
ALTER TABLE public.share_links DROP CONSTRAINT share_links_expires_after_created_check;
--> statement-breakpoint
-- Droits par colonnes retirés d'abord : un `GRANT` de table ne les efface pas (ils resteraient dans `attacl`).
REVOKE INSERT (organization_id, trip_id, token_hash, created_by, expires_at) ON public.share_links FROM vadrouille_app;
--> statement-breakpoint
REVOKE UPDATE (revoked_at) ON public.share_links FROM vadrouille_app;
--> statement-breakpoint
GRANT INSERT, UPDATE ON public.share_links TO vadrouille_app;
--> statement-breakpoint
RESET ROLE;
