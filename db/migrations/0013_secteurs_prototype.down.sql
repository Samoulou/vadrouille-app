-- Migration inverse de 0013_secteurs_prototype (décision 0094 § 1 point 5 ; verdict de la Sécurité 0103, question 1,
-- condition 9). Règle du rôle `data` : **aucune suppression de données**. Elle rétablit donc seulement la contrainte de
-- clés de `run_candidates` de 0003_prototype (dix clés), en `NOT VALID` : les lignes déjà écrites avec les clés du candidat
-- enrichi ne sont ni lues, ni modifiées, ni supprimées (elles expirent d'elles-mêmes en 24 h et sont purgées) ; toute
-- nouvelle ligne est contrôlée sur les dix clés.
--
-- `prototype.run_secteurs`, ses droits, ses politiques, son déclencheur et la purge de 0013 qui la vide **restent** : la
-- version du code d'avant 0013 ne nomme pas la table (elle reste vide, puis purgée) ; la supprimer supprimerait des
-- lignes, et rétablir la purge de 0011 sans la supprimer laisserait des lignes expirées sans purge (0103, question 1,
-- condition 6). Supprimer la table demanderait une exception écrite à la règle du rôle `data`, comme 0092 l'a fait pour
-- `prototype.trajets` (question listée dans la PR de Q-L2a).
-- À jouer hors de toute exécution `p0Run` : une exécution en cours de la nouvelle version, qui écrirait les clés du
-- candidat enrichi, serait refusée (`23514`) jusqu'au retour de l'ancienne version du code.
SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint
ALTER TABLE prototype.run_candidates DROP CONSTRAINT run_candidates_candidat_check;
--> statement-breakpoint
ALTER TABLE prototype.run_candidates ADD CONSTRAINT run_candidates_candidat_check CHECK (pg_catalog.jsonb_typeof(candidat) = 'object'
  AND (candidat OPERATOR(pg_catalog.-) ARRAY['id', 'nom', 'resume', 'categorie', 'typeEtape', 'source', 'evenement',
    'aReserver', 'prixParPersonne', 'dureeMinutes']) = '{}'::jsonb) NOT VALID;
--> statement-breakpoint
RESET ROLE;
