// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SENDER_ADDRESS } from "@/server/config/email";
import { type CanonicalEmail, parseEmailAddress } from "@/server/email";
import type { LoginCodeMessage } from "@/server/mail/port";
import { createSmtpCodeMailer, CodeMailerRefusalError, type MessageSmtp, OPTIONS_FIXES, optionsTransport, SmtpEnvoiError, type SmtpHost } from "@/server/mail/smtp";

const envoyer = vi.hoisted(() => ({ sendMail: vi.fn() }));
const fabrique = vi.hoisted(() => ({ createTransport: vi.fn() }));
vi.mock("nodemailer", () => ({ createTransport: fabrique.createTransport }));

/**
 * Implémentation SMTP du port d'envoi (spécification B3b-envoi, points 3 à 5 ; critères E2 (création du transport),
 * E5 et E6 ; décision 0098 § 3.2). `createTransport` est un espion : aucun socket n'est ouvert, aucun message ne part.
 * Les tests avec Mailpit (message reçu, un seul destinataire) sont dans `tests/db/mail-smtp.test.ts`. Adresses en
 * `exemple.test`.
 */

const canonique = (entree: string): CanonicalEmail => {
  const lu = parseEmailAddress(entree);
  if (!lu.ok) throw new Error("adresse refusée");
  return lu.email;
};
/** Valeur forcée dans le type de marque, **sans** `parseEmailAddress` (critère E5) : réservé à ce test. */
const forcee = (valeur: string) => valeur as unknown as LoginCodeMessage["to"];
const A = canonique("a@exemple.test");
const CIBLE = { host: "127.0.0.1", port: 1025 } as const;

/** Lignes écrites par le journal (sortie standard, d'erreur et avertissements), en texte. */
function sortieJournal(espions: ReturnType<typeof vi.spyOn>[]): string {
  return espions.flatMap((espion) => espion.mock.calls.flat()).map(String).join("\n");
}

let espions: ReturnType<typeof vi.spyOn>[];

beforeEach(() => {
  envoyer.sendMail.mockReset().mockResolvedValue({ accepted: [] });
  fabrique.createTransport.mockReset().mockImplementation(() => ({ sendMail: envoyer.sendMail }));
  espions = [vi.spyOn(console, "log").mockImplementation(() => {}), vi.spyOn(console, "warn").mockImplementation(() => {}), vi.spyOn(console, "error").mockImplementation(() => {})];
});

afterEach(() => {
  for (const espion of espions) espion.mockRestore();
});

describe("email: transport SMTP par options explicites", () => {
  it.each<[SmtpHost, number]>([
    ["127.0.0.1", 1025],
    ["localhost", 2525],
    ["::1", 1025],
    ["mailpit", 1025],
  ])("%s:%i → un objet aux seules clés de la décision 0098 § 3.2, jamais une chaîne", async (host, port) => {
    const mailer = createSmtpCodeMailer({ host, port });
    expect(fabrique.createTransport).not.toHaveBeenCalled();
    await mailer.sendLoginCode({ to: A, code: "123456", expiresInMinutes: 10 });
    expect(fabrique.createTransport).toHaveBeenCalledTimes(1);
    const [options, ...autres] = fabrique.createTransport.mock.calls[0] ?? [];
    expect(autres).toEqual([]);
    expect(typeof options).toBe("object");
    expect(options).toEqual({
      host,
      port,
      secure: false,
      logger: false,
      debug: false,
      disableFileAccess: true,
      disableUrlAccess: true,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 10_000,
    });
    expect(Object.keys(options as object).sort()).toEqual(
      ["connectionTimeout", "debug", "disableFileAccess", "disableUrlAccess", "greetingTimeout", "host", "logger", "port", "secure", "socketTimeout"],
    );
    expect(optionsTransport({ host, port })).toEqual(options);
  });

  it("aucune option d'authentification, de proxy, de TLS, de service ni d'URL ; délais de 10 secondes au plus", () => {
    const cles = Object.keys(optionsTransport(CIBLE));
    for (const interdite of ["auth", "url", "service", "proxy", "tls", "pool", "sendmail", "requireTLS", "ignoreTLS", "getSocket", "name", "localAddress"]) {
      expect(cles).not.toContain(interdite);
    }
    for (const delai of [OPTIONS_FIXES.connectionTimeout, OPTIONS_FIXES.greetingTimeout, OPTIONS_FIXES.socketTimeout]) {
      expect(delai).toBeGreaterThan(0);
      expect(delai).toBeLessThanOrEqual(10_000);
    }
    expect(Object.isFrozen(OPTIONS_FIXES)).toBe(true);
  });

  it("le transport est créé une seule fois, au premier envoi", async () => {
    const mailer = createSmtpCodeMailer(CIBLE);
    await mailer.sendLoginCode({ to: A, code: "123456", expiresInMinutes: 10 });
    await mailer.sendLoginCode({ to: A, code: "654321", expiresInMinutes: 10 });
    expect(fabrique.createTransport).toHaveBeenCalledTimes(1);
    expect(envoyer.sendMail).toHaveBeenCalledTimes(2);
  });
});

describe("email: une enveloppe refusée n'envoie rien", () => {
  it("adresse valide → enveloppe explicite égale à la valeur comparée, maxRecipients 1, texte du code sans lien", async () => {
    await createSmtpCodeMailer(CIBLE).sendLoginCode({ to: A, code: "042137", expiresInMinutes: 10 });
    expect(envoyer.sendMail).toHaveBeenCalledTimes(1);
    const envoye = envoyer.sendMail.mock.calls[0]?.[0] as MessageSmtp;
    expect(Object.keys(envoye).sort()).toEqual(["envelope", "from", "maxRecipients", "subject", "text", "to"]);
    expect(envoye.envelope).toEqual({ from: SENDER_ADDRESS, to: ["a@exemple.test"] });
    expect(envoye.maxRecipients).toBe(1);
    expect(envoye.from).toBe(SENDER_ADDRESS);
    expect(envoye.to).toBe("a@exemple.test");
    expect(envoye.subject).toBe("Ton code de connexion Vadrouille");
    expect(envoye.text).toContain("042137");
    expect(envoye.text).toContain("10 minutes");
    expect(envoye.text).toContain("Si tu n'as rien demandé, ignore ce message.");
    expect(envoye.text).not.toMatch(/https?:|www\.|<[a-z]/i);
  });

  it("`a,b@exemple.test` forcé dans le type de marque, contrôle d'adresse neutralisé → provider refusé, ni transport ni sendMail, événement sans valeur", async () => {
    const mailer = createSmtpCodeMailer(CIBLE, { adresseAdmise: () => true });
    const erreur = await mailer.sendLoginCode({ to: forcee("a,b@exemple.test"), code: "123456", expiresInMinutes: 10 }).catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(CodeMailerRefusalError);
    expect(fabrique.createTransport).not.toHaveBeenCalled();
    expect(envoyer.sendMail).not.toHaveBeenCalled();
    const ecrit = sortieJournal(espions);
    expect(ecrit).toContain("email.envelope_refused");
    expect(ecrit).not.toContain("exemple.test");
    expect(ecrit).not.toContain("123456");
    expect((erreur as Error).message).not.toContain("exemple.test");
  });

  it.each(["x <a@exemple.test>", "a;b@exemple.test", "a@exemple.test, b@exemple.test", "A@Exemple.test", "a@exemple.test\nBcc: b@exemple.test"])(
    "%j forcé, contrôle d'adresse neutralisé → refus avant le transport",
    async (adresse) => {
      const mailer = createSmtpCodeMailer(CIBLE, { adresseAdmise: () => true });
      await expect(mailer.sendLoginCode({ to: forcee(adresse), code: "123456", expiresInMinutes: 10 })).rejects.toBeInstanceOf(CodeMailerRefusalError);
      expect(fabrique.createTransport).not.toHaveBeenCalled();
      expect(envoyer.sendMail).not.toHaveBeenCalled();
    },
  );

  it("contrôle d'adresse refait (point 4.1) : adresse non canonique → email.address_refused, sans transport", async () => {
    const erreur = await createSmtpCodeMailer(CIBLE)
      .sendLoginCode({ to: forcee(" A@Exemple.test "), code: "123456", expiresInMinutes: 10 })
      .catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(CodeMailerRefusalError);
    expect(fabrique.createTransport).not.toHaveBeenCalled();
    expect(envoyer.sendMail).not.toHaveBeenCalled();
    const ecrit = sortieJournal(espions);
    expect(ecrit).toContain("email.address_refused");
    expect(ecrit).not.toContain("exemple.test");
  });

  it.each(["12345", "1234567", "12a456", "１２３４５６", "123456\n", ""])("code %j → refus avant le transport", async (code) => {
    await expect(createSmtpCodeMailer(CIBLE).sendLoginCode({ to: A, code, expiresInMinutes: 10 })).rejects.toBeInstanceOf(CodeMailerRefusalError);
    expect(envoyer.sendMail).not.toHaveBeenCalled();
  });
});

describe("journaux: aucun email ni code dans les journaux (SMTP)", () => {
  it("panne du transport dont le message porte l'adresse, l'adresse IP et le code → erreur neutre, aucune trace", async () => {
    const brut = new Error("connect ECONNREFUSED 127.0.0.1:1025 pour a@exemple.test, code 987654");
    envoyer.sendMail.mockRejectedValue(brut);
    const erreur = await createSmtpCodeMailer(CIBLE).sendLoginCode({ to: A, code: "987654", expiresInMinutes: 10 }).catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(SmtpEnvoiError);
    const neutre = erreur as SmtpEnvoiError;
    expect(neutre.cause).toBeUndefined();
    for (const texte of [neutre.message, neutre.stack ?? "", String(neutre)]) {
      expect(texte).not.toContain("exemple.test");
      expect(texte).not.toContain("127.0.0.1");
      expect(texte).not.toContain("987654");
    }
    const ecrit = sortieJournal(espions);
    expect(ecrit).not.toContain("exemple.test");
    expect(ecrit).not.toContain("987654");
    expect(ecrit).not.toContain("127.0.0.1");
  });

  it("échec de la création du transport → même erreur neutre", async () => {
    fabrique.createTransport.mockImplementation(() => {
      throw new Error("a@exemple.test");
    });
    await expect(createSmtpCodeMailer(CIBLE).sendLoginCode({ to: A, code: "123456", expiresInMinutes: 10 })).rejects.toBeInstanceOf(SmtpEnvoiError);
  });

  it("envoi réussi → rien n'est écrit au journal", async () => {
    await createSmtpCodeMailer(CIBLE).sendLoginCode({ to: A, code: "123456", expiresInMinutes: 10 });
    expect(sortieJournal(espions)).toBe("");
  });
});
