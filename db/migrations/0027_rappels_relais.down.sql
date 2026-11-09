-- Migration inverse de 0027_rappels_relais (tâche R-D, ticket 1061 ; décision 0162 § 2 point 10). Règle du rôle
-- `data` : **aucune suppression de données**. Elle ferme donc seulement la lecture et la réclamation des relais par
-- `vadrouille_app` : droits `SELECT` et `INSERT (organization_id, consent_id, relay_n, claimed_run_id)` sur
-- `reminder_relays` retirés. Aucune ligne n'est lue, modifiée ni supprimée.
--
-- **Restent** (modèle de 0024_rappels.down.sql) : la table, ses lignes, sa clé primaire, ses clés étrangères et ses
-- `CHECK`, sa RLS, ses politiques, les droits de `vadrouille_fn_purge`, la contrainte unique `(organization_id, id)` de
-- `reminder_consents` (la clé étrangère des relais s'y appuie) et la purge de compte de 0027, qui vide les relais avant
-- les accords : la purge de 0026 échouerait sur la clé `NO ACTION` dès qu'un relais existe. Le code d'avant R-B ne nomme
-- pas la table : il fonctionne sur ce schéma.
--
-- **Ordre d'une descente** (0162 § 2 point 10) : le code de R-B d'abord retiré du déploiement (sinon chaque
-- réclamation échoue en `42501`, est comptée comme un essai de relais, et la chaîne se termine au 24e), puis cette
-- descente. Après elle, le texte de 0027 ne se rejoue pas tel quel (la contrainte et la table existent) : un retour
-- passe par une migration corrective vers l'avant qui rend les droits de `vadrouille_app`.
SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint
REVOKE INSERT (organization_id, consent_id, relay_n, claimed_run_id) ON public.reminder_relays FROM vadrouille_app;
--> statement-breakpoint
REVOKE SELECT ON public.reminder_relays FROM vadrouille_app;
--> statement-breakpoint
RESET ROLE;
