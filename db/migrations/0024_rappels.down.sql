-- Migration inverse de 0024_rappels (plan du MVP, M6c-D, ticket 1014 ; décision 0157 § 1.8). Règle du rôle `data` :
-- **aucune suppression de données**. Elle ferme donc seulement les écritures et les lectures des rappels par
-- `vadrouille_app` : droits sur `reminder_consents` (`SELECT, INSERT`, `UPDATE (withdrawn_at)`) et sur `reminder_sends`
-- (`SELECT, INSERT`) retirés. Aucune ligne n'est lue, modifiée ni supprimée.
--
-- **Restent** (modèle de 0014_tri_enregistre.down.sql) : les deux tables, leurs lignes (accords et retraits datés,
-- preuve de l'accord, 0157 § 1.8), leurs clés, `CHECK` et index, leur RLS, leurs politiques, les droits de
-- `vadrouille_fn_purge`, le déclencheur `reminder_consents_withdraw_once` et sa fonction, et la purge de compte de 0024,
-- qui vide réclamations et accords avant `trips` : la purge de 0015 échouerait sur les clés étrangères `NO ACTION` de
-- 0024 dès qu'une ligne existe. La version du code d'avant M6c ne nomme pas ces tables : elle fonctionne sur ce schéma.
-- Supprimer les tables demanderait une exception écrite à la règle du rôle `data` (question de la PR).
--
-- Après cette descente, le texte de 0024 ne se rejoue pas tel quel (les tables existent) : un retour passe par une
-- migration corrective vers l'avant qui rend les droits de `vadrouille_app`.
SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint
REVOKE UPDATE (withdrawn_at) ON public.reminder_consents FROM vadrouille_app;
--> statement-breakpoint
REVOKE SELECT, INSERT ON public.reminder_consents FROM vadrouille_app;
--> statement-breakpoint
REVOKE SELECT, INSERT ON public.reminder_sends FROM vadrouille_app;
--> statement-breakpoint
RESET ROLE;
