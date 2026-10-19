import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { attempt, BUSINESS_TABLES, closeAll, connect, type DbClient, inTx, type SeedIds, seedOrganization } from "./helpers";

/** Tests de schéma de la spécification B1 (handover § 6, « Partie Q5 » § 6, décisions 0007, 0010 et 0011). */

let app: DbClient;
let auth: DbClient;
let a: SeedIds;

beforeAll(async () => {
  app = await connect("app");
  auth = await connect("auth");
  a = await seedOrganization(auth, app);
});

afterAll(closeAll);

async function publicColumns(): Promise<{ table: string; column: string }[]> {
  const { rows } = await app.query(
    `SELECT c.table_name AS table, c.column_name AS column
     FROM information_schema.columns c
     JOIN pg_catalog.pg_class k ON k.relname = c.table_name AND k.relnamespace = 'public'::regnamespace
     WHERE c.table_schema = 'public' AND k.relkind IN ('r', 'p')`,
  );
  return rows;
}

describe("schéma", () => {
  it("schéma: RLS activée et forcée partout (schémas public et prototype, décision 0046)", async () => {
    const { rows } = await app.query(
      `SELECT relnamespace::regnamespace::text || '.' || relname AS relname, relrowsecurity, relforcerowsecurity FROM pg_catalog.pg_class
       WHERE relnamespace IN ('public'::regnamespace, 'prototype'::regnamespace) AND relkind IN ('r', 'p') ORDER BY relname`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(BUSINESS_TABLES.length + 7);
    expect(rows.filter((r) => r.relname.startsWith("prototype.")).length).toBe(7);
    for (const row of rows) {
      expect(row, row.relname).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true });
    }
  });

  it("chaque table métier a organization_id NOT NULL, un index qui commence par organization_id et une clé composite vers trips", async () => {
    for (const table of BUSINESS_TABLES) {
      const column = await app.query(
        `SELECT is_nullable, data_type FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'organization_id'`,
        [table],
      );
      expect(column.rows[0], table).toMatchObject({ is_nullable: "NO", data_type: "uuid" });
      const index = await app.query(
        `SELECT count(*)::int AS n FROM pg_catalog.pg_index i
         JOIN pg_catalog.pg_attribute att ON att.attrelid = i.indrelid AND att.attnum = i.indkey[0]
         WHERE i.indrelid = ('public.' || $1)::regclass AND att.attname = 'organization_id'`,
        [table],
      );
      expect(index.rows[0].n, table).toBeGreaterThan(0);
      const hasTripId = await app.query(
        "SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'trip_id'",
        [table],
      );
      // Exceptions justifiées au handover § 6 : identifiants historiques sans clé étrangère (Q48).
      if (hasTripId.rowCount && table !== "usage_ledger") {
        const fk = await app.query(
          `SELECT pg_catalog.pg_get_constraintdef(oid) AS def FROM pg_catalog.pg_constraint
           WHERE conrelid = ('public.' || $1)::regclass AND contype = 'f' AND confrelid = 'public.trips'::regclass`,
          [table],
        );
        expect(fk.rows.map((r) => r.def), table).toEqual([
          'FOREIGN KEY (organization_id, trip_id) REFERENCES trips(organization_id, id)',
        ]);
      }
    }
  });

  describe("schéma: les JSONB refusent les clés hors contrat", () => {
    const FORBIDDEN = ["rating", "openingHours", "displayName", "location"];
    const candidate = (facts: unknown, sources: unknown) => ({
      sql: "INSERT INTO candidates (organization_id, trip_id, kind, name, facts, sources) VALUES ($1, $2, 'place', 'Lieu', $3, $4)",
      params: [a.org, a.trip, JSON.stringify(facts), JSON.stringify(sources)],
    });
    const source = { label: "Site", url: "https://exemple.ch", checkedOn: "2026-10-01" };

    async function code(sql: string, params: unknown[]) {
      return inTx(app, { org: a.org, user: a.owner }, async (c) => (await attempt(c, sql, params)).code);
    }

    it("une ligne conforme passe", async () => {
      const ok = candidate({ durationMinutes: 90, costPerPerson: 12, area: "Leith" }, [source]);
      expect(await code(ok.sql, ok.params)).toBeUndefined();
    });

    it.each(FORBIDDEN)("clé %s refusée dans candidates.facts", async (key) => {
      const row = candidate({ area: "Leith", [key]: 4.5 }, [source]);
      expect(await code(row.sql, row.params)).toBe("23514");
    });

    it.each(FORBIDDEN)("clé %s refusée dans un élément de candidates.sources", async (key) => {
      const row = candidate({}, [source, { ...source, [key]: "x" }]);
      expect(await code(row.sql, row.params)).toBe("23514");
    });

    it("url en http: refusée dans candidates.sources, comme un élément qui n'est pas un objet", async () => {
      for (const sources of [[{ ...source, url: "http://exemple.ch" }], [{ label: "Site" }], ["https://exemple.ch"], { url: "https://exemple.ch" }]) {
        const row = candidate({}, sources);
        expect(await code(row.sql, row.params), JSON.stringify(sources)).toBe("23514");
      }
    });

    it("checklist_items.moment : les trois formes passent, un texte libre ou une clé en trop sont refusés", async () => {
      const sql =
        "INSERT INTO checklist_items (organization_id, trip_id, kind, label, moment, booking_url) VALUES ($1, $2, 'other', 'Élément', $3, $4)";
      for (const moment of [{ type: "deadline", date: "2027-04-01" }, { type: "beforeDeparture" }, { type: "tripDay", day: 1 }]) {
        expect(await code(sql, [a.org, a.trip, JSON.stringify(moment), null]), JSON.stringify(moment)).toBeUndefined();
      }
      for (const moment of ["à l'arrivée", { type: "beforeDeparture", label: "avant le départ" }, { type: "deadline" }, { type: "autre" }]) {
        expect(await code(sql, [a.org, a.trip, JSON.stringify(moment), null]), JSON.stringify(moment)).toBe("23514");
      }
      expect(await code(sql, [a.org, a.trip, JSON.stringify({ type: "beforeDeparture" }), "http://exemple.ch"])).toBe("23514");
    });

    it("proposals.content : clés de premier niveau de ProposalRecord seulement, nul si et seulement si noOption", async () => {
      const sql =
        "INSERT INTO proposals (organization_id, trip_id, generation_run_id, phase, position, slot_type, day, time, kind, content) VALUES ($1, $2, $3, 'deck', $4, $5, 1, '12:00', 'meal', $6)";
      const content = { id: "p1", kind: "meal", day: 1, time: "12:00", stop: {}, category: "food" };
      let position = 100;
      const run = (slot: string, value: unknown) =>
        code(sql, [a.org, a.trip, a.generationRun, position++, slot, value === null ? null : JSON.stringify(value)]);
      expect(await run("proposal", content)).toBeUndefined();
      expect(await run("noOption", null)).toBeUndefined();
      expect(await run("proposal", { ...content, photoUrl: "https://exemple.ch/photo.jpg" })).toBe("23514");
      expect(await run("proposal", { ...content, rating: 4.5 })).toBe("23514");
      expect(await run("proposal", null)).toBe("23514");
      expect(await run("noOption", content)).toBe("23514");
    });

    it("event_occurrences.source_url en http: refusée", async () => {
      const sql =
        "INSERT INTO event_occurrences (organization_id, trip_id, starts_at, timezone, source_url, status) VALUES ($1, $2, now(), 'Europe/London', $3, 'confirmed')";
      expect(await code(sql, [a.org, a.trip, "http://exemple.ch/evenement"])).toBe("23514");
    });
  });

  it("schéma: aucune colonne de contenu Google", async () => {
    // Handover § 6, « Colonnes interdites ». Exceptions admises : place_coordinates.lat et .lng (cache de
    // 30 jours au plus, décision 0011 point 6), inactive tant que B8 n'a pas créé la table ; stays.area_center_lat et
    // .area_center_lng (B9b, 0081 B9-TL-5 et B9-TL-6 (c)) : centre d'une zone **maison** (sortie du modèle, B7), jamais
    // une coordonnée ni une géométrie Google (0011, 0027) ; soumises au verdict de la Sécurité.
    const ALLOWED = new Set(["place_coordinates.lat", "place_coordinates.lng", "stays.area_center_lat", "stays.area_center_lng"]);
    const PATTERNS = [
      /rating/,
      /review/,
      /opening_hours/,
      /hours/,
      /business_status/,
      /photo/,
      /phone/,
      /address/,
      /price_level/,
      /display_name/,
      /google/,
      /formatted/,
      /(^|_)(lat|lng|latitude|longitude|location|coordinates?|geometry|viewport)(_|$)/,
    ];
    const offending = (await publicColumns())
      .map(({ table, column }) => `${table}.${column}`)
      .filter((name) => !ALLOWED.has(name) && PATTERNS.some((pattern) => pattern.test(name.split(".")[1] ?? "")));
    expect(offending).toEqual([]);
  });

  it("schéma: aucune colonne dérivée de Google", async () => {
    // « Partie Q5 » § 6 et § 10 : ni verdict, ni motif d'écart, ni date de contrôle d'un lieu, ni durée de trajet,
    // ni rapport de validation, ni compteur d'ancrage ; aucune table de plan de travail. `event_occurrences.
    // source_checked_at` est la relecture de la page web de l'événement (jamais Google) et `users.email_verified`
    // la vérification de l'adresse par code (Better Auth) : nommées ici.
    const ALLOWED = new Set(["event_occurrences.source_checked_at", "users.email_verified"]);
    const PATTERNS = [
      /validation_report/,
      /verdict/,
      /grounding/,
      /grounded/,
      /verified/,
      /checked/,
      /discard/,
      /rejection/,
      /mismatch/,
      /(^|_)(travel|route|routes|segment|transit|commute)(_|$)/,
      /candidates_(found|grounded|retained)/,
      /^minutes$/,
    ];
    const columns = await publicColumns();
    const offending = columns
      .map(({ table, column }) => `${table}.${column}`)
      .filter((name) => !ALLOWED.has(name) && PATTERNS.some((pattern) => pattern.test(name.split(".")[1] ?? "")));
    expect(offending).toEqual([]);
    expect(columns.some((c) => c.table === "trip_versions" && c.column === "validation_report")).toBe(false);
    // Étendu au schéma prototype sans exception de nom (0046 D15 point 3 : la table de travail s'appelle run_candidates).
    const tables = await app.query(
      "SELECT relname FROM pg_catalog.pg_class WHERE relnamespace IN ('public'::regnamespace, 'prototype'::regnamespace) AND relkind IN ('r', 'p', 'v', 'm') AND relname ~ '(plan|work|scratch)'",
    );
    expect(tables.rows).toEqual([]);
  });

  it("schéma: aucune fonction ni table du schéma prototype accessible à PUBLIC (décision 0046, D15 point 3)", async () => {
    const schema = await app.query(
      `SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace n, pg_catalog.aclexplode(COALESCE(n.nspacl, pg_catalog.acldefault('n', n.nspowner))) AS acl
                      WHERE n.nspname = 'prototype' AND acl.grantee = 0) AS public`,
    );
    expect(schema.rows[0].public).toBe(false);
    const fonctions = await app.query(
      `SELECT p.proname FROM pg_catalog.pg_proc p
       WHERE p.pronamespace = 'prototype'::regnamespace
         AND EXISTS (SELECT 1 FROM pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) AS acl WHERE acl.grantee = 0)`,
    );
    expect(fonctions.rows).toEqual([]);
    const tables = await app.query(
      `SELECT c.relname FROM pg_catalog.pg_class c
       WHERE c.relnamespace = 'prototype'::regnamespace
         AND (EXISTS (SELECT 1 FROM pg_catalog.aclexplode(COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))) AS acl WHERE acl.grantee = 0)
              OR EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a, pg_catalog.aclexplode(a.attacl) AS acl
                         WHERE a.attrelid = c.oid AND a.attacl IS NOT NULL AND acl.grantee = 0))`,
    );
    expect(tables.rows).toEqual([]);
    // Les fonctions de coordonnées de public non plus (0011 § 6 ; S8 pour store_prototype_coordinates).
    const coords = await app.query(
      `SELECT p.proname FROM pg_catalog.pg_proc p
       WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('store_place_coordinates', 'store_prototype_coordinates', 'purge_expired_coordinates')
         AND EXISTS (SELECT 1 FROM pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) AS acl WHERE acl.grantee = 0)`,
    );
    expect(coords.rows).toEqual([]);
  });

  it("partage: la vue partagée n'expose jamais place_coordinates", async () => {
    // Part de B1 : aucune vue partagée ne dépend d'une table nommée place_coordinates (pg_depend) ; aucun droit de
    // vadrouille_share ni de vadrouille_fn_share_views sur elle quand elle existe (B8, décision 0011 point 6).
    const { rows } = await app.query(
      `SELECT DISTINCT v.relname AS view, ref.relname AS referenced
       FROM pg_catalog.pg_class v
       JOIN pg_catalog.pg_rewrite rw ON rw.ev_class = v.oid
       JOIN pg_catalog.pg_depend d ON d.classid = 'pg_catalog.pg_rewrite'::regclass AND d.objid = rw.oid
       JOIN pg_catalog.pg_class ref ON ref.oid = d.refobjid AND ref.oid <> v.oid
       WHERE v.relnamespace = 'public'::regnamespace AND v.relname IN ('shared_trip', 'shared_trip_version', 'shared_checklist')`,
    );
    const referenced = rows.map((r) => r.referenced as string);
    expect(referenced).toEqual(expect.arrayContaining(["share_links", "trips"]));
    expect(referenced).not.toContain("place_coordinates");
    const exists = await app.query("SELECT pg_catalog.to_regclass('public.place_coordinates') IS NOT NULL AS exists");
    if (exists.rows[0].exists) {
      for (const role of ["vadrouille_share", "vadrouille_fn_share_views"]) {
        const privileges = await app.query(
          "SELECT pg_catalog.has_any_column_privilege($1, 'public.place_coordinates', 'SELECT') OR pg_catalog.has_table_privilege($1, 'public.place_coordinates', 'SELECT') AS any",
          [role],
        );
        expect(privileges.rows[0].any, role).toBe(false);
      }
    }
  });
});
