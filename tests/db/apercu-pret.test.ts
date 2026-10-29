import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { type CanonicalEmail } from "@/server/email";
import { type ApercuPretPool, envoyerApercuPret } from "@/server/mail/apercu-pret";
import { createEmailCap, type EmailCapPool } from "@/server/mail/plafond";
import { createSmtpNotificationMailer } from "@/server/mail/smtp";

import { createDatabase } from "../../db/index";
import { adresse, URL_APPLICATION } from "./auth-outils";
import { closeAll, connect, createOrg, type DbClient, inTx, insertSql } from "./helpers";
import { attendreMessages, MAILPIT_SMTP, messagesPour } from "./mailpit";

/**
 * E-mail « propositions prêtes » (M7a, PR 870) sur la **vraie base** (rôle `vadrouille_app`, RLS, réclamation sur
 * `generation_runs.updated_at`, plafond global `email_daily_counts`) et le **vrai Mailpit** (service du job `db` de la CI,
 * boucle locale seulement). Aucun appel à Resend ; adresses `exemple.test` uniques à chaque test ; le rôle `admin` ne sert
 * qu'à poser et relire le compteur du jour et les horodatages, jamais au chemin vérifié.
 *
 * Le compteur est global : chaque test le vide d'abord (fichiers de base exécutés en série).
 */

let admin: DbClient;
let auth: DbClient;
let app: DbClient;
const pools: { end(): Promise<void> }[] = [];

function pool(): ApercuPretPool & EmailCapPool {
  const p = createDatabase("vadrouille_app", undefined, { max: 4, connectionTimeoutMillis: 10_000, query_timeout: 10_000 }).$client;
  pools.push(p);
  return p;
}

/** Composition de `local` et `ci` : SMTP vers Mailpit, plafond réel sur la base, origine de l'application de test. */
function composition(p: EmailCapPool) {
  const plafond = createEmailCap({ pool: p });
  const mailer = createSmtpNotificationMailer(MAILPIT_SMTP, { reserver: plafond.reserve, purger: plafond.purge });
  return () => ({ mailer, origine: URL_APPLICATION });
}

type Voyage = { org: string; trip: string; run: string; email: CanonicalEmail };

/** Personne, organisation, voyage et exécution `preview` dans la phase donnée (publiée : `updated_at = finished_at`). */
async function voyage(phase: "ready" | "incomplete" | "preparing" | "failed" = "ready"): Promise<Voyage> {
  const email = adresse("m7a");
  const { org, owner } = await createOrg(auth, 0, email);
  return inTx(app, { org, user: owner }, async (c) => {
    const t = insertSql("trips", { org, owner } as Parameters<typeof insertSql>[1]);
    const trip = (await c.query(t.sql, t.params)).rows[0].id as string;
    const fin = phase === "ready" || phase === "incomplete" || phase === "failed" ? "2026-10-29T08:00:00.000Z" : null;
    const run = (
      await c.query(
        `INSERT INTO public.generation_runs (organization_id, trip_id, kind, phase, request_id, started_at, updated_at, finished_at)
         VALUES ($1, $2, 'preview', $3, $4, '2026-10-29T07:59:00.000Z', COALESCE($5::timestamptz, '2026-10-29T07:59:30.000Z'), $5::timestamptz) RETURNING id`,
        [org, trip, phase, randomUUID(), fin],
      )
    ).rows[0].id as string;
    return { org, trip, run, email };
  });
}

async function compteurDuJour(): Promise<{ connexion: number; notification: number } | undefined> {
  const { rows } = await admin.query("SELECT connexion, notification FROM public.email_daily_counts WHERE day = (pg_catalog.now() AT TIME ZONE 'UTC')::date");
  return rows[0] as { connexion: number; notification: number } | undefined;
}

async function horodatages(run: string): Promise<{ reclamee: boolean; phase: string }> {
  const { rows } = await admin.query("SELECT (updated_at > finished_at) AS reclamee, phase FROM public.generation_runs WHERE id = $1", [run]);
  return rows[0] as { reclamee: boolean; phase: string };
}

let journal: string[];

beforeAll(async () => {
  admin = await connect("admin");
  auth = await connect("auth");
  app = await connect("app");
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
  await Promise.all(pools.map((p) => p.end()));
  await closeAll();
});

const evenements = () => journal.map((ligne) => JSON.parse(ligne) as Record<string, unknown>);

describe("email: « propositions prêtes » sur Mailpit et la base (PR 870)", () => {
  it("exécution publiée : un message à l'adresse du compte, lien de la présentation, sans donnée du voyage ; compté en notification", async () => {
    const v = await voyage("ready");
    const p = pool();
    expect(await envoyerApercuPret({ organizationId: v.org, generationRunId: v.run }, { pool: p, composer: composition(p) })).toBe("sent");
    const [recu, ...autres] = await attendreMessages(v.email);
    expect(autres).toEqual([]);
    expect(recu?.to).toEqual([v.email]);
    expect(recu?.cc).toEqual([]);
    expect(recu?.bcc).toEqual([]);
    expect(recu?.subject).toBe("Tes premières propositions sont prêtes");
    expect(recu?.text).toContain(`${URL_APPLICATION}/voyages/${v.trip}/presentation`);
    expect(recu?.text).not.toMatch(/Édimbourg|2027|ChIJ/);
    expect(recu?.html).toBe("");
    expect(await compteurDuJour()).toEqual({ connexion: 0, notification: 1 });
    expect(await horodatages(v.run)).toEqual({ reclamee: true, phase: "ready" });
    expect(evenements()).toEqual([{ level: "info", event: "email.sent", usage: "notification" }]);
    expect(journal.join("\n")).not.toContain(v.email.split("@")[0] as string);
  });

  it("idempotence : rejoué (reprise) puis en concurrence, toujours un seul message et une seule réservation", async () => {
    const v = await voyage("incomplete");
    const p = pool();
    const deps = { pool: p, composer: composition(p) };
    const entree = { organizationId: v.org, generationRunId: v.run };
    const issues = await Promise.all(Array.from({ length: 4 }, () => envoyerApercuPret(entree, deps)));
    expect(issues.filter((i) => i === "sent")).toHaveLength(1);
    expect(issues.filter((i) => i === "already_sent")).toHaveLength(3);
    expect(await envoyerApercuPret(entree, deps)).toBe("already_sent");
    await attendreMessages(v.email);
    expect(await messagesPour(v.email, 500)).toHaveLength(1);
    expect(await compteurDuJour()).toEqual({ connexion: 0, notification: 1 });
  });

  it("exécution non publiée, en échec ou d'une autre organisation : not_ready, aucun message, rien de réclamé", async () => {
    const p = pool();
    const deps = { pool: p, composer: composition(p) };
    const enCours = await voyage("preparing");
    const echouee = await voyage("failed");
    const autre = await voyage("ready");
    expect(await envoyerApercuPret({ organizationId: enCours.org, generationRunId: enCours.run }, deps)).toBe("not_ready");
    expect(await envoyerApercuPret({ organizationId: echouee.org, generationRunId: echouee.run }, deps)).toBe("not_ready");
    expect(await envoyerApercuPret({ organizationId: enCours.org, generationRunId: autre.run }, deps)).toBe("not_ready");
    expect(await messagesPour(enCours.email, 300)).toEqual([]);
    expect(await messagesPour(echouee.email)).toEqual([]);
    expect(await messagesPour(autre.email)).toEqual([]);
    expect((await horodatages(autre.run)).reclamee).toBe(false);
    expect(await compteurDuJour()).toBeUndefined();
  });

  it("seuil des notifications atteint (80 envois du jour) : cap_reached, aucun message, compteur inchangé, aucun second essai", async () => {
    await admin.query(
      "INSERT INTO public.email_daily_counts (day, connexion, notification) VALUES ((pg_catalog.now() AT TIME ZONE 'UTC')::date, 70, 10)",
    );
    const v = await voyage("ready");
    const p = pool();
    const deps = { pool: p, composer: composition(p) };
    expect(await envoyerApercuPret({ organizationId: v.org, generationRunId: v.run }, deps)).toBe("cap_reached");
    expect(await messagesPour(v.email, 300)).toEqual([]);
    expect(await compteurDuJour()).toEqual({ connexion: 70, notification: 10 });
    expect(evenements()).toEqual([{ level: "warn", event: "email.cap_reached", usage: "notification" }]);
    expect(await envoyerApercuPret({ organizationId: v.org, generationRunId: v.run }, deps)).toBe("already_sent");
  });
});
