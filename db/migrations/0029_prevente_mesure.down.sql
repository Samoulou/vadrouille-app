-- Migration inverse de 0029_prevente_mesure (spécification `specs/C2-prevente-mesure.md`, § 4 ; tâche C2a, ticket 1117).
-- Règle du rôle `data` : **aucune suppression de données**. Descente **partielle** : elle retire tout ce que 0029 ajoute
-- hors des données (les cinq fonctions, le domaine `prevente_code`, les politiques et les droits des deux rôles
-- propriétaires de fonctions) ; les tables `prevente_visites`, `prevente_reponses_jour` et `prevente_reponses` et leurs
-- lignes restent, RLS activée et forcée, sans aucune politique ni aucun droit : plus aucun rôle ne les lit ni ne les
-- écrit. Sans les fonctions, le compteur de visites et l'envoi du questionnaire échouent fermés (`42883`) : la page de
-- prévente s'affiche comme sans base (spécification § 6.2), le questionnaire répond par son message d'échec.
-- Les rôles `vadrouille_fn_prevente`, `vadrouille_fn_prevente_releve` et `vadrouille_prevente_releve` restent (créés par
-- `db/bootstrap/roles.sql`, jamais par une migration). Comme pour 0020 et 0021, **0029 ne se rejoue pas** après cette
-- descente (son `CREATE TABLE` échouerait) : un retour passe par une migration corrective vers l'avant.
-- Jouée par `vadrouille_migrator`, dans une transaction, avant la descente de toute migration antérieure.

-- 1. Fonctions de relevé, retirées sous leur propriétaire (même cadre que la montée).
GRANT vadrouille_fn_prevente_releve TO vadrouille_migrator WITH INHERIT FALSE, SET TRUE;
--> statement-breakpoint
SET LOCAL ROLE vadrouille_fn_prevente_releve;
--> statement-breakpoint
DROP FUNCTION public.prevente_releve_destinations();
--> statement-breakpoint
DROP FUNCTION public.prevente_releve_reponses();
--> statement-breakpoint
DROP FUNCTION public.prevente_releve_visites();
--> statement-breakpoint
RESET ROLE;
--> statement-breakpoint
REVOKE vadrouille_fn_prevente_releve FROM vadrouille_migrator GRANTED BY vadrouille_migrator;
--> statement-breakpoint

-- 2. Fonctions d'écriture, retirées sous leur propriétaire.
GRANT vadrouille_fn_prevente TO vadrouille_migrator WITH INHERIT FALSE, SET TRUE;
--> statement-breakpoint
SET LOCAL ROLE vadrouille_fn_prevente;
--> statement-breakpoint
DROP FUNCTION public.prevente_enregistrer_reponse(text, text, text, text, text[], text[], text, integer);
--> statement-breakpoint
DROP FUNCTION public.prevente_compter_visite(text);
--> statement-breakpoint
RESET ROLE;
--> statement-breakpoint
REVOKE vadrouille_fn_prevente FROM vadrouille_migrator GRANTED BY vadrouille_migrator;
--> statement-breakpoint

-- 3. Domaine (plus aucune fonction ne le rend), droits et politiques. Les tables et leurs lignes restent.
SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint
DROP DOMAIN public.prevente_code;
--> statement-breakpoint
REVOKE SELECT (src, parcours, destination, periode, preparation, motifs, decouverte) ON public.prevente_reponses FROM vadrouille_fn_prevente_releve;
--> statement-breakpoint
REVOKE SELECT ON public.prevente_visites FROM vadrouille_fn_prevente_releve;
--> statement-breakpoint
REVOKE INSERT ON public.prevente_reponses FROM vadrouille_fn_prevente;
--> statement-breakpoint
REVOKE UPDATE (reponses) ON public.prevente_reponses_jour FROM vadrouille_fn_prevente;
--> statement-breakpoint
REVOKE SELECT, INSERT ON public.prevente_reponses_jour FROM vadrouille_fn_prevente;
--> statement-breakpoint
REVOKE UPDATE (visites) ON public.prevente_visites FROM vadrouille_fn_prevente;
--> statement-breakpoint
REVOKE SELECT, INSERT ON public.prevente_visites FROM vadrouille_fn_prevente;
--> statement-breakpoint
DROP POLICY prevente_reponses_fn_prevente_releve ON public.prevente_reponses;
--> statement-breakpoint
DROP POLICY prevente_visites_fn_prevente_releve ON public.prevente_visites;
--> statement-breakpoint
DROP POLICY prevente_reponses_fn_prevente_insert ON public.prevente_reponses;
--> statement-breakpoint
DROP POLICY prevente_reponses_jour_fn_prevente_update ON public.prevente_reponses_jour;
--> statement-breakpoint
DROP POLICY prevente_reponses_jour_fn_prevente_insert ON public.prevente_reponses_jour;
--> statement-breakpoint
DROP POLICY prevente_reponses_jour_fn_prevente_select ON public.prevente_reponses_jour;
--> statement-breakpoint
DROP POLICY prevente_visites_fn_prevente_update ON public.prevente_visites;
--> statement-breakpoint
DROP POLICY prevente_visites_fn_prevente_insert ON public.prevente_visites;
--> statement-breakpoint
DROP POLICY prevente_visites_fn_prevente_select ON public.prevente_visites;
--> statement-breakpoint
RESET ROLE;
