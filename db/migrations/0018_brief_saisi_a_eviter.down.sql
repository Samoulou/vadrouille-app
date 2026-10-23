-- Migration inverse de 0018_brief_saisi_a_eviter (spécification `specs/E2E-essai-bout-en-bout.md`, lot 5). Règle du rôle
-- `data` : **aucune suppression de données**. Elle rétablit la contrainte de clés de `prototype.run_briefs` de
-- 0017_brief_saisi_prototype, en `NOT VALID` : les briefs saisis déjà écrits avec `aEviter` ne sont ni lus, ni modifiés,
-- ni supprimés (ils expirent avec le programme de leur exécution, 29 jours, et sont purgés) ; tout nouveau brief portant
-- `aEviter` est refusé (`23514`) dans la transaction de réservation, sans rien écrire. Le code d'avant 0018 n'écrit
-- jamais `aEviter`.
SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint
ALTER TABLE prototype.run_briefs DROP CONSTRAINT run_briefs_brief_check;
--> statement-breakpoint
ALTER TABLE prototype.run_briefs ADD CONSTRAINT run_briefs_brief_check CHECK (pg_catalog.jsonb_typeof(brief) = 'object'
    AND (brief OPERATOR(pg_catalog.-) ARRAY['schema', 'destination', 'pays', 'fuseau', 'arrivee', 'depart', 'heureArrivee',
      'heureDepart', 'voyageurs', 'rythme', 'envies', 'deplacements', 'budgetRepas', 'logements', 'engagements', 'recit']) = '{}'::jsonb
    AND pg_catalog.pg_column_size(brief) <= 16384) NOT VALID;
--> statement-breakpoint
RESET ROLE;
