-- 0021_compteurs_autocompletion — compteurs quotidiens de la ville par autocomplétion sur la vraie app (plan du MVP,
-- tâche M1f-D, ticket 855 ; décisions 0129 § 3 et 0131, 0136 § 5 ; modèle : 0020_plafond_emails, décision 0138 § 11,
-- T1). Générée par `pnpm db:generate` depuis `db/schema/auth.ts`, puis complétée à la main (RLS, politique, droits).
-- Exécutée par `vadrouille_migrator` dans une transaction, après 0020_plafond_emails.
-- Retour arrière : `0021_compteurs_autocompletion.down.sql` (voir `db/README.md`).
--
-- Migration **additive** : une table nouvelle, aucune ligne existante lue, modifiée ni supprimée ; aucun code ne la
-- nomme encore (le code de la réservation est M1f). `prototype.forfaits` (0019) reste celui du site d'essai, inchangé.
--
-- Plan :
--   1. `autocomplete_daily_counts` : une ligne par jour (le jour est posé par la requête de M1f, à l'horloge de la base,
--      jamais par le navigateur ; le fuseau du jour est un choix de M1f, UTC recommandé comme 0020), une colonne entière
--      par action facturée, positive ou nulle : `suggestions` (Autocomplete (New), plafond de 0129 § 3 point 4 : 150) et
--      `choix` (fiche Essentials du choix : 40). Aucune saisie, aucune donnée Google (ni `placeId`, ni texte, ni
--      position), aucune empreinte de cookie, aucun identifiant de session, de personne ni d'organisation (exception à
--      `organization_id` : compteur global, comme `email_daily_counts`). Le débit par session de 0129 § 3 point 4 n'est
--      pas tenu ici (question au Tech Lead dans la PR : limiteur `action_rate_limits` existant recommandé) ;
--   2. RLS activée et forcée, une politique pour le seul rôle `vadrouille_autocomplete_counter` (modèle de
--      `email_daily_counts_mail_counter`, 0020) ;
--   3. droits de `vadrouille_autocomplete_counter` : `SELECT`, `INSERT (day)` (la ligne du jour, compteurs à leur défaut
--      0), `UPDATE (suggestions, choix)` (jamais `day`), `DELETE` (purge des jours échus, bornée par la requête de M1f).
--      Aucun `TRUNCATE`, aucun droit sur une autre table.
--
-- Prérequis : le rôle `vadrouille_autocomplete_counter` (sans connexion, pris par `vadrouille_app` par `SET LOCAL ROLE`)
-- est créé par `db/bootstrap/roles.sql`, rejoué par un propriétaire avant cette migration ; aucune migration ne crée de
-- rôle. Sans lui, cette migration échoue (`42704`) et rien n'est appliqué. Sur Neon, elle n'est appliquée qu'après
-- l'ajout de sa ligne à `MIGRATIONS_APPROUVEES` par la PR de workflow de M1i et l'`owner-approved` de Samuel.
SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint
CREATE TABLE "autocomplete_daily_counts" (
	"day" date PRIMARY KEY NOT NULL,
	"suggestions" integer DEFAULT 0 NOT NULL,
	"choix" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "autocomplete_daily_counts_counts_check" CHECK ("autocomplete_daily_counts"."suggestions" >= 0 AND "autocomplete_daily_counts"."choix" >= 0)
);
--> statement-breakpoint
ALTER TABLE public.autocomplete_daily_counts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.autocomplete_daily_counts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY autocomplete_daily_counts_counter ON public.autocomplete_daily_counts FOR ALL TO vadrouille_autocomplete_counter USING (true) WITH CHECK (true);
--> statement-breakpoint
GRANT SELECT, DELETE ON public.autocomplete_daily_counts TO vadrouille_autocomplete_counter;
--> statement-breakpoint
GRANT INSERT (day), UPDATE (suggestions, choix) ON public.autocomplete_daily_counts TO vadrouille_autocomplete_counter;
--> statement-breakpoint
RESET ROLE;
