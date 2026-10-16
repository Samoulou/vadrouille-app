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
 * Marque de `GardeOuverte` : symbole unique **non exporté** (déclaré seulement, sans valeur à l'exécution). Hors de ce
 * module, aucune expression ne peut nommer la propriété `[MARQUE]` : un littéral `{ runId, … }` n'est jamais une
 * `GardeOuverte` sans conversion (test de type `@ts-expect-error` dans `tests/unit/p0/garde-marque.test.ts`).
 */
declare const MARQUE: unique symbol;

/**
 * Preuve que la garde est ouverte, pour une exécution réservée (`runId`). Type de marque fabriqué **par ce module
 * seul** : la propriété `[MARQUE]` est infalsifiable hors d'ici, et toute conversion, assertion ou prédicat de type
 * ailleurs est refusé (règle `no-restricted-syntax` d'`eslint.config.mjs`, la même que celle de `CanonicalEmail` ;
 * tests de `tests/` exceptés). La marque n'a pas de valeur exploitable à l'exécution : la sûreté repose sur
 * `verifierGardeEtape` à l'entrée de chaque étape, pas sur le type seul (S-1 point 3).
 */
export type GardeOuverte = { readonly runId: string; readonly [MARQUE]: true };

/**
 * Refus du lancement rendus par `reserver` **avant** la réservation, garde déjà ouverte (P0r3d) : choix refusé
 * (`entree_invalide`) et mode réel indisponible (`real_mode_unavailable` : `p0Run` non démarrable, configuration refusée
 * ou verrou S8 fermé) et brief hors des plafonds du mode (`brief_hors_plafonds`, ticket 400 : plan Routes ou fiches
 * de la première série au-delà des plafonds). Rien n'est écrit. Le décompte atteint (`run_quota_reached`, D24) ne
 * refuse plus depuis la décision 0071.
 */
export type CodeRefusAvantReservation = "entree_invalide" | "real_mode_unavailable" | "brief_hors_plafonds";

/** Codes de la garde fermée : environnement et déploiement, accès, réservation, exécution. */
export type CodeGarde = CodeGardeFermee | "access_refused" | "run_refused" | CodeRefusUsage | CodeRefusAvantReservation;

export type ResultatGarde = { readonly ok: true; readonly garde: GardeOuverte } | { readonly ok: false; readonly code: CodeGarde };

const preuve = (runId: string): GardeOuverte => Object.freeze({ runId }) as GardeOuverte;

/** Identifiant d'exécution : uuid écrit par la base (`prototype.runs.id`). */
const FORME_RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type DependancesLancement = DependancesAcces & {
  /** Valeur du cookie `__Host-p0_acces` reçu avec la requête de lancement. */
  readonly cookie: string | undefined;
  /**
   * Réservation du forfait par le port de consommation de P0r2 (`reserverExecution`), précédée des
   * contrôles du lancement qui peuvent la refuser sans rien écrire (`CodeRefusAvantReservation`).
   */
  readonly reserver: () => Promise<ResultatLancement | { readonly ok: false; readonly code: CodeRefusAvantReservation }>;
};

/**
 * Lancement : conditions (1) à (7), déploiement autre que la production, cookie d'accès valide, puis réservation du
 * forfait réussie (sans limite du jour, du mois ni d'enveloppe depuis la décision 0071). Le code saisi n'entre pas ici : il ouvre l'accès par la page de saisie
 * (`saisirCodeAcces`), qui pose le cookie ; seul le cookie prouve l'accès au lancement.
 */
export async function ouvrirGardeLancement(dependances: DependancesLancement): Promise<ResultatGarde> {
  const ouverture = ouvertureP0(dependances);
  if (!ouverture.ok) return ouverture;
  const maintenant = (dependances.maintenant ?? Date.now)();
  if (!cookieAccesValide(dependances.cookie, ouverture.attendu, maintenant)) return { ok: false, code: "access_refused" };
  let reservation: Awaited<ReturnType<DependancesLancement["reserver"]>>;
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

/**
 * Preuve que la garde est ouverte pour **une relecture Routes** (P0r4, décision 0076) : conditions (1) à (7),
 * déploiement autre que la production, cookie d'accès valide, dernière purge réussie de moins de 24 h (0046 D16
 * point 8), forfait de relecture réservé. Même marque que `GardeOuverte`, sans exécution : une `GardeRelecture` n'est
 * jamais une `GardeOuverte` (pas de `runId`), et réciproquement.
 */
export type GardeRelecture = { readonly relecture: true; readonly [MARQUE]: true };

/** Refus propre à la relecture : dernière purge réussie absente ou de plus de 24 h (0046 D16 point 8). */
export type CodeRefusRelecture = "purge_stale";

export type ResultatGardeRelecture =
  | { readonly ok: true; readonly garde: GardeRelecture }
  | { readonly ok: false; readonly code: CodeGardeFermee | "access_refused" | CodeRefusUsage | CodeRefusRelecture };

export type DependancesRelecture = DependancesAcces & {
  /** Valeur du cookie `__Host-p0_acces` reçu avec la requête d'affichage. */
  readonly cookie: string | undefined;
  /** Contrôle de la purge puis réservation du forfait de relecture (`reserverRelecture`, P0r2). */
  readonly reserver: () => Promise<{ readonly ok: true } | { readonly ok: false; readonly code: CodeRefusUsage | CodeRefusRelecture }>;
};

/**
 * Relecture : même barrière que le lancement (exigence 4 : garde et cookie, vérifiés à chaque relecture), puis contrôle
 * de la purge et réservation du forfait. Garde fermée ou cookie absent : aucune connexion à la base, aucun appel.
 */
export async function ouvrirGardeRelecture(dependances: DependancesRelecture): Promise<ResultatGardeRelecture> {
  const ouverture = ouvertureP0(dependances, false);
  if (!ouverture.ok) return ouverture;
  const maintenant = (dependances.maintenant ?? Date.now)();
  if (!cookieAccesValide(dependances.cookie, ouverture.attendu, maintenant)) return { ok: false, code: "access_refused" };
  let reservation: Awaited<ReturnType<DependancesRelecture["reserver"]>>;
  try {
    reservation = await dependances.reserver();
  } catch {
    return { ok: false, code: "usage_unavailable" };
  }
  if (!reservation.ok) return reservation;
  return { ok: true, garde: Object.freeze({ relecture: true }) as GardeRelecture };
}
