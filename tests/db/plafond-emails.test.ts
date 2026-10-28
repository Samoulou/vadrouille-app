import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { brancherConnexionReelle, debrancherConnexionReellePourTests, type OperationsConnexion } from "@/adapters/better-auth";
import { ApiErrorSchema, ok } from "@/contracts/errors";
import { EMAIL_THRESHOLDS, type EmailUsage } from "@/server/config/email";
import { type CanonicalEmail, parseEmailAddress } from "@/server/email";
import { createEmailCap, type EmailCapPool, type EmailReservation } from "@/server/mail/plafond";
import { CodeMailerCapError } from "@/server/mail/port";
import { createResendCodeMailer, PlafondIndisponibleError, ResendEnvoiError, type TransportResend } from "@/server/mail/resend";

import { createDatabase } from "../../db/index";
import { type Banc, preparerBanc } from "./auth-outils";
import { closeAll, connect, type DbClient, unique } from "./helpers";

/**
 * Plafond global quotidien des e-mails sur la base réelle (spécification B3d, critères R4 à R8 ; décision 0138 § 11, T1).
 * La réservation passe par la fabrique gardée de `db/connection.ts` (rôle `vadrouille_app`, puis `SET LOCAL ROLE
 * vadrouille_mail_counter`). Seul le rôle de test (`admin`, superutilisateur du conteneur, hors de l'application : aucune
 * migration ne le crée) lit et vide la table et recule le jour par SQL, jamais par l'horloge du processus. Resend est un
 * double (`transport` injecté) : aucun appel réseau, clé sentinelle, adresses en `exemple.test`.
 *
 * Le compteur est global : chaque test le vide d'abord (fichiers de base exécutés en série, aucun autre fichier n'y écrit).
 */

const requete = vi.hoisted(() => ({ enTetes: (): Headers => new Headers() }));
vi.mock("next/headers", () => ({
  headers: async () => requete.enTetes(),
  cookies: async () => {
    throw new Error("`cookies` was called outside a request scope.");
  },
}));

const { requestCode } = await import("@/server/actions/compte");

const CLE = "re_SENTINELLE_exemple_0000000000";
const lireCle = () => ({ ok: true as const, cle: CLE });
const reponse = (statut: number, corps: unknown = null) =>
  new Response(corps === null ? null : JSON.stringify(corps), { status: statut, headers: { "content-type": "application/json" } });

let admin: DbClient;
let auth: DbClient;
const pools: { end(): Promise<void> }[] = [];
const bancs: Banc[] = [];

/** Pool de `vadrouille_app` (fabrique gardée) ; `max` plus grand que le pool par défaut pour une vraie concurrence. */
function pool(max = 2): EmailCapPool {
  const p = createDatabase("vadrouille_app", undefined, { max, connectionTimeoutMillis: 10_000, query_timeout: 10_000 }).$client;
  pools.push(p);
  return p;
}

const adresse = (prefixe: string): CanonicalEmail => {
  const lu = parseEmailAddress(`${prefixe}-${unique()}@exemple.test`);
  if (!lu.ok) throw new Error("adresse refusée");
  return lu.email;
};

async function ligneDuJour(): Promise<{ connexion: number; notification: number } | undefined> {
  const { rows } = await admin.query(
    "SELECT connexion, notification FROM public.email_daily_counts WHERE day = (pg_catalog.now() AT TIME ZONE 'UTC')::date",
  );
  return rows[0] as { connexion: number; notification: number } | undefined;
}

async function totalDuJour(): Promise<number> {
  const ligne = await ligneDuJour();
  return ligne === undefined ? 0 : ligne.connexion + ligne.notification;
}

/** Pose le compteur du jour (rôle de test). */
async function poser(connexion: number, notification = 0): Promise<void> {
  await admin.query(
    `INSERT INTO public.email_daily_counts (day, connexion, notification) VALUES ((pg_catalog.now() AT TIME ZONE 'UTC')::date, $1, $2)
     ON CONFLICT (day) DO UPDATE SET connexion = EXCLUDED.connexion, notification = EXCLUDED.notification`,
    [connexion, notification],
  );
}

let journal: string[];

beforeAll(async () => {
  admin = await connect("admin");
  auth = await connect("auth");
});

beforeEach(async () => {
  await admin.query("DELETE FROM public.email_daily_counts");
  journal = [];
  const capture = (...args: unknown[]) => {
    journal.push(args.map(String).join(" "));
  };
  vi.spyOn(console, "log").mockImplementation(capture);
  vi.spyOn(console, "error").mockImplementation(capture);
  vi.spyOn(console, "warn").mockImplementation(capture);
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await admin.query("DELETE FROM public.email_daily_counts");
  await Promise.all([...bancs.map((b) => b.fermer()), ...pools.map((p) => p.end())]);
  await closeAll();
});

const evenements = () => journal.map((ligne) => JSON.parse(ligne) as { event: string; usage?: string; reason?: string });

describe("email: plafond global de 100 par jour (R4)", () => {
  it("100 envois de connexion réussissent ; le 101e lève l'erreur de plafond sans appeler le double", async () => {
    const transport = vi.fn<TransportResend>(async () => reponse(200));
    const mailer = createResendCodeMailer({ transport, lireCle, reserver: createEmailCap({ pool: pool() }).reserve });
    for (let i = 0; i < 100; i += 1) await mailer.sendLoginCode({ to: adresse("r4"), code: "123456", expiresInMinutes: 10 });
    expect(transport).toHaveBeenCalledTimes(100);
    expect(await ligneDuJour()).toEqual({ connexion: 100, notification: 0 });
    journal.length = 0;
    await expect(mailer.sendLoginCode({ to: adresse("r4"), code: "123456", expiresInMinutes: 10 })).rejects.toBeInstanceOf(CodeMailerCapError);
    expect(transport).toHaveBeenCalledTimes(100);
    expect(await ligneDuJour()).toEqual({ connexion: 100, notification: 0 });
    expect(evenements()).toEqual([{ level: "warn", event: "email.cap_reached", usage: "connexion" }]);
  });

  describe("traversée par l'action requestCode (better-auth, port Resend sur le double, limiteur qui laisse passer)", () => {
    function brancher(transport: TransportResend) {
      const b = preparerBanc({ port: createResendCodeMailer({ transport, lireCle, reserver: createEmailCap({ pool: pool() }).reserve }) });
      bancs.push(b);
      debrancherConnexionReellePourTests();
      brancherConnexionReelle({ operations: (): OperationsConnexion => b.operations, limiter: async () => ok(undefined), contexte: async () => null });
      requete.enTetes = () => b.enTetes();
    }

    async function verificationsDe(email: string): Promise<number> {
      const { rows } = await auth.query("SELECT count(*)::int AS n FROM verifications WHERE identifier = $1", [`sign-in-otp-${email}`]);
      return rows[0].n as number;
    }

    beforeEach(() => {
      vi.stubEnv("AUTH_ADAPTER", "better-auth");
      vi.stubEnv("VADROUILLE_ENV", "ci");
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      debrancherConnexionReellePourTests();
    });

    it("plafond du jour atteint : email_cap_reached, retryable faux, conforme à ApiErrorSchema ; aucune vérification ; pas d'auth.operation_failed", async () => {
      const transport = vi.fn<TransportResend>(async () => reponse(200));
      brancher(transport);
      await poser(100);
      const email = adresse("r4-action");
      const resultat = await requestCode({ email });
      expect(resultat).toEqual({ ok: false, error: { code: "email_cap_reached", retryable: false } });
      expect(ApiErrorSchema.safeParse(resultat.ok ? null : resultat.error).success).toBe(true);
      expect(transport).not.toHaveBeenCalled();
      expect(await verificationsDe(email)).toBe(0);
      expect(evenements().map((e) => e.event)).not.toContain("auth.operation_failed");
      expect(evenements()).toContainEqual({ level: "warn", event: "email.cap_reached", usage: "connexion" });
      expect(await ligneDuJour()).toEqual({ connexion: 100, notification: 0 });
    });

    it("quota de Resend (429 daily_quota_exceeded) : même résultat ; l'envoi tenté reste compté", async () => {
      const transport = vi.fn<TransportResend>(async () => reponse(429, { name: "daily_quota_exceeded", message: "SENTINELLE" }));
      brancher(transport);
      const email = adresse("r4-quota");
      const resultat = await requestCode({ email });
      expect(resultat).toEqual({ ok: false, error: { code: "email_cap_reached", retryable: false } });
      expect(transport).toHaveBeenCalledTimes(1);
      expect(await verificationsDe(email)).toBe(0);
      expect(evenements().map((e) => e.event)).not.toContain("auth.operation_failed");
      expect(evenements()).toContainEqual({ level: "warn", event: "email.provider_refused", reason: "quota" });
      expect(await ligneDuJour()).toEqual({ connexion: 1, notification: 0 });
    });

    it("réponse 5xx du double : provider_error ; le compteur garde la réservation alors que la transaction de requestCode est annulée", async () => {
      const transport = vi.fn<TransportResend>(async () => reponse(500, { name: "application_error" }));
      brancher(transport);
      await poser(7);
      const email = adresse("r4-5xx");
      expect(await requestCode({ email })).toEqual({ ok: false, error: { code: "provider_error", retryable: true } });
      expect(transport).toHaveBeenCalledTimes(1);
      expect(await verificationsDe(email)).toBe(0);
      expect(await ligneDuJour()).toEqual({ connexion: 8, notification: 0 });
    });

    it("succès : la vérification reste, le compteur augmente d'une unité, email.sent avec usage connexion", async () => {
      const transport = vi.fn<TransportResend>(async () => reponse(200));
      brancher(transport);
      const email = adresse("r4-ok");
      expect(await requestCode({ email })).toEqual({ ok: true, value: { sent: true } });
      expect(await verificationsDe(email)).toBe(1);
      expect(await ligneDuJour()).toEqual({ connexion: 1, notification: 0 });
      expect(evenements()).toContainEqual({ level: "info", event: "email.sent", usage: "connexion" });
    });
  });
});

describe("email: plafond sans dépassement sous la concurrence (R5)", () => {
  it("120 envois connexion en parallèle sur un compteur vide : exactement 100 appels du double, 20 refus de plafond", async () => {
    const transport = vi.fn<TransportResend>(async () => reponse(200));
    const mailer = createResendCodeMailer({ transport, lireCle, reserver: createEmailCap({ pool: pool(20) }).reserve });
    const issues = await Promise.allSettled(
      Array.from({ length: 120 }, () => mailer.sendLoginCode({ to: adresse("r5"), code: "123456", expiresInMinutes: 10 })),
    );
    expect(transport).toHaveBeenCalledTimes(100);
    expect(issues.filter((i) => i.status === "fulfilled")).toHaveLength(100);
    const refus = issues.filter((i): i is PromiseRejectedResult => i.status === "rejected");
    expect(refus).toHaveLength(20);
    expect(refus.every((r) => r.reason instanceof CodeMailerCapError)).toBe(true);
    expect(await ligneDuJour()).toEqual({ connexion: 100, notification: 0 });
  });
});

describe("email: plafond commun atomique entre usages (R5b)", () => {
  it("60 connexions et 60 notifications entrelacées, cinq fois : total ≤ 100, seuils tenus, aucune réservation partielle", async () => {
    const { reserve } = createEmailCap({ pool: pool(20) });
    for (let tour = 0; tour < 5; tour += 1) {
      await admin.query("DELETE FROM public.email_daily_counts");
      const usages: EmailUsage[] = Array.from({ length: 120 }, (_, i) => (i % 2 === 0 ? "connexion" : "notification"));
      const resultats = await Promise.all(usages.map(async (usage) => ({ usage, r: await reserve(usage) })));
      const acceptes = resultats.filter((x): x is { usage: EmailUsage; r: Extract<EmailReservation, { ok: true }> } => x.r.ok);
      const refuses = resultats.filter((x) => !x.r.ok);
      expect(refuses.every((x) => !x.r.ok && x.r.reason === "cap_reached"), `tour ${tour}`).toBe(true);
      const total = acceptes.length;
      expect(total, `tour ${tour}`).toBeLessThanOrEqual(100);
      if (refuses.some((x) => x.usage === "connexion")) expect(total, `tour ${tour}`).toBe(100);
      if (refuses.some((x) => x.usage === "notification")) expect(total, `tour ${tour}`).toBeGreaterThanOrEqual(80);
      // Total vu par chaque réservation acceptée (après son incrément) : une notification acceptée a trouvé moins de 80.
      for (const x of acceptes.filter((a) => a.usage === "notification")) expect(x.r.total - 1, `tour ${tour}`).toBeLessThan(80);
      const ligne = await ligneDuJour();
      expect(ligne, `tour ${tour}`).toEqual({
        connexion: acceptes.filter((a) => a.usage === "connexion").length,
        notification: acceptes.filter((a) => a.usage === "notification").length,
      });
      expect(new Set(acceptes.map((a) => a.r.total)).size, `tour ${tour} : totaux distincts`).toBe(total);
    }
  });
});

describe("email: seuil des notifications (R6)", () => {
  it("à 79, une notification passe ; à 80, elle est refusée, une connexion passe jusqu'à 100 ; total commun", async () => {
    const { reserve } = createEmailCap({ pool: pool() });
    expect(EMAIL_THRESHOLDS).toEqual({ connexion: 100, notification: 80 });
    await poser(79);
    expect(await reserve("notification")).toEqual({ ok: true, total: 80 });
    expect(await ligneDuJour()).toEqual({ connexion: 79, notification: 1 });
    expect(await reserve("notification")).toEqual({ ok: false, reason: "cap_reached" });
    for (let total = 81; total <= 100; total += 1) expect(await reserve("connexion")).toEqual({ ok: true, total });
    expect(await reserve("connexion")).toEqual({ ok: false, reason: "cap_reached" });
    expect(await reserve("notification")).toEqual({ ok: false, reason: "cap_reached" });
    expect(await ligneDuJour()).toEqual({ connexion: 99, notification: 1 });
  });
});

describe("email: nouveau jour (R7)", () => {
  it("le compteur du jour atteint, recul de sa date d'un jour par SQL : l'envoi suivant passe ; la purge retire les jours échus seulement", async () => {
    const transport = vi.fn<TransportResend>(async () => reponse(200));
    const mailer = createResendCodeMailer({ transport, lireCle, reserver: createEmailCap({ pool: pool() }).reserve });
    await poser(100);
    await expect(mailer.sendLoginCode({ to: adresse("r7"), code: "123456", expiresInMinutes: 10 })).rejects.toBeInstanceOf(CodeMailerCapError);
    // Rôle de test seulement : la colonne du jour n'est pas modifiable par le rôle du compteur (ci-dessous).
    await admin.query("UPDATE public.email_daily_counts SET day = day - 1");
    await admin.query(
      `INSERT INTO public.email_daily_counts (day, connexion) SELECT (pg_catalog.now() AT TIME ZONE 'UTC')::date - n, 1 FROM unnest(ARRAY[7, 8, 30]) AS n`,
    );
    await mailer.sendLoginCode({ to: adresse("r7"), code: "123456", expiresInMinutes: 10 });
    expect(transport).toHaveBeenCalledTimes(1);
    const { rows } = await admin.query(
      "SELECT ((pg_catalog.now() AT TIME ZONE 'UTC')::date - day) AS age, connexion FROM public.email_daily_counts ORDER BY day DESC",
    );
    expect(rows).toEqual([
      { age: 0, connexion: 1 },
      { age: 1, connexion: 100 },
      { age: 7, connexion: 1 },
    ]);
  });

  it("une purge en erreur laisse la réservation acceptée", async () => {
    const { reserve } = createEmailCap({
      pool: pool(),
      beforePurge: () => {
        throw new Error("purge en panne");
      },
    });
    await admin.query("INSERT INTO public.email_daily_counts (day, connexion) VALUES ((pg_catalog.now() AT TIME ZONE 'UTC')::date - 30, 4)");
    expect(await reserve("connexion")).toEqual({ ok: true, total: 1 });
    const { rows } = await admin.query("SELECT count(*)::int AS n FROM public.email_daily_counts");
    expect(rows[0].n).toBe(2);
  });

  it("rôle du compteur : UPDATE des compteurs seulement, jamais de la colonne du jour ; aucun accès sans SET LOCAL ROLE", async () => {
    const app = await connect("app");
    for (const requeteSql of [
      "UPDATE public.email_daily_counts SET day = day - 1",
      "UPDATE public.email_daily_counts SET day = day, connexion = connexion",
    ]) {
      await app.query("BEGIN");
      await app.query("SET LOCAL ROLE vadrouille_mail_counter");
      await expect(app.query(requeteSql)).rejects.toMatchObject({ code: "42501" });
      await app.query("ROLLBACK");
    }
    await expect(app.query("SELECT 1 FROM public.email_daily_counts")).rejects.toMatchObject({ code: "42501" });
  });
});

describe("email: échec fermé du plafond (R8)", () => {
  const indisponible: EmailCapPool = { connect: async () => Promise.reject(new Error("base indisponible")) };

  it.each([
    ["base du compteur indisponible", createEmailCap({ pool: indisponible })],
    ["configuration du plafond absente", createEmailCap({ pool: pool(), thresholds: {} })],
    ["configuration du plafond invalide", createEmailCap({ pool: pool(), thresholds: { connexion: "100", notification: 0 } })],
  ])("%s : aucun appel du double, erreur d'envoi (provider_error)", async (_cas, plafond) => {
    expect(await plafond.reserve("connexion")).toEqual({ ok: false, reason: "unavailable" });
    const transport = vi.fn<TransportResend>(async () => reponse(200));
    const mailer = createResendCodeMailer({ transport, lireCle, reserver: plafond.reserve });
    const erreur = await mailer.sendLoginCode({ to: adresse("r8"), code: "123456", expiresInMinutes: 10 }).catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(PlafondIndisponibleError);
    expect(erreur).not.toBeInstanceOf(CodeMailerCapError);
    expect(transport).not.toHaveBeenCalled();
    expect(await totalDuJour()).toBe(0);
  });

  it("erreur d'envoi du double après réservation : ResendEnvoiError, jamais l'erreur de plafond", async () => {
    const transport = vi.fn<TransportResend>(async () => reponse(503));
    const mailer = createResendCodeMailer({ transport, lireCle, reserver: createEmailCap({ pool: pool() }).reserve });
    await expect(mailer.sendLoginCode({ to: adresse("r8"), code: "123456", expiresInMinutes: 10 })).rejects.toBeInstanceOf(ResendEnvoiError);
    expect(await totalDuJour()).toBe(1);
  });
});
