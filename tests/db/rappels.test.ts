import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "../../db/migrate";
import { urlBaseJetable } from "./env";
import { attempt, closeAll, connect, connectBaseJetable, countAs, createOrg, type DbClient, expectNoEffect, expectRefused, inTx, REMINDER_TABLES } from "./helpers";
import { creerBase, supprimerBases } from "./workflows-harnais";

/**
 * Migration 0024_rappels (plan du MVP, M6c-D, ticket 1014 ; décision 0157 § 1.7 point 5 et § 1.8 ; spécification
 * `specs/M6-pendant-le-voyage-api.md` § 5 et § 6.3, critères 2 et 13).
 *
 * `reminder_consents` : une ligne par accord, un seul accord actif par voyage et par personne, la personne membre de
 * l'organisation du voyage, un accord retiré jamais réécrit (déclencheur). `reminder_sends` : la réclamation d'une
 * journée est l'insertion de sa ligne, la seconde échoue. Isolation éprouvée sous `vadrouille_app` avec le contexte de
 * `withOrg` (`inTx`), comme `tests/db/isolation.test.ts` ; purge du compte ; descente de 0024 sur une base jetable. Les
 * deux tables sont hors du peuplement commun (`REMINDER_TABLES`, `tests/db/helpers.ts`) : chaque cas pose ses lignes.
 */

type Orga = { org: string; owner: string; members: string[]; trip: string };

const INSERT_ACCORD = "INSERT INTO reminder_consents (organization_id, trip_id, user_id) VALUES ($1, $2, $3) RETURNING id";
const INSERT_RECLAMATION = "INSERT INTO reminder_sends (organization_id, trip_id, user_id, day_index) VALUES ($1, $2, $3, $4)";

let app: DbClient;
let auth: DbClient;
let admin: DbClient;
let a: Orga;
let b: Orga;
const ctx = (o: Orga) => ({ org: o.org, user: o.owner });

/** Organisation (propriétaire et `membres` membres) et un voyage, écrits par les rôles prévus. */
async function organisation(client: DbClient, authClient: DbClient, membres = 0): Promise<Orga> {
  const base = await createOrg(authClient, membres);
  const trip = await inTx(client, { org: base.org, user: base.owner }, async (c) => {
    const { rows } = await c.query(
      "INSERT INTO trips (organization_id, created_by, request_id, destination, start_date, end_date, travellers_adults, time_zone) VALUES ($1, $2, gen_random_uuid(), 'Édimbourg', '2027-05-01', '2027-05-06', 2, 'Europe/London') RETURNING id",
      [base.org, base.owner],
    );
    return rows[0].id as string;
  });
  return { org: base.org, owner: base.owner, members: base.members, trip };
}

/** Un accord actif et une réclamation (journée 1) de la personne propriétaire, écrits sous `vadrouille_app`. */
async function peupler(client: DbClient, o: Orga): Promise<string> {
  return inTx(client, ctx(o), async (c) => {
    const id = (await c.query(INSERT_ACCORD, [o.org, o.trip, o.owner])).rows[0].id as string;
    await c.query(INSERT_RECLAMATION, [o.org, o.trip, o.owner, 1]);
    return id;
  });
}

/** Code SQLSTATE d'une instruction de `vadrouille_app` dans le contexte de `o` (point de sauvegarde), ou `undefined`. */
async function codeSous(o: Orga, sql: string, params: unknown[] = []): Promise<string | undefined> {
  return inTx(app, ctx(o), async (c) => (await attempt(c, sql, params)).code);
}

let accordA: string;
let accordB: string;

beforeAll(async () => {
  app = await connect("app");
  auth = await connect("auth");
  admin = await connect("admin");
  a = await organisation(app, auth, 1);
  b = await organisation(app, auth);
  accordA = await peupler(app, a);
  accordB = await peupler(app, b);
});

afterAll(async () => {
  await closeAll();
  await supprimerBases();
});

describe("rappels (0024) : forme", () => {
  it("rappels: aucune adresse ni texte en base (colonnes exactes, aucune colonne de texte ni JSON)", async () => {
    const { rows } = await app.query(
      `SELECT table_name AS t, column_name AS c, data_type AS type, is_nullable AS nul FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = ANY($1::text[]) ORDER BY table_name, ordinal_position`,
      [[...REMINDER_TABLES]],
    );
    expect(rows).toEqual([
      { t: "reminder_consents", c: "id", type: "uuid", nul: "NO" },
      { t: "reminder_consents", c: "organization_id", type: "uuid", nul: "NO" },
      { t: "reminder_consents", c: "trip_id", type: "uuid", nul: "NO" },
      { t: "reminder_consents", c: "user_id", type: "uuid", nul: "NO" },
      { t: "reminder_consents", c: "consented_at", type: "timestamp with time zone", nul: "NO" },
      { t: "reminder_consents", c: "withdrawn_at", type: "timestamp with time zone", nul: "YES" },
      { t: "reminder_sends", c: "organization_id", type: "uuid", nul: "NO" },
      { t: "reminder_sends", c: "trip_id", type: "uuid", nul: "NO" },
      { t: "reminder_sends", c: "user_id", type: "uuid", nul: "NO" },
      { t: "reminder_sends", c: "day_index", type: "smallint", nul: "NO" },
      { t: "reminder_sends", c: "claimed_at", type: "timestamp with time zone", nul: "NO" },
    ]);
  });

  it("RLS activée et forcée ; politiques de vadrouille_app et de vadrouille_fn_purge bornées à l'organisation, écriture d'un accord bornée à la personne de la transaction", async () => {
    const tables = await app.query(
      "SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_catalog.pg_class WHERE relnamespace = 'public'::regnamespace AND relname = ANY($1::text[]) ORDER BY relname",
      [[...REMINDER_TABLES]],
    );
    expect(tables.rows).toEqual(REMINDER_TABLES.map((relname) => ({ relname, relrowsecurity: true, relforcerowsecurity: true })));
    const politiques = await app.query(
      "SELECT tablename, policyname, roles::text[] AS roles, cmd, qual, with_check FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = ANY($1::text[]) ORDER BY tablename, policyname",
      [[...REMINDER_TABLES]],
    );
    const ORG = "(organization_id = app_current_org())";
    const PERSONNE = "((organization_id = app_current_org()) AND (user_id = app_current_user()))";
    // Revue de la PR M6c-D, mineur 1 : un accord ne s'écrit et ne se retire que pour la personne de la transaction.
    expect(politiques.rows.map((p) => [p.tablename, p.policyname, p.roles, p.cmd, p.qual, p.with_check])).toEqual([
      ["reminder_consents", "reminder_consents_app_insert", ["vadrouille_app"], "INSERT", null, PERSONNE],
      ["reminder_consents", "reminder_consents_app_select", ["vadrouille_app"], "SELECT", ORG, null],
      ["reminder_consents", "reminder_consents_app_update", ["vadrouille_app"], "UPDATE", PERSONNE, PERSONNE],
      ["reminder_consents", "reminder_consents_fn_purge", ["vadrouille_fn_purge"], "ALL", ORG, ORG],
      ["reminder_sends", "reminder_sends_app", ["vadrouille_app"], "ALL", ORG, ORG],
      ["reminder_sends", "reminder_sends_fn_purge", ["vadrouille_fn_purge"], "ALL", ORG, ORG],
    ]);
  });

  it("clés étrangères toutes en NO ACTION : organisation, personne, voyage composé, adhésion composée", async () => {
    const { rows } = await app.query(
      `SELECT conrelid::regclass::text AS t, conname, pg_catalog.pg_get_constraintdef(oid) AS def, confdeltype
       FROM pg_catalog.pg_constraint WHERE contype = 'f' AND conrelid = ANY($1::regclass[]) ORDER BY 1, 2`,
      [REMINDER_TABLES.map((t) => `public.${t}`)],
    );
    expect(rows.map((r) => [r.t, r.def])).toEqual([
      ["reminder_consents", "FOREIGN KEY (organization_id, user_id) REFERENCES memberships(organization_id, user_id)"],
      ["reminder_consents", "FOREIGN KEY (organization_id) REFERENCES organizations(id)"],
      ["reminder_consents", "FOREIGN KEY (organization_id, trip_id) REFERENCES trips(organization_id, id)"],
      ["reminder_consents", "FOREIGN KEY (user_id) REFERENCES users(id)"],
      ["reminder_sends", "FOREIGN KEY (organization_id, user_id) REFERENCES memberships(organization_id, user_id)"],
      ["reminder_sends", "FOREIGN KEY (organization_id) REFERENCES organizations(id)"],
      ["reminder_sends", "FOREIGN KEY (organization_id, trip_id) REFERENCES trips(organization_id, id)"],
      ["reminder_sends", "FOREIGN KEY (user_id) REFERENCES users(id)"],
    ]);
    expect(rows.every((r) => r.confdeltype === "a")).toBe(true);
  });
});

describe("rappels (0024) : droits par colonnes de vadrouille_app (revue de la PR M6c-D, bloquant 1)", () => {
  it("accord : INSERT de organization_id, trip_id et user_id seulement (ni id, ni consented_at, ni withdrawn_at) ; UPDATE de withdrawn_at seulement", async () => {
    const { rows } = await app.query(
      `SELECT a.attname,
              pg_catalog.has_column_privilege('vadrouille_app', a.attrelid, a.attnum, 'INSERT') AS insertion,
              pg_catalog.has_column_privilege('vadrouille_app', a.attrelid, a.attnum, 'UPDATE') AS maj
       FROM pg_catalog.pg_attribute a
       WHERE a.attrelid = 'public.reminder_consents'::regclass AND a.attnum > 0 AND NOT a.attisdropped
       ORDER BY a.attname`,
    );
    expect(rows.filter((r) => r.insertion).map((r) => r.attname)).toEqual(["organization_id", "trip_id", "user_id"]);
    expect(rows.filter((r) => r.maj).map((r) => r.attname)).toEqual(["withdrawn_at"]);
    const table = await app.query(
      `SELECT p AS privilege FROM unnest($1::text[]) AS p WHERE pg_catalog.has_table_privilege('vadrouille_app', 'public.reminder_consents', p)`,
      [["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"]],
    );
    expect(table.rows.map((r) => r.privilege)).toEqual(["SELECT"]);
  });

  it("INSERT d'un accord avec consented_at, withdrawn_at ou id explicite refusé (42501)", async () => {
    const o = await organisation(app, auth);
    for (const [colonne, valeur] of [["consented_at", "now() - interval '1 day'"], ["withdrawn_at", "now()"], ["id", "gen_random_uuid()"]] as const) {
      expect(
        await codeSous(o, `INSERT INTO reminder_consents (organization_id, trip_id, user_id, ${colonne}) VALUES ($1, $2, $3, ${valeur})`, [o.org, o.trip, o.owner]),
        colonne,
      ).toBe("42501");
    }
    expect(await countAs(app, ctx(o), "reminder_consents")).toBe(0);
  });
});

describe("rappels (0024) : isolation entre deux organisations", () => {
  it.each(REMINDER_TABLES)("%s : lecture croisée impossible ; sans contexte, aucune ligne", async (table) => {
    await inTx(app, ctx(a), async (c) => {
      const { rows } = await c.query(`SELECT organization_id FROM ${table}`);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.organization_id === a.org)).toBe(true);
      expect((await c.query(`SELECT count(*)::int AS n FROM ${table} WHERE organization_id = $1`, [b.org])).rows[0].n).toBe(0);
    });
    await inTx(app, {}, async (c) => {
      expect((await c.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n).toBe(0);
    });
  });

  it("insertion pour une autre organisation refusée (RLS), avec ou sans contexte", async () => {
    for (const contexte of [ctx(a), {}]) {
      await inTx(app, contexte, async (c) => {
        await expectRefused(c, INSERT_ACCORD, [b.org, b.trip, b.owner]);
        await expectRefused(c, INSERT_RECLAMATION, [b.org, b.trip, b.owner, 2]);
      });
    }
  });

  it("mise à jour croisée sans effet ; déplacement vers une autre organisation refusé ; aucune suppression, même de ses lignes", async () => {
    await inTx(app, ctx(a), async (c) => {
      await expectNoEffect(c, "UPDATE reminder_consents SET withdrawn_at = withdrawn_at WHERE id = $1", [accordB]);
      await expectNoEffect(c, "UPDATE reminder_consents SET withdrawn_at = now() WHERE organization_id = $1", [b.org]);
      await expectRefused(c, "UPDATE reminder_consents SET organization_id = $1 WHERE id = $2", [b.org, accordA]);
      await expectRefused(c, "UPDATE reminder_sends SET day_index = 2 WHERE organization_id = $1", [a.org]);
      for (const table of REMINDER_TABLES) {
        await expectRefused(c, `DELETE FROM ${table} WHERE organization_id = $1`, [a.org]);
        await expectRefused(c, `DELETE FROM ${table} WHERE organization_id = $1`, [b.org]);
        await expectRefused(c, `TRUNCATE ${table}`);
      }
    });
    for (const table of REMINDER_TABLES) expect(await countAs(app, ctx(b), table), table).toBe(1);
    const accord = await inTx(app, ctx(b), async (c) => (await c.query("SELECT withdrawn_at FROM reminder_consents WHERE id = $1", [accordB])).rows);
    expect(accord).toEqual([{ withdrawn_at: null }]);
  });

  it("un accord ou une réclamation ne vise jamais le voyage d'une autre organisation ; un accord, jamais une personne hors de l'organisation", async () => {
    expect(await codeSous(a, INSERT_ACCORD, [a.org, b.trip, a.owner])).toBe("23503");
    expect(await codeSous(a, INSERT_RECLAMATION, [a.org, b.trip, a.owner, 3])).toBe("23503");
    // Accord pour une autre personne : refusé par la politique (mineur 1) avant la clé étrangère.
    expect(await codeSous(a, INSERT_ACCORD, [a.org, a.trip, b.owner])).toBe("42501");
    // Réclamation pour une personne hors de l'organisation : refusée par la clé vers memberships (mineur 2).
    expect(await codeSous(a, INSERT_RECLAMATION, [a.org, a.trip, b.owner, 3])).toBe("23503");
  });

  it("vadrouille_owner (pris par vadrouille_migrator) lit zéro ligne, même avec le contexte d'une organisation remplie", async () => {
    const migrator = await connect("migrator");
    await migrator.query("BEGIN");
    try {
      await migrator.query("SET LOCAL ROLE vadrouille_owner");
      await migrator.query("SELECT set_config('app.organization_id', $1, true)", [a.org]);
      for (const table of REMINDER_TABLES) {
        expect(Number((await migrator.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n), table).toBe(0);
      }
    } finally {
      await migrator.query("ROLLBACK");
    }
  });
});

describe("rappels (0024) : accords", () => {
  it("un seul accord actif par voyage et par personne ; retiré, un nouvel accord crée une ligne (historique gardé)", async () => {
    const o = await organisation(app, auth);
    await inTx(app, ctx(o), async (c) => {
      const premier = (await c.query(INSERT_ACCORD, [o.org, o.trip, o.owner])).rows[0].id as string;
      expect((await attempt(c, INSERT_ACCORD, [o.org, o.trip, o.owner])).code, "second accord actif").toBe("23505");
      expect((await c.query("UPDATE reminder_consents SET withdrawn_at = now() WHERE id = $1 AND withdrawn_at IS NULL", [premier])).rowCount).toBe(1);
      const second = (await c.query(INSERT_ACCORD, [o.org, o.trip, o.owner])).rows[0].id as string;
      expect(second).not.toBe(premier);
      const { rows } = await c.query("SELECT id, withdrawn_at IS NULL AS actif FROM reminder_consents ORDER BY consented_at, actif");
      expect(rows.map((r) => r.actif).sort()).toEqual([false, true]);
    });
  });

  it("un autre membre de l'organisation a son propre accord actif sur le même voyage ; il ne pose ni ne retire celui d'un autre", async () => {
    const membre = { org: a.org, user: a.members[0] };
    await inTx(app, membre, async (c) => {
      expect((await attempt(c, INSERT_ACCORD, [a.org, a.trip, a.members[0]])).code).toBeUndefined();
      expect((await attempt(c, INSERT_ACCORD, [a.org, a.trip, a.owner])).code, "accord pour la personne propriétaire").toBe("42501");
      const retrait = await attempt(c, "UPDATE reminder_consents SET withdrawn_at = now() WHERE id = $1", [accordA]);
      expect(retrait, "retrait de l'accord d'une autre personne").toEqual({ rowCount: 0 });
    });
    const accord = await inTx(app, ctx(a), async (c) => (await c.query("SELECT withdrawn_at FROM reminder_consents WHERE id = $1", [accordA])).rows);
    expect(accord).toEqual([{ withdrawn_at: null }]);
  });

  it("accord retiré : aucune modification, retrait compris ; accord actif : seule withdrawn_at est modifiable, jamais remise à nul", async () => {
    const o = await organisation(app, auth);
    await inTx(app, ctx(o), async (c) => {
      const id = (await c.query(INSERT_ACCORD, [o.org, o.trip, o.owner])).rows[0].id as string;
      for (const set of ["consented_at = now()", "user_id = user_id", "trip_id = trip_id", "id = id"]) {
        await expectRefused(c, `UPDATE reminder_consents SET ${set} WHERE id = $1`, [id]);
      }
      expect((await attempt(c, "UPDATE reminder_consents SET withdrawn_at = NULL WHERE id = $1", [id])).code, "retrait nul").toBe("42501");
      expect((await attempt(c, "UPDATE reminder_consents SET withdrawn_at = now() WHERE id = $1", [id])).code).toBeUndefined();
      for (const set of ["withdrawn_at = NULL", "withdrawn_at = now()", "withdrawn_at = withdrawn_at"]) {
        expect((await attempt(c, `UPDATE reminder_consents SET ${set} WHERE id = $1`, [id])).code, set).toBe("42501");
      }
    });
  });

  it("retrait : withdrawn_at est l'instant de la transaction, quelle que soit la valeur fournie (revue de la PR M6c-D, bloquant 1)", async () => {
    const o = await organisation(app, auth);
    await inTx(app, ctx(o), async (c) => {
      const id = (await c.query(INSERT_ACCORD, [o.org, o.trip, o.owner])).rows[0].id as string;
      const pose = await c.query(
        "UPDATE reminder_consents SET withdrawn_at = now() + interval '30 days' WHERE id = $1 RETURNING withdrawn_at = now() AS instant, consented_at = now() AS accord",
        [id],
      );
      expect(pose.rows).toEqual([{ instant: true, accord: true }]);
    });
  });

  it("le déclencheur vaut aussi pour la connexion d'administration (note d'exploitation, handover § 6)", async () => {
    const o = await organisation(app, auth);
    const id = await inTx(app, ctx(o), async (c) => {
      const accord = (await c.query(INSERT_ACCORD, [o.org, o.trip, o.owner])).rows[0].id as string;
      await c.query("UPDATE reminder_consents SET withdrawn_at = now() WHERE id = $1", [accord]);
      return accord;
    });
    await admin.query("BEGIN");
    try {
      expect((await attempt(admin, "UPDATE public.reminder_consents SET withdrawn_at = NULL WHERE id = $1", [id])).code).toBe("42501");
    } finally {
      await admin.query("ROLLBACK");
    }
  });

  it("CHECK : un retrait ne précède jamais l'accord (éprouvée par l'administration, seule à pouvoir fournir ces instants)", async () => {
    const o = await organisation(app, auth);
    await admin.query("BEGIN");
    try {
      expect(
        (await attempt(admin, "INSERT INTO public.reminder_consents (organization_id, trip_id, user_id, consented_at, withdrawn_at) VALUES ($1, $2, $3, now(), now() - interval '1 day')", [o.org, o.trip, o.owner])).code,
      ).toBe("23514");
    } finally {
      await admin.query("ROLLBACK");
    }
  });
});

describe("rappels (0024) : réclamations", () => {
  it("une seule réclamation par voyage, personne et journée ; une autre journée ou une autre personne passe", async () => {
    await inTx(app, ctx(a), async (c) => {
      expect((await attempt(c, INSERT_RECLAMATION, [a.org, a.trip, a.owner, 1])).code, "même journée").toBe("23505");
      expect((await attempt(c, INSERT_RECLAMATION, [a.org, a.trip, a.owner, 2])).code, "autre journée").toBeUndefined();
      expect((await attempt(c, INSERT_RECLAMATION, [a.org, a.trip, a.members[0], 1])).code, "autre personne").toBeUndefined();
    });
    // Même clé dans une autre organisation : aucune collision (B a sa propre réclamation de la journée 1).
    expect(await countAs(app, ctx(b), "reminder_sends")).toBe(1);
  });

  it("CHECK : day_index >= 1", async () => {
    for (const jour of [0, -1]) expect(await codeSous(a, INSERT_RECLAMATION, [a.org, a.trip, a.owner, jour]), String(jour)).toBe("23514");
  });
});

describe("rappels (0024) : suppression d'un voyage et purge du compte", () => {
  it("un voyage qui a un accord ne se supprime pas hors de la purge (NO ACTION, 0157 § 1.7 point 5)", async () => {
    const o = await organisation(app, auth);
    await peupler(app, o);
    await admin.query("BEGIN");
    try {
      expect((await attempt(admin, "DELETE FROM public.trips WHERE id = $1", [o.trip])).code).toBe("23503");
    } finally {
      await admin.query("ROLLBACK");
    }
  });

  it("la purge vide accords (actifs et retirés) et réclamations, puis le voyage, sans toucher une autre organisation", async () => {
    const o = await organisation(app, auth);
    const id = await peupler(app, o);
    await inTx(app, ctx(o), async (c) => {
      await c.query("UPDATE reminder_consents SET withdrawn_at = now() WHERE id = $1", [id]);
      await c.query(INSERT_ACCORD, [o.org, o.trip, o.owner]);
      await c.query(INSERT_RECLAMATION, [o.org, o.trip, o.owner, 2]);
    });
    const avantB = { accords: await countAs(app, ctx(b), "reminder_consents"), reclamations: await countAs(app, ctx(b), "reminder_sends") };
    await inTx(app, ctx(o), (c) => c.query("SELECT purge_organization_data($1)", [o.org]), "vadrouille_account_admin");
    for (const table of [...REMINDER_TABLES, "trips"]) expect(await countAs(app, ctx(o), table), table).toBe(0);
    expect({ accords: await countAs(app, ctx(b), "reminder_consents"), reclamations: await countAs(app, ctx(b), "reminder_sends") }).toEqual(avantB);
  });
});

const DOWN_0024 = readFileSync(path.join(process.cwd(), "db/migrations/0024_rappels.down.sql"), "utf8");

describe("0024 : retour arrière (base jetable)", () => {
  it("la descente retire les droits de vadrouille_app ; tables, lignes, déclencheur, droits et purge de 0024 restent", async () => {
    const nom = await creerBase("rappels_retour");
    await runMigrations({ VADROUILLE_DATABASE_URL_MIGRATOR: urlBaseJetable("migrator", nom) });
    const [appJ, authJ, adminJ, migrateur] = await Promise.all([
      connectBaseJetable("app", nom),
      connectBaseJetable("auth", nom),
      connectBaseJetable("admin", nom),
      connectBaseJetable("migrator", nom),
    ]);
    const o = await organisation(appJ, authJ);
    await peupler(appJ, o);
    const etat = async () =>
      (
        await adminJ.query(
          `SELECT pg_catalog.has_any_column_privilege('vadrouille_app', 'public.reminder_consents', 'SELECT, INSERT, UPDATE, REFERENCES') AS app_accords,
                  pg_catalog.has_any_column_privilege('vadrouille_app', 'public.reminder_sends', 'SELECT, INSERT, UPDATE, REFERENCES') AS app_reclamations,
                  pg_catalog.has_table_privilege('vadrouille_fn_purge', 'public.reminder_consents', 'DELETE')
                    AND pg_catalog.has_table_privilege('vadrouille_fn_purge', 'public.reminder_sends', 'DELETE') AS purge_droits,
                  (SELECT count(*)::int FROM public.reminder_consents) + (SELECT count(*)::int FROM public.reminder_sends) AS lignes,
                  (SELECT count(*)::int FROM pg_catalog.pg_trigger WHERE tgname = 'reminder_consents_withdraw_once') AS declencheur,
                  (SELECT count(*)::int FROM pg_catalog.pg_policies WHERE tablename IN ('reminder_consents', 'reminder_sends')) AS politiques,
                  pg_catalog.pg_get_functiondef('public.purge_organization_data(uuid)'::regprocedure) LIKE '%reminder_sends%' AS purge_0024,
                  (SELECT count(*)::int FROM pg_catalog.pg_auth_members m
                   WHERE m.roleid = 'vadrouille_fn_purge'::regrole AND m.member = 'vadrouille_migrator'::regrole AND (m.set_option OR m.inherit_option)) AS appartenance`,
        )
      ).rows[0];
    expect(await etat()).toEqual({ app_accords: true, app_reclamations: true, purge_droits: true, lignes: 2, declencheur: 1, politiques: 6, purge_0024: true, appartenance: 0 });

    await migrateur.query("BEGIN");
    await migrateur.query(DOWN_0024);
    expect((await migrateur.query("SELECT current_user::text AS u")).rows[0].u).toBe("vadrouille_migrator");
    await migrateur.query("COMMIT");
    expect(await etat()).toEqual({ app_accords: false, app_reclamations: false, purge_droits: true, lignes: 2, declencheur: 1, politiques: 6, purge_0024: true, appartenance: 0 });

    // Après la descente, la purge du compte passe encore (réclamations et accords avant le voyage).
    await inTx(appJ, ctx(o), (c) => c.query("SELECT purge_organization_data($1)", [o.org]), "vadrouille_account_admin");
    const reste = await adminJ.query("SELECT (SELECT count(*)::int FROM public.reminder_consents) AS accords, (SELECT count(*)::int FROM public.trips WHERE id = $1) AS voyage", [o.trip]);
    expect(reste.rows[0]).toEqual({ accords: 0, voyage: 0 });
  });
});
