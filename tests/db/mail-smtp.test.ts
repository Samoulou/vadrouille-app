import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SENDER_ADDRESS } from "@/server/config/email";
import { createSmtpCodeMailer, creerTransportSmtp, type MessageSmtp, type TransportSmtp } from "@/server/mail/smtp";

import { adresse } from "./auth-outils";
import { attendreMessages, dernierCodeMailpit, MAILPIT_SMTP, messagesPour } from "./mailpit";

/**
 * Implémentation SMTP du port d'envoi vers un vrai Mailpit (spécification B3b-envoi, critère E5 ; décision 0098 § 5) :
 * l'espion du transport enveloppe le **vrai** transport de `nodemailer`. Adresses `exemple.test` uniques à l'essai ;
 * Mailpit est joint sur la boucle locale seulement (`./mailpit.ts`).
 */

function espionner(): { transport: TransportSmtp; sendMail: ReturnType<typeof vi.fn<(message: MessageSmtp) => Promise<unknown>>> } {
  const reel = creerTransportSmtp(MAILPIT_SMTP);
  const sendMail = vi.fn((message: MessageSmtp) => reel.sendMail(message));
  return { transport: { sendMail }, sendMail };
}

let espions: ReturnType<typeof vi.spyOn>[] = [];
beforeEach(() => {
  espions = [vi.spyOn(console, "log"), vi.spyOn(console, "warn"), vi.spyOn(console, "error")];
});
afterEach(() => {
  for (const espion of espions) espion.mockRestore();
});

describe("email: une enveloppe refusée n'envoie rien (Mailpit)", () => {
  it("adresse valide → enveloppe explicite égale à la valeur comparée, maxRecipients 1, un seul message à un seul destinataire", async () => {
    const a = adresse("e5");
    const { transport, sendMail } = espionner();
    await createSmtpCodeMailer(MAILPIT_SMTP, { transport }).sendLoginCode({ to: a, code: "314159", expiresInMinutes: 10 });
    expect(sendMail).toHaveBeenCalledTimes(1);
    const envoye = sendMail.mock.calls[0]?.[0];
    expect(envoye?.envelope).toEqual({ from: SENDER_ADDRESS, to: [a] });
    expect(envoye?.maxRecipients).toBe(1);
    const recus = await attendreMessages(a);
    expect(recus).toHaveLength(1);
    const [recu] = recus;
    expect(recu?.to).toEqual([a]);
    expect(recu?.cc).toEqual([]);
    expect(recu?.bcc).toEqual([]);
    expect(recu?.from).toBe(SENDER_ADDRESS);
    expect(recu?.text).toContain("314159");
    expect(recu?.html).toBe("");
  });

  it("`a,b@exemple.test` forcé, contrôle d'adresse neutralisé → refus par checkEnvelope, ni sendMail ni transport, Mailpit ne reçoit rien", async () => {
    const suffixe = randomBytes(4).toString("hex");
    const forcee = `e5a${suffixe},e5b${suffixe}@exemple.test` as unknown as Parameters<ReturnType<typeof createSmtpCodeMailer>["sendLoginCode"]>[0]["to"];
    const { transport, sendMail } = espionner();
    const mailer = createSmtpCodeMailer(MAILPIT_SMTP, { transport, adresseAdmise: () => true });
    await expect(mailer.sendLoginCode({ to: forcee, code: "271828", expiresInMinutes: 10 })).rejects.toThrow();
    expect(sendMail).not.toHaveBeenCalled();
    expect(await messagesPour(`e5a${suffixe}`, 300)).toEqual([]);
    expect(await messagesPour(`e5b${suffixe}@exemple.test`)).toEqual([]);
    const ecrit = espions.flatMap((espion) => espion.mock.calls.flat()).map(String).join("\n");
    expect(ecrit).toContain("email.envelope_refused");
    expect(ecrit).not.toContain(suffixe);
    expect(ecrit).not.toContain("271828");
  });
});

describe("email: code lu dans Mailpit", () => {
  it("le dernier message de l'adresse porte un code de 6 chiffres, sans lien ni image", async () => {
    const a = adresse("lecture");
    await createSmtpCodeMailer(MAILPIT_SMTP).sendLoginCode({ to: a, code: "007007", expiresInMinutes: 10 });
    await attendreMessages(a);
    expect(await dernierCodeMailpit(a)).toBe("007007");
  });
});
