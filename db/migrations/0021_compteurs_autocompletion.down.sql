-- Migration inverse de 0021_compteurs_autocompletion (plan du MVP, M1f-D). Règle du rôle `data` : **aucune suppression
-- de données**. Elle retire les droits et la politique de `vadrouille_autocomplete_counter` ; la table
-- `autocomplete_daily_counts` et ses lignes (compteurs du jour, aucune donnée d'une personne, d'une organisation ni de
-- Google) restent, RLS activée et forcée, sans aucun accès applicatif. Sans ces droits, la réservation de M1f échoue
-- fermée (`42501` → `usage_unavailable`, aucun appel Google, repli sur la table maison des villes) ; le code d'avant
-- 0021 ne nomme pas la table. Le rôle `vadrouille_autocomplete_counter` reste (créé par `db/bootstrap/roles.sql`,
-- jamais par une migration). Comme pour 0013 à 0015, 0019 et 0020, **0021 ne se rejoue pas** après cette descente (son
-- `CREATE TABLE` échouerait) : un retour passe par une migration corrective vers l'avant.
SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint
REVOKE INSERT (day), UPDATE (suggestions, choix) ON public.autocomplete_daily_counts FROM vadrouille_autocomplete_counter;
--> statement-breakpoint
REVOKE SELECT, DELETE ON public.autocomplete_daily_counts FROM vadrouille_autocomplete_counter;
--> statement-breakpoint
DROP POLICY autocomplete_daily_counts_counter ON public.autocomplete_daily_counts;
--> statement-breakpoint
RESET ROLE;
