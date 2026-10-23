import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PROTOTYPE_ORG_ID } from "@/prototype/programme-reduit";

import { BOOTSTRAP_ROLE, BUSINESS_TABLES, closeAll, connect, type DbClient, PURGED_TABLES, seedOrganization } from "./helpers";

/**
 * Tests `rôles` et `fonctions` de la décision 0007 et de la spécification B1, amendés par la décision 0046 (P0r2 :
 * `place_coordinates`, schéma `prototype`, fonctions de coordonnées et de purge), par la décision 0060 (B8c, § 4 :
 * rôle de purge du MVP) et par B7c (migration 0010_usage_forfait : 18 rôles, `vadrouille_fn_usage`, propriétaire de
 * `usage_forfait_totals()`).
 */

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
  // Décision 0046, D15 point 6 et D16 points 2 et 5.
  vadrouille_prototype: true,
  vadrouille_prototype_purge: true,
  vadrouille_fn_prototype_purge: false,
  // Décision 0060 § 3.2 (B8c) : connexion du job coords-purge.
  vadrouille_coords_purge: true,
  // B7c (migration 0010_usage_forfait) : propriétaire de la fonction des sommes de consommation.
  vadrouille_fn_usage: false,
} as const;
/** Attribut LOGIN attendu par rôle, lu par `Map` (clé venue de la base : aucun accès calculé, spécification P0c, 2.6). */
const LOGIN_BY_ROLE = new Map<string, boolean>(Object.entries(ROLES));
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
    // B9b (migration 0012_creation_voyage) : même modèle que `stays`.
    trip_commitments: SIUD,
    ...Object.fromEntries(
      ["trips", "briefs", "research_runs", "candidates", "event_occurrences", "feedback", "share_links"].map(
        (t) => [t, ["SELECT", "INSERT", "UPDATE"]],
      ),
    ),
    // Migration 0016_restriction_update_generation_runs (décision 0120 S8) : `UPDATE` de table retiré, accordé par colonnes.
    generation_runs: ["SELECT", "INSERT"],
    checkouts: ["SELECT", "INSERT"],
    trip_versions: ["SELECT", "INSERT"],
    usage_ledger: ["SELECT", "INSERT"],
    proposals: ["SELECT", "INSERT"],
    // B10a (migration 0014_tri_enregistre, décision 0112 § 3.1 et § 3.7) : `UPDATE` de table retiré, accordé par colonnes.
    preference_signals: ["SELECT", "INSERT"],
    deck_closures: ["SELECT", "INSERT"],
    preference_prompts: ["SELECT", "INSERT"],
    billing: ["SELECT"],
    entitlements: ["SELECT"],
    organizations: ["SELECT"],
    memberships: ["SELECT"],
    users: ["SELECT"],
    // 0011 § 6, amendée par 0046 S2 : lecture bornée, hors org_prototype ; écriture par store_place_coordinates.
    place_coordinates: ["SELECT"],
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
  vadrouille_fn_coords: { place_coordinates: ["INSERT", "DELETE"] },
  vadrouille_fn_purge: Object.fromEntries(PURGED_TABLES.map((t) => [t, ["DELETE"]])),
  // 0046 D15 point 6 : lecture de place_coordinates seulement (organisation fixe, lignes vivantes) ; aucun droit sur
  // une autre table de public, ni organizations ni usage_ledger.
  vadrouille_prototype: { place_coordinates: ["SELECT"] },
  vadrouille_prototype_purge: {},
  vadrouille_fn_prototype_purge: {},
  // 0060 § 3.2 : aucun droit sur une table (test complet : tests/db/coordonnees.test.ts).
  vadrouille_coords_purge: {},
  // B7c : lecture par colonnes seulement (droits par colonne ci-dessous), aucun droit de table.
  vadrouille_fn_usage: {},
};

/** Droits par colonne attendus, en plus des droits de table. */
const EXPECTED_COLUMN_PRIVILEGES: Record<string, Record<string, Record<string, string[]>>> = {
  vadrouille_app: {
    checkouts: { UPDATE: ["stripe_checkout_session_id"] },
    // B10a (0112 § 3.1 et § 3.7) : colonnes d'annulation d'un signal ; état et réponse d'une question.
    preference_signals: { UPDATE: ["cancel_request_id", "cancelled_at", "previous_status", "status"] },
    preference_prompts: { UPDATE: ["answer_signal_id", "state", "updated_at"] },
    deck_closures: { UPDATE: [] },
    // 0120 S8 (migration 0016) : colonnes écrites par les `UPDATE` de `src/` ; ni `base_version`, ni `deck_closure_id`,
    // ni `kind`, `organization_id`, `trip_id`, `request_id`, `started_at` ou `id`.
    generation_runs: {
      UPDATE: ["finished_at", "last_version", "person_retry_request_ids", "phase", "step", "step_seq", "stop_reason", "studio_retries", "updated_at", "workflow_run_id"],
    },
  },
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
  vadrouille_fn_coords: { place_coordinates: { SELECT: ["expires_at", "organization_id", "place_id"] } },
  // B7c (0010_usage_forfait) : colonnes des sommes seulement, ni id, ni trip_id, ni generation_run_id ; aucune écriture.
  vadrouille_fn_usage: {
    usage_ledger: { SELECT: ["cost_estimate_micros", "created_at", "organization_id", "provider", "sku", "step", "units"], INSERT: [], UPDATE: [] },
  },
  vadrouille_fn_purge: {
    memberships: { SELECT: ["organization_id", "role", "user_id"] },
    organizations: { SELECT: ["deletion_requested_at", "id"], UPDATE: ["deletion_requested_at"] },
    ...Object.fromEntries(PURGED_TABLES.map((t) => [t, { SELECT: ["organization_id"] }])),
    // B10b (migration 0015_recalcul_lot, décision 0119 § 5.2) : `kind` lue pour vider les lignes `batch` avant les clôtures.
    generation_runs: { SELECT: ["kind", "organization_id"] },
  },
};

let app: DbClient;
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
        rolcanlogin: LOGIN_BY_ROLE.get(row.rolname),
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

  it("vadrouille_migrator : seule appartenance avec SET, vadrouille_owner ; ses autres appartenances sont ADMIN seule aux rôles vadrouille_fn_* (décision 0036, amendement de 0007)", async () => {
    const all = await memberships();
    const usable = all.filter((m) => m.set_option || m.inherit_option);
    expect(usable.filter((m) => m.member === "vadrouille_migrator").map((m) => m.role)).toEqual(["vadrouille_owner"]);
    for (const m of all.filter((x) => x.member === "vadrouille_migrator" && x.role !== "vadrouille_owner")) {
      expect(FN_ROLES, `vadrouille_migrator→${m.role}`).toContain(m.role);
      expect(m, `vadrouille_migrator→${m.role}`).toMatchObject({ set_option: false, inherit_option: false, admin_option: true });
    }
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

  // Décision 0036, B1-TL-2 : rôles vadrouille_fn_* « sans appartenance avec SET ni INHERIT ». Seules sont admises,
  // ADMIN seule, l'appartenance de vadrouille_migrator (exigée) et celle du rôle d'amorçage (VADROUILLE_DB_BOOTSTRAP_ROLE,
  // tolérée, non exigée : en CI, le superutilisateur postgres n'en reçoit pas). Tout autre membre ou option échoue.
  it("rôles vadrouille_fn_* : sans appartenance avec SET ni INHERIT ; ADMIN seule de vadrouille_migrator et, tolérée, du rôle d'amorçage (décision 0036, B1-TL-2)", async () => {
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
    for (const login of ["app", "auth", "migrator", "p0", "p0_purge", "coords_purge"] as const) {
      const client = await connect(login);
      for (const role of [...FN_ROLES, ...(login === "migrator" ? [] : ["vadrouille_owner"])]) {
        await expect(client.query(`SET ROLE ${role}`), `${login} → ${role}`).rejects.toMatchObject({ code: "42501" });
      }
    }
  });

  it("seul vadrouille_owner possède des tables (public et prototype) ; seul vadrouille_fn_share_views possède les vues partagées ; vadrouille_fn_coords ne possède que ses trois fonctions", async () => {
    const owners = await app.query(
      `SELECT relname, relkind, pg_catalog.pg_get_userbyid(relowner) AS owner FROM pg_catalog.pg_class
       WHERE relnamespace IN ('public'::regnamespace, 'prototype'::regnamespace) AND relkind IN ('r', 'p', 'v', 'm', 'S', 'f')`,
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
    // 0011 § 6 et 0046 S2 : vadrouille_fn_coords possède ses trois fonctions et aucune table ; vadrouille_fn_prototype_purge
    // possède la seule fonction de purge du prototype (0046 D16 point 2).
    for (const [role, fonctions] of [
      ["vadrouille_fn_coords", ["purge_expired_coordinates", "store_place_coordinates", "store_prototype_coordinates"]],
      ["vadrouille_fn_prototype_purge", ["purge_expired"]],
      // B7c (0010_usage_forfait) : la seule fonction des sommes de consommation.
      ["vadrouille_fn_usage", ["usage_forfait_totals"]],
    ] as const) {
      const tablesPossedees = await app.query("SELECT count(*) AS n FROM pg_catalog.pg_class WHERE relowner = $1::regrole", [role]);
      expect(Number(tablesPossedees.rows[0].n), role).toBe(0);
      const procs = await app.query("SELECT proname FROM pg_catalog.pg_proc WHERE proowner = $1::regrole ORDER BY proname", [role]);
      expect(procs.rows.map((r) => r.proname), role).toEqual([...fonctions]);
    }
    const schema = await app.query("SELECT pg_catalog.pg_get_userbyid(nspowner) AS owner FROM pg_catalog.pg_namespace WHERE nspname = 'prototype'");
    expect(schema.rows[0]?.owner).toBe("vadrouille_owner");
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
      for (const table of [...BUSINESS_TABLES, "organizations", "memberships", "users", "place_coordinates"]) {
        expect(Number((await migrator.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n), table).toBe(0);
      }
      // Schéma prototype (0046) : aucune politique ne vise vadrouille_owner, même avec le contexte d'org_prototype.
      await migrator.query("SELECT set_config('app.organization_id', $1, true)", [PROTOTYPE_ORG_ID]);
      for (const table of ["runs", "forfaits", "programmes", "jugements", "run_attempts", "run_candidates", "purges", "trajets", "run_secteurs", "run_briefs"]) {
        expect(Number((await migrator.query(`SELECT count(*) AS n FROM prototype.${table}`)).rows[0].n), `prototype.${table}`).toBe(0);
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
  // Amendé par 0046 (D16, « Tests imposés », et S8) : purge_expired() à vadrouille_prototype_purge seul ;
  // purge_expired_coordinates à vadrouille_app et vadrouille_fn_prototype_purge ; store_place_coordinates à
  // vadrouille_app seul ; store_prototype_coordinates à vadrouille_prototype seul, PUBLIC exclu (forme à quatre
  // paramètres de 0052 § 1.7 ; déverrouillage par la migration 0006, décision 0056 § 4.5). Amendé par 0060 § 4 :
  // purge_expired_coordinates aussi à vadrouille_coords_purge (migration 0008).
  const EXPECTED = {
    resolve_share_link: { owner: "vadrouille_fn_share", execute: ["vadrouille_app"] },
    checkout_organization: { owner: "vadrouille_fn_checkout", execute: ["vadrouille_webhook"] },
    purge_organization_data: { owner: "vadrouille_fn_purge", execute: ["vadrouille_account_admin"] },
    store_place_coordinates: { owner: "vadrouille_fn_coords", execute: ["vadrouille_app"] },
    store_prototype_coordinates: { owner: "vadrouille_fn_coords", execute: ["vadrouille_prototype"] },
    // Ordre des entrées de l'ACL (ordre des GRANT : 0002, puis 0008).
    purge_expired_coordinates: { owner: "vadrouille_fn_coords", execute: ["vadrouille_app", "vadrouille_fn_prototype_purge", "vadrouille_coords_purge"] },
    purge_expired: { owner: "vadrouille_fn_prototype_purge", execute: ["vadrouille_prototype_purge"] },
    // B7c (0010_usage_forfait) : sommes de consommation, à vadrouille_app seul.
    usage_forfait_totals: { owner: "vadrouille_fn_usage", execute: ["vadrouille_app"] },
  } as const;
  const EXPECTED_BY_NAME = new Map<string, (typeof EXPECTED)[keyof typeof EXPECTED]>(Object.entries(EXPECTED));

  it("seules les huit fonctions prévues sont SECURITY DEFINER, avec search_path fixé, leur propriétaire vadrouille_fn_* et EXECUTE nominatif", async () => {
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
      const expected = EXPECTED_BY_NAME.get(row.proname);
      if (!expected) throw new Error(`fonction inattendue : ${row.proname}`);
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
      "SELECT proname, prosrc FROM pg_catalog.pg_proc WHERE prosecdef AND pronamespace IN ('public'::regnamespace, 'prototype'::regnamespace)",
    );
    expect(rows.length).toBe(8);
    for (const row of rows) {
      expect(row.prosrc, row.proname).not.toMatch(/\bEXECUTE\b/i);
      expect(row.prosrc, row.proname).not.toMatch(/\b(FROM|UPDATE|INTO|JOIN)\s+(?!(public|prototype)\.)[a-z_]+\b(?!\s*\()/i);
    }
  });
});

/**
 * Schéma `prototype` (décision 0046, D15 point 6, D16 points 3 et 5) : droits de table et par colonne exacts, pour
 * chacun des 18 rôles. Tout droit absent est refusé.
 */
describe("rôles: droits sur le schéma prototype (décision 0046)", () => {
  // `trajets` : temps de trajet conservés des programmes (décision 0092 § 3, migration 0011_trajets_prototype).
  // `run_secteurs` : plan de secteurs d'une exécution (décision 0094 § 1 point 5, migration 0013_secteurs_prototype).
  // `run_briefs` : brief saisi dans l'app d'une exécution (décision 0125 § 1, migration 0017_brief_saisi_prototype).
  const PROTOTYPE_TABLES = ["forfaits", "jugements", "programmes", "purges", "run_attempts", "run_briefs", "run_candidates", "run_secteurs", "runs", "trajets"];
  const EXPECTED_PROTOTYPE: Record<string, Record<string, string[]>> = {
    vadrouille_prototype: {
      runs: ["SELECT"],
      forfaits: ["SELECT"],
      programmes: ["SELECT"],
      jugements: ["SELECT"],
      run_attempts: ["SELECT"],
      run_candidates: ["SELECT", "DELETE"],
      // Sans UPDATE : remplacé par suppression puis insertion (0103, question 1).
      run_secteurs: ["SELECT", "DELETE"],
      // Ni UPDATE ni DELETE : écrit une fois avec l'exécution, supprimé par la purge seulement (0125 § 1).
      run_briefs: ["SELECT"],
      purges: ["SELECT"],
      // Ni UPDATE ni DELETE (0092 § 3).
      trajets: ["SELECT"],
    },
    vadrouille_fn_prototype_purge: {
      programmes: ["DELETE"],
      jugements: ["DELETE"],
      run_attempts: ["DELETE"],
      run_candidates: ["DELETE"],
      run_secteurs: ["DELETE"],
      run_briefs: ["DELETE"],
      purges: ["INSERT", "DELETE"],
      trajets: ["DELETE"],
    },
  };
  const EXPECTED_PROTOTYPE_COLUMNS: Record<string, Record<string, Record<string, string[]>>> = {
    vadrouille_prototype: {
      runs: {
        INSERT: ["brief", "canary_ok", "commit_sha", "cost_models_micros", "mode", "phase", "status", "stop_code", "variant"],
        UPDATE: ["canary_ok", "cost_models_micros", "phase", "status", "stop_code"],
      },
      forfaits: {
        INSERT: [
          "acces_empreinte",
          "autocomplete_requests",
          "google_cost_micros",
          "models_cost_micros",
          "nature",
          "place_details_requests",
          "routes_elements",
          "routes_requests",
          "run_id",
          "text_search_requests",
        ],
        UPDATE: [],
      },
      programmes: { INSERT: ["contenu", "run_id"], UPDATE: [] },
      jugements: { INSERT: ["programme_id", "reponses"], UPDATE: [] },
      run_attempts: { INSERT: ["resultat"], UPDATE: [] },
      run_candidates: { INSERT: ["candidat", "cle", "place_id", "run_id"], UPDATE: [] },
      // Sans id, organization_id ni expires_at, posés par le déclencheur (0103, question 1).
      run_secteurs: { INSERT: ["run_id", "secteurs"], UPDATE: [] },
      // Sans id, organization_id ni expires_at, posés par le déclencheur (0125 § 1).
      run_briefs: { INSERT: ["brief", "request_id", "run_id"], UPDATE: [] },
      purges: { INSERT: [], UPDATE: [] },
      // Sans id, organization_id ni expires_at, posés par le déclencheur (0092 § 3).
      trajets: { INSERT: ["destination", "minutes", "mode", "origine", "programme_id"], UPDATE: [] },
    },
    vadrouille_fn_prototype_purge: {
      programmes: { SELECT: ["expires_at"] },
      jugements: { SELECT: ["expires_at"] },
      run_attempts: { SELECT: ["expires_at"] },
      run_candidates: { SELECT: ["expires_at"] },
      run_secteurs: { SELECT: ["expires_at"] },
      run_briefs: { SELECT: ["expires_at"] },
      purges: { SELECT: ["purged_at"] },
      runs: { SELECT: [] },
      forfaits: { SELECT: [] },
      trajets: { SELECT: ["expires_at"] },
    },
    // Décision 0052 § 1.9 (migration 0005_prototype_coordinates_run) : lecture des exécutions en cours, pour la seule
    // fonction store_prototype_coordinates (started_at de l'exécution) ; rien d'autre dans le schéma.
    vadrouille_fn_coords: {
      runs: { SELECT: ["id", "organization_id", "started_at", "status"], INSERT: [], UPDATE: [] },
      forfaits: { SELECT: [] },
      programmes: { SELECT: [] },
      jugements: { SELECT: [] },
      run_attempts: { SELECT: [] },
      run_candidates: { SELECT: [] },
      run_secteurs: { SELECT: [] },
      run_briefs: { SELECT: [] },
      purges: { SELECT: [] },
      trajets: { SELECT: [] },
    },
  };

  // Les relevés du catalogue se font sous vadrouille_prototype : vadrouille_app n'a pas USAGE sur le schéma et ne
  // peut même pas résoudre un nom `prototype.*` (D15 point 7, testé à part).
  let proto: DbClient;
  beforeAll(async () => {
    proto = await connect("p0");
  });

  it("les tables du schéma prototype sont exactement celles de D15 point 3", async () => {
    const { rows } = await proto.query(
      "SELECT relname FROM pg_catalog.pg_class WHERE relnamespace = 'prototype'::regnamespace AND relkind IN ('r', 'p', 'v', 'm', 'f') ORDER BY relname",
    );
    expect(rows.map((r) => r.relname)).toEqual(PROTOTYPE_TABLES);
  });

  // Propriétaire des tables (et vadrouille_migrator, par son appartenance) : droits de propriétaire, sans politique
  // (RLS forcée : il ne lit aucune ligne, test « vadrouille_owner lit zéro ligne » étendu ci-dessous).
  const NON_PROPRIETAIRES = Object.keys(ROLES).filter((r) => r !== "vadrouille_owner" && r !== "vadrouille_migrator");

  it("droits de table exactement ceux de 0046, pour chacun des 16 rôles non propriétaires ; TRUNCATE à aucun", async () => {
    for (const role of NON_PROPRIETAIRES) {
      const expected = EXPECTED_PROTOTYPE[role] ?? {};
      for (const table of PROTOTYPE_TABLES) {
        const { rows } = await proto.query(
          `SELECT p AS privilege FROM unnest($3::text[]) AS p WHERE pg_catalog.has_table_privilege($1, 'prototype.' || $2, p)`,
          [role, table, TABLE_PRIVILEGES],
        );
        expect(rows.map((r) => r.privilege).sort(), `${role} sur prototype.${table}`).toEqual([...(expected[table] ?? [])].sort());
      }
    }
  });

  it("droits par colonne : INSERT de vadrouille_prototype sans id, organization_id, quota_day, started_at, created_at ni expires_at (S1) ; UPDATE sur runs seulement", async () => {
    for (const [role, byTable] of Object.entries(EXPECTED_PROTOTYPE_COLUMNS)) {
      for (const [table, byPrivilege] of Object.entries(byTable)) {
        for (const [privilege, expected] of Object.entries(byPrivilege)) {
          const { rows } = await proto.query(
            `SELECT a.attname FROM pg_catalog.pg_attribute a
             WHERE a.attrelid = ('prototype.' || $2)::regclass AND a.attnum > 0 AND NOT a.attisdropped
               AND pg_catalog.has_column_privilege($1, a.attrelid, a.attnum, $3)
             ORDER BY a.attname`,
            [role, table, privilege],
          );
          expect(rows.map((r) => r.attname), `${role} ${privilege} sur prototype.${table}`).toEqual([...expected].sort());
        }
      }
    }
    // Aucun autre rôle n'a de droit de colonne sur une table du schéma.
    for (const role of NON_PROPRIETAIRES.filter((r) => !(r in EXPECTED_PROTOTYPE_COLUMNS))) {
      for (const table of PROTOTYPE_TABLES) {
        const { rows } = await proto.query(
          "SELECT pg_catalog.has_any_column_privilege($1, ('prototype.' || $2)::regclass, 'SELECT, INSERT, UPDATE, REFERENCES') AS any",
          [role, table],
        );
        expect(rows[0].any, `${role} sur prototype.${table}`).toBe(false);
      }
    }
  });

  it("USAGE du schéma prototype : vadrouille_prototype, vadrouille_prototype_purge, vadrouille_fn_prototype_purge et vadrouille_fn_coords (0052 § 1.9) seulement (et son propriétaire) ; CREATE au propriétaire seul", async () => {
    const { rows } = await proto.query(
      "SELECT r AS role FROM unnest($1::text[]) AS r WHERE pg_catalog.has_schema_privilege(r, 'prototype', 'USAGE') ORDER BY 1",
      [Object.keys(ROLES)],
    );
    // vadrouille_migrator par son appartenance à vadrouille_owner (décision 0036).
    expect(rows.map((r) => r.role)).toEqual([
      "vadrouille_fn_coords",
      "vadrouille_fn_prototype_purge",
      "vadrouille_migrator",
      "vadrouille_owner",
      "vadrouille_prototype",
      "vadrouille_prototype_purge",
    ]);
    const create = await proto.query(
      "SELECT r AS role FROM unnest($1::text[]) AS r WHERE pg_catalog.has_schema_privilege(r, 'prototype', 'CREATE') ORDER BY 1",
      [Object.keys(ROLES)],
    );
    expect(create.rows.map((r) => r.role)).toEqual(["vadrouille_migrator", "vadrouille_owner"]);
  });
});
