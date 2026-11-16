-- 0029_prevente_mesure — mesure de la prévente : visites par jour et par provenance, réponses au questionnaire,
-- compteur du jour (spécification `specs/C2-prevente-mesure.md`, § 4 et § 5, critères B1 à B7 ; tâche C2a, ticket 1117).
-- Forme des tables, rôles et droits : proposition de la spécification, **confirmée par le Tech Lead (T1 : décision
-- 0172, § 1)** ; Sécurité (S1) : approuvé, aucun bloquant, revue consolidée du head `4049ec4` de la PR #1123 (0172,
-- § 6). Générée par `pnpm db:generate --name prevente_mesure` depuis `db/schema/prevente.ts`, puis complétée
-- à la main (RLS, politiques, droits, domaine, fonctions). Exécutée par `vadrouille_migrator` dans une transaction,
-- après 0028_purge_place_coordinates. Sur une base réelle : seulement par le workflow `db-migrate`, après l'ajout de
-- sa ligne à MIGRATIONS_APPROUVEES par une PR de workflow à part (tâche C2a-2 ; 0035, 0056 § 3).
-- Retour arrière : `0029_prevente_mesure.down.sql` (partiel, voir `db/README.md`).
--
-- Migration **additive** : trois tables, un domaine et cinq fonctions nouveaux ; aucune ligne existante lue, modifiée
-- ni supprimée ; aucun code de `main` ne les nomme (le code applicatif arrive avec C2b et C2c).
--
-- Exception à `organization_id` (0172) : ces tables n'appartiennent à aucune organisation (visiteurs anonymes, avant
-- tout compte), comme `email_daily_counts` (0020). Aucune colonne ne peut recevoir une adresse IP, un agent
-- utilisateur, une heure ni un identifiant de paiement ou de session ; le jour est posé par la base, en UTC.
--
-- Plan :
--   1. tables `prevente_visites` (un nombre par jour et par provenance), `prevente_reponses_jour` (compteur du jour,
--      pour le seul plafond) et `prevente_reponses` (une ligne par réponse, codes des listes fermées, `CHECK`) ;
--      `destination` : 1 à 80 caractères, pas seulement des espaces, aucun caractère de contrôle (C0, DEL, C1), de
--      sens d'écriture, de largeur nulle ni séparateur de ligne (lecture en console par Samuel, § 5 point 5) ;
--      `interne` est hors de la liste des provenances, donc refusé par les deux tables ;
--   2. RLS activée et forcée sur les trois ; politiques pour les deux seuls rôles propriétaires de fonctions :
--      `vadrouille_fn_prevente` (écriture) et `vadrouille_fn_prevente_releve` (lecture) ;
--   3. droits nominatifs de ces deux rôles, au plus juste. **Aucun rôle applicatif ni de connexion n'a de droit direct
--      sur ces tables** (ni `SELECT`, ni `INSERT`, ni `UPDATE`, ni `DELETE`) ; aucune purge n'est créée (durée de
--      conservation non fixée : question 3 à Samuel) ;
--   4. domaine `public.prevente_code` : texte limité aux codes des listes fermées et aux rubriques du relevé. Les
--      fonctions de relevé ne rendent que des `bigint`, des `date` et ce domaine (critère B7) ;
--   5. fonctions d'écriture, `SECURITY DEFINER`, propriétaire `vadrouille_fn_prevente`, `EXECUTE` à `vadrouille_app`
--      seul : `prevente_compter_visite(text)` (incrément atomique, ne rend rien) et
--      `prevente_enregistrer_reponse(…)` (plafond du jour et insertion dans la même transaction ; rend le verdict
--      `admise` ou `plafond_atteint`, jamais une donnée stockée) ;
--   6. fonctions de relevé, `SECURITY DEFINER`, propriétaire `vadrouille_fn_prevente_releve`, `EXECUTE` à
--      `vadrouille_prevente_releve` seul : `prevente_releve_visites()`, `prevente_releve_reponses()`,
--      `prevente_releve_destinations()` (deux nombres ; aucun texte de `destination` n'est rendu).
--
-- Prérequis : les rôles `vadrouille_fn_prevente`, `vadrouille_fn_prevente_releve` (sans connexion, ADMIN seule à
-- `vadrouille_migrator`) et `vadrouille_prevente_releve` (rôle du relevé, sans connexion ni appartenance tant que le
-- workflow de C2e n'existe pas) sont créés par `db/bootstrap/roles.sql`, rejoué par un propriétaire avant cette migration ; aucune
-- migration ne crée de rôle. Sans eux, cette migration échoue (`42704`) et rien n'est appliqué.
SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint

-- 1. Tables (générées depuis `db/schema/prevente.ts` ; listes de `db/prevente-codes.ts`).
CREATE TABLE "prevente_reponses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jour" date NOT NULL,
	"src" text NOT NULL,
	"parcours" text NOT NULL,
	"destination" text,
	"periode" text,
	"preparation" text[] DEFAULT '{}'::text[] NOT NULL,
	"motifs" text[] DEFAULT '{}'::text[] NOT NULL,
	"decouverte" text,
	CONSTRAINT "prevente_reponses_src_check" CHECK ("prevente_reponses"."src" IN ('proches', 'forum', 'groupe', 'reddit', 'instagram', 'instagram-pub', 'createur', 'direct', 'autre')),
	CONSTRAINT "prevente_reponses_parcours_check" CHECK ("prevente_reponses"."parcours" IN ('precommande', 'visite')),
	CONSTRAINT "prevente_reponses_destination_check" CHECK ("prevente_reponses"."destination" IS NULL OR (char_length("prevente_reponses"."destination") BETWEEN 1 AND 80 AND btrim("prevente_reponses"."destination") <> '' AND "prevente_reponses"."destination" !~ '[\x01-\x1F\x7F\u0080-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]')),
	CONSTRAINT "prevente_reponses_periode_check" CHECK ("prevente_reponses"."periode" IS NULL OR "prevente_reponses"."periode" IN ('paques', 'ascension', 'pentecote', 'printemps', 'plus-tard', 'sans-date')),
	CONSTRAINT "prevente_reponses_preparation_check" CHECK ("prevente_reponses"."preparation" <@ ARRAY['guides-blogs', 'avis-cartes', 'assistant', 'application', 'agence', 'presque-rien', 'autre']::text[]),
	CONSTRAINT "prevente_reponses_motifs_check" CHECK (("prevente_reponses"."parcours" = 'precommande' AND "prevente_reponses"."motifs" <@ ARRAY['adresses-sourcees', 'evenements', 'remplacer', 'prix', 'gain-de-temps', 'demonstration', 'autre']::text[]) OR ("prevente_reponses"."parcours" = 'visite' AND "prevente_reponses"."motifs" <@ ARRAY['prix', 'pas-de-voyage', 'attendre', 'assistant-gratuit', 'fiabilite', 'destination', 'autre']::text[])),
	CONSTRAINT "prevente_reponses_decouverte_check" CHECK ("prevente_reponses"."decouverte" IS NULL OR "prevente_reponses"."decouverte" IN ('connait-createur', 'ami', 'forum-groupe', 'instagram', 'createur-contenu', 'autre')),
	CONSTRAINT "prevente_reponses_non_vide_check" CHECK ("prevente_reponses"."destination" IS NOT NULL OR "prevente_reponses"."periode" IS NOT NULL OR "prevente_reponses"."decouverte" IS NOT NULL OR cardinality("prevente_reponses"."preparation") > 0 OR cardinality("prevente_reponses"."motifs") > 0)
);
--> statement-breakpoint
CREATE TABLE "prevente_reponses_jour" (
	"jour" date PRIMARY KEY NOT NULL,
	"reponses" integer NOT NULL,
	CONSTRAINT "prevente_reponses_jour_reponses_check" CHECK ("prevente_reponses_jour"."reponses" BETWEEN 1 AND 200)
);
--> statement-breakpoint
CREATE TABLE "prevente_visites" (
	"jour" date NOT NULL,
	"src" text NOT NULL,
	"visites" integer NOT NULL,
	CONSTRAINT "prevente_visites_pkey" PRIMARY KEY("jour","src"),
	CONSTRAINT "prevente_visites_src_check" CHECK ("prevente_visites"."src" IN ('proches', 'forum', 'groupe', 'reddit', 'instagram', 'instagram-pub', 'createur', 'direct', 'autre')),
	CONSTRAINT "prevente_visites_visites_check" CHECK ("prevente_visites"."visites" >= 1)
);
--> statement-breakpoint

-- 2. RLS activée et forcée ; une politique par rôle propriétaire de fonction, au plus juste.
ALTER TABLE public.prevente_visites ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.prevente_visites FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.prevente_reponses_jour ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.prevente_reponses_jour FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.prevente_reponses ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.prevente_reponses FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Écriture : l'incrément (`INSERT … ON CONFLICT … DO UPDATE`) lit, insère et modifie la ligne du jour ; une réponse
-- s'insère et n'est jamais relue ni modifiée par la fonction d'écriture.
CREATE POLICY prevente_visites_fn_prevente_select ON public.prevente_visites FOR SELECT TO vadrouille_fn_prevente USING (true);
--> statement-breakpoint
CREATE POLICY prevente_visites_fn_prevente_insert ON public.prevente_visites FOR INSERT TO vadrouille_fn_prevente WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY prevente_visites_fn_prevente_update ON public.prevente_visites FOR UPDATE TO vadrouille_fn_prevente USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY prevente_reponses_jour_fn_prevente_select ON public.prevente_reponses_jour FOR SELECT TO vadrouille_fn_prevente USING (true);
--> statement-breakpoint
CREATE POLICY prevente_reponses_jour_fn_prevente_insert ON public.prevente_reponses_jour FOR INSERT TO vadrouille_fn_prevente WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY prevente_reponses_jour_fn_prevente_update ON public.prevente_reponses_jour FOR UPDATE TO vadrouille_fn_prevente USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY prevente_reponses_fn_prevente_insert ON public.prevente_reponses FOR INSERT TO vadrouille_fn_prevente WITH CHECK (true);
--> statement-breakpoint
-- Lecture du relevé : visites et réponses ; le compteur du jour ne sert qu'au plafond et n'est pas lu.
CREATE POLICY prevente_visites_fn_prevente_releve ON public.prevente_visites FOR SELECT TO vadrouille_fn_prevente_releve USING (true);
--> statement-breakpoint
CREATE POLICY prevente_reponses_fn_prevente_releve ON public.prevente_reponses FOR SELECT TO vadrouille_fn_prevente_releve USING (true);
--> statement-breakpoint

-- 3. Droits nominatifs. Ni `DELETE`, ni `TRUNCATE`, pour personne ; `UPDATE` du seul nombre, jamais du jour ni de la
-- provenance ; le relevé ne lit ni `id` ni `jour` d'une réponse.
GRANT SELECT, INSERT ON public.prevente_visites TO vadrouille_fn_prevente;
--> statement-breakpoint
GRANT UPDATE (visites) ON public.prevente_visites TO vadrouille_fn_prevente;
--> statement-breakpoint
GRANT SELECT, INSERT ON public.prevente_reponses_jour TO vadrouille_fn_prevente;
--> statement-breakpoint
GRANT UPDATE (reponses) ON public.prevente_reponses_jour TO vadrouille_fn_prevente;
--> statement-breakpoint
GRANT INSERT ON public.prevente_reponses TO vadrouille_fn_prevente;
--> statement-breakpoint
GRANT SELECT ON public.prevente_visites TO vadrouille_fn_prevente_releve;
--> statement-breakpoint
GRANT SELECT (src, parcours, destination, periode, preparation, motifs, decouverte) ON public.prevente_reponses TO vadrouille_fn_prevente_releve;
--> statement-breakpoint

-- 4. Domaine des codes : tout ce qu'une fonction de relevé peut rendre comme texte. Une valeur hors liste (un texte
-- saisi, par exemple) fait échouer la conversion, donc la fonction entière : rien n'est rendu.
CREATE DOMAIN public.prevente_code AS text CONSTRAINT prevente_code_check CHECK (VALUE IN (
  'proches', 'forum', 'groupe', 'reddit', 'instagram', 'instagram-pub', 'createur', 'direct',
  'autre', 'precommande', 'visite', 'paques', 'ascension', 'pentecote', 'printemps', 'plus-tard',
  'sans-date', 'guides-blogs', 'avis-cartes', 'assistant', 'application', 'agence', 'presque-rien', 'adresses-sourcees',
  'evenements', 'remplacer', 'prix', 'gain-de-temps', 'demonstration', 'pas-de-voyage', 'attendre', 'assistant-gratuit',
  'fiabilite', 'destination', 'connait-createur', 'ami', 'forum-groupe', 'createur-contenu', 'total', 'src',
  'parcours', 'periode', 'preparation', 'motifs-precommande', 'motifs-visite', 'decouverte'
));
--> statement-breakpoint

-- Dans les corps des fonctions, les tables sont nommées avec leur schéma ; `unnest` en clause FROM est écrit sans
-- schéma (résolu dans pg_catalog par le search_path figé), comme l'exige le test « fonctions: SECURITY DEFINER durcies ».

-- 5. Fonctions d'écriture, créées sous leur propriétaire. vadrouille_migrator prend vadrouille_fn_prevente le temps de
-- la migration (option ADMIN de l'amorçage ; appartenance retirée ensuite) ; CREATE sur public, le temps de la création
-- (même cadre que 0010_usage_forfait, points 5 et 6).
RESET ROLE;
--> statement-breakpoint
GRANT vadrouille_fn_prevente TO vadrouille_migrator WITH INHERIT FALSE, SET TRUE;
--> statement-breakpoint
GRANT CREATE ON SCHEMA public TO vadrouille_fn_prevente;
--> statement-breakpoint
SET LOCAL ROLE vadrouille_fn_prevente;
--> statement-breakpoint
-- Compter une visite : + 1 pour le jour UTC posé par la base et la provenance reçue ; une seule ligne par (jour, src),
-- incrément atomique sous concurrence. Ne rend rien. Une provenance hors liste (`interne` comprise) ou absente est
-- refusée par les contraintes de la table (`23514`, `23502`).
CREATE FUNCTION public.prevente_compter_visite(p_src text)
  RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  INSERT INTO public.prevente_visites AS v (jour, src, visites)
  VALUES ((pg_catalog.now() AT TIME ZONE 'UTC')::date, p_src, 1)
  ON CONFLICT (jour, src) DO UPDATE SET visites = v.visites + 1;
END
$$;
--> statement-breakpoint
-- Enregistrer une réponse : incrémente le compteur du jour UTC tant qu'il est sous le plafond, puis insère la réponse,
-- dans la transaction de l'appel ; au plafond, n'incrémente ni n'insère rien. Rend le verdict seul : `admise` ou
-- `plafond_atteint`. Plafond : paramètre borné de 1 à 200 (défaut 200 ; un appelant ne peut que l'abaisser, la
-- contrainte de `prevente_reponses_jour` tient la borne haute). Les listes de codes sont rendues sans doublon et
-- triées ; une liste absente vaut une liste vide. Toute valeur refusée par une contrainte fait échouer l'appel entier
-- (compteur non consommé) avec le code d'origine (`23514`, `23502`) et le nom de la contrainte, sans détail ni requête :
-- l'erreur ne cite jamais la ligne refusée, donc jamais le texte de `destination` (la RLS activée retient déjà ce
-- détail ; l'erreur relevée ici ne dépend pas de ce comportement).
CREATE FUNCTION public.prevente_enregistrer_reponse(
  p_src text, p_parcours text, p_destination text, p_periode text, p_preparation text[], p_motifs text[],
  p_decouverte text, p_plafond integer DEFAULT 200)
  RETURNS text
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_jour date := (pg_catalog.now() AT TIME ZONE 'UTC')::date;
  v_contrainte text;
  v_colonne text;
BEGIN
  IF p_plafond IS NULL OR p_plafond < 1 OR p_plafond > 200 THEN
    RAISE EXCEPTION 'plafond du jour hors bornes (1 à 200)' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  INSERT INTO public.prevente_reponses_jour AS j (jour, reponses) VALUES (v_jour, 1)
  ON CONFLICT (jour) DO UPDATE SET reponses = j.reponses + 1 WHERE j.reponses < p_plafond;
  IF NOT FOUND THEN
    RETURN 'plafond_atteint';
  END IF;
  INSERT INTO public.prevente_reponses (jour, src, parcours, destination, periode, preparation, motifs, decouverte)
  VALUES (
    v_jour, p_src, p_parcours, p_destination, p_periode,
    ARRAY(SELECT DISTINCT u.code FROM unnest(COALESCE(p_preparation, '{}'::text[])) AS u(code) ORDER BY u.code),
    ARRAY(SELECT DISTINCT u.code FROM unnest(COALESCE(p_motifs, '{}'::text[])) AS u(code) ORDER BY u.code),
    p_decouverte);
  RETURN 'admise';
EXCEPTION
  WHEN check_violation OR not_null_violation THEN
    GET STACKED DIAGNOSTICS v_contrainte = CONSTRAINT_NAME, v_colonne = COLUMN_NAME;
    RAISE EXCEPTION 'réponse refusée par une contrainte de la base'
      USING ERRCODE = SQLSTATE, CONSTRAINT = v_contrainte, COLUMN = v_colonne, TABLE = 'prevente_reponses';
END
$$;
--> statement-breakpoint
-- Droits d'exécution (0007, règle commune 3) : vadrouille_app seul, PUBLIC exclu.
REVOKE ALL ON FUNCTION public.prevente_compter_visite(text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.prevente_enregistrer_reponse(text, text, text, text, text[], text[], text, integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.prevente_compter_visite(text) TO vadrouille_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.prevente_enregistrer_reponse(text, text, text, text, text[], text[], text, integer) TO vadrouille_app;
--> statement-breakpoint
RESET ROLE;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM vadrouille_fn_prevente;
--> statement-breakpoint
REVOKE vadrouille_fn_prevente FROM vadrouille_migrator GRANTED BY vadrouille_migrator;
--> statement-breakpoint

-- 6. Fonctions de relevé, créées sous leur propriétaire (même cadre). Elles ne rendent que des nombres, des dates et
-- des valeurs du domaine prevente_code ; aucune ne rend `id`, `jour` d'une réponse ni `destination`.
GRANT vadrouille_fn_prevente_releve TO vadrouille_migrator WITH INHERIT FALSE, SET TRUE;
--> statement-breakpoint
GRANT CREATE ON SCHEMA public TO vadrouille_fn_prevente_releve;
--> statement-breakpoint
SET LOCAL ROLE vadrouille_fn_prevente_releve;
--> statement-breakpoint
-- Visites par semaine (le lundi de la semaine, jours UTC) et par provenance. Les totaux par semaine, par provenance et
-- le cumul s'en déduisent par addition.
CREATE FUNCTION public.prevente_releve_visites()
  RETURNS TABLE (semaine date, src public.prevente_code, visites bigint)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
  SELECT pg_catalog.date_trunc('week', v.jour::timestamp)::date, v.src::public.prevente_code, pg_catalog.sum(v.visites)::bigint
  FROM public.prevente_visites AS v
  GROUP BY 1, 2
  ORDER BY 1, 2;
$$;
--> statement-breakpoint
-- Réponses : une ligne `total` (toujours rendue, code nul), puis la répartition par provenance, par parcours et par
-- code des questions 2 à 5 (question 4 : une rubrique par parcours). Une réponse compte une fois par code qu'elle porte.
CREATE FUNCTION public.prevente_releve_reponses()
  RETURNS TABLE (rubrique public.prevente_code, code public.prevente_code, reponses bigint)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
  SELECT t.rubrique::public.prevente_code, t.code::public.prevente_code, t.reponses::bigint
  FROM (
    SELECT 1 AS ordre, 'total' AS rubrique, NULL::text AS code, pg_catalog.count(*) AS reponses FROM public.prevente_reponses
    UNION ALL
    SELECT 2, 'src', r.src, pg_catalog.count(*) FROM public.prevente_reponses AS r GROUP BY r.src
    UNION ALL
    SELECT 3, 'parcours', r.parcours, pg_catalog.count(*) FROM public.prevente_reponses AS r GROUP BY r.parcours
    UNION ALL
    SELECT 4, 'periode', r.periode, pg_catalog.count(*) FROM public.prevente_reponses AS r WHERE r.periode IS NOT NULL GROUP BY r.periode
    UNION ALL
    SELECT 5, 'preparation', c.code, pg_catalog.count(*)
    FROM public.prevente_reponses AS r
    CROSS JOIN LATERAL (SELECT DISTINCT u.code FROM unnest(r.preparation) AS u(code)) AS c
    GROUP BY c.code
    UNION ALL
    SELECT 6, 'motifs-' || r.parcours, c.code, pg_catalog.count(*)
    FROM public.prevente_reponses AS r
    CROSS JOIN LATERAL (SELECT DISTINCT u.code FROM unnest(r.motifs) AS u(code)) AS c
    GROUP BY r.parcours, c.code
    UNION ALL
    SELECT 7, 'decouverte', r.decouverte, pg_catalog.count(*) FROM public.prevente_reponses AS r WHERE r.decouverte IS NOT NULL GROUP BY r.decouverte
  ) AS t
  ORDER BY t.ordre, t.rubrique, t.code;
$$;
--> statement-breakpoint
-- Question 1 (texte libre) : deux nombres seulement. Le seuil de 2 est appliqué ici, après mise en minuscules et
-- nettoyage des espaces ; aucun texte n'est rendu, quel que soit le nombre de fois où il est cité (§ 5 point 4).
CREATE FUNCTION public.prevente_releve_destinations()
  RETURNS TABLE (reponses_avec_destination bigint, destinations_citees_deux_fois bigint)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
  SELECT
    (SELECT pg_catalog.count(*) FROM public.prevente_reponses AS r WHERE r.destination IS NOT NULL)::bigint,
    (SELECT pg_catalog.count(*) FROM (
       SELECT 1 FROM public.prevente_reponses AS r
       WHERE r.destination IS NOT NULL
       GROUP BY pg_catalog.lower(pg_catalog.btrim(pg_catalog.regexp_replace(r.destination, '\s+', ' ', 'g')))
       HAVING pg_catalog.count(*) >= 2
     ) AS d)::bigint;
$$;
--> statement-breakpoint
-- Droits d'exécution : le rôle du relevé seul, PUBLIC exclu ; vadrouille_app ne lit aucun agrégat.
REVOKE ALL ON FUNCTION public.prevente_releve_visites() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.prevente_releve_reponses() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.prevente_releve_destinations() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.prevente_releve_visites() TO vadrouille_prevente_releve;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.prevente_releve_reponses() TO vadrouille_prevente_releve;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.prevente_releve_destinations() TO vadrouille_prevente_releve;
--> statement-breakpoint
RESET ROLE;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM vadrouille_fn_prevente_releve;
--> statement-breakpoint
REVOKE vadrouille_fn_prevente_releve FROM vadrouille_migrator GRANTED BY vadrouille_migrator;
