-- 0004_rate_limit_expires_at — échéance des fenêtres du limiteur (spécification B3, B3a point 6 ; amendement de 0007
-- par la décision 0050, P3, points 1 à 3 ; position de la Sécurité 0051, point 6.3). Générée par `pnpm db:generate`
-- puis réécrite à la main : l'`ADD COLUMN … NOT NULL` sans défaut produit par drizzle-kit échouerait sur une table
-- non vide. Migration additive (B1-PO-4), compatible avec la version précédente du code : aucun code de `main`
-- n'écrit dans `action_rate_limits` avant B3a. Droits inchangés : `vadrouille_limiter` garde `SELECT, INSERT,
-- UPDATE, DELETE` sur la table (0001_securite), qui couvrent la colonne ajoutée ; aucune politique ne change.
-- Retour arrière : `0004_rate_limit_expires_at.down.sql` (exception nommée de `db/README.md`, § 2).
--
-- Lignes existantes, s'il y en a : échéance `window_start` + 1 jour (plus longue fenêtre connue, B9), ce qui ne peut
-- qu'allonger une fenêtre, donc resserrer la limite. L'index sur `window_start` de B1 reste.
ALTER TABLE "action_rate_limits" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
UPDATE "action_rate_limits" SET "expires_at" = "window_start" + interval '1 day';--> statement-breakpoint
ALTER TABLE "action_rate_limits" ALTER COLUMN "expires_at" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "action_rate_limits_expires_at_idx" ON "action_rate_limits" USING btree ("expires_at");
