// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ valeur: {} as Record<string, unknown> }));
vi.mock("@/server/env", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  serverEnv: () => env.valeur,
}));
const resend = vi.hoisted(() => ({
  createResendNotificationMailer: vi.fn(() => ({ resend: true })),
  createResendCodeMailer: vi.fn(),
}));
vi.mock("@/server/mail/resend", () => resend);
const smtp = vi.hoisted(() => ({
  createSmtpNotificationMailer: vi.fn(() => ({ smtp: true })),
  createSmtpCodeMailer: vi.fn(),
}));
vi.mock("@/server/mail/smtp", () => smtp);

import { notificationsDuServeur, rappelsDuServeur } from "@/server/auth";
import { RAPPELS_ENVOI_REEL } from "@/server/config/rappels";
import { disabledNotificationMailer } from "@/server/mail/disabled";

/**
 * Garde technique de l'envoi réel des rappels (M6c, ticket 1021 ; décision 0157 § 1.7 point 10, S6) : tant que
 * `RAPPELS_ENVOI_REEL` est faux, la composition des rappels donne le port désactivé dès que le transport est Resend ; aucun
 * appel de `resend.ts` pour un rappel. Mailpit (`smtp`) reste branché. Environnement du serveur simulé (aucune clé).
 */

const BETTER_AUTH = { appUrl: "http://127.0.0.1:3999" };
const SMTP = { host: "127.0.0.1", port: 1025 };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("rappels : composition (rappelsDuServeur)", () => {
  it("valeur commitée : RAPPELS_ENVOI_REEL faux", () => {
    expect(RAPPELS_ENVOI_REEL).toBe(false);
  });

  it("EMAIL_TRANSPORT=resend : port désactivé, origine nulle, aucune construction de l'implémentation Resend", () => {
    env.valeur = {
      authAdapter: "better-auth",
      betterAuth: BETTER_AUTH,
      emailTransport: "resend",
      smtp: null,
      rappelsAcceleration: 1,
    };
    expect(rappelsDuServeur()).toEqual({ mailer: disabledNotificationMailer, origine: null, acceleration: 1 });
    expect(resend.createResendNotificationMailer).not.toHaveBeenCalled();
    // Les notifications de M7a, elles, gardent leur composition.
    expect(notificationsDuServeur().mailer).toEqual({ resend: true });
  });

  it("EMAIL_TRANSPORT=smtp (Mailpit, local et ci) : composition des notifications, port SMTP et origine de l'application", () => {
    env.valeur = {
      authAdapter: "better-auth",
      betterAuth: BETTER_AUTH,
      emailTransport: "smtp",
      smtp: SMTP,
      rappelsAcceleration: 3600,
    };
    // Accélération du test sur le monde local (`RAPPELS_ACCELERATION`, `local` et `ci` seulement, revue de la PR 1024).
    expect(rappelsDuServeur()).toEqual({ mailer: { smtp: true }, origine: BETTER_AUTH.appUrl, acceleration: 3600 });
    expect(smtp.createSmtpNotificationMailer).toHaveBeenCalledWith(SMTP);
  });

  it("sans transport, ou sans connexion réelle : port désactivé", () => {
    env.valeur = {
      authAdapter: "better-auth",
      betterAuth: BETTER_AUTH,
      emailTransport: null,
      smtp: null,
    };
    expect(rappelsDuServeur().mailer).toBe(disabledNotificationMailer);
    env.valeur = {
      authAdapter: "mock",
      betterAuth: null,
      emailTransport: "smtp",
      smtp: SMTP,
      rappelsAcceleration: 1,
    };
    expect(rappelsDuServeur()).toEqual({ mailer: disabledNotificationMailer, origine: null, acceleration: 1 });
  });
});
