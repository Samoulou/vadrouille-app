-- 0022_feedback_signalements — signalements d'une étape dans `feedback`, durcie, et compteur global de la recherche d'un
-- lieu à soi (plan du MVP, étape 5, tâche M5-D, ticket 896 ; décision 0147 § 2 et § 6.4 point 3 ; spécification
-- `specs/M5-retouches.md`, T2 et M5-PO-9 ; Sécurité : 0147 § 12, S1). **Seule migration de M5.** Générée par
-- `pnpm db:generate` depuis `db/schema/business.ts` et `db/schema/auth.ts`, puis réordonnée, commentée et complétée à
-- la main (droits). Exécutée par `vadrouille_migrator` dans une transaction, après 0021_compteurs_autocompletion.
-- Retour arrière : `0022_feedback_signalements.down.sql` (partielle, voir ce fichier).
--
-- Migration **additive** : une colonne nulle, une colonne à défaut 0, deux index uniques partiels, quatre `CHECK`, des
-- droits. Aucune ligne n'est modifiée ni supprimée ; la RLS de `feedback` (politique type de 0001) et celle
-- d'`autocomplete_daily_counts` (0021) sont inchangées. Aucun code de `src/` n'écrit encore `feedback` (M5c sera le
-- premier) : la table est vide partout et les `CHECK` sont posées valides, sans `NOT VALID` (0147 § 2 point 3) ; si une
-- ligne existante les contredisait, la migration échouerait (`23514`) sans rien changer.
--
-- Plan :
--   1. `feedback` (0147 § 2) :
--      a. colonne `request_id uuid`, nullable pour la forme, toujours écrite par `reportStop` (point 1) ;
--      b. index unique partiel `(organization_id, trip_id, request_id) WHERE request_id IS NOT NULL` : idempotence par
--         `requestId` (point 1) ;
--      c. index unique partiel de déduplication `(organization_id, trip_id, target_stop_id, reason,
--         COALESCE(place_id, '')) WHERE scope = 'stop'` : un même motif sur la même étape du même lieu ne crée qu'une
--         ligne ; `place_id` est dans la clé parce que les identifiants d'étape sont réutilisés d'une version à l'autre
--         (0142 § 5.1) (point 2) ;
--      d. trois `CHECK` (point 3) : `reason` fermé aux cinq motifs de `STOP_REPORT_REASONS` (0147 § 1 point 1, même
--         ordre ; égalité vérifiée par `tests/unit/db/migration-feedback.test.ts`) ; `text IS NULL` (M5-PO-9 tenu par la
--         base : aucun texte libre ; la colonne reste pour ne pas réécrire `purge_organization_data`) ; `scope <> 'stop'
--         OR target_stop_id IS NOT NULL` ;
--      e. `UPDATE` de table retiré à `vadrouille_app` : un signalement n'est jamais modifié ; restent `SELECT, INSERT`
--         (point 4). Aucun droit par colonne n'existait.
--   2. `autocomplete_daily_counts` (0147 § 6.4 point 3) : colonne `lieux integer NOT NULL DEFAULT 0` (recherches d'un
--      lieu à soi, Text Search Pro, plafond global du jour), `CHECK (lieux >= 0)`, `UPDATE (lieux)` accordé au rôle
--      `vadrouille_autocomplete_counter`, qui garde ses droits de 0021 (`SELECT`, `INSERT (day)`, `UPDATE (suggestions,
--      choix)`, `DELETE`) : jamais `day`, jamais d'insertion d'un compteur. Le nom de la table devient un peu large
--      (elle compte aussi la recherche de lieux) : noté dans son commentaire de `db/schema/auth.ts`.
--
-- Aucune donnée Google autre que `place_id` (identifiant de lieu, seule donnée Google stockable, déjà présent depuis le
-- socle) ; aucun nom, aucune adresse, aucun texte saisi ; le compteur ne porte ni saisie, ni identifiant de personne,
-- d'organisation ou de lieu. Aucun rôle n'est créé. Sur Neon, cette migration n'est appliquée qu'après l'ajout de sa
-- ligne à `MIGRATIONS_APPROUVEES` par une PR de workflow à part et l'`owner-approved` de Samuel (voie de M1i, 0147 § 2
-- point 6) ; d'ici là, `reportStop` échoue en `internal` sur la préversion, sans conséquence.
SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint

-- 1.a Idempotence (0147 § 2 point 1).
ALTER TABLE "feedback" ADD COLUMN "request_id" uuid;
--> statement-breakpoint
-- 1.b
CREATE UNIQUE INDEX "feedback_organization_id_trip_id_request_id_idx" ON "feedback" USING btree ("organization_id","trip_id","request_id") WHERE "feedback"."request_id" IS NOT NULL;
--> statement-breakpoint
-- 1.c Déduplication (0147 § 2 point 2).
CREATE UNIQUE INDEX "feedback_stop_dedup_idx" ON "feedback" USING btree ("organization_id","trip_id","target_stop_id","reason",COALESCE("place_id", '')) WHERE "feedback"."scope" = 'stop';
--> statement-breakpoint
-- 1.d Motif fermé (`STOP_REPORT_REASONS`), aucun texte, étape exigée d'un signalement d'étape (0147 § 2 point 3).
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_reason_check" CHECK ("feedback"."reason" IN ('closed', 'hours', 'wrongPlace', 'price', 'other'));
--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_text_check" CHECK ("feedback"."text" IS NULL);
--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_target_stop_check" CHECK ("feedback"."scope" <> 'stop' OR "feedback"."target_stop_id" IS NOT NULL);
--> statement-breakpoint
-- 1.e Un signalement n'est jamais modifié (0147 § 2 point 4).
REVOKE UPDATE ON public.feedback FROM vadrouille_app;
--> statement-breakpoint

-- 2. Compteur global du jour de la recherche d'un lieu à soi (0147 § 6.4 point 3).
ALTER TABLE "autocomplete_daily_counts" ADD COLUMN "lieux" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "autocomplete_daily_counts" ADD CONSTRAINT "autocomplete_daily_counts_lieux_check" CHECK ("autocomplete_daily_counts"."lieux" >= 0);
--> statement-breakpoint
GRANT UPDATE (lieux) ON public.autocomplete_daily_counts TO vadrouille_autocomplete_counter;
--> statement-breakpoint
RESET ROLE;
