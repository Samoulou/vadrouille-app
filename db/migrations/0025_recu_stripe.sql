-- 0025_recu_stripe — lien du reçu de Stripe conservé sur le paiement (plan du MVP, étape 3, B4e, ticket 887 ; décision
-- 0144 § 5, option B, et § 5.2, conditions de la Sécurité reprises mot pour mot). **Partie `data` de B4e** : la colonne
-- et ses gardes seulement ; l'écriture depuis le webhook Stripe et le rendu sur `R9-recu` suivent dans la tâche `back`
-- (0144 § 7). Générée par `pnpm db:generate` depuis `db/schema/business.ts` (colonne et `CHECK`), puis complétée à la
-- main (déclencheur, droit de colonne). Exécutée par `vadrouille_migrator` dans une transaction, après 0024_rappels,
-- seulement par le workflow `db-migrate` après l'`owner-approved` de Samuel sur la ligne de MIGRATIONS_APPROUVEES (0035,
-- 0056 § 3), ajoutée par une PR de workflow à part.
-- Retour arrière : `0025_recu_stripe.down.sql` (0144 § 5.3 point 1, « migration descendante étendue »).
--
-- Migration **additive** : une colonne nullable, une contrainte, une fonction de déclencheur et son déclencheur, un droit
-- de colonne. Aucune ligne existante n'est lue ni modifiée (la colonne naît `NULL` partout ; la `CHECK` est validée sur
-- des valeurs toutes nulles) ; aucun code de `src/` ne nomme encore la colonne (la tâche `back` de B4e sera la première).
--
-- Plan (0144 § 5.3 point 1) :
--   1. `checkouts.stripe_receipt_url text` (nullable) et `checkouts_stripe_receipt_url_check` : `NULL`, ou au plus 2048
--      caractères, conformes au motif de la Sécurité (inchangé, sensible à la casse : l'hôte en majuscules est refusé)
--      et sans `..` ni ses formes encodées (`%2e`, sans égard à la casse) ;
--   2. écriture unique et refus de l'insertion non nulle : déclencheur `checkouts_receipt_once`, `BEFORE INSERT OR
--      UPDATE OF stripe_receipt_url`, fonction ordinaire (`SECURITY INVOKER`) de `vadrouille_owner`, `search_path` fixé,
--      sur le modèle de `checkouts_session_once` (0001_securite, 3.2) ; il vaut pour tout rôle, propriétaire et
--      administration compris, et garde le mode ordinaire (ni `ENABLE ALWAYS` ni `REPLICA`, 0144 § 5.3 point 1) ;
--   3. droit de colonne : `UPDATE (stripe_receipt_url)` à `vadrouille_webhook`, seul droit de mise à jour de la colonne.
--      `vadrouille_app` garde `UPDATE (stripe_checkout_session_id)` seulement ; son `INSERT` de table (0001) couvre la
--      colonne, d'où le refus de l'insertion non nulle par le déclencheur (point 2). Aucun droit pour `vadrouille_fn_*`.
--
-- Inchangés : RLS et politiques de `checkouts` (0001 : `checkouts_app`, `checkouts_webhook`, bornées à l'organisation de
-- la transaction ; sans organisation positionnée, `vadrouille_webhook` ne voit ni ne met à jour aucune ligne) ; purge du
-- compte (`purge_organization_data` de 0024 supprime les lignes `checkouts` de l'organisation, donc la colonne).
-- Aucune donnée Google, aucun secret. Le lien n'est jamais écrit par cette migration.

SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint

-- 1. Colonne et contrainte (0144 § 5.2 et § 5.3 point 1).
ALTER TABLE "checkouts" ADD COLUMN "stripe_receipt_url" text;
--> statement-breakpoint
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_stripe_receipt_url_check" CHECK ("checkouts"."stripe_receipt_url" IS NULL OR (length("checkouts"."stripe_receipt_url") <= 2048 AND "checkouts"."stripe_receipt_url" ~ '^https://pay\.stripe\.com/receipts/[A-Za-z0-9_%./~-]+(\?[A-Za-z0-9_%=&.~-]*)?$' AND "checkouts"."stripe_receipt_url" !~* '(\.|%2e)(\.|%2e)'));
--> statement-breakpoint

-- 2. Écriture unique, jamais à l'insertion (0144 § 5.3 point 1). Messages sans la valeur reçue.
-- Fonction ordinaire (ni `SECURITY DEFINER` ni droit nouveau) : aucun droit d'exécution n'est nécessaire au
-- déclenchement, et les droits par défaut de 0000 retirent celui de `PUBLIC`.
CREATE FUNCTION public.checkouts_receipt_once() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.stripe_receipt_url IS NOT NULL THEN
      RAISE EXCEPTION 'checkouts : stripe_receipt_url refusé à l''insertion' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF OLD.stripe_receipt_url IS NOT NULL
     AND NEW.stripe_receipt_url IS DISTINCT FROM OLD.stripe_receipt_url THEN
    RAISE EXCEPTION 'checkouts : stripe_receipt_url déjà écrit' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER checkouts_receipt_once BEFORE INSERT OR UPDATE OF stripe_receipt_url ON public.checkouts
  FOR EACH ROW EXECUTE FUNCTION public.checkouts_receipt_once();
--> statement-breakpoint

-- 3. Seul droit de mise à jour de la colonne (0144 § 5.2 : « GRANT UPDATE limité à vadrouille_webhook »).
GRANT UPDATE (stripe_receipt_url) ON public.checkouts TO vadrouille_webhook;
--> statement-breakpoint
RESET ROLE;
