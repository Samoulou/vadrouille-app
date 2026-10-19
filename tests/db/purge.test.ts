import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { BUSINESS_TABLES, closeAll, connect, countAs, createOrg, type DbClient, expectRefused, inTx, PURGED_TABLES, type SeedIds, seedOrganization } from "./helpers";

/**
 * `purge_organization_data` (décision 0007, « Suppression de compte » ; handover § 12, étape 1), appelée par le cas
 * d'usage `deleteAccount` dans une transaction `withOrg`, puis `SET LOCAL ROLE vadrouille_account_admin`.
 */

let app: DbClient;
let auth: DbClient;
let a: SeedIds;
let b: SeedIds;

beforeAll(async () => {
  app = await connect("app");
  auth = await connect("auth");
  a = await seedOrganization(auth, app);
  b = await seedOrganization(auth, app);
});

afterAll(closeAll);

async function counts(org: SeedIds): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const table of BUSINESS_TABLES) result[table] = await countAs(app, { org: org.org, user: org.owner }, table);
  return result;
}

const ALL_ONE = Object.fromEntries(BUSINESS_TABLES.map((t) => [t, 1]));

/** Appel de la purge sous vadrouille_account_admin ; renvoie le code d'erreur Postgres, ou undefined. */
async function purge(ctx: { org?: string; user?: string }, target: string): Promise<string | undefined> {
  try {
    await inTx(app, ctx, (c) => c.query("SELECT purge_organization_data($1)", [target]), "vadrouille_account_admin");
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code ?? "erreur";
  }
}

describe("purge: vadrouille_app ne peut pas purger une autre organisation", () => {
  it("sous vadrouille_app, appel direct refusé (aucun droit EXECUTE, ni direct ni hérité)", async () => {
    await inTx(app, { org: a.org, user: a.owner }, (c) => expectRefused(c, "SELECT purge_organization_data($1)", [a.org]));
    const { rows } = await app.query(
      "SELECT pg_catalog.has_function_privilege('vadrouille_app', 'public.purge_organization_data(uuid)', 'EXECUTE') AS can",
    );
    expect(rows[0].can).toBe(false);
  });

  it("sous vadrouille_account_admin avec le contexte de A, purger B lève une exception et ne supprime rien", async () => {
    expect(await purge({ org: a.org, user: a.owner }, b.org)).toBe("42501");
    expect(await counts(a)).toEqual(ALL_ONE);
    expect(await counts(b)).toEqual(ALL_ONE);
  });

  it("sans utilisateur dans le contexte, ou sans contexte, refus", async () => {
    expect(await purge({ org: a.org }, a.org)).toBe("42501");
    expect(await purge({}, a.org)).toBe("42501");
    expect(await counts(a)).toEqual(ALL_ONE);
  });

  it("organisation avec un second membre : refus pour son owner comme pour le membre, rien n'est supprimé", async () => {
    const shared = await createOrg(auth, 1);
    const member = shared.members[0];
    await inTx(app, { org: shared.org, user: shared.owner }, (c) =>
      c.query(
        "INSERT INTO trips (organization_id, created_by, request_id, destination, start_date, end_date, travellers_adults, time_zone) VALUES ($1, $2, gen_random_uuid(), 'Porto', '2027-06-01', '2027-06-03', 2, 'Europe/Lisbon')",
        [shared.org, shared.owner],
      ),
    );
    expect(await purge({ org: shared.org, user: shared.owner }, shared.org)).toBe("42501");
    expect(await purge({ org: shared.org, user: member }, shared.org)).toBe("42501");
    expect(await countAs(app, { org: shared.org, user: shared.owner }, "trips")).toBe(1);
  });

  it("avec le contexte de A et son owner : seules les lignes de A disparaissent, sauf billing et usage_ledger ; un second appel ne lève pas d'erreur", async () => {
    expect(await purge({ org: a.org, user: a.owner }, a.org)).toBeUndefined();
    const after = await counts(a);
    for (const table of PURGED_TABLES) expect(after[table], table).toBe(0);
    expect(after.billing).toBe(1);
    expect(after.usage_ledger).toBe(1);
    expect(await counts(b)).toEqual(ALL_ONE);
    const deletion = await inTx(app, { org: a.org, user: a.owner }, async (c) => (await c.query("SELECT deletion_requested_at FROM organizations")).rows);
    expect(deletion).toHaveLength(1);
    expect(deletion[0].deletion_requested_at).toBeInstanceOf(Date);
    expect(await purge({ org: a.org, user: a.owner }, a.org)).toBeUndefined();
  });
});
