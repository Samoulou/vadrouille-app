-- 0010_usage_forfait — usage_ledger au forfait, organisation des actions sans compte, sommes globales en lecture
-- seule (spécification `specs/B7-couche-ia-recherche.md`, B7c points 1 à 3 ; propositions B7-TL-6, B7-TL-9, B7-TL-10 ;
-- décision 0081, B9-TL-4 ; réserve Sécurité de 0046 D13 point 7). Écrite à la main (`drizzle-kit generate --custom`).
-- Exécutée par `vadrouille_migrator` dans une transaction, après 0009_verifications_updated_at. Exige le rôle
-- `vadrouille_fn_usage`, créé par `db/bootstrap/roles.sql` : l'amorçage est réexécuté sur chaque base avant cette
-- migration (CI : job `db` ; base réelle : avant le lot qui la contient, 0056 § 3), sans quoi elle échoue.
-- Retour arrière : irréversible (voir `db/README.md`, « Retour arrière des migrations ») ; correction vers l'avant.
-- **Levée des deux gardes de P0r2** (0046 D13 point 7) : elle n'est fusionnée qu'avec le verdict de la Sécurité
-- (spécification B7, question 9 ; B7c point 2).
--
-- Identifiant fixe (0081 B9-TL-4 point 1), égal à `ORGANISATION_ACTIONS_SANS_COMPTE` (`src/server/usage/reservation.ts`,
-- test) : organisation des actions sans compte  5e1f0000-0000-4000-8000-000000000003
--
-- Aucune ligne n'est lue, modifiée ni supprimée. La contrainte du point 3 vérifie les lignes existantes : la base
-- réelle n'en a aucune (aucun code de `main` n'écrit `usage_ledger` ; le prototype n'y a aucun droit, 0046 D13 point 7) ;
-- si une ligne non conforme existait, la migration échouerait sans rien changer.
--
-- Plan :
--   1. organisation des actions sans compte (politique temporaire migration_0010), sans membre ni utilisateur ;
--   2. protection S3 étendue à cette organisation (ni suppression, ni modification) et adhésion refusée pour elle ;
--   3. gardes de P0r2 remplacées : toute ligne est une ligne de forfait (`step` = 'forfait', fournisseur `modeles` ou
--      `google`, unités et coût positifs ou nuls, unités nulles pour les modèles) ; au plus une ligne par méthode et
--      par génération (index unique partiel) ;
--   4. lecture des sommes par `vadrouille_fn_usage` : colonnes nécessaires seulement, politique en lecture seule ;
--   5. fonction `public.usage_forfait_totals()` (SECURITY DEFINER, propriétaire `vadrouille_fn_usage`, EXECUTE à
--      `vadrouille_app` seul) : sommes globales et somme du jour de la seule organisation du contexte ;
--   6. fin de l'appartenance temporaire de `vadrouille_migrator` (même forme que 0008_positions_mvp_29_jours).

SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint

-- 1. Organisation des actions sans compte (0081 B9-TL-4 points 1 et 2). vadrouille_owner ne lit ni n'écrit aucune ligne
-- (RLS forcée) : politique temporaire nommée migration_0010, limitée à l'identifiant fixe, retirée dans cette même
-- migration (règle de 0007, ligne vadrouille_migrator ; même forme que 0003_prototype). `kind` personal (le CHECK
-- n'admet que personal et agency) ; aucune ligne users, memberships, accounts ni sessions : aucune donnée personnelle.
CREATE POLICY migration_0010 ON public.organizations FOR INSERT TO vadrouille_owner
  WITH CHECK (id = '5e1f0000-0000-4000-8000-000000000003'::uuid);
--> statement-breakpoint
INSERT INTO public.organizations (id, name, slug, kind)
  VALUES ('5e1f0000-0000-4000-8000-000000000003', 'Actions sans compte (organisation technique)', 'actions-sans-compte', 'personal');
--> statement-breakpoint
DROP POLICY migration_0010 ON public.organizations;
--> statement-breakpoint

-- 2. Protection (0081 B9-TL-4 point 2 ; clause S3 de 0046) : la fonction du déclencheur S3 de 0003_prototype, qui code
-- l'uuid d'org_prototype en dur, couvre aussi l'organisation des actions sans compte (ni suppression ni modification,
-- par aucun rôle) ; une adhésion à cette organisation est refusée à l'insertion (aucun membre : withOrg et
-- getServerRequestContext() ne peuvent jamais la rendre). Corps de 0003 inchangé hors de ces deux ajouts.
CREATE OR REPLACE FUNCTION public.protect_prototype_identities() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF TG_TABLE_NAME = 'memberships' AND NEW.organization_id = '5e1f0000-0000-4000-8000-000000000003'::uuid THEN
      RAISE EXCEPTION 'organisation des actions sans compte : adhésion refusée (décision 0081, B9-TL-4)' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'users' THEN
    IF OLD.id = '5e1f0000-0000-4000-8000-000000000002'::uuid THEN
      RAISE EXCEPTION 'utilisateur technique du prototype : % refusé (décision 0046, S3)', TG_OP USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF TG_TABLE_NAME = 'organizations' THEN
    IF OLD.id = '5e1f0000-0000-4000-8000-000000000001'::uuid THEN
      RAISE EXCEPTION 'org_prototype : % refusé (décision 0046, S3)', TG_OP USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF OLD.id = '5e1f0000-0000-4000-8000-000000000003'::uuid THEN
      RAISE EXCEPTION 'organisation des actions sans compte : % refusé (décision 0081, B9-TL-4)', TG_OP USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF TG_TABLE_NAME = 'memberships' THEN
    IF OLD.organization_id = '5e1f0000-0000-4000-8000-000000000001'::uuid
       OR OLD.user_id = '5e1f0000-0000-4000-8000-000000000002'::uuid THEN
      RAISE EXCEPTION 'adhésion du prototype : % refusé (décision 0046, S3)', TG_OP USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER memberships_refuse_actions_sans_compte BEFORE INSERT ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.protect_prototype_identities();
--> statement-breakpoint

-- 3. Gardes de P0r2 remplacées (0046 D13 point 7 ; B7-TL-9, B7c point 2) : la seule correspondance avec usage_ledger
-- est le forfait. Toute ligne a `step` = 'forfait' ; un fournisseur `modeles` (identité, 0049) n'a jamais d'unités
-- (son plafond est un coût). Une génération n'a qu'une ligne par méthode (fournisseur et SKU) : une écriture par appel
-- ou par lot de notation pour une génération échoue sur l'index unique.
ALTER TABLE public.usage_ledger DROP CONSTRAINT usage_ledger_no_google_call_check;
--> statement-breakpoint
ALTER TABLE public.usage_ledger DROP CONSTRAINT usage_ledger_no_scoring_batch_check;
--> statement-breakpoint
ALTER TABLE public.usage_ledger ADD CONSTRAINT usage_ledger_forfait_only_check CHECK (
  step = 'forfait' AND provider IN ('modeles', 'google') AND units >= 0 AND cost_estimate_micros >= 0
  AND (provider <> 'modeles' OR units = 0));
--> statement-breakpoint
CREATE UNIQUE INDEX usage_ledger_forfait_line_idx ON public.usage_ledger (organization_id, generation_run_id, provider, sku)
  WHERE generation_run_id IS NOT NULL;
--> statement-breakpoint

-- 4. Lecture des sommes globales (spécification B7, « Consommation et plafonds » point 2 : le quota du jour Google, le
-- mois et l'enveloppe sont des sommes globales, alors que withOrg ne laisse lire que l'organisation de la génération) :
-- vadrouille_fn_usage lit les colonnes nécessaires seulement (ni trip_id, ni generation_run_id, ni id), toutes
-- organisations, et n'écrit rien. Seule sa fonction (point 5) le prend.
GRANT SELECT (organization_id, step, provider, sku, units, cost_estimate_micros, created_at) ON public.usage_ledger TO vadrouille_fn_usage;
--> statement-breakpoint
CREATE POLICY usage_ledger_fn_usage ON public.usage_ledger FOR SELECT TO vadrouille_fn_usage USING (true);
--> statement-breakpoint

-- 5. Fonction des sommes, créée sous son propriétaire. vadrouille_migrator prend vadrouille_fn_usage le temps de la
-- migration (option ADMIN de l'amorçage ; appartenance retirée au point 6) ; CREATE sur public, le temps de la création.
RESET ROLE;
--> statement-breakpoint
GRANT vadrouille_fn_usage TO vadrouille_migrator WITH INHERIT FALSE, SET TRUE;
--> statement-breakpoint
GRANT CREATE ON SCHEMA public TO vadrouille_fn_usage;
--> statement-breakpoint
SET LOCAL ROLE vadrouille_fn_usage;
--> statement-breakpoint
-- Sommes des lignes de forfait, une seule ligne de résultat : coût du jour (UTC) de la seule organisation du contexte
-- (plafond par organisation et par jour) ; requêtes Text Search et fiches du jour de quota Google (minuit heure du
-- Pacifique, 0046 D20, comme prototype.quota_day_at) ; coût Google du mois du Pacifique et des modèles du mois UTC ;
-- enveloppes, sans période (Q329). Aucune ligne, aucun identifiant ni aucune somme d'une autre organisation n'est rendu.
-- Refusée sans organisation dans le contexte.
CREATE FUNCTION public.usage_forfait_totals()
  RETURNS TABLE (org_jour_micros bigint, jour_text_search bigint, jour_place_details bigint, mois_google_micros bigint,
    enveloppe_google_micros bigint, mois_modeles_micros bigint, enveloppe_modeles_micros bigint)
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_org uuid := public.app_current_org();
  v_maintenant timestamp with time zone := pg_catalog.now();
  v_jour_utc date := (v_maintenant AT TIME ZONE 'UTC')::date;
  v_jour_pacifique date := (v_maintenant AT TIME ZONE 'America/Los_Angeles')::date;
  v_mois_pacifique timestamp := pg_catalog.date_trunc('month', v_maintenant AT TIME ZONE 'America/Los_Angeles');
  v_mois_utc timestamp := pg_catalog.date_trunc('month', v_maintenant AT TIME ZONE 'UTC');
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'sommes de consommation refusées : aucune organisation dans le contexte' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  SELECT
    COALESCE(SUM(u.cost_estimate_micros) FILTER (WHERE u.organization_id = v_org AND (u.created_at AT TIME ZONE 'UTC')::date = v_jour_utc), 0)::bigint,
    COALESCE(SUM(u.units) FILTER (WHERE u.provider = 'google' AND pg_catalog.starts_with(u.sku, 'places_text_search_')
      AND (u.created_at AT TIME ZONE 'America/Los_Angeles')::date = v_jour_pacifique), 0)::bigint,
    COALESCE(SUM(u.units) FILTER (WHERE u.provider = 'google' AND pg_catalog.starts_with(u.sku, 'places_details_')
      AND (u.created_at AT TIME ZONE 'America/Los_Angeles')::date = v_jour_pacifique), 0)::bigint,
    COALESCE(SUM(u.cost_estimate_micros) FILTER (WHERE u.provider = 'google'
      AND (u.created_at AT TIME ZONE 'America/Los_Angeles') >= v_mois_pacifique
      AND (u.created_at AT TIME ZONE 'America/Los_Angeles') < v_mois_pacifique + interval '1 month'), 0)::bigint,
    COALESCE(SUM(u.cost_estimate_micros) FILTER (WHERE u.provider = 'google'), 0)::bigint,
    COALESCE(SUM(u.cost_estimate_micros) FILTER (WHERE u.provider = 'modeles'
      AND (u.created_at AT TIME ZONE 'UTC') >= v_mois_utc AND (u.created_at AT TIME ZONE 'UTC') < v_mois_utc + interval '1 month'), 0)::bigint,
    COALESCE(SUM(u.cost_estimate_micros) FILTER (WHERE u.provider = 'modeles'), 0)::bigint
  FROM public.usage_ledger AS u
  WHERE u.step = 'forfait';
END
$$;
--> statement-breakpoint
-- Droits d'exécution (0007, règle commune 3) : vadrouille_app seul, PUBLIC exclu.
REVOKE ALL ON FUNCTION public.usage_forfait_totals() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.usage_forfait_totals() TO vadrouille_app;
--> statement-breakpoint

-- 6. Fin de l'appartenance temporaire (même forme que 0008_positions_mvp_29_jours, section 4).
RESET ROLE;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM vadrouille_fn_usage;
--> statement-breakpoint
REVOKE vadrouille_fn_usage FROM vadrouille_migrator GRANTED BY vadrouille_migrator;
