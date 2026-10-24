-- 0019_recherche_ville_prototype — plafond persistant de la recherche de ville du site d'essai (décision 0129 § 3 ; demande
-- de Samuel du 2026-10-23, autocomplétion Google des villes à l'écran 1). Écrite à la main (`pnpm db:generate --custom` :
-- aucun changement de `db/schema/`, le schéma `prototype` n'y est pas décrit ; le cliché `meta/0019_snapshot.json` est
-- celui de 0018). Exécutée par `vadrouille_migrator` dans une transaction, après 0018_brief_saisi_a_eviter, seulement par
-- le workflow `db-migrate` après l'`owner-approved` de Samuel sur la ligne de MIGRATIONS_APPROUVEES (0035, 0056 § 3),
-- ajoutée par une PR de workflow à part (précédent de #675 et #681).
-- Retour arrière : `0019_recherche_ville_prototype.down.sql` (voir `db/README.md`).
--
-- Plan : une ligne `prototype.forfaits` de nature `ville` par action de recherche (suggestions ou choix), écrite avant
-- tout appel Google, sous le verrou consultatif du port (`reserverVille` de `src/server/usage/neon.ts`) :
-- 1. nature `ville` admise (`forfaits_nature_check`) ; comme `relecture`, sans exécution ni coût de modèle
--    (`forfaits_run_id_check` inchangée, `forfaits_models_check` élargie à `ville`) ;
-- 2. colonne `autocomplete_requests` (suggestions Autocomplete (New) : 1 par ligne `ville` de suggestions, 0 partout
--    ailleurs) ; la fiche du choix est comptée dans `place_details_requests` ;
-- 3. colonne `acces_empreinte` : HMAC du cookie d'accès (`empreinteCookieAcces` de `src/server/p0/acces.ts`, clé dérivée du
--    code), renseignée si et seulement si la nature est `ville` ; ni le cookie, ni le code, ni une adresse ;
-- 4. index partiel des lignes `ville` par jour de quota et empreinte : les sommes de `reserverVille` ne lisent que le jour
--    de quota courant et la veille (plafond du jour, débit du cookie sur la dernière minute) ;
-- 5. `INSERT` des deux colonnes pour `vadrouille_prototype` (droits par colonne, comme 0003_prototype § 4.9).
-- Aucune donnée Google : ni `placeId`, ni texte, ni position.
--
-- Compatibilité : les lignes existantes (`execution`, `relecture`) prennent `autocomplete_requests` = 0 et
-- `acces_empreinte` NULL, et satisfont les contraintes nouvelles ; l'`ADD CONSTRAINT` validé balaie `prototype.forfaits`
-- (petite table). La version précédente du code n'écrit jamais `ville`. La nouvelle version du code avant cette migration :
-- l'insertion `ville` est refusée (colonne absente, `42703`), la transaction est annulée, la recherche de ville rend
-- « indisponible » et l'écran 1 se replie sur la table maison des villes (échec fermé, aucun appel Google).
SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint
ALTER TABLE prototype.forfaits ADD COLUMN autocomplete_requests integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE prototype.forfaits ADD COLUMN acces_empreinte text;
--> statement-breakpoint
ALTER TABLE prototype.forfaits DROP CONSTRAINT forfaits_nature_check;
--> statement-breakpoint
ALTER TABLE prototype.forfaits ADD CONSTRAINT forfaits_nature_check CHECK (nature IN ('execution', 'relecture', 'ville'));
--> statement-breakpoint
ALTER TABLE prototype.forfaits DROP CONSTRAINT forfaits_models_check;
--> statement-breakpoint
ALTER TABLE prototype.forfaits ADD CONSTRAINT forfaits_models_check CHECK ((models_cost_micros IS NULL) = (nature IN ('relecture', 'ville')));
--> statement-breakpoint
ALTER TABLE prototype.forfaits ADD CONSTRAINT forfaits_ville_check CHECK (autocomplete_requests >= 0
    AND (nature = 'ville' OR autocomplete_requests = 0)
    AND ((acces_empreinte IS NOT NULL) = (nature = 'ville'))
    AND (acces_empreinte IS NULL OR acces_empreinte ~ '^[0-9a-f]{64}$'));
--> statement-breakpoint
CREATE INDEX forfaits_ville_jour_idx ON prototype.forfaits (quota_day, acces_empreinte) WHERE nature = 'ville';
--> statement-breakpoint
GRANT INSERT (autocomplete_requests, acces_empreinte) ON prototype.forfaits TO vadrouille_prototype;
--> statement-breakpoint
RESET ROLE;
