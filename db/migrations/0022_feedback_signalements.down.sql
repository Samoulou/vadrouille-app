-- Migration inverse de 0022_feedback_signalements (plan du MVP, M5-D ; décision 0147 § 2 et § 6.4 point 3). Règle du
-- rôle `data` : **aucune suppression de données**. Droits seulement : elle retire l'`UPDATE (lieux)` accordé par 0022 au
-- rôle `vadrouille_autocomplete_counter`, qui retrouve exactement ses droits de 0021. Aucune ligne n'est lue, modifiée
-- ni supprimée.
--
-- **Restent** : les colonnes `feedback.request_id` et `autocomplete_daily_counts.lieux` (les retirer supprimerait des
-- données), les deux index uniques partiels et les quatre `CHECK`. La version du code d'avant 0022 ne lit ni n'écrit
-- `feedback` et n'écrit d'`autocomplete_daily_counts` que `day`, `suggestions` et `choix` : elle fonctionne sur ce
-- schéma (la colonne `lieux` reste à son défaut 0). Sans `UPDATE (lieux)`, la réservation `lieux` de M5d-1 échoue fermée
-- (`42501`, aucun appel Google).
--
-- L'`UPDATE` de table de `vadrouille_app` sur `feedback` (0001_securite) **n'est pas rétabli** : il rouvrirait la
-- modification d'un signalement (0147 § 2 point 4, approuvé par la Sécurité, § 15), et aucune version du code ne
-- l'utilise. Le rétablir demanderait une décision écrite et le verdict de la Sécurité. Comme pour 0014 à 0021, **0022 ne
-- se rejoue pas** après cette descente (ses `ADD COLUMN` échoueraient) : un retour passe par une migration corrective
-- vers l'avant.
SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint
REVOKE UPDATE (lieux) ON public.autocomplete_daily_counts FROM vadrouille_autocomplete_counter;
--> statement-breakpoint
RESET ROLE;
