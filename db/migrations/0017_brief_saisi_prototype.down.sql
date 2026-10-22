-- Migration inverse de 0017_brief_saisi_prototype (spécification `specs/E2E-essai-bout-en-bout.md`, lot 3 ; décision
-- 0125 § 1). Règle du rôle `data` : **aucune suppression de données**. Elle rétablit donc seulement la contrainte de nom
-- de fichier de `prototype.runs` de 0003_prototype, en `NOT VALID` : les exécutions `saisi` déjà écrites ne sont ni
-- lues, ni modifiées, ni supprimées (le registre des exécutions est gardé jusqu'à la fin de la phase 0) ; toute nouvelle
-- exécution est contrôlée sur le nom de fichier, et un lancement depuis l'app est refusé par la base (`23514`) dans la
-- transaction de réservation, sans rien écrire.
--
-- `prototype.run_briefs`, ses droits, ses politiques, ses déclencheurs (dont la contrainte différée de `prototype.runs`,
-- qui ne vise que les exécutions `saisi`, désormais refusées) et la purge de 0017 qui la vide **restent** : la version du
-- code d'avant 0017 ne nomme pas la table ; ses lignes expirent avec le programme de leur exécution (29 jours) et sont
-- purgées. Supprimer la table supprimerait des lignes, et rétablir la purge de 0013 sans la supprimer laisserait des
-- briefs expirés sans purge. Supprimer la table demanderait une exception écrite à la règle du rôle `data`, comme 0092
-- l'a fait pour `prototype.trajets`.
-- À jouer hors de toute exécution `saisi` en cours (elle continuerait, son brief restant lisible jusqu'à son expiration).
SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint
ALTER TABLE prototype.runs DROP CONSTRAINT runs_brief_check;
--> statement-breakpoint
ALTER TABLE prototype.runs ADD CONSTRAINT runs_brief_check CHECK (brief ~ '^[a-z0-9][a-z0-9-]{0,62}\.json$') NOT VALID;
--> statement-breakpoint
RESET ROLE;
