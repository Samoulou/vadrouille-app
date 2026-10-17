-- 0009_verifications_updated_at — colonne exigée par Better Auth 1.7.7 sur `verifications` (spécification B3, B3b
-- point 6 ; B1-PO-4). Générée par `pnpm db:generate`, puis commentée à la main. La bibliothèque écrit `updatedAt` à
-- chaque création de vérification (valeur par défaut de son schéma) ; l'adaptateur Drizzle refuse un champ absent de
-- `db/schema/auth.ts`. Migration additive, compatible avec la version précédente du code (aucun code de `main`
-- n'écrit dans `verifications` avant B3b) : le défaut `now()` remplit les lignes existantes, s'il y en a.
-- Donnée technique (instant d'écriture), sans donnée d'une personne. Droits inchangés : `vadrouille_auth` garde
-- `SELECT, INSERT, UPDATE, DELETE` sur la table (0001_securite), qui couvrent la colonne ajoutée ; aucune politique ne
-- change. Retour arrière : `0009_verifications_updated_at.down.sql` (exception nommée de `db/README.md`, § 2).
ALTER TABLE "verifications" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
