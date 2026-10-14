import "server-only";

import { cookieAccesValide, ouvertureP0, type CodeGardeFermee, type DependancesAcces } from "@/server/p0/acces";
import type { PoolSql, ResultatLancement } from "@/server/usage/neon";
import type { CodeRefusUsage } from "@/server/usage/port";

/**
 * Garde complète du mode réel (décision 0055, section 1 point 2, D19 ; avis de la Sécurité S-1). Deux entrées, qui
 * rendent la même preuve `GardeOuverte` :
 * - `ouvrirGardeLancement` : au lancement d'une exécution (action serveur de P0r3d) ;
 * - `verifierGardeEtape` : à l'entrée de **chaque** étape de `p0Run` (P0r3c).
 * Garde fermée : aucune lecture de clé de service, aucune connexion à la base au-delà de la lecture de l'exécution
 * par l'étape, aucun appel externe. Les codes rendus sont internes (tests et journal) ; vers l'extérieur, une seule
 * réponse (page absente, `invalid_code` ou `too_many_attempts`).
 */

/**
 * Preuve que la garde est ouverte, pour une exécution réservée (`runId`). Type de marque : fabriqué **par ce module
 * seul** (aucune conversion, assertion ni prédicat de type ailleurs, tests exceptés : règle `no-restricted-syntax`
 * d'`eslint.config.mjs`, la même que celle de `CanonicalEmail`). La marque n'a pas de valeur exploitable à
 * l'exécution : la sûreté repose sur `verifierGardeEtape` à l'entrée de chaque étape, pas sur le type seul (S-1
 * point 3).
 */
export type GardeOuverte = { readonly runId: string; readonly __brand: "GardeOuverte" };

/** Codes de la garde fermée : environnement et déploiement, accès, réservation, exécution. */
export type CodeGarde = CodeGardeFermee | "access_refused" | "run_refused" | CodeRefusUsage;

export type ResultatGarde = { readonly ok: true; readonly garde: GardeOuverte } | { readonly ok: false; readonly code: CodeGarde };

const preuve = (runId: string): GardeOuverte => Object.freeze({ runId }) as GardeOuverte;

/** Identifiant d'exécution : uuid écrit par la base (`prototype.runs.id`). */
const FORME_RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type DependancesLancement = DependancesAcces & {
  /** Valeur du cookie `__Host-p0_acces` reçu avec la requête de lancement. */
  readonly cookie: string | undefined;
  /** Réservation du jour et des plafonds par le port de consommation de P0r2 (`reserverExecution`). */
  readonly reserver: () => Promise<ResultatLancement>;
};

/**
 * Lancement : conditions (1) à (7), déploiement autre que la production, cookie d'accès valide, puis réservation du
 * jour réussie et plafonds non atteints. Le code saisi n'entre pas ici : il ouvre l'accès par la page de saisie
 * (`saisirCodeAcces`), qui pose le cookie ; seul le cookie prouve l'accès au lancement.
 */
export async function ouvrirGardeLancement(dependances: DependancesLancement): Promise<ResultatGarde> {
  const ouverture = ouvertureP0(dependances);
  if (!ouverture.ok) return ouverture;
  const maintenant = (dependances.maintenant ?? Date.now)();
  if (!cookieAccesValide(dependances.cookie, ouverture.attendu, maintenant)) return { ok: false, code: "access_refused" };
  let reservation: ResultatLancement;
  try {
    reservation = await dependances.reserver();
  } catch {
    return { ok: false, code: "usage_unavailable" };
  }
  if (!reservation.ok) return reservation;
  return { ok: true, garde: preuve(reservation.runId) };
}

export type DependancesEtape = DependancesAcces & {
  /** Pool `vadrouille_prototype` (lecture de `prototype.runs` et `prototype.forfaits`). */
  readonly pool: () => PoolSql;
  /** Durée maximale d'une exécution (`dureeMs` de la configuration du mode : 15 minutes). */
  readonly dureeMaxMs: number;
};

/**
 * Exécution `runId` existante, `en_cours`, du jour de quota courant (posé par la base, S1), forfait d'exécution
 * réservé, durée maximale non dépassée.
 */
const SQL_EXECUTION = `SELECT 1 AS ok FROM prototype.runs AS r
JOIN prototype.forfaits AS f ON f.run_id = r.id AND f.nature = 'execution'
WHERE r.id = $1::uuid AND r.status = 'en_cours' AND r.mode IN ('reel', 'essai')
  AND r.quota_day = prototype.quota_day_at(pg_catalog.now())
  AND r.started_at > pg_catalog.now() - pg_catalog.make_interval(secs => $2::double precision / 1000)`;

/**
 * Étape de `p0Run` : conditions (1) à (7), déploiement autre que la production, puis exécution réservée par le
 * lancement. Une étape n'a pas de cookie (aucune requête) : le code est vérifié au lancement seulement.
 */
export async function verifierGardeEtape(runId: string, dependances: DependancesEtape): Promise<ResultatGarde> {
  const ouverture = ouvertureP0(dependances);
  if (!ouverture.ok) return ouverture;
  if (typeof runId !== "string" || !FORME_RUN_ID.test(runId)) return { ok: false, code: "run_refused" };
  if (!Number.isSafeInteger(dependances.dureeMaxMs) || dependances.dureeMaxMs <= 0) return { ok: false, code: "run_refused" };
  let trouvee = false;
  try {
    const client = await dependances.pool().connect();
    try {
      trouvee = (await client.query(SQL_EXECUTION, [runId, dependances.dureeMaxMs])).rows.length === 1;
    } finally {
      client.release();
    }
  } catch {
    return { ok: false, code: "usage_unavailable" };
  }
  return trouvee ? { ok: true, garde: preuve(runId) } : { ok: false, code: "run_refused" };
}
