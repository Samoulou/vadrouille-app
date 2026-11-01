import "server-only";

import type { AdapterContext } from "@/adapters/types";
import { ATTENTE_APRES_ECHEC_MS } from "@/server/config/rappels";
import { type CanonicalEmail, parseEmailAddress } from "@/server/email";
import { errorNameOf, logEvent } from "@/server/log";
import { disabledNotificationMailer } from "@/server/mail/disabled";
import { CodeMailerCapError, CodeMailerRefusalError, type NotificationMailer } from "@/server/mail/port";
import { executeurSql, withOrg as withOrgParDefaut, type OrgTransaction } from "@/server/with-org";

import { attenteJusqua, planDuReveil } from "./calcul";
import { EtatRappelSchema, type EtatRappel, type SuiteRappel } from "./etat";

/**
 * Réveil d'une exécution de rappels (M6c, ticket 1021 ; spécification M6 § 5.3 et § 5.4 ; décision 0157 § 1.7 points 2 à 4
 * et 9, § 2.6). Appelé par l'étape `"use step"` du workflow (`src/workflows/rappels.ts`) ; **ne lève jamais** et rend la
 * suite de l'exécution (`SuiteRappel` : fin, ou attente en millisecondes), sans aucune valeur personnelle.
 *
 * Ordre, dans **une** transaction de `withOrg` (organisation et personne de l'état sérialisé, paramètres liés, RLS) :
 * 1. accord de l'exécution (`consentId`) : absent, retiré, ou d'un autre voyage ou d'une autre personne → **fin** (un nouvel
 *    accord a sa propre exécution : une seule exécution « valide » par voyage et par personne, garantie en base) ;
 * 2. voyage dans l'organisation et débloqué (`tripUnlocked`) : sinon **fin** ;
 * 3. journées déjà réclamées, puis plan (`planDuReveil`) : journée dont la fenêtre contient l'instant (veille 18:00 →
 *    minuit de la destination), sans rattrapage antérieur à l'accord ;
 * 4. si une journée est à envoyer : elle doit exister dans la version courante et ne pas être en préparation (exécution
 *    `full` ou `batch` en cours et aucune étape ce jour-là, règle de `Day.generating` sur `api`) ; le compte doit avoir une
 *    adresse refaite par `parseEmailAddress` **et** `email_verified` vrai (sinon `email.address_refused`) ; puis la
 *    **réclamation** `reminder_sends` (clé `(organization_id, trip_id, user_id, day_index)`, `ON CONFLICT DO NOTHING`) ;
 *    zéro ligne : déjà réclamée, rien n'est envoyé.
 * Puis, la transaction validée (réclamation acquise **avant** le transport, comme M7a), un seul appel du port des
 * notifications (`sendRappelVeille` : adresse, origine, voyage, numéro de journée), qui prépare le message, réserve l'usage
 * `notification` du plafond global et envoie. Aucune nouvelle tentative après un échec (0138 C4) ; un rappel manqué n'est
 * ni rattrapé ni signalé (0157 § 1.7 point 9).
 *
 * Suite : prochain envoi encore à venir → attente jusqu'à lui, bornée à 24 heures (`attenteJusqua`) ; aucun → fin. Une
 * panne (base, composition) écrit `email.notification_failed` (`errorName` seul) et rend une attente d'une heure marquée
 * `echec` : le workflow borne les échecs consécutifs.
 *
 * Journal : `email.sent`, `email.cap_reached` (`usage: "notification"`), `email.address_refused`, `email.transport_disabled`,
 * `email.notification_failed`, sans valeur (ni adresse, ni lien, ni identifiant). Le message ne porte que les liens de la
 * Journée du lendemain et du Séjour : ni destination, ni date, ni nom d'étape, ni donnée Google.
 */

/** Port et origine de l'application, choisis par la composition des rappels (`rappelsDuServeur`). */
export type CompositionRappels = {
  readonly mailer: NotificationMailer;
  readonly origine: string | null;
};

type FonctionWithOrg = <T>(ctx: Pick<AdapterContext, "organizationId" | "userId">, fn: (tx: OrgTransaction) => Promise<T>) => Promise<T>;

export type DependancesReveil = {
  /** Composition (port et origine) ; l'appelant de production passe `rappelsDuServeur` de `src/server/auth/index.ts`. */
  readonly composer: () => CompositionRappels;
  /** Horloge (tests : injectée). */
  readonly maintenant?: () => number;
  /** Tests seulement : `withOrg` lié à un client de test. */
  readonly withOrg?: FonctionWithOrg;
};

/** Accord de l'exécution : instant de l'accord (ms) s'il est actif. */
export const SQL_ACCORD = `SELECT (extract(epoch FROM consented_at) * 1000)::float8 AS consenti_ms, (withdrawn_at IS NULL) AS actif
  FROM public.reminder_consents WHERE organization_id = $1 AND trip_id = $2 AND user_id = $3 AND id = $4`;
/** Voyage : dates, fuseau, droit « débloqué », exécution `full` ou `batch` en cours. */
export const SQL_VOYAGE = `SELECT t.start_date::text AS start, t.end_date::text AS "end", t.time_zone,
  EXISTS (SELECT 1 FROM public.entitlements e WHERE e.organization_id = t.organization_id AND e.trip_id = t.id AND e.kind = 'tripUnlocked') AS debloque,
  EXISTS (SELECT 1 FROM public.generation_runs g WHERE g.organization_id = t.organization_id AND g.trip_id = t.id
    AND g.finished_at IS NULL AND g.kind IN ('full', 'batch')) AS en_cours
  FROM public.trips t WHERE t.organization_id = $1 AND t.id = $2`;
export const SQL_RECLAMES = "SELECT day_index FROM public.reminder_sends WHERE organization_id = $1 AND trip_id = $2 AND user_id = $3";
/** Journée de la version courante : présente, et avec au moins une étape (`stop`). */
export const SQL_JOURNEE = `SELECT jsonb_path_exists(d.value, '$.items[*] ? (@.type == "stop")') AS a_etape
  FROM public.trips t
  JOIN public.trip_versions v ON v.organization_id = t.organization_id AND v.trip_id = t.id AND v.version = t.current_version
  CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(v.snapshot -> 'days') = 'array' THEN v.snapshot -> 'days' ELSE '[]'::jsonb END) AS d(value)
  WHERE t.organization_id = $1 AND t.id = $2 AND (d.value ->> 'index') = $3::text
  LIMIT 1`;
const SQL_ADRESSE = "SELECT email, email_verified FROM public.users WHERE id = $1";
/** Réclamation : seule écriture du module ; insertion des quatre colonnes de la clé, `claimed_at` posé par la base. */
export const SQL_RECLAMATION = `INSERT INTO public.reminder_sends (organization_id, trip_id, user_id, day_index) VALUES ($1, $2, $3, $4)
  ON CONFLICT DO NOTHING RETURNING day_index`;

type Lu =
  | { readonly issue: "fin" }
  | { readonly issue: "rien"; readonly prochainEnvoi: number | null }
  | {
      readonly issue: "envoyer";
      readonly to: CanonicalEmail;
      readonly dayIndex: number;
      readonly prochainEnvoi: number | null;
    };

const FIN: SuiteRappel = Object.freeze({ suite: "fin" });

async function lireEtReclamer(etat: EtatRappel, maintenant: number, withOrg: FonctionWithOrg): Promise<Lu> {
  return withOrg({ organizationId: etat.organizationId, userId: etat.userId }, async (tx): Promise<Lu> => {
    const executeur = executeurSql(tx);
    const accord = (await executeur.query(SQL_ACCORD, [etat.organizationId, etat.tripId, etat.userId, etat.consentId])).rows[0];
    const consentiA = Number(accord?.consenti_ms);
    if (accord === undefined || accord.actif !== true || !Number.isFinite(consentiA)) return { issue: "fin" };
    const voyage = (await executeur.query(SQL_VOYAGE, [etat.organizationId, etat.tripId])).rows[0];
    if (voyage === undefined || voyage.debloque !== true) return { issue: "fin" };
    const { start, end, time_zone: timeZone } = voyage;
    if (typeof start !== "string" || typeof end !== "string" || typeof timeZone !== "string") return { issue: "fin" };
    const reclames = new Set((await executeur.query(SQL_RECLAMES, [etat.organizationId, etat.tripId, etat.userId])).rows.map((l) => Number(l.day_index)));
    const plan = planDuReveil({
      maintenant,
      consentiA,
      voyage: { start, end, timeZone },
      reclames,
    });
    if (plan.aEnvoyer === null) return { issue: "rien", prochainEnvoi: plan.prochainEnvoi };
    const rien: Lu = { issue: "rien", prochainEnvoi: plan.prochainEnvoi };
    // Journée absente de la version courante, ou en préparation : rien ce soir-là, reprise le soir suivant.
    const journee = (await executeur.query(SQL_JOURNEE, [etat.organizationId, etat.tripId, plan.aEnvoyer])).rows[0];
    if (journee === undefined || (voyage.en_cours === true && journee.a_etape !== true)) return rien;
    const compte = (await executeur.query(SQL_ADRESSE, [etat.userId])).rows[0];
    const lue = parseEmailAddress(compte?.email);
    if (!lue.ok || lue.email !== compte?.email || compte?.email_verified !== true) {
      logEvent("email.address_refused", {}, "warn");
      return rien;
    }
    const reclamee = (await executeur.query(SQL_RECLAMATION, [etat.organizationId, etat.tripId, etat.userId, plan.aEnvoyer])).rows.length === 1;
    return reclamee
      ? {
          issue: "envoyer",
          to: lue.email,
          dayIndex: plan.aEnvoyer,
          prochainEnvoi: plan.prochainEnvoi,
        }
      : rien;
  });
}

/** Erreurs de `../mail/resend.ts` (que ce module n'importe pas, 0138 § 9 ligne 7b) dont l'événement est déjà écrit. */
const DEJA_JOURNALISEES: ReadonlySet<string> = new Set(["ResendRefusError", "ResendEnvoiError"]);

function suite(prochainEnvoi: number | null, maintenant: number): SuiteRappel {
  return prochainEnvoi === null
    ? FIN
    : {
        suite: "attendre",
        attenteMs: attenteJusqua(prochainEnvoi, maintenant),
      };
}

function echec(erreur: unknown): SuiteRappel {
  logEvent("email.notification_failed", { errorName: errorNameOf(erreur) }, "warn");
  return { suite: "attendre", attenteMs: ATTENTE_APRES_ECHEC_MS, echec: true };
}

/** Un réveil : relit tout, envoie au plus le rappel de la journée du lendemain, rend la suite ; ne lève jamais. */
export async function reveillerRappel(entree: unknown, deps: DependancesReveil): Promise<SuiteRappel> {
  const lu = EtatRappelSchema.safeParse(entree);
  if (!lu.success) return FIN;
  const etat = lu.data;
  const horloge = deps.maintenant ?? Date.now;
  try {
    let composition: CompositionRappels;
    try {
      composition = deps.composer();
    } catch (erreur) {
      return echec(erreur);
    }
    // Sans transport ni origine (configuration retirée, ou Resend sans la garde `RAPPELS_ENVOI_REEL`) : rien n'est lu ni
    // réclamé, l'exécution se termine (un transport posé plus tard ne renverra pas un rappel ancien).
    if (composition.mailer === disabledNotificationMailer || composition.origine === null) {
      logEvent("email.transport_disabled", {}, "warn");
      return FIN;
    }
    let decision: Lu;
    try {
      decision = await lireEtReclamer(etat, horloge(), deps.withOrg ?? withOrgParDefaut);
    } catch (erreur) {
      return echec(erreur);
    }
    if (decision.issue === "fin") return FIN;
    if (decision.issue === "envoyer") {
      try {
        await composition.mailer.sendRappelVeille({
          to: decision.to,
          origine: composition.origine,
          tripId: etat.tripId,
          dayIndex: decision.dayIndex,
        });
      } catch (erreur) {
        // Plafond atteint (`email.cap_reached` déjà écrit), adresse ou enveloppe refusée, refus de Resend : événement écrit.
        if (!(erreur instanceof CodeMailerCapError) && !(erreur instanceof CodeMailerRefusalError) && !DEJA_JOURNALISEES.has(errorNameOf(erreur) ?? "")) {
          logEvent("email.notification_failed", { errorName: errorNameOf(erreur) }, "warn");
        }
      }
    }
    return suite(decision.prochainEnvoi, horloge());
  } catch (erreur) {
    return echec(erreur);
  }
}
