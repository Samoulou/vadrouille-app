import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "../../db/migrate";
import { urlBaseJetable } from "./env";
import { attempt, closeAll, connect, connectBaseJetable, countAs, createOrg, type DbClient, expectNoEffect, expectRefused, inTx, REVIEW_TABLES } from "./helpers";
import { creerBase, supprimerBases } from "./workflows-harnais";

/**
 * Migration 0026_apres_voyage (plan du MVP, M8-D, ticket 1055 ; décision 0160 § 1.1 (T1), § 1.3 (T3), § 2.1 (S1,
 * proposition du Tech Lead, verdict de la Sécurité attendu) et § 3.2 ; spécification `specs/M8-apres-le-voyage-api.md`
 * § 6.2).
 *
 * `stop_reviews` : une ligne par étape et par lieu pour le voyage, valeur fermée, écriture bornée à la personne de la
 * transaction, idempotence de l'`INSERT … ON CONFLICT` par `request_id`. `preferences` durcie : sujet fermé, unicité par
 * personne, lecture et écriture bornées à la personne, instant posé par la base, goût qui survit à son voyage. Isolation
 * éprouvée sous `vadrouille_app` avec le contexte de `withOrg` (`inTx`), comme `tests/db/rappels.test.ts` ; purge du
 * compte ; montée, descente et montée de 0026 sur une base jetable. `stop_reviews` est hors du peuplement commun
 * (`REVIEW_TABLES`, `tests/db/helpers.ts`) : chaque cas pose ses lignes ; `preferences` y est (une ligne par organisation).
 */

type Orga = { org: string; owner: string; members: string[]; trip: string };

/** Écriture d'un avis telle que 0160 § 1.1 point 4 la fixe : un geste, une instruction, rejeu sans effet. */
const AVIS = `INSERT INTO stop_reviews (organization_id, trip_id, stop_id, place_id, opinion, created_by, request_id)
  VALUES ($1, $2, $3, $4, $5, $6, $7)
  ON CONFLICT (organization_id, trip_id, stop_id, (COALESCE(place_id, ''))) DO UPDATE
  SET opinion = EXCLUDED.opinion, request_id = EXCLUDED.request_id, updated_at = now()
  WHERE stop_reviews.request_id IS DISTINCT FROM EXCLUDED.request_id`;
const INSERT_AVIS =
  "INSERT INTO stop_reviews (organization_id, trip_id, stop_id, place_id, opinion, created_by, request_id) VALUES ($1, $2, $3, $4, $5, $6, gen_random_uuid()) RETURNING id";
const INSERT_GOUT =
  "INSERT INTO preferences (organization_id, user_id, subject_kind, category, direction, origin, source_trip_id) VALUES ($1, $2, $3, $4, $5, $6, $7)";
const PLACE = "ChIJ-test-lieu-1";

let app: DbClient;
let auth: DbClient;
let admin: DbClient;
let a: Orga;
let b: Orga;
const ctx = (o: Orga) => ({ org: o.org, user: o.owner });

/** Organisation (propriétaire et `membres` membres) et un voyage, écrits par les rôles prévus. */
async function organisation(client: DbClient, authClient: DbClient, membres = 0): Promise<Orga> {
  const base = await createOrg(authClient, membres);
  const trip = await voyage(client, { org: base.org, owner: base.owner });
  return { org: base.org, owner: base.owner, members: base.members, trip };
}

async function voyage(client: DbClient, o: { org: string; owner: string }): Promise<string> {
  return inTx(client, { org: o.org, user: o.owner }, async (c) => {
    const { rows } = await c.query(
      "INSERT INTO trips (organization_id, created_by, request_id, destination, start_date, end_date, travellers_adults, time_zone) VALUES ($1, $2, gen_random_uuid(), 'Édimbourg', '2026-08-29', '2026-09-03', 2, 'Europe/London') RETURNING id",
      [o.org, o.owner],
    );
    return rows[0].id as string;
  });
}

/** Un avis et un goût de la personne propriétaire, écrits sous `vadrouille_app`. */
async function peupler(client: DbClient, o: Orga): Promise<string> {
  return inTx(client, ctx(o), async (c) => {
    const id = (await c.query(INSERT_AVIS, [o.org, o.trip, "s1", PLACE, "liked", o.owner])).rows[0].id as string;
    await c.query(INSERT_GOUT, [o.org, o.owner, "category", "museum", "less", "confirmed", o.trip]);
    return id;
  });
}

/** Code SQLSTATE d'une instruction de `vadrouille_app` dans le contexte `contexte` (point de sauvegarde), ou `undefined`. */
async function codeSous(contexte: { org: string; user: string }, sql: string, params: unknown[] = []): Promise<string | undefined> {
  return inTx(app, contexte, async (c) => (await attempt(c, sql, params)).code);
}

let avisA: string;
let avisB: string;

beforeAll(async () => {
  app = await connect("app");
  auth = await connect("auth");
  admin = await connect("admin");
  a = await organisation(app, auth, 1);
  b = await organisation(app, auth);
  avisA = await peupler(app, a);
  avisB = await peupler(app, b);
});

afterAll(async () => {
  await closeAll();
  await supprimerBases();
});

const COLONNES_AVIS = [
  { t: "stop_reviews", c: "id", type: "uuid", nul: "NO" },
  { t: "stop_reviews", c: "organization_id", type: "uuid", nul: "NO" },
  { t: "stop_reviews", c: "trip_id", type: "uuid", nul: "NO" },
  { t: "stop_reviews", c: "stop_id", type: "text", nul: "NO" },
  { t: "stop_reviews", c: "place_id", type: "text", nul: "YES" },
  { t: "stop_reviews", c: "opinion", type: "text", nul: "NO" },
  { t: "stop_reviews", c: "created_by", type: "uuid", nul: "NO" },
  { t: "stop_reviews", c: "request_id", type: "uuid", nul: "NO" },
  { t: "stop_reviews", c: "created_at", type: "timestamp with time zone", nul: "NO" },
  { t: "stop_reviews", c: "updated_at", type: "timestamp with time zone", nul: "NO" },
];
const COLONNES_GOUTS = [
  { t: "preferences", c: "id", type: "uuid", nul: "NO" },
  { t: "preferences", c: "organization_id", type: "uuid", nul: "NO" },
  { t: "preferences", c: "user_id", type: "uuid", nul: "NO" },
  { t: "preferences", c: "category", type: "text", nul: "YES" },
  { t: "preferences", c: "consented_at", type: "timestamp with time zone", nul: "NO" },
  { t: "preferences", c: "created_at", type: "timestamp with time zone", nul: "NO" },
  { t: "preferences", c: "subject_kind", type: "text", nul: "NO" },
  { t: "preferences", c: "direction", type: "text", nul: "YES" },
  { t: "preferences", c: "origin", type: "text", nul: "NO" },
  { t: "preferences", c: "source_trip_id", type: "uuid", nul: "YES" },
];

async function colonnes(client: DbClient) {
  const { rows } = await client.query(
    `SELECT table_name AS t, column_name AS c, data_type AS type, is_nullable AS nul FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name IN ('preferences', 'stop_reviews') ORDER BY table_name, ordinal_position`,
  );
  return rows;
}

describe("après le voyage (0026) : forme", () => {
  it("colonnes exactes : ni texte libre, ni nom, ni destination ; place_id seule donnée Google (0011) ; value retirée", async () => {
    expect(await colonnes(app)).toEqual([...COLONNES_GOUTS, ...COLONNES_AVIS]);
  });

  it("RLS activée et forcée ; politiques par personne pour l'écriture des avis et pour toute opération sur les goûts (S1)", async () => {
    const tables = await app.query(
      "SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_catalog.pg_class WHERE relnamespace = 'public'::regnamespace AND relname IN ('preferences', 'stop_reviews') ORDER BY relname",
    );
    expect(tables.rows).toEqual(["preferences", "stop_reviews"].map((relname) => ({ relname, relrowsecurity: true, relforcerowsecurity: true })));
    const politiques = await app.query(
      "SELECT tablename, policyname, roles::text[] AS roles, cmd, qual, with_check FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename IN ('preferences', 'stop_reviews') ORDER BY tablename, policyname COLLATE \"C\"",
    );
    const ORG = "(organization_id = app_current_org())";
    const PERSONNE = "((organization_id = app_current_org()) AND (user_id = app_current_user()))";
    const AUTEUR = "((organization_id = app_current_org()) AND (created_by = app_current_user()))";
    expect(politiques.rows.map((p) => [p.tablename, p.policyname, p.roles, p.cmd, p.qual, p.with_check])).toEqual([
      ["preferences", "preferences_app_delete", ["vadrouille_app"], "DELETE", PERSONNE, null],
      ["preferences", "preferences_app_insert", ["vadrouille_app"], "INSERT", null, PERSONNE],
      ["preferences", "preferences_app_select", ["vadrouille_app"], "SELECT", PERSONNE, null],
      ["preferences", "preferences_fn_purge", ["vadrouille_fn_purge"], "ALL", ORG, ORG],
      ["stop_reviews", "stop_reviews_app_delete", ["vadrouille_app"], "DELETE", AUTEUR, null],
      ["stop_reviews", "stop_reviews_app_insert", ["vadrouille_app"], "INSERT", null, AUTEUR],
      ["stop_reviews", "stop_reviews_app_select", ["vadrouille_app"], "SELECT", ORG, null],
      ["stop_reviews", "stop_reviews_app_update", ["vadrouille_app"], "UPDATE", AUTEUR, AUTEUR],
      ["stop_reviews", "stop_reviews_fn_purge", ["vadrouille_fn_purge"], "ALL", ORG, ORG],
    ]);
  });

  it("clés étrangères : avis en NO ACTION ; goût : adhésion en NO ACTION, voyage d'origine en SET NULL (source_trip_id) seulement", async () => {
    const { rows } = await app.query(
      `SELECT conrelid::regclass::text AS t, pg_catalog.pg_get_constraintdef(oid) AS def FROM pg_catalog.pg_constraint
       WHERE contype = 'f' AND conrelid IN ('public.preferences'::regclass, 'public.stop_reviews'::regclass) ORDER BY 1, conname COLLATE "C"`,
    );
    expect(rows.map((r) => [r.t, r.def])).toEqual([
      ["preferences", "FOREIGN KEY (organization_id, user_id) REFERENCES memberships(organization_id, user_id)"],
      ["preferences", "FOREIGN KEY (organization_id) REFERENCES organizations(id)"],
      ["preferences", "FOREIGN KEY (organization_id, source_trip_id) REFERENCES trips(organization_id, id) ON DELETE SET NULL (source_trip_id)"],
      ["preferences", "FOREIGN KEY (user_id) REFERENCES users(id)"],
      ["stop_reviews", "FOREIGN KEY (created_by) REFERENCES users(id)"],
      ["stop_reviews", "FOREIGN KEY (organization_id) REFERENCES organizations(id)"],
      ["stop_reviews", "FOREIGN KEY (organization_id, trip_id) REFERENCES trips(organization_id, id)"],
    ]);
  });
});

describe("après le voyage (0026) : droits de vadrouille_app (S1)", () => {
  async function droits(table: string) {
    const { rows } = await app.query(
      `SELECT a.attname,
              pg_catalog.has_column_privilege('vadrouille_app', a.attrelid, a.attnum, 'INSERT') AS insertion,
              pg_catalog.has_column_privilege('vadrouille_app', a.attrelid, a.attnum, 'UPDATE') AS maj
       FROM pg_catalog.pg_attribute a
       WHERE a.attrelid = ('public.' || $1)::regclass AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attname`,
      [table],
    );
    const table_ = await app.query(
      `SELECT p AS privilege FROM unnest($2::text[]) AS p WHERE pg_catalog.has_table_privilege('vadrouille_app', 'public.' || $1, p)`,
      [table, ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]],
    );
    return {
      insertion: rows.filter((r) => r.insertion).map((r) => r.attname),
      maj: rows.filter((r) => r.maj).map((r) => r.attname),
      table: table_.rows.map((r) => r.privilege),
    };
  }

  it("avis : INSERT sans id, created_at ni updated_at ; UPDATE de la valeur, du dernier geste et de l'instant ; SELECT, DELETE", async () => {
    expect(await droits("stop_reviews")).toEqual({
      insertion: ["created_by", "opinion", "organization_id", "place_id", "request_id", "stop_id", "trip_id"],
      maj: ["opinion", "request_id", "updated_at"],
      table: ["SELECT", "DELETE"],
    });
  });

  it("goûts : INSERT sans id, consented_at ni created_at ; aucune mise à jour ; SELECT, DELETE", async () => {
    expect(await droits("preferences")).toEqual({
      insertion: ["category", "direction", "organization_id", "origin", "source_trip_id", "subject_kind", "user_id"],
      maj: [],
      table: ["SELECT", "DELETE"],
    });
  });

  it("INSERT d'un goût avec consented_at, created_at ou id explicite refusé (42501) ; UPDATE d'un goût refusé (42501)", async () => {
    const o = await organisation(app, auth);
    for (const [colonne, valeur] of [["consented_at", "now() - interval '1 day'"], ["created_at", "now()"], ["id", "gen_random_uuid()"]] as const) {
      expect(
        await codeSous(ctx(o), `INSERT INTO preferences (organization_id, user_id, subject_kind, origin, ${colonne}) VALUES ($1, $2, 'distance', 'confirmed', ${valeur})`, [o.org, o.owner]),
        colonne,
      ).toBe("42501");
    }
    expect(await countAs(app, ctx(o), "preferences")).toBe(0);
    expect(await codeSous(ctx(a), "UPDATE preferences SET origin = 'inferred' WHERE user_id = $1", [a.owner])).toBe("42501");
    expect(await codeSous(ctx(a), "UPDATE preferences SET source_trip_id = NULL WHERE user_id = $1", [a.owner])).toBe("42501");
  });

  it("INSERT d'un avis avec updated_at, created_at ou id explicite refusé (42501) ; UPDATE hors des trois colonnes refusé", async () => {
    for (const [colonne, valeur] of [["updated_at", "now()"], ["created_at", "now()"], ["id", "gen_random_uuid()"]] as const) {
      expect(
        await codeSous(
          ctx(a),
          `INSERT INTO stop_reviews (organization_id, trip_id, stop_id, opinion, created_by, request_id, ${colonne}) VALUES ($1, $2, 'droit', 'liked', $3, gen_random_uuid(), ${valeur})`,
          [a.org, a.trip, a.owner],
        ),
        colonne,
      ).toBe("42501");
    }
    for (const set of ["stop_id = 'autre'", "place_id = NULL", "trip_id = trip_id", "created_by = created_by", "created_at = now()"]) {
      expect(await codeSous(ctx(a), `UPDATE stop_reviews SET ${set} WHERE id = $1`, [avisA]), set).toBe("42501");
    }
  });
});

describe("après le voyage (0026) : avis (0160 § 1.1)", () => {
  it("rejeu au même request_id sans effet, updated_at compris ; un nouveau geste remplace la valeur ; le dernier geste l'emporte", async () => {
    const o = await organisation(app, auth);
    const geste1 = "00000000-0000-4000-8000-000000000001";
    const geste2 = "00000000-0000-4000-8000-000000000002";
    const lire = () =>
      inTx(app, ctx(o), async (c) => (await c.query("SELECT opinion, request_id, updated_at, created_at FROM stop_reviews WHERE trip_id = $1", [o.trip])).rows);
    expect(await inTx(app, ctx(o), async (c) => (await c.query(AVIS, [o.org, o.trip, "s1", PLACE, "liked", o.owner, geste1])).rowCount)).toBe(1);
    const [premier] = await lire();
    expect(await inTx(app, ctx(o), async (c) => (await c.query(AVIS, [o.org, o.trip, "s1", PLACE, "disliked", o.owner, geste1])).rowCount), "rejeu").toBe(0);
    expect(await lire()).toEqual([premier]);
    expect(await inTx(app, ctx(o), async (c) => (await c.query(AVIS, [o.org, o.trip, "s1", PLACE, "notDone", o.owner, geste2])).rowCount)).toBe(1);
    const [second] = await lire();
    expect(second).toMatchObject({ opinion: "notDone", request_id: geste2, created_at: premier.created_at });
    expect((second.updated_at as Date).getTime()).toBeGreaterThan((premier.updated_at as Date).getTime());
  });

  it("une ligne par étape et par lieu : même étape, autre lieu, nouvelle ligne ; étape sans lieu, une seule ligne", async () => {
    const o = await organisation(app, auth);
    await inTx(app, ctx(o), async (c) => {
      await c.query(INSERT_AVIS, [o.org, o.trip, "s1", PLACE, "liked", o.owner]);
      expect((await attempt(c, INSERT_AVIS, [o.org, o.trip, "s1", PLACE, "disliked", o.owner])).code, "même étape, même lieu").toBe("23505");
      expect((await attempt(c, INSERT_AVIS, [o.org, o.trip, "s1", "ChIJ-test-lieu-2", "disliked", o.owner])).code, "étape remplacée").toBeUndefined();
      expect((await attempt(c, INSERT_AVIS, [o.org, o.trip, "s2", null, "liked", o.owner])).code).toBeUndefined();
      expect((await attempt(c, INSERT_AVIS, [o.org, o.trip, "s2", null, "notDone", o.owner])).code, "étape sans lieu").toBe("23505");
    });
    expect(await countAs(app, ctx(o), "stop_reviews")).toBe(3);
  });

  it("CHECK : valeur dans STOP_RATINGS seulement", async () => {
    for (const valeur of ["not_done", "rating", "Liked", ""]) {
      expect(await codeSous(ctx(a), INSERT_AVIS, [a.org, a.trip, `check-${valeur}`, null, valeur, a.owner]), valeur).toBe("23514");
    }
  });

  it("effacer son avis : DELETE de sa ligne ; effacer sans ligne réussit sans rien faire", async () => {
    const o = await organisation(app, auth);
    await inTx(app, ctx(o), async (c) => {
      await c.query(INSERT_AVIS, [o.org, o.trip, "s1", PLACE, "liked", o.owner]);
      const efface = "DELETE FROM stop_reviews WHERE organization_id = $1 AND trip_id = $2 AND stop_id = $3 AND place_id IS NOT DISTINCT FROM $4";
      expect((await c.query(efface, [o.org, o.trip, "s1", PLACE])).rowCount).toBe(1);
      expect((await c.query(efface, [o.org, o.trip, "s1", PLACE])).rowCount).toBe(0);
    });
  });

  it("un autre membre de l'organisation lit l'avis mais ne le pose, ne le modifie ni ne l'efface pour la personne propriétaire", async () => {
    const membre = { org: a.org, user: a.members[0] };
    await inTx(app, membre, async (c) => {
      expect((await c.query("SELECT id FROM stop_reviews WHERE id = $1", [avisA])).rows).toEqual([{ id: avisA }]);
      expect((await attempt(c, INSERT_AVIS, [a.org, a.trip, "membre", null, "liked", a.owner])).code, "avis au nom d'un autre").toBe("42501");
      expect(await attempt(c, "UPDATE stop_reviews SET opinion = 'disliked' WHERE id = $1", [avisA])).toEqual({ rowCount: 0 });
      expect(await attempt(c, "DELETE FROM stop_reviews WHERE id = $1", [avisA])).toEqual({ rowCount: 0 });
    });
    const avis = await inTx(app, ctx(a), async (c) => (await c.query("SELECT opinion FROM stop_reviews WHERE id = $1", [avisA])).rows);
    expect(avis).toEqual([{ opinion: "liked" }]);
  });

  it("un avis ne vise jamais le voyage d'une autre organisation (23503) ; un voyage qui a un avis ne se supprime pas hors de la purge", async () => {
    expect(await codeSous(ctx(a), INSERT_AVIS, [a.org, b.trip, "croise", null, "liked", a.owner])).toBe("23503");
    await admin.query("BEGIN");
    try {
      expect((await attempt(admin, "DELETE FROM public.trips WHERE id = $1", [a.trip])).code).toBe("23503");
    } finally {
      await admin.query("ROLLBACK");
    }
  });
});

describe("après le voyage (0026) : goûts retenus (0160 § 1.3)", () => {
  it("un sujet au plus une fois par personne ; ON CONFLICT DO NOTHING garde la première origine ; distance unique aussi", async () => {
    const o = await organisation(app, auth);
    await inTx(app, ctx(o), async (c) => {
      await c.query(INSERT_GOUT, [o.org, o.owner, "category", "tasting", "more", "inferred", o.trip]);
      expect((await attempt(c, INSERT_GOUT, [o.org, o.owner, "category", "tasting", "more", "confirmed", null])).code).toBe("23505");
      expect((await c.query(`${INSERT_GOUT} ON CONFLICT DO NOTHING`, [o.org, o.owner, "category", "tasting", "more", "confirmed", null])).rowCount).toBe(0);
      expect((await attempt(c, INSERT_GOUT, [o.org, o.owner, "category", "tasting", "less", "confirmed", o.trip])).code, "autre sens").toBeUndefined();
      expect((await attempt(c, INSERT_GOUT, [o.org, o.owner, "distance", null, null, "confirmed", o.trip])).code).toBeUndefined();
      expect((await attempt(c, INSERT_GOUT, [o.org, o.owner, "distance", null, null, "confirmed", null])).code, "seconde distance").toBe("23505");
      const { rows } = await c.query("SELECT origin, source_trip_id FROM preferences WHERE category = 'tasting' AND direction = 'more'");
      expect(rows).toEqual([{ origin: "inferred", source_trip_id: o.trip }]);
    });
  });

  it("CHECK : nature, forme du sujet, catégorie de CATEGORIES, sens et origine fermés", async () => {
    const o = await organisation(app, auth);
    const cas: [string, string | null, string | null, string][] = [
      ["place", null, null, "confirmed"],
      ["category", null, null, "confirmed"],
      ["category", "museum", null, "confirmed"],
      ["category", null, "less", "confirmed"],
      ["distance", "museum", null, "confirmed"],
      ["distance", null, "less", "confirmed"],
      ["distance", "museum", "less", "confirmed"],
      ["category", "food", "less", "confirmed"],
      ["category", "Museum", "less", "confirmed"],
      ["category", "museum", "avoid", "confirmed"],
      ["category", "museum", "less", "brief"],
      ["distance", null, null, "gesture"],
    ];
    for (const [nature, categorie, sens, origine] of cas) {
      expect(await codeSous(ctx(o), INSERT_GOUT, [o.org, o.owner, nature, categorie, sens, origine, null]), `${nature} ${categorie} ${sens} ${origine}`).toBe("23514");
    }
    expect(await countAs(app, ctx(o), "preferences")).toBe(0);
  });

  it("consented_at posée par la base : l'instant de la transaction", async () => {
    const o = await organisation(app, auth);
    await inTx(app, ctx(o), async (c) => {
      const { rows } = await c.query(`${INSERT_GOUT} RETURNING consented_at = now() AS instant`, [o.org, o.owner, "distance", null, null, "confirmed", null]);
      expect(rows).toEqual([{ instant: true }]);
    });
  });

  it("par personne : un autre membre ne lit, ne pose ni ne retire le goût de la personne propriétaire ; il a les siens", async () => {
    const membre = { org: a.org, user: a.members[0] };
    await inTx(app, membre, async (c) => {
      expect((await c.query("SELECT count(*)::int AS n FROM preferences")).rows[0].n).toBe(0);
      expect((await attempt(c, INSERT_GOUT, [a.org, a.owner, "distance", null, null, "confirmed", null])).code, "goût au nom d'un autre").toBe("42501");
      expect(await attempt(c, "DELETE FROM preferences WHERE user_id = $1", [a.owner])).toEqual({ rowCount: 0 });
      expect((await attempt(c, INSERT_GOUT, [a.org, a.members[0], "category", "museum", "less", "confirmed", a.trip])).code, "même sujet, autre personne").toBeUndefined();
      expect((await c.query("SELECT user_id FROM preferences")).rows).toEqual([{ user_id: a.members[0] }]);
    });
    const { rows } = await inTx(app, ctx(a), (c) => c.query("SELECT user_id, category, direction FROM preferences"));
    expect(rows).toEqual([{ user_id: a.owner, category: "museum", direction: "less" }]);
  });

  it("le voyage d'origine reste dans l'organisation (23503) ; la personne est membre de l'organisation (23503)", async () => {
    expect(await codeSous(ctx(a), INSERT_GOUT, [a.org, a.owner, "category", "walk", "more", "inferred", b.trip])).toBe("23503");
    await admin.query("BEGIN");
    try {
      expect((await attempt(admin, `INSERT INTO public.${INSERT_GOUT.slice("INSERT INTO ".length)}`, [a.org, b.owner, "distance", null, null, "confirmed", null])).code).toBe("23503");
    } finally {
      await admin.query("ROLLBACK");
    }
  });

  it("un goût survit à son voyage d'origine : suppression du voyage, source_trip_id nul, organization_id intact (ON DELETE SET NULL (source_trip_id))", async () => {
    const o = await organisation(app, auth);
    const autre = await voyage(app, o);
    await inTx(app, ctx(o), (c) => c.query(INSERT_GOUT, [o.org, o.owner, "category", "nature", "more", "inferred", autre]));
    await admin.query("DELETE FROM public.trips WHERE id = $1", [autre]);
    const { rows } = await inTx(app, ctx(o), (c) => c.query("SELECT organization_id, user_id, category, source_trip_id FROM preferences"));
    expect(rows).toEqual([{ organization_id: o.org, user_id: o.owner, category: "nature", source_trip_id: null }]);
  });

  it("ordre de la liste : ORDER BY consented_at, subject_kind, category, direction (0160 § 1.3 point 7), sans horloge", async () => {
    const o = await organisation(app, auth);
    await inTx(app, ctx(o), async (c) => {
      for (const [categorie, sens] of [["tasting", "more"], ["museum", "more"], ["museum", "less"]] as const) {
        await c.query(INSERT_GOUT, [o.org, o.owner, "category", categorie, sens, "confirmed", o.trip]);
      }
      await c.query(INSERT_GOUT, [o.org, o.owner, "distance", null, null, "confirmed", o.trip]);
    });
    await inTx(app, ctx(o), (c) => c.query(INSERT_GOUT, [o.org, o.owner, "category", "heritage", "less", "inferred", o.trip]));
    const { rows } = await inTx(app, ctx(o), (c) =>
      c.query("SELECT subject_kind, category, direction FROM preferences ORDER BY consented_at, subject_kind, category, direction"),
    );
    expect(rows.map((r) => (r.subject_kind === "distance" ? "distance" : `category:${r.category}:${r.direction}`))).toEqual([
      "category:museum:less",
      "category:museum:more",
      "category:tasting:more",
      "distance",
      "category:heritage:less",
    ]);
  });
});

describe("après le voyage (0026) : isolation entre deux organisations", () => {
  const TABLES = [...REVIEW_TABLES, "preferences"] as const;

  it.each(TABLES)("%s : lecture croisée impossible ; sans contexte, aucune ligne", async (table) => {
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
        await expectRefused(c, INSERT_AVIS, [b.org, b.trip, "croise", null, "liked", b.owner]);
        await expectRefused(c, INSERT_GOUT, [b.org, b.owner, "distance", null, null, "confirmed", null]);
      });
    }
  });

  it("mise à jour et suppression croisées sans effet ; déplacement vers une autre organisation refusé", async () => {
    await inTx(app, ctx(a), async (c) => {
      await expectNoEffect(c, "UPDATE stop_reviews SET opinion = opinion WHERE id = $1", [avisB]);
      await expectNoEffect(c, "UPDATE stop_reviews SET opinion = 'disliked' WHERE organization_id = $1", [b.org]);
      await expectRefused(c, "UPDATE stop_reviews SET organization_id = $1 WHERE id = $2", [b.org, avisA]);
      await expectNoEffect(c, "UPDATE preferences SET organization_id = organization_id WHERE organization_id = $1", [b.org]);
      for (const table of TABLES) {
        await expectNoEffect(c, `DELETE FROM ${table} WHERE organization_id = $1`, [b.org]);
        await expectRefused(c, `TRUNCATE ${table}`);
      }
    });
    for (const table of TABLES) expect(await countAs(app, ctx(b), table), table).toBe(1);
  });

  it("vadrouille_owner (pris par vadrouille_migrator) lit zéro ligne, même avec le contexte d'une organisation remplie", async () => {
    const migrator = await connect("migrator");
    await migrator.query("BEGIN");
    try {
      await migrator.query("SET LOCAL ROLE vadrouille_owner");
      await migrator.query("SELECT set_config('app.organization_id', $1, true), set_config('app.user_id', $2, true)", [a.org, a.owner]);
      for (const table of TABLES) {
        expect(Number((await migrator.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n), table).toBe(0);
      }
    } finally {
      await migrator.query("ROLLBACK");
    }
  });
});

describe("après le voyage (0026) : purge du compte", () => {
  it("la purge vide avis et goûts, puis le voyage, sans toucher une autre organisation", async () => {
    const o = await organisation(app, auth);
    await peupler(app, o);
    await inTx(app, ctx(o), (c) => c.query(INSERT_AVIS, [o.org, o.trip, "s2", null, "notDone", o.owner]));
    const avantB = { avis: await countAs(app, ctx(b), "stop_reviews"), gouts: await countAs(app, ctx(b), "preferences") };
    await inTx(app, ctx(o), (c) => c.query("SELECT purge_organization_data($1)", [o.org]), "vadrouille_account_admin");
    const reste = await admin.query(
      "SELECT (SELECT count(*)::int FROM public.stop_reviews WHERE organization_id = $1) AS avis, (SELECT count(*)::int FROM public.preferences WHERE organization_id = $1) AS gouts, (SELECT count(*)::int FROM public.trips WHERE organization_id = $1) AS voyages",
      [o.org],
    );
    expect(reste.rows[0]).toEqual({ avis: 0, gouts: 0, voyages: 0 });
    expect({ avis: await countAs(app, ctx(b), "stop_reviews"), gouts: await countAs(app, ctx(b), "preferences") }).toEqual(avantB);
  });
});

const UP_0026 = readFileSync(path.join(process.cwd(), "db/migrations/0026_apres_voyage.sql"), "utf8");
const DOWN_0026 = readFileSync(path.join(process.cwd(), "db/migrations/0026_apres_voyage.down.sql"), "utf8");

describe("0026 : montée, descente, montée (base jetable ; 0160 § 1.3 point 8)", () => {
  it("descente refusée dès qu'une ligne existe (rien modifié) ; sur tables vides, schéma de 0025 ; texte de 0026 rejoué", async () => {
    const nom = await creerBase("apres_voyage_retour");
    await runMigrations({ VADROUILLE_DATABASE_URL_MIGRATOR: urlBaseJetable("migrator", nom) });
    const [appJ, authJ, adminJ, migrateur] = await Promise.all([
      connectBaseJetable("app", nom),
      connectBaseJetable("auth", nom),
      connectBaseJetable("admin", nom),
      connectBaseJetable("migrator", nom),
    ]);
    const o = await organisation(appJ, authJ);
    const etat = async () =>
      (
        await adminJ.query(
          `SELECT pg_catalog.to_regclass('public.stop_reviews') IS NOT NULL AS avis,
                  (SELECT string_agg(column_name, ',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'preferences') AS colonnes,
                  (SELECT string_agg(column_name || ':' || is_nullable || ':' || coalesce(column_default, ''), ',' ORDER BY column_name COLLATE "C") FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'preferences' AND column_name IN ('category', 'consented_at')) AS nullabilite,
                  (SELECT string_agg(conname, ',' ORDER BY conname COLLATE "C") FROM pg_catalog.pg_constraint WHERE conrelid = 'public.preferences'::regclass AND contype IN ('c', 'f')) AS contraintes,
                  (SELECT string_agg(indexname, ',' ORDER BY indexname COLLATE "C") FROM pg_catalog.pg_indexes WHERE schemaname = 'public' AND tablename = 'preferences') AS index,
                  (SELECT string_agg(policyname, ',' ORDER BY policyname COLLATE "C") FROM pg_catalog.pg_policies WHERE tablename = 'preferences') AS politiques,
                  (SELECT string_agg(p, ',' ORDER BY p COLLATE "C") FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) AS p WHERE pg_catalog.has_table_privilege('vadrouille_app', 'public.preferences', p)) AS droits_table,
                  pg_catalog.has_column_privilege('vadrouille_app', 'public.preferences', 'consented_at', 'INSERT') AS insertion_instant,
                  pg_catalog.pg_get_functiondef('public.purge_organization_data(uuid)'::regprocedure) LIKE '%stop_reviews%' AS purge_avis,
                  pg_catalog.pg_get_functiondef('public.purge_organization_data(uuid)'::regprocedure) LIKE '%reminder_sends%' AS purge_0024,
                  (SELECT count(*)::int FROM pg_catalog.pg_auth_members m
                   WHERE m.roleid = 'vadrouille_fn_purge'::regrole AND m.member = 'vadrouille_migrator'::regrole AND (m.set_option OR m.inherit_option)) AS appartenance`,
        )
      ).rows[0];
    const monte = {
      avis: true,
      colonnes: "id,organization_id,user_id,category,consented_at,created_at,subject_kind,direction,origin,source_trip_id",
      nullabilite: "category:YES:,consented_at:NO:now()",
      contraintes:
        "preferences_category_check,preferences_direction_check,preferences_membership_fk,preferences_organization_id_organizations_id_fk,preferences_origin_check,preferences_source_trip_fk,preferences_subject_check,preferences_subject_kind_check,preferences_user_id_users_id_fk",
      index: "preferences_organization_id_user_id_idx,preferences_pkey,preferences_subject_idx",
      politiques: "preferences_app_delete,preferences_app_insert,preferences_app_select,preferences_fn_purge",
      droits_table: "DELETE,SELECT",
      insertion_instant: false,
      purge_avis: true,
      purge_0024: true,
      appartenance: 0,
    };
    // Forme de B1 (0000, 0001), `value` en dernière colonne ; purge de 0024.
    const descendu = {
      avis: false,
      colonnes: "id,organization_id,user_id,category,consented_at,created_at,value",
      nullabilite: "category:NO:,consented_at:NO:",
      contraintes: "preferences_organization_id_organizations_id_fk,preferences_user_id_users_id_fk",
      index: "preferences_organization_id_user_id_idx,preferences_pkey",
      politiques: "preferences_app,preferences_fn_purge",
      droits_table: "DELETE,INSERT,SELECT,UPDATE",
      insertion_instant: true,
      purge_avis: false,
      purge_0024: true,
      appartenance: 0,
    };
    expect(await etat()).toEqual(monte);
    /** Descente dans une transaction du migrateur ; code SQLSTATE si elle échoue (transaction annulée). */
    const descendre = async (): Promise<string | undefined> => {
      await migrateur.query("BEGIN");
      try {
        await migrateur.query(DOWN_0026);
        expect((await migrateur.query("SELECT current_user::text AS u")).rows[0].u).toBe("vadrouille_migrator");
        await migrateur.query("COMMIT");
        return undefined;
      } catch (e) {
        await migrateur.query("ROLLBACK");
        return (e as { code?: string }).code;
      }
    };
    const monter = async (): Promise<string | undefined> => {
      await migrateur.query("BEGIN");
      try {
        await migrateur.query(UP_0026);
        await migrateur.query("COMMIT");
        return undefined;
      } catch (e) {
        await migrateur.query("ROLLBACK");
        return (e as { code?: string }).code;
      }
    };

    // 1. Un goût « distance » seul : descente refusée, goût et schéma intacts.
    await inTx(appJ, ctx(o), (c) => c.query(INSERT_GOUT, [o.org, o.owner, "distance", null, null, "confirmed", null]));
    expect(await descendre()).toBe("55000");
    expect(await etat()).toEqual(monte);
    expect(await countAs(appJ, ctx(o), "preferences")).toBe(1);
    // Ligne de test retirée par l'administration de la base jetable, pour éprouver la garde des avis seule.
    await adminJ.query("DELETE FROM public.preferences WHERE organization_id = $1", [o.org]);

    // 2. Un avis seul : descente refusée, avis intact.
    await inTx(appJ, ctx(o), (c) => c.query(INSERT_AVIS, [o.org, o.trip, "s1", PLACE, "liked", o.owner]));
    expect(await descendre()).toBe("55000");
    expect(await etat()).toEqual(monte);
    expect(await countAs(appJ, ctx(o), "stop_reviews")).toBe(1);
    await adminJ.query("DELETE FROM public.stop_reviews WHERE organization_id = $1", [o.org]);

    // 3. Tables vides : descente jusqu'au schéma de 0025 ; la purge de 0024 passe.
    expect(await descendre()).toBeUndefined();
    expect(await etat()).toEqual(descendu);
    await inTx(appJ, ctx(o), (c) => c.query("SELECT purge_organization_data($1)", [o.org]), "vadrouille_account_admin");

    // 4. Texte de 0026 refusé si `preferences` n'est pas vide (ligne de B1) : rien modifié.
    const p = await organisation(appJ, authJ);
    await inTx(appJ, ctx(p), (c) =>
      c.query("INSERT INTO preferences (organization_id, user_id, category, value, consented_at) VALUES ($1, $2, 'museum', 'like', now())", [p.org, p.owner]),
    );
    expect(await monter()).toBe("55000");
    expect(await etat()).toEqual(descendu);
    expect(await countAs(appJ, ctx(p), "preferences")).toBe(1);
    await adminJ.query("DELETE FROM public.preferences WHERE organization_id = $1", [p.org]);

    // 5. Texte de 0026 rejoué : même état qu'à la montée ; écritures de M8 à nouveau possibles.
    expect(await monter()).toBeUndefined();
    expect(await etat()).toEqual(monte);
    await inTx(appJ, ctx(p), async (c) => {
      await c.query(INSERT_AVIS, [p.org, p.trip, "s1", PLACE, "liked", p.owner]);
      await c.query(INSERT_GOUT, [p.org, p.owner, "category", "market", "more", "inferred", p.trip]);
    });
    await inTx(appJ, ctx(p), (c) => c.query("SELECT purge_organization_data($1)", [p.org]), "vadrouille_account_admin");
    const reste = await adminJ.query("SELECT (SELECT count(*)::int FROM public.stop_reviews) + (SELECT count(*)::int FROM public.preferences) AS lignes");
    expect(reste.rows[0].lignes).toBe(0);
  });
});
