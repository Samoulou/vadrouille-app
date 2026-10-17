-- Migration inverse de 0009_verifications_updated_at (spécification B3, B3b point 6). Exception nommée à la règle
-- « aucune migration inverse ne supprime une colonne porteuse de données » (`db/README.md`, § 2), sur le modèle de
-- 0004 : `updated_at` ne porte que l'instant technique d'écriture d'une vérification (code de connexion à durée de vie
-- de 10 minutes), sans donnée d'une personne ni d'une organisation. Les lignes restent : ni `DELETE`, ni `TRUNCATE`,
-- ni changement des autres colonnes. Après cette descente, Better Auth 1.7.7 ne peut plus créer de vérification :
-- l'adaptateur `better-auth` doit être retiré (`AUTH_ADAPTER=mock`) avant de la jouer. L'exception ne vaut que pour
-- cette colonne. Acceptée par le Tech Lead le 2026-10-17 (amendement B3b de la décision 0007).
ALTER TABLE "verifications" DROP COLUMN "updated_at";
