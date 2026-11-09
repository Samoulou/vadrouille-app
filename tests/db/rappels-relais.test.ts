import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "../../db/migrate";
import { urlBaseJetable } from "./env";
import { attempt, closeAll, connect, connectBaseJetable, countAs, createOrg, type DbClient, expectNoEffect, expectRefused, inTx, RELAY_TABLES } from "./helpers";
import { creerBase, supprimerBases } from "./workflows-harnais";

/**
 * Migration 0027_rappels_relais (tâche R-D, ticket 1061 ; décision 0162 § 2 et § 6.1, critères 1 à 9 ; droits et
 * politiques : propositions du Tech Lead, verdict de la Sécurité attendu, S-R1 à S-R6).
 *
 * `reminder_relays` : la réclamation de la génération `relay_n` de la chaîne d'exécutions d'un accord est l'insertion de
 * sa ligne ; la seconde échoue (`23505`) ou ne rend aucune ligne (`ON CONFLICT DO NOTHING`). Insertion seulement, par
 * l'accord de la personne de la transaction, s'il n'est pas retiré. Isolation éprouvée sous `vadrouille_app` avec le
 * contexte de `withOrg` (`inTx`), comme `tests/db/rappels.test.ts` ; purge du compte ; descente de 0027 sur une base
 * jetable. La table est hors du peuplement commun (`RELAY_TABLES`, `tests/db/helpers.ts`) : chaque cas pose ses lignes.
 */

type Orga = { org: string; owner: string; members: string[]; trip: string };

const INSERT_ACCORD = "INSERT INTO reminder_consents (organization_id, trip_id, user_id) VALUES ($1, $2, $3) RETURNING id";
const INSERT_RELAIS = "INSERT INTO reminder_relays (organization_id, consent_id, relay_n, claimed_run_id) VALUES ($1, $2, $3, $4)";
/** Réclamation de R-B (0162 § 3 point 2.2). */
const RECLAMER = `${INSERT_RELAIS} ON CONFLICT DO NOTHING RETURNING relay_n`;

/**
 * Identifiants d'exécution réels du Workflow SDK 5.1.0 (0162 § 2 point 2), produits par le code du SDK installé : monde
 * local (`wrun_` + `monotonicUlid()` de `@workflow/world-local` 5.0.2, comme le repli `ulid()` de `@workflow/core` 5.1.0)
 * et monde Vercel (`createRunId` de `@workflow/world-vercel` 5.1.0 : ULID marqué de la région, premier caractère `4`).
 * `wrun_` puis 26 caractères Crockford base 32, 31 en tout.
 */
const RUN_LOCAL = "wrun_01M6ZWVHNG68KA5EAJ41PT0PCP";
const RUN_VERCEL = "wrun_41M6ZWVHNG50W7N2HSG8R3DG98";
const RUN_AUTRE = "wrun_01M6ZWVHNH0GN4PJ1KMK7TM95T";

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

/** Un accord actif de la personne `user` (propriétaire par défaut), écrit sous `vadrouille_app`. */
async function accord(client: DbClient, o: Orga, user = o.owner): Promise<string> {
  return inTx(client, { org: o.org, user }, async (c) => (await c.query(INSERT_ACCORD, [o.org, o.trip, user])).rows[0].id as string);
}

/** Un accord actif et sa réclamation de la génération 1, écrits sous `vadrouille_app`. */
async function peupler(client: DbClient, o: Orga): Promise<string> {
  const id = await accord(client, o);
  await inTx(client, ctx(o), (c) => c.query(INSERT_RELAIS, [o.org, id, 1, RUN_LOCAL]));
  return id;
}

/** Code SQLSTATE d'une instruction de `vadrouille_app` dans le contexte donné (point de sauvegarde), ou `undefined`. */
async function codeSous(contexte: { org?: string; user?: string }, sql: string, params: unknown[] = []): Promise<string | undefined> {
  return inTx(app, contexte, async (c) => (await attempt(c, sql, params)).code);
}

/** Nombre de relais d'une organisation, vu par l'administration (hors RLS). */
async function relaisDe(org: string): Promise<number> {
  return (await admin.query("SELECT count(*)::int AS n FROM public.reminder_relays WHERE organization_id = $1", [org])).rows[0].n as number;
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

describe("relais (0027) : forme (critères 1 à 3, 9)", () => {
  it("relais: cinq colonnes exactes, aucune colonne de texte libre ni JSON (claimed_run_id seul texte, borné par CHECK)", async () => {
    const { rows } = await app.query(
      `SELECT column_name AS c, data_type AS type, is_nullable AS nul, column_default AS defaut FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'reminder_relays' ORDER BY ordinal_position`,
    );
    expect(rows).toEqual([
      { c: "organization_id", type: "uuid", nul: "NO", defaut: null },
      { c: "consent_id", type: "uuid", nul: "NO", defaut: null },
      { c: "relay_n", type: "smallint", nul: "NO", defaut: null },
      { c: "claimed_run_id", type: "text", nul: "NO", defaut: null },
      { c: "claimed_at", type: "timestamp with time zone", nul: "NO", defaut: "now()" },
    ]);
  });

  it("clé primaire (organization_id, consent_id, relay_n) ; CHECK relay_n >= 1 et format de claimed_run_id", async () => {
    const { rows } = await app.query(
      `SELECT conname, contype, pg_catalog.pg_get_constraintdef(oid) AS def FROM pg_catalog.pg_constraint
       WHERE conrelid = 'public.reminder_relays'::regclass AND contype IN ('p', 'c') ORDER BY conname`,
    );
    expect(rows.map((r) => [r.conname, r.def])).toEqual([
      ["reminder_relays_claimed_run_id_check", "CHECK ((claimed_run_id ~ '^wrun_[0-9A-Za-z]{1,59}$'::text))"],
      ["reminder_relays_pkey", "PRIMARY KEY (organization_id, consent_id, relay_n)"],
      ["reminder_relays_relay_n_check", "CHECK ((relay_n >= 1))"],
    ]);
  });

  it("clés étrangères toutes en NO ACTION : organisation et accord composé ; contrainte unique (organization_id, id) de reminder_consents présente", async () => {
    const { rows } = await app.query(
      `SELECT conname, pg_catalog.pg_get_constraintdef(oid) AS def, confdeltype, confupdtype
       FROM pg_catalog.pg_constraint WHERE contype = 'f' AND conrelid = 'public.reminder_relays'::regclass ORDER BY conname`,
    );
    expect(rows.map((r) => [r.conname, r.def])).toEqual([
      ["reminder_relays_consent_fk", "FOREIGN KEY (organization_id, consent_id) REFERENCES reminder_consents(organization_id, id)"],
      ["reminder_relays_organization_id_organizations_id_fk", "FOREIGN KEY (organization_id) REFERENCES organizations(id)"],
    ]);
    expect(rows.every((r) => r.confdeltype === "a" && r.confupdtype === "a")).toBe(true);
    const unique = await app.query(
      `SELECT pg_catalog.pg_get_constraintdef(oid) AS def FROM pg_catalog.pg_constraint
       WHERE conrelid = 'public.reminder_consents'::regclass AND contype = 'u'`,
    );
    expect(unique.rows.map((r) => r.def)).toEqual(["UNIQUE (organization_id, id)"]);
  });

  it("RLS activée et forcée ; politiques de vadrouille_app bornées à l'organisation et à la personne de l'accord (non retiré à l'insertion) ; politique de purge", async () => {
    const table = await app.query("SELECT relrowsecurity, relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.reminder_relays'::regclass");
    expect(table.rows).toEqual([{ relrowsecurity: true, relforcerowsecurity: true }]);
    const { rows } = await app.query(
      "SELECT policyname, roles::text[] AS roles, cmd, qual, with_check FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'reminder_relays' ORDER BY policyname",
    );
    const ORG = "(organization_id = app_current_org())";
    const ACCORD =
      "((organization_id = app_current_org()) AND (EXISTS ( SELECT 1\n   FROM reminder_consents c\n  WHERE ((c.organization_id = reminder_relays.organization_id) AND (c.id = reminder_relays.consent_id) AND (c.user_id = app_current_user())";
    expect(rows.map((p) => [p.policyname, p.roles, p.cmd])).toEqual([
      ["reminder_relays_app_insert", ["vadrouille_app"], "INSERT"],
      ["reminder_relays_app_select", ["vadrouille_app"], "SELECT"],
      ["reminder_relays_fn_purge", ["vadrouille_fn_purge"], "ALL"],
    ]);
    const [insertion, lecture, purge] = rows;
    expect(insertion.qual).toBeNull();
    expect(insertion.with_check).toBe(`${ACCORD} AND (c.withdrawn_at IS NULL)))))`);
    expect(lecture.qual).toBe(`${ACCORD}))))`);
    expect(lecture.with_check).toBeNull();
    expect([purge.qual, purge.with_check]).toEqual([ORG, ORG]);
  });
});

describe("relais (0027) : CHECK (critère 1)", () => {
  it("identifiants réels du SDK acceptés (monde local et monde Vercel)", async () => {
    const o = await organisation(app, auth);
    const id = await accord(app, o);
    for (const [n, run] of [[1, RUN_LOCAL], [2, RUN_VERCEL], [3, `wrun_${"Z".repeat(59)}`]] as const) {
      expect(await codeSous(ctx(o), INSERT_RELAIS, [o.org, id, n, run]), run).toBeUndefined();
    }
  });

  it("sans préfixe wrun_, avec un caractère non alphanumérique, vide après le préfixe ou de 65 caractères : refusé (23514)", async () => {
    const o = await organisation(app, auth);
    const id = await accord(app, o);
    for (const run of [
      RUN_LOCAL.slice(5),
      `step_${RUN_LOCAL.slice(5)}`,
      `WRUN_${RUN_LOCAL.slice(5)}`,
      `${RUN_LOCAL}-x`,
      `${RUN_LOCAL} `,
      `wrun_01M6ZWVHNG68KA5EAJ41PT0PC'`,
      "wrun_",
      `wrun_${"Z".repeat(60)}`,
      `${RUN_LOCAL}\n`,
    ]) {
      expect(await codeSous(ctx(o), INSERT_RELAIS, [o.org, id, 1, run]), JSON.stringify(run)).toBe("23514");
    }
    expect(await relaisDe(o.org)).toBe(0);
  });

  it("relay_n >= 1 : 0 et -1 refusés (23514) ; 32 767 accepté", async () => {
    const o = await organisation(app, auth);
    const id = await accord(app, o);
    for (const n of [0, -1]) expect(await codeSous(ctx(o), INSERT_RELAIS, [o.org, id, n, RUN_LOCAL]), String(n)).toBe("23514");
    expect(await codeSous(ctx(o), INSERT_RELAIS, [o.org, id, 32767, RUN_LOCAL])).toBeUndefined();
  });
});

describe("relais (0027) : droits par colonnes de vadrouille_app (critère 4, S-R1)", () => {
  it("INSERT des quatre colonnes seulement (ni claimed_at) ; aucun UPDATE ; SELECT, et aucun DELETE ni TRUNCATE", async () => {
    const { rows } = await app.query(
      `SELECT a.attname,
              pg_catalog.has_column_privilege('vadrouille_app', a.attrelid, a.attnum, 'INSERT') AS insertion,
              pg_catalog.has_column_privilege('vadrouille_app', a.attrelid, a.attnum, 'UPDATE') AS maj,
              pg_catalog.has_column_privilege('vadrouille_app', a.attrelid, a.attnum, 'SELECT') AS lecture
       FROM pg_catalog.pg_attribute a
       WHERE a.attrelid = 'public.reminder_relays'::regclass AND a.attnum > 0 AND NOT a.attisdropped
       ORDER BY a.attname`,
    );
    expect(rows.filter((r) => r.insertion).map((r) => r.attname)).toEqual(["claimed_run_id", "consent_id", "organization_id", "relay_n"]);
    expect(rows.filter((r) => r.maj).map((r) => r.attname)).toEqual([]);
    expect(rows.every((r) => r.lecture)).toBe(true);
    const table = await app.query(
      `SELECT p AS privilege FROM unnest($1::text[]) AS p WHERE pg_catalog.has_table_privilege('vadrouille_app', 'public.reminder_relays', p)`,
      [["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]],
    );
    expect(table.rows.map((r) => r.privilege)).toEqual(["SELECT"]);
  });

  it("INSERT avec claimed_at explicite refusé (42501) ; claimed_at est l'instant de la transaction", async () => {
    const o = await organisation(app, auth);
    const id = await accord(app, o);
    expect(
      await codeSous(ctx(o), "INSERT INTO reminder_relays (organization_id, consent_id, relay_n, claimed_run_id, claimed_at) VALUES ($1, $2, 1, $3, now() - interval '1 day')", [o.org, id, RUN_LOCAL]),
    ).toBe("42501");
    const pose = await inTx(app, ctx(o), async (c) => (await c.query(`${INSERT_RELAIS} RETURNING claimed_at = now() AS instant`, [o.org, id, 1, RUN_LOCAL])).rows);
    expect(pose).toEqual([{ instant: true }]);
  });

  it("aucune mise à jour ni suppression de ses propres lignes (42501), aucun TRUNCATE ; la ligne reste intacte", async () => {
    await inTx(app, ctx(a), async (c) => {
      for (const set of ["claimed_run_id = $2", "relay_n = 2", "claimed_at = now()", "consent_id = consent_id", "organization_id = organization_id"]) {
        const params = set.includes("$2") ? [accordA, RUN_AUTRE] : [accordA];
        await expectRefused(c, `UPDATE reminder_relays SET ${set} WHERE consent_id = $1`, params);
      }
      await expectRefused(c, "DELETE FROM reminder_relays WHERE consent_id = $1", [accordA]);
      await expectRefused(c, "TRUNCATE reminder_relays");
    });
    const ligne = await inTx(app, ctx(a), async (c) => (await c.query("SELECT relay_n, claimed_run_id FROM reminder_relays WHERE consent_id = $1", [accordA])).rows);
    expect(ligne).toEqual([{ relay_n: 1, claimed_run_id: RUN_LOCAL }]);
  });
});

describe("relais (0027) : isolation (critères 2 et 5, S-R2)", () => {
  it("lecture croisée impossible entre organisations ; sans contexte, aucune ligne", async () => {
    await inTx(app, ctx(a), async (c) => {
      const { rows } = await c.query("SELECT organization_id, consent_id FROM reminder_relays");
      expect(rows).toEqual([{ organization_id: a.org, consent_id: accordA }]);
      expect((await c.query("SELECT count(*)::int AS n FROM reminder_relays WHERE organization_id = $1", [b.org])).rows[0].n).toBe(0);
    });
    for (const contexte of [{}, { org: a.org }, { user: a.owner }]) {
      await inTx(app, contexte, async (c) => {
        expect((await c.query("SELECT count(*)::int AS n FROM reminder_relays")).rows[0].n, JSON.stringify(contexte)).toBe(0);
      });
    }
  });

  it("insertion pour une autre organisation refusée (RLS), avec ou sans contexte", async () => {
    for (const contexte of [ctx(a), {}, { org: a.org }]) {
      expect(await codeSous(contexte, INSERT_RELAIS, [b.org, accordB, 2, RUN_AUTRE]), JSON.stringify(contexte)).toBe("42501");
    }
    expect(await relaisDe(b.org)).toBe(1);
  });

  it("un relais ne vise jamais l'accord d'une autre organisation (RLS, puis clé étrangère composée 23503)", async () => {
    // Sous vadrouille_app, la politique refuse d'abord (l'accord de B n'est pas lisible dans l'organisation de A).
    expect(await codeSous(ctx(a), INSERT_RELAIS, [a.org, accordB, 2, RUN_AUTRE])).toBe("42501");
    // Hors RLS (administration), la clé composée refuse la paire (organisation de A, accord de B).
    await admin.query("BEGIN");
    try {
      expect((await attempt(admin, "INSERT INTO public.reminder_relays (organization_id, consent_id, relay_n, claimed_run_id) VALUES ($1, $2, 2, $3)", [a.org, accordB, RUN_AUTRE])).code).toBe("23503");
    } finally {
      await admin.query("ROLLBACK");
    }
  });

  it("une personne ne lit ni ne réclame le relais de l'accord d'une autre personne de la même organisation", async () => {
    const membre = { org: a.org, user: a.members[0] };
    await inTx(app, membre, async (c) => {
      expect((await c.query("SELECT count(*)::int AS n FROM reminder_relays")).rows[0].n).toBe(0);
      expect((await attempt(c, INSERT_RELAIS, [a.org, accordA, 2, RUN_AUTRE])).code).toBe("42501");
      expect((await attempt(c, RECLAMER, [a.org, accordA, 1, RUN_AUTRE])).code).toBe("42501");
    });
    // Son propre accord sur le même voyage : il réclame et ne lit que le sien.
    const sien = await accord(app, a, a.members[0]);
    await inTx(app, membre, async (c) => {
      expect((await c.query(RECLAMER, [a.org, sien, 1, RUN_AUTRE])).rows).toEqual([{ relay_n: 1 }]);
      const { rows } = await c.query("SELECT consent_id FROM reminder_relays");
      expect(rows).toEqual([{ consent_id: sien }]);
    });
    const proprietaire = await inTx(app, ctx(a), async (c) => (await c.query("SELECT consent_id FROM reminder_relays")).rows);
    expect(proprietaire).toEqual([{ consent_id: accordA }]);
  });

  it("vadrouille_owner (pris par vadrouille_migrator) lit zéro ligne, même avec le contexte d'une organisation remplie", async () => {
    const migrator = await connect("migrator");
    await migrator.query("BEGIN");
    try {
      await migrator.query("SET LOCAL ROLE vadrouille_owner");
      await migrator.query("SELECT set_config('app.organization_id', $1, true), set_config('app.user_id', $2, true)", [a.org, a.owner]);
      for (const table of RELAY_TABLES) {
        expect(Number((await migrator.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n), table).toBe(0);
      }
    } finally {
      await migrator.query("ROLLBACK");
    }
  });

  it("modifications croisées sans effet", async () => {
    await inTx(app, ctx(a), async (c) => {
      await expectNoEffect(c, "UPDATE reminder_relays SET relay_n = 3 WHERE organization_id = $1", [b.org]);
      await expectNoEffect(c, "DELETE FROM reminder_relays WHERE organization_id = $1", [b.org]);
    });
    expect(await relaisDe(b.org)).toBe(1);
  });
});

describe("relais (0027) : réclamation (critère 6)", () => {
  it("seconde insertion de la même clé : ON CONFLICT DO NOTHING rend zéro ligne, 23505 sans ON CONFLICT ; la première réclamation est gardée", async () => {
    const o = await organisation(app, auth);
    const id = await accord(app, o);
    await inTx(app, ctx(o), async (c) => {
      expect((await c.query(RECLAMER, [o.org, id, 1, RUN_LOCAL])).rows).toEqual([{ relay_n: 1 }]);
      // Étape rejouée de la même exécution, puis doublon d'une autre exécution : aucune ligne rendue.
      for (const run of [RUN_LOCAL, RUN_AUTRE]) expect((await c.query(RECLAMER, [o.org, id, 1, run])).rowCount, run).toBe(0);
      expect((await attempt(c, INSERT_RELAIS, [o.org, id, 1, RUN_AUTRE])).code).toBe("23505");
      // Lecture de R-B (0162 § 3 point 2.3) : l'exécution qui a réclamé.
      const { rows } = await c.query("SELECT claimed_run_id FROM reminder_relays WHERE organization_id = $1 AND consent_id = $2 AND relay_n = $3", [o.org, id, 1]);
      expect(rows).toEqual([{ claimed_run_id: RUN_LOCAL }]);
    });
  });

  it("autre relay_n ou autre accord : la réclamation passe", async () => {
    const o = await organisation(app, auth);
    const premier = await accord(app, o);
    await inTx(app, ctx(o), async (c) => {
      expect((await c.query(RECLAMER, [o.org, premier, 1, RUN_LOCAL])).rows).toEqual([{ relay_n: 1 }]);
      expect((await c.query(RECLAMER, [o.org, premier, 2, RUN_AUTRE])).rows).toEqual([{ relay_n: 2 }]);
      // Réactivation (0162 § 5 cas 8) : nouvel accord, nouvelle suite de clés.
      await c.query("UPDATE reminder_consents SET withdrawn_at = now() WHERE id = $1", [premier]);
      const second = (await c.query(INSERT_ACCORD, [o.org, o.trip, o.owner])).rows[0].id as string;
      expect((await c.query(RECLAMER, [o.org, second, 1, RUN_VERCEL])).rows).toEqual([{ relay_n: 1 }]);
    });
    expect(await relaisDe(o.org)).toBe(3);
  });

  it("deux réclamations concurrentes de la même génération : une seule ligne rendue", async () => {
    const o = await organisation(app, auth);
    const id = await accord(app, o);
    const [x, y] = await Promise.all([connect("app"), connect("app")]);
    const ouvrir = async (c: DbClient) => {
      await c.query("BEGIN");
      await c.query("SELECT set_config('app.organization_id', $1, true), set_config('app.user_id', $2, true)", [o.org, o.owner]);
    };
    await ouvrir(x);
    await ouvrir(y);
    const premiere = await x.query(RECLAMER, [o.org, id, 1, RUN_LOCAL]);
    // La seconde attend la fin de la première transaction (index unique), puis ne rend rien.
    const seconde = y.query(RECLAMER, [o.org, id, 1, RUN_AUTRE]);
    await x.query("COMMIT");
    const rendue = await seconde;
    await y.query("COMMIT");
    expect([premiere.rowCount, rendue.rowCount]).toEqual([1, 0]);
    expect(await relaisDe(o.org)).toBe(1);
  });

  it("accord retiré : réclamation refusée (42501), même avec ON CONFLICT ; accord absent : refusée", async () => {
    const o = await organisation(app, auth);
    const id = await accord(app, o);
    await inTx(app, ctx(o), (c) => c.query("UPDATE reminder_consents SET withdrawn_at = now() WHERE id = $1", [id]));
    expect(await codeSous(ctx(o), INSERT_RELAIS, [o.org, id, 1, RUN_LOCAL])).toBe("42501");
    expect(await codeSous(ctx(o), RECLAMER, [o.org, id, 1, RUN_LOCAL])).toBe("42501");
    expect(await codeSous(ctx(o), RECLAMER, [o.org, "00000000-0000-4000-8000-000000000000", 1, RUN_LOCAL])).toBe("42501");
    expect(await relaisDe(o.org)).toBe(0);
  });

  it("un relais déjà réclamé reste lisible après le retrait de son accord (lecture : personne et organisation seulement)", async () => {
    const o = await organisation(app, auth);
    const id = await peupler(app, o);
    await inTx(app, ctx(o), (c) => c.query("UPDATE reminder_consents SET withdrawn_at = now() WHERE id = $1", [id]));
    expect(await countAs(app, ctx(o), "reminder_relays")).toBe(1);
  });
});

describe("relais (0027) : suppression d'un accord et purge du compte (critère 7, S-R6)", () => {
  it("un accord qui a un relais ne se supprime pas hors de la purge (NO ACTION, 23503) ; son voyage non plus", async () => {
    const o = await organisation(app, auth);
    const id = await peupler(app, o);
    await admin.query("BEGIN");
    try {
      expect((await attempt(admin, "DELETE FROM public.reminder_consents WHERE id = $1", [id])).code).toBe("23503");
      expect((await attempt(admin, "DELETE FROM public.trips WHERE id = $1", [o.trip])).code).toBe("23503");
    } finally {
      await admin.query("ROLLBACK");
    }
  });

  it("la purge vide relais, réclamations et accords, puis le voyage, sans toucher une autre organisation", async () => {
    const o = await organisation(app, auth);
    const id = await peupler(app, o);
    await inTx(app, ctx(o), async (c) => {
      await c.query(RECLAMER, [o.org, id, 2, RUN_AUTRE]);
      await c.query("INSERT INTO reminder_sends (organization_id, trip_id, user_id, day_index) VALUES ($1, $2, $3, 1)", [o.org, o.trip, o.owner]);
      await c.query("UPDATE reminder_consents SET withdrawn_at = now() WHERE id = $1", [id]);
    });
    expect(await relaisDe(o.org)).toBe(2);
    const avantB = await relaisDe(b.org);
    await inTx(app, ctx(o), (c) => c.query("SELECT purge_organization_data($1)", [o.org]), "vadrouille_account_admin");
    expect(await relaisDe(o.org)).toBe(0);
    const reste = await admin.query(
      `SELECT (SELECT count(*)::int FROM public.reminder_sends WHERE organization_id = $1) AS reclamations,
              (SELECT count(*)::int FROM public.reminder_consents WHERE organization_id = $1) AS accords,
              (SELECT count(*)::int FROM public.trips WHERE organization_id = $1) AS voyages`,
      [o.org],
    );
    expect(reste.rows[0]).toEqual({ reclamations: 0, accords: 0, voyages: 0 });
    expect(await relaisDe(b.org)).toBe(avantB);
  });

  it("vadrouille_fn_purge : SELECT (organization_id) et DELETE seulement", async () => {
    const { rows } = await app.query(
      `SELECT a.attname FROM pg_catalog.pg_attribute a
       WHERE a.attrelid = 'public.reminder_relays'::regclass AND a.attnum > 0 AND NOT a.attisdropped
         AND pg_catalog.has_column_privilege('vadrouille_fn_purge', a.attrelid, a.attnum, 'SELECT')`,
    );
    expect(rows.map((r) => r.attname)).toEqual(["organization_id"]);
    const table = await app.query(
      `SELECT p AS privilege FROM unnest($1::text[]) AS p WHERE pg_catalog.has_table_privilege('vadrouille_fn_purge', 'public.reminder_relays', p)`,
      [["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"]],
    );
    expect(table.rows.map((r) => r.privilege)).toEqual(["DELETE"]);
  });
});

const UP_0027 = readFileSync(path.join(process.cwd(), "db/migrations/0027_rappels_relais.sql"), "utf8");
const DOWN_0027 = readFileSync(path.join(process.cwd(), "db/migrations/0027_rappels_relais.down.sql"), "utf8");

describe("0027 : montée, descente, montée (base jetable, critère 8)", () => {
  it("la descente retire les droits de vadrouille_app ; table, lignes, contrainte, politiques et purge restent ; le texte de 0027 ne se rejoue pas ; une correction vers l'avant rend les droits", async () => {
    const nom = await creerBase("relais_retour");
    const urlMigrateur = { VADROUILLE_DATABASE_URL_MIGRATOR: urlBaseJetable("migrator", nom) };
    await runMigrations(urlMigrateur);
    const [appJ, authJ, adminJ, migrateur] = await Promise.all([
      connectBaseJetable("app", nom),
      connectBaseJetable("auth", nom),
      connectBaseJetable("admin", nom),
      connectBaseJetable("migrator", nom),
    ]);
    const o = await organisation(appJ, authJ);
    const id = await peupler(appJ, o);
    const etat = async () =>
      (
        await adminJ.query(
          `SELECT pg_catalog.has_any_column_privilege('vadrouille_app', 'public.reminder_relays', 'SELECT, INSERT, UPDATE, REFERENCES') AS app_relais,
                  pg_catalog.has_table_privilege('vadrouille_fn_purge', 'public.reminder_relays', 'DELETE') AS purge_droits,
                  (SELECT count(*)::int FROM public.reminder_relays) AS lignes,
                  (SELECT count(*)::int FROM pg_catalog.pg_constraint WHERE conname = 'reminder_consents_organization_id_id_' || 'key') AS contrainte,
                  (SELECT count(*)::int FROM pg_catalog.pg_constraint WHERE conrelid = 'public.reminder_relays'::regclass) AS contraintes_relais,
                  (SELECT count(*)::int FROM pg_catalog.pg_policies WHERE tablename = 'reminder_relays') AS politiques,
                  (SELECT relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.reminder_relays'::regclass) AS rls,
                  pg_catalog.pg_get_functiondef('public.purge_organization_data(uuid)'::regprocedure) LIKE '%reminder_relays%' AS purge_0027,
                  (SELECT count(*)::int FROM pg_catalog.pg_auth_members m
                   WHERE m.roleid = 'vadrouille_fn_purge'::regrole AND m.member = 'vadrouille_migrator'::regrole AND (m.set_option OR m.inherit_option)) AS appartenance`,
        )
      ).rows[0];
    const monte = { app_relais: true, purge_droits: true, lignes: 1, contrainte: 1, contraintes_relais: 5, politiques: 3, rls: true, purge_0027: true, appartenance: 0 };
    const descendu = { ...monte, app_relais: false };
    expect(await etat()).toEqual(monte);

    /** Texte SQL dans une transaction du migrateur ; code SQLSTATE si elle échoue (transaction annulée). */
    const jouer = async (texte: string): Promise<string | undefined> => {
      await migrateur.query("BEGIN");
      try {
        await migrateur.query(texte);
        expect((await migrateur.query("SELECT current_user::text AS u")).rows[0].u).toBe("vadrouille_migrator");
        await migrateur.query("COMMIT");
        return undefined;
      } catch (e) {
        await migrateur.query("ROLLBACK");
        return (e as { code?: string }).code;
      }
    };

    // 1. Descente : droits de vadrouille_app retirés, rien d'autre ; la réclamation échoue fermée (42501).
    expect(await jouer(DOWN_0027)).toBeUndefined();
    expect(await etat()).toEqual(descendu);
    const refus = await inTx(appJ, ctx(o), async (c) => (await attempt(c, RECLAMER, [o.org, id, 2, RUN_AUTRE])).code);
    expect(refus).toBe("42501");

    // 2. Texte de 0027 rejoué : refusé (contrainte et table existent), rien modifié.
    expect(await jouer(UP_0027)).toMatch(/^42(P07|710)$/);
    expect(await etat()).toEqual(descendu);

    // 3. Montée par le migrateur : 0027 est au journal, rien n'est rejoué.
    await runMigrations(urlMigrateur);
    expect(await etat()).toEqual(descendu);

    // 4. Correction vers l'avant (forme d'une migration corrective) : droits de 0027 rendus, la réclamation passe.
    const droits = UP_0027.split("--> statement-breakpoint")
      .map((i) => i.replace(/^\s*--.*$/gm, "").trim())
      .filter((i) => i.startsWith("GRANT") && i.includes("TO vadrouille_app"));
    expect(droits).toHaveLength(2);
    expect(await jouer(["SET LOCAL ROLE vadrouille_owner;", ...droits, "RESET ROLE;"].join("\n"))).toBeUndefined();
    expect(await etat()).toEqual(monte);
    const reprise = await inTx(appJ, ctx(o), async (c) => (await c.query(RECLAMER, [o.org, id, 2, RUN_AUTRE])).rows);
    expect(reprise).toEqual([{ relay_n: 2 }]);

    // Après la descente comme après la correction, la purge du compte passe (relais avant les accords).
    await inTx(appJ, ctx(o), (c) => c.query("SELECT purge_organization_data($1)", [o.org]), "vadrouille_account_admin");
    const reste = await adminJ.query("SELECT (SELECT count(*)::int FROM public.reminder_relays) AS relais, (SELECT count(*)::int FROM public.reminder_consents) AS accords");
    expect(reste.rows[0]).toEqual({ relais: 0, accords: 0 });
  });
});
