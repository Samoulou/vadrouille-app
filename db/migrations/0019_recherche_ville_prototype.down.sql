-- Migration inverse de 0019_recherche_ville_prototype (décision 0129 § 3). Règle du rôle `data` : **aucune suppression de
-- données**. Elle retire l'écriture des deux colonnes à `vadrouille_prototype`, l'index partiel et la contrainte propre à
-- `ville`, puis rétablit les contraintes de nature et de coût des modèles de 0003_prototype en `NOT VALID` : les lignes
-- `ville` déjà écrites ne sont ni lues, ni modifiées, ni supprimées (gardées pour information, comme tout forfait) ; toute
-- nouvelle ligne `ville` est refusée (`42501`, puis `23514`), la recherche de ville rend « indisponible » sans appel
-- Google. Les colonnes `autocomplete_requests` et `acces_empreinte` restent : le code d'avant 0019 ne les nomme pas. Les
-- supprimer demanderait une exception écrite à la règle du rôle `data`. Comme pour 0013 à 0015, **0019 ne se rejoue pas**
-- après cette descente (son `ADD COLUMN` échouerait) : un retour passe par une migration corrective vers l'avant.
SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint
REVOKE INSERT (autocomplete_requests, acces_empreinte) ON prototype.forfaits FROM vadrouille_prototype;
--> statement-breakpoint
DROP INDEX prototype.forfaits_ville_jour_idx;
--> statement-breakpoint
ALTER TABLE prototype.forfaits DROP CONSTRAINT forfaits_ville_check;
--> statement-breakpoint
ALTER TABLE prototype.forfaits DROP CONSTRAINT forfaits_models_check;
--> statement-breakpoint
ALTER TABLE prototype.forfaits ADD CONSTRAINT forfaits_models_check CHECK ((models_cost_micros IS NULL) = (nature = 'relecture')) NOT VALID;
--> statement-breakpoint
ALTER TABLE prototype.forfaits DROP CONSTRAINT forfaits_nature_check;
--> statement-breakpoint
ALTER TABLE prototype.forfaits ADD CONSTRAINT forfaits_nature_check CHECK (nature IN ('execution', 'relecture')) NOT VALID;
--> statement-breakpoint
RESET ROLE;
