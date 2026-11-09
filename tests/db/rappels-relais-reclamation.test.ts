import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { type CanonicalEmail } from "@/server/email";
import { createEmailCap, type EmailCapPool } from "@/server/mail/plafond";
import type { NotificationMailer } from "@/server/mail/port";
import { createSmtpNotificationMailer } from "@/server/mail/smtp";
import { reveillerRappel } from "@/server/rappels/envoi";
import type { EtatRappel } from "@/server/rappels/etat";
import { reclamerRelais, SQL_RECLAMATION_RELAIS } from "@/server/rappels/relais";
import { creerWithOrg, type OrgTransaction } from "@/server/with-org";

import { createDatabase } from "../../db/index";
import { adresse, URL_APPLICATION } from "./auth-outils";
import { closeAll, connect, createOrg, type DbClient, inTx, insertSql, SNAPSHOT } from "./helpers";
import { attendreMessages, MAILPIT_SMTP, messagesPour } from "./mailpit";

/**
 * Réclamation du relais des rappels sur la **vraie base** (tâche R-B, ticket 1075 ; décision 0162 § 3 point 2, § 5 et
 * § 6.2 critère 4 ; migration `0027_rappels_relais`) : rôle `vadrouille_app`, contexte posé par `withOrg` (`creerWithOrg`
 * sur un pool à plusieurs connexions, pour de vraies transactions concurrentes), clé primaire
 * `(organization_id, consent_id, relay_n)` de `reminder_relays`, politiques par personne. Le rôle `admin` ne sert qu'à
 * poser le déblocage et la vérification de l'adresse, et à relire, jamais au chemin vérifié. Le dernier cas joint le vrai
 * Mailpit (service du job `db` de la CI, boucle locale seulement) : jamais Resend.
 *
 * Identifiants d'exécution : ceux du Workflow SDK 5.1.0 relevés par R-D (PR 1067, `tests/db/rappels-relais.test.ts`) :
 * `wrun_` puis 26 caractères Crockford base 32 (monde local, et monde Vercel avec un premier caractère de `4` à `7`). Une
 * mise à jour du SDK doit relancer ce fichier avec un identifiant réel (0162 § 7, risque 4).
 *
 * Voyage du 2027-05-01 au 2027-05-06, `Europe/London` (heure d'été) : veille de J1 à 18:00 = 2027-04-30T17:00Z.
 */

const RUN_LOCAL = "wrun_01M6ZWVHNG68KA5EAJ41PT0PCP";
const RUN_VERCEL = "wrun_41M6ZWVHNG50W7N2HSG8R3DG98";
const RUN_AUTRE = "wrun_01M6ZWVHNH0GN4PJ1KMK7TM95T";

const VEILLE_J1 = Date.parse("2027-04-30T17:00:00.500Z");

let admin: DbClient;
let auth: DbClient;
let app: DbClient;
const pools: { end(): Promise<void> }[] = [];

/** Pool `vadrouille_app` de quatre connexions : deux réclamations concurrentes tiennent chacune leur transaction. */
function pool() {
  const database = createDatabase("vadrouille_app", undefined, {
    max: 4,
    connectionTimeoutMillis: 10_000,
    query_timeout: 10_000,
  });
  pools.push(database.$client);
  return database;
}

type Accord = EtatRappel & { email: CanonicalEmail };

/** Personne à l'adresse vérifiée, organisation, voyage débloqué avec sa version 1, accord écrit par `vadrouille_app`. */
async function accord(): Promise<Accord> {
  const email = adresse("r-b");
  const o = await createOrg(auth, 0, email);
  await admin.query("UPDATE public.users SET email_verified = true WHERE id = $1", [o.owner]);
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
  await admin.query("INSERT INTO public.entitlements (organization_id, trip_id, kind) VALUES ($1, $2, 'tripUnlocked')", [o.org, tripId]);
  return { organizationId: o.org, tripId, userId: o.owner, consentId, email };
}

const etat = ({ organizationId, tripId, userId, consentId }: Accord): EtatRappel => ({ organizationId, tripId, userId, consentId });

/** Réclamations de relais d'un accord, vues par l'administration (hors RLS). */
async function relais(a: Accord): Promise<{ relay_n: number; claimed_run_id: string }[]> {
  const { rows } = await admin.query(
    "SELECT relay_n, claimed_run_id FROM public.reminder_relays WHERE organization_id = $1 AND consent_id = $2 ORDER BY relay_n, claimed_run_id",
    [a.organizationId, a.consentId],
  );
  return rows as { relay_n: number; claimed_run_id: string }[];
}

async function retirer(a: Accord): Promise<void> {
  await inTx(app, { org: a.organizationId, user: a.userId }, (c) =>
    c.query("UPDATE public.reminder_consents SET withdrawn_at = pg_catalog.now() WHERE id = $1", [a.consentId]),
  );
}

/**
 * Transaction dont chaque `execute` appelle `apres` sur son résultat avant de le rendre : `executeurSql` n'appelle que
 * `tx.execute`, seule méthode exposée.
 */
function intercepter(tx: OrgTransaction, apres: (resultat: { rows?: Record<string, unknown>[] }) => Promise<void>): OrgTransaction {
  const execute = async (requete: Parameters<OrgTransaction["execute"]>[0]) => {
    const resultat = await tx.execute(requete);
    await apres(resultat as { rows?: Record<string, unknown>[] });
    return resultat;
  };
  return { execute } as unknown as OrgTransaction;
}

let journal: string[];
/** Deux pools distincts : deux connexions, deux transactions réellement concurrentes sur la clé primaire. */
let withOrgA: ReturnType<typeof creerWithOrg>;
let withOrgB: ReturnType<typeof creerWithOrg>;

beforeAll(async () => {
  admin = await connect("admin");
  auth = await connect("auth");
  app = await connect("app");
  withOrgA = creerWithOrg(pool());
  withOrgB = creerWithOrg(pool());
});

beforeEach(() => {
  journal = [];
  const capture = (...args: unknown[]) => {
    journal.push(args.map(String).join(" "));
  };
  vi.spyOn(console, "log").mockImplementation(capture);
  vi.spyOn(console, "error").mockImplementation(capture);
  vi.spyOn(console, "warn").mockImplementation(capture);
  vi.spyOn(console, "info").mockImplementation(capture);
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await Promise.all(pools.map((p) => p.end()));
  await closeAll();
});

describe("relais des rappels : réclamation sur la base (R-B, 0162 § 6.2 critère 4)", () => {
  it("réclamation : une ligne, quatre colonnes d'identité, claimed_at posé par la base ; identifiants réels des deux mondes acceptés", async () => {
    const a = await accord();
    const withOrg = withOrgA;
    expect(await reclamerRelais(etat(a), { relayN: 1, runId: RUN_LOCAL }, { withOrg })).toBe("acquise");
    expect(await reclamerRelais({ ...etat(a), relayN: 1 }, { relayN: 2, runId: RUN_VERCEL }, { withOrg })).toBe("acquise");
    expect(await relais(a)).toEqual([
      { relay_n: 1, claimed_run_id: RUN_LOCAL },
      { relay_n: 2, claimed_run_id: RUN_VERCEL },
    ]);
    const { rows } = await admin.query("SELECT * FROM public.reminder_relays WHERE consent_id = $1 ORDER BY relay_n", [a.consentId]);
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(["claimed_at", "claimed_run_id", "consent_id", "organization_id", "relay_n"]);
    expect(rows.every((r) => r.claimed_at instanceof Date)).toBe(true);
    expect(JSON.stringify(rows)).not.toContain(a.email);
    expect(journal).toEqual([]);
  });

  it("deux réclamations concurrentes de la même génération (deux exécutions) : une acquise, une doublon ; une seule ligne (§ 5 cas 4)", async () => {
    for (let essai = 0; essai < 5; essai += 1) {
      const a = await accord();
      const issues = await Promise.all([
        reclamerRelais(etat(a), { relayN: 1, runId: RUN_LOCAL }, { withOrg: withOrgA }),
        reclamerRelais(etat(a), { relayN: 1, runId: RUN_AUTRE }, { withOrg: withOrgB }),
      ]);
      expect([...issues].sort()).toEqual(["acquise", "doublon"]);
      const lignes = await relais(a);
      expect(lignes).toHaveLength(1);
      // L'exécution qui a obtenu `acquise` est celle dont l'identifiant est en base.
      expect(lignes[0]?.claimed_run_id).toBe(issues[0] === "acquise" ? RUN_LOCAL : RUN_AUTRE);
    }
    expect(journal).toEqual([]);
  });

  it("concurrence ordonnée : la seconde transaction attend la validation de la première, puis rend doublon (insertion sans ligne, relecture validée)", async () => {
    const a = await accord();
    const withOrg = withOrgA;
    let liberer: () => void = () => undefined;
    const retenue = new Promise<void>((fin) => {
      liberer = fin;
    });
    let inseree: () => void = () => undefined;
    const apresInsertion = new Promise<void>((fin) => {
      inseree = fin;
    });
    // La première exécution insère, puis retient sa transaction ouverte jusqu'au signal.
    const retenir: typeof withOrg = (ctx, fn) =>
      withOrg(ctx, async (tx) =>
        fn(
          intercepter(tx, async (resultat) => {
            if (resultat.rows?.[0]?.relay_n !== undefined) {
              inseree();
              await retenue;
            }
          }),
        ),
      );
    const premiere = reclamerRelais(etat(a), { relayN: 1, runId: RUN_LOCAL }, { withOrg: retenir });
    await apresInsertion;
    const seconde = reclamerRelais(etat(a), { relayN: 1, runId: RUN_AUTRE }, { withOrg: withOrgB });
    // La seconde est bloquée sur la clé non validée : rien n'est rendu tant que la première ne valide pas.
    const course = await Promise.race([seconde.then(() => "rendue"), new Promise((fin) => setTimeout(() => fin("bloquée"), 500))]);
    expect(course).toBe("bloquée");
    liberer();
    expect(await premiere).toBe("acquise");
    expect(await seconde).toBe("doublon");
    expect(await relais(a)).toEqual([{ relay_n: 1, claimed_run_id: RUN_LOCAL }]);
  });

  it("rejeu de la même exécution (étape rejouée après son COMMIT) : acquise, sans seconde ligne (§ 5 cas 1) ; une autre exécution : doublon", async () => {
    const a = await accord();
    const withOrg = withOrgA;
    expect(await reclamerRelais(etat(a), { relayN: 1, runId: RUN_LOCAL }, { withOrg })).toBe("acquise");
    expect(await reclamerRelais(etat(a), { relayN: 1, runId: RUN_LOCAL }, { withOrg })).toBe("acquise");
    expect(await reclamerRelais(etat(a), { relayN: 1, runId: RUN_AUTRE }, { withOrg })).toBe("doublon");
    expect(await relais(a)).toEqual([{ relay_n: 1, claimed_run_id: RUN_LOCAL }]);
  });

  it("accord retiré avant la réclamation : fin, rien n'est réclamé (§ 5 cas 7)", async () => {
    const a = await accord();
    await retirer(a);
    expect(await reclamerRelais(etat(a), { relayN: 1, runId: RUN_LOCAL }, { withOrg: withOrgA })).toBe("fin");
    expect(await relais(a)).toEqual([]);
    expect(journal).toEqual([]);
  });

  it("accord retiré entre la lecture et l'insertion : la RLS refuse (42501), fin légitime sans journal (revue de la PR 1067, mineur 2)", async () => {
    const a = await accord();
    const withOrg = withOrgA;
    let retire = false;
    // Le retrait est validé par une autre connexion juste après la lecture de l'accord, avant l'insertion.
    const retirerApresLecture: typeof withOrg = (ctx, fn) =>
      withOrg(ctx, async (tx) =>
        fn(
          intercepter(tx, async (resultat) => {
            if (!retire && resultat.rows?.[0]?.actif === true) {
              retire = true;
              await retirer(a);
            }
          }),
        ),
      );
    expect(await reclamerRelais(etat(a), { relayN: 1, runId: RUN_LOCAL }, { withOrg: retirerApresLecture })).toBe("fin");
    expect(retire).toBe(true);
    expect(await relais(a)).toEqual([]);
    expect(journal).toEqual([]);
    // Même refus quand la ligne existe déjà : le `WITH CHECK` passe avant la détection du conflit (`ON CONFLICT` n'y
    // change rien) ; `reclamerRelais` lit d'abord l'accord retiré et rend fin.
    const b = await accord();
    expect(await reclamerRelais(etat(b), { relayN: 1, runId: RUN_LOCAL }, { withOrg })).toBe("acquise");
    await retirer(b);
    const code = await inTx(app, { org: b.organizationId, user: b.userId }, async (c) => {
      try {
        await c.query("SAVEPOINT s");
        await c.query(SQL_RECLAMATION_RELAIS, [b.organizationId, b.consentId, 1, RUN_AUTRE]);
        return undefined;
      } catch (erreur) {
        await c.query("ROLLBACK TO SAVEPOINT s");
        return (erreur as { code?: string }).code;
      }
    });
    expect(code).toBe("42501");
    expect(await reclamerRelais(etat(b), { relayN: 1, runId: RUN_LOCAL }, { withOrg })).toBe("fin");
    expect(await relais(b)).toEqual([{ relay_n: 1, claimed_run_id: RUN_LOCAL }]);
  });

  it("état falsifié : accord d'une autre personne ou d'une autre organisation → fin, rien de lu ni d'écrit ; aucune ligne de l'autre accord", async () => {
    const a = await accord();
    const b = await accord();
    const withOrg = withOrgA;
    expect(await reclamerRelais({ ...etat(a), consentId: b.consentId }, { relayN: 1, runId: RUN_LOCAL }, { withOrg })).toBe("fin");
    expect(await reclamerRelais({ ...etat(b), organizationId: a.organizationId }, { relayN: 1, runId: RUN_LOCAL }, { withOrg })).toBe("fin");
    expect(await reclamerRelais({ ...etat(a), userId: b.userId }, { relayN: 1, runId: RUN_LOCAL }, { withOrg })).toBe("fin");
    expect(await relais(a)).toEqual([]);
    expect(await relais(b)).toEqual([]);
  });

  it("identifiant d'exécution hors du CHECK de claimed_run_id : panne, rappels.relay_failed (nom seul), rien n'est réclamé (0162 § 7, risque 4)", async () => {
    const a = await accord();
    expect(await reclamerRelais(etat(a), { relayN: 1, runId: "run_sans_prefixe" }, { withOrg: withOrgA })).toBe("panne");
    expect(await relais(a)).toEqual([]);
    expect(journal).toHaveLength(1);
    expect(journal[0]).toContain("rappels.relay_failed");
    expect(journal.join("\n")).not.toMatch(/run_sans_prefixe|reminder_relays|check/i);
  });
});

describe("relais des rappels : deux exécutions, une seule journée envoyée (0162 § 5 cas 5)", () => {
  it("deux réveils concurrents de deux exécutions pour la même journée : un seul message sur Mailpit, une seule ligne reminder_sends", async () => {
    const a = await accord();
    const database = pool();
    const plafond = createEmailCap({ pool: database.$client as EmailCapPool });
    const smtp = createSmtpNotificationMailer(MAILPIT_SMTP, { reserver: plafond.reserve, purger: plafond.purge });
    // Port gelé : les appels sont comptés par une enveloppe, le message part par le vrai transport SMTP.
    const envois = vi.fn((message: Parameters<NotificationMailer["sendRappelVeille"]>[0]) => smtp.sendRappelVeille(message));
    const mailer: NotificationMailer = { sendApercuPret: smtp.sendApercuPret, sendRappelVeille: envois };
    // Deux exécutions de deux générations voisines (doublon d'un démarrage ambigu, § 5 cas 2), chacune avec son pool.
    const deps = (withOrg: typeof withOrgA) => ({
      composer: () => ({ mailer, origine: URL_APPLICATION }),
      maintenant: () => VEILLE_J1,
      withOrg,
    });
    const suites = await Promise.all([reveillerRappel(etat(a), deps(withOrgA)), reveillerRappel({ ...etat(a), relayN: 1 }, deps(withOrgB))]);
    for (const suite of suites) expect(suite).toEqual({ suite: "attendre", attenteMs: 24 * 3_600_000 - 500 });
    expect(envois).toHaveBeenCalledTimes(1);
    const [recu, ...autres] = await attendreMessages(a.email);
    expect(autres).toEqual([]);
    expect(recu?.to).toEqual([a.email]);
    expect(await messagesPour(a.email, 500)).toHaveLength(1);
    const { rows } = await admin.query("SELECT day_index FROM public.reminder_sends WHERE organization_id = $1 AND trip_id = $2", [a.organizationId, a.tripId]);
    expect(rows).toEqual([{ day_index: 1 }]);
    expect(journal.join("\n")).not.toContain(a.email.split("@")[0] as string);
  });
});
