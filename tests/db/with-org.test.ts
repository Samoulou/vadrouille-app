import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withOrg, WithOrgContextError } from "@/server/with-org";

import { createDatabase, type Database } from "../../db/index";
import { closeAll, connect, createOrg, type DbClient } from "./helpers";

/**
 * `withOrg` (spécification B3, B3b point 8 ; décision 0007), critère B11 : transaction du rôle `vadrouille_app`,
 * contexte posé par paramètres liés, identifiants validés avant toute requête.
 */

const app = createDatabase("vadrouille_app");
let auth: DbClient;

beforeAll(async () => {
  auth = await connect("auth");
});

afterAll(async () => {
  await app.$client.end();
  await closeAll();
});

describe("withOrg", () => {
  it("rls: withOrg pose le contexte de la transaction", async () => {
    const { org, owner } = await createOrg(auth);
    const dedans = await withOrg(
      { organizationId: org, userId: owner },
      async (tx) => {
        await tx.execute(
          sql`INSERT INTO trips (organization_id, created_by, request_id, destination, start_date, end_date, travellers_adults)
              VALUES (${org}, ${owner}, ${randomUUID()}, 'Édimbourg', '2027-05-01', '2027-05-06', 2)`,
        );
        const contexte = await tx.execute<{ org: string; utilisateur: string }>(sql`SELECT app_current_org() AS org, app_current_user() AS utilisateur`);
        const voyages = await tx.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM trips`);
        return { contexte: contexte.rows[0], voyages: voyages.rows[0]?.n };
      },
      app,
    );
    expect(dedans.contexte).toEqual({ org, utilisateur: owner });
    expect(dedans.voyages).toBe(1);

    // Après la transaction, sans withOrg : aucun contexte, aucune ligne métier (règle de B1).
    const apres = await app.execute<{ org: string | null; n: number }>(sql`SELECT app_current_org() AS org, (SELECT count(*)::int FROM trips) AS n`);
    expect(apres.rows[0]).toEqual({ org: null, n: 0 });
  });

  it("un identifiant qui n'est pas un uuid est refusé avant toute requête", async () => {
    const appels: string[] = [];
    const espion = {
      transaction: () => {
        appels.push("transaction");
        throw new Error("transaction ouverte");
      },
    } as unknown as Database;
    const valide = randomUUID();
    for (const ctx of [
      { organizationId: "pas-un-uuid", userId: valide },
      { organizationId: valide, userId: "x'); SELECT 1; --" },
      { organizationId: `${valide} `, userId: valide },
      { organizationId: "", userId: valide },
      { organizationId: 42 as unknown as string, userId: valide },
    ]) {
      await expect(withOrg(ctx, async () => "jamais", espion)).rejects.toBeInstanceOf(WithOrgContextError);
    }
    expect(appels).toEqual([]);
  });
});
