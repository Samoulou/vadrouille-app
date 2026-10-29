import "server-only";

import { RESEND_SENDER_ADDRESS } from "@/server/config/email";
import { cleResend, type ResultatCleResend } from "@/server/env/cle-resend";
import { logEvent } from "@/server/log";

import type { EmailUsage } from "@/server/config/email";

import { type AvantTransportDeps, preparerMessageApercu, preparerMessageCode } from "./avant-transport";
import type { MessageControle } from "./enveloppe";
import { purgeEmailCounts, reserveEmail, type ReserveEmail } from "./plafond";
import { type ApercuPretMessage, CodeMailerCapError, type CodeMailer, type LoginCodeMessage, type NotificationMailer, PlafondIndisponibleError } from "./port";
import {
  ECHEC_DELAI,
  ECHEC_RESEAU,
  ECHEC_SERVEUR,
  nomErreurResend,
  OCTETS_CORPS_MAX,
  type ResultatResend,
  traduireReponseResend,
} from "./reponses-resend";

/**
 * Implémentation Resend du port d'envoi du code (spécification B3d, point 1 ; décision 0138 § 1.1, option A, et T3 :
 * `fetch` natif, aucune dépendance). Créée par `src/server/auth/index.ts` quand `parseServerEnv` rend
 * `emailTransport: "resend"`, c'est-à-dire dans le seul cas admis de 0138 § 3 ; jusqu'à M1h, ce cas s'arrête sur
 * `AUTH_ADAPTER` refusé, et ce module n'est donc construit nulle part hors des tests.
 *
 * Ordre de `sendLoginCode` (0138 C2), chaque refus arrêtant tout ce qui suit ; les étapes 1 à 3 sont celles de
 * `preparerMessageCode` (`./avant-transport.ts`), **communes** avec l'implémentation SMTP :
 * 1. contrôle refait de l'adresse par `parseEmailAddress` → `email.address_refused` ;
 * 2. construction des quatre champs (texte de B3b-envoi-PO-1, expéditeur `RESEND_SENDER_ADDRESS`) ;
 * 3. `checkEnvelope` → `email.envelope_refused` ;
 * 4. `cleResend` (barrière de sortie, cas admis, forme de la clé) → `email.transport_refused` ; rien n'est réservé ;
 * 5. réservation dans le plafond global du jour (`./plafond.ts`) → `email.cap_reached` et `CodeMailerCapError` ;
 * 6. **un seul** appel du transport, options fermées ; aucune nouvelle tentative, aucun repli (C4) ;
 * 7. traduction par le tableau de `./reponses-resend.ts` → `email.sent`, ou `email.provider_refused` et une erreur ;
 * 8. **après** le transport, quelle qu'en soit l'issue : purge des jours échus du plafond (`purgeEmailCounts`), qui ne
 *    lève jamais et ne court qu'à l'ouverture d'un jour nouveau (revue de la PR 850, mineur 2).
 *
 * L'e-mail « propositions prêtes » (M7a, `createResendNotificationMailer`) suit **le même chemin** (`envoyerControle`) avec
 * l'usage `notification` : préparation commune `preparerMessageApercu` (étapes 1 à 3), puis les étapes 4 à 8 ci-dessus à
 * l'identique ; la réservation n'est acceptée que sous le seuil des notifications (80, `EMAIL_THRESHOLDS`).
 *
 * Erreurs : `name` fixe, message fixe, jamais de `cause` ni de propriété (C5) : ni adresse, ni code, ni clé, ni corps, ni
 * en-tête, ni message de Resend. La clé est relue à chaque envoi et ne vit que le temps de l'appel (C3).
 */

/** Adresse de l'API d'envoi (0138 C1 et § 1.1 point 1) : constante littérale, exportée pour son seul test. */
export const RESEND_API_URL = "https://api.resend.com/emails";

/** Délai unique de l'envoi : connexion, réponse et lecture du corps d'erreur (0138 § 1.1 point 7). */
export const RESEND_DELAI_MS = 10_000;

/** Options de l'appel (0138 § 1.1 point 2) : exactement celles-ci, rien d'autre. */
export type OptionsEnvoiResend = {
  readonly method: "POST";
  readonly headers: { readonly Authorization: string; readonly "Content-Type": "application/json" };
  readonly body: string;
  readonly redirect: "error";
  readonly credentials: "omit";
  readonly cache: "no-store";
  readonly signal: AbortSignal;
};

/** Seule opération du transport utilisée (signature de `fetch`, restreinte) ; injectable pour les tests (double). */
export type TransportResend = (url: string, options: OptionsEnvoiResend) => Promise<Response>;

export type ResendDeps = AvantTransportDeps & {
  /** Transport injecté (tests : double) ; sinon le `fetch` global de Node, lu à l'envoi. */
  readonly transport?: TransportResend;
  /** Lecture de la clé (tests : sentinelle) ; sinon `cleResend` sur `process.env`, à chaque envoi (0138 § 1.1 point 10). */
  readonly lireCle?: () => ResultatCleResend;
  /** Réservation dans le plafond (tests : compteur injecté) ; sinon `reserveEmail` (`./plafond.ts`). */
  readonly reserver?: ReserveEmail;
  /** Purge des jours échus après le transport (tests : purge du plafond injecté) ; sinon `purgeEmailCounts`. */
  readonly purger?: () => Promise<void>;
};

/** Refus avant tout contact de Resend : barrière de sortie, cas admis ou clé (0138 § 4 point 2). Aucune valeur. */
export class ResendRefusError extends Error {
  override name = "ResendRefusError";

  constructor() {
    super("Envoi par Resend refusé avant le transport.");
  }
}

/** Plafond global indisponible (défini avec le port, M7a), réexporté pour les tests et les appelants de ce module. */
export { PlafondIndisponibleError };

/** Échec de l'envoi par Resend (réponse refusée, délai, réseau) ; aucune valeur ni cause. */
export class ResendEnvoiError extends Error {
  override name = "ResendEnvoiError";

  constructor() {
    super("Envoi du code par Resend en échec.");
  }
}

/** Corps d'erreur lu par le flux, au plus `OCTETS_CORPS_MAX` octets (0138 § 1.1 point 9) ; le reste est abandonné. */
async function corpsBorne(reponse: Response): Promise<string> {
  const flux = reponse.body;
  if (flux === null) return "";
  const lecteur = flux.getReader();
  const octets = new Uint8Array(OCTETS_CORPS_MAX);
  let lus = 0;
  try {
    while (lus < OCTETS_CORPS_MAX) {
      const morceau = await lecteur.read();
      if (morceau.done) break;
      const pris = morceau.value.subarray(0, OCTETS_CORPS_MAX - lus);
      octets.set(pris, lus);
      lus += pris.byteLength;
    }
  } finally {
    await lecteur.cancel().catch(() => undefined);
  }
  return new TextDecoder().decode(octets.subarray(0, lus));
}

/** Délai dépassé : signal déclenché, ou rejet `TimeoutError` d'`AbortSignal.timeout` (nom seul, jamais le message). */
function delaiDepasse(erreur: unknown, signal: AbortSignal): boolean {
  if (signal.aborted) return true;
  try {
    return (erreur as { name?: unknown } | null)?.name === "TimeoutError";
  } catch {
    return false;
  }
}

/** Redirection refusée par `redirect: "error"` (Node : `TypeError` de cause « unexpected redirect ») ; jamais lue ailleurs. */
function redirectionRefusee(erreur: unknown): boolean {
  try {
    const cause: unknown = (erreur as { cause?: unknown } | null)?.cause;
    return erreur instanceof TypeError && cause instanceof Error && cause.message === "unexpected redirect";
  } catch {
    return false;
  }
}

/** Réponse reçue → résultat : 200 sans lire le corps ; sinon seul le `name` du corps borné (0138 § 1.1 points 8 et 9). */
async function traduire(reponse: Response, signal: AbortSignal): Promise<ResultatResend> {
  const statut = reponse.status;
  if (statut === 200) {
    await reponse.body?.cancel().catch(() => undefined);
    return traduireReponseResend(statut, undefined);
  }
  let corps = "";
  try {
    corps = await corpsBorne(reponse);
  } catch (erreur) {
    // Corps illisible : traduit sur le statut seul, sauf délai dépassé pendant la lecture.
    if (delaiDepasse(erreur, signal)) return ECHEC_DELAI;
  }
  return traduireReponseResend(statut, nomErreurResend(corps));
}

/**
 * Étapes 4 à 8 de l'ordre C2 sur la copie contrôlée `envoi` (rendue par la préparation commune), pour l'usage donné : clé,
 * réservation, un seul appel, purge, traduction. Une seule définition pour le code et pour les notifications.
 */
async function envoyerControle(envoi: MessageControle, usage: EmailUsage, deps: ResendDeps): Promise<void> {
  const lireCle = deps.lireCle ?? (() => cleResend());
  const reserver = deps.reserver ?? reserveEmail;
  const purger = deps.purger ?? purgeEmailCounts;

  const cle = lireCle();
  if (!cle.ok) {
    logEvent("email.transport_refused", { reason: cle.code }, "error");
    throw new ResendRefusError();
  }

  const reservation = await reserver(usage);
  if (!reservation.ok) {
    if (reservation.reason === "cap_reached") {
      logEvent("email.cap_reached", { usage }, "warn");
      throw new CodeMailerCapError();
    }
    throw new PlafondIndisponibleError();
  }

  const envoyer: TransportResend = deps.transport ?? fetch;
  const signal = AbortSignal.timeout(RESEND_DELAI_MS);
  let resultat: ResultatResend;
  try {
    const reponse = await envoyer(RESEND_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${cle.cle}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: envoi.from, to: [envoi.to], subject: envoi.subject, text: envoi.text }),
      redirect: "error",
      credentials: "omit",
      cache: "no-store",
      signal,
    });
    resultat = await traduire(reponse, signal);
  } catch (erreur) {
    resultat = delaiDepasse(erreur, signal) ? ECHEC_DELAI : redirectionRefusee(erreur) ? ECHEC_SERVEUR : ECHEC_RESEAU;
  }
  // Hors du chemin d'avant-transport : la purge ne retarde jamais l'appel de Resend, et ne lève jamais.
  await purger();

  if (resultat.issue === "succes") {
    logEvent("email.sent", { usage }, "info");
    return;
  }
  if (resultat.issue === "plafond") {
    logEvent("email.provider_refused", { reason: resultat.reason }, "warn");
    throw new CodeMailerCapError();
  }
  const niveau = resultat.reason === "auth" || resultat.reason === "server_error" ? "error" : "warn";
  logEvent("email.provider_refused", { reason: resultat.reason }, niveau);
  throw new ResendEnvoiError();
}

export function createResendCodeMailer(deps: ResendDeps = {}): CodeMailer {
  return Object.freeze({
    async sendLoginCode(message: LoginCodeMessage): Promise<void> {
      await envoyerControle(preparerMessageCode(message, RESEND_SENDER_ADDRESS, deps), "connexion", deps);
    },
  });
}

/**
 * Implémentation Resend du port des notifications (M7a) : préparation commune `preparerMessageApercu`, puis le chemin de
 * `sendLoginCode` (`envoyerControle`) avec l'usage `notification`. Créée par la composition de `src/server/auth/index.ts`
 * avec `EMAIL_TRANSPORT=resend`, c'est-à-dire dans le seul cas admis de 0138 § 3.
 */
export function createResendNotificationMailer(deps: ResendDeps = {}): NotificationMailer {
  return Object.freeze({
    async sendApercuPret(message: ApercuPretMessage): Promise<void> {
      await envoyerControle(preparerMessageApercu(message, RESEND_SENDER_ADDRESS, deps), "notification", deps);
    },
  });
}
