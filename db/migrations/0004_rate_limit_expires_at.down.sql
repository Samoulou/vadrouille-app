-- Migration inverse de 0004_rate_limit_expires_at (décision 0050, amendement de 0007, point 2 ; 0051, point 6.3).
-- Exception nommée à la règle « aucune migration inverse ne supprime une colonne porteuse de données » (`db/README.md`,
-- § 2) : `expires_at` ne porte qu'une échéance technique, recalculable (au pire `window_start` + 1 jour), sans donnée
-- d'une personne ni d'une organisation. Les lignes restent : ni `DELETE`, ni `TRUNCATE`, ni changement de `key`,
-- `window_start` ou `count`. Une remontée après cette descente remplit `expires_at` par `window_start` + 1 jour,
-- ce qui ne peut que resserrer la limite. L'exception ne vaut que pour cette colonne.
DROP INDEX "action_rate_limits_expires_at_idx";
ALTER TABLE "action_rate_limits" DROP COLUMN "expires_at";
