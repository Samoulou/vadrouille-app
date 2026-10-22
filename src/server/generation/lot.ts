import "server-only";

import { joursTouches } from "@/domain/recalcul";
import { logEvent } from "@/server/log";
import { SQL_CASES, SQL_DEBLOQUE, SQL_EXECUTION_APERCU, SQL_VERROU_TRI } from "@/server/presentation/etat";

import { LectureIllisible } from "./illisible";
import { lireVersion, type ExecuteurLecture } from "./lecture";
import { lireTriClos } from "./signaux";
import { uuidV5 } from "./voyage-complet";

/**
 * Création et démarrage d'une exécution `batch` (workflow 5 `batchRecompute` ; spécification B10, B10b points 1 et 2 ;
 * décision 0119 § 1.1 à § 1.3 ; verdict 0120 S1, S2 et S3). Appelé par `completeDeck` (`src/server/presentation/tri.ts`, contexte
 * de la personne) et par la suite du déblocage (`src/server/payment/suite-voyage-complet.ts`, contexte système), **dans la
 * transaction qui a pris le verrou du tri**, après le contrôle du voyage dans l'organisation ; le démarrage du workflow a lieu
 * **après** la validation de cette transaction (`demarrerLot`), jamais sous un verrou.
 *
 * - **Une ligne par tri clos** : `INSERT … ON CONFLICT DO NOTHING` (index par clôture, index « une en cours par voyage », index
 *   des `request_id`), puis relecture **filtrée sur la ligne attendue** (`kind = 'batch'`, organisation, voyage, clôture ; 0120
 *   S1 point 1). Ligne attendue absente : aucun démarrage, événement `recalcul.not_created`, rien d'autre.
 * - **Version de base** : `trips.current_version` lue dans cette transaction, jamais reçue d'une entrée (S1 point 2).
 * - **`request_id`** : `uuidV5` de la clôture, dans l'espace de noms du lot (0119 § 1.1 point 4) ; la version publiée le porte.
 * - Après l'`INSERT`, aucune requête de ce module ni du workflow n'écrit `base_version`, `deck_closure_id`, `kind`,
 *   `organization_id`, `trip_id` ni `request_id` (S1 point 4).
 */

/**
 * Espace de noms constant des identifiants dérivés du lot (0119 § 1.1 point 4, à côté de `ESPACE_NOMS_VOYAGE_COMPLET`) : fixé
 * une fois par B10b, **jamais changé** (un changement redonnerait d'autres valeurs et casserait l'idempotence du rejeu).
 */
export const ESPACE_NOMS_LOT = "b10b5a7e-1c2d-5e3f-9a4b-6c7d8e9f0a1b";

/** `request_id` de la ligne `batch` d'un tri clos, et de la version qu'elle publie : `batch:<clôture>`. */
export const requestIdDuLot = (clotureId: string): string => uuidV5(`batch:${clotureId}`, ESPACE_NOMS_LOT);

/** `request_id` de la clôture du tri de l'aperçu écrite par la suite du déblocage : `closure:<droit>` (idempotente par droit). */
export const requestIdClotureApercu = (entitlementId: string): string => uuidV5(`closure:${entitlementId}`, ESPACE_NOMS_LOT);

/** Port de démarrage de `batchRecompute` : identifiant de l'exécution du SDK, ou `null` si rien n'a démarré. */
export type DemarrerRecalcul = (generationRunId: string, organizationId: string) => Promise<string | null>;

const SQL_VERSION_DE_BASE = "SELECT current_version FROM public.trips WHERE organization_id = $1 AND id = $2";

const SQL_CREATION_LOT = `INSERT INTO public.generation_runs (organization_id, trip_id, kind, phase, base_version, deck_closure_id, request_id, started_at, updated_at)
  VALUES ($1, $2, 'batch', 'queued', $3, $4, $5,
    GREATEST($6::timestamptz, (SELECT max(started_at) + interval '1 millisecond' FROM public.generation_runs WHERE organization_id = $1 AND trip_id = $2)),
    $6::timestamptz)
  ON CONFLICT DO NOTHING
  RETURNING id`;

/** Relecture de la ligne attendue après `DO NOTHING` (0120 S1 point 1) : jamais par `request_id` seul. */
const SQL_LIGNE_DU_TRI = `SELECT id FROM public.generation_runs
  WHERE organization_id = $1 AND trip_id = $2 AND kind = 'batch' AND deck_closure_id = $3`;

export type IssueLot =
  | { readonly statut: "aucun" }
  | { readonly statut: "cree"; readonly generationRunId: string; readonly jours: number }
  | { readonly statut: "existant"; readonly generationRunId: string }
  | { readonly statut: "collision"; readonly jours: number }
  | { readonly statut: "illisible" };

/**
 * Crée la ligne `batch` du tri clos `clotureId` si au moins un signal de ce tri touche un jour planifié de la version de base
 * (`joursTouches`, B10-PO-9), dans la transaction de l'appelant (verrou du tri déjà pris). Rend la ligne à démarrer (`cree`),
 * la ligne déjà là (`existant` : rejeu, aucun second démarrage), ou rien.
 */
export async function ouvrirLotDuTri(
  x: ExecuteurLecture,
  cible: { readonly organizationId: string; readonly tripId: string; readonly clotureId: string; readonly maintenant: number },
): Promise<IssueLot> {
  const { organizationId, tripId, clotureId } = cible;
  const courante = (await x.query(SQL_VERSION_DE_BASE, [organizationId, tripId])).rows[0]?.current_version;
  if (courante === null || courante === undefined) return { statut: "aucun" };
  const base = await lireVersion(x, organizationId, tripId, Number(courante));
  const tri = await lireTriClos(x, organizationId, tripId, clotureId);
  const jours = joursTouches(base.instantane, tri).length;
  if (jours === 0) return { statut: "aucun" };
  const instant = new Date(cible.maintenant).toISOString();
  const creee = (await x.query(SQL_CREATION_LOT, [organizationId, tripId, base.version, clotureId, requestIdDuLot(clotureId), instant])).rows[0];
  if (creee !== undefined) return { statut: "cree", generationRunId: String(creee.id), jours };
  const deja = (await x.query(SQL_LIGNE_DU_TRI, [organizationId, tripId, clotureId])).rows[0];
  if (deja !== undefined) return { statut: "existant", generationRunId: String(deja.id) };
  return { statut: "collision", jours };
}

/**
 * Variante de `ouvrirLotDuTri` pour `completeDeck` (revue de la PR 667, mineur 2) : une lecture illisible (version de base ou
 * case du tri invalide, `LectureIllisible`) ne doit pas annuler la transaction de l'action, qui porte la clôture du tri (B10a).
 * Elle rend `illisible` : aucune ligne, aucun démarrage, journal `recalcul.not_created` après la validation. Toute autre erreur
 * remonte (l'action échoue, rien n'est écrit). La suite du déblocage garde `ouvrirLotDuTri` : son erreur est attrapée par la suite.
 */
export async function ouvrirLotApresCloture(x: ExecuteurLecture, cible: Parameters<typeof ouvrirLotDuTri>[1]): Promise<IssueLot> {
  try {
    return await ouvrirLotDuTri(x, cible);
  } catch (erreur) {
    if (erreur instanceof LectureIllisible) return { statut: "illisible" };
    throw erreur;
  }
}

/**
 * Journal d'une ligne attendue absente : collision (l'`INSERT` n'a rien écrit et la ligne de ce tri n'existe pas : index des
 * `request_id`, ou index « une exécution en cours par voyage ») ou lecture illisible. Identifiants, nom d'erreur et entier seulement.
 */
export function signalerLotNonCree(organizationId: string, tripId: string, issue: IssueLot): void {
  if (issue.statut === "collision") logEvent("recalcul.not_created", { organizationId, tripId, days: issue.jours }, "warn");
  if (issue.statut === "illisible") logEvent("recalcul.not_created", { organizationId, tripId, errorName: "LectureIllisible" }, "warn");
}

/** Transaction de l'appelant après la validation (contexte de la personne ou contexte système de l'organisation). */
export type TransactionLot = <T>(travail: (x: ExecuteurLecture) => Promise<T>) => Promise<T>;

const SQL_WORKFLOW_LOT = `UPDATE public.generation_runs SET workflow_run_id = $3
  WHERE organization_id = $1 AND id = $2 AND kind = 'batch' AND workflow_run_id IS NULL`;

/**
 * Démarrage échoué : la ligne est **close aussitôt** en `failed` (`upstream_unavailable`, `retryable` vrai) par une écriture
 * conditionnelle (0119 § 1.3 point 5) ; une ligne restée `queued` bloquerait le tri du voyage pendant 20 minutes. Aucune
 * réconciliation ne redémarre une ligne `batch` (0120 S2 point 7).
 */
const SQL_ECHEC_DEMARRAGE_LOT = `UPDATE public.generation_runs SET phase = 'failed', stop_reason = 'upstream_unavailable', updated_at = $3::timestamptz, finished_at = $3::timestamptz
  WHERE organization_id = $1 AND id = $2 AND kind = 'batch' AND phase = 'queued' AND workflow_run_id IS NULL`;

/** Démarre la ligne créée par cet appel, après la validation ; rend vrai si le SDK a rendu un identifiant d'exécution. */
export async function demarrerLot(
  transaction: TransactionLot,
  demarrer: DemarrerRecalcul,
  cible: { readonly organizationId: string; readonly tripId: string; readonly generationRunId: string; readonly maintenant: () => number },
): Promise<boolean> {
  const { organizationId, tripId, generationRunId } = cible;
  let workflowRunId: string | null;
  try {
    workflowRunId = await demarrer(generationRunId, organizationId);
  } catch {
    workflowRunId = null;
  }
  if (workflowRunId === null) {
    try {
      await transaction((x) => x.query(SQL_ECHEC_DEMARRAGE_LOT, [organizationId, generationRunId, new Date(cible.maintenant()).toISOString()]));
    } catch {
      // Écriture perdue : la ligne `queued` expire (20 minutes, 0081 B9-TL-3 point 5), par une action du tri ou une lecture d'état.
    }
    logEvent("recalcul.start_failed", { organizationId, tripId, generationRunId }, "warn");
    return false;
  }
  try {
    await transaction((x) => x.query(SQL_WORKFLOW_LOT, [organizationId, generationRunId, workflowRunId]));
  } catch {
    // Identifiant non écrit : l'exécution démarrée avance quand même ; la ligne reste lisible par son identifiant interne.
  }
  return true;
}

// --- Suite du déblocage (0119 § 1.3 points 3 et 4 ; 0120 S2) -------------------------------------------------------------

const SQL_VOYAGE = "SELECT 1 AS present FROM public.trips WHERE organization_id = $1 AND id = $2";
const SQL_CLOTURE_APERCU = `SELECT id FROM public.deck_closures
  WHERE organization_id = $1 AND trip_id = $2 AND generation_run_id = $3 AND phase = 'preview'
  ORDER BY through_position DESC, id LIMIT 1`;
const SQL_CLORE_APERCU = `INSERT INTO public.deck_closures (organization_id, trip_id, generation_run_id, phase, through_position, request_id)
  VALUES ($1, $2, $3, 'preview', $4, $5) ON CONFLICT DO NOTHING`;

/** Droit débloqué tel que la suite le reçoit de `lancerSuite` (identifiants internes seulement). */
export type DroitDebloque = { readonly entitlementId: string; readonly tripId: string; readonly organizationId: string };

/**
 * Second travail de la suite du déblocage, dans **sa propre transaction** (contexte système de l'organisation du droit) :
 * 1. le voyage existe dans l'organisation **et** il est débloqué (`SQL_DEBLOQUE`, la requête de la lecture), sinon rien n'est
 *    écrit et aucun verrou n'est pris (0120 S2 point 1) ;
 * 2. verrou du tri (`SQL_VERROU_TRI`), après ces contrôles ;
 * 3. la même exécution `preview` que la lecture (`SQL_EXECUTION_APERCU`) ; aucune, ou aucune case : rien (aperçu sans
 *    proposition, 0119 § 1.3 point 3) ;
 * 4. la clôture de son tri, retrouvée **par exécution et phase** (jamais par `request_id` seul : une clôture de `completeDeck` est
 *    reprise telle quelle) ; sinon écrite (`through_position` = la plus grande position des cases de `SQL_CASES`, `request_id`
 *    dérivé du droit), même si aucun signal ne touche un jour ;
 * 5. la ligne `batch` si au moins un signal de ce tri touche un jour planifié de la version de base.
 * Rien d'autre n'est écrit (ni signal, ni réponse, ni question, ni proposition, ni version : 0120 S2 point 4). Le démarrage
 * suit la validation. Toute erreur remonte à l'appelant, qui l'attrape (S2 point 6).
 */
export async function recalculerAuDeblocage(transaction: TransactionLot, demarrer: DemarrerRecalcul, droit: DroitDebloque, maintenant: () => number): Promise<IssueLot> {
  const { organizationId, tripId } = droit;
  const issue = await transaction(async (x): Promise<IssueLot> => {
    if ((await x.query(SQL_VOYAGE, [organizationId, tripId])).rows.length === 0) return { statut: "aucun" };
    if ((await x.query(SQL_DEBLOQUE, [organizationId, tripId])).rows[0]?.debloque !== true) return { statut: "aucun" };
    await x.query(SQL_VERROU_TRI, [tripId]);
    const execution = (await x.query(SQL_EXECUTION_APERCU, [organizationId, tripId])).rows[0]?.id;
    if (typeof execution !== "string") return { statut: "aucun" };
    let cloture = (await x.query(SQL_CLOTURE_APERCU, [organizationId, tripId, execution])).rows[0]?.id;
    if (cloture === undefined) {
      const cases = (await x.query(SQL_CASES, [organizationId, tripId, execution, "preview"])).rows;
      const jusqua = cases.reduce((max, ligne) => Math.max(max, Number(ligne.position)), 0);
      if (jusqua < 1) return { statut: "aucun" };
      await x.query(SQL_CLORE_APERCU, [organizationId, tripId, execution, jusqua, requestIdClotureApercu(droit.entitlementId)]);
      cloture = (await x.query(SQL_CLOTURE_APERCU, [organizationId, tripId, execution])).rows[0]?.id;
      if (cloture === undefined) throw new Error("clôture de l'aperçu absente");
    }
    return ouvrirLotDuTri(x, { organizationId, tripId, clotureId: String(cloture), maintenant: maintenant() });
  });
  signalerLotNonCree(organizationId, tripId, issue);
  if (issue.statut === "cree") await demarrerLot(transaction, demarrer, { organizationId, tripId, generationRunId: issue.generationRunId, maintenant });
  return issue;
}
