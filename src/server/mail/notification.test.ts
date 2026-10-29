// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PRODUCT_NAME } from "@/config/site";
import { RESEND_SENDER_ADDRESS, SENDER_ADDRESS } from "@/server/config/email";
import { type CanonicalEmail, parseEmailAddress } from "@/server/email";

import { lienApercu, preparerMessageApercu } from "./avant-transport";
import type { EmailReservation, ReserveEmail } from "./plafond";
import { type ApercuPretMessage, CodeMailerCapError, CodeMailerRefusalError, PlafondIndisponibleError } from "./port";
import { createResendNotificationMailer, RESEND_API_URL, ResendRefusError, type TransportResend } from "./resend";
import { createSmtpNotificationMailer, type MessageSmtp, SmtpEnvoiError } from "./smtp";

/**
 * Ports des notifications (M7a, PR 870) : préparation commune de l'e-mail « propositions prêtes », implémentation SMTP
 * (Mailpit) et implémentation Resend sur des **doubles** (transport injecté : aucun appel réseau, jamais Resend ; clé
 * sentinelle), plafond simulé par un compteur. Le plafond réel et Mailpit sont dans `tests/db/apercu-pret.test.ts`.
 */

const canonique = (entree: string): CanonicalEmail => {
  const lu = parseEmailAddress(entree);
  if (!lu.ok) throw new Error("adresse refusée");
  return lu.email;
};
const A = canonique("a@exemple.test");
/** Valeur forcée dans le type de marque, **sans** `parseEmailAddress` (comme `resend.test.ts`) : réservé à ce test. */
const forcee = (valeur: string) => valeur as unknown as ApercuPretMessage["to"];
const TRIP = "00000000-0000-4000-8000-0000000000c3";
const MESSAGE: ApercuPretMessage = { to: A, origine: "https://essai.exemple.test", tripId: TRIP };
const LIEN = `https://essai.exemple.test/voyages/${TRIP}/presentation`;
const CIBLE = { host: "127.0.0.1", port: 1025 };

function compteur(refus?: EmailReservation & { ok: false }) {
  const appels: string[] = [];
  const reserver: ReserveEmail = async (usage) => {
    appels.push(usage);
    return refus ?? { ok: true, total: appels.length };
  };
  return { reserver, appels };
}

let espions: ReturnType<typeof vi.spyOn>[];
const evenements = () => espions.flatMap((espion) => espion.mock.calls.flat()).map((ligne) => JSON.parse(String(ligne)) as Record<string, unknown>);

beforeEach(() => {
  espions = [vi.spyOn(console, "log").mockImplementation(() => {}), vi.spyOn(console, "warn").mockImplementation(() => {}), vi.spyOn(console, "error").mockImplementation(() => {})];
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("email: préparation de « propositions prêtes » (PR 870)", () => {
  it("objet et corps fixes en français, lien de la présentation du voyage, aucune autre donnée", () => {
    const envoi = preparerMessageApercu(MESSAGE, SENDER_ADDRESS);
    expect(envoi).toEqual({
      from: SENDER_ADDRESS,
      to: A,
      subject: "Tes premières propositions sont prêtes",
      text: `Tes premières propositions sont prêtes.\n\nPour les voir : ${LIEN}\n\nTu reçois ce message parce que tu as lancé la préparation d'un voyage sur ${PRODUCT_NAME}.`,
    });
    expect(lienApercu(MESSAGE.origine, TRIP.toUpperCase())).toBe(LIEN);
    expect(`${envoi.subject}${envoi.text}`).not.toMatch(/!|aperçu|ChIJ|google/i);
  });

  it.each([
    ["origine avec chemin", { ...MESSAGE, origine: "https://essai.exemple.test/x" }],
    ["origine avec barre finale", { ...MESSAGE, origine: "https://essai.exemple.test/" }],
    ["origine sans schéma web", { ...MESSAGE, origine: "javascript:alert(1)" }],
    ["origine avec identifiants", { ...MESSAGE, origine: "https://u:p@essai.exemple.test" }],
    ["voyage qui n'est pas un uuid", { ...MESSAGE, tripId: "../../compte" }],
  ])("%s : refus avant tout envoi, sans valeur", (_cas, message) => {
    expect(() => preparerMessageApercu(message, SENDER_ADDRESS)).toThrow(CodeMailerRefusalError);
  });

  it("adresse non canonique : email.address_refused et refus ; enveloppe altérée : email.envelope_refused et refus", () => {
    expect(() => preparerMessageApercu({ ...MESSAGE, to: forcee("A@Exemple.test") }, SENDER_ADDRESS)).toThrow(CodeMailerRefusalError);
    expect(() => preparerMessageApercu(MESSAGE, SENDER_ADDRESS, { completerDonnees: (d) => ({ ...d, bcc: "b@exemple.test" }) })).toThrow(CodeMailerRefusalError);
    expect(evenements().map((e) => e.event)).toEqual(["email.address_refused", "email.envelope_refused"]);
  });
});

describe("email: port SMTP des notifications, Mailpit (PR 870)", () => {
  function banc(refus?: EmailReservation & { ok: false }, panne = false) {
    const sendMail = vi.fn(async (message: MessageSmtp) => {
      expect(message.maxRecipients).toBe(1);
      if (panne) throw new Error("SENTINELLE 127.0.0.1 a@exemple.test");
      return {};
    });
    const plafond = compteur(refus);
    const purger = vi.fn(async () => undefined);
    const mailer = createSmtpNotificationMailer(CIBLE, { transport: { sendMail }, reserver: plafond.reserver, purger });
    return { mailer, sendMail, plafond, purger };
  }

  it("réserve l'usage notification, puis un seul sendMail à enveloppe explicite, puis la purge ; email.sent usage notification", async () => {
    const { mailer, sendMail, plafond, purger } = banc();
    await mailer.sendApercuPret(MESSAGE);
    expect(plafond.appels).toEqual(["notification"]);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0]?.[0]).toEqual({ ...preparerMessageApercu(MESSAGE, SENDER_ADDRESS), envelope: { from: SENDER_ADDRESS, to: [A] }, maxRecipients: 1 });
    expect(purger).toHaveBeenCalledTimes(1);
    expect(evenements()).toEqual([{ level: "info", event: "email.sent", usage: "notification" }]);
  });

  it("seuil des notifications atteint : CodeMailerCapError, email.cap_reached usage notification, aucun sendMail", async () => {
    const { mailer, sendMail } = banc({ ok: false, reason: "cap_reached" });
    await expect(mailer.sendApercuPret(MESSAGE)).rejects.toBeInstanceOf(CodeMailerCapError);
    expect(sendMail).not.toHaveBeenCalled();
    expect(evenements()).toEqual([{ level: "warn", event: "email.cap_reached", usage: "notification" }]);
  });

  it("plafond indisponible : échec fermé, PlafondIndisponibleError, aucun sendMail", async () => {
    const { mailer, sendMail } = banc({ ok: false, reason: "unavailable" });
    await expect(mailer.sendApercuPret(MESSAGE)).rejects.toBeInstanceOf(PlafondIndisponibleError);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("préparation refusée : rien n'est réservé ni envoyé", async () => {
    const { mailer, sendMail, plafond } = banc();
    await expect(mailer.sendApercuPret({ ...MESSAGE, tripId: "x" })).rejects.toBeInstanceOf(CodeMailerRefusalError);
    expect(plafond.appels).toEqual([]);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("panne du transport : SmtpEnvoiError sans message de la bibliothèque, purge faite, aucun email.sent", async () => {
    const { mailer, purger } = banc(undefined, true);
    const erreur = await mailer.sendApercuPret(MESSAGE).catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(SmtpEnvoiError);
    expect(String((erreur as Error).message)).not.toContain("SENTINELLE");
    expect(purger).toHaveBeenCalledTimes(1);
    expect(evenements()).toEqual([]);
  });
});

describe("email: port Resend des notifications, sur un double (PR 870)", () => {
  const CLE = "re_SENTINELLE_exemple_0000000000";

  function banc(options: { refus?: EmailReservation & { ok: false }; cle?: boolean } = {}) {
    const transport = vi.fn<TransportResend>(async () => new Response(null, { status: 200 }));
    const lireCle = vi.fn(() => (options.cle === false ? ({ ok: false as const, code: "not_admitted" as const }) : { ok: true as const, cle: CLE }));
    const plafond = compteur(options.refus);
    const purger = vi.fn(async () => undefined);
    const mailer = createResendNotificationMailer({ transport, lireCle, reserver: plafond.reserver, purger });
    return { mailer, transport, lireCle, plafond, purger };
  }

  it("même chemin que le code : clé, réservation notification, un seul POST du message préparé, email.sent usage notification", async () => {
    const { mailer, transport, plafond } = banc();
    await mailer.sendApercuPret(MESSAGE);
    expect(plafond.appels).toEqual(["notification"]);
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, options] = transport.mock.calls[0] ?? [];
    expect(url).toBe(RESEND_API_URL);
    const envoi = preparerMessageApercu(MESSAGE, RESEND_SENDER_ADDRESS);
    expect(JSON.parse(String(options?.body))).toEqual({ from: RESEND_SENDER_ADDRESS, to: [A], subject: envoi.subject, text: envoi.text });
    expect(options?.redirect).toBe("error");
    expect(evenements()).toEqual([{ level: "info", event: "email.sent", usage: "notification" }]);
  });

  it("seuil des notifications atteint : aucun appel du double ; clé refusée : rien n'est réservé", async () => {
    const plein = banc({ refus: { ok: false, reason: "cap_reached" } });
    await expect(plein.mailer.sendApercuPret(MESSAGE)).rejects.toBeInstanceOf(CodeMailerCapError);
    expect(plein.transport).not.toHaveBeenCalled();
    const refuse = banc({ cle: false });
    await expect(refuse.mailer.sendApercuPret(MESSAGE)).rejects.toBeInstanceOf(ResendRefusError);
    expect(refuse.plafond.appels).toEqual([]);
    expect(refuse.transport).not.toHaveBeenCalled();
  });
});
