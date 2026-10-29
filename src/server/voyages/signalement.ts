import "server-only";

import type { AdapterContext } from "@/adapters/types";
import { fail, ok, StopReportSchema, type DaySnapshot, type Result, type StopReport } from "@/contracts";
import { situerEtapeSignalee } from "@/domain/signalement";
import type { ChaineApercu } from "@/server/config/generation";
import { SIGNALEMENTS_PAR_VOYAGE_ET_PAR_JOUR } from "@/server/config/lieux";
import { logEvent } from "@/server/log";
import { checkRateLimit } from "@/server/rate-limit";
import { verrouillerVersions } from "@/server/versions/ecrire";

import { executerActionVoyage, type DependancesAction, type ExecuteurAction } from "./actions";
import { chaineDeLecture, lireJoursSignalables } from "./lecture";

/**
 * Signaler une erreur sur une étape (tâche M5c, ticket 904 ; décision 0147 § 1, § 2 et § 12 S1 ; spécification
 * `specs/M5-retouches.md` § 5, M5-PO-7 à M5-PO-11). Cas d'usage de l'action `reportStop` sur `api`, dans le cadre commun des
 * actions sur un voyage (`./actions.ts`). Réponse `Result<null>` : la feuille sait seule si elle propose « Remplacer ».
 *
 * **Ordre des contrôles, fixé** (0147 § 1 point 4) : (a) session, (b) entrée stricte (`StopReportSchema` : aucun texte), (c)
 * voyage dans l'organisation (`not_found`) — tous trois par le cadre ; puis, sous le verrou des versions du voyage
 * (`SQL_VERROU_VERSIONS` : il sérialise les signalements d'un même voyage et leur plafond), (d) étape présente dans la
 * version courante **et**, avant le déblocage sur la chaîne inversée, dans une journée servie (`not_found` : une journée
 * cachée ne se révèle pas, 0136 § 3.5) ; (e) seulement ensuite, sorte de l'étape (`validation_failed`, `field: "stopId"`,
 * pour un événement, un engagement ou un lieu à soi) ; (f) doublon (même `request_id`, ou même motif sur la même étape du
 * même lieu) : `ok(null)` sans rien compter ni écrire, **même plafond atteint** ; (g) plafonds : débit `signalement` par
 * adresse IP, puis au plus `SIGNALEMENTS_PAR_VOYAGE_ET_PAR_JOUR` par voyage depuis minuit UTC (borne `timestamptz`
 * explicite, jamais une `date` du fuseau de la session) : `rate_limited` sans écriture. Enfin `INSERT … ON CONFLICT DO
 * NOTHING` (`scope = 'stop'`, `place_id` de l'étape de la version courante, `created_by` de la session, `text` nul).
 *
 * Aucun appel de modèle ni de Google, aucune version, rien ne change au programme, aux badges ni à la liste (M5-PO-7).
 * Journal : `voyages.stop_reported`, motif seul, une fois par signalement **nouvellement** enregistré (S1 point 4), après
 * la transaction.
 */

/** Action du limiteur pour les signalements (`RATE_LIMITS`, 10 par minute et par adresse IP). */
export const ACTION_LIMITEUR_SIGNALEMENT = "signalement";

/** Lecture des jours signalables dans la transaction (par défaut `lireJoursSignalables` de la lecture). */
export type LectureJoursSignalables = (executeur: ExecuteurAction, ctx: AdapterContext, tripId: string, chaine: ChaineApercu) => Promise<readonly DaySnapshot[] | null>;

export type DependancesSignalement = DependancesAction & {
  /** Chaîne de l'aperçu (lecture avant le déblocage) ; `chaineDeLecture` par défaut, comme la lecture. */
  readonly chaine?: ChaineApercu;
  /** Débit par adresse IP ; `checkRateLimit` avec les en-têtes de la requête par défaut (échec fermé : `rate_limited`). */
  readonly limiteur?: () => Promise<Result<void>>;
  /** **Tests sans base seulement** : lecture des jours ; `lireJoursSignalables` par défaut. */
  readonly lireJours?: LectureJoursSignalables;
};

/** Doublon (0147 § 2) : même `request_id`, ou même clé de déduplication de l'index `feedback_stop_dedup_idx`. */
export const SQL_DOUBLON_SIGNALEMENT = `SELECT 1 AS present FROM public.feedback
  WHERE organization_id = $1 AND trip_id = $2
    AND (request_id = $3::uuid OR (scope = 'stop' AND target_stop_id = $4 AND reason = $5 AND COALESCE(place_id, '') = COALESCE($6::text, '')))
  LIMIT 1`;

/**
 * Signalements du voyage depuis minuit UTC du jour de la base (0147 § 2, mineur 2) : `now() AT TIME ZONE 'UTC'` donne
 * l'heure UTC sans fuseau, `date_trunc` son minuit, et `AT TIME ZONE 'UTC'` en refait un `timestamptz` ; le fuseau de la
 * session n'entre nulle part.
 */
export const SQL_SIGNALEMENTS_DU_JOUR = `SELECT count(*)::int AS n FROM public.feedback
  WHERE organization_id = $1 AND trip_id = $2
    AND created_at >= pg_catalog.date_trunc('day', pg_catalog.now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`;

/** Écriture (forme de la migration 0022) : sans cible de conflit, elle couvre les deux index uniques partiels. */
export const SQL_INSERTION_SIGNALEMENT = `INSERT INTO public.feedback (organization_id, trip_id, target_stop_id, place_id, reason, text, scope, created_by, request_id)
  VALUES ($1, $2, $3, $4, $5, NULL, 'stop', $6, $7) ON CONFLICT DO NOTHING RETURNING id`;

type Issue =
  | { readonly type: "enregistre"; readonly reason: StopReport["reason"] }
  | { readonly type: "deja" }
  | { readonly type: "refus"; readonly erreur: Result<null> };

const limiteurParDefaut = async (): Promise<Result<void>> => {
  const { headers } = await import("next/headers");
  return checkRateLimit({ action: ACTION_LIMITEUR_SIGNALEMENT, headers: new Headers(await headers()) });
};

export async function signalerEtape(dependances: DependancesSignalement, entree: unknown): Promise<Result<null>> {
  const chaine = chaineDeLecture(dependances);
  const lireJours = dependances.lireJours ?? lireJoursSignalables;
  const limiteur = dependances.limiteur ?? limiteurParDefaut;
  const resultat = await executerActionVoyage("report-stop", dependances, StopReportSchema, entree, async (executeur, ctx, demande): Promise<Issue | null> => {
    await verrouillerVersions(executeur, demande.tripId);
    const jours = await lireJours(executeur, ctx, demande.tripId, chaine);
    if (jours === null) return null;
    const situation = situerEtapeSignalee(jours, demande.stopId);
    if (situation.type === "absente") return null;
    if (situation.type === "non_signalable") return { type: "refus", erreur: fail("validation_failed", "stopId") };
    const { placeId } = situation;
    const org = ctx.organizationId;
    const doublon = await executeur.query(SQL_DOUBLON_SIGNALEMENT, [org, demande.tripId, demande.requestId, demande.stopId, demande.reason, placeId]);
    if (doublon.rows.length > 0) return { type: "deja" };
    const debit = await limiteur();
    if (!debit.ok) return { type: "refus", erreur: debit };
    const n = Number((await executeur.query(SQL_SIGNALEMENTS_DU_JOUR, [org, demande.tripId])).rows[0]?.n);
    if (!Number.isSafeInteger(n) || n < 0) throw new RangeError("signalement: compte illisible");
    if (n >= SIGNALEMENTS_PAR_VOYAGE_ET_PAR_JOUR) return { type: "refus", erreur: fail("rate_limited") };
    const ecrit = await executeur.query(SQL_INSERTION_SIGNALEMENT, [org, demande.tripId, demande.stopId, placeId, demande.reason, ctx.userId, demande.requestId]);
    // Aucune ligne : un signalement concurrent identique vient d'être écrit (les deux index uniques) ; même réponse.
    return ecrit.rows.length === 1 ? { type: "enregistre", reason: demande.reason } : { type: "deja" };
  });
  if (!resultat.ok) return resultat;
  const issue = resultat.value;
  if (issue.type === "refus") return issue.erreur;
  if (issue.type === "enregistre") logEvent("voyages.stop_reported", { reason: issue.reason });
  return ok(null);
}
