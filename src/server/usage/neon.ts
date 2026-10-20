import "server-only";

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
  /** Nom de fichier de `prototype/briefs/`. */
  readonly brief: string;
  readonly variant: "A" | "B";
  readonly commitSha: string;
  readonly forfait: Forfait;
};

export type ResultatLancement = { readonly ok: true; readonly runId: string } | { readonly ok: false; readonly code: CodeRefusUsage };
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
  const resultat = await reserver(
    pool,
    demande.forfait,
    regles,
    async () => null,
    async (client) => {
      const { rows } = await client.query(SQL_INSERER_RUN, [demande.mode, demande.brief, demande.variant, demande.commitSha]);
      const runId = rows[0]?.id;
      if (typeof runId !== "string") throw new Error("forfait: exécution non créée");
      await client.query(SQL_INSERER_FORFAIT, valeursForfait(demande.forfait, runId));
      return { runId };
    },
  );
  return "refus" in resultat ? { ok: false, code: resultat.refus } : { ok: true, runId: resultat.runId };
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
