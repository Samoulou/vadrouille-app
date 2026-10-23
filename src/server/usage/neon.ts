import "server-only";

import { BRIEF_SAISI } from "@/contracts/prototype-travail";
import { refusDuForfait, type Forfait, type LimitesForfait, type SommesForfaits, type UniteQuotaRoutes } from "@/server/usage/forfait";
import type { CodeRefusUsage } from "@/server/usage/port";

/**
 * Implémentation Neon du port de consommation du prototype : **réservation au forfait** (décision 0046, D13 point 3,
 * exigence Sécurité S4). Au lancement d'une exécution (action serveur de P0r3) et au début de chaque relecture, **une**
 * transaction sous `vadrouille_prototype` :
 * 1. pose le contexte d'organisation (`set_config('app.organization_id', <uuid fixe>, true)`, D15 point 5 ; ce
 *    réglage n'est pas la garantie d'isolation, que portent les politiques liées à l'uuid fixe, S2) ;
 * 2. prend `pg_advisory_xact_lock` sur une clé constante du port : deux réservations simultanées sont sérialisées,
 *    une seule réussit si elles dépassaient un plafond ;
 * 3. clôt les exécutions orphelines (`en_cours` au-delà de `dureeMaxMs` + 5 min : `arretee`, `pipeline_failed`, phase et
 *    coût des modèles nuls) ;
 * 4. somme les forfaits du jour de quota et du mois Google **de la base** (`prototype.quota_day_at(now())`, S1), du
 *    mois UTC des modèles et de l'enveloppe, et les compare aux limites reçues, forfait à lancer compris. Pour le
 *    prototype, ces limites sont levées depuis la décision 0071 (`LIMITES_PROTOTYPE`) : seul le contrôle propre au
 *    forfait (Routes, quota d'une minute) peut encore refuser ;
 * 5. insère la ligne `runs` (exécution) et la ligne `forfaits`, gardée pour information. Le jour, l'heure,
 *    l'organisation et l'identifiant sont posés par la base (S1). Plusieurs exécutions par jour de quota sont admises
 *    (décision 0071 ; migration 0007_essais_sans_limite).
 * Toute erreur annule la transaction et rend `usage_unavailable` (échec fermé). Les appels eux-mêmes passent ensuite
 * par le registre en mémoire borné par le forfait (`registre.ts`) : **aucune ligne par appel en base**, et le
 * prototype n'écrit jamais dans `usage_ledger` (D13 point 7 ; aucun droit).
 *
 * Le module n'importe pas `pg` : il reçoit un pool minimal (`connect()`), celui de la garde de connexion
 * `vadrouille_prototype` de `db/connection.ts`, branché par la composition de P0r3.
 */

/** Uuid fixe d'`org_prototype`, égal à `PROTOTYPE_ORG_ID` et à la migration (test). */
const ORGANISATION_PROTOTYPE = "5e1f0000-0000-4000-8000-000000000001";

/** Clé constante du verrou consultatif du port (« 5e1f0001 »). */
export const CLE_VERROU_FORFAIT = 0x5e1f0001;

/** Marge après la durée maximale d'une exécution au-delà de laquelle elle est close au lancement suivant. */
export const MARGE_ORPHELINE_MS = 5 * 60_000;

export type ResultatRequeteSql = { readonly rows: readonly Record<string, unknown>[] };
export type ClientSql = { query(texte: string, valeurs?: readonly unknown[]): Promise<ResultatRequeteSql>; release(erreur?: Error | boolean): void };
export type PoolSql = { connect(): Promise<ClientSql> };

export type ReglesForfait = {
  readonly limites: LimitesForfait;
  readonly uniteQuotaRoutes: UniteQuotaRoutes;
  /** Durée maximale d'une exécution (`DUREE_MAX_EXECUTION_MS` de `p0-run.ts`, décision 0102 § 6). */
  readonly dureeMaxMs: number;
};

export type DemandeExecution = {
  readonly mode: "reel" | "essai";
  /** Nom de fichier de `prototype/briefs/`, ou `BRIEF_SAISI` avec `briefSaisi` (décision 0125 § 1). */
  readonly brief: string;
  readonly variant: "A" | "B";
  readonly commitSha: string;
  readonly forfait: Forfait;
  /**
   * Brief saisi dans l'app (spécification E2E-essai, lot 3 ; décision 0125 § 1) : écrit dans `prototype.run_briefs` dans la
   * transaction de la réservation, avec la clé d'idempotence du lancement. Exigé si et seulement si `brief` vaut
   * `BRIEF_SAISI` (la base le refuse sinon : `runs_brief_check`, déclencheurs de `run_briefs`).
   */
  readonly briefSaisi?: { readonly requestId: string; readonly contenu: unknown };
};

/**
 * Réservation réussie. `existante` (lancement depuis l'app seulement, décision 0125 § 2) : une exécution porte déjà la clé
 * d'idempotence du lancement ; rien n'est écrit, et l'appelant ne redémarre pas son workflow.
 */
export type ResultatLancement =
  | { readonly ok: true; readonly runId: string; readonly existante?: true; readonly destination?: string }
  | { readonly ok: false; readonly code: CodeRefusUsage };
export type ResultatRelecture = { readonly ok: true } | { readonly ok: false; readonly code: CodeRefusUsage };

const nombre = (valeur: unknown): number => {
  const n = typeof valeur === "string" ? Number(valeur) : typeof valeur === "number" ? valeur : Number.NaN;
  if (!Number.isFinite(n)) throw new Error("forfait: somme illisible");
  return n;
};

const SQL_ORPHELINES = `UPDATE prototype.runs SET status = 'arretee', stop_code = 'pipeline_failed', phase = NULL, cost_models_micros = NULL
WHERE status = 'en_cours' AND started_at < pg_catalog.now() - pg_catalog.make_interval(secs => $1::double precision / 1000)`;

/**
 * Sommes des forfaits : jour de quota et mois Google selon `prototype.quota_day_at(now())` (Pacifique, posé par la
 * base) ; mois des modèles selon `created_at` en UTC ; enveloppes sans période (Q329).
 */
const SQL_SOMMES = `WITH bornes AS (
  SELECT prototype.quota_day_at(pg_catalog.now()) AS jour,
         pg_catalog.date_trunc('month', prototype.quota_day_at(pg_catalog.now())::timestamp)::date AS mois_google,
         pg_catalog.date_trunc('month', pg_catalog.now() AT TIME ZONE 'UTC') AS mois_utc
)
SELECT
  COALESCE(SUM(f.text_search_requests) FILTER (WHERE f.quota_day = b.jour), 0) AS jour_text_search,
  COALESCE(SUM(f.place_details_requests) FILTER (WHERE f.quota_day = b.jour), 0) AS jour_place_details,
  COALESCE(SUM(f.routes_requests) FILTER (WHERE f.quota_day = b.jour), 0) AS jour_routes_requetes,
  COALESCE(SUM(f.routes_elements) FILTER (WHERE f.quota_day = b.jour), 0) AS jour_routes_elements,
  COALESCE(SUM(f.google_cost_micros) FILTER (WHERE f.quota_day >= b.mois_google AND f.quota_day < (b.mois_google + interval '1 month')::date), 0) AS mois_google,
  COALESCE(SUM(f.google_cost_micros), 0) AS enveloppe_google,
  COALESCE(SUM(f.models_cost_micros) FILTER (WHERE (f.created_at AT TIME ZONE 'UTC') >= b.mois_utc AND (f.created_at AT TIME ZONE 'UTC') < b.mois_utc + interval '1 month'), 0) AS mois_modeles,
  COALESCE(SUM(f.models_cost_micros), 0) AS enveloppe_modeles
FROM bornes AS b LEFT JOIN prototype.forfaits AS f ON TRUE
GROUP BY b.jour, b.mois_google, b.mois_utc`;

const SQL_INSERER_RUN = `INSERT INTO prototype.runs (mode, brief, variant, commit_sha) VALUES ($1, $2, $3, $4) RETURNING id`;

export { BRIEF_SAISI };

/** Exécution déjà lancée avec cette clé d'idempotence (décision 0125 § 2), lue sous le verrou de la réservation. */
const SQL_RUN_DU_LANCEMENT = "SELECT run_id, brief ->> 'destination' AS destination FROM prototype.run_briefs WHERE request_id = $1::uuid";
const SQL_INSERER_BRIEF = "INSERT INTO prototype.run_briefs (run_id, request_id, brief) VALUES ($1::uuid, $2::uuid, $3::jsonb)";

const SQL_INSERER_FORFAIT = `INSERT INTO prototype.forfaits
  (nature, run_id, text_search_requests, place_details_requests, routes_requests, routes_elements, google_cost_micros, models_cost_micros)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`;

function lireSommes(ligne: Record<string, unknown> | undefined): SommesForfaits {
  if (ligne === undefined) throw new Error("forfait: sommes absentes");
  return {
    jour: {
      textSearchRequetes: nombre(ligne.jour_text_search),
      placeDetailsRequetes: nombre(ligne.jour_place_details),
      routesRequetes: nombre(ligne.jour_routes_requetes),
      routesElements: nombre(ligne.jour_routes_elements),
    },
    moisGoogleMicros: nombre(ligne.mois_google),
    enveloppeGoogleMicros: nombre(ligne.enveloppe_google),
    moisModelesMicros: nombre(ligne.mois_modeles),
    enveloppeModelesMicros: nombre(ligne.enveloppe_modeles),
  };
}

type Refus = { readonly refus: CodeRefusUsage };

/**
 * Transaction commune : contexte, verrou, clôture des orphelines, sommes et comparaison ; puis `inserer` si le forfait
 * tient. Un refus annule la transaction (rien n'est écrit, pas même la clôture des orphelines, refaite au lancement
 * suivant). Toute erreur rend `usage_unavailable`.
 */
async function reserver<T>(
  pool: PoolSql,
  forfait: Forfait,
  regles: ReglesForfait,
  avant: (client: ClientSql) => Promise<CodeRefusUsage | null>,
  inserer: (client: ClientSql) => Promise<T>,
  /**
   * Réservation déjà faite (clé d'idempotence d'un lancement depuis l'app, décision 0125 § 2) : lue sous le verrou,
   * **avant** tout contrôle de forfait ; trouvée, elle est rendue sans rien écrire ni refuser (revue de la PR #704,
   * mineur TL 2 : un rejeu au bord d'un plafond n'est jamais refusé).
   */
  deja: (client: ClientSql) => Promise<T | null> = async () => null,
): Promise<T | Refus> {
  let client: ClientSql;
  try {
    client = await pool.connect();
  } catch {
    return { refus: "usage_unavailable" };
  }
  let enTransaction = false;
  try {
    await client.query("BEGIN");
    enTransaction = true;
    await client.query("SELECT pg_catalog.set_config('app.organization_id', $1, true)", [ORGANISATION_PROTOTYPE]);
    await client.query("SELECT pg_catalog.pg_advisory_xact_lock($1)", [CLE_VERROU_FORFAIT]);
    const existante = await deja(client);
    if (existante !== null) {
      await client.query("COMMIT");
      enTransaction = false;
      return existante;
    }
    await client.query(SQL_ORPHELINES, [regles.dureeMaxMs + MARGE_ORPHELINE_MS]);
    const prealable = await avant(client);
    const refus = prealable ?? refusDuForfait(lireSommes((await client.query(SQL_SOMMES)).rows[0]), forfait, regles.limites, regles.uniteQuotaRoutes);
    if (refus !== null) {
      await client.query("ROLLBACK");
      enTransaction = false;
      return { refus };
    }
    const resultat = await inserer(client);
    await client.query("COMMIT");
    enTransaction = false;
    return resultat;
  } catch {
    if (enTransaction) await client.query("ROLLBACK").catch(() => undefined);
    return { refus: "usage_unavailable" };
  } finally {
    client.release();
  }
}

const valeursForfait = (forfait: Forfait, runId: string | null) => [
  forfait.nature,
  runId,
  forfait.textSearchRequetes,
  forfait.placeDetailsRequetes,
  forfait.routesRequetes,
  forfait.routesElements,
  forfait.coutGoogleMicros,
  forfait.coutModelesMicros,
];

/**
 * Lancement d'une exécution : forfait réservé avec la ligne `runs` dans la même transaction. Aucune limite du nombre
 * d'exécutions par jour de quota (décision 0071, qui lève la règle de 0046 D13 point 3).
 */
export async function reserverExecution(pool: PoolSql, demande: DemandeExecution, regles: ReglesForfait): Promise<ResultatLancement> {
  if (demande.forfait.nature !== "execution") return { ok: false, code: "usage_unavailable" };
  const saisi = demande.briefSaisi;
  if ((saisi !== undefined) !== (demande.brief === BRIEF_SAISI)) return { ok: false, code: "usage_unavailable" };
  const resultat = await reserver(
    pool,
    demande.forfait,
    regles,
    async () => null,
    async (client): Promise<{ runId: string; existante?: true; destination?: string }> => {
      const { rows } = await client.query(SQL_INSERER_RUN, [demande.mode, demande.brief, demande.variant, demande.commitSha]);
      const runId = rows[0]?.id;
      if (typeof runId !== "string") throw new Error("forfait: exécution non créée");
      await client.query(SQL_INSERER_FORFAIT, valeursForfait(demande.forfait, runId));
      if (saisi !== undefined) await client.query(SQL_INSERER_BRIEF, [runId, saisi.requestId, JSON.stringify(saisi.contenu)]);
      return { runId };
    },
    // Idempotence du lancement depuis l'app (décision 0125 § 2) : sous le verrou, avant le contrôle du forfait, une clé
    // déjà écrite rend son exécution et la destination de **son** brief (le voyage d'origine), sans rien écrire.
    async (client) => {
      if (saisi === undefined) return null;
      const ligne = (await client.query(SQL_RUN_DU_LANCEMENT, [saisi.requestId])).rows[0];
      if (typeof ligne?.run_id !== "string" || typeof ligne.destination !== "string") return null;
      return { runId: ligne.run_id, existante: true as const, destination: ligne.destination };
    },
  );
  if ("refus" in resultat) return { ok: false, code: resultat.refus };
  return resultat.existante && resultat.destination !== undefined
    ? { ok: true, runId: resultat.runId, existante: true, destination: resultat.destination }
    : { ok: true, runId: resultat.runId };
}

/** Début d'une relecture : forfait de relecture réservé (aucune ligne `runs`). */
export async function reserverRelecture(pool: PoolSql, forfait: Forfait, regles: ReglesForfait): Promise<ResultatRelecture> {
  if (forfait.nature !== "relecture") return { ok: false, code: "usage_unavailable" };
  const resultat = await reserver(
    pool,
    forfait,
    regles,
    async () => null,
    async (client) => {
      await client.query(SQL_INSERER_FORFAIT, valeursForfait(forfait, null));
      return { inscrit: true as const };
    },
  );
  return "refus" in resultat ? { ok: false, code: resultat.refus } : { ok: true };
}

/**
 * Recherche de ville du site d'essai (décision 0129 § 3) : une ligne `forfaits` de nature `ville` par action, **avant**
 * tout appel Google. Suggestions : `autocomplete_requests` = 1 ; choix : `place_details_requests` = 1 (fiche Essentials).
 * Coût au prix plein de la table de prix, compté dans le mois Google des sommes ci-dessus (`google_cost_micros`).
 */
export type DemandeVille = {
  readonly action: "suggestions" | "choix";
  /** Empreinte du cookie d'accès (`empreinteCookieAcces`), 64 caractères hexadécimaux. */
  readonly empreinte: string;
  /** Coût de l'action au prix plein, en micro-USD (table de prix). */
  readonly coutGoogleMicros: number;
};

/** Limites de la recherche de ville (décision 0129 § 3). */
export type LimitesVille = {
  /** Suggestions par jour de quota Google (Pacifique, `prototype.quota_day_at`). */
  readonly suggestionsParJour: number;
  /** Choix (fiches) par jour de quota Google. */
  readonly choixParJour: number;
  /** Actions (suggestions et choix) d'un même cookie par minute glissante. */
  readonly actionsParMinuteEtCookie: number;
};

/** Refus de la recherche de ville : plafond du jour, débit du cookie, ou base indisponible (échec fermé). */
export type CodeRefusVille = "ville_jour_atteint" | "ville_debit_atteint" | "usage_unavailable";
export type ResultatVille = { readonly ok: true } | { readonly ok: false; readonly code: CodeRefusVille };

const FORME_EMPREINTE = /^[0-9a-f]{64}$/;

const SQL_SOMMES_VILLE = `SELECT
  COALESCE(SUM(f.autocomplete_requests) FILTER (WHERE f.quota_day = prototype.quota_day_at(pg_catalog.now())), 0) AS jour_suggestions,
  COALESCE(SUM(f.place_details_requests) FILTER (WHERE f.quota_day = prototype.quota_day_at(pg_catalog.now())), 0) AS jour_choix,
  pg_catalog.count(*) FILTER (WHERE f.acces_empreinte = $1 AND f.created_at > pg_catalog.now() - pg_catalog.make_interval(secs => 60)) AS minute_cookie
FROM prototype.forfaits AS f WHERE f.nature = 'ville'`;

const SQL_INSERER_VILLE = `INSERT INTO prototype.forfaits
  (nature, run_id, text_search_requests, place_details_requests, routes_requests, routes_elements, google_cost_micros, models_cost_micros,
   autocomplete_requests, acces_empreinte)
  VALUES ('ville', NULL, 0, $1, 0, 0, $2, NULL, $3, $4)`;

/**
 * Réservation d'une action de recherche de ville : même transaction que les autres forfaits (contexte d'organisation,
 * verrou consultatif du port), puis sommes du jour de quota et débit du cookie ; au plafond, refus sans rien écrire.
 * Toute erreur (base absente, migration 0019 non appliquée) rend `usage_unavailable` : aucun appel Google ne suit.
 */
export async function reserverVille(pool: PoolSql, demande: DemandeVille, limites: LimitesVille): Promise<ResultatVille> {
  if (!FORME_EMPREINTE.test(demande.empreinte) || !Number.isSafeInteger(demande.coutGoogleMicros) || demande.coutGoogleMicros < 0) {
    return { ok: false, code: "usage_unavailable" };
  }
  let client: ClientSql;
  try {
    client = await pool.connect();
  } catch {
    return { ok: false, code: "usage_unavailable" };
  }
  let enTransaction = false;
  try {
    await client.query("BEGIN");
    enTransaction = true;
    await client.query("SELECT pg_catalog.set_config('app.organization_id', $1, true)", [ORGANISATION_PROTOTYPE]);
    await client.query("SELECT pg_catalog.pg_advisory_xact_lock($1)", [CLE_VERROU_FORFAIT]);
    const ligne = (await client.query(SQL_SOMMES_VILLE, [demande.empreinte])).rows[0];
    const suggestions = nombre(ligne?.jour_suggestions);
    const choix = nombre(ligne?.jour_choix);
    const minute = nombre(ligne?.minute_cookie);
    const refus: CodeRefusVille | null =
      minute >= limites.actionsParMinuteEtCookie
        ? "ville_debit_atteint"
        : (demande.action === "suggestions" ? suggestions >= limites.suggestionsParJour : choix >= limites.choixParJour)
          ? "ville_jour_atteint"
          : null;
    if (refus !== null) {
      await client.query("ROLLBACK");
      enTransaction = false;
      return { ok: false, code: refus };
    }
    const estChoix = demande.action === "choix";
    await client.query(SQL_INSERER_VILLE, [estChoix ? 1 : 0, demande.coutGoogleMicros, estChoix ? 0 : 1, demande.empreinte]);
    await client.query("COMMIT");
    enTransaction = false;
    return { ok: true };
  } catch {
    if (enTransaction) await client.query("ROLLBACK").catch(() => undefined);
    return { ok: false, code: "usage_unavailable" };
  } finally {
    client.release();
  }
}
