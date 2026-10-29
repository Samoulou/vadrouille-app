import "server-only";

import { createTransport } from "nodemailer";

import { SENDER_ADDRESS } from "@/server/config/email";
import type { CanonicalEmail } from "@/server/email";

import { logEvent } from "@/server/log";

import { preparerMessageApercu, preparerMessageCode } from "./avant-transport";
import { purgeEmailCounts, reserveEmail, type ReserveEmail } from "./plafond";
import {
  type ApercuPretMessage,
  type CodeMailer,
  CodeMailerCapError,
  CodeMailerRefusalError,
  type LoginCodeMessage,
  type NotificationMailer,
  PlafondIndisponibleError,
} from "./port";

/**
 * Implémentation SMTP du port d'envoi du code, **vers Mailpit seulement** (spécification B3b-envoi, points 3 à 5 ;
 * décision 0098 § 3 et § 6). Seul fichier du dépôt qui importe `nodemailer` (racine du paquet) et n'en utilise que
 * `createTransport`. Créée par `src/server/auth/index.ts` quand `EMAIL_TRANSPORT=smtp` (`parseServerEnv`) ; sans cette
 * variable, le port reste `disabledCodeMailer` (B3b-envoi-PO-2).
 *
 * - **Transport par options explicites**, jamais par une chaîne (0098 § 3.1 et § 3.2) : `OPTIONS_FIXES` plus l'hôte et
 *   le port, **aucune autre clé** (ni `auth`, `url`, `service`, `proxy`, `tls`, `pool`, `sendmail`). Journal et trace
 *   SMTP coupés (`logger` et `debug` à `false`) ; lecture de fichiers et d'URL par un contenu de message coupée ;
 *   délais de connexion de 10 secondes au plus. Créé à l'envoi (paresseusement, une fois), jamais à l'import.
 * - **Contrôle avant tout appel du transport** : `preparerMessageCode` (`./avant-transport.ts`, commun avec Resend)
 *   contrôle de nouveau l'adresse reçue par `parseEmailAddress` (point 4.1), puis `checkEnvelope` compile le message et
 *   compare son enveloppe à `{ from: SENDER_ADDRESS, to: [forme canonique] }` (point 4.3). Un refus écrit
 *   `email.address_refused` ou `email.envelope_refused` (sans valeur) et lève, **sans appeler le transport**.
 * - **Envoi** : le message contrôlé (quatre clés) avec l'enveloppe explicite, égale à la valeur comparée, et
 *   `maxRecipients: 1` (point 4.5).
 * - **Erreurs** : toute panne du transport (connexion, refus SMTP, délai) est remplacée par `SmtpEnvoiError`, sans
 *   message de la bibliothèque (il peut porter l'adresse, l'adresse IP ou le code) ni `cause` ; l'appelant en tire
 *   `provider_error` (`retryable: true`).
 */

/**
 * Cible du transport : l'hôte est la constante de la liste fermée de `parseServerEnv` (`SmtpHost`, seule définition, dans
 * `src/server/env/index.ts`, que ce module ne peut importer : `ligne/server-env-imports`), le port un entier (0098 § 2.3).
 */
export type SmtpTarget = { readonly host: string; readonly port: number };

/** Délai maximal de chaque étape de la connexion (décision 0098 § 3.2 : 10 secondes au plus). */
export const SMTP_DELAI_MS = 10_000;

/**
 * Options du transport autres que l'hôte et le port (décision 0098 § 3.2). `secure: false` sans `requireTLS` ni
 * `ignoreTLS` : SMTP en clair sur la boucle locale (§ 3.3). Exportées pour le test E2, qui vérifie l'objet exact.
 */
export const OPTIONS_FIXES = Object.freeze({
  secure: false,
  logger: false,
  debug: false,
  disableFileAccess: true,
  disableUrlAccess: true,
  connectionTimeout: SMTP_DELAI_MS,
  greetingTimeout: SMTP_DELAI_MS,
  socketTimeout: SMTP_DELAI_MS,
});

/** Message remis au transport : les quatre clés contrôlées, l'enveloppe explicite et `maxRecipients: 1`. */
export type MessageSmtp = {
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly envelope: { readonly from: string; readonly to: string[] };
  readonly maxRecipients: 1;
};

/** Seule opération du transport utilisée ; injectable pour les tests (espion, double). */
export type TransportSmtp = { sendMail(message: MessageSmtp): Promise<unknown> };

export type SmtpDeps = {
  /** Transport déjà construit (tests) ; sinon créé par `createTransport` au premier envoi. */
  readonly transport?: TransportSmtp;
  /** Contrôle de l'adresse reçue (point 4.1) ; réservé aux doubles de test du critère E5 (aucun appel de production). */
  readonly adresseAdmise?: (to: string) => boolean;
};

/** Options exactes passées à `createTransport` pour une cible. Exportée pour le test E2. */
export function optionsTransport(cible: SmtpTarget) {
  return { host: cible.host, port: cible.port, ...OPTIONS_FIXES };
}

/** Transport SMTP réel de la cible (options de `optionsTransport`) ; les tests avec Mailpit l'enveloppent d'un espion. */
export function creerTransportSmtp(cible: SmtpTarget): TransportSmtp {
  return createTransport(optionsTransport(cible));
}

/** Message du port refusé avant tout appel du transport (défini dans `./port.ts`, partagé avec `./resend.ts`). */
export { CodeMailerRefusalError };

/** Panne du transport SMTP ; ne porte aucune valeur ni cause (le message de la bibliothèque est perdu à dessein). */
export class SmtpEnvoiError extends Error {
  override name = "SmtpEnvoiError";

  constructor() {
    super("Envoi du code par SMTP en échec.");
  }
}

export function createSmtpCodeMailer(cible: SmtpTarget, deps: SmtpDeps = {}): CodeMailer {
  let transport: TransportSmtp | undefined = deps.transport;

  return Object.freeze({
    async sendLoginCode(message: LoginCodeMessage): Promise<void> {
      const to: CanonicalEmail = message.to;
      const envoi = preparerMessageCode(message, SENDER_ADDRESS, deps);
      try {
        transport ??= creerTransportSmtp(cible);
        await transport.sendMail({ ...envoi, envelope: { from: SENDER_ADDRESS, to: [to] }, maxRecipients: 1 });
      } catch {
        throw new SmtpEnvoiError();
      }
    },
  });
}

export type SmtpNotificationDeps = SmtpDeps & {
  /** Réservation dans le plafond (tests : compteur injecté) ; sinon `reserveEmail` (`./plafond.ts`). */
  readonly reserver?: ReserveEmail;
  /** Purge des jours échus après le transport (tests) ; sinon `purgeEmailCounts`. */
  readonly purger?: () => Promise<void>;
};

/**
 * Implémentation SMTP du port des notifications (M7a), **vers Mailpit seulement** (`local` et `ci`, même cible et mêmes
 * options que `createSmtpCodeMailer`). Ordre : préparation commune `preparerMessageApercu` (adresse refaite, origine et
 * voyage, quatre champs, `checkEnvelope`) ; réservation de l'usage `notification` dans le plafond global du jour (seuil
 * 80 : refus `email.cap_reached` et `CodeMailerCapError` ; base indisponible : `PlafondIndisponibleError`) ; un seul
 * `sendMail` (enveloppe explicite, `maxRecipients: 1`) ; purge des jours échus, qui ne lève jamais ; `email.sent`. Le
 * plafond est compté sur Mailpit aussi, pour que le test en CI vérifie le compteur que Resend utilisera.
 */
export function createSmtpNotificationMailer(cible: SmtpTarget, deps: SmtpNotificationDeps = {}): NotificationMailer {
  let transport: TransportSmtp | undefined = deps.transport;
  const reserver = deps.reserver ?? reserveEmail;
  const purger = deps.purger ?? purgeEmailCounts;

  return Object.freeze({
    async sendApercuPret(message: ApercuPretMessage): Promise<void> {
      const to: CanonicalEmail = message.to;
      const envoi = preparerMessageApercu(message, SENDER_ADDRESS, deps);
      const reservation = await reserver("notification");
      if (!reservation.ok) {
        if (reservation.reason === "cap_reached") {
          logEvent("email.cap_reached", { usage: "notification" }, "warn");
          throw new CodeMailerCapError();
        }
        throw new PlafondIndisponibleError();
      }
      let envoye = false;
      try {
        transport ??= creerTransportSmtp(cible);
        await transport.sendMail({ ...envoi, envelope: { from: SENDER_ADDRESS, to: [to] }, maxRecipients: 1 });
        envoye = true;
      } catch {
        // Message de la bibliothèque perdu à dessein (adresse, adresse IP) ; la purge court quand même.
      }
      await purger();
      if (!envoye) throw new SmtpEnvoiError();
      logEvent("email.sent", { usage: "notification" }, "info");
    },
  });
}
