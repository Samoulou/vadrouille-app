import "server-only";

import type { AdapterContext } from "@/adapters/types";
import { logEvent } from "@/server/log";
import { executeurSql, withOrg as withOrgParDefaut, type OrgTransaction } from "@/server/with-org";

import { SQL_ACCORD } from "./envoi";
import { EtatRappelSchema, RELAY_N_MAX } from "./etat";

/**
 * Réclamation du relais d'une exécution de rappels (tâche R-B, ticket 1075 ; décision 0162 § 3 point 2, § 5 ; migration
 * `0027_rappels_relais`, table insert-only `reminder_relays`). Appelé par l'étape `"use step"` `etapeReclamationRelais` du
 * workflow (`src/workflows/rappels.ts`), **avant** le démarrage du successeur ; **ne lève jamais**, sur le modèle de
 * `envoi.ts` (`withOrg` injectable).
 *
 * `relayN` est le numéro de la génération **du successeur** (l'exécution démarrée par `setTripReminders` est la génération 0,
 * sans ligne) ; `runId` est l'identifiant de l'exécution qui réclame (`getWorkflowMetadata().workflowRunId`), qui sert
 * **seulement** à reconnaître une étape rejouée de la même exécution (0162 § 2 point 2, § 5 cas 1).
 *
 * Dans **une** transaction de `withOrg` (organisation et personne de l'état sérialisé, paramètres liés, RLS par personne) :
 * 1. accord de l'exécution actif (`SQL_ACCORD` d'`envoi.ts`) ; absent, retiré, d'un autre voyage ou d'une autre personne →
 *    `fin` ;
 * 2. insertion de la réclamation (`ON CONFLICT DO NOTHING`) ; une ligne → `acquise` ;
 * 3. zéro ligne : lecture de `claimed_run_id` de la génération ; égal à `runId` → `acquise` (étape rejouée), sinon →
 *    `doublon` (une autre exécution tient la génération : celle-ci se termine sans relayer).
 *
 * Erreurs : un refus de la RLS (`42501`) à l'insertion est attendu quand l'accord est retiré entre la lecture et l'insertion
 * (la politique `reminder_relays_app_insert` exige un accord non retiré de la personne, et son `WITH CHECK` passe avant la
 * détection du conflit) : l'accord est alors relu dans une nouvelle transaction, et la fin de chaîne est **légitime**
 * (`fin`, sans journal ; revue consolidée de la PR 1067, mineur 2, qui amende 0162 § 3 point 2.4 sur ce seul cas). Accord
 * toujours actif à la relecture (droit retiré, par exemple après la descente de 0027), relecture en échec, ou toute autre
 * erreur (base, `CHECK` de `claimed_run_id`) → `panne`, journal `rappels.relay_failed` (nom seul, ni état, ni message) :
 * le workflow la compte comme un essai de relais en échec (borne `RELAIS_ESSAIS_MAX`).
 *
 * Entrée hors de `EtatRappelSchema`, `relayN` hors de 1 à 32 767 ou `runId` qui n'est pas une chaîne → `fin`, sans lecture.
 * Aucune adresse, aucun texte, aucune donnée Google : trois identifiants, un numéro.
 */

export type IssueRelais = "acquise" | "doublon" | "fin" | "panne";

type FonctionWithOrg = <T>(ctx: Pick<AdapterContext, "organizationId" | "userId">, fn: (tx: OrgTransaction) => Promise<T>) => Promise<T>;

export type DependancesRelais = {
  /** Tests seulement : `withOrg` lié à un client de test. */
  readonly withOrg?: FonctionWithOrg;
};

/** Réclamation : seule écriture du module ; quatre colonnes, `claimed_at` posé par la base. */
export const SQL_RECLAMATION_RELAIS = `INSERT INTO public.reminder_relays (organization_id, consent_id, relay_n, claimed_run_id) VALUES ($1, $2, $3, $4)
  ON CONFLICT DO NOTHING RETURNING relay_n`;
/** Exécution qui tient déjà la génération (zéro ligne à l'insertion). */
export const SQL_RELAIS_TENU = `SELECT claimed_run_id FROM public.reminder_relays
  WHERE organization_id = $1 AND consent_id = $2 AND relay_n = $3`;

/** Code SQLSTATE d'une erreur de `pg`, éventuellement enveloppée par Drizzle (`cause`), comme `src/server/partage/liens.ts`. */
function codeSql(erreur: unknown): string | undefined {
  const lire = (valeur: unknown) =>
    typeof valeur === "object" && valeur !== null && typeof (valeur as { code?: unknown }).code === "string" ? (valeur as { code: string }).code : undefined;
  return lire(erreur) ?? lire((erreur as { cause?: unknown } | null)?.cause);
}

function panne(): IssueRelais {
  // Nom seul : ni l'état, ni le message de la base.
  logEvent("rappels.relay_failed", {}, "warn");
  return "panne";
}

/** Une réclamation de la génération `relayN` par l'exécution `runId` ; ne lève jamais. */
export async function reclamerRelais(
  entree: unknown,
  reclamation: { readonly relayN: number; readonly runId: string },
  deps: DependancesRelais = {},
): Promise<IssueRelais> {
  const lu = EtatRappelSchema.safeParse(entree);
  if (!lu.success) return "fin";
  const { relayN, runId } = reclamation;
  if (!Number.isInteger(relayN) || relayN < 1 || relayN > RELAY_N_MAX || typeof runId !== "string") return "fin";
  const etat = lu.data;
  const withOrg = deps.withOrg ?? withOrgParDefaut;
  const ctx = { organizationId: etat.organizationId, userId: etat.userId };
  const accord = [etat.organizationId, etat.tripId, etat.userId, etat.consentId] as const;
  try {
    return await withOrg(ctx, async (tx): Promise<IssueRelais> => {
      const executeur = executeurSql(tx);
      const lue = (await executeur.query(SQL_ACCORD, accord)).rows[0];
      if (lue === undefined || lue.actif !== true) return "fin";
      const cle = [etat.organizationId, etat.consentId, relayN] as const;
      const inseree = (await executeur.query(SQL_RECLAMATION_RELAIS, [...cle, runId])).rows.length === 1;
      if (inseree) return "acquise";
      const tenue = (await executeur.query(SQL_RELAIS_TENU, cle)).rows[0];
      return tenue?.claimed_run_id === runId ? "acquise" : "doublon";
    });
  } catch (erreur) {
    if (codeSql(erreur) !== "42501") return panne();
    // Refus de la RLS : accord retiré entre la lecture et l'insertion (fin légitime), ou droit manquant (panne).
    try {
      const actif = await withOrg(ctx, async (tx) => (await executeurSql(tx).query(SQL_ACCORD, accord)).rows[0]?.actif === true);
      return actif ? panne() : "fin";
    } catch {
      return panne();
    }
  }
}
