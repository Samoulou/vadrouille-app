import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { type CanonicalEmail } from "@/server/email";
import { createEmailCap, type EmailCapPool } from "@/server/mail/plafond";
import { createSmtpNotificationMailer } from "@/server/mail/smtp";
import { reveillerRappel } from "@/server/rappels/envoi";
import type { EtatRappel } from "@/server/rappels/etat";
import { creerWithOrg } from "@/server/with-org";

import { createDatabase } from "../../db/index";
import { adresse, URL_APPLICATION } from "./auth-outils";
import { closeAll, connect, createOrg, type DbClient, inTx, insertSql, SNAPSHOT } from "./helpers";
import { attendreMessages, MAILPIT_SMTP, messagesPour } from "./mailpit";

/**
 * Rappel la veille (M6c, ticket 1021 ; décision 0157 § 1.7 ; spécification M6 § 6.3, critères 2, 3, 8 et 10) sur la
 * **vraie base** (rôle `vadrouille_app`, RLS, réclamation par la clé primaire de `reminder_sends`, plafond global
 * `email_daily_counts`) et le **vrai Mailpit** (service du job `db` de la CI, boucle locale seulement). Aucun appel à Resend ;
 * adresses `exemple.test` uniques ; le rôle `admin` ne sert qu'à poser le déblocage, la vérification de l'adresse et le
 * compteur du jour, et à relire, jamais au chemin vérifié.
 *
 * Voyage du 2027-05-01 au 2027-05-06, `Europe/London` (heure d'été) : veille de J1 à 18:00 = 2027-04-30T17:00Z.
 */

let admin: DbClient;
let auth: DbClient;
let app: DbClient;
const pools: { end(): Promise<void> }[] = [];

const VEILLE_J1 = Date.parse("2027-04-30T17:00:00.500Z");

function base() {
  const database = createDatabase("vadrouille_app", undefined, {
    max: 4,
    connectionTimeoutMillis: 10_000,
    query_timeout: 10_000,
  });
  pools.push(database.$client);
  return {
    withOrg: creerWithOrg(database),
    plafond: createEmailCap({ pool: database.$client as EmailCapPool }),
  };
}

/** Composition de `local` et `ci` : SMTP vers Mailpit, plafond réel sur la base, origine de l'application de test. */
function deps(maintenant = VEILLE_J1) {
  const { withOrg, plafond } = base();
  const mailer = createSmtpNotificationMailer(MAILPIT_SMTP, {
    reserver: plafond.reserve,
    purger: plafond.purge,
  });
  return {
    composer: () => ({ mailer, origine: URL_APPLICATION }),
    maintenant: () => maintenant,
    withOrg,
  };
}

type Accord = EtatRappel & { email: CanonicalEmail };

/** Personne (adresse vérifiée ou non), organisation, voyage débloqué avec sa version 1, accord écrit par `vadrouille_app`. */
async function accord(options: { verifiee?: boolean; debloque?: boolean } = {}): Promise<Accord> {
  const email = adresse("m6c");
  const o = await createOrg(auth, 0, email);
  if (options.verifiee !== false) await admin.query("UPDATE public.users SET email_verified = true WHERE id = $1", [o.owner]);
  const { tripId, consentId } = await inTx(app, { org: o.org, user: o.owner }, async (c) => {
    const t = insertSql("trips", { org: o.org, owner: o.owner } as Parameters<typeof insertSql>[1]);
    const trip = (await c.query(t.sql, t.params)).rows[0].id as string;
    await c.query("INSERT INTO trip_versions (organization_id, trip_id, version, request_id, snapshot, author_kind) VALUES ($1, $2, 1, $3, $4, 'engine')", [
      o.org,
      trip,
      randomUUID(),
      JSON.stringify(SNAPSHOT),
    ]);
    await c.query("UPDATE trips SET current_version = 1 WHERE id = $1", [trip]);
    const consent = (
      await c.query("INSERT INTO public.reminder_consents (organization_id, trip_id, user_id) VALUES ($1, $2, $3) RETURNING id", [o.org, trip, o.owner])
    ).rows[0].id as string;
    return { tripId: trip, consentId: consent };
  });
  if (options.debloque !== false)
    await admin.query("INSERT INTO public.entitlements (organization_id, trip_id, kind) VALUES ($1, $2, 'tripUnlocked')", [o.org, tripId]);
  return { organizationId: o.org, tripId, userId: o.owner, consentId, email };
}

const etat = ({ organizationId, tripId, userId, consentId }: Accord): EtatRappel => ({ organizationId, tripId, userId, consentId });

async function reclamations(a: Accord): Promise<Record<string, unknown>[]> {
  const { rows } = await admin.query("SELECT * FROM public.reminder_sends WHERE organization_id = $1 AND trip_id = $2 ORDER BY day_index", [
    a.organizationId,
    a.tripId,
  ]);
  return rows as Record<string, unknown>[];
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

describe("rappels : envoi la veille sur Mailpit et la base (M6c)", () => {
  it("critères 2, 3 et 10 : un message à l'adresse du compte, liens seuls ; une réclamation sans adresse ni texte ; rejoué : rien de plus", async () => {
    const a = await accord();
    const d = deps();
    const suite = await reveillerRappel(etat(a), d);
    expect(suite).toEqual({
      suite: "attendre",
      attenteMs: 24 * 3_600_000 - 500,
    });
    const [recu, ...autres] = await attendreMessages(a.email);
    expect(autres).toEqual([]);
    expect(recu?.to).toEqual([a.email]);
    expect(recu?.cc).toEqual([]);
    expect(recu?.bcc).toEqual([]);
    expect(recu?.subject).toBe("Ta journée de demain");
    expect(recu?.text).toContain(`${URL_APPLICATION}/voyages/${a.tripId}/jour/1`);
    expect(recu?.text).toContain(`${URL_APPLICATION}/voyages/${a.tripId}`);
    expect(recu?.text).not.toMatch(/Édimbourg|2027|ChIJ/);
    expect(recu?.html).toBe("");
    // Réclamation : les quatre colonnes de la clé et `claimed_at` posé par la base ; aucune adresse, aucun texte.
    const lignes = await reclamations(a);
    expect(lignes).toHaveLength(1);
    expect(Object.keys(lignes[0] ?? {}).sort()).toEqual(["claimed_at", "day_index", "organization_id", "trip_id", "user_id"]);
    expect(lignes[0]?.day_index).toBe(1);
    expect(JSON.stringify(lignes)).not.toContain(a.email);
    // Rejoué dans la même fenêtre (reprise, ou relais en double) : la clé primaire refuse, rien n'est envoyé.
    expect(await reveillerRappel(etat(a), d)).toEqual({
      suite: "attendre",
      attenteMs: 24 * 3_600_000 - 500,
    });
    expect(await messagesPour(a.email, 500)).toHaveLength(1);
    expect(await reclamations(a)).toHaveLength(1);
    expect(journal.join("\n")).not.toContain(a.email.split("@")[0] as string);
  });

  it("critère 8 : accord retiré (par la base) : fin au réveil, aucun message, aucune réclamation", async () => {
    const a = await accord();
    await inTx(app, { org: a.organizationId, user: a.userId }, (c) =>
      c.query("UPDATE public.reminder_consents SET withdrawn_at = pg_catalog.now() WHERE id = $1", [a.consentId]),
    );
    expect(await reveillerRappel(etat(a), deps())).toEqual({ suite: "fin" });
    expect(await messagesPour(a.email, 300)).toEqual([]);
    expect(await reclamations(a)).toEqual([]);
  });

  it("adresse non vérifiée : aucune réclamation, aucun message ; voyage non débloqué : fin", async () => {
    const nonVerifiee = await accord({ verifiee: false });
    const suite = await reveillerRappel(etat(nonVerifiee), deps());
    expect(suite).toMatchObject({ suite: "attendre" });
    expect(await messagesPour(nonVerifiee.email, 300)).toEqual([]);
    expect(await reclamations(nonVerifiee)).toEqual([]);
    const bloque = await accord({ debloque: false });
    expect(await reveillerRappel(etat(bloque), deps())).toEqual({
      suite: "fin",
    });
    expect(await messagesPour(bloque.email)).toEqual([]);
  });

  it("accord d'une autre organisation (état falsifié) : fin, rien de lu ni d'écrit", async () => {
    const a = await accord();
    const b = await accord();
    expect(await reveillerRappel({ ...etat(a), consentId: b.consentId }, deps())).toEqual({ suite: "fin" });
    expect(await reveillerRappel({ ...etat(b), organizationId: a.organizationId }, deps())).toEqual({ suite: "fin" });
    expect(await messagesPour(a.email, 300)).toEqual([]);
    expect(await messagesPour(b.email)).toEqual([]);
  });
});
