import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PROTOTYPE_USER_ID } from "@/adapters/context";
import { CandidatSchema } from "@/prototype/candidat";
import { PROTOTYPE_ORG_ID } from "@/prototype/programme-reduit";
import { jourDeQuotaGoogle } from "@/server/usage/periodes";

import { INSTANTS_JOUR_GOOGLE } from "../support/instants-d20";
import { attempt, closeAll, connect, createOrg, type DbClient, expectRefused, inTx, type Org, poserExecution, unique } from "./helpers";

/**
 * Base du prototype (décision 0046 : D15, D16, D24, exigences S1 à S3 et S8 ; spécification `specs/P0-suite-2.md`,
 * P0r2). Chaque test se connecte avec le rôle qu'il éprouve. La connexion d'administration (superutilisateur du
 * conteneur) sert à prouver un refus (S3 : même elle ne supprime pas `org_prototype`) et à **poser des lignes
 * expirées ou datées** que l'horloge de la base ne permet pas d'attendre : `session_replication_role = replica`
 * désactive les déclencheurs de la seule transaction d'administration qui les écrit. Aucune vérification d'isolation
 * ne s'exécute en superutilisateur.
 */

const RACINE = fileURLToPath(new URL("../../", import.meta.url));
const MIGRATION_PROTOTYPE = readFileSync(path.join(RACINE, "db/migrations/0003_prototype.sql"), "utf8");
const MIGRATION_COORDONNEES = readFileSync(path.join(RACINE, "db/migrations/0002_place_coordinates.sql"), "utf8");

const TABLES = ["runs", "forfaits", "programmes", "jugements", "run_attempts", "run_candidates", "purges"] as const;
const SHA = "a".repeat(40);
const SIGNATURE_POSITIONS = "store_prototype_coordinates(uuid,text,double precision,double precision)";
const CANDIDAT = { id: "c_001", nom: "Musée", resume: "Un musée.", aReserver: false };

let admin: DbClient;
let app: DbClient;
let auth: DbClient;
let proto: DbClient;
let purge: DbClient;
let a: Org;

/** Jour de quota passé, distinct pour chaque exécution posée par l'administration (index « une par jour »). */
let jourPasse = 0;
const prochainJourPasse = () => {
  jourPasse += 1;
  return `2001-01-01'::date + ${Math.floor(Math.random() * 5000) * 3 + jourPasse} * interval '1 day`;
};

/**
 * Lignes datées posées par l'administration, déclencheurs désactivés pour cette seule transaction (validée) :
 * exécution terminée d'un jour passé, et, sur demande, programme, jugement, essai, candidat aux expirations voulues.
 */
async function poserDate(expiration: "vivante" | "expiree"): Promise<{ run: string; programme: string; jugement: string; attempt: string; candidat: string }> {
  const expires = expiration === "vivante" ? "pg_catalog.now() + interval '1 day'" : "pg_catalog.now() - interval '1 hour'";
  await admin.query("BEGIN");
  try {
    await admin.query("SET LOCAL session_replication_role = replica");
    const run = (
      await admin.query(
        `INSERT INTO prototype.runs (organization_id, quota_day, mode, brief, variant, status, started_at, commit_sha)
         VALUES ($1, ('${prochainJourPasse()}')::date, 'essai', 'brief-test.json', 'A', 'programme_ecrit', pg_catalog.now() - interval '30 days', $2) RETURNING id`,
        [PROTOTYPE_ORG_ID, SHA],
      )
    ).rows[0].id as string;
    const programme = (
      await admin.query(
        `INSERT INTO prototype.programmes (organization_id, run_id, contenu, expires_at) VALUES ($1, $2, '{"schema": 1}', ${expires}) RETURNING id`,
        [PROTOTYPE_ORG_ID, run],
      )
    ).rows[0].id as string;
    const jugement = (
      await admin.query(
        `INSERT INTO prototype.jugements (organization_id, programme_id, reponses, expires_at)
         SELECT $1, p.id, '{"a1": true}', p.expires_at FROM prototype.programmes p WHERE p.id = $2 RETURNING id`,
        [PROTOTYPE_ORG_ID, programme],
      )
    ).rows[0].id as string;
    const essai = (
      await admin.query(`INSERT INTO prototype.run_attempts (organization_id, resultat, expires_at) VALUES ($1, 'accepte', ${expires}) RETURNING id`, [
        PROTOTYPE_ORG_ID,
      ])
    ).rows[0].id as string;
    const candidat = (
      await admin.query(
        `INSERT INTO prototype.run_candidates (organization_id, run_id, cle, candidat, expires_at) VALUES ($1, $2, 'c_001', $3, ${expires}) RETURNING id`,
        [PROTOTYPE_ORG_ID, run, CANDIDAT],
      )
    ).rows[0].id as string;
    await admin.query("COMMIT");
    return { run, programme, jugement, attempt: essai, candidat };
  } catch (error) {
    await admin.query("ROLLBACK");
    throw error;
  }
}

/** Coordonnée posée par l'administration (déclencheurs et RLS hors jeu), vivante ou expirée, validée. */
async function poserCoordonnee(org: string, expiration: "vivante" | "expiree"): Promise<string> {
  const placeId = `ChIJtest${unique()}`;
  const [fetched, expires] =
    expiration === "vivante" ? ["pg_catalog.now()", "pg_catalog.now() + interval '1 day'"] : ["pg_catalog.now() - interval '2 days'", "pg_catalog.now() - interval '1 day'"];
  await admin.query(
    `INSERT INTO public.place_coordinates (organization_id, place_id, lat, lng, fetched_at, expires_at) VALUES ($1, $2, 55.95, -3.19, ${fetched}, ${expires})`,
    [org, placeId],
  );
  return placeId;
}

const compter = async (sql: string, params: unknown[] = []) => Number((await admin.query(sql, params)).rows[0].n);

/** Transaction toujours annulée, avec le contexte posé comme le fera l'adaptateur (0046 D15 point 5) ou un autre. */
async function annulee<T>(client: DbClient, org: string, fn: (c: DbClient) => Promise<T>): Promise<T> {
  await client.query("BEGIN");
  try {
    await client.query("SELECT set_config('app.organization_id', $1, true)", [org]);
    return await fn(client);
  } finally {
    await client.query("ROLLBACK");
  }
}

beforeAll(async () => {
  admin = await connect("admin");
  app = await connect("app");
  auth = await connect("auth");
  proto = await connect("p0");
  purge = await connect("p0_purge");
  a = await createOrg(auth);
});

afterAll(closeAll);

describe("org_prototype (0046 D15 point 4, S3)", () => {
  it("base: uuid d'org_prototype et de l'utilisateur technique égaux dans le code et la migration", async () => {
    const org = await auth.query("SELECT id::text, slug, kind FROM public.organizations WHERE id = $1", [PROTOTYPE_ORG_ID]);
    expect(org.rows).toEqual([{ id: PROTOTYPE_ORG_ID, slug: "org-prototype", kind: "personal" }]);
    const user = await auth.query("SELECT id::text, email FROM public.users WHERE id = $1", [PROTOTYPE_USER_ID]);
    expect(user.rows).toEqual([{ id: PROTOTYPE_USER_ID, email: "org-prototype@vadrouille.invalid" }]);
    // Les deux migrations écrivent les mêmes uuid que le code, et aucun autre uuid du préfixe 5e1f0000.
    for (const texte of [MIGRATION_PROTOTYPE, MIGRATION_COORDONNEES]) {
      const uuids = new Set([...texte.matchAll(/5e1f0000-0000-4000-8000-[0-9a-f]{12}/g)].map((m) => m[0]));
      expect([...uuids].every((u) => u === PROTOTYPE_ORG_ID || u === PROTOTYPE_USER_ID)).toBe(true);
    }
    expect(MIGRATION_PROTOTYPE).toContain(PROTOTYPE_ORG_ID);
    expect(MIGRATION_PROTOTYPE).toContain(PROTOTYPE_USER_ID);
    // Le code du port Neon reprend la même constante (il n'importe pas src/prototype).
    expect(readFileSync(path.join(RACINE, "src/server/usage/neon.ts"), "utf8")).toContain(`"${PROTOTYPE_ORG_ID}"`);
  });

  it("base: org_prototype a un seul propriétaire technique, sans compte ni session", async () => {
    const membres = await auth.query("SELECT user_id::text, role FROM public.memberships WHERE organization_id = $1", [PROTOTYPE_ORG_ID]);
    expect(membres.rows).toEqual([{ user_id: PROTOTYPE_USER_ID, role: "owner" }]);
    const adhesions = await auth.query("SELECT organization_id::text FROM public.memberships WHERE user_id = $1", [PROTOTYPE_USER_ID]);
    expect(adhesions.rows).toEqual([{ organization_id: PROTOTYPE_ORG_ID }]);
    expect(Number((await auth.query("SELECT count(*) AS n FROM public.accounts WHERE user_id = $1", [PROTOTYPE_USER_ID])).rows[0].n)).toBe(0);
    expect(Number((await auth.query("SELECT count(*) AS n FROM public.sessions WHERE user_id = $1", [PROTOTYPE_USER_ID])).rows[0].n)).toBe(0);
  });

  it("base: org_prototype et son utilisateur technique ne peuvent pas être supprimés (vadrouille_auth et administration compris)", async () => {
    for (const client of [auth, admin]) {
      await client.query("BEGIN");
      try {
        await expectRefused(client, "DELETE FROM public.memberships WHERE organization_id = $1", [PROTOTYPE_ORG_ID]);
        await expectRefused(client, "DELETE FROM public.organizations WHERE id = $1", [PROTOTYPE_ORG_ID]);
        await expectRefused(client, "DELETE FROM public.users WHERE id = $1", [PROTOTYPE_USER_ID]);
        await expectRefused(client, "UPDATE public.users SET email_verified = email_verified WHERE id = $1", [PROTOTYPE_USER_ID]);
      } finally {
        await client.query("ROLLBACK");
      }
    }
    await admin.query("BEGIN");
    try {
      await expectRefused(admin, "UPDATE public.organizations SET name = 'autre' WHERE id = $1", [PROTOTYPE_ORG_ID]);
      // Une purge de compte visant org_prototype échoue sans rien supprimer (S3 ; B8 reprend l'exclusion).
      await expectRefused(admin, "SELECT public.purge_organization_data($1)", [PROTOTYPE_ORG_ID]);
    } finally {
      await admin.query("ROLLBACK");
    }
    expect(await compter("SELECT count(*) AS n FROM public.organizations WHERE id = $1", [PROTOTYPE_ORG_ID])).toBe(1);
    // Une autre organisation reste supprimable (le déclencheur ne vise que les identités du prototype).
    await auth.query("BEGIN");
    try {
      const autre = await attempt(auth, "DELETE FROM public.memberships WHERE organization_id = $1", [a.org]);
      expect(autre.code).toBeUndefined();
    } finally {
      await auth.query("ROLLBACK");
    }
  });
});

describe("droits du prototype (0046 D15 points 6 et 7)", () => {
  it("base: vadrouille_app n'a aucun droit sur le schéma prototype", async () => {
    const { rows } = await app.query(
      "SELECT pg_catalog.has_schema_privilege('vadrouille_app', 'prototype', 'USAGE') AS usage, pg_catalog.has_schema_privilege('vadrouille_app', 'prototype', 'CREATE') AS create",
    );
    expect(rows[0]).toEqual({ usage: false, create: false });
    await inTx(app, { org: PROTOTYPE_ORG_ID }, async (c) => {
      for (const table of TABLES) await expectRefused(c, `SELECT * FROM prototype.${table}`);
      await expectRefused(c, "SELECT prototype.quota_day_at(pg_catalog.now())");
      await expectRefused(c, "SELECT prototype.purge_expired()");
    });
  });

  it("base: vadrouille_prototype n'a aucun droit sur usage_ledger ni organizations", async () => {
    for (const table of ["usage_ledger", "organizations", "memberships", "users", "trips"]) {
      const { rows } = await proto.query(
        `SELECT bool_or(pg_catalog.has_table_privilege('vadrouille_prototype', 'public.' || $1, p)) AS any,
                pg_catalog.has_any_column_privilege('vadrouille_prototype', ('public.' || $1)::regclass, 'SELECT, INSERT, UPDATE, REFERENCES') AS columns
         FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) AS p`,
        [table],
      );
      expect(rows[0], table).toEqual({ any: false, columns: false });
    }
    await inTx(proto, { org: PROTOTYPE_ORG_ID }, async (c) => {
      await expectRefused(c, "SELECT count(*) FROM public.usage_ledger");
      await expectRefused(c, "SELECT count(*) FROM public.organizations");
      await expectRefused(
        c,
        "INSERT INTO public.usage_ledger (organization_id, step, provider, sku, units, cost_estimate_micros) VALUES ($1, 'b', 'modeles', 'x', 1, 1)",
        [PROTOTYPE_ORG_ID],
      );
    });
  });

  it("base: vadrouille_prototype ne supprime ni ne prolonge aucune ligne de programmes, jugements et run_attempts", async () => {
    const vivantes = await poserDate("vivante");
    const expirees = await poserDate("expiree");
    for (const table of ["programmes", "jugements", "run_attempts", "runs", "forfaits"]) {
      const { rows } = await proto.query(
        `SELECT pg_catalog.has_table_privilege('vadrouille_prototype', 'prototype.' || $1, 'DELETE') AS delete,
                pg_catalog.has_any_column_privilege('vadrouille_prototype', ('prototype.' || $1)::regclass, 'UPDATE') AS update`,
        [table],
      );
      expect(rows[0], table).toEqual({ delete: false, update: table === "runs" });
    }
    await inTx(proto, { org: PROTOTYPE_ORG_ID }, async (c) => {
      for (const lignes of [vivantes, expirees]) {
        await expectRefused(c, "DELETE FROM prototype.programmes WHERE id = $1", [lignes.programme]);
        await expectRefused(c, "DELETE FROM prototype.jugements WHERE id = $1", [lignes.jugement]);
        await expectRefused(c, "DELETE FROM prototype.run_attempts WHERE id = $1", [lignes.attempt]);
        await expectRefused(c, "UPDATE prototype.programmes SET expires_at = pg_catalog.now() + interval '1 year' WHERE id = $1", [lignes.programme]);
        await expectRefused(c, "UPDATE prototype.jugements SET expires_at = pg_catalog.now() + interval '1 year' WHERE id = $1", [lignes.jugement]);
        await expectRefused(c, "UPDATE prototype.run_attempts SET expires_at = pg_catalog.now() + interval '1 year' WHERE id = $1", [lignes.attempt]);
        await expectRefused(c, "DELETE FROM prototype.runs WHERE id = $1", [lignes.run]);
      }
    });
    expect(await compter("SELECT count(*) AS n FROM prototype.programmes WHERE id = ANY($1::uuid[])", [[vivantes.programme, expirees.programme]])).toBe(2);
  });

  it("base: vadrouille_prototype ne lit aucune ligne expirée", async () => {
    const vivantes = await poserDate("vivante");
    const expirees = await poserDate("expiree");
    const vivante = await poserCoordonnee(PROTOTYPE_ORG_ID, "vivante");
    const expiree = await poserCoordonnee(PROTOTYPE_ORG_ID, "expiree");
    await inTx(proto, { org: PROTOTYPE_ORG_ID }, async (c) => {
      for (const [table, cle] of [
        ["programmes", "programme"],
        ["jugements", "jugement"],
        ["run_attempts", "attempt"],
        ["run_candidates", "candidat"],
      ] as const) {
        expect((await c.query(`SELECT id FROM prototype.${table} WHERE id = $1`, [vivantes[cle]])).rows.length, `${table} vivante`).toBe(1);
        expect((await c.query(`SELECT id FROM prototype.${table} WHERE id = $1`, [expirees[cle]])).rows.length, `${table} expirée`).toBe(0);
      }
      const coords = await c.query("SELECT place_id FROM public.place_coordinates WHERE place_id = ANY($1::text[])", [[vivante, expiree]]);
      expect(coords.rows.map((r) => r.place_id)).toEqual([vivante]);
    });
  });
});

describe("S1 : valeurs posées par la base (0046)", () => {
  it("base: valeurs fournies par l'appelant refusées ou ignorées", async () => {
    // 1. vadrouille_prototype ne peut pas les fournir : les colonnes manquent à ses droits INSERT (refus 42501).
    const interdites: Record<string, string[]> = {
      runs: ["id", "organization_id", "quota_day", "started_at"],
      forfaits: ["id", "organization_id", "quota_day", "created_at"],
      programmes: ["id", "organization_id", "expires_at"],
      jugements: ["id", "organization_id", "expires_at"],
      run_attempts: ["id", "organization_id", "created_at", "expires_at"],
      run_candidates: ["id", "organization_id", "expires_at"],
    };
    await proto.query("BEGIN");
    try {
      for (const [table, colonnes] of Object.entries(interdites)) {
        for (const colonne of colonnes) {
          const valeur =
            colonne === "organization_id" ? `'${a.org}'::uuid` : colonne === "id" ? `'${randomUUID()}'::uuid` : colonne === "quota_day" ? "CURRENT_DATE + 2" : "pg_catalog.now() + interval '1 year'";
          await expectRefused(proto, `INSERT INTO prototype.${table} (${colonne}) VALUES (${valeur})`);
        }
      }
    } finally {
      await proto.query("ROLLBACK");
    }

    // 2. Même fournies par un rôle qui le pourrait (administration), elles sont écrasées par les déclencheurs.
    await admin.query("BEGIN");
    try {
      const run = await admin.query(
        `INSERT INTO prototype.runs (id, organization_id, quota_day, mode, brief, variant, started_at, commit_sha)
         VALUES ($1, $2, prototype.quota_day_at(pg_catalog.now()) + 2, 'essai', 'brief-test.json', 'A', pg_catalog.now() + interval '1 year', $3)
         RETURNING id::text, organization_id::text, quota_day::text, started_at = pg_catalog.now() AS started_now,
                   quota_day = prototype.quota_day_at(pg_catalog.now()) AS jour_base`,
        [PROTOTYPE_ORG_ID.replace(/1$/, "9"), a.org, SHA],
      );
      const r = run.rows[0];
      expect(r.id).not.toBe(PROTOTYPE_ORG_ID.replace(/1$/, "9"));
      expect(r).toMatchObject({ organization_id: PROTOTYPE_ORG_ID, started_now: true, jour_base: true });
      for (const decalage of [2, -2]) {
        const f = await admin.query(
          `INSERT INTO prototype.forfaits (organization_id, nature, quota_day, text_search_requests, place_details_requests, routes_requests, routes_elements, google_cost_micros, created_at)
           VALUES ($1, 'relecture', prototype.quota_day_at(pg_catalog.now()) + $2::int, 0, 0, 1, 1, 1, pg_catalog.now() - interval '40 days')
           RETURNING organization_id::text, quota_day = prototype.quota_day_at(pg_catalog.now()) AS jour_base, created_at = pg_catalog.now() AS cree_maintenant`,
          [a.org, decalage],
        );
        expect(f.rows[0], `quota_day ${decalage}`).toEqual({ organization_id: PROTOTYPE_ORG_ID, jour_base: true, cree_maintenant: true });
      }
      const p = await admin.query(
        `INSERT INTO prototype.programmes (organization_id, run_id, contenu, expires_at) VALUES ($1, $2, '{"schema": 1}', pg_catalog.now() + interval '10 years')
         RETURNING id, organization_id::text, expires_at = (SELECT started_at FROM prototype.runs WHERE id = $2) + interval '29 days' AS expiration_29`,
        [a.org, r.id],
      );
      expect(p.rows[0]).toMatchObject({ organization_id: PROTOTYPE_ORG_ID, expiration_29: true });
      const j = await admin.query(
        `INSERT INTO prototype.jugements (organization_id, programme_id, reponses, expires_at) VALUES ($1, $2, '{}', pg_catalog.now() + interval '10 years')
         RETURNING organization_id::text, expires_at = (SELECT expires_at FROM prototype.programmes WHERE id = $2) AS copie`,
        [a.org, p.rows[0].id],
      );
      expect(j.rows[0]).toEqual({ organization_id: PROTOTYPE_ORG_ID, copie: true });
      const e = await admin.query(
        `INSERT INTO prototype.run_attempts (organization_id, resultat, created_at, expires_at) VALUES ($1, 'refuse', pg_catalog.now() - interval '1 day', pg_catalog.now() + interval '10 years')
         RETURNING organization_id::text, created_at = pg_catalog.now() AS cree, expires_at = pg_catalog.now() + interval '24 hours' AS expiration`,
        [a.org],
      );
      expect(e.rows[0]).toEqual({ organization_id: PROTOTYPE_ORG_ID, cree: true, expiration: true });
      const c = await admin.query(
        `INSERT INTO prototype.run_candidates (organization_id, run_id, cle, candidat, expires_at) VALUES ($1, $2, 'c_002', $3, pg_catalog.now() + interval '10 years')
         RETURNING organization_id::text, expires_at = pg_catalog.now() + interval '24 hours' AS expiration`,
        [a.org, r.id, CANDIDAT],
      );
      expect(c.rows[0]).toEqual({ organization_id: PROTOTYPE_ORG_ID, expiration: true });
    } finally {
      await admin.query("ROLLBACK");
    }
  });

  it("p0: positions et programmes expirent à 29 jours ; un jugement porte l'expiration de son programme", async () => {
    await proto.query("BEGIN");
    try {
      await proto.query("SELECT set_config('app.organization_id', $1, true)", [PROTOTYPE_ORG_ID]);
      const run = (await proto.query("INSERT INTO prototype.runs (mode, brief, variant, commit_sha) VALUES ('essai', 'brief-test.json', 'B', $1) RETURNING id", [SHA])).rows[0];
      const p = await proto.query(
        `INSERT INTO prototype.programmes (run_id, contenu) VALUES ($1, '{"schema": 1, "trip": {}, "proposals": [], "terminus": []}')
         RETURNING id, expires_at - (SELECT r.started_at FROM prototype.runs r WHERE r.id = $1) = interval '29 days' AS a29`,
        [run.id],
      );
      expect(p.rows[0].a29).toBe(true);
      const j = await proto.query(
        "INSERT INTO prototype.jugements (programme_id, reponses) VALUES ($1, '{}') RETURNING expires_at - (SELECT r.started_at FROM prototype.runs r WHERE r.id = $2) = interval '29 days' AS a29",
        [p.rows[0].id, run.id],
      );
      expect(j.rows[0].a29).toBe(true);
      // Aucune colonne de position dans le programme (Q324, option a) : la base refuse une clé `positions`.
      expect((await attempt(proto, `INSERT INTO prototype.programmes (run_id, contenu) VALUES ($1, '{"positions": []}')`, [run.id])).code).toBe("23514");
    } finally {
      await proto.query("ROLLBACK");
    }
    // Positions : store_prototype_coordinates pose 29 jours depuis le début de l'exécution (appelée par l'administration ;
    // forme à quatre paramètres de 0052 § 1.7, tests détaillés dans positions-prototype.test.ts).
    await admin.query("BEGIN");
    try {
      const placeId = `ChIJtest${unique()}`;
      const runId = await poserExecution(admin, { organisation: PROTOTYPE_ORG_ID });
      await admin.query("SELECT public.store_prototype_coordinates($1, $2, 55.95, -3.19)", [runId, placeId]);
      const { rows } = await admin.query("SELECT expires_at - fetched_at = interval '29 days' AS a29 FROM public.place_coordinates WHERE place_id = $1", [placeId]);
      expect(rows).toEqual([{ a29: true }]);
    } finally {
      await admin.query("ROLLBACK");
    }
  });
});

describe("S2 et S8 : coordonnées du prototype (0046)", () => {
  it("base: vadrouille_prototype avec un autre app.organization_id ne lit ni n'écrit hors d'org_prototype", async () => {
    const placeA = await poserCoordonnee(a.org, "vivante");
    const placeProto = await poserCoordonnee(PROTOTYPE_ORG_ID, "vivante");
    const lignes = await poserDate("vivante");
    await annulee(proto, a.org, async (c) => {
      const coords = await c.query("SELECT organization_id::text, place_id FROM public.place_coordinates WHERE place_id = ANY($1::text[])", [[placeA, placeProto]]);
      expect(coords.rows).toEqual([{ organization_id: PROTOTYPE_ORG_ID, place_id: placeProto }]);
      for (const table of TABLES.filter((t) => t !== "purges")) {
        const autres = await c.query(`SELECT count(*) AS n FROM prototype.${table} WHERE organization_id <> $1`, [PROTOTYPE_ORG_ID]);
        expect(Number(autres.rows[0].n), table).toBe(0);
      }
      expect((await c.query("SELECT id FROM prototype.programmes WHERE id = $1", [lignes.programme])).rows.length).toBe(1);
      // Une exécution insérée avec le contexte d'une autre organisation appartient quand même à org_prototype.
      const run = await c.query("INSERT INTO prototype.runs (mode, brief, variant, commit_sha) VALUES ('essai', 'brief-test.json', 'A', $1) RETURNING organization_id::text", [SHA]);
      expect(run.rows[0].organization_id).toBe(PROTOTYPE_ORG_ID);
      await expectRefused(c, "INSERT INTO public.place_coordinates (organization_id, place_id, lat, lng, fetched_at, expires_at) VALUES ($1, 'x', 1, 1, now(), now() + interval '1 day')", [a.org]);
      await expectRefused(c, "SELECT public.store_place_coordinates('x', 1, 1)");
      await expectRefused(c, "DELETE FROM public.place_coordinates WHERE organization_id = $1", [a.org]);
    });
    expect(await compter("SELECT count(*) AS n FROM public.place_coordinates WHERE place_id = $1", [placeA])).toBe(1);
  });

  it("base: vadrouille_app avec app.organization_id = org_prototype ne lit aucune coordonnée et ne peut pas en écrire", async () => {
    const placeProto = await poserCoordonnee(PROTOTYPE_ORG_ID, "vivante");
    await inTx(app, { org: PROTOTYPE_ORG_ID }, async (c) => {
      expect(Number((await c.query("SELECT count(*) AS n FROM public.place_coordinates")).rows[0].n)).toBe(0);
      expect((await attempt(c, "SELECT public.store_place_coordinates('ChIJautre', 1, 1)")).code).toBe("42501");
      await expectRefused(c, "SELECT public.store_prototype_coordinates(gen_random_uuid(), 'ChIJautre', 1, 1)");
    });
    expect(await compter("SELECT count(*) AS n FROM public.place_coordinates WHERE organization_id = $1 AND place_id = 'ChIJautre'", [PROTOTYPE_ORG_ID])).toBe(0);
    expect(await compter("SELECT count(*) AS n FROM public.place_coordinates WHERE place_id = $1", [placeProto])).toBe(1);
  });

  it("isolation: place_coordinates d'une organisation invisible et intouchable pour une autre (vadrouille_app)", async () => {
    const b = await createOrg(auth);
    const placeId = `ChIJtest${unique()}`;
    await inTx(app, { org: a.org, user: a.owner }, (c) => c.query("SELECT public.store_place_coordinates($1, 46.2, 6.15)", [placeId]));
    const lus = (org: string) =>
      inTx(app, { org }, async (c) => (await c.query("SELECT organization_id::text, lat, lng FROM public.place_coordinates WHERE place_id = $1", [placeId])).rows);
    expect(await lus(a.org)).toEqual([{ organization_id: a.org, lat: 46.2, lng: 6.15 }]);
    expect(await lus(b.org)).toEqual([]);
    await inTx(app, { org: b.org }, async (c) => {
      await expectRefused(c, "DELETE FROM public.place_coordinates WHERE place_id = $1", [placeId]);
      await expectRefused(c, "UPDATE public.place_coordinates SET lat = 0 WHERE place_id = $1", [placeId]);
      // B réécrit le même placeId dans sa propre organisation : la ligne de A ne change pas.
      await c.query("SELECT public.store_place_coordinates($1, 1, 1)", [placeId]);
    });
    expect(await lus(a.org)).toEqual([{ organization_id: a.org, lat: 46.2, lng: 6.15 }]);
    // Expiration à 29 jours pour une organisation du MVP (0011 § 6, amendée par 0060 § 2 : migration 0008).
    expect(
      await compter("SELECT count(*) AS n FROM public.place_coordinates WHERE place_id = $1 AND organization_id = $2 AND expires_at - fetched_at = interval '29 days'", [placeId, a.org]),
    ).toBe(1);
  });

  it("fonctions: store_prototype_coordinates sans paramètre d'organisation, écrit dans org_prototype seulement, expiration à 29 jours", async () => {
    const signature = await admin.query(
      `SELECT pg_catalog.pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef, pg_catalog.pg_get_userbyid(p.proowner) AS owner
       FROM pg_catalog.pg_proc p WHERE p.oid = 'public.store_prototype_coordinates(uuid, text, double precision, double precision)'::regprocedure`,
    );
    expect(signature.rows[0]).toEqual({
      args: "p_run_id uuid, p_place_id text, p_lat double precision, p_lng double precision",
      prosecdef: true,
      owner: "vadrouille_fn_coords",
    });
    await admin.query("BEGIN");
    try {
      // Appelée avec le contexte d'une autre organisation : la ligne va quand même à org_prototype.
      await admin.query("SELECT set_config('app.organization_id', $1, true)", [a.org]);
      const runId = await poserExecution(admin, { organisation: PROTOTYPE_ORG_ID });
      const placeId = `ChIJtest${unique()}`;
      await admin.query("SELECT public.store_prototype_coordinates($1, $2, 48.85, 2.35)", [runId, placeId]);
      const { rows } = await admin.query(
        `SELECT c.organization_id::text, c.lat, c.lng, c.expires_at - c.fetched_at = interval '29 days' AS a29, c.fetched_at = r.started_at AS debut
         FROM public.place_coordinates c, prototype.runs r WHERE c.place_id = $1 AND r.id = $2`,
        [placeId, runId],
      );
      expect(rows).toEqual([{ organization_id: PROTOTYPE_ORG_ID, lat: 48.85, lng: 2.35, a29: true, debut: true }]);
    } finally {
      await admin.query("ROLLBACK");
    }
  });

  it("base: vadrouille_prototype écrit place_coordinates par store_prototype_coordinates seulement, dans org_prototype", async () => {
    // 0056 § 4.5 (occurrence 14 de 0046) : toutes les surcharges de store_prototype_coordinates, désignées par leur
    // oid ; EXECUTE pour vadrouille_prototype seul hors leur propriétaire, PUBLIC exclu (acl explicite ou par défaut).
    const surcharges = await proto.query("SELECT p.oid::regprocedure::text AS signature, p.oid FROM pg_catalog.pg_proc p WHERE p.proname = 'store_prototype_coordinates'");
    expect(surcharges.rows.map((r) => r.signature)).toEqual([SIGNATURE_POSITIONS]);
    for (const { oid, signature } of surcharges.rows) {
      const { rows } = await proto.query(
        `SELECT r AS role FROM unnest(ARRAY['vadrouille_prototype', 'vadrouille_app', 'vadrouille_auth', 'vadrouille_prototype_purge', 'vadrouille_fn_prototype_purge', 'vadrouille_migrator', 'vadrouille_owner']) AS r
         WHERE pg_catalog.has_function_privilege(r, $1::oid, 'EXECUTE')`,
        [oid],
      );
      expect(rows, signature).toEqual([{ role: "vadrouille_prototype" }]);
      const acl = await proto.query(
        `SELECT COALESCE(NULLIF(a.grantee, 0)::regrole::text, 'PUBLIC') AS beneficiaire, a.privilege_type AS droit, pg_catalog.pg_get_userbyid(p.proowner) AS proprietaire
         FROM pg_catalog.pg_proc p, LATERAL pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) a WHERE p.oid = $1::oid`,
        [oid],
      );
      expect(
        acl.rows.filter((r) => r.beneficiaire !== r.proprietaire).map((r) => ({ beneficiaire: r.beneficiaire, droit: r.droit })),
        signature,
      ).toEqual([{ beneficiaire: "vadrouille_prototype", droit: "EXECUTE" }]);
    }
    // Ni INSERT, ni UPDATE, ni DELETE direct sur place_coordinates.
    for (const droit of ["INSERT", "UPDATE", "DELETE"]) {
      expect((await proto.query("SELECT pg_catalog.has_table_privilege('public.place_coordinates', $1) AS d", [droit])).rows[0].d, droit).toBe(false);
    }
    expect(
      (await proto.query("SELECT pg_catalog.has_function_privilege('vadrouille_prototype', 'public.store_place_coordinates(text, double precision, double precision)', 'EXECUTE') AS e"))
        .rows[0].e,
    ).toBe(false);
    const placeProto = await poserCoordonnee(PROTOTYPE_ORG_ID, "vivante");
    await inTx(proto, { org: PROTOTYPE_ORG_ID }, async (c) => {
      // Écriture refusée hors d'une exécution en cours (exécution inconnue).
      expect((await attempt(c, "SELECT public.store_prototype_coordinates(gen_random_uuid(), 'ChIJverrou', 1, 1)")).code).toBe("42501");
      await expectRefused(c, "SELECT public.store_place_coordinates('ChIJverrou', 1, 1)");
      await expectRefused(c, "SELECT public.purge_expired_coordinates()");
      await expectRefused(
        c,
        "INSERT INTO public.place_coordinates (organization_id, place_id, lat, lng, fetched_at, expires_at) VALUES ($1, 'ChIJverrou', 1, 1, now(), now() + interval '1 day')",
        [PROTOTYPE_ORG_ID],
      );
      await expectRefused(c, "UPDATE public.place_coordinates SET lat = 0 WHERE place_id = $1", [placeProto]);
      await expectRefused(c, "DELETE FROM public.place_coordinates WHERE place_id = $1", [placeProto]);
    });
    expect(await compter("SELECT count(*) AS n FROM public.place_coordinates WHERE place_id = 'ChIJverrou'")).toBe(0);
    expect(await compter("SELECT count(*) AS n FROM public.place_coordinates WHERE place_id = $1", [placeProto])).toBe(1);
    // Seule la migration de déverrouillage accorde EXECUTE sur la fonction (décision 0056 § 4.2 et § 4.5).
    const dossier = path.join(RACINE, "db/migrations");
    const accordant: string[] = [];
    for (const fichier of readdirSync(dossier).filter((f) => f.endsWith(".sql"))) {
      const texte = readFileSync(path.join(dossier, fichier), "utf8").replace(/--[^\n]*/g, "");
      if (/GRANT\s[^;]*store_prototype_coordinates/i.test(texte)) accordant.push(fichier);
      expect(texte, fichier).not.toMatch(/ALTER\s+DEFAULT\s+PRIVILEGES[^;]*GRANT\s[^;]*EXECUTE/i);
    }
    expect(accordant).toEqual(["0006_deverrouillage_positions_prototype.sql"]);
  });
});

describe("invariants et contenus (0046 D24, S4)", () => {
  it("base: invariants de runs tenus par la base", async () => {
    await proto.query("BEGIN");
    try {
      await proto.query("SELECT set_config('app.organization_id', $1, true)", [PROTOTYPE_ORG_ID]);
      const id = (await proto.query("INSERT INTO prototype.runs (mode, brief, variant, commit_sha) VALUES ('reel', 'brief-test.json', 'A', $1) RETURNING id", [SHA])).rows[0].id;
      const essai = async (sql: string) => (await attempt(proto, sql, [id])).code;
      expect(await essai("UPDATE prototype.runs SET phase = 'ancrage', cost_models_micros = 20000 WHERE id = $1")).toBeUndefined();
      // Arrêt sans code, phase ou coût non remis à nul, coût non arrondi au cent, code ou phase hors liste, code en cours.
      expect(await essai("UPDATE prototype.runs SET status = 'arretee', phase = NULL, cost_models_micros = NULL WHERE id = $1")).toBe("23514");
      expect(await essai("UPDATE prototype.runs SET status = 'arretee', stop_code = 'pipeline_failed', cost_models_micros = NULL WHERE id = $1")).toBe("23514");
      expect(await essai("UPDATE prototype.runs SET status = 'arretee', stop_code = 'pipeline_failed', phase = NULL WHERE id = $1")).toBe("23514");
      expect(await essai("UPDATE prototype.runs SET status = 'programme_ecrit', stop_code = 'pipeline_failed', phase = NULL, cost_models_micros = NULL WHERE id = $1")).toBe("23514");
      expect(await essai("UPDATE prototype.runs SET cost_models_micros = 12345 WHERE id = $1")).toBe("23514");
      expect(await essai("UPDATE prototype.runs SET cost_models_micros = -10000 WHERE id = $1")).toBe("23514");
      expect(await essai("UPDATE prototype.runs SET stop_code = 'pipeline_failed' WHERE id = $1")).toBe("23514");
      expect(await essai("UPDATE prototype.runs SET phase = 'inconnue' WHERE id = $1")).toBe("23514");
      expect(await essai("UPDATE prototype.runs SET status = 'arretee', stop_code = 'place_not_found', phase = NULL, cost_models_micros = NULL WHERE id = $1")).toBe("23514");
      expect(await essai("UPDATE prototype.runs SET status = 'arretee', stop_code = 'cap_reached', phase = NULL, cost_models_micros = NULL WHERE id = $1")).toBe("23514");
      // Limite d'appels de Google (migration 0011_arret_limite_google) : code admis.
      expect(await essai("UPDATE prototype.runs SET status = 'arretee', stop_code = 'upstream_rate_limited', phase = NULL, cost_models_micros = NULL WHERE id = $1")).toBeUndefined();
      expect(await essai("UPDATE prototype.runs SET status = 'arretee', stop_code = 'pipeline_failed', phase = NULL, cost_models_micros = NULL WHERE id = $1")).toBeUndefined();
      // Colonnes non modifiables, valeurs hors liste à l'insertion ; seconde exécution du même jour admise (0071).
      await expectRefused(proto, "UPDATE prototype.runs SET started_at = now() - interval '1 day' WHERE id = $1", [id]);
      await expectRefused(proto, "UPDATE prototype.runs SET brief = 'autre.json' WHERE id = $1", [id]);
      for (const [colonnes, valeurs] of [
        ["mode, brief, variant, commit_sha", "'simule', 'brief-test.json', 'A', repeat('a', 40)"],
        ["mode, brief, variant, commit_sha", "'essai', '../x.json', 'A', repeat('a', 40)"],
        ["mode, brief, variant, commit_sha", "'essai', 'brief-test.json', 'C', repeat('a', 40)"],
        ["mode, brief, variant, commit_sha", "'essai', 'brief-test.json', 'A', 'HEAD'"],
      ]) {
        expect((await attempt(proto, `INSERT INTO prototype.runs (${colonnes}) VALUES (${valeurs})`)).code, valeurs).toBe("23514");
      }
      expect((await attempt(proto, "INSERT INTO prototype.runs (mode, brief, variant, commit_sha) VALUES ('essai', 'brief-test.json', 'B', $1)", [SHA])).code).toBeUndefined();
    } finally {
      await proto.query("ROLLBACK");
    }
  });

  it("p0: aucune donnée dérivée de Google en base (colonnes fermées de runs, forfaits et run_candidates)", async () => {
    const colonnes = async (table: string) =>
      (
        await proto.query(
          "SELECT attname FROM pg_catalog.pg_attribute WHERE attrelid = ('prototype.' || $1)::regclass AND attnum > 0 AND NOT attisdropped ORDER BY attnum",
          [table],
        )
      ).rows.map((r) => r.attname as string);
    expect(await colonnes("runs")).toEqual([
      "id",
      "organization_id",
      "quota_day",
      "mode",
      "brief",
      "variant",
      "status",
      "phase",
      "stop_code",
      "cost_models_micros",
      "started_at",
      "canary_ok",
      "commit_sha",
    ]);
    expect(await colonnes("forfaits")).toEqual([
      "id",
      "organization_id",
      "nature",
      "run_id",
      "quota_day",
      "text_search_requests",
      "place_details_requests",
      "routes_requests",
      "routes_elements",
      "google_cost_micros",
      "models_cost_micros",
      "created_at",
    ]);
    expect(await colonnes("run_candidates")).toEqual(["id", "organization_id", "run_id", "cle", "candidat", "place_id", "expires_at"]);
    expect(await colonnes("programmes")).toEqual(["id", "organization_id", "run_id", "contenu", "expires_at"]);
    expect(await colonnes("jugements")).toEqual(["id", "organization_id", "programme_id", "reponses", "expires_at"]);
    expect(await colonnes("run_attempts")).toEqual(["id", "organization_id", "resultat", "created_at", "expires_at"]);
    expect(await colonnes("purges")).toEqual(["id", "purged_at"]);
    // Aucune colonne de position ni de contenu Google dans le schéma prototype (Q324, option a).
    for (const table of TABLES) {
      for (const nom of await colonnes(table)) {
        expect(nom, `${table}.${nom}`).not.toMatch(/(^|_)(lat|lng|latitude|longitude|location|coordinates?|geometry|rating|review|hours|address|phone|photo|display_name|formatted)(_|$)/);
      }
    }
  });

  it("p0: clés de run_candidates égales à CandidatSchema, et le contenu refuse une note ou un verdict", async () => {
    const def = (
      await proto.query("SELECT pg_catalog.pg_get_constraintdef(oid) AS def FROM pg_catalog.pg_constraint WHERE conname = 'run_candidates_candidat_check'")
    ).rows[0].def as string;
    const cles = [...def.slice(def.indexOf("ARRAY[")).matchAll(/'([A-Za-z]+)'::text/g)].map((m) => m[1]);
    expect(cles.sort()).toEqual(Object.keys(CandidatSchema.shape).sort());
    await proto.query("BEGIN");
    try {
      await proto.query("SELECT set_config('app.organization_id', $1, true)", [PROTOTYPE_ORG_ID]);
      const run = (await proto.query("INSERT INTO prototype.runs (mode, brief, variant, commit_sha) VALUES ('essai', 'brief-test.json', 'A', $1) RETURNING id", [SHA])).rows[0].id;
      expect((await attempt(proto, "INSERT INTO prototype.run_candidates (run_id, cle, candidat) VALUES ($1, 'c_001', $2)", [run, CANDIDAT])).code).toBeUndefined();
      for (const cle of ["note", "verdict", "motif", "plan"]) {
        expect((await attempt(proto, "INSERT INTO prototype.run_candidates (run_id, cle, candidat) VALUES ($1, 'c_002', $2)", [run, { ...CANDIDAT, [cle]: 1 }])).code, cle).toBe("23514");
      }
      expect((await attempt(proto, "INSERT INTO prototype.run_candidates (run_id, cle, candidat, place_id) VALUES ($1, 'c_003', $2, 'id avec espace')", [run, CANDIDAT])).code).toBe("23514");
      // Fin d'exécution : vadrouille_prototype supprime ses lignes vivantes de run_candidates.
      expect((await attempt(proto, "DELETE FROM prototype.run_candidates WHERE run_id = $1", [run])).rowCount).toBe(1);
    } finally {
      await proto.query("ROLLBACK");
    }
  });

  it("base: quota_day_at égal à periodes.ts", async () => {
    for (const { iso, jour } of INSTANTS_JOUR_GOOGLE) {
      const { rows } = await proto.query("SELECT prototype.quota_day_at($1::timestamptz)::text AS jour", [iso]);
      expect(rows[0].jour, iso).toBe(jourDeQuotaGoogle(Date.parse(iso)));
      expect(rows[0].jour, iso).toBe(jour);
    }
    // Le jour posé sur une ligne est celui de la fonction, à l'instant de la base.
    const { rows } = await proto.query("SELECT prototype.quota_day_at(now())::text AS jour, (extract(epoch FROM now()) * 1000)::float8 AS ms");
    expect(rows[0].jour).toBe(jourDeQuotaGoogle(Number(rows[0].ms)));
  });
});

// Gardes de usage_ledger jusqu'au verdict de B7 (0046 D13 point 7) : levées par la migration 0010_usage_forfait (B7c,
// avec le verdict de la Sécurité) et remplacées par `usage: une ligne par forfait, jamais par appel`
// (tests/db/usage.test.ts).

describe("purge du prototype (0046 D16)", () => {
  it("base: vadrouille_prototype_purge ne fait que purger (fonction sans paramètre, aucun droit sur une table)", async () => {
    const fonction = await admin.query("SELECT p.pronargs, pg_catalog.pg_get_function_result(p.oid) AS resultat FROM pg_catalog.pg_proc p WHERE p.oid = 'prototype.purge_expired()'::regprocedure");
    expect(fonction.rows[0]).toEqual({ pronargs: 0, resultat: "void" });
    const { rows } = await purge.query(
      `SELECT c.relnamespace::regnamespace::text || '.' || c.relname AS t FROM pg_catalog.pg_class c
       WHERE c.relnamespace IN ('public'::regnamespace, 'prototype'::regnamespace) AND c.relkind IN ('r', 'p', 'v', 'm')
         AND (pg_catalog.has_any_column_privilege('vadrouille_prototype_purge', c.oid, 'SELECT, INSERT, UPDATE, REFERENCES')
              OR EXISTS (SELECT 1 FROM unnest(ARRAY['DELETE', 'TRUNCATE', 'TRIGGER']) p WHERE pg_catalog.has_table_privilege('vadrouille_prototype_purge', c.oid, p)))`,
    );
    expect(rows).toEqual([]);
    expect((await purge.query("SELECT pg_catalog.has_schema_privilege('vadrouille_prototype_purge', 'public', 'CREATE') AS c")).rows[0].c).toBe(false);
    await purge.query("BEGIN");
    try {
      for (const table of TABLES) await expectRefused(purge, `SELECT * FROM prototype.${table}`);
      await expectRefused(purge, "SELECT public.purge_expired_coordinates()");
      await expectRefused(purge, "SELECT public.store_prototype_coordinates(gen_random_uuid(), 'x', 1, 1)");
      await expectRefused(purge, "SELECT * FROM public.place_coordinates");
    } finally {
      await purge.query("ROLLBACK");
    }
  });

  it("purge: aucune ligne vivante touchée, toutes organisations ; p0: chaque purge inscrit sa date", async () => {
    const vivantes = await poserDate("vivante");
    const expirees = await poserDate("expiree");
    const coordsVivantes = [await poserCoordonnee(a.org, "vivante"), await poserCoordonnee(PROTOTYPE_ORG_ID, "vivante")];
    const coordsExpirees = [await poserCoordonnee(a.org, "expiree"), await poserCoordonnee(PROTOTYPE_ORG_ID, "expiree")];
    const avant = await compter("SELECT count(*) AS n FROM prototype.purges");
    await purge.query("SELECT prototype.purge_expired()");
    for (const [table, cle] of [
      ["programmes", "programme"],
      ["jugements", "jugement"],
      ["run_attempts", "attempt"],
      ["run_candidates", "candidat"],
    ] as const) {
      expect(await compter(`SELECT count(*) AS n FROM prototype.${table} WHERE id = $1`, [vivantes[cle]]), `${table} vivante`).toBe(1);
      expect(await compter(`SELECT count(*) AS n FROM prototype.${table} WHERE id = $1`, [expirees[cle]]), `${table} expirée`).toBe(0);
    }
    expect(await compter("SELECT count(*) AS n FROM public.place_coordinates WHERE place_id = ANY($1::text[])", [coordsVivantes])).toBe(2);
    expect(await compter("SELECT count(*) AS n FROM public.place_coordinates WHERE place_id = ANY($1::text[])", [coordsExpirees])).toBe(0);
    // runs et forfaits ne sont jamais purgés (conservés jusqu'à la fin de la phase 0).
    expect(await compter("SELECT count(*) AS n FROM prototype.runs WHERE id = $1", [expirees.run])).toBe(1);
    // Date inscrite, lisible par vadrouille_prototype ; aucune autre donnée (aucun compte de lignes).
    expect(await compter("SELECT count(*) AS n FROM prototype.purges")).toBe(avant + 1);
    const derniere = await inTx(proto, { org: PROTOTYPE_ORG_ID }, async (c) => (await c.query("SELECT pg_catalog.now() - max(purged_at) < interval '1 minute' AS recente FROM prototype.purges")).rows[0]);
    expect(derniere).toEqual({ recente: true });
  });

  it("purge: jugements supprimés avant leur programme", async () => {
    const expirees = await poserDate("expiree");
    await purge.query("SELECT prototype.purge_expired()");
    expect(await compter("SELECT count(*) AS n FROM prototype.jugements WHERE id = $1", [expirees.jugement])).toBe(0);
    expect(await compter("SELECT count(*) AS n FROM prototype.programmes WHERE id = $1", [expirees.programme])).toBe(0);
    const corps = (await admin.query("SELECT prosrc FROM pg_catalog.pg_proc WHERE oid = 'prototype.purge_expired()'::regprocedure")).rows[0].prosrc as string;
    expect(corps.indexOf("prototype.jugements")).toBeLessThan(corps.indexOf("prototype.programmes"));
  });

  it("purge: purges bornée à 30 jours", async () => {
    const ancienne = (await admin.query("INSERT INTO prototype.purges (purged_at) VALUES (pg_catalog.now() - interval '31 days') RETURNING id")).rows[0].id;
    const recente = (await admin.query("INSERT INTO prototype.purges (purged_at) VALUES (pg_catalog.now() - interval '29 days') RETURNING id")).rows[0].id;
    await purge.query("SELECT prototype.purge_expired()");
    expect(await compter("SELECT count(*) AS n FROM prototype.purges WHERE id = $1", [ancienne])).toBe(0);
    expect(await compter("SELECT count(*) AS n FROM prototype.purges WHERE id = $1", [recente])).toBe(1);
    expect(await compter("SELECT count(*) AS n FROM prototype.purges WHERE purged_at < pg_catalog.now() - interval '30 days'")).toBe(0);
  });
});
