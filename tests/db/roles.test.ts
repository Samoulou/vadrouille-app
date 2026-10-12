import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { BOOTSTRAP_ROLE, BUSINESS_TABLES, closeAll, connect, PURGED_TABLES, seedOrganization } from "./helpers";

/** Tests `rôles` et `fonctions` de la décision 0007 et de la spécification B1. */

const ROLES = {
  vadrouille_owner: false,
  vadrouille_migrator: true,
  vadrouille_app: true,
  vadrouille_auth: true,
  vadrouille_share: false,
  vadrouille_webhook: false,
  vadrouille_account_admin: false,
  vadrouille_limiter: false,
  vadrouille_fn_share: false,
  vadrouille_fn_share_views: false,
  vadrouille_fn_checkout: false,
  vadrouille_fn_coords: false,
  vadrouille_fn_purge: false,
} as const;
const FN_ROLES = Object.keys(ROLES).filter((role) => role.startsWith("vadrouille_fn_"));
const APPLICATIVE_ROLES = ["vadrouille_app", "vadrouille_auth", "vadrouille_share", "vadrouille_webhook", "vadrouille_account_admin", "vadrouille_limiter"];
const SHARED_VIEWS = ["shared_checklist", "shared_trip", "shared_trip_version"];
const TABLE_PRIVILEGES = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"] as const;

/**
 * Droits de table attendus (décision 0007, tableaux « Droits de vadrouille_app par table », « Droits de
 * vadrouille_auth par table » et rôles). Tout droit absent est refusé. Les droits par colonne sont testés à part.
 */
const SIUD = ["SELECT", "INSERT", "UPDATE", "DELETE"];
const EXPECTED_TABLE_PRIVILEGES: Record<string, Record<string, string[]>> = {
  vadrouille_app: {
    checklist_items: SIUD,
    preferences: SIUD,
    stays: SIUD,
    ...Object.fromEntries(
      ["trips", "briefs", "generation_runs", "research_runs", "candidates", "event_occurrences", "feedback", "preference_signals", "share_links"].map(
        (t) => [t, ["SELECT", "INSERT", "UPDATE"]],
      ),
    ),
    checkouts: ["SELECT", "INSERT"],
    trip_versions: ["SELECT", "INSERT"],
    usage_ledger: ["SELECT", "INSERT"],
    proposals: ["SELECT", "INSERT"],
    billing: ["SELECT"],
    entitlements: ["SELECT"],
    organizations: ["SELECT"],
    memberships: ["SELECT"],
    users: ["SELECT"],
  },
  vadrouille_auth: {
    users: ["SELECT", "INSERT", "DELETE"],
    sessions: SIUD,
    verifications: SIUD,
    accounts: ["SELECT", "INSERT", "DELETE"],
    organizations: ["SELECT", "DELETE"],
    memberships: ["SELECT", "INSERT", "DELETE"],
  },
  vadrouille_webhook: {
    checkouts: ["SELECT"],
    trips: ["SELECT"],
    entitlements: ["SELECT", "INSERT"],
    billing: ["INSERT"],
  },
  vadrouille_limiter: { action_rate_limits: SIUD },
  vadrouille_share: {},
  vadrouille_account_admin: {},
  vadrouille_fn_share: {},
  vadrouille_fn_share_views: {},
  vadrouille_fn_checkout: {},
  vadrouille_fn_coords: {},
  vadrouille_fn_purge: Object.fromEntries(PURGED_TABLES.map((t) => [t, ["DELETE"]])),
};

/** Droits par colonne attendus, en plus des droits de table. */
const EXPECTED_COLUMN_PRIVILEGES: Record<string, Record<string, Record<string, string[]>>> = {
  vadrouille_app: { checkouts: { UPDATE: ["stripe_checkout_session_id"] } },
  vadrouille_auth: {
    users: { UPDATE: ["email_verified", "updated_at"] },
    organizations: { INSERT: ["created_at", "id", "kind", "name", "slug"] },
  },
  vadrouille_webhook: {
    billing: { SELECT: ["checkout_id", "id", "outcome", "stripe_event_id"] },
    checkouts: { UPDATE: ["status", "updated_at"] },
  },
  vadrouille_fn_share: { share_links: { SELECT: ["expires_at", "organization_id", "revoked_at", "token_hash", "trip_id"] } },
  vadrouille_fn_share_views: {
    share_links: { SELECT: ["expires_at", "organization_id", "revoked_at", "token_hash", "trip_id"] },
    trips: {
      SELECT: ["current_version", "destination", "end_date", "id", "organization_id", "start_date", "time_zone", "travellers_adults", "travellers_children"],
    },
    trip_versions: { SELECT: ["created_at", "organization_id", "snapshot", "trip_id", "version"] },
    checklist_items: { SELECT: ["booking_url", "done", "id", "kind", "label", "moment", "organization_id", "sponsored", "stop_id", "trip_id"] },
  },
  vadrouille_fn_checkout: { checkouts: { SELECT: ["organization_id", "stripe_checkout_session_id"] } },
  vadrouille_fn_purge: {
    memberships: { SELECT: ["organization_id", "role", "user_id"] },
    organizations: { SELECT: ["deletion_requested_at", "id"], UPDATE: ["deletion_requested_at"] },
    ...Object.fromEntries(PURGED_TABLES.map((t) => [t, { SELECT: ["organization_id"] }])),
  },
};

let app: pg.Client;
let tables: string[];
let seededOrg: string;

beforeAll(async () => {
  app = await connect("app");
  const auth = await connect("auth");
  seededOrg = (await seedOrganization(auth, app)).org;
  tables = (
    await app.query("SELECT relname FROM pg_catalog.pg_class WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r', 'p') ORDER BY relname")
  ).rows.map((r) => r.relname as string);
});

afterAll(closeAll);

type Membership = { role: string; member: string; admin_option: boolean; inherit_option: boolean; set_option: boolean };

async function memberships(): Promise<Membership[]> {
  const { rows } = await app.query(
    `SELECT r.rolname AS role, m.rolname AS member, a.admin_option, a.inherit_option, a.set_option
     FROM pg_catalog.pg_auth_members a
     JOIN pg_catalog.pg_roles r ON r.oid = a.roleid
     JOIN pg_catalog.pg_roles m ON m.oid = a.member
     WHERE r.rolname LIKE 'vadrouille\\_%' OR m.rolname LIKE 'vadrouille\\_%'`,
  );
  return rows;
}

describe("rôles: aucun rôle ne contourne la RLS", () => {
  it("la liste des rôles vadrouille_* est exactement celle de la décision 0007, sans SUPERUSER ni BYPASSRLS", async () => {
    const { rows } = await app.query(
      "SELECT rolname, rolsuper, rolbypassrls, rolcanlogin, rolcreaterole, rolcreatedb, rolreplication FROM pg_catalog.pg_roles WHERE rolname LIKE 'vadrouille\\_%' ORDER BY rolname",
    );
    expect(rows.map((r) => r.rolname)).toEqual(Object.keys(ROLES).sort());
    for (const row of rows) {
      expect(row, row.rolname).toMatchObject({
        rolsuper: false,
        rolbypassrls: false,
        rolcreaterole: false,
        rolcreatedb: false,
        rolreplication: false,
        rolcanlogin: ROLES[row.rolname as keyof typeof ROLES],
      });
    }
  });

  it("appartenances accordées à vadrouille_app : INHERIT FALSE, SET TRUE, ADMIN FALSE, et seulement celles-là", async () => {
    const granted = (await memberships()).filter((m) => m.member === "vadrouille_app");
    expect(granted.map((m) => m.role).sort()).toEqual(["vadrouille_account_admin", "vadrouille_limiter", "vadrouille_share", "vadrouille_webhook"]);
    for (const m of granted) {
      expect(m, m.role).toMatchObject({ inherit_option: false, set_option: true, admin_option: false });
    }
    const privileges = await app.query(
      `SELECT pg_catalog.has_function_privilege('vadrouille_app', 'public.purge_organization_data(uuid)', 'EXECUTE') AS purge,
              pg_catalog.has_table_privilege('vadrouille_app', 'public.entitlements', 'INSERT') AS entitlements,
              pg_catalog.has_table_privilege('vadrouille_app', 'public.billing', 'INSERT') AS billing,
              pg_catalog.has_table_privilege('vadrouille_app', 'public.action_rate_limits', 'SELECT') AS limiter`,
    );
    expect(privileges.rows[0]).toEqual({ purge: false, entitlements: false, billing: false, limiter: false });
  });

  it("vadrouille_migrator n'est membre (SET ou INHERIT) que de vadrouille_owner ; aucun autre rôle n'a de membre hors amorçage", async () => {
    const all = await memberships();
    const usable = all.filter((m) => m.set_option || m.inherit_option);
    expect(usable.filter((m) => m.member === "vadrouille_migrator").map((m) => m.role)).toEqual(["vadrouille_owner"]);
    // Seules appartenances utilisables vers un rôle vadrouille_* : migrator → owner, app → ses quatre rôles.
    expect(
      usable
        .filter((m) => m.role.startsWith("vadrouille_"))
        .map((m) => `${m.member}→${m.role}`)
        .sort(),
    ).toEqual(
      [
        "vadrouille_migrator→vadrouille_owner",
        "vadrouille_app→vadrouille_account_admin",
        "vadrouille_app→vadrouille_limiter",
        "vadrouille_app→vadrouille_share",
        "vadrouille_app→vadrouille_webhook",
      ].sort(),
    );
    // Aucun rôle vadrouille_* n'est membre d'un rôle extérieur (pg_read_all_data, rôle propriétaire de Neon…).
    expect(all.filter((m) => m.member.startsWith("vadrouille_") && !m.role.startsWith("vadrouille_"))).toEqual([]);
  });

  it("rôles vadrouille_fn_* : aucune appartenance avec SET ou INHERIT ; seule l'option ADMIN de vadrouille_migrator et du rôle d'amorçage (B1-TL-2)", async () => {
    const fn = (await memberships()).filter((m) => FN_ROLES.includes(m.role));
    for (const m of fn) {
      expect(m, `${m.member}→${m.role}`).toMatchObject({ set_option: false, inherit_option: false, admin_option: true });
      expect(["vadrouille_migrator", BOOTSTRAP_ROLE], `${m.member}→${m.role}`).toContain(m.member);
    }
    for (const role of FN_ROLES) {
      expect(fn.some((m) => m.role === role && m.member === "vadrouille_migrator"), role).toBe(true);
    }
  });

  it("aucun rôle de connexion ne peut prendre un rôle vadrouille_fn_* ni vadrouille_owner (hors vadrouille_migrator)", async () => {
    for (const login of ["app", "auth", "migrator"] as const) {
      const client = await connect(login);
      for (const role of [...FN_ROLES, ...(login === "migrator" ? [] : ["vadrouille_owner"])]) {
        await expect(client.query(`SET ROLE ${role}`), `${login} → ${role}`).rejects.toMatchObject({ code: "42501" });
      }
    }
  });

  it("seul vadrouille_owner possède des tables ; seul vadrouille_fn_share_views possède les vues partagées ; vadrouille_fn_coords ne possède rien", async () => {
    const owners = await app.query(
      `SELECT relname, relkind, pg_catalog.pg_get_userbyid(relowner) AS owner FROM pg_catalog.pg_class
       WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r', 'p', 'v', 'm', 'S', 'f')`,
    );
    for (const row of owners.rows) {
      if (row.relkind === "v") {
        expect(SHARED_VIEWS, row.relname).toContain(row.relname);
        expect(row.owner, row.relname).toBe("vadrouille_fn_share_views");
      } else {
        expect(row.owner, row.relname).toBe("vadrouille_owner");
      }
    }
    expect(owners.rows.filter((r) => r.relkind === "v").map((r) => r.relname).sort()).toEqual(SHARED_VIEWS);
    const coords = await app.query(
      `SELECT (SELECT count(*) FROM pg_catalog.pg_class WHERE relowner = 'vadrouille_fn_coords'::regrole)
            + (SELECT count(*) FROM pg_catalog.pg_proc WHERE proowner = 'vadrouille_fn_coords'::regrole) AS n`,
    );
    expect(Number(coords.rows[0].n)).toBe(0);
  });

  it("droits de table exactement ceux de la décision 0007, pour chaque rôle ; TRUNCATE à aucun", async () => {
    for (const [role, expected] of Object.entries(EXPECTED_TABLE_PRIVILEGES)) {
      for (const table of tables) {
        const { rows } = await app.query(
          `SELECT p AS privilege FROM unnest($3::text[]) AS p WHERE pg_catalog.has_table_privilege($1, 'public.' || $2, p)`,
          [role, table, TABLE_PRIVILEGES],
        );
        expect(rows.map((r) => r.privilege).sort(), `${role} sur ${table}`).toEqual([...(expected[table] ?? [])].sort());
      }
    }
  });

  it("droits par colonne : UPDATE de vadrouille_app sur checkouts limité à stripe_checkout_session_id ; INSERT de vadrouille_auth sur organizations sans deletion_requested_at", async () => {
    for (const [role, byTable] of Object.entries(EXPECTED_COLUMN_PRIVILEGES)) {
      for (const [table, byPrivilege] of Object.entries(byTable)) {
        for (const [privilege, expected] of Object.entries(byPrivilege)) {
          const { rows } = await app.query(
            `SELECT a.attname FROM pg_catalog.pg_attribute a
             WHERE a.attrelid = ('public.' || $2)::regclass AND a.attnum > 0 AND NOT a.attisdropped
               AND pg_catalog.has_column_privilege($1, a.attrelid, a.attnum, $3)
             ORDER BY a.attname`,
            [role, table, privilege],
          );
          expect(rows.map((r) => r.attname), `${role} ${privilege} sur ${table}`).toEqual([...expected].sort());
        }
      }
    }
    const checks = await app.query(
      `SELECT pg_catalog.has_column_privilege('vadrouille_app', 'public.checkouts', 'status', 'UPDATE') AS status,
              pg_catalog.has_column_privilege('vadrouille_app', 'public.checkouts', 'amount_cents', 'UPDATE') AS amount,
              pg_catalog.has_column_privilege('vadrouille_auth', 'public.organizations', 'deletion_requested_at', 'INSERT') AS deletion,
              pg_catalog.has_any_column_privilege('vadrouille_auth', 'public.organizations', 'UPDATE') AS org_update,
              pg_catalog.has_any_column_privilege('vadrouille_auth', 'public.memberships', 'UPDATE') AS membership_update`,
    );
    expect(checks.rows[0]).toEqual({ status: false, amount: false, deletion: false, org_update: false, membership_update: false });
  });

  it("vadrouille_auth n'a aucun droit sur une table métier ; vadrouille_share n'en a sur aucune table, seulement SELECT sur les vues partagées", async () => {
    for (const table of tables) {
      for (const role of ["vadrouille_share", ...(BUSINESS_TABLES.includes(table as never) ? ["vadrouille_auth"] : [])]) {
        const { rows } = await app.query(
          `SELECT pg_catalog.has_any_column_privilege($1, ('public.' || $2)::regclass, 'SELECT, INSERT, UPDATE, REFERENCES') AS columns,
                  bool_or(pg_catalog.has_table_privilege($1, ('public.' || $2)::regclass, p)) AS any
           FROM unnest($3::text[]) AS p`,
          [role, table, TABLE_PRIVILEGES],
        );
        expect(rows[0], `${role} sur ${table}`).toEqual({ columns: false, any: false });
      }
    }
    const views = await app.query(
      `SELECT v AS view, pg_catalog.has_table_privilege('vadrouille_share', 'public.' || v, 'SELECT') AS can_select
       FROM unnest($1::text[]) AS v`,
      [SHARED_VIEWS],
    );
    expect(views.rows.every((r) => r.can_select)).toBe(true);
    for (const role of APPLICATIVE_ROLES.filter((r) => r !== "vadrouille_share")) {
      for (const view of SHARED_VIEWS) {
        const { rows } = await app.query("SELECT pg_catalog.has_table_privilege($1, 'public.' || $2, 'SELECT') AS can", [role, view]);
        expect(rows[0].can, `${role} sur ${view}`).toBe(false);
      }
    }
  });

  it("vadrouille_owner (pris par vadrouille_migrator) lit zéro ligne sur chaque table métier remplie", async () => {
    const migrator = await connect("migrator");
    await migrator.query("BEGIN");
    try {
      await migrator.query("SET LOCAL ROLE vadrouille_owner");
      // Même avec le contexte d'une organisation remplie : aucune politique ne vise vadrouille_owner.
      await migrator.query("SELECT set_config('app.organization_id', $1, true)", [seededOrg]);
      for (const table of [...BUSINESS_TABLES, "organizations", "memberships", "users"]) {
        expect(Number((await migrator.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n), table).toBe(0);
      }
      await migrator.query("RESET ROLE");
      for (const table of BUSINESS_TABLES) {
        expect(Number((await migrator.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n), `migrator ${table}`).toBe(0);
      }
    } finally {
      await migrator.query("ROLLBACK");
    }
  });
});

describe("fonctions: SECURITY DEFINER durcies", () => {
  const EXPECTED = {
    resolve_share_link: { owner: "vadrouille_fn_share", execute: ["vadrouille_app"] },
    checkout_organization: { owner: "vadrouille_fn_checkout", execute: ["vadrouille_webhook"] },
    purge_organization_data: { owner: "vadrouille_fn_purge", execute: ["vadrouille_account_admin"] },
  } as const;

  it("seules les trois fonctions prévues sont SECURITY DEFINER, avec search_path fixé, leur propriétaire vadrouille_fn_* et EXECUTE nominatif", async () => {
    const { rows } = await app.query(
      `SELECT p.oid, p.proname, pg_catalog.pg_get_userbyid(p.proowner) AS owner, p.proconfig,
              COALESCE((SELECT array_agg(CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(acl.grantee)::text END ORDER BY 1)::text[]
                        FROM pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) AS acl
                        WHERE acl.privilege_type = 'EXECUTE' AND acl.grantee <> p.proowner), '{}') AS execute
       FROM pg_catalog.pg_proc p
       JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
       WHERE p.prosecdef AND n.nspname NOT IN ('pg_catalog', 'information_schema')`,
    );
    expect(rows.map((r) => r.proname).sort()).toEqual(Object.keys(EXPECTED).sort());
    for (const row of rows) {
      const expected = EXPECTED[row.proname as keyof typeof EXPECTED];
      expect(row.proconfig, row.proname).toContain("search_path=pg_catalog, pg_temp");
      expect(row.owner, row.proname).toBe(expected.owner);
      expect(row.execute, row.proname).toEqual([...expected.execute]);
      const roles = await app.query(
        `SELECT r AS role FROM unnest($2::text[]) AS r WHERE pg_catalog.has_function_privilege(r, $1::oid, 'EXECUTE')`,
        [row.oid, Object.keys(ROLES)],
      );
      // Le propriétaire a EXECUTE par construction ; aucun autre rôle que celui prévu.
      expect(roles.rows.map((r) => r.role).sort(), row.proname).toEqual([...expected.execute, expected.owner].sort());
    }
  });

  it("aucune fonction du schéma public n'est exécutable par PUBLIC, hors fonctions pures de contexte et de contrôle", async () => {
    const { rows } = await app.query(
      `SELECT p.proname FROM pg_catalog.pg_proc p
       WHERE p.pronamespace = 'public'::regnamespace
         AND EXISTS (SELECT 1 FROM pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) AS acl
                     WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE')
       ORDER BY 1`,
    );
    expect(rows.map((r) => r.proname)).toEqual(["app_current_org", "app_current_user", "app_share_token_hash", "jsonb_sources_valid"]);
  });

  it("les fonctions nomment leurs objets avec leur schéma et n'utilisent aucun SQL dynamique", async () => {
    const { rows } = await app.query(
      "SELECT proname, prosrc FROM pg_catalog.pg_proc WHERE prosecdef AND pronamespace = 'public'::regnamespace",
    );
    for (const row of rows) {
      expect(row.prosrc, row.proname).not.toMatch(/\bEXECUTE\b/i);
      expect(row.prosrc, row.proname).not.toMatch(/\b(FROM|UPDATE|INTO|JOIN)\s+(?!public\.)[a-z_]+\b(?!\s*\()/i);
    }
  });
});
