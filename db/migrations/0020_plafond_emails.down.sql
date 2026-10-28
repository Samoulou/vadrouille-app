-- Migration inverse de 0020_plafond_emails (décision 0138 § 11, T1). Règle du rôle `data` : **aucune suppression de
-- données**. Elle retire les droits et la politique de `vadrouille_mail_counter` ; la table `email_daily_counts` et ses
-- lignes (compteurs du jour, aucune donnée d'une personne ni d'une organisation) restent, RLS activée et forcée, sans
-- aucun accès applicatif. Sans ces droits, la réservation échoue fermée (`42501` → `unavailable`, `provider_error`,
-- aucun envoi par Resend) ; le code d'avant 0020 ne nomme pas la table. Le rôle `vadrouille_mail_counter` reste (créé
-- par `db/bootstrap/roles.sql`, jamais par une migration). Comme pour 0013 à 0015 et 0019, **0020 ne se rejoue pas**
-- après cette descente (son `CREATE TABLE` échouerait) : un retour passe par une migration corrective vers l'avant.
SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint
REVOKE UPDATE (connexion, notification) ON public.email_daily_counts FROM vadrouille_mail_counter;
--> statement-breakpoint
REVOKE SELECT, INSERT, DELETE ON public.email_daily_counts FROM vadrouille_mail_counter;
--> statement-breakpoint
DROP POLICY email_daily_counts_mail_counter ON public.email_daily_counts;
--> statement-breakpoint
RESET ROLE;
