import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { attempt, closeAll, connect, expectRefused, inTx, seedOrganization, type SeedIds } from "./helpers";

/**
 * Ajout seulement (décision 0007) : `trip_versions`, `billing`, `usage_ledger` refusent UPDATE, DELETE et TRUNCATE,
 * par les droits (aucun rôle applicatif ne les a) et par un déclencheur, qui ne laisse passer qu'un DELETE sur
 * `trip_versions` par la fonction de purge (`current_user = vadrouille_fn_purge`, rôle sans membre).
 *
 * Le déclencheur est un second verrou : aucun rôle applicatif ne peut l'atteindre (droits absents) et le
 * propriétaire ne voit aucune ligne (RLS forcée). Pour prouver qu'il refuse quand même, la mise à jour et la
 * suppression sont tentées sous le superutilisateur du conteneur, qui contourne la RLS : c'est un test du
 * déclencheur, pas un test d'isolation. TRUNCATE (qui ignore la RLS) est tenté sous vadrouille_owner.
 */

const APPEND_ONLY = ["trip_versions", "billing", "usage_ledger"] as const;
const APPLICATIVE_ROLES = ["vadrouille_app", "vadrouille_auth", "vadrouille_share", "vadrouille_webhook", "vadrouille_account_admin", "vadrouille_limiter"];

let app: pg.Client;
let admin: pg.Client;
let migrator: pg.Client;
let a: SeedIds;

beforeAll(async () => {
  app = await connect("app");
  admin = await connect("admin");
  migrator = await connect("migrator");
  a = await seedOrganization(await connect("auth"), app);
});

afterAll(closeAll);

async function inAdminTx(fn: (c: pg.Client) => Promise<void>): Promise<void> {
  await admin.query("BEGIN");
  try {
    // Un set_config quelconque ne lève pas le déclencheur (seul current_user compte).
    await admin.query("SELECT set_config('app.organization_id', $1, true), set_config('app.purge', 'vadrouille_fn_purge', true)", [a.org]);
    await fn(admin);
  } finally {
    await admin.query("ROLLBACK");
  }
}

async function appendOnly(table: (typeof APPEND_ONLY)[number]) {
  const id = a.rows[table];
  // 1. Droits : aucun rôle applicatif n'a UPDATE, DELETE ni TRUNCATE.
  for (const role of APPLICATIVE_ROLES) {
    const { rows } = await app.query(
      `SELECT pg_catalog.has_table_privilege($1, 'public.' || $2, 'UPDATE') OR pg_catalog.has_any_column_privilege($1, 'public.' || $2, 'UPDATE') AS upd,
              pg_catalog.has_table_privilege($1, 'public.' || $2, 'DELETE') AS del,
              pg_catalog.has_table_privilege($1, 'public.' || $2, 'TRUNCATE') AS trunc`,
      [role, table],
    );
    expect(rows[0], `${role} sur ${table}`).toEqual({ upd: false, del: false, trunc: false });
  }
  // 2. Tentatives réelles sous vadrouille_app et vadrouille_webhook, contexte de l'organisation posé.
  for (const role of [undefined, "vadrouille_webhook"]) {
    await inTx(
      app,
      { org: a.org, user: a.owner },
      async (c) => {
        await expectRefused(c, `UPDATE ${table} SET organization_id = organization_id WHERE id = $1`, [id]);
        await expectRefused(c, `DELETE FROM ${table} WHERE id = $1`, [id]);
        await expectRefused(c, `TRUNCATE ${table}`);
      },
      role,
    );
  }
  // 3. Déclencheur : refus même pour un rôle qui voit la ligne et a les droits.
  await inAdminTx(async (c) => {
    expect((await attempt(c, `UPDATE ${table} SET organization_id = organization_id WHERE id = $1`, [id])).code).toBe("42501");
    expect((await attempt(c, `DELETE FROM ${table} WHERE id = $1`, [id])).code).toBe("42501");
  });
  await migrator.query("BEGIN");
  try {
    await migrator.query("SET LOCAL ROLE vadrouille_owner");
    // CASCADE : billing est référencée par entitlements ; le déclencheur refuse avant toute suppression, et la
    // transaction est annulée de toute façon.
    expect((await attempt(migrator, `TRUNCATE ${table} CASCADE`)).code).toBe("42501");
  } finally {
    await migrator.query("ROLLBACK");
  }
  // 4. Aucun rôle ne peut se faire passer pour la fonction de purge.
  for (const client of [app, migrator]) {
    await expect(client.query("SET ROLE vadrouille_fn_purge")).rejects.toMatchObject({ code: "42501" });
  }
}

describe("versions: trip_versions est en ajout seulement", () => {
  it("UPDATE, DELETE et TRUNCATE refusés ; seule la fonction de purge supprime une version", async () => {
    await appendOnly("trip_versions");
    await inTx(app, { org: a.org, user: a.owner }, async (c) => {
      const inserted = await c.query(
        "INSERT INTO trip_versions (organization_id, trip_id, version, request_id, snapshot, author_kind) VALUES ($1, $2, 99, gen_random_uuid(), '{}', 'user')",
        [a.org, a.trip],
      );
      expect(inserted.rowCount).toBe(1);
    });
  });
});

describe("registres: billing et usage_ledger sont en ajout seulement", () => {
  it.each(APPEND_ONLY.filter((t) => t !== "trip_versions"))("%s : UPDATE, DELETE et TRUNCATE refusés sous chaque rôle applicatif ; set_config sans effet", async (table) => {
    await appendOnly(table);
  });
});
