-- Migration inverse de 0007_essais_sans_limite (décision 0071) : recrée l'index unique partiel de 0003_prototype
-- (section 4.1), à l'identique. Aucune ligne n'est supprimée : si un jour de quota compte déjà plus d'une exécution
-- `reel` ou `essai`, la création échoue (SQLSTATE 23505) et la transaction est annulée ; rétablir la règle exige alors
-- une décision de Samuel sur les lignes en double, jamais une suppression.
SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint
CREATE UNIQUE INDEX runs_one_per_quota_day_idx ON prototype.runs (organization_id, quota_day) WHERE mode IN ('reel', 'essai');
--> statement-breakpoint
RESET ROLE;
