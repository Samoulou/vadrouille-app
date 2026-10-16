import "server-only";

import type { CodeEchecSuivi, ExecutionSuivie, StatutExecution, SuiviPrototype } from "@/contracts/prototype-suivi";
import type { PhaseTravail } from "@/contracts/prototype-travail";
import type { ClientSql, PoolSql } from "@/server/usage/neon";

/**
 * Lecture du suivi des exécutions du prototype pour la page de lancement (décision 0055, section 8, ligne P0r3d ; 0046,
 * D15 point 6, D24 et S4) : **implémentation unique** du contrat `src/contracts/prototype-suivi.ts`, importée par
 * `src/server/p0/page-acces.ts` et `src/server/p0/lancement.ts` seulement (et leurs tests).
 *
 * Lectures seulement, sous `vadrouille_prototype` (`SELECT` de `runs`, `programmes` et `purges`, politiques liées à
 * l'uuid fixe) : jamais la table de travail (« aucun rapport ne la lit », D24), jamais `forfaits`,
 * jamais `place_coordinates` (aucune position n'est lue par la page, 0052 S6). Valeurs toujours en paramètres liés ;
 * erreurs réduites à un code fermé, jamais un message, une valeur ni un paramètre.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const JOUR = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const INSTANT = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/;
const BRIEF = /^[a-z0-9][a-z0-9-]{0,62}\.json$/;
const COMMIT = /^[0-9a-f]{40}$/;
/** Forme d'un code d'arrêt ; la liste fermée est tenue par le `CHECK` de `prototype.runs.stop_code`. */
const CODE_ARRET = /^[a-z_]{1,40}$/;

/** Égales à `PHASES` de `src/prototype/arret.ts` (test d'égalité ; l'application n'importe pas `src/prototype`, 0048 § 1). */
export const PHASES_SUIVIES: readonly PhaseTravail[] = ["recherche", "ancrage", "notation", "planification", "raisons", "validation", "ecriture"];
const STATUTS: readonly StatutExecution[] = ["en_cours", "programme_ecrit", "arretee"];

/** Exécutions, de la plus récente à la plus ancienne ; coût et écoulé pendant l'exécution seulement (S4). */
export const SQL_EXECUTIONS = `SELECT id::text AS id, mode, brief, variant, status, phase, stop_code, cost_models_micros,
  CASE WHEN status = 'en_cours'
    THEN pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.now() - started_at) * 1000)::bigint END AS ecoule_ms,
  pg_catalog.to_char(quota_day, 'YYYY-MM-DD') AS jour_quota, canary_ok, commit_sha
FROM prototype.runs ORDER BY started_at DESC, id LIMIT 1001`;
/**
 * Exécutions lues au plus. Au-delà, le décompte affiché serait faux : la lecture échoue (`base`, échec fermé : la page
 * affiche le suivi indisponible) au lieu de tronquer. Depuis la décision 0071, le nombre d'exécutions par jour n'est plus
 * borné et le lancement ne lit plus le suivi : atteindre cette borne n'empêche aucun lancement.
 */
export const EXECUTIONS_MAX = 1000;
/** Date de la dernière purge réussie (D16 point 6), en UTC ; aucun compte de lignes. */
export const SQL_DERNIERE_PURGE = `SELECT pg_catalog.to_char(pg_catalog.max(purged_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS derniere
FROM prototype.purges`;
/** Contenu du programme d'une exécution (sans positions, Q324), s'il n'est pas expiré (politique de lecture). */
export const SQL_CONTENU = "SELECT contenu FROM prototype.programmes WHERE run_id = $1::uuid";
/** Échec : code de la liste fermée, sans valeur. */
export class EchecSuivi extends Error {
  constructor(readonly code: CodeEchecSuivi) {
    super(`suivi du prototype (${code})`);
    this.name = "EchecSuivi";
  }
}

/** Une connexion, une lecture ; toute erreur (connexion, requête, ligne illisible) devient `base`. */
async function lecture<T>(pool: PoolSql, lire: (client: ClientSql) => Promise<T>): Promise<T> {
  let client: ClientSql;
  try {
    client = await pool.connect();
  } catch {
    throw new EchecSuivi("base");
  }
  try {
    return await lire(client);
  } catch (erreur) {
    if (erreur instanceof EchecSuivi) throw erreur;
    throw new EchecSuivi("base");
  } finally {
    client.release();
  }
}

const entierOuNul = (valeur: unknown): number | null => {
  if (valeur === null) return null;
  const n = typeof valeur === "string" || typeof valeur === "number" ? Number(valeur) : Number.NaN;
  if (!Number.isSafeInteger(n) || n < 0) throw new EchecSuivi("base");
  return n;
};

const choix = <T extends string>(valeur: unknown, admis: readonly T[]): T => {
  if (typeof valeur !== "string" || !(admis as readonly string[]).includes(valeur)) throw new EchecSuivi("base");
  return valeur as T;
};

const forme = (valeur: unknown, motif: RegExp): string => {
  if (typeof valeur !== "string" || !motif.test(valeur)) throw new EchecSuivi("base");
  return valeur;
};

/** Ligne de `prototype.runs` contrôlée champ par champ (forme et listes fermées), ou `base`. */
function execution(ligne: Record<string, unknown>): ExecutionSuivie {
  const statut = choix(ligne.status, STATUTS);
  const enCours = statut === "en_cours";
  const phase = ligne.phase === null ? null : choix(ligne.phase, PHASES_SUIVIES);
  const codeArret = ligne.stop_code === null ? null : forme(ligne.stop_code, CODE_ARRET);
  const coutModelesMicros = entierOuNul(ligne.cost_models_micros);
  // Horloges de la base légèrement décalées : un écoulé négatif compte pour zéro.
  const ecouleMs = ligne.ecoule_ms === null ? null : entierOuNul(Math.max(0, Number(ligne.ecoule_ms)));
  // Invariants de S4, tenus par la base (`CHECK`) et revérifiés : rien de l'exécution ne reste après sa fin.
  if ((!enCours && (phase !== null || coutModelesMicros !== null || ecouleMs !== null)) || (codeArret !== null) !== (statut === "arretee")) {
    throw new EchecSuivi("base");
  }
  const canaryOk = ligne.canary_ok;
  if (canaryOk !== null && typeof canaryOk !== "boolean") throw new EchecSuivi("base");
  return {
    id: forme(ligne.id, UUID),
    mode: choix(ligne.mode, ["reel", "essai"] as const),
    brief: forme(ligne.brief, BRIEF),
    variante: choix(ligne.variant, ["A", "B"] as const),
    statut,
    phase,
    codeArret,
    coutModelesMicros,
    ecouleMs,
    jourQuota: forme(ligne.jour_quota, JOUR),
    canaryOk,
    commitSha: forme(ligne.commit_sha, COMMIT),
  };
}

/** Exécutions et date de la dernière purge réussie. */
export async function lireSuivi(pool: PoolSql): Promise<SuiviPrototype> {
  return lecture(pool, async (client) => {
    const lignes = (await client.query(SQL_EXECUTIONS)).rows;
    if (lignes.length > EXECUTIONS_MAX) throw new EchecSuivi("base");
    const executions = lignes.map(execution);
    const derniere = (await client.query(SQL_DERNIERE_PURGE)).rows[0]?.derniere ?? null;
    return { executions, dernierePurge: derniere === null ? null : forme(derniere, INSTANT) };
  });
}

/**
 * Contenu du programme écrit d'une exécution (forme réduite sans positions), ou `null` s'il n'y en a pas (arrêt, ou
 * programme expiré et purgé). Le contenu n'est rendu qu'à l'appelant, pour le calcul en mémoire des critères du
 * rapport ; il n'est jamais journalisé.
 */
export async function lireContenuProgramme(pool: PoolSql, runId: string): Promise<unknown> {
  if (typeof runId !== "string" || !UUID.test(runId)) throw new EchecSuivi("entree_refusee");
  return lecture(pool, async (client) => {
    const lignes = (await client.query(SQL_CONTENU, [runId])).rows;
    if (lignes.length > 1) throw new EchecSuivi("base");
    return lignes[0]?.contenu ?? null;
  });
}
