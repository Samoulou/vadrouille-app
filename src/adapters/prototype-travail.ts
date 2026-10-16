import "server-only";

import type { CodeEchecTravail, ExecutionEnCours, LigneCandidat, PhaseTravail } from "@/contracts/prototype-travail";
import { PLACE_ID_PATTERN, PROTOTYPE_ORG_ID } from "@/prototype/programme-reduit";
import type { ClientSql, PoolSql } from "@/server/usage/neon";

/**
 * Table de travail et registre d'une exécution `p0Run` (décision 0046, D15, D24, S1 et S4 ; 0009 point 3 et 0011 § 3) :
 * **implémentation unique** du contrat `src/contracts/prototype-travail.ts`, importée par `src/workflows/p0-run.ts` et
 * ses tests seulement (comme `prototype-ecriture.ts`, 0052 § 1.10) ; ni fabrique ni réexportation par
 * `src/adapters/index.ts`.
 *
 * Droits de `vadrouille_prototype` respectés (0046, D15 point 6) : `SELECT` ; `UPDATE` de `runs` par colonnes
 * (`phase`, `cost_models_micros`, `status`, `stop_code`) ; `INSERT` et `DELETE` de `run_candidates` (aucun `UPDATE` :
 * une étape qui change les candidats les remplace dans une transaction). Les lignes d'une exécution qui n'est plus
 * `en_cours` ne sont jamais écrites. Valeurs toujours en paramètres liés ; erreurs réduites à un code fermé et au
 * SQLSTATE, jamais un message ni un paramètre.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CLE = /^c_[0-9]{3}$/;
const SQLSTATE = /^[0-9A-Z]{5}$/;
/** Forme d'un code d'arrêt ; la liste fermée est tenue par le `CHECK` de `prototype.runs.stop_code`. */
const CODE_ARRET = /^[a-z_]{1,40}$/;
/** Égales à `PHASES` de `src/prototype/arret.ts` (test d'égalité ; l'application n'importe pas `src/prototype`, 0048 § 1). */
export const PHASES_TRAVAIL: readonly PhaseTravail[] = ["recherche", "ancrage", "notation", "planification", "raisons", "validation", "ecriture"];
/** Candidats d'une exécution au plus (`BORNES_PLAFONDS.candidatsTrouves`, test d'égalité ; clés `c_000` à `c_999`). */
export const CANDIDATS_MAX = 300;
/** Coût des modèles au plus, en micro-USD : 3 USD, plafond de Samuel (Q270) ; `BORNES_PLAFONDS.coutUsd`, test d'égalité. */
export const COUT_MAX_MICROS = 3_000_000;
const CENT_MICROS = 10_000;

const SQL_CONTEXTE = "SELECT pg_catalog.set_config('app.organization_id', $1, true)";
const SQL_EXECUTION = `SELECT r.mode, r.brief, r.variant, r.cost_models_micros, pg_catalog.to_char(r.quota_day, 'YYYY-MM-DD') AS jour_quota,
  pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.now() - r.started_at) * 1000)::bigint AS ecoule_ms,
  (SELECT pg_catalog.count(*) FROM prototype.runs AS a
    WHERE a.quota_day = r.quota_day AND a.mode IN ('reel', 'essai') AND (a.started_at, a.id) <= (r.started_at, r.id)) AS numero_jour
FROM prototype.runs AS r WHERE r.id = $1::uuid AND r.status = 'en_cours'`;
const SQL_PHASE_EN_COURS = `SELECT phase FROM prototype.runs WHERE id = $1::uuid AND status = 'en_cours' FOR UPDATE`;
const SQL_PHASE = `UPDATE prototype.runs SET phase = $2 WHERE id = $1::uuid AND status = 'en_cours' RETURNING id`;
const JOUR = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const SQL_COUT = `UPDATE prototype.runs SET cost_models_micros = GREATEST(COALESCE(cost_models_micros, 0), $2::bigint)
WHERE id = $1::uuid AND status = 'en_cours' RETURNING id`;
const SQL_EN_COURS = `SELECT 1 FROM prototype.runs WHERE id = $1::uuid AND status = 'en_cours' FOR UPDATE`;
const SQL_SUPPRIMER = "DELETE FROM prototype.run_candidates WHERE run_id = $1::uuid";
const SQL_INSERER = "INSERT INTO prototype.run_candidates (run_id, cle, candidat, place_id) VALUES ($1::uuid, $2, $3::jsonb, $4)";
const SQL_CANDIDATS = "SELECT cle, candidat, place_id FROM prototype.run_candidates WHERE run_id = $1::uuid ORDER BY cle";
const SQL_CLORE = `UPDATE prototype.runs SET status = 'arretee', stop_code = $2, phase = NULL, cost_models_micros = NULL
WHERE id = $1::uuid AND status = 'en_cours' RETURNING id`;

/** Échec : code de la liste fermée et, pour `base`, le SQLSTATE seul. Aucune valeur. */
export class EchecTravail extends Error {
  constructor(
    readonly code: CodeEchecTravail,
    readonly sqlstate?: string,
  ) {
    super(sqlstate === undefined ? `table de travail (${code})` : `table de travail (${code}, ${sqlstate})`);
    this.name = "EchecTravail";
  }
}

const codeSql = (erreur: unknown): string | undefined => {
  const code = (erreur as { code?: unknown } | null)?.code;
  return typeof code === "string" && SQLSTATE.test(code) ? code : undefined;
};

const runIdControle = (runId: string) => {
  if (typeof runId !== "string" || !UUID.test(runId)) throw new EchecTravail("entree_refusee");
  return runId;
};

/** Une connexion, une transaction (contexte d'organisation posé), `COMMIT` ou `ROLLBACK` ; erreurs réduites. */
async function transaction<T>(pool: PoolSql, travail: (client: ClientSql) => Promise<T>): Promise<T> {
  let client: ClientSql;
  try {
    client = await pool.connect();
  } catch (erreur) {
    throw new EchecTravail("base", codeSql(erreur));
  }
  let enTransaction = false;
  try {
    await client.query("BEGIN");
    enTransaction = true;
    await client.query(SQL_CONTEXTE, [PROTOTYPE_ORG_ID]);
    const resultat = await travail(client);
    await client.query("COMMIT");
    enTransaction = false;
    return resultat;
  } catch (erreur) {
    if (enTransaction) await client.query("ROLLBACK").catch(() => undefined);
    if (erreur instanceof EchecTravail) throw erreur;
    throw new EchecTravail("base", codeSql(erreur));
  } finally {
    client.release();
  }
}

/** Exécution `en_cours` : mode, brief, variante et coût des modèles déjà compté ; `execution_absente` sinon. */
export async function lireExecution(pool: PoolSql, runId: string): Promise<ExecutionEnCours> {
  const id = runIdControle(runId);
  return transaction(pool, async (client) => {
    const ligne = (await client.query(SQL_EXECUTION, [id])).rows[0];
    if (ligne === undefined) throw new EchecTravail("execution_absente");
    const cout = ligne.cost_models_micros === null ? 0 : Number(ligne.cost_models_micros);
    const ecoule = typeof ligne.ecoule_ms === "string" || typeof ligne.ecoule_ms === "number" ? Number(ligne.ecoule_ms) : Number.NaN;
    const numero = typeof ligne.numero_jour === "string" || typeof ligne.numero_jour === "number" ? Number(ligne.numero_jour) : Number.NaN;
    const { mode, brief, variant, jour_quota: jourQuota } = ligne;
    if (
      (mode !== "reel" && mode !== "essai") ||
      typeof brief !== "string" ||
      (variant !== "A" && variant !== "B") ||
      !Number.isSafeInteger(cout) ||
      cout < 0 ||
      typeof jourQuota !== "string" ||
      !JOUR.test(jourQuota) ||
      !Number.isSafeInteger(ecoule) ||
      !Number.isSafeInteger(numero) ||
      numero < 1
    ) {
      throw new EchecTravail("base");
    }
    // Horloges de la base et du serveur légèrement décalées : un écoulé négatif compte pour zéro.
    return { mode, brief, variante: variant, coutModelesMicros: cout, jourQuota, numeroDuJour: numero, ecouleMs: Math.max(0, ecoule) };
  });
}

/**
 * Phase de l'exécution `en_cours` (S4 : remise à nul par la clôture ou l'écriture du programme). **Garde
 * d'idempotence** (P0r3c-5 ; mineur 6 de la revue du head `608ee99`, PR 348) : chaque phase n'est écrite qu'une fois, et
 * seulement si la phase en base est celle qui la précède dans `PHASES_TRAVAIL` (aucune pour `recherche`), sous verrou de
 * la ligne. Une étape redistribuée par la file après expiration retrouve sa propre phase déjà écrite : refus
 * `phase_deja_passee`, avant tout appel, au lieu de repayer ses appels.
 */
export async function ecrirePhase(pool: PoolSql, runId: string, phase: PhaseTravail): Promise<void> {
  const id = runIdControle(runId);
  const rang = PHASES_TRAVAIL.indexOf(phase);
  if (rang < 0) throw new EchecTravail("entree_refusee");
  const precedente = rang === 0 ? null : PHASES_TRAVAIL[rang - 1];
  await transaction(pool, async (client) => {
    const ligne = (await client.query(SQL_PHASE_EN_COURS, [id])).rows[0];
    if (ligne === undefined) throw new EchecTravail("execution_absente");
    if (ligne.phase !== precedente) throw new EchecTravail("phase_deja_passee");
    if ((await client.query(SQL_PHASE, [id, phase])).rows.length !== 1) throw new EchecTravail("execution_absente");
  });
}

/**
 * Coût des modèles compté **depuis le début** de l'exécution, arrondi au cent supérieur (D24), jamais abaissé : l'étape
 * suivante le relit et ne dispose que du reste du plafond.
 */
export async function ecrireCoutModeles(pool: PoolSql, runId: string, totalMicros: number): Promise<void> {
  const id = runIdControle(runId);
  if (!Number.isFinite(totalMicros) || totalMicros < 0) throw new EchecTravail("entree_refusee");
  const arrondi = Math.min(Math.ceil(totalMicros / CENT_MICROS) * CENT_MICROS, COUT_MAX_MICROS);
  await transaction(pool, async (client) => {
    if ((await client.query(SQL_COUT, [id, arrondi])).rows.length !== 1) throw new EchecTravail("execution_absente");
  });
}

/**
 * Remplace les candidats de l'exécution `en_cours` (suppression puis insertion, dans une transaction ; l'exécution est
 * verrouillée et doit être `en_cours`). Contrôles avant toute requête : clés `c_000` distinctes, contenu objet,
 * `place_id` à la forme Google ou nul, 300 lignes au plus.
 */
export async function remplacerCandidats(pool: PoolSql, runId: string, lignes: readonly LigneCandidat[]): Promise<void> {
  const id = runIdControle(runId);
  if (lignes.length > CANDIDATS_MAX) throw new EchecTravail("entree_refusee");
  const cles = new Set<string>();
  const valeurs: [string, string, string | null][] = [];
  for (const ligne of lignes) {
    const contenu = ligne.candidat;
    if (!CLE.test(ligne.cle) || cles.has(ligne.cle) || typeof contenu !== "object" || contenu === null || Array.isArray(contenu)) {
      throw new EchecTravail("entree_refusee");
    }
    if (ligne.placeId !== null && (typeof ligne.placeId !== "string" || !PLACE_ID_PATTERN.test(ligne.placeId))) throw new EchecTravail("entree_refusee");
    cles.add(ligne.cle);
    valeurs.push([ligne.cle, JSON.stringify(contenu), ligne.placeId]);
  }
  await transaction(pool, async (client) => {
    if ((await client.query(SQL_EN_COURS, [id])).rows.length !== 1) throw new EchecTravail("execution_absente");
    await client.query(SQL_SUPPRIMER, [id]);
    for (const [cle, contenu, placeId] of valeurs) await client.query(SQL_INSERER, [id, cle, contenu, placeId]);
  });
}

/** Candidats de l'exécution `en_cours`, dans l'ordre des clés. */
export async function lireCandidats(pool: PoolSql, runId: string): Promise<LigneCandidat[]> {
  const id = runIdControle(runId);
  return transaction(pool, async (client) => {
    if ((await client.query(SQL_EN_COURS, [id])).rows.length !== 1) throw new EchecTravail("execution_absente");
    return (await client.query(SQL_CANDIDATS, [id])).rows.map((ligne) => {
      const { cle, candidat, place_id: placeId } = ligne;
      if (typeof cle !== "string" || typeof candidat !== "object" || candidat === null || (placeId !== null && typeof placeId !== "string")) {
        throw new EchecTravail("base");
      }
      return { cle, candidat: candidat as Record<string, unknown>, placeId };
    });
  });
}

/**
 * Clôture d'une exécution arrêtée : candidats supprimés, puis `arretee` avec son code persisté (S4), phase et coût
 * remis à nul. Sans effet si l'exécution n'est plus `en_cours` (déjà close ou programme écrit).
 */
export async function cloreExecution(pool: PoolSql, runId: string, codeArret: string): Promise<void> {
  const id = runIdControle(runId);
  if (typeof codeArret !== "string" || !CODE_ARRET.test(codeArret)) throw new EchecTravail("entree_refusee");
  await transaction(pool, async (client) => {
    if ((await client.query(SQL_EN_COURS, [id])).rows.length !== 1) return;
    await client.query(SQL_SUPPRIMER, [id]);
    await client.query(SQL_CLORE, [id, codeArret]);
  });
}
