-- 0024_rappels — accords aux rappels de voyage et réclamations des envois (plan du MVP, étape 6, tâche M6c-D, ticket
-- 1014 ; décision 0157 § 1.7 point 5 et § 1.8 ; spécification `specs/M6-pendant-le-voyage-api.md` § 5, corrigée par
-- 0157 § 1.7 et § 2.6 pour ce qui touche la base). **Seule migration de M6c.** Générée par `pnpm db:generate` depuis
-- `db/schema/business.ts` (tables, clés, `CHECK`, index), puis complétée à la main (RLS, politiques, droits,
-- déclencheur, purge). Exécutée par `vadrouille_migrator` dans une transaction, après 0023_lien_prive_partage,
-- seulement par le workflow `db-migrate` après l'`owner-approved` de Samuel sur la ligne de MIGRATIONS_APPROUVEES (0035,
-- 0056 § 3), ajoutée par une PR de workflow à part.
-- Retour arrière : `0024_rappels.down.sql` (partielle, voir `db/README.md`).
--
-- Migration **additive** : deux tables nouvelles, une fonction de déclencheur, la purge du compte recréée. Aucune ligne
-- existante n'est lue, modifiée ni supprimée ; aucun code de `src/` ne nomme encore ces tables (M6c sera le premier).
--
-- Plan :
--   1. `reminder_consents` (0157 § 1.8) : une ligne par accord (réactiver crée une ligne ; l'`id` est le `consentId` de
--      l'exécution) ; clés étrangères vers `organizations`, `users`, `trips (organization_id, id)` et
--      `memberships (organization_id, user_id)` (la personne est membre de l'organisation du voyage) ; `CHECK
--      (withdrawn_at IS NULL OR withdrawn_at >= consented_at)` ; index unique partiel « un accord actif par voyage et
--      par personne » ;
--   2. `reminder_sends` (0157 § 1.8) : la réclamation d'une journée est l'insertion de sa ligne ; clé primaire
--      `(organization_id, trip_id, user_id, day_index)` ; `CHECK (day_index >= 1)` ; clés étrangères vers
--      `organizations`, `users`, `trips (organization_id, id)` et `memberships (organization_id, user_id)` (revue de la
--      PR M6c-D, mineur 2, arbitrage du CEO : une réclamation ne vise qu'un membre de l'organisation) ;
--      toutes les clés étrangères des deux tables en `ON DELETE NO ACTION` : aucune suppression en cascade ; les lignes
--      partent par `purge_organization_data` (point 6) ;
--   3. RLS activée et forcée sur les deux tables ; politique de purge de `vadrouille_fn_purge` (organisation de la
--      transaction, modèle de `deck_closures`, 0014) ; `reminder_sends` : politique type de `vadrouille_app` ;
--      `reminder_consents` (revue de la PR M6c-D, mineur 1) : trois politiques de `vadrouille_app`, lecture dans
--      l'organisation de la transaction, insertion et retrait seulement pour la personne de la transaction
--      (`user_id = app_current_user()`, en `WITH CHECK` et, pour le retrait, en `USING`) ;
--   4. droits : `vadrouille_app` : `reminder_consents` `SELECT`, `INSERT (organization_id, trip_id, user_id)`,
--      `UPDATE (withdrawn_at)` ; `reminder_sends` `SELECT, INSERT` ; ni `DELETE` ni `TRUNCATE`. Ni `id`, ni
--      `consented_at`, ni `withdrawn_at` à l'insertion : un accord naît actif, à l'instant de la base (revue de la PR
--      M6c-D, bloquant 1, modèle de T9 pour `share_links`, 0023). `vadrouille_fn_purge` : `SELECT (organization_id)`,
--      `DELETE` ;
--   5. accord retiré définitif : déclencheur `BEFORE UPDATE` (fonction ordinaire, propriétaire `vadrouille_owner`,
--      `search_path` fixé, modèle de `share_links_revoke_once`, 0023) qui refuse toute mise à jour d'un accord dont
--      `withdrawn_at` est posé, refuse `withdrawn_at` nul dans la nouvelle ligne et pose `withdrawn_at = now()`
--      (l'instant du retrait vient de la base, jamais de l'appelant) ; il s'applique à tout rôle, propriétaire et
--      administrateur compris, et ne couvre ni `DELETE` ni `TRUNCATE` (seule la purge supprime) ;
--   6. `purge_organization_data` recréée sous son propriétaire `vadrouille_fn_purge` (même forme que 0015, point 4) :
--      réclamations puis accords supprimés **avant** `trips` (clés étrangères `NO ACTION`), le reste à l'identique de
--      0015 ; appartenance temporaire de `vadrouille_migrator` retirée.
--
-- Aucune adresse, aucun texte, aucune donnée Google ; aucune colonne d'horaire d'envoi (recalculé à chaque réveil).
-- Conséquence signalée (0157 § 1.7 point 5) : un voyage qui a eu un accord ne peut plus être supprimé hors de la purge
-- du compte (`23503`) ; la tâche qui supprime un voyage doit d'abord traiter ses accords et ses réclamations.

SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint

-- 1. Accords (0157 § 1.8).
CREATE TABLE "reminder_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"consented_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone,
	CONSTRAINT "reminder_consents_withdrawn_after_consented_check" CHECK ("reminder_consents"."withdrawn_at" IS NULL OR "reminder_consents"."withdrawn_at" >= "reminder_consents"."consented_at")
);
--> statement-breakpoint
ALTER TABLE "reminder_consents" ADD CONSTRAINT "reminder_consents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reminder_consents" ADD CONSTRAINT "reminder_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reminder_consents" ADD CONSTRAINT "reminder_consents_trip_fk" FOREIGN KEY ("organization_id","trip_id") REFERENCES "public"."trips"("organization_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Cible : la contrainte unique `(organization_id, user_id)` de `memberships` (0000_socle).
ALTER TABLE "reminder_consents" ADD CONSTRAINT "reminder_consents_membership_fk" FOREIGN KEY ("organization_id","user_id") REFERENCES "public"."memberships"("organization_id","user_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Un accord actif par voyage et par personne ; les accords retirés restent (historique daté).
CREATE UNIQUE INDEX "reminder_consents_one_active_idx" ON "reminder_consents" USING btree ("organization_id","trip_id","user_id") WHERE "reminder_consents"."withdrawn_at" IS NULL;
--> statement-breakpoint

-- 2. Réclamations (0157 § 1.8) : une seconde insertion de la même journée échoue (`23505`), rien n'est envoyé.
CREATE TABLE "reminder_sends" (
	"organization_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"day_index" smallint NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_sends_pkey" PRIMARY KEY("organization_id","trip_id","user_id","day_index"),
	CONSTRAINT "reminder_sends_day_index_check" CHECK ("reminder_sends"."day_index" >= 1)
);
--> statement-breakpoint
ALTER TABLE "reminder_sends" ADD CONSTRAINT "reminder_sends_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reminder_sends" ADD CONSTRAINT "reminder_sends_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reminder_sends" ADD CONSTRAINT "reminder_sends_trip_fk" FOREIGN KEY ("organization_id","trip_id") REFERENCES "public"."trips"("organization_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Même cible que l'accord : la réclamation ne vise qu'un membre de l'organisation du voyage.
ALTER TABLE "reminder_sends" ADD CONSTRAINT "reminder_sends_membership_fk" FOREIGN KEY ("organization_id","user_id") REFERENCES "public"."memberships"("organization_id","user_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

-- 3. RLS (0001_securite, 5.1 ; modèle de `deck_closures`, 0014).
ALTER TABLE public.reminder_consents ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.reminder_consents FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Lecture dans l'organisation ; écriture seulement pour la personne de la transaction (l'accord est le sien).
CREATE POLICY reminder_consents_app_select ON public.reminder_consents AS PERMISSIVE FOR SELECT TO vadrouille_app
  USING (organization_id = public.app_current_org());
--> statement-breakpoint
CREATE POLICY reminder_consents_app_insert ON public.reminder_consents AS PERMISSIVE FOR INSERT TO vadrouille_app
  WITH CHECK (organization_id = public.app_current_org() AND user_id = public.app_current_user());
--> statement-breakpoint
CREATE POLICY reminder_consents_app_update ON public.reminder_consents AS PERMISSIVE FOR UPDATE TO vadrouille_app
  USING (organization_id = public.app_current_org() AND user_id = public.app_current_user())
  WITH CHECK (organization_id = public.app_current_org() AND user_id = public.app_current_user());
--> statement-breakpoint
CREATE POLICY reminder_consents_fn_purge ON public.reminder_consents AS PERMISSIVE FOR ALL TO vadrouille_fn_purge
  USING (organization_id = public.app_current_org()) WITH CHECK (organization_id = public.app_current_org());
--> statement-breakpoint
ALTER TABLE public.reminder_sends ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.reminder_sends FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY reminder_sends_app ON public.reminder_sends AS PERMISSIVE FOR ALL TO vadrouille_app
  USING (organization_id = public.app_current_org()) WITH CHECK (organization_id = public.app_current_org());
--> statement-breakpoint
CREATE POLICY reminder_sends_fn_purge ON public.reminder_sends AS PERMISSIVE FOR ALL TO vadrouille_fn_purge
  USING (organization_id = public.app_current_org()) WITH CHECK (organization_id = public.app_current_org());
--> statement-breakpoint

-- 4. Droits (0157 § 1.8 ; revue de la PR M6c-D, bloquant 1). Un accord s'insère par ses trois colonnes d'identité :
-- `id`, `consented_at` et `withdrawn_at` viennent de la base. Le retrait est la seule écriture d'un accord après sa
-- création ; une réclamation n'est jamais modifiée. Aucune suppression par l'application.
GRANT SELECT ON public.reminder_consents TO vadrouille_app;
--> statement-breakpoint
GRANT INSERT (organization_id, trip_id, user_id), UPDATE (withdrawn_at) ON public.reminder_consents TO vadrouille_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON public.reminder_sends TO vadrouille_app;
--> statement-breakpoint
GRANT SELECT (organization_id), DELETE ON public.reminder_consents, public.reminder_sends TO vadrouille_fn_purge;
--> statement-breakpoint

-- 5. Accord retiré définitif (0157 § 1.8) ; instant du retrait posé par la base (revue de la PR M6c-D, bloquant 1).
-- Fonction ordinaire (ni `SECURITY DEFINER` ni droit nouveau) : aucun droit d'exécution n'est nécessaire au
-- déclenchement, et les droits par défaut de 0000 retirent celui de `PUBLIC`.
CREATE FUNCTION public.reminder_consents_withdraw_once() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF OLD.withdrawn_at IS NOT NULL THEN
    RAISE EXCEPTION 'reminder_consents : accord déjà retiré, aucune modification' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.withdrawn_at IS NULL THEN
    RAISE EXCEPTION 'reminder_consents : withdrawn_at nul refusé' USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.withdrawn_at := pg_catalog.now();
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER reminder_consents_withdraw_once BEFORE UPDATE ON public.reminder_consents
  FOR EACH ROW EXECUTE FUNCTION public.reminder_consents_withdraw_once();
--> statement-breakpoint

-- 6. Purge de compte (0001_securite, 6.3 ; 0157 § 1.8). Recréation sous le propriétaire (même forme que 0015, point 4) ;
-- corps identique à 0015 hors des deux nouvelles tables, supprimées d'abord (elles visent les voyages, les personnes et
-- les adhésions). Droits d'exécution réécrits.
RESET ROLE;
--> statement-breakpoint
GRANT vadrouille_fn_purge TO vadrouille_migrator WITH INHERIT FALSE, SET TRUE;
--> statement-breakpoint
GRANT CREATE ON SCHEMA public TO vadrouille_fn_purge;
--> statement-breakpoint
SET LOCAL ROLE vadrouille_fn_purge;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.purge_organization_data(p_organization_id uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_org uuid := public.app_current_org();
  v_user uuid := public.app_current_user();
BEGIN
  IF p_organization_id IS NULL OR v_org IS NULL OR p_organization_id <> v_org THEN
    RAISE EXCEPTION 'purge refusée : organisation hors du contexte de la transaction' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'purge refusée : aucun utilisateur dans le contexte' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.memberships AS m WHERE m.organization_id = v_org AND m.user_id = v_user AND m.role = 'owner'
  ) THEN
    RAISE EXCEPTION 'purge refusée : réservée au propriétaire' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF EXISTS (SELECT 1 FROM public.memberships AS m WHERE m.organization_id = v_org AND m.user_id <> v_user) THEN
    RAISE EXCEPTION 'purge refusée : l''organisation a un autre membre' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.organizations AS o SET deletion_requested_at = pg_catalog.now()
  WHERE o.id = v_org AND o.deletion_requested_at IS NULL;

  DELETE FROM public.reminder_sends AS x WHERE x.organization_id = v_org;
  DELETE FROM public.reminder_consents AS x WHERE x.organization_id = v_org;
  DELETE FROM public.preference_prompts AS x WHERE x.organization_id = v_org;
  DELETE FROM public.preference_signals AS x WHERE x.organization_id = v_org;
  DELETE FROM public.proposals AS x WHERE x.organization_id = v_org;
  DELETE FROM public.event_occurrences AS x WHERE x.organization_id = v_org;
  DELETE FROM public.candidates AS x WHERE x.organization_id = v_org;
  DELETE FROM public.research_runs AS x WHERE x.organization_id = v_org;
  DELETE FROM public.generation_runs AS x WHERE x.organization_id = v_org AND x.kind = 'batch';
  DELETE FROM public.deck_closures AS x WHERE x.organization_id = v_org;
  DELETE FROM public.generation_runs AS x WHERE x.organization_id = v_org;
  DELETE FROM public.feedback AS x WHERE x.organization_id = v_org;
  DELETE FROM public.checklist_items AS x WHERE x.organization_id = v_org;
  DELETE FROM public.share_links AS x WHERE x.organization_id = v_org;
  DELETE FROM public.entitlements AS x WHERE x.organization_id = v_org;
  DELETE FROM public.checkouts AS x WHERE x.organization_id = v_org;
  DELETE FROM public.trip_versions AS x WHERE x.organization_id = v_org;
  DELETE FROM public.briefs AS x WHERE x.organization_id = v_org;
  DELETE FROM public.stays AS x WHERE x.organization_id = v_org;
  DELETE FROM public.trip_commitments AS x WHERE x.organization_id = v_org;
  DELETE FROM public.preferences AS x WHERE x.organization_id = v_org;
  DELETE FROM public.trips AS x WHERE x.organization_id = v_org;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.purge_organization_data(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.purge_organization_data(uuid) TO vadrouille_account_admin;
--> statement-breakpoint
RESET ROLE;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM vadrouille_fn_purge;
--> statement-breakpoint
REVOKE vadrouille_fn_purge FROM vadrouille_migrator GRANTED BY vadrouille_migrator;
