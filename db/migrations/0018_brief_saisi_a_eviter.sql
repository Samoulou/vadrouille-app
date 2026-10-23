-- 0018_brief_saisi_a_eviter — clé `aEviter` admise dans le brief saisi du prototype (spécification
-- `specs/E2E-essai-bout-en-bout.md`, lot 5 : les catégories « à éviter » cochées dans l'app vont à l'IA). Écrite à la
-- main (`pnpm db:generate --custom`, contrainte seulement : aucun changement de `db/schema/`, le cliché
-- `meta/0018_snapshot.json` est celui de 0017). Exécutée par `vadrouille_migrator` dans une transaction, après
-- 0017_brief_saisi_prototype, seulement par le workflow `db-migrate` après l'`owner-approved` de Samuel sur la ligne de
-- MIGRATIONS_APPROUVEES (0035, 0056 § 3), ajoutée par une PR de workflow à part (précédent de #675 et #681).
-- Retour arrière : `0018_brief_saisi_a_eviter.down.sql` (voir `db/README.md`).
--
-- Plan : `run_briefs_brief_check` (0017, section 2) remplacée à l'identique, avec une clé de premier niveau de plus,
-- `aEviter` (`BriefSchema` de `src/prototype/brief.ts` : catégories maison, facultatives, jamais une envie ; aucune
-- donnée Google, 0011). Même forme (objet, clés fermées, 16 Kio stockés au plus) ; le brief admis grandit d'au plus huit
-- codes de catégorie.
--
-- Compatibilité : toute ligne admise par la contrainte de 0017 l'est par la nouvelle (ensemble de clés plus large), la
-- validation de `ADD CONSTRAINT` passe donc sur les lignes existantes sans en modifier ni en supprimer aucune. La version
-- précédente du code n'écrit jamais `aEviter`. La nouvelle version du code avant cette migration : un lancement depuis
-- l'app avec au moins une catégorie « à éviter » est refusé par la base (`run_briefs_brief_check`, `23514`) dans la
-- transaction de réservation, rien n'est écrit (échec fermé) ; sans « à éviter », le brief est celui de 0017, admis.
SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint
ALTER TABLE prototype.run_briefs DROP CONSTRAINT run_briefs_brief_check;
--> statement-breakpoint
ALTER TABLE prototype.run_briefs ADD CONSTRAINT run_briefs_brief_check CHECK (pg_catalog.jsonb_typeof(brief) = 'object'
    AND (brief OPERATOR(pg_catalog.-) ARRAY['schema', 'destination', 'pays', 'fuseau', 'arrivee', 'depart', 'heureArrivee',
      'heureDepart', 'voyageurs', 'rythme', 'envies', 'aEviter', 'deplacements', 'budgetRepas', 'logements', 'engagements',
      'recit']) = '{}'::jsonb
    AND pg_catalog.pg_column_size(brief) <= 16384);
--> statement-breakpoint
RESET ROLE;
