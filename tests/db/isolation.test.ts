import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  BUSINESS_TABLES,
  closeAll,
  connect,
  countAs,
  expectNoEffect,
  expectRefused,
  inTx,
  insertSql,
  seedOrganization,
  type SeedIds,
} from "./helpers";

/**
 * Tests d'isolation (handover § 12, cadrage § 9 ; décision 0007) : deux organisations, une ligne de chacune dans
 * chaque table métier ; sous `vadrouille_app` avec le contexte de A, lecture, insertion, mise à jour et suppression
 * croisées sont refusées (par la RLS là où le droit existe, par les droits sinon).
 */

let app: pg.Client;
let auth: pg.Client;
let a: SeedIds;
let b: SeedIds;

beforeAll(async () => {
  app = await connect("app");
  auth = await connect("auth");
  a = await seedOrganization(auth, app);
  b = await seedOrganization(auth, app);
});

afterAll(closeAll);

/** Mise à jour sans changement de valeur : seule la colonne que `vadrouille_app` peut modifier sur `checkouts`. */
const neutralSet = (table: string) => (table === "checkouts" ? "stripe_checkout_session_id = stripe_checkout_session_id" : "organization_id = organization_id");

describe("isolation: une organisation ne lit ni ne modifie les voyages d'une autre", () => {
  const ctxA = () => ({ org: a.org, user: a.owner });

  it.each(BUSINESS_TABLES)("%s : lecture croisée impossible", async (table) => {
    await inTx(app, ctxA(), async (c) => {
      const { rows } = await c.query(`SELECT organization_id FROM ${table}`);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row) => row.organization_id === a.org)).toBe(true);
      const cross = await c.query(`SELECT count(*)::int AS n FROM ${table} WHERE organization_id = $1`, [b.org]);
      expect(cross.rows[0].n).toBe(0);
      const byId = await c.query(`SELECT count(*)::int AS n FROM ${table} WHERE id = $1`, [b.rows[table]]);
      expect(byId.rows[0].n).toBe(0);
    });
  });

  it.each(BUSINESS_TABLES)("%s : insertion pour une autre organisation refusée", async (table) => {
    const { sql, params } = insertSql(table, b);
    await inTx(app, ctxA(), (c) => expectRefused(c, sql, params));
  });

  it.each(BUSINESS_TABLES)("%s : mise à jour croisée sans effet, déplacement vers une autre organisation refusé", async (table) => {
    await inTx(app, ctxA(), async (c) => {
      await expectNoEffect(c, `UPDATE ${table} SET ${neutralSet(table)} WHERE organization_id = $1`, [b.org]);
      await expectNoEffect(c, `UPDATE ${table} SET ${neutralSet(table)} WHERE id = $1`, [b.rows[table]]);
      await expectRefused(c, `UPDATE ${table} SET organization_id = $1 WHERE id = $2`, [b.org, a.rows[table]]);
    });
  });

  it.each(BUSINESS_TABLES)("%s : suppression croisée sans effet", async (table) => {
    await inTx(app, ctxA(), async (c) => {
      await expectNoEffect(c, `DELETE FROM ${table} WHERE organization_id = $1`, [b.org]);
      await expectNoEffect(c, `DELETE FROM ${table} WHERE id = $1`, [b.rows[table]]);
    });
  });

  it("les lignes de B sont intactes après les tentatives de A", async () => {
    for (const table of BUSINESS_TABLES) {
      expect(await countAs(app, { org: b.org, user: b.owner }, table), table).toBe(1);
    }
  });

  it("organizations, memberships et users : seulement l'organisation, les adhésions et la personne du contexte", async () => {
    await inTx(app, ctxA(), async (c) => {
      expect((await c.query("SELECT id FROM organizations")).rows).toEqual([{ id: a.org }]);
      expect((await c.query("SELECT DISTINCT organization_id FROM memberships")).rows).toEqual([{ organization_id: a.org }]);
      expect((await c.query("SELECT id FROM users")).rows).toEqual([{ id: a.owner }]);
      await expectRefused(c, "UPDATE organizations SET name = 'x' WHERE id = $1", [a.org]);
      await expectRefused(c, "DELETE FROM memberships WHERE organization_id = $1", [a.org]);
    });
  });

  it("UPDATE checkouts SET status refusé sous vadrouille_app, même pour sa propre organisation", async () => {
    await inTx(app, ctxA(), async (c) => {
      await expectRefused(c, "UPDATE checkouts SET status = 'succeeded' WHERE id = $1", [a.rows.checkouts]);
      await expectRefused(c, "UPDATE checkouts SET amount_cents = 0 WHERE id = $1", [a.rows.checkouts]);
    });
  });

  it("checkouts.stripe_checkout_session_id s'écrit une seule fois", async () => {
    await inTx(app, ctxA(), async (c) => {
      const first = await c.query("UPDATE checkouts SET stripe_checkout_session_id = $1 WHERE id = $2", [`cs_test_${a.org}`, a.rows.checkouts]);
      expect(first.rowCount).toBe(1);
      await expectRefused(c, "UPDATE checkouts SET stripe_checkout_session_id = 'cs_test_autre' WHERE id = $1", [a.rows.checkouts]);
    });
  });
});

describe("isolation: sans contexte, aucune ligne", () => {
  it.each(BUSINESS_TABLES)("%s : zéro ligne lue et insertion refusée sans app.organization_id", async (table) => {
    await inTx(app, {}, async (c) => {
      expect(Number((await c.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n)).toBe(0);
      const { sql, params } = insertSql(table, a);
      await expectRefused(c, sql, params);
    });
  });

  it("sans contexte : ni organisation, ni adhésion, ni personne", async () => {
    await inTx(app, {}, async (c) => {
      for (const table of ["organizations", "memberships", "users"]) {
        expect(Number((await c.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n), table).toBe(0);
      }
    });
  });

  it("une valeur vide vaut absence de contexte (échec fermé)", async () => {
    await app.query("BEGIN");
    try {
      await app.query("SELECT set_config('app.organization_id', '', true)");
      expect(Number((await app.query("SELECT count(*) AS n FROM trips")).rows[0].n)).toBe(0);
    } finally {
      await app.query("ROLLBACK");
    }
  });
});
