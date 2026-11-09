-- 0027_rappels_relais — réclamation des relais de rappels en base (tâche R-D, ticket 1061 ; décision 0162 § 2, § 4 et
-- § 6.1 ; droits et politiques : propositions du Tech Lead, **verdict de la Sécurité attendu**, questions S-R1 à S-R6).
-- Générée par `pnpm db:generate --name rappels_relais` depuis `db/schema/business.ts` (table, clés, `CHECK`, contrainte
-- unique), puis complétée à la main (ordre des instructions, RLS, politiques, droits, purge). Exécutée par
-- `vadrouille_migrator` dans une transaction, après 0026_apres_voyage, seulement par le workflow `db-migrate` après
-- l'`owner-approved` de Samuel sur la ligne de MIGRATIONS_APPROUVEES (0035, 0056 § 3), ajoutée par une PR de workflow
-- à part.
-- Retour arrière : `0027_rappels_relais.down.sql` (partielle, voir `db/README.md`).
--
-- Migration **additive** : une table nouvelle, une contrainte unique sur `reminder_consents` (aucune ligne modifiée :
-- `id` y est déjà unique, la paire l'est donc aussi), la purge du compte recréée. Aucune ligne existante n'est lue,
-- modifiée ni supprimée ; aucun code de `src/` ne nomme encore `reminder_relays` (R-B sera le premier, 0162 § 6.2).
--
-- Plan :
--   1. contrainte unique `(organization_id, id)` de `reminder_consents` (0162 § 2 point 0), cible de la clé étrangère
--      composée du point 2 : placée **avant** elle (drizzle-kit la génère en dernier, la clé étrangère échouerait) ;
--   2. `reminder_relays` (0162 § 2) : l'insertion de la ligne `(organization_id, consent_id, relay_n)` est la
--      réclamation de la génération `relay_n` (clé primaire) ; `CHECK (relay_n >= 1)` ; `CHECK` de `claimed_run_id`,
--      borne lâche proposée (`^wrun_[0-9A-Za-z]{1,59}$`, 64 caractères au plus ; format exact : S-R5) ; `claimed_at`
--      posé par la base ; clés étrangères vers `organizations` et `reminder_consents (organization_id, id)`, toutes en
--      `ON DELETE NO ACTION` : les lignes partent par `purge_organization_data` (point 5) ;
--   3. RLS activée et forcée ; politiques de `vadrouille_app` (S-R2) bornées à l'organisation **et** à la personne de
--      la transaction par l'accord (`EXISTS` sur `reminder_consents`, lue sous la RLS de `vadrouille_app`), en lecture
--      comme en insertion, et à un accord non retiré à l'insertion ; politique de purge de `vadrouille_fn_purge`
--      (organisation de la transaction, modèle de 0024) ;
--   4. droits (S-R1) : `vadrouille_app` : `SELECT`, `INSERT (organization_id, consent_id, relay_n, claimed_run_id)` ;
--      ni `UPDATE`, ni `DELETE`, ni `TRUNCATE`, ni `claimed_at` à l'insertion. `vadrouille_fn_purge` :
--      `SELECT (organization_id)`, `DELETE`. Aucun déclencheur (S-R3) : sans droit `UPDATE` pour aucun rôle applicatif,
--      une ligne ne change pas (même régime que `reminder_sends`) ;
--   5. `purge_organization_data` recréée sous son propriétaire `vadrouille_fn_purge` (même forme que 0026, point 5) :
--      corps de 0026, dernière version sur `main`, avec les relais supprimés juste avant les réclamations et les accords
--      (S-R6 : ordre `reminder_relays` → `reminder_sends` → `reminder_consents`) ; appartenance temporaire de
--      `vadrouille_migrator` retirée.
--
-- Aucune adresse, aucun texte libre, aucune donnée Google : trois identifiants, un numéro et un instant.
-- Conservation (S-R4, Q27) : celle de l'accord, jusqu'à la purge du compte. Conséquence signalée (0162 § 2 point 4) : un
-- accord qui a un relais ne se supprime pas hors de la purge (`23503`), comme un voyage qui a un accord (0024).

SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint

-- 1. Cible de la clé étrangère composée (0162 § 2 point 0 ; modèle de `reminder_consents_trip_fk`, 0024).
ALTER TABLE "reminder_consents" ADD CONSTRAINT "reminder_consents_organization_id_id_key" UNIQUE("organization_id","id");
--> statement-breakpoint

-- 2. Réclamations des relais (0162 § 2) : une seconde insertion de la même génération échoue (`23505`), ou ne rend
-- aucune ligne avec `ON CONFLICT DO NOTHING`.
CREATE TABLE "reminder_relays" (
	"organization_id" uuid NOT NULL,
	"consent_id" uuid NOT NULL,
	"relay_n" smallint NOT NULL,
	"claimed_run_id" text NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_relays_pkey" PRIMARY KEY("organization_id","consent_id","relay_n"),
	CONSTRAINT "reminder_relays_relay_n_check" CHECK ("reminder_relays"."relay_n" >= 1),
	CONSTRAINT "reminder_relays_claimed_run_id_check" CHECK ("reminder_relays"."claimed_run_id" ~ '^wrun_[0-9A-Za-z]{1,59}$')
);
--> statement-breakpoint
ALTER TABLE "reminder_relays" ADD CONSTRAINT "reminder_relays_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Cible : la contrainte unique du point 1 ; un relais ne vise que l'accord de sa propre organisation.
ALTER TABLE "reminder_relays" ADD CONSTRAINT "reminder_relays_consent_fk" FOREIGN KEY ("organization_id","consent_id") REFERENCES "public"."reminder_consents"("organization_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

-- 3. RLS (0001_securite, 5.1 ; proposition de 0162 § 2 point 6, S-R2). Par personne dès la création : l'accord visé
-- est celui de la personne de la transaction ; on ne réclame pas le relais d'un accord retiré.
ALTER TABLE public.reminder_relays ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.reminder_relays FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY reminder_relays_app_select ON public.reminder_relays AS PERMISSIVE FOR SELECT TO vadrouille_app
  USING (organization_id = public.app_current_org() AND EXISTS (
    SELECT 1 FROM public.reminder_consents AS c
    WHERE c.organization_id = reminder_relays.organization_id AND c.id = reminder_relays.consent_id
      AND c.user_id = public.app_current_user()));
--> statement-breakpoint
CREATE POLICY reminder_relays_app_insert ON public.reminder_relays AS PERMISSIVE FOR INSERT TO vadrouille_app
  WITH CHECK (organization_id = public.app_current_org() AND EXISTS (
    SELECT 1 FROM public.reminder_consents AS c
    WHERE c.organization_id = reminder_relays.organization_id AND c.id = reminder_relays.consent_id
      AND c.user_id = public.app_current_user() AND c.withdrawn_at IS NULL));
--> statement-breakpoint
CREATE POLICY reminder_relays_fn_purge ON public.reminder_relays AS PERMISSIVE FOR ALL TO vadrouille_fn_purge
  USING (organization_id = public.app_current_org()) WITH CHECK (organization_id = public.app_current_org());
--> statement-breakpoint

-- 4. Droits (proposition de 0162 § 2 point 5, S-R1). Une réclamation s'insère par ses quatre colonnes d'identité :
-- `claimed_at` vient de la base. Elle n'est jamais modifiée ; aucune suppression par l'application.
GRANT SELECT ON public.reminder_relays TO vadrouille_app;
--> statement-breakpoint
GRANT INSERT (organization_id, consent_id, relay_n, claimed_run_id) ON public.reminder_relays TO vadrouille_app;
--> statement-breakpoint
GRANT SELECT (organization_id), DELETE ON public.reminder_relays TO vadrouille_fn_purge;
--> statement-breakpoint

-- 5. Purge de compte (0001_securite, 6.3 ; 0162 § 2 point 8). Recréation sous le propriétaire (même forme que 0026,
-- point 5) ; corps identique à 0026 hors des relais, supprimés avant les accords qu'ils visent (clé `NO ACTION`).
-- Droits d'exécution réécrits.
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

  DELETE FROM public.stop_reviews AS x WHERE x.organization_id = v_org;
  DELETE FROM public.reminder_relays AS x WHERE x.organization_id = v_org;
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
