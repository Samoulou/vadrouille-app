import "server-only";

import { createDatabase } from "../../../db/index.ts";
import { type CanonicalEmail, parseEmailAddress } from "@/server/email";
import { errorNameOf, logEvent } from "@/server/log";

import { disabledNotificationMailer } from "./disabled";
import { CodeMailerCapError, CodeMailerRefusalError, type NotificationMailer } from "./port";

/**
 * E-mail « propositions prêtes » à la fin de `generateProgramme` (M7a ; plan `docs/plans/mvp-etapes-1-9.md`, étape 7 ;
 * cadrage § 3.5, bloc « Générer »). Appelé par la dernière étape du workflow (`src/workflows/programme.ts`), **après** la
 * publication, et seulement si le workflow s'est terminé sans arrêt. **Ne lève jamais** : rend un résultat fermé, et un échec
 * n'arrête ni ne change le workflow (l'aperçu est déjà publié).
 *
 * **Idempotence, une fois par voyage, sans migration.** Un voyage n'a qu'une exécution `preview` publiée (`ready` ou
 * `incomplete`) : `retryGeneration` n'en crée une autre que si la dernière est `failed`, et aucune écriture ne fait quitter
 * `ready` ou `incomplete` à une ligne `preview`. La publication pose `updated_at = finished_at` (même paramètre, même instant) ;
 * aucune requête de `src/` n'écrit ensuite une ligne `preview` publiée. La **réclamation** est l'écriture conditionnelle
 * `updated_at = finished_at` → `updated_at` > `finished_at` (même forme que la réclamation de la réconciliation, sur
 * `updated_at`, colonne déjà accordée à `vadrouille_app` par la migration 0016) : une seule réussit, même sous la concurrence
 * (verrou de ligne, condition réévaluée par Postgres), même après une reprise du workflow ou de l'étape. La réclamation est
 * validée **avant** l'envoi : au plus un e-mail par voyage ; un envoi en échec après elle n'est pas refait (aucune file,
 * aucune nouvelle tentative, comme 0138 C4).
 *
 * Ordre, dans **une** transaction du pool `vadrouille_app` (`app.organization_id` puis `app.user_id` posés par paramètres
 * liés, portée de la transaction) :
 * 1. ligne `preview` de l'exécution et auteur du voyage (`trips.created_by`) : absente ou non publiée → `not_ready` ; déjà
 *    réclamée → `already_sent` (aucune écriture) ;
 * 2. adresse du compte (`users.email`, politique `users_app` : la seule ligne de `app.user_id`), forme canonique refaite par
 *    `parseEmailAddress` : absente ou refusée → `no_address` et `email.address_refused`, rien n'est réclamé ;
 * 3. réclamation ; zéro ligne (concurrent gagnant) → `already_sent`.
 * Puis, hors de la transaction : port des notifications (`NotificationMailer`), qui prépare le message (préparation commune
 * de `./avant-transport.ts`), réserve l'usage `notification` dans le plafond global du jour et envoie.
 *
 * Journal (`src/server/log.ts`) : `email.sent` et `email.cap_reached` (`usage: "notification"`), `email.address_refused`,
 * `email.envelope_refused`, `email.provider_refused`, `email.transport_refused`, `email.transport_disabled` par les modules
 * qui les constatent ; `email.notification_failed` (`errorName` seul) pour une base, une composition ou un transport en
 * échec. Aucune valeur : ni adresse, ni lien, ni identifiant. Le message ne porte que le lien de la présentation du voyage :
 * ni destination, ni date, ni lieu, ni contenu du programme, ni donnée Google.
 */

/** Issue de l'envoi, liste fermée ; jamais une valeur. */
export type ResultatApercuPret = "sent" | "already_sent" | "not_ready" | "no_address" | "cap_reached" | "disabled" | "failed";

/** Entrée : les identifiants de l'état sérialisé du workflow, rien d'autre. */
export type EntreeApercuPret = { readonly organizationId: string; readonly generationRunId: string };

/** Client et pool minimaux (`pg.PoolClient`, `pg.Pool`), injectables par les tests. */
export type ApercuPretClient = {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
  release(error?: Error | boolean): void;
};
export type ApercuPretPool = { connect(): Promise<ApercuPretClient> };

/** Port et origine de l'application (`APP_URL`), choisis par la composition du serveur ; `origine` nulle : aucun envoi. */
export type CompositionNotifications = { readonly mailer: NotificationMailer; readonly origine: string | null };

export type ApercuPretDeps = {
  /** Tests seulement : pool injecté (sinon le pool propre de `vadrouille_app`, créé au premier appel). */
  readonly pool?: ApercuPretPool;
  /** Composition (port et origine) ; l'appelant de production passe celle de `src/server/auth/index.ts`. */
  readonly composer: () => CompositionNotifications;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pool propre (1 connexion, délais de quelques secondes) : l'étape ne garde rien d'autre ouvert. */
const POOL_APERCU = { max: 1, connectionTimeoutMillis: 3_000, query_timeout: 3_000 } as const;

const ORGANISATION = "SELECT pg_catalog.set_config('app.organization_id', $1, true)";
const UTILISATEUR = "SELECT pg_catalog.set_config('app.user_id', $1, true)";
/** Exécution `preview` publiée et auteur du voyage ; `reclamee` : la réclamation a déjà eu lieu. */
export const SQL_EXECUTION_PUBLIEE = `SELECT g.trip_id::text AS trip_id, t.created_by::text AS created_by, (g.updated_at <> g.finished_at) AS reclamee
FROM public.generation_runs g
JOIN public.trips t ON t.organization_id = g.organization_id AND t.id = g.trip_id
WHERE g.organization_id = $1 AND g.id = $2 AND g.kind = 'preview' AND g.phase IN ('ready', 'incomplete') AND g.finished_at IS NOT NULL`;
const SQL_ADRESSE = "SELECT email FROM public.users WHERE id = $1";
/** Réclamation : seule écriture du module, sur `updated_at` seulement, strictement après `finished_at`. */
export const SQL_RECLAMATION = `UPDATE public.generation_runs
SET updated_at = GREATEST(pg_catalog.clock_timestamp(), finished_at + interval '1 millisecond')
WHERE organization_id = $1 AND id = $2 AND kind = 'preview' AND phase IN ('ready', 'incomplete') AND updated_at = finished_at
RETURNING id`;

type Lu = { readonly issue: "pret"; readonly to: CanonicalEmail; readonly tripId: string } | { readonly issue: "already_sent" | "not_ready" | "no_address" };

let poolParDefaut: ApercuPretPool | undefined;
const pool = (deps: ApercuPretDeps): ApercuPretPool => deps.pool ?? (poolParDefaut ??= createDatabase("vadrouille_app", undefined, POOL_APERCU).$client);

async function lireEtReclamer(entree: EntreeApercuPret, deps: ApercuPretDeps): Promise<Lu> {
  const client = await pool(deps).connect();
  try {
    await client.query("BEGIN");
    await client.query(ORGANISATION, [entree.organizationId]);
    const ligne = (await client.query(SQL_EXECUTION_PUBLIEE, [entree.organizationId, entree.generationRunId])).rows[0] as
      | { trip_id?: unknown; created_by?: unknown; reclamee?: unknown }
      | undefined;
    if (ligne === undefined || typeof ligne.trip_id !== "string" || typeof ligne.created_by !== "string" || !UUID.test(ligne.created_by)) {
      await client.query("ROLLBACK");
      client.release();
      return { issue: "not_ready" };
    }
    if (ligne.reclamee !== false) {
      await client.query("ROLLBACK");
      client.release();
      return { issue: "already_sent" };
    }
    await client.query(UTILISATEUR, [ligne.created_by]);
    const email = ((await client.query(SQL_ADRESSE, [ligne.created_by])).rows[0] as { email?: unknown } | undefined)?.email;
    const lue = parseEmailAddress(email);
    if (!lue.ok || lue.email !== email) {
      await client.query("ROLLBACK");
      client.release();
      logEvent("email.address_refused", {}, "warn");
      return { issue: "no_address" };
    }
    const reclamee = (await client.query(SQL_RECLAMATION, [entree.organizationId, entree.generationRunId])).rows.length === 1;
    await client.query(reclamee ? "COMMIT" : "ROLLBACK");
    client.release();
    return reclamee ? { issue: "pret", to: lue.email, tripId: ligne.trip_id } : { issue: "already_sent" };
  } catch (erreur) {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release(erreur instanceof Error ? erreur : true);
    throw erreur;
  }
}

/** Erreurs de `./resend.ts` (que ce module n'importe pas : test de confinement, 0138 § 9 ligne 7b) dont l'événement est écrit. */
const DEJA_JOURNALISEES: ReadonlySet<string> = new Set(["ResendRefusError", "ResendEnvoiError"]);

function echec(erreur: unknown): ResultatApercuPret {
  logEvent("email.notification_failed", { errorName: errorNameOf(erreur) }, "warn");
  return "failed";
}

/** Envoie l'e-mail « propositions prêtes » de l'exécution publiée, au plus une fois par voyage ; ne lève jamais. */
export async function envoyerApercuPret(entree: EntreeApercuPret, deps: ApercuPretDeps): Promise<ResultatApercuPret> {
  try {
    if (typeof entree?.organizationId !== "string" || !UUID.test(entree.organizationId) || typeof entree.generationRunId !== "string" || !UUID.test(entree.generationRunId)) {
      return "not_ready";
    }
    let composition: CompositionNotifications;
    try {
      composition = deps.composer();
    } catch (erreur) {
      return echec(erreur);
    }
    // Sans transport ni origine : rien n'est lu ni réclamé (un transport posé plus tard ne renverra pas un aperçu ancien).
    if (composition.mailer === disabledNotificationMailer || composition.origine === null) {
      logEvent("email.transport_disabled", {}, "warn");
      return "disabled";
    }
    let lu: Lu;
    try {
      lu = await lireEtReclamer(entree, deps);
    } catch (erreur) {
      return echec(erreur);
    }
    if (lu.issue !== "pret") return lu.issue;
    try {
      await composition.mailer.sendApercuPret({ to: lu.to, origine: composition.origine, tripId: lu.tripId });
      return "sent";
    } catch (erreur) {
      if (erreur instanceof CodeMailerCapError) return "cap_reached";
      // Adresse ou enveloppe refusée (préparation commune), refus ou échec de Resend : l'événement est déjà écrit.
      if (erreur instanceof CodeMailerRefusalError || DEJA_JOURNALISEES.has(errorNameOf(erreur) ?? "")) return "failed";
      return echec(erreur);
    }
  } catch (erreur) {
    return echec(erreur);
  }
}
