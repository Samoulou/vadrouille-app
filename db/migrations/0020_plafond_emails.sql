-- 0020_plafond_emails — plafond global quotidien des envois d'e-mails (spécification `specs/B3d-envoi-reel-resend.md`,
-- point 3 ; décision 0138 § 11, T1, confirmé par le Tech Lead dans la revue consolidée de #840). Générée par
-- `pnpm db:generate` depuis `db/schema/auth.ts`, puis complétée à la main (RLS, politique, droits). Exécutée par
-- `vadrouille_migrator` dans une transaction, après 0019_recherche_ville_prototype.
-- Retour arrière : `0020_plafond_emails.down.sql` (voir `db/README.md`).
--
-- Migration **additive** : une table nouvelle, aucune ligne existante lue, modifiée ni supprimée ; la version précédente
-- du code ne la nomme pas.
--
-- Plan :
--   1. `email_daily_counts` : une ligne par jour civil UTC posé par la base (`(now() AT TIME ZONE 'UTC')::date`), une
--      colonne entière par usage (`connexion`, `notification`), positive ou nulle ; aucune adresse, aucun hachage, aucun
--      identifiant d'organisation (exception à `organization_id` : compteur global) ;
--   2. RLS activée et forcée, une politique pour le seul rôle `vadrouille_mail_counter` (modèle de
--      `action_rate_limits_limiter`, 0001_securite) ;
--   3. droits de `vadrouille_mail_counter` : `SELECT`, `INSERT (day)` (la ligne du jour, compteurs à leur défaut 0 ;
--      revue de la PR 850, réponse 2), `UPDATE (connexion, notification)` (jamais `day`), `DELETE` (purge des jours de plus
--      de 7 jours, bornée par la requête de `src/server/mail/plafond.ts`).
--
-- Prérequis : le rôle `vadrouille_mail_counter` (sans connexion, pris par `vadrouille_app` par `SET LOCAL ROLE`) est créé
-- par `db/bootstrap/roles.sql`, rejoué par un propriétaire avant cette migration (0138 § 11 et § 13, action S1) ; aucune
-- migration ne crée de rôle. Sans lui, cette migration échoue (`42704`) et rien n'est appliqué.
SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint
CREATE TABLE "email_daily_counts" (
	"day" date PRIMARY KEY NOT NULL,
	"connexion" integer DEFAULT 0 NOT NULL,
	"notification" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "email_daily_counts_counts_check" CHECK ("email_daily_counts"."connexion" >= 0 AND "email_daily_counts"."notification" >= 0)
);
--> statement-breakpoint
ALTER TABLE public.email_daily_counts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.email_daily_counts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY email_daily_counts_mail_counter ON public.email_daily_counts FOR ALL TO vadrouille_mail_counter USING (true) WITH CHECK (true);
--> statement-breakpoint
GRANT SELECT, DELETE ON public.email_daily_counts TO vadrouille_mail_counter;
--> statement-breakpoint
GRANT INSERT (day), UPDATE (connexion, notification) ON public.email_daily_counts TO vadrouille_mail_counter;
--> statement-breakpoint
RESET ROLE;
