import "server-only";

import { createDatabase } from "../../../db/index.ts";
import { EMAIL_COUNTS_RETENTION_DAYS, EMAIL_THRESHOLDS, EMAIL_USAGES, type EmailUsage } from "@/server/config/email";

/**
 * Plafond global quotidien des envois d'e-mails (spécification B3d, point 3 ; décision 0138 § 11, T1 et T2, confirmés par
 * le Tech Lead dans la revue de #840). **Seule façon** de réserver un envoi : l'implémentation Resend du port l'appelle
 * avant tout appel du transport ; les e-mails de notification (M7a, M6c) l'appelleront avec l'usage `notification`.
 *
 * - **Stockage** : table `email_daily_counts` (migration `0020_plafond_emails`), une ligne par jour civil UTC calculé par
 *   la base (`(now() AT TIME ZONE 'UTC')::date`, B3d-PO-1), une colonne par usage ; aucune adresse, aucun hachage, aucun
 *   identifiant d'organisation. Jamais en mémoire du processus, jamais un stockage propre à Vercel (0002).
 * - **Rôle et pool** : pool propre de `vadrouille_app` (2 connexions, délais de quelques secondes, dans les 20 s de
 *   `DUREE_SOUS_VERROU_MS` de `src/server/auth`), puis `SET LOCAL ROLE vadrouille_mail_counter` dans une transaction,
 *   comme le limiteur. La réservation ne passe ni par la transaction de `requestCode` ni par son pool `verrous` : elle
 *   est **validée avant** l'appel du transport, et l'annulation de `requestCode` ne la défait pas (B3d-PO-2).
 * - **Atomicité sur le total** : `INSERT … ON CONFLICT (day) DO NOTHING`, puis **un seul** `UPDATE` de la ligne du jour
 *   sous la condition `connexion + notification < seuil` ; le verrou de ligne et la réévaluation de la condition par
 *   Postgres sur la version verrouillée empêchent tout dépassement sous la concurrence ; zéro ligne rendue = refus, et
 *   rien n'est modifié (aucune réservation partielle entre usages).
 * - **Purge** à l'écriture, après une réservation acceptée et validée, dans une transaction distincte : les jours de
 *   plus de 7 jours (borne posée par la requête, à l'horloge de la base). Elle ne fait jamais échouer ni annuler la
 *   réservation (condition (a) du Tech Lead) : son erreur est rattrapée, sans journal.
 * - **Échec fermé** : seuils absents ou invalides, connexion ou requête en erreur, résultat illisible → `unavailable`,
 *   jamais une absence de plafond ; l'appelant n'envoie rien (`provider_error`).
 */

/** Client et pool minimaux (`pg.PoolClient`, `pg.Pool`), injectables par les tests (base indisponible, R8). */
export type EmailCapClient = {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
  release(error?: Error | boolean): void;
};
export type EmailCapPool = { connect(): Promise<EmailCapClient> };

/**
 * Résultat d'une réservation. Accepté : `total` est le total du jour, tous usages confondus, **après** l'incrément (une
 * notification acceptée a donc trouvé un total inférieur à 80 : `total` ≤ 80). Refusé : `cap_reached` (seuil de
 * l'usage atteint) ou `unavailable` (échec fermé). Aucune valeur personnelle.
 */
export type EmailReservation =
  | { readonly ok: true; readonly total: number }
  | { readonly ok: false; readonly reason: "cap_reached" | "unavailable" };

export type ReserveEmail = (usage: EmailUsage) => Promise<EmailReservation>;

export type EmailCapOptions = {
  /** Pool injecté (sinon le pool propre de `vadrouille_app`, créé au premier appel). */
  readonly pool?: EmailCapPool;
  /** Seuils par usage (sinon `EMAIL_THRESHOLDS`, `src/server/config/email.ts`) ; invalides : échec fermé (R8). */
  readonly thresholds?: Readonly<Record<string, unknown>>;
  /** Crochet de test : appelé dans la transaction de purge, avant la suppression (R7 : purge en erreur). */
  readonly beforePurge?: () => void | Promise<void>;
};

/** Bornes du pool propre (décision 0138 § 11, T1) : 2 connexions, attente et requête de quelques secondes. */
const POOL_PLAFOND = { max: 2, connectionTimeoutMillis: 3_000, query_timeout: 3_000 } as const;

const ROLE = "SET LOCAL ROLE vadrouille_mail_counter";
const JOUR = "(pg_catalog.now() AT TIME ZONE 'UTC')::date";
const LIGNE_DU_JOUR = `INSERT INTO public.email_daily_counts (day) VALUES (${JOUR}) ON CONFLICT (day) DO NOTHING`;
/** Une requête par usage, texte constant : le nom de colonne n'est jamais calculé à partir d'une entrée. */
const RESERVATIONS: Readonly<Record<EmailUsage, string>> = Object.freeze({
  connexion: `UPDATE public.email_daily_counts SET connexion = connexion + 1
WHERE day = ${JOUR} AND connexion + notification < $1
RETURNING connexion + notification AS total`,
  notification: `UPDATE public.email_daily_counts SET notification = notification + 1
WHERE day = ${JOUR} AND connexion + notification < $1
RETURNING connexion + notification AS total`,
});
const PURGE = `DELETE FROM public.email_daily_counts WHERE day < ${JOUR} - $1::integer`;

const REFUS_PLAFOND: EmailReservation = Object.freeze({ ok: false, reason: "cap_reached" });
const INDISPONIBLE: EmailReservation = Object.freeze({ ok: false, reason: "unavailable" });

const usageAdmis = (usage: unknown): usage is EmailUsage => (EMAIL_USAGES as readonly unknown[]).includes(usage);
const seuilValide = (valeur: unknown): valeur is number => typeof valeur === "number" && Number.isSafeInteger(valeur) && valeur >= 1;

/** Pool propre de `vadrouille_app` (fabrique gardée de `db/connection.ts`, environnement lu à l'appel). */
const poolParDefaut = (): EmailCapPool => createDatabase("vadrouille_app", undefined, POOL_PLAFOND).$client;

async function annuler(client: EmailCapClient): Promise<void> {
  await client.query("ROLLBACK").catch(() => undefined);
}

export function createEmailCap(options: EmailCapOptions = {}): { readonly reserve: ReserveEmail } {
  const seuils = options.thresholds ?? EMAIL_THRESHOLDS;
  let pool: EmailCapPool | undefined = options.pool;

  async function purger(): Promise<void> {
    let client: EmailCapClient | undefined;
    try {
      client = await (pool ??= poolParDefaut()).connect();
      await client.query("BEGIN");
      await client.query(ROLE);
      await options.beforePurge?.();
      await client.query(PURGE, [EMAIL_COUNTS_RETENTION_DAYS]);
      await client.query("COMMIT");
      client.release();
    } catch (error) {
      // Condition (a) du Tech Lead (0138 § 11) : la réservation est déjà validée ; la purge suivante reprendra.
      if (client) {
        await annuler(client);
        client.release(error instanceof Error ? error : true);
      }
    }
  }

  async function reserve(usage: EmailUsage): Promise<EmailReservation> {
    if (!usageAdmis(usage) || !Object.hasOwn(seuils, usage)) return INDISPONIBLE;
    const seuil = seuils[usage];
    if (!seuilValide(seuil)) return INDISPONIBLE;
    let client: EmailCapClient | undefined;
    let total: number | null;
    try {
      client = await (pool ??= poolParDefaut()).connect();
      await client.query("BEGIN");
      await client.query(ROLE);
      await client.query(LIGNE_DU_JOUR);
      const ligne = (await client.query(RESERVATIONS[usage], [seuil])).rows[0] as { total?: unknown } | undefined;
      total = ligne === undefined ? null : Number(ligne.total);
      await client.query("COMMIT");
      client.release();
    } catch (error) {
      if (client) {
        await annuler(client);
        client.release(error instanceof Error ? error : true);
      }
      return INDISPONIBLE;
    }
    if (total === null) return REFUS_PLAFOND;
    // Ligne rendue mais total illisible : la réservation est validée, l'envoi reste refusé (échec fermé).
    if (!Number.isSafeInteger(total) || total < 1) return INDISPONIBLE;
    await purger();
    return Object.freeze({ ok: true, total });
  }

  return Object.freeze({ reserve });
}

let parDefaut: { readonly reserve: ReserveEmail } | undefined;

/**
 * Réserve un envoi de l'usage donné dans le plafond global du jour (pool propre de `vadrouille_app`, seuils de
 * `src/server/config/email.ts`). Fonction exportée pour M7a et M6c ; aucune autre façon d'appeler un transport réel.
 */
export function reserveEmail(usage: EmailUsage): Promise<EmailReservation> {
  return (parDefaut ??= createEmailCap()).reserve(usage);
}
