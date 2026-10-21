-- Migration inverse de 0014_tri_enregistre (décision 0112 § 3.7). Règle du rôle `data` : **aucune suppression de
-- données**. Elle ferme donc seulement les écritures du tri enregistré par `vadrouille_app` : droits sur `deck_closures`
-- et `preference_prompts` retirés, `UPDATE` des quatre colonnes d'annulation de `preference_signals` retiré. Aucune
-- ligne n'est lue, modifiée ni supprimée.
--
-- **Restent** : les deux tables, leurs lignes, leur RLS, leurs politiques et les droits de `vadrouille_fn_purge` ; les
-- colonnes, contraintes et index ajoutés à `preference_signals` et à `proposals` ; la purge de compte de 0014, qui vide
-- les deux tables avant les signaux et les signaux avant les propositions (la purge de 0012 échouerait sur les clés
-- étrangères de 0014 dès qu'une ligne existe). La version du code d'avant 0014 ne nomme ni les tables ni les colonnes
-- et n'écrit aucun signal : elle fonctionne sur ce schéma. Les supprimer demanderait une exception écrite à la règle du
-- rôle `data` (question de la PR).
--
-- Le `UPDATE` de table de `vadrouille_app` sur `preference_signals` (0001_securite) **n'est pas rétabli** : il rouvrirait
-- la réécriture d'un signal après son écriture (0112 § 3.1) ; aucune version du code ne l'utilise. Le rétablir demanderait
-- une décision écrite et le verdict de la Sécurité.
SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint
REVOKE SELECT, INSERT ON public.deck_closures FROM vadrouille_app;
--> statement-breakpoint
REVOKE UPDATE (state, answer_signal_id, updated_at) ON public.preference_prompts FROM vadrouille_app;
--> statement-breakpoint
REVOKE SELECT, INSERT ON public.preference_prompts FROM vadrouille_app;
--> statement-breakpoint
REVOKE UPDATE (status, previous_status, cancelled_at, cancel_request_id) ON public.preference_signals FROM vadrouille_app;
--> statement-breakpoint
RESET ROLE;
